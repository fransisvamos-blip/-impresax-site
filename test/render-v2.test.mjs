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
  '<section id="hero" class="hero"><h1>{{copy:HERO_HEADLINE}}</h1><p>{{copy:HERO_BODY}}</p><img src="{{asset:HERO_VISUAL}}" alt=""><div><a href="{{cta:PRIMARY}}">{{copy:PRIMARY_CTA_LABEL}}</a><a href="{{cta:SECONDARY}}">{{copy:SECONDARY_CTA_LABEL}}</a></div></section>',
  '<section id="positioning"><h2>{{copy:POSITIONING_TITLE}}</h2><p>{{copy:POSITIONING_BODY}}</p></section>',
  '<section id="services"><h2>{{copy:SERVICES_TITLE}}</h2><p>{{copy:SERVICES_INTRO}}</p><article><h3>{{copy:SERVICE_1_TITLE}}</h3><p>{{copy:SERVICE_1_BODY}}</p></article></section>',
  '<section id="trust"><h2>{{copy:TRUST_TITLE}}</h2><p>{{copy:TRUST_INTRO}}</p><p>{{copy:TRUST_1}}</p></section>',
  '<section id="bridge"><h2>{{copy:POSITIONING_TITLE}}</h2><p>{{copy:POSITIONING_BODY}}</p></section>',
  '<section id="final-cta"><h2>{{copy:CLOSING_TITLE}}</h2><p>{{copy:CLOSING_BODY}}</p><a href="{{cta:PRIMARY}}">{{copy:PRIMARY_CTA_LABEL}}</a></section>'
].join("");

const premiumCss=".ix-v2-header{background:#fff}.ix-v2-nav{display:flex}.ix-v2-footer{background:#111}.hero{min-height:80vh;padding:6vw;display:grid;gap:32px;align-items:center}.hero h1{font-size:clamp(40px,7vw,110px);line-height:.9;letter-spacing:-.04em}section{padding:5vw}@media(max-width:700px){.hero{min-height:auto;padding:24px;grid-template-columns:1fr}.hero h1{font-size:clamp(38px,12vw,64px)}}";

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
  assert.equal(result.ok,true);
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
