import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const assets=path.join(process.env.LOCALAPPDATA,'Carruleddhi/deck-assets');
const profile=path.join(process.env.APPDATA,'Ulanzi/UlanziDeck/ProfilesV2/4a6f21f3-623f-4339-959b-24a4c94fb1e0.ulanziProfile');
if(/"UlanziDeck.exe"/i.test(execFileSync('tasklist.exe',['/FO','CSV','/NH'],{encoding:'utf8'})))throw Error('Close Ulanzi first');
const backup=path.join(process.env.LOCALAPPDATA,'Carruleddhi/backups/artwork-'+Date.now());
await fs.cp(profile,backup,{recursive:true});
const names=['ZAWODNICY','POWTORKI','SCENY','KAMERY','AUDIO','GRAFIKI','EFEKTY','INSTRUKCJA'];
// Recraft returned a two-column, four-row sheet. Coordinates are from inspected artwork.
const xs=[228,952],ys=[124,728,1320,1920];
for(let i=0;i<names.length;i++){
 const crop=await sharp(path.join(here,'artwork/higgsfield-atlas.png')).extract({left:xs[i%2],top:ys[Math.floor(i/2)],width:490,height:490}).resize(144,144).png().toBuffer();
 const normal=[],press=[];
 for(const pressed of [false,true])for(let f=0;f<(pressed?16:40);f++){
  const t=f/(pressed?16:40),scale=pressed?1-.09*Math.exp(-5*t)*Math.cos(11*t):1+.015*Math.sin(t*Math.PI*2);
  const size=Math.round(124*scale),icon=await sharp(crop).resize(size,size).png().toBuffer();
  const overlay=Buffer.from(`<svg width="144" height="144"><rect x="0" y="110" width="144" height="34" fill="#101019"/><text x="72" y="132" text-anchor="middle" fill="#fff" font-family="Segoe UI" font-weight="700" font-size="13">${names[i]}</text><rect x="1" y="1" width="142" height="142" rx="17" fill="none" stroke="#c8d9ff" stroke-opacity="${pressed?.5*(1-t):.15+.07*Math.sin(t*Math.PI*2)}"/></svg>`);
  const raw=await sharp({create:{width:144,height:144,channels:4,background:'#15141e'}}).composite([{input:icon,left:Math.floor((144-size)/2),top:Math.floor((114-size)/2) < 0 ? 0:Math.floor((114-size)/2)},{input:overlay}]).raw().toBuffer();
  (pressed?press:normal).push(raw);
 }
 for(const [frames,suffix,delay]of [[normal,'',60],[press,'-press',40]])await sharp(Buffer.concat(frames),{raw:{width:144,height:144*frames.length,channels:4,pageHeight:144}}).gif({loop:0,delay:Array(frames.length).fill(delay),colours:128}).toFile(path.join(assets,names[i]+suffix+'.gif'));
 await sharp(normal[0],{raw:{width:144,height:144,channels:4}}).png().toFile(path.join(assets,names[i]+'.png'));
}
let count=0;
for(const folder of await fs.readdir(path.join(profile,'Profiles'))){
 const dir=path.join(profile,'Profiles',folder),file=path.join(dir,'manifest.json');
 let data;try{data=JSON.parse(await fs.readFile(file,'utf8'));}catch{continue;}
 for(const controller of data.Controllers)for(const action of Object.values(controller.Actions)){
  if(!action.ViewParam?.[0]?.Icon)continue;
  const name=path.basename(action.ViewParam[0].Icon),dest=path.join(dir,'Images',name);
  try{await fs.access(path.join(assets,name));}catch{continue;}
  await fs.mkdir(path.dirname(dest),{recursive:true});
  const input=await fs.readFile(path.join(assets,name));
  const metadata=await sharp(input,{animated:true}).metadata();
  await sharp(input,{animated:true}).gif({loop:0,delay:Array(metadata.pages).fill(60)}).toFile(dest);
  Object.assign(action.ViewParam[0],{Icon:dest.replaceAll('\\','/'),IconRel:'Images/'+name,IconEx:'Images/'+name,Text:''});
  if(action.ActionParam?.IdleIcon){
   action.ActionParam.IdleIcon=dest.replaceAll('\\','/');
   const pressName=name.replace('.gif','-press.gif');
   const pressed=await fs.readFile(path.join(assets,pressName));
   const pm=await sharp(pressed,{animated:true}).metadata();
   await sharp(pressed,{animated:true}).gif({loop:0,delay:Array(pm.pages).fill(40)}).toFile(path.join(dir,'Images',pressName));
   action.ActionParam.PressIcon=path.join(dir,'Images',pressName).replaceAll('\\','/');
  }
  count++;
 }
 await fs.writeFile(file,JSON.stringify(data,null,2));
}
const layers=await Promise.all(names.map(async(n,i)=>({input:await sharp(path.join(assets,n+'.png')).png().toBuffer(),left:12+(i%4)*156,top:12+Math.floor(i/4)*156})));
await sharp({create:{width:636,height:324,channels:4,background:'#080b12'}}).composite(layers).png().toFile(path.join(assets,'higgsfield-preview.png'));
console.log(JSON.stringify({iconsInstalled:count,backup}));
