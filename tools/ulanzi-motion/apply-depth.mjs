import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {depthIcon} from './depth-icons.mjs';
const root=path.join(process.env.APPDATA,'Ulanzi/UlanziDeck/ProfilesV2/4a6f21f3-623f-4339-959b-24a4c94fb1e0.ulanziProfile');
const assets=path.join(process.env.LOCALAPPDATA,'Carruleddhi/deck-assets');
if(/"UlanziDeck.exe"/i.test(execFileSync('tasklist.exe',['/FO','CSV','/NH'],{encoding:'utf8'})))throw Error('Close Ulanzi first');
await fs.cp(root,path.join(process.env.LOCALAPPDATA,'Carruleddhi/backups/depth-'+Date.now()),{recursive:true});
const generated=new Set();let buttons=0;
for(const folder of await fs.readdir(path.join(root,'Profiles'))){
 const dir=path.join(root,'Profiles',folder);let data;
 try{data=JSON.parse(await fs.readFile(path.join(dir,'manifest.json')));}catch{continue;}
 for(const controller of data.Controllers)for(const action of Object.values(controller.Actions)){
  const icon=action.ViewParam?.[0]?.Icon;if(!icon?.endsWith('.gif'))continue;
  const key=path.basename(icon,'.gif');
  if(!generated.has(key)){await depthIcon(path.join(assets,key+'.png'),path.join(assets,key+'.gif'),path.join(assets,key+'-press.gif'));generated.add(key);}
  await fs.copyFile(path.join(assets,key+'.gif'),icon);
  if(action.ActionParam?.PressIcon)await fs.copyFile(path.join(assets,key+'-press.gif'),action.ActionParam.PressIcon);
  buttons++;
 }
}
console.log(`Depth and tunnel animation applied: ${buttons} buttons, ${generated.size} unique icons`);
