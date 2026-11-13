import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";

const html=readFileSync(new URL("../public/opportunita/index.html",import.meta.url),"utf8");
const privacy=readFileSync(new URL("../public/opportunita/privacy.html",import.meta.url),"utf8");
const css=html.match(/<style>([\s\S]*?)<\/style>/)?.[1]??"";
const js=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]??"";

test("offer is immediately explicit and does not reveal sale price or identity",()=>{
 assert.match(html,/<h1 id="hero-title">[\s\S]*?Un lounge bar avviato a Catanzaro Lido\.[\s\S]*?IN CESSIONE<br>O GESTIONE\./);
 assert.equal((html.match(/<h1\b/g)||[]).length,1);
 assert.doesNotMatch(html,/(?:300[., ]?000|300000|€\s*300)/);
 assert.match(html,/l'immobile non è in vendita/i);
 assert.doesNotMatch(html,/REF \/ CZL/);
});
test("CSS is consolidated, with new palette and no inherited visual overrides",()=>{
 assert.equal((html.match(/<style>/g)||[]).length,1);
 assert.match(css,/ATELIER 01/);
 assert.match(css,/--silk:#f9f8f5/);
 assert.match(css,/--onyx:#171819/);
 assert.match(css,/--stone:#e2dbd1/);
 assert.match(css,/--champagne:#b5a183/);
 assert.doesNotMatch(css,/GALLERY 08|GALLERY 07|#1955c9|#a73742|#b84531|#364438/);
 assert.doesNotMatch(html,/class="contents-strip"|class="strength-watermark"|class="hero-signature"/);
 assert.ok(css.length<30000,"Consolidated CSS should remain compact");
});
test("colors and contrast intentionally differ across major sections",()=>{
 assert.match(css,/\.hero\{background:var\(--silk\)/);
 assert.match(css,/\.choice-section\{[^}]*background:var\(--onyx\)/);
 assert.match(css,/\.section\{background:white/);
 assert.match(css,/\.formula-section\{background:var\(--ivory\)/);
 assert.match(css,/\.statement\{background:var\(--stone\)/);
 assert.match(css,/\.questions\{background:#f2eee8/);
 assert.match(css,/\.end\{background:var\(--onyx\)/);
});
test("real external location photo has correct disclosure and attribution",()=>{
 assert.equal((html.match(/<img\b/g)||[]).length,1);
 assert.match(html,/File:Catanzarolidolandscape\.jpg/);
 assert.match(html,/Foto aerea:.*Wikimedia Commons/);
 assert.match(html,/Non è una fotografia del lounge bar/);
});
test("business dossier is factual and light on gratuitous branding",()=>{
 assert.match(html,/class="deal-sheet"/);
 for(const fact of ["Attività lounge bar","Catanzaro Lido","Cessione · Gestione","Non compreso nella vendita"])
  assert.ok(html.includes(fact),fact);
 assert.match(html,/verifica documentale/);
 assert.doesNotMatch(html,/fatturato (?:garantito|certo)/i);
});
test("two-step acquisition and management choices remain intact",()=>{
 assert.match(html,/id="wizard-step-two" hidden/);
 assert.match(html,/id="lead-form"/);
 for(const opt of ["cessione","gestione","entrambe"]) assert.match(html,new RegExp('data-choice="'+opt+'"'));
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
test("mobile and accessibility contracts survive the redesign",()=>{
 assert.match(css,/@media\(max-width:1130px\)/);
 assert.match(css,/@media\(max-width:820px\)/);
 assert.match(css,/@media\(max-width:575px\)/);
 assert.match(css,/prefers-reduced-motion/);
 assert.match(css,/\.mobilebar\{position:fixed/);
 assert.match(html,/aria-label="Modalità di interesse"/);
 assert.match(html,/role="status"/);
 assert.match(html,/aria-live="polite"/);
});
test("privacy has matching visual treatment and retains GDPR contact",()=>{
 assert.match(privacy,/Informativa sulla privacy/);
 assert.match(privacy,/#f9f8f5/);
 assert.match(privacy,/info@impresax\.org/);
 assert.match(privacy,/titolare del trattamento/);
});
