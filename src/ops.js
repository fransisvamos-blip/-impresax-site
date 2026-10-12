import { neon } from "@neondatabase/serverless";
import puppeteer from "@cloudflare/puppeteer";
import { buildApprovedReference, qaApprovedReference } from "./site-factory.js";

const ADMIN_HOST = "admin.impresax.org";
const RENDER_REPOSITORY = "fransisvamos-blip/-impresax-site";
const RENDER_BRANCH = "main";
const RENDER_MANIFEST_SCHEMA = "IMPRESAX_RENDER_MANIFEST_V1";

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


function decodeBase64Utf8(value) {
  const raw=atob(String(value || ""));
  const bytes=new Uint8Array(raw.length);
  for (let i=0;i<raw.length;i++) bytes[i]=raw.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function bytesToBase64Ops(bytes) {
  let binary="";
  const view=bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const chunk=0x8000;
  for (let i=0;i<view.length;i+=chunk) {
    binary+=String.fromCharCode(...view.subarray(i,Math.min(i+chunk,view.length)));
  }
  return btoa(binary);
}

function base64ToBytesOps(value) {
  const raw=atob(String(value || ""));
  const bytes=new Uint8Array(raw.length);
  for (let i=0;i<raw.length;i++) bytes[i]=raw.charCodeAt(i);
  return bytes;
}

async function sha256Ops(value) {
  const bytes=new TextEncoder().encode(String(value || ""));
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

function parseRenderIngestComment(body) {
  const text=String(body || "");
  if (!text.startsWith("IMPRESAX_RENDER_VARIANT_V1")) return null;
  const rows={};
  for (const line of text.split(/\r?\n/).slice(1)) {
    const i=line.indexOf("=");
    if (i<1) continue;
    rows[line.slice(0,i).trim()]=line.slice(i+1).trim();
  }
  const prospect=String(rows.prospect || "").toUpperCase();
  const version=Number(rows.version);
  const variant=String(rows.variant || "").toUpperCase();
  const contentB64=String(rows.content_b64 || "");
  if (!validRenderProspectCode(prospect)) throw new Error("INVALID_PROSPECT_CODE");
  if (!validRenderVersion(version)) throw new Error("INVALID_RENDER_VERSION");
  if (!["A","B","C"].includes(variant)) throw new Error("INVALID_VARIANT");
  if (!contentB64) throw new Error("EMPTY_CONTENT_B64");
  const html=decodeBase64Utf8(contentB64);
  if (!/<html[\s>]/i.test(html) || !/<\/html>/i.test(html)) throw new Error("HTML_DOCUMENT_REQUIRED");
  if (html.length>250000) throw new Error("HTML_TOO_LARGE");
  return {prospect,version,variant,html};
}

async function ensureRenderPackForIngest(sql, code, version) {
  const prospects=await sql`select id,business_name,pipeline_status,brand_dna,logo,source_data
    from prospects
    where legacy_ids->>'id_prospect'=${code} or source_data->>'id_prospect'=${code}
    order by rank nulls last
    limit 1`;
  const prospect=prospects[0];
  if (!prospect) throw new Error("PROSPECT_NOT_FOUND");

  let packs=await sql`select * from render_packs
    where prospect_id=${prospect.id}::uuid and version=${version}
    order by created_at desc limit 1`;
  let pack=packs[0];

  if (!pack) {
    const versions=await sql`select coalesce(max(version),0)::int as max_version
      from render_packs where prospect_id=${prospect.id}::uuid`;
    const expected=Number(versions[0]?.max_version || 0)+1;
    if (Number(version)!==expected) throw new Error("RENDER_VERSION_NOT_NEXT_"+expected);
    const refs=Array.isArray(prospect.source_data?.source_references)?prospect.source_data.source_references:[];
    const inserted=await sql`insert into render_packs(
      prospect_id,status,version,approved_reference,brand_dna,official_logo,source_references
    ) values(
      ${prospect.id}::uuid,'RENDERING',${version},false,
      ${JSON.stringify(prospect.brand_dna || {})}::jsonb,
      ${JSON.stringify(prospect.logo || {})}::jsonb,
      ${JSON.stringify(refs)}::jsonb
    ) returning *`;
    pack=inserted[0];
  }

  if (prospect.pipeline_status==="READY_FOR_RENDERING") {
    await sql`update prospects
      set pipeline_status='RENDERING'::pipeline_status,
          render_status='RENDERING',
          current_step='ART_DIRECTION',
          next_action='WAIT_RENDER_INGEST',
          updated_at=now()
      where id=${prospect.id}::uuid`;
    prospect.pipeline_status="RENDERING";
  }

  return {prospect,pack};
}


function decodeBase64UrlUtf8(value) {
  const normalized=String(value || "").replace(/-/g,"+").replace(/_/g,"/");
  const padded=normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return decodeBase64Utf8(padded);
}

function safeRenderHtml(html) {
  const text=String(html || "").trim();
  if (!/<html[\s>]/i.test(text) || !/<\/html>/i.test(text)) throw new Error("HTML_DOCUMENT_REQUIRED");
  if (text.length<500 || text.length>250000) throw new Error("HTML_SIZE_INVALID");
  if (/<script[\s>]/i.test(text) || /javascript\s*:/i.test(text)) throw new Error("ACTIVE_SCRIPT_NOT_ALLOWED");
  if (/<iframe[\s>]/i.test(text) || /<object[\s>]/i.test(text) || /<embed[\s>]/i.test(text)) throw new Error("EMBED_NOT_ALLOWED");
  return text;
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

async function handleDirectRenderIngest(sql, env, url) {
  if (url.searchParams.get("health")==="1") {
    return {ok:true,status:200,service:"impresax-render-ingest",transport:"HTTPS_CHUNK_V1"};
  }
  const token=String(url.searchParams.get("token") || "").trim();
  const packCapability=String(url.searchParams.get("pack") || "").trim().toLowerCase();
  const variant=String(url.searchParams.get("variant") || "").trim().toUpperCase();
  const part=Number(url.searchParams.get("part"));
  const total=Number(url.searchParams.get("total"));
  const data=String(url.searchParams.get("data") || "").trim();
  const dry=url.searchParams.get("dry")==="1";

  const tokenMode=/^[a-f0-9]{64}$/i.test(token);
  const packMode=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(packCapability);
  if (!tokenMode && !packMode) return {ok:false,status:403,error:"INVALID_INGEST_CAPABILITY"};
  if (!["A","B","C"].includes(variant)) return {ok:false,status:400,error:"INVALID_VARIANT"};
  if (!Number.isInteger(part) || !Number.isInteger(total) || part<1 || total<1 || part>total || total>100) {
    return {ok:false,status:400,error:"INVALID_CHUNK_INDEX"};
  }
  if (!data || data.length>7000 || !/^[A-Za-z0-9_-]+$/.test(data)) {
    return {ok:false,status:400,error:"INVALID_CHUNK_DATA"};
  }

  let gates;
  if (tokenMode) {
    gates=await sql`select t.render_pack_id,t.prospect_id,t.prospect_code,t.version,t.expires_at,
        rp.status as pack_status,rp.approved_reference,p.pipeline_status
      from render_ingest_tokens t
      join render_packs rp on rp.id=t.render_pack_id
      join prospects p on p.id=t.prospect_id
      where t.token=${token}
      limit 1`;
  } else {
    gates=await sql`select rp.id as render_pack_id,rp.prospect_id,
        coalesce(p.legacy_ids->>'id_prospect',p.source_data->>'id_prospect') as prospect_code,
        rp.version,(now()+interval '1 day') as expires_at,
        rp.status as pack_status,rp.approved_reference,p.pipeline_status
      from render_packs rp
      join prospects p on p.id=rp.prospect_id
      where rp.id=${packCapability}::uuid
        and p.pipeline_status in ('READY_FOR_RENDERING'::pipeline_status,'RENDERING'::pipeline_status)
      limit 1`;
  }
  const gate=gates[0];
  if (!gate) return {ok:false,status:403,error:"INGEST_CAPABILITY_NOT_FOUND"};
  if (tokenMode && new Date(gate.expires_at).getTime()<Date.now()) return {ok:false,status:403,error:"INGEST_TOKEN_EXPIRED"};
  if (gate.approved_reference || /ARCHIVED|REJECT/i.test(String(gate.pack_status || ""))) {
    return {ok:false,status:409,error:"RENDER_PACK_NOT_WRITABLE"};
  }
  if (dry) {
    return {ok:true,status:200,dry_run:true,prospect:gate.prospect_code,version:gate.version,variant,part,total};
  }

  await sql`insert into render_ingest_chunks(render_pack_id,variant_key,part,total_parts,data)
    values(${gate.render_pack_id}::uuid,${variant},${part},${total},${data})
    on conflict(render_pack_id,variant_key,part) do update set
      total_parts=excluded.total_parts,data=excluded.data,created_at=now()`;
  if (tokenMode) {
    await sql`update render_ingest_tokens set last_used_at=now() where render_pack_id=${gate.render_pack_id}::uuid`;
  }

  const chunks=await sql`select part,total_parts,data
    from render_ingest_chunks
    where render_pack_id=${gate.render_pack_id}::uuid and variant_key=${variant}
    order by part asc`;
  const consistent=chunks.length===total && chunks.every((row,index)=>Number(row.part)===index+1 && Number(row.total_parts)===total);
  if (!consistent) {
    return {ok:true,status:202,staged:false,prospect:gate.prospect_code,version:gate.version,variant,received:chunks.length,total};
  }

  const encoded=chunks.map(row=>String(row.data)).join("");
  let html;
  try { html=safeRenderHtml(decodeBase64UrlUtf8(encoded)); }
  catch (error) {
    return {ok:false,status:422,error:String(error.message || error)};
  }
  const digest=await sha256Ops(html);
  const sourceRef="direct-ingest:"+gate.prospect_code+"/v"+gate.version+"/"+variant;

  await sql`insert into render_staging_payloads(
      render_pack_id,variant_key,status,html_source,design_notes,source_render_ref,
      source_comment_id,source_sha256,desktop_image_base64,mobile_image_base64,render_error,rendered_at,updated_at
    ) values(
      ${gate.render_pack_id}::uuid,${variant},'STAGED_SOURCE',${html},
      ${JSON.stringify({source:"IMPRESAX_RENDER_QUEUE_DIRECT",transport:"HTTPS_CHUNK_V1"})}::jsonb,
      ${sourceRef},null,${digest},null,null,null,null,now()
    )
    on conflict(render_pack_id,variant_key) do update set
      status='STAGED_SOURCE',
      html_source=excluded.html_source,
      design_notes=excluded.design_notes,
      source_render_ref=excluded.source_render_ref,
      source_comment_id=null,
      source_sha256=excluded.source_sha256,
      desktop_image_base64=null,
      mobile_image_base64=null,
      render_error=null,
      rendered_at=null,
      updated_at=now()`;

  const contentMap=JSON.stringify({
    implementation_html:html,
    implementation_contract_version:"QUEUE_HTML_V1",
    source_sha256:digest,
    source_transport:"HTTPS_CHUNK_V1"
  });
  await sql`insert into render_variants(
      render_pack_id,variant_key,name,status,content_map,source_references
    ) values(
      ${gate.render_pack_id}::uuid,${variant},${"Versione "+variant},'STAGED_SOURCE',
      ${contentMap}::jsonb,${JSON.stringify([sourceRef])}::jsonb
    )
    on conflict(render_pack_id,variant_key) do update set
      name=excluded.name,
      status='STAGED_SOURCE',
      desktop_render_url=null,
      mobile_render_url=null,
      content_map=excluded.content_map,
      source_references=excluded.source_references,
      updated_at=now()`;

  await sql`delete from render_ingest_chunks
    where render_pack_id=${gate.render_pack_id}::uuid and variant_key=${variant}`;
  await sql`update render_packs set status='RENDERING'
    where id=${gate.render_pack_id}::uuid
      and status not in ('RENDERING_ASSETS','RENDER_READY')`;
  await sql`update prospects set
      pipeline_status='RENDERING'::pipeline_status,
      render_status='RENDERING',
      current_step='RENDER_INGEST',
      next_action='AUTO_RENDER_STAGED_VARIANTS',
      error=null,
      updated_at=now()
    where id=${gate.prospect_id}::uuid
      and pipeline_status in ('READY_FOR_RENDERING'::pipeline_status,'RENDERING'::pipeline_status)`;

  const staged=await sql`select count(*)::int as n from render_staging_payloads
    where render_pack_id=${gate.render_pack_id}::uuid and html_source is not null and length(html_source)>0`;
  let render={outcome:"waiting_for_variants",staged:Number(staged[0]?.n || 0)};
  if (Number(staged[0]?.n || 0)===3) {
    render=await renderNextStagedPack(sql,env);
  }

  return {
    ok:true,status:200,staged:true,prospect:gate.prospect_code,version:gate.version,variant,
    staged_variants:Number(staged[0]?.n || 0),render
  };
}

async function ingestRenderIssueComments(sql) {
  const response=await fetch(
    "https://api.github.com/repos/"+RENDER_REPOSITORY+"/issues/5/comments?per_page=100&sort=created&direction=asc",
    {headers:{"Accept":"application/vnd.github+json","User-Agent":"ImpresaX-Render-Ingest/1.0","Cache-Control":"no-cache"}}
  );
  if (!response.ok) return {ok:false,error:"COMMENTS_FETCH_"+response.status,ingested:0};
  const comments=await response.json();
  let ingested=0,errors=0,skipped=0;

  for (const comment of Array.isArray(comments)?comments:[]) {
    const commentId=Number(comment?.id);
    const body=String(comment?.body || "");
    if (!commentId || !body.startsWith("IMPRESAX_RENDER_VARIANT_V1")) continue;

    const existing=await sql`select comment_id,status from render_ingest_comments where comment_id=${commentId} limit 1`;
    if (existing.length) { skipped++; continue; }

    await sql`insert into render_ingest_comments(comment_id,comment_url,status)
      values(${commentId},${comment?.html_url || null},'RECEIVED')
      on conflict(comment_id) do nothing`;

    try {
      const payload=parseRenderIngestComment(body);
      if (!payload) { skipped++; continue; }
      const {prospect,pack}=await ensureRenderPackForIngest(sql,payload.prospect,payload.version);
      const digest=await sha256Ops(payload.html);

      await sql`insert into render_staging_payloads(
        render_pack_id,variant_key,status,html_source,design_notes,source_render_ref,
        source_comment_id,source_sha256,desktop_image_base64,mobile_image_base64,render_error,rendered_at,updated_at
      ) values(
        ${pack.id}::uuid,${payload.variant},'STAGED_SOURCE',${payload.html},
        ${JSON.stringify({source:"IMPRESAX_RENDER_QUEUE",prospect_code:payload.prospect,version:payload.version,variant:payload.variant})}::jsonb,
        ${comment?.html_url || null},${commentId},${digest},null,null,null,null,now()
      )
      on conflict(render_pack_id,variant_key) do update set
        status='STAGED_SOURCE',
        html_source=excluded.html_source,
        design_notes=excluded.design_notes,
        source_render_ref=excluded.source_render_ref,
        source_comment_id=excluded.source_comment_id,
        source_sha256=excluded.source_sha256,
        desktop_image_base64=null,
        mobile_image_base64=null,
        render_error=null,
        rendered_at=null,
        updated_at=now()`;

      const legacyContentMap=JSON.stringify({
        implementation_html:payload.html,
        implementation_contract_version:"QUEUE_HTML_V1",
        source_sha256:digest,
        source_transport:"GITHUB_ISSUE_V1"
      });
      await sql`insert into render_variants(render_pack_id,variant_key,name,status,content_map,source_references)
        values(${pack.id}::uuid,${payload.variant},${"Versione "+payload.variant},'STAGED_SOURCE',
          ${legacyContentMap}::jsonb,${JSON.stringify([comment?.html_url || "github-issue:5"])}::jsonb)
        on conflict(render_pack_id,variant_key) do update set
          status='STAGED_SOURCE',
          desktop_render_url=null,
          mobile_render_url=null,
          content_map=excluded.content_map,
          source_references=excluded.source_references,
          updated_at=now()`;

      await sql`update render_ingest_comments
        set prospect_code=${payload.prospect},render_version=${payload.version},variant_key=${payload.variant},
            status='STAGED',error=null,processed_at=now()
        where comment_id=${commentId}`;
      await sql`update render_packs set status='RENDERING' where id=${pack.id}::uuid`;
      await sql`update prospects set render_status='RENDERING',current_step='RENDER_INGEST',
        next_action='AUTO_RENDER_STAGED_VARIANTS',updated_at=now()
        where id=${prospect.id}::uuid and pipeline_status='RENDERING'::pipeline_status`;
      ingested++;
    } catch (error) {
      errors++;
      await sql`update render_ingest_comments
        set status='ERROR',error=${String(error?.message || error).slice(0,500)},processed_at=now()
        where comment_id=${commentId}`;
    }
  }

  return {ok:true,ingested,errors,skipped};
}

async function renderHtmlReference(browser, html, width, height) {
  const page=await browser.newPage();
  try {
    await page.setViewport({width,height,deviceScaleFactor:1});
    await page.setJavaScriptEnabled(false);
    await page.setContent(html,{waitUntil:"networkidle0",timeout:30000});
    await new Promise(resolve=>setTimeout(resolve,500));
    return await page.screenshot({type:"jpeg",quality:80,fullPage:true});
  } finally {
    await page.close();
  }
}

async function renderNextStagedPack(sql, env) {
  const candidates=await sql`select rp.id as render_pack_id,rp.version,p.id as prospect_id,p.business_name
    from render_packs rp
    join prospects p on p.id=rp.prospect_id
    where rp.approved_reference=false
      and rp.status in ('RENDERING','ART_DIRECTION','AI_RENDERING')
      and (select count(*) from render_staging_payloads s
           where s.render_pack_id=rp.id and s.html_source is not null and length(s.html_source)>0)=3
      and exists(select 1 from render_staging_payloads s
                 where s.render_pack_id=rp.id and s.status in ('STAGED_SOURCE','RENDER_ERROR'))
    order by rp.created_at asc
    limit 1`;
  const candidate=candidates[0];
  if (!candidate) return {outcome:"idle"};

  const claim=await sql`update render_packs
    set status='RENDERING_ASSETS'
    where id=${candidate.render_pack_id}::uuid
      and status in ('RENDERING','ART_DIRECTION','AI_RENDERING')
    returning id`;
  if (!claim.length) return {outcome:"claimed_elsewhere",render_pack_id:candidate.render_pack_id};

  if (!env.BROWSER) {
    await sql`update render_packs set status='RENDERING' where id=${candidate.render_pack_id}::uuid and status='RENDERING_ASSETS'`;
    return {outcome:"blocked",error:"BROWSER_BINDING_NOT_CONFIGURED",render_pack_id:candidate.render_pack_id};
  }

  const rows=await sql`select * from render_staging_payloads
    where render_pack_id=${candidate.render_pack_id}::uuid
    order by variant_key asc`;
  if (rows.length!==3) return {outcome:"blocked",error:"THREE_STAGED_VARIANTS_REQUIRED"};

  const browser=await puppeteer.launch(env.BROWSER);
  try {
    for (const row of rows) {
      try {
        const variants=await sql`insert into render_variants(render_pack_id,variant_key,name,status)
          values(${candidate.render_pack_id}::uuid,${row.variant_key},${"Versione "+row.variant_key},'RENDERING_ASSETS')
          on conflict(render_pack_id,variant_key) do update set
            status='RENDERING_ASSETS',updated_at=now()
          returning id`;
        const variantId=variants[0].id;

        const [desktop,mobile]=await Promise.all([
          renderHtmlReference(browser,row.html_source,1440,900),
          renderHtmlReference(browser,row.html_source,390,844)
        ]);

        const desktopB64=bytesToBase64Ops(desktop);
        const mobileB64=bytesToBase64Ops(mobile);
        const base="https://"+ADMIN_HOST+"/ops/render-assets/"+variantId;

        await sql`update render_staging_payloads set
          status='RENDERED',
          desktop_image_base64=${desktopB64},
          mobile_image_base64=${mobileB64},
          image_mime='image/jpeg',
          render_error=null,
          rendered_at=now(),
          updated_at=now()
          where id=${row.id}::uuid`;

        await sql`update render_variants set
          status='RENDER_READY',
          desktop_render_url=${base+"/desktop"},
          mobile_render_url=${base+"/mobile"},
          updated_at=now()
          where id=${variantId}::uuid`;
      } catch (error) {
        await sql`update render_staging_payloads set
          status='RENDER_ERROR',render_error=${String(error?.message || error).slice(0,500)},updated_at=now()
          where id=${row.id}::uuid`;
        await sql`update render_packs set status='RENDERING'
          where id=${candidate.render_pack_id}::uuid and status='RENDERING_ASSETS'`;
        return {outcome:"error",render_pack_id:candidate.render_pack_id,variant:row.variant_key,error:String(error?.message || error)};
      }
    }
  } finally {
    await browser.close();
  }

  const complete=await sql`select count(*)::int as n from render_staging_payloads
    where render_pack_id=${candidate.render_pack_id}::uuid and status='RENDERED'
      and desktop_image_base64 is not null and mobile_image_base64 is not null`;
  if (Number(complete[0]?.n || 0)!==3) {
    await sql`update render_packs set status='RENDERING'
      where id=${candidate.render_pack_id}::uuid and status='RENDERING_ASSETS'`;
    return {outcome:"blocked",render_pack_id:candidate.render_pack_id,error:"RENDERED_VARIANTS_INCOMPLETE"};
  }

  await sql`update render_packs set status='RENDER_READY',approved_reference=false,approved_at=null
    where id=${candidate.render_pack_id}::uuid`;
  await sql`update prospects set
    pipeline_status='RENDERING'::pipeline_status,
    render_status='RENDER_READY',
    current_step='AWAITING_RENDER_SELECTION',
    next_action='SELECT_RENDER_IN_GESTIONALE',
    error=null,
    updated_at=now()
    where id=${candidate.prospect_id}::uuid`;
  await sql`insert into site_events(prospect_id,event_type,entity_type,entity_id,actor,from_status,to_status,payload)
    values(
      ${candidate.prospect_id}::uuid,'RENDER_QUEUE_AUTO_INGEST_READY','render_pack',${candidate.render_pack_id}::uuid,
      'render-ingest','RENDERING'::pipeline_status,'RENDERING'::pipeline_status,
      ${JSON.stringify({version:candidate.version,variants:["A","B","C"],storage:"NEON_STAGING",selection_required:true})}::jsonb
    )`;

  return {outcome:"completed",render_pack_id:candidate.render_pack_id,prospect_id:candidate.prospect_id,version:candidate.version};
}

export async function handlePublicRenderIngest(request, env) {
  const url=new URL(request.url);
  if (request.method!=="GET") return json({ok:false,error:"METHOD_NOT_ALLOWED"},405,{"X-Robots-Tag":"noindex, nofollow, noarchive"});
  try {
    const sql=db(env);
    const result=await handleDirectRenderIngest(sql,env,url);
    return json(result,result.status || (result.ok?200:400),{
      "X-Robots-Tag":"noindex, nofollow, noarchive",
      "Referrer-Policy":"no-referrer",
      "Cache-Control":"no-store"
    });
  } catch (error) {
    return json({ok:false,error:error.message || String(error)},503,{
      "X-Robots-Tag":"noindex, nofollow, noarchive",
      "Referrer-Policy":"no-referrer",
      "Cache-Control":"no-store"
    });
  }
}

export async function runRenderIngest(env) {
  const sql=db(env);
  let ingest={ok:true,skipped_poll:true};
  const minute=new Date().getUTCMinutes();
  if (minute%2===0) ingest=await ingestRenderIssueComments(sql);
  const render=await renderNextStagedPack(sql,env);
  return {ingest,render};
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


function validRenderProspectCode(value) {
  return /^[A-Z]{2,8}-[A-Z0-9-]{1,32}$/.test(String(value || ""));
}

function validRenderVersion(value) {
  const n=Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 9999 ? n : null;
}

async function fetchCanonicalRenderManifest(code, version) {
  const base="https://raw.githubusercontent.com/"+RENDER_REPOSITORY+"/"+RENDER_BRANCH+
    "/ops/render-packs/"+encodeURIComponent(code)+"/v"+version;
  const url=base+"/render-manifest.json";
  const response=await fetch(url,{headers:{"Cache-Control":"no-cache"}});
  if (response.status===404) return {ok:false,status:404,error:"MANIFEST_NOT_FOUND",url};
  if (!response.ok) return {ok:false,status:response.status,error:"MANIFEST_FETCH_FAILED",url};
  let manifest;
  try { manifest=await response.json(); }
  catch { return {ok:false,status:502,error:"MANIFEST_INVALID_JSON",url}; }
  return {ok:true,manifest,url,base};
}

async function syncCanonicalRenderManifest(sql, code, version) {
  if (!validRenderProspectCode(code)) return {ok:false,status:400,error:"INVALID_PROSPECT_CODE"};
  const v=validRenderVersion(version);
  if (!v) return {ok:false,status:400,error:"INVALID_RENDER_VERSION"};

  const prospects=await sql`select id,business_name,pipeline_status,render_status,current_step,next_action,legacy_ids,source_data,brand_dna,logo
    from prospects
    where legacy_ids->>'id_prospect'=${code} or source_data->>'id_prospect'=${code}
    order by rank nulls last
    limit 1`;
  const prospect=prospects[0];
  if (!prospect) return {ok:false,status:404,error:"PROSPECT_NOT_FOUND"};

  let packs=await sql`select * from render_packs
    where prospect_id=${prospect.id}::uuid and version=${v}
    order by created_at desc limit 1`;
  let pack=packs[0];

  if (!pack) {
    const versions=await sql`select coalesce(max(version),0)::int as max_version
      from render_packs where prospect_id=${prospect.id}::uuid`;
    const expected=Number(versions[0]?.max_version || 0)+1;
    if (v!==expected) {
      return {ok:false,status:409,error:"RENDER_VERSION_NOT_NEXT",expected_version:expected};
    }

    const inserted=await sql`insert into render_packs(
      prospect_id,status,version,approved_reference,brand_dna,official_logo,source_references
    ) values(
      ${prospect.id}::uuid,'RENDERING',${v},false,
      ${JSON.stringify(prospect.brand_dna || {})}::jsonb,
      ${JSON.stringify(prospect.logo || {})}::jsonb,
      ${JSON.stringify(Array.isArray(prospect.source_data?.source_references) ? prospect.source_data.source_references : [])}::jsonb
    ) returning *`;
    pack=inserted[0];

    if (prospect.pipeline_status==="READY_FOR_RENDERING") {
      await sql`update prospects
        set pipeline_status='RENDERING'::pipeline_status,
            render_status='RENDERING',
            current_step='ART_DIRECTION',
            next_action='WAIT_RENDER_MANIFEST',
            updated_at=now()
        where id=${prospect.id}::uuid`;
      prospect.pipeline_status="RENDERING";
    }
  }

  const fetched=await fetchCanonicalRenderManifest(code,v);
  if (!fetched.ok) return fetched;
  const manifest=fetched.manifest || {};
  if (manifest.schema!==RENDER_MANIFEST_SCHEMA) {
    return {ok:false,status:422,error:"MANIFEST_SCHEMA_INVALID"};
  }
  if (String(manifest.prospect_code||"")!==code || Number(manifest.version)!==v) {
    return {ok:false,status:422,error:"MANIFEST_IDENTITY_MISMATCH"};
  }

  const variants=Array.isArray(manifest.variants)?manifest.variants:[];
  const byKey=new Map();
  for (const item of variants) {
    if (!item || !["A","B","C"].includes(item.variant_key)) continue;
    byKey.set(item.variant_key,item);
  }
  if (byKey.size!==3) return {ok:false,status:422,error:"THREE_VARIANTS_REQUIRED"};

  const expectedPrefix=fetched.base+"/variant-";
  for (const key of ["A","B","C"]) {
    const item=byKey.get(key);
    const desktop=String(item.desktop_render_url||"");
    const mobile=String(item.mobile_render_url||"");
    const html=String(item.html_source_url||"");
    if (
      !desktop.startsWith(expectedPrefix+key+"-desktop.png") ||
      !mobile.startsWith(expectedPrefix+key+"-mobile.png") ||
      !html.startsWith(expectedPrefix+key+".html")
    ) {
      return {ok:false,status:422,error:"MANIFEST_URL_MISMATCH",variant:key};
    }

    const refs=JSON.stringify([html,desktop,mobile]);
    await sql`insert into render_variants(
      render_pack_id,variant_key,name,status,desktop_render_url,mobile_render_url,source_references
    ) values(
      ${pack.id}::uuid,${key},${String(item.name||("Versione "+key))},'RENDER_READY',
      ${desktop},${mobile},${refs}::jsonb
    )
    on conflict(render_pack_id,variant_key) do update set
      name=excluded.name,
      status='RENDER_READY',
      desktop_render_url=excluded.desktop_render_url,
      mobile_render_url=excluded.mobile_render_url,
      source_references=excluded.source_references,
      updated_at=now()`;
  }

  const previousPackStatus=String(pack.status||"");
  await sql`update render_packs
    set status='RENDER_READY',approved_reference=false,approved_at=null
    where id=${pack.id}::uuid`;

  if (prospect.pipeline_status==="RENDERING") {
    await sql`update prospects
      set render_status='RENDER_READY',
          current_step='AWAITING_RENDER_SELECTION',
          next_action='SELECT_RENDER_IN_GESTIONALE',
          error=null,
          updated_at=now()
      where id=${prospect.id}::uuid`;
  }

  if (previousPackStatus!=="RENDER_READY") {
    await sql`insert into site_events(prospect_id,event_type,entity_type,entity_id,actor,from_status,to_status,payload)
      values(
        ${prospect.id}::uuid,'RENDER_MANIFEST_AUTO_SYNCED','render_pack',${pack.id}::uuid,'render-sync',
        ${prospect.pipeline_status}::pipeline_status,${prospect.pipeline_status}::pipeline_status,
        ${JSON.stringify({prospect_code:code,version:v,manifest_url:fetched.url,variants:["A","B","C"]})}::jsonb
      )`;
  }

  return {
    ok:true,status:200,prospect_id:prospect.id,prospect_code:code,version:v,
    render_pack_id:pack.id,variants:["A","B","C"],render_status:"RENDER_READY"
  };
}

async function prospectDetail(sql, id) {
  const [p, jobs, packs, variants, assets, builds, qa, events, handoffs, queue] = await Promise.all([
    sql`select * from prospects where id=${id}::uuid limit 1`,
    sql`select * from render_jobs where prospect_id=${id}::uuid order by created_at desc`,
    sql`select * from render_packs where prospect_id=${id}::uuid order by version desc`,
    sql`select rv.* from render_variants rv
        join render_packs rp on rp.id=rv.render_pack_id
        where rp.prospect_id=${id}::uuid
        order by rp.version desc, rv.variant_key asc`,
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
    render_variants: variants,
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
      selected_variant_name:selectedVariant.name
    };
    await sql`update render_packs set
      desktop_render_url=${selectedVariant.desktop_render_url},
      mobile_render_url=${selectedVariant.mobile_render_url},
      brand_dna=${JSON.stringify(selectedVariant.brand_dna||{})}::jsonb,
      palette=${JSON.stringify(selectedVariant.palette||{})}::jsonb,
      typography=${JSON.stringify(selectedVariant.typography||{})}::jsonb,
      image_asset_map=${JSON.stringify(selectedVariant.image_asset_map||{})}::jsonb,
      section_map=${JSON.stringify(selectedVariant.section_map||[])}::jsonb,
      cta_map=${JSON.stringify(selectedVariant.cta_map||{})}::jsonb,
      content_map=${JSON.stringify(mergedContent)}::jsonb,
      source_references=${JSON.stringify(selectedVariant.source_references||[])}::jsonb,
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
        now() as checked_at`;
      const adminAssetUrl = new URL("/admin/", request.url);
      const adminAsset = await env.ASSETS.fetch(new Request(adminAssetUrl));
      return json({
        ok: true,
        service: "impresax-ops",
        database: rows[0]?.database || "unknown",
        database_connected: true,
        render_pipeline: "CLOUDFLARE_NATIVE_V1",
        render_model: "@cf/zai-org/glm-4.7-flash",
        render_engine_version: "CLOUDFLARE_NATIVE_V4",
        render_owner: "CLOUDFLARE_NATIVE_ONLY",
        render_selection_mode: "TWO_STEP_EXPLICIT",
        ai_binding: Boolean(env.AI),
        browser_binding: Boolean(env.BROWSER),
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
