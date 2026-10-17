export { RenderProspectWorkflow, RenderVariantWorkflow, RenderChaosProbeWorkflow, RenderInputRemediationWorkflow } from "./workflows.js";
import { db, packSnapshot, persistWorkflow, setPackStatus } from "./db.js";
import { createShadowInputPack } from "./input-pack.js";
import { EXECUTION_ENGINE_VERSION, QUALITY_CONTRACT_VERSION, MODEL_ROUTE_VERSION, COMPILER_VERSION, SHOWROOM_RULES_VERSION, RENDER_GENERATION_MODE, EXTERNAL_AI_CALLS_ALLOWED, MIN_SECTION_VISUALS } from "./constants.js";
import { reconcileV2 } from "./reconcile.js";
import { budgetSnapshot } from "./metrics.js";
import { selectCertifiedVariant, buildReferenceManifest } from "./manifest.js";
import { tickRollout, rolloutStatus } from "./rollout.js";
import { renderConcurrencyState } from "./concurrency.js";
import { prospectCircuitState, packCircuitOverridePending, consumePackCircuitOverride } from "./circuit.js";
import { operationalInvariantSnapshot } from "./health.js";
import { showroomPolicySummary } from "./showroom-policy.js";

function json(data,status=200){ return Response.json(data,{status,headers:{"cache-control":"no-store"}}); }

function authorized(request,env) {
  if(!env.V2_SHADOW_TOKEN) return false;
  const auth=request.headers.get("authorization")||"";
  return auth==="Bearer "+env.V2_SHADOW_TOKEN;
}

function workflowBinding(env,type) {
  return type==="VARIANT" ? env.RENDER_VARIANT_WORKFLOW : env.RENDER_PROSPECT_WORKFLOW;
}

async function writeControlEvent(sql,row,action,payload={}) {
  try {
    await sql`insert into site_events(prospect_id,event_type,entity_type,entity_id,actor,payload)
      values(${row.prospect_id}::uuid,'RENDER_V2_CONTROL','render_workflow_v2',${row.id}::text,'render-v2-shadow',
        ${JSON.stringify({action,...payload,workflow_instance_id:row.workflow_instance_id})}::jsonb)`;
  } catch {}
}

export default {
  async scheduled(controller,env,ctx) {
    ctx.waitUntil((async()=>{
      const sql=db(env);
      let reconcileResult=null;
      let reconcileError=null;
      try {
        reconcileResult=await reconcileV2(env);
      } catch(error) {
        reconcileError=String(error?.stack||error?.message||error).slice(0,5000);
      }
      try {
        await sql`
          update render_v2_rollout_state
          set metadata=(coalesce(metadata,'{}'::jsonb)
                -'scheduled_reconcile_last_error'
                -'scheduled_reconcile_last_result')
              || jsonb_build_object(
                'scheduled_reconcile_last_at',to_jsonb(now()),
                'scheduled_reconcile_last_ok',${reconcileError===null},
                'scheduled_reconcile_last_error',${reconcileError},
                'scheduled_reconcile_last_result',${JSON.stringify(reconcileResult||{})}::jsonb
              ),
              updated_at=now()
          where id=1`;
      } catch {}
      await tickRollout(env).catch(async(error)=>{
        try {
          await sql`
            update render_v2_rollout_state
            set metadata=coalesce(metadata,'{}'::jsonb)
              || jsonb_build_object(
                'scheduled_rollout_last_error',${String(error?.stack||error?.message||error).slice(0,5000)},
                'scheduled_rollout_last_error_at',to_jsonb(now())
              ),
                updated_at=now()
            where id=1`;
        } catch {}
      });
      const ref=String(env.V2_SHADOW_AUTOSTART||"").trim();
      if(!ref || !env.RENDER_PROSPECT_WORKFLOW) return;
      try {
        const created=await createShadowInputPack(env,ref);
        if(!created.input_pack || created.input_pack.certification_status!=="PASS") return;
        if(!["INPUT_READY","PLANNING","GENERATING","PREVIEW_PARTIAL","PREVIEW_READY","QA_RUNNING","REWORK"].includes(String(created.pack.status||""))) return;
        const instanceId="rpv2-"+created.pack.id;
        try {
          await env.RENDER_PROSPECT_WORKFLOW.create({
            id:instanceId,
            params:{prospectId:created.pack.prospect_id,packId:created.pack.id,inputPackId:created.input_pack.id}
          });
        } catch {
          // Idempotent: an existing workflow with this deterministic ID is expected on later cron ticks.
        }
      } catch {
        // Reconciler/health surfaces typed failures; cron must never create an uncontrolled retry loop.
      }
    })());
  },

  async fetch(request,env) {
    const url=new URL(request.url);
    if(url.pathname==="/healthz") {
      let database_connected=false;
      let hero_db_guard=false;
      let operational_invariants=null;
      try {
        const sql=db(env);
        const ping=await sql`select
          1 as ok,
          exists(
            select 1
            from pg_proc p
            join pg_namespace n on n.oid=p.pronamespace
            join pg_trigger t on t.tgfoid=p.oid
            where n.nspname='public'
              and p.proname='render_v2_certification_guard'
              and t.tgname='trg_render_v2_certification_guard'
              and t.tgenabled<>'D'
              and position('THREE_HERO_QA_PASSES_REQUIRED' in pg_get_functiondef(p.oid))>0
              and position('HERO_VISUAL_USED' in pg_get_functiondef(p.oid))>0
          ) as hero_db_guard`;
        database_connected=Number(ping[0]?.ok||0)===1;
        hero_db_guard=Boolean(ping[0]?.hero_db_guard);
        operational_invariants=await operationalInvariantSnapshot(sql,{
          maxAiCalls:Number(env.V2_MAX_AI_CALLS_PER_PACK||90)
        });
      } catch {}
      const bindings={
        ai_provider_bound:Boolean(env.AI),browser:Boolean(env.BROWSER),r2:Boolean(env.RENDER_ARTIFACTS),
        db:Boolean(env.OPS_DATABASE_URL),parent_workflow:Boolean(env.RENDER_PROSPECT_WORKFLOW),
        variant_workflow:Boolean(env.RENDER_VARIANT_WORKFLOW)
      };
      const requiredBindings=[bindings.browser,bindings.r2,bindings.db,bindings.parent_workflow,bindings.variant_workflow];
      const healthy=database_connected && hero_db_guard && requiredBindings.every(Boolean);
      return json({
        ok:healthy,service:"impresax-render-v2-shadow",mode:"SHADOW",
        quality_contract:QUALITY_CONTRACT_VERSION,engine:EXECUTION_ENGINE_VERSION,
        compiler:COMPILER_VERSION,model_routes:MODEL_ROUTE_VERSION,
        showroom_rules_version:SHOWROOM_RULES_VERSION,
        render_generation_mode:RENDER_GENERATION_MODE,
        external_ai_calls_allowed:EXTERNAL_AI_CALLS_ALLOWED,
        minimum_section_visuals:MIN_SECTION_VISUALS,
        showroom_policy:showroomPolicySummary(),
        database_connected,
        hero_contract_required:true,
        hero_db_guard,
        hero_score_floor:8,
        hero_certified_variants_required:3,
        premium_home_contract_required:true,
        premium_home_score_floor:8,
        showroom_wow_contract_required:true,
        showroom_master_score_floor:9,
        showroom_master_dimensions:["luxury_b2b_feel","premium_visual_rhythm","editorial_showcase_quality","high_end_typography","brand_elevation","cta_spectacle","showroom_conversion_power","commercial_desirability","client_wow_effect","section_imagery_quality","real_imagery_credibility","copy_sophistication","section_copy_distinctness","visual_storytelling","surface_personalization","background_art_direction","brand_motif_integration","no_flat_color_blocks","brand_color_presence","chromatic_rhythm","surface_richness","watermark_visibility"],
        premium_home_required_sections:["hero","positioning","services","trust","bridge","final-cta"],
        premium_home_shell_required:["header","navigation","header_cta","footer_navigation"],
        operational_ok:operational_invariants?.operational_ok===true,
        operational_invariants,
        bindings
      },healthy?200:503);
    }
    if(!authorized(request,env)) return json({ok:false,error:"UNAUTHORIZED"},401);

    if(request.method==="GET" && url.pathname==="/shadow/rollout/status") {
      return json({ok:true,...await rolloutStatus(env)});
    }

    if(request.method==="POST" && url.pathname==="/shadow/rollout/tick") {
      return json({ok:true,result:await tickRollout(env)});
    }

    if(request.method==="POST" && url.pathname==="/shadow/start") {
      const body=await request.json().catch(()=>({}));
      const ref=body.prospect_id||body.prospect_code;
      if(!ref) return json({ok:false,error:"prospect_id_or_code_required"},400);
      const created=await createShadowInputPack(env,ref);
      if(!created.input_pack) return json({ok:false,error:"INPUT_PACK_NOT_CREATED"},500);
      if(created.input_pack.certification_status!=="PASS") {
        return json({ok:false,status:"INPUT_BLOCKED",pack_id:created.pack.id,issues:created.input_pack.certification_issues},409);
      }
      const instanceId="rpv2-"+created.pack.id;
      const sql=db(env);
      const startCircuit=await prospectCircuitState(sql,created.pack.prospect_id);
      if(startCircuit.open) {
        return json({
          ok:false,error:"GENERATION_CIRCUIT_BREAKER",status:"ESCALATION_REQUIRED",
          pack_id:created.pack.id,api_start:true
        },409);
      }
      const capacity=await renderConcurrencyState(sql);
      if(capacity.slots<3) {
        return json({
          ok:false,error:"RENDER_CONCURRENCY_FULL",status:"DEFERRED_CONCURRENCY",
          pack_id:created.pack.id,required_slots:3,available_slots:capacity.slots,
          active_variants:capacity.active,max_concurrency:capacity.limit
        },409);
      }
      await persistWorkflow(sql,{
        prospectId:created.pack.prospect_id,packId:created.pack.id,type:"PROSPECT",
        instanceId,status:"QUEUED",metadata:{input_pack_id:created.input_pack.id,api_started:true}
      });
      let instance;
      try {
        instance=await env.RENDER_PROSPECT_WORKFLOW.create({
          id:instanceId,
          params:{prospectId:created.pack.prospect_id,packId:created.pack.id,inputPackId:created.input_pack.id}
        });
      } catch {
        instance=await env.RENDER_PROSPECT_WORKFLOW.get(instanceId);
      }
      return json({ok:true,created:created.created,pack_id:created.pack.id,input_pack_id:created.input_pack.id,workflow_instance_id:instanceId,workflow_status:await instance.status()},202);
    }

    if(request.method==="GET" && url.pathname==="/shadow/dashboard") {
      const sql=db(env);
      const rows=await sql`
        select c.*,
          (select count(*)::int from render_failures_v2 f where f.render_pack_id=c.render_pack_id and f.resolved_at is null) open_failures,
          (select count(*)::int from render_variant_revisions r join render_v2_variants v on v.id=r.variant_id where v.render_pack_id=c.render_pack_id) revision_count,
          (select count(*)::int from render_artifacts_v2 a where a.render_pack_id=c.render_pack_id) artifact_count,
          (select count(*)::int from render_qa_results_v2 q where q.render_pack_id=c.render_pack_id and q.status='PASS') qa_pass_count,
          (select max(w.last_event_at) from render_workflows_v2 w where w.render_pack_id=c.render_pack_id) workflow_last_event_at
        from render_v2_control_room c
        where c.render_pack_id is not null
        order by c.rank nulls last,c.updated_at desc
        limit 100`;
      return json({ok:true,mode:"SHADOW",engine:EXECUTION_ENGINE_VERSION,rows});
    }

    if(request.method==="GET" && url.pathname.startsWith("/shadow/benchmark/")) {
      const packId=url.pathname.split("/").pop();
      const sql=db(env);
      const packs=await sql`
        select id,prospect_id,status,created_at,preview_ready_at,render_ready_at,metrics,metadata
        from render_v2_packs where id=${packId}::uuid limit 1`;
      if(!packs.length) return json({ok:false,error:"RENDER_V2_PACK_NOT_FOUND"},404);
      const pack=packs[0];
      const counts=await sql`
        select
          (select count(*)::int from render_variant_revisions r join render_v2_variants v on v.id=r.variant_id where v.render_pack_id=${packId}::uuid) revisions,
          (select count(*)::int from render_failures_v2 where render_pack_id=${packId}::uuid) failures,
          (select count(*)::int from render_qa_results_v2 where render_pack_id=${packId}::uuid and qa_type='VARIANT_VISUAL' and status='PASS') variant_qa_passes,
          (select count(*)::int from render_qa_results_v2 where render_pack_id=${packId}::uuid and qa_type='SET_VISUAL' and status='PASS') set_qa_passes,
          (select count(*)::int from render_artifacts_v2 where render_pack_id=${packId}::uuid) artifacts`;
      const c=counts[0]||{};
      const created=new Date(pack.created_at).getTime();
      const preview=pack.preview_ready_at?new Date(pack.preview_ready_at).getTime():null;
      const ready=pack.render_ready_at?new Date(pack.render_ready_at).getTime():null;
      return json({
        ok:true,pack_id:packId,status:pack.status,
        time_to_preview_ms:preview===null?null:Math.max(0,preview-created),
        time_to_render_ready_ms:ready===null?null:Math.max(0,ready-created),
        revisions:Number(c.revisions||0),failures:Number(c.failures||0),
        variant_qa_passes:Number(c.variant_qa_passes||0),set_qa_passes:Number(c.set_qa_passes||0),
        artifacts:Number(c.artifacts||0),budget:await budgetSnapshot(sql,packId,env),
        metrics:pack.metrics||{}
      });
    }

    if(request.method==="GET" && url.pathname.startsWith("/shadow/status/")) {
      const packId=url.pathname.split("/").pop();
      const sql=db(env);
      const state=await packSnapshot(sql,packId);
      const qa=await sql`select * from render_qa_results_v2 where render_pack_id=${packId}::uuid order by created_at desc limit 30`;
      const artifacts=await sql`select id,variant_revision_id,artifact_type,r2_key,sha256,mime,bytes,created_at from render_artifacts_v2 where render_pack_id=${packId}::uuid order by created_at desc`;
      return json({ok:true,...state,qa,artifacts});
    }

    if(request.method==="POST" && url.pathname==="/shadow/relaunch-variant") {
      const body=await request.json().catch(()=>({}));
      const packId=String(body.pack_id||"").trim();
      const variantKey=String(body.variant_key||"").trim().toUpperCase();
      const runKey=String(body.run_key||"").trim().toLowerCase().replace(/[^a-z0-9_-]+/g,"-").slice(0,48);
      const force=body.force===true;
      const resetBudget=body.reset_budget===true;
      const eventPrefix=String(body.event_prefix||"initial").trim().toLowerCase().replace(/[^a-z0-9_-]+/g,"-").slice(0,32)||"initial";
      const parentWorkflowInstanceId=String(body.parent_workflow_instance_id||("rpv2-"+packId)).trim();
      const relaunchReason=String(body.reason||"TARGETED_ENGINE_REPAIR").trim().slice(0,64);
      if(!packId || !["A","B","C"].includes(variantKey) || !runKey) {
        return json({ok:false,error:"pack_id_variant_key_and_run_key_required"},400);
      }
      const sql=db(env);
      const packs=await sql`select * from render_v2_packs where id=${packId}::uuid limit 1`;
      if(!packs.length) return json({ok:false,error:"RENDER_V2_PACK_NOT_FOUND"},404);
      const pack=packs[0];
      const variants=await sql`select * from render_v2_variants where render_pack_id=${packId}::uuid and variant_key=${variantKey} limit 1`;
      if(!variants.length) return json({ok:false,error:"VARIANT_NOT_FOUND"},404);
      const variant=variants[0];
      if(!force && variant.status==="RENDER_READY" && variant.certified_revision) {
        return json({ok:true,pack_id:packId,variant_key:variantKey,skipped:true,reason:"ALREADY_RENDER_READY"},200);
      }

      const instanceId="rv2-"+packId+"-"+variantKey+"-"+runKey;
      const existing=await sql`select * from render_workflows_v2 where workflow_instance_id=${instanceId} limit 1`;
      if(existing.length) {
        let status=null;
        try { status=await (await env.RENDER_VARIANT_WORKFLOW.get(instanceId)).status(); } catch {}
        const qaRows=await sql`
          select q.status,q.scores,q.issues,q.actions,q.created_at,r.revision
          from render_qa_results_v2 q
          join render_variant_revisions r on r.id=q.variant_revision_id
          where r.variant_id=${variant.id}::uuid and q.qa_type='VARIANT_VISUAL'
          order by q.created_at desc
          limit 1`;
        return json({ok:true,pack_id:packId,variant_key:variantKey,already_applied:true,workflow_instance_id:instanceId,status,latest_qa:qaRows[0]||null},200);
      }

      const circuitState=await prospectCircuitState(sql,pack.prospect_id);
      const circuitOverridePending=circuitState.open
        ? await packCircuitOverridePending(sql,packId)
        : false;
      if(circuitState.open && !circuitOverridePending) {
        return json({
          ok:false,error:"GENERATION_CIRCUIT_BREAKER",status:"ESCALATION_REQUIRED",
          pack_id:packId,variant_key:variantKey,targeted_relaunch:true
        },409);
      }

      const prior=await sql`
        select * from render_workflows_v2
        where variant_id=${variant.id}::uuid and workflow_type='VARIANT'
        order by created_at desc limit 1`;
      if(prior[0] && ["QUEUED","RUNNING","PAUSED"].includes(prior[0].status)) {
        try {
          const oldInstance=await env.RENDER_VARIANT_WORKFLOW.get(prior[0].workflow_instance_id);
          await oldInstance.terminate({rollback:false});
        } catch {}
        await sql`update render_workflows_v2
          set status='CANCELLED',completed_at=now(),last_event_at=now(),
              metadata=metadata||${JSON.stringify({superseded_by_targeted_relaunch:true})}::jsonb
          where id=${prior[0].id}::uuid`;
      }

      const capacity=await renderConcurrencyState(sql);
      if(capacity.slots<1) {
        return json({
          ok:false,error:"RENDER_CONCURRENCY_FULL",status:"DEFERRED_CONCURRENCY",
          pack_id:packId,variant_key:variantKey,required_slots:1,available_slots:capacity.slots,
          active_variants:capacity.active,max_concurrency:capacity.limit,
          targeted_relaunch:true
        },409);
      }

      if(resetBudget) {
        await sql`
          update render_v2_packs
          set metrics=
            (coalesce(metrics,'{}'::jsonb)-'ai_calls'-'browser_captures'-'budget_epoch'-'previous_budget_epoch')
            || jsonb_build_object(
              'ai_calls',0,
              'browser_captures',0,
              'prior_epoch_ai_calls',
                coalesce((metrics->>'prior_epoch_ai_calls')::int,0)+coalesce((metrics->>'ai_calls')::int,0),
              'prior_epoch_browser_captures',
                coalesce((metrics->>'prior_epoch_browser_captures')::int,0)+coalesce((metrics->>'browser_captures')::int,0),
              'budget_epoch',${runKey}::text,
              'previous_budget_epoch',coalesce(metrics->>'budget_epoch','')
            ),
            metadata=coalesce(metadata,'{}'::jsonb)
              || jsonb_build_object(
                'budget_epoch_reset_at',now(),
                'budget_epoch_reason','TARGETED_RELAUNCH',
                'targeted_budget_variant',${variantKey}::text
              ),
            updated_at=now()
          where id=${packId}::uuid`;
      }

      const params={
        prospectId:pack.prospect_id,
        packId,
        inputPackId:pack.input_pack_id,
        variantId:variant.id,
        variantKey,
        parentInstanceId:parentWorkflowInstanceId,
        eventPrefix,
        initialFeedback:{
          reason:relaunchReason,
          issues:["This variant is being relaunched on a newer compiler/model repair route."],
          actions:[
            "Preserve verified content and the approved direction intent.",
            "Eliminate every known browser/quality defect from prior attempts.",
            "Use the current deterministic identity and token contract.",
            "Prioritize flagship composition over decorative empty geometry."
          ]
        }
      };
      await persistWorkflow(sql,{
        prospectId:pack.prospect_id,packId,variantId:variant.id,type:"VARIANT",
        instanceId,status:"QUEUED",
        metadata:{
          variant_key:variantKey,event_prefix:eventPrefix,run_key:runKey,targeted_relaunch:true,
          force_relaunch:force,reset_budget:resetBudget,parent_workflow_instance_id:parentWorkflowInstanceId,
          relaunch_reason:relaunchReason,circuit_breaker_override:circuitOverridePending
        }
      });
      let instance;
      try {
        instance=await env.RENDER_VARIANT_WORKFLOW.create({id:instanceId,params});
      } catch(error) {
        await sql`
          update render_workflows_v2
          set status='FAILED',completed_at=now(),last_event_at=now(),
              current_step='TARGETED_RELAUNCH_CREATE_FAILED',
              error_code='WORKFLOW_CREATE_FAILED',
              metadata=coalesce(metadata,'{}'::jsonb)
                || ${JSON.stringify({targeted_relaunch_create_failed:true})}::jsonb
                || jsonb_build_object('create_error',${String(error?.message||error).slice(0,1000)}::text)
          where workflow_instance_id=${instanceId}`;
        await setPackStatus(sql,packId,"ESCALATION_REQUIRED",{
          targeted_relaunch_create_failed:true,
          targeted_relaunch_run_key:runKey
        });
        return json({ok:false,error:"WORKFLOW_CREATE_FAILED",pack_id:packId,variant_key:variantKey},502);
      }

      if(circuitOverridePending) {
        const consumed=await consumePackCircuitOverride(sql,packId,"TARGETED_RELAUNCH:"+runKey);
        if(!consumed) {
          try { await instance.terminate({rollback:false}); } catch {}
          await sql`
            update render_workflows_v2
            set status='CANCELLED',completed_at=now(),last_event_at=now(),
                current_step='CIRCUIT_OVERRIDE_CONSUME_FAILED',
                error_code='GENERATION_CIRCUIT_BREAKER',
                metadata=coalesce(metadata,'{}'::jsonb)
                  || ${JSON.stringify({circuit_override_consume_failed:true})}::jsonb
            where workflow_instance_id=${instanceId}`;
          await setPackStatus(sql,packId,"ESCALATION_REQUIRED",{
            circuit_override_consume_failed:true,
            circuit_override_run_key:runKey
          });
          return json({ok:false,error:"CIRCUIT_OVERRIDE_CONSUME_FAILED",pack_id:packId,variant_key:variantKey},409);
        }
      }

      await setPackStatus(sql,packId,"GENERATING",{
        targeted_relaunch:{
          variant_key:variantKey,run_key:runKey,force,event_prefix:eventPrefix,
          parent_workflow_instance_id:parentWorkflowInstanceId,
          circuit_breaker_override:circuitOverridePending
        }
      });
      return json({
        ok:true,pack_id:packId,variant_key:variantKey,workflow_instance_id:instanceId,
        force,reset_budget:resetBudget,event_prefix:eventPrefix,
        parent_workflow_instance_id:parentWorkflowInstanceId,
        circuit_breaker_override:circuitOverridePending,
        status:await instance.status()
      },202);
    }

    if(request.method==="POST" && url.pathname==="/shadow/relaunch-variants") {
      const body=await request.json().catch(()=>({}));
      const packId=String(body.pack_id||"").trim();
      const runKey=String(body.run_key||"contract-v2").trim().toLowerCase().replace(/[^a-z0-9_-]+/g,"-").slice(0,48);
      const force=body.force===true;
      if(!packId || !runKey) return json({ok:false,error:"pack_id_and_run_key_required"},400);
      const sql=db(env);
      const packs=await sql`select * from render_v2_packs where id=${packId}::uuid limit 1`;
      if(!packs.length) return json({ok:false,error:"RENDER_V2_PACK_NOT_FOUND"},404);
      const pack=packs[0];
      const contractCircuit=await prospectCircuitState(sql,pack.prospect_id);
      if(contractCircuit.open) {
        return json({
          ok:false,error:"GENERATION_CIRCUIT_BREAKER",status:"ESCALATION_REQUIRED",
          pack_id:packId,whole_pack_relaunch:true
        },409);
      }
      if(String(pack.metadata?.contract_relaunch||"")===runKey) {
        return json({ok:true,pack_id:packId,run_key:runKey,already_applied:true,force,launched:[]},200);
      }
      const variants=await sql`select * from render_v2_variants where render_pack_id=${packId}::uuid order by variant_key`;
      if(variants.length!==3) return json({ok:false,error:"THREE_VARIANTS_REQUIRED"},409);

      const launchCandidates=variants.filter(v=>force || !(v.status==="RENDER_READY" && v.certified_revision));
      const activeReplaceableRows=await sql`
        select count(*)::int n
        from render_workflows_v2
        where render_pack_id=${packId}::uuid
          and workflow_type='VARIANT'
          and status in ('QUEUED','RUNNING','PAUSED')`;
      const capacity=await renderConcurrencyState(sql);
      const effectiveSlots=capacity.slots+Number(activeReplaceableRows[0]?.n||0);
      if(launchCandidates.length>effectiveSlots) {
        return json({
          ok:false,error:"RENDER_CONCURRENCY_FULL",status:"DEFERRED_CONCURRENCY",
          pack_id:packId,required_slots:launchCandidates.length,available_slots:effectiveSlots,
          active_variants:capacity.active,max_concurrency:capacity.limit,whole_pack_relaunch:true
        },409);
      }

      await sql`
        update render_v2_packs
        set metrics=
          (coalesce(metrics,'{}'::jsonb)-'ai_calls'-'browser_captures'-'budget_epoch'-'previous_budget_epoch')
          || jsonb_build_object(
            'ai_calls',0,
            'browser_captures',0,
            'prior_epoch_ai_calls',
              coalesce((metrics->>'prior_epoch_ai_calls')::int,0)+coalesce((metrics->>'ai_calls')::int,0),
            'prior_epoch_browser_captures',
              coalesce((metrics->>'prior_epoch_browser_captures')::int,0)+coalesce((metrics->>'browser_captures')::int,0),
            'budget_epoch',${runKey}::text,
            'previous_budget_epoch',coalesce(metrics->>'budget_epoch','')
          ),
          metadata=coalesce(metadata,'{}'::jsonb)
            || jsonb_build_object(
              'contract_relaunch',${runKey}::text,
              'budget_epoch_reset_at',now(),
              'budget_epoch_reason','CONTRACT_RELAUNCH',
              'contract_relaunch_force',${force}::boolean
            ),
          status='GENERATING',
          updated_at=now()
        where id=${packId}::uuid`;

      const launched=[];
      for(const variant of variants) {
        if(!force && variant.status==="RENDER_READY" && variant.certified_revision) {
          launched.push({variant_key:variant.variant_key,skipped:true,reason:"ALREADY_RENDER_READY"});
          continue;
        }

        const prior=await sql`
          select * from render_workflows_v2
          where variant_id=${variant.id}::uuid and workflow_type='VARIANT'
          order by created_at desc limit 1`;
        if(prior[0] && ["QUEUED","RUNNING","PAUSED"].includes(prior[0].status)) {
          try {
            const oldInstance=await env.RENDER_VARIANT_WORKFLOW.get(prior[0].workflow_instance_id);
            await oldInstance.terminate({rollback:false});
          } catch {}
          await sql`update render_workflows_v2
            set status='CANCELLED',completed_at=now(),last_event_at=now(),
                metadata=metadata||${JSON.stringify({superseded_by_contract_relaunch:true})}::jsonb
            where id=${prior[0].id}::uuid`;
        }

        const instanceId="rv2-"+packId+"-"+variant.variant_key+"-"+runKey;
        const params={
          prospectId:pack.prospect_id,
          packId,
          inputPackId:pack.input_pack_id,
          variantId:variant.id,
          variantKey:variant.variant_key,
          parentInstanceId:"rpv2-"+packId,
          eventPrefix:"initial",
          initialFeedback:{
            reason:"ENGINE_CONTRACT_UPGRADE",
            issues:["Previous attempts were generated under a superseded RenderSpec contract and may not satisfy the mandatory premium hero contract."],
            actions:[
              "Use the current token-safe RenderSpec contract only.",
              "Keep official identity outside main_html.",
              "Produce a complete premium 6-10 section desktop/mobile composition.",
              "Use HERO_VISUAL as the dominant prospect-relevant photographic hero and pass the dedicated desktop/mobile hero quality gate."
            ]
          }
        };
        await persistWorkflow(sql,{
          prospectId:pack.prospect_id,packId,variantId:variant.id,type:"VARIANT",
          instanceId,status:"QUEUED",
          metadata:{variant_key:variant.variant_key,event_prefix:"initial",run_key:runKey,contract_relaunch:true,force_relaunch:force}
        });
        const instance=await env.RENDER_VARIANT_WORKFLOW.create({id:instanceId,params});
        launched.push({variant_key:variant.variant_key,workflow_instance_id:instanceId,status:await instance.status()});
      }
      await setPackStatus(sql,packId,"GENERATING",{contract_relaunch:runKey});
      return json({ok:true,pack_id:packId,run_key:runKey,already_applied:false,force,launched},202);
    }

    if(request.method==="GET" && url.pathname.startsWith("/shadow/workflow/")) {
      const id=url.pathname.split("/").pop();
      const sql=db(env);
      const rows=await sql`select workflow_type from render_workflows_v2 where workflow_instance_id=${id} limit 1`;
      if(!rows.length) return json({ok:false,error:"WORKFLOW_NOT_FOUND"},404);
      const instance=await workflowBinding(env,rows[0].workflow_type).get(id);
      return json({ok:true,id,workflow_type:rows[0].workflow_type,status:await instance.status()});
    }

    if(request.method==="POST" && url.pathname==="/shadow/select") {
      const body=await request.json().catch(()=>({}));
      const packId=String(body.pack_id||"").trim();
      const variantKey=String(body.variant_key||"").toUpperCase();
      if(!packId || !["A","B","C"].includes(variantKey)) return json({ok:false,error:"pack_id_and_variant_key_required"},400);
      const sql=db(env);
      try {
        const selected=await selectCertifiedVariant(sql,{packId,variantKey});
        return json({ok:true,pack_id:packId,variant_key:variantKey,selected_variant_revision_id:selected.revision_id});
      } catch(error) {
        return json({ok:false,error:String(error?.message||error)},409);
      }
    }

    if(request.method==="GET" && url.pathname.startsWith("/shadow/reference-manifest/")) {
      const packId=url.pathname.split("/").pop();
      const sql=db(env);
      try {
        return json({ok:true,manifest:await buildReferenceManifest(sql,packId)});
      } catch(error) {
        return json({ok:false,error:String(error?.message||error)},409);
      }
    }

    if(request.method==="POST" && url.pathname==="/shadow/reconcile") {
      return json({ok:true,summary:await reconcileV2(env)});
    }

    if(request.method==="POST" && url.pathname==="/shadow/control") {
      const body=await request.json().catch(()=>({}));
      const instanceId=String(body.workflow_instance_id||"").trim();
      const action=String(body.action||"").toLowerCase();
      if(!instanceId || !["pause","resume","restart","terminate"].includes(action)) {
        return json({ok:false,error:"workflow_instance_id_and_valid_action_required"},400);
      }
      const sql=db(env);
      const rows=await sql`select * from render_workflows_v2 where workflow_instance_id=${instanceId} limit 1`;
      if(!rows.length) return json({ok:false,error:"WORKFLOW_NOT_FOUND"},404);
      const row=rows[0];
      const instance=await workflowBinding(env,row.workflow_type).get(instanceId);

      if(action==="pause") {
        await instance.pause();
        await sql`update render_workflows_v2 set status='PAUSED',last_event_at=now(),metadata=metadata||${JSON.stringify({human_control:"pause"})}::jsonb where id=${row.id}::uuid`;
      } else if(action==="resume") {
        await instance.resume();
        await sql`update render_workflows_v2 set status='RUNNING',last_event_at=now(),metadata=metadata||${JSON.stringify({human_control:"resume"})}::jsonb where id=${row.id}::uuid`;
      } else if(action==="restart") {
        const fromName=String(body.from_step||"").trim();
        if(fromName) {
          await instance.restart({from:{name:fromName,count:Number(body.count||1),type:["do","sleep","waitForEvent"].includes(body.step_type)?body.step_type:"do"}});
        } else {
          await instance.restart();
        }
        await sql`update render_workflows_v2 set status='RUNNING',last_event_at=now(),attempt=attempt+1,metadata=metadata||${JSON.stringify({human_control:"restart",from_step:body.from_step||null})}::jsonb where id=${row.id}::uuid`;
      } else if(action==="terminate") {
        await instance.terminate({rollback:body.rollback===true});
        await sql`update render_workflows_v2 set status='CANCELLED',completed_at=now(),last_event_at=now(),metadata=metadata||${JSON.stringify({human_control:"terminate",rollback:body.rollback===true})}::jsonb where id=${row.id}::uuid`;
      }
      await writeControlEvent(sql,row,action,{from_step:body.from_step||null,rollback:body.rollback===true});
      return json({ok:true,workflow_instance_id:instanceId,action,status:await instance.status()});
    }

    if(request.method==="GET" && url.pathname.startsWith("/shadow/artifact/")) {
      const artifactId=url.pathname.split("/").pop();
      const sql=db(env);
      const rows=await sql`select * from render_artifacts_v2 where id=${artifactId}::uuid limit 1`;
      if(!rows.length) return json({ok:false,error:"ARTIFACT_NOT_FOUND"},404);
      const artifact=rows[0];
      const object=await env.RENDER_ARTIFACTS.get(artifact.r2_key);
      if(!object) return json({ok:false,error:"R2_ARTIFACT_NOT_FOUND"},404);
      return new Response(object.body,{status:200,headers:{
        "content-type":artifact.mime,
        "cache-control":"private, no-store",
        "x-content-type-options":"nosniff",
        "x-render-artifact-sha256":artifact.sha256
      }});
    }

    if(request.method==="GET" && url.pathname.startsWith("/shadow/budget/")) {
      const packId=url.pathname.split("/").pop();
      const sql=db(env);
      return json({ok:true,pack_id:packId,budget:await budgetSnapshot(sql,packId,env)});
    }

    return json({ok:false,error:"NOT_FOUND"},404);
  }
};
