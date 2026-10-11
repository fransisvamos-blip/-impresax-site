# ImpresaX Ops — Foundation V1

## Role

ImpresaX Ops is the operational source of truth for the automated production pipeline.

It is separate from **ImpresaX Memory**, which remains archive / backup / long-term context.

Neon project:
- Name: ImpresaX Ops
- Project ID: `wispy-morning-45609027`
- Region: `aws-eu-central-1`
- Database: `impresax_ops`

## Core tables

- `prospects`
- `render_jobs`
- `render_packs`
- `render_assets`
- `site_builds`
- `qa_runs`
- `site_events`
- `sales_handoffs`
- `orchestrator_queue`

Views:
- `ops_dashboard_counts`
- `ops_prospect_board`

## ID_PROSPECT

`prospects.id` is the immutable canonical ID shared by:
Prospect Engine → Rendering Studio → Site Factory → QA → Sales Engine.

A database trigger rejects any attempt to mutate it.

Pilot #001:
`5a03a8d1-e080-4f53-bf38-214c24f67248`

Legacy ID `pilot_001` is retained only as metadata.

## Pipeline states

READY_FOR_RENDERING
→ RENDERING
→ RENDER_REWORK / APPROVED_REFERENCE
→ READY_FOR_BUILD
→ BUILDING
→ BUILD_REWORK / QA_RUNNING
→ QA_FAILED / DEMO_READY
→ SALES_READY
→ CONTACTED
→ WON / LOST / HOLD

Three failed attempts at a stage route the prospect to:
`ESCALATION_REQUIRED`.

There is no mandatory human approval state.

## Orchestrator

Cloudflare Worker scheduled trigger: every minute.

Internal tasks:
- APPROVED_REFERENCE → PREPARE_BUILD → READY_FOR_BUILD
- QA_FAILED → QA_REWORK → BUILD_REWORK
- DEMO_READY → SALES_HANDOFF → SALES_READY

External executor bindings:
- `RENDER_EXECUTOR_URL`
- `BUILD_EXECUTOR_URL`
- `QA_EXECUTOR_URL`

When an executor is missing the queue item is released for retry without incrementing the prospect failure count.

Executor errors use `ops_register_failure()`; repeated failures escalate automatically.

## Event log

`site_events` is append-only.

Prospect and production-table changes generate events.
State transitions create explicit events such as:
- RENDER_STARTED
- RENDER_FAILED
- BUILD_STARTED
- QA_FAILED
- QA_PASSED
- SALES_HANDOFF_CREATED

## Control Room

Target:
`https://admin.impresax.org`

The UI displays:
- total prospects
- ready for rendering
- rendering
- approved reference
- building
- QA
- demo ready
- escalation required

Operational table columns:
rank, ID, business, vertical, render/build/QA status, live URL,
current step, last event, error, next action.

Prospect detail exposes:
source data, current website, logo metadata, brand DNA,
render jobs/packs/assets, builds, QA runs, screenshots,
sales handoffs and full event timeline.

## Private access

The Worker supports two private gates:

1. Preferred: Cloudflare Access
   - Set Worker var `OPS_TRUST_CLOUDFLARE_ACCESS=1` only after an Access policy exists.

2. Basic fallback
   - Store `OPS_ADMIN_PASSWORD` as a Cloudflare Worker secret.

Never commit the admin password.

## Neon runtime connection

Store the Neon privileged connection string as Cloudflare Worker secret:

`OPS_DATABASE_URL`

Never commit it to Git.

## Current external blockers

The code, database schema and Control Room are installed.
The live Control Room cannot query Neon until `OPS_DATABASE_URL` is set in the Worker environment.
Private browser access additionally needs Cloudflare Access or `OPS_ADMIN_PASSWORD`.

These are runtime-secret configuration steps, not application-code work.
