# First-board bring-up and characterization

## Before applying power

Inspect orientation of U1–U4, solder bridges on U3 and J1, and the connector's
shell joints. Compare the assembler preview against the supplied top assembly
view and pin-1 marks. Confirm +3V3 to GND is not shorted. Expect low DC resistance
across each coil—about 2.24 Ω is the winding model estimate, so an ordinary
continuity beep across a coil is normal. Lead/contact resistance affects this
measurement. Do not mistake a coil net-tie for a bypass component.

Mount with nylon screws/spacers, away from metal on both sides. Support the PCB
when inserting a cable. The converter and its input nodes remain exposed;
handle normally as an unencased development board.

## Power and USB

For first power, use a protected USB port or current-monitored USB bench adapter.
This is a 5 V sink: it has independent 5.1 kΩ CC resistors, no USB-PD negotiation
and no higher-voltage input. Check TP1=3.3 V relative to TP2=GND. If the rail is
wrong or current is unexpectedly high, disconnect and inspect before continuing.
Typical part currents imply well below the USB 100 mA default budget; this is
an engineering estimate, not a measured board current or USB compliance test.

MCP2221A should enumerate with factory Microchip VID/PID 04D8:00DD. Try a known
USB data cable if it does not. U2 pin 1 (VDD) and pin 11 (VUSB) are both tied to
the external 3.3 V supply as required for 3.3 V operation. No bootloader or
firmware upload is involved. Use TP3=SDA and TP4=SCL for I2C troubleshooting.

## First sensor readings

1. Follow `software/README.md`; connect only this MCP2221 device.
2. Remove nearby metal, including under the board. Run
   `python coiltile.py --headless --samples 100 --csv first-board.csv`.
3. Confirm chip IDs match and all four channels produce nonzero counts with no
   data/status error flags. Nominal frequencies should be around the calculated
   4.57 MHz, not necessarily equal or exact. A large deviation needs inspection.
4. Run the GUI. Let its 20 valid frames establish a baseline, then move a coin
   above each numbered coil. Verify the strongest response generally follows
   the intended channel. Adjacent responses are expected and must be measured.
5. Repeat baseline acquisition after changing supports, cable position or room
   temperature. Avoid interpreting baseline drift as a target.

## Amplitude and drive-current checks

Use a low-capacitance probe and a short ground spring, following TI's sensor
amplitude procedure. Probe capacitance changes resonance. Measure INAx to GND
with the target at its farthest intended position, then nearest; do not connect
scope ground to INBx because neither coil terminal is ground.

TI recommends roughly 1.2–1.8 V peak sensor amplitude. Automatic drive is enabled
for initial prototyping. Record INIT_IDRIVE for each channel (the app logs it),
verify the waveform and then optionally use fixed codes via `--drive`. Fixed
drive is preferred for repeatable measurements. Check both target extremes;
clipping, weak oscillation, watchdog errors or changing automatic drive can
invalidate frequency changes. Adjust current first, then SETTLECOUNT if required.
If measured resonance approaches/exceeds 8.75 MHz, revisit FIN divider and the
frequency conversion equation before proceeding.

## Characterization record

Log empty-board noise/drift for 10 minutes, then test at measured 0, 2, 5, 10 and
15 mm gaps as experimental points—not promised range. Use plastic spacers and
record target material, diameter/thickness, orientation, board serial and
temperature. Repeat with a coin, steel washer and aluminum disk, one at a time.
Keep signed changes: target conductivity/permeability and geometry can change
the response. Never label frequency shift alone as reliable material identity.

Measure each coil's response when the target is over each other coil; calculate
the 4×4 response/crosstalk matrix. Measure settling, frame timing and USB errors.
Check both USB-C plug orientations. Flex the cable gently and repeat baselines.
Check performance with intended enclosure, supports and nearby electronics.

If target response is insufficient, potential next-revision changes are larger coils,
reduced lead parasitics, altered coil pitch/spacing, fixed drive, longer conversion
time, or an external reference clock. A metal ground plane behind a coil is not
a free shielding improvement; it loads the sensor and can sharply reduce range.
