import { EXTERNAL_AI_CALLS_ALLOWED, RENDER_GENERATION_MODE } from "./constants.js";
function envLimit(env,key,fallback) {
  const n=Number(env?.[key]);
  return Number.isFinite(n) && n>0 ? Math.floor(n) : fallback;
}

export async function recordMetric(sql,{packId,revisionId=null,name,value=1,unit="count",dimensions={}}) {
  await sql`
    insert into render_metrics_v2(render_pack_id,variant_revision_id,metric_name,metric_value,unit,dimensions)
    values(${packId}::uuid,${revisionId}::uuid,${name},${Number(value)},${unit},${JSON.stringify(dimensions)}::jsonb)`;
}

async function reserveCounter(sql,packId,key,limit) {
  const rows=await sql`
    update render_v2_packs
    set metrics=coalesce(metrics,'{}'::jsonb) ||
      jsonb_build_object(
        ${key}::text,
        coalesce((metrics ->> (${key}::text))::int,0)+1
      ),
      updated_at=now()
    where id=${packId}::uuid
      and coalesce((metrics ->> (${key}::text))::int,0) < ${limit}::int
    returning metrics`;
  if(!rows.length) throw new Error("HARD_BUDGET_EXCEEDED:"+key.toUpperCase());
  return Number(rows[0].metrics?.[key]||0);
}

async function aiCallLimit(sql,packId,env) {
  const rows=await sql`select metadata from render_v2_packs where id=${packId}::uuid limit 1`;
  const override=Number(rows[0]?.metadata?.ai_call_limit_override);
  if(Number.isFinite(override) && override>0) return Math.floor(override);
  return envLimit(env,"V2_MAX_AI_CALLS_PER_PACK",40);
}

export async function reserveAiCall(sql,packId,env,route,revisionId=null,{allowR118External=false}={}) {
  const r118BudgetAllowed=allowR118External===true
    && String(env?.V2_R118_EXTERNAL_AI_ENABLED||"false")==="true";
  if(!EXTERNAL_AI_CALLS_ALLOWED && !r118BudgetAllowed) {
    throw new Error("EXTERNAL_AI_DISABLED:"+RENDER_GENERATION_MODE);
  }
  const limit=await aiCallLimit(sql,packId,env);
  const used=await reserveCounter(sql,packId,"ai_calls",limit);
  await recordMetric(sql,{packId,revisionId,name:"ai_call_reserved",value:1,dimensions:{route,used,limit,r118_external:r118BudgetAllowed,pack_override:limit!==envLimit(env,"V2_MAX_AI_CALLS_PER_PACK",40)}});
  return {used,limit};
}

async function browserCaptureLimit(sql,packId,env) {
  const rows=await sql`select metadata from render_v2_packs where id=${packId}::uuid limit 1`;
  const override=Number(rows[0]?.metadata?.browser_capture_limit_override);
  if(Number.isFinite(override) && override>0) return Math.floor(override);
  return envLimit(env,"V2_MAX_BROWSER_CAPTURES_PER_PACK",18);
}

export async function reserveBrowserCapture(sql,packId,env,variantKey,revisionId=null) {
  const limit=await browserCaptureLimit(sql,packId,env);
  const used=await reserveCounter(sql,packId,"browser_captures",limit);
  await recordMetric(sql,{packId,revisionId,name:"browser_capture_reserved",value:1,dimensions:{variant_key:variantKey,used,limit,pack_override:limit!==envLimit(env,"V2_MAX_BROWSER_CAPTURES_PER_PACK",18)}});
  return {used,limit};
}

export async function recordDuration(sql,{packId,revisionId=null,name,startedAt,dimensions={}}) {
  const ms=Math.max(0,Date.now()-Number(startedAt||Date.now()));
  await recordMetric(sql,{packId,revisionId,name,value:ms,unit:"ms",dimensions});
  return ms;
}

export async function budgetSnapshot(sql,packId,env) {
  const rows=await sql`select metrics from render_v2_packs where id=${packId}::uuid limit 1`;
  const metrics=rows[0]?.metrics||{};
  return {
    ai_calls:Number(metrics.ai_calls||0),
    ai_limit:await aiCallLimit(sql,packId,env),
    browser_captures:Number(metrics.browser_captures||0),
    browser_limit:await browserCaptureLimit(sql,packId,env)
  };
}
