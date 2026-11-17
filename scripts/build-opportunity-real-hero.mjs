/**
 * PHOTO-ONLY hero rebuild for the Catanzaro Lido lounge bar.
 * Input: first-party venue photograph already in the repo,
 * sourced from the real venue. No generative images / no invented structures.
 * Privacy: intentionally defocus patrons' faces and venue signage.
 * Panorama: extend only with defocused pixels of this same venue image.
 */
import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';

const root='public/opportunita/';
const original=await readFile(root+'hero-lounge-scene-v1.jpg');
const metadata=await sharp(original).metadata();
if(metadata.width<1000||metadata.height<1000)throw Error('First-party original too small');

const base=await sharp(original)
  .modulate({brightness:1.18,saturation:1.25})
  .linear(1.06,2)
  .sharpen({sigma:0.9,m1:0.45,m2:1.3})
  .png().toBuffer();
const {width,height}=await sharp(base).metadata();

// Privacy-first photography: shallow-depth-of-field over the people.
// Logo/signage is also deliberately illegible rather than recreated.
const peopleMask=Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs>
<linearGradient id="p" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#fff" stop-opacity="0"/>
<stop offset=".44" stop-color="#fff" stop-opacity="0"/>
<stop offset=".56" stop-color="#fff" stop-opacity=".64"/>
<stop offset=".65" stop-color="#fff" stop-opacity=".94"/>
<stop offset="1" stop-color="#fff" stop-opacity=".95"/>
</linearGradient>
</defs><rect width="100%" height="100%" fill="url(#p)"/></svg>`);
const crowdBlur=await sharp(base).blur(16).composite([{input:peopleMask,blend:'dest-in'}]).png().toBuffer();
let photo=await sharp(base).composite([{input:crowdBlur}]).png().toBuffer();

const signMask=Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs>
<linearGradient id="s" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="#fff" stop-opacity=".95"/>
<stop offset=".25" stop-color="#fff" stop-opacity=".8"/>
<stop offset=".42" stop-color="#fff" stop-opacity="0"/>
<stop offset="1" stop-color="#fff" stop-opacity="0"/>
</linearGradient></defs><rect x="0" y="${Math.round(height*.33)}" width="${Math.round(width*.55)}" height="${Math.round(height*.30)}" fill="url(#s)"/></svg>`);
const signage=await sharp(photo).blur(20).composite([{input:signMask,blend:'dest-in'}]).png().toBuffer();
photo=await sharp(photo).composite([{input:signage}]).png().toBuffer();

// Desktop 16:9-ish immersive hero. Its extension is a blurred COPY of the real
// photo itself, never a newly invented architectural environment.
const W=2400,H=1350,mainW=1480,mainX=W-mainW;
const outOfFocus=await sharp(photo)
  .resize(W,H,{fit:'cover',position:'centre'})
  .blur(56).modulate({brightness:.58,saturation:.78})
  .png().toBuffer();
const foreground=await sharp(photo)
  .resize(mainW,H,{fit:'cover',position:'centre'})
  .png().toBuffer();
const featherMask=Buffer.from(`<svg width="${mainW}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs>
<linearGradient id="edge" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="white" stop-opacity="0"/>
<stop offset=".20" stop-color="white" stop-opacity=".2"/>
<stop offset=".36" stop-color="white" stop-opacity=".96"/>
<stop offset=".44" stop-color="white" stop-opacity="1"/>
<stop offset="1" stop-color="white" stop-opacity="1"/>
</linearGradient></defs><rect width="100%" height="100%" fill="url(#edge)"/></svg>`);
const transition=await sharp(foreground)
  .composite([{input:featherMask,blend:'dest-in'}]).png().toBuffer();
const deepCopy=Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs>
<linearGradient id="shadow" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="#061b2a" stop-opacity=".98"/>
<stop offset=".30" stop-color="#061b2a" stop-opacity=".91"/>
<stop offset=".49" stop-color="#061b2a" stop-opacity=".63"/>
<stop offset=".69" stop-color="#061b2a" stop-opacity=".10"/>
<stop offset="1" stop-color="#061b2a" stop-opacity="0"/>
</linearGradient>
<linearGradient id="foot" x1="0" y1="1" x2="0" y2="0">
<stop offset="0" stop-color="#051622" stop-opacity=".52"/>
<stop offset=".37" stop-color="#051622" stop-opacity="0"/>
<stop offset="1" stop-color="#051622" stop-opacity="0"/>
</linearGradient></defs><rect width="100%" height="100%" fill="url(#shadow)"/>
<rect width="100%" height="100%" fill="url(#foot)"/></svg>`);
const panorama=await sharp(outOfFocus)
 .composite([{input:transition,left:mainX,top:0},{input:deepCopy}])
 .webp({quality:92,effort:6}).toBuffer();
await writeFile(root+'hero-venue-panorama-real-v1.webp',panorama);

// Mobile shows the same original venue, with its privacy retouch retained.
const mobile=await sharp(photo).resize(1080,1260,{fit:'cover',position:'attention'})
 .webp({quality:90,effort:6}).toBuffer();
await writeFile(root+'hero-venue-mobile-real-v1.webp',mobile);
for(const [name,data] of [['desktop',panorama],['mobile',mobile]]){
 const m=await sharp(data).metadata();
 if(m.format!=='webp'||m.width<1000||m.height<1000)throw Error('Invalid '+name);
 console.log(name,m.width,m.height,(data.length/1024).toFixed(1)+'KB');
}
