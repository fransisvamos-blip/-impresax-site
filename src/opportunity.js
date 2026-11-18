import { neon } from "@neondatabase/serverless";

const HOST = "opportunita.impresax.org";
const CODE = "CZ_LIDO_LOUNGE_2026";
const BUDGETS = new Set(["fino-50","50-100","100-200","oltre-200","da-definire"]);
const TIMES = new Set(["entro-30","entro-90","oltre-90","da-definire"]);
const EXPERIENCE = new Set(["si","no","preferisco-non-dire"]);
const TRANSACTIONS = new Set(["cessione","gestione","entrambe"]);

const LEAD_NOTIFICATION_FROM = "info@impresax.org";
export const OPPORTUNITY_LEAD_RECIPIENTS = Object.freeze([
  "valerianogaetano@hotmail.com",
  "fransisvamos@gmail.com",
]);

const formatInterest = (value) =>
  ({ cessione: "Acquisto dell'attività", gestione: "Gestione del locale", entrambe: "Acquisto o gestione" })[value] || value;

const readable = (value, fallback = "Non specificato") => {
  const v = String(value == null ? "" : value).replace(/[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]/g, "").trim();
  return v || fallback;
};

const escapeHtml = (value) => String(value).replace(/[&<>"']/g,
  (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

export async function notifyOpportunityLead(env, lead) {
  if (!env?.EMAIL || typeof env.EMAIL.send !== "function") {
    console.warn("OPPORTUNITY_LEAD_EMAIL_BINDING_MISSING");
    return { sent: 0, failed: OPPORTUNITY_LEAD_RECIPIENTS.length };
  }

  const fields = [
    ["Nome e cognome", readable(lead.full_name)],
    ["Cellulare", readable(lead.phone)],
    ["Interesse", formatInterest(lead.transaction_interest)],
    ["Come preferisce essere contattato", readable(lead.contact_preference)],
    ["Messaggio", readable(lead.notes)],
    ["Codice annuncio", CODE],
    ["ID richiesta", readable(lead.id)],
    ["Data e ora (UTC)", readable(lead.created_at)],
    ["Origine", readable(lead.source_page)],
  ];
  const subject = "[Lounge Bar Catanzaro Lido] Nuova richiesta di " +
    (lead.transaction_interest === "gestione" ? "gestione" : lead.transaction_interest === "entrambe" ? "vendita/gestione" : "acquisto");
  const textBody = [
    "NUOVO LEAD - LOUNGE BAR CATANZARO LIDO",
    "",
    ...fields.map(([label, value]) => label + ": " + value),
    "",
    "Contatto raccolto dal modulo di opportunita.impresax.org, con consenso privacy.",
    "Dati disponibili anche su ImpresaX Ops (Neon).",
  ].join("\n");
  const rows = fields.map(([label, value]) => 
    '<tr><td style="padding:10px 12px;color:#475569;border-bottom:1px solid #e2e8f0;vertical-align:top">' +
    escapeHtml(label) + '</td><td style="padding:10px 12px;color:#0f172a;font-weight:600;border-bottom:1px solid #e2e8f0;white-space:pre-wrap">' +
    escapeHtml(value) + '</td></tr>').join("");
  const html = '<div style="font-family:Arial,sans-serif;background:#f1f5f9;padding:24px">' +
    '<div style="max-width:620px;margin:auto;background:white;border-radius:12px;overflow:hidden">' +
    '<div style="background:#06253a;color:white;padding:24px"><div style="font-size:12px;letter-spacing:1px;color:#66dff0">IMPRESAX · OPPORTUNITÀ</div>' +
    '<h1 style="font-size:23px;margin:10px 0 0">Nuova richiesta lounge bar</h1></div>' +
    '<table style="border-collapse:collapse;width:100%;font-size:14px">' + rows + '</table>' +
    '<p style="padding:16px 24px;font-size:12px;color:#64748b">Richiesta ricevuta tramite il modulo della landing. Dati salvati anche su Neon.</p>' +
    '</div></div>';

  const sends = await Promise.allSettled(OPPORTUNITY_LEAD_RECIPIENTS.map(async (to) => {
    const result = await env.EMAIL.send({
      from: { email: LEAD_NOTIFICATION_FROM, name: "ImpresaX · Lounge Bar" },
      to,
      subject,
      text: textBody,
      html,
    });
    if (!result || typeof result.messageId !== "string") {
      console.warn("OPPORTUNITY_LEAD_EMAIL_NO_PROVIDER_MESSAGE_ID", to);
    }
    return { to, messageId: result?.messageId || null };
  }));
  let sent = 0;
  for (const [i, item] of sends.entries()) {
    if (item.status === "fulfilled") {
      sent++;
      console.log("OPPORTUNITY_LEAD_EMAIL_ACCEPTED", OPPORTUNITY_LEAD_RECIPIENTS[i]);
    } else {
      console.error("OPPORTUNITY_LEAD_EMAIL_FAILED", OPPORTUNITY_LEAD_RECIPIENTS[i],
        item.reason?.code || "SEND_FAILED");
    }
  }
  return { sent, failed: sends.length - sent };
}


const clean = (v, max) => String(v == null ? "" : v).trim().slice(0,max);
const response = (data,status=200) => new Response(JSON.stringify(data),{
  status,
  headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}
});

export async function handleOpportunityLead(request,env,ctx) {
  if(request.method!=="POST") return response({ok:false,error:"METHOD_NOT_ALLOWED"},405);
  const origin=request.headers.get("Origin");
  if(origin && origin!=="https://"+HOST) return response({ok:false,error:"ORIGIN_NOT_ALLOWED"},403);
  if(Number(request.headers.get("Content-Length")||"0")>12000) return response({ok:false,error:"PAYLOAD_TOO_LARGE"},413);
  if(!(request.headers.get("Content-Type")||"").toLowerCase().includes("application/json"))
    return response({ok:false,error:"INVALID_CONTENT_TYPE"},415);
  let data;
  try { data=await request.json(); } catch {return response({ok:false,error:"INVALID_JSON"},400);}
  if(clean(data?.company_site,120)) return response({ok:true,status:"RICEVUTA"},202);
  const fullName=clean(data?.full_name,120);
  const phone=clean(data?.phone,35);
  const email=clean(data?.email,254).toLowerCase();
  const budget=clean(data?.budget_band,30)||"da-definire";
  const timeline=clean(data?.timeline,30)||"da-definire";
  const experience=clean(data?.experience,30)||"preferisco-non-dire";
  const transaction=clean(data?.transaction_interest,30);
  if(fullName.length<3||!/^\+?[\d\s().-]{8,35}$/.test(phone)||phone.replace(/\D/g,"").length<8||
     (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))||
     !BUDGETS.has(budget)||!TIMES.has(timeline)||!EXPERIENCE.has(experience)||!TRANSACTIONS.has(transaction)||
     data?.privacy_accepted!==true)
    return response({ok:false,error:"DATI_NON_VALIDI"},422);
  if(!env.OPS_DATABASE_URL) return response({ok:false,error:"SERVIZIO_TEMPORANEAMENTE_NON_DISPONIBILE"},503);
  try {
    const sql=neon(env.OPS_DATABASE_URL);
    const rows=await sql`
      insert into public.activity_sale_leads (
        listing_code,full_name,phone,email,budget_band,timeline,experience,transaction_interest,notes,source_page,
        utm_source,utm_medium,utm_campaign,utm_content,utm_term,
        privacy_accepted,privacy_version
      ) values (
        ${CODE},${fullName},${phone},${email||null},${budget},${timeline},${experience},${transaction},
        ${clean(data?.notes,1500)||null},${clean(data?.source_page,500)||null},
        ${clean(data?.utm_source,100)||null},${clean(data?.utm_medium,100)||null},
        ${clean(data?.utm_campaign,120)||null},${clean(data?.utm_content,120)||null},
        ${clean(data?.utm_term,120)||null},true,'2026-11-12'
      ) returning id
    `;
    const payloadForEmail = {
      ...data,
      id: rows?.[0]?.id || "",
      created_at: new Date().toISOString(),
      full_name: fullName,
      phone,
      transaction_interest: transaction,
      contact_preference: clean(data?.notes,1500).match(/(?:^|\\n)Contatto preferito:\\s*(Telefonata|WhatsApp)/i)?.[1] || "",
      notes: clean(data?.notes,1500),
      source_page: clean(data?.source_page,500),
    };
    const mailWork = notifyOpportunityLead(env,payloadForEmail)
      .catch(error => console.error("OPPORTUNITY_LEAD_NOTIFICATION_UNEXPECTED_ERROR",error?.code||"EMAIL_ERROR"));
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(mailWork);
    else await mailWork;
    return response({ok:true,status:"RICEVUTA",request_id:rows?.[0]?.id||null},201);
  } catch(error) {
    console.error("OPPORTUNITY_LEAD_PERSIST_FAILED",error?.code||"DATABASE_ERROR");
    return response({ok:false,error:"SERVIZIO_TEMPORANEAMENTE_NON_DISPONIBILE"},503);
  }
}

export async function serveOpportunity(request,env,ctx) {
  const url=new URL(request.url);
  if(url.protocol!=="https:") {
    url.protocol="https:";
    return Response.redirect(url.toString(),301);
  }
  if(url.pathname==="/api/interesse") return handleOpportunityLead(request,env,ctx);
  if(request.method!=="GET"&&request.method!=="HEAD") return response({ok:false,error:"METHOD_NOT_ALLOWED"},405);
  // Cloudflare Assets canonicalizes index.html and *.html to directory/extensionless URLs.
  const paths={"/":"/opportunita/","/privacy":"/opportunita/privacy","/privacy/":"/opportunita/privacy","/og-social-v4.jpg":"/opportunita/og-social-v5.jpg","/og-social-v5.jpg":"/opportunita/og-social-v5.jpg","/og-social-v6.jpg":"/opportunita/og-social-v6.jpg","/og-social-v7.jpg":"/opportunita/og-social-v7.jpg","/og-social-v8.jpg":"/opportunita/og-social-v8.jpg","/og-social-v10.jpg":"/opportunita/og-social-v10.jpg","/hero-lounge-scene-v1.jpg":"/opportunita/hero-lounge-scene-v1.jpg","/hero-lounge-desktop-v1.webp":"/opportunita/hero-lounge-desktop-v1.webp","/hero-lounge-mobile-v1.webp":"/opportunita/hero-lounge-mobile-v1.webp","/hero-venue-panorama-real-v1.webp":"/opportunita/hero-venue-panorama-real-v1.webp","/hero-venue-mobile-real-v1.webp":"/opportunita/hero-venue-mobile-real-v1.webp","/hero-selected-original-20261118.png":"/opportunita/hero-selected-original-20261118.png","/story-serata-locale-v1.jpg":"/opportunita/story-serata-locale-v1.jpg","/story-serata-desktop-v1.webp":"/opportunita/story-serata-desktop-v1.webp","/story-serata-mobile-v1.webp":"/opportunita/story-serata-mobile-v1.webp","/story-serata-locale-v2.jpg":"/opportunita/story-serata-locale-v2.jpg","/story-serata-desktop-v2.webp":"/opportunita/story-serata-desktop-v2.webp","/story-serata-mobile-v2.webp":"/opportunita/story-serata-mobile-v2.webp"};
  const target=paths[url.pathname];
  if(!target) return response({ok:false,error:"NOT_FOUND"},404);
  const assetUrl=new URL(target,request.url);
  const out=await env.ASSETS.fetch(new Request(assetUrl,request));
  const headers=new Headers(out.headers);
  const heroImage=/^\/(hero-selected-original-20261118\.png|hero-venue-(panorama-real-v1|mobile-real-v1)\.webp|hero-lounge-(scene-v1\.jpg|desktop-v1\.webp|mobile-v1\.webp)|story-serata-(locale-v[12]\.jpg|desktop-v[12]\.webp|mobile-v[12]\.webp))$/.test(url.pathname);
  headers.set("Cache-Control",(url.pathname==="/"||url.pathname==="/privacy"||url.pathname==="/privacy/")?"no-store, max-age=0":heroImage?"public, max-age=31536000, immutable":(url.pathname==="/og-social-v4.jpg"||url.pathname==="/og-social-v5.jpg"||url.pathname==="/og-social-v6.jpg"||url.pathname==="/og-social-v7.jpg"||url.pathname==="/og-social-v8.jpg"||url.pathname==="/og-social-v10.jpg")?"public, max-age=86400, immutable":"public, max-age=300");
  headers.set("X-Content-Type-Options","nosniff");
  headers.set("Referrer-Policy","strict-origin-when-cross-origin");
  headers.set("X-Frame-Options","DENY");
  headers.set("Permissions-Policy","geolocation=(), camera=(), microphone=()");
  return new Response(out.body,{status:out.status,headers});
}
