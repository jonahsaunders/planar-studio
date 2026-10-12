"""A2 continuous signal-flow drawing. Executed by generate-schematic.py."""

def reflow(name, center, bounds, mapping):
    """Move pins only; preserve pin numbers, names, types and hidden stacking."""
    s=defs[name]; before={n:(str(get(p,'name')[1]),p[1]) for n,p in pins[name].items()}
    assert set(mapping)==set(pins[name]),(name,set(mapping)^set(pins[name]))
    cx,cy=center; x1,y1,x2,y2=bounds
    s[:]=[e for e in s if not(isinstance(e,list) and e[0]=='symbol')]
    s.append(parse(f'(symbol "{name}_0_1" (rectangle (start {x1-cx} {cy-y1})(end {x2-cx} {cy-y2})(stroke(width .254)(type default))(fill(type background))))'))
    unit=['symbol',Q(name+'_1_1')]
    for n,p in pins[name].items():
        x,y,angle=mapping[n]
        get(p,'at')[1:]=[round(x-cx,6),round(cy-y,6),angle]
        get(p,'length')[1]=5.08
        unit.append(p)
    s.append(unit)
    if name=='USBLC6-2SC6':
        for yy in [3.81,-3.81]:
            s[-2].append(parse(f'(polyline (pts(xy -7.62 {yy})(xy 7.62 {yy}))(stroke(width .254)(type default))(fill(type none)))'))
    after={n:(str(get(p,'name')[1]),p[1]) for n,p in pins[name].items()}
    assert before==after

# USB duplicated contacts remain explicit, while stacked power pins stay stacked.
jm={n:(44.45,119.38,180) for n in ['A4','A9','B4','B9']}
jm.update({n:(30.48,203.2,90) for n in ['A1','A12','B1','B12']})
jm.update({'S1':(22.86,203.2,90),'A6':(44.45,134.62,180),'B6':(44.45,137.16,180),
           'A7':(44.45,142.24,180),'B7':(44.45,144.78,180),'A5':(44.45,165.1,180),
           'B5':(44.45,172.72,180),'A8':(44.45,185.42,180),'B8':(44.45,193.04,180)})
reflow('USB_C_Receptacle_USB2.0_16P',(27.94,152.4),(15.24,111.76,39.37,198.12),jm)
reflow('USBLC6-2SC6',(88.9,138.43),(81.28,124.46,96.52,152.4),
       {'1':(76.2,134.62,0),'3':(76.2,142.24,0),'6':(101.6,134.62,180),
        '4':(101.6,142.24,180),'5':(88.9,119.38,270),'2':(88.9,157.48,90)})
um={'13':(132.08,134.62,0),'12':(132.08,142.24,0),'4':(132.08,162.56,0),
    '1':(154.94,109.22,270),'11':(165.1,109.22,270),'14':(154.94,213.36,90),
    '9':(177.8,134.62,180),'10':(177.8,142.24,180),'5':(177.8,162.56,180)}
um.update({str(n):(132.08,y,0) for n,y in zip([6,2,3,7,8],[177.8,182.88,187.96,193.04,198.12])})
reflow('MCP2221AxST',(154.94,157.48),(137.16,114.3,172.72,208.28),um)
sm={'2':(233.68,134.62,0),'1':(233.68,142.24,0),'5':(233.68,157.48,0),
    '3':(233.68,175.26,0),'4':(233.68,182.88,0),'6':(233.68,190.5,0),
    '7':(256.54,96.52,270),'8':(256.54,213.36,90),'17':(256.54,213.36,90)}
for ch in range(4):
    y=111.76+27.94*ch
    sm[str(9+2*ch)]=(281.94,round(y,2),180)
    sm[str(10+2*ch)]=(281.94,round(y+10.16,2),180)
reflow('LDC1614',(256.54,152.4),(238.76,101.6,276.86,208.28),sm)

PROPERTY_POS.update({'J1':(27.94,97.79),'U4':(72.39,111.76),
                     'R3':(107.95,156.21),'U2':(146.05,99.06),'U3':(278.13,87.63),'U1':(123.19,39.37)})
text('COIL TILE  /  USB INDUCTIVE SENSOR ARRAY',15,17,3,True)
text('A2 prototype  |  One continuous signal path  |  2 x 2 printed coils  |  No firmware programming',15,24,1.4)
box((10,31),(400,233),'USB-C  >  HID / I2C BRIDGE  >  FOUR-CHANNEL SENSOR  >  LC TANKS')

add('J1',27.94,152.4);add('U4',88.9,138.43);add('U2',154.94,157.48);add('U3',256.54,152.4)

# Power follows the full signal chain, with local capacitors attached to the rail.
style('power')
add('U1',123.19,55.88);add('C1',101.6,69.85);add('C2',144.78,69.85)
vin=at('U1',1);vout=at('U1',5);rail=vin[1]
wire(at('J1','A4'),(60.96,119.38),(60.96,rail),(88.9,rail),(101.6,rail),vin)
wire(at('U4',5),(88.9,rail));junction(88.9,rail)
wire(at('C1',1),(101.6,rail));junction(101.6,rail)
wire(at('U1',3),(113.03,55.88),(113.03,rail));junction(113.03,rail)
flag(101.6,rail);power('VBUS',76.2,rail);junction(76.2,rail)
wire(vout,(144.78,rail),(154.94,rail),(165.1,rail),(190.5,rail),(208.28,rail),(228.6,rail),(256.54,rail),(287.02,rail),(312.42,rail))
wire(at('C2',1),(144.78,rail));junction(144.78,rail);power('+3V3',190.5,rail)
wire(at('U2',1),(154.94,rail));wire(at('U2',11),(165.1,rail));junction(154.94,rail);junction(165.1,rail)
wire(at('U3',7),(256.54,rail));junction(256.54,rail)
for ref,x in [('C3',177.8),('C4',233.68),('C5',287.02),('C6',312.42)]:
    add(ref,x,69.85);wire(at(ref,1),(x,rail));junction(x,rail)
for ref in ['C1','C2','C3','C4','C5','C6']:stub(ref,2,length=5.08)
stub('U1',2,length=7.62)
text('5 V sink / independent CC pull-downs',17,88.9,1.15)
text('VDD and VUSB both use external 3.3 V',147,89,1.15)

# The USB data pair passes through the ESD device, without disconnected labels.
style('usb')
for a,b,tie,net in [('A6','B6',50.8,'USB_P'),('A7','B7',55.88,'USB_N')]:
    y=at('J1',a)[1]; pin=1 if a=='A6' else 3; end=6 if pin==1 else 4; bridge=13 if pin==1 else 12
    wire(at('J1',a),(tie,y),at('U4',pin));wire(at('J1',b),(tie,at('J1',b)[1]),(tie,y));junction(tie,y)
    wire(at('U4',pin),at('U4',end),at('U2',bridge));label(net,111.76,y)
style('signal')
add('R1',55.88,177.8);add('R2',73.66,180.34)
wire(at('J1','A5'),(55.88,165.1),at('R1',1));label('CC1',48.26,165.1);wire(at('J1','B5'),(73.66,172.72),at('R2',1));label('CC2',48.26,172.72)
wire(at('R1',2),(55.88,193.04),(73.66,193.04),at('R2',2));power('GND',73.66,193.04)
wire(at('J1','S1'),(22.86,210.82),(30.48,210.82),at('J1','A1'));power('GND',30.48,210.82);flag(22.86,210.82)
stub('U4',2,length=7.62);stub('U2',14,length=7.62);stub('U3',8,length=7.62)
add('R3',116.84,160.02);stub('R3',1,length=2.54);wire(at('R3',2),(116.84,162.56),at('U2',4));label('RESET_N',118.11,162.56)
stub('U2',5,length=10.16)

# I2C pull-ups attach to the shared rail and the actual inter-chip wires.
style('i2c')
wire(at('U2',9),(195.58,134.62),at('U3',2));label('SDA',216,134.62)
wire(at('U2',10),(208.28,142.24),at('U3',1));label('SCL',216,142.24)
for ref,x,y in [('R4',208.28,134.62),('R5',223.52,142.24)]:
    add(ref,x,119.38);wire(at(ref,1),(x,rail));junction(x,rail);wire(at(ref,2),(x,y));junction(x,y)
add('TP3',195.58,130.81);wire(at('TP3',1),(195.58,134.62));junction(195.58,134.62)
add('TP4',218.44,153.67);wire(at('TP4',1),(218.44,142.24));junction(218.44,142.24)
style('signal')
for pin in [3,4,6]:wire(at('U3',pin),(223.52,at('U3',pin)[1]))
wire((223.52,175.26),(223.52,182.88),(223.52,190.5),(223.52,198.12));junction(223.52,182.88);junction(223.52,190.5);power('GND',223.52,198.12)
text('0x2A / internal clock',239,230,1.15)
text('UART / GPIO unused',132,225,1.15)

# Four tank circuits are visibly connected to all eight converter input pins.
style('sensor')
for ch in range(4):
    top=round(111.76+27.94*ch,2);bot=round(top+10.16,2);y=round((top+bot)/2,2)
    c='C'+str(ch+7);l='L'+str(ch+1);add(c,307.34,y);add(l,358.14,y)
    wire(at('U3',9+2*ch),(307.34,top),(358.14,top),at(l,1));wire(at(c,1),(307.34,top));junction(307.34,top)
    wire(at('U3',10+2*ch),(307.34,bot),(358.14,bot),at(l,2));wire(at(c,2),(307.34,bot));junction(307.34,bot)
    label(f'CH{ch}_A',285.75,top);label(f'CH{ch}_B',285.75,bot)
    text(['CH0 / lower right','CH1 / upper right','CH2 / upper left','CH3 / lower left'][ch],313.69,top-5.08,1.15,True)
text('24 mm / 16 turns / 0.20 mm trace + gap',290,223,1.15)
text('5.51 uH + 220 pF: ~4.57 MHz nominal',290,229,1.15)

# Service pads stay beside their nets rather than in a detached test-point bank.
style('power')
add('TP1',228.6,45.72);wire(at('TP1',1),(228.6,rail))
add('TP2',40.64,210.82);wire(at('TP2',1),(30.48,210.82));junction(30.48,210.82)
style('signal')
for i,x in enumerate([25.4,63.5,101.6,139.7],1):add('H'+str(i),x,252.73)
text('M3 exposed-substrate edge holes / American Embedded footprint',15,266,1.2)
text('Same geometry as the flyback and GaN examples. Use nylon hardware.',15,272,1.15)
text('UNBUILT A2 PROTOTYPE',190,247,1.5,True)
text('Characterize amplitude, noise and coil coupling before reordering.',190,253,1.15)

# Canonicalize collinear segments at every endpoint/junction. This avoids
# overlapping wire objects and makes power-rail T connections explicit.
parsed=[parse(e) for e in elements]
segments=[];cuts=set()
for e in parsed:
 if e[0]=='wire':
  ps=[tuple(round(float(v),6) for v in p[1:]) for p in get(e,'pts')[1:]]
  segments.append((ps,get(e,'stroke')));cuts.update(ps)
 elif e[0]=='junction':cuts.add(tuple(map(float,get(e,'at')[1:3])))
 elif e[0]=='symbol' and str(get(e,'lib_id')[1]).split(':')[-1] in ['VBUS','+3V3','GND','PWR_FLAG']:
  cuts.add(tuple(map(float,get(e,'at')[1:3])))
elements[:]=[dump(e) for e in parsed if e[0]!='wire']
seen=set()
for (a,b),stroke in segments:
 pts=[p for p in cuts if min(a[0],b[0])-1e-6<=p[0]<=max(a[0],b[0])+1e-6 and min(a[1],b[1])-1e-6<=p[1]<=max(a[1],b[1])+1e-6]
 pts.sort()
 for p,end in zip(pts,pts[1:]):
  if (p,end) in seen:continue
  seen.add((p,end))
  elements.append(f'(wire (pts (xy {p[0]} {p[1]})(xy {end[0]} {end[1]})) {dump(stroke)} (uuid {uid("segment"+str((p,end)))}))')
