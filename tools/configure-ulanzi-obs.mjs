// Local, reversible setup for this production PC. Close OBS and Ulanzi first.
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const profile = path.join(process.env.APPDATA, 'Ulanzi/UlanziDeck/ProfilesV2/4a6f21f3-623f-4339-959b-24a4c94fb1e0.ulanziProfile');
const sceneFile = path.join(process.env.APPDATA, 'obs-studio/basic/scenes/Bez_tytułu.json');
const local = path.join(process.env.LOCALAPPDATA, 'Carruleddhi');
const assets = path.join(local, 'deck-assets');
const timer = path.join(local, 'race-timer');
const read = async p => JSON.parse(await fs.readFile(p, 'utf8'));
const write = async (p, d) => { await fs.mkdir(path.dirname(p), {recursive:true}); await fs.writeFile(p, JSON.stringify(d,null,2)); };
const clone = o => structuredClone(o);
const uid = name => ({main:'75641c7d-956d-48dd-957b-b79bd381da85',replay:'3987111c-0a0b-4efa-bae7-e1ba9a89e92a',scenes:'e26771c1-b181-4097-af8d-c8b817ddac8f',cameras:'c6379f0f-8932-47fc-8c23-b6e66de3d849',fx:'83eb6ad9-355e-4bd1-8457-3b1b890209db',audio:'b8d2ae43-8920-4815-a1dc-3f55bea5ce9b',people:'79fc426e-58e7-4633-9cb2-588596125b72',edit:'47d28f65-1f4b-4dd6-b79c-525d45e44711'}[name]);
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
for(const[s,k]of [[obs.AuxAudioDevice1,'Ctrl+Alt+Shift+F1'],[obs.DesktopAudioDevice1,'Ctrl+Alt+Shift+F2'],[replay,'Ctrl+Alt+Shift+F3'],[source('STARTING_LOOP'),'Ctrl+Alt+Shift+F4'],[source('MIXER_PROGRAM'),'Ctrl+Alt+Shift+F5']]){hot(s,'libobs.mute',k);hot(s,'libobs.unmute',k);}

// Fill only empty presentation scenes; never replace existing compositions.
const template=source('ZAWODNIK');
const itemTemplate=source('LIVE').settings.items[0];
const cards={BREAK:['Una piccola pausa','Torniamo tra poco'],VOTING:['Vota il tuo preferito','Scansiona il QR code • carruleddhishow.com'],RESULTS:['Risultati in arrivo','La classifica ufficiale sarà annunciata qui'],STANDBY:['Ci siamo quasi','La diretta riprende tra poco'],ENDING:['Grazie a tutti!','Ci vediamo alla prossima discesa']};
const xml=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
for(const[n,[title,subtitle]]of Object.entries(cards)){
 const scene=source(n);if(scene.settings.items.length)continue;
 const html=`<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#0b111c;color:#fff;font-family:Arial,sans-serif;display:grid;place-content:center;text-align:center}body:before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 80% 0%,#ffbf2430,transparent 65%);border:28px solid #ffffff08}small{color:#ffca55;letter-spacing:12px;font-size:26px}h1{font-size:108px;letter-spacing:-4px;margin:38px 0 24px}p{font-size:34px;color:#c5cbd6}.line{width:150px;height:8px;background:#ffca55;margin:0 auto 45px}</style><small>CARRULEDDHI SHOW · 2026</small><h1>${xml(title)}</h1><div class="line"></div><p>${xml(subtitle)}</p>`;
 const file=path.join(assets,n+'.html');await fs.writeFile(file,html);
 const s=clone(template);Object.assign(s,{name:'CARRULEDDHI '+n,uuid:randomUUID(),settings:{is_local_file:true,local_file:file.replaceAll('\\','/'),width:1920,height:1080},hotkeys:{}});obs.sources.push(s);
 const item=clone(itemTemplate);Object.assign(item,{name:s.name,source_uuid:s.uuid,id:1});scene.settings.items=[item];scene.settings.id_counter=1;
 if(n==='VOTING'){const qr=clone(source('STARTING').settings.items.find(i=>i.name==='QR CODE'));if(qr){qr.id=2;scene.settings.items.push(qr);scene.settings.id_counter=2;}}
}
if(!source('INTRO').settings.items.length){const item=clone(itemTemplate),s=source('STARTING_LOOP');Object.assign(item,{name:s.name,source_uuid:s.uuid,id:1});source('INTRO').settings.items=[item];source('INTRO').settings.id_counter=1;}

// Bespoke vector masters and small looping GIFs. Labels never move.
const paths={people:'<circle cx="72" cy="42" r="14"/><path d="M44 88v-9c0-25 56-25 56 0v9"/>',replay:'<path d="M40 40a38 38 0 1 1-4 46M40 40v25H17"/><path d="m65 46 27 18-27 18z"/>',scenes:'<rect x="30" y="29" width="84" height="62" rx="8"/><path d="M30 49h84M49 29l14 20M77 29l14 20"/>',camera:'<rect x="25" y="36" width="64" height="52" rx="8"/><path d="m89 51 28-14v49L89 73"/>',audio:'<rect x="60" y="23" width="24" height="47" rx="12"/><path d="M45 59a27 27 0 0 0 54 0M72 86v16M56 102h32"/>',play:'<path d="m48 28 57 36-57 36z"/>',stop:'<rect x="43" y="34" width="58" height="58" rx="7"/>',pause:'<path d="M55 31v63M89 31v63"/>',back:'<path d="m63 30-32 32 32 32M33 62h80"/>',eye:'<path d="M20 63s18-28 52-28 52 28 52 28-18 28-52 28-52-28-52-28z"/><circle cx="72" cy="63" r="13"/>',hide:'<path d="M20 63s18-28 52-28 52 28 52 28-18 28-52 28-52-28-52-28zM30 22l84 84"/>',info:'<circle cx="72" cy="61" r="37"/><path d="M72 55v28M72 38v2"/>',globe:'<circle cx="72" cy="61" r="38"/><ellipse cx="72" cy="61" rx="17" ry="38"/><path d="M34 61h76"/>',bolt:'<path d="m78 20-40 48h29l-1 34 40-48H77z"/>',save:'<path d="M35 23h65l11 11v67H35zM50 23v29h44V23M51 101V72h44v29"/>',next:'<path d="m39 29 48 33-48 33zM103 29v66"/>',prev:'<path d="m105 29-48 33 48 33zM41 29v66"/>',trim:'<path d="M43 22v67h65M22 45h65v66"/>',home:'<path d="m22 59 50-38 50 38M38 51v51h68V51M62 102V74h20v28"/>'};
Object.assign(paths,{
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
  const words=label.split(' '),lines=label.length>11&&words.length>1?[words.slice(0,Math.ceil(words.length/2)).join(' '),words.slice(Math.ceil(words.length/2)).join(' ')]:[label];
  const frame=n=>{const phase=n/24*Math.PI*2,glow=.55+.2*Math.sin(phase),scale=1+.025*Math.sin(phase);return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#172230"/><stop offset="1" stop-color="#080e17"/></linearGradient></defs><rect width="144" height="144" rx="18" fill="url(#bg)"/><rect x="4" y="4" width="136" height="136" rx="15" fill="none" stroke="${color}" stroke-opacity=".25" stroke-width="2"/><rect x="4" y="4" width="136" height="136" rx="15" fill="none" stroke="${color}" stroke-opacity="${glow}" stroke-width="2" stroke-dasharray="75 447" stroke-dashoffset="${-n*522/24}"/><g transform="translate(72 56) scale(${scale}) translate(-72 -62)">${big?`<text x="72" y="81" text-anchor="middle" fill="${color}" font-family="Arial" font-size="44" font-weight="bold">${xml(big)}</text>`:`<g fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">${paths[icon]}</g>`}</g>${lines.map((line,i)=>`<text x="72" y="${lines.length===1?125:113+i*16}" text-anchor="middle" fill="#f6f8fc" font-family="Arial" font-size="${line.length>12?11:13}" font-weight="bold">${xml(line)}</text>`).join('')}</svg>`;};
  await fs.writeFile(path.join(assets,key+'.svg'),frame(0));
  const frames=[];for(let n=0;n<24;n++)frames.push(await sharp(Buffer.from(frame(n))).ensureAlpha().raw().toBuffer());
  await sharp(frames[0],{raw:{width:144,height:144,channels:4}}).png().toFile(path.join(assets,key+'.png'));
  await sharp(Buffer.concat(frames),{raw:{width:144,height:144*24,channels:4,pageHeight:144}}).gif({loop:0,delay:90,colours:64,dither:0}).toFile(path.join(assets,key+'.gif'));
  generated.set(key,true);
 }
 const family=kind.startsWith('page.')?'page':'system';entries.push({label,kind,param,icon:key+'.gif'});
 return {Action:'com.ulanzi.ulanzideck.'+kind,ActionID:randomUUID(),ActionParam:param,LinkedTitle:true,Name:label,Plugin:{Name:family==='page'?'Pages':'System',UUID:'com.ulanzi.deck.'+family,Version:'1.0'},ViewParam:[{Icon:path.join(assets,key+'.gif').replaceAll('\\','/'),IconRel:'',Text:''}]};
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
await page('audio',[await hk('MIKROFON MUTE','Ctrl+Alt+Shift+F1','audio',colors.audio),await hk('KOMPUTER MUTE','Ctrl+Alt+Shift+F2','speaker',colors.audio),await hk('REPLAY MUTE','Ctrl+Alt+Shift+F3','audio',colors.audio),await hk('INTRO MUTE','Ctrl+Alt+Shift+F4','audio',colors.audio),await hk('MIKSER MUTE','Ctrl+Alt+Shift+F5','speaker',colors.audio)]);
await page('fx',[await hk('LOGO ON/OFF','Ctrl+Alt+Shift+F6','bolt'),await hk('ODSWIEZ OBS','Ctrl+Alt+F5','replay'),await cmd('POKAZ OSOBE','show-participant','eye'),await cmd('UKRYJ OSOBE','hide-participant','hide'),await cmd('SPONSOR ON','show-sponsors','eye'),await cmd('SPONSOR OFF','hide-sponsors','hide')]);
await page('main',[await folder('ZAWODNICY','people','people',colors.people),await folder('POWTORKI','replay','replay',colors.replay),await folder('SCENY','scenes','scenes',colors.scenes),await folder('KAMERY','cameras','camera',colors.cameras),await folder('AUDIO','audio','audio',colors.audio),await folder('GRAFIKI','fx','bolt',colors.people),await launch('INSTRUKCJA',path.join(root,'ULANZI-OBSLUGA.md'))]);
const unique=new Set();for(const e of entries){if(e.kind==='page.back')continue;const signature=e.kind+JSON.stringify(e.param);if(unique.has(signature))throw new Error('Duplicate function '+e.label);unique.add(signature);}
for(const[name,data]of pages)await write(pagePath(name),data);
await write(sceneFile,obs);
await write(path.join(assets,'mapping.json'),{backup,sceneKeys,replayKeys,entries});
console.log(JSON.stringify({backup,assets,buttons:entries.length,profile,sceneFile},null,2));
