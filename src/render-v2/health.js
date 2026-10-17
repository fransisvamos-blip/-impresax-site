import { COMPILER_VERSION, QUALITY_CONTRACT_VERSION, EXECUTION_ENGINE_VERSION, SHOWROOM_RULES_VERSION, RENDER_GENERATION_MODE, EXTERNAL_AI_CALLS_ALLOWED } from "./constants.js";

export async function operationalInvariantSnapshot(sql,{maxAiCalls=90}={}) {
  const rows=await sql`
    with current_ready as (
      select
        p.id pack_id,
        max(case when v.variant_key='A' then rr.id::text end) a_id,
        max(case when v.variant_key='B' then rr.id::text end) b_id,
        max(case when v.variant_key='C' then rr.id::text end) c_id,
        count(*) filter (
          where v.status='RENDER_READY'
            and v.certified_revision is not null
            and rr.compiler_version=${COMPILER_VERSION}
        )::int premium_ready,
        count(*) filter (
          where v.status='RENDER_READY'
            and v.certified_revision is not null
            and exists (
              select 1
              from render_qa_results_v2 q
              where q.variant_revision_id=rr.id
                and q.qa_type='VARIANT_VISUAL'
                and q.status='PASS'
                and coalesce((q.scores->>'header_quality')::numeric,0)>=8
                and coalesce((q.scores->>'navigation_quality')::numeric,0)>=8
                and coalesce((q.scores->>'page_architecture')::numeric,0)>=8
                and coalesce((q.scores->>'section_quality')::numeric,0)>=8
                and coalesce((q.scores->>'final_cta_quality')::numeric,0)>=8
                and coalesce((q.scores->>'footer_quality')::numeric,0)>=8
                and coalesce((q.scores->>'desktop_quality')::numeric,0)>=8
                and coalesce((q.scores->>'mobile_quality')::numeric,0)>=8
                and coalesce((q.scores->>'no_flat_color_blocks')::numeric,0)>=8
                and coalesce((q.scores->>'background_art_direction')::numeric,0)>=8
                and coalesce((q.scores->>'brand_motif_integration')::numeric,0)>=8
                and coalesce((q.scores->>'brand_color_presence')::numeric,0)>=8
                and coalesce((q.scores->>'chromatic_rhythm')::numeric,0)>=8
                and coalesce((q.scores->>'surface_richness')::numeric,0)>=8
                and coalesce((q.scores->>'watermark_visibility')::numeric,0)>=8
                and coalesce((q.scores->>'launch_grade_art_direction')::numeric,0)>=9
                and coalesce((q.scores->>'cinematic_tension')::numeric,0)>=9
                and coalesce((q.scores->>'spectacle_moments')::numeric,0)>=9
                and coalesce((q.scores->>'scale_contrast')::numeric,0)>=9
                and coalesce((q.scores->>'iconic_brand_presence')::numeric,0)>=9
                and coalesce((q.scores->>'custom_composition')::numeric,0)>=9
                and coalesce((q.scores->>'material_depth')::numeric,0)>=9
                and coalesce((q.scores->>'editorial_drama')::numeric,0)>=9
            )
        )::int variant_visual_passes
      from render_v2_packs p
      join render_v2_variants v on v.render_pack_id=p.id
      left join render_variant_revisions rr
        on rr.variant_id=v.id and rr.revision=v.certified_revision
      where p.status='RENDER_READY'
        and p.quality_contract_version=${QUALITY_CONTRACT_VERSION}
        and p.execution_engine_version=${EXECUTION_ENGINE_VERSION}
      group by p.id
    ),
    ready_gate as (
      select cr.*,
        (
          select q.status
          from render_qa_results_v2 q
          where q.render_pack_id=cr.pack_id
            and q.qa_type='SET_VISUAL'
            and q.artifact_hashes->>'A_revision_id'=cr.a_id
            and q.artifact_hashes->>'B_revision_id'=cr.b_id
            and q.artifact_hashes->>'C_revision_id'=cr.c_id
          order by q.created_at desc
          limit 1
        ) current_set_status,
        (
          select count(distinct q.variant_revision_id)::int
          from render_qa_results_v2 q
          where q.render_pack_id=cr.pack_id
            and q.qa_type='HERO_VISUAL'
            and q.status='PASS'
            and coalesce((q.scores->>'hero_strength')::numeric,0)>=8
            and coalesce((q.scores->>'hero_relevance')::numeric,0)>=8
            and coalesce((q.scores->>'hero_image_quality')::numeric,0)>=8
            and coalesce((q.scores->>'hero_mobile_crop')::numeric,0)>=8
            and q.variant_revision_id::text in (cr.a_id,cr.b_id,cr.c_id)
        ) hero_passes
      from current_ready cr
    ),
    rollout as (
      select phase,queue_enabled,max_concurrency,last_tick_at,metadata
      from render_v2_rollout_state where id=1
    )
    select
      r.phase,
      r.queue_enabled,
      r.max_concurrency,
      r.last_tick_at,
      r.metadata,
      (select count(*)::int from render_workflows_v2
        where workflow_type='VARIANT' and status in ('QUEUED','RUNNING','PAUSED')) active_variants,
      (select count(*)::int from render_v2_packs p
        where p.status='GENERATING'
          and not exists (
            select 1 from render_workflows_v2 w
            where w.render_pack_id=p.id
              and w.workflow_type='VARIANT'
              and w.status in ('QUEUED','RUNNING','PAUSED')
          )) ghost_generating,
      (select count(*)::int from (
        select variant_id
        from render_workflows_v2
        where workflow_type='VARIANT' and status in ('QUEUED','RUNNING','PAUSED')
        group by variant_id having count(*)>1
      ) d) duplicate_active_variant_workflows,
      (select count(*)::int
       from render_workflows_v2 w
       join render_v2_variants v on v.id=w.variant_id
       where w.workflow_type='VARIANT'
         and w.status in ('QUEUED','RUNNING','PAUSED')
         and not (
           v.status in ('GENERATING','PREVIEW_READY','QA_RUNNING','REWORK')
           or (v.status='RENDER_READY' and v.certified_revision is not null)
         )) active_variant_state_mismatch,
      (select count(*)::int from ready_gate g
       where g.premium_ready<>3
          or g.variant_visual_passes<>3
          or g.hero_passes<>3
          or g.current_set_status is distinct from 'PASS') invalid_v3_ready,
      (select count(*)::int from render_v2_packs p
       where coalesce((p.metadata->>'auto_recovery_attempt')::int,0)>3) recovery_attempt_overflow,
      (select count(*)::int
       from render_v2_packs p
       where p.status in ('GENERATING','PLANNING','QA_RUNNING','REWORK')
         and coalesce((p.metrics->>'ai_calls')::int,0)>${Number(maxAiCalls)}) budget_overflow_active,
      (select count(*)::int
       from render_v2_packs p
       where coalesce((p.metadata->>'auto_recovery_partial_open')::boolean,false)=true
         and (
           p.metadata->>'auto_recovery_run_key' is null
           or coalesce((p.metadata->>'auto_recovery_attempt')::int,0) not between 1 and 3
           or p.status not in ('GENERATING','ESCALATION_REQUIRED')
         )) partial_wave_incoherent,
      (select count(*)::int
       from render_v2_packs p
       join prospects pr on pr.id=p.prospect_id
       where p.status='INPUT_BLOCKED'
         and coalesce((p.metadata->>'remediation_exhausted')::boolean,false)=true
         and (
           pr.current_step is distinct from 'INPUT_EVIDENCE_REQUIRED'
           or pr.error is distinct from 'V2_INPUT_EVIDENCE_EXHAUSTED'
         )) exhausted_input_projection_stale,
      (select count(*)::int
       from render_v2_packs p
       join prospects pr on pr.id=p.prospect_id
       where p.status='RENDER_READY'
         and p.quality_contract_version=${QUALITY_CONTRACT_VERSION}
         and (
           pr.render_status is distinct from 'RENDER_READY'
           or pr.current_step is distinct from 'CABINA_RENDER_REVIEW'
         )) ready_projection_stale
    from rollout r`;

  const x=rows[0]||{};
  const counters={
    ghost_generating:Number(x.ghost_generating||0),
    duplicate_active_variant_workflows:Number(x.duplicate_active_variant_workflows||0),
    active_variant_state_mismatch:Number(x.active_variant_state_mismatch||0),
    invalid_v3_ready:Number(x.invalid_v3_ready||0),
    recovery_attempt_overflow:Number(x.recovery_attempt_overflow||0),
    budget_overflow_active:Number(x.budget_overflow_active||0),
    partial_wave_incoherent:Number(x.partial_wave_incoherent||0),
    exhausted_input_projection_stale:Number(x.exhausted_input_projection_stale||0),
    ready_projection_stale:Number(x.ready_projection_stale||0)
  };
  const active=Number(x.active_variants||0);
  const maxConcurrency=Number(x.max_concurrency||3);
  const queueReady=x.phase==="QUEUE_READY" && x.queue_enabled===true;
  const pilotMode=x.queue_enabled!==true && x.metadata?.pilot_single_prospect===true;
  const r90PolicyOk=!pilotMode || (
    x.metadata?.global_queue_must_remain_paused===true
    && x.metadata?.render_generation_mode===RENDER_GENERATION_MODE
    && x.metadata?.external_ai_calls_allowed===EXTERNAL_AI_CALLS_ALLOWED
    && x.metadata?.showroom_rules_version===SHOWROOM_RULES_VERSION
    && Number(x.metadata?.global_minimum_brand_rich_sections||0)>=2
    && Number(x.metadata?.global_minimum_spectacle_moments||0)>=2
    && x.metadata?.launch_grade_standard===true
    && x.metadata?.neutral_only_page_forbidden===true
  );
  const concurrencyOk=active<=maxConcurrency;
  const countersOk=Object.values(counters).every(n=>n===0);
  return {
    operational_ok:(queueReady||pilotMode) && concurrencyOk && countersOk && r90PolicyOk,
    operating_mode:pilotMode?"PILOT_SINGLE_PROSPECT":queueReady?"QUEUE_READY":"NOT_READY",
    pilot_single_prospect:pilotMode,
    r90_policy_contract_ok:r90PolicyOk,
    showroom_rules_version:SHOWROOM_RULES_VERSION,
    render_generation_mode:RENDER_GENERATION_MODE,
    external_ai_calls_allowed:EXTERNAL_AI_CALLS_ALLOWED,
    phase:x.phase||null,
    queue_enabled:x.queue_enabled===true,
    active_variants:active,
    max_concurrency:maxConcurrency,
    last_tick_at:x.last_tick_at||null,
    concurrency_ok:concurrencyOk,
    counters
  };
}
