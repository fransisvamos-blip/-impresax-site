import test from "node:test";
import assert from "node:assert/strict";
import { validateRenderSpec, compileRenderSpec } from "../src/render-v2/compiler.js";
import { classifyFailure, shouldChangeStrategy } from "../src/render-v2/failure-policy.js";
import { stableStringify, safeExternalHttpUrl } from "../src/render-v2/utils.js";
import { normalizeVerifiedPhone, buildContactManifest } from "../src/render-v2/contacts.js";
import { sanitizeDirectionForExecution, buildZeroPhotoPremiumSpec } from "../src/render-v2/design-grammar.js";
import { extractStructured, normalizeSetQaResult } from "../src/render-v2/ai.js";

const manifests={
  copy:{
    HERO_HEADLINE:"Titolo",HERO_BODY:"Testo",
    POSITIONING_TITLE:"Posizionamento",POSITIONING_BODY:"Contesto verificato",
    SERVICES_TITLE:"Servizi",SERVICES_INTRO:"Una selezione di servizi verificati",
    TRUST_TITLE:"Perché scegliere noi",TRUST_INTRO:"Elementi verificati",
    CLOSING_TITLE:"Parliamone",CLOSING_BODY:"Contattaci per approfondire",
    PRIMARY_CTA_LABEL:"Contatta",SECONDARY_CTA_LABEL:"Scrivici",
    LOCALITY_LINE:"Catanzaro",FOOTER_LINE:"Example SRL",
    SERVICE_1_TITLE:"Servizio",SERVICE_1_BODY:"Descrizione",
    TRUST_1:"Presenza verificata"
  },
  assets:{HERO_01:"asset://HERO_01",HERO_VISUAL:"asset://HERO_VISUAL"},
  cta:{PRIMARY:"tel:+390000000",SECONDARY:"mailto:info@example.it"}
};

const premiumMain=[
  '<section id="hero" class="hero"><div class="hero-copy"><p>{{copy:LOCALITY_LINE}}</p><h1>{{copy:HERO_HEADLINE}}</h1><p>{{copy:HERO_BODY}}</p><div class="hero-actions"><a class="primary" href="{{cta:PRIMARY}}">{{copy:PRIMARY_CTA_LABEL}}</a><a class="secondary" href="{{cta:SECONDARY}}">{{copy:SECONDARY_CTA_LABEL}}</a></div></div><figure class="hero-media"><img src="{{asset:HERO_VISUAL}}" alt=""></figure></section>',
  '<section id="positioning"><div class="section-shell"><header class="section-head"><p>{{copy:LOCALITY_LINE}}</p><h2>{{copy:POSITIONING_TITLE}}</h2></header><div class="section-body"><p>{{copy:POSITIONING_BODY}}</p><p>{{copy:POSITIONING_BODY}}</p><p>{{copy:LOCALITY_LINE}}</p></div></div></section>',
  '<section id="services"><div class="section-shell"><header class="section-head"><h2>{{copy:SERVICES_TITLE}}</h2><p>{{copy:SERVICES_INTRO}}</p></header><div class="service-grid"><article><h3>{{copy:SERVICE_1_TITLE}}</h3><p>{{copy:SERVICE_1_BODY}}</p></article><article><h3>{{copy:SERVICE_1_TITLE}}</h3><p>{{copy:SERVICE_1_BODY}}</p></article><article><h3>{{copy:SERVICE_1_TITLE}}</h3><p>{{copy:SERVICE_1_BODY}}</p></article></div></div></section>',
  '<section id="trust"><div class="section-shell"><header class="section-head"><h2>{{copy:TRUST_TITLE}}</h2><p>{{copy:TRUST_INTRO}}</p></header><div class="trust-grid"><article><p>{{copy:TRUST_1}}</p></article><article><p>{{copy:TRUST_1}}</p></article><article><p>{{copy:TRUST_1}}</p></article></div></div></section>',
  '<section id="bridge"><div class="section-shell bridge-grid"><div><p>{{copy:LOCALITY_LINE}}</p><h2>{{copy:POSITIONING_TITLE}}</h2></div><div><p>{{copy:POSITIONING_BODY}}</p><a href="{{cta:SECONDARY}}">{{copy:SECONDARY_CTA_LABEL}}</a></div></div></section>',
  '<section id="final-cta"><div class="section-shell final-grid"><div><p>{{copy:LOCALITY_LINE}}</p><h2>{{copy:CLOSING_TITLE}}</h2><p>{{copy:CLOSING_BODY}}</p></div><div><a href="{{cta:PRIMARY}}">{{copy:PRIMARY_CTA_LABEL}}</a><a href="{{cta:SECONDARY}}">{{copy:SECONDARY_CTA_LABEL}}</a></div></div></section>'
].join("");

const premiumCss=(
  ".ix-v2-header{background:#fff;color:#111;border-bottom:1px solid rgba(17,17,17,.12)}"+
  ".ix-v2-header-inner{min-height:96px;display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:32px}"+
  ".ix-v2-nav{display:flex;align-items:center;gap:28px}.ix-v2-nav a{text-decoration:none;font-weight:600}"+
  ".ix-v2-header-cta{display:inline-flex;min-height:46px;padding:0 22px;align-items:center;justify-content:center;background:#111;color:#fff}"+
  ".ix-v2-footer{background:#111;color:#fff;padding:72px 5vw}.ix-v2-footer-grid{display:grid;grid-template-columns:1.2fr .6fr 1fr;gap:56px}"+
  ".ix-v2-footer-nav{display:grid;gap:16px}.ix-v2-footer-contact-block{display:grid;gap:18px}"+
  ".hero{min-height:82vh;padding:6vw;display:grid;grid-template-columns:1.05fr .95fr;gap:56px;align-items:center}"+
  ".hero-copy{display:grid;gap:22px}.hero h1{font-size:clamp(48px,7vw,112px);line-height:.9;letter-spacing:-.05em;margin:0}"+
  ".hero-media{min-height:560px;margin:0;overflow:hidden}.hero-media img{width:100%;height:100%;object-fit:cover}"+
  ".hero-actions{display:flex;gap:12px;flex-wrap:wrap}.hero-actions a{display:inline-flex;min-height:52px;padding:0 24px;align-items:center;justify-content:center;text-decoration:none;border:1px solid currentColor}"+
  ".section-shell{width:min(1240px,calc(100% - 64px));margin:0 auto}.section-head{display:grid;grid-template-columns:.65fr 1.35fr;gap:42px;align-items:end;margin-bottom:42px}"+
  ".section-body,.service-grid,.trust-grid,.bridge-grid,.final-grid{display:grid;gap:28px}.service-grid,.trust-grid{grid-template-columns:repeat(3,1fr)}"+
  "section{padding:clamp(72px,8vw,126px) 0}article{padding:32px;border-top:1px solid rgba(17,17,17,.18)}"+
  ".bridge-grid,.final-grid{grid-template-columns:1.1fr .9fr;align-items:end}.final-grid a{display:inline-flex;margin:8px;padding:14px 20px;border:1px solid currentColor;text-decoration:none}"+
  "@media(max-width:700px){.ix-v2-header-inner{grid-template-columns:1fr auto}.ix-v2-nav{grid-column:1/-1;overflow-x:auto;padding-bottom:14px}.ix-v2-footer-grid,.hero,.section-head,.service-grid,.trust-grid,.bridge-grid,.final-grid{grid-template-columns:1fr}.hero{min-height:auto;padding:48px 20px}.hero-media{min-height:340px}.hero h1{font-size:clamp(42px,12vw,64px)}.section-shell{width:min(calc(100% - 40px),1240px)}section{padding:60px 0}}"
);

test("stableStringify is deterministic",()=>{
  assert.equal(stableStringify({b:1,a:2}),stableStringify({a:2,b:1}));
});

test("compiler blocks arbitrary remote assets",()=>{
  const x=validateRenderSpec({
    main_html:'<section><img src="https://evil.example/x.jpg">{{copy:HERO_HEADLINE}}<a href="{{cta:PRIMARY}}"></a></section>',
    custom_css:"@media(max-width:700px){.x{display:block}}".repeat(12)
  },manifests);
  assert.equal(x.pass,false);
  assert.ok(x.issues.includes("ARBITRARY_URL_FORBIDDEN"));
});

test("compiler blocks literal unverified copy",()=>{
  const x=validateRenderSpec({
    main_html:'<section><h1>Invented claim</h1>{{copy:HERO_BODY}}<a href="{{cta:PRIMARY}}"></a></section>'.repeat(20),
    custom_css:"@media(max-width:700px){.x{display:block}}".repeat(12)
  },manifests);
  assert.equal(x.pass,false);
  assert.ok(x.issues.some(v=>v.startsWith("UNAUTHORIZED_LITERAL_COPY")));
});

test("valid tokenized render compiles with mandatory shell",async()=>{
  const result=await compileRenderSpec({
    main_html:premiumMain,
    custom_css:premiumCss
  },{
    businessName:"Example SRL",
    logoToken:"identity://PRIMARY_LOGO",
    copyManifest:manifests.copy,
    assetManifest:manifests.assets,
    ctaManifest:manifests.cta
  });
  assert.equal(result.ok,true,result.issues?.join("|"));
  assert.match(result.html,/<main>/);
  assert.match(result.html,/data-official-logo/);
  assert.match(result.html,/viewport/);
  assert.match(result.html,/Content-Security-Policy/);
  assert.match(result.html,/default-src/);
});

test("same failure fingerprint forces strategy change after two",()=>{
  assert.equal(shouldChangeStrategy(1),false);
  assert.equal(shouldChangeStrategy(2),true);
});

test("QA schema failures are isolated from browser failures",()=>{
  assert.equal(classifyFailure(new Error("JSON Mode couldn't be met"),{step:"visual-qa"}).failure_domain,"AI_OUTPUT_SCHEMA");
  assert.equal(classifyFailure(new Error("browser connection closed"),{step:"capture"}).failure_domain,"BROWSER");
});

test("compiler requires a verified contact token in generated main",()=>{
  const x=validateRenderSpec({
    main_html:'<section><h1>{{copy:HERO_HEADLINE}}</h1><p>{{copy:HERO_BODY}}</p></section>'.repeat(20),
    custom_css:".x{display:block} @media(max-width:700px){.x{display:block}}".repeat(12)
  },manifests);
  assert.equal(x.pass,false);
  assert.ok(x.issues.includes("VERIFIED_CONTACT_PATH_REQUIRED"));
});

test("all V2 sources contain no escaped Neon interpolation literals", async()=>{
  const { readFile,readdir } = await import("node:fs/promises");
  const names=(await readdir("src/render-v2")).filter(x=>x.endsWith(".js"));
  for (const name of names) {
    const path="src/render-v2/"+name;
    const source=await readFile(path,"utf8");
    assert.equal(source.includes("\\${"),false,path+" contains escaped interpolation");
  }
});


test("Italian verified contact normalization preserves landline and mobile semantics",()=>{
  assert.equal(normalizeVerifiedPhone("0961 754432","IT"),"+390961754432");
  assert.equal(normalizeVerifiedPhone("331 4587039","IT"),"+393314587039");
  assert.equal(normalizeVerifiedPhone("0039 331 4587039","IT"),"+393314587039");
  assert.equal(normalizeVerifiedPhone("+39 331 4587039","IT"),"+393314587039");
});

test("contact manifest prefers verified phone and keeps verified email fallback",()=>{
  const x=buildContactManifest({country:"IT",verified_contacts:"0961 754432 | info@example.it"});
  assert.equal(x.PRIMARY,"tel:+390961754432");
  assert.equal(x.SECONDARY,"mailto:info@example.it");
  const y=buildContactManifest({country:"IT",verified_contacts:"info@example.it"});
  assert.equal(y.PRIMARY,"mailto:info@example.it");
  assert.equal(y.SECONDARY,"mailto:info@example.it");
});

test("contact manifest refuses an unresolved verified contact path",()=>{
  assert.throws(()=>buildContactManifest({country:"IT",verified_contacts:"NON_DISPONIBILE"}),/VERIFIED_CONTACT_PATH_UNRESOLVED/);
});


test("external asset URL validator blocks private and metadata networks",()=>{
  assert.equal(safeExternalHttpUrl("http://127.0.0.1/a.png"),"");
  assert.equal(safeExternalHttpUrl("http://10.0.0.1/a.png"),"");
  assert.equal(safeExternalHttpUrl("http://169.254.169.254/latest/meta-data"),"");
  assert.equal(safeExternalHttpUrl("http://192.168.1.5/a.png"),"");
  assert.equal(safeExternalHttpUrl("https://metadata.google.internal/a"),"");
  assert.equal(safeExternalHttpUrl("https://example.com/a.png"),"https://example.com/a.png");
});


test("compiler unwraps one redundant outer main safely",async()=>{
  const result=await compileRenderSpec({
    main_html:"<main>"+premiumMain+"</main>",
    custom_css:premiumCss
  },{
    businessName:"Example SRL",
    logoToken:"identity://PRIMARY_LOGO",
    copyManifest:manifests.copy,
    assetManifest:manifests.assets,
    ctaManifest:manifests.cta
  });
  assert.equal(result.ok,true,result.issues?.join("|"));
  assert.equal((result.html.match(/<main>/g)||[]).length,1);
});

test("compiler blocks literal text attributes and shallow section depth",()=>{
  const x=validateRenderSpec({
    main_html:'<section><img alt="Invented"><h1>{{copy:HERO_HEADLINE}}</h1><a href="{{cta:PRIMARY}}"></a></section>'.repeat(4),
    custom_css:".x{display:grid;gap:2rem} @media(max-width:700px){.x{display:block}}".repeat(20)
  },manifests);
  assert.equal(x.pass,false);
  assert.ok(x.issues.some(v=>v.startsWith("UNAUTHORIZED_TEXT_ATTRIBUTE")));
  assert.ok(x.issues.some(v=>v.startsWith("SECTION_DEPTH_REQUIRED")));
});


test("compiler allows justify-content but blocks CSS content property",()=>{
  const base='<section><h2>{{copy:HERO_HEADLINE}}</h2><p>{{copy:HERO_BODY}}</p><a href="{{cta:PRIMARY}}"></a></section>'.repeat(12);
  const safe=validateRenderSpec({
    main_html:base,
    custom_css:".x{display:flex;justify-content:center;align-items:center;padding:2rem} @media(max-width:700px){.x{justify-content:flex-start}}".repeat(14)
  },manifests);
  assert.equal(safe.issues.includes("UNSAFE_CSS_URL_IMPORT_OR_CONTENT"),false);

  const unsafe=validateRenderSpec({
    main_html:base,
    custom_css:".x{display:flex;justify-content:center}.x::before{content:'x'} @media(max-width:700px){.x{display:block}}".repeat(14)
  },manifests);
  assert.ok(unsafe.issues.includes("UNSAFE_CSS_URL_IMPORT_OR_CONTENT"));
});


test("compiler safely normalizes bare verified tokens and strips invented literal text",async()=>{
  const extra='<section id="extra"><h2>{{HERO_HEADLINE}}</h2><p>Invented positioning</p><img src="{{asset:PRIMARY_LOGO}}" alt="Invented alt"><a href="{{cta:PRIMARY}}">{{PRIMARY_CTA_LABEL}}</a></section>';
  const result=await compileRenderSpec({
    main_html:premiumMain+extra,
    custom_css:premiumCss+".x::before{content:'decorative'}"
  },{
    businessName:"Example SRL",
    logoToken:"identity://PRIMARY_LOGO",
    copyManifest:manifests.copy,
    assetManifest:{HERO_VISUAL:"asset://HERO_VISUAL"},
    ctaManifest:manifests.cta
  });
  assert.equal(result.ok,true,result.issues?.join("|"));
  assert.ok(result.normalizations.includes("CANONICALIZED_BARE_COPY_TOKENS"));
  assert.ok(result.normalizations.includes("REMOVED_COMPILER_OWNED_PRIMARY_LOGO"));
  assert.ok(result.normalizations.includes("STRIPPED_UNVERIFIED_LITERAL_TEXT"));
  assert.ok(result.normalizations.includes("STRIPPED_CSS_CONTENT_PROPERTY"));
  assert.equal(result.html.includes("Invented positioning"),false);
  assert.equal(result.html.includes("asset:PRIMARY_LOGO"),false);
  assert.match(result.html,/Titolo/);
});


test("compiler owns one optional main identity placement",async()=>{
  const withIdentity=premiumMain.replace('<section id="hero" class="hero">','<section id="hero" class="hero"><div>{{identity:PRIMARY_LOGO}}</div>');
  const result=await compileRenderSpec({
    main_html:withIdentity,
    custom_css:premiumCss
  },{
    businessName:"Example SRL",
    logoToken:"identity://PRIMARY_LOGO",
    copyManifest:manifests.copy,
    assetManifest:{HERO_VISUAL:"asset://HERO_VISUAL"},
    ctaManifest:manifests.cta
  });
  assert.equal(result.ok,true,result.issues?.join("|"));
  assert.match(result.html,/data-official-logo-main/);
  assert.equal(result.html.includes("{{identity:PRIMARY_LOGO}}"),false);
});

test("compiler rejects repeated or unknown identity tokens",()=>{
  const base='<section><h2>{{copy:HERO_HEADLINE}}</h2><p>{{copy:HERO_BODY}}</p><a href="{{cta:PRIMARY}}"></a></section>'.repeat(8);
  const repeated=validateRenderSpec({
    main_html:'<section>{{identity:PRIMARY_LOGO}}{{identity:PRIMARY_LOGO}}</section>'+base,
    custom_css:".x{display:grid;padding:3rem}@media(max-width:700px){.x{display:block}}".repeat(18)
  },{...manifests,identity:{PRIMARY_LOGO:"identity://PRIMARY_LOGO"}});
  assert.ok(repeated.issues.includes("IDENTITY_TOKEN_MAX_ONE"));

  const unknown=validateRenderSpec({
    main_html:'<section>{{identity:FAKE}}</section>'+base,
    custom_css:".x{display:grid;padding:3rem}@media(max-width:700px){.x{display:block}}".repeat(18)
  },{...manifests,identity:{PRIMARY_LOGO:"identity://PRIMARY_LOGO"}});
  assert.ok(unknown.issues.includes("UNKNOWN_IDENTITY_TOKEN:FAKE"));
});


test("compiler normalizes identity token used inside img src",async()=>{
  const withImg=premiumMain.replace('<section id="hero" class="hero">','<section id="hero" class="hero"><div><img src="{{identity:PRIMARY_LOGO}}" alt="" class="logo-img"></div>');
  const result=await compileRenderSpec({
    main_html:withImg,
    custom_css:premiumCss+".logo-img{width:240px}"
  },{
    businessName:"Example SRL",
    logoToken:"identity://PRIMARY_LOGO",
    copyManifest:manifests.copy,
    assetManifest:{HERO_VISUAL:"asset://HERO_VISUAL"},
    ctaManifest:manifests.cta
  });
  assert.equal(result.ok,true,result.issues?.join("|"));
  assert.ok(result.normalizations.includes("NORMALIZED_IDENTITY_IMAGE_PLACEMENT"));
  assert.match(result.html,/data-official-logo-main/);
  assert.equal(result.html.includes('src="<img'),false);
});


test("direction feasibility gate removes impossible interactive and logo-variation demands",()=>{
  const d=sanitizeDirectionForExecution({
    mobile_reinterpretation:"Tabbed Layout",
    cta_behavior:"Floating Button",
    signature_device:"Logo Variation Signature",
    asset_tokens:["PRIMARY_LOGO"],
    fingerprint:{mobile_pattern:"Accordion",cta_pattern:"Floating Button",signature_device:"Logo Variation"}
  },{hasEditorialAssets:false});
  assert.equal(d.asset_tokens.length,0);
  assert.equal(d.fingerprint.mobile_pattern,"Structured Stacked");
  assert.equal(d.fingerprint.cta_pattern,"Anchored CTA");
  assert.equal(d.fingerprint.signature_device,"Geometric Rule System");
});

test("zero-photo grammar compiles all three variants",async()=>{
  const copy={
    HERO_HEADLINE:"DEDIL DONATO S.R.L.",
    HERO_BODY:"Distribuzione e lavorazione per imprese e professionisti.",
    POSITIONING_TITLE:"Materiali e lavorazioni professionali",
    POSITIONING_BODY:"Distribuzione e lavorazione per esigenze operative verificate.",
    SERVICES_TITLE:"Servizi",
    SERVICES_INTRO:"Materiali e lavorazioni disponibili per imprese e professionisti.",
    TRUST_TITLE:"Affidabilità operativa",
    TRUST_INTRO:"Presenza, contatti e servizi verificati.",
    CLOSING_TITLE:"Parliamo della tua esigenza",
    CLOSING_BODY:"Contatta DEDIL DONATO per approfondire materiali e lavorazioni.",
    LOCALITY_LINE:"Catanzaro",
    PRIMARY_CTA_LABEL:"Richiedi un preventivo",
    SECONDARY_CTA_LABEL:"Contatti",
    FOOTER_LINE:"Soluzioni per il lavoro professionale",
    SERVICE_1_TITLE:"Vendita all'ingrosso",
    SERVICE_1_BODY:"Materiali e forniture professionali.",
    SERVICE_2_TITLE:"Lavorazione del tondo",
    SERVICE_2_BODY:"Servizio dedicato alle esigenze operative.",
    TRUST_1:"Presenza locale verificata",
    TRUST_2:"Contatti verificati",
    TRUST_3:"Servizi verificati"
  };
  for(const variantKey of ["A","B","C"]) {
    const built=buildZeroPhotoPremiumSpec({variantKey,copyManifest:copy,hasIdentity:true});
    const result=await compileRenderSpec(built.spec,{
      businessName:"DEDIL DONATO S.R.L.",
      logoToken:"identity://PRIMARY_LOGO",
      copyManifest:copy,
      assetManifest:{HERO_VISUAL:"asset://HERO_VISUAL"},
      ctaManifest:{PRIMARY:"tel:+390961000000",SECONDARY:"mailto:info@example.it"}
    });
    assert.equal(result.ok,true,variantKey+":"+JSON.stringify(result.issues||[]));
    assert.match(result.html,/Content-Security-Policy/);
  }
});


test("extractStructured handles nested vision-provider wrappers",()=>{
  const schema={
    type:"object",
    properties:{pass:{type:"boolean"},summary:{type:"string"},issues:{type:"array"}},
    required:["pass","summary","issues"]
  };
  const wrapped={
    response:{
      content:[
        {type:"reasoning",text:"analysis omitted"},
        {type:"text",text:'<think>done</think>\n\n{"pass":true,"summary":"ok","issues":[]}'}
      ]
    }
  };
  assert.deepEqual(extractStructured(wrapped,schema),{pass:true,summary:"ok",issues:[]});
});

test("extractStructured ignores envelope objects and selects schema payload",()=>{
  const schema={
    type:"object",
    properties:{pass:{type:"boolean"},summary:{type:"string"}},
    required:["pass","summary"]
  };
  const wrapped={result:{response:[{foo:"bar"},{content:'prefix {"pass":false,"summary":"x"} suffix'}]}};
  assert.deepEqual(extractStructured(wrapped,schema),{pass:false,summary:"x"});
});


test("set QA normalization accepts strong set with minor notes",()=>{
  const r=normalizeSetQaResult({
    pass:false,
    weakest_variant:"C",
    scores:{set_quality:8.6,diversity_ab:8.1,diversity_ac:8,diversity_bc:8.2,prospect_fit_a:9,prospect_fit_b:9,prospect_fit_c:8.5},
    issues:["Variant C address block is slightly large.","Variant B headings marginally lower scannability."],
    actions:[]
  });
  assert.equal(r.pass,true);
  assert.equal(r.weakest_variant,"NONE");
  assert.equal(r.score_floor,8);
});

test("set QA normalization converts unit scale and still blocks material diversity failures",()=>{
  const r=normalizeSetQaResult({
    pass:true,
    weakest_variant:"B",
    scores:{set_quality:.86,diversity_ab:.81,diversity_ac:.8,diversity_bc:.82,prospect_fit_a:.9,prospect_fit_b:.9,prospect_fit_c:.85},
    issues:["A and B reuse the same composition and are not materially different."],
    actions:[]
  });
  assert.equal(r.scores.set_quality,8.6);
  assert.equal(r.pass,false);
});
