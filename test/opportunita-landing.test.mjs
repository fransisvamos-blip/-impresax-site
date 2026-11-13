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
test("real location photograph has honest caption and attribution",()=>{
 assert.equal((html.match(/<img\b/g)||[]).length,1);
 assert.match(html,/File:Catanzarolidolandscape\.jpg/);
 assert.match(html,/Foto aerea:.*Wikimedia Commons/);
 assert.match(html,/Non è una fotografia del lounge bar/);
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
