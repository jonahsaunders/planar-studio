#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Generate the nominal HRO model with KiCad's existing USB model generator.

Set KICAD_LIBRARY_TOOLS_ROOT to upstream commit a903a695bf4e69905e9e56548f44dd46cdc1130e.
Requires CadQuery and PyYAML. The checked-in STEP needs no Python dependencies.
"""
from pathlib import Path
import os, sys, copy
import cadquery as cq
import yaml
ROOT=Path(__file__).resolve().parents[1]
UPSTREAM=Path(os.environ['KICAD_LIBRARY_TOOLS_ROOT'])
sys.path[:0]=[str(UPSTREAM/'src'),str(UPSTREAM)]
from generators.connector.USB.usb_connector import generate_connector
from generators.tools.model import add_license
spec=yaml.safe_load((ROOT/'kicad/3dmodels/sources/usb-hro.yaml').read_text())
parts=generate_connector(copy.deepcopy(spec))
colors=[(.70,.72,.75),(.09,.09,.10),(.09,.09,.10),(.78,.65,.30)]
model=cq.Assembly(name='HRO_TYPE_C_31_M_12_nominal')
for name,part,color in zip(['shell','tongue','pegs','terminals'],parts,colors):
    assert part.val().isValid(),name
    model.add(part,name=name,color=cq.Color(*color))
folder=ROOT/'kicad/3dmodels/Connector_USB.3dshapes';folder.mkdir(exist_ok=True)
name='USB_C_Receptacle_HRO_TYPE-C-31-M-12.step'
model.save(str(folder/name),exportType='STEP')
add_license.addLicenseToStep(str(folder),name,add_license.LIST_int_license,
    'CoilTile contributors; KiCad USB generator by Seth Hillbrand and contributors',
    '', 'KiCad / CoilTile', 'CadQuery')
print(folder/name)
