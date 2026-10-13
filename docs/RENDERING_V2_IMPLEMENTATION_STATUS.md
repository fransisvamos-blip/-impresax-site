# Rendering Pipeline V2 — Implementation Status

Branch: \`rendering-v2-shadow\`
Mode: SHADOW ONLY
Production V8.5: UNCHANGED

Implemented in this branch:

- additive V2 Neon schema;
- immutable RenderInputPack snapshot/certification;
- R2 artifact contract;
- input asset ingestion;
- separated Quality/Engine/Compiler/Model/Prompt versions;
- single structured Creative Plan + Content Truth Pack;
- deterministic A/B/C fingerprint diversity precheck;
- independent parent/child Cloudflare Workflows;
- independent variant revision chains;
- deterministic tokenized compiler;
- no arbitrary AI asset URLs;
- exact official identity outside model control;
- Browser capture separated from visual QA;
- PREVIEW_READY before Deep QA;
- structured multimodal Variant QA;
- surgical variant rework;
- best-preview/certified revision persistence;
- Set QA with weakest-variant-only replacement;
- bounded revision loops;
- typed failure taxonomy/fingerprints;
- V2-only status API;
- branch CI contract tests + Wrangler dry build.

Not authorized by this branch:

- no V2 production cutover;
- no mutation of V8 render state;
- no Sales/Site Factory handoff from shadow output;
- no disabling V8.5.

Next gates after a successful build are resource provisioning, shadow deployment, Golden Set and chaos tests.
