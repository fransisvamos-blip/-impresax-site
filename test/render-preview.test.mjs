import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { previewSlugFromBusinessName, renderPreviewDocument } from "../src/render-preview.js";

test("preview slug removes Italian legal suffix",()=>{
  assert.equal(previewSlugFromBusinessName("DEDIL DONATO S.R.L."),"dedil-donato");
  assert.equal(previewSlugFromBusinessName("Acme S.P.A."),"acme");
});

test("client preview renders full desktop followed by narrow mobile",()=>{
  const html=renderPreviewDocument({business_name:"DEDIL DONATO S.R.L.",revision:180});
  assert.match(html,/name="robots" content="noindex,nofollow,noarchive"/);
  assert.match(html,/src="\/desktop\.jpg"/);
  assert.match(html,/src="\/mobile\.jpg"/);
  assert.match(html,/width:1440px/);
  assert.match(html,/width:390px/);
  assert.match(html,/Versione mobile/);
  assert.match(html,/\.mobile img\{width:100%;max-width:100%;height:auto;box-shadow:none\}/);
  assert.ok(html.indexOf('/desktop.jpg') < html.indexOf('Versione mobile'));
  assert.ok(html.indexOf('Versione mobile') < html.indexOf('/mobile.jpg'));
});


test("R118 preview publishing requires real perceptual visual PASS",()=>{
  const source=fs.readFileSync(new URL("../src/render-preview.js",import.meta.url),"utf8");
  assert.match(source,/R118_PERCEPTUAL_JURY_V1/);
  assert.match(source,/q\.qa_type='VARIANT_VISUAL'/);
  assert.match(source,/q\.status='PASS'/);
  assert.doesNotMatch(source,/r\.revision=v\.certified_revision/);
});
