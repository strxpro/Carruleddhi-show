import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const escape = value => value.replaceAll('&','&amp;').replaceAll('<','&lt;');
export async function renderMotionIcon(directory, key, label, symbol, color, big='') {
  const words=label.split(' ');
  const lines=label.length>11&&words.length>1
    ? [words.slice(0,Math.ceil(words.length/2)).join(' '),words.slice(Math.ceil(words.length/2)).join(' ')] : [label];
  function frame(index, pressed=false) {
    const t=index/(pressed?16:40), pulse=(1-Math.cos(t*Math.PI*2))/2;
    const spring=pressed ? 1-.105*Math.exp(-5*t)*Math.cos(11*t) : 1+.012*Math.sin(t*Math.PI*2);
    const gleam=pressed?.3*Math.exp(-4*t):.04+.04*pulse;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144">
      <defs>
        <linearGradient id="glass" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#273344"/><stop offset=".45" stop-color="#151d29"/><stop offset="1" stop-color="#090f19"/></linearGradient>
        <linearGradient id="rim" x2=".8" y2="1"><stop stop-color="#d9e7ff" stop-opacity=".45"/><stop offset=".45" stop-color="#778baa" stop-opacity=".08"/><stop offset="1" stop-color="${color}" stop-opacity=".35"/></linearGradient>
        <linearGradient id="ink" gradientUnits="userSpaceOnUse" x1="25" y1="20" x2="110" y2="100"><stop stop-color="#f2f7ff"/><stop offset=".3" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity=".85"/></linearGradient>
        <radialGradient id="halo"><stop stop-color="${color}" stop-opacity="${gleam+.12}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>
        <clipPath id="clip"><rect x="3" y="3" width="138" height="138" rx="25"/></clipPath>
      </defs>
      <rect width="144" height="144" rx="26" fill="#070b12"/>
      <rect x="3" y="3" width="138" height="138" rx="25" fill="url(#glass)"/>
      <g clip-path="url(#clip)"><ellipse cx="${45+54*pulse}" cy="35" rx="89" ry="66" fill="url(#halo)"/>
      <path d="M-10 18Q55 ${13+8*pulse} 153 3" stroke="#fff" stroke-opacity=".06" stroke-width="22" fill="none"/>
      ${pressed?`<circle cx="72" cy="57" r="${18+t*82}" fill="none" stroke="${color}" stroke-opacity="${.5*(1-t)}" stroke-width="2"/>`:''}</g>
      <rect x="3.5" y="3.5" width="137" height="137" rx="24" stroke="url(#rim)" fill="none"/>
      <g transform="translate(72 54) scale(${spring*.84}) translate(-72 -61)" fill="none" stroke="url(#ink)" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round">
        ${big?`<text x="72" y="80" text-anchor="middle" fill="url(#ink)" stroke="none" font-family="Segoe UI,Arial" font-size="43" font-weight="700">${escape(big)}</text>`:symbol}
      </g>
      <rect x="61" y="96" width="22" height="2" rx="1" fill="${color}" opacity="${.45+.25*pulse}"/>
      ${lines.map((line,i)=>`<text x="72" y="${lines.length===1?121:113+i*15}" text-anchor="middle" fill="#f4f7ff" font-family="Segoe UI,Arial" font-size="${line.length>12?10.5:12}" font-weight="600" letter-spacing=".15">${escape(line)}</text>`).join('')}
    </svg>`;
  }
  const normal=[],pressed=[];
  for(let i=0;i<40;i++)normal.push(await sharp(Buffer.from(frame(i))).ensureAlpha().raw().toBuffer());
  for(let i=0;i<16;i++)pressed.push(await sharp(Buffer.from(frame(i,true))).ensureAlpha().raw().toBuffer());
  const gif=async(frames,name,delay)=>sharp(Buffer.concat(frames),{raw:{width:144,height:144*frames.length,channels:4,pageHeight:144}}).gif({loop:0,delay,colours:96,dither:0}).toFile(path.join(directory,name));
  await gif(normal,key+'.gif',60);
  await gif(pressed,key+'-press.gif',40);
  await sharp(normal[0],{raw:{width:144,height:144,channels:4}}).png().toFile(path.join(directory,key+'.png'));
  await fs.writeFile(path.join(directory,key+'.svg'),frame(0));
}
