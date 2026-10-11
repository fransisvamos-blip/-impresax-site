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
  const [p, jobs, packs, assets, builds, qa, events, handoffs, queue] = await Promise.all([
    sql`select * from prospects where id=${id}::uuid limit 1`,
    sql`select * from render_jobs where prospect_id=${id}::uuid order by created_at desc`,
    sql`select * from render_packs where prospect_id=${id}::uuid order by version desc`,
    sql`select ra.* from render_assets ra join render_packs rp on rp.id=ra.render_pack_id
        where rp.prospect_id=${id}::uuid order by ra.created_at desc`,
    sql`select * from site_builds where prospect_id=${id}::uuid order by created_at desc`,
    sql`select * from qa_runs where prospect_id=${id}::uuid order by created_at desc`,
    sql`select * from site_events where prospect_id=${id}::uuid order by created_at desc limit 300`,
    sql`select * from sales_handoffs where prospect_id=${id}::uuid order by created_at desc`,
    sql`select * from orchestrator_queue where prospect_id=${id}::uuid order by id desc limit 100`,
  ]);
  if (!p[0]) return null;
  return {
    prospect: p[0],
    render_jobs: jobs,
    render_packs: packs,
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
    set status='COMPLETED',locked_at=null,locked_by=null,error=null,payload=payload || ${JSON.stringify(payload)}::jsonb
    where id=${jobId}`;
}

async function queueRelease(sql, jobId, reason) {
  await sql`update orchestrator_queue
    set status='QUEUED',locked_at=null,locked_by=null,error=${reason},available_at=now()+interval '5 minutes'
    where id=${jobId}`;
}

async function queueFail(sql, jobId, reason) {
  await sql`update orchestrator_queue
    set status='FAILED',locked_at=null,locked_by=null,error=${reason}
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

async function processExternal(sql, env, job, prospect, kind, url, runningStatus, successStatus) {
  if (!url) {
    await queueRelease(sql, job.id, `${kind}_EXECUTOR_NOT_CONFIGURED`);
    return { outcome: "waiting_executor", task: kind };
  }

  if (prospect.pipeline_status !== runningStatus) {
    if (
      (kind === "RENDER" && ["READY_FOR_RENDERING","RENDER_REWORK"].includes(prospect.pipeline_status)) ||
      (kind === "BUILD" && ["READY_FOR_BUILD","BUILD_REWORK"].includes(prospect.pipeline_status))
    ) {
      await transition(sql, prospect.id, runningStatus, `${kind}_STARTED`, { queue_id: job.id });
    }
  }

  try {
    const result = await callExecutor(url, job, prospect);
    await logEvent(sql, prospect.id, `${kind}_COMPLETED`, { queue_id: job.id, result });

    if (kind === "RENDER") {
      const rows = await sql`select coalesce(max(attempt),0)+1 as attempt from render_jobs where prospect_id=${prospect.id}::uuid`;
      const attempt = Number(rows[0]?.attempt || 1);
      const rj = await sql`insert into render_jobs(prospect_id,status,attempt,worker,input_data,output_data,started_at,completed_at)
        values(${prospect.id}::uuid,'COMPLETED',${attempt},'orchestrator','{}'::jsonb,${JSON.stringify(result)}::jsonb,now(),now())
        returning id`;
      const versions = await sql`select coalesce(max(version),0)+1 as version from render_packs where prospect_id=${prospect.id}::uuid`;
      const version = Number(versions[0]?.version || 1);
      await sql`insert into render_packs(
        prospect_id,render_job_id,status,version,desktop_render_url,mobile_render_url,brand_dna,reference_score,approved_reference,approved_at
      ) values(
        ${prospect.id}::uuid,${rj[0].id}::uuid,'APPROVED',${version},
        ${result.desktop_render_url || null},${result.mobile_render_url || null},
        ${JSON.stringify(result.brand_dna || {})}::jsonb,${result.reference_score ?? null},
        true,now()
      )`;
    }

    if (kind === "BUILD") {
      const attempts = await sql`select coalesce(max(attempt),0)+1 as attempt from site_builds where prospect_id=${prospect.id}::uuid`;
      const attempt = Number(attempts[0]?.attempt || 1);
      await sql`insert into site_builds(
        prospect_id,status,attempt,repository,branch,commit_sha,deploy_id,live_url,build_meta,started_at,completed_at
      ) values(
        ${prospect.id}::uuid,'COMPLETED',${attempt},${result.repository || null},${result.branch || null},
        ${result.commit_sha || null},${result.deploy_id || null},${result.live_url || prospect.live_url || null},
        ${JSON.stringify(result)}::jsonb,now(),now()
      )`;
    }

    await transition(sql, prospect.id, successStatus, `${kind}_STATE_ADVANCED`, { queue_id: job.id });
    await queueComplete(sql, job.id, result);
    return { outcome: "completed", task: kind, prospect_id: prospect.id };
  } catch (error) {
    await queueFail(sql, job.id, error.message || String(error));
    await sql`select * from ops_register_failure(
      ${prospect.id}::uuid,${kind.toLowerCase()},${error.message || String(error)},
      ${JSON.stringify(error.payload || {})}::jsonb
    )`;
    return { outcome: "failed", task: kind, prospect_id: prospect.id, error: error.message };
  }
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
    await transition(sql, prospect.id, "READY_FOR_BUILD", "READY_FOR_BUILD", { queue_id: job.id });
    await queueComplete(sql, job.id);
    return { outcome: "completed", task: job.task_type };
  }

  if (job.task_type === "QA_REWORK") {
    await transition(sql, prospect.id, "BUILD_REWORK", "QA_REWORK_ROUTED", { queue_id: job.id });
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

export async function runOrchestrator(env, workerId = "impresax-orchestrator") {
  const sql = db(env);
  const jobs = await sql`select * from ops_claim_job(${workerId}, null)`;
  const job = jobs[0];
  if (!job || !job.id) return { outcome: "idle" };

  const prospects = await sql`select * from prospects where id=${job.prospect_id}::uuid limit 1`;
  const prospect = prospects[0];
  if (!prospect) {
    await queueFail(sql, job.id, "PROSPECT_NOT_FOUND");
    return { outcome: "failed", error: "PROSPECT_NOT_FOUND" };
  }

  if (["PREPARE_BUILD","QA_REWORK","SALES_HANDOFF"].includes(job.task_type)) {
    return processInternal(sql, job, prospect);
  }
  if (job.task_type === "RENDER") {
    return processExternal(sql, env, job, prospect, "RENDER", env.RENDER_EXECUTOR_URL, "RENDERING", "APPROVED_REFERENCE");
  }
  if (job.task_type === "BUILD") {
    if (prospect.pipeline_status !== "BUILDING") {
      await transition(sql, prospect.id, "BUILDING", "BUILD_STARTED", { queue_id: job.id, executor: "INTERNAL_SITE_FACTORY" });
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

  if (request.method === "GET" && pathname === "/ops/api/events") {
    const rows = await sql`select * from site_events order by created_at desc limit 300`;
    return json({ ok:true, events:rows });
  }

  const match = pathname.match(/^\/ops\/api\/prospects\/([0-9a-f-]{36})$/i);
  if (request.method === "GET" && match) {
    const detail = await prospectDetail(sql, match[1]);
    return detail ? json({ ok:true, ...detail }) : json({ ok:false, error:"NOT_FOUND" },404);
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

  // Public, non-sensitive health endpoint used only to verify Worker + Neon wiring.
  if (url.pathname === "/ops/healthz") {
    try {
      const sql = db(env);
      const rows = await sql`select
        current_database() as database,
        (select count(*)::int from prospects) as prospects,
        now() as checked_at`;
      const adminAssetUrl = new URL("/admin/", request.url);
      const adminAsset = await env.ASSETS.fetch(new Request(adminAssetUrl));
      return json({
        ok: true,
        service: "impresax-ops",
        database: rows[0]?.database || "unknown",
        database_connected: true,
        control_room_asset: adminAsset.ok,
        control_room_asset_status: adminAsset.status,
        checked_at: rows[0]?.checked_at || new Date().toISOString()
      }, adminAsset.ok ? 200 : 503, {
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
