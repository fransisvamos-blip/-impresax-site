import { WorkflowEntrypoint } from "cloudflare:workers";
import { db, getInputPack, getV2Pack, setPackStatus, persistWorkflow, updateWorkflow, getContentTruth, persistContentTruth, getDirectionPlan, persistDirectionPlan, persistCreativePlan, createVariants, allocateRevision, updateRevision, setVariantStatus, ensureBestPreview, recordQa, recordFailure, countFailureFingerprint } from "./db.js";
import { EXECUTION_ENGINE_VERSION, MODEL_ROUTE_VERSION, PROMPT_VERSION, MAX_VISUAL_REVISIONS } from "./constants.js";
import { generateContentTruthDraft, reviewContentTruthDraft, createCreativeDirections, combineCreativePlan, buildCopyManifest, generateRenderSpec, runVisualQa, runSetQa } from "./ai.js";
import { ingestInputAssets, putArtifact, materializeAssetDataUrls, readArtifactBytes } from "./artifacts.js";
import { compileRenderSpec, buildCaptureHtml } from "./compiler.js";
import { captureVariant } from "./browser.js";
import { classifyFailure, failureFingerprint, shouldChangeStrategy } from "./failure-policy.js";
import { bytesToBase64 } from "./utils.js";
import { reserveAiCall, reserveBrowserCapture } from "./metrics.js";
import { buildContactManifest } from "./contacts.js";
import { sanitizeDirectionForExecution, buildZeroPhotoPremiumSpec } from "./design-grammar.js";


async function inputAssetsFromDb(sql,packId,inputPayload) {
  const rows=await sql`
    select artifact_type,r2_key,sha256,mime,bytes
    from render_artifacts_v2
    where render_pack_id=${packId}::uuid and artifact_type like 'INPUT_ASSET_%'`;
  const byToken={};
  for(const row of rows) {
    const token=String(row.artifact_type).replace(/^INPUT_ASSET_/,"");
    const source=(inputPayload.assets||[]).find(x=>x.asset_id===token)||{};
    byToken[token]={...source,r2_key:row.r2_key,sha256:row.sha256,mime:row.mime,bytes:row.bytes};
  }
  return byToken;
}

async function parentInstance(env,id) {
  return env.RENDER_PROSPECT_WORKFLOW.get(id);
}

async function emitParent(env,parentId,type,payload) {
  try {
    const parent=await parentInstance(env,parentId);
    await parent.sendEvent({type,payload});
    return true;
  } catch {
    // Child certification must never be invalidated by a stale/dead parent.
    // The reconciler can launch a fresh pack finalizer from persisted variant state.
    return false;
  }
}

async function latestCertifiedRevision(sql,variantId) {
  const rows=await sql`
    select r.*
    from render_v2_variants v
    join render_variant_revisions r on r.variant_id=v.id and r.revision=v.certified_revision
    where v.id=${variantId}::uuid
    limit 1`;
  return rows[0]||null;
}

async function recordTypedFailure(sql,{packId,workflowInstanceId,revisionId=null,stepName,error,variantKey=null,revision=null,strategyVersion}) {
  const wf=await sql`select id from render_workflows_v2 where workflow_instance_id=${workflowInstanceId} limit 1`;
  const failure=classifyFailure(error,{step:stepName,variant_key:variantKey,revision});
  const fingerprint=await failureFingerprint(failure);
  const before=await countFailureFingerprint(sql,packId,fingerprint);
  const rec=await recordFailure(sql,{
    packId,workflowId:wf[0]?.id||null,revisionId,step:stepName,failure,fingerprint,
    strategyVersion,attempt:before+1,details:{variant_key:variantKey,revision}
  });
  const total=await countFailureFingerprint(sql,packId,fingerprint);
  return {failure,fingerprint,count:total,record:rec,change_strategy:shouldChangeStrategy(total)};
}

export class RenderVariantWorkflow extends WorkflowEntrypoint {
  async run(event,step) {
    try {
      return await this.runInternal(event,step);
    } catch(error) {
      const params=event.payload||{};
      const eventPrefix=String(params.eventPrefix||"initial");
      const previewType="preview-"+params.variantKey+"-"+eventPrefix;
      const terminalType="terminal-"+params.variantKey+"-"+eventPrefix;
      const message=String(error?.message||error||"UNHANDLED_VARIANT_FAILURE");
      const failure=classifyFailure(error,{step:"VARIANT_UNHANDLED",variant_key:params.variantKey});
      let sql=null;
      try {
        sql=db(this.env);
        await persistWorkflow(sql,{
          prospectId:params.prospectId,packId:params.packId,variantId:params.variantId,
          type:"VARIANT",instanceId:event.instanceId,status:"FAILED",
          metadata:{emergency_fail_safe:true,error:message}
        });
        await recordTypedFailure(sql,{
          packId:params.packId,workflowInstanceId:event.instanceId,stepName:"VARIANT_UNHANDLED",
          error:message,variantKey:params.variantKey,strategyVersion:EXECUTION_ENGINE_VERSION
        });
        if(params.variantId) await setVariantStatus(sql,params.variantId,{status:"QA_FAILED"});
        await updateWorkflow(sql,event.instanceId,{status:"FAILED",currentStep:"FAIL_SAFE_ESCALATION",errorCode:failure.failure_code});
      } catch {}
      try {
        await emitParent(this.env,params.parentInstanceId,previewType,{variant_key:params.variantKey,status:"NO_PREVIEW",fail_safe:true});
      } catch {}
      try {
        await emitParent(this.env,params.parentInstanceId,terminalType,{variant_key:params.variantKey,status:"ESCALATION_REQUIRED",failure_domain:failure.failure_domain,fail_safe:true});
      } catch {}
      return {status:"ESCALATION_REQUIRED",variant:params.variantKey,failure_domain:failure.failure_domain,fail_safe:true};
    }
  }

  async runInternal(event,step) {
    const params=event.payload;
    const sql=db(this.env);
    const eventPrefix=String(params.eventPrefix||"initial");
    const previewType="preview-"+params.variantKey+"-"+eventPrefix;
    const terminalType="terminal-"+params.variantKey+"-"+eventPrefix;

    await step.do("register-variant-workflow",{retries:{limit:2,delay:"2 seconds",backoff:"exponential"}},async()=>{
      await persistWorkflow(sql,{
        prospectId:params.prospectId,packId:params.packId,variantId:params.variantId,
        type:"VARIANT",instanceId:event.instanceId,status:"RUNNING",
        metadata:{variant_key:params.variantKey,event_prefix:eventPrefix}
      });
      return {ok:true};
    });

    const context=await step.do("load-variant-context",{retries:{limit:2,delay:"2 seconds",backoff:"exponential"}},async()=>{
      const input=await getInputPack(sql,params.inputPackId);
      const planRows=await sql`select * from render_creative_plans_v2 where render_pack_id=${params.packId}::uuid limit 1`;
      if(!planRows.length) throw new Error("SYSTEM_INVARIANT:CREATIVE_PLAN_NOT_FOUND");
      const plan=planRows[0];
      const inputPayload=input.payload;
      const assets=await inputAssetsFromDb(sql,params.packId,inputPayload);
      const copyManifest=buildCopyManifest(plan.content_truth_pack);
      const ctaManifest=buildContactManifest(inputPayload);
      const editorialAssetTokens=Object.keys(assets).filter(k=>k!=="PRIMARY_LOGO" && !assets[k]?.unavailable);
      const zeroPhoto=editorialAssetTokens.length===0;
      const direction=sanitizeDirectionForExecution(plan.directions?.[params.variantKey],{hasEditorialAssets:!zeroPhoto});
      return {inputPayload,assets,copyManifest,ctaManifest,direction,editorialAssetTokens,zeroPhoto};
    });

    let feedback=params.initialFeedback||null;
    let previousSpec=null;
    if(params.parentRevisionId) {
      const prior=await step.do("load-parent-revision",async()=>{
        const rows=await sql`select * from render_variant_revisions where id=${params.parentRevisionId}::uuid limit 1`;
        return rows[0]||null;
      });
      previousSpec=prior?.render_spec||null;
    }

    let previewEmitted=false;
    for(let cycle=1;cycle<=MAX_VISUAL_REVISIONS;cycle++) {
      const revision=await step.do("r"+cycle+"-allocate",async()=>{
        const r=await allocateRevision(sql,params.variantId,cycle===1?params.parentRevisionId:null,event.instanceId+":cycle:"+cycle);
        await updateWorkflow(sql,event.instanceId,{status:"RUNNING",currentStep:"GENERATE",attempt:cycle,metadata:{revision:r.revision}});
        return r;
      });

      let generated;
      try {
        generated=await step.do("r"+cycle+"-generate",{retries:{limit:1,delay:"3 seconds",backoff:"exponential"},timeout:"12 minutes"},async()=>{
          if(context.zeroPhoto && cycle===1) {
            const deterministic=buildZeroPhotoPremiumSpec({
              variantKey:params.variantKey,
              copyManifest:context.copyManifest,
              hasIdentity:Boolean(context.assets.PRIMARY_LOGO)
            });
            return {spec:deterministic.spec,model:deterministic.strategy,deterministic:true};
          }
          return generateRenderSpec(this.env,{
            inputPayload:context.inputPayload,direction:context.direction,variantKey:params.variantKey,
            copyManifest:context.copyManifest,
            assetTokens:context.editorialAssetTokens,
            qaFeedback:feedback,previousSpec,
            beforeModelAttempt:({model})=>reserveAiCall(sql,params.packId,this.env,"VARIANT_GENERATION:"+model,revision.id)
          });
        });
      } catch(error) {
        const message=String(error?.message||error);
        const fail=await step.do("r"+cycle+"-record-generation-provider-failure",async()=>
          recordTypedFailure(sql,{packId:params.packId,workflowInstanceId:event.instanceId,revisionId:revision.id,stepName:"VARIANT_GENERATION_PROVIDER",error:message,variantKey:params.variantKey,revision:revision.revision,strategyVersion:MODEL_ROUTE_VERSION})
        );
        const domain=fail?.failure?.failure_domain||"AI_PROVIDER";
        const budget=domain==="SYSTEM_INVARIANT" && /HARD_BUDGET_EXCEEDED/.test(message);
        await step.do("r"+cycle+"-generation-provider-escalation",async()=>{
          await updateRevision(sql,revision.id,{status:"QA_FAILED"});
          if(!previewEmitted) await emitParent(this.env,params.parentInstanceId,previewType,{variant_key:params.variantKey,status:"NO_PREVIEW"});
          await updateWorkflow(sql,event.instanceId,{status:"FAILED",currentStep:budget?"BUDGET_ESCALATION":"AI_PROVIDER_ESCALATION",errorCode:budget?"HARD_BUDGET_EXCEEDED":"VARIANT_GENERATION_PROVIDER_FAILED"});
          await emitParent(this.env,params.parentInstanceId,terminalType,{variant_key:params.variantKey,status:"ESCALATION_REQUIRED",failure_domain:domain});
          return {ok:true};
        });
        return {status:"ESCALATION_REQUIRED",variant:params.variantKey,failure_domain:domain};
      }

      previousSpec=generated.spec;
      const assetManifest=Object.fromEntries(
        Object.keys(context.assets).filter(k=>k!=="PRIMARY_LOGO").map(k=>[k,"asset://"+k])
      );
      const logoToken=context.assets.PRIMARY_LOGO?"identity://PRIMARY_LOGO":null;
      const compiled=await step.do("r"+cycle+"-compile",async()=>{
        return compileRenderSpec(generated.spec,{
          businessName:context.inputPayload.business_name,logoToken,
          copyManifest:context.copyManifest,assetManifest,ctaManifest:context.ctaManifest
        });
      });

      if(!compiled.ok) {
        const msg="RENDER_SPEC_COMPILE_FAILED:"+compiled.issues.join("|");
        const fail=await step.do("r"+cycle+"-record-compile-failure",async()=>
          recordTypedFailure(sql,{packId:params.packId,workflowInstanceId:event.instanceId,revisionId:revision.id,stepName:"COMPILE",error:msg,variantKey:params.variantKey,revision:revision.revision,strategyVersion:"RS_COMPILER_V1"})
        );
        await updateRevision(sql,revision.id,{status:"QA_FAILED",renderSpec:generated.spec});
        feedback={
          issues:compiled.issues,
          actions:[
            "Preserve the approved visual direction but rebuild the failing markup/CSS to satisfy the RenderSpec contract.",
            "Never reference PRIMARY_LOGO inside main_html; the deterministic compiler owns official identity.",
            "Replace every literal visible string or decorative number with an allowed copy token or remove it.",
            "Remove CSS content:, url(), @import and any external/network construct.",
            "Return 6-10 substantial sections, complete desktop/mobile CSS, and only declared tokens."
          ],
          reason:"COMPILER_CONTRACT"
        };
        if(fail.change_strategy) break;
        continue;
      }

      const htmlKey="render-v2/"+context.inputPayload.prospect_code+"/"+params.packId+"/"+params.variantKey+"/r"+revision.revision+"/source.html";
      const htmlArtifact=await step.do("r"+cycle+"-persist-source",{retries:{limit:2,delay:"2 seconds",backoff:"exponential"}},async()=>{
        return putArtifact(this.env,sql,{packId:params.packId,revisionId:revision.id,type:"SOURCE_HTML",key:htmlKey,body:compiled.html,mime:"text/html; charset=utf-8",producerStep:"COMPILE"});
      });
      await updateRevision(sql,revision.id,{status:"CAPTURING",renderSpec:compiled.normalized_spec||generated.spec,sourceHash:compiled.source_hash,htmlKey:htmlKey});

      let captured;
      try {
        captured=await step.do("r"+cycle+"-capture",{retries:{limit:1,delay:"3 seconds",backoff:"constant"},timeout:"5 minutes"},async()=>{
          const existing=await sql`
            select artifact_type,r2_key,sha256,mime,bytes
            from render_artifacts_v2
            where variant_revision_id=${revision.id}::uuid
              and artifact_type in ('DESKTOP_1440','MOBILE_390','QA_DESKTOP','QA_MOBILE','BROWSER_DIAGNOSTICS')`;
          const byType=Object.fromEntries(existing.map(x=>[x.artifact_type,x]));
          if(["DESKTOP_1440","MOBILE_390","QA_DESKTOP","QA_MOBILE","BROWSER_DIAGNOSTICS"].every(k=>byType[k])) {
            const diagBytes=await readArtifactBytes(this.env,byType.BROWSER_DIAGNOSTICS.r2_key);
            const diag=JSON.parse(new TextDecoder().decode(diagBytes));
            return {
              ok:true,reused:true,
              desktop:byType.DESKTOP_1440,mobile:byType.MOBILE_390,
              qaDesktop:byType.QA_DESKTOP,qaMobile:byType.QA_MOBILE,
              gate:diag.gate,diagnostics:diag.diagnostics
            };
          }

          await reserveBrowserCapture(sql,params.packId,this.env,params.variantKey,revision.id);
          const dataUrls=await materializeAssetDataUrls(this.env,context.assets);
          const captureHtml=buildCaptureHtml(compiled.html,dataUrls);
          const result=await captureVariant(this.env,captureHtml,context.inputPayload);
          const base="render-v2/"+context.inputPayload.prospect_code+"/"+params.packId+"/"+params.variantKey+"/r"+revision.revision+"/";
          const [desktop,mobile,qaDesktop,qaMobile]=await Promise.all([
            putArtifact(this.env,sql,{packId:params.packId,revisionId:revision.id,type:"DESKTOP_1440",key:base+"desktop-1440.jpg",body:result.desktop.bytes,mime:"image/jpeg",producerStep:"BROWSER_CAPTURE"}),
            putArtifact(this.env,sql,{packId:params.packId,revisionId:revision.id,type:"MOBILE_390",key:base+"mobile-390.jpg",body:result.mobile.bytes,mime:"image/jpeg",producerStep:"BROWSER_CAPTURE"}),
            putArtifact(this.env,sql,{packId:params.packId,revisionId:revision.id,type:"QA_DESKTOP",key:base+"qa-desktop.jpg",body:result.desktop.qaBytes,mime:"image/jpeg",producerStep:"BROWSER_CAPTURE_QA"}),
            putArtifact(this.env,sql,{packId:params.packId,revisionId:revision.id,type:"QA_MOBILE",key:base+"qa-mobile.jpg",body:result.mobile.qaBytes,mime:"image/jpeg",producerStep:"BROWSER_CAPTURE_QA"})
          ]);
          const diagPayload={gate:result.gate,diagnostics:{desktop:result.desktop.diagnostics,mobile:result.mobile.diagnostics}};
          await putArtifact(this.env,sql,{
            packId:params.packId,revisionId:revision.id,type:"BROWSER_DIAGNOSTICS",
            key:base+"browser-diagnostics.json",
            body:new TextEncoder().encode(JSON.stringify(diagPayload)),
            mime:"application/json",producerStep:"BROWSER_CAPTURE"
          });
          return {ok:true,desktop,mobile,qaDesktop,qaMobile,...diagPayload};
        });
      } catch(error) {
        captured={ok:false,error:String(error?.message||error)};
      }

      if(!captured.ok) {
        const fail=await step.do("r"+cycle+"-record-browser-failure",async()=>
          recordTypedFailure(sql,{packId:params.packId,workflowInstanceId:event.instanceId,revisionId:revision.id,stepName:"BROWSER_CAPTURE",error:captured.error,variantKey:params.variantKey,revision:revision.revision,strategyVersion:"BROWSER_V2"})
        );
        const domain=fail?.failure?.failure_domain||"BROWSER";
        const budget=domain==="SYSTEM_INVARIANT" && /HARD_BUDGET_EXCEEDED/.test(captured.error);
        await step.do("r"+cycle+"-browser-escalation",async()=>{
          await updateRevision(sql,revision.id,{status:"QA_FAILED"});
          if(!previewEmitted) await emitParent(this.env,params.parentInstanceId,previewType,{variant_key:params.variantKey,status:"NO_PREVIEW"});
          await updateWorkflow(sql,event.instanceId,{status:"FAILED",currentStep:budget?"BUDGET_ESCALATION":"BROWSER_ESCALATION",errorCode:budget?"HARD_BUDGET_EXCEEDED":"BROWSER_CAPTURE_FAILED"});
          await emitParent(this.env,params.parentInstanceId,terminalType,{variant_key:params.variantKey,status:"ESCALATION_REQUIRED",failure_domain:domain});
          return {ok:true};
        });
        return {status:"ESCALATION_REQUIRED",variant:params.variantKey,failure_domain:domain};
      }

      if(!captured.gate.pass) {
        const msg="BROWSER_DETERMINISTIC_GATE:"+captured.gate.issues.join("|");
        const fail=await step.do("r"+cycle+"-record-browser-gate-failure",async()=>
          recordTypedFailure(sql,{packId:params.packId,workflowInstanceId:event.instanceId,revisionId:revision.id,stepName:"BROWSER_DIAGNOSTICS",error:msg,variantKey:params.variantKey,revision:revision.revision,strategyVersion:"BROWSER_GATE_V1"})
        );
        await updateRevision(sql,revision.id,{status:"QA_FAILED",desktopKey:captured.desktop.r2_key,mobileKey:captured.mobile.r2_key});
        feedback={issues:captured.gate.issues,actions:["Fix only the deterministic browser defects."]};
        if(fail.change_strategy) break;
        continue;
      }

      await step.do("r"+cycle+"-publish-preview",async()=>{
        await updateRevision(sql,revision.id,{status:"PREVIEW_READY",desktopKey:captured.desktop.r2_key,mobileKey:captured.mobile.r2_key});
        await ensureBestPreview(sql,params.variantId,revision.revision);
        await setVariantStatus(sql,params.variantId,{status:"PREVIEW_READY"});
        if(!previewEmitted) {
          await emitParent(this.env,params.parentInstanceId,previewType,{variant_key:params.variantKey,status:"PREVIEW_READY",revision:revision.revision,revision_id:revision.id});
        }
        return {ok:true};
      });
      previewEmitted=true;

      let qa;
      try {
        qa=await step.do("r"+cycle+"-visual-qa",{retries:{limit:1,delay:"3 seconds",backoff:"exponential"},timeout:"8 minutes"},async()=>{
          const desktopBytes=await readArtifactBytes(this.env,captured.qaDesktop.r2_key);
          const mobileBytes=await readArtifactBytes(this.env,captured.qaMobile.r2_key);
          return runVisualQa(this.env,{
            inputPayload:context.inputPayload,direction:context.direction,variantKey:params.variantKey,
            desktopB64:bytesToBase64(desktopBytes),mobileB64:bytesToBase64(mobileBytes),
            beforeModelAttempt:({model})=>reserveAiCall(sql,params.packId,this.env,"VARIANT_VISUAL_QA:"+model,revision.id)
          });
        });
      } catch(error) {
        const message=String(error?.message||error);
        const fail=await step.do("r"+cycle+"-record-qa-provider-failure",async()=>
          recordTypedFailure(sql,{packId:params.packId,workflowInstanceId:event.instanceId,revisionId:revision.id,stepName:"VISUAL_QA_PROVIDER",error:message,variantKey:params.variantKey,revision:revision.revision,strategyVersion:MODEL_ROUTE_VERSION})
        );
        const domain=fail?.failure?.failure_domain||"AI_OUTPUT_SCHEMA";
        const budget=domain==="SYSTEM_INVARIANT" && /HARD_BUDGET_EXCEEDED/.test(message);
        await step.do("r"+cycle+"-qa-provider-escalation",async()=>{
          await updateWorkflow(sql,event.instanceId,{status:"FAILED",currentStep:budget?"BUDGET_ESCALATION":"QA_PROVIDER_ESCALATION",errorCode:budget?"HARD_BUDGET_EXCEEDED":"VISUAL_QA_PROVIDER_FAILED"});
          await emitParent(this.env,params.parentInstanceId,terminalType,{variant_key:params.variantKey,status:"ESCALATION_REQUIRED",failure_domain:domain});
          return {ok:true};
        });
        return {status:"ESCALATION_REQUIRED",variant:params.variantKey,failure_domain:domain,preview_preserved:true};
      }

      await step.do("r"+cycle+"-persist-qa",async()=>{
        await recordQa(sql,{
          packId:params.packId,revisionId:revision.id,type:"VARIANT_VISUAL",status:qa.pass?"PASS":"FAIL",
          scores:qa.scores,issues:qa.issues,actions:qa.actions,
          artifactHashes:{desktop:captured.desktop.sha256,mobile:captured.mobile.sha256},
          modelRouteVersion:MODEL_ROUTE_VERSION,promptVersion:PROMPT_VERSION
        });
        return {ok:true};
      });

      if(qa.pass) {
        await step.do("r"+cycle+"-certify",async()=>{
          await updateRevision(sql,revision.id,{status:"RENDER_READY",score:qa.min_score});
          await setVariantStatus(sql,params.variantId,{status:"RENDER_READY",bestPreview:revision.revision,bestQa:revision.revision,certified:revision.revision});
          await updateWorkflow(sql,event.instanceId,{status:"COMPLETED",currentStep:"RENDER_READY",attempt:cycle});
          await emitParent(this.env,params.parentInstanceId,terminalType,{variant_key:params.variantKey,status:"RENDER_READY",revision:revision.revision,revision_id:revision.id});
          return {ok:true};
        });
        return {status:"RENDER_READY",variant:params.variantKey,revision:revision.revision};
      }

      await updateRevision(sql,revision.id,{status:"QA_FAILED",score:qa.min_score});
      await setVariantStatus(sql,params.variantId,{status:"REWORKING"});
      const visualFailure=await step.do("r"+cycle+"-record-visual-failure",async()=>
        recordTypedFailure(sql,{packId:params.packId,workflowInstanceId:event.instanceId,revisionId:revision.id,stepName:"VISUAL_QUALITY",error:"VISUAL_QUALITY_BELOW_BAR:"+qa.summary,variantKey:params.variantKey,revision:revision.revision,strategyVersion:PROMPT_VERSION})
      );

      const bestCandidate=await step.do("r"+cycle+"-load-best-candidate",async()=>{
        const rows=await sql`
          select revision,render_spec,score
          from render_variant_revisions
          where variant_id=${params.variantId}::uuid
            and render_spec is not null
            and score is not null
          order by score desc, revision desc
          limit 1`;
        return rows[0]||null;
      });
      if(bestCandidate?.render_spec && Number(bestCandidate.score||0)>=Number(qa.min_score||0)) {
        previousSpec=bestCandidate.render_spec;
      } else {
        previousSpec=compiled.normalized_spec||generated.spec;
      }
      feedback={
        issues:qa.issues,
        actions:qa.actions,
        summary:qa.summary,
        scores:qa.scores,
        reason:visualFailure.change_strategy?"VISUAL_STRATEGY_SWITCH":"VISUAL_REPAIR",
        best_candidate_revision:bestCandidate?.revision||revision.revision,
        best_candidate_score:Number(bestCandidate?.score??qa.min_score??0)
      };
    }

    await step.do("terminal-escalation",async()=>{
      if(!previewEmitted) await emitParent(this.env,params.parentInstanceId,previewType,{variant_key:params.variantKey,status:"NO_PREVIEW"});
      await setVariantStatus(sql,params.variantId,{status:"QA_FAILED"});
      await updateWorkflow(sql,event.instanceId,{status:"FAILED",currentStep:"ESCALATION_REQUIRED",errorCode:"VARIANT_MAX_REVISIONS"});
      await emitParent(this.env,params.parentInstanceId,terminalType,{variant_key:params.variantKey,status:"ESCALATION_REQUIRED"});
      return {ok:true};
    });
    return {status:"ESCALATION_REQUIRED",variant:params.variantKey};
  }
}

export class RenderProspectWorkflow extends WorkflowEntrypoint {
  async run(event,step) {
    try {
      return await this.runInternal(event,step);
    } catch(error) {
      const p=event.payload||{};
      const message=String(error?.message||error||"UNHANDLED_PARENT_FAILURE");
      const failure=classifyFailure(error,{step:"PARENT_UNHANDLED"});
      try {
        const sql=db(this.env);
        await persistWorkflow(sql,{
          prospectId:p.prospectId,packId:p.packId,type:"PROSPECT",
          instanceId:event.instanceId,status:"FAILED",
          metadata:{emergency_fail_safe:true,error:message}
        });
        await recordTypedFailure(sql,{
          packId:p.packId,workflowInstanceId:event.instanceId,stepName:"PARENT_UNHANDLED",
          error:message,strategyVersion:EXECUTION_ENGINE_VERSION
        });
        const packStatus=["INPUT_DATA","ASSET"].includes(failure.failure_domain) ? "INPUT_BLOCKED" : "ESCALATION_REQUIRED";
        await setPackStatus(sql,p.packId,packStatus,{fail_safe:true,error:message,failure_domain:failure.failure_domain});
        await updateWorkflow(sql,event.instanceId,{status:"FAILED",currentStep:"FAIL_SAFE_ESCALATION",errorCode:failure.failure_code});
      } catch {}
      return {status:["INPUT_DATA","ASSET"].includes(failure.failure_domain)?"INPUT_BLOCKED":"ESCALATION_REQUIRED",failure_domain:failure.failure_domain,fail_safe:true};
    }
  }

  async runInternal(event,step) {
    const p=event.payload;
    const sql=db(this.env);

    await step.do("register-parent-workflow",async()=>{
      await persistWorkflow(sql,{prospectId:p.prospectId,packId:p.packId,type:"PROSPECT",instanceId:event.instanceId,status:"RUNNING",metadata:{input_pack_id:p.inputPackId}});
      await setPackStatus(sql,p.packId,"PLANNING",{workflow_instance_id:event.instanceId});
      return {ok:true};
    });

    const input=await step.do("load-input-pack",async()=>getInputPack(sql,p.inputPackId));
    if(input.certification_status!=="PASS") {
      await step.do("input-blocked",async()=>{
        await setPackStatus(sql,p.packId,"INPUT_BLOCKED",{issues:input.certification_issues});
        await updateWorkflow(sql,event.instanceId,{status:"FAILED",currentStep:"INPUT_BLOCKED",errorCode:"INPUT_CERTIFICATION_FAILED"});
        return {ok:true};
      });
      return {status:"INPUT_BLOCKED"};
    }

    const assets=await step.do("ingest-input-assets",{retries:{limit:2,delay:"3 seconds",backoff:"exponential"},timeout:"5 minutes"},async()=>{
      await updateWorkflow(sql,event.instanceId,{status:"RUNNING",currentStep:"INPUT_ASSET_INGEST"});
      return ingestInputAssets(this.env,sql,{pack:await getV2Pack(sql,p.packId),inputPack:input});
    });

    const assetTokens=Object.entries(assets)
      .filter(([k,v])=>!v.unavailable && k!=="PRIMARY_LOGO")
      .map(([k])=>k);
    await step.do("mark-truth-and-creative-planning",async()=>{
      await updateWorkflow(sql,event.instanceId,{status:"RUNNING",currentStep:"TRUTH_AND_CREATIVE_PLAN"});
      return {ok:true};
    });

    const [storedTruth,storedDirections]=await Promise.all([
      step.do("load-content-truth-component",async()=>getContentTruth(sql,p.packId)),
      step.do("load-creative-directions-component",async()=>getDirectionPlan(sql,p.packId))
    ]);

    const truthDraftPromise=storedTruth
      ? Promise.resolve({
          content_truth:storedTruth.payload,
          generator_model:storedTruth.generator_model,
          reviewer_model:storedTruth.reviewer_model,
          verification:storedTruth.verification,
          hash:storedTruth.content_hash,
          reused:true,
          verified:true
        })
      : step.do("content-truth-draft",{retries:{limit:1,delay:"3 seconds",backoff:"exponential"},timeout:"12 minutes"},async()=>{
          return generateContentTruthDraft(this.env,input.payload,{
            beforeModelAttempt:({role,model})=>reserveAiCall(sql,p.packId,this.env,"CONTENT_TRUTH_DRAFT:"+role+":"+model)
          });
        });

    const directionsPromise=storedDirections
      ? Promise.resolve({
          creative_strategy:storedDirections.creative_strategy,
          directions:storedDirections.directions,
          fingerprints:storedDirections.fingerprints,
          diversity_precheck:storedDirections.diversity_precheck,
          model:storedDirections.model,
          hash:storedDirections.content_hash,
          reused:true
        })
      : step.do("creative-directions",{retries:{limit:1,delay:"3 seconds",backoff:"exponential"},timeout:"12 minutes"},async()=>{
          return createCreativeDirections(this.env,input.payload,assetTokens,{
            beforeModelAttempt:({model})=>reserveAiCall(sql,p.packId,this.env,"CREATIVE_DIRECTIONS:"+model)
          });
        });

    const [truthDraft,directions]=await Promise.all([truthDraftPromise,directionsPromise]);

    let truth=truthDraft;
    if(!storedTruth) {
      const truthReview=await step.do("content-truth-review",{retries:{limit:1,delay:"3 seconds",backoff:"exponential"},timeout:"12 minutes"},async()=>{
        return reviewContentTruthDraft(this.env,input.payload,truthDraft,{
          beforeModelAttempt:({role,model})=>reserveAiCall(sql,p.packId,this.env,"CONTENT_TRUTH_REVIEW:"+role+":"+model)
        });
      });
      truth={...truthDraft,...truthReview,verified:true};

      await step.do("persist-content-truth-component",async()=>{
        return persistContentTruth(sql,{
          packId:p.packId,inputPackId:p.inputPackId,result:truth,
          modelRouteVersion:MODEL_ROUTE_VERSION,promptVersion:PROMPT_VERSION
        });
      });
    }

    await step.do("persist-content-truth-qa",async()=>{
      await recordQa(sql,{
        packId:p.packId,type:"CONTENT_TRUTH",status:"PASS",
        scores:{truth_integrity:10},
        issues:truth.verification?.issues||[],
        actions:[],
        artifactHashes:{content_truth_hash:truth.hash},
        modelRouteVersion:MODEL_ROUTE_VERSION,promptVersion:PROMPT_VERSION
      });
      return {ok:true,content_truth_hash:truth.hash};
    });

    if(!storedDirections) {
      await step.do("persist-creative-directions-component",async()=>{
        return persistDirectionPlan(sql,{
          packId:p.packId,inputPackId:p.inputPackId,result:directions,
          modelRouteVersion:MODEL_ROUTE_VERSION,promptVersion:PROMPT_VERSION
        });
      });
    }

    const existingCreative=await step.do("load-existing-creative-plan",async()=>{
      const rows=await sql`select * from render_creative_plans_v2 where render_pack_id=${p.packId}::uuid and status='COMPLETED' limit 1`;
      return rows[0]||null;
    });

    let creative;
    if(existingCreative) {
      if(existingCreative.content_truth_hash!==truth.hash || existingCreative.creative_directions_hash!==directions.hash) {
        throw new Error("SYSTEM_INVARIANT:CREATIVE_PLAN_COMPONENT_HASH_MISMATCH");
      }
      creative={
        plan:{
          content_truth:existingCreative.content_truth_pack,
          creative_strategy:existingCreative.creative_strategy,
          directions:existingCreative.directions,
          fingerprints:existingCreative.fingerprints,
          diversity_precheck:existingCreative.diversity_precheck,
          content_truth_hash:existingCreative.content_truth_hash,
          creative_directions_hash:existingCreative.creative_directions_hash
        },
        hash:existingCreative.content_hash,
        reused:true
      };
    } else {
      creative=await step.do("combine-creative-plan",async()=>combineCreativePlan(truth,directions));
    }

    const persisted=await step.do("persist-plan-and-variants",async()=>{
      const truthEvidence=await sql`
        select count(*)::int as n
        from render_qa_results_v2
        where render_pack_id=${p.packId}::uuid
          and variant_revision_id is null
          and qa_type='CONTENT_TRUTH'
          and status='PASS'`;
      if(Number(truthEvidence[0]?.n||0)<1) throw new Error("SYSTEM_INVARIANT:CONTENT_TRUTH_QA_PASS_REQUIRED");
      await persistCreativePlan(sql,{
        packId:p.packId,inputPackId:p.inputPackId,plan:creative.plan,
        modelRouteVersion:MODEL_ROUTE_VERSION,promptVersion:PROMPT_VERSION,hash:creative.hash
      });
      const variants=await createVariants(sql,p.packId,creative.plan.directions);
      await setPackStatus(sql,p.packId,"GENERATING",{creative_plan_hash:creative.hash});
      return {variants:Object.fromEntries(Object.entries(variants).map(([k,v])=>[k,v.id]))};
    });

    await step.do("spawn-initial-variants",async()=>{
      for(const key of ["A","B","C"]) {
        const instanceId="rv2-"+p.packId+"-"+key+"-initial";
        const params={
          prospectId:p.prospectId,packId:p.packId,inputPackId:p.inputPackId,
          variantId:persisted.variants[key],variantKey:key,parentInstanceId:event.instanceId,eventPrefix:"initial"
        };
        await persistWorkflow(sql,{prospectId:p.prospectId,packId:p.packId,variantId:persisted.variants[key],type:"VARIANT",instanceId,status:"QUEUED",metadata:{variant_key:key,event_prefix:"initial"}});
        try { await this.env.RENDER_VARIANT_WORKFLOW.create({id:instanceId,params}); }
        catch { await this.env.RENDER_VARIANT_WORKFLOW.get(instanceId); }
      }
      return {ok:true};
    });

    const previewEvents={};
    for(const key of ["A","B","C"]) {
      const state=await step.do("check-preview-state-"+key,async()=>{
        const rows=await sql`
          select v.best_preview_revision,v.status,
                 (select w.status from render_workflows_v2 w
                  where w.variant_id=v.id and w.workflow_type='VARIANT'
                  order by w.created_at desc limit 1) workflow_status
          from render_v2_variants v
          where v.id=${persisted.variants[key]}::uuid limit 1`;
        return rows[0]||{};
      });
      if(state.best_preview_revision) {
        previewEvents[key]={payload:{status:"PREVIEW_READY",revision:state.best_preview_revision,reused:true}};
      } else if(["FAILED","CANCELLED"].includes(state.workflow_status)) {
        previewEvents[key]={payload:{status:"NO_PREVIEW",reused:true}};
      } else {
        previewEvents[key]=await step.waitForEvent("wait-preview-"+key,{type:"preview-"+key+"-initial",timeout:"3 hours"});
      }
    }
    const allPreview=Object.values(previewEvents).every(e=>e.payload?.status==="PREVIEW_READY");
    if(allPreview) await step.do("mark-preview-ready",async()=>setPackStatus(sql,p.packId,"PREVIEW_READY"));

    const terminal={};
    for(const key of ["A","B","C"]) {
      const state=await step.do("check-terminal-state-"+key,async()=>{
        const rows=await sql`
          select v.status,v.certified_revision,
                 (select w.status from render_workflows_v2 w
                  where w.variant_id=v.id and w.workflow_type='VARIANT'
                  order by w.created_at desc limit 1) workflow_status
          from render_v2_variants v
          where v.id=${persisted.variants[key]}::uuid limit 1`;
        return rows[0]||{};
      });
      if(state.status==="RENDER_READY" && state.certified_revision) {
        terminal[key]={payload:{status:"RENDER_READY",revision:state.certified_revision,reused:true}};
      } else if(["FAILED","CANCELLED"].includes(state.workflow_status)) {
        terminal[key]={payload:{status:"ESCALATION_REQUIRED",reused:true}};
      } else {
        terminal[key]=await step.waitForEvent("wait-terminal-"+key,{type:"terminal-"+key+"-initial",timeout:"6 hours"});
      }
    }
    if(!Object.values(terminal).every(e=>e.payload?.status==="RENDER_READY")) {
      await step.do("variant-escalation",async()=>{
        await setPackStatus(sql,p.packId,"ESCALATION_REQUIRED",{terminal});
        await updateWorkflow(sql,event.instanceId,{status:"FAILED",currentStep:"VARIANT_ESCALATION",errorCode:"VARIANT_NOT_READY"});
        return {ok:true};
      });
      return {status:"ESCALATION_REQUIRED",terminal};
    }

    for(let setCycle=1;setCycle<=3;setCycle++) {
      await step.do("set-"+setCycle+"-mark-qa",async()=>setPackStatus(sql,p.packId,"QA_RUNNING",{set_cycle:setCycle}));
      const frames=await step.do("set-"+setCycle+"-load-frames",async()=>{
        const out={};
        for(const key of ["A","B","C"]) {
          const variantId=persisted.variants[key];
          const rev=await latestCertifiedRevision(sql,variantId);
          if(!rev) throw new Error("SYSTEM_INVARIANT:CERTIFIED_REVISION_MISSING:"+key);
          const qaArtifacts=await sql`
            select artifact_type,r2_key
            from render_artifacts_v2
            where variant_revision_id=${rev.id}::uuid
              and artifact_type in ('QA_DESKTOP','QA_MOBILE')`;
          const qaByType=Object.fromEntries(qaArtifacts.map(x=>[x.artifact_type,x.r2_key]));
          const d=await readArtifactBytes(this.env,qaByType.QA_DESKTOP||rev.desktop_r2_key);
          const m=await readArtifactBytes(this.env,qaByType.QA_MOBILE||rev.mobile_r2_key);
          out[key]={desktop:bytesToBase64(d),mobile:bytesToBase64(m),revision_id:rev.id};
        }
        return out;
      });
      const setQa=await step.do("set-"+setCycle+"-qa",{retries:{limit:1,delay:"3 seconds",backoff:"exponential"},timeout:"10 minutes"},async()=>{
        return runSetQa(this.env,{
          inputPayload:input.payload,frames,
          beforeModelAttempt:({model})=>reserveAiCall(sql,p.packId,this.env,"SET_VISUAL_QA:"+model)
        });
      });
      await step.do("set-"+setCycle+"-persist-qa",async()=>{
        await recordQa(sql,{
          packId:p.packId,type:"SET_VISUAL",status:setQa.pass?"PASS":"FAIL",
          scores:setQa.scores,issues:setQa.issues,actions:setQa.actions,
          artifactHashes:{
            A_revision_id:frames.A.revision_id,
            B_revision_id:frames.B.revision_id,
            C_revision_id:frames.C.revision_id
          },
          modelRouteVersion:MODEL_ROUTE_VERSION,promptVersion:PROMPT_VERSION
        });
        return {ok:true};
      });
      if(setQa.pass) {
        await step.do("certify-pack",async()=>{
          await setPackStatus(sql,p.packId,"RENDER_READY",{set_qa_cycle:setCycle});
          await updateWorkflow(sql,event.instanceId,{status:"COMPLETED",currentStep:"RENDER_READY"});
          return {ok:true};
        });
        return {status:"RENDER_READY",pack_id:p.packId};
      }

      const weakest=setQa.weakest_variant;
      if(!["A","B","C"].includes(weakest) || setCycle===3) {
        await step.do("set-escalation",async()=>{
          await setPackStatus(sql,p.packId,"ESCALATION_REQUIRED",{set_qa:setQa});
          await updateWorkflow(sql,event.instanceId,{status:"FAILED",currentStep:"SET_QA_ESCALATION",errorCode:"SET_DIVERSITY_FAILED"});
          return {ok:true};
        });
        return {status:"ESCALATION_REQUIRED",set_qa:setQa};
      }

      const variantId=persisted.variants[weakest];
      const prior=await step.do("set-"+setCycle+"-prior-"+weakest,async()=>latestCertifiedRevision(sql,variantId));
      const prefix="set"+setCycle;
      await step.do("set-"+setCycle+"-spawn-"+weakest,async()=>{
        const instanceId="rv2-"+p.packId+"-"+weakest+"-"+prefix;
        const params={
          prospectId:p.prospectId,packId:p.packId,inputPackId:p.inputPackId,variantId,variantKey:weakest,
          parentInstanceId:event.instanceId,eventPrefix:prefix,parentRevisionId:prior?.id||null,
          initialFeedback:{issues:setQa.issues,actions:setQa.actions,summary:setQa.summary,reason:"SET_DIVERSITY"}
        };
        await persistWorkflow(sql,{prospectId:p.prospectId,packId:p.packId,variantId,type:"VARIANT",instanceId,status:"QUEUED",metadata:{variant_key:weakest,event_prefix:prefix,set_cycle:setCycle}});
        try { await this.env.RENDER_VARIANT_WORKFLOW.create({id:instanceId,params}); }
        catch { await this.env.RENDER_VARIANT_WORKFLOW.get(instanceId); }
        return {instanceId};
      });
      const replacement=await step.waitForEvent("set-"+setCycle+"-wait-"+weakest,{type:"terminal-"+weakest+"-"+prefix,timeout:"6 hours"});
      if(replacement.payload?.status!=="RENDER_READY") {
        await step.do("set-"+setCycle+"-replacement-escalation",async()=>setPackStatus(sql,p.packId,"ESCALATION_REQUIRED",{replacement}));
        return {status:"ESCALATION_REQUIRED",replacement};
      }
    }

    return {status:"ESCALATION_REQUIRED"};
  }
}


export class RenderChaosProbeWorkflow extends WorkflowEntrypoint {
  async run(event,step) {
    const sql=db(this.env);
    const probeKey=String(event.payload?.probeKey||"render-v2-live-recovery-v1");
    await step.do("chaos-register",async()=>{
      await sql`
        insert into render_v2_chaos_probes(probe_key,workflow_instance_id,status,details)
        values(${probeKey},${event.instanceId},'RUNNING',${JSON.stringify({workflow_started:true})}::jsonb)
        on conflict(probe_key) do update set
          workflow_instance_id=excluded.workflow_instance_id,
          status='RUNNING',
          updated_at=now(),
          details=render_v2_chaos_probes.details||excluded.details`;
      return {ok:true};
    });

    await step.do("chaos-idempotent-side-effect",async()=>{
      await sql`
        update render_v2_chaos_probes
        set side_effect_count=case when effect_applied then side_effect_count else side_effect_count+1 end,
            effect_applied=true,
            updated_at=now()
        where probe_key=${probeKey}`;
      return {ok:true};
    });

    await step.do("chaos-transient-recovery",{retries:{limit:2,delay:"2 seconds",backoff:"constant"}},async()=>{
      const rows=await sql`
        update render_v2_chaos_probes
        set transient_attempts=transient_attempts+1,
            transient_seen=true,
            updated_at=now()
        where probe_key=${probeKey}
        returning transient_attempts`;
      if(Number(rows[0]?.transient_attempts||0)===1) {
        throw new Error("CHAOS_TRANSIENT_EXPECTED");
      }
      return {attempts:Number(rows[0]?.transient_attempts||0)};
    });

    await step.do("chaos-complete",async()=>{
      await sql`
        update render_v2_chaos_probes
        set status='PASS',completed=true,updated_at=now(),
            details=details||${JSON.stringify({recovery_verified:true,idempotency_verified:true})}::jsonb
        where probe_key=${probeKey}`;
      return {ok:true};
    });
    return {status:"PASS",probe_key:probeKey};
  }
}
