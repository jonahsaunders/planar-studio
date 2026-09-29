"""Physical layer coordinates from complete versus incomplete IPC stackups."""
import unittest
from types import SimpleNamespace as NS
from planar_studio.kicad_link import _read_stackup


class TransformerStack(unittest.TestCase):
    def entry(self, name, thickness, kind="copper"):
        return NS(name=name, thickness=thickness, type=kind)

    def test_asymmetric_heights_include_all_dielectrics(self):
        stack = NS(layers=[self.entry("F.Cu", 35000), self.entry("prepreg", 100000, "dielectric"),
                           self.entry("In1.Cu", 18000), self.entry("core", 1000000, "dielectric"),
                           self.entry("B.Cu", 35000)])
        copper, _, thickness = _read_stackup(stack)
        self.assertAlmostEqual(thickness, 1.188)
        self.assertEqual([q["centerHeightMm"] for q in copper], [.0175, .144, 1.1705])

    def test_incomplete_stack_does_not_claim_physical_coordinates(self):
        stack = NS(layers=[self.entry("F.Cu", 35000), self.entry("unknown core", 0, "dielectric"), self.entry("B.Cu", 35000)])
        copper, _, _ = _read_stackup(stack)
        self.assertTrue(all("centerHeightMm" not in q for q in copper))
