#!/usr/bin/env python3
"""CoilTile A3. USB/HID via Adafruit Blinka; no device firmware required."""
import argparse
import csv
import json
import math
import os
import queue
import statistics
import sys
import threading
import time

CHANNEL_MAP = ((2, 1), (3, 0))  # Viewed from component side, USB at bottom.
FREF = 43_000_000  # Nominal internal oscillator, NOT a calibrated frequency reference.


class LDC1614:
    def __init__(self, bus, address=0x2A):
        self.bus, self.address = bus, address
        self.config = 0x0081
        self.closed = False

    def read(self, reg):
        data = bytearray(2)
        self.bus.writeto_then_readfrom(self.address, bytes([reg]), data)
        return int.from_bytes(data, "big")

    def write(self, reg, value):
        self.bus.writeto(self.address, bytes([reg]) + value.to_bytes(2, "big"))

    def configure(self, drive=None):
        ids = self.read(0x7E), self.read(0x7F)
        if ids != (0x5449, 0x3055):
            raise RuntimeError(f"Expected LDC1614 at 0x2A; got IDs {ids!r}")
        self.write(0x1C, 0x8000)
        time.sleep(0.01)
        self.write(0x1A, self.config | 0x2000)  # Sleep=1 per register table 27.
        for ch in range(4):
            self.write(0x08 + ch, 0x1000)  # RCOUNT: ~1.52 ms at nominal 43 MHz.
            self.write(0x10 + ch, 0x0400)  # SETTLECOUNT: ~0.381 ms.
            self.write(0x14 + ch, 0x1001)  # FIN divider 1, reference divider 1.
        if drive is not None:
            if len(drive) != 4 or any(not 0 <= x <= 31 for x in drive):
                raise ValueError("Four drive codes in 0..31 are required")
            for ch, code in enumerate(drive):
                self.write(0x1E + ch, code << 11)
            self.config |= 0x1400  # Fixed current + disable automatic correction.
        # Report all conversion errors in data and status; physical INTB disabled.
        self.write(0x19, 0xF8FD)
        self.write(0x1B, 0xC20D)  # CH0..3 sequential, 10 MHz deglitch filter.
        self.write(0x1A, self.config)
        time.sleep(0.05)

    def sample(self, timeout=2.0):
        deadline = time.monotonic() + timeout
        status_errors = 0
        while True:
            status = self.read(0x18)
            status_errors |= status & 0x3F00
            if status & 0xF == 0xF:
                break
            if time.monotonic() >= deadline:
                raise TimeoutError(f"No complete four-channel conversion; STATUS=0x{status:04X}")
            time.sleep(0.005)
        counts, errors, drive = [], [], []
        for ch in range(4):
            # MSB then LSB: the hardware latches each channel's complete result.
            msb = self.read(2 * ch)
            lsb = self.read(2 * ch + 1)
            count = ((msb & 0x0FFF) << 16) | lsb
            counts.append(count)
            errors.append(msb >> 12)
            drive.append((self.read(0x1E + ch) >> 6) & 31)
        return {"time": time.time(), "mode": "hardware", "counts": counts,
                "hz": [v * FREF / (1 << 28) for v in counts], "errors": errors,
                "status_errors": status_errors, "drive": drive}

    def close(self):
        if self.closed:
            return
        self.closed = True
        try:
            self.write(0x1A, self.config | 0x2000)
        finally:
            self.bus.unlock()
            self.bus.deinit()


class Demo:
    """Explicit synthetic display exercise; never selected on a USB failure."""
    def sample(self):
        t = time.monotonic()
        hz = [4_570_000 * (1 + .006 * (1 + math.sin(t + ch * 1.6))) for ch in range(4)]
        return {"time": time.time(), "mode": "SIMULATION", "counts": [int(v / FREF * (1 << 28)) for v in hz],
                "hz": hz, "errors": [0] * 4, "status_errors": 0, "drive": [0] * 4}

    def close(self):
        pass


class Baseline:
    def __init__(self, samples=20):
        self.n = samples
        self.reset()

    def reset(self):
        self.rows, self.value = [], None

    def update(self, sample):
        if any(sample["errors"]) or sample["status_errors"] or min(sample["counts"]) <= 0:
            return None
        if self.value is None:
            self.rows.append(sample["hz"])
            if len(self.rows) < self.n:
                return None
            self.value = [statistics.mean(row[ch] for row in self.rows) for ch in range(4)]
        return [100 * (x / base - 1) for x, base in zip(sample["hz"], self.value)]


def connect(drive):
    os.environ["BLINKA_MCP2221"] = "1"
    import board
    import busio
    bus = busio.I2C(board.SCL, board.SDA, frequency=100_000)
    deadline = time.monotonic() + 2
    while not bus.try_lock():
        if time.monotonic() > deadline:
            raise TimeoutError("Cannot lock I2C bus")
        time.sleep(.01)
    sensor = LDC1614(bus)
    try:
        sensor.configure(drive)
    except Exception:
        bus.unlock()
        bus.deinit()
        raise
    return sensor


class Log:
    def __init__(self, path):
        self.file = open(path, "w", newline="") if path else None
        if self.file:
            self.writer = csv.writer(self.file)
            self.writer.writerow(["unix_time", "mode", "channel", "count", "nominal_hz",
                                  "delta_percent", "data_error_nibble", "status_errors", "init_drive_code"])

    def record(self, s, delta):
        if self.file:
            for ch in range(4):
                self.writer.writerow([s["time"], s["mode"], ch, s["counts"][ch], s["hz"][ch],
                                      "" if delta is None else delta[ch], s["errors"][ch],
                                      s["status_errors"], s["drive"][ch]])
            self.file.flush()

    def close(self):
        if self.file:
            self.file.close()


def gui(sensor, args, log):
    import tkinter as tk
    window = tk.Tk()
    window.title("CoilTile A3 — " + ("SIMULATION" if args.demo else "USB metal sensing"))
    window.configure(bg="#101b2a")
    tk.Label(window, text="COIL TILE  /  2 × 2", bg="#101b2a", fg="white",
             font=("Helvetica", 22, "bold")).pack(padx=28, pady=(24, 8))
    tk.Label(window, text="Component-side view • USB connector at bottom",
             bg="#101b2a", fg="#bdcce0").pack()
    panel = tk.Frame(window, bg="#101b2a")
    panel.pack(padx=22, pady=18)
    cells = {}
    for row, mapping in enumerate(CHANNEL_MAP):
        for col, ch in enumerate(mapping):
            label = tk.Label(panel, width=22, height=7, bg="#24384d", fg="white", font=("Helvetica", 15))
            label.grid(row=row, column=col, padx=5, pady=5)
            cells[ch] = label
    status = tk.StringVar(value="Clear all metal from the board. Acquiring baseline…")
    tk.Label(window, textvariable=status, wraplength=570, bg="#101b2a", fg="#bdcce0").pack(padx=24)
    base = Baseline()
    tk.Button(window, text="Re-zero with target removed", command=base.reset).pack(pady=16)
    tk.Label(window, text=("SIMULATED DATA — no sensor connected" if args.demo else
                          "Color = magnitude of frequency change. No distance or material classification."),
             bg="#101b2a", fg="#ffce79", wraplength=570).pack(padx=24, pady=(0, 22))
    messages, stop = queue.Queue(maxsize=2), threading.Event()

    def worker():
        try:
            while not stop.is_set():
                result = sensor.sample()
                try:
                    messages.put(result, timeout=.2)
                except queue.Full:
                    pass
                stop.wait(args.interval)
        except Exception as exc:
            # Retain the failure even when a previous sample fills the queue.
            while not messages.empty():
                messages.get_nowait()
            messages.put(exc)
        finally:
            sensor.close()

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()

    def tick():
        try:
            item = messages.get_nowait()
        except queue.Empty:
            window.after(50, tick)
            return
        if isinstance(item, Exception):
            status.set("Connection stopped: " + str(item))
            for ch, cell in cells.items():
                cell.configure(text=f"CH {ch:02d}\nNO DATA", bg="#593237")
            return
        delta = base.update(item)
        log.record(item, delta)
        bad = any(item["errors"]) or item["status_errors"] or min(item["counts"]) <= 0
        status.set((f"Sensor error: data={item['errors']}, status=0x{item['status_errors']:04X}. See bring-up guide." if bad else
                    f"Baseline {len(base.rows)}/{base.n} — keep targets away" if delta is None else
                    f"Live • drive codes {item['drive']} • color scale ±{args.scale:g}%"))
        for ch, cell in cells.items():
            level = 0 if delta is None else min(abs(delta[ch]) / args.scale, 1)
            color = "#593237" if bad else "#%02x%02x%02x" % (int(36+180*level), int(56+80*level), int(77-30*level))
            val = "ERROR" if bad else "Calibrating…" if delta is None else f"{delta[ch]:+.4f}%"
            cell.configure(bg=color, text=f"CH {ch:02d}\n{val}\n{item['hz'][ch]/1e6:.5f} MHz (nom.)")
        window.after(50, tick)

    def close():
        stop.set()
        window.destroy()

    window.protocol("WM_DELETE_WINDOW", close)
    window.after(50, tick)
    window.mainloop()
    stop.set()
    thread.join(timeout=3)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--demo", action="store_true", help="Explicit synthetic data; no USB access")
    p.add_argument("--headless", action="store_true")
    p.add_argument("--samples", type=int, default=0, help="Headless frame limit; 0 means until Ctrl-C")
    p.add_argument("--csv", help="Write per-channel samples (overwrites specified file)")
    p.add_argument("--interval", type=float, default=.2, help="Minimum delay between frames in seconds")
    p.add_argument("--scale", type=float, default=1, help="Heatmap full-scale frequency change in percent")
    p.add_argument("--drive", type=int, nargs=4, metavar=("CH0", "CH1", "CH2", "CH3"),
                   help="Fixed IDRIVE codes, 0..31; omit for automatic prototype bring-up")
    args = p.parse_args()
    if args.interval < .05 or args.scale <= 0 or args.samples < 0:
        p.error("interval must be >=0.05, scale >0 and samples >=0")
    if args.drive and any(not 0 <= x <= 31 for x in args.drive):
        p.error("drive codes must be 0..31")
    sensor, log = None, None
    try:
        sensor = Demo() if args.demo else connect(args.drive)
        log = Log(args.csv)
        if args.headless:
            base, n = Baseline(), 0
            while args.samples == 0 or n < args.samples:
                s = sensor.sample()
                delta = base.update(s)
                log.record(s, delta)
                print(json.dumps(dict(s, delta_percent=delta)), flush=True)
                n += 1
                time.sleep(args.interval)
        else:
            gui(sensor, args, log)
            sensor = None  # Worker owns close.
    except KeyboardInterrupt:
        pass
    except Exception as exc:
        print(f"CoilTile: {exc}\nSee software/README.md. Simulation is only enabled with --demo.", file=sys.stderr)
        return 1
    finally:
        if sensor:
            sensor.close()
        if log:
            log.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
