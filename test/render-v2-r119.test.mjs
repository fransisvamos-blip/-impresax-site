import test from "node:test";
import assert from "node:assert/strict";
import { buildR119SceneComposerSpec, r119SceneComposerViolations, R119_SCENE_COMPOSER_STANDARD } from "../src/render-v2/r119-scene-composer.js";
import { compileRenderSpec } from "../src/render-v2/compiler.js";

const copy={
  HERO_HEADLINE:"Materiali per l’edilizia. Tondo per cemento armato.",
  HERO_BODY:"Distribuzione e lavorazioni per imprese e cantieri.",
  LOCALITY_LINE:"Catanzaro",
  PRIMARY_CTA_LABEL:"Richiedi un preventivo",
  SECONDARY_CTA_LABEL:"Parla con il commerciale",
  POSITIONING_TITLE:"Materia e precisione",
  POSITIONING_BODY:"Forniture e lavorazioni specialistiche per il lavoro reale.",
  SERVICES_TITLE:"Competenze",
  SERVICES_INTRO:"Due attività complementari costruite per il cantiere.",
  SERVICE_1_TITLE:"Materiali per l’edilizia",
  SERVICE_1_BODY:"Distribuzione B2B specializzata.",
  SERVICE_2_TITLE:"Tondo per cemento armato",
  SERVICE_2_BODY:"Lavorazione e trasformazione specializzata.",
  TRUST_TITLE:"La prova è nel lavoro",
  TRUST_INTRO:"Struttura, presenza e competenza.",
  TRUST_1:"Impresa attiva",
  TRUST_2:"Presenza operativa a Catanzaro",
  TRUST_3:"Specializzazione B2B verificata",
  PARTNER_1:"Rivenditore autorizzato U-Power",
  BRIDGE_TITLE:"Contatto diretto",
  BRIDGE_BODY:"Catanzaro",
  CLOSING_TITLE:"Costruiamo il prossimo progetto",
  CLOSING_BODY:"Parliamo delle esigenze del tuo cantiere.",
  FOOTER_LINE:"DEDIL DONATO S.R.L."
};

const assets=[
  "HERO_VISUAL","POSITIONING_VISUAL","SERVICE_MATERIALS_VISUAL",
  "SERVICE_REBAR_VISUAL","TRUST_VISUAL","PARTNER_UPOWER_LOGO"
];

test("R119 replaces repeated section-shell cadence with six campaign scenes",()=>{
  const built=buildR119SceneComposerSpec({copyManifest:copy,assetTokens:assets,hasIdentity:true});
  assert.equal(built.spec.scene_composer_standard,R119_SCENE_COMPOSER_STANDARD);
  assert.deepEqual(built.spec.section_ids,["hero","positioning","services","trust","bridge","final-cta"]);
  assert.equal((built.spec.main_html.match(/data-r119-scene="true"/g)||[]).length,6);
  assert.equal((built.spec.main_html.match(/\bixg-shell\b/g)||[]).length,0);
  assert.equal((built.spec.main_html.match(/\bixg-section-head\b/g)||[]).length,0);
  assert.ok((built.spec.main_html.match(/data-wow-moment="true"/g)||[]).length>=4);
  assert.match(built.spec.main_html,/r119-matter__portrait/);
  assert.match(built.spec.main_html,/r119-rebar__media/);
  assert.match(built.spec.main_html,/r119-proof__partner/);
  assert.match(built.spec.custom_css,/\.r119-matter\{/);
  assert.match(built.spec.custom_css,/\.r119-rebar\{/);
  assert.match(built.spec.custom_css,/@media\(max-width:700px\)/);
});

test("R119 scene composer contract has no deterministic violations",()=>{
  const built=buildR119SceneComposerSpec({copyManifest:copy,assetTokens:assets,hasIdentity:true});
  const manifests={
    copy,
    assets:Object.fromEntries(assets.map(k=>[k,"asset://"+k])),
    cta:{PRIMARY:"mailto:test@example.com",SECONDARY:"tel:+3900000000"},
    identity:{PRIMARY_LOGO:"identity://PRIMARY_LOGO"}
  };
  assert.deepEqual(r119SceneComposerViolations(built.spec.main_html,built.spec.custom_css,built.spec,manifests),[]);
});

test("R119 scene composer compiles under renderer safety contract",async()=>{
  const built=buildR119SceneComposerSpec({copyManifest:copy,assetTokens:assets,hasIdentity:true});
  const compiled=await compileRenderSpec(built.spec,{
    businessName:"DEDIL DONATO",
    logoToken:"identity://PRIMARY_LOGO",
    copyManifest:copy,
    assetManifest:Object.fromEntries(assets.map(k=>[k,"asset://"+k])),
    ctaManifest:{PRIMARY:"mailto:test@example.com",SECONDARY:"tel:+3900000000"}
  });
  assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
});

test("R118 repair cycles route to R119 instead of full-spec AI generation",async()=>{
  const fs=(await import("node:fs")).default;
  const workflows=fs.readFileSync(new URL("../src/render-v2/workflows.js",import.meta.url),"utf8");
  assert.match(workflows,/const r119SceneRepair=r118Mode && \(cycle>=2 \|\| \/R119_SCENE_COMPOSER\/i\.test/);
  assert.match(workflows,/buildR119SceneComposerSpec/);
  assert.match(workflows,/r119_scene_composer:true/);
});
