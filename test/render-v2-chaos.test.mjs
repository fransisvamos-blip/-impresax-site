import test from "node:test";
import assert from "node:assert/strict";
import { classifyFailure, failureFingerprint } from "../src/render-v2/failure-policy.js";
import { recoveryDecision } from "../src/render-v2/recovery-policy.js";
import { validateRenderSpec } from "../src/render-v2/compiler.js";
import { certifyInputPayload } from "../src/render-v2/input-pack.js";
import { validateContentTruthSources } from "../src/render-v2/ai.js";
import { identitySvgIsSafe } from "../src/render-v2/artifacts.js";

const dna={
  brand_personality:"Established and reliable",visual_cues:"Strong wordmark",tone:"Professional",
  business_type:"S.r.l.",audience:"Businesses",offer:"Verified offer",local_context:"Catanzaro",
  trust_signals:"Verified business",existing_colors:"Neutral",typography_cues:"Sans serif",
  imagery_cues:"Industrial",business_positioning:"Local B2B",commercial_behavior:"Quote driven"
};

function validInput() {
  return {
    business_name:"Example SRL",address:"Catanzaro",
    official_logo:{status:"PASS"},
    brand_dna:dna,verified_services:"Verified service",verified_contacts:"0961000000",
    source_references:["https://example.com"],
    assets:[{asset_id:"PRIMARY_LOGO",role:"identity",source_url:"https://example.com/logo.png"}]
  };
}

test("chaos: browser failure retries capture only, never generation",()=>{
  const f=classifyFailure(new Error("browser connection closed"),{step:"capture"});
  assert.equal(f.failure_domain,"BROWSER");
  assert.equal(recoveryDecision({failureDomain:f.failure_domain,sameFingerprintCount:1,hasPreview:true}).action,"RETRY_CAPTURE_ONLY");
  assert.equal(recoveryDecision({failureDomain:f.failure_domain,sameFingerprintCount:2,hasPreview:true}).action,"ESCALATE_BROWSER");
});

test("chaos: malformed QA retries QA only then escalates preserving preview",()=>{
  const f=classifyFailure(new Error("JSON Mode couldn't be met"),{step:"visual-qa"});
  assert.equal(f.failure_domain,"AI_OUTPUT_SCHEMA");
  const first=recoveryDecision({failureDomain:f.failure_domain,sameFingerprintCount:1,hasPreview:true});
  const second=recoveryDecision({failureDomain:f.failure_domain,sameFingerprintCount:2,hasPreview:true});
  assert.equal(first.action,"RETRY_SAME_STEP_OR_FALLBACK");
  assert.equal(second.action,"ESCALATE_PROVIDER_OR_INFRA");
  assert.equal(second.preserve_artifacts,true);
});

test("chaos: asset and identity failures block before creative generation",()=>{
  const bad=validInput();
  bad.official_logo={status:"NON_DISPONIBILE"};
  bad.verified_services="NON_DISPONIBILE";
  const cert=certifyInputPayload(bad);
  assert.equal(cert.pass,false);
  assert.ok(cert.issues.includes("OFFICIAL_IDENTITY_NOT_CERTIFIED"));
  assert.ok(cert.issues.includes("VERIFIED_SERVICES_REQUIRED"));
});

test("chaos: no-official-logo-confirmed is a valid explicit identity mode",()=>{
  const x=validInput();
  x.official_logo={status:"NO_OFFICIAL_LOGO_CONFIRMED",generated:false,use_verified_name_as_text:true};
  x.assets=[];
  assert.equal(certifyInputPayload(x).pass,true);
});

test("chaos: arbitrary network and script injection are impossible at compile gate",()=>{
  const gate=validateRenderSpec({
    main_html:'<section><script>alert(1)</script><img src="https://example.net/x.jpg">{{copy:HERO}}<a href="{{cta:PRIMARY}}"></a></section>'.repeat(10),
    custom_css:".x{background:url(https://example.net/a.jpg)} @media(max-width:700px){.x{display:block}}".repeat(8)
  },{
    copy:{HERO:"Verified"},assets:{},cta:{PRIMARY:"tel:+390000000"}
  });
  assert.equal(gate.pass,false);
  assert.ok(gate.issues.includes("FORBIDDEN_TAG"));
  assert.ok(gate.issues.includes("ARBITRARY_URL_FORBIDDEN"));
  assert.ok(gate.issues.includes("UNSAFE_CSS_URL_IMPORT_OR_CONTENT"));
});

test("chaos: local visual failure reworks only affected variant",()=>{
  assert.equal(recoveryDecision({failureDomain:"VISUAL_QUALITY",sameFingerprintCount:1,hasPreview:true}).action,"REWORK_VARIANT_ONLY");
  assert.equal(recoveryDecision({failureDomain:"SET_DIVERSITY",sameFingerprintCount:1,hasPreview:true}).action,"REWORK_WEAKEST_VARIANT_ONLY");
});

test("chaos: system invariant and hard budget never blindly retry",()=>{
  const f=classifyFailure(new Error("HARD_BUDGET_EXCEEDED:AI_CALLS"),{step:"generation"});
  assert.equal(f.failure_domain,"SYSTEM_INVARIANT");
  assert.equal(recoveryDecision({failureDomain:f.failure_domain,sameFingerprintCount:1}).retry,false);
});

test("chaos: fingerprints are stable and variant scoped",async()=>{
  const a=classifyFailure(new Error("browser timeout 12345"),{step:"capture",variant_key:"A",revision:1});
  const b=classifyFailure(new Error("browser timeout 99999"),{step:"capture",variant_key:"A",revision:1});
  const c=classifyFailure(new Error("browser timeout 99999"),{step:"capture",variant_key:"B",revision:1});
  assert.equal(await failureFingerprint(a),await failureFingerprint(b));
  assert.notEqual(await failureFingerprint(a),await failureFingerprint(c));
});

test("chaos: content truth rejects invented source references",()=>{
  const source="https://verified.example/source";
  const truth={
    hero_source_refs:[source],
    locality_source_refs:[source],
    services:[{title:"A",description:"B",source_refs:[source]}],
    trust_points:[{text:"Trust",source_refs:["https://invented.example/fake"]}]
  };
  const gate=validateContentTruthSources(truth,{source_references:[source]});
  assert.equal(gate.pass,false);
  assert.ok(gate.issues.some(x=>x.startsWith("UNVERIFIED_SOURCE_REF:TRUST_1")));
});

test("chaos: content truth accepts only exact verified references",()=>{
  const source="https://verified.example/source";
  const truth={
    hero_source_refs:[source],
    locality_source_refs:[source],
    services:[{title:"A",description:"B",source_refs:[source]}],
    trust_points:[{text:"Trust",source_refs:[source]}]
  };
  assert.equal(validateContentTruthSources(truth,{source_references:[source]}).pass,true);
});


test("chaos: unresolved asset commercial-use state blocks input before AI",()=>{
  const x=validInput();
  x.assets.push({
    asset_id:"VISUAL_01",role:"visual",source_url:"https://example.com/photo.jpg",
    source_type:"APPROVED_EXTERNAL",commercial_use_status:"UNKNOWN"
  });
  const cert=certifyInputPayload(x);
  assert.equal(cert.pass,false);
  assert.ok(cert.issues.includes("ASSET_COMMERCIAL_USE_UNRESOLVED:VISUAL_01"));
});

test("chaos: compiler blocks protocol-relative assets and font-face injection",()=>{
  const gate=validateRenderSpec({
    main_html:'<section><img src="//evil.example/a.jpg">{{copy:HERO}}<a href="{{cta:PRIMARY}}"></a></section>'.repeat(12),
    custom_css:"@font-face{font-family:X;src:local(X)} @media(max-width:700px){.x{display:block}}".repeat(8)
  },{
    copy:{HERO:"Verified"},assets:{},cta:{PRIMARY:"tel:+390000000"}
  });
  assert.equal(gate.pass,false);
  assert.ok(gate.issues.includes("ARBITRARY_URL_FORBIDDEN"));
  assert.ok(gate.issues.includes("UNSAFE_CSS_URL_IMPORT_OR_CONTENT"));
});


test("verified identity SVG allows only embedded raster data",()=>{
  const safe='<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB"/></svg>';
  assert.equal(identitySvgIsSafe(safe),true);
  assert.equal(identitySvgIsSafe('<svg><image href="data:image/svg+xml;base64,PHN2Zz4="/></svg>'),false);
  assert.equal(identitySvgIsSafe('<svg><image href="https://evil.example/x.png"/></svg>'),false);
  assert.equal(identitySvgIsSafe('<svg><script>alert(1)</script></svg>'),false);
  assert.equal(identitySvgIsSafe('<svg><image onload="x()" href="data:image/png;base64,AAAA"/></svg>'),false);
});
