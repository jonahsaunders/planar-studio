// UTF-8 store-only ZIP: portable handoffs without a compression dependency.
export function zipTextFiles(files) {
  const encoder=new TextEncoder(),parts=[],central=[];let offset=0;
  const header=n=>{const a=new Uint8Array(n);return [a,new DataView(a.buffer)];};
  for(const [name,text] of Object.entries(files)){
    const path=encoder.encode(name.replace(/[\\/]/g,'_')),data=encoder.encode(text);
    let crc=0xffffffff;for(const byte of data){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}crc=(crc^0xffffffff)>>>0;
    const [local,v]=header(30);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,path.length,true);
    const [entry,w]=header(46);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,0x800,true);w.setUint16(14,33,true);w.setUint32(16,crc,true);w.setUint32(20,data.length,true);w.setUint32(24,data.length,true);w.setUint16(28,path.length,true);w.setUint32(42,offset,true);
    parts.push(local,path,data);central.push(entry,path);offset+=30+path.length+data.length;
  }
  const size=central.reduce((s,a)=>s+a.length,0),[end,v]=header(22),count=Object.keys(files).length;
  v.setUint32(0,0x06054b50,true);v.setUint16(8,count,true);v.setUint16(10,count,true);v.setUint32(12,size,true);v.setUint32(16,offset,true);
  const out=new Uint8Array(offset+size+22);let index=0;for(const part of [...parts,...central,end]){out.set(part,index);index+=part.length;}return out;
}
