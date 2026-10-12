"""Canonical part/net specification shared by schematic, layout and BOM."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
PARTS=[]
def add(ref,value,lib,symbol,fp,nets,code='',mpn='',mfr='',source='',bom=True):
 PARTS.append(dict(ref=ref,value=value,lib=lib,symbol=symbol,footprint='CoilTile:'+fp.split(':')[-1],stock_footprint=fp,nets={str(k):v for k,v in nets.items()},lcsc=code,mpn=mpn,mfr=mfr,source=source,bom=bom))
G='GND';V='+3V3';U='VBUS';R='Resistor_SMD:R_0603_1608Metric';C='Capacitor_SMD:C_0603_1608Metric'
add('J1','USB-C / USB 2.0','Connector','USB_C_Receptacle_USB2.0_16P','Connector_USB:USB_C_Receptacle_HRO_TYPE-C-31-M-12',{'A1':G,'A12':G,'B1':G,'B12':G,'S1':G,'A4':U,'A9':U,'B4':U,'B9':U,'A5':'CC1','B5':'CC2','A6':'USB_P','B6':'USB_P','A7':'USB_N','B7':'USB_N','A8':None,'B8':None},'C165948','TYPE-C-31-M-12','Korean Hroparts Elec','https://www.lcsc.com/product-detail/C165948.html')
add('U1','AP2112K-3.3TRG1','Regulator_Linear','AP2112K-3.3','Package_TO_SOT_SMD:SOT-23-5',{1:U,2:G,3:U,4:None,5:V},'C51118','AP2112K-3.3TRG1','Diodes Incorporated','https://www.diodes.com/assets/Datasheets/AP2112.pdf')
add('U2','MCP2221A-I/ST','Interface_USB','MCP2221AxST','Package_SO:TSSOP-14_4.4x5mm_P0.65mm',{1:V,2:None,3:None,4:'RESET_N',5:V,6:None,7:None,8:None,9:'SDA',10:'SCL',11:V,12:'USB_N',13:'USB_P',14:G},'C130462','MCP2221A-I/ST','Microchip Technology','https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP2221A-Data-Sheet-20005565E.pdf')
add('U3','LDC1614RGHR','Sensor_Proximity','LDC1614','Package_DFN_QFN:WQFN-16-1EP_4x4mm_P0.5mm_EP2.6x2.6mm',{1:'SCL',2:'SDA',3:G,4:G,5:None,6:G,7:V,8:G,9:'CH0_A',10:'CH0_B',11:'CH1_A',12:'CH1_B',13:'CH2_A',14:'CH2_B',15:'CH3_A',16:'CH3_B',17:G},'C968448','LDC1614RGHR','Texas Instruments','https://www.ti.com/lit/ds/symlink/ldc1614.pdf')
add('U4','USBLC6-2SC6','Power_Protection','USBLC6-2SC6','Package_TO_SOT_SMD:SOT-23-6',{1:'USB_P',6:'USB_P',3:'USB_N',4:'USB_N',2:G,5:U},'C7519','USBLC6-2SC6','STMicroelectronics','https://www.st.com/resource/en/datasheet/usblc6-2.pdf')
for ref,val,nets,code,mpn in [('R1','5.1kR',{'1':'CC1','2':G},'C23186','0603WAF5101T5E'),('R2','5.1kR',{'1':'CC2','2':G},'C23186','0603WAF5101T5E'),('R3','10kR',{'1':V,'2':'RESET_N'},'C25804','0603WAF1002T5E'),('R4','4.7kR',{'1':V,'2':'SDA'},'C23162','0603WAF4701T5E'),('R5','4.7kR',{'1':V,'2':'SCL'},'C23162','0603WAF4701T5E')]:add(ref,val,'Device','R_Small_US',R,nets,code,mpn,'UNI-ROYAL',f'https://www.lcsc.com/product-detail/{code}.html')
for ref,n in [('C1',U),('C2',V)]:add(ref,'4.7uF / 25V','Device','C_Small','Capacitor_SMD:C_0805_2012Metric',{1:n,2:G},'C354262','CC0805KKX7R8BB475','YAGEO','https://www.lcsc.com/product-detail/C354262.html')
for ref in ['C3','C5']:add(ref,'100nF / 50V','Device','C_Small',C,{1:V,2:G},'C14663','CC0603KRX7R9BB104','YAGEO','https://www.lcsc.com/product-detail/C14663.html')
for ref in ['C4','C6']:add(ref,'470nF / 25V','Device','C_Small',C,{1:V,2:G},'C1623','CL10B474KA8NNNC','Samsung Electro-Mechanics','https://www.lcsc.com/product-detail/C1623.html')
for i in range(4):
 add('C'+str(i+7),'220pF / C0G','Device','C_Small',C,{1:f'CH{i}_A',2:f'CH{i}_B'},'C156398','0603CG221J500NT','FH (Guangdong Fenghua Advanced Tech)','https://www.lcsc.com/product-detail/C156398.html')
 add('L'+str(i+1),'5.51uH nominal','Device','L_Small','CoilTile:Planar_24mm_16T',{1:f'CH{i}_A',2:f'CH{i}_B'},mpn='PCB winding / not fitted',source='Planar Studio coil.planar.json',bom=False)
for i,n in enumerate([V,G,'SDA','SCL'],1):add('TP'+str(i),n,'Connector','TestPoint','TestPoint:TestPoint_Pad_D1.0mm',{1:n},bom=False)
for i in range(1,5):add('H'+str(i),'M3 / NPTH 3.2mm','Mechanical','MountingHole','CoilTile:MountingHole_3.2mm_M3_ExposedSubstrate_Edge',{},bom=False)
BYREF={p['ref']:p for p in PARTS}
if __name__=='__main__':(ROOT/'design.json').write_text(json.dumps(PARTS,indent=2))
