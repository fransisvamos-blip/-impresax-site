import { neon } from "@neondatabase/serverless";
import puppeteer from "@cloudflare/puppeteer";
import { generateRenderVariants } from "./rendering-studio.js";

const MODEL = "@cf/zai-org/glm-4.7-flash";
const VISUAL_QA_MODEL = "@cf/qwen/qwen3.8-27b";
const MAX_VISUAL_REWORK_CYCLES = 5;
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

function extractJsonObject(value) {
  let text = String(value || "").trim()
    .replace(/^\`\`\`(?:json)?\s*/i, "")
    .replace(/\s*\`\`\`$/i, "");
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("VISUAL_QA_JSON_REQUIRED");
  return JSON.parse(text.slice(first, last + 1));
}

function normalizeVisualQa(result) {
  const issues = Array.isArray(result?.issues) ? result.issues.map(x => String(x).slice(0, 300)).slice(0, 20) : [];
  const instructions = Array.isArray(result?.rework_instructions)
    ? result.rework_instructions.map(x => String(x).slice(0, 500)).slice(0, 20)
    : [];
  const scores = result?.scores && typeof result.scores === "object" ? result.scores : {};
  const criticalScores = [
    "art_direction",
    "prospect_specificity",
    "brand_fidelity",
    "typography",
    "imagery",
    "desktop_quality",
    "mobile_quality",
    "no_template_feel",
    "truth_integrity"
  ];
  const scoreFailure = criticalScores.some(k => Number.isFinite(Number(scores[k])) && Number(scores[k]) < 8);
  return {
    pass: result?.pass === true && issues.length === 0 && !scoreFailure,
    issues: scoreFailure && issues.length === 0 ? ["VISIBLE_QUALITY_BELOW_FROZEN_BAR"] : issues,
    rework_instructions: instructions,
    scores,
    summary: String(result?.summary || "").slice(0, 1200),
    model: VISUAL_QA_MODEL,
    checked_at: new Date().toISOString()
  };
}

async function critiqueVisibleRender(env, master, prospect, variantKey, direction, desktopB64, mobileB64) {
  const prompt = [
    "You are the independent VISUAL CRITIQUE gate for ImpresaX Rendering Studio.",
    "Judge the ACTUAL visible desktop and mobile screenshots, not metadata and not intentions.",
    "The frozen master is binding. LoveFrom / Ferrari Luce is only a quality benchmark: originality, precision, restraint, material sensitivity, premium art direction.",
    "FAIL if the result feels like a generic local-business template, SaaS/agency template, repeated card grid, weak typography, cheap/irrelevant imagery, obvious AI imagery, generic sector design, or if mobile is merely a shrunken desktop.",
    "FAIL if the design is not clearly specific to this prospect and its verified brand DNA.",
    "FAIL if logo integration, hierarchy, spacing, rhythm, image direction, footer, CTA integration, desktop quality or mobile quality is visibly weak.",
    "FAIL on any visible unverified/fake claim risk.",
    "Do not reward a page merely because it is complete or functional.",
    "Return ONLY strict JSON:",
    '{"pass":true|false,"summary":"...","issues":["..."],"rework_instructions":["..."],"scores":{"art_direction":0,"prospect_specificity":0,"brand_fidelity":0,"typography":0,"imagery":0,"desktop_quality":0,"mobile_quality":0,"no_template_feel":0,"truth_integrity":0}}',
    "A pass requires every visible dimension to meet a flagship-level bar. Be demanding.",
    "",
    "VARIANT: " + variantKey,
    "CREATIVE DIRECTION:",
    JSON.stringify(direction || {}),
    "",
    "VERIFIED PROSPECT:",
    JSON.stringify(prospect),
    "",
    "FROZEN MASTER:",
    master.slice(0, 30000),
    "",
    "IMAGE 1 = desktop 1440 full homepage. IMAGE 2 = mobile 390 full homepage."
  ].join("\n");

  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const out = await env.AI.run(VISUAL_QA_MODEL, {
        messages: [
          {
            role: "system",
            content: "You are a strict senior visual design reviewer. Output valid JSON only. Never pass mediocre work."
          },
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: "data:image/jpeg;base64," + desktopB64 } },
              { type: "image_url", image_url: { url: "data:image/jpeg;base64," + mobileB64 } }
            ]
          }
        ],
        max_completion_tokens: 1800,
        temperature: 0.15,
        reasoning_effort: "xhigh"
      });
      return normalizeVisualQa(extractJsonObject(extractModelText(out)));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("VISUAL_QA_FAILED_TO_RUN");
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

function attrValue(tag, name) {
  const source = String(tag || "");
  const lower = source.toLowerCase();
  const needle = String(name || "").toLowerCase();
  let pos = lower.indexOf(needle);
  while (pos >= 0) {
    const before = pos === 0 ? " " : lower[pos - 1];
    const afterName = lower[pos + needle.length] || "";
    if (!/[a-z0-9_:-]/i.test(before) && !/[a-z0-9_:-]/i.test(afterName)) {
      const tail = source.slice(pos + needle.length);
      const eq = tail.indexOf("=");
      if (eq >= 0 && !tail.slice(0,eq).trim()) {
        const valuePart = tail.slice(eq + 1).trimStart();
        const quote = valuePart[0];
        if (quote === '"' || quote === "'") {
          const end = valuePart.indexOf(quote,1);
          if (end > 1) return valuePart.slice(1,end).trim();
        } else {
          const end = valuePart.search(/[\s>]/);
          return (end >= 0 ? valuePart.slice(0,end) : valuePart).trim();
        }
      }
    }
    pos = lower.indexOf(needle,pos + needle.length);
  }
  return "";
}

function visibleTextFromHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18000);
}

function expectedBrandTokens(row) {
  const explicit = String(row?.logo?.brand || "").trim();
  const base = explicit || String(row?.business_name || "");
  const stop = new Set(["srl","srls","spa","sas","societa","responsabilita","limitata","costruzioni","costruzione","studio","legale","avv","avvocato","catanzaro","services","service"]);
  return base
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g," ")
    .split(/\s+/)
    .filter(x => x.length >= 3 && !stop.has(x))
    .slice(0,6);
}

async function discoverOfficialBrandEvidence(websiteUrl, row = null) {
  if (!websiteUrl) return null;
  try {
    const res = await fetch(websiteUrl, {
      redirect:"follow",
      headers:{ "User-Agent":"ImpresaX-RenderingStudio-BrandGate/1.0" }
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 700000);
    const base = new URL(res.url || websiteUrl);
    const logoCandidates = [];
    const expectedTokens = expectedBrandTokens(row);

    for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
      const tag = m[0];
      const src = attrValue(tag,"src") || attrValue(tag,"data-src") || attrValue(tag,"data-lazy-src");
      if (!src || src.startsWith("data:") || src.startsWith("blob:")) continue;
      let url;
      try { url = new URL(src, base); } catch { continue; }
      if (url.protocol !== "https:") continue;

      const signal = [
        src,
        attrValue(tag,"alt"),
        attrValue(tag,"class"),
        attrValue(tag,"id"),
        attrValue(tag,"title")
      ].join(" ").toLowerCase();

      let score = 0;
      const logoSignal = /\blogo\b|site-logo|custom-logo|brand-logo|navbar-brand/.test(signal);
      if (logoSignal) score += 10;
      if (/header/.test(signal)) score += 2;
      if (/footer/.test(signal)) score -= 1;
      if (/icon|favicon|avatar|testimonial|partner|client/.test(signal)) score -= 5;
      if (/\.(svg|png|webp)(?:[?#]|$)/i.test(url.pathname)) score += 1;
      if (url.hostname === base.hostname || url.hostname.endsWith("." + base.hostname.replace(/^www\./,""))) score += 2;

      const normalizedSignal = signal
        .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
        .replace(/[^a-z0-9]+/g," ");
      const brandMatch = expectedTokens.length === 0 ||
        expectedTokens.some(token => normalizedSignal.includes(token));
      if (expectedTokens.length && brandMatch) score += 15;
      if (expectedTokens.length && !brandMatch) score -= 30;

      logoCandidates.push({
        url:url.href,
        score,
        signal:signal.slice(0,400),
        brand_match:brandMatch,
        expected_tokens:expectedTokens
      });
    }

    logoCandidates.sort((a,b) => b.score-a.score);
    const bestLogo = logoCandidates.find(x => x.score >= 10) || null;

    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "")
      .replace(/<[^>]+>/g," ")
      .trim();

    const description =
      attrValue(html.match(/<meta[^>]+name=[\\"']description[\\"'][^>]*>/i)?.[0] || "","content") ||
      attrValue(html.match(/<meta[^>]+property=[\\"']og:description[\\"'][^>]*>/i)?.[0] || "","content");

    const colors = [...html.matchAll(/#[0-9a-f]{6}\b/gi)].map(x=>x[0].toUpperCase());
    const colorCounts = {};
    for (const color of colors) colorCounts[color]=(colorCounts[color]||0)+1;
    const topColors = Object.entries(colorCounts)
      .sort((a,b)=>b[1]-a[1])
      .slice(0,10)
      .map(([color,count])=>({color,count}));

    return {
      official_url: base.href,
      official_host: base.hostname,
      title,
      description: String(description || "").slice(0,1200),
      visible_text: visibleTextFromHtml(html),
      logo_candidate: bestLogo,
      top_colors: topColors
    };
  } catch {
    return null;
  }
}

function evidenceBrandDna(row, evidence) {
  const source = row.source_data || {};
  const colors = Array.isArray(evidence?.top_colors) ? evidence.top_colors.map(x=>x.color).filter(Boolean).slice(0,6) : [];
  const siteSummary = [evidence?.title,evidence?.description].filter(Boolean).join(" — ").slice(0,1600);
  const services = safeText(source.verified_services,3000);
  const trust = safeText(source.verified_trust,3000);
  const contacts = safeText(source.verified_contacts,2000);
  const address = safeText(source.address,1000);
  const locality = [row.city,row.country,address].filter(Boolean).join(" · ");
  const logoSignal = evidence?.logo_candidate?.url || row.logo?.url || row.logo?.official_source || null;

  return {
    business_identity: [row.business_name, row.vertical].filter(Boolean).join(" · "),
    offer: services,
    local_context: locality,
    trust_signals: trust,
    commercial_path: contacts,
    first_party_site_language: siteSummary || "No first-party site copy available; use verified business data only.",
    existing_colors: colors,
    official_identity_asset: logoSignal || "No official graphic logo verified; use verified business name as text only when explicitly permitted.",
    visual_cues: [
      colors.length ? "Preserve first-party color evidence: " + colors.join(", ") : null,
      evidence?.logo_candidate?.signal ? "Logo context: " + evidence.logo_candidate.signal : null,
      evidence?.description ? "Site positioning cue: " + evidence.description.slice(0,500) : null
    ].filter(Boolean),
    imagery_cues: evidence?.visible_text
      ? "Derive imagery from the real offering described by the official site; never invent staff, facilities or completed projects."
      : "Use only verified/category imagery tied directly to the verified offering.",
    tone: evidence?.description || services || row.business_name,
    business_positioning: [row.business_name,services,trust].filter(Boolean).join(" — ").slice(0,3000),
    commercial_behavior: contacts ? "Direct verified contact path: " + contacts : "Use only verified contact paths.",
    visual_signature: [
      row.business_name,
      colors.length ? colors.slice(0,3).join("/") : null,
      services ? services.slice(0,240) : null,
      locality
    ].filter(Boolean).join(" · ")
  };
}

function validBrandDna(value) {
  if (!value || typeof value !== "object") return false;
  const meaningful = Object.entries(value).filter(([,v]) => {
    if (Array.isArray(v)) return v.length > 0;
    if (v && typeof v === "object") return Object.keys(v).length > 0;
    return String(v || "").trim().length > 2;
  });
  return meaningful.length >= 8;
}

async function deriveBrandDna(env, row, evidence) {
  const source = row.source_data || {};
  const prompt = [
    "You are the Brand Gate analyst for ImpresaX Rendering Studio.",
    "Extract REAL Brand DNA from the verified company data and first-party website evidence below.",
    "Do not invent facts. Strategic/visual interpretation is allowed only when grounded in the supplied evidence.",
    "Return ONLY valid JSON with these keys:",
    "brand_personality, visual_cues, tone, audience, offer, local_context, trust_signals, existing_colors, typography_cues, imagery_cues, business_positioning, commercial_behavior, visual_signature.",
    "Every field must be meaningful and prospect-specific; no generic sector filler.",
    "",
    "BUSINESS:", row.business_name,
    "VERTICAL:", row.vertical || "",
    "CITY:", row.city || "",
    "CURRENT LOGO RECORD:", JSON.stringify(row.logo || {}),
    "VERIFIED SERVICES:", safeText(source.verified_services,3000),
    "VERIFIED CONTACTS:", safeText(source.verified_contacts,2000),
    "VERIFIED TRUST:", safeText(source.verified_trust,3000),
    "SOURCE REFERENCES:", JSON.stringify(source.source_references || []),
    "FIRST-PARTY WEBSITE EVIDENCE:", JSON.stringify(evidence || {})
  ].join("\n");

  try {
    const out = await env.AI.run(MODEL, {
      messages:[
        {role:"system",content:"You are a strict brand researcher. Output valid JSON only. Never invent company facts."},
        {role:"user",content:prompt}
      ],
      max_tokens:2200,
      temperature:0.2,
      top_p:0.9
    });
    const parsed = extractJsonObject(extractModelText(out));
    if (validBrandDna(parsed)) return parsed;
  } catch {}

  const fallback = evidenceBrandDna(row,evidence);
  if (!validBrandDna(fallback)) throw new Error("BRAND_DNA_TOO_THIN");
  return fallback;
}

async function attemptAutomaticBrandGate(sql, env, row) {
  const originalLogo = row.logo || {};
  const status = String(originalLogo.status || "").toUpperCase();
  let evidence = await discoverOfficialBrandEvidence(row.website_url,row);
  if (!evidence?.logo_candidate && originalLogo.store_page) {
    const storeEvidence = await discoverOfficialBrandEvidence(originalLogo.store_page,row);
    if (storeEvidence?.logo_candidate) evidence = storeEvidence;
  }
  if (!evidence?.logo_candidate && originalLogo.source_url) {
    const sourceEvidence = await discoverOfficialBrandEvidence(originalLogo.source_url,row);
    if (sourceEvidence?.logo_candidate) evidence = sourceEvidence;
  }

  let logo = originalLogo;
  const alreadyExact =
    (status === "PASS" || status === "OFFICIAL_LOGO_LOCKED") &&
    typeof (originalLogo.url || originalLogo.official_source) === "string";
  const verifiedNoLogo = status === "NO_OFFICIAL_LOGO_CONFIRMED";

  if (!alreadyExact && !verifiedNoLogo && evidence?.logo_candidate?.url) {
    logo = {
      status:"OFFICIAL_LOGO_LOCKED",
      url:evidence.logo_candidate.url,
      source:"OFFICIAL_PRIMARY_DOMAIN",
      source_url:evidence.official_url,
      source_host:evidence.official_host,
      generated:false,
      lock:"IMMUTABLE",
      verification:"FIRST_PARTY_HTML_LOGO_SIGNAL"
    };
  }

  let brandDna = row.brand_dna || {};
  const meaningfulDna = Object.entries(brandDna).filter(([,v]) => {
    if (Array.isArray(v)) return v.length > 0;
    if (v && typeof v === "object") return Object.keys(v).length > 0;
    return String(v || "").trim().length > 2;
  });
  if (meaningfulDna.length < 4) {
    try {
      brandDna = await deriveBrandDna(env,row,evidence);
    } catch {}
  }

  await sql`update prospects set
      logo=${JSON.stringify(logo)}::jsonb,
      brand_dna=${JSON.stringify(brandDna)}::jsonb,
      updated_at=now()
    where id=${row.prospect_id}::uuid`;
  await sql`update render_packs set
      official_logo=${JSON.stringify(logo)}::jsonb,
      brand_dna=${JSON.stringify(brandDna)}::jsonb,
      content_map=coalesce(content_map,'{}'::jsonb) ||
        ${JSON.stringify({
          brand_gate_auto_attempted:true,
          brand_gate_source:"OFFICIAL_FIRST_PARTY_DOMAIN"
        })}::jsonb
    where id=${row.render_pack_id}::uuid and approved_reference=false`;

  return {...row,logo,brand_dna:brandDna};
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

function evaluateBrandGate(row) {
  const logo = row?.logo || {};
  const status = String(logo.status || "").toUpperCase();
  const exactLogoLocked =
    (status === "PASS" || status === "OFFICIAL_LOGO_LOCKED") &&
    typeof (logo.url || logo.official_source) === "string";
  const verifiedNoLogo =
    status === "NO_OFFICIAL_LOGO_CONFIRMED" &&
    (logo.generated === false || logo.use_verified_name_as_text === true);
  const dna = row?.brand_dna && typeof row.brand_dna === "object" ? row.brand_dna : {};
  const meaningfulDna = Object.entries(dna).filter(([,v]) => {
    if (Array.isArray(v)) return v.length > 0;
    if (v && typeof v === "object") return Object.keys(v).length > 0;
    return String(v || "").trim().length > 2;
  });
  const source = row?.source_data || {};
  const refs = Array.isArray(source.source_references) ? source.source_references.filter(Boolean) : [];
  const issues = [];
  if (!exactLogoLocked && !verifiedNoLogo) issues.push("OFFICIAL_LOGO_NOT_LOCKED_OR_NO_LOGO_NOT_VERIFIED");
  if (meaningfulDna.length < 4) issues.push("BRAND_DNA_INCOMPLETE");
  if (!source.verified_services) issues.push("VERIFIED_SERVICES_MISSING");
  if (!source.verified_contacts) issues.push("VERIFIED_CONTACTS_MISSING");
  if (!refs.length) issues.push("SOURCE_REFERENCES_MISSING");
  return { pass: issues.length === 0, issues };
}

async function holdBrandGate(sql, row, issues) {
  await sql`update render_packs set status='BRAND_GATE_HOLD'
    where id=${row.render_pack_id}::uuid and approved_reference=false`;
  await sql`update prospects set
      pipeline_status='RENDER_REWORK'::pipeline_status,
      render_status='BRAND_GATE_HOLD',
      current_step='BRAND_GATE_HOLD',
      next_action='COMPLETE_BRAND_GATE_BEFORE_ART_DIRECTION',
      error=${issues.join(",")},
      updated_at=now()
    where id=${row.prospect_id}::uuid`;
  await sql`insert into site_events(prospect_id,event_type,entity_type,entity_id,actor,from_status,to_status,payload)
    values(
      ${row.prospect_id}::uuid,'BRAND_GATE_BLOCKED','render_pack',${row.render_pack_id}::uuid,
      'rendering-studio-brand-gate','RENDER_REWORK'::pipeline_status,'RENDER_REWORK'::pipeline_status,
      ${JSON.stringify({issues,rule:"NO_ART_DIRECTION_BEFORE_BRAND_GATE"})}::jsonb
    )`;
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
      and status in ('RUNNING','COMPLETING')
      and started_at < now()-interval '6 minutes'`;

  await sql`update render_packs rp
    set status='ART_DIRECTION'
    where rp.approved_reference=false
      and rp.status='AI_RENDERING'
      and not exists (
        select 1 from render_jobs rj
        where rj.worker='cloudflare-workers-ai'
          and rj.status in ('RUNNING','COMPLETING')
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

async function reconcileNativeRenderQueue(sql) {
  const rows = await sql`update orchestrator_queue q
    set status='CANCELLED',
        locked_at=null,
        heartbeat_at=null,
        locked_by=null,
        error='SUPERSEDED_BY_CLOUDFLARE_NATIVE_RENDER_ENGINE',
        updated_at=now()
    where q.task_type='RENDER'
      and q.status in ('QUEUED','RUNNING')
    returning q.id`;
  return rows.length;
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
    where p.pipeline_status in ('READY_FOR_RENDERING'::pipeline_status,'RENDERING'::pipeline_status,'RENDER_REWORK'::pipeline_status)
      and rp.status in ('ART_DIRECTION','BRAND_GATE_HOLD')
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
      and pipeline_status in ('READY_FOR_RENDERING'::pipeline_status,'RENDERING'::pipeline_status,'RENDER_REWORK'::pipeline_status)`;

  return job[0].id;
}

async function persistGeneratedPack(sql, row, jobId, htmlByKey, directions) {
  const gate=await sql`update render_jobs
    set status='COMPLETING',updated_at=now()
    where id=${jobId}::uuid and worker='cloudflare-workers-ai' and status='RUNNING'
    returning id`;
  if (!gate.length) return false;

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
        ${JSON.stringify({
          source:"RENDERING_STUDIO_V1_FROZEN",
          execution_engine:"CLOUDFLARE_NATIVE",
          rendering_studio_contract:"V7_AUTO_BRAND_GATE_VISUAL_QA",
          art_direction_model:"@cf/openai/gpt-oss-120b",
          html_model:"@cf/zai-org/glm-4.7-flash",
          visual_qa_model:VISUAL_QA_MODEL,
          direction:directions[key] || {}
        })}::jsonb,
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
  await sql`update render_jobs set status='COMPLETED',output_data=${JSON.stringify({
        variants:["A","B","C"],
        department:"RENDERING_STUDIO",
        contract:"V7_AUTO_BRAND_GATE_VISUAL_QA",
        art_direction_model:"@cf/openai/gpt-oss-120b",
        html_model:"@cf/zai-org/glm-4.7-flash",
        visual_qa_model:VISUAL_QA_MODEL
      })}::jsonb,
      error=null,completed_at=now(),updated_at=now()
    where id=${jobId}::uuid`;
  await sql`update prospects set current_step='RENDERING_ASSETS',next_action='AUTO_RENDER_DESKTOP_MOBILE',error=null,updated_at=now()
    where id=${row.prospect_id}::uuid`;
  return true;
}

async function failGeneration(sql,row,jobId,error) {
  const message=String(error?.message || error || "AI_RENDER_FAILED").slice(0,600);
  const failed=await sql`update render_jobs set status='FAILED',error=${message},completed_at=now(),updated_at=now()
    where id=${jobId}::uuid and worker='cloudflare-workers-ai' and status in ('RUNNING','COMPLETING')
    returning id`;
  if (!failed.length) return;

  const active=await sql`select count(*)::int as n from render_jobs
    where worker='cloudflare-workers-ai'
      and status in ('RUNNING','COMPLETING')
      and id<>${jobId}::uuid
      and input_data->>'render_pack_id'=${row.render_pack_id}`;
  if (Number(active[0]?.n || 0)===0) {
    const reset=await sql`update render_packs set status='ART_DIRECTION'
      where id=${row.render_pack_id}::uuid and status='AI_RENDERING'
      returning id`;
    if (reset.length) {
      await sql`update prospects set
          render_status='RENDERING',
          current_step='ART_DIRECTION',
          next_action='RETRY_AI_RENDER',
          error=${message},
          updated_at=now()
        where id=${row.prospect_id}::uuid
          and pipeline_status='RENDERING'::pipeline_status
          and render_status<>'RENDER_READY'`;
    }
  }
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
  let workingRow = row;
  let brandGate = evaluateBrandGate(workingRow);
  if (!brandGate.pass) {
    workingRow = await attemptAutomaticBrandGate(sql,env,workingRow);
    brandGate = evaluateBrandGate(workingRow);
  }
  if (!brandGate.pass) {
    await holdBrandGate(sql,workingRow,brandGate.issues);
    return {ok:false,code:workingRow.prospect_code,error:"BRAND_GATE_BLOCKED",issues:brandGate.issues};
  }

  if (workingRow.pack_status === "BRAND_GATE_HOLD") {
    const reopened = await sql`update render_packs set status='ART_DIRECTION'
      where id=${workingRow.render_pack_id}::uuid
        and status='BRAND_GATE_HOLD'
        and approved_reference=false
      returning id`;
    if (!reopened.length) return {ok:false,code:workingRow.prospect_code,error:"BRAND_GATE_REOPEN_RACE"};
    workingRow = {...workingRow,pack_status:"ART_DIRECTION"};
    await sql`update prospects set
        render_status='RENDER_REWORK',
        current_step='ART_DIRECTION',
        next_action='AUTO_RENDER_A_B_C',
        error=null,
        updated_at=now()
      where id=${workingRow.prospect_id}::uuid`;
  }

  row = workingRow;
  const jobId = await claimPack(sql, row);
  if (!jobId) return {ok:false,code:row.prospect_code,error:"CLAIMED_ELSEWHERE"};

  try {
    const firstPartyImages = await discoverFirstPartyImages(row.website_url);
    const payload = prospectPayload(row, firstPartyImages);
    const feedbackRows = await sql`select variant_key, design_notes->'visual_qa' as visual_qa
      from render_staging_payloads
      where render_pack_id=${row.render_pack_id}::uuid
        and design_notes ? 'visual_qa'
      order by variant_key`;
    const studioProspect = {
      code: payload.code,
      businessName: payload.business_name,
      business_name: payload.business_name,
      vertical: payload.vertical,
      city: payload.city,
      country: payload.country,
      websiteUrl: payload.website_url,
      website_url: payload.website_url,
      logo: payload.official_logo,
      brandDna: payload.brand_dna,
      brand_dna: payload.brand_dna,
      verifiedServices: payload.verified_services,
      verified_services: payload.verified_services,
      verifiedContacts: payload.verified_contacts,
      verified_contacts: payload.verified_contacts,
      verifiedTrust: payload.verified_trust,
      verified_trust: payload.verified_trust,
      address: payload.address,
      primaryDigitalGap: payload.primary_digital_gap,
      primaryMarketingGap: payload.primary_marketing_gap,
      commercialGoal: payload.commercial_goal,
      primaryCta: payload.primary_cta,
      secondaryCta: payload.secondary_cta,
      sourceReferences: payload.source_references,
      firstPartyImages: payload.first_party_images,
      visualReworkFeedback: feedbackRows.map(x => ({variant:x.variant_key, critique:x.visual_qa}))
    };
    const studio = await generateRenderVariants(env, studioProspect);
    const htmlByKey = {};
    const directions = {};
    for (const variant of studio.variants || []) {
      htmlByKey[variant.key] = variant.html;
      directions[variant.key] = variant.direction;
    }
    if (!htmlByKey.A || !htmlByKey.B || !htmlByKey.C) throw new Error("RENDERING_STUDIO_THREE_VARIANTS_REQUIRED");
    const persisted=await persistGeneratedPack(sql,row,jobId,htmlByKey,directions);
    if (!persisted) return {ok:false,code:row.prospect_code,error:"STALE_GENERATION_DISCARDED"};
    return {ok:true,code:row.prospect_code,pack_id:row.render_pack_id,version:row.version,studio:"RENDERING_STUDIO_V1_FROZEN"};
  } catch (error) {
    await failGeneration(sql, row, jobId, error);
    return {ok:false,code:row.prospect_code,error:String(error?.message || error)};
  }
}

async function renderPack(sql, env, row, sharedBrowser = null, master = "") {
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
  const prospectRows = await sql`select
      p.business_name,p.vertical,p.city,p.country,p.website_url,p.logo,p.brand_dna,p.source_data,
      coalesce(p.legacy_ids->>'id_prospect',p.source_data->>'id_prospect') as prospect_code
    from prospects p where p.id=${row.prospect_id}::uuid limit 1`;
  if (!prospectRows.length) throw new Error("VISUAL_QA_PROSPECT_REQUIRED");
  const visualQaProspect = prospectPayload(prospectRows[0], []);
  if (rows.length !== 3) {
    await sql`update render_packs set status='RENDERING' where id=${row.render_pack_id}::uuid and status='RENDERING_ASSETS'`;
    return {ok:false,pack_id:row.render_pack_id,error:"THREE_STAGED_VARIANTS_REQUIRED"};
  }

  const browser = sharedBrowser || await puppeteer.launch(env.BROWSER);
  const visualQa = [];
  try {
    for (const item of rows) {
      const [desktop,mobile] = await Promise.all([
        renderHtml(browser,item.html_source,1440,900),
        renderHtml(browser,item.html_source,390,844)
      ]);
      const desktopB64=bytesToBase64(desktop);
      const mobileB64=bytesToBase64(mobile);

      await sql`update render_staging_payloads set
          status='VISUAL_QA_PENDING',
          desktop_image_base64=${desktopB64},
          mobile_image_base64=${mobileB64},
          image_mime='image/jpeg',
          render_error=null,
          rendered_at=now(),
          updated_at=now()
        where id=${item.id}::uuid`;

      await sql`update render_variants set
          status='VISUAL_QA_PENDING',
          desktop_render_url=null,
          mobile_render_url=null,
          updated_at=now()
        where id=${item.variant_id}::uuid`;

      const qa = await critiqueVisibleRender(
        env,
        master,
        visualQaProspect,
        item.variant_key,
        item.design_notes?.direction || {},
        desktopB64,
        mobileB64
      );
      visualQa.push({ variant_key:item.variant_key, variant_id:item.variant_id, staging_id:item.id, qa });

      await sql`update render_staging_payloads set
          status=${qa.pass ? "VISUAL_QA_PASS" : "VISUAL_QA_FAILED"},
          design_notes=coalesce(design_notes,'{}'::jsonb) || ${JSON.stringify({visual_qa:qa})}::jsonb,
          updated_at=now()
        where id=${item.id}::uuid`;

      await sql`update render_variants set
          status=${qa.pass ? "VISUAL_QA_PASS" : "VISUAL_QA_FAILED"},
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
    if (!sharedBrowser) await browser.close();
  }

  const failedVisualQa = visualQa.filter(x => !x.qa.pass);
  if (visualQa.length !== 3 || failedVisualQa.length) {
    const cycleRows = await sql`select coalesce((content_map->>'visual_rework_cycle')::int,0)+1 as cycle
      from render_packs where id=${row.render_pack_id}::uuid`;
    const cycle = Number(cycleRows[0]?.cycle || 1);
    const escalation = cycle >= MAX_VISUAL_REWORK_CYCLES;
    const qaSummary = visualQa.map(x => ({variant:x.variant_key, ...x.qa}));

    await sql`update render_packs set
        status=${escalation ? "ESCALATION_REQUIRED" : "ART_DIRECTION"},
        content_map=coalesce(content_map,'{}'::jsonb) ||
          ${JSON.stringify({visual_rework_cycle:cycle,visual_qa_last_run:qaSummary})}::jsonb
      where id=${row.render_pack_id}::uuid and approved_reference=false`;

    await sql`update render_jobs set
        status='COMPLETED',
        output_data=${JSON.stringify({variants:["A","B","C"],desktop_mobile:true,visual_qa_pass:false,visual_rework_cycle:cycle})}::jsonb,
        error=null,completed_at=now(),updated_at=now()
      where id=${browserJobId}::uuid`;

    await sql`update prospects set
        pipeline_status=${escalation ? "RENDERING" : "RENDER_REWORK"}::pipeline_status,
        render_status=${escalation ? "ESCALATION_REQUIRED" : "RENDER_REWORK"},
        current_step=${escalation ? "ESCALATION_REQUIRED" : "VISUAL_CRITIQUE_REWORK"},
        next_action=${escalation ? "CABINA_VISUAL_REVIEW" : "AUTO_REWORK_FROM_VISUAL_QA"},
        error=null,
        updated_at=now()
      where id=${row.prospect_id}::uuid`;

    await sql`insert into site_events(prospect_id,event_type,entity_type,entity_id,actor,from_status,to_status,payload)
      values(
        ${row.prospect_id}::uuid,
        ${escalation ? "VISUAL_QA_ESCALATION_REQUIRED" : "VISUAL_QA_REWORK_REQUIRED"},
        'render_pack',${row.render_pack_id}::uuid,'rendering-studio-visual-qa',
        'RENDERING'::pipeline_status,${escalation ? "RENDERING" : "RENDER_REWORK"}::pipeline_status,
        ${JSON.stringify({cycle,qa:qaSummary,model:VISUAL_QA_MODEL})}::jsonb
      )`;

    return {
      ok:false,
      pack_id:row.render_pack_id,
      error:escalation ? "VISUAL_QA_ESCALATION_REQUIRED" : "VISUAL_QA_REWORK_REQUIRED",
      visual_rework_cycle:cycle
    };
  }

  for (const item of visualQa) {
    const base="https://"+ADMIN_HOST+"/ops/render-assets/"+item.variant_id;
    await sql`update render_staging_payloads set status='RENDERED',updated_at=now()
      where id=${item.staging_id}::uuid`;
    await sql`update render_variants set
        status='RENDER_READY',
        desktop_render_url=${base+"/desktop"},
        mobile_render_url=${base+"/mobile"},
        updated_at=now()
      where id=${item.variant_id}::uuid`;
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
  const cancelledLegacyRenderJobs=await reconcileNativeRenderQueue(sql);

  const readyToRender=await renderCandidates(sql,MAX_RENDER_PACKS_PER_TICK);
  let rendered=[];
  let renderMaster="";
  if (readyToRender.length) {
    renderMaster=await loadFrozenMaster();
    if (!env.BROWSER) {
      rendered=await Promise.all(readyToRender.map(row=>renderPack(sql,env,row,null,renderMaster)));
    } else {
      const sharedBrowser=await puppeteer.launch(env.BROWSER);
      try {
        rendered=await Promise.all(readyToRender.map(row=>renderPack(sql,env,row,sharedBrowser,renderMaster)));
      } finally {
        await sharedBrowser.close();
      }
    }
  }

  const activeRows=await sql`select count(*)::int as n from render_jobs
    where worker='cloudflare-workers-ai' and status in ('RUNNING','COMPLETING')
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
    cancelled_legacy_render_jobs:cancelledLegacyRenderJobs,
    active_generation_jobs:active,
    generation_slots:slots,
    generated_count:generated.filter(x=>x.ok).length,
    render_ready_count:rendered.filter(x=>x.ok).length,
    generated,
    rendered
  };
}
