import test from "node:test";
import assert from "node:assert/strict";
import { generateR121RenderSpec } from "../src/render-v2/ai.js";
import { R122_DESIRE_ENGINE_STANDARD } from "../src/render-v2/r122-desire-engine.js";

const previousSpec={
  main_html:`
<section id="hero"><a href="{{cta:PRIMARY}}">{{copy:PRIMARY_CTA_LABEL}}</a></section>
<section id="positioning"><h2>{{copy:POSITIONING_TITLE}}</h2><p>{{copy:POSITIONING_BODY}}</p></section>
<section id="services"><h2>{{copy:SERVICES_TITLE}}</h2><p>{{copy:SERVICES_INTRO}}</p></section>
<section id="service-feature-1"></section>
<section id="brand-scene-2"></section>
<section id="trust"><h2>{{copy:TRUST_TITLE}}</h2><p>{{copy:TRUST_INTRO}}</p></section>
<section id="bridge"></section>
<section id="final-cta"><h2>{{copy:CLOSING_TITLE}}</h2><p>{{copy:CLOSING_BODY}}</p><a href="{{cta:PRIMARY}}">{{copy:PRIMARY_CTA_LABEL}}</a></section>
`,
  custom_css:":root{--ix-accent:#b31319}.ix-v2-header{}.ix-v2-header-inner{}.ix-v2-nav{}.ix-v2-header-cta{}.ix-v2-footer{}.ix-v2-footer-grid{}",
  section_ids:["hero","positioning","services","service-feature-1","brand-scene-2","trust","bridge","final-cta"]
};

const copyManifest={
  LOCALITY_LINE:"Catanzaro",
  POSITIONING_TITLE:"",
  POSITIONING_BODY:"",
  SERVICES_TITLE:"Competenze e servizi",
  SERVICES_INTRO:"Catanzaro",
  SERVICE_1_TITLE:"Spedizioni e logistica",
  TRUST_TITLE:"Esperienza e affidabilità",
  TRUST_INTRO:"",
  TRUST_1:"Operatore postale presente nell'elenco MIMIT 2026",
  TRUST_2:"sede Catanzaro Lido",
  TRUST_3:"4,4/5 su 187 recensioni Google.",
  BRIDGE_TITLE:"Contatto diretto",
  CLOSING_TITLE:"Parliamone",
  CLOSING_BODY:"",
  PRIMARY_CTA_LABEL:"RICHIEDI UN PREVENTIVO",
  SECONDARY_CTA_LABEL:"TRACCIA LA SPEDIZIONE"
};

test("R122 deterministic repair preserves compiler copy contracts and inherits the brand accent",async()=>{
  const result=await generateR121RenderSpec({},{
    inputPayload:{r122_desire_engine_standard:R122_DESIRE_ENGINE_STANDARD},
    direction:{},
    variantKey:"A",
    copyManifest,
    assetTokens:["R121_SCALE","R121_MATERIAL_MACRO","R121_PROCESS","R121_STRUCTURE","R121_DETAIL","R121_ATMOSPHERE"],
    concept:{
      selection_rationale:"R122_DETERMINISTIC_PREPRODUCTION_LOCK regression fixture",
      campaign_thesis:"Brand-specific campaign",
      brand_world:"Official identity sampled at execution time"
    },
    previousSpec
  });

  assert.equal(result.deterministic,true);
  assert.match(result.spec.main_html,/id="positioning"[\\s\\S]*{{copy:POSITIONING_TITLE}}[\\s\\S]*{{copy:POSITIONING_BODY}}/);
  assert.match(result.spec.main_html,/id="services"[\\s\\S]*{{copy:SERVICES_TITLE}}[\\s\\S]*{{copy:SERVICES_INTRO}}/);
  assert.match(result.spec.main_html,/id="trust"[\\s\\S]*{{copy:TRUST_TITLE}}[\\s\\S]*{{copy:TRUST_INTRO}}/);
  assert.match(result.spec.main_html,/id="final-cta"[\\s\\S]*{{copy:CLOSING_TITLE}}[\\s\\S]*{{copy:CLOSING_BODY}}[\\s\\S]*{{cta:PRIMARY}}/);
  assert.match(result.spec.custom_css,/--r122-accent:var\\(--ix-accent\\)/);
  assert.doesNotMatch(result.spec.custom_css,/#1455b5|--r122-blue/);
  assert.match(result.spec.custom_css,/r122-positioning-caption h2:empty/);
});
