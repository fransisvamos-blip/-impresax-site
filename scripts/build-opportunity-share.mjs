// PRIVATE SALE 06.1 — vibrant, first-party WhatsApp cover from the actual venue-derived photograph.
import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
const W=1200,H=630;
const raw=await readFile('public/opportunita/hero-lounge-scene-v1.jpg');
const source=await sharp(raw).metadata();
if(source.width<1000||source.height<1000)throw Error('First-party venue photograph is unavailable');
const photo=await sharp(raw).resize(650,H,{fit:'cover',position:sharp.strategy.attention})
 .modulate({saturation:1.1,brightness:1.045}).jpeg({quality:92}).toBuffer();
const background=await sharp({create:{width:W,height:H,channels:4,background:'#fffaf4'}})
 .composite([{input:photo,left:550,top:0}]).png().toBuffer();
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs>
 <linearGradient id="transition"><stop offset="0" stop-color="#fffaf4"/><stop offset=".7" stop-color="#fffaf4" stop-opacity=".75"/><stop offset="1" stop-color="#fffaf4" stop-opacity="0"/></linearGradient>
 <linearGradient id="photofoot" x1="0" x2="0" y1="0" y2="1"><stop offset=".35" stop-color="#092434" stop-opacity="0"/><stop offset="1" stop-color="#092434" stop-opacity=".88"/></linearGradient>
</defs>
<rect x="535" width="205" height="630" fill="url(#transition)"/>
<rect x="550" y="480" width="650" height="150" fill="url(#photofoot)"/>
<rect x="52" y="48" width="8" height="39" rx="2" fill="#ef682d" transform="skewX(-13)"/>
<text x="76" y="65" fill="#103148" font-family="DejaVu Sans,sans-serif" font-weight="800" font-size="17" letter-spacing=".3">OPPORTUNITÀ IMPRENDITORIALE</text>
<rect x="54" y="132" width="34" height="3" fill="#ef682d"/>
<text x="102" y="139" fill="#456274" font-family="DejaVu Sans,sans-serif" font-weight="700" font-size="16" letter-spacing="2">CATANZARO LIDO</text>
<text x="49" y="258" fill="#103148" font-family="DejaVu Sans,sans-serif" font-weight="800" font-size="68" letter-spacing="-3">LOUNGE BAR</text>
<text x="49" y="342" fill="#d64b16" font-family="DejaVu Sans,sans-serif" font-weight="800" font-size="74" letter-spacing="-3.5">IN VENDITA.</text>
<path d="M54 379H514" stroke="#d1dfe3" stroke-width="2"/>
<text x="55" y="421" fill="#24495a" font-family="DejaVu Sans,sans-serif" font-weight="700" font-size="19">7 ANNI DI ATTIVITÀ</text>
<text x="55" y="457" fill="#42616f" font-family="DejaVu Sans,sans-serif" font-size="17">Clientela fidelizzata</text>
<text x="55" y="484" fill="#42616f" font-family="DejaVu Sans,sans-serif" font-size="17">Piazza con tavolini</text>
<rect x="54" y="529" width="356" height="56" rx="7" fill="#cb4610"/>
<text x="73" y="564" fill="#fff" font-family="DejaVu Sans,sans-serif" font-weight="800" font-size="18" letter-spacing=".4">INFORMAZIONI RISERVATE</text>
<text x="1175" y="601" text-anchor="end" fill="#fff" font-family="DejaVu Sans,sans-serif" font-weight="600" font-size="11">Immagine del locale rielaborata digitalmente</text>
</svg>`;
const jpeg=await sharp(background).composite([{input:Buffer.from(svg)}]).jpeg({quality:91,mozjpeg:true,progressive:true}).toBuffer();
const meta=await sharp(jpeg).metadata();
if(meta.width!==W||meta.height!==H||meta.format!=='jpeg'||jpeg.length<25000)throw Error('WhatsApp card invalid');
await writeFile('public/opportunita/og-social-v7.jpg',jpeg);
// Preserve the old URL for WhatsApp caches and previously shared conversations.
await writeFile('public/opportunita/og-social-v6.jpg',jpeg);
console.log('Private Sale premium share artwork generated: 1200x630',jpeg.length,'bytes');
