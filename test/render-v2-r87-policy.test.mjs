import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  SHOWROOM_RULES_VERSION,
  RENDER_GENERATION_MODE,
  EXTERNAL_AI_CALLS_ALLOWED,
  MIN_SECTION_VISUALS
} from "../src/render-v2/constants.js";
import {
  isLowValueHomepageFact,
  filterHomepageTrustPoints,
  copyPolicyViolations,
  sectionVisualTokens,
  showroomPolicySummary,
  brandRichSurfaceViolations,
  watermarkVisibilityViolations,
  launchGradeViolations,
  typographyCompositionViolations
} from "../src/render-v2/showroom-policy.js";
import { buildCopyManifest } from "../src/render-v2/ai.js";

test("R93 showroom standard is the global zero-extra-AI typography contract",()=>{
  assert.equal(SHOWROOM_RULES_VERSION,"IMPRESAX_RENDER_STANDARD_R93_LAUNCH_GRADE_TYPOGRAPHY_V1");
  assert.equal(RENDER_GENERATION_MODE,"CHATGPT_CABINA_ZERO_EXTRA_AI");
  assert.equal(EXTERNAL_AI_CALLS_ALLOWED,false);
  assert.equal(MIN_SECTION_VISUALS,3);
  assert.equal(showroomPolicySummary().visual.minimum_section_visuals,3);
  assert.equal(showroomPolicySummary().visual.section_surfaces,"ART_DIRECTED_LAYERED_BRAND_SPECIFIC");
  assert.equal(showroomPolicySummary().visual.minimum_brand_rich_sections,2);
  assert.equal(showroomPolicySummary().visual.logo_watermark,"REQUIRED_WHEN_OFFICIAL_LOGO_EXISTS_VISIBLE_BUT_RESTRAINED");
  assert.equal(showroomPolicySummary().visual.neutral_only_page,"FORBIDDEN");
  assert.equal(showroomPolicySummary().visual.brand_color_presence,"MEANINGFUL_CHROMATIC_FIELDS_REQUIRED");
  assert.equal(showroomPolicySummary().visual.north_star,"WORLD_CLASS_LAUNCH_EXPERIENCE_UNLIMITED_BUDGET");
  assert.equal(showroomPolicySummary().visual.minimum_spectacle_moments,2);
  assert.equal(showroomPolicySummary().visual.generic_premium_corporate,"FAIL");
  assert.equal(showroomPolicySummary().visual.hero_full_bleed,"EDGE_TO_EDGE_BACKGROUND_ZERO_LATERAL_MARGIN");
  assert.equal(showroomPolicySummary().visual.text_breathing,"REQUIRED_NO_CROWDING");
  assert.equal(showroomPolicySummary().visual.responsive_typography,"INDEPENDENT_DESKTOP_MOBILE_OPTIMIZATION");
  assert.equal(showroomPolicySummary().visual.font_system,"DISTINCTIVE_BRAND_FIT_DISPLAY_AND_BODY");
  assert.equal(showroomPolicySummary().visual.header_menu,"PROFESSIONAL_BRAND_EXPERIENCE_ENTRY");
  assert.equal(showroomPolicySummary().visual.footer,"PROFESSIONAL_BRAND_EXPERIENCE_CLOSING");
});

test("revenue and headcount remain source evidence but are suppressed from homepage proof",()=>{
  assert.equal(isLowValueHomepageFact("Fatturato 2025 di €17,94 milioni"),true);
  assert.equal(isLowValueHomepageFact("19 dipendenti"),true);
  assert.equal(isLowValueHomepageFact("Rivenditore autorizzato U-Power"),false);
  const filtered=filterHomepageTrustPoints([
    {text:"Fatturato 2025 di €17,94 milioni"},
    {text:"19 dipendenti"},
    {text:"Rivenditore autorizzato U-Power"}
  ]);
  assert.deepEqual(filtered.map(x=>x.text),["Rivenditore autorizzato U-Power"]);
});

test("copy manifest never turns revenue or employees into homepage metrics",()=>{
  const manifest=buildCopyManifest({
    hero_headline:"Materiali per edilizia",
    hero_body:"Supporto professionale per imprese.",
    positioning_title:"Un partner operativo",
    positioning_body:"Servizio diretto per il cantiere.",
    services_title:"Competenze",
    services_intro:"Soluzioni per il lavoro.",
    trust_title:"Solidità",
    trust_intro:"Segnali concreti.",
    closing_title:"Parliamone",
    closing_body:"Contatta il reparto commerciale.",
    locality_line:"Catanzaro",
    primary_cta_label:"Contatti",
    secondary_cta_label:"Approfondisci",
    services:[{title:"Materiali per edilizia",description:"Forniture professionali per imprese."}],
    trust_points:[
      {text:"Fatturato 2025 di €17,94 milioni"},
      {text:"19 dipendenti"},
      {text:"Rivenditore autorizzato U-Power"}
    ]
  },{brand_gate_mode:"LOGO_FIRST_V1",city:"Catanzaro"});
  const values=Object.values(manifest).join(" | ");
  assert.doesNotMatch(values,/17,94|dipendenti/i);
  assert.equal(manifest.TRUST_1,"Rivenditore autorizzato U-Power");
  assert.equal(manifest.TRUST_METRIC_1,"U-Power");
  assert.equal(manifest.TRUST_METRIC_LABEL_1,"Rivenditore autorizzato");
  assert.equal(manifest.TRUST_METRIC_2,undefined);
});

test("policy detects cheap internal copy and section visual inventory",()=>{
  const issues=copyPolicyViolations({
    TRUST_TITLE:"Dati verificati",
    TRUST_1:"19 dipendenti",
    CLOSING_BODY:"Parliamo del tuo progetto."
  },["TRUST_TITLE","TRUST_1","CLOSING_BODY"]);
  assert.ok(issues.includes("INTERNAL_OR_GENERIC_COPY_VISIBLE:TRUST_TITLE"));
  assert.ok(issues.includes("LOW_VALUE_CORPORATE_STAT_VISIBLE:TRUST_1"));

  assert.deepEqual(sectionVisualTokens({
    PRIMARY_LOGO:{role:"identity",mime:"image/svg+xml"},
    HERO_VISUAL:{role:"hero",mime:"image/jpeg"},
    PHOTO_A:{mime:"image/jpeg"},
    PHOTO_B:{mime:"image/webp"},
    PHOTO_C:{mime:"image/jpeg"},
    BROKEN:{mime:"image/jpeg",unavailable:true}
  }),["PHOTO_A","PHOTO_B","PHOTO_C"]);
});

test("workflow and compiler contain hard R90 gates",async()=>{
  const [workflow,compiler,metrics]=await Promise.all([
    readFile(new URL("../src/render-v2/workflows.js",import.meta.url),"utf8"),
    readFile(new URL("../src/render-v2/compiler.js",import.meta.url),"utf8"),
    readFile(new URL("../src/render-v2/metrics.js",import.meta.url),"utf8")
  ]);
  assert.match(workflow,/SECTION_VISUALS_REQUIRED/);
  assert.match(workflow,/CABINA_PRECOMPUTE_REQUIRED/);
  assert.match(compiler,/SECTION_VISUAL_DENSITY_REQUIRED/);
  assert.match(compiler,/SECTION_VISUAL_DISTRIBUTION_REQUIRED/);
  assert.match(compiler,/BRAND_RICH_SURFACES_REQUIRED/);
  assert.match(compiler,/OFFICIAL_LOGO_WATERMARK_REQUIRED/);
  assert.match(metrics,/EXTERNAL_AI_DISABLED/);
});


test("flat section surface policy rejects strong single-fill bands",async()=>{
  const { flatStrongSectionBackgroundViolations } = await import("../src/render-v2/showroom-policy.js");
  const main='<section id="value" class="surface" data-surface="art-directed"></section>';
  assert.deepEqual(flatStrongSectionBackgroundViolations(main,'.surface{background:#111315}'),["FLAT_STRONG_SECTION_BACKGROUND_FORBIDDEN:value"]);
  assert.deepEqual(flatStrongSectionBackgroundViolations(main,'.surface{background:linear-gradient(135deg,#f4f1ea,#fff)}'),[]);
});


test("R90 compiler contract requires brand-rich surfaces and watermark",async()=>{
  const compiler=await readFile(new URL("../src/render-v2/compiler.js",import.meta.url),"utf8");
  assert.match(compiler,/data-brand-surface/);
  assert.match(compiler,/data-brand-watermark/);
  assert.match(compiler,/BRAND_RICH_SURFACES_REQUIRED/);
  assert.match(compiler,/OFFICIAL_LOGO_WATERMARK_REQUIRED/);
});


test("R90 rich-surface gate rejects labels without actual chromatic layering",()=>{
  const main=[
    '<section id="services" data-surface="art-directed" data-brand-surface="secondary" class="services"></section>',
    '<section id="bridge" data-surface="art-directed" data-brand-surface="tint" class="bridge"></section>'
  ].join("");
  assert.deepEqual(
    brandRichSurfaceViolations(main,'.services{background:#fff}.bridge{background:#f4f1ea}',2),
    ["BRAND_RICH_LAYERED_SURFACES_REQUIRED:0/2"]
  );
  assert.deepEqual(
    brandRichSurfaceViolations(main,':root{--brand:#B31319}.services{background:linear-gradient(135deg,#fff,var(--brand))}.bridge{background:radial-gradient(circle,rgba(179,19,25,.18),transparent)}',2),
    []
  );
});

test("R90 watermark gate requires restrained but perceptible opacity",()=>{
  const main='<section id="final-cta" data-surface="art-directed" data-brand-surface="primary" class="final"><div class="mark" data-brand-watermark>{{identity:PRIMARY_LOGO}}</div></section>';
  assert.deepEqual(
    watermarkVisibilityViolations(main,'.mark .ix-v2-identity-main{opacity:.03}'),
    ["OFFICIAL_LOGO_WATERMARK_VISIBILITY_REQUIRED:TOO_FAINT:0.030"]
  );
  assert.deepEqual(
    watermarkVisibilityViolations(main,'.mark .ix-v2-identity-main{opacity:.12}'),
    []
  );
});

test("R90 hard-disables external AI in ai.js",async()=>{
  const ai=await readFile(new URL("../src/render-v2/ai.js",import.meta.url),"utf8");
  assert.match(ai,/EXTERNAL_AI_CALLS_ALLOWED!==true/);
});


test("R90 launch-grade contract requires reveal hero and spectacle moments",()=>{
  const weak='<section id="hero"></section><section id="services" data-surface="art-directed"></section>';
  assert.deepEqual(launchGradeViolations(weak,2),[
    "LAUNCH_GRADE_HERO_REQUIRED",
    "SPECTACLE_MOMENTS_REQUIRED:0/2",
    "STAGE_DEPTH_REQUIRED:0/2"
  ]);
  const strong=[
    '<section id="hero" data-launch-hero="true" data-stage-depth="cinematic"></section>',
    '<section id="services" data-surface="art-directed" data-spectacle-moment="true" data-stage-depth="editorial"></section>',
    '<section id="final-cta" data-surface="art-directed" data-spectacle-moment="true" data-stage-depth="cinematic"></section>'
  ].join("");
  assert.deepEqual(launchGradeViolations(strong,2),[]);
});


test("R93 typography composition gate blocks boxed or generic layouts",()=>{
  const weak='<section id="hero" data-launch-hero="true"></section><section data-copy-density="controlled"></section>';
  const weakCss=':root{--ix-display-font:Arial;--ix-body-font:Arial}.x{font-size:20px}@media(max-width:820px){.x{font-size:16px}}';
  const issues=typographyCompositionViolations(weak,weakCss);
  assert.ok(issues.includes("HERO_FULL_BLEED_REQUIRED"));
  assert.ok(issues.includes("RESPONSIVE_TYPOGRAPHY_MARKER_REQUIRED"));
  assert.ok(issues.some(x=>x.startsWith("COPY_DENSITY_CONTROL_REQUIRED:")));
  assert.ok(issues.includes("HEADLINE_BALANCE_REQUIRED"));
  assert.ok(issues.includes("BODY_TEXT_PRETTY_WRAP_REQUIRED"));
  assert.ok(issues.includes("GENERIC_DISPLAY_FONT_STACK_FORBIDDEN"));
  assert.ok(issues.includes("PROFESSIONAL_HEADER_NAV_REQUIRED"));
  assert.ok(issues.includes("PROFESSIONAL_FOOTER_REQUIRED"));

  const strong=[
    '<section id="hero" data-launch-hero="true" data-hero-full-bleed="true" data-typography-system="responsive" data-copy-density="controlled"></section>',
    '<section data-copy-density="controlled"></section>',
    '<section data-copy-density="controlled"></section>',
    '<section data-copy-density="controlled"></section>'
  ].join("");
  const strongCss=':root{--ix-display-font:Bahnschrift,"Arial Narrow",sans-serif;--ix-body-font:Inter,Aptos,sans-serif}.x h1{text-wrap:balance}.x p{text-wrap:pretty}.ix-v2-header{backdrop-filter:blur(12px)}.ix-v2-nav{display:flex}.ix-v2-footer{display:block}.ix-v2-footer-grid{display:grid}@media(max-width:820px){.x h1{font-size:clamp(42px,11vw,60px);line-height:.96}}';
  assert.deepEqual(typographyCompositionViolations(strong,strongCss),[]);
});
