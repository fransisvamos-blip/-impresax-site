import test from "node:test";
import assert from "node:assert/strict";
import { validateRenderSpec, compileRenderSpec } from "../src/render-v2/compiler.js";
import { classifyFailure, shouldChangeStrategy } from "../src/render-v2/failure-policy.js";
import { stableStringify } from "../src/render-v2/utils.js";

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
    custom_css:".hero{min-height:80vh;padding:6vw} @media(max-width:700px){.hero{min-height:auto;padding:24px}}".repeat(8)
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

test("V2 sources contain no escaped Neon interpolation literals", async()=>{
  const { readFile } = await import("node:fs/promises");
  for (const path of [
    "src/render-v2/db.js","src/render-v2/input-pack.js","src/render-v2/artifacts.js",
    "src/render-v2/workflows.js","src/render-v2/index.js"
  ]) {
    const source=await readFile(path,"utf8");
    assert.equal(source.includes("\\${"),false,path+" contains escaped interpolation");
  }
});
