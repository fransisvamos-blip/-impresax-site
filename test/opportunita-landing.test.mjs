import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";
const html=readFileSync(new URL("../public/opportunita/index.html",import.meta.url),"utf8");
const privacy=readFileSync(new URL("../public/opportunita/privacy.html",import.meta.url),"utf8");
const css=html.match(/<style>([\s\S]*?)<\/style>/)?.[1]??"";
const art=css.slice(css.indexOf("/* GALLERY 08"));
const js=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]??"";

test("the offer stays immediately explicit and the public price is never printed",()=>{
 assert.match(html,/<h1 id="hero-title">[\s\S]*?Lounge bar avviato a Catanzaro Lido\.[\s\S]*?IN CESSIONE<br>O GESTIONE\./);
 assert.equal((html.match(/<h1\b/g)||[]).length,1);
 assert.doesNotMatch(html,/(?:300[., ]?000|300000|€\s*300)/);
 assert.match(html,/L'immobile non è in vendita/);
});
test("gallery 08 uses contrasting visual chapters, not a homogeneous page",()=>{
 assert.match(art,/GALLERY 08/);
 assert.match(art,/\.hero\{padding:85px 0 96px;min-height:720px;background:#151b1f/);
 assert.match(art,/\.choice-section\{padding:101px 0 106px;background:#eee8df/);
 assert.match(art,/\.section\{background:#fffefa/);
 assert.match(art,/\.deal-sheet\{background:#242a2d/);
 assert.match(art,/\.formula-section\{background:#ebe6de/);
 assert.match(art,/\.statement\{background:#c7beb0/);
 assert.match(art,/\.end\{background:#171c21/);
 assert.match(art,/\.hero-intro\{font:italic 400/);
 assert.match(art,/\.hero h1 \.emphasis\{display:block;font:800/);
});
test("photo is a real contextual image, never misleadingly claimed as the venue",()=>{
 assert.equal((html.match(/<img\b/g)||[]).length,1);
 assert.match(html,/File:Catanzarolidolandscape\.jpg/);
 assert.match(html,/Foto aerea:.*Wikimedia Commons/);
 assert.match(html,/Non è una fotografia del lounge bar/);
 assert.match(html,/RIVIERA IONICA \/ CALABRIA/);
});
test("new table of contents offers real navigation without replacing contact CTA",()=>{
 assert.match(html,/class="contents-strip"/);
 assert.match(html,/aria-label="Esplora la presentazione"/);
 for(const id of ["punti-di-forza","formule","come-funziona"]){
   assert.match(html,new RegExp('href="#'+id+'"'));
   assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(art,/\.contents-inner\{display:grid;grid-template-columns:1.08fr repeat\(3,1fr\)/);
});
test("dossier identifies transaction scope without fabricated returns",()=>{
 assert.match(html,/class="deal-sheet"/);
 assert.match(html,/SCHEDA DELL.OPERAZIONE/);
 for(const fact of ["Attività lounge bar","Catanzaro Lido","Cessione · Gestione","Non compreso nella vendita"]){
   assert.ok(html.includes(fact),fact);
 }
 assert.match(html,/verifica documentale/);
 assert.doesNotMatch(html,/fatturato (?:garantito|certo)/i);
});
test("two-stage inquiry remains intact, with all three paths and legal privacy",()=>{
 assert.match(html,/id="wizard-step-two" hidden/);
 assert.match(html,/id="lead-form"/);
 for(const v of ["cessione","gestione","entrambe"])assert.match(html,new RegExp('data-choice="'+v+'"'));
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
test("responsive composition covers phone, tablet and reduced motion",()=>{
 assert.match(art,/@media\(max-width:1150px\)/);
 assert.match(art,/@media\(max-width:820px\)/);
 assert.match(art,/@media\(max-width:575px\)/);
 assert.match(art,/\.contents-inner\{grid-template-columns:1fr;gap:0\}/);
 assert.match(art,/prefers-reduced-motion/);
 assert.match(css,/\.mobilebar\{position:fixed/);
 assert.match(html,/aria-live="polite"/);
 assert.match(html,/role="status"/);
});
test("the privacy document keeps contact details and coherent presentation",()=>{
 assert.match(privacy,/Informativa sulla privacy/);
 assert.match(privacy,/info@impresax\.org/);
 assert.match(privacy,/titolare del trattamento/);
 assert.match(privacy,/Manrope/);
 assert.match(privacy,/#f5f2ec/);
});
