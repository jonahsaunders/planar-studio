import {createRequire} from 'node:module';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const sharp=createRequire(import.meta.url)(process.argv[2] || 'sharp');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const svg=Buffer.from(fs.readFileSync(root+'/evidence/schematic.svg','utf8').replace(/width="[\d.]+mm" height="[\d.]+mm"/,'width="5940" height="4200"'));
const full=await sharp(svg).png().toBuffer();
await sharp(full).resize({width:2970}).toFile(root+'/evidence/audit/schematic-overview.png');
for(const [name,x,y,w,h] of [['input',12,22,91,59],['output',168,25,117,62],['controller',12,84,157,80],['feedback',97,94,71,63],['clamp',95,25,89,78]]){
  await sharp(full).extract({left:Math.round(x*20),top:Math.round(y*20),width:Math.round(w*20),height:Math.round(h*20)}).png().toFile(root+'/evidence/audit/schematic-'+name+'.png');
}
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(root+'/'+p)).digest('hex');
const sources=['evidence/schematic.svg','kicad/PS-FLYBACK-5W.kicad_sch'];
const outputs=['overview','input','output','controller','feedback','clamp'].map(n=>'evidence/audit/schematic-'+n+'.png');
fs.writeFileSync(root+'/evidence/audit/schematic-render-provenance.json',JSON.stringify({method:'Rasterization of the native KiCad SVG; no circuit illustration substitutes.',source_SHA256:Object.fromEntries(sources.map(p=>[p,hash(p)])),output_SHA256:Object.fromEntries(outputs.map(p=>[p,hash(p)]))},null,2)+'\n');
