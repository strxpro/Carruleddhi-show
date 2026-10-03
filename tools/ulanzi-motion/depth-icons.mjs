import sharp from 'sharp';
import fs from 'node:fs/promises';

// A perspective projection of the existing artwork, with fixed readable labels.
// This is a 2.5D animation; it does not invent unseen sides of the pictogram.
export async function depthIcon(png, idlePath, pressPath) {
 const input=await fs.readFile(png);
 const bitmap='data:image/png;base64,'+input.toString('base64');
 const label=await sharp(input).extract({left:0,top:108,width:144,height:36}).png().toBuffer();
 const caption='data:image/png;base64,'+label.toString('base64');
 const frame=(i,press)=>{
  const t=i/(press?16:40),angle=Math.sin(2*Math.PI*t)*.30;
  const zoom=press?Math.max(.08,1-Math.pow(t,.65)):1;
  let shapes='';
  for(let z=9;z>=0;z--){
   const q=press?((z/10+t*1.4)%1):z/10;
   const size=10+q*q*126;
   shapes+=`<rect x="${72-size/2}" y="${54-size*.36}" width="${size}" height="${size*.72}" rx="${size*.12}" fill="none" stroke="${z%2?'#806cda':'#77d8ed'}" stroke-opacity="${press?.15+.65*q:.06+.10*q}" stroke-width="${press?1.7:1}"/>`;
  }
  // Piecewise perspective sampling keeps the whole symbol, not just a flat scale.
  for(let n=0;n<36;n++){
   const sx=n*4,center=sx+2-72,depth=center*Math.sin(angle),perspective=310/(310+depth);
   const project=value=>72+value*Math.cos(angle)*310/(310+value*Math.sin(angle))*zoom;
   const left=project(sx-72),right=project(sx+4-72);
   const x=(left+right)/2;
   const width=right-left+.55,height=108*perspective*zoom;
   const y=54-height/2;
   shapes+=`<svg x="${x-width/2+Math.sin(angle)*7}" y="${y+3}" width="${width}" height="${height}" viewBox="${sx} 0 4 108" preserveAspectRatio="none" opacity="${press?Math.max(0,1-t*1.15):1}"><image href="${bitmap}" width="144" height="144"/></svg>`;
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="144" height="144"><defs><radialGradient id="bg"><stop stop-color="#25374d"/><stop offset="1" stop-color="#070912"/></radialGradient></defs><rect width="144" height="144" rx="18" fill="url(#bg)"/>${shapes}<image href="${caption}" x="0" y="108" width="144" height="36"/><rect x="1" y="1" width="142" height="142" rx="18" stroke="#8f9fb8" stroke-opacity=".3" fill="none"/></svg>`);
 };
 for(const [press,out,count,delay]of [[false,idlePath,40,60],[true,pressPath,16,40]]){
  const frames=[];for(let i=0;i<count;i++)frames.push(await sharp(frame(i,press)).ensureAlpha().raw().toBuffer());
  await sharp(Buffer.concat(frames),{raw:{width:144,height:144*count,channels:4,pageHeight:144}}).gif({loop:0,delay:Array(count).fill(delay),colours:128,dither:0}).toFile(out);
 }
}
