import { neon } from "@neondatabase/serverless";

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
    return processExternal(sql, env, job, prospect, "BUILD", env.BUILD_EXECUTOR_URL, "BUILDING", "QA_RUNNING");
  }
  if (job.task_type === "QA") {
    return processQa(sql, env, job, prospect);
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
      return json({
        ok: true,
        service: "impresax-ops",
        database: rows[0]?.database || "unknown",
        database_connected: true,
        checked_at: rows[0]?.checked_at || new Date().toISOString()
      }, 200, {
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
  assetUrl.hostname = "impresax.org";
  assetUrl.pathname = url.pathname === "/" ? "/admin/index.html" : `/admin${url.pathname}`;
  const response = await env.ASSETS.fetch(new Request(assetUrl, request));
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  headers.set("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' data: https:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'");
  return new Response(response.body, { status:response.status, statusText:response.statusText, headers });
}
