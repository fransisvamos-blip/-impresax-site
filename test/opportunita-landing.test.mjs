import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";

const html=readFileSync(new URL("../public/opportunita/index.html",import.meta.url),"utf8");
const privacy=readFileSync(new URL("../public/opportunita/privacy.html",import.meta.url),"utf8");
const css=html.match(/<style>([\s\S]*?)<\/style>/)?.[1]??"";
const js=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]??"";

test("offer is unmistakable above the fold and price stays private",()=>{
 assert.match(html,/<h1 id="hero-title">[\s\S]*?Un lounge bar avviato, nel cuore della movida\.[\s\S]*?IN CESSIONE<br>O GESTIONE\./);
 assert.match(html,/CATANZARO LIDO · CALABRIA/);
 assert.equal((html.match(/<h1\b/g)||[]).length,1);
 assert.doesNotMatch(html,/(?:300[., ]?000|300000|€\s*300)/);
 assert.match(html,/L'immobile non è in vendita/);
});
test("render-approved palette: warm white, navy, targeted orange and peach",()=>{
 assert.match(css,/--paper:#fafaf7/);
 assert.match(css,/--navy:#123b59/);
 assert.match(css,/--orange:#ed7628/);
 assert.match(css,/--peach:#fae7d8/);
 assert.match(css,/--powder:#e7f0f4/);
 assert.match(css,/\.hero h1 \.emphasis\{[^}]*background:var\(--orange\)/);
 assert.match(css,/\.button-primary\{[^}]*background:var\(--navy\)/);
 assert.match(css,/\.send\{[^}]*background:var\(--orange\)/);
 assert.doesNotMatch(css,/#a73742|#b84531|#1955c9|#364438|ATELIER 01/);
});
test("different section identities support reading and conversion",()=>{
 assert.match(css,/\.hero\{[^}]*background:linear-gradient/);
 assert.match(css,/\.choice-section\{[^}]*background:#e7f0f4/);
 assert.match(css,/\.value-card:first-child\{[^}]*background:var\(--navy\)/);
 assert.match(css,/\.value-card:nth-child\(2\)\{[^}]*background:#f9e9db/);
 assert.match(css,/\.formula-section\{[^}]*background:#fff4e9/);
 assert.match(css,/\.statement\{[^}]*background:var\(--navy\)/);
 assert.match(css,/\.questions\{[^}]*background:#eaf1f5/);
 assert.match(css,/\.end\{[^}]*background:var\(--navy-dark\)/);
});
test("three authentic Catanzaro Lido context photos are credited and never presented as venue",()=>{
 assert.equal((html.match(/<img\b/g)||[]).length,3);
 assert.match(html,/File:Catanzarolidolandscape\.jpg/);
 assert.match(html,/Foto aerea:.*Wikimedia Commons/);
 assert.match(html,/Non è una fotografia del lounge bar/);
 assert.match(html,/Beach_of_Catanzaro_Lido_17\.jpg\?width=1100/);
 assert.match(html,/Tramonto_a_Catanzaro_Lido\.JPG\?width=900/);
 assert.match(html,/non gli spazi del lounge bar/);
 assert.match(html,/CC BY-SA 4\.0/);
 assert.match(html,/CC BY-SA 3\.0/);
 assert.equal((html.match(/loading="lazy"/g)||[]).length,2);
 assert.equal((html.match(/<figcaption>/g)||[]).length,2);
});
test("business claims stay grounded and commercially clear",()=>{
 for(const fact of ["7 anni","clientela fidelizzata","Catanzaro Lido","Attività lounge bar","Cessione · Gestione","Non compreso nella vendita"]){
  assert.ok(html.includes(fact),fact);
 }
 assert.match(html,/verifica documentale/);
 assert.doesNotMatch(html,/fatturato (?:garantito|certo)|profitti garantiti/i);
 assert.match(html,/I titolari stanno per dedicarsi a un nuovo progetto/);
});
test("two-step form retains three choices, required contact fields and legal consent",()=>{
 assert.match(html,/id="wizard-step-two" hidden/);
 assert.match(html,/id="lead-form"/);
 for(const v of ["cessione","gestione","entrambe"]) assert.match(html,new RegExp('data-choice="'+v+'"'));
 assert.match(html,/id="transaction_interest" name="transaction_interest"/);
 assert.match(html,/id="full_name"[^>]*required/);
 assert.match(html,/id="phone"[^>]*required/);
 assert.match(html,/id="privacy_accepted"[^>]*required/);
 assert.match(html,/href="\/privacy"/);
 assert.match(html,/tel:\+393294582962/);
 assert.match(html,/\/api\/interesse/);
 assert.match(html,/utm_campaign/);
 new Script(js,{filename:"opportunita-inline.js"});
});
test("mobile rules, focus and live feedback remain accessible",()=>{
 assert.match(css,/@media\(max-width:1150px\)/);
 assert.match(css,/@media\(max-width:820px\)/);
 assert.match(css,/@media\(max-width:575px\)/);
 assert.match(css,/\.choice-option:focus-visible/);
 assert.match(css,/prefers-reduced-motion/);
 assert.match(css,/\.mobilebar\{position:fixed/);
 assert.match(html,/aria-label="Modalità di interesse"/);
 assert.match(html,/role="status"/);
 assert.match(html,/aria-live="polite"/);
});
test("privacy reflects new presentation and preserves the contact point",()=>{
 assert.match(privacy,/Informativa sulla privacy/);
 assert.match(privacy,/#fafaf7/);
 assert.match(privacy,/#ed7628/);
 assert.match(privacy,/13 novembre 2026/);
 assert.match(privacy,/info@impresax\.org/);
 assert.match(privacy,/titolare del trattamento/);
});

test("important text uses upright Manrope type without italic or decorative serif",()=>{
 assert.doesNotMatch(html,/<\/?em\b/i);
 assert.equal((html.match(/class="heading-accent"/g)||[]).length,7);
 assert.doesNotMatch(css,/\bitalic\b/i);
 assert.doesNotMatch(css,/var\(--serif\)|Instrument Serif/);
 assert.doesNotMatch(html,/Instrument\+Serif/);
 assert.doesNotMatch(privacy,/Instrument\+Serif/);
 assert.match(css,/\.hero-intro\{[^}]*font:800[^}]*var\(--display\)/);
 assert.match(css,/\.photo-caption strong\{[^}]*font:800[^}]*var\(--display\)/);
 for (const selector of [
  ".choice-title .heading-accent",".section-title .heading-accent",
  ".statement-grid h2 .heading-accent",".questions h2 .heading-accent",
  ".end h2 .heading-accent"
 ]) assert.ok(css.includes(selector+"{"),"missing upright heading style: "+selector);
 assert.match(css,/\.hero h1 \.emphasis\{[^}]*text-transform:uppercase/);
});


test("hand-drawn icons, realistic gallery and original graphic compositions exist",()=>{
 assert.match(html,/class="visual-gallery"/);
 assert.match(html,/id="visual-gallery-title"/);
 assert.equal((html.match(/class="step-icon"/g)||[]).length,3);
 assert.equal((html.match(/class="formula-emblem"/g)||[]).length,2);
 assert.match(html,/class="end-waves"/);
 assert.match(html,/class="gallery-coastal-wave"/);
 assert.match(css,/VISUAL ENRICHMENT V3/);
 assert.match(css,/\.gallery-layout\{display:grid/);
 assert.match(css,/\.gallery-photos\{display:grid/);
 assert.match(css,/\.formula-emblem\{position:absolute/);
 assert.match(css,/\.step-icon\{display:grid/);
 assert.match(css,/\.end-waves\{position:absolute/);
 assert.match(html,/href="#iniziamo" class="gallery-link"/);
});
test("mobile gallery composition, responsive image srcset and low-motion accessibility",()=>{
 assert.match(css,/@media\(max-width:1040px\)/);
 assert.match(css,/@media\(max-width:820px\)/);
 assert.match(css,/@media\(max-width:575px\)/);
 assert.match(css,/@media\(max-width:390px\)/);
 assert.equal((html.match(/srcset="/g)||[]).length,2);
 assert.match(css,/\.gallery-photo-main \.gallery-frame\{aspect-ratio:/);
 assert.match(css,/\.gallery-photo-sunset \.gallery-frame\{aspect-ratio:/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/\.motion-on \.reveal-on-scroll:not\(\.is-revealed\)/);
 const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
 assert.equal(scripts.length,2);
 scripts.forEach((script,i)=>new Script(script,{filename:"landing-inline-"+i+".js"}));
 assert.match(scripts[1],/IntersectionObserver/);
 assert.match(scripts[1],/prefers-reduced-motion: reduce/);
 assert.match(scripts[1],/if\(!\('IntersectionObserver' in window\)/);
 assert.doesNotMatch(css,/\bitalic\b/i);
});
