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
  TRUST_1_LABEL:"Forniture",
  TRUST_1_BODY:"Distribuzione B2B specializzata nei materiali per l’edilizia.",
  TRUST_2:"Presenza operativa a Catanzaro",
  TRUST_2_LABEL:"Lavorazioni",
  TRUST_2_BODY:"Lavorazione e trasformazione del tondo per cemento armato.",
  TRUST_3:"Specializzazione B2B verificata",
  TRUST_3_LABEL:"Territorio",
  TRUST_3_BODY:"Catanzaro",
  PARTNER_1:"Rivenditore autorizzato U-Power",
  PARTNER_SECTION_TITLE:"U-Power",
  PARTNER_SECTION_INTRO:"Rivenditore autorizzato verificato.",
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

test("R119 replaces repeated section-shell cadence with eight evidence-led campaign scenes",()=>{
  const built=buildR119SceneComposerSpec({copyManifest:copy,assetTokens:assets,hasIdentity:true});
  assert.equal(built.spec.scene_composer_standard,R119_SCENE_COMPOSER_STANDARD);
  assert.deepEqual(built.spec.section_ids,["hero","positioning","materials","services","trust","partners","bridge","final-cta"]);
  assert.equal((built.spec.main_html.match(/data-r119-scene="true"/g)||[]).length,8);
  assert.equal((built.spec.main_html.match(/\bixg-shell\b/g)||[]).length,0);
  assert.equal((built.spec.main_html.match(/\bixg-section-head\b/g)||[]).length,0);
  assert.ok((built.spec.main_html.match(/data-wow-moment="true"/g)||[]).length>=4);
  assert.match(built.spec.main_html,/r119-positioning__identity/);
  assert.match(built.spec.main_html,/r119-materials__structure/);
  assert.match(built.spec.main_html,/r119-rebar__media/);
  assert.match(built.spec.main_html,/id="partners"/);
  assert.match(built.spec.main_html,/r119-proof__partner/);
  assert.match(built.spec.custom_css,/\.r119-positioning\{/);
  assert.match(built.spec.custom_css,/\.r119-materials\{/);
  assert.match(built.spec.custom_css,/\.r119-rebar\{/);
  assert.match(built.spec.custom_css,/@media\(max-width:700px\)/);
});

test("R119 jury-reset composer densifies proof, uses positioning media and changes spatial composition",()=>{
  const built=buildR119SceneComposerSpec({copyManifest:copy,assetTokens:assets,hasIdentity:true,mode:"jury-reset"});
  assert.match(built.spec.main_html,/r119-jury-reset/);
  assert.match(built.spec.main_html,/r119-positioning__media/);
  assert.match(built.spec.main_html,/r119-proof__mark ixg-trust-reason__graphic/);
  assert.match(built.spec.main_html,/data-partner-verification="verified-only"/);
  assert.match(built.spec.custom_css,/\.r119-hero\.r119-jury-reset/);
  assert.match(built.spec.custom_css,/\.r119-materials\.r119-jury-reset/);
  assert.match(built.spec.implementation_notes,/Scene mode: jury-reset/);
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

test("R119 fast loop is authored-first and uses one jury-driven structural reset",async()=>{
  const fs=(await import("node:fs")).default;
  const workflows=fs.readFileSync(new URL("../src/render-v2/workflows.js",import.meta.url),"utf8");
  assert.match(workflows,/const r119Requested=/);
  assert.match(workflows,/\/R119_\/i\.test\(initialReason\)/);
  assert.match(workflows,/const r118PerceptualJury=[\s\S]*\|\| r119Requested;/);
  assert.match(workflows,/if\(r119Mode\)/);
  assert.match(workflows,/r119_fast_authored:true/);
  assert.match(workflows,/mode:cycle>1 && r119JuryReset \? "jury-reset" : "base"/);
  assert.match(workflows,/const r119ForceHardReset=context\.r119Requested===true && cycle===1/);
  assert.match(workflows,/R119 FAST HARD RESET/);
  assert.doesNotMatch(workflows,/const r119GenerativeFirstPass=/);
  assert.doesNotMatch(workflows,/const r119SeedPass=/);
});


test("R119 generative mode enforces real section depth and DEDIL evidence",async()=>{
  const fs=(await import("node:fs")).default;
  const ai=fs.readFileSync(new URL("../src/render-v2/ai.js",import.meta.url),"utf8");
  assert.match(ai,/const r119EvidenceActive=allowR118External/);
  assert.match(ai,/r119EvidenceMode===true/);
  assert.match(ai,/DEDIL R119 NARRATIVE/);
  assert.match(ai,/SECTION_ID INTEGRITY/);
  assert.match(ai,/R111 ACTUAL DEPTH/);
  assert.match(ai,/ART-DIRECTED SURFACES/);
  assert.match(ai,/SECTION VISUAL DENSITY/);
  assert.match(ai,/R118\/R119 FLAGSHIP OUTPUT FLOOR/);
  assert.match(ai,/main_html:\{type:"string",minLength:5000\}/);
  assert.match(ai,/custom_css:\{type:"string",minLength:6500\}/);
  assert.match(ai,/R112_SECTION_SUBSTANCE_COMMERCIAL_DEPTH_V1/);
  assert.match(ai,/schema:allowR118External\?r118FlagshipRenderSpecSchema:renderSpecSchema/);
  assert.match(ai,/section_blueprint:actualSectionIds\.length\?actualSectionIds/);
  assert.match(ai,/\^R119_\/i\.test/);
});

test("R119 hero exposes canonical browser-gate hooks",()=>{
  const built=buildR119SceneComposerSpec({copyManifest:copy,assetTokens:assets,hasIdentity:true});
  assert.match(built.spec.main_html,/class="r119-lede ixg-lede"/);
  assert.match(built.spec.main_html,/class="r119-actions ixg-actions"/);
});


test("R119 perceptual fixes remove placeholder geometry and stock-scene dependence",()=>{
  const built=buildR119SceneComposerSpec({copyManifest:copy,assetTokens:assets,hasIdentity:true});
  const html=built.spec.main_html;
  const css=built.spec.custom_css;
  assert.doesNotMatch(html,/r119-hero__rail/);
  assert.doesNotMatch(html,/r119-rebar__engineering/);
  assert.doesNotMatch(html,/r119-close__rail/);
  assert.match(html,/POSITIONING_VISUAL/);
  assert.doesNotMatch(html,/TRUST_VISUAL/);
  assert.equal((html.match(/\{\{copy:SERVICE_1_TITLE\}\}/g)||[]).length,1);
  assert.equal((html.match(/\{\{copy:SERVICE_2_TITLE\}\}/g)||[]).length,1);
  assert.match(css,/font-size:clamp\(64px,7\.2vw,122px\)/);
  assert.match(css,/\.r119-rebar\{[^}]*display:grid/);
  assert.match(css,/\.r119-rebar__title\{position:relative/);
  assert.match(css,/\.r119-rebar__body\{position:relative/);
  assert.match(css,/\.r119-materials__structure\{[^}]*width:min\(620px,48vw\)/);
  assert.match(css,/\.r119-materials__structure\{right:-20vw;top:80px/);
  assert.match(css,/\.r119-partner\{min-height:640px/);
});


test("R119 evidence detection covers EIGHT_SCENE, EVIDENCE and FAST relaunch reasons",async()=>{
  const fs=(await import("node:fs")).default;
  const workflows=fs.readFileSync(new URL("../src/render-v2/workflows.js",import.meta.url),"utf8");
  assert.match(workflows,/packMetadata\.r119_eight_scene_evidence===true/);
  assert.match(workflows,/\/R119_\/i\.test/);
  assert.match(workflows,/const r119EvidenceNarrative=r119Requested/);
  assert.match(workflows,/const r119MaterialHero=context\.r119Requested===true/);
  assert.match(workflows,/r119EvidenceMode:context\.r119Requested===true/);
});

test("R119 workflow strips economic vanity metrics and binds a distinct industrial hero",async()=>{
  const fs=(await import("node:fs")).default;
  const workflows=fs.readFileSync(new URL("../src/render-v2/workflows.js",import.meta.url),"utf8");
  assert.match(workflows,/const r119EvidenceNarrative=r119Requested/);
  assert.match(workflows,/copyManifest\.TRUST_1=materialService/);
  assert.match(workflows,/Distribuzione B2B di materiali per l’edilizia/);
  assert.match(workflows,/copyManifest\.TRUST_2=rebarService/);
  assert.match(workflows,/Lavorazione del tondo per cemento armato/);
  assert.match(workflows,/copyManifest\.TRUST_3=city/);
  assert.match(workflows,/R119_DISTINCT_VERIFIED_INDUSTRIAL_HERO/);
  assert.match(workflows,/context\.assets\?\.TRUST_VISUAL/);
  assert.match(workflows,/context\.assets\.POSITIONING_VISUAL/);
  assert.match(workflows,/context\.assets\.SERVICE_MATERIALS_VISUAL/);
});

test("pilot pack upgrades reuse only same-prospect verified licensed section assets",async()=>{
  const fs=(await import("node:fs")).default;
  const workflows=fs.readFileSync(new URL("../src/render-v2/workflows.js",import.meta.url),"utf8");
  assert.match(workflows,/prior\.prospect_id=current_pack\.prospect_id/);
  assert.match(workflows,/section_visuals_provenance/);
  assert.match(workflows,/provenance_license/);
  assert.match(workflows,/LICENSED_EDITORIAL_REUSED/);
  assert.match(workflows,/cross_pack_reused:true/);
  assert.match(workflows,/verified_partner_logo_required/);
});

test("pilot planning can run without spawning a render and R119 kick stays generative",async()=>{
  const fs=(await import("node:fs")).default;
  const workflows=fs.readFileSync(new URL("../src/render-v2/workflows.js",import.meta.url),"utf8");
  const index=fs.readFileSync(new URL("../src/render-v2/index.js",import.meta.url),"utf8");
  assert.match(workflows,/if\(p\.planOnly===true\)/);
  assert.match(workflows,/currentStep:"PILOT_PLAN_READY"/);
  assert.match(index,/async function runPilotManualParentKick/);
  assert.match(index,/planOnly:true/);
  assert.match(index,/state\.phase!=="PILOT_SINGLE_PROSPECT"/);
  assert.match(index,/packId!==String\(state\.pilot_pack_id\|\|""\)/);
  assert.match(index,/const r119Generative=\/\^R119_\/i\.test\(reason\)/);
  assert.match(index,/cabina_precomputed:!generativeRedesign/);
  assert.match(index,/Generate a genuinely new flagship composition under the active R119\/R118 architecture/);
});



test("R119 fast generation avoids duplicate full-page fallbacks and normalizes schema in place",async()=>{
  const fs=(await import("node:fs")).default;
  const ai=fs.readFileSync(new URL("../src/render-v2/ai.js",import.meta.url),"utf8");
  const workflows=fs.readFileSync(new URL("../src/render-v2/workflows.js",import.meta.url),"utf8");
  assert.match(ai,/const fastR118Generation=!qaRole && allowR118External===true/);
  assert.match(ai,/V2_R118_FAST_GENERATOR_MODEL\|\|DEFAULT_MODELS\.codeFallback/);
  assert.match(ai,/V2_R118_FAST_GENERATOR_TIMEOUT_MS\|\|75000/);
  assert.match(ai,/const plan=\(fastR118Qa\|\|fastR118Generation\)/);
  assert.match(ai,/const canNormalize=schemaInvalid && \(qaRole \|\| fastR118Generation\)/);
  assert.match(ai,/Normalize the supplied generated homepage object/);
  assert.match(ai,/roughly within 5k-14k characters/);
  assert.match(workflows,/retries:\{limit:context\.r119Requested===true\?0:1/);
});


test("R119 first provider failure falls through to deterministic scene composer and jury path",async()=>{
  const fs=(await import("node:fs")).default;
  const workflows=fs.readFileSync(new URL("../src/render-v2/workflows.js",import.meta.url),"utf8");
  assert.match(workflows,/const r119SceneFailover=context\.r119Requested===true && !budget && providerFailoverDomain && \(cycle===1 \|\| \(cycle===2 && r119JuryReset\)\)/);
  assert.match(workflows,/R119_PROVIDER_SCENE_FAILOVER/);
  assert.match(workflows,/generation-provider-r119-scene-failover/);
  assert.match(workflows,/buildR119SceneComposerSpec\(\{/);
  assert.match(workflows,/mode:cycle===2 && r119JuryReset \? "jury-reset" : "base"/);
});


test("R119 compiler failures stay deterministic and never open AI compiler repair",async()=>{
  const fs=(await import("node:fs")).default;
  const workflows=fs.readFileSync(new URL("../src/render-v2/workflows.js",import.meta.url),"utf8");
  assert.match(workflows,/context\.r118PerceptualJury===true && context\.r119Requested!==true/);
  assert.match(workflows,/TRUST_1_BODY=materialService[\s\S]*Attività di distribuzione B2B nel comparto dei materiali per l’edilizia/);
  assert.match(workflows,/TRUST_2_BODY=rebarService[\s\S]*Attività specializzata nella lavorazione e trasformazione del tondo destinato al cemento armato/);
});
