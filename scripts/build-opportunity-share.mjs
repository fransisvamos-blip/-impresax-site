// PRIVATE SALE 10 — first-party cyan Variant 1 WhatsApp social artwork; no invented venue imagery.
import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
const WIDTH=1200,HEIGHT=630;
const raw=await readFile('public/opportunita/hero-lounge-scene-v1.jpg');
const source=await sharp(raw).metadata();
if(source.width<1000||source.height<1000)throw Error('Venue-derived first-party photo missing');
const photo=await sharp(raw).resize(WIDTH,HEIGHT,{fit:'cover',position:'attention'})
 .modulate({saturation:1.20,brightness:1.08}).png().toBuffer();
const svg=[
 '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">',
 '<defs>',
 '<linearGradient id="shade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#041521" stop-opacity=".99"/><stop offset=".25" stop-color="#041521" stop-opacity=".96"/><stop offset=".52" stop-color="#041521" stop-opacity=".83"/><stop offset=".85" stop-color="#041521" stop-opacity=".19"/><stop offset="1" stop-color="#041521" stop-opacity=".08"/></linearGradient>',
 '<linearGradient id="foot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#061b28" stop-opacity="0"/><stop offset="1" stop-color="#061b28" stop-opacity=".98"/></linearGradient>',
 '<linearGradient id="cyan" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#65eff1"/><stop offset=".53" stop-color="#11d7dd"/><stop offset="1" stop-color="#00abb9"/></linearGradient>',
 '</defs>',
 '<rect width="1200" height="630" fill="url(#shade)"/>',
 '<rect width="1200" height="630" fill="url(#foot)"/>',
 '<path d="M64 53h7l-20 42h-7zM80 53h7l-20 42h-7z" fill="#08dadd"/>',
 '<text x="101" y="68" font-family="DejaVu Sans,sans-serif" font-size="19" font-weight="700" fill="#ffffff">OPPORTUNITÀ</text>',
 '<text x="101" y="90" font-family="DejaVu Sans,sans-serif" font-size="19" font-weight="700" fill="#ffffff">IMPRENDITORIALE</text>',
 '<rect x="63" y="151" width="43" height="2" fill="#08dadd"/>',
 '<text x="120" y="159" font-family="DejaVu Sans,sans-serif" font-size="18" font-weight="700" letter-spacing="4" fill="#e1faff">CATANZARO LIDO</text>',
 '<rect x="366" y="151" width="43" height="2" fill="#08dadd"/>',
 '<text x="55" y="301" font-family="DejaVu Sans,sans-serif" font-size="100" font-weight="700" letter-spacing="-5" fill="#ffffff">CEDESI</text>',
 '<text x="55" y="405" font-family="DejaVu Sans,sans-serif" font-size="97" font-weight="700" letter-spacing="-6" fill="url(#cyan)">LOUNGE BAR</text>',
 '<text x="65" y="462" font-family="DejaVu Sans,sans-serif" font-size="20" font-weight="700" fill="#ecf9fc">VENDITA O GESTIONE</text>',
 '<rect x="63" y="490" width="410" height="63" rx="27" fill="#0bd5d9" stroke="#64eced" stroke-width="2"/>',
 '<text x="92" y="528" font-family="DejaVu Sans,sans-serif" font-size="18" font-weight="700" letter-spacing=".6" fill="#06263a">RICHIEDI DETTAGLI RISERVATI</text>',
 '<rect x="0" y="584" width="1200" height="46" fill="#041b2c" fill-opacity=".83"/>',
 '<path d="M60 600h1059" stroke="#05d1da" stroke-width="1" stroke-opacity=".5"/>',
 '<text x="63" y="621" font-family="DejaVu Sans,sans-serif" font-size="12" fill="#e1f7f9">7 ANNI DI ATTIVITÀ · CLIENTELA FIDELIZZATA · PIAZZA CON TAVOLINI</text>',
 '<text x="1178" y="621" text-anchor="end" font-family="DejaVu Sans,sans-serif" font-size="10" fill="#c5e6e9">Foto rielaborata digitalmente</text>',
 '</svg>'
].join('');
const jpg=await sharp(photo).composite([{input:Buffer.from(svg)}]).jpeg({quality:89,mozjpeg:true,progressive:true}).toBuffer();
const m=await sharp(jpg).metadata();
if(m.width!==WIDTH||m.height!==HEIGHT||m.format!=='jpeg'||jpg.length<26000)throw Error('Invalid 1200×630 social JPG');
await writeFile('public/opportunita/og-social-v10.jpg',jpg);
console.log('First-party 1200x630 cyan Variant 1 share image ready',jpg.length);
