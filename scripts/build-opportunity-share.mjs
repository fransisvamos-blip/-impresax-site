// Dedicated, versioned Open Graph image for the confidential Catanzaro Lido opportunity.
// Runs only during explicitly requested one-time release; no paid image API.
import fs from 'node:fs/promises';
import sharp from 'sharp';

const size={width:1200,height:630};
const output='public/opportunita/og-social-v4.jpg';
const url='https://images.unsplash.com/photo-1767878032664-cd1d61f0e076?auto=format&fit=crop&w=1600&q=88';
let background;
try{
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),20000);
  const response=await fetch(url,{signal:controller.signal});
  clearTimeout(timeout);
  if(!response.ok) throw new Error('photo HTTP '+response.status);
  const photo=Buffer.from(await response.arrayBuffer());
  background=await sharp(photo).resize(size.width,size.height,{fit:'cover',position:'centre'}).modulate({brightness:.68,saturation:.83}).jpeg({quality:86,mozjpeg:true}).toBuffer();
}catch(e){
  console.warn('Share source photo unavailable, using self-contained premium fallback',String(e));
  const fallback='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#0b202b"/><stop offset=".55" stop-color="#253f48"/><stop offset="1" stop-color="#8a664c"/></linearGradient></defs><path fill="url(#g)" d="M0 0h1200v630H0z"/><circle cx="1010" cy="210" r="285" fill="#d69e6b" opacity=".15"/></svg>';
  background=await sharp(Buffer.from(fallback)).png().toBuffer();
}
const overlay=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs>
  <linearGradient id="veil"><stop stop-color="#071820" stop-opacity=".98"/><stop offset=".54" stop-color="#071820" stop-opacity=".84"/><stop offset=".82" stop-color="#071820" stop-opacity=".19"/><stop offset="1" stop-color="#071820" stop-opacity=".06"/></linearGradient>
  <linearGradient id="bottom" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#071820" stop-opacity="0"/><stop offset="1" stop-color="#071820" stop-opacity=".78"/></linearGradient>
</defs>
<rect width="1200" height="630" fill="url(#veil)"/>
<rect y="440" width="1200" height="190" fill="url(#bottom)"/>
<rect x="55" y="53" width="5" height="22" fill="#d7a776"/>
<text x="76" y="71" font-family="DejaVu Sans, sans-serif" font-weight="700" letter-spacing="3.4" font-size="15" fill="#f4eae0">OPPORTUNITÀ RISERVATA</text>
<line x1="56" y1="114" x2="1144" y2="114" stroke="#e6cbae" stroke-opacity=".38" stroke-width="1"/>
<text x="55" y="228" font-family="DejaVu Sans, sans-serif" font-weight="800" letter-spacing="-3" font-size="86" fill="#fffaf4">LOUNGE BAR</text>
<text x="55" y="315" font-family="DejaVu Sans, sans-serif" font-weight="800" letter-spacing="-3.8" font-size="70" fill="#fffaf4">CATANZARO LIDO</text>
<rect x="58" y="342" width="389" height="47" rx="3" fill="#c49367"/>
<text x="77" y="372" font-family="DejaVu Sans, sans-serif" font-size="19" font-weight="800" letter-spacing="1" fill="#111e25">CESSIONE  /  GESTIONE</text>
<line x1="56" y1="506" x2="1144" y2="506" stroke="#e6cbae" stroke-opacity=".47"/>
<text x="56" y="543" font-family="DejaVu Sans, sans-serif" font-size="22" font-weight="700" fill="#f6e6d3">SETTE ANNI DI ATTIVITÀ*</text>
<text x="56" y="572" font-family="DejaVu Sans, sans-serif" font-size="14" fill="#d6d7d4">*Secondo quanto dichiarato dai titolari</text>
<text x="1144" y="557" text-anchor="end" font-family="DejaVu Sans, sans-serif" font-size="14" font-weight="600" letter-spacing="1.2" fill="#f6e6d3">PRIMO CONTATTO RISERVATO</text>
<line x1="1162" y1="54" x2="1162" y2="465" stroke="#ebc89f" stroke-opacity=".60" stroke-width="2"/>
</svg>`;
const result=await sharp(background).composite([{input:Buffer.from(overlay)}]).jpeg({quality:90,mozjpeg:true,progressive:true}).toBuffer();
await fs.writeFile(output,result);
const metadata=await sharp(result).metadata();
if(metadata.width!==1200||metadata.height!==630||result.length<12000)throw new Error('Invalid social image');
console.log('Generated',output,metadata.width,metadata.height,result.length,'bytes');
