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
  assert.ok(html.indexOf('/desktop.jpg') < html.indexOf('/mobile.jpg'));
});
