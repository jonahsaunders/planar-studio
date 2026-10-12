# Design provenance

Access/review date: 2026-10-12. Generated native CAD with KiCad 9.0.9.

| Reference | Used for |
|---|---|
| [KiStack](https://github.com/American-Embedded/kistack), commit `8494dbde095669df081950cbb6b24d08a21e25b0` | Schematic/layout/BOM/export review workflow; position CSV conversion |
| [Planar Studio](https://github.com/jonahsaunders/planar-studio), commit `02841f02ad9e245ef357919a85410575e26f4cd5` | Actual coil geometry and inductance/loss estimates, not a manually drawn imitation |
| Planar Studio `examples/planar-flyback-5w` | Reviewed native schematic/board generators, winding net-tie method, schematic overview, KiStack and layout audits |
| [TI LDC1614 datasheet SNOSCY9A](https://www.ti.com/lit/ds/symlink/ldc1614.pdf) | Pinout, exposed pad, LC connection, internal clock, registers, auto amplitude and drive-current bring-up |
| [Microchip MCP2221A DS20005565E](https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP2221A-Data-Sheet-20005565E.pdf) | 3.3 V VDD/VUSB connection, pinout, decoupling, USB HID/I2C bridge |
| [ST USBLC6-2](https://www.st.com/resource/en/datasheet/usblc6-2.pdf) | USB ESD rail and line pin mapping |
| [Diodes AP2112](https://www.diodes.com/assets/Datasheets/AP2112.pdf) | Selected regulator identity; stock KiCad symbol pinout reused (direct PDF fetch was blocked) |
| [HRO TYPE-C-31-M-12, C165948](https://www.lcsc.com/product-detail/C165948.html) | Exact connector selection; stock KiCad HRO footprint reused |
| [Adafruit desktop MCP2221 guide](https://learn.adafruit.com/circuitpython-libraries-on-any-computer-with-mcp2221?view=all) | Host HID access and OS setup |
| [Adafruit Blinka source](https://github.com/adafruit/Adafruit_Blinka) | Proven USB bridge transport rather than a new custom HID implementation |
| [JLCPCB assembly cost guide](https://jlcpcb.com/help/article/pcb-assembly-price) | Planning cost categories only; no signed-in cart or binding quote |
| [pcbparts](https://pcbparts.dev/) MCP `jlc_search` / `jlc_stock_check` | Exact LCSC identifiers and indicative stock/price snapshots |

## Specific engineering choices

- The sensing board is original. The converter examples supply workflow and
  artwork patterns; their switch-mode power circuitry is not transplanted here.
- Stock KiCad 9 symbols were flattened correctly from library inheritance into
  a local library. LDC1614 INTB electrical type was corrected to push-pull per TI.
  A2/A3 reflow the bridge, sensor, ESD and USB symbols with pin identities preserved.
  The mounting footprints now exactly reuse the other examples, with their
  American Embedded CC BY 4.0 notice included alongside them.
- Footprints are copied into the project. Only USB off-board silk was trimmed;
  its electrical pads, holes and mechanical outline were retained.
- Each uninterrupted coil is a native footprint copper polygon between two
  terminals declared as a net-tie. This deliberate DC connection represents
  an inductor, not an ERC/DRC exclusion. Four matching net-ties are expected.
- Winding width/spacing and lack of self-intersection rely on the Planar engine
  geometry; net-tie DRC does not independently validate inductance or Q.
- Model estimates: approximately 5.506 µH, 2.237 Ω DC, 2.295 Ω AC and Q≈60 at
  4 MHz. These are analytical estimates before this board's leads/parasitics.
  The four coils have not undergone a coupled electromagnetic simulation.
- Four-layer copper was chosen after routing review. USB uses short full-speed
  routes; analog channels are compact around U3, with no large metal planes
  under sensing disks. The layer stack is not an impedance-controlled contract.
- Automatic amplitude mode is intentionally a bring-up mode; fixed measured
  drive settings and repeatability measurements belong to the first-board work.

## License notes

Original CoilTile scripts, host software and original design content are supplied
under MIT (`LICENSE`). Planar Studio and KiStack carry their upstream MIT notices
in `licenses/`. KiCad symbols, footprints and available 3D models retain their
upstream CC-BY-SA license with the KiCad library exception; included distribution
notices are in `licenses/`. Third-party data/datasheets are linked, not relicensed.
Eight local STEP models cover all 20 fitted parts. The bridge uses the KiCad
9.0.9 package model; the sensor and nominal USB connector models use the official
KiCad Library Tools generators. Sources, licenses, assumptions and regeneration
instructions are in [3D-MODELS.md](3D-MODELS.md). Coils, test pads and mounting holes
are represented by native PCB geometry.
