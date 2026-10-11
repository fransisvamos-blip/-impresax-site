# SITE FACTORY QUALITY GATE — V1

A demo is not considered commercially usable because it passes technical QA.

Required states:
- qa_status
- visual_quality_status
- commercial_quality_status

## State machine

GENERATING
→ GENERATED
→ QA_READY
→ READY_FOR_CABINA (quality fields)
→ APPROVED (quality fields)
→ DEMO_READY

If visual or commercial review fails:
READY_FOR_CABINA
→ REWORK
→ QA_READY

## DEMO_READY rule

DEMO_READY requires:
- qa_status = PASS
- visual_quality_status = APPROVED
- commercial_quality_status = APPROVED
- human approval for first 100 tenants

## Visual review checks

- first-screen impact
- typography
- image credibility
- composition
- spacing
- rhythm
- responsive crop
- premium perception
- uniqueness vs template
- consistency from hero to footer

## Commercial review checks

- who / where / what understood quickly
- trust before strong CTA
- service discovery is understandable
- primary conversion is obvious
- local trust is visible
- verified contact journey works
- no fake booking or fake submission
- no content wall before action
- mobile contact path is strong
