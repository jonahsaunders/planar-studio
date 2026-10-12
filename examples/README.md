# Planar Studio examples

- [5 W planar flyback converter](planar-flyback-5w/README.md): 18–36 V DC input,
  isolated 5 V / 1 A output, integral six-layer PCB windings, editable KiCad 10
  project, calculations, manufacturing schedules and validation evidence.
  **Untested A1 engineering prototype; supplier feasibility is unconfirmed.**

- [60 W GaN planar LLC converter](planar-gan-60w/README.md): 46–50 V DC input,
  isolated 12 V / 5 A target, eight-layer PCB windings, native KiCad 10 project,
  top-side electronics, removable screw-terminal power connectors and exposed-substrate M3 mounting
  holes. Includes an MIT PER board study, sourcing, calculations and CAD checks.
  **A14 unbuilt engineering prototype; factory acceptance and hardware qualification are open.**
  **Supplier review only:** the [five-board turnkey handoff](planar-gan-60w/TURNKEY-READINESS.html)
  documents repaired footprints, placement and pours, a matched JLC stack/model,
  direct feedback routing, a shorter rectifier gate path and a fresh BOM/stencil screen. Single-board data are supplied; JLCPCB defines handling. Factory acceptance, ferrite fitting and powered
  qualification remain open.

- [CoilTile USB inductive sensing array](coil-tile/README.md): four 24 mm printed
  coils, LDC1614 readout, USB HID/I2C bridge, connected KiCad 9 schematic,
  four-layer board and the same exposed-substrate M3 edge mounting footprints.
  Includes host heatmap/CSV software, fabrication data and A3 routing/readability review evidence.
  **Unbuilt prototype; sensing performance and factory acceptance are unverified.**

These are editable engineering examples, separate from the KiCad plugin installer.

[Download the complete A5 review package](PS-FLYBACK-5W-A5-review-package.zip?raw=true)
for the flyback example, including its illustrated local report and checksums.

[Download the complete GaN A14 KiCad package](PS-GAN-60W-A14-KiCad.zip?raw=true)
for the GaN example, including its interactive local review and checksums.
