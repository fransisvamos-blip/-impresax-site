import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Golden Set is frozen, unique and covers critical archetypes",async()=>{
  const data=JSON.parse(await readFile("test/fixtures/render-v2-golden-set.json","utf8"));
  assert.equal(data.cases.length,12);
  const codes=data.cases.map(x=>x.code);
  assert.equal(new Set(codes).size,codes.length);
  for(const required of ["CZ-063","CZ-031","CZ-209","CZ-210","CZ-183","CZ-089","CZ-097"]) {
    assert.ok(codes.includes(required),required+" missing");
  }
  const archetypes=new Set(data.cases.flatMap(x=>x.archetypes));
  for(const required of ["severe_failure_history","no_official_logo_confirmed","known_positive_visual_preference","site_factory_reference_lock_lesson","cross_vertical"]) {
    assert.ok(archetypes.has(required),required+" missing");
  }
  assert.ok(data.cases.some(x=>String(x.expected_input).startsWith("INPUT_BLOCKED")));
  assert.ok(data.cases.some(x=>x.expected_input==="PASS"));
});
