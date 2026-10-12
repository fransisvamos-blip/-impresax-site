import { neon } from "@neondatabase/serverless";
import puppeteer from "@cloudflare/puppeteer";

const MODEL = "@cf/zai-org/glm-4.7-flash";
const MASTER_URL = "https://raw.githubusercontent.com/fransisvamos-blip/-impresax-site/9578da3fa1b173283bf5c748b0e7d89497537e76/docs/RENDERING_STUDIO_V1_FROZEN.md";
const ADMIN_HOST = "admin.impresax.org";
const MAX_PROSPECTS_PER_TICK = 3;
const MAX_RENDER_PACKS_PER_TICK = 2;

function db(env) {
  if (!env.OPS_DATABASE_URL) throw new Error("OPS_DATABASE_URL_NOT_CONFIGURED");
  return neon(env.OPS_DATABASE_URL);
}

function safeText(value, max = 12000) {
  if (value == null) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.slice(0, max);
}

function extractModelText(result) {
  return String(
    result?.choices?.[0]?.message?.content ??
    result?.response ??
    result?.result?.response ??
    result?.output_text ??
    ""
  ).trim();
}

function stripCodeFence(value) {
  let text = String(value || "").trim();
  text = text.replace(/^\`\`\`(?:html)?\s*/i, "").replace(/\s*\`\`\`$/i, "");
  return text.trim();
}

function validateHtml(value, logoUrl) {
  const html = stripCodeFence(value);
  if (!/<html[\s>]/i.test(html) || !/<\/html>/i.test(html)) throw new Error("HTML_DOCUMENT_REQUIRED");
  if (html.length < 3500) throw new Error("HTML_TOO_SHORT");
  if (html.length > 180000) throw new Error("HTML_TOO_LARGE");
  if (/<script[\s>]/i.test(html) || /javascript\s*:/i.test(html)) throw new Error("ACTIVE_SCRIPT_NOT_ALLOWED");
  if (/<iframe[\s>]/i.test(html) || /<object[\s>]/i.test(html) || /<embed[\s>]/i.test(html)) throw new Error("EMBED_NOT_ALLOWED");
  if (!/<header[\s>]/i.test(html)) throw new Error("HEADER_REQUIRED");
  if (!/<footer[\s>]/i.test(html)) throw new Error("FOOTER_REQUIRED");
  if (logoUrl && !html.includes(logoUrl)) throw new Error("OFFICIAL_LOGO_REQUIRED");
  return html;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < view.length; i += chunk) {
    binary += String.fromCharCode(...view.subarray(i, Math.min(i + chunk, view.length)));
  }
  return btoa(binary);
}

async function loadFrozenMaster() {
  const res = await fetch(MASTER_URL, { headers: { "Cache-Control": "no-cache" } });
  if (!res.ok) throw new Error("FROZEN_MASTER_FETCH_" + res.status);
  return (await res.text()).slice(0, 50000);
}

async function discoverFirstPartyImages(websiteUrl) {
  if (!websiteUrl) return [];
  try {
    const res = await fetch(websiteUrl, {
      redirect: "follow",
      headers: { "User-Agent": "ImpresaX-RenderingStudio/1.0" }
    });
    if (!res.ok) return [];
    const html = (await res.text()).slice(0, 500000);
    const urls = new Set();
    const base = new URL(res.url || websiteUrl);
    for (const match of html.matchAll(/<(?:img|source)[^>]+(?:src|srcset)=["']([^"']+)["']/gi)) {
      const raw = String(match[1] || "").split(/[\s,]/)[0];
      if (!raw || raw.startsWith("data:") || raw.startsWith("blob:")) continue;
      try {
        const u = new URL(raw, base).href;
        if (/\.(?:png|jpe?g|webp|avif)(?:[?#].*)?$/i.test(u) || /wp-content\/uploads/i.test(u)) urls.add(u);
      } catch {}
      if (urls.size >= 8) break;
    }
    return [...urls].slice(0, 8);
  } catch {
    return [];
  }
}

function prospectPayload(row, firstPartyImages) {
  const source = row.source_data || {};
  return {
    code: row.prospect_code,
    business_name: row.business_name,
    vertical: row.vertical,
    city: row.city,
    country: row.country,
    website_url: row.website_url,
    official_logo: row.logo || {},
    brand_dna: row.brand_dna || {},
    verified_services: source.verified_services || null,
    verified_contacts: source.verified_contacts || null,
    address: source.address || null,
    verified_trust: source.verified_trust || null,
    primary_digital_gap: source.primary_digital_gap || null,
    primary_marketing_gap: source.primary_marketing_gap || null,
    commercial_goal: source.commercial_goal || null,
    primary_cta: source.primary_cta || null,
    secondary_cta: source.secondary_cta || null,
    source_references: Array.isArray(source.source_references) ? source.source_references : [],
    first_party_images: firstPartyImages
  };
}

function fallbackDirections() {
  return {
    A: {
      concept: "Editorial flagship",
      composition: "Bold editorial hierarchy, asymmetric grid, strong negative space, one unmistakable signature device.",
      typography: "High-contrast display + neutral grotesk body.",
      imagery: "One dominant credible image or first-party evidence, never decorative stock overload.",
      conversion: "Direct CTA integrated into the composition."
    },
    B: {
      concept: "Immersive material story",
      composition: "Image-led, cinematic pacing, large crops, restrained text, strong section rhythm.",
      typography: "Condensed or architectural display paired with calm body typography.",
      imagery: "Material/process/detail photography with clear provenance.",
      conversion: "Commercial action appears after evidence, not as aggressive card UI."
    },
    C: {
      concept: "Precision system",
      composition: "Technical/editorial grid, measured rules, data-like visual language, modular but not card-heavy.",
      typography: "Precise grotesk/mono accents with strong display hierarchy.",
      imagery: "Selective evidence images combined with structured information.",
      conversion: "Clear request/contact path anchored to verified facts."
    }
  };
}

async function planDirections(env, master, payload) {
  const prompt = [
    "You are the ImpresaX Rendering Studio art director.",
    "Study the frozen master and the verified prospect data.",
    "Return ONLY valid JSON with keys A, B, C.",
    "Each key must contain concept, composition, typography, imagery, conversion.",
    "The three directions must be unmistakably different and specific to this prospect, not generic sector templates.",
    "Do not invent facts, services, awards, staff, branches, projects, numbers or testimonials.",
    "Official logo is immutable.",
    "",
    "FROZEN MASTER:",
    master,
    "",
    "PROSPECT:",
    JSON.stringify(payload)
  ].join("\n");

  try {
    const out = await env.AI.run(MODEL, {
      messages: [
        { role: "system", content: "You are a senior digital art director. Output strict JSON only." },
        { role: "user", content: prompt }
      ],
      max_completion_tokens: 2200,
      temperature: 0.45
    });
    const raw = extractModelText(out).replace(/^\`\`\`json\s*/i, "").replace(/\s*\`\`\`$/i, "");
    const parsed = JSON.parse(raw);
    if (parsed?.A && parsed?.B && parsed?.C) return parsed;
  } catch {}
  return fallbackDirections();
}

function htmlPrompt(master, payload, direction, key) {
  const logoUrl = payload?.official_logo?.url || payload?.official_logo?.official_source || "";
  return [
    "You are ImpresaX Rendering Studio. Produce ONE complete implementation-reference homepage as HTML/CSS.",
    "Return ONLY the HTML document. No markdown. No explanation.",
    "",
    "NON-NEGOTIABLE:",
    "- Follow the frozen Rendering Studio master.",
    "- Verified data only. Never invent services, awards, numbers, people, testimonials, branches, projects or capabilities.",
    "- Use the exact official logo URL supplied below. Never redraw, recreate, approximate or typeset the logo.",
    "- Complete full homepage: header/navigation, premium hero, body architecture, verified offer/services, verified trust/evidence where available, conversion/contact, footer.",
    "- Responsive at 1440 desktop and 390 mobile. Mobile is deliberately art-directed, not a broken stack.",
    "- Premium flagship editorial quality. No generic SaaS, no template feel, no card-grid inflation, no gradients/glows/glassmorphism.",
    "- Strong typography, composition, rhythm, restraint and one signature visual device.",
    "- Use CSS only; no JavaScript, iframe, object or embed.",
    "- Prefer first-party images supplied below. If insufficient, design elegantly with typography/material shapes rather than inventing fake company photography.",
    "- External images must be HTTPS.",
    "- All CTA/contact data must come from verified prospect data.",
    "- Keep implementation compact enough to render quickly.",
    "",
    "VARIANT KEY: " + key,
    "CREATIVE DIRECTION:",
    JSON.stringify(direction),
    "",
    "EXACT OFFICIAL LOGO URL:",
    logoUrl || "NO_OFFICIAL_LOGO_CONFIRMED — use verified business name as plain text; invent no mark.",
    "",
    "PROSPECT DATA:",
    JSON.stringify(payload),
    "",
    "FROZEN MASTER:",
    master
  ].join("\n");
}

async function generateVariant(env, master, payload, direction, key) {
  const logoUrl = payload?.official_logo?.url || payload?.official_logo?.official_source || "";
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const prompt = htmlPrompt(master, payload, direction, key) +
      (attempt === 2 ? "\n\nREWORK: the previous output failed validation. Return a complete valid HTML document and include the exact official logo URL when one exists." : "");
    try {
      const out = await env.AI.run(MODEL, {
        messages: [
          { role: "system", content: "You are a senior frontend art director. Output only production-grade HTML/CSS." },
          { role: "user", content: prompt }
        ],
        max_completion_tokens: 7600,
        temperature: 0.55
      });
      return validateHtml(extractModelText(out), logoUrl);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("AI_VARIANT_GENERATION_FAILED");
}

async function renderHtml(browser, html, width, height) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setJavaScriptEnabled(false);
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 450));
    return await page.screenshot({ type: "jpeg", quality: 82, fullPage: true });
  } finally {
    await page.close();
  }
}

async function recoverStaleClaims(sql) {
  await sql`update render_jobs
    set status='FAILED', error='STALE_CLOUDFLARE_AI_CLAIM', completed_at=now(), updated_at=now()
    where worker='cloudflare-workers-ai'
      and status='RUNNING'
      and started_at < now()-interval '6 minutes'`;

  await sql`update render_packs rp
    set status='ART_DIRECTION'
    where rp.approved_reference=false
      and rp.status='AI_RENDERING'
      and not exists (
        select 1 from render_jobs rj
        where rj.worker='cloudflare-workers-ai'
          and rj.status='RUNNING'
          and rj.started_at >= now()-interval '6 minutes'
          and rj.input_data->>'render_pack_id'=rp.id::text
      )`;

  await sql`update prospects p
    set current_step='ART_DIRECTION',next_action='AUTO_RENDER_A_B_C',error=null,updated_at=now()
    where p.pipeline_status='RENDERING'::pipeline_status
      and p.current_step='AI_RENDERING'
      and exists (
        select 1 from render_packs rp
        where rp.prospect_id=p.id and rp.approved_reference=false and rp.status='ART_DIRECTION'
      )`;

  await sql`update render_jobs
    set status='FAILED',error='STALE_BROWSER_RENDER_CLAIM',completed_at=now(),updated_at=now()
    where worker='cloudflare-browser-renderer'
      and status='RUNNING'
      and started_at < now()-interval '3 minutes'`;

  await sql`update render_packs rp
    set status='RENDERING'
    where rp.approved_reference=false
      and rp.status='RENDERING_ASSETS'
      and not exists (
        select 1 from render_jobs rj
        where rj.worker='cloudflare-browser-renderer'
          and rj.status='RUNNING'
          and rj.started_at >= now()-interval '3 minutes'
          and rj.input_data->>'render_pack_id'=rp.id::text
      )`;

  await sql`update prospects p
    set current_step='RENDERING_ASSETS',next_action='RETRY_BROWSER_RENDER',updated_at=now()
    where p.pipeline_status='RENDERING'::pipeline_status
      and p.render_status='RENDERING'
      and exists (
        select 1 from render_packs rp
        where rp.prospect_id=p.id and rp.approved_reference=false and rp.status='RENDERING'
          and (select count(*) from render_staging_payloads s
               where s.render_pack_id=rp.id and s.html_source is not null)=3
      )`;
}

async function ensureActivePacks(sql) {
  const rows = await sql`select id from prospects
    where pipeline_status='READY_FOR_RENDERING'::pipeline_status
    order by rank nulls last
    limit 100`;
  for (const row of rows) {
    await sql`select ops_enqueue_for_status(${row.id}::uuid,'READY_FOR_RENDERING'::pipeline_status)`;
  }
}

async function candidates(sql, limit) {
  const rows = await sql`select
      p.id as prospect_id,p.rank,p.business_name,p.vertical,p.city,p.country,p.website_url,
      p.logo,p.brand_dna,p.source_data,p.pipeline_status,
      rp.id as render_pack_id,rp.version,rp.status as pack_status,
      coalesce(p.legacy_ids->>'id_prospect',p.source_data->>'id_prospect') as prospect_code
    from prospects p
    join lateral (
      select x.* from render_packs x
      where x.prospect_id=p.id
        and x.approved_reference=false
        and upper(x.status) not like '%ARCHIVED%'
        and upper(x.status) not like '%REJECT%'
      order by x.version desc limit 1
    ) rp on true
    where p.pipeline_status in ('READY_FOR_RENDERING'::pipeline_status,'RENDERING'::pipeline_status)
      and rp.status='ART_DIRECTION'
      and coalesce(p.source_data->>'id_prospect',p.legacy_ids->>'id_prospect') <> 'CZ-000'
    order by
      case coalesce(p.legacy_ids->>'id_prospect',p.source_data->>'id_prospect')
        when 'CZ-063' then 1
        when 'CZ-209' then 2
        when 'CZ-031' then 3
        when 'CZ-210' then 4
        when 'CZ-058' then 5
        when 'CZ-097' then 6
        when 'CZ-001' then 7
        else 1000 + coalesce(p.rank,999)
      end
    limit ${Math.max(1, Math.min(Number(limit || 1), 6))}`;
  return rows;
}

async function claimPack(sql, row) {
  const claim = await sql`update render_packs set status='AI_RENDERING'
    where id=${row.render_pack_id}::uuid and status='ART_DIRECTION' and approved_reference=false
    returning id`;
  if (!claim.length) return null;

  const attempts = await sql`select coalesce(max(attempt),0)+1 as attempt
    from render_jobs where prospect_id=${row.prospect_id}::uuid and worker='cloudflare-workers-ai'`;
  const attempt = Number(attempts[0]?.attempt || 1);
  const job = await sql`insert into render_jobs(
      prospect_id,status,attempt,worker,input_data,started_at
    ) values(
      ${row.prospect_id}::uuid,'RUNNING',${attempt},'cloudflare-workers-ai',
      ${JSON.stringify({render_pack_id:row.render_pack_id,version:row.version,prospect_code:row.prospect_code})}::jsonb,now()
    ) returning id`;

  await sql`update prospects set
      pipeline_status='RENDERING'::pipeline_status,
      render_status='RENDERING',
      current_step='AI_RENDERING',
      next_action='AUTO_RENDER_A_B_C',
      error=null,
      updated_at=now()
    where id=${row.prospect_id}::uuid
      and pipeline_status in ('READY_FOR_RENDERING'::pipeline_status,'RENDERING'::pipeline_status)`;

  return job[0].id;
}

async function persistGeneratedPack(sql, row, jobId, htmlByKey, directions) {
  for (const key of ["A", "B", "C"]) {
    const html = htmlByKey[key];
    const digest = await sha256(html);
    const ref = "cloudflare-ai:" + row.prospect_code + "/v" + row.version + "/" + key;

    await sql`insert into render_staging_payloads(
        render_pack_id,variant_key,status,html_source,design_notes,source_render_ref,
        source_comment_id,source_sha256,desktop_image_base64,mobile_image_base64,
        render_error,rendered_at,updated_at
      ) values(
        ${row.render_pack_id}::uuid,${key},'STAGED_SOURCE',${html},
        ${JSON.stringify({source:"CLOUDFLARE_WORKERS_AI",model:MODEL,direction:directions[key] || {}})}::jsonb,
        ${ref},null,${digest},null,null,null,null,now()
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

    await sql`insert into render_variants(
        render_pack_id,variant_key,name,status,content_map,source_references
      ) values(
        ${row.render_pack_id}::uuid,${key},${"Versione "+key},'STAGED_SOURCE',
        ${JSON.stringify({
          implementation_html:html,
          implementation_contract_version:"CLOUDFLARE_AI_HTML_V1",
          source_sha256:digest,
          source_transport:"CLOUDFLARE_INTERNAL"
        })}::jsonb,
        ${JSON.stringify([ref])}::jsonb
      )
      on conflict(render_pack_id,variant_key) do update set
        name=excluded.name,
        status='STAGED_SOURCE',
        desktop_render_url=null,
        mobile_render_url=null,
        selected=false,
        content_map=excluded.content_map,
        source_references=excluded.source_references,
        updated_at=now()`;
  }

  await sql`update render_packs set status='RENDERING' where id=${row.render_pack_id}::uuid and status='AI_RENDERING'`;
  await sql`update render_jobs set status='COMPLETED',output_data=${JSON.stringify({variants:["A","B","C"],model:MODEL})}::jsonb,
      error=null,completed_at=now(),updated_at=now()
    where id=${jobId}::uuid`;
  await sql`update prospects set current_step='RENDERING_ASSETS',next_action='AUTO_RENDER_DESKTOP_MOBILE',updated_at=now()
    where id=${row.prospect_id}::uuid`;
}

async function failGeneration(sql, row, jobId, error) {
  const message = String(error?.message || error || "AI_RENDER_FAILED").slice(0, 600);
  await sql`update render_jobs set status='FAILED',error=${message},completed_at=now(),updated_at=now()
    where id=${jobId}::uuid`;
  await sql`update render_packs set status='ART_DIRECTION' where id=${row.render_pack_id}::uuid and status='AI_RENDERING'`;
  await sql`update prospects set current_step='ART_DIRECTION',next_action='RETRY_AI_RENDER',error=${message},updated_at=now()
    where id=${row.prospect_id}::uuid`;
}


function splitVariantPack(raw) {
  const text=String(raw || "");
  const a=text.indexOf("<<<A>>>");
  const b=text.indexOf("<<<B>>>");
  const cc=text.indexOf("<<<C>>>");
  if (a<0 || b<=a || cc<=b) throw new Error("AI_VARIANT_MARKERS_REQUIRED");
  return {
    A:text.slice(a+7,b).trim(),
    B:text.slice(b+7,cc).trim(),
    C:text.slice(cc+7).trim()
  };
}

async function generatePackSingleCall(env, master, payload) {
  const logoUrl=payload?.official_logo?.url || payload?.official_logo?.official_source || "";
  const direction=fallbackDirections();
  const prompt=[
    "You are ImpresaX Rendering Studio. Produce THREE complete premium homepage variants for the same prospect in ONE response.",
    "Return exactly three blocks using these markers and nothing else:",
    "<<<A>>>",
    "<!doctype html>...complete A...</html>",
    "<<<B>>>",
    "<!doctype html>...complete B...</html>",
    "<<<C>>>",
    "<!doctype html>...complete C...</html>",
    "",
    "All three must obey the frozen master and use VERIFIED DATA ONLY.",
    "Do not invent services, awards, staff, branches, projects, testimonials, numbers or capabilities.",
    "Use the exact official logo URL when supplied; never redraw or approximate the logo.",
    "Each variant must be standalone HTML+CSS, no JavaScript, no iframe/object/embed, full desktop 1440 + mobile 390.",
    "Each must include header/navigation, strong hero, complete body, verified services/offering, verified trust where available, conversion/contact and footer.",
    "A/B/C must be visibly and structurally different: different hero logic, grid, typography, image language, rhythm, signature device, hierarchy and CTA treatment.",
    "No generic SaaS, no template feel, no card-grid inflation, no gradients/glows/glassmorphism.",
    "Prefer supplied first-party images. If they are insufficient, use typography/material composition rather than fake company photography.",
    "Keep each HTML compact (roughly 4k-12k characters) so the whole pack renders fast.",
    "",
    "DIRECTION A:",JSON.stringify(direction.A),
    "DIRECTION B:",JSON.stringify(direction.B),
    "DIRECTION C:",JSON.stringify(direction.C),
    "",
    "EXACT LOGO:",logoUrl || "NO_OFFICIAL_LOGO_CONFIRMED",
    "PROSPECT:",JSON.stringify(payload),
    "FROZEN MASTER:",master
  ].join("\n");

  let lastError=null;
  for (let attempt=1;attempt<=2;attempt++) {
    try {
      const out=await env.AI.run(MODEL,{
        messages:[
          {role:"system",content:"You are a senior digital art director and frontend designer. Output only the three marked HTML blocks."},
          {role:"user",content:prompt+(attempt===2?"\nREWORK: previous pack failed validation. Return all three complete marked HTML documents, compact and valid.":"")}
        ],
        max_completion_tokens:15000,
        temperature:0.5
      });
      const parts=splitVariantPack(extractModelText(out));
      return {
        htmlByKey:{
          A:validateHtml(parts.A,logoUrl),
          B:validateHtml(parts.B,logoUrl),
          C:validateHtml(parts.C,logoUrl)
        },
        directions:direction
      };
    } catch (error) {
      lastError=error;
    }
  }
  throw lastError || new Error("AI_PACK_GENERATION_FAILED");
}

async function generateProspect(sql, env, master, row) {
  const jobId = await claimPack(sql, row);
  if (!jobId) return {ok:false,code:row.prospect_code,error:"CLAIMED_ELSEWHERE"};

  try {
    const firstPartyImages = await discoverFirstPartyImages(row.website_url);
    const payload = prospectPayload(row, firstPartyImages);
    const pack = await generatePackSingleCall(env, master, payload);
    await persistGeneratedPack(sql, row, jobId, pack.htmlByKey, pack.directions);
    return {ok:true,code:row.prospect_code,pack_id:row.render_pack_id,version:row.version};
  } catch (error) {
    await failGeneration(sql, row, jobId, error);
    return {ok:false,code:row.prospect_code,error:String(error?.message || error)};
  }
}

async function renderPack(sql, env, row) {
  const claim = await sql`update render_packs set status='RENDERING_ASSETS'
    where id=${row.render_pack_id}::uuid and status='RENDERING'
    returning id`;
  if (!claim.length) return {ok:false,pack_id:row.render_pack_id,error:"CLAIMED_ELSEWHERE"};

  const attempts=await sql`select coalesce(max(attempt),0)+1 as attempt
    from render_jobs where prospect_id=${row.prospect_id}::uuid and worker='cloudflare-browser-renderer'`;
  const browserAttempt=Number(attempts[0]?.attempt || 1);
  const browserJobs=await sql`insert into render_jobs(
      prospect_id,status,attempt,worker,input_data,started_at
    ) values(
      ${row.prospect_id}::uuid,'RUNNING',${browserAttempt},'cloudflare-browser-renderer',
      ${JSON.stringify({render_pack_id:row.render_pack_id,version:row.version})}::jsonb,now()
    ) returning id`;
  const browserJobId=browserJobs[0].id;

  if (!env.BROWSER) {
    await sql`update render_jobs set status='FAILED',error='BROWSER_BINDING_NOT_CONFIGURED',completed_at=now(),updated_at=now()
      where id=${browserJobId}::uuid`;
    await sql`update render_packs set status='RENDERING' where id=${row.render_pack_id}::uuid and status='RENDERING_ASSETS'`;
    return {ok:false,pack_id:row.render_pack_id,error:"BROWSER_BINDING_NOT_CONFIGURED"};
  }

  const rows = await sql`select s.*,rv.id as variant_id
    from render_staging_payloads s
    join render_variants rv on rv.render_pack_id=s.render_pack_id and rv.variant_key=s.variant_key
    where s.render_pack_id=${row.render_pack_id}::uuid
      and s.html_source is not null
    order by s.variant_key asc`;
  if (rows.length !== 3) {
    await sql`update render_packs set status='RENDERING' where id=${row.render_pack_id}::uuid and status='RENDERING_ASSETS'`;
    return {ok:false,pack_id:row.render_pack_id,error:"THREE_STAGED_VARIANTS_REQUIRED"};
  }

  const browser = await puppeteer.launch(env.BROWSER);
  try {
    for (const item of rows) {
      const [desktop,mobile] = await Promise.all([
        renderHtml(browser,item.html_source,1440,900),
        renderHtml(browser,item.html_source,390,844)
      ]);
      const desktopB64=bytesToBase64(desktop);
      const mobileB64=bytesToBase64(mobile);
      const base="https://"+ADMIN_HOST+"/ops/render-assets/"+item.variant_id;

      await sql`update render_staging_payloads set
          status='RENDERED',
          desktop_image_base64=${desktopB64},
          mobile_image_base64=${mobileB64},
          image_mime='image/jpeg',
          render_error=null,
          rendered_at=now(),
          updated_at=now()
        where id=${item.id}::uuid`;

      await sql`update render_variants set
          status='RENDER_READY',
          desktop_render_url=${base+"/desktop"},
          mobile_render_url=${base+"/mobile"},
          updated_at=now()
        where id=${item.variant_id}::uuid`;
    }
  } catch (error) {
    const message = String(error?.message || error || "BROWSER_RENDER_FAILED").slice(0, 600);
    await sql`update render_jobs set status='FAILED',error=${message},completed_at=now(),updated_at=now()
      where id=${browserJobId}::uuid`;
    await sql`update render_packs set status='RENDERING' where id=${row.render_pack_id}::uuid and status='RENDERING_ASSETS'`;
    await sql`update prospects set current_step='RENDERING_ASSETS',next_action='RETRY_BROWSER_RENDER',error=${message},updated_at=now()
      where id=${row.prospect_id}::uuid`;
    return {ok:false,pack_id:row.render_pack_id,error:message};
  } finally {
    await browser.close();
  }

  const complete = await sql`select count(*)::int as n
    from render_variants
    where render_pack_id=${row.render_pack_id}::uuid
      and variant_key in ('A','B','C')
      and desktop_render_url is not null
      and mobile_render_url is not null
      and status='RENDER_READY'`;
  if (Number(complete[0]?.n || 0) !== 3) {
    await sql`update render_jobs set status='FAILED',error='RENDER_COMPLETION_CHECK_FAILED',completed_at=now(),updated_at=now()
      where id=${browserJobId}::uuid`;
    await sql`update render_packs set status='RENDERING' where id=${row.render_pack_id}::uuid and status='RENDERING_ASSETS'`;
    return {ok:false,pack_id:row.render_pack_id,error:"RENDER_COMPLETION_CHECK_FAILED"};
  }

  await sql`update render_jobs set status='COMPLETED',output_data=${JSON.stringify({variants:["A","B","C"],desktop_mobile:true})}::jsonb,
      error=null,completed_at=now(),updated_at=now()
    where id=${browserJobId}::uuid`;

  await sql`update render_packs set status='RENDER_READY',approved_reference=false,approved_at=null
    where id=${row.render_pack_id}::uuid`;
  await sql`update prospects set
      pipeline_status='RENDERING'::pipeline_status,
      render_status='RENDER_READY',
      current_step='AWAITING_RENDER_SELECTION',
      next_action='SELECT_RENDER_IN_GESTIONALE',
      error=null,
      updated_at=now()
    where id=${row.prospect_id}::uuid`;
  await sql`insert into site_events(prospect_id,event_type,entity_type,entity_id,actor,from_status,to_status,payload)
    values(
      ${row.prospect_id}::uuid,'CLOUDFLARE_RENDER_READY','render_pack',${row.render_pack_id}::uuid,
      'cloudflare-render-engine','RENDERING'::pipeline_status,'RENDERING'::pipeline_status,
      ${JSON.stringify({version:row.version,variants:["A","B","C"],model:MODEL,selection_required:true})}::jsonb
    )`;

  return {ok:true,pack_id:row.render_pack_id,prospect_id:row.prospect_id,version:row.version};
}

async function renderCandidates(sql, limit) {
  return sql`select rp.id as render_pack_id,rp.version,p.id as prospect_id,p.business_name
    from render_packs rp
    join prospects p on p.id=rp.prospect_id
    where rp.approved_reference=false
      and rp.status='RENDERING'
      and (select count(*) from render_staging_payloads s
           where s.render_pack_id=rp.id and s.status in ('STAGED_SOURCE','RENDER_ERROR','RENDERED')
             and s.html_source is not null)=3
      and (select count(*) from render_variants rv
           where rv.render_pack_id=rp.id and rv.desktop_render_url is not null and rv.mobile_render_url is not null)<3
    order by
      case coalesce(p.legacy_ids->>'id_prospect',p.source_data->>'id_prospect')
        when 'CZ-063' then 1
        when 'CZ-209' then 2
        when 'CZ-031' then 3
        when 'CZ-210' then 4
        else 1000 + coalesce(p.rank,999)
      end
    limit ${Math.max(1,Math.min(Number(limit || 1),3))}`;
}

export async function runCloudflareRenderEngine(env) {
  if (!env.AI) return {ok:false,error:"AI_BINDING_NOT_CONFIGURED"};
  const sql=db(env);

  await recoverStaleClaims(sql);
  await ensureActivePacks(sql);

  const readyToRender=await renderCandidates(sql,MAX_RENDER_PACKS_PER_TICK);
  const rendered=[];
  for (const row of readyToRender) {
    rendered.push(await renderPack(sql,env,row));
  }

  const activeRows=await sql`select count(*)::int as n from render_jobs
    where worker='cloudflare-workers-ai' and status='RUNNING'
      and started_at >= now()-interval '6 minutes'`;
  const active=Number(activeRows[0]?.n || 0);
  const slots=Math.max(0,MAX_PROSPECTS_PER_TICK-active);

  let generated=[];
  if (slots>0) {
    const selected=await candidates(sql,slots);
    if (selected.length) {
      const master=await loadFrozenMaster();
      generated=await Promise.all(selected.map(row=>generateProspect(sql,env,master,row)));
    }
  }

  return {
    ok:true,
    active_generation_jobs:active,
    generation_slots:slots,
    generated_count:generated.filter(x=>x.ok).length,
    render_ready_count:rendered.filter(x=>x.ok).length,
    generated,
    rendered
  };
}
