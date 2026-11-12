import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";

const html=readFileSync(new URL("../public/opportunita/index.html",import.meta.url),"utf8");
const privacy=readFileSync(new URL("../public/opportunita/privacy.html",import.meta.url),"utf8");
const css=html.match(/<style>([\s\S]*?)<\/style>/)?.[1]??"";
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]??"";

test("offer says clearly what is for sale or management, no price leak",()=>{
 assert.match(html,/<h1 id="hero-title">[\s\S]*?IN CESSIONE<br>O GESTIONE\./);
 assert.match(html,/Lounge bar a Catanzaro Lido/);
 assert.equal((html.match(/<h1\b/g)||[]).length,1);
 assert.doesNotMatch(html,/(?:300[., ]?000|300000|€\s*300)/);
 assert.doesNotMatch(html,/\b\w+\.€\b/);
});
test("exclusive visual art direction has varied chapters instead of one flat blue",()=>{
 assert.match(css,/--paper:#f6f4ee/);
 assert.match(css,/--graphite:#202328/);
 assert.match(css,/--cobalt:#2761d2/);
 assert.match(css,/--midnight:#131a25/);
 assert.match(css,/--display:'Manrope'/);
 assert.match(css,/--editorial:'Instrument Serif'/);
 assert.match(css,/\.choice-section\s*\{[^}]*background:#1c2128/);
 assert.match(css,/\.statement\s*\{[^}]*background:#232a31/);
 assert.match(css,/\.questions\s*\{[^}]*background:#ebe8e1/);
 assert.match(css,/\.hero h1 \.emphasis\s*\{[^}]*text-transform:uppercase/);
 assert.doesNotMatch(css,/#a73742|#1955c9|#b84531|#66776a|#556958/);
});
test("authentic panorama only, properly attributed and not presented as venue photo",()=>{
 assert.equal((html.match(/<img\b/g)||[]).length,1);
 assert.match(html,/File:Catanzarolidolandscape\.jpg/);
 assert.match(html,/Foto aerea:.*Wikimedia Commons/);
 assert.match(html,/Non è una fotografia del lounge bar/);
});
test("exclusive dossier conveys verified scope not invented figures",()=>{
 assert.match(html,/class="deal-sheet"/);
 assert.match(html,/SCHEDA DELL.OPERAZIONE/);
 for(const fact of ["Attività lounge bar","Catanzaro Lido","Cessione · Gestione","Non compreso nella vendita"]){
  assert.ok(html.includes(fact),fact);
 }
 assert.match(html,/verifica documentale/);
 assert.doesNotMatch(html,/fatturato (?:garantito|certo)/i);
});
test("contact wizard retains its steps, targets and syntax",()=>{
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
 assert.match(css,/\.choice-option:nth-child\(3\)\s*\{[^}]*grid-column:1\/-1/);
 new Script(script,{filename:"opportunita-inline.js"});
});
test("mobile layout rules and accessibility are present",()=>{
 assert.match(css,/@media\(max-width:820px\)/);
 assert.match(css,/@media\(max-width:575px\)/);
 assert.match(css,/\.mobilebar\{position:fixed/);
 assert.match(css,/prefers-reduced-motion/);
 assert.match(html,/aria-label="Modalità di interesse"/);
 assert.match(html,/role="status"/);
 assert.match(html,/aria-live="polite"/);
});
test("privacy is styled coherently and has contact instructions",()=>{
 assert.match(privacy,/Informativa sulla privacy/);
 assert.match(privacy,/#f6f4ee/);
 assert.match(privacy,/Manrope/);
 assert.match(privacy,/info@impresax\.org/);
 assert.match(privacy,/titolare del trattamento/);
});
