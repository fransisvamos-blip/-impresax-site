import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";
import { buildInputPayload, certifyInputPayload } from "../src/render-v2/input-pack.js";

if(!process.env.OPS_DATABASE_URL) {
  console.log(JSON.stringify({ok:true,skipped:true,reason:"OPS_DATABASE_URL_NOT_AVAILABLE"}));
  process.exit(0);
}

const sql=neon(process.env.OPS_DATABASE_URL);
const fixture=JSON.parse(await fs.readFile(new URL("../test/fixtures/render-v2-golden-set.json",import.meta.url),"utf8"));
const codes=fixture.cases.map(x=>x.code);
const rows=await sql`
  select id,business_name,vertical,city,country,website_url,logo,brand_dna,source_data,legacy_ids,priority,rank
  from prospects
  where coalesce(legacy_ids->>'id_prospect',source_data->>'id_prospect')=any(${codes})
`;
const byCode=new Map(rows.map(p=>[p.legacy_ids?.id_prospect||p.source_data?.id_prospect,p]));
const report=[];

for(const testCase of fixture.cases) {
  const prospect=byCode.get(testCase.code);
  assert.ok(prospect,"Golden Set prospect missing: "+testCase.code);
  const payload=buildInputPayload(prospect);
  const cert=certifyInputPayload(payload);
  const expectedPass=String(testCase.expected_input).toUpperCase()==="PASS";
  assert.equal(cert.pass,expectedPass,
    testCase.code+" input expectation mismatch; expected "+testCase.expected_input+" issues="+JSON.stringify(cert.issues));
  report.push({
    code:testCase.code,
    name:testCase.name,
    expected:testCase.expected_input,
    actual:cert.pass?"PASS":"INPUT_BLOCKED",
    issues:cert.issues,
    asset_mode:payload.asset_mode,
    asset_count:payload.assets.length
  });
}

const pass=report.filter(x=>x.actual==="PASS").length;
const blocked=report.length-pass;
console.log(JSON.stringify({ok:true,version:fixture.version,total:report.length,pass,blocked,report},null,2));
