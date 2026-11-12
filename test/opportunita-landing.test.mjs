import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
const html=readFileSync(new URL("../public/opportunita/index.html",import.meta.url),"utf8");
const privacy=readFileSync(new URL("../public/opportunita/privacy.html",import.meta.url),"utf8");
const style=html.match(/<style>([\s\S]*?)<\/style>/)?.[1]??"";
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]??"";
test("public offer prominently names the transaction without a public price",()=>{
  assert.match(html,/<h1 id="hero-title">[\s\S]*?IN CESSIONE<br>O GESTIONE\./);
  assert.match(html,/Lounge bar a Catanzaro Lido/);
  assert.equal((html.match(/<h1\b/g)||[]).length,1);
  assert.doesNotMatch(html,/(?:300[., ]?000|300000|€\s*300)/);
});
test("premium palette does not resurrect the prior green-led visual direction",()=>{
  assert.match(style,/--paper:#f8f9fc/);
  assert.match(style,/--blue:#1955c9/);
  assert.match(style,/--navy:#112746/);
  assert.doesNotMatch(style,/#a73742|#b84531|#66776a|#556958|#354238|#364438/);
  assert.match(style,/--display:'Space Grotesk'/);
  assert.match(style,/\.hero h1 \.emphasis\s*\{[\s\S]*?text-transform:uppercase/);
  assert.match(style,/\.hero-grid-art/);
  assert.match(style,/\.value-card:nth-child\(3\)/);
  assert.match(style,/\.formula-deco/);
  assert.match(style,/\.statement-waves/);
  assert.match(style,/\.end-gridlines/);
});
test("authentic single image and photo attribution",()=>{
  assert.equal((html.match(/<img\b/g)||[]).length,1);
  assert.match(html,/File:Catanzarolidolandscape\.jpg/);
  assert.match(html,/Foto aerea:.*Wikimedia Commons/);
  assert.match(html,/non del lounge bar|non dell.attività commerciale/);
});
test("two-stage conversion flow, optional data, tel and privacy",()=>{
  for(const v of ["cessione","gestione","entrambe"])assert.match(html,new RegExp('data-choice="'+v+'"'));
  assert.match(html,/id="wizard-step-two" hidden/);
  assert.match(html,/id="lead-form"/);
  assert.match(html,/id="full_name"[^>]*required/);
  assert.match(html,/id="phone"[^>]*required/);
  assert.match(html,/id="privacy_accepted"[^>]*required/);
  assert.match(html,/tel:\+393294582962/);
  assert.match(html,/href="\/privacy"/);
  assert.match(html,/\/api\/interesse/);
  assert.match(html,/utm_campaign/);
  assert.match(style,/\.choice-option:nth-child\(3\)\s*\{\s*grid-column:1\/-1/);
  assert.match(style,/@media\(max-width:575px\)/);
  new Script(script,{filename:"opportunita-inline.js"});
});
test("privacy page has consistent color and type system",()=>{
 assert.match(privacy,/Informativa sulla privacy/);
 assert.match(privacy,/#f8f9fc/);
 assert.match(privacy,/Space Grotesk/);
 assert.match(privacy,/info@impresax\.org/);
});
