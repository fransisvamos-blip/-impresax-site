// PRIVATE SALE 06 — first-party 1200×630 social share image, generated at deploy.
import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
const input='public/opportunita/hero-lounge-scene-v1.jpg';
const output='public/opportunita/og-social-v6.jpg';
const WIDTH=1200,HEIGHT=630;
const original=await readFile(input);
const meta=await sharp(original).metadata();
if(meta.width<1000||meta.height<1000)throw Error('Missing first-party venue hero for OG');
const back=await sharp(original).resize(WIDTH,HEIGHT,{fit:'cover',position:'attention'}).png().toBuffer();
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs><linearGradient id="shade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#061319" stop-opacity=".99"/><stop offset=".38" stop-color="#061319" stop-opacity=".95"/><stop offset=".73" stop-color="#061319" stop-opacity=".37"/><stop offset="1" stop-color="#061319" stop-opacity=".08"/></linearGradient><linearGradient id="bottom" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="#061319" stop-opacity="0"/><stop offset="1" stop-color="#061319" stop-opacity=".85"/></linearGradient></defs>
<rect width="1200" height="630" fill="url(#shade)"/><rect width="1200" height="630" fill="url(#bottom)"/>
<path d="M63 69 l9 -24" stroke="#e9884a" stroke-width="9" stroke-linecap="round"/>
<text x="92" y="66" font-family="DejaVu Sans,sans-serif" font-size="17" font-weight="800" letter-spacing="1" fill="#ffffff">OPPORTUNITÀ IMPRENDITORIALE</text>
<rect x="64" y="117" width="40" height="3" fill="#e9884a"/>
<text x="119" y="123" font-family="DejaVu Sans,sans-serif" font-size="18" font-weight="700" letter-spacing="2.4" fill="#f7e9dc">CATANZARO LIDO</text>
<text x="62" y="248" font-family="DejaVu Sans,sans-serif" font-size="69" font-weight="800" letter-spacing="-3.8" fill="#fffaf2">LOUNGE BAR</text>
<text x="62" y="346" font-family="DejaVu Sans,sans-serif" font-size="88" font-weight="800" letter-spacing="-4.2" fill="#f09b62">IN VENDITA.</text>
<rect x="63" y="382" width="485" height="1" fill="#c1a08d" opacity=".7"/>
<text x="64" y="428" font-family="DejaVu Sans,sans-serif" font-size="20" font-weight="700" fill="#fff9f1">7 ANNI DI ATTIVITÀ</text>
<text x="64" y="464" font-family="DejaVu Sans,sans-serif" font-size="19" fill="#f3e6d8">Clientela fidelizzata · Piazza con tavolini</text>
<rect x="62" y="505" width="365" height="53" rx="4" fill="#bf5122"/>
<text x="88" y="539" font-family="DejaVu Sans,sans-serif" font-size="18" font-weight="800" fill="#ffffff">DETTAGLI RISERVATI</text>
<text x="1176" y="608" text-anchor="end" font-family="DejaVu Sans,sans-serif" font-size="12" font-weight="500" fill="#ffffff">Immagine del locale rielaborata digitalmente</text>
</svg>`;
const file=await sharp(back).composite([{input:Buffer.from(svg)}]).jpeg({quality:87,mozjpeg:true,progressive:true}).toBuffer();
const result=await sharp(file).metadata();
if(result.width!==1200||result.height!==630||file.length<18000)throw Error('Invalid OG image');
await writeFile(output,file);
console.log('PRIVATE SALE 06 social image generated',output,result.width,result.height,file.length);
