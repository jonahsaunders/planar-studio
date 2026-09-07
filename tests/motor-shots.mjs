/* Capture the real app on a local machine with Playwright Chromium installed.
   The README changes only after all five screenshots are captured successfully. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdtemp, rename, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('..',import.meta.url));
const docs=path.join(root,'docs');
const families=[
  ['rotary','Three-phase rotary','screenshot-motor'],
  ['stepper','Two-phase PCB stepper','screenshot-motor-stepper'],
  ['linear','Linear PCB motor','screenshot-motor-linear'],
  ['dual-rotor','Dual-rotor axial flux','screenshot-motor-dual-rotor'],
  ['planar','Two-axis planar motor','screenshot-motor-planar'],
];
const start='<!-- motor-gallery:start -->',end='<!-- motor-gallery:end -->';
const readmePath=path.join(root,'README.md');
const readme=await readFile(readmePath,'utf8');
if(!readme.includes(start)||!readme.includes(end))throw new Error('README motor gallery markers are missing.');
const stage=await mkdtemp(path.join(docs,'.motor-shots-'));
const server=spawn(process.env.PYTHON || (process.platform==='win32'?'python':'python3'),['ipc_entry.py','--print-url'],{cwd:root});
let browser;
try {
  const url=await new Promise((resolve,reject)=>{
    let stdout='',stderr='';
    const timer=setTimeout(()=>reject(new Error('The local preview server did not start within 20 seconds. '+stderr)),20000);
    server.stdout.on('data',data=>{stdout+=data;const match=stdout.match(/http:\/\/[^\s]+/);if(match){clearTimeout(timer);resolve(match[0]);}});
    server.stderr.on('data',data=>{stderr+=data;});
    server.once('error',error=>{clearTimeout(timer);reject(error);});
    server.once('exit',code=>{clearTimeout(timer);reject(new Error(`Preview server exited (${code}). ${stderr}`));});
  });
  browser=await chromium.launch();
  const page=await browser.newPage({viewport:{width:1500,height:1000},deviceScaleFactor:1.5,colorScheme:'dark'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url,{waitUntil:'networkidle'});
  await page.getByRole('tab',{name:'PCB motor',exact:true}).click();
  for(const [family,title,file]of families) {
    await page.getByLabel('Motor family',{exact:true}).selectOption(family);
    if(family==='stepper')await page.getByLabel('Microsteps per full step',{exact:true}).selectOption('8');
    if(family==='planar') {
      await page.getByLabel('Y drive current',{exact:true}).fill('1.5');
      await page.getByLabel('Y drive current',{exact:true}).press('Tab');
    }
    await page.waitForFunction(()=>{
      const status=document.getElementById('st-solve').textContent;
      if(/Fix parameters/.test(status))throw new Error(document.getElementById('toasts').textContent);
      return document.querySelector('#side .tile')&&!/solving/.test(status);
    },null,{timeout:30000});
    await page.locator('#t-fit').click();
    await page.waitForFunction(()=>document.querySelectorAll('#toasts .toast').length===0,null,{timeout:15000});
    // Allow the fitted canvas and charts to paint before capturing their pixels.
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    if(errors.length)throw new Error(errors.join('\n'));
    await page.screenshot({path:path.join(stage,file+'.png')});
    console.log(`Captured ${title}`);
  }
  let gallery=start+'\n**Application screenshots** — captured from this version in a browser.\n\n';
  gallery+='![Three-phase rotary motor workspace](docs/screenshot-motor.png)\n\n';
  for(const [,title,file]of families.slice(1))gallery+=`<details>\n<summary>${title}</summary>\n\n![${title} workspace](docs/${file}.png)\n\n</details>\n\n`;
  gallery+=end;
  for(const [,,file]of families)await rename(path.join(stage,file+'.png'),path.join(docs,file+'.png'));
  await writeFile(readmePath,readme.slice(0,readme.indexOf(start))+gallery+readme.slice(readme.indexOf(end)+end.length));
  console.log('Updated README gallery and five motor screenshots. Review them before committing.');
} finally {
  if(browser)await browser.close();
  server.kill();
  await rm(stage,{recursive:true,force:true});
}
