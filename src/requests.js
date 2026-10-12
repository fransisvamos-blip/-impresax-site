import { neon } from "@neondatabase/serverless";

function db(env) {
  if (!env.OPS_DATABASE_URL) {
    const error = new Error("OPS_DATABASE_URL_NOT_CONFIGURED");
    error.code = "OPS_DATABASE_URL_NOT_CONFIGURED";
    throw error;
  }
  return neon(env.OPS_DATABASE_URL);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive"
    }
  });
}

function text(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function emailValid(value) {
  const email = text(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function phoneValid(value) {
  const digits = text(value, 80).replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 20;
}

function originAllowed(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return url.hostname === "impresax.org" || url.hostname === "www.impresax.org" || url.hostname.endsWith(".workers.dev");
  } catch {
    return false;
  }
}

export async function handlePublicRequest(request, env) {
  if (request.method !== "POST") {
    return json({ ok:false, error:"METHOD_NOT_ALLOWED" }, 405);
  }

  if (!originAllowed(request)) {
    return json({ ok:false, error:"ORIGIN_NOT_ALLOWED" }, 403);
  }

  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > 32_000) {
    return json({ ok:false, error:"PAYLOAD_TOO_LARGE" }, 413);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok:false, error:"INVALID_JSON" }, 400);
  }

  // Honeypot: bots often fill this hidden field. Pretend success without storing.
  if (text(body?.website_extra, 200)) {
    return json({ ok:true, status:"RICEVUTA" }, 202);
  }

  const name = text(body?.name, 120);
  const company = text(body?.company, 180);
  const sector = text(body?.sector, 140);
  const website = text(body?.website, 500) || null;
  const phone = text(body?.phone, 80);
  const email = text(body?.email, 254).toLowerCase();
  const improvementArea = text(body?.improvement_area, 180);
  const diagnosticArea = text(body?.diagnostic_area, 180) || null;
  const message = text(body?.message, 2000) || null;
  const sourcePage = text(body?.source_page, 1000) || null;

  if (!name || !company || !sector || !phone || !email || !improvementArea) {
    return json({ ok:false, error:"MISSING_REQUIRED_FIELDS" }, 422);
  }
  if (!emailValid(email) || !phoneValid(phone)) {
    return json({ ok:false, error:"INVALID_CONTACT_DATA" }, 422);
  }

  const sql = db(env);
  const rows = await sql`
    insert into inbound_requests(
      name,company,sector,website,phone,email,
      improvement_area,diagnostic_area,message,source_page,
      utm_source,utm_medium,utm_campaign,utm_content,utm_term,source
    ) values(
      ${name},${company},${sector},${website},${phone},${email},
      ${improvementArea},${diagnosticArea},${message},${sourcePage},
      ${text(body?.utm_source,160)||null},
      ${text(body?.utm_medium,160)||null},
      ${text(body?.utm_campaign,200)||null},
      ${text(body?.utm_content,200)||null},
      ${text(body?.utm_term,200)||null},
      'IMPRESAX_SITE'
    )
    returning id,created_at,status
  `;

  return json({
    ok:true,
    request_id:rows[0]?.id || null,
    status:"RICEVUTA"
  }, 201);
}
