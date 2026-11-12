import { neon } from "@neondatabase/serverless";

const HOST = "opportunita.impresax.org";
const CODE = "CZ_LIDO_LOUNGE_2026";
const BUDGETS = new Set(["fino-50","50-100","100-200","oltre-200","da-definire"]);
const TIMES = new Set(["entro-30","entro-90","oltre-90","da-definire"]);
const EXPERIENCE = new Set(["si","no","preferisco-non-dire"]);
const TRANSACTIONS = new Set(["cessione","gestione","entrambe"]);

const clean = (v, max) => String(v == null ? "" : v).trim().slice(0,max);
const response = (data,status=200) => new Response(JSON.stringify(data),{
  status,
  headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}
});

export async function handleOpportunityLead(request,env) {
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
  const budget=clean(data?.budget_band,30);
  const timeline=clean(data?.timeline,30);
  const experience=clean(data?.experience,30)||"preferisco-non-dire";
  const transaction=clean(data?.transaction_interest,30);
  if(fullName.length<3||!/^\+?[\d\s().-]{8,35}$/.test(phone)||phone.replace(/\D/g,"").length<8||
     !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||
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
        ${CODE},${fullName},${phone},${email},${budget},${timeline},${experience},${transaction},
        ${clean(data?.notes,1500)||null},${clean(data?.source_page,500)||null},
        ${clean(data?.utm_source,100)||null},${clean(data?.utm_medium,100)||null},
        ${clean(data?.utm_campaign,120)||null},${clean(data?.utm_content,120)||null},
        ${clean(data?.utm_term,120)||null},true,'2026-11-12'
      ) returning id
    `;
    return response({ok:true,status:"RICEVUTA",request_id:rows?.[0]?.id||null},201);
  } catch(error) {
    console.error("OPPORTUNITY_LEAD_PERSIST_FAILED",error?.code||"DATABASE_ERROR");
    return response({ok:false,error:"SERVIZIO_TEMPORANEAMENTE_NON_DISPONIBILE"},503);
  }
}

export async function serveOpportunity(request,env) {
  const url=new URL(request.url);
  if(url.protocol!=="https:") {
    url.protocol="https:";
    return Response.redirect(url.toString(),301);
  }
  if(url.pathname==="/api/interesse") return handleOpportunityLead(request,env);
  if(request.method!=="GET"&&request.method!=="HEAD") return response({ok:false,error:"METHOD_NOT_ALLOWED"},405);
  // Cloudflare Assets canonicalizes index.html and *.html to directory/extensionless URLs.
  const paths={"/":"/opportunita/","/privacy":"/opportunita/privacy","/privacy/":"/opportunita/privacy"};
  const target=paths[url.pathname];
  if(!target) return response({ok:false,error:"NOT_FOUND"},404);
  const assetUrl=new URL(target,request.url);
  const out=await env.ASSETS.fetch(new Request(assetUrl,request));
  const headers=new Headers(out.headers);
  headers.set("Cache-Control","public, max-age=300");
  headers.set("X-Content-Type-Options","nosniff");
  headers.set("Referrer-Policy","strict-origin-when-cross-origin");
  headers.set("X-Frame-Options","DENY");
  headers.set("Permissions-Policy","geolocation=(), camera=(), microphone=()");
  return new Response(out.body,{status:out.status,headers});
}
