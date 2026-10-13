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
        ${key},
        coalesce((metrics->>${key})::int,0)+1
      ),
      updated_at=now()
    where id=${packId}::uuid
      and coalesce((metrics->>${key})::int,0) < ${limit}
    returning metrics`;
  if(!rows.length) throw new Error("HARD_BUDGET_EXCEEDED:"+key.toUpperCase());
  return Number(rows[0].metrics?.[key]||0);
}

export async function reserveAiCall(sql,packId,env,route,revisionId=null) {
  const limit=envLimit(env,"V2_MAX_AI_CALLS_PER_PACK",40);
  const used=await reserveCounter(sql,packId,"ai_calls",limit);
  await recordMetric(sql,{packId,revisionId,name:"ai_call_reserved",value:1,dimensions:{route,used,limit}});
  return {used,limit};
}

export async function reserveBrowserCapture(sql,packId,env,variantKey,revisionId=null) {
  const limit=envLimit(env,"V2_MAX_BROWSER_CAPTURES_PER_PACK",18);
  const used=await reserveCounter(sql,packId,"browser_captures",limit);
  await recordMetric(sql,{packId,revisionId,name:"browser_capture_reserved",value:1,dimensions:{variant_key:variantKey,used,limit}});
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
    ai_limit:envLimit(env,"V2_MAX_AI_CALLS_PER_PACK",40),
    browser_captures:Number(metrics.browser_captures||0),
    browser_limit:envLimit(env,"V2_MAX_BROWSER_CAPTURES_PER_PACK",18)
  };
}
