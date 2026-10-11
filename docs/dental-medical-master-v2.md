# DENTAL / MEDICAL MASTER V2 — VISUAL + COMMERCIAL FOUNDATION

Owner: IMPRESAX — SITE FACTORY
Seed tenant: Pilot #001 — Studio Dentistico Dott. Francesco Giardinelli
Status: FOUNDATION EXTRACTED / CABINA QUALITY GATE ACTIVE

## Core principle

The Dental / Medical master is not a themed template.
It is a controlled system that chooses composition, content density, trust modules and conversion patterns from verified prospect data.

Every tenant must feel commissioned, not auto-filled.

## Permanent quality gates

A tenant may be technically public for Cabina review while status = QA_READY.

It may NOT become DEMO_READY unless all three are true:

- QA_STATUS = PASS
- VISUAL_QUALITY_STATUS = APPROVED
- COMMERCIAL_QUALITY_STATUS = APPROVED

Allowed quality values:

- FAIL
- REWORK
- READY_FOR_CABINA
- APPROVED

For the first 100 companies, final Cabina approval is mandatory.

## Visual language

Preferred:
- editorial composition
- strong serif/sans contrast
- large typography
- warm medical palettes
- asymmetry where useful
- full-bleed or architectural imagery
- restrained UI chrome
- visible local context
- whitespace with intentional rhythm

Avoid:
- default blue dental templates
- giant teeth
- 3D tooth renders
- smile-stock overload
- SaaS dashboards
- repetitive card grids
- decorative icon soup
- gradients without meaning
- equal-height sections with identical cadence

## Hero system — minimum 3 patterns

### HERO A — Editorial Split
Use when:
- strong licensed/authorized hero image is available
- local professional identity is important
- premium perception is a priority

Structure:
- large editorial statement
- location + professional identity
- primary call CTA
- 2–3 verified trust facts
- full-height image with disclosure if demo imagery

Pilot #001 uses HERO A.

### HERO B — Typographic Statement
Use when:
- photography is weak/unavailable
- business name/positioning has enough authority
- a cleaner architecture-first composition is better

Structure:
- oversized type
- compact service statement
- local address
- primary CTA
- one secondary editorial visual

### HERO C — Studio-led Immersion
Use when:
- authorized studio imagery is strong
- premises/equipment/location materially affect trust

Structure:
- image-first
- small title field
- contact rail
- verified trust overlay
- progressive reveal into services

## Service presentation — 3 patterns

### SERVICES 1 — Editorial Rows
Large headings, numbered lines, restrained metadata.
Best for broad service sets.
Pilot #001 uses this.

### SERVICES 2 — Guided Clusters
Group services by patient need:
- prevention
- pain/problem
- function
- aesthetics
- rehabilitation

Use only when clustering is clinically and factually safe.

### SERVICES 3 — Featured + Index
One or two high-priority services receive editorial focus;
the rest remain in a compact indexed list.
Use when prospect data shows a clear commercial specialty.

## Trust patterns — 2 required

### TRUST A — Fact Strip
2–4 verified facts embedded near hero.
No badges unless real.

### TRUST B — Editorial Evidence
Large factual section using verified:
- professional profile
- premises
- accessibility
- association
- training
- process/safety information

Pilot #001 uses both A and B.

## CTA endings — 2 required

### CTA A — Direct Contact Band
Question/need-led statement + click-to-call + email/WhatsApp if verified.

### CTA B — Location-led Ending
Map/address first, then direct contact methods.
Best for local practices where physical proximity matters.

Pilot #001 uses A followed by B.

## Mobile rules — 390 px master

- typography is re-composed, not merely shrunk
- primary CTA is visible without desktop navigation
- sticky contact bar may be used for phone/email/WhatsApp only when verified
- service rows collapse to readable two-column number/content structure
- proof/trust facts stack vertically
- large imagery remains intentional and cropped for mobile
- no horizontal scrolling
- no dense 3-column microcards
- one clear action per visual moment

## Imagery rules

Allowed:
- prospect-owned or explicitly authorized images
- generated assets
- licensed editorial images
- generic demo imagery with an explicit demo/replacement disclosure

Not allowed:
- copying protected images from the existing site
- showing a generic dentist as if they are the real doctor
- fake before/after
- fake patients/testimonials
- irrelevant smile photography

## Typography rules

- one editorial display family category (serif)
- one functional UI/body family category (sans)
- hero line-height 0.88–1.02 depending on viewport
- body 1.6–1.8 line-height
- uppercase micro-labels only for navigation/context, not long text
- no more than 3 major visual type scales in one viewport

## Spacing rules

Desktop:
- major section spacing: 110–140 px
- editorial gaps: 60–100 px
- contact conversion bands may compress to 60–80 px

Mobile:
- major section spacing: 78–92 px
- internal gap: 28–48 px
- dense service rows: 22–30 px vertical

## Variation system

Variation is data-driven, not random.

Selection inputs:
- strength of photography
- number of verified services
- strength of professional credentials
- presence of meaningful premises/studio facts
- presence of verified WhatsApp/booking
- local competition intensity
- prospect commercial priority

The generator should vary:
- hero pattern
- service pattern
- trust pattern
- CTA ending
- section order
- image set
- accent palette within approved vertical tokens

## Pilot #001 reusable modules

- wordmark header
- editorial split hero
- verified hero proof
- signal statement band
- editorial service rows
- expandable service taxonomy
- studio evidence module
- large factual numerals
- professional profile module
- credential lines
- direct-contact conversion band
- local contact/location ending
- mobile action bar
- demo-image disclosure
- noindex + disclaimer enforcement

## Time metrics required for future tenants

Track:
- TIME_TO_FIRST_RENDER
- TIME_TO_QA
- TIME_TO_READY_FOR_CABINA
- TIME_TO_DEMO_READY

These metrics must not reduce visual quality.
The goal is to improve speed through reuse and automation, not by lowering the quality bar.
