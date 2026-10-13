# IMPRESAX — RENDERING PIPELINE V2 — FINAL ARCHITECTURE FREEZE

STATUS: FROZEN
DATE: 2026-10-13
OWNER: CABINA DI COMANDO / RENDERING PLATFORM
SCOPE: Prospect Engine → Rendering Studio → Approved Reference → Site Factory handoff
CHANGE POLICY: DO NOT MODIFY THE ARCHITECTURE BY PATCHING PRODUCTION. Any architectural change requires an explicit Cabina decision, a new architecture revision, benchmark evidence and a controlled migration.
RUNTIME POLICY: V8.5 remains untouched until V2 passes the acceptance program defined in this document.

---

## 0. EXECUTIVE DECISION

ImpresaX will stop evolving the rendering system through incremental production patches.

The current V8.x line demonstrated that the quality objective is correct but the execution architecture is not.

The definitive V2 separates:

1. QUALITY CONTRACT — what a valid ImpresaX render must be.
2. EXECUTION CONTRACT — how the system produces that result reliably and efficiently.
3. MODEL ROUTING — which model/provider is used for each role.
4. PROMPT VERSION — the instructions used by a model.
5. ARTIFACT VERSION — the immutable output of each production step.

A change in one layer MUST NOT require unnecessary changes to the others.

The V2 target is not “AI that never fails”.

The V2 target is:

A SYSTEM THAT CONTAINS FAILURES, PRESERVES VALID WORK, NEVER LOOPS BLINDLY, EXPOSES PROGRESS, AND DELIVERS THREE PREMIUM PROSPECT-SPECIFIC OPTIONS AS QUICKLY AS THE QUALITY CONTRACT ALLOWS.

---

## 1. WHY V2 EXISTS — EVIDENCE FROM THE CURRENT SYSTEM

Audit snapshot: 2026-10-13.

CZ-063 alone accumulated:

- 255 render jobs;
- 248 failed jobs;
- 6 completed jobs;
- approximately 1,146.8 cumulative job-minutes;
- repeated failure families that re-executed expensive upstream work.

Across the rendering fleet, the database audit found:

- 471 cloudflare-browser-renderer failures in the VISUAL_QA_JSON_REQUIRED family;
- approximately 977 cumulative job-minutes consumed by that family alone;
- 41 stale AI claims;
- repeated official-logo gate failures;
- repeated unverified-image provenance failures;
- repeated missing-main / malformed-document failures;
- repeated semantic-content failures;
- repeated provider timeouts and browser connection failures.

The most important lesson is therefore:

THE MAIN FAILURE WAS NOT MODEL SPEED.
THE MAIN FAILURE WAS FAILURE-DOMAIN COUPLING + UNCONTROLLED RE-EXECUTION.

A downstream QA-format error must never re-run generation or browser capture.
A single weak variant must never invalidate two strong variants.
A provider failure must never be classified as a creative failure.
A new engine revision must never inherit circuit-breaker debt from an old revision.

---

## 2. SOURCE HIERARCHY

When implementation decisions conflict, use this order:

1. Current explicit Cabina decision.
2. This FINAL ARCHITECTURE FREEZE.
3. RENDERING_STUDIO_V1_FROZEN quality contract.
4. Verified prospect data and immutable Render Input Pack.
5. Measured benchmark evidence.
6. Provider documentation and platform limits.
7. Implementation convenience.

Implementation convenience NEVER overrides quality or correctness.

---

## 3. PERMANENT QUALITY CONTRACT

The existing Rendering Studio V1 Frozen Master remains the visual-quality authority unless explicitly amended by Cabina.

V2 MUST preserve:

- verified business identity;
- official logo lock or explicit NO_OFFICIAL_LOGO_CONFIRMED;
- real Brand DNA;
- verified services, contacts, location and trust evidence;
- three genuinely different A/B/C directions;
- premium, credible, licensed/provenanced imagery;
- no invented premises, people, equipment, reviews, certifications or claims;
- flagship-level art direction;
- strong composition, typography, rhythm, restraint and materiality;
- complete desktop reference;
- complete mobile reference designed intentionally, not merely shrunk;
- commercial clarity without aggressive fake-funnel behavior;
- no generic template feel;
- no generic SaaS feel;
- no obvious AI feel;
- a prospect-specific signature visual language;
- truth integrity;
- visual critique;
- cross-variant diversity review;
- explicit human render selection;
- Site Factory reference-lock after selection.

The quality contract defines WHAT MUST BE TRUE.

It must not dictate unnecessary details of HOW execution is orchestrated.

---

## 4. V2 NON-NEGOTIABLE ENGINEERING INVARIANTS

These are hard architectural rules.

### I-01 — Never redo successful work

Any successful immutable artifact is preserved and reused.

If QA fails, do not regenerate HTML.
If Browser fails, do not rerun Creative Plan.
If C fails, do not regenerate A or B.

### I-02 — Every expensive step is independently addressable

Creative Plan, Variant A, Variant B, Variant C, Compile, Capture, Variant QA and Set QA must have distinct identities and statuses.

### I-03 — Same failure twice changes strategy

The same normalized failure fingerprint may be attempted at most twice with the same strategy.

The third action MUST change one of:

- model route;
- repair strategy;
- input;
- deterministic repair path;
- human escalation.

Blind identical retries are forbidden.

### I-04 — Retry only retryable failures

Timeouts may retry.
Temporary network failures may retry.
Malformed provider output may retry/fallback.

A factual-data problem, missing verified logo, unavailable asset or repeated visual-quality problem is not solved by blindly repeating the same call.

### I-05 — Engine revisions are isolated

Failures, retry counts and breaker state are scoped at minimum to:

prospect + pack + workflow + engine_version + step + variant + revision.

Old engine failures MUST NOT block a new engine.

### I-06 — Preview and certification are separate

PREVIEW_READY means the user can see the complete A/B/C desktop+mobile output.

RENDER_READY means all mandatory certification gates have passed.

Preview visibility MUST NOT depend on Deep QA completion.

Implementation selection remains blocked until RENDER_READY.

### I-07 — AI cannot create unrestricted external dependencies

AI output cannot freely invent:

- image URLs;
- logo URLs;
- external SVG URLs;
- arbitrary fonts;
- map tiles;
- scripts;
- iframes;
- remote assets.

All runtime assets come through an approved manifest and resolver.

### I-08 — Structural correctness is deterministic

AI must not be responsible for remembering mandatory HTML shell elements, security policy or identity wiring.

### I-09 — Truth is data, not prose memory

Every factual source used by generation is represented in an immutable verified content/input manifest.

### I-10 — Observability is part of correctness

No state named simply AI_RENDERING is acceptable as the only visible information.

Every active step exposes:

- workflow;
- variant/revision if applicable;
- step;
- started_at;
- elapsed;
- attempt;
- model route where relevant;
- last heartbeat/event;
- latest result;
- next action.

### I-11 — Production is never the architecture laboratory

Architectural work is implemented in an isolated V2 path, evaluated, then promoted.

### I-12 — Best-known output never regresses silently

If revision C2 is worse than certified C1, C1 remains best-known until C2 proves better.

---

## 5. TARGET SYSTEM TOPOLOGY

The definitive topology is:

PROSPECT ENGINE
→ RENDER INPUT PACK
→ INPUT CERTIFICATION
→ RENDER PROSPECT WORKFLOW
→ CREATIVE PLAN + CONTENT TRUTH PACK
→ A / B / C VARIANT WORKFLOWS IN PARALLEL
→ DETERMINISTIC COMPILER
→ BROWSER CAPTURE
→ PREVIEW_READY
→ VARIANT QA IN PARALLEL
→ SURGICAL VARIANT REWORK WHEN REQUIRED
→ SET QA
→ RENDER_READY
→ CABINA SELECTION
→ APPROVED_REFERENCE
→ SITE FACTORY REFERENCE-LOCK
→ DEMO_READY
→ SALES ENGINE

The existing cron becomes a watchdog/reconciler, not the rendering executor.

---

## 6. PLATFORM DECISION

### 6.1 Durable orchestration

Use Cloudflare Workflows for rendering orchestration.

Reason:

- durable multi-step execution;
- persisted state;
- step-specific retries;
- long wall-clock operations;
- observability;
- pause/event capabilities;
- execution subscriptions.

There will be two workflow classes:

RENDER_PROSPECT_WORKFLOW
RENDER_VARIANT_WORKFLOW

### 6.2 Parent / child model

One Render Prospect Workflow owns a render pack.

It creates three independent Render Variant Workflows:

A
B
C

Parent workflow owns:

- input version;
- global content truth pack;
- creative plan;
- A/B/C direction fingerprints;
- pack-level progress;
- Preview Ready aggregate;
- Set QA;
- final Render Ready.

Child workflow owns one variant revision chain.

### 6.3 Queues

Cloudflare Queues are NOT required in V2.0 critical path.

Workflows already provide sufficient execution capacity for the expected ImpresaX scale.

A Queue may be introduced later only if benchmark evidence shows a need for an additional admission buffer or cross-product event fanout.

Do not introduce infrastructure merely because it exists.

### 6.4 Artifact storage

Use Cloudflare R2 for binary/heavy render artifacts.

Use Neon for relational operational state and metadata.

Do not store full screenshots as Base64 in Neon in V2.

### 6.5 Model gateway

All AI inference routes through AI Gateway or an equivalent centralized routing layer.

Application code addresses logical roles, not hardcoded provider/model IDs.

Logical routes:

creative-director
content-truth-writer
variant-generator
variant-repair
visual-qa
set-qa

### 6.6 Browser

Browser Run / Cloudflare browser binding is used only for deterministic capture and browser diagnostics.

Browser is not coupled to semantic QA.

---

## 7. RENDER INPUT PACK — THE IMMUTABLE STARTING CONTRACT

Rendering must not begin from live scattered prospect data.

The Prospect Engine produces a versioned RenderInputPack.

Required fields:

- render_input_pack_id;
- prospect_id;
- prospect_code;
- input_version;
- created_at;
- content_hash;
- business_name;
- legal/trading identity where verified;
- vertical;
- address/location;
- website;
- official_logo status;
- official_logo asset ID;
- brand DNA;
- verified services;
- verified contacts;
- verified trust signals;
- verified commercial journey;
- CTA capabilities;
- source references;
- asset manifest;
- asset license/provenance metadata;
- image role/suitability classification;
- explicit missing-data flags;
- zero-photo eligibility;
- locale/language;
- content restrictions;
- known prior QA lessons where relevant.

The RenderInputPack is immutable after creation.

If source data changes materially, create input_version N+1.

A workflow pins one exact input_version for its entire lifecycle.

No workflow reads mutable prospect facts in the middle of rendering.

---

## 8. INPUT CERTIFICATION

Before any creative inference:

Run deterministic Input Certification.

Pass conditions include:

- identity state is explicit;
- logo is verified or NO_OFFICIAL_LOGO_CONFIRMED is explicit;
- Brand DNA is complete enough for creative work;
- services/contacts/location are structurally available;
- asset provenance is known;
- external asset license policy is satisfied;
- source references exist;
- CTA destinations are valid;
- no invalid/duplicate asset IDs;
- no unsafe protocols;
- content hash matches.

Failure state:

INPUT_BLOCKED.

INPUT_BLOCKED must not invoke creative models.

Its next action is a precise data remediation action.

---

## 9. CONTENT TRUTH PACK

One content truth artifact is generated per render pack, not independently by A/B/C.

Purpose:

- prevent contradictory factual copy;
- reduce three separate semantic-gate loops;
- create a reusable verified messaging layer.

It contains structured copy modules such as:

- value proposition options;
- hero statements;
- service labels/descriptions;
- trust copy;
- location/locality copy;
- CTA labels;
- contact copy;
- footer/legal business identification;
- allowed factual claims;
- prohibited/unverified claims.

Every factual module contains source/claim references.

Content Truth Pack generation may use AI, but output must be structured and grounded exclusively in the RenderInputPack.

The Content Truth Pack is generated in parallel with Creative Plan where possible.

A semantic verifier validates only this artifact.

If truth verification fails, repair the Content Truth Pack.

Do NOT regenerate visual variants.

---

## 10. CREATIVE PLAN

One Creative Director call produces the set strategy.

Required structured output:

- global creative strategy;
- direction A;
- direction B;
- direction C;
- per-direction structural fingerprint;
- asset role plan;
- typography behavior;
- composition/grid logic;
- hero logic;
- signature visual device;
- section rhythm;
- CTA integration;
- desktop behavior;
- mobile reinterpretation;
- explicit anti-template notes;
- explicit relationship to prospect evidence.

The plan MUST be structured-output compatible.

Do not run a long serial chain of strategy → six candidates → curation → jury → fallback unless benchmark evidence later proves that it materially improves outcomes enough to justify the latency.

V2 default:

ONE creative planning operation.

---

## 11. DIVERSITY PRECHECK

Before variant generation, run deterministic diversity checks on A/B/C fingerprints.

Compare:

- hero type;
- primary grid topology;
- section ordering;
- typography mode;
- visual/material system;
- signature device;
- asset emphasis;
- CTA pattern;
- mobile treatment.

If two variants are structurally too similar:

repair/replan only the weaker direction before HTML generation.

Do not generate three variants only to discover later that they were the same idea.

The precheck is necessary but not sufficient.
Visible Set QA still runs after capture.

---

## 12. VARIANT WORKFLOW

Each child workflow receives:

- immutable RenderInputPack ID/version;
- Content Truth Pack ID/version;
- Creative Plan ID/version;
- one direction;
- one variant key;
- execution engine version;
- model-route version;
- prompt version.

Variant identity:

render_pack_id + variant_key.

Revision identity:

variant_id + revision_number.

Example:

A / r1
A / r2
B / r1
C / r1

Every revision is immutable after completion.

---

## 13. AI GENERATION CONTRACT

The variant-generation model does NOT own the full document shell.

Preferred output contract is a structured RenderSpec containing:

- main_html;
- custom_css;
- section metadata;
- asset token references;
- content-token references;
- responsive intent;
- design fingerprint;
- implementation notes.

Forbidden from model output:

- script tags;
- iframe/object/embed;
- arbitrary external image URLs;
- arbitrary font URLs;
- raw logo substitution;
- remote SVG references;
- JavaScript URLs;
- unverified data sources;
- direct contact values not supplied by tokens.

Asset references use tokens such as:

asset://HERO_01
asset://PROJECT_02
identity://PRIMARY_LOGO

Content/CTA references use controlled identifiers such as:

copy://HERO_A
contact://PHONE_PRIMARY
contact://EMAIL_PRIMARY
cta://PRIMARY

This makes provenance enforcement structural rather than prompt-dependent.

---

## 14. DETERMINISTIC COMPILER

The Deterministic Compiler transforms RenderSpec into standalone HTML.

It owns:

- doctype;
- html/head/body;
- viewport;
- noindex policy;
- mandatory header;
- exact official identity insertion;
- main wrapper;
- verified contact path;
- footer;
- asset resolution;
- CTA resolution;
- CSS safety checks;
- responsive foundation;
- script removal;
- protocol safety;
- optional CSP-compatible constraints;
- deterministic sanitization.

This eliminates whole classes of failures seen in V8.x:

- main_missing;
- viewport_missing;
- official logo being replaced;
- contact-path missing;
- script/embed violations;
- arbitrary external asset usage.

The compiler must use a real HTML/CSS parser where practical rather than regex-only safety logic.

Compiler output has a SHA-256 content hash.

The same RenderSpec + same compiler version + same manifests must produce the same normalized document.

---

## 15. STATIC PRE-CAPTURE GATES

Before Browser:

- valid HTML;
- mandatory structure;
- official identity exact;
- no forbidden tags;
- no arbitrary external URLs;
- all asset tokens resolved;
- all contact tokens resolved;
- all content tokens resolved;
- no placeholder text;
- minimum content structure;
- responsive rules present;
- no duplicate IDs;
- no invalid asset provenance;
- no factual token without source.

If failure is deterministic-repairable:

repair deterministically.

If the AI creative output itself is insufficient:

create next revision only for that variant.

---

## 16. BROWSER CAPTURE

For each valid variant revision:

one child workflow performs Browser capture.

Required reference views:

- desktop full home, canonical 1440 width;
- mobile full home, canonical 390 width.

Additional QA viewports may be captured or diagnostic-only as needed, but the canonical selectable references remain desktop 1440 + mobile 390 unless Cabina changes the Quality Contract.

Browser diagnostics include:

- broken images;
- horizontal overflow;
- JS/page errors;
- load errors;
- viewport dimensions;
- body dimensions;
- logo visibility;
- minimum text size;
- tap-target diagnostics;
- screenshot dimensions/hash.

Browser artifacts are written to R2 first.

Only metadata and object keys are written to Neon.

Browser failure retries Browser only.

It never reruns generation unless diagnostics prove the generated source itself is defective.

---

## 17. R2 ARTIFACT LAYOUT

Recommended namespace:

render-v2/{prospect_code}/{render_pack_id}/{variant_key}/r{revision}/

Artifacts:

render-spec.json
source.html
desktop-1440.jpg
mobile-390.jpg
browser-diagnostics.json
variant-qa.json
manifest.json

Pack-level artifacts:

render-v2/{prospect_code}/{render_pack_id}/

render-input-pack.json
content-truth-pack.json
creative-plan.json
set-qa.json
final-manifest.json

Every artifact record includes:

- key;
- SHA-256;
- MIME;
- bytes;
- created_at;
- producer;
- engine_version;
- source revision IDs.

---

## 18. PREVIEW_READY

A variant becomes VARIANT_PREVIEW_READY once:

- compiled HTML passed static checks;
- desktop capture exists;
- mobile capture exists;
- deterministic browser diagnostics contain no critical blocker.

Deep visual QA is NOT required for preview visibility.

The parent becomes PREVIEW_READY when A, B and C each have one current preview revision.

At PREVIEW_READY the Control Room displays all three options immediately.

Badges show:

- QA pending;
- QA running;
- rework running;
- ready.

Selection/implementation controls remain disabled until certification.

This solves the “long invisible AI_RENDERING” failure mode permanently.

---

## 19. VARIANT QA

Variant QA runs against immutable screenshots.

It does not own Browser capture.

Inputs:

- desktop screenshot;
- mobile screenshot;
- RenderInputPack;
- direction;
- Content Truth Pack;
- browser diagnostics.

QA responsibilities:

- first impression;
- art-direction quality;
- prospect specificity;
- brand fidelity;
- composition;
- typography;
- imagery;
- materiality;
- signature visual language;
- rhythm/restraint;
- CTA integration;
- commercial clarity;
- desktop quality;
- mobile quality;
- footer;
- no-template feel;
- no-SaaS feel;
- no-AI feel;
- truth integrity;
- visual consistency.

Output MUST use structured JSON schema.

A malformed QA response is:

QA_PROVIDER_FAILURE.

It is not a Browser failure.
It is not a RenderSpec failure.

Retry/fallback only the QA inference.

---

## 20. QA MODEL INDEPENDENCE

The generator must not be the only judge of its own work.

Visual QA uses a logically independent route.

Self-scoring from the Creative Director is advisory only and cannot certify a render.

Numerical scores document the outcome but do not replace visible evidence.

Critical issues override averages.

---

## 21. SURGICAL REWORK

If only C fails:

A and B are frozen as best-known valid artifacts.

C creates r2.

If only mobile composition of C is weak, the rework prompt receives:

- C current RenderSpec;
- C screenshots;
- exact QA issues;
- exact repair instructions;
- instruction to preserve passing qualities.

No pack-wide regeneration.

If content truth is the only failure:

repair Content Truth Pack and affected copy layer.
Preserve art direction when possible.

If static compiler issue is deterministic:

repair compiler/output without AI.

---

## 22. BEST-KNOWN REVISION POLICY

Each variant maintains:

- current_revision;
- best_preview_revision;
- best_qa_revision;
- certified_revision.

New revisions never delete previous revisions.

A replacement becomes best-known only after relevant comparisons/gates pass.

This prevents regression caused by “latest means best”.

---

## 23. SET QA

Set QA runs only after A/B/C individually pass their variant requirements.

It evaluates visible screenshot sets, not merely metadata.

Checks:

- overall set quality;
- A/B diversity;
- A/C diversity;
- B/C diversity;
- prospect fit A/B/C;
- repeated layout patterns;
- repeated hero structure;
- repeated asset treatment;
- template reuse risk.

If Set QA fails diversity:

identify the weakest conflicting variant.

Rework only that variant.

A and C do not get regenerated because B is too similar.

---

## 24. RENDER_READY

A render pack becomes RENDER_READY only when:

- Input Certification PASS;
- Content Truth PASS;
- Creative Plan valid;
- three variant identities exist;
- one certified revision exists for A;
- one certified revision exists for B;
- one certified revision exists for C;
- desktop/mobile artifacts exist for all certified revisions;
- official identity is valid;
- provenance is valid;
- deterministic browser checks pass;
- Variant QA passes all three;
- Set QA passes;
- final manifest hashes match stored artifacts;
- no unresolved critical failure exists.

RENDER_READY is an automatic certification state.

It is NOT human selection.

---

## 25. HUMAN SELECTION

The Cabina sees certified A/B/C.

Action 1:

SELECT VARIANT.

This records selected_variant_revision_id.

It does NOT start Site Factory.

Action 2:

IMPLEMENT SELECTED VARIANT.

This promotes the exact immutable certified revision to APPROVED_REFERENCE and hands it to Site Factory.

Two-step explicit selection remains mandatory.

---

## 26. SITE FACTORY HANDOFF CONTRACT

Site Factory receives an immutable ApprovedReferenceManifest containing:

- prospect_id;
- render_pack_id;
- selected_variant_id;
- selected_variant_revision_id;
- selected source HTML/spec;
- desktop reference object key/hash;
- mobile reference object key/hash;
- identity manifest;
- content manifest;
- asset manifest;
- design metadata;
- Quality Contract version;
- source hashes.

Site Factory implements.

Site Factory does not reopen art direction.

Any Factory simplification that materially changes the selected reference is a fidelity failure.

---

## 27. VERSIONING MODEL

The V8.x problem of coupling engine revision to database guards is prohibited.

V2 uses distinct dimensions.

QUALITY_CONTRACT_VERSION
Example: RS_QUALITY_V1

EXECUTION_ENGINE_VERSION
Example: RS_ENGINE_V2_0

COMPILER_VERSION
Example: RS_COMPILER_V1

MODEL_ROUTE_VERSION
Example: ROUTES_2026_10_A

PROMPT_VERSION
Example: VARIANT_PROMPT_V3

INPUT_VERSION
Per prospect snapshot.

ARTIFACT_REVISION
Per variant.

Database certification checks depend on Quality Contract evidence, not a hardcoded exact engine revision.

Changing a model must not require a schema migration.

---

## 28. DATA MODEL — DEFINITIVE V2 SHAPE

Retain:

prospects
render_packs
render_variants
site_builds
qa_runs where still useful
site_events
sales_handoffs

Add or normalize:

### render_input_packs

Immutable prospect rendering snapshots.

Key fields:

id
prospect_id
input_version
content_hash
payload
quality_contract_version
created_at

Unique:

prospect_id + input_version

### render_workflows

Maps ImpresaX entities to Cloudflare workflow instances.

Key fields:

id
prospect_id
render_pack_id
variant_id nullable
variant_revision_id nullable
workflow_type
workflow_instance_id
engine_version
status
started_at
completed_at
last_event_at
error_code

### render_creative_plans

id
render_pack_id
input_pack_id
content_truth_pack
creative_strategy
directions
fingerprints
model_route_version
prompt_version
created_at
hash

### render_variant_revisions

id
variant_id
revision
status
render_spec
compiler_version
source_hash
parent_revision_id
created_at
superseded_at

Unique:

variant_id + revision

### render_artifacts

id
render_pack_id
variant_revision_id nullable
artifact_type
r2_key
sha256
mime
bytes
producer_step
created_at

### render_qa_results

id
render_pack_id
variant_revision_id nullable
qa_type
status
scores
issues
actions
model_route_version
prompt_version
artifact_hashes
created_at

### render_failures

id
render_pack_id
workflow_id
variant_revision_id nullable
step
failure_domain
failure_code
fingerprint
retryable
strategy_version
attempt
details
created_at
resolved_at

### render_metrics

Optional normalized performance facts or materialized analytics.

Existing render_jobs remains available as historical V1/V8 audit data but must cease to be the V2 control-plane source of truth after cutover.

Existing render_staging_payloads becomes legacy after V2 migration.

Do not delete historical records during V2 rollout.

---

## 29. STATUS MODEL

### High-level prospect states

Keep the existing business pipeline stable where practical:

READY_FOR_RENDERING
RENDERING
RENDER_REWORK
APPROVED_REFERENCE
READY_FOR_BUILD
BUILDING
BUILD_REWORK
QA_RUNNING
QA_FAILED
DEMO_READY
SALES_READY
CONTACTED
WON
LOST
HOLD

V2 detailed state lives below this layer.

### Render pack states

INPUT_PENDING
INPUT_BLOCKED
INPUT_READY
PLANNING
GENERATING
PREVIEW_PARTIAL
PREVIEW_READY
QA_RUNNING
REWORK
RENDER_READY
AWAITING_SELECTION
SELECTED
APPROVED
ESCALATION_REQUIRED
CANCELLED
SUPERSEDED

### Variant states

PLANNED
GENERATING
COMPILE_VALIDATING
CAPTURING
PREVIEW_READY
QA_RUNNING
QA_FAILED
REWORKING
RENDER_READY
REJECTED
SUPERSEDED

Do not overload one status with multiple meanings.

---

## 30. IDEMPOTENCY

Every side-effecting step has an idempotency key.

Examples:

create-input-pack:
prospect_id + input_version

creative-plan:
render_pack_id + input_hash + plan_version

variant-generation:
variant_id + revision + prompt_version + route_version

compile:
variant_revision_id + compiler_version

capture:
variant_revision_id + source_hash + viewport

qa:
artifact_hashes + qa_prompt_version + qa_route_version

V2 must be safe if the same external trigger is delivered twice.

---

## 31. CONCURRENCY AND SCHEDULING

The V2 architecture supports parallel prospect workflows.

Initial production concurrency is intentionally conservative and increased only through benchmark evidence.

Recommended rollout:

shadow: 1–2 prospects concurrently
canary: 3 prospects concurrently
initial live: 3–5 concurrently
scale: increase based on AI latency/cost and Browser utilization

The platform itself supports far higher concurrency than ImpresaX initially needs.

No global “one prospect per cron” constraint remains in V2.

Priority classes:

P0 strategic/manual
P1 high commercial rank
P2 standard production
P3 background/rebuild

Fairness rule:

A single broken prospect cannot monopolize all concurrency.

---

## 32. AI ROUTING POLICY

Application code never assumes a permanent “best model”.

For each logical route maintain:

- primary provider/model;
- fallback provider/model;
- timeout;
- transient retry policy;
- structured-output capability;
- cost ceiling;
- benchmark score;
- rollout percentage.

Use AI Gateway timeout/retry/fallback capabilities where appropriate.

Do not layer Gateway retries and Workflow retries carelessly.

Rule:

Gateway handles short transient provider failures.
Workflow handles semantic/step-level recovery.

Total effective retry budget is explicitly bounded.

---

## 33. STRUCTURED OUTPUT POLICY

Any AI response used programmatically must use a real structured-output contract where the selected provider/model supports it.

Applies to:

- Creative Plan;
- Content Truth Pack;
- QA;
- Set QA;
- repair decisions.

A model failing to satisfy the schema is an inference/output failure.

Do not parse arbitrary prose with fragile substring extraction if a structured-response capability is available.

Structured output reduces risk but is not assumed infallible.
Schema failure still has a bounded fallback path.

---

## 34. FAILURE TAXONOMY

Every failure is assigned exactly one primary domain.

### INFRA

Examples:

network timeout
Neon temporary unavailable
R2 temporary failure
browser connection failure

Action:

bounded retry with exponential backoff.

### AI_PROVIDER

Examples:

provider timeout
429
5xx
model unavailable

Action:

short retry then fallback route.

### AI_OUTPUT_SCHEMA

Examples:

invalid/missing structured output

Action:

retry inference once, then fallback model.
Preserve all upstream artifacts.

### INPUT_DATA

Examples:

ambiguous logo
missing verified identity
invalid contacts
unusable source state

Action:

INPUT_BLOCKED.
No creative retry.

### ASSET

Examples:

approved asset unavailable
license/provenance unresolved
corrupt image

Action:

repair asset manifest or use explicit zero-photo mode.
Do not blindly regenerate design.

### STRUCTURAL_GENERATION

Examples:

invalid RenderSpec
unresolved tokens
unsafe CSS

Action:

deterministic repair if possible; otherwise new revision for affected variant.

### BROWSER

Examples:

render timeout
browser crash
page load failure

Action:

retry capture only.

### CONTENT_TRUTH

Examples:

unsupported factual claim
contradictory copy

Action:

repair Content Truth Pack / affected copy, preserve visual work when possible.

### VISUAL_QUALITY

Examples:

poor composition
weak typography
AI feel
mobile failure

Action:

new revision of affected variant only.

### SET_DIVERSITY

Examples:

A/B too similar

Action:

keep stronger variant; rework weaker one only.

### SYSTEM_INVARIANT

Examples:

hash mismatch
two selected revisions
artifact missing after certification

Action:

stop, alert, no automatic creative retry.

### UNKNOWN

Unclassified new failure.

Action:

one safe retry only if likely transient.
Otherwise technical escalation and fingerprint capture.

UNKNOWN may never loop indefinitely.

---

## 35. FAILURE FINGERPRINTING

Normalize each error to a stable fingerprint using:

failure_domain
failure_code
step
variant
relevant deterministic diagnostics
provider class where applicable

Policy:

same fingerprint occurrence 1:
normal recovery

same fingerprint occurrence 2:
retry only if strategy changes or failure is clearly transient

same fingerprint occurrence 3:
automatic circuit breaker
ESCALATION_REQUIRED or fallback strategy

A single normalized failure may never repeat dozens or hundreds of times.

This directly prevents the VISUAL_QA_JSON_REQUIRED history from recurring.

---

## 36. RETRY BUDGETS

Retry counts are per failure domain, not one generic counter.

Default starting policy:

transient network/provider:
2 local attempts + optional fallback

structured output:
1 retry primary + 1 fallback

browser:
2 attempts before alternate capture/restart strategy

deterministic compiler:
no blind retry; repair or fail

visual quality:
maximum 5 real revisions per variant, preserving best-known

set diversity:
maximum 3 targeted replacement cycles

unknown:
maximum 1 blind retry

Budgets may be tuned from benchmark data but cannot become unbounded.

---

## 37. TIMEOUT POLICY

Each external step has explicit timeout ownership.

Timeout expiry must produce a typed failure.

No step may rely on a generic cron stale detector as its primary lifecycle manager.

Workflow wall-clock waiting and provider timeouts are separate concepts.

A step waiting on network I/O is allowed, but the business SLO remains monitored.

---

## 38. WATCHDOG / RECONCILER

A scheduled Worker remains, but its role is limited.

It may:

- find INPUT_READY packs without a workflow and start them;
- detect database/workflow reconciliation mismatch;
- detect completed workflow with missing terminal DB event;
- flag artifacts referenced but missing;
- emit health metrics;
- identify legacy zombie rows for operational reporting.

It must NOT:

- regenerate variants;
- perform QA;
- drive creative retries;
- create repeated browser jobs every minute.

Cron is supervision, not execution.

---

## 39. OBSERVABILITY

Every workflow and step emits site_events and structured operational metadata.

Control Room shows per prospect:

current parent workflow
current engine version
input version
pack state
A/B/C state
current revision
best revision
certified revision
step name
elapsed time
attempt
failure domain/code
last event
next action
preview links as soon as available
QA status
set QA status

The Control Room may consume Workflow instance event subscriptions for live progress instead of relying only on 30-second polling.

Required metrics:

TT_INPUT_READY
TT_CREATIVE_PLAN
TT_VARIANT_PREVIEW
TT_FIRST_PREVIEW
TT_ALL_PREVIEWS
TT_RENDER_READY
first-pass preview success rate
first-pass Render Ready rate
average variant revisions
rework rate
provider failure rate
browser failure rate
cost per prospect
AI calls per prospect
browser seconds per prospect
manual intervention rate
selection rate by direction
Site Factory fidelity score

---

## 40. SLO TARGETS

These are engineering targets to validate, not promises.

### Preview

p50 PREVIEW_READY:
<= 3 minutes

p95 PREVIEW_READY:
<= 5 minutes

### Certification

p50 first-pass RENDER_READY:
<= 5 minutes

p95 first-pass RENDER_READY:
<= 8 minutes

### Reliability

same failure fingerprint repeated more than twice with same strategy:
0

full-pack regeneration caused by one variant failure:
0

certified output with unverified arbitrary image URL:
0

certified output with modified official logo:
0

selected un-certified revision:
0

### Quality

All deterministic quality gates:
100 percent pass for certified output.

All three certified variants:
real desktop + mobile artifacts.

Set QA:
mandatory.

Human Golden Set benchmark:
must meet the Acceptance Program below before production cutover.

SLOs are adjusted only from measured benchmark evidence, never to hide a bad implementation.

---

## 41. COST CONTROL

Cost is a first-class metric.

For each prospect track:

AI calls by logical route
AI input/output usage where available
Browser duration
Workflow steps
R2 operations/storage
rework count

Define:

soft cost budget per render pack
hard cost breaker per render pack

If hard budget is reached:

do not blindly continue.
Preserve best-known previews and escalate.

Optimization rule:

REMOVE WASTED RECOMPUTATION BEFORE DOWNGRADING QUALITY.

Do not use weaker models simply to make a broken architecture cheaper.

---

## 42. SECURITY

Requirements:

- OPS database secret remains server-only;
- R2 bucket private by default;
- render asset access through authenticated/signed application routes where needed;
- Control Room behind existing private access mechanism;
- no secrets in Git;
- no arbitrary user/prospect HTML script execution;
- generated HTML sanitized before Browser;
- no remote script injection;
- URL allowlist/token resolver;
- audit log for human overrides;
- least-privilege bindings where possible.

---

## 43. RIGHTS / LICENSE / PROVENANCE

Each visual asset has:

asset_id
source_type
source_url where applicable
ingested_at
license_status
commercial_use_status
identity_role
provenance notes
hash

Certified output may reference only assets whose commercial-use policy allows it.

Representative imagery must never be presented as actual business premises/team/equipment unless verified.

Generated imagery, if allowed for a use case, is explicitly labeled in provenance and must not misrepresent business reality.

---

## 44. HUMAN OVERRIDES

Control Room must support safe targeted actions:

pause workflow
resume workflow
cancel workflow
retry current step
retry only A/B/C
reject variant
promote best-known revision for further QA
request new direction for one variant
change prospect priority
mark input remediation complete
force technical escalation

Human actions create immutable audit events.

Human override must not require editing Neon manually.

A human override cannot bypass mandatory Quality Contract gates into APPROVED_REFERENCE without an explicit privileged exception path and recorded reason.

Default policy: no bypass.

---

## 45. GOLDEN SET

V2 cannot be validated using only the prospect currently blocking production.

The Golden Set includes at minimum:

1. CZ-063 — known severe failure history.
2. Fisioexpress — known positive visual preference / Premium Local Trust lesson.
3. Giardinelli — known lesson that Site Factory cannot invent art direction.
4. KiPoint — warm strategic local prospect.
5. Studio Legale Gullì — professional-services case.
6. Strong-logo / strong-photography prospect.
7. Strong-logo / weak-photography prospect.
8. No-official-logo-confirmed case.
9. Sparse website / limited data case.
10. Dense website / many candidate assets case.
11. Prospect with no usable photo requiring ZERO_PHOTO_PREMIUM.
12. One prospect from a materially different vertical to prevent construction-sector overfitting.

Golden Set records immutable expected facts and human evaluation notes.

---

## 46. BENCHMARK PROGRAM

For each Golden Set prospect measure V2 against:

- current V8.5 baseline where meaningful;
- best known prior ImpresaX render;
- direct/manual ChatGPT rendering baseline when available.

Measure:

time to preview
time to certified render
technical failure count
AI call count
browser call count
retry count
cost estimate
A/B/C diversity
brand fidelity
image credibility
mobile quality
commercial usefulness
human preference
manual rescue required

Do not accept V2 because it is merely technically clean.

It must improve the combined objective:

QUALITY × SPEED × RELIABILITY × OPERABILITY.

---

## 47. ACCEPTANCE CRITERIA BEFORE CUTOVER

All requirements below are mandatory.

### Architecture

- Parent and child Workflows operate durably.
- A/B/C are independent.
- variant revisions are immutable.
- R2 artifacts are used.
- Neon controls metadata/state.
- engine/model/prompt versions are separated.
- watchdog does not execute rendering.

### Known-failure prevention

Golden tests prove prevention/isolation of:

- QA malformed structured output;
- stale AI/provider response;
- modified/invented logo;
- arbitrary image URL;
- invalid/truncated generation;
- missing mandatory shell elements;
- semantic truth problem;
- Browser crash;
- Browser timeout;
- Neon temporary error;
- R2 temporary error;
- duplicate trigger;
- same failure fingerprint repeated;
- deploy while workflow is running.

### Quality

For every Golden Set prospect:

- three complete variants generated or a legitimate typed INPUT_BLOCKED state;
- no fake Render Ready;
- desktop/mobile present;
- official identity correct;
- provenance valid;
- no critical truth violation;
- Set QA complete;
- human review confirms the system meets ImpresaX commercial-quality expectations.

### Performance

Targets in Section 40 are measured.

If they miss materially, the reason must be understood and explicitly accepted before cutover.

### Reliability

No benchmark run may produce an uncontrolled retry loop.

No failure may destroy valid sibling variant artifacts.

No old-engine breaker may contaminate V2.

---

## 48. CHAOS TEST PROGRAM

Before production promotion intentionally inject:

AI primary timeout
AI primary 500
AI schema-invalid response
AI model unavailable
Browser launch failure
Browser connection closed
Browser timeout
R2 write failure
R2 read failure
Neon transient failure
duplicate workflow trigger
duplicate step event
missing asset
asset 404
corrupt image
ambiguous logo
no logo
no photos
unsafe external URL in generated spec
invalid CSS
one weak mobile variant
one weak desktop variant
A/B too similar
Content Truth contradiction
workflow paused/resumed
deployment during active workflow
manual cancellation
hard cost budget reached

PASS condition:

the correct failure domain activates,
valid artifacts remain,
retry scope is minimal,
state remains understandable,
loop is bounded.

---

## 49. DEPLOYMENT STRATEGY

No big-bang replacement.

### Phase 0 — Freeze

V8.5 production behavior remains unchanged except emergency safety fixes explicitly authorized by Cabina.

### Phase 1 — Build isolated V2

Use separate modules/tables/bindings as needed.

No V2 action may mutate current production render state during shadow development.

### Phase 2 — Unit / contract tests

Compiler
resolvers
hashing
idempotency
state transitions
failure classification
database guards
artifact manifest

### Phase 3 — Golden Set shadow

V2 processes Golden Set without controlling production handoff.

Outputs are compared side-by-side.

### Phase 4 — Chaos testing

All Section 48 scenarios.

### Phase 5 — Canary

Small percentage / selected prospects use V2 production path.

V8.5 remains rollback path.

### Phase 6 — Scale

Increase concurrency only after measured pass.

### Phase 7 — V8 retirement

Stop V8 executor.

Keep historical records read-only.

Do not delete evidence.

---

## 50. ROLLBACK

Rollback must be one operational action, not a code-repair exercise.

Requirements:

- V8.5 kept deployable until V2 proves stable;
- V2 migrations initially additive;
- V2 does not destructively rewrite old artifacts;
- parent/child workflows can be paused/terminated;
- dispatcher can stop assigning new V2 workloads;
- in-flight certified V2 artifacts remain readable;
- selected references already handed to Site Factory remain immutable.

Rollback trigger examples:

critical identity/provenance regression
systemic duplicate workflows
unbounded retry regression
database corruption risk
certification bypass
materially worse Golden/canary quality
unacceptable cost runaway

---

## 51. DATABASE MIGRATION POLICY

Migrations are:

additive first
backward-compatible during canary
explicitly versioned
tested against production-like data
reversible where feasible

Do not rewrite historical render_jobs merely to make V2 look clean.

Do not remove V8 schema until V2 has passed an agreed stability window.

No trigger may hardcode an execution engine revision when it should enforce a Quality Contract requirement.

---

## 52. CONTROL ROOM V2

Rendering view becomes operationally useful.

Each prospect row shows:

business
priority
parent state
time in current step
A state
B state
C state
Preview Ready
Render Ready
last failure
next action

Detail page shows:

Input Pack
Creative Plan summary
A/B/C current preview
revision history
QA
Set QA
failure timeline
workflow timeline
engine/model/prompt versions
cost/usage
human controls

Once previews exist, they are visible even while Deep QA runs.

Buttons:

Choose version
Implement version

remain governed by certification state.

---

## 53. SITE FACTORY FIDELITY LOOP

V2 rendering is not successful if Site Factory later destroys the reference.

After Approved Reference:

Site Factory produces implementation.

QA compares implementation against selected desktop/mobile references.

Measure:

visual diff
layout fidelity
typography fidelity
asset fidelity
responsive fidelity
content fidelity

Factory fixes implementation.

It never changes Rendering Studio art direction to make coding easier.

---

## 54. FUTURE-PROOFING

The architecture must support future changes without redesign.

Possible future additions:

more viewports
full multi-page design references
industry-specific quality rubrics
human art-director comments fed to targeted rework
model ensemble QA
design similarity detection across the whole ImpresaX portfolio
automated conversion heuristics
localization
additional image-generation providers
customer-facing approval portal

These features may plug into V2 because the core primitives are versioned workflows, artifacts and revisions.

They must not be pre-built now unless required.

Avoid speculative complexity.

---

## 55. WHAT V2 EXPLICITLY DOES NOT DO

V2 does not:

- promise that AI never fails;
- allow endless retries;
- regenerate entire packs for local failures;
- hardcode one permanent AI model;
- make the cron the executor;
- put screenshots as giant Base64 blobs in Neon;
- trust self-scoring as certification;
- allow arbitrary asset URLs from AI;
- allow Site Factory to redesign;
- expose preview as certified;
- hide progress behind a generic RENDERING label;
- silently inherit old-version breaker state;
- deploy structural experiments directly to production.

---

## 56. TARGET STEP CONTRACTS

Every Workflow step must formally declare:

step_name
input_schema
output_schema
idempotency_key
timeout_policy
retry_policy
failure_domains
fallback_policy
artifacts_created
database_writes
events_emitted
cost_class
sensitive_fields

A step without this contract is not production-ready.

---

## 57. SUCCESS DEFINITION

A successful ImpresaX Rendering Pipeline is not one that eventually creates something.

It is one that, repeatably:

1. starts from verified immutable inputs;
2. creates three real prospect-specific directions;
3. renders them independently and in parallel;
4. exposes complete desktop/mobile previews quickly;
5. certifies quality without blocking preview visibility;
6. reworks only what is weak;
7. preserves every valid artifact;
8. prevents fake facts and unapproved assets structurally;
9. contains provider/infrastructure failures;
10. never loops blindly;
11. shows exactly what it is doing;
12. scales from one prospect to many;
13. hands one immutable selected reference to Site Factory;
14. produces a demo faithful to that reference.

---

## 58. ZERO-ERROR INTERPRETATION

No complex distributed/AI production system can honestly guarantee that no runtime error will ever occur.

For ImpresaX, “zero errors” is therefore defined operationally as:

ZERO UNCONTROLLED ERRORS.

Specifically:

- zero unbounded loops;
- zero silent state corruption;
- zero certification bypass;
- zero loss of valid artifacts due to unrelated downstream failure;
- zero arbitrary unverified assets in certified output;
- zero modified/invented official identity in certified output;
- zero cross-version breaker contamination;
- zero known failure classes reintroduced after their acceptance test exists;
- zero production architecture changes without validation.

Errors may occur.
They must be typed, bounded, recoverable or escalated.

---

## 59. IMPLEMENTATION ORDER — FROZEN

When Cabina authorizes implementation, execute in this order:

1. Create V2 schemas and version contracts.
2. Add R2 artifact storage.
3. Implement RenderInputPack and certification.
4. Implement deterministic token resolver/compiler.
5. Implement parent Prospect Workflow.
6. Implement child Variant Workflow.
7. Implement AI Gateway logical routes.
8. Implement Content Truth Pack.
9. Implement Creative Plan structured output.
10. Implement Variant RenderSpec generation.
11. Implement Browser capture to R2.
12. Implement PREVIEW_READY aggregation.
13. Implement structured Variant QA.
14. Implement surgical rework/revision policy.
15. Implement Set QA.
16. Implement RENDER_READY certification.
17. Implement Control Room V2 observability and controls.
18. Implement Approved Reference manifest / Site Factory handoff.
19. Implement metrics/cost budgets.
20. Implement automated contract tests.
21. Run Golden Set.
22. Run chaos program.
23. Run shadow benchmark.
24. Run canary.
25. Cut over only after acceptance.
26. Observe stability window.
27. Retire V8 executor only after Cabina approval.

Do not change the order because a later feature appears easier to build.

---

## 60. EXTERNAL PLATFORM ASSUMPTIONS VERIFIED AT FREEZE DATE

Verified against official Cloudflare documentation on 2026-10-13:

Cloudflare Workflows:
- durable multi-step execution;
- persisted state;
- automatic retries/error handling;
- event waiting;
- instance execution subscriptions;
- Paid plan supports large concurrency and configurable CPU limits per workflow.

Workers AI:
- JSON Mode / JSON Schema supported on compatible models;
- schema failure is still possible and must be handled.

AI Gateway:
- request timeout;
- retry;
- fallback/dynamic routing capabilities.

Browser Run:
- available for programmatic browser capture;
- Paid capacity materially exceeds ImpresaX initial rendering concurrency needs.

R2:
- strongly consistent object storage;
- suitable for immutable render artifacts;
- no Internet egress bandwidth charge under current published pricing.

Official references:

https://developers.cloudflare.com/workflows/
https://developers.cloudflare.com/workflows/reference/limits/
https://developers.cloudflare.com/workflows/build/subscribe-to-instance-events/
https://developers.cloudflare.com/workers-ai/features/json-mode/
https://developers.cloudflare.com/ai-gateway/configuration/request-handling/
https://developers.cloudflare.com/ai-gateway/configuration/fallbacks/
https://developers.cloudflare.com/browser-run/limits/
https://developers.cloudflare.com/browser-run/pricing/
https://developers.cloudflare.com/r2/reference/consistency/
https://developers.cloudflare.com/r2/pricing/

Provider limits and prices are configuration inputs, not architectural invariants. Re-verify them at implementation/cutover time.

---

## 61. FINAL FREEZE DECISION

This document is the final architectural target for Rendering Pipeline V2.

The next structural rendering change MUST NOT be another direct V8.x patch.

The next planned structural implementation is V2 built against this contract in an isolated path.

The Frozen Quality Contract remains in force.

The production V8.5 engine remains a temporary current runtime until V2 completes:

BUILD
→ CONTRACT TESTS
→ GOLDEN SET
→ CHAOS TEST
→ SHADOW
→ CANARY
→ ACCEPTANCE
→ CUTOVER.

FINAL PRINCIPLE:

DO NOT OPTIMIZE FOR “GETTING THE NEXT JOB TO PASS”.

OPTIMIZE FOR A MACHINE THAT CAN PRODUCE HUNDREDS OF PREMIUM PROSPECT-SPECIFIC REFERENCES WITHOUT REPEATING THE FAILURE PATTERNS THAT CREATED V8.x.

QUALITY MUST REMAIN HIGH.
VISIBILITY MUST BECOME FAST.
FAILURES MUST BECOME LOCAL.
WORK MUST BECOME REUSABLE.
THE SYSTEM MUST BECOME PREDICTABLE.

END OF FINAL ARCHITECTURE FREEZE.
