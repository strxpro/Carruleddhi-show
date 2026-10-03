import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {execFileSync} from 'node:child_process';
const root=path.join(process.env.APPDATA,'Ulanzi/UlanziDeck/ProfilesV2/4a6f21f3-623f-4339-959b-24a4c94fb1e0.ulanziProfile');
const assets=path.join(process.env.LOCALAPPDATA,'Carruleddhi/deck-assets');
if(/"UlanziDeck.exe"/i.test(execFileSync('tasklist.exe',['/FO','CSV','/NH'],{encoding:'utf8'})))throw Error('Close Ulanzi first');
const backup=path.join(process.env.LOCALAPPDATA,'Carruleddhi/backups/stable-'+Date.now());
await fs.cp(root,backup,{recursive:true});
let icons=0,actions=0;
for(const page of await fs.readdir(path.join(root,'Profiles'))){
 const dir=path.join(root,'Profiles',page),file=path.join(dir,'manifest.json');let data;
 try{data=JSON.parse(await fs.readFile(file));}catch{continue;}
 for(const controller of data.Controllers)for(const action of Object.values(controller.Actions)){
  if(action.Action==='com.ulanzi.ulanzistudio.carruleddhi.control'){
   if(action.ActionParam.Kind!=='hotkey'||!action.ActionParam.Command)throw Error('Unsupported action '+action.Name);
   action.Action='com.ulanzi.ulanzideck.system.hotkey';
   action.ActionParam={Hotkey:action.ActionParam.Command};
   action.Plugin={Name:'System',UUID:'com.ulanzi.deck.system',Version:'1.0'};
   actions++;
  }
  const view=action.ViewParam?.[0];if(!view?.Icon||action.Action.endsWith('.smallwindow.window'))continue;
  const name=path.basename(view.Icon).replace(/\.(gif|png)$/i,'.png');
  const src=path.join(assets,name),dest=path.join(dir,'Images',name);
  await sharp(src).metadata();
  await fs.mkdir(path.dirname(dest),{recursive:true});await fs.copyFile(src,dest);
  Object.assign(view,{Icon:dest.replaceAll('\\','/'),IconRel:'Images/'+name,IconEx:'Images/'+name,Text:''});
  icons++;
 }
 await fs.writeFile(file,JSON.stringify(data,null,2));
}
console.log(JSON.stringify({staticIcons:icons,nativeHotkeys:actions,backup}));
