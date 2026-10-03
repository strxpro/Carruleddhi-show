// Read-only validation of the media installed on the production PC.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const profiles=path.join(process.env.APPDATA,'Ulanzi/UlanziDeck/ProfilesV2/4a6f21f3-623f-4339-959b-24a4c94fb1e0.ulanziProfile/Profiles');
let count=0;
for(const page of await fs.readdir(profiles)){
 const dir=path.join(profiles,page);let data;try{data=JSON.parse(await fs.readFile(path.join(dir,'manifest.json')));}catch{continue;}
 for(const c of data.Controllers)for(const action of Object.values(c.Actions)){
  if(action.Action.endsWith('.smallwindow.window'))continue;
  assert(!action.Action.startsWith('com.ulanzi.ulanzistudio.carruleddhi'),'Custom motion actions must not return');
  const view=action.ViewParam?.[0];assert(view?.Icon?.endsWith('.png'));
  assert.equal(path.resolve(dir,view.IconRel),path.resolve(view.Icon));
  const meta=await sharp(view.Icon).metadata();
  assert.equal(meta.width,144);assert.equal(meta.height,144);assert(!meta.pages||meta.pages===1);
  if(action.Action.endsWith('.system.hotkey'))assert(action.ActionParam.Hotkey);
  if(action.Action.endsWith('.page.folder'))await fs.access(path.join(profiles,action.ActionParam.ProfileUUID,'manifest.json'));
  count++;
 }
}
const sounds=path.join(process.env.LOCALAPPDATA,'Carruleddhi/deck-assets/sounds');
for(const name of ['whoosh','impact','victory','countdown','chime']){
 const wav=await fs.readFile(path.join(sounds,name+'.wav'));
 assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.readUInt32LE(24),48000);
 assert.equal(wav.readUInt32LE(40),wav.length-44);
 let peak=0,energy=0;for(let i=44;i<wav.length;i+=2){const sample=wav.readInt16LE(i);peak=Math.max(peak,Math.abs(sample));energy+=sample*sample;}
 assert(peak>1000&&peak<32767);assert(energy>1e6);
}
const obs=JSON.parse(await fs.readFile(path.join(process.env.APPDATA,'obs-studio/basic/scenes/Bez_tytułu.json')));
const sfx=obs.sources.find(s=>s.name==='SFX CARRULEDDHI');assert(sfx);assert.equal(sfx.monitoring_type,1);assert.equal(sfx.mixers,0);
assert.equal(obs.sources.find(s=>s.name==='MASTER_EFFECTS').settings.items.filter(i=>i.source_uuid===sfx.uuid).length,1);
console.log(`PASS ${count} static labelled icons, native actions, relative paths and folder targets; five valid WAVs and single SFX route`);
