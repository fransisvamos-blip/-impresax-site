import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { buildZeroPhotoPremiumSpec } from "../src/render-v2/design-grammar.js";
import { compileRenderSpec } from "../src/render-v2/compiler.js";

const copy={
  HERO_HEADLINE:"Costruire senza compromessi",
  HERO_BODY:"Competenza tecnica, lavorazioni e presenza sul territorio.",
  POSITIONING_TITLE:"Materia. Precisione. Cantiere.",
  POSITIONING_BODY:"Una presenza operativa costruita su competenze e servizi verificati.",
  SERVICES_TITLE:"Competenze operative",
  SERVICES_INTRO:"Servizi progettati per il lavoro reale.",
  TRUST_TITLE:"La prova è nel lavoro",
  TRUST_INTRO:"Elementi verificati che sostengono la promessa.",
  BRIDGE_TITLE:"Contatto diretto",
  BRIDGE_BODY:"Catanzaro",
  CLOSING_TITLE:"Il prossimo cantiere parte da qui",
  CLOSING_BODY:"Parliamo del prossimo progetto.",
  LOCALITY_LINE:"Catanzaro",
  PRIMARY_CTA_LABEL:"Parliamone",
  SECONDARY_CTA_LABEL:"Scopri di più",
  FOOTER_LINE:"DEDIL DONATO",
  SERVICE_1_TITLE:"Costruzioni",
  SERVICE_1_BODY:"Attività operativa verificata.",
  SERVICE_2_TITLE:"Lavorazioni tecniche",
  SERVICE_2_BODY:"Competenze verificate.",
  TRUST_1:"Esperienza verificata",
  TRUST_2:"Presenza locale verificata",
  TRUST_3:"Competenze tecniche verificate"
};

test("R118 deterministic seed carries perceptual jury standard and studio spatial system",()=>{
  const built=buildZeroPhotoPremiumSpec({
    variantKey:"A",
    copyManifest:copy,
    hasIdentity:true,
    inputPayload:{render_profile:"IMPRESAX_MASTER_V1",verified_services:["Costruzioni","Lavorazioni tecniche"]},
    sectionAssetTokens:["POSITIONING_VISUAL","SERVICE_MATERIALS_VISUAL","SERVICE_REBAR_VISUAL","TRUST_VISUAL"]
  });
  assert.equal(built.spec.perceptual_flagship_standard,"R118_PERCEPTUAL_JURY_V1");
  assert.match(built.spec.main_html,/data-r118-perceptual-jury="true"/);
  assert.match(built.spec.custom_css,/R118 PERCEPTUAL JURY/);
  assert.match(built.spec.custom_css,/--ix-r118-display:/);
  assert.match(built.spec.custom_css,/\.ixm-graphic-band\{display:none!important\}/);
  assert.match(built.spec.custom_css,/\.ixf-partner-feature\{/);
  assert.match(built.spec.custom_css,/@media\(max-width:700px\)/);
  const r118Css=fs.readFileSync(new URL("../src/render-v2/r118-studio-flagship-css.js",import.meta.url),"utf8");
  assert.doesNotMatch(r118Css,/(?:^|[;{]\s*)content\s*:/im);
});

test("R118 seed still compiles under all existing renderer safety contracts",async()=>{
  const built=buildZeroPhotoPremiumSpec({
    variantKey:"A",
    copyManifest:copy,
    hasIdentity:true,
    inputPayload:{render_profile:"IMPRESAX_MASTER_V1",verified_services:["Costruzioni","Lavorazioni tecniche"]},
    sectionAssetTokens:["POSITIONING_VISUAL","SERVICE_MATERIALS_VISUAL","SERVICE_REBAR_VISUAL","TRUST_VISUAL"]
  });
  const compiled=await compileRenderSpec(built.spec,{
    businessName:"DEDIL DONATO",
    logoToken:"identity://PRIMARY_LOGO",
    copyManifest:copy,
    assetManifest:{
      HERO_VISUAL:"asset://HERO_VISUAL",
      POSITIONING_VISUAL:"asset://POSITIONING_VISUAL",
      SERVICE_MATERIALS_VISUAL:"asset://SERVICE_MATERIALS_VISUAL",
      SERVICE_REBAR_VISUAL:"asset://SERVICE_REBAR_VISUAL",
      TRUST_VISUAL:"asset://TRUST_VISUAL"
    },
    ctaManifest:{PRIMARY:"mailto:test@example.com",SECONDARY:"tel:+3900000000"}
  });
  assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
});

test("R118 is the only route allowed to bypass zero-extra-AI mode for generation and visual jury",()=>{
  const workflows=fs.readFileSync(new URL("../src/render-v2/workflows.js",import.meta.url),"utf8");
  const ai=fs.readFileSync(new URL("../src/render-v2/ai.js",import.meta.url),"utf8");
  const wrangler=fs.readFileSync(new URL("../wrangler.render-v2.jsonc",import.meta.url),"utf8");
  const metrics=fs.readFileSync(new URL("../src/render-v2/metrics.js",import.meta.url),"utf8");

  assert.match(workflows,/r118PerceptualJury/);
  assert.match(workflows,/const r118FirstPass=r118Mode && cycle===1/);
  assert.match(workflows,/allowR118External:context\.r118PerceptualJury===true/);
  assert.match(workflows,/context\.r118PerceptualJury!==true\s*&& EXTERNAL_AI_CALLS_ALLOWED!==true/);
  assert.match(ai,/allowR118External=false/);
  assert.match(ai,/V2_R118_EXTERNAL_AI_ENABLED/);
  assert.match(wrangler,/"V2_EXTERNAL_AI_ENABLED": "false"/);
  assert.match(wrangler,/"V2_R118_EXTERNAL_AI_ENABLED": "true"/);
  assert.match(metrics,/allowR118External=false/);
  assert.match(metrics,/V2_R118_EXTERNAL_AI_ENABLED/);
  assert.match(workflows,/reserveAiCall\(sql,params\.packId,this\.env,"VARIANT_GENERATION:"\+model,revision\.id,\{allowR118External:context\.r118PerceptualJury===true\}\)/);
  assert.match(workflows,/reserveAiCall\(sql,params\.packId,this\.env,"VARIANT_VISUAL_QA:"\+model,revision\.id,\{allowR118External:context\.r118PerceptualJury===true\}\)/);
});


test("R118 jury calibration blocks merely excellent premium work",()=>{
  const ai=fs.readFileSync(new URL("../src/render-v2/ai.js",import.meta.url),"utf8");
  assert.match(ai,/R118 PERCEPTUAL JURY: the previous flagship render was explicitly rejected/);
  assert.match(ai,/R118 SCORE CALIBRATION: 9\.0 means excellent ordinary premium work and is NOT enough/);
  assert.match(ai,/R118 HARD FAIL: repeated centered containers/);
  assert.match(ai,/R118 AUTHORSHIP TEST/);
  assert.match(ai,/R118 PORTFOLIO TEST/);
  assert.match(ai,/R118 MOBILE TEST/);
  assert.match(ai,/const r118PerceptualFloor=/);
  assert.match(ai,/fifteen_k_value_perception:9\.8/);
  assert.match(ai,/anti_template_feel:9\.8/);
  assert.match(ai,/visual_memory_factor:9\.8/);
  assert.match(ai,/cross_viewport_art_direction:9\.8/);
});
