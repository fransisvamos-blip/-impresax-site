import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const html=readFileSync(new URL('../public/opportunita/index.html',import.meta.url),'utf8');
const privacy=readFileSync(new URL('../public/opportunita/privacy.html',import.meta.url),'utf8');
const worker=readFileSync(new URL('../src/opportunity.js',import.meta.url),'utf8');
const share=readFileSync(new URL('../scripts/build-opportunity-share.mjs',import.meta.url),'utf8');
const css=html.match(/<style>([\s\S]*?)<\/style>/)?.[1]??'';
const js=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]??'';

test('owner-requested V9.1 high-contrast modern hospitality look is genuinely different from rejected V8 typography and colors',()=>{
 assert.match(html,/fonts\.googleapis\.com\/css2\?family=DM\+Sans/);
 assert.match(html,/family=Plus\+Jakarta\+Sans:wght@500;600;700;800/);
 assert.doesNotMatch(html,/Cormorant\+Garamond|family=Manrope/);
 assert.match(css,/--sans:'DM Sans',Arial,sans-serif;--serif:'Plus Jakarta Sans',Arial,sans-serif/);
 assert.match(css,/PRIVATE SALE 09 — HIGH-CONTRAST MODERN HOSPITALITY/);
 assert.match(css,/--orange:#fb5a20;--orange-bright:#ff7a34/);
 assert.match(css,/\.hero h1\{max-width:950px;margin:0 0 23px;font:800 clamp\(69px,7\.9vw,117px\)/);
 assert.match(css,/\.hero-foot\{background:#fff/);
 assert.match(css,/\.deal\{background:#fff;padding:89px 0 101px\}/);
 assert.match(css,/\.editorial\{min-height:475px;grid-template-columns:minmax\(0,51%\) minmax\(0,49%\);background:#07324d\}/);
 assert.match(css,/\.process\{padding:94px 0 100px;background:#f4f8fa\}/);
 assert.match(css,/\.demo-form\{background:#fff!important;background-image:none!important/);
 assert.doesNotMatch(html,/PRIVATE SALE 08\.1 — PRECISION POLISH/);
});
test('public wording remains sale-led, factual, priced only in private and accessible',()=>{
 assert.match(html,/<h1 id="hero-heading"><span class="sale">CEDESI<\/span>\s*<span class="accent">LOUNGE BAR<\/span><\/h1>/);
 assert.match(html,/id="deal-heading">VENDITA O <em>GESTIONE\?<\/em>/);
 assert.match(html,/movida universitaria/i);
 assert.match(html,/sette anni di attività/);
 assert.match(html,/clientela fidelizzata/i);
 assert.match(html,/piazza consolidata/i);
 assert.match(html,/con sedie e tavolini/i);
 const ids=['inizio','vendita','locale','come-funziona','contatto'].map(x=>html.indexOf('id="'+x+'"'));
 assert.ok(ids.every(x=>x>=0),'all 5 chapters must exist');
 assert.deepEqual(ids,[...ids].sort((a,b)=>a-b));
 assert.equal((html.match(/<section\b/g)||[]).length,5);
 assert.equal((html.match(/<h1\b/g)||[]).length,1);
 assert.doesNotMatch(html,/300\.000|€\s*\d|rendimento garantito|subentro immediato/i);
 assert.doesNotMatch(html,/prototipo da approvare|modulo dimostrativo|non invia dati/i);
});
test('first-party real venue source images preserved and visibly labeled, no Shopify',()=>{
 for(const file of ['hero-lounge-desktop-v1.webp','hero-lounge-mobile-v1.webp','hero-lounge-scene-v1.jpg',
                    'story-serata-desktop-v2.webp','story-serata-mobile-v2.webp','story-serata-locale-v2.jpg']){
   assert.ok(html.includes('/'+file),file);
   assert.ok(worker.includes('/'+file),file);
 }
 assert.match(html,/Fotografia del locale rielaborata digitalmente/);
 assert.match(html,/fotografia rielaborata con volti leggermente sfocati/);
 assert.doesNotMatch(html,/cdn\.shopify\.com|images\.unsplash\.com/);
 assert.match(html,/class="story-photo"/);
 assert.match(html,/class="hero-vignette"/);
});
test('real production Neon lead endpoint retains consent, spam protection, contact options and error handling',()=>{
 assert.match(html,/<form class="demo-form" id="interest-form" action="\/api\/interesse" method="post" novalidate>/);
 for(const name of ['transaction_interest','company_site','full_name','phone','privacy_accepted','contact_preference','notes'])
   assert.ok(html.includes('name="'+name+'"'),name);
 assert.match(html,/name="privacy_accepted" required/);
 assert.match(html,/href="\/privacy"/);
 assert.match(html,/name="phone" type="tel" inputmode="tel"/);
 assert.match(html,/role="group" aria-label="Formula di interesse"/);
 assert.match(html,/data-interest="vendita" aria-pressed="true"/);
 assert.match(html,/data-interest="gestione" aria-pressed="false"/);
 assert.match(html,/data-interest="entrambe" aria-pressed="false"/);
 assert.match(html,/id="form-msg" class="form-msg" role="status" aria-live="polite"/);
 assert.match(js,/const mapping=\{vendita:'cessione',cessione:'cessione',gestione:'gestione',entrambe:'entrambe'\}/);
 assert.match(js,/fetch\('\/api\/interesse',\{method:'POST'/);
 assert.match(js,/privacy_accepted:fields\.get\('privacy_accepted'\)==='on'/);
 assert.match(js,/fields\.get\('notes'\)/);
 assert.match(js,/budget_band:'da-definire'/);
 assert.match(js,/form\.checkValidity\(\)/);
 assert.match(js,/submit\.disabled=true/);
 assert.match(js,/controller\.abort\(\),16000/);
 assert.match(worker,/const TRANSACTIONS = new Set\(\["cessione","gestione","entrambe"\]\)/);
 assert.match(worker,/insert into public\.activity_sale_leads/);
 assert.match(worker,/data\?\.privacy_accepted!==true/);
 assert.match(privacy,/preferenza facoltativa sulla modalità di contatto/);
 assert.equal((html.match(/<form\b/g)||[]).length,1);
 new Script(js,{filename:'opportunita-live-v9.js'});
});
test('all key acquisition routes, mobile menu and readable high-contrast inputs',()=>{
 assert.match(html,/href="#contatto" data-pref="vendita"/);
 assert.match(html,/href="#contatto" data-pref="gestione"/);
 assert.match(html,/href="tel:\+393294582962"/);
 assert.match(html,/aria-controls="nav"/);
 assert.match(html,/aria-label="Apri il menu"/);
 assert.match(css,/\.form-field input,\.form-field select\{height:56px;min-height:56px;background:#f5f8fa;color:#0f334c/);
 assert.match(css,/\.step-marker\{width:69px;height:69px;flex:0 0 69px;background:#0c3851/);
 assert.match(css,/\.proof-icon\{width:43px;height:43px;color:#f65a23/);
 assert.match(css,/@media\(max-width:1270px\)/);
 assert.match(css,/@media\(max-width:1050px\)/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/@media\(max-width:480px\)/);
 assert.match(css,/@media\(max-width:360px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.equal((html.match(/class="proof-icon"/g)||[]).length,3);
 assert.equal((html.match(/class="deal-icon"/g)||[]).length,2);
 assert.equal((html.match(/class="step-icon"/g)||[]).length,3);
});
test('social share and privacy policy remain first-party, no public price',()=>{
 assert.match(html,/<meta property="og:title" content="Lounge bar in vendita a Catanzaro Lido">/);
 assert.match(html,/<meta property="og:image" content="https:\/\/opportunita\.impresax\.org\/og-social-v8\.jpg">/);
 assert.match(html,/<meta name="twitter:image" content="https:\/\/opportunita\.impresax\.org\/og-social-v8\.jpg">/);
 assert.match(html,/<meta property="og:image:width" content="1200">/);
 assert.match(html,/<meta property="og:image:height" content="630">/);
 assert.match(share,/readFile\('public\/opportunita\/hero-lounge-scene-v1\.jpg'\)/);
 assert.match(share,/writeFile\('public\/opportunita\/og-social-v8\.jpg'/);
 assert.match(worker,/\/og-social-v8\.jpg/);
 assert.match(html,/<link rel="canonical" href="https:\/\/opportunita\.impresax\.org\/">/);
 assert.match(privacy,/Informativa sulla privacy/);
 assert.doesNotMatch(html,/300\.000/);
});
