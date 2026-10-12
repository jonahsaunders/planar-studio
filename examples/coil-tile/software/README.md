# CoilTile host application

Python 3.10+ and a USB data cable are required. The MCP2221A has factory USB/HID
firmware; there is nothing to flash. This application has been exercised with
mocked register reads and synthetic data, **not with a physical CoilTile**.

## Install and run

From this directory:

```sh
python -m venv .venv
# macOS/Linux:
source .venv/bin/activate
# Windows PowerShell instead: .venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python coiltile.py
```

The program sets `BLINKA_MCP2221=1` itself. Connect only one MCP2221 board.
For OS-specific HID setup, follow the official
[Adafruit MCP2221 guide](https://learn.adafruit.com/circuitpython-libraries-on-any-computer-with-mcp2221/setup).
On Linux, install your distribution's `libhidapi-hidraw0` and `python3-tk`, and
grant your user access to the MCP2221 HID device using the guide's udev rule
(Microchip VID `04d8`, PID `00dd`). Do not run the application as root.
Tkinter is normally included with the python.org Windows/macOS installers.
Blinka 9.2.0 was checked against the official package/source; native USB access
and these OS installation steps still require a real device for validation.

```sh
python coiltile.py --csv measurements.csv
python coiltile.py --headless --samples 100 --csv measurements.csv
python coiltile.py --demo
python coiltile.py --demo --headless --samples 25
python -m unittest -v
```

`--csv` overwrites the named file. Ctrl-C stops headless acquisition. The GUI
continues until its window is closed. Disconnect errors are shown, not replaced
by demo data. `--demo` is always prominently labeled SIMULATION.

## Interpreting the display

Clear metal from both sides before starting. Twenty valid frames establish the
baseline. “Re-zero” repeats this process. Default host delay is 200 ms, plus USB
transactions; this is a low-rate desktop demonstration, not synchronized imaging.
Each channel's MSB/LSB is read in the documented coherent order. Channels scan
sequentially and are not simultaneous snapshots.

The view matches the front of the board with USB at the bottom:

| | Left | Right |
|---|---|---|
| Top | CH2 / L3 | CH1 / L2 |
| Bottom | CH3 / L4 | CH0 / L1 |

Color encodes absolute frequency change; the signed percentage remains visible.
`--scale 0.2` makes 0.2% full-scale. The display is neither calibrated distance
nor material identification. Frequency uses the **nominal** 43 MHz internal
oscillator, so relative changes are more useful than absolute Hz.

## Driver configuration and faults

LDC1614 address 0x2A; IDs 0x5449/0x3055 are checked. The app resets the part,
enters sleep, configures RCOUNT=0x1000, SETTLECOUNT=0x0400, divider=0x1001,
ERROR_CONFIG=0xF8FD, MUX_CONFIG=0xC20D, and finally CONFIG=0x0081. Reserved
bits follow TI's register tables. Sleep bit 13 is **1 for sleep**, despite the
opposite wording in the datasheet's auto-calibration example procedure.

Initial operation uses automatic drive amplitude correction. It is convenient
for bring-up but adds measurement noise. Read the reported `drive` codes with
targets removed, verify the oscillation on a scope, and optionally run fixed
codes, e.g. `--drive 17 17 17 17` **only if measured codes justify them**. Fixed
mode uses CONFIG=0x1481. Never infer suitable current merely from the example.

Data error nibble: 8=under-range, 4=over-range, 2=watchdog, 1=amplitude error;
combinations are possible. Raw STATUS error bits 13..8 are logged too. Faulty
frames and zero counts cannot enter the baseline or produce a heatmap value.
For persistent amplitude errors, see `../docs/BRINGUP.md`; do not hide errors
just to make the display move.
