import { WorkflowEntrypoint } from "cloudflare:workers";
import { db, getInputPack, getV2Pack, setPackStatus, persistWorkflow, updateWorkflow, persistCreativePlan, createVariants, allocateRevision, updateRevision, setVariantStatus, recordQa, recordFailure, countFailureFingerprint } from "./db.js";
import { EXECUTION_ENGINE_VERSION, MODEL_ROUTE_VERSION, PROMPT_VERSION, MAX_VISUAL_REVISIONS } from "./constants.js";
import { createCreativePlan, buildCopyManifest, generateRenderSpec, runVisualQa, runSetQa } from "./ai.js";
import { ingestInputAssets, putArtifact, materializeAssetDataUrls, readArtifactBytes } from "./artifacts.js";
import { compileRenderSpec, buildCaptureHtml } from "./compiler.js";
import { captureVariant } from "./browser.js";
import { classifyFailure, failureFingerprint, shouldChangeStrategy } from "./failure-policy.js";
import { bytesToBase64 } from "./utils.js";

function parseContacts(input) {
  const text=String(input?.verified_contacts||"");
  const email=(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)||[])[0]||"";
  const phoneRaw=(text.match(/(?:\+?\d[\d\s().-]{6,}\d)/)||[])[0]||"";
  const phone=phoneRaw ? "+"+phoneRaw.replace(/\D/g,"").replace(/^00/,"") : "";
  const primary=phone ? "tel:"+phone : email ? "mailto:"+email : "#";
  const secondary=email ? "mailto:"+email : primary;
  return {PRIMARY:primary,SECONDARY:secondary};
}

async function inputAssetsFromDb(sql,packId,inputPayload) {
  const rows=await sql`
    select artifact_type,r2_key,sha256,mime,bytes
    from render_artifacts_v2
    where render_pack_id=\${packId}::uuid and artifact_type like 'INPUT_ASSET_%'`;
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
  const parent=await parentInstance(env,parentId);
  await parent.sendEvent({type,payload});
}

async function latestCertifiedRevision(sql,variantId) {
  const rows=await sql`
    select r.*
    from render_v2_variants v
    join render_variant_revisions r on r.variant_id=v.id and r.revision=v.certified_revision
    where v.id=\${variantId}::uuid
    limit 1`;
  return rows[0]||null;
}

async function recordTypedFailure(sql,{packId,workflowInstanceId,revisionId=null,stepName,error,variantKey=null,revision=null,strategyVersion}) {
  const wf=await sql`select id from render_workflows_v2 where workflow_instance_id=\${workflowInstanceId} limit 1`;
  const failure=classifyFailure(error,{step:stepName,variant_key:variantKey,revision});
  const fingerprint=await failureFingerprint(failure);
  const current=await countFailureFingerprint(sql,packId,fingerprint);
  const rec=await recordFailure(sql,{
    packId,workflowId:wf[0]?.id||null,revisionId,step:stepName,failure,fingerprint,
    strategyVersion,attempt:current+1,details:{variant_key:variantKey,revision}
  });
  return {failure,fingerprint,count:current+1,record:rec,change_strategy:shouldChangeStrategy(current+1)};
}

export class RenderVariantWorkflow extends WorkflowEntrypoint {
  async run(event,step) {
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
      const planRows=await sql`select * from render_creative_plans_v2 where render_pack_id=\${params.packId}::uuid limit 1`;
      if(!planRows.length) throw new Error("SYSTEM_INVARIANT:CREATIVE_PLAN_NOT_FOUND");
      const plan=planRows[0];
      const inputPayload=input.payload;
      const assets=await inputAssetsFromDb(sql,params.packId,inputPayload);
      const copyManifest=buildCopyManifest(plan.content_truth_pack);
      const ctaManifest=parseContacts(inputPayload);
      return {inputPayload,assets,copyManifest,ctaManifest,direction:plan.directions?.[params.variantKey]};
    });

    let feedback=params.initialFeedback||null;
    let previousSpec=null;
    if(params.parentRevisionId) {
      const prior=await step.do("load-parent-revision",async()=>{
        const rows=await sql`select * from render_variant_revisions where id=\${params.parentRevisionId}::uuid limit 1`;
        return rows[0]||null;
      });
      previousSpec=prior?.render_spec||null;
    }

    let previewEmitted=false;
    for(let cycle=1;cycle<=MAX_VISUAL_REVISIONS;cycle++) {
      const revision=await step.do("r"+cycle+"-allocate",async()=>{
        const r=await allocateRevision(sql,params.variantId,cycle===1?params.parentRevisionId:null);
        await updateWorkflow(sql,event.instanceId,{status:"RUNNING",currentStep:"GENERATE",attempt:cycle,metadata:{revision:r.revision}});
        return r;
      });

      let generated;
      try {
        generated=await step.do("r"+cycle+"-generate",{retries:{limit:1,delay:"3 seconds",backoff:"exponential"},timeout:"12 minutes"},async()=>{
          return generateRenderSpec(this.env,{
            inputPayload:context.inputPayload,direction:context.direction,variantKey:params.variantKey,
            copyManifest:context.copyManifest,
            assetTokens:Object.keys(context.assets).filter(k=>k!=="PRIMARY_LOGO"),
            qaFeedback:feedback,previousSpec
          });
        });
      } catch(error) {
        const message=String(error?.message||error);
        await step.do("r"+cycle+"-record-generation-provider-failure",async()=>
          recordTypedFailure(sql,{packId:params.packId,workflowInstanceId:event.instanceId,revisionId:revision.id,stepName:"VARIANT_GENERATION_PROVIDER",error:message,variantKey:params.variantKey,revision:revision.revision,strategyVersion:MODEL_ROUTE_VERSION})
        );
        await step.do("r"+cycle+"-generation-provider-escalation",async()=>{
          await updateRevision(sql,revision.id,{status:"QA_FAILED"});
          if(!previewEmitted) await emitParent(this.env,params.parentInstanceId,previewType,{variant_key:params.variantKey,status:"NO_PREVIEW"});
          await updateWorkflow(sql,event.instanceId,{status:"FAILED",currentStep:"AI_PROVIDER_ESCALATION",errorCode:"VARIANT_GENERATION_PROVIDER_FAILED"});
          await emitParent(this.env,params.parentInstanceId,terminalType,{variant_key:params.variantKey,status:"ESCALATION_REQUIRED",failure_domain:"AI_PROVIDER"});
          return {ok:true};
        });
        return {status:"ESCALATION_REQUIRED",variant:params.variantKey,failure_domain:"AI_PROVIDER"};
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
        feedback={issues:compiled.issues,actions:["Repair only the structural RenderSpec contract while preserving the art direction."]};
        if(fail.change_strategy) break;
        continue;
      }

      const htmlKey="render-v2/"+context.inputPayload.prospect_code+"/"+params.packId+"/"+params.variantKey+"/r"+revision.revision+"/source.html";
      const htmlArtifact=await step.do("r"+cycle+"-persist-source",{retries:{limit:2,delay:"2 seconds",backoff:"exponential"}},async()=>{
        return putArtifact(this.env,sql,{packId:params.packId,revisionId:revision.id,type:"SOURCE_HTML",key:htmlKey,body:compiled.html,mime:"text/html; charset=utf-8",producerStep:"COMPILE"});
      });
      await updateRevision(sql,revision.id,{status:"CAPTURING",renderSpec:generated.spec,sourceHash:compiled.source_hash,htmlKey:htmlKey});

      let captured;
      try {
        captured=await step.do("r"+cycle+"-capture",{retries:{limit:1,delay:"3 seconds",backoff:"constant"},timeout:"5 minutes"},async()=>{
          const dataUrls=await materializeAssetDataUrls(this.env,context.assets);
          const captureHtml=buildCaptureHtml(compiled.html,dataUrls);
          const result=await captureVariant(this.env,captureHtml,context.inputPayload);
          const base="render-v2/"+context.inputPayload.prospect_code+"/"+params.packId+"/"+params.variantKey+"/r"+revision.revision+"/";
          const desktop=await putArtifact(this.env,sql,{packId:params.packId,revisionId:revision.id,type:"DESKTOP_1440",key:base+"desktop-1440.jpg",body:result.desktop.bytes,mime:"image/jpeg",producerStep:"BROWSER_CAPTURE"});
          const mobile=await putArtifact(this.env,sql,{packId:params.packId,revisionId:revision.id,type:"MOBILE_390",key:base+"mobile-390.jpg",body:result.mobile.bytes,mime:"image/jpeg",producerStep:"BROWSER_CAPTURE"});
          return {ok:true,desktop,mobile,gate:result.gate,diagnostics:{desktop:result.desktop.diagnostics,mobile:result.mobile.diagnostics}};
        });
      } catch(error) {
        captured={ok:false,error:String(error?.message||error)};
      }

      if(!captured.ok) {
        await step.do("r"+cycle+"-record-browser-failure",async()=>
          recordTypedFailure(sql,{packId:params.packId,workflowInstanceId:event.instanceId,revisionId:revision.id,stepName:"BROWSER_CAPTURE",error:captured.error,variantKey:params.variantKey,revision:revision.revision,strategyVersion:"BROWSER_V2"})
        );
        await step.do("r"+cycle+"-browser-escalation",async()=>{
          await updateRevision(sql,revision.id,{status:"QA_FAILED"});
          if(!previewEmitted) await emitParent(this.env,params.parentInstanceId,previewType,{variant_key:params.variantKey,status:"NO_PREVIEW"});
          await updateWorkflow(sql,event.instanceId,{status:"FAILED",currentStep:"BROWSER_ESCALATION",errorCode:"BROWSER_CAPTURE_FAILED"});
          await emitParent(this.env,params.parentInstanceId,terminalType,{variant_key:params.variantKey,status:"ESCALATION_REQUIRED",failure_domain:"BROWSER"});
          return {ok:true};
        });
        return {status:"ESCALATION_REQUIRED",variant:params.variantKey,failure_domain:"BROWSER"};
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
        await setVariantStatus(sql,params.variantId,{status:"PREVIEW_READY",bestPreview:revision.revision});
        if(!previewEmitted) {
          await emitParent(this.env,params.parentInstanceId,previewType,{variant_key:params.variantKey,status:"PREVIEW_READY",revision:revision.revision,revision_id:revision.id});
        }
        return {ok:true};
      });
      previewEmitted=true;

      let qa;
      try {
        qa=await step.do("r"+cycle+"-visual-qa",{retries:{limit:1,delay:"3 seconds",backoff:"exponential"},timeout:"8 minutes"},async()=>{
          const desktopBytes=await readArtifactBytes(this.env,captured.desktop.r2_key);
          const mobileBytes=await readArtifactBytes(this.env,captured.mobile.r2_key);
          return runVisualQa(this.env,{
            inputPayload:context.inputPayload,direction:context.direction,variantKey:params.variantKey,
            desktopB64:bytesToBase64(desktopBytes),mobileB64:bytesToBase64(mobileBytes)
          });
        });
      } catch(error) {
        const message=String(error?.message||error);
        await step.do("r"+cycle+"-record-qa-provider-failure",async()=>
          recordTypedFailure(sql,{packId:params.packId,workflowInstanceId:event.instanceId,revisionId:revision.id,stepName:"VISUAL_QA_PROVIDER",error:message,variantKey:params.variantKey,revision:revision.revision,strategyVersion:MODEL_ROUTE_VERSION})
        );
        await step.do("r"+cycle+"-qa-provider-escalation",async()=>{
          await updateWorkflow(sql,event.instanceId,{status:"FAILED",currentStep:"QA_PROVIDER_ESCALATION",errorCode:"VISUAL_QA_PROVIDER_FAILED"});
          await emitParent(this.env,params.parentInstanceId,terminalType,{variant_key:params.variantKey,status:"ESCALATION_REQUIRED",failure_domain:"AI_OUTPUT_SCHEMA"});
          return {ok:true};
        });
        return {status:"ESCALATION_REQUIRED",variant:params.variantKey,failure_domain:"AI_OUTPUT_SCHEMA",preview_preserved:true};
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
          await setVariantStatus(sql,params.variantId,{status:"RENDER_READY",bestQa:revision.revision,certified:revision.revision});
          await updateWorkflow(sql,event.instanceId,{status:"COMPLETED",currentStep:"RENDER_READY",attempt:cycle});
          await emitParent(this.env,params.parentInstanceId,terminalType,{variant_key:params.variantKey,status:"RENDER_READY",revision:revision.revision,revision_id:revision.id});
          return {ok:true};
        });
        return {status:"RENDER_READY",variant:params.variantKey,revision:revision.revision};
      }

      await updateRevision(sql,revision.id,{status:"QA_FAILED",score:qa.min_score});
      await setVariantStatus(sql,params.variantId,{status:"REWORKING",bestPreview:revision.revision});
      await step.do("r"+cycle+"-record-visual-failure",async()=>
        recordTypedFailure(sql,{packId:params.packId,workflowInstanceId:event.instanceId,revisionId:revision.id,stepName:"VISUAL_QUALITY",error:"VISUAL_QUALITY_BELOW_BAR:"+qa.summary,variantKey:params.variantKey,revision:revision.revision,strategyVersion:PROMPT_VERSION})
      );
      feedback={issues:qa.issues,actions:qa.actions,summary:qa.summary,scores:qa.scores};
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

    const assetTokens=Object.entries(assets).filter(([,v])=>!v.unavailable).map(([k])=>k);
    const creative=await step.do("creative-plan",{retries:{limit:1,delay:"3 seconds",backoff:"exponential"},timeout:"12 minutes"},async()=>{
      await updateWorkflow(sql,event.instanceId,{status:"RUNNING",currentStep:"CREATIVE_PLAN"});
      return createCreativePlan(this.env,input.payload,assetTokens);
    });

    const persisted=await step.do("persist-plan-and-variants",async()=>{
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
        try { await this.env.RENDER_VARIANT_WORKFLOW.create({id:instanceId,params}); }
        catch { await this.env.RENDER_VARIANT_WORKFLOW.get(instanceId); }
        await persistWorkflow(sql,{prospectId:p.prospectId,packId:p.packId,variantId:persisted.variants[key],type:"VARIANT",instanceId,status:"QUEUED",metadata:{variant_key:key,event_prefix:"initial"}});
      }
      return {ok:true};
    });

    const previewEvents={};
    for(const key of ["A","B","C"]) {
      previewEvents[key]=await step.waitForEvent("wait-preview-"+key,{type:"preview-"+key+"-initial",timeout:"30 minutes"});
    }
    const allPreview=Object.values(previewEvents).every(e=>e.payload?.status==="PREVIEW_READY");
    if(allPreview) await step.do("mark-preview-ready",async()=>setPackStatus(sql,p.packId,"PREVIEW_READY"));

    const terminal={};
    for(const key of ["A","B","C"]) {
      terminal[key]=await step.waitForEvent("wait-terminal-"+key,{type:"terminal-"+key+"-initial",timeout:"90 minutes"});
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
          const d=await readArtifactBytes(this.env,rev.desktop_r2_key);
          const m=await readArtifactBytes(this.env,rev.mobile_r2_key);
          out[key]={desktop:bytesToBase64(d),mobile:bytesToBase64(m),revision_id:rev.id};
        }
        return out;
      });
      const setQa=await step.do("set-"+setCycle+"-qa",{retries:{limit:1,delay:"3 seconds",backoff:"exponential"},timeout:"10 minutes"},async()=>{
        return runSetQa(this.env,{inputPayload:input.payload,frames});
      });
      await step.do("set-"+setCycle+"-persist-qa",async()=>{
        await recordQa(sql,{packId:p.packId,type:"SET_VISUAL",status:setQa.pass?"PASS":"FAIL",scores:setQa.scores,issues:setQa.issues,actions:setQa.actions,modelRouteVersion:MODEL_ROUTE_VERSION,promptVersion:PROMPT_VERSION});
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
        try { await this.env.RENDER_VARIANT_WORKFLOW.create({id:instanceId,params}); }
        catch { await this.env.RENDER_VARIANT_WORKFLOW.get(instanceId); }
        await persistWorkflow(sql,{prospectId:p.prospectId,packId:p.packId,variantId,type:"VARIANT",instanceId,status:"QUEUED",metadata:{variant_key:weakest,event_prefix:prefix,set_cycle:setCycle}});
        return {instanceId};
      });
      const replacement=await step.waitForEvent("set-"+setCycle+"-wait-"+weakest,{type:"terminal-"+weakest+"-"+prefix,timeout:"90 minutes"});
      if(replacement.payload?.status!=="RENDER_READY") {
        await step.do("set-"+setCycle+"-replacement-escalation",async()=>setPackStatus(sql,p.packId,"ESCALATION_REQUIRED",{replacement}));
        return {status:"ESCALATION_REQUIRED",replacement};
      }
    }

    return {status:"ESCALATION_REQUIRED"};
  }
}
