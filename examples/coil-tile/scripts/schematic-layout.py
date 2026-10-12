"""A3 compact continuous signal-flow drawing. Executed by generate-schematic.py."""

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

# Pin groups follow signal flow; unused bridge pins sit on the bottom edge.
Y=114.3; CLK=121.92; RAIL=66.04
jm={n:(44.45,99.06,180) for n in ['A4','A9','B4','B9']}
jm.update({n:(30.48,175.26,90) for n in ['A1','A12','B1','B12']})
jm.update({'S1':(22.86,175.26,90),'A6':(44.45,Y,180),'B6':(44.45,Y+2.54,180),
           'A7':(44.45,CLK,180),'B7':(44.45,CLK+2.54,180),'A5':(44.45,137.16,180),
           'B5':(44.45,144.78,180),'A8':(44.45,157.48,180),'B8':(44.45,165.1,180)})
reflow('USB_C_Receptacle_USB2.0_16P',(27.94,132.08),(15.24,91.44,39.37,170.18),jm)
reflow('USBLC6-2SC6',(88.9,118.11),(81.28,104.14,96.52,132.08),
       {'1':(76.2,Y,0),'3':(76.2,CLK,0),'6':(101.6,Y,180),
        '4':(101.6,CLK,180),'5':(88.9,99.06,270),'2':(88.9,137.16,90)})
um={'13':(132.08,Y,0),'12':(132.08,CLK,0),'4':(132.08,139.7,0),
    '1':(154.94,99.06,270),'11':(165.1,99.06,270),'14':(172.72,154.94,90),
    '9':(185.42,Y,180),'10':(185.42,CLK,180),'5':(185.42,139.7,180)}
um.update({str(n):(x,154.94,90) for n,x in zip([6,2,3,7,8],[142.24,147.32,152.4,157.48,162.56])})
reflow('MCP2221AxST',(158.75,127),(137.16,104.14,180.34,149.86),um)
sm={'2':(233.68,Y,0),'1':(233.68,CLK,0),'5':(233.68,132.08,0),
    '3':(233.68,144.78,0),'4':(233.68,152.4,0),'6':(233.68,160.02,0),
    '7':(256.54,76.2,270),'8':(256.54,172.72,90),'17':(256.54,172.72,90)}
for ch in range(4):
    y=91.44+22.86*ch
    sm[str(9+2*ch)]=(281.94,round(y,2),180)
    sm[str(10+2*ch)]=(281.94,round(y+10.16,2),180)
reflow('LDC1614',(256.54,124.46),(238.76,81.28,276.86,167.64),sm)
PROPERTY_POS.update({'J1':(27.94,81.28),'U4':(74.93,96.52),
                     'R3':(109.22,133.35),'U2':(123.19,94.0),'U3':(269.24,71.12),'U1':(123.19,52.07)})
text('COIL TILE  /  USB INDUCTIVE SENSOR ARRAY',15,17,3,True)
text('A3 prototype  |  2 x 2 printed coils  |  USB powered  |  No firmware programming',15,25,1.5)
text('01  USB + PROTECTION',15.24,40.64,1.8,True)
text('02  HID / I2C BRIDGE',132.08,40.64,1.8,True)
text('03  INDUCTANCE CONVERTER',233.68,40.64,1.8,True)
text('04  LC SENSORS',307.34,40.64,1.8,True)
add('J1',27.94,132.08);add('U4',88.9,118.11);add('U2',158.75,127);add('U3',256.54,124.46)

# One shared supply rail, with each bypass pair grouped beside its load.
style('power')
add('U1',123.19,68.58);add('C1',101.6,81.28);add('C2',144.78,81.28)
vin=at('U1',1);vout=at('U1',5);assert vin[1]==RAIL
wire(at('J1','A4'),(60.96,99.06),(60.96,RAIL),vin)
wire(at('U4',5),(88.9,RAIL));junction(88.9,RAIL)
wire(at('C1',1),(101.6,RAIL));junction(101.6,RAIL)
wire(at('U1',3),(113.03,68.58),(113.03,RAIL));junction(113.03,RAIL)
flag(101.6,RAIL);power('VBUS',76.2,RAIL);junction(76.2,RAIL)
wire(vout,(312.42,RAIL));wire(at('C2',1),(144.78,RAIL));junction(144.78,RAIL)
power('+3V3',190.5,RAIL)
for ref,pin,x in [('U2',1,154.94),('U2',11,165.1),('U3',7,256.54)]:
    wire(at(ref,pin),(x,RAIL));junction(x,RAIL)
for ref,x in [('C3',172.72),('C4',195.58),('C5',287.02),('C6',312.42)]:
    add(ref,x,73.66 if ref in ['C5','C6'] else 81.28);wire(at(ref,1),(x,RAIL));junction(x,RAIL)
for ref in ['C1','C2','C3','C4','C5','C6']:stub(ref,2,length=5.08)
stub('U1',2,length=7.62)

style('usb')
for a,b,tie,net in [('A6','B6',50.8,'USB_P'),('A7','B7',55.88,'USB_N')]:
    y=at('J1',a)[1]; pin=1 if a=='A6' else 3; end=6 if pin==1 else 4; bridge=13 if pin==1 else 12
    wire(at('J1',a),(tie,y),at('U4',pin));wire(at('J1',b),(tie,at('J1',b)[1]),(tie,y));junction(tie,y)
    wire(at('U4',pin),at('U4',end),at('U2',bridge));label(net,111.76,y)
style('signal')
add('R1',55.88,154.94);add('R2',73.66,154.94)
wire(at('J1','A5'),(55.88,137.16),at('R1',1));label('CC1',48.26,137.16)
wire(at('J1','B5'),(73.66,144.78),at('R2',1));label('CC2',48.26,144.78)
wire(at('R1',2),(55.88,167.64),(73.66,167.64),at('R2',2));power('GND',73.66,167.64)
wire(at('J1','S1'),(22.86,182.88),(30.48,182.88),at('J1','A1'));power('GND',30.48,182.88);flag(22.86,182.88)
stub('U4',2,length=7.62);stub('U2',14,length=7.62);stub('U3',8,length=7.62)
add('R3',119.38,137.16);stub('R3',1,length=2.54)
wire(at('R3',2),(119.38,139.7),at('U2',4));label('RESET_N',120.65,139.7)
stub('U2',5,length=5.08)

style('i2c')
wire(at('U2',9),at('U3',2));label('SDA',226.06,Y)
wire(at('U2',10),at('U3',1));label('SCL',226.06,CLK)
for ref,x,y in [('R4',213.36,Y),('R5',228.6,CLK)]:
    add(ref,x,101.6);wire(at(ref,1),(x,RAIL));junction(x,RAIL);wire(at(ref,2),(x,y));junction(x,y)
add('TP3',198.12,110.49);wire(at('TP3',1),(198.12,Y));junction(198.12,Y)
add('TP4',208.28,133.35);wire(at('TP4',1),(208.28,CLK));junction(208.28,CLK)
style('signal')
for pin in [3,4,6]:wire(at('U3',pin),(223.52,at('U3',pin)[1]))
wire((223.52,144.78),(223.52,170.18));junction(223.52,152.4);junction(223.52,160.02);power('GND',223.52,170.18)
text('UART / GPIO unused',137.16,172.72,1.15)
text('0x2A / internal clock / always enabled',238.76,190.5,1.15)

style('sensor')
for ch in range(4):
    top=round(91.44+22.86*ch,2);bot=round(top+10.16,2);y=round((top+bot)/2,2)
    c='C'+str(ch+7);l='L'+str(ch+1);add(c,307.34,y);add(l,353.06,y)
    wire(at('U3',9+2*ch),(307.34,top),(353.06,top),at(l,1));wire(at(c,1),(307.34,top));junction(307.34,top)
    wire(at('U3',10+2*ch),(307.34,bot),(353.06,bot),at(l,2));wire(at(c,2),(307.34,bot));junction(307.34,bot)
    label(f'CH{ch}_A',285.75,top);label(f'CH{ch}_B',285.75,bot)
    text(['CH0 / lower right','CH1 / upper right','CH2 / upper left','CH3 / lower left'][ch],320.04,top-5.08,1.15,True)
style('power')
add('TP1',238.76,58.42);wire(at('TP1',1),(238.76,RAIL));junction(238.76,RAIL)
add('TP2',40.64,182.88);wire(at('TP2',1),(30.48,182.88));junction(30.48,182.88)
style('signal')
box((15.24,203.2),(195.58,243.84),'BUILD + SERVICE')
text('USB-C: 5 V sink; independent 5.1k CC pull-downs.',20.32,217.17,1.4)
text('MCP2221A: VDD and VUSB both supplied from external 3.3 V.',20.32,225.425,1.4)
text('TP1: 3V3    TP2: GND    TP3: SDA    TP4: SCL',20.32,233.68,1.4)
box((208.28,203.2),(393.7,243.84),'SENSOR NOTES')
text('24 mm / 16 turns / 0.20 mm trace + gap / 220 pF C0G',213.36,217.17,1.4)
text('5.51 uH and ~4.57 MHz nominal; nearby metal changes L and Q.',213.36,225.425,1.4)
text('Unbuilt A3: characterize amplitude, noise and coil coupling.',213.36,233.68,1.4)
for i,x in enumerate([25.4,63.5,101.6,139.7],1):add('H'+str(i),x,259.08)
text('M3 exposed-substrate edge holes / American Embedded',15.24,271.78,1.15)
text('Same mounting geometry as flyback + GaN examples. Use nylon hardware.',15.24,278.13,1.15)

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
