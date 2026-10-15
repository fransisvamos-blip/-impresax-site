export function isGenerationCircuitOpen(row={}) {
  const retry=Number(row.retry_count||0);
  const max=Math.max(1,Number(row.max_retries||3));
  const error=String(row.error||"").trim();
  const step=String(row.current_step||"").trim();
  return retry>=max || error==="GENERATION_CIRCUIT_BREAKER" || step==="GENERATION_HOLD";
}

export async function prospectCircuitState(sql,prospectId) {
  const rows=await sql`
    select id,retry_count,max_retries,error,current_step,render_status,pipeline_status,next_action
    from prospects
    where id=${prospectId}::uuid
    limit 1`;
  const row=rows[0]||{};
  return {...row,open:isGenerationCircuitOpen(row)};
}

export async function packCircuitOverridePending(sql,packId) {
  const rows=await sql`
    select coalesce((metadata->>'generation_circuit_breaker_override_pending')::boolean,false) pending
    from render_v2_packs where id=${packId}::uuid limit 1`;
  return rows[0]?.pending===true;
}

export async function consumePackCircuitOverride(sql,packId,reason="MANUAL_CIRCUIT_BREAKER_OVERRIDE") {
  const rows=await sql`
    update render_v2_packs
    set metadata=(coalesce(metadata,'{}'::jsonb)-'generation_circuit_breaker_override_pending')
      || jsonb_build_object(
        'generation_circuit_breaker_override_pending',false,
        'generation_circuit_breaker_override_consumed_at',to_jsonb(now()),
        'generation_circuit_breaker_override_reason',${reason}::text
      ),
      updated_at=now()
    where id=${packId}::uuid
      and coalesce((metadata->>'generation_circuit_breaker_override_pending')::boolean,false)=true
    returning id`;
  return rows.length>0;
}
