/* Rendered browser gate for the two design workflows. Uses disposable state. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url)),dist=path.join(root,'dist');
fs.mkdirSync(dist,{recursive:true});
const state=fs.mkdtempSync(path.join(dist,'.design-layout-'));
const server=spawn('python3',['ipc_entry.py','--print-url'],{cwd:root,env:{...process.env,PLANAR_STUDIO_HOME:state}});
let browser;
try {
 const url=await new Promise((resolve,reject)=>{
  let text='',err='';const timer=setTimeout(()=>reject(new Error('Server startup timed out: '+err)),15000);
  server.stdout.on('data',d=>{text+=d;const m=text.match(/http:\/\/\S+/);if(m){clearTimeout(timer);resolve(m[0]);}});
  server.stderr.on('data',d=>{err+=d;});server.once('error',e=>{clearTimeout(timer);reject(e);});server.once('exit',code=>{clearTimeout(timer);reject(new Error(`Server exited (${code}): ${err}`));});
 });
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM||undefined});
 const page=await browser.newPage({viewport:{width:1500,height:1000},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const settled=()=>page.waitForFunction(()=>document.querySelector('#side .tile')&&!/solving|Fix parameters/.test(document.querySelector('#st-solve').textContent),null,{timeout:30000});
 const set=async(label,value)=>{await page.getByLabel(label,{exact:true}).fill(String(value));await page.getByLabel(label,{exact:true}).press('Tab');await settled();};
 await page.goto(url,{waitUntil:'networkidle'});await settled();
 await page.getByRole('tab',{name:'PCB motor',exact:true}).click();await settled();
 await page.getByLabel('Winding assignments',{exact:true}).selectOption('auto');await set('Pole pairs',7);
 await page.getByLabel('Coil 1 polarity',{exact:true}).selectOption('-1');await settled();
 assert.equal(await page.getByLabel('Winding assignments',{exact:true}).inputValue(),'custom');
 assert.equal(await page.locator('svg[aria-label="Coil contributions and resultant phase phasors"]').count(),1);
 await page.getByRole('button',{name:'Reset to automatic',exact:true}).click();await settled();
 await page.locator('#t-fit').click();await page.screenshot({path:path.join(dist,'winding-designer.png')});
 await page.getByRole('tab',{name:'Inductor',exact:true}).click();await settled();
 await page.getByLabel('Generate in remaining board area',{exact:true}).check();await settled();
 await set('Requested contour turns',5);
 await page.getByRole('button',{name:'Add connector',exact:true}).click();await settled();
 await page.getByRole('button',{name:'Add hole',exact:true}).click();await settled();
 await set('Region 2 Radius (mm)',2.5);
 await page.getByRole('button',{name:'Mark forbidden region',exact:true}).click();
 const svg=page.locator('svg[aria-label="Board obstacle editor"]');await svg.scrollIntoViewIfNeeded();const box=await svg.boundingBox();
 await page.mouse.move(box.x+box.width*0.3,box.y+box.height*0.3);await page.mouse.down();await page.mouse.move(box.x+box.width*0.4,box.y+box.height*0.4);await page.mouse.up();
 await page.getByLabel('Region 3 X (mm)',{exact:true}).waitFor();
 await page.getByLabel('Remove region 3',{exact:true}).click();await settled();
 await page.getByRole('button',{name:'Save',exact:true}).click();
 await page.locator('#t-fit').click();await page.screenshot({path:path.join(dist,'obstacle-winding.png')});
 await page.locator('#btn-export').click();assert.equal(await page.locator('.export-card').count(),6);
 assert.deepEqual(errors,[]);console.log('Rendered winding assignments, obstacle marking, solve and export flows passed.');
} finally {await browser?.close();server.kill();fs.rmSync(state,{recursive:true,force:true});}
