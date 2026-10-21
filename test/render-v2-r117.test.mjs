import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { buildZeroPhotoPremiumSpec } from "../src/render-v2/design-grammar.js";
import { authoredFlagshipViolations } from "../src/render-v2/showroom-policy.js";

const copy={
  HERO_HEADLINE:"Costruire senza compromessi",
  HERO_BODY:"Competenza tecnica, lavorazioni e presenza sul territorio.",
  POSITIONING_TITLE:"Materia. Precisione. Cantiere.",
  POSITIONING_BODY:"Una presenza operativa costruita su competenze e servizi verificati.",
  SERVICES_TITLE:"Competenze operative",
  SERVICES_INTRO:"Servizi progettati per il lavoro reale.",
  TRUST_TITLE:"La prova è nel lavoro",
  TRUST_INTRO:"Elementi verificati che sostengono la promessa.",
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
  SERVICE_3_TITLE:"Supporto operativo",
  SERVICE_3_BODY:"Presenza e capacità sul territorio.",
  TRUST_1:"Esperienza verificata",
  TRUST_2:"Presenza locale verificata",
  TRUST_3:"Competenze tecniche verificate"
};

test("R117 concept A carries authored flagship contract and visual system",()=>{
  const built=buildZeroPhotoPremiumSpec({
    variantKey:"A",
    copyManifest:copy,
    hasIdentity:true,
    inputPayload:{render_profile:"IMPRESAX_MASTER_V1",verified_services:["Costruzioni","Lavorazioni tecniche"]},
    sectionAssetTokens:["POSITIONING_VISUAL","FEATURE_1_VISUAL","FEATURE_2_VISUAL"]
  });
  assert.equal(built.spec.authored_flagship_standard,"R117_AUTHORED_FLAGSHIP_15K_V1");
  assert.equal(built.spec.flagship_architecture_standard,"R117_AUTHORED_FLAGSHIP_15K_V1");
  assert.match(built.spec.main_html,/data-r117-authored-flagship="true"/);
  assert.match(built.spec.main_html,/data-creative-thesis="brand-specific"/);
  assert.match(built.spec.main_html,/data-no-template-test="pass"/);
  assert.match(built.spec.main_html,/data-portfolio-test="pass"/);
  assert.match(built.spec.main_html,/data-mobile-native="true"/);
  assert.ok((built.spec.main_html.match(/data-wow-moment="true"/g)||[]).length>=3);
  assert.ok((built.spec.main_html.match(/data-signature-section="true"/g)||[]).length>=1);
  assert.match(built.spec.custom_css,/--ix-r117-display:/);
  assert.match(built.spec.custom_css,/R117 AUTHORED FLAGSHIP/);
  assert.match(built.spec.custom_css,/@media\(max-width:700px\)/);
});

test("R117 authored flagship gate passes deterministic concept A",()=>{
  const built=buildZeroPhotoPremiumSpec({
    variantKey:"A",
    copyManifest:copy,
    hasIdentity:true,
    inputPayload:{render_profile:"IMPRESAX_MASTER_V1",verified_services:["Costruzioni","Lavorazioni tecniche"]},
    sectionAssetTokens:["POSITIONING_VISUAL","FEATURE_1_VISUAL","FEATURE_2_VISUAL"]
  });
  assert.deepEqual(authoredFlagshipViolations(built.spec.main_html,built.spec.custom_css,built.spec),[]);
});


test("verified partner badge can supply the third flagship proof without using contact data",()=>{
  const sparseTrustCopy={
    ...copy,
    TRUST_1:"Presenza territoriale verificata",
    TRUST_2:"Telefono ed email verificati per il contatto commerciale",
    TRUST_3:"Specializzazione B2B verificata",
    TRUST_BADGE:"RIVENDITORE U-POWER",
    PARTNER_1:"U-POWER",
    PARTNER_SECTION_TITLE:"PARTNER",
    PARTNER_SECTION_INTRO:"Partnership verificata"
  };
  const built=buildZeroPhotoPremiumSpec({
    variantKey:"A",
    copyManifest:sparseTrustCopy,
    hasIdentity:true,
    inputPayload:{render_profile:"IMPRESAX_MASTER_V1",verified_services:["Costruzioni","Lavorazioni tecniche"]},
    sectionAssetTokens:["POSITIONING_VISUAL","SERVICE_MATERIALS_VISUAL","SERVICE_REBAR_VISUAL","TRUST_VISUAL"]
  });
  assert.equal((built.spec.main_html.match(/data-trust-reason=/g)||[]).length,3);
  assert.match(built.spec.main_html,/data-proof-source="verified-partner"/);
  assert.match(built.spec.main_html,/\{\{copy:TRUST_BADGE\}\}/);
  assert.doesNotMatch(built.spec.main_html.match(/<section[^>]*id="trust"[\s\S]*?<\/section>/i)?.[0]||"",/\{\{copy:TRUST_2\}\}/);
});


test("R117 full redesign cannot reuse legacy Cabina copy manifest",()=>{
  const source=fs.readFileSync(new URL("../src/render-v2/workflows.js",import.meta.url),"utf8");
  assert.match(source,/FULL_FLAGSHIP_REDESIGN\|FULL_REDESIGN\|R117_AUTHORED_FLAGSHIP\|AUTHORED_FLAGSHIP/);
});
