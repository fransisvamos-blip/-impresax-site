import { neon } from "@neondatabase/serverless";
import { buildApprovedReference, qaApprovedReference } from "./site-factory.js";

const ADMIN_HOST = "admin.impresax.org";

function jsonReplacer(_key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data, jsonReplacer), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store",
      ...extra,
    },
  });
}

function validSetQa(pack) {
  const qa=pack?.content_map?.visual_set_qa_last_run;
  const scores=qa?.scores || {};
  const required=["set_quality","diversity_ab","diversity_ac","diversity_bc","prospect_fit_a","prospect_fit_b","prospect_fit_c"];
  return qa?.pass===true &&
    Array.isArray(qa?.issues) &&
    qa.issues.length===0 &&
    required.every(k=>Number.isFinite(Number(scores[k])) && Number(scores[k])>=8);
}

function db(env) {
  if (!env.OPS_DATABASE_URL) {
    const error = new Error("OPS_DATABASE_URL_NOT_CONFIGURED");
    error.code = "OPS_DATABASE_URL_NOT_CONFIGURED";
    throw error;
  }
  return neon(env.OPS_DATABASE_URL);
}

const EMAIL_FROM_ADDRESS = "info@impresax.org";
const EMAIL_DOMAIN = "impresax.org";
const EMAIL_TEST_SUBJECT = "ImpresaX — Email System Test";
const EMAIL_TEST_BODY = "Sistema email ImpresaX operativo.";

function emailAddressValid(value) {
  const email = String(value || "").trim().toLowerCase();
  if (email.length < 3 || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitizeEmailError(error, env) {
  let message = String(error?.message || error || "EMAIL_SEND_FAILED");
  const token = String(env?.EMAIL_API_TOKEN || "");
  if (token) message = message.split(token).join("[REDACTED]");
  message = message.replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]");
  const code = String(error?.code || "EMAIL_SEND_FAILED").replace(/[^A-Z0-9_-]/gi, "").slice(0, 80);
  return (code + (message && message !== code ? ": " + message : "")).slice(0, 600);
}

async function dnsTxt(name) {
  try {
    const response = await fetch(
      "https://cloudflare-dns.com/dns-query?name=" + encodeURIComponent(name) + "&type=TXT",
      { headers: { Accept: "application/dns-json" } }
    );
    if (!response.ok) return [];
    const data = await response.json();
    return (data.Answer || [])
      .filter(row => Number(row.type) === 16)
      .map(row => String(row.data || "").replace(/^"|"$/g, "").replace(/"\s+"/g, ""));
  } catch {
    return [];
  }
}

async function emailDnsQa() {
  const [spfRows, dkimRows] = await Promise.all([
    dnsTxt("cf-bounce." + EMAIL_DOMAIN),
    dnsTxt("cf-bounce._domainkey." + EMAIL_DOMAIN),
  ]);
  const spf = spfRows.some(value =>
    /v=spf1/i.test(value) && /include:_spf\.mx\.cloudflare\.net/i.test(value)
  );
  const dkim = dkimRows.some(value => /v=DKIM1/i.test(value) && /\bp=/i.test(value));
  return { spf, dkim };
}

async function cloudflareZoneId(env) {
  if (!env.EMAIL_API_TOKEN) {
    return { zone_id:null, status:"UNAVAILABLE", reason:"EMAIL_API_TOKEN_NOT_CONFIGURED" };
  }
  try {
    const response = await fetch(
      "https://api.cloudflare.com/client/v4/zones?name=" + encodeURIComponent(EMAIL_DOMAIN) + "&status=active&per_page=1",
      { headers: { Authorization: "Bearer " + env.EMAIL_API_TOKEN } }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.success) {
      return {
        zone_id:null,
        status: response.status === 401 || response.status === 403 ? "UNAVAILABLE" : "ERROR",
        reason: response.status === 401 || response.status === 403
          ? "TOKEN_CANNOT_RESOLVE_ZONE"
          : "ZONE_LOOKUP_FAILED"
      };
    }
    const zoneId = data?.result?.[0]?.id || null;
    return zoneId
      ? { zone_id:zoneId, status:"PENDING", reason:null }
      : { zone_id:null, status:"ERROR", reason:"ZONE_NOT_FOUND" };
  } catch {
    return { zone_id:null, status:"ERROR", reason:"ZONE_LOOKUP_ERROR" };
  }
}

async function cloudflareDeliveryEvent(env, providerMessageId) {
  if (!providerMessageId) {
    return { event:null, tracking:{ status:"PENDING", reason:"NO_MESSAGE_TO_TRACK", required_permission:null } };
  }
  if (!env.EMAIL_API_TOKEN) {
    return {
      event:null,
      tracking:{
        status:"UNAVAILABLE",
        reason:"EMAIL_API_TOKEN_NOT_CONFIGURED",
        required_permission:"Zone → Analytics Read"
      }
    };
  }

  const zone = await cloudflareZoneId(env);
  if (!zone.zone_id) {
    return {
      event:null,
      tracking:{
        status:zone.status,
        reason:zone.reason,
        required_permission: zone.reason === "TOKEN_CANNOT_RESOLVE_ZONE"
          ? "Zone → Zone Read (per risolvere lo Zone ID) e Zone → Analytics Read"
          : "Zone → Analytics Read"
      }
    };
  }

  const end = new Date();
  const start = new Date(end.getTime() - 36 * 60 * 60 * 1000);
  const query = `query RecentEmailEvents($zoneTag: string!, $start: Time!, $end: Time!) {
    viewer {
      zones(filter: { zoneTag: $zoneTag }) {
        emailSendingAdaptive(
          filter: { datetime_geq: $start, datetime_leq: $end }
          limit: 100
          orderBy: [datetime_DESC]
        ) {
          datetime
          status
          messageId
          errorCause
          errorDetail
          dkim
          spf
        }
      }
    }
  }`;

  try {
    const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + env.EMAIL_API_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables: {
          zoneTag: zone.zone_id,
          start: start.toISOString(),
          end: end.toISOString(),
        },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      return { event:null, tracking:{ status:"UNAVAILABLE", reason:"ANALYTICS_PERMISSION_DENIED", required_permission:"Zone → Analytics Read" } };
    }
    if (!response.ok) {
      return { event:null, tracking:{ status:"ERROR", reason:"ANALYTICS_HTTP_" + response.status, required_permission:"Zone → Analytics Read" } };
    }
    if (data?.errors?.length) {
      const message = String(data.errors[0]?.message || "");
      const denied = /permission|access|auth|forbidden|not authorized/i.test(message);
      return {
        event:null,
        tracking:{
          status:denied ? "UNAVAILABLE" : "ERROR",
          reason:denied ? "ANALYTICS_PERMISSION_DENIED" : "ANALYTICS_QUERY_ERROR",
          required_permission:"Zone → Analytics Read"
        }
      };
    }
    const events = data?.data?.viewer?.zones?.[0]?.emailSendingAdaptive || [];
    const event = events.find(item => String(item.messageId || "") === String(providerMessageId)) || null;
    return {
      event,
      tracking:{ status:event ? "ACTIVE" : "PENDING", reason:event ? null : "EVENT_NOT_AVAILABLE_YET", required_permission:null }
    };
  } catch {
    return { event:null, tracking:{ status:"ERROR", reason:"ANALYTICS_REQUEST_ERROR", required_permission:"Zone → Analytics Read" } };
  }
}


async function refreshEmailDelivery(sql, env, logRow) {
  if (!logRow?.provider_message_id || !["SENT","DELIVERED","DELIVERY_FAILED"].includes(logRow.status)) {
    return { row:logRow || null, tracking:{ status:"PENDING", reason:"NO_MESSAGE_TO_TRACK", required_permission:null } };
  }

  const lookup = await cloudflareDeliveryEvent(env, logRow.provider_message_id);
  const event = lookup.event;
  if (!event) return { row:logRow, tracking:lookup.tracking };

  if (event.status === "delivered" && logRow.status !== "DELIVERED") {
    const rows = await sql`update email_logs
      set status='DELIVERED', error=null
      where id=${logRow.id}
      returning *`;
    return { row:rows[0] || logRow, tracking:lookup.tracking };
  }

  if (event.status === "deliveryFailed" && logRow.status !== "DELIVERY_FAILED") {
    const providerError = [event.errorCause, event.errorDetail].filter(Boolean).join(": ").slice(0, 600) || "DELIVERY_FAILED";
    const rows = await sql`update email_logs
      set status='DELIVERY_FAILED', error=${providerError}
      where id=${logRow.id}
      returning *`;
    return { row:rows[0] || logRow, tracking:lookup.tracking };
  }
  return { row:logRow, tracking:lookup.tracking };
}


export async function sendSystemEmail(env, {
  emailType = "SYSTEM",
  recipient,
  subject,
  text,
  html,
} = {}) {
  const sql = db(env);
  const to = String(recipient || "").trim().toLowerCase();
  const from = String(env.EMAIL_FROM || EMAIL_FROM_ADDRESS).trim().toLowerCase();
  const normalizedSubject = String(subject || "").trim().slice(0, 300);
  const normalizedType = String(emailType || "SYSTEM").trim().toUpperCase().slice(0, 80);

  if (!emailAddressValid(to)) {
    const error = new Error("INVALID_RECIPIENT");
    error.code = "INVALID_RECIPIENT";
    throw error;
  }
  if (from !== EMAIL_FROM_ADDRESS) {
    const error = new Error("EMAIL_FROM_MUST_BE_" + EMAIL_FROM_ADDRESS);
    error.code = "EMAIL_FROM_INVALID";
    throw error;
  }
  if (!normalizedSubject) {
    const error = new Error("EMAIL_SUBJECT_REQUIRED");
    error.code = "EMAIL_SUBJECT_REQUIRED";
    throw error;
  }
  if (!text && !html) {
    const error = new Error("EMAIL_BODY_REQUIRED");
    error.code = "EMAIL_BODY_REQUIRED";
    throw error;
  }

  const inserted = await sql`insert into email_logs(email_type,recipient,subject,status)
    values(${normalizedType},${to},${normalizedSubject},'PENDING')
    returning *`;
  const logRow = inserted[0];

  if (!env.EMAIL || typeof env.EMAIL.send !== "function") {
    const safeError = "EMAIL_BINDING_NOT_CONFIGURED";
    await sql`update email_logs set status='FAILED',error=${safeError} where id=${logRow.id}`;
    const error = new Error(safeError);
    error.code = safeError;
    throw error;
  }

  try {
    const result = await env.EMAIL.send({
      to,
      from,
      subject: normalizedSubject,
      ...(html ? { html: String(html) } : {}),
      ...(text ? { text: String(text) } : {}),
    });
    const messageId = String(result?.messageId || "").slice(0, 300) || null;
    await sql`update email_logs
      set status='SENT',provider_message_id=${messageId},error=null
      where id=${logRow.id}`;
    return { status: "SENT", provider_message_id: messageId, recipient: to, subject: normalizedSubject };
  } catch (error) {
    const safeError = sanitizeEmailError(error, env);
    await sql`update email_logs set status='FAILED',error=${safeError} where id=${logRow.id}`;
    const outgoing = new Error(safeError);
    outgoing.code = String(error?.code || "EMAIL_SEND_FAILED");
    throw outgoing;
  }
}

async function emailSystemStatus(sql, env) {
  const [lastTestRows, lastSendRows, lastErrorRows, lastDeliveryRows, dns] = await Promise.all([
    sql`select * from email_logs where email_type='TEST' order by created_at desc limit 1`,
    sql`select * from email_logs where status in ('SENT','DELIVERED') order by created_at desc limit 1`,
    sql`select * from email_logs where status in ('FAILED','DELIVERY_FAILED') order by created_at desc limit 1`,
    sql`select * from email_logs where status='DELIVERED' order by created_at desc limit 1`,
    emailDnsQa(),
  ]);

  let lastTest = lastTestRows[0] || null;
  let deliveryTracking = { status:"PENDING", reason:"NO_TEST_SEND", required_permission:null };
  if (lastTest) {
    const refreshed = await refreshEmailDelivery(sql, env, lastTest);
    lastTest = refreshed.row;
    deliveryTracking = refreshed.tracking;
  }

  let lastSend = lastSendRows[0] || null;
  if (lastSend && lastTest && lastSend.id === lastTest.id) lastSend = lastTest;

  let lastDelivery = lastDeliveryRows[0] || null;
  if (lastTest?.status === "DELIVERED") lastDelivery = lastTest;

  const bindingReady = Boolean(env.EMAIL && typeof env.EMAIL.send === "function");
  const fromAddress = String(env.EMAIL_FROM || EMAIL_FROM_ADDRESS).trim().toLowerCase();
  const spfPass = Boolean(dns.spf);
  const dkimPass = Boolean(dns.dkim);
  const fromDomainReady = fromAddress === EMAIL_FROM_ADDRESS && spfPass && dkimPass;
  const testSendPass = Boolean(lastTest && ["SENT","DELIVERED"].includes(lastTest.status) && !lastTest.error);
  const noSendErrorPass = Boolean(lastTest && !lastTest.error && !["FAILED","DELIVERY_FAILED"].includes(lastTest.status));

  const readinessQa = {
    email_service_connection: bindingReady ? "PASS" : "FAIL",
    from_domain: fromDomainReady ? "PASS" : "FAIL",
    spf: spfPass ? "PASS" : "FAIL",
    dkim: dkimPass ? "PASS" : "FAIL",
    test_send: testSendPass ? "PASS" : "FAIL",
    no_send_error: noSendErrorPass ? "PASS" : "FAIL",
  };
  const overallReady = Object.values(readinessQa).every(value => value === "PASS");

  return {
    status: overallReady ? "IMPRESAX_EMAIL_READY" : "EMAIL_SYSTEM_NOT_READY",
    sending: testSendPass && noSendErrorPass ? "PASS" : "FAIL",
    from_address: fromAddress,
    last_test: lastTest,
    last_send: lastSend,
    last_delivery: lastDelivery,
    last_error: lastErrorRows[0] || null,
    qa: readinessQa,
    delivery_tracking: deliveryTracking,
  };
}


function basicAuthValid(request, env) {
  if (!env.OPS_ADMIN_PASSWORD) return false;
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Basic ")) return false;
  try {
    const decoded = atob(auth.slice(6));
    const split = decoded.indexOf(":");
    const user = split >= 0 ? decoded.slice(0, split) : "";
    const pass = split >= 0 ? decoded.slice(split + 1) : "";
    return user === "admin" && pass === env.OPS_ADMIN_PASSWORD;
  } catch {
    return false;
  }
}

function accessAuthValid(request, env) {
  if (env.OPS_TRUST_CLOUDFLARE_ACCESS !== "1") return false;
  return Boolean(request.headers.get("Cf-Access-Authenticated-User-Email"));
}

function authorized(request, env) {
  return basicAuthValid(request, env) || accessAuthValid(request, env);
}

function authResponse(env) {
  if (!env.OPS_ADMIN_PASSWORD && env.OPS_TRUST_CLOUDFLARE_ACCESS !== "1") {
    return new Response("ImpresaX Ops is installed but private access is not configured.", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=UTF-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    });
  }
  return new Response("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="ImpresaX Ops"',
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}


function base64ToBytesOps(value) {
  const raw=atob(String(value || ""));
  const bytes=new Uint8Array(raw.length);
  for (let i=0;i<raw.length;i++) bytes[i]=raw.charCodeAt(i);
  return bytes;
}

async function renderAssetResponse(sql, variantId, mode) {
  const rows=await sql`select s.desktop_image_base64,s.mobile_image_base64,s.image_mime
    from render_variants rv
    join render_staging_payloads s on s.render_pack_id=rv.render_pack_id and s.variant_key=rv.variant_key
    where rv.id=${variantId}::uuid
    limit 1`;
  const row=rows[0];
  if (!row) return new Response("Not found",{status:404,headers:{"Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow, noarchive"}});
  const encoded=mode==="desktop"?row.desktop_image_base64:row.mobile_image_base64;
  if (!encoded) return new Response("Not ready",{status:404,headers:{"Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow, noarchive"}});
  return new Response(base64ToBytesOps(encoded),{
    status:200,
    headers:{
      "Content-Type":row.image_mime || "image/jpeg",
      "Cache-Control":"public, max-age=300",
      "X-Robots-Tag":"noindex, nofollow, noarchive",
      "X-Content-Type-Options":"nosniff"
    }
  });
}

async function renderV2AssetResponse(sql, env, revisionId, mode) {
  if (!env.RENDER_ARTIFACTS || typeof env.RENDER_ARTIFACTS.get !== "function") {
    return new Response("Render storage unavailable",{status:503,headers:{"Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow, noarchive"}});
  }
  const rows=await sql`select r.id,r.status,r.desktop_r2_key,r.mobile_r2_key,
      a.mime
    from render_variant_revisions r
    left join render_artifacts_v2 a
      on a.variant_revision_id=r.id
     and a.r2_key=case when ${mode}='desktop' then r.desktop_r2_key else r.mobile_r2_key end
    where r.id=${revisionId}::uuid
      and r.status='RENDER_READY'
    limit 1`;
  const row=rows[0];
  if (!row) return new Response("Not found",{status:404,headers:{"Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow, noarchive"}});
  const key=mode==="desktop" ? row.desktop_r2_key : row.mobile_r2_key;
  if (!key) return new Response("Not ready",{status:404,headers:{"Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow, noarchive"}});
  const object=await env.RENDER_ARTIFACTS.get(key);
  if (!object) return new Response("Not found",{status:404,headers:{"Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow, noarchive"}});
  const headers=new Headers();
  headers.set("Content-Type",object.httpMetadata?.contentType || row.mime || "image/jpeg");
  headers.set("Cache-Control","private, max-age=300");
  headers.set("X-Robots-Tag","noindex, nofollow, noarchive");
  headers.set("X-Content-Type-Options","nosniff");
  return new Response(object.body,{status:200,headers});
}

async function dashboard(sql) {
  const [counts, board, events, queue] = await Promise.all([
    sql`select * from ops_dashboard_counts`,
    sql`select * from ops_prospect_board order by rank nulls last, azienda asc limit 500`,
    sql`select id,prospect_id,event_type,entity_type,entity_id,actor,from_status,to_status,payload,created_at
        from site_events order by created_at desc limit 80`,
    sql`select id,prospect_id,task_type,status,priority,attempt_count,max_attempts,available_at,locked_at,locked_by,error,created_at,updated_at
        from orchestrator_queue
        where status in ('QUEUED','RUNNING','FAILED')
        order by case status when 'RUNNING' then 0 when 'FAILED' then 1 else 2 end, priority asc, id asc
        limit 100`
  ]);
  return {
    counts: counts[0] || {},
    prospects: board,
    recent_events: events,
    queue,
    generated_at: new Date().toISOString(),
  };
}


async function prospectDetail(sql, id) {
  const [p, jobs, packs, variants, v2packs, v2variants, assets, builds, qa, events, handoffs, queue] = await Promise.all([
    sql`select * from prospects where id=${id}::uuid limit 1`,
    sql`select * from render_jobs where prospect_id=${id}::uuid order by created_at desc`,
    sql`select * from render_packs where prospect_id=${id}::uuid order by version desc`,
    sql`select rv.* from render_variants rv
        join render_packs rp on rp.id=rv.render_pack_id
        where rp.prospect_id=${id}::uuid
        order by rp.version desc, rv.variant_key asc`,
    sql`select
          rp.id,rp.prospect_id,rp.status,rp.render_ready_at,rp.selected_variant_revision_id,
          rp.approved_reference,rp.shadow_mode,rp.quality_contract_version,rp.execution_engine_version,
          rp.created_at,rp.updated_at,
          rp.metadata->>'r107_retrofit_required' as r107_retrofit_required,
          rp.metadata->>'r107_retrofit_requested' as r107_retrofit_requested,
          rp.metadata->>'retrofit_required' as retrofit_required,
          rp.metadata->>'retrofit_status' as retrofit_status,
          rp.metadata->>'retrofit_reason' as retrofit_reason,
          rp.metadata->>'winner_variant' as winner_variant,
          rp.metadata->>'winner_reason' as winner_reason,
          rp.metadata->>'set_qa_status' as set_qa_status,
          rp.metadata->>'set_qa_score' as set_qa_score,
          rp.metadata->>'diversity_ab' as diversity_ab,
          rp.metadata->>'diversity_ac' as diversity_ac,
          rp.metadata->>'diversity_bc' as diversity_bc,
          rp.metadata->>'best_overall_variant' as best_overall_variant,
          rp.metadata->>'best_premium_variant' as best_premium_variant,
          rp.metadata->>'best_technical_variant' as best_technical_variant,
          rp.metadata->>'best_conversion_variant' as best_conversion_variant,
          rp.metadata->>'master_reference_status' as master_reference_status,
          rp.metadata->>'triple_variant_build_status' as triple_variant_build_status
        from render_v2_packs rp
        where rp.prospect_id=${id}::uuid
        order by rp.created_at desc`,
    sql`select
          v.id,v.render_pack_id,v.variant_key,v.status,v.current_revision,v.certified_revision,
          v.direction_fingerprint,
          r.id as revision_id,r.revision,r.status as revision_status,r.score as reference_score,
          r.compiler_version,r.desktop_r2_key,r.mobile_r2_key,
          r.render_spec->>'surface_policy' as surface_policy,
          r.render_spec->>'implementation_notes' as implementation_notes,
          r.render_spec->>'launch_grade_profile' as launch_grade_profile,
          rp.approved_reference,rp.selected_variant_revision_id,
          (rp.selected_variant_revision_id=r.id) as selected,
          (rp.metadata->>'winner_variant'=v.variant_key) as winner_suggested,
          coalesce(
            rp.metadata->>(case v.variant_key
              when 'A' then 'variant_A_direction'
              when 'B' then 'variant_B_direction'
              when 'C' then 'variant_C_direction'
            end),
            case v.variant_key
              when 'A' then 'ICONIC_EDITORIAL'
              when 'B' then 'STRUCTURED_TECHNICAL_PREMIUM'
              when 'C' then 'BRAND_DRAMATIC_SALES_IMPACT'
            end
          ) as creative_direction,
          rp.metadata->>'best_overall_variant' as best_overall_variant,
          rp.metadata->>'best_premium_variant' as best_premium_variant,
          rp.metadata->>'best_technical_variant' as best_technical_variant,
          rp.metadata->>'best_conversion_variant' as best_conversion_variant
        from render_v2_variants v
        join render_v2_packs rp on rp.id=v.render_pack_id
        join render_variant_revisions r
          on r.variant_id=v.id and r.revision=v.certified_revision
        where rp.prospect_id=${id}::uuid
          and v.variant_key in ('A','B','C')
          and v.certified_revision is not null
        order by rp.created_at desc,v.variant_key asc`,
    sql`select ra.* from render_assets ra join render_packs rp on rp.id=ra.render_pack_id
        where rp.prospect_id=${id}::uuid order by ra.created_at desc`,
    sql`select * from site_builds where prospect_id=${id}::uuid order by created_at desc`,
    sql`select * from qa_runs where prospect_id=${id}::uuid order by created_at desc`,
    sql`select * from site_events where prospect_id=${id}::uuid order by created_at desc limit 300`,
    sql`select * from sales_handoffs where prospect_id=${id}::uuid order by created_at desc`,
    sql`select * from orchestrator_queue where prospect_id=${id}::uuid order by id desc limit 100`,
  ]);
  if (!p[0]) return null;

  const v2Variants=v2variants.map(row=>({
    ...row,
    name:`Variant ${row.variant_key} — ${row.creative_direction}`,
    desktop_render_url:`/ops/api/render-v2-assets/${row.revision_id}/desktop`,
    mobile_render_url:`/ops/api/render-v2-assets/${row.revision_id}/mobile`,
  }));

  return {
    prospect: p[0],
    render_jobs: jobs,
    render_packs: packs,
    render_variants: variants,
    render_v2_packs: v2packs,
    render_v2_variants: v2Variants,
    render_assets: assets,
    site_builds: builds,
    qa_runs: qa,
    events,
    sales_handoffs: handoffs,
    queue,
  };
}

async function queueComplete(sql, jobId, payload = {}) {
  await sql`update orchestrator_queue
    set status='COMPLETED',locked_at=null,heartbeat_at=null,locked_by=null,error=null,payload=payload || ${JSON.stringify(payload)}::jsonb
    where id=${jobId}`;
}

async function queueRelease(sql, jobId, reason) {
  await sql`update orchestrator_queue
    set status='QUEUED',locked_at=null,heartbeat_at=null,locked_by=null,error=${reason},available_at=now()+interval '5 minutes'
    where id=${jobId}`;
}

async function queueFail(sql, jobId, reason) {
  await sql`update orchestrator_queue
    set status='FAILED',locked_at=null,heartbeat_at=null,locked_by=null,error=${reason}
    where id=${jobId}`;
}

async function transition(sql, prospectId, status, eventType, payload = {}) {
  return sql`select * from ops_transition_prospect(
    ${prospectId}::uuid,
    ${status}::pipeline_status,
    ${eventType},
    ${JSON.stringify(payload)}::jsonb,
    'orchestrator'
  )`;
}

async function logEvent(sql, prospectId, eventType, payload = {}) {
  await sql`insert into site_events(prospect_id,event_type,entity_type,entity_id,actor,payload)
    values(${prospectId}::uuid,${eventType},'orchestrator',${prospectId},'orchestrator',${JSON.stringify(payload)}::jsonb)`;
}

async function callExecutor(url, job, prospect) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job, prospect }),
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) {
    const error = new Error(`EXECUTOR_HTTP_${response.status}`);
    error.payload = data;
    throw error;
  }
  return data;
}

async function processQa(sql, env, job, prospect) {
  if (!env.QA_EXECUTOR_URL) {
    await queueRelease(sql, job.id, "QA_EXECUTOR_NOT_CONFIGURED");
    return { outcome: "waiting_executor", task: "QA" };
  }

  try {
    const result = await callExecutor(env.QA_EXECUTOR_URL, job, prospect);
    const attempts = await sql`select coalesce(max(attempt),0)+1 as attempt from qa_runs where prospect_id=${prospect.id}::uuid`;
    const attempt = Number(attempts[0]?.attempt || 1);
    await sql`insert into qa_runs(
      prospect_id,status,attempt,viewport_results,technical_results,visual_results,screenshots,error,started_at,completed_at
    ) values(
      ${prospect.id}::uuid,${result.pass ? "PASS" : "FAIL"},${attempt},
      ${JSON.stringify(result.viewport_results || {})}::jsonb,
      ${JSON.stringify(result.technical_results || {})}::jsonb,
      ${JSON.stringify(result.visual_results || {})}::jsonb,
      ${JSON.stringify(result.screenshots || {})}::jsonb,
      ${result.error || null},now(),now()
    )`;

    if (result.pass) {
      await transition(sql, prospect.id, "DEMO_READY", "QA_PASSED", result);
      await queueComplete(sql, job.id, result);
      return { outcome: "completed", task: "QA", prospect_id: prospect.id };
    }

    await queueFail(sql, job.id, result.error || "QA_FAILED");
    await sql`select * from ops_register_failure(
      ${prospect.id}::uuid,'qa',${result.error || "QA_FAILED"},${JSON.stringify(result)}::jsonb
    )`;
    return { outcome: "failed", task: "QA", prospect_id: prospect.id };
  } catch (error) {
    await queueFail(sql, job.id, error.message || String(error));
    await sql`select * from ops_register_failure(
      ${prospect.id}::uuid,'qa',${error.message || String(error)},'{}'::jsonb
    )`;
    return { outcome: "failed", task: "QA", prospect_id: prospect.id, error: error.message };
  }
}

async function processInternal(sql, job, prospect) {
  if (job.task_type === "PREPARE_BUILD") {
    await transition(sql, prospect.id, "READY_FOR_BUILD", "READY_FOR_BUILD", {
      queue_id: job.id,
      render_pack_id: job.render_pack_id || null,
      render_pack_version: job.render_pack_version || null
    });
    await queueComplete(sql, job.id);
    return { outcome: "completed", task: job.task_type };
  }

  if (job.task_type === "QA_REWORK") {
    await transition(sql, prospect.id, "BUILD_REWORK", "BUILD_REWORK", {
      queue_id: job.id,
      render_pack_id: job.render_pack_id || null,
      render_pack_version: job.render_pack_version || null
    });
    await queueComplete(sql, job.id);
    return { outcome: "completed", task: job.task_type };
  }

  if (job.task_type === "SALES_HANDOFF") {
    await sql`insert into sales_handoffs(
      prospect_id,status,demo_url,primary_problem,commercial_angle,outreach_hook,payload
    ) values(
      ${prospect.id}::uuid,'READY',${prospect.live_url || null},${prospect.primary_problem || null},
      ${prospect.source_data?.commercial_angle || null},${prospect.source_data?.outreach_hook || null},
      ${JSON.stringify({ source: "orchestrator" })}::jsonb
    )`;
    await transition(sql, prospect.id, "SALES_READY", "SALES_HANDOFF_CREATED", { queue_id: job.id });
    await queueComplete(sql, job.id);
    return { outcome: "completed", task: job.task_type };
  }

  await queueFail(sql, job.id, "UNKNOWN_TASK");
  return { outcome: "failed", task: job.task_type, error: "UNKNOWN_TASK" };
}

export async function runOrchestrator(env, workerId = "impresax-orchestrator-v1") {
  const sql = db(env);

  const [recoveredRows, reconciledRows] = await Promise.all([
    sql`select ops_recover_stale_jobs(interval '15 minutes') as recovered`,
    sql`select ops_reconcile_orchestrator() as reconciled`
  ]);

  // Rendering is Cloudflare-native and is intentionally NOT part of orchestrator_queue.
  // The orchestrator owns the pipeline only after explicit Cabina approval.
  const supportedTasks = ["PREPARE_BUILD","BUILD","QA","QA_REWORK","SALES_HANDOFF"];
  const jobs = await sql`select * from ops_claim_job(${workerId}, ${supportedTasks}::text[])`;
  const job = jobs[0];
  if (!job || !job.id) {
    return {
      outcome: "idle",
      recovered: Number(recoveredRows[0]?.recovered || 0),
      reconciled: Number(reconciledRows[0]?.reconciled || 0)
    };
  }

  const prospects = await sql`select * from prospects where id=${job.prospect_id}::uuid limit 1`;
  const prospect = prospects[0];
  if (!prospect) {
    await queueFail(sql, job.id, "PROSPECT_NOT_FOUND");
    return { outcome: "failed", error: "PROSPECT_NOT_FOUND" };
  }

  if (["PREPARE_BUILD","QA_REWORK","SALES_HANDOFF"].includes(job.task_type)) {
    return processInternal(sql, job, prospect);
  }
  if (job.task_type === "BUILD") {
    if (prospect.pipeline_status !== "BUILDING") {
      await transition(sql, prospect.id, "BUILDING", "BUILD_STARTED", {
        queue_id: job.id,
        executor: "INTERNAL_SITE_FACTORY",
        render_pack_id: job.render_pack_id || null,
        render_pack_version: job.render_pack_version || null
      });
    }
    try {
      const result = await buildApprovedReference(env, prospect.id);
      await queueComplete(sql, job.id, result);
      return { outcome: result.pass ? "completed" : "rework", task: "BUILD", prospect_id: prospect.id, result };
    } catch (error) {
      await queueComplete(sql, job.id, { error:error.message || String(error) });
      await sql`select * from ops_register_factory_failure(
        ${prospect.id}::uuid,'build',${error.message || String(error)},'{}'::jsonb
      )`;
      return { outcome:"rework",task:"BUILD",prospect_id:prospect.id,error:error.message };
    }
  }
  if (job.task_type === "QA") {
    try {
      const result = await qaApprovedReference(env, prospect.id);
      if (result.pass) {
        await logEvent(sql, prospect.id, "DEMO_READY", {
          queue_id: job.id,
          render_pack_id: job.render_pack_id || null,
          render_pack_version: job.render_pack_version || null
        });
      }
      await queueComplete(sql, job.id, result);
      return { outcome: result.pass ? "completed" : "rework", task:"QA", prospect_id:prospect.id, result };
    } catch (error) {
      await queueComplete(sql, job.id, { error:error.message || String(error) });
      await sql`select * from ops_register_factory_failure(
        ${prospect.id}::uuid,'qa',${error.message || String(error)},'{}'::jsonb
      )`;
      return { outcome:"rework",task:"QA",prospect_id:prospect.id,error:error.message };
    }
  }
  return processInternal(sql, job, prospect);
}

async function api(request, env, pathname) {
  let sql;
  try { sql = db(env); }
  catch (error) {
    return json({ ok:false, error:error.code || error.message }, 503);
  }

  const renderV2AssetMatch=pathname.match(/^\/ops\/api\/render-v2-assets\/([0-9a-f-]{36})\/(desktop|mobile)$/i);
  if (request.method === "GET" && renderV2AssetMatch) {
    return renderV2AssetResponse(sql,env,renderV2AssetMatch[1],renderV2AssetMatch[2].toLowerCase());
  }

  const renderAssetMatch=pathname.match(/^\/ops\/api\/render-assets\/([0-9a-f-]{36})\/(desktop|mobile)$/i);
  if (request.method === "GET" && renderAssetMatch) {
    const variantId=renderAssetMatch[1];
    const mode=renderAssetMatch[2].toLowerCase();
    const rows=await sql`select s.desktop_image_base64,s.mobile_image_base64,s.image_mime
      from render_variants rv
      join render_staging_payloads s on s.render_pack_id=rv.render_pack_id and s.variant_key=rv.variant_key
      where rv.id=${variantId}::uuid
      limit 1`;
    const row=rows[0];
    if (!row) return new Response("Not found",{status:404,headers:{"Cache-Control":"no-store"}});
    const encoded=mode==="desktop"?row.desktop_image_base64:row.mobile_image_base64;
    if (!encoded) return new Response("Not ready",{status:404,headers:{"Cache-Control":"no-store"}});
    return new Response(base64ToBytesOps(encoded),{
      status:200,
      headers:{
        "Content-Type":row.image_mime || "image/jpeg",
        "Cache-Control":"private, max-age=300",
        "X-Robots-Tag":"noindex, nofollow, noarchive"
      }
    });
  }

  if (request.method === "GET" && pathname === "/ops/api/dashboard") {
    return json({ ok:true, ...(await dashboard(sql)) });
  }

  if (request.method === "GET" && pathname === "/ops/api/email/status") {
    return json({ ok:true, email:await emailSystemStatus(sql, env) });
  }

  if (request.method === "POST" && pathname === "/ops/api/email/test") {
    let payload;
    try { payload = await request.json(); }
    catch { return json({ ok:false, error:"INVALID_JSON" }, 400); }

    const recipient = String(payload?.recipient || "").trim().toLowerCase();
    if (!emailAddressValid(recipient)) {
      return json({ ok:false, error:"INVALID_RECIPIENT" }, 400);
    }

    try {
      const result = await sendSystemEmail(env, {
        emailType: "TEST",
        recipient,
        subject: EMAIL_TEST_SUBJECT,
        text: EMAIL_TEST_BODY,
      });
      return json({ ok:true, result });
    } catch (error) {
      const safeError = sanitizeEmailError(error, env);
      return json({ ok:false, error:safeError }, error?.code === "INVALID_RECIPIENT" ? 400 : 503);
    }
  }

  if (request.method === "GET" && pathname === "/ops/api/requests") {
    const [rows, counts] = await Promise.all([
      sql`select id,created_at,updated_at,status,name,company,sector,website,phone,email,
                 improvement_area,diagnostic_area,message,source_page,
                 utm_source,utm_medium,utm_campaign,utm_content,utm_term,source,
                 notes,contacted_at,closed_at
          from inbound_requests
          order by created_at desc
          limit 500`,
      sql`select
          count(*)::int as total,
          count(*) filter (where status='NUOVA')::int as nuove,
          count(*) filter (where status='IN_LAVORAZIONE')::int as in_lavorazione,
          count(*) filter (where status='CONTATTATA')::int as contattate,
          count(*) filter (where status='CHIUSA')::int as chiuse
          from inbound_requests`
    ]);
    return json({ ok:true, requests:rows, counts:counts[0] || {} });
  }

  if (request.method === "GET" && pathname === "/ops/api/events") {
    const rows = await sql`select * from site_events order by created_at desc limit 300`;
    return json({ ok:true, events:rows });
  }

  const match = pathname.match(/^\/ops\/api\/prospects\/([0-9a-f-]{36})$/i);
  if (request.method === "GET" && match) {
    const detail = await prospectDetail(sql, match[1]);
    return detail ? json({ ok:true, ...detail }) : json({ ok:false, error:"NOT_FOUND" },404);
  }

  if (request.method === "POST" && pathname === "/ops/api/render-v2/select") {
    let payload;
    try { payload = await request.json(); }
    catch { return json({ok:false,error:"INVALID_JSON"},400); }

    const prospectId=String(payload?.prospect_id||"").trim();
    const renderPackId=String(payload?.render_pack_id||"").trim();
    const revisionId=String(payload?.revision_id||"").trim();
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if(!uuid.test(prospectId)||!uuid.test(renderPackId)||!uuid.test(revisionId)) {
      return json({ok:false,error:"INVALID_ID"},400);
    }

    const rows=await sql`select
        rp.id as render_pack_id,rp.status as pack_status,rp.approved_reference,
        v.variant_key,v.status as variant_status,v.certified_revision,
        r.id as revision_id,r.revision,r.status as revision_status
      from render_v2_packs rp
      join render_v2_variants v on v.render_pack_id=rp.id
      join render_variant_revisions r on r.variant_id=v.id and r.revision=v.certified_revision
      where rp.id=${renderPackId}::uuid
        and rp.prospect_id=${prospectId}::uuid
        and r.id=${revisionId}::uuid
      limit 1`;
    const candidate=rows[0];
    if(!candidate) return json({ok:false,error:"CERTIFIED_VARIANT_NOT_FOUND"},404);
    if(candidate.approved_reference) return json({ok:false,error:"MASTER_ALREADY_APPROVED"},409);
    if(String(candidate.pack_status)!=="RENDER_READY" ||
       String(candidate.variant_status)!=="RENDER_READY" ||
       String(candidate.revision_status)!=="RENDER_READY") {
      return json({ok:false,error:"CERTIFIED_VARIANT_NOT_RENDER_READY"},409);
    }

    const contract=await sql`select count(*)::int as complete
      from render_v2_variants v
      join render_variant_revisions r on r.variant_id=v.id and r.revision=v.certified_revision
      where v.render_pack_id=${renderPackId}::uuid
        and v.variant_key in ('A','B','C')
        and v.status='RENDER_READY'
        and r.status='RENDER_READY'
        and r.desktop_r2_key is not null
        and r.mobile_r2_key is not null`;
    if(Number(contract[0]?.complete||0)!==3) {
      return json({ok:false,error:"THREE_CERTIFIED_VARIANTS_REQUIRED"},409);
    }

    await sql`update render_v2_packs
      set selected_variant_revision_id=${revisionId}::uuid,
          metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
            'cabina_selected_variant',${candidate.variant_key},
            'cabina_selected_revision',${candidate.revision},
            'cabina_selected_at',to_jsonb(now()),
            'master_reference_status','AWAITING_CABINA_VISUAL_APPROVAL'
          ),
          updated_at=now()
      where id=${renderPackId}::uuid`;

    await sql`insert into site_events(prospect_id,event_type,entity_type,entity_id,actor,payload)
      values(
        ${prospectId}::uuid,'RENDER_V2_VARIANT_SELECTED','render_variant_revision',${revisionId}::text,'gestionale',
        ${JSON.stringify({source:"gestionale",action:"select_v2_candidate_only",master_approved:false})}::jsonb
          || jsonb_build_object('render_pack_id',${renderPackId},'variant_key',${candidate.variant_key},'revision',${candidate.revision})
      )`;

    return json({
      ok:true,
      prospect_id:prospectId,
      render_pack_id:renderPackId,
      revision_id:revisionId,
      variant_key:candidate.variant_key,
      revision:candidate.revision,
      approved_reference:false,
      master_status:"HUMAN_APPROVAL_REQUIRED"
    });
  }

  if (request.method === "POST" && pathname === "/ops/api/render/select") {
    let payload;
    try { payload = await request.json(); }
    catch { return json({ ok:false, error:"INVALID_JSON" },400); }

    const prospectId=String(payload?.prospect_id||"").trim();
    const renderPackId=String(payload?.render_pack_id||"").trim();
    const renderVariantId=String(payload?.render_variant_id||"").trim();
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if(!uuid.test(prospectId)||!uuid.test(renderPackId)||!uuid.test(renderVariantId)) {
      return json({ok:false,error:"INVALID_ID"},400);
    }

    const rows=await sql`select rp.*,p.business_name,p.pipeline_status,p.render_status
      from render_packs rp join prospects p on p.id=rp.prospect_id
      where rp.id=${renderPackId}::uuid and rp.prospect_id=${prospectId}::uuid limit 1`;
    const pack=rows[0];
    if(!pack) return json({ok:false,error:"RENDER_PACK_NOT_FOUND"},404);
    if(pack.approved_reference || String(pack.status||"").toUpperCase()==="APPROVED") {
      return json({ok:false,error:"RENDER_PACK_ALREADY_APPROVED"},409);
    }
    if(/REJECT|ARCHIVED/i.test(String(pack.status||""))) {
      return json({ok:false,error:"RENDER_PACK_NOT_SELECTABLE"},409);
    }
    if(String(pack.status||"").toUpperCase()!=="RENDER_READY" ||
       String(pack.render_status||"").toUpperCase()!=="RENDER_READY") {
      return json({ok:false,error:"RENDER_PACK_NOT_RENDER_READY"},409);
    }

    const contractRows=await sql`
      select
        count(*)::int as total,
        count(distinct variant_key)::int as distinct_keys,
        count(*) filter (
          where desktop_render_url is not null
            and mobile_render_url is not null
            and upper(coalesce(status,'')) not like '%REJECT%'
            and upper(coalesce(status,'')) not like '%ARCHIVED%'
        )::int as complete
      from render_variants
      where render_pack_id=${renderPackId}::uuid
        and variant_key in ('A','B','C')`;
    const contract=contractRows[0]||{};
    if(Number(contract.total)!==3 || Number(contract.distinct_keys)!==3 || Number(contract.complete)!==3) {
      return json({ok:false,error:"THREE_COMPLETE_VARIANTS_REQUIRED"},409);
    }

    const qaRows=await sql`
      select count(*)::int as passed
      from render_variants rv
      join render_staging_payloads s
        on s.render_pack_id=rv.render_pack_id and s.variant_key=rv.variant_key
      where rv.render_pack_id=${renderPackId}::uuid
        and rv.variant_key in ('A','B','C')
        and rv.status='RENDER_READY'
        and s.status='RENDERED'
        and s.desktop_image_base64 is not null
        and s.mobile_image_base64 is not null
        and s.rendered_at is not null
        and coalesce(s.design_notes->>'source','')='RENDERING_STUDIO_V1_FROZEN'
        and coalesce(s.design_notes->>'rendering_studio_contract','')='V8_2_CREATIVE_QUALITY'
        and coalesce(s.design_notes->>'creative_quality_runtime','')='V8.3_DETERMINISTIC_SIX_VIEW_QA'
        and coalesce(s.design_notes->'visual_qa'->>'pass','false')='true'
        and coalesce(s.design_notes->'visual_qa'->>'model','')='@cf/qwen/qwen3.8-27b'`;
    if(Number(qaRows[0]?.passed||0)!==3) {
      return json({ok:false,error:"THREE_VISUAL_QA_PASSES_REQUIRED"},409);
    }
    if(!validSetQa(pack)) {
      return json({ok:false,error:"A_B_C_SET_QA_PASS_REQUIRED"},409);
    }

    const variants=await sql`select * from render_variants
      where id=${renderVariantId}::uuid and render_pack_id=${renderPackId}::uuid limit 1`;
    const selectedVariant=variants[0]||null;
    if(!selectedVariant) return json({ok:false,error:"RENDER_VARIANT_NOT_FOUND"},404);
    if(!selectedVariant.desktop_render_url || !selectedVariant.mobile_render_url) {
      return json({ok:false,error:"RENDER_VARIANT_INCOMPLETE"},409);
    }
    if(/REJECT|ARCHIVED/i.test(String(selectedVariant.status||""))) {
      return json({ok:false,error:"RENDER_VARIANT_NOT_SELECTABLE"},409);
    }

    await sql`update render_variants
      set selected=false,
          status=case when status='SELECTED' then 'RENDER_READY' else status end,
          updated_at=now()
      where render_pack_id=${renderPackId}::uuid`;
    await sql`update render_variants set selected=true,status='SELECTED',updated_at=now()
      where id=${renderVariantId}::uuid`;

    const mergedContent={
      ...(selectedVariant.content_map||{}),
      selected_variant:selectedVariant.variant_key,
      selected_variant_id:selectedVariant.id,
      selected_variant_name:selectedVariant.name,
      selected_from_render_ready:true
    };
    const nonEmptyObject=(v)=>v && typeof v==="object" && !Array.isArray(v) && Object.keys(v).length>0;
    const selectedBrandDna=nonEmptyObject(selectedVariant.brand_dna) ? selectedVariant.brand_dna : (pack.brand_dna||{});
    const selectedPalette=nonEmptyObject(selectedVariant.palette) ? selectedVariant.palette : (pack.palette||{});
    const selectedTypography=nonEmptyObject(selectedVariant.typography) ? selectedVariant.typography : (pack.typography||{});
    const selectedImageMap=nonEmptyObject(selectedVariant.image_asset_map) ? selectedVariant.image_asset_map : (pack.image_asset_map||{});
    const selectedSectionMap=Array.isArray(selectedVariant.section_map) && selectedVariant.section_map.length ? selectedVariant.section_map : (pack.section_map||[]);
    const selectedCtaMap=nonEmptyObject(selectedVariant.cta_map) ? selectedVariant.cta_map : (pack.cta_map||{});
    const selectedSources=Array.from(new Set([...(pack.source_references||[]),...(selectedVariant.source_references||[])]));
    await sql`update render_packs set
      desktop_render_url=${selectedVariant.desktop_render_url},
      mobile_render_url=${selectedVariant.mobile_render_url},
      brand_dna=${JSON.stringify(selectedBrandDna)}::jsonb,
      palette=${JSON.stringify(selectedPalette)}::jsonb,
      typography=${JSON.stringify(selectedTypography)}::jsonb,
      image_asset_map=${JSON.stringify(selectedImageMap)}::jsonb,
      section_map=${JSON.stringify(selectedSectionMap)}::jsonb,
      cta_map=${JSON.stringify(selectedCtaMap)}::jsonb,
      content_map=${JSON.stringify(mergedContent)}::jsonb,
      source_references=${JSON.stringify(selectedSources)}::jsonb,
      reference_score=${selectedVariant.reference_score ?? null},
      approved_reference=false,
      approved_at=null,
      status='AWAITING_IMPLEMENTATION'
      where id=${renderPackId}::uuid`;

    await sql`update orchestrator_queue
      set status='CANCELLED',locked_at=null,heartbeat_at=null,locked_by=null,
          error='SUPERSEDED_BY_RENDER_SELECTION',updated_at=now()
      where prospect_id=${prospectId}::uuid
        and status in ('QUEUED','RUNNING')
        and task_type='RENDER'`;

    await sql`update prospects set
      pipeline_status='RENDERING'::pipeline_status,
      render_status='RENDER_SELECTED',
      current_step='AWAITING_RENDER_IMPLEMENTATION',
      next_action='IMPLEMENT_SELECTED_RENDER',
      error=null,
      updated_at=now()
      where id=${prospectId}::uuid`;

    await sql`insert into site_events(prospect_id,event_type,entity_type,entity_id,actor,from_status,to_status,payload)
      values(
        ${prospectId}::uuid,'RENDER_VARIANT_SELECTED','render_variant',${selectedVariant.id}::uuid,
        'gestionale',${pack.pipeline_status},'RENDERING',
        ${JSON.stringify({
          source:"gestionale",
          action:"select_render_only",
          render_pack_id:renderPackId,
          render_variant_id:selectedVariant.id,
          variant_key:selectedVariant.variant_key,
          variant_name:selectedVariant.name,
          implementation_required:true
        })}::jsonb
      )`;

    return json({
      ok:true,
      prospect_id:prospectId,
      render_pack_id:renderPackId,
      render_variant_id:selectedVariant.id,
      variant_key:selectedVariant.variant_key,
      status:"AWAITING_RENDER_IMPLEMENTATION",
      approved_reference:false
    });
  }

  if (request.method === "POST" && pathname === "/ops/api/render/implement") {
    let payload;
    try { payload = await request.json(); }
    catch { return json({ ok:false, error:"INVALID_JSON" },400); }

    const prospectId=String(payload?.prospect_id||"").trim();
    const renderPackId=String(payload?.render_pack_id||"").trim();
    const renderVariantId=String(payload?.render_variant_id||"").trim();
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if(!uuid.test(prospectId)||!uuid.test(renderPackId)||!uuid.test(renderVariantId)) {
      return json({ok:false,error:"INVALID_ID"},400);
    }

    const rows=await sql`select rp.*,p.business_name,p.pipeline_status,p.render_status
      from render_packs rp join prospects p on p.id=rp.prospect_id
      where rp.id=${renderPackId}::uuid and rp.prospect_id=${prospectId}::uuid limit 1`;
    const pack=rows[0];
    if(!pack) return json({ok:false,error:"RENDER_PACK_NOT_FOUND"},404);

    const variants=await sql`select * from render_variants
      where id=${renderVariantId}::uuid and render_pack_id=${renderPackId}::uuid limit 1`;
    const selectedVariant=variants[0]||null;
    if(!selectedVariant) return json({ok:false,error:"RENDER_VARIANT_NOT_FOUND"},404);

    if(pack.approved_reference && String(pack.status||"").toUpperCase()==="APPROVED") {
      if(!selectedVariant.selected) return json({ok:false,error:"ANOTHER_VARIANT_ALREADY_IMPLEMENTED"},409);
      return json({
        ok:true,
        idempotent:true,
        prospect_id:prospectId,
        render_pack_id:renderPackId,
        render_variant_id:selectedVariant.id,
        variant_key:selectedVariant.variant_key,
        status:"SITE_FACTORY_READY"
      });
    }

    if(String(pack.status||"").toUpperCase()!=="AWAITING_IMPLEMENTATION") {
      return json({ok:false,error:"RENDER_PACK_NOT_AWAITING_IMPLEMENTATION"},409);
    }
    if(!selectedVariant.selected || String(selectedVariant.status||"").toUpperCase()!=="SELECTED") {
      return json({ok:false,error:"RENDER_VARIANT_MUST_BE_SELECTED_FIRST"},409);
    }
    if(!selectedVariant.desktop_render_url || !selectedVariant.mobile_render_url) {
      return json({ok:false,error:"RENDER_VARIANT_INCOMPLETE"},409);
    }
    if(/REJECT|ARCHIVED/i.test(String(pack.status||"")) || /REJECT|ARCHIVED/i.test(String(selectedVariant.status||""))) {
      return json({ok:false,error:"RENDER_NOT_IMPLEMENTABLE"},409);
    }

    const contractRows=await sql`
      select
        count(*)::int as total,
        count(distinct variant_key)::int as distinct_keys,
        count(*) filter (
          where desktop_render_url is not null
            and mobile_render_url is not null
            and upper(coalesce(status,'')) not like '%REJECT%'
            and upper(coalesce(status,'')) not like '%ARCHIVED%'
        )::int as complete
      from render_variants
      where render_pack_id=${renderPackId}::uuid
        and variant_key in ('A','B','C')`;
    const contract=contractRows[0]||{};
    if(Number(contract.total)!==3 || Number(contract.distinct_keys)!==3 || Number(contract.complete)!==3) {
      return json({ok:false,error:"THREE_COMPLETE_VARIANTS_REQUIRED"},409);
    }

    const qaRows=await sql`
      select count(*)::int as passed
      from render_variants rv
      join render_staging_payloads s
        on s.render_pack_id=rv.render_pack_id and s.variant_key=rv.variant_key
      where rv.render_pack_id=${renderPackId}::uuid
        and rv.variant_key in ('A','B','C')
        and rv.desktop_render_url is not null
        and rv.mobile_render_url is not null
        and s.status='RENDERED'
        and s.desktop_image_base64 is not null
        and s.mobile_image_base64 is not null
        and s.rendered_at is not null
        and coalesce(s.design_notes->>'source','')='RENDERING_STUDIO_V1_FROZEN'
        and coalesce(s.design_notes->>'rendering_studio_contract','')='V8_2_CREATIVE_QUALITY'
        and coalesce(s.design_notes->>'creative_quality_runtime','')='V8.3_DETERMINISTIC_SIX_VIEW_QA'
        and coalesce(s.design_notes->'visual_qa'->>'pass','false')='true'
        and coalesce(s.design_notes->'visual_qa'->>'model','')='@cf/qwen/qwen3.8-27b'`;
    if(Number(qaRows[0]?.passed||0)!==3) {
      return json({ok:false,error:"THREE_VISUAL_QA_PASSES_REQUIRED"},409);
    }
    if(!validSetQa(pack)) {
      return json({ok:false,error:"A_B_C_SET_QA_PASS_REQUIRED"},409);
    }

    await sql`update render_packs set
      approved_reference=true,status='APPROVED',approved_at=now()
      where id=${renderPackId}::uuid`;
    await sql`update render_packs set approved_reference=false
      where prospect_id=${prospectId}::uuid and id<>${renderPackId}::uuid`;

    await sql`update orchestrator_queue
      set status='CANCELLED',locked_at=null,heartbeat_at=null,locked_by=null,
          error='SUPERSEDED_BY_EXPLICIT_RENDER_IMPLEMENTATION',updated_at=now()
      where prospect_id=${prospectId}::uuid
        and status in ('QUEUED','RUNNING')
        and task_type in ('RENDER','PREPARE_BUILD','BUILD','QA','QA_REWORK')`;

    await sql`update prospects set
      pipeline_status='APPROVED_REFERENCE'::pipeline_status,
      render_status='APPROVED_REFERENCE',
      build_status=null,
      qa_status=null,
      current_step='SITE_FACTORY_READY',
      next_action='SITE_FACTORY',
      error=null,
      hold_reason=null,
      updated_at=now()
      where id=${prospectId}::uuid`;

    await sql`insert into site_events(prospect_id,event_type,entity_type,entity_id,actor,from_status,to_status,payload)
      values(
        ${prospectId}::uuid,'RENDER_IMPLEMENTATION_CONFIRMED','render_variant',${selectedVariant.id}::uuid,
        'gestionale',${pack.pipeline_status},'APPROVED_REFERENCE',
        ${JSON.stringify({
          source:"gestionale",
          action:"implement_selected_render",
          render_pack_id:renderPackId,
          render_variant_id:selectedVariant.id,
          variant_key:selectedVariant.variant_key,
          variant_name:selectedVariant.name
        })}::jsonb
      )`;

    await sql`select ops_enqueue_for_status(${prospectId}::uuid,'APPROVED_REFERENCE'::pipeline_status)`;
    return json({
      ok:true,
      prospect_id:prospectId,
      render_pack_id:renderPackId,
      render_variant_id:selectedVariant.id,
      variant_key:selectedVariant.variant_key,
      status:"SITE_FACTORY_READY"
    });
  }

  if (request.method === "POST" && pathname === "/ops/api/orchestrator/run") {
    const result = await runOrchestrator(env, "control-room");
    return json({ ok:true, result });
  }

  return json({ ok:false, error:"NOT_FOUND" },404);
}

export function isOpsHost(hostname) {
  return hostname === ADMIN_HOST;
}

export async function handleOpsRequest(request, env) {
  const url = new URL(request.url);

  // Legacy GitHub-manifest sync and capability-token ingest are permanently disabled.
  // Cloudflare-native Rendering Engine + Neon are the only operational rendering path.
  if (
    (url.pathname === "/ops/render-sync" || url.pathname === "/ops/render-ingest") &&
    (request.method === "GET" || request.method === "POST")
  ) {
    return json({ok:false,error:"LEGACY_RENDER_TRANSPORT_DISABLED"},410,{
      "X-Robots-Tag":"noindex, nofollow, noarchive",
      "Referrer-Policy":"no-referrer",
      "Cache-Control":"no-store"
    });
  }

  // Public immutable preview assets. URLs contain unguessable variant UUIDs and expose only
  // generated render images, never admin data.
  const publicRenderAsset=url.pathname.match(/^\/ops\/render-assets\/([0-9a-f-]{36})\/(desktop|mobile)$/i);
  if (publicRenderAsset && request.method === "GET") {
    try {
      const sql=db(env);
      return renderAssetResponse(sql,publicRenderAsset[1],publicRenderAsset[2].toLowerCase());
    } catch (error) {
      return new Response("Unavailable",{status:503,headers:{"Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow, noarchive"}});
    }
  }

  // Public, non-sensitive health endpoint used only to verify Worker + Neon wiring.
  if (url.pathname === "/ops/healthz") {
    try {
      const sql = db(env);
      const rows = await sql`select
        current_database() as database,
        (select count(*)::int from prospects) as prospects,
        (select count(*)::int from prospects where render_status='RENDER_READY') as render_ready_count,
        (select count(*)::int
           from prospects p
          where p.render_status='RENDER_READY'
            and not exists (
              select 1
                from lateral (
                  select rp.*
                    from render_packs rp
                   where rp.prospect_id=p.id
                     and upper(coalesce(rp.status,'')) not like '%ARCHIVED%'
                     and upper(coalesce(rp.status,'')) not like '%REJECT%'
                   order by rp.version desc,rp.created_at desc
                   limit 1
                ) rp
               where rp.status='RENDER_READY'
                 and rp.approved_reference=false
                 and p.pipeline_status='RENDERING'::pipeline_status
                 and p.current_step='AWAITING_RENDER_SELECTION'
                 and p.next_action='SELECT_RENDER_IN_GESTIONALE'
                 and (select count(*)
                        from render_variants rv
                        join render_staging_payloads s
                          on s.render_pack_id=rv.render_pack_id
                         and s.variant_key=rv.variant_key
                       where rv.render_pack_id=rp.id
                         and rv.variant_key in ('A','B','C')
                         and rv.desktop_render_url is not null
                         and rv.mobile_render_url is not null
                         and upper(coalesce(rv.status,'')) not like '%REJECT%'
                         and upper(coalesce(rv.status,'')) not like '%ARCHIVED%'
                         and s.status='RENDERED'
                         and s.desktop_image_base64 is not null
                         and s.mobile_image_base64 is not null
                         and s.image_mime='image/jpeg'
                         and s.rendered_at is not null
                         and coalesce(s.design_notes->'visual_qa'->>'pass','false')='true'
                         and coalesce(s.design_notes->'visual_qa'->>'model','')='@cf/qwen/qwen3.8-27b')=3
                 and (select count(distinct rv.variant_key) from render_variants rv
                       where rv.render_pack_id=rp.id and rv.variant_key in ('A','B','C'))=3
                 and (select count(*) from render_variants rv
                       where rv.render_pack_id=rp.id and rv.selected=true)=0
            )
        ) as false_render_ready_count,
        (select count(*)::int from orchestrator_queue
          where task_type='RENDER' and status in ('QUEUED','RUNNING')) as legacy_render_queue_active,
        (select exists(
          select 1 from pg_trigger
           where tgname='render_packs_frozen_compliance_guard'
             and not tgisinternal
        )) as frozen_db_guard,
        (select exists(
          select 1
            from pg_proc p
            join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public'
             and p.proname='ops_render_frozen_compliance_guard'
             and position('V8_2_CREATIVE_QUALITY' in pg_get_functiondef(p.oid))>0
             and position('A_B_C_SET_QA_PASS_REQUIRED' in pg_get_functiondef(p.oid))>0
             and position('A_B_C_SET_QA_SCORE_BELOW_8' in pg_get_functiondef(p.oid))>0
             and position('V8.3_DETERMINISTIC_SIX_VIEW_QA' in pg_get_functiondef(p.oid))>0
        )) as frozen_db_guard_current,
        (select p.pipeline_status::text from prospects p
          where coalesce(p.legacy_ids->>'id_prospect',p.source_data->>'id_prospect')='CZ-063'
          limit 1) as proof_pipeline_status,
        (select p.render_status from prospects p
          where coalesce(p.legacy_ids->>'id_prospect',p.source_data->>'id_prospect')='CZ-063'
          limit 1) as proof_render_status,
        (select p.current_step from prospects p
          where coalesce(p.legacy_ids->>'id_prospect',p.source_data->>'id_prospect')='CZ-063'
          limit 1) as proof_current_step,
        (select rp.status from render_packs rp
          join prospects p on p.id=rp.prospect_id
          where coalesce(p.legacy_ids->>'id_prospect',p.source_data->>'id_prospect')='CZ-063'
            and rp.approved_reference=false
          order by rp.version desc limit 1) as proof_pack_status,
        (select coalesce((rp.content_map->>'visual_rework_cycle')::int,0) from render_packs rp
          join prospects p on p.id=rp.prospect_id
          where coalesce(p.legacy_ids->>'id_prospect',p.source_data->>'id_prospect')='CZ-063'
            and rp.approved_reference=false
          order by rp.version desc limit 1) as proof_visual_rework_cycle,
        (select count(*)::int from render_jobs rj
          join prospects p on p.id=rj.prospect_id
          where coalesce(p.legacy_ids->>'id_prospect',p.source_data->>'id_prospect')='CZ-063'
            and rj.status in ('RUNNING','COMPLETING','QA_RUNNING')) as proof_active_jobs,
        now() as checked_at`;
      const adminAssetUrl = new URL("/admin/", request.url);
      const adminAsset = await env.ASSETS.fetch(new Request(adminAssetUrl));
      const renderUiUrl = new URL("/admin/render-variants.js", request.url);
      const renderUiAsset = await env.ASSETS.fetch(new Request(renderUiUrl));
      const renderUiText = renderUiAsset.ok ? await renderUiAsset.text() : "";
      const renderUiTwoStep =
        renderUiText.includes("Scegli questa versione") &&
        renderUiText.includes("Implementa questa versione") &&
        renderUiText.includes("/ops/api/render/select") &&
        renderUiText.includes("/ops/api/render/implement");
      const falseRenderReady=Number(rows[0]?.false_render_ready_count || 0);
      const legacyRenderQueueActive=Number(rows[0]?.legacy_render_queue_active || 0);
      const frozenDbGuard=Boolean(rows[0]?.frozen_db_guard);
      const frozenDbGuardCurrent=Boolean(rows[0]?.frozen_db_guard_current);
      const healthy =
        adminAsset.ok &&
        renderUiAsset.ok &&
        renderUiTwoStep &&
        frozenDbGuard &&
        frozenDbGuardCurrent &&
        falseRenderReady===0 &&
        legacyRenderQueueActive===0;
      return json({
        ok: healthy,
        service: "impresax-ops",
        database: rows[0]?.database || "unknown",
        database_connected: true,
        render_pipeline: "CLOUDFLARE_NATIVE_V1",
        render_model: "@cf/zai-org/glm-4.7-flash",
        render_engine_version: "CLOUDFLARE_NATIVE_V8_5_FAST_PREVIEW_FIRST",
        frozen_master_commit: "9578da3fa1b173283bf5c748b0e7d89497537e76",
        frozen_contract: "RENDERING_STUDIO_V1_FROZEN",
        frozen_runtime_revision: "V8.3_DETERMINISTIC_SIX_VIEW_QA_20261013",
        creative_engine_revision: "V8.5_FAST_PREVIEW_FIRST",
        frozen_db_guard: frozenDbGuard,
        frozen_db_guard_current: frozenDbGuardCurrent,
        exact_brand_dna_required: true,
        image_provenance_required: true,
        site_factory_reference_lock_required: true,
        direction_pool_required: true,
        direction_set_gate_required: true,
        semantic_copy_gate_required: true,
        pre_render_evidence_required: true,
        creative_strategy_evidence_required: true,
        structured_asset_inventory_required: true,
        asset_vision_gate_required: true,
        cross_variant_visual_qa_required: true,
        qa_rework_memory_required: true,
        deterministic_browser_qa_required: true,
        six_view_set_qa_required: true,
        visual_asset_inventory_memory_required: true,
        flagship_first_pass_model: "@cf/zai-org/glm-4.7-flash",
        generation_circuit_breaker_required: true,
        atomic_generation_breaker_required: true,
        generation_breaker_source: "RENDER_JOBS_SOURCE_OF_TRUTH",
        generation_breaker_reconcile_each_cron: true,
        identity_asset_role_lock_required: true,
        zero_photo_premium_required: true,
        deterministic_html_sanitizer_required: true,
        generation_parallelism: 1,
        v8_4_first_render_ready_proof_required: true,
        v8_4_proof_prospect: "CZ-063",
        max_generation_failures: 3,
        render_phase_acceleration: "FAST_PREVIEW_FIRST_THEN_DEEP_QA",
        accelerated_pipeline_passes: 2,
        fast_preview_first: true,
        fast_preview_urls_before_final_qa: true,
        fast_direction_planning_calls: 1,
        render_tick_soft_budget_minutes: 10,
        cron_heavy_phase_separation_required: false,
        cron_phase_chaining_enabled: true,
        proof_pipeline_status: rows[0]?.proof_pipeline_status || null,
        proof_render_status: rows[0]?.proof_render_status || null,
        proof_current_step: rows[0]?.proof_current_step || null,
        proof_pack_status: rows[0]?.proof_pack_status || null,
        proof_visual_rework_cycle: Number(rows[0]?.proof_visual_rework_cycle || 0),
        proof_active_jobs: Number(rows[0]?.proof_active_jobs || 0),
        ai_stale_recovery_minutes: 16,
        cloudflare_cron_duration_limit_minutes: 15,
        render_owner: "CLOUDFLARE_NATIVE_ONLY",
        brand_gate_required: true,
        brand_gate_auto_recovery: true,
        visual_qa_required: true,
        visual_qa_model: "@cf/qwen/qwen3.8-27b",
        render_selection_mode: "TWO_STEP_EXPLICIT",
        render_ui_two_step: renderUiTwoStep,
        legacy_render_transports: "DISABLED",
        render_ready_count: Number(rows[0]?.render_ready_count || 0),
        false_render_ready_count: falseRenderReady,
        legacy_render_queue_active: legacyRenderQueueActive,
        ai_binding: Boolean(env.AI),
        browser_binding: Boolean(env.BROWSER),
        control_room_asset: adminAsset.ok,
        control_room_asset_status: adminAsset.status,
        render_ui_asset_status: renderUiAsset.status,
        checked_at: rows[0]?.checked_at || new Date().toISOString()
      }, healthy ? 200 : 503, {
        "X-Robots-Tag": "noindex, nofollow, noarchive"
      });
    } catch (error) {
      return json({
        ok: false,
        service: "impresax-ops",
        database_connected: false,
        error: error.code || error.message
      }, 503, {
        "X-Robots-Tag": "noindex, nofollow, noarchive"
      });
    }
  }

  if (!authorized(request, env)) return authResponse(env);
  if (url.pathname.startsWith("/ops/api/")) {
    return api(request, env, url.pathname);
  }

  const assetUrl = new URL(request.url);
  // Static Assets canonicalizes index.html to the directory URL.
  // Serve the admin directory itself for "/" so the browser never gets
  // redirected into a path that would be prefixed with /admin twice.
  if (url.pathname === "/" || url.pathname === "/admin" || url.pathname === "/admin/") {
    assetUrl.pathname = "/admin/";
  } else if (url.pathname.startsWith("/admin/")) {
    assetUrl.pathname = url.pathname;
  } else {
    assetUrl.pathname = `/admin${url.pathname}`;
  }
  const assetRequest = new Request(assetUrl, {
    method: "GET",
    headers: request.headers,
  });
  const response = await env.ASSETS.fetch(assetRequest);
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  headers.set("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' data: https:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'");
  return new Response(response.body, { status:response.status, statusText:response.statusText, headers });
}
