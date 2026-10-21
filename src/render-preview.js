import { neon } from "@neondatabase/serverless";

const DOMAIN_SUFFIX=".impresax.org";
const PREVIEW_VERSION="RENDER_PREVIEW_V1";

function db(env) {
  if (!env.OPS_DATABASE_URL) throw new Error("OPS_DATABASE_URL_NOT_CONFIGURED");
  return neon(env.OPS_DATABASE_URL);
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

export function previewSlugFromBusinessName(value) {
  let s=String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  s=s.replace(/[.]/g," ").replace(/\s+/g," ").trim();
  s=s.replace(/\b(?:S\s+R\s+L\s+S|S\s+R\s+L|S\s+P\s+A|S\s+N\s+C|S\s+A\s+S|SOCIETA\s+A\s+RESPONSABILITA\s+LIMITATA)\b.*$/i,"").trim();
  s=s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
  return (s || "anteprima").slice(0,63).replace(/-+$/,"") || "anteprima";
}

function previewUrl(slug) {
  return "https://"+slug+DOMAIN_SUFFIX+"/";
}

async function eligibleRows(sql,pilotPackId=null) {
  const base=pilotPackId
    ? await sql`
      select p.id as prospect_id,p.business_name,p.slug as prospect_slug,p.source_data,
             rp.id as render_pack_id,rp.status as pack_status,rp.metadata,
             v.id as variant_id,v.variant_key,r.id as revision_id,r.revision,
             r.desktop_r2_key,r.mobile_r2_key
      from render_v2_packs rp
      join prospects p on p.id=rp.prospect_id
      join render_v2_variants v on v.render_pack_id=rp.id
      join lateral (
        select rr.*
        from render_variant_revisions rr
        where rr.variant_id=v.id
          and rr.status='RENDER_READY'
          and rr.desktop_r2_key is not null
          and rr.mobile_r2_key is not null
          and (
            coalesce(rr.render_spec->>'perceptual_flagship_standard','')<>'R118_PERCEPTUAL_JURY_V1'
            or exists (
              select 1
              from render_qa_results_v2 q
              where q.variant_revision_id=rr.id
                and q.qa_type='VARIANT_VISUAL'
                and q.status='PASS'
            )
          )
        order by rr.revision desc
        limit 1
      ) r on true
      where rp.id=${pilotPackId}::uuid
        and r.status='RENDER_READY'
        and r.desktop_r2_key is not null and r.mobile_r2_key is not null
        and (
          rp.selected_variant_revision_id=r.id
          or (
            coalesce((rp.metadata->>'single_concept_mode')::boolean,false)=true
            and v.variant_key='A'
          )
          or (
            rp.metadata->>'delivery_mode'='SINGLE_CONCEPT'
            and v.variant_key='A'
          )
          or (
            rp.status='RENDER_READY'
            and v.variant_key=coalesce(rp.metadata->>'best_overall_variant',rp.metadata->>'winner_variant','A')
          )
        )
      order by
        case when rp.selected_variant_revision_id=r.id then 0
             when v.variant_key='A' then 1 else 2 end,
        r.revision desc
      limit 1`
    : await sql`
      with latest as (
        select distinct on (prospect_id) *
        from render_v2_packs
        where status not in ('CANCELLED','SUPERSEDED')
        order by prospect_id,created_at desc
      )
      select p.id as prospect_id,p.business_name,p.slug as prospect_slug,p.source_data,
             rp.id as render_pack_id,rp.status as pack_status,rp.metadata,
             v.id as variant_id,v.variant_key,r.id as revision_id,r.revision,
             r.desktop_r2_key,r.mobile_r2_key
      from latest rp
      join prospects p on p.id=rp.prospect_id
      join render_v2_variants v on v.render_pack_id=rp.id
      join lateral (
        select rr.*
        from render_variant_revisions rr
        where rr.variant_id=v.id
          and rr.status='RENDER_READY'
          and rr.desktop_r2_key is not null
          and rr.mobile_r2_key is not null
          and (
            coalesce(rr.render_spec->>'perceptual_flagship_standard','')<>'R118_PERCEPTUAL_JURY_V1'
            or exists (
              select 1
              from render_qa_results_v2 q
              where q.variant_revision_id=rr.id
                and q.qa_type='VARIANT_VISUAL'
                and q.status='PASS'
            )
          )
        order by rr.revision desc
        limit 1
      ) r on true
      where r.status='RENDER_READY'
        and r.desktop_r2_key is not null and r.mobile_r2_key is not null
        and (
          rp.selected_variant_revision_id=r.id
          or (
            coalesce((rp.metadata->>'single_concept_mode')::boolean,false)=true
            and v.variant_key='A'
          )
          or (
            rp.metadata->>'delivery_mode'='SINGLE_CONCEPT'
            and v.variant_key='A'
          )
          or (
            rp.status='RENDER_READY'
            and v.variant_key=coalesce(rp.metadata->>'best_overall_variant',rp.metadata->>'winner_variant','A')
          )
        )
      order by p.id,
        case when rp.selected_variant_revision_id=r.id then 0
             when v.variant_key=coalesce(rp.metadata->>'best_overall_variant',rp.metadata->>'winner_variant','A') then 1
             when v.variant_key='A' then 2 else 3 end,
        r.revision desc`;
  const seen=new Set();
  return base.filter(row=>{
    if(seen.has(row.prospect_id)) return false;
    seen.add(row.prospect_id);
    return true;
  });
}

async function uniquePreviewSlug(sql,row) {
  const existing=String(row.source_data?.render_preview?.slug || "").trim();
  if(existing) return existing;
  const base=previewSlugFromBusinessName(row.business_name);
  const collision=await sql`
    select id from prospects
    where id<>${row.prospect_id}::uuid
      and (
        slug=${base}
        or source_data->'render_preview'->>'slug'=${base}
      )
    limit 1`;
  if(!collision.length) return base;
  return (base.slice(0,54)+"-"+String(row.prospect_id).slice(0,8)).replace(/-+$/,"");
}

export async function syncRenderPreviews(env) {
  if(!env.OPS_DATABASE_URL) return {ok:false,skipped:true,reason:"OPS_DATABASE_URL_NOT_CONFIGURED"};
  const sql=db(env);
  const rolloutRows=await sql`select phase,pilot_pack_id,queue_enabled,metadata from render_v2_rollout_state where id=1 limit 1`;
  const rollout=rolloutRows[0] || {};
  const pilotOnly=String(rollout.phase || "")==="PILOT_SINGLE_PROSPECT"
    || rollout.metadata?.pilot_single_prospect===true
    || rollout.metadata?.pilot_only_dedil===true;
  const pilotPackId=pilotOnly ? rollout.pilot_pack_id : null;
  if(pilotOnly && !pilotPackId) return {ok:false,skipped:true,reason:"PILOT_PACK_MISSING"};
  const rows=await eligibleRows(sql,pilotPackId);
  let published=0,unchanged=0;
  for(const row of rows) {
    const slug=await uniquePreviewSlug(sql,row);
    const old=row.source_data?.render_preview || {};
    const preview={
      status:"READY",
      slug,
      url:previewUrl(slug),
      render_pack_id:row.render_pack_id,
      variant_id:row.variant_id,
      variant_key:row.variant_key,
      revision_id:row.revision_id,
      revision:Number(row.revision),
      desktop_r2_key:row.desktop_r2_key,
      mobile_r2_key:row.mobile_r2_key,
      version:PREVIEW_VERSION,
      published_at:old.published_at || new Date().toISOString(),
      updated_at:new Date().toISOString()
    };
    const same=String(old.revision_id || "")===String(row.revision_id)
      && String(old.url || "")===preview.url
      && String(old.status || "")==="READY";
    if(same) { unchanged++; continue; }

    await sql`
      update prospects
      set source_data=jsonb_set(coalesce(source_data,'{}'::jsonb),'{render_preview}',${JSON.stringify(preview)}::jsonb,true),
          updated_at=now()
      where id=${row.prospect_id}::uuid`;
    await sql`
      update render_v2_packs
      set metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{client_preview}',${JSON.stringify(preview)}::jsonb,true),
          updated_at=now()
      where id=${row.render_pack_id}::uuid`;
    await sql`
      insert into site_events(prospect_id,event_type,entity_type,entity_id,actor,payload)
      values(
        ${row.prospect_id}::uuid,'RENDER_PREVIEW_PUBLISHED','render_variant_revision',
        ${String(row.revision_id)},'render-preview-publisher',${JSON.stringify({
          version:PREVIEW_VERSION,url:preview.url,slug,render_pack_id:row.render_pack_id,
          variant_key:row.variant_key,revision_id:row.revision_id,revision:Number(row.revision)
        })}::jsonb
      )`;
    published++;
  }
  return {ok:true,pilot_only:pilotOnly,pilot_pack_id:pilotPackId || null,published,unchanged};
}

export async function resolveRenderPreviewTenant(env,slug) {
  if(!env.OPS_DATABASE_URL) return null;
  const sql=db(env);
  const rows=await sql`
    select p.id as prospect_id,p.business_name,
           p.source_data->'render_preview' as preview,
           r.status as revision_status,r.desktop_r2_key,r.mobile_r2_key
    from prospects p
    join render_variant_revisions r
      on r.id=(p.source_data->'render_preview'->>'revision_id')::uuid
    where p.source_data->'render_preview'->>'slug'=${slug}
      and p.source_data->'render_preview'->>'status'='READY'
      and r.status='RENDER_READY'
    limit 1`;
  const row=rows[0];
  if(!row) return null;
  const preview=row.preview || {};
  return {
    prospect_id:row.prospect_id,
    business_name:row.business_name,
    slug,
    url:preview.url || previewUrl(slug),
    revision_id:preview.revision_id,
    revision:Number(preview.revision || 0),
    desktop_r2_key:row.desktop_r2_key,
    mobile_r2_key:row.mobile_r2_key,
    version:preview.version || PREVIEW_VERSION
  };
}

async function imageResponse(env,key) {
  if(!env.RENDER_ARTIFACTS || typeof env.RENDER_ARTIFACTS.get!=="function") {
    return new Response("Preview unavailable",{status:503,headers:previewHeaders({"Cache-Control":"no-store"})});
  }
  const object=await env.RENDER_ARTIFACTS.get(key);
  if(!object) return new Response("Not found",{status:404,headers:previewHeaders({"Cache-Control":"no-store"})});
  return new Response(object.body,{
    status:200,
    headers:previewHeaders({
      "Content-Type":object.httpMetadata?.contentType || "image/jpeg",
      "Cache-Control":"private, max-age=300"
    })
  });
}

export function renderPreviewDocument(preview) {
  const name=esc(preview.business_name);
  return '<!doctype html><html lang="it"><head><meta charset="utf-8">'
    +'<meta name="viewport" content="width=device-width,initial-scale=1">'
    +'<meta name="robots" content="noindex,nofollow,noarchive">'
    +'<title>'+name+' · Anteprima ImpresaX</title>'
    +'<style>html,body{margin:0;padding:0;background:#ecece8;color:#111;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}'
    +'main{width:100%;overflow:hidden}.desktop{width:100%;display:flex;justify-content:center;background:#fff}'
    +'.desktop img{display:block;width:1440px;max-width:100%;height:auto}'
    +'.mobile-label{padding:54px 16px 22px;text-align:center;font-size:clamp(22px,2.2vw,34px);font-weight:700;letter-spacing:-.02em;background:#ecece8}'
    +'.mobile{display:flex;justify-content:center;padding:0 16px 80px;box-sizing:border-box}'
    +'.mobile img{display:block;width:390px;max-width:86vw;height:auto;box-shadow:0 18px 60px rgba(0,0,0,.12)}'
    +'.mark{position:fixed;right:12px;bottom:12px;z-index:10;padding:7px 10px;border-radius:999px;background:rgba(17,17,17,.82);color:#fff;font:500 10px/1.2 system-ui;letter-spacing:.02em;backdrop-filter:blur(8px)}'
    +'@media(max-width:600px){.mobile-label{padding:36px 12px 18px;font-size:24px}.mobile{width:100%;padding:0 0 56px}.mobile img{width:100%;max-width:100%;height:auto;box-shadow:none}.mark{font-size:9px}}</style></head>'
    +'<body><main><section class="desktop" aria-label="Anteprima desktop"><img src="/desktop.jpg" alt="Anteprima desktop '+name+'"></section>'
    +'<div class="mobile-label">Versione mobile</div><section class="mobile" aria-label="Anteprima mobile"><img src="/mobile.jpg" alt="Anteprima mobile '+name+'"></section></main>'
    +'<div class="mark">Anteprima · ImpresaX</div></body></html>';
}

function previewHeaders(initial={}) {
  const headers=new Headers(initial);
  headers.set("X-Robots-Tag","noindex, nofollow, noarchive");
  headers.set("X-Content-Type-Options","nosniff");
  headers.set("Referrer-Policy","no-referrer");
  headers.set("Permissions-Policy","camera=(), microphone=(), geolocation=()");
  return headers;
}

export async function serveRenderPreview(request,env,preview) {
  const url=new URL(request.url);
  if(url.pathname==="/desktop.jpg") return imageResponse(env,preview.desktop_r2_key);
  if(url.pathname==="/mobile.jpg") return imageResponse(env,preview.mobile_r2_key);
  if(url.pathname==="/favicon.ico") return new Response(null,{status:204,headers:previewHeaders({"Cache-Control":"public, max-age=86400"})});
  if(url.pathname!=="/") return new Response(null,{status:302,headers:previewHeaders({Location:preview.url,"Cache-Control":"no-store"})});
  return new Response(renderPreviewDocument(preview),{
    status:200,
    headers:previewHeaders({
      "Content-Type":"text/html; charset=UTF-8",
      "Cache-Control":"private, no-store",
      "X-ImpresaX-Render-Preview":preview.version || PREVIEW_VERSION,
      "X-ImpresaX-Render-Revision":String(preview.revision || "")
    })
  });
}
