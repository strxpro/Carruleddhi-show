import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {renderMotionIcon} from './render-icons.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const base=path.join(process.env.LOCALAPPDATA,'Carruleddhi/deck-assets');
const dir=path.join(base,'sounds');await fs.mkdir(dir,{recursive:true});
if(/"(?:obs64|UlanziDeck).exe"/i.test(execFileSync('tasklist.exe',['/FO','CSV','/NH'],{encoding:'utf8'})))throw Error('Close OBS and Ulanzi first');
const profile=path.join(process.env.APPDATA,'Ulanzi/UlanziDeck/ProfilesV2/4a6f21f3-623f-4339-959b-24a4c94fb1e0.ulanziProfile');
const sceneFile=path.join(process.env.APPDATA,'obs-studio/basic/scenes/Bez_tytułu.json');
const backup=path.join(process.env.LOCALAPPDATA,'Carruleddhi/backups/sounds-'+Date.now());
await fs.cp(profile,path.join(backup,'profile'),{recursive:true});await fs.copyFile(sceneFile,path.join(backup,'obs.json'));
// Original procedural sounds: no third-party recordings or music licences.
let seed=245781;const noise=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/2147483648-1;};
const tone=(hz,t)=>Math.sin(Math.PI*2*hz*t);
function wav(seconds,sample){const rate=48000,n=Math.floor(seconds*rate),buf=Buffer.alloc(44+n*2);buf.write('RIFF');buf.writeUInt32LE(36+n*2,4);buf.write('WAVEfmt ',8);buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);buf.writeUInt16LE(1,22);buf.writeUInt32LE(rate,24);buf.writeUInt32LE(rate*2,28);buf.writeUInt16LE(2,32);buf.writeUInt16LE(16,34);buf.write('data',36);buf.writeUInt32LE(n*2,40);for(let i=0;i<n;i++){const t=i/rate,fade=Math.min(1,t/.008,(seconds-t)/.03);buf.writeInt16LE(Math.round(Math.max(-.65,Math.min(.65,sample(t)))*fade*32767),44+i*2);}return buf;}
const soundDefs=[
 ['SWOOSH','whoosh.wav','Left',.8,t=>noise()*.30*Math.sin(Math.PI*t/.8)**2],
 ['IMPACT','impact.wav','Right',.65,t=>(tone(64,t)*.35+noise()*.17)*Math.exp(-t*10)],
 ['ZWYCIESTWO','victory.wav','Up',1.6,t=>[523.25,659.25,783.99].reduce((v,h,i)=>{const x=t-i*.17;return v+(x>0?tone(h,x)*.16*Math.exp(-x*2.7):0)},0)],
 ['ODLICZANIE','countdown.wav','Down',2.8,t=>{const b=Math.floor(t),x=t-b;return x<.18?tone(b===2?1046.5:698.46,x)*.26*Math.sin(Math.PI*x/.18):0;}],
 ['DZWONEK','chime.wav','Home',1.2,t=>(tone(880,t)*.22+tone(1320,t)*.08)*Math.exp(-t*5)]
];
for(const[,file,,duration,fn]of soundDefs)await fs.writeFile(path.join(dir,file),wav(duration,fn));
const obs=JSON.parse(await fs.readFile(sceneFile));
let source=obs.sources.find(s=>s.name==='SFX CARRULEDDHI');
if(!source){source=structuredClone(obs.sources.find(s=>s.id==='ffmpeg_source'));Object.assign(source,{name:'SFX CARRULEDDHI',uuid:randomUUID(),hotkeys:{},filters:[]});obs.sources.push(source);}
Object.assign(source,{settings:{is_local_file:true,local_file:'',looping:false,restart_on_activate:false,close_when_inactive:false},volume:.55,muted:false,mixers:0,monitoring_type:1});
const fx=obs.sources.find(s=>s.name==='MASTER_EFFECTS');
if(!fx.settings.items.some(i=>i.name===source.name)){const item=structuredClone(fx.settings.items[0]);Object.assign(item,{name:source.name,source_uuid:source.uuid,id:++fx.settings.id_counter,visible:true});fx.settings.items.push(item);}
const lua=path.join(base,'soundboard.lua');await fs.copyFile(path.join(root,'soundboard.lua'),lua);
obs.modules['scripts-tool']=obs.modules['scripts-tool'].filter(s=>!s.path?.endsWith('/soundboard.lua'));
obs.modules['scripts-tool'].push({path:lua.replaceAll('\\','/'),settings:{sound_dir:dir.replaceAll('\\','/')}});
await fs.writeFile(sceneFile,JSON.stringify(obs,null,2));
const uuid='babf52d9-564d-4351-aa73-69e23f88cb80';
const action=async(label,hotkey,symbol)=>{
 const key=label.replaceAll(' ','_');await renderMotionIcon(base,key,label,symbol,'#ffbd79');
 return {Action:'com.ulanzi.ulanzistudio.carruleddhi.control',ActionID:randomUUID(),ActionParam:{Kind:'hotkey',Command:hotkey,IdleIcon:path.join(base,key+'.gif').replaceAll('\\','/'),PressIcon:path.join(base,key+'-press.gif').replaceAll('\\','/'),Label:label},LinkedTitle:true,Name:label,Plugin:{Name:'Carruleddhi Motion',UUID:'com.ulanzi.ulanzistudio.carruleddhi',Version:'1.0.0'},ViewParam:[{Icon:path.join(base,key+'.gif').replaceAll('\\','/'),IconRel:'',Text:''}]};
};
const audioPath=path.join(profile,'Profiles/b8d2ae43-8920-4815-a1dc-3f55bea5ce9b/manifest.json');
const audio=JSON.parse(await fs.readFile(audioPath));
const symbol='<path d="M29 47h22l27-24v78L51 77H29zM94 41a30 30 0 0 1 0 42M108 27a48 48 0 0 1 0 70"/>';
const soundSymbols={
 SWOOSH:'<path d="M22 42c69-48 109 24 49 25H30M39 85h62M24 99h47M91 22l18 7-7 18"/>',
 IMPACT:'<path d="m72 18 10 31 29-17-13 30 27 11-33 9 8 25-27-18-25 22 5-32-31-4 25-18-17-25 30 13z"/>',
 ZWYCIESTWO:'<path d="M46 25h52v25a26 26 0 0 1-52 0zM46 33H29v15a18 18 0 0 0 23 18M98 33h17v15a18 18 0 0 1-23 18M72 77v20M53 100h38"/>',
 ODLICZANIE:'<circle cx="72" cy="62" r="35"/><path d="M61 17h22M72 17v10M72 39v24l18 14"/>',
 DZWONEK:'<path d="M39 83h66l-9-15V49a24 24 0 0 0-48 0v19zM61 95a11 11 0 0 0 22 0M72 17v8"/>'
};
const folder=await action('DZWIEKI','',symbol);folder.Action='com.ulanzi.ulanzideck.page.folder';folder.ActionParam={ProfileUUID:uuid};folder.Plugin={Name:'Pages',UUID:'com.ulanzi.deck.page',Version:'1.0'};
audio.Controllers.find(c=>c.Type==='Keypad').Actions['0_1']=folder;
await fs.writeFile(audioPath,JSON.stringify(audio,null,2));
const actions={'0_0':structuredClone(audio.Controllers.find(c=>c.Type==='Keypad').Actions['0_0'])};
actions['0_0'].ActionID=randomUUID();
const slots=['1_0','2_0','3_0','4_0','0_1'];
for(let i=0;i<soundDefs.length;i++){const[label,,key]=soundDefs[i];actions[slots[i]]=await action(label,'Ctrl+Alt+Shift+'+key,soundSymbols[label]);}
actions['1_1']=await action('STOP DZWIEK','Ctrl+Alt+Shift+End','<rect x="43" y="34" width="58" height="58" rx="7"/>');
const pageDir=path.join(profile,'Profiles',uuid);await fs.mkdir(pageDir,{recursive:true});
await fs.writeFile(path.join(pageDir,'manifest.json'),JSON.stringify({Name:'DZWIEKI',Controllers:[{Type:'Keypad',Actions:actions},{Type:'Encoder',Actions:{}}]},null,2));
console.log('Installed five original sound effects, STOP, and AUDIO > DZWIEKI');
