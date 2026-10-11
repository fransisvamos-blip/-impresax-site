# PILOT #001 — GIARDINELLI V3
## ART DIRECTION FIRST — QUIET PRECISION

Status: DESIGN DIRECTION LOCKED FOR IMPLEMENTATION
Master status: V3 CANDIDATE — NOT FROZEN
Cabina approval required: YES

## Creative thesis

This is not "a premium dentist website".

It is a digital portrait of a precise local professional practice.

The visual idea is:

QUIET PRECISION

Clinical quality without coldness.
Human care without sentimental stock imagery.
Luxury through restraint, scale, rhythm and material detail — not decoration.

The Giardinelli identity is carried by:
- surname as a strong editorial object
- Catanzaro / Via Jannelli 47 as local anchors
- verified professional facts
- precision imagery of dental instruments
- warm mineral surfaces
- controlled contrast
- very little UI chrome

## Visual language

Primary qualities:
- mineral
- tactile
- architectural
- exact
- calm
- Italian editorial
- mature, not trendy

Avoid:
- clinical blue
- generic healthcare green
- card systems
- rounded SaaS components
- icon sets
- gradients as decoration
- fake smiling portraits
- visual badges
- template hero layouts

## Palette

BONE        #F2EFE8
PAPER       #FAF8F3
CARBON      #171A18
INK         #202522
OXIDE       #9B563D
CLAY        #CBB9A8
MIST        #D8DAD4
WHITE       #FFFDF8

Green is removed as a dominant visual language.
The warmth comes from bone / oxide / clay.
Authority comes from carbon / ink.

## Type system

Display:
"Iowan Old Style", "Baskerville", "Palatino Linotype", Georgia, serif

Functional:
"Helvetica Neue", Helvetica, Arial, sans-serif

Rules:
- typography carries composition
- large surname / statements may exceed normal web scale
- serif for identity and editorial voice
- sans for navigation, proof, addresses, actions
- no excessive uppercase
- micro labels use tracking, never paragraphs
- body copy is short and generous

## Spacing system

Desktop:
- canvas max: 1440 / full bleed compositions
- content rail: 1180–1240
- major scene gap: 140–190 px
- internal editorial gap: 48–90 px
- thin rules define rhythm more than boxes

Mobile 390 master:
- page inset: 18 px
- major scene gap: 88–112 px
- large type deliberately crops/wraps
- images can bleed to viewport edges
- controls keep minimum 48 px touch target

## Signature imagery

Only images that feel like material / precision studies.

V3 selected demo assets:
1. Dental instruments in a restrained, architectural composition.
   Photographer: Ozkan Guner / Unsplash.
   Free under Unsplash License.
2. Macro dental handpiece study.
   Photographer: Ozkan Guner / Unsplash.
   Free under Unsplash License.

No generic dentist portrait is used.
No person is presented as Dott. Giardinelli.
All demo imagery is replaceable by an authorized studio shoot.

Future real shoot direction:
- morning / side light
- hands preparing instruments
- surfaces / materials
- room geometry
- doctor portrait with neutral expression
- local architectural detail
- no exaggerated smiles
- no staged arms-crossed clinician shot

## Composition rules

1. FULL-BLEED OPENING
The first screen combines identity, one material image and a direct contact action.
No hero card. No trust badges.

2. EDITORIAL CONTRAST
Alternate:
- oversized type
- quiet factual copy
- image
- whitespace
- narrow rules
- numbered/service index

3. SERVICES AS INDEX
No cards.
Services are a typographic list with hierarchy and progressive disclosure.

4. TRUST AS EVIDENCE
Trust is shown through verified facts:
- professional profile
- ANDI
- Albo
- Master II level
- 180+ m²
- 3 operating units
- accessibility
No decorative "trust widgets".

5. DOCTOR WITHOUT TEAM CARD
No avatar card.
The doctor is treated as an editorial profile:
name, role, training, credentials, calm negative space.

6. LOCATION AS IDENTITY
"47" becomes a visual anchor for Via Jannelli 47.
Catanzaro is visible early and late.

## Section rhythm

01 — ARRIVAL
Large GIARDINELLI identity + precision image + Catanzaro + call.

02 — CARE
A single editorial statement:
"La cura comincia prima del trattamento."
Short human explanation.

03 — SERVICES
Large numbered service index.

04 — PRECISION / STUDIO
Macro instrument image + verified studio facts.

05 — PROFESSIONAL
Editorial Dott. Francesco Giardinelli profile.

06 — LOCAL
Via Jannelli 47 / Catanzaro as place, not a generic contact box.

07 — ACTION
One restrained final invitation to call or write.

## Mobile behavior

390 px is designed independently:
- identity type becomes a vertical composition
- hero image follows, not squeezed beside copy
- contact action stays reachable
- service index remains typography-first
- facts stack as editorial lines
- no desktop navigation compressed into tiny links
- mobile action rail uses only verified channels
- no horizontal overflow

## Desktop behavior

1440 px uses space:
- oversized name
- asymmetrical image placement
- strong left/right tension
- deliberate emptiness
- image as a field, not a thumbnail
- long horizontal rules
- no centered-stack landing-page rhythm

## Conversion system

Marketing is embedded, not announced.

ATTENTION:
identity + distinctive art direction

TRUST:
location + professional facts

COMPREHENSION:
services index

REASSURANCE:
studio evidence + professional profile

ACTION:
phone / email / map

No form.
No patient data.
No fake booking.

## Quality gate for V3

Technical PASS is necessary but insufficient.

Required before READY_FOR_CABINA:
- technical_quality_status = PASS
- visual_quality_status = READY_FOR_CABINA
- commercial_quality_status = READY_FOR_CABINA
- brand_quality_status = READY_FOR_CABINA
- mobile_quality_status = READY_FOR_CABINA
- art_direction_quality_status = READY_FOR_CABINA
- screenshots inspected at 390 / 430 / 1440

Required before DEMO_READY:
all quality fields = APPROVED
+ Cabina human approval.

## Master decision

DO NOT freeze Dental / Medical Master V3 from this build.

First:
Pilot #001 V3 → READY_FOR_CABINA → human approval.

Only after APPROVED:
extract reusable primitives and variation rules.
