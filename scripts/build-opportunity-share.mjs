// WhatsApp/OG cover — matches the owner's APPROVED original V3.9 landing design.
// First-party JPEG generated during the one-time deploy; no paid image APIs.
import fs from 'node:fs/promises';
import sharp from 'sharp';

const WIDTH=1200,HEIGHT=630;
const output='public/opportunita/og-social-v5.jpg';
// The SAME illustrative Unsplash photograph already used in the approved site's hero.
const photoUrl='https://images.unsplash.com/photo-1767878032664-cd1d61f0e076?auto=format&fit=crop&w=1600&q=88';
let background;
try{
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),18000);
  let response;
  try{response=await fetch(photoUrl,{signal:controller.signal});}
  finally{clearTimeout(timeout);}
  if(!response.ok)throw Error('Photograph HTTP '+response.status);
  const photo=Buffer.from(await response.arrayBuffer());
  const cropped=await sharp(photo).resize(740,630,{fit:'cover',position:'centre'}).jpeg({quality:88}).toBuffer();
  background=await sharp({create:{width:WIDTH,height:HEIGHT,channels:4,background:'#fbfaf8'}})
    .composite([{input:cropped,left:460,top:0}]).png().toBuffer();
}catch(e){
  console.warn('Unsplash unavailable; rendering restrained brand fallback:',String(e));
  background=await sharp({create:{width:WIDTH,height:HEIGHT,channels:4,background:'#fbfaf8'}}).png().toBuffer();
}
const overlay=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs>
 <linearGradient id="bleed" x1="0" x2="1" y1="0" y2="0"><stop stop-color="#fbfaf8" stop-opacity="1"/><stop offset=".47" stop-color="#fbfaf8" stop-opacity="1"/><stop offset=".72" stop-color="#fbfaf8" stop-opacity=".18"/><stop offset="1" stop-color="#fbfaf8" stop-opacity="0"/></linearGradient>
 <linearGradient id="shadow" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#102c41" stop-opacity="0"/><stop offset="1" stop-color="#102c41" stop-opacity=".75"/></linearGradient>
</defs>
<rect width="1200" height="630" fill="url(#bleed)"/>
<rect x="0" y="0" width="8" height="630" fill="#f26520"/>
<rect x="54" y="52" width="40" height="3" rx="1" fill="#f26520"/>
<text x="110" y="60" font-family="DejaVu Sans,sans-serif" font-weight="800" font-size="17" letter-spacing="2.7" fill="#173c51">OPPORTUNITÀ RISERVATA</text>
<text x="55" y="225" font-family="DejaVu Sans,sans-serif" font-weight="800" font-size="61" letter-spacing="-3" fill="#102c41">LOUNGE BAR A</text>
<text x="55" y="302" font-family="DejaVu Sans,sans-serif" font-weight="800" font-size="51" letter-spacing="-3" fill="#102c41">CATANZARO LIDO.</text>
<rect x="56" y="338" width="385" height="55" rx="3" fill="#f26520"/>
<text x="76" y="374" font-family="DejaVu Sans,sans-serif" font-weight="800" font-size="20" letter-spacing=".5" fill="#ffffff">CESSIONE O GESTIONE.</text>
<text x="57" y="449" font-family="DejaVu Sans,sans-serif" font-weight="600" font-size="21" fill="#2d4755">Un’attività avviata. Due possibilità.</text>
<text x="57" y="482" font-family="DejaVu Sans,sans-serif" font-size="18" fill="#496274">Primo confronto riservato, senza impegno.</text>
<path d="M57 517H598" stroke="#e2d8cd" stroke-width="2"/>
<text x="57" y="550" font-family="DejaVu Sans,sans-serif" font-weight="700" letter-spacing=".4" font-size="15" fill="#102c41">7 ANNI DI ATTIVITÀ*</text>
<text x="57" y="576" font-family="DejaVu Sans,sans-serif" font-size="12" fill="#6a7a81">*Secondo quanto dichiarato dai titolari</text>
<rect x="755" y="542" width="445" height="88" fill="url(#shadow)"/>
<text x="1177" y="599" text-anchor="end" font-family="DejaVu Sans,sans-serif" font-weight="600" font-size="12" fill="#ffffff">FOTO ILLUSTRATIVA · NON È IL LOCALE</text>
</svg>`;
const jpeg=await sharp(background).composite([{input:Buffer.from(overlay)}]).jpeg({quality:90,mozjpeg:true,progressive:true}).toBuffer();
const meta=await sharp(jpeg).metadata();
if(meta.width!==1200||meta.height!==630||meta.format!=='jpeg'||jpeg.length<10000)throw Error('OG image validation failed');
await fs.writeFile(output,jpeg);
console.log('Approved V3.9 branded OG ready',output,meta.width,meta.height,jpeg.length);
