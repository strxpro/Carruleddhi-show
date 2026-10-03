// Local, reversible setup for this production PC. Close OBS and Ulanzi first.
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderMotionIcon } from './ulanzi-motion/render-icons.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const profile = path.join(process.env.APPDATA, 'Ulanzi/UlanziDeck/ProfilesV2/4a6f21f3-623f-4339-959b-24a4c94fb1e0.ulanziProfile');
const sceneFile = path.join(process.env.APPDATA, 'obs-studio/basic/scenes/Bez_tytułu.json');
const local = path.join(process.env.LOCALAPPDATA, 'Carruleddhi');
const assets = path.join(local, 'deck-assets');
const timer = path.join(local, 'race-timer');
const read = async p => JSON.parse(await fs.readFile(p, 'utf8'));
const write = async (p, d) => { await fs.mkdir(path.dirname(p), {recursive:true}); await fs.writeFile(p, JSON.stringify(d,null,2)); };
const clone = o => structuredClone(o);
const uid = name => ({main:'75641c7d-956d-48dd-957b-b79bd381da85',replay:'3987111c-0a0b-4efa-bae7-e1ba9a89e92a',scenes:'e26771c1-b181-4097-af8d-c8b817ddac8f',cameras:'c6379f0f-8932-47fc-8c23-b6e66de3d849',fx:'83eb6ad9-355e-4bd1-8457-3b1b890209db',audio:'b8d2ae43-8920-4815-a1dc-3f55bea5ce9b',people:'79fc426e-58e7-4633-9cb2-588596125b72',edit:'47d28f65-1f4b-4dd6-b79c-525d45e44711',effects:'bf1f120b-9f43-4dea-b9b3-95aaed2e3dce'}[name]);
const pagePath = name => path.join(profile,'Profiles',uid(name),'manifest.json');
const running = execFileSync('tasklist.exe',['/FO','CSV','/NH'],{encoding:'utf8'});
if (/"(?:obs64|UlanziDeck)\.exe"/i.test(running)) throw new Error('Close OBS and Ulanzi before running setup.');
const backup = path.join(local,'backups',new Date().toISOString().replace(/[:.]/g,'-'));
await fs.mkdir(backup,{recursive:true});
await fs.cp(profile,path.join(backup,'ulanziProfile'),{recursive:true});
await fs.copyFile(sceneFile,path.join(backup,'obs-scenes.json'));
await fs.cp(timer,path.join(backup,'race-timer'),{recursive:true});
await fs.mkdir(assets,{recursive:true});
const obs=await read(sceneFile);
const source=n=>{const s=obs.sources.find(s=>s.name===n);if(!s)throw new Error('Missing source '+n);return s;};
const chord=k=>{const parts=k.split('+');return {control:parts.includes('Ctrl'),alt:parts.includes('Alt'),shift:parts.includes('Shift'),key:'OBS_KEY_'+parts.at(-1).toUpperCase()};};
function hot(s,n,k){s.hotkeys??={};s.hotkeys[n]=[chord(k)];}
const replay=source('Replay Source');
const replayDirectory=path.join(local,'Replays');await fs.mkdir(replayDirectory,{recursive:true});
Object.assign(replay.settings,{load_switch_scene:'REPLAY',next_scene:'LIVE',speed_percent:100,directory:replayDirectory.replaceAll('\\','/')});
const replayKeys={Replay:'Ctrl+Alt+F6',Pause:'Ctrl+Alt+F9',Restart:'Ctrl+Alt+F11',SlowerBy5:'Ctrl+Alt+F1',FasterBy5:'Ctrl+Alt+F2',HalfSpeed:'Ctrl+Alt+F3',NormalSpeed:'Ctrl+Alt+F4',DoubleSpeed:'Ctrl+Alt+F10',Previous:'Ctrl+Alt+Left',Next:'Ctrl+Alt+Right',Save:'Ctrl+Alt+Shift+F8',TrimFront:'Ctrl+Alt+Shift+F9',TrimEnd:'Ctrl+Alt+Shift+F10',TrimReset:'Ctrl+Alt+Shift+F11',Reverse:'Ctrl+Alt+Shift+F12',Forward:'Ctrl+Shift+Home',PrevFrame:'Ctrl+Alt+Comma',NextFrame:'Ctrl+Alt+Period',First:'Ctrl+Alt+Home',Last:'Ctrl+Alt+End'};
for(const[n,k]of Object.entries(replayKeys))hot(replay,'ReplaySource.'+n,k);
// No one-touch clear/remove: keep the buffer until deliberately cleared in OBS.
replay.hotkeys['ReplaySource.Clear']=[];
const sceneKeys={LIVE:'Ctrl+Alt+F8',REPLAY:'Ctrl+Alt+F7',STARTING:'Ctrl+Shift+F1',BREAK:'Ctrl+Shift+F2',VOTING:'Ctrl+Shift+F3',RESULTS:'Ctrl+Shift+F4',STANDBY:'Ctrl+Shift+F5',ENDING:'Ctrl+Shift+F6',INTRO:'Ctrl+Shift+F7'};
for(const[n,k]of Object.entries(sceneKeys))hot(source(n),'OBSBasic.SelectScene',k);
source('ZAWODNIK').settings.url='https://www.carruleddhishow.com/obs/participant';
const duplicate=source('REPLAY').settings.items.find(i=>i.name==='ZAWODNIK REPALY');
if(duplicate){
 const redundant=source('ZAWODNIK REPALY');
 if(redundant.settings.url===source('ZAWODNIK POWTORKA').settings.url){
  source('REPLAY').settings.items=source('REPLAY').settings.items.filter(i=>i!==duplicate);
  if(!obs.sources.some(s=>s.settings?.items?.some(i=>i.source_uuid===redundant.uuid)))obs.sources=obs.sources.filter(s=>s!==redundant);
 }
}
function visibility(scene,item,k){const s=source(scene),i=s.settings.items.find(i=>i.name===item);if(!i)throw new Error('Missing item '+item);hot(s,'libobs.show_scene_item.'+i.id,k);hot(s,'libobs.hide_scene_item.'+i.id,k);}
visibility('LIVE','Przechwytywanie ekranu','Ctrl+Alt+Shift+F7');
visibility('MASTER_OVERLAY','LOGO_IDLE','Ctrl+Alt+Shift+F6');
visibility('MASTER_REPLAY','LOGO_IDLE','Ctrl+Alt+Shift+F6');
for(const n of ['ZAWODNIK','ZAWODNIK POWTORKA','SPONSORZY'])hot(source(n),'ObsBrowser.Refresh','Ctrl+Alt+F5');
for(const[s,k]of [[obs.AuxAudioDevice1,'Ctrl+Alt+Shift+F1'],[obs.DesktopAudioDevice1,'Ctrl+Alt+Shift+F2'],[replay,'Ctrl+Alt+Shift+F3'],[source('MIXER_PROGRAM'),'Ctrl+Alt+Shift+F5']]){hot(s,'libobs.mute',k);hot(s,'libobs.unmute',k);}

// Apply the deployed scenes, preserving the original collection in the backup.
const xml=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;');
const template=source('ZAWODNIK'), itemTemplate=source('LIVE').settings.items[0];
const boardNames=['STARTING','INTRO','BREAK','VOTING','RESULTS','STANDBY','ENDING'];
function browserSource(name,url,shutdown=false){
 let value=obs.sources.find(s=>s.name===name);
 if(!value){value=clone(template);value.name=name;value.uuid=randomUUID();value.hotkeys={};obs.sources.push(value);}
 value.settings={url,width:1920,height:1080,is_local_file:false,shutdown,restart_when_active:shutdown,fps:30};
 return value;
}
function item(value,id,visible=true){const result=clone(itemTemplate);Object.assign(result,{name:value.name,source_uuid:value.uuid,id,visible,locked:true,pos:{x:0,y:0},pos_rel:{x:-1920/1080,y:-1},scale:{x:1,y:1},scale_rel:{x:1,y:1},crop_left:0,crop_top:0,crop_right:0,crop_bottom:0,bounds_type:0});return result;}
for(const[name,route]of [['ZAWODNIK','participant'],['ZAWODNIK POWTORKA','replay'],['SPONSORZY','sponsors']])browserSource(name,'https://www.carruleddhishow.com/obs/'+route);
for(const name of boardNames){
 const board=browserSource('CARRULEDDHI '+name,'https://www.carruleddhishow.com/obs/'+name.toLowerCase()+'?background=solid');
 const camera=item(source('MIXER_PROGRAM'),1);
 Object.assign(camera,{pos:{x:544,y:80},pos_rel:{x:(544-960)/540,y:(80-540)/540},scale:{x:2/3,y:2/3},scale_rel:{x:2/3,y:2/3}});
 source(name).settings.items=[camera,item(board,2)];source(name).settings.id_counter=2;
 hot(board,'ObsBrowser.Refresh','Ctrl+Alt+F5');
}
let fxScene=obs.sources.find(s=>s.name==='MASTER_EFFECTS');
if(!fxScene){fxScene=clone(source('MASTER_REPLAY'));fxScene.name='MASTER_EFFECTS';fxScene.uuid=randomUUID();fxScene.hotkeys={};obs.sources.push(fxScene);obs.scene_order.push({name:fxScene.name});}
const effectNames=['CONFETTI','RIBBONS','SPARKLES'];
fxScene.settings.items=effectNames.map((name,index)=>item(browserSource('FX '+name,'https://www.carruleddhishow.com/obs/effects/'+name.toLowerCase()+'?once=1',true),index+1,false));
fxScene.settings.id_counter=3;
for(const name of ['LIVE','REPLAY',...boardNames]){
 const scene=source(name);scene.settings.items=scene.settings.items.filter(i=>i.name!=='MASTER_EFFECTS');
 scene.settings.items.push(item(fxScene,++scene.settings.id_counter));
}
const luaFile=path.join(assets,'carruleddhi-obs-effects.lua');
await fs.copyFile(path.join(root,'tools/carruleddhi-obs-effects.lua'),luaFile);
obs.modules['scripts-tool']=obs.modules['scripts-tool'].filter(s=>!s.path?.endsWith('carruleddhi-obs-effects.lua'));
obs.modules['scripts-tool'].push({path:luaFile.replaceAll('\\','/'),settings:{}});

// Bespoke vector masters and small looping GIFs. Labels never move.
const paths={people:'<circle cx="72" cy="42" r="14"/><path d="M44 88v-9c0-25 56-25 56 0v9"/>',replay:'<path d="M40 40a38 38 0 1 1-4 46M40 40v25H17"/><path d="m65 46 27 18-27 18z"/>',scenes:'<rect x="30" y="29" width="84" height="62" rx="8"/><path d="M30 49h84M49 29l14 20M77 29l14 20"/>',camera:'<rect x="25" y="36" width="64" height="52" rx="8"/><path d="m89 51 28-14v49L89 73"/>',audio:'<rect x="60" y="23" width="24" height="47" rx="12"/><path d="M45 59a27 27 0 0 0 54 0M72 86v16M56 102h32"/>',play:'<path d="m48 28 57 36-57 36z"/>',stop:'<rect x="43" y="34" width="58" height="58" rx="7"/>',pause:'<path d="M55 31v63M89 31v63"/>',back:'<path d="m63 30-32 32 32 32M33 62h80"/>',eye:'<path d="M20 63s18-28 52-28 52 28 52 28-18 28-52 28-52-28-52-28z"/><circle cx="72" cy="63" r="13"/>',hide:'<path d="M20 63s18-28 52-28 52 28 52 28-18 28-52 28-52-28-52-28zM30 22l84 84"/>',info:'<circle cx="72" cy="61" r="37"/><path d="M72 55v28M72 38v2"/>',globe:'<circle cx="72" cy="61" r="38"/><ellipse cx="72" cy="61" rx="17" ry="38"/><path d="M34 61h76"/>',bolt:'<path d="m78 20-40 48h29l-1 34 40-48H77z"/>',save:'<path d="M35 23h65l11 11v67H35zM50 23v29h44V23M51 101V72h44v29"/>',next:'<path d="m39 29 48 33-48 33zM103 29v66"/>',prev:'<path d="m105 29-48 33 48 33zM41 29v66"/>',trim:'<path d="M43 22v67h65M22 45h65v66"/>',home:'<path d="m22 59 50-38 50 38M38 51v51h68V51M62 102V74h20v28"/>'};
Object.assign(paths,{
 sliders:'<path d="M29 35h86M29 64h86M29 93h86"/><rect x="48" y="26" width="13" height="18" rx="4"/><rect x="86" y="55" width="13" height="18" rx="4"/><rect x="42" y="84" width="13" height="18" rx="4"/>',
 sparkles:'<path d="m72 23 10 28 28 10-28 10-10 28-10-28-28-10 28-10zM110 20v18M101 29h18M30 88v16M22 96h16"/>',
 confetti:'<path d="m33 103 14-48 35 35zM63 29l7 14M96 42l-12 7M101 72l12 3M84 20l7 5M32 29l-5 9M110 24l-5 10"/><circle cx="108" cy="99" r="4"/><circle cx="48" cy="18" r="3"/>',
 ribbons:'<path d="M34 24c70-8 68 32 14 35s-14 38 59 32M101 22c-71 8-69 37-17 45s2 29-46 34"/>',
 timer:'<circle cx="72" cy="62" r="31"/><path d="M61 19h22M72 19v12M72 43v20l16 9M96 33l7-7"/>',
 flag:'<path d="M39 101V23M40 27h66l-15 19 15 18H40"/>',
 coffee:'<path d="M35 48h61v24a26 26 0 0 1-26 26H61a26 26 0 0 1-26-26zM96 51h10a13 13 0 0 1 0 26H95M49 22v12M68 19v15M86 22v12"/>',
 trophy:'<path d="M46 25h52v25a26 26 0 0 1-52 0zM46 33H29v15a18 18 0 0 0 23 18M98 33h17v15a18 18 0 0 1-23 18M72 77v20M53 100h38"/>',
 vote:'<path d="m41 47 18 18 43-42M34 71v32h76V71M23 71h26M95 71h26"/>',
 speaker:'<path d="M29 47h22l27-24v78L51 77H29zM94 41a30 30 0 0 1 0 42M108 27a48 48 0 0 1 0 70"/>',
 monitor:'<rect x="24" y="26" width="96" height="64" rx="6"/><path d="M72 90v14M53 105h38"/>'
});
const entries=[];
const generated=new Map();
async function action(label,kind,param,icon='info',color='#ffc857',big=''){
 const key=label.replaceAll('+','PLUS').replaceAll('-','MINUS').replace(/[^A-Za-z0-9]/g,'_');
 if(!generated.has(key)){
  await renderMotionIcon(assets,key,label,paths[icon],color,big);
  generated.set(key,true);
 }
 const family=kind.startsWith('page.')?'page':'system';entries.push({label,kind,param,icon:key+'.gif'});
 const result={Action:'com.ulanzi.ulanzideck.'+kind,ActionID:randomUUID(),ActionParam:param,LinkedTitle:true,Name:label,Plugin:{Name:family==='page'?'Pages':'System',UUID:'com.ulanzi.deck.'+family,Version:'1.0'},ViewParam:[{Icon:path.join(assets,key+'.gif').replaceAll('\\','/'),IconRel:'',Text:''}]};
 if(kind==='system.hotkey'){
  result.Action='com.ulanzi.ulanzistudio.carruleddhi.control';
  result.Plugin={Name:'Carruleddhi Motion',UUID:'com.ulanzi.ulanzistudio.carruleddhi',Version:'1.0.0'};
  result.ActionParam={Kind:'hotkey',Command:param.Hotkey,IdleIcon:path.join(assets,key+'.gif').replaceAll('\\','/'),PressIcon:path.join(assets,key+'-press.gif').replaceAll('\\','/'),Label:label};
 }
 return result;
}
const colors={people:'#ffc857',replay:'#b69aff',scenes:'#57d4ff',cameras:'#56e4a0',audio:'#ff998a'};
const hk=(label,k,icon='info',color=colors.replay,big='')=>action(label,'system.hotkey',{Hotkey:k.replace('Comma',',').replace('Period','.')},icon,color,big);
const folder=(label,p,icon,color)=>action(label,'page.folder',{ProfileUUID:uid(p)},icon,color);
const launch=(label,file,icon='info',color=colors.people)=>action(label,'system.open',{Path:file},icon,color);
const url=(label,u)=>action(label,'system.website',{Url:u},'globe');
const slots=['1_0','2_0','3_0','4_0','0_1','1_1','2_1','3_1','4_1','0_2','1_2','2_2','4_2'];
const reserved=(await read(pagePath('main'))).Controllers.find(c=>c.Type==='Keypad').Actions['3_2'];
const pages=new Map();
async function page(name,actions){const a={'3_2':clone(reserved)};a['3_2'].ActionID=randomUUID();if(name!=='main')a['0_0']=await action('POWROT','page.back',{},'back','#8898ae');const positions=name==='main'?['0_0',...slots]:slots;if(actions.length>positions.length)throw new Error('Page overflow '+name);actions.forEach((v,i)=>a[positions[i]]=v);pages.set(name,{Controllers:[{Actions:{},Type:'Encoder'},{Actions:a,Type:'Keypad'}],Icon:'',Name:name});}

// Hidden, synchronous commands. Errors never claim a race was saved.
for(const cmd of ['start','stop','status','show-participant','hide-participant','show-sponsors','hide-sponsors']){
 const command=`"${process.execPath}" "${path.join(root,'tools/race-timer.mjs')}" ${cmd}`;
 const vbs=`Set shell = CreateObject("WScript.Shell")\r\nresult = shell.Run("${command.replaceAll('"','""')}", 0, True)\r\nIf result <> 0 Then\r\n MsgBox "Brak potwierdzenia komendy. Sprawdz STAN CZASU i panel. Po bledzie STOP nie ponawiaj w ciemno po zmianie zawodnika. Szczegoly w errors.log.", 48, "Carruleddhi"\r\nEnd If\r\n${cmd==='status'?`shell.Run "notepad.exe ""${path.join(timer,'status.txt')}""", 1, False\r\n`:''}`;
 await fs.writeFile(path.join(timer,cmd+'.vbs'),vbs);
}
const cmd=(label,c,i='info',color=colors.people)=>launch(label,path.join(timer,c+'.vbs'),i,color);
await page('people',[await cmd('START CZAS','start','timer','#56e4a0'),await cmd('STOP ZAPIS','stop','stop','#ff667f'),await cmd('STAN CZASU','status','info'),await url('PANEL EDYCJI','https://www.carruleddhishow.com/admin')]);
await page('replay',[await hk('ZLAP I ODTWORZ',replayKeys.Replay,'replay'),await hk('PAUZA / GRAJ',replayKeys.Pause,'pause'),await hk('OD POCZATKU',replayKeys.Restart,'replay'),await hk('WOLNIEJ',replayKeys.SlowerBy5,'info',colors.replay,'-5%'),await hk('SZYBCIEJ',replayKeys.FasterBy5,'info',colors.replay,'+5%'),await hk('SLOW MOTION',replayKeys.HalfSpeed,'info',colors.replay,'50%'),await hk('NORMALNIE',replayKeys.NormalSpeed,'info',colors.replay,'100%'),await hk('SZYBKO',replayKeys.DoubleSpeed,'info',colors.replay,'200%'),await hk('POPRZEDNI',replayKeys.Previous,'prev'),await hk('NASTEPNY',replayKeys.Next,'next'),await folder('EDYCJA KLIPU','edit','trim',colors.replay)]);
await page('edit',[await hk('KLATKA -1',replayKeys.PrevFrame,'prev'),await hk('KLATKA +1',replayKeys.NextFrame,'next'),await hk('OD TEGO MIEJSCA',replayKeys.TrimFront,'trim'),await hk('DO TEGO MIEJSCA',replayKeys.TrimEnd,'trim'),await hk('COFNIJ CIECIE',replayKeys.TrimReset,'replay'),await hk('ODWROC',replayKeys.Reverse,'replay'),await hk('DO PRZODU',replayKeys.Forward,'play'),await hk('PIERWSZY',replayKeys.First,'prev'),await hk('OSTATNI',replayKeys.Last,'next'),await hk('ZAPISZ KLIP',replayKeys.Save,'save')]);
const sceneLabels={LIVE:['NA ZYWO','camera'],REPLAY:['SCENA REPLAY','replay'],STARTING:['ZACZYNAMY','flag'],BREAK:['PRZERWA','coffee'],VOTING:['GLOSOWANIE','vote'],RESULTS:['WYNIKI','trophy'],STANDBY:['OCZEKIWANIE','pause'],ENDING:['ZAKONCZENIE','flag'],INTRO:['INTRO','play']}; const sceneButtons=[];for(const[n,k]of Object.entries(sceneKeys)){const[label,icon]=sceneLabels[n];sceneButtons.push(await hk(label,k,icon,colors.scenes));}
await page('scenes',sceneButtons);
await page('cameras',[await hk('PULPIT ON/OFF','Ctrl+Alt+Shift+F7','monitor',colors.cameras)]);
await page('audio',[await hk('MIKROFON MUTE','Ctrl+Alt+Shift+F1','audio',colors.audio),await hk('KOMPUTER MUTE','Ctrl+Alt+Shift+F2','speaker',colors.audio),await hk('REPLAY MUTE','Ctrl+Alt+Shift+F3','audio',colors.audio),await hk('MIKSER MUTE','Ctrl+Alt+Shift+F5','speaker',colors.audio)]);
await page('fx',[await hk('LOGO ON/OFF','Ctrl+Alt+Shift+F6','bolt'),await hk('ODSWIEZ OBS','Ctrl+Alt+F5','replay'),await cmd('POKAZ OSOBE','show-participant','eye'),await cmd('UKRYJ OSOBE','hide-participant','hide'),await cmd('SPONSOR ON','show-sponsors','eye'),await cmd('SPONSOR OFF','hide-sponsors','hide')]);
await page('effects',[await hk('KONFETTI','Ctrl+Shift+F8','confetti','#ffce66'),await hk('WSTAZKI','Ctrl+Shift+F9','ribbons','#b9a0ff'),await hk('GWIAZDKI','Ctrl+Shift+F10','sparkles','#74dfff'),await hk('EFEKTY OFF','Ctrl+Shift+F11','stop','#ff889f')]);
await page('main',[await folder('ZAWODNICY','people','people',colors.people),await folder('POWTORKI','replay','replay',colors.replay),await folder('SCENY','scenes','scenes',colors.scenes),await folder('KAMERY','cameras','camera',colors.cameras),await folder('AUDIO','audio','audio',colors.audio),await folder('GRAFIKI','fx','sliders',colors.people),await folder('EFEKTY','effects','sparkles','#c3a7ff'),await launch('INSTRUKCJA',path.join(root,'ULANZI-OBSLUGA.md'))]);
const unique=new Set();for(const e of entries){if(e.kind==='page.back')continue;const signature=e.kind+JSON.stringify(e.param);if(unique.has(signature))throw new Error('Duplicate function '+e.label);unique.add(signature);}
const pluginDir=path.join(process.env.APPDATA,'Ulanzi/UlanziDeck/Plugins/com.ulanzi.carruleddhi.ulanziPlugin');
try{await fs.cp(pluginDir,path.join(backup,'motion-plugin'),{recursive:true});}catch(error){if(error.code!=='ENOENT')throw error;}
await fs.cp(path.join(root,'tools/ulanzi-motion'),pluginDir,{recursive:true});
await fs.copyFile(path.join(assets,'GRAFIKI.png'),path.join(pluginDir,'icon.png'));
await write(path.join(pluginDir,'manifest.json'),{Name:'Carruleddhi Motion',Author:'Carruleddhi Show',Description:'OBS controls with animated press feedback',Version:'1.0.0',UUID:'com.ulanzi.ulanzistudio.carruleddhi',Type:'JavaScript',CodePath:'app.html',Icon:'icon.png',Category:'Carruleddhi',CategoryIcon:'icon.png',Actions:[{Name:'Sterowanie OBS',UUID:'com.ulanzi.ulanzistudio.carruleddhi.control',Icon:'icon.png',States:[{Name:'Default',Image:'icon.png'}],Controllers:['Keypad']}],OS:[{Platform:'windows',MinimumVersion:'10'}]});
for(const[name,data]of pages)await write(pagePath(name),data);
await write(sceneFile,obs);
await write(path.join(assets,'mapping.json'),{backup,sceneKeys,replayKeys,entries});
console.log(JSON.stringify({backup,assets,buttons:entries.length,profile,sceneFile},null,2));
