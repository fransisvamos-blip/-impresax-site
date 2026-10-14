import test from "node:test";
import assert from "node:assert/strict";
import { validateRenderSpec, compileRenderSpec } from "../src/render-v2/compiler.js";
import { classifyFailure, shouldChangeStrategy } from "../src/render-v2/failure-policy.js";
import { stableStringify, safeExternalHttpUrl } from "../src/render-v2/utils.js";
import { normalizeVerifiedPhone, buildContactManifest } from "../src/render-v2/contacts.js";

const manifests={
  copy:{HERO_HEADLINE:"Titolo",HERO_BODY:"Testo"},
  assets:{HERO_01:"asset://HERO_01"},
  cta:{PRIMARY:"tel:+390000000"}
};

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
  const main='<section class="hero"><h1>{{copy:HERO_HEADLINE}}</h1><p>{{copy:HERO_BODY}}</p><img src="{{asset:HERO_01}}" alt=""><a href="{{cta:PRIMARY}}"></a></section>'.repeat(8);
  const result=await compileRenderSpec({
    main_html:main,
    custom_css:".hero{min-height:80vh;padding:6vw;display:grid;gap:32px;align-items:center} .hero h1{font-size:clamp(40px,7vw,110px);line-height:.9;letter-spacing:-.04em} @media(max-width:700px){.hero{min-height:auto;padding:24px;grid-template-columns:1fr}.hero h1{font-size:clamp(38px,12vw,64px)}}".repeat(8)
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
  const section='<section id="s"><h2>{{copy:HERO_HEADLINE}}</h2><p>{{copy:HERO_BODY}}</p><a href="{{cta:PRIMARY}}"></a></section>';
  const result=await compileRenderSpec({
    main_html:"<main>"+section.repeat(12)+"</main>",
    custom_css:".x{display:grid;gap:2rem;padding:4rem} @media(max-width:700px){.x{display:block;padding:1.25rem}}".repeat(14)
  },{
    businessName:"Example SRL",
    logoToken:"identity://PRIMARY_LOGO",
    copyManifest:manifests.copy,
    assetManifest:manifests.assets,
    ctaManifest:manifests.cta
  });
  assert.equal(result.ok,true);
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
  const block='<section id="x"><h2>{{HERO_HEADLINE}}</h2><p>Invented positioning</p><img src="{{asset:PRIMARY_LOGO}}" alt="Invented alt"><a href="{{cta:PRIMARY}}">{{PRIMARY_CTA_LABEL}}</a></section>';
  const copy={...manifests.copy,PRIMARY_CTA_LABEL:"Contatti"};
  const result=await compileRenderSpec({
    main_html:block.repeat(8),
    custom_css:".x{display:flex;justify-content:center;align-items:center;padding:3rem}.x::before{content:'decorative'} @media(max-width:700px){.x{display:block;padding:1rem}}".repeat(12)
  },{
    businessName:"Example SRL",
    logoToken:"identity://PRIMARY_LOGO",
    copyManifest:copy,
    assetManifest:{},
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
