import { couponConfiguration } from './measurement-records.js';

export const starterProjects = [
  {
    kind: 'inductor', name: 'Square impedance coupon',
    target: 'Explore a single-layer coil near 0.88 µH.',
    edit: 'Change turns or track clearance and compare inductance, resistance, and self-resonance.',
    expected: 'The six-turn starting design predicts about 0.88 µH and 104 MHz self-resonance.',
    setup: defaults => couponConfiguration('A', defaults),
  },
  {
    kind: 'transformer', name: 'Two-layer air-core transformer',
    target: 'Make a 2:1 turns-ratio winding with six primary turns and three secondary turns.',
    edit: 'Open Windings and change secondary turns. Compare the turns ratio, coupling, and loaded voltage.',
    expected: 'The starting design reports a 2:1 turns ratio and coupling around 0.63.',
    setup: defaults => ({ ...defaults, primaryTurns: 6, secondaryTurns: 3 }),
  },
  {
    kind: 'motor', name: 'Three-phase rotary stator',
    target: 'Explore a balanced 12-coil, 16-pole PCB motor.',
    edit: 'Open Design tools → Rotor and change the driver peak current or DC bus voltage. Compare the operating limit.',
    expected: 'The starting winding estimates about 40 mN·m at 1.5 A peak, before applying continuous operating limits.',
    setup: defaults => ({ ...defaults, coilCount: 12, phases: 3, polePairs: 8 }),
  },
  {
    kind: 'filter', name: 'Three-resonator hairpin filter',
    target: 'Explore a 2.30–2.50 GHz target passband.',
    edit: 'Move a feed tap or widen a resonator gap. Compare the response with the prototype.',
    expected: 'The starting geometry predicts a centre near 2.40 GHz and about 3.3 dB insertion loss.',
    setup: defaults => ({ ...defaults, family: 'hairpin', order: 3, band: 'bandpass',
      f1: 2.3e9, f2: 2.5e9, rfStackSource: 'manual' }),
  },
  {
    kind: 'antenna', name: '13.56 MHz NFC loop',
    target: 'Tune a compact loop to 13.56 MHz.',
    edit: 'Change the loop diameter or turn count and note how the external tuning capacitance changes.',
    expected: 'The starting loop estimates about 671 nH and calls for about 200 pF of external tuning capacitance.',
    setup: defaults => ({ ...defaults, family: 'nfc', freq: 13.56e6 }),
  },
];
