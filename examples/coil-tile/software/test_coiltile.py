import unittest
from coiltile import LDC1614, Baseline, CHANNEL_MAP


class Bus:
    def __init__(self):
        self.regs = {0x7E: 0x5449, 0x7F: 0x3055, 0x18: 0xF}
        for ch in range(4):
            self.regs[2*ch] = 0x123
            self.regs[2*ch+1] = 0x4567 + ch
            self.regs[0x1E+ch] = 17 << 6
        self.writes, self.reads = [], []

    def writeto(self, addr, buf):
        assert addr == 0x2A
        self.writes.append((buf[0], int.from_bytes(buf[1:], "big")))

    def writeto_then_readfrom(self, addr, outgoing, incoming):
        assert addr == 0x2A
        reg = outgoing[0]
        self.reads.append(reg)
        incoming[:] = self.regs[reg].to_bytes(2, "big")


class Tests(unittest.TestCase):
    def test_ids_reject_wrong_device(self):
        b = Bus(); b.regs[0x7F] = 0x3054
        with self.assertRaises(RuntimeError):
            LDC1614(b).configure()
        self.assertEqual(b.writes, [])

    def test_configuration_sleep_then_active(self):
        b = Bus(); LDC1614(b).configure()
        self.assertEqual(b.writes[:2], [(0x1C, 0x8000), (0x1A, 0x2081)])
        self.assertEqual(b.writes[-1], (0x1A, 0x0081))
        self.assertIn((0x1B, 0xC20D), b.writes)

    def test_fixed_drive(self):
        b = Bus(); LDC1614(b).configure([1, 2, 3, 4])
        self.assertEqual(b.writes[-1], (0x1A, 0x1481))
        self.assertIn((0x21, 4 << 11), b.writes)

    def test_coherent_reads_and_errors(self):
        b = Bus(); b.regs[0] |= 0x8000
        s = LDC1614(b).sample()
        self.assertEqual(s['counts'][0], 0x1234567)
        self.assertEqual(s['errors'], [8, 0, 0, 0])
        self.assertEqual(b.reads[:4], [0x18, 0, 1, 0x1E])
        self.assertEqual(s['drive'], [17]*4)

    def test_timeout(self):
        b = Bus(); b.regs[0x18] = 0
        with self.assertRaises(TimeoutError):
            LDC1614(b).sample(timeout=0)

    def test_baseline_rejects_faults_and_zero(self):
        base = Baseline(samples=2)
        s = dict(hz=[100]*4, counts=[1]*4, errors=[1,0,0,0], status_errors=0)
        self.assertIsNone(base.update(s)); self.assertEqual(base.rows, [])
        s['errors'] = [0]*4; s['counts'] = [0]*4
        self.assertIsNone(base.update(s)); self.assertEqual(base.rows, [])
        s['counts'] = [1]*4
        self.assertIsNone(base.update(s)); self.assertEqual(base.update(s), [0]*4)
        s['hz'] = [101]*4
        self.assertAlmostEqual(base.update(s)[0], 1)
        base.reset(); self.assertIsNone(base.value)

    def test_physical_orientation(self):
        self.assertEqual(CHANNEL_MAP, ((2,1),(3,0)))


if __name__ == '__main__':
    unittest.main()
