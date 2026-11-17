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

test('approved Variant 1: real navy/cyan and airy editorial layout, no orange as active design',()=>{
 assert.match(css,/PRIVATE SALE 10 — VARIANTE 1 CYAN SIGNATURE/);
 assert.match(css,/--navy:#051b2c;--navy-2:#092e45/);
 assert.match(css,/--orange:#08d8dc;--orange-bright:#06ceda/);
 assert.match(css,/\.hero h1 \.accent\{color:#05d9dd/);
 assert.match(css,/\.hero-foot\{position:absolute;bottom:0/);
 assert.match(css,/\.btn-orange\{background:#08d7dc;border:1px solid #21e6e5;color:#05283a/);
 assert.match(css,/\.deal\{background:#fff;padding:84px/);
 assert.match(css,/\.deal-alt\{background:linear-gradient\(120deg,#f5f9fc,#eaf4f9\)/);
 assert.match(css,/\.editorial\{background:#f1f8fb/);
 assert.match(css,/\.story-copy\{grid-row:1;grid-column:1/);
 assert.match(css,/\.story-photo\{grid-row:1;grid-column:2/);
 assert.match(css,/\.process\{background:#fff;padding:78px/);
 assert.match(css,/\.contact\{background:linear-gradient\(106deg,#051e32ef/);
 assert.match(css,/\.demo-form\{background:#fff!important/);
 assert.match(css,/\.mobile-bar a\{background:#08d7dc/);
 assert.match(html,/family=DM\+Sans/);
 assert.match(html,/family=Plus\+Jakarta\+Sans/);
});
test('immediate and unambiguous sale message, two formulas, true facts, no public price',()=>{
 assert.match(html,/<h1 id="hero-heading"><span class="sale">CEDESI<\/span>\s*<span class="accent">LOUNGE BAR<\/span><\/h1>/);
 assert.match(html,/<span class="section-no">VENDITA O GESTIONE\?<\/span>/);
 assert.match(html,/<h2 id="deal-heading">Due formule per la stessa <em>opportunità<\/em><\/h2>/);
 assert.match(html,/PROPOSTA PRINCIPALE/);
 assert.match(html,/Vendita<br>dell’attività/);
 assert.match(html,/Gestione<br>del locale/);
 assert.match(html,/movida universitaria/);
 assert.match(html,/sette anni di attività/i);
 assert.match(html,/clientela fidelizzata/i);
 assert.match(html,/con sedie e tavolini/);
 const sections=[...html.matchAll(/<section\b[^>]*id="([^"]+)"/g)].map(x=>x[1]);
 assert.deepEqual(sections,['inizio','vendita','locale','come-funziona','contatto']);
 assert.equal((html.match(/<h1\b/g)||[]).length,1);
 assert.doesNotMatch(html,/300\.000|€\s*\d|fatturato garantito|rendimento garantito/i);
 assert.doesNotMatch(html,/prototipo da approvare|modulo dimostrativo|non invia dati/i);
});
test('only supplied real venue photo derivations, not fictitious cocktail/bar photos',()=>{
 for(const file of ['hero-lounge-desktop-v1.webp','hero-lounge-mobile-v1.webp','hero-lounge-scene-v1.jpg',
                    'story-serata-desktop-v2.webp','story-serata-mobile-v2.webp','story-serata-locale-v2.jpg']){
   assert.ok(html.includes('/'+file),file);
   assert.ok(worker.includes('/'+file),file);
 }
 assert.match(html,/class="venue-inset" src="\/hero-lounge-desktop-v1\.webp"/);
 assert.match(html,/class="venue-highlights"/);
 assert.match(html,/Fotografia del locale rielaborata digitalmente/);
 assert.match(html,/fotografia rielaborata con volti leggermente sfocati/);
 assert.match(html,/Informazioni secondo i titolari/);
 assert.doesNotMatch(html,/images\.unsplash\.com|cdn\.shopify\.com/);
 assert.ok(html.indexOf('class="story-copy"')<html.indexOf('class="story-photo"'),'venue details should precede the collage in DOM order');
});
test('production lead backend, privacy, honeypot and existing consent logic fully unchanged',()=>{
 assert.match(html,/<form class="demo-form" id="interest-form" action="\/api\/interesse" method="post" novalidate>/);
 for(const n of ['transaction_interest','company_site','full_name','phone','privacy_accepted','contact_preference','notes'])assert.ok(html.includes('name="'+n+'"'),n);
 assert.match(html,/name="privacy_accepted" required/);
 assert.match(html,/href="\/privacy"/);
 assert.match(html,/name="phone" type="tel" inputmode="tel"/);
 assert.match(html,/id="form-msg" class="form-msg" role="status" aria-live="polite"/);
 assert.match(html,/data-interest="vendita" aria-pressed="true"/);
 assert.match(html,/data-interest="gestione" aria-pressed="false"/);
 assert.match(html,/data-interest="entrambe" aria-pressed="false"/);
 assert.match(js,/const mapping=\{vendita:'cessione',cessione:'cessione',gestione:'gestione',entrambe:'entrambe'\}/);
 assert.match(js,/fetch\('\/api\/interesse',\{method:'POST'/);
 assert.match(js,/privacy_accepted:fields\.get\('privacy_accepted'\)==='on'/);
 assert.match(js,/budget_band:'da-definire'/);
 assert.match(js,/form\.checkValidity\(\)/);
 assert.match(js,/controller\.abort\(\),16000/);
 assert.match(worker,/const TRANSACTIONS = new Set\(\["cessione","gestione","entrambe"\]\)/);
 assert.match(worker,/insert into public\.activity_sale_leads/);
 assert.match(worker,/data\?\.privacy_accepted!==true/);
 assert.match(privacy,/Informativa sulla privacy/);
 assert.equal((html.match(/<form\b/g)||[]).length,1);
 new Script(js,{filename:'opportunita-variant-1-cyan.js'});
});
test('user-facing routes, accessible icons and responsive-first input typography',()=>{
 assert.match(html,/href="#contatto" data-pref="vendita"/);
 assert.match(html,/href="#contatto" data-pref="gestione"/);
 assert.match(html,/href="tel:\+393294582962"/);
 assert.match(html,/aria-controls="nav"/);
 assert.match(html,/aria-label="Apri il menu"/);
 assert.match(css,/\.form-field input,\.form-field select\{background:#f7fafb/);
 assert.match(css,/\.process-step:first-child \.step-marker\{background:#04bdc6\}/);
 assert.match(css,/@media\(max-width:1200px\)/);
 assert.match(css,/@media\(max-width:1050px\)/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/@media\(max-width:480px\)/);
 assert.match(css,/@media\(max-width:360px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.equal((html.match(/class="proof-icon"/g)||[]).length,3);
 assert.equal((html.match(/class="deal-icon"/g)||[]).length,2);
 assert.equal((html.match(/class="step-icon"/g)||[]).length,3);
});
test('first party updated cyan social sharing image with real venue only and no price',()=>{
 assert.match(html,/<meta property="og:title" content="Lounge bar in vendita a Catanzaro Lido">/);
 assert.match(html,/<meta property="og:image" content="https:\/\/opportunita\.impresax\.org\/og-social-v10\.jpg">/);
 assert.match(html,/<meta name="twitter:image" content="https:\/\/opportunita\.impresax\.org\/og-social-v10\.jpg">/);
 assert.match(html,/<meta property="og:image:width" content="1200">/);
 assert.match(html,/<meta property="og:image:height" content="630">/);
 assert.match(share,/readFile\('public\/opportunita\/hero-lounge-scene-v1\.jpg'\)/);
 assert.match(share,/writeFile\('public\/opportunita\/og-social-v10\.jpg'/);
 assert.match(share,/id="cyan"/);
 assert.match(worker,/\/og-social-v10\.jpg/);
 assert.match(html,/<link rel="canonical" href="https:\/\/opportunita\.impresax\.org\/">/);
 assert.doesNotMatch(html,/300\.000/);
});
