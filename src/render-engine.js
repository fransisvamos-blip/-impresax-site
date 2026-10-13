import { neon } from "@neondatabase/serverless";
import puppeteer from "@cloudflare/puppeteer";
import { generateRenderVariants } from "./rendering-studio.js";

const MODEL = "@cf/zai-org/glm-4.7-flash";
const VISUAL_QA_MODEL = "@cf/qwen/qwen3.8-27b";
const VISUAL_QA_REPAIR_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const MAX_VISUAL_REWORK_CYCLES = 5;
const MASTER_URL = "https://raw.githubusercontent.com/fransisvamos-blip/-impresax-site/9578da3fa1b173283bf5c748b0e7d89497537e76/docs/RENDERING_STUDIO_V1_FROZEN.md";
const ADMIN_HOST = "admin.impresax.org";
const MAX_PROSPECTS_PER_TICK = 1;
const MAX_RENDER_PACKS_PER_TICK = 1;
const MAX_ACTIVE_BROWSER_JOBS = 2;
const MAX_TECH_RETRIES = 3;
const MAX_GENERATION_FAILURES = 3;
const CREATIVE_ENGINE_REVISION = "V8.4.1_ZERO_PHOTO_BREAKER_SOT";

function db(env) {
  if (!env.OPS_DATABASE_URL) throw new Error("OPS_DATABASE_URL_NOT_CONFIGURED");
  return neon(env.OPS_DATABASE_URL);
}

function canonicalAssetUrl(value) {
  try {
    const u=new URL(String(value || ""));
    u.hash="";
    return u.href;
  } catch {
    return "";
  }
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
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  let text = String(value || "").trim()
    .replace(/^\`\`\`(?:json)?\s*/i, "")
    .replace(/\s*\`\`\`$/i, "");
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("VISUAL_QA_JSON_REQUIRED");
  return JSON.parse(text.slice(first, last + 1));
}

function extractModelJson(result) {
  const direct = [
    result?.choices?.[0]?.message?.parsed,
    result?.response,
    result?.result?.response,
    result?.parsed
  ];
  for (const value of direct) {
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  }
  return extractJsonObject(extractModelText(result));
}

function normalizeVisualQa(result) {
  const issues = Array.isArray(result?.issues) ? result.issues.map(x => String(x).slice(0, 300)).slice(0, 20) : [];
  const instructions = Array.isArray(result?.rework_instructions)
    ? result.rework_instructions.map(x => String(x).slice(0, 500)).slice(0, 20)
    : [];
  const scores = result?.scores && typeof result.scores === "object" ? result.scores : {};
  const criticalScores = [
    "first_impression",
    "art_direction",
    "prospect_specificity",
    "brand_fidelity",
    "composition",
    "typography",
    "imagery",
    "materiality",
    "signature_visual_language",
    "rhythm",
    "restraint",
    "cta_integration",
    "commercial_clarity",
    "desktop_quality",
    "mobile_quality",
    "footer_quality",
    "no_template_feel",
    "no_saas_feel",
    "no_ai_feel",
    "truth_integrity",
    "consistency"
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

function isCompleteVisualQaPayload(value) {
  if (!value || typeof value !== "object") return false;
  if (typeof value.pass !== "boolean") return false;
  if (typeof value.summary !== "string" || value.summary.trim().length < 20) return false;
  if (!Array.isArray(value.issues) || !Array.isArray(value.rework_instructions)) return false;
  const scores=value.scores;
  if (!scores || typeof scores !== "object") return false;
  const required=["first_impression","art_direction","prospect_specificity","brand_fidelity","composition","typography","imagery","materiality","signature_visual_language","rhythm","restraint","cta_integration","commercial_clarity","desktop_quality","mobile_quality","footer_quality","no_template_feel","no_saas_feel","no_ai_feel","truth_integrity","consistency"];
  return required.every(k => Number.isFinite(Number(scores[k])));
}

async function repairVisualQaArguments(env, raw, parameters) {
  const source = typeof raw === "string" ? raw : JSON.stringify(raw || {});
  const out = await env.AI.run(VISUAL_QA_REPAIR_MODEL, {
    messages: [
      {
        role: "system",
        content: "Repair the supplied visual-QA payload into the exact JSON schema. Preserve the reviewer verdict and scores; do not improve or soften them."
      },
      {
        role: "user",
        content: source.slice(0, 12000)
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: parameters
    },
    max_tokens: 1400,
    temperature: 0
  });

  const direct = out?.response ?? out?.result?.response ?? out?.parsed ?? null;
  if (direct && typeof direct === "object") return direct;
  return extractJsonObject(extractModelText(out));
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
    "Score every frozen review dimension: first impression, art direction, prospect specificity, brand fidelity, composition, typography, imagery, materiality, signature visual language, rhythm, restraint, CTA integration, commercial clarity, desktop quality, mobile quality, footer quality, no-template feel, no-SaaS feel, no-AI feel, truth integrity and consistency.",
    "A pass requires EVERY dimension to score at least 8/10 and no issue to remain. Be demanding.",
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
    "IMAGE 1 = desktop 1440 full homepage. IMAGE 2 = mobile 390 full homepage.",
    "You MUST call submit_visual_qa exactly once with your final verdict."
  ].join("\n");

  const parameters = {
    type: "object",
    additionalProperties: false,
    properties: {
      pass: { type: "boolean" },
      summary: { type: "string" },
      issues: { type: "array", items: { type: "string" } },
      rework_instructions: { type: "array", items: { type: "string" } },
      scores: {
        type: "object",
        additionalProperties: false,
        properties: {
          first_impression: { type: "number" },
          art_direction: { type: "number" },
          prospect_specificity: { type: "number" },
          brand_fidelity: { type: "number" },
          composition: { type: "number" },
          typography: { type: "number" },
          imagery: { type: "number" },
          materiality: { type: "number" },
          signature_visual_language: { type: "number" },
          rhythm: { type: "number" },
          restraint: { type: "number" },
          cta_integration: { type: "number" },
          commercial_clarity: { type: "number" },
          desktop_quality: { type: "number" },
          mobile_quality: { type: "number" },
          footer_quality: { type: "number" },
          no_template_feel: { type: "number" },
          no_saas_feel: { type: "number" },
          no_ai_feel: { type: "number" },
          truth_integrity: { type: "number" },
          consistency: { type: "number" }
        },
        required: ["first_impression","art_direction","prospect_specificity","brand_fidelity","composition","typography","imagery","materiality","signature_visual_language","rhythm","restraint","cta_integration","commercial_clarity","desktop_quality","mobile_quality","footer_quality","no_template_feel","no_saas_feel","no_ai_feel","truth_integrity","consistency"]
      }
    },
    required: ["pass","summary","issues","rework_instructions","scores"]
  };

  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const out = await env.AI.run(VISUAL_QA_MODEL, {
        messages: [
          {
            role: "system",
            content: "You are a strict senior visual design reviewer. Never pass mediocre work. Submit the final verdict through the required tool."
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
        tools: [{
          name: "submit_visual_qa",
          description: "Submit the final visual QA verdict for this exact desktop/mobile variant.",
          parameters
        }],
        tool_choice: "required",
        parallel_tool_calls: false,
        max_completion_tokens: 1800,
        temperature: 0.05,
        reasoning_effort: "medium"
      });

      const call =
        out?.tool_calls?.[0] ??
        out?.choices?.[0]?.message?.tool_calls?.[0] ??
        out?.result?.tool_calls?.[0];
      let args = call?.arguments ?? call?.function?.arguments ?? call?.args ?? null;
      if (typeof args === "string") {
        const rawArgs=args;
        try {
          args = JSON.parse(args);
        } catch {
          args = await repairVisualQaArguments(env, rawArgs, parameters);
        }
        if (!isCompleteVisualQaPayload(args)) {
          args = await repairVisualQaArguments(env, rawArgs, parameters);
        }
      } else if (args && typeof args === "object" && !isCompleteVisualQaPayload(args)) {
        args = await repairVisualQaArguments(env, args, parameters);
      }
      if (isCompleteVisualQaPayload(args)) return normalizeVisualQa(args);

      try {
        const parsed = extractModelJson(out);
        if (isCompleteVisualQaPayload(parsed)) return normalizeVisualQa(parsed);
        if (parsed && typeof parsed === "object") {
          const repaired = await repairVisualQaArguments(env, parsed, parameters);
          if (isCompleteVisualQaPayload(repaired)) return normalizeVisualQa(repaired);
        }
      } catch {}

      const rawFallback = extractModelText(out);
      if (rawFallback) {
        const repaired = await repairVisualQaArguments(env, rawFallback, parameters);
        if (isCompleteVisualQaPayload(repaired)) return normalizeVisualQa(repaired);
      }
      throw new Error("VISUAL_QA_COMPLETE_TOOL_RESULT_REQUIRED");
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("VISUAL_QA_FAILED_TO_RUN");
}

async function critiqueVariantSet(env, prospect, captured, individualQa) {
  const parameters={
    type:"object",
    additionalProperties:false,
    properties:{
      pass:{type:"boolean"},
      summary:{type:"string"},
      issues:{type:"array",items:{type:"string"}},
      rework_instructions:{type:"array",items:{type:"string"}},
      scores:{
        type:"object",
        additionalProperties:false,
        properties:{
          set_quality:{type:"number"},
          diversity_ab:{type:"number"},
          diversity_ac:{type:"number"},
          diversity_bc:{type:"number"},
          prospect_fit_a:{type:"number"},
          prospect_fit_b:{type:"number"},
          prospect_fit_c:{type:"number"}
        },
        required:["set_quality","diversity_ab","diversity_ac","diversity_bc","prospect_fit_a","prospect_fit_b","prospect_fit_c"]
      }
    },
    required:["pass","summary","issues","rework_instructions","scores"]
  };

  const directions=Object.fromEntries(captured.map(x=>[
    x.item.variant_key,
    x.item.design_notes?.direction || {}
  ]));
  const individual=Object.fromEntries(individualQa.map(x=>[
    x.variant_key,
    {pass:x.qa.pass,scores:x.qa.scores,issues:x.qa.issues}
  ]));

  const prompt=[
    "Judge the THREE homepage directions AS A SET, not individually.",
    "Six screenshots follow in exact order: A desktop, A mobile, B desktop, B mobile, C desktop, C mobile.",
    "PASS only if each variant is unmistakably adapted to THIS prospect, A/B/C are materially different in hero logic, composition, typography, imagery/materiality, signature device, rhythm and CTA treatment, and the weakest route is still portfolio-grade.",
    "Hard fail if two routes are strong and one is filler, if diversity is merely palette/copy changes, or if the same generic template family is visible underneath.",
    "Every score must be >=8/10. Any issue means FAIL.",
    "Return the verdict through the required tool.",
    "",
    "PROSPECT:",JSON.stringify(prospect),
    "DIRECTIONS:",JSON.stringify(directions),
    "INDIVIDUAL QA:",JSON.stringify(individual)
  ].join("\n");

  let lastError=null;
  for(let attempt=1;attempt<=2;attempt++) {
    try {
      const A=captured.find(x=>x.item.variant_key==="A");
      const B=captured.find(x=>x.item.variant_key==="B");
      const C=captured.find(x=>x.item.variant_key==="C");
      if(!A||!B||!C) throw new Error("SET_QA_THREE_VARIANTS_REQUIRED");

      const out=await env.AI.run(VISUAL_QA_MODEL,{
        messages:[
          {role:"system",content:"You are a strict creative director reviewing a three-route design pitch. Never pass a repetitive or filler set."},
          {role:"user",content:[
            {type:"text",text:prompt},
            {type:"image_url",image_url:{url:"data:image/jpeg;base64,"+A.desktopB64}},
            {type:"image_url",image_url:{url:"data:image/jpeg;base64,"+A.mobileB64}},
            {type:"image_url",image_url:{url:"data:image/jpeg;base64,"+B.desktopB64}},
            {type:"image_url",image_url:{url:"data:image/jpeg;base64,"+B.mobileB64}},
            {type:"image_url",image_url:{url:"data:image/jpeg;base64,"+C.desktopB64}},
            {type:"image_url",image_url:{url:"data:image/jpeg;base64,"+C.mobileB64}}
          ]}
        ],
        tools:[{name:"submit_set_qa",description:"Submit the final A/B/C set-level QA verdict.",parameters}],
        tool_choice:"required",
        parallel_tool_calls:false,
        max_completion_tokens:1400,
        temperature:0.03,
        reasoning_effort:"medium"
      });

      const call=
        out?.tool_calls?.[0] ??
        out?.choices?.[0]?.message?.tool_calls?.[0] ??
        out?.result?.tool_calls?.[0];
      let args=call?.arguments ?? call?.function?.arguments ?? call?.args ?? null;
      const rawArgs=args;
      if(typeof args==="string") {
        try { args=JSON.parse(args); }
        catch { args=await repairVisualQaArguments(env,args,parameters); }
      }
      if(!args || typeof args!=="object") {
        args=await repairVisualQaArguments(env,rawArgs || extractModelText(out),parameters);
      }

      let scores=args?.scores || {};
      const required=["set_quality","diversity_ab","diversity_ac","diversity_bc","prospect_fit_a","prospect_fit_b","prospect_fit_c"];
      let complete=required.every(k=>Number.isFinite(Number(scores[k])));
      if(!complete) {
        args=await repairVisualQaArguments(env,args,parameters);
        scores=args?.scores || {};
        complete=required.every(k=>Number.isFinite(Number(scores[k])));
      }
      if(!complete) throw new Error("SET_QA_SCORES_INCOMPLETE");
      const issues=Array.isArray(args.issues)?args.issues.map(x=>String(x).slice(0,400)).slice(0,16):[];
      const rework=Array.isArray(args.rework_instructions)?args.rework_instructions.map(x=>String(x).slice(0,500)).slice(0,16):[];
      const min=Math.min(...required.map(k=>Number(scores[k])));
      return {
        pass:args.pass===true && issues.length===0 && min>=8,
        summary:String(args.summary||"").slice(0,1200),
        issues:min<8 && issues.length===0 ? ["A_B_C_SET_BELOW_FROZEN_DIVERSITY_BAR"] : issues,
        rework_instructions:rework,
        scores:Object.fromEntries(required.map(k=>[k,Number(scores[k])])),
        model:VISUAL_QA_MODEL,
        checked_at:new Date().toISOString()
      };
    } catch(error) {
      lastError=error;
    }
  }
  throw lastError || new Error("SET_LEVEL_VISUAL_QA_FAILED");
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
    brand_personality: [row.business_name, trust || services].filter(Boolean).join(" — ").slice(0,1400),
    visual_cues: [
      colors.length ? "Preserve first-party color evidence: " + colors.join(", ") : null,
      evidence?.logo_candidate?.signal ? "Logo context: " + evidence.logo_candidate.signal : null,
      evidence?.description ? "Site positioning cue: " + evidence.description.slice(0,500) : null
    ].filter(Boolean),
    tone: evidence?.description || services || row.business_name,
    business_type: row.vertical || source.verified_services || row.business_name,
    audience: [source.commercial_goal, services, locality].filter(Boolean).join(" — ").slice(0,1800),
    offer: services,
    local_context: locality,
    trust_signals: trust,
    commercial_path: contacts,
    first_party_site_language: siteSummary || "No first-party site copy available; use verified business data only.",
    existing_colors: colors.length ? colors : "NOT_VERIFIED_FROM_FIRST_PARTY_EVIDENCE",
    official_identity_asset: logoSignal || "No official graphic logo verified; use verified business name as text only when explicitly permitted.",
    typography_cues: evidence?.visible_text
      ? "Derive hierarchy from first-party identity evidence; do not invent a branded typeface."
      : "NOT_VERIFIED_FROM_FIRST_PARTY_EVIDENCE — do not claim an existing branded typeface; choose typography as new art direction only.",
    imagery_cues: evidence?.visible_text
      ? "Derive imagery from the real offering described by the official site; never invent staff, facilities or completed projects."
      : "Use only verified/category imagery tied directly to the verified offering.",
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

const REQUIRED_BRAND_DNA_KEYS = Object.freeze([
  "brand_personality",
  "visual_cues",
  "tone",
  "business_type",
  "audience",
  "offer",
  "local_context",
  "trust_signals",
  "existing_colors",
  "typography_cues",
  "imagery_cues",
  "business_positioning",
  "commercial_behavior"
]);

function meaningfulBrandValue(v) {
  if (Array.isArray(v)) return v.length > 0;
  if (v && typeof v === "object") return Object.keys(v).length > 0;
  return String(v || "").trim().length > 2;
}

function validBrandDna(value) {
  if (!value || typeof value !== "object") return false;
  return REQUIRED_BRAND_DNA_KEYS.every(key => meaningfulBrandValue(value[key]));
}
async function deriveBrandDna(env, row, evidence) {
  const source = row.source_data || {};
  const prompt = [
    "You are the Brand Gate analyst for ImpresaX Rendering Studio.",
    "Extract REAL Brand DNA from the verified company data and first-party website evidence below.",
    "Do not invent facts. Strategic/visual interpretation is allowed only when grounded in the supplied evidence.",
    "Return ONLY valid JSON with these mandatory keys:",
    "brand_personality, visual_cues, tone, business_type, audience, offer, local_context, trust_signals, existing_colors, typography_cues, imagery_cues, business_positioning, commercial_behavior.",
    "You may also include visual_signature as an extra field.",
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
  if (!validBrandDna(brandDna)) {
    try {
      brandDna = await deriveBrandDna(env,row,evidence);
    } catch {}
  }

  const latestRows=await sql`select logo,brand_dna
    from prospects where id=${row.prospect_id}::uuid limit 1`;
  const latestLogo=latestRows[0]?.logo || {};
  const latestDna=latestRows[0]?.brand_dna || {};
  const latestLogoStatus=String(latestLogo.status || "").toUpperCase();
  const latestLogoIsVerified =
    ((latestLogoStatus==="PASS" || latestLogoStatus==="OFFICIAL_LOGO_LOCKED") &&
      typeof (latestLogo.url || latestLogo.official_source)==="string") ||
    (latestLogoStatus==="NO_OFFICIAL_LOGO_CONFIRMED" &&
      latestLogo.generated===false &&
      latestLogo.use_verified_name_as_text===true);

  if (latestLogoIsVerified) logo=latestLogo;
  if (validBrandDna(latestDna)) brandDna=latestDna;

  if (!validBrandDna(brandDna)) {
    throw new Error("FROZEN_BRAND_DNA_RECOVERY_INCOMPLETE");
  }

  await sql`update prospects set
      logo=${JSON.stringify(logo)}::jsonb,
      brand_dna=${JSON.stringify(brandDna)}::jsonb,
      updated_at=now()
    where id=${row.prospect_id}::uuid
      and (
        not (brand_dna ?& ARRAY[
          'brand_personality','visual_cues','tone','business_type','audience','offer',
          'local_context','trust_signals','existing_colors','typography_cues','imagery_cues',
          'business_positioning','commercial_behavior'
        ])
        or brand_dna=${JSON.stringify(latestDna)}::jsonb
      )`;
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

function parseDim(tag,name) {
  const raw=attrValue(tag,name);
  const n=Number(String(raw || "").replace(/[^0-9.]/g,""));
  return Number.isFinite(n) && n>0 ? n : null;
}

function assetRole(signal) {
  const s=String(signal || "").toLowerCase();
  if(/\blogo\b|site-logo|custom-logo|brand-logo|navbar-brand/.test(s)) return "identity";
  if(/certif|badge|award|partner|client|fedex|ups|sda|mimit|rina/.test(s)) return "trust";
  if(/project|portfolio|lavor|realizz|gallery|case[-_ ]?study/.test(s)) return "project";
  if(/hero|banner|cover|masthead/.test(s)) return "hero";
  if(/team|staff|persona|profile|founder/.test(s)) return "people";
  if(/product|prodot|material|service|serviz|facility|sede|office|azienda/.test(s)) return "business";
  return "editorial";
}

function scoreFirstPartyAsset(candidate) {
  const signal=[candidate.url,candidate.alt,candidate.title,candidate.class_name,candidate.id,candidate.page_url].join(" ").toLowerCase();
  let score=0;
  const role=assetRole(signal);
  if(role==="hero") score+=12;
  if(role==="project") score+=10;
  if(role==="business") score+=7;
  if(role==="people") score+=5;
  if(role==="trust") score+=1;
  if(role==="identity") score-=8;
  if(/icon|favicon|sprite|emoji|placeholder|woocommerce|payment|social|avatar/.test(signal)) score-=12;
  if(/thumb|thumbnail|150x150|100x100|64x64/.test(signal)) score-=8;
  if(/\.(jpe?g|webp|avif)(?:[?#]|$)/i.test(candidate.url)) score+=3;
  if(/\.png(?:[?#]|$)/i.test(candidate.url)) score+=1;
  const w=Number(candidate.width||0),h=Number(candidate.height||0);
  const area=w*h;
  if(area>=1200000) score+=8;
  else if(area>=600000) score+=6;
  else if(area>=250000) score+=4;
  else if(area>0 && area<50000) score-=6;
  if(w>=1200) score+=3;
  if(h>=700) score+=2;
  if(candidate.alt && String(candidate.alt).trim().length>=8) score+=2;
  if(candidate.same_host===true) score+=3;
  if(candidate.source_type==="FIRST_PARTY_EMBEDDED_EXTERNAL") score+=1;
  return {...candidate,role,score};
}

async function extractAssetsFromPage(pageUrl, rootHost) {
  try {
    const res=await fetch(pageUrl,{redirect:"follow",headers:{"User-Agent":"ImpresaX-RenderingStudio/1.0"}});
    if(!res.ok) return {assets:[],links:[]};
    const html=(await res.text()).slice(0,700000);
    const base=new URL(res.url || pageUrl);
    const assets=[];
    const seen=new Set();

    const add=(raw,meta={})=>{
      if(!raw) return;
      const first=String(raw).split(",")[0].trim().split(/\s+/)[0];
      if(!first || first.startsWith("data:") || first.startsWith("blob:")) return;
      try {
        const u=new URL(first,base);
        if(u.protocol!=="https:") return;
        const host=u.hostname.replace(/^www\./,"").toLowerCase();
        const sameHost=host===rootHost || host.endsWith("."+rootHost);
        const url=u.href;
        if(seen.has(url)) return;
        seen.add(url);
        assets.push(scoreFirstPartyAsset({
          url,
          page_url:base.href,
          source_type:sameHost ? "FIRST_PARTY_HOST" : "FIRST_PARTY_EMBEDDED_EXTERNAL",
          same_host:sameHost,
          source_host:host,
          alt:meta.alt||"",
          title:meta.title||"",
          class_name:meta.class_name||"",
          id:meta.id||"",
          width:meta.width||null,
          height:meta.height||null
        }));
      } catch {}
    };

    for(const m of html.matchAll(/<img\b[^>]*>/gi)) {
      const tag=m[0];
      add(attrValue(tag,"src")||attrValue(tag,"data-src")||attrValue(tag,"data-lazy-src"),{
        alt:attrValue(tag,"alt"),
        title:attrValue(tag,"title"),
        class_name:attrValue(tag,"class"),
        id:attrValue(tag,"id"),
        width:parseDim(tag,"width"),
        height:parseDim(tag,"height")
      });
      const srcset=attrValue(tag,"srcset")||attrValue(tag,"data-srcset");
      if(srcset) {
        const parts=srcset.split(",").map(x=>x.trim()).filter(Boolean);
        const largest=parts[parts.length-1]?.split(/\s+/)[0];
        add(largest,{
          alt:attrValue(tag,"alt"),
          title:attrValue(tag,"title"),
          class_name:attrValue(tag,"class"),
          id:attrValue(tag,"id"),
          width:parseDim(tag,"width"),
          height:parseDim(tag,"height")
        });
      }
    }

    const ogTags=[
      ...html.matchAll(/<meta\b[^>]*(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/gi)
    ];
    for(const m of ogTags) add(attrValue(m[0],"content"),{class_name:"social-preview"});

    const links=[];
    for(const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const raw=m[1],text=String(m[2]||"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
      try {
        const u=new URL(raw,base);
        const host=u.hostname.replace(/^www\./,"").toLowerCase();
        if(u.protocol!=="https:" || (host!==rootHost && !host.endsWith("."+rootHost))) continue;
        const signal=(u.pathname+" "+text).toLowerCase();
        if(/portfolio|progett|lavor|realizz|gallery|chi[-_ ]?siamo|about|serviz|services|azienda|company|case[-_ ]?stud/.test(signal)) {
          links.push(u.href);
        }
      } catch {}
    }
    return {assets,links:[...new Set(links)].slice(0,8)};
  } catch {
    return {assets:[],links:[]};
  }
}

function visualAssetFamilyKey(value) {
  try {
    const u=new URL(String(value || ""));
    let path=u.pathname.toLowerCase();
    path=path.replace(/-\d+x\d+(?=\.[a-z0-9]+$)/i,"");
    if(/\/wp-content\/uploads\//i.test(path)) {
      return u.hostname.replace(/^www\./,"").toLowerCase()+path;
    }
    return u.hostname.replace(/^www\./,"").toLowerCase()+path;
  } catch {
    return String(value || "").split("?")[0].toLowerCase();
  }
}

async function discoverFirstPartyImages(websiteUrl) {
  if(!websiteUrl) return [];
  try {
    const root=new URL(websiteUrl);
    const rootHost=root.hostname.replace(/^www\./,"").toLowerCase();
    const home=await extractAssetsFromPage(websiteUrl,rootHost);
    const childUrls=home.links.slice(0,4);
    const children=await Promise.all(childUrls.map(url=>extractAssetsFromPage(url,rootHost)));
    const byFamily=new Map();
    for(const item of [...home.assets,...children.flatMap(x=>x.assets)]) {
      const key=visualAssetFamilyKey(item.url);
      const prev=byFamily.get(key);
      const prevArea=Number(prev?.width||0)*Number(prev?.height||0);
      const nextArea=Number(item?.width||0)*Number(item?.height||0);
      if(!prev || Number(item.score||0)>Number(prev.score||0) ||
         (Number(item.score||0)===Number(prev.score||0) && nextArea>prevArea)) {
        byFamily.set(key,item);
      }
    }
    return [...byFamily.values()]
      .sort((a,b)=>b.score-a.score)
      .slice(0,16);
  } catch {
    return [];
  }
}


function normalizeApprovedExternalAssets(source) {
  const rows=Array.isArray(source?.approved_external_images) ? source.approved_external_images : [];
  return rows.map((item,index)=>{
    if(typeof item==="string") return {
      url:item,
      page_url:"APPROVED_EXTERNAL",
      source_type:"APPROVED_EXTERNAL",
      role:"editorial",
      score:5,
      approved_external:true,
      approval_index:index
    };
    return {
      ...item,
      url:item?.url || item?.src || item?.asset_url || "",
      page_url:item?.page_url || "APPROVED_EXTERNAL",
      source_type:item?.source_type || "APPROVED_EXTERNAL",
      role:item?.role || "editorial",
      score:Number(item?.score || 5),
      approved_external:true,
      approval_index:index
    };
  }).filter(x=>/^https:\/\//i.test(String(x.url||"")));
}

async function fetchAssetDataUrl(url) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),8000);
  try {
    const res=await fetch(url,{
      redirect:"follow",
      signal:controller.signal,
      headers:{"User-Agent":"ImpresaX-RenderingStudio-AssetVision/1.0"}
    });
    if(!res.ok) throw new Error("ASSET_FETCH_"+res.status);
    const mime=String(res.headers.get("content-type") || "").split(";")[0].toLowerCase();
    if(!["image/jpeg","image/png","image/webp","image/avif"].includes(mime)) {
      throw new Error("ASSET_VISION_UNSUPPORTED_MIME_"+mime);
    }
    const declared=Number(res.headers.get("content-length")||0);
    if(declared>5_000_000) throw new Error("ASSET_VISION_TOO_LARGE");
    const bytes=new Uint8Array(await res.arrayBuffer());
    if(bytes.length>5_000_000) throw new Error("ASSET_VISION_TOO_LARGE");
    return {data_url:"data:"+mime+";base64,"+bytesToBase64(bytes),bytes:bytes.length,mime};
  } finally {
    clearTimeout(timer);
  }
}

async function inspectVisualAsset(env, prospect, asset) {
  if(["identity","trust"].includes(String(asset?.role||""))) {
    return {
      ...asset,
      vision_status:"ROLE_LOCKED",
      vision_usable:true,
      vision_role:asset.role,
      relevance:10,
      visual_quality:8,
      hero_suitability:0,
      body_suitability:asset.role==="trust" ? 8 : 0,
      vision_risks:[],
      vision_summary:"Verified "+asset.role+" asset; usage locked to that role."
    };
  }

  try {
    const encoded=await fetchAssetDataUrl(asset.url);
    const parameters={
      type:"object",
      additionalProperties:false,
      properties:{
        usable:{type:"boolean"},
        relevance:{type:"number"},
        visual_quality:{type:"number"},
        hero_suitability:{type:"number"},
        body_suitability:{type:"number"},
        role:{type:"string"},
        summary:{type:"string"},
        risks:{type:"array",items:{type:"string"}}
      },
      required:["usable","relevance","visual_quality","hero_suitability","body_suitability","role","summary","risks"]
    };
    const prompt=[
      "Inspect this VERIFIED visual asset before art direction.",
      "Judge what is ACTUALLY visible, not what the URL/filename suggests.",
      "Score 0-10: relevance to this exact prospect, visual quality, hero suitability, body suitability.",
      "Hard-risk: low resolution, watermarks, irrelevant subject, generic stock look, wrong business, misleading premises/staff/project implication, screenshot/UI clutter, text-heavy graphic, badge/logo misuse.",
      "The asset can be usable for body but not hero. Be strict.",
      "Return the verdict through the required tool.",
      "PROSPECT:",JSON.stringify({
        business_name:prospect.business_name,
        vertical:prospect.vertical,
        city:prospect.city,
        verified_services:prospect.verified_services,
        verified_trust:prospect.verified_trust,
        brand_dna:prospect.brand_dna
      }),
      "ASSET METADATA:",JSON.stringify(asset)
    ].join("\n");

    const out=await env.AI.run(VISUAL_QA_MODEL,{
      messages:[
        {role:"system",content:"You are a senior photography and visual-asset editor. Reject weak or misleading imagery."},
        {role:"user",content:[
          {type:"text",text:prompt},
          {type:"image_url",image_url:{url:encoded.data_url}}
        ]}
      ],
      tools:[{name:"submit_asset_vision",description:"Submit the pre-art-direction asset verdict.",parameters}],
      tool_choice:"required",
      parallel_tool_calls:false,
      max_completion_tokens:700,
      temperature:0.02,
      reasoning_effort:"medium"
    });

    const call=
      out?.tool_calls?.[0] ??
      out?.choices?.[0]?.message?.tool_calls?.[0] ??
      out?.result?.tool_calls?.[0];
    let args=call?.arguments ?? call?.function?.arguments ?? call?.args ?? null;
    const rawArgs=args;
    const complete=(value)=>{
      if(!value || typeof value!=="object") return false;
      const numeric=["relevance","visual_quality","hero_suitability","body_suitability"];
      return typeof value.usable==="boolean" &&
        typeof value.role==="string" &&
        typeof value.summary==="string" &&
        Array.isArray(value.risks) &&
        numeric.every(k=>Number.isFinite(Number(value[k])));
    };

    if(typeof args==="string") {
      try { args=JSON.parse(args); }
      catch {
        try { args=extractJsonObject(args); }
        catch { args=await repairVisualQaArguments(env,args,parameters); }
      }
    }
    if(!complete(args)) {
      try {
        const parsed=extractModelJson(out);
        if(complete(parsed)) args=parsed;
      } catch {}
    }
    if(!complete(args)) {
      const rawFallback=
        rawArgs ||
        extractModelText(out) ||
        JSON.stringify(args || {});
      args=await repairVisualQaArguments(env,rawFallback,parameters);
    }
    if(!complete(args)) throw new Error("ASSET_VISION_STRUCTURED_RESULT_REQUIRED");

    const relevance=Number(args.relevance||0);
    const visualQuality=Number(args.visual_quality||0);
    const hero=Number(args.hero_suitability||0);
    const body=Number(args.body_suitability||0);
    if(![relevance,visualQuality,hero,body].every(Number.isFinite)) throw new Error("ASSET_VISION_SCORES_REQUIRED");
    const risks=Array.isArray(args.risks)?args.risks.map(x=>String(x).slice(0,240)).slice(0,10):[];
    const visionRole=String(args.role||asset.role||"editorial").toLowerCase().slice(0,80);
    const roleLocked=["identity","trust"].includes(visionRole);
    const usable=args.usable===true && relevance>=6 && visualQuality>=6 && (roleLocked || Math.max(hero,body)>=6);

    return {
      ...asset,
      discovered_role:asset.role,
      role:visionRole,
      vision_status:"REVIEWED",
      vision_usable:usable,
      relevance,
      visual_quality:visualQuality,
      hero_suitability:hero,
      body_suitability:body,
      vision_role:visionRole,
      vision_risks:risks,
      vision_summary:String(args.summary||"").slice(0,500),
      vision_bytes:encoded.bytes,
      vision_mime:encoded.mime,
      score:Number(asset.score||0)+relevance+visualQuality+Math.max(hero,body)
    };
  } catch(error) {
    return {
      ...asset,
      vision_status:"REJECTED_UNVERIFIED_VISUAL",
      vision_usable:false,
      relevance:0,
      visual_quality:0,
      hero_suitability:0,
      body_suitability:0,
      vision_risks:[String(error?.message || error).slice(0,240)],
      vision_summary:"Asset excluded because visual inspection could not be completed safely."
    };
  }
}

function compactIdentityToken(value) {
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,"");
}

function isIdentityAssetForProspect(prospect, asset) {
  const logo=prospect?.official_logo || prospect?.logo || {};
  const assetUrl=canonicalAssetUrl(asset?.url || "");
  const officialUrls=[
    canonicalAssetUrl(logo?.url || ""),
    canonicalAssetUrl(logo?.official_source || "")
  ].filter(Boolean);
  if(assetUrl && officialUrls.includes(assetUrl)) return true;

  const business=compactIdentityToken(prospect?.business_name || prospect?.businessName || "");
  const alt=compactIdentityToken(asset?.alt || "");
  const title=compactIdentityToken(asset?.title || "");
  const file=compactIdentityToken(String(asset?.url || "").split("/").pop()?.split("?")[0] || "");
  if(business.length>=6 && (alt===business || title===business)) return true;

  for(const official of officialUrls) {
    const officialFile=compactIdentityToken(String(official).split("/").pop()?.split("?")[0] || "")
      .replace(/\d+x\d+$/,"");
    const assetFile=file.replace(/\d+x\d+$/,"");
    if(officialFile.length>=6 && assetFile.length>=6 &&
       (assetFile.includes(officialFile) || officialFile.includes(assetFile))) return true;
  }
  return false;
}

async function analyzeVisualAssetInventory(env, prospect, assets) {
  const unique=[];
  const seen=new Set();
  for(const raw of assets || []) {
    const url=String(raw?.url || "");
    if(!url || seen.has(url)) continue;
    seen.add(url);
    const item=isIdentityAssetForProspect(prospect,raw)
      ? {...raw,role:"identity",discovered_role:raw?.role || raw?.discovered_role || "identity"}
      : raw;
    unique.push(item);
  }

  const locked=unique.filter(x=>{
    const role=String(x.role||"").toLowerCase();
    return role==="identity" || role==="trust" || role.includes("logo") || role.includes("badge");
  });
  const visual=unique.filter(x=>!locked.includes(x))
    .sort((a,b)=>Number(b.score||0)-Number(a.score||0));
  const reviewSet=visual.slice(0,10);
  const reviewed=await Promise.all(reviewSet.map(asset=>inspectVisualAsset(env,prospect,asset)));
  const skipped=visual.slice(10).map(asset=>({
    ...asset,
    vision_status:"NOT_SELECTED_FOR_VISION",
    vision_usable:false,
    vision_risks:["Lower-ranked asset; excluded from the creative inventory to preserve visual quality."]
  }));
  const lockedReviewed=await Promise.all(locked.map(asset=>inspectVisualAsset(env,prospect,asset)));
  const all=[...reviewed,...lockedReviewed,...skipped]
    .sort((a,b)=>Number(b.score||0)-Number(a.score||0));
  const usable=all.filter(x=>x.vision_usable===true);
  return {
    pass:true,
    revision:"ASSET_VISION_GATE_V1_1_IDENTITY_LOCK",
    total:all.length,
    reviewed:all.filter(x=>x.vision_status==="REVIEWED").length,
    usable_count:usable.length,
    rejected_count:all.filter(x=>x.vision_usable!==true).length,
    assets:all,
    usable
  };
}

function evaluateBrandGate(row) {
  const logo = row?.logo || {};
  const status = String(logo.status || "").toUpperCase();
  const exactLogoLocked =
    (status === "PASS" || status === "OFFICIAL_LOGO_LOCKED") &&
    typeof (logo.url || logo.official_source) === "string";
  const verifiedNoLogo =
    status === "NO_OFFICIAL_LOGO_CONFIRMED" &&
    logo.generated === false &&
    logo.use_verified_name_as_text === true;
  const source = row?.source_data || {};
  const refs = Array.isArray(source.source_references) ? source.source_references.filter(Boolean) : [];
  const issues = [];
  if (!exactLogoLocked && !verifiedNoLogo) issues.push("OFFICIAL_LOGO_NOT_LOCKED_OR_NO_LOGO_NOT_VERIFIED");
  if (!validBrandDna(row?.brand_dna || {})) {
    const missing=REQUIRED_BRAND_DNA_KEYS.filter(k => !meaningfulBrandValue(row?.brand_dna?.[k]));
    issues.push("BRAND_DNA_MISSING:" + missing.join("|"));
  }
  if (!source.verified_services) issues.push("VERIFIED_SERVICES_MISSING");
  if (!source.verified_contacts) issues.push("VERIFIED_CONTACTS_MISSING");
  if (!source.address && !row.city) issues.push("VERIFIED_LOCATION_MISSING");
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
    first_party_images: firstPartyImages,
    approved_external_images: Array.isArray(source.approved_external_images) ? source.approved_external_images : []
  };
}

async function renderHtml(browser, html, width, height) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setJavaScriptEnabled(false);
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30000 });

    await page.evaluate(async () => {
      for (const img of document.images) {
        img.loading="eager";
        img.decoding="sync";
      }
      if (document.fonts?.ready) {
        try { await document.fonts.ready; } catch {}
      }
      const images=[...document.images];
      await Promise.all(images.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          const done=()=>resolve();
          img.addEventListener("load",done,{once:true});
          img.addEventListener("error",done,{once:true});
          setTimeout(done,4000);
        });
      }));
    });

    await page.evaluate(async () => {
      const step=Math.max(500,Math.floor(window.innerHeight*0.8));
      for(let y=0;y<document.documentElement.scrollHeight;y+=step) {
        window.scrollTo(0,y);
        await new Promise(resolve=>setTimeout(resolve,35));
      }
      window.scrollTo(0,0);
    });
    await new Promise(resolve => setTimeout(resolve, 250));

    const diagnostics=await page.evaluate((viewportWidth) => {
      const root=document.documentElement;
      const images=[...document.images].map(img=>{
        const r=img.getBoundingClientRect();
        return {
          src:img.currentSrc || img.src || "",
          alt:img.alt || "",
          natural_width:img.naturalWidth || 0,
          natural_height:img.naturalHeight || 0,
          rendered_width:Math.round(r.width),
          rendered_height:Math.round(r.height),
          visible:r.width>1 && r.height>1 && getComputedStyle(img).visibility!=="hidden" && getComputedStyle(img).display!=="none"
        };
      });
      const broken_images=images.filter(x=>x.visible && (!x.natural_width || !x.natural_height)).map(x=>x.src || x.alt).slice(0,12);
      const logo_images=images.filter(x=>/logo/i.test((x.src||"")+" "+(x.alt||"")));
      const visible_logos=logo_images.filter(x=>x.visible);
      const tiny_logo=visible_logos.length>0 && visible_logos.every(x=>x.rendered_width<48 || x.rendered_height<18);
      const horizontal_overflow=Math.max(root.scrollWidth,document.body?.scrollWidth||0) > viewportWidth + 4;
      const overflowing_elements=[...document.querySelectorAll("body *")].filter(el=>{
        const r=el.getBoundingClientRect();
        const s=getComputedStyle(el);
        return r.width>0 && s.position!=="fixed" && (r.right>viewportWidth+4 || r.left<-4);
      }).slice(0,10).map(el=>({
        tag:el.tagName.toLowerCase(),
        class_name:String(el.className||"").slice(0,120),
        text:String(el.textContent||"").replace(/\s+/g," ").trim().slice(0,120)
      }));
      const interactive=[...document.querySelectorAll("button,input,textarea,select,a")].filter(el=>{
        const r=el.getBoundingClientRect();
        const s=getComputedStyle(el);
        if(!(r.width>0 && r.height>0 && s.display!=="none" && s.visibility!=="hidden")) return false;
        if(el.tagName!=="A") return true;
        const signal=(String(el.className||"")+" "+String(el.getAttribute("role")||"")).toLowerCase();
        return /btn|button|cta|call|contact|action/.test(signal) || ["block","inline-block","flex","inline-flex"].includes(s.display);
      }).map(el=>{
        const r=el.getBoundingClientRect();
        return {w:Math.round(r.width),h:Math.round(r.height),text:String(el.textContent||el.getAttribute("aria-label")||"").trim().slice(0,80)};
      });
      const undersized_tap_targets=viewportWidth<=430
        ? interactive.filter(x=>x.w<36 || x.h<36).slice(0,12)
        : [];
      const bodyFont=parseFloat(getComputedStyle(document.body).fontSize||"0");
      return {
        width:viewportWidth,
        full_height:root.scrollHeight,
        broken_images,
        horizontal_overflow,
        overflowing_elements,
        tiny_logo,
        body_font_px:bodyFont,
        undersized_tap_targets,
        image_count:images.length
      };
    },width);

    const bytes=await page.screenshot({ type: "jpeg", quality: 92, fullPage: true });
    return {bytes,diagnostics};
  } finally {
    await page.close();
  }
}

function deterministicRenderIssues(desktop,mobile) {
  const issues=[];
  if(desktop?.broken_images?.length) issues.push("DESKTOP_BROKEN_IMAGES:"+desktop.broken_images.join("|"));
  if(mobile?.broken_images?.length) issues.push("MOBILE_BROKEN_IMAGES:"+mobile.broken_images.join("|"));
  if(desktop?.horizontal_overflow) issues.push("DESKTOP_HORIZONTAL_OVERFLOW");
  if(mobile?.horizontal_overflow) issues.push("MOBILE_HORIZONTAL_OVERFLOW");
  if(desktop?.tiny_logo || mobile?.tiny_logo) issues.push("OFFICIAL_IDENTITY_TOO_SMALL");
  if(Number(mobile?.body_font_px||0)>0 && Number(mobile.body_font_px)<14) issues.push("MOBILE_BODY_TYPE_TOO_SMALL");
  if((mobile?.undersized_tap_targets||[]).length>=3) issues.push("MOBILE_TAP_TARGETS_TOO_SMALL");
  return issues;
}

function deterministicFailQa(issues) {
  const scoreKeys=[
    "first_impression","art_direction","prospect_specificity","brand_fidelity","composition",
    "typography","imagery","materiality","signature_visual_language","rhythm","restraint",
    "cta_integration","commercial_clarity","desktop_quality","mobile_quality","footer_quality",
    "no_template_feel","no_saas_feel","no_ai_feel","truth_integrity","consistency"
  ];
  return {
    pass:false,
    summary:"Deterministic browser-render QA found blocking visible/technical defects before model critique.",
    issues,
    rework_instructions:issues.map(x=>"Fix "+x+" and re-render before visual approval."),
    scores:Object.fromEntries(scoreKeys.map(k=>[k,0])),
    model:"DETERMINISTIC_BROWSER_QA",
    checked_at:new Date().toISOString()
  };
}

async function recoverStaleClaims(sql) {
  const staleAi=await sql`update render_jobs
    set status='FAILED', error='STALE_CLOUDFLARE_AI_CLAIM', completed_at=now(), updated_at=now()
    where worker='cloudflare-workers-ai'
      and status in ('RUNNING','COMPLETING')
      and started_at < now()-interval '16 minutes'
    returning prospect_id,input_data->>'render_pack_id' as render_pack_id`;

  for(const item of staleAi) {
    if(!item.render_pack_id) continue;
    await applyGenerationFailureState(sql,{
      prospect_id:item.prospect_id,
      render_pack_id:item.render_pack_id
    },'STALE_CLOUDFLARE_AI_CLAIM');
  }

  await sql`update render_packs rp
    set status='ART_DIRECTION'
    where rp.approved_reference=false
      and rp.status='AI_RENDERING'
      and not exists (
        select 1 from render_jobs rj
        where rj.worker='cloudflare-workers-ai'
          and rj.status in ('RUNNING','COMPLETING')
          and rj.started_at >= now()-interval '16 minutes'
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
      and status in ('RUNNING','QA_RUNNING')
      and started_at < now()-interval '12 minutes'`;

  await sql`update render_packs rp
    set status='RENDERING'
    where rp.approved_reference=false
      and rp.status='RENDERING_ASSETS'
      and not exists (
        select 1 from render_jobs rj
        where rj.worker='cloudflare-browser-renderer'
          and rj.status in ('RUNNING','QA_RUNNING')
          and rj.started_at >= now()-interval '12 minutes'
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
      rp.id as render_pack_id,rp.version,rp.status as pack_status,rp.content_map as pack_content_map,
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
      and coalesce((rp.content_map->>'generation_failure_count')::int,0) < ${MAX_GENERATION_FAILURES}
      and coalesce((rp.content_map->>'generation_hold')::boolean,false)=false
      and (
        coalesce(p.legacy_ids->>'id_prospect',p.source_data->>'id_prospect')='CZ-063'
        or exists (
          select 1
          from render_packs proof
          where proof.status='RENDER_READY'
            and proof.approved_reference=false
            and (
              select count(*) from render_staging_payloads ps
              where ps.render_pack_id=proof.id
                and ps.variant_key in ('A','B','C')
                and coalesce(ps.design_notes->>'engine_revision','')=${CREATIVE_ENGINE_REVISION}
                and coalesce(ps.design_notes->'visual_qa'->>'pass','false')='true'
            )=3
        )
      )
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
    where id=${row.render_pack_id}::uuid
      and status='ART_DIRECTION'
      and approved_reference=false
      and coalesce((content_map->>'generation_failure_count')::int,0) < ${MAX_GENERATION_FAILURES}
      and coalesce((content_map->>'generation_hold')::boolean,false)=false
      and not exists (
        select 1 from render_jobs j
        where j.worker='cloudflare-workers-ai'
          and j.status in ('RUNNING','COMPLETING')
          and j.input_data->>'render_pack_id'=${row.render_pack_id}
      )
    returning id`;
  if (!claim.length) return null;

  const attempts = await sql`select coalesce(max(attempt),0)+1 as attempt
    from render_jobs where prospect_id=${row.prospect_id}::uuid and worker='cloudflare-workers-ai'`;
  const attempt = Number(attempts[0]?.attempt || 1);
  const job = await sql`insert into render_jobs(
      prospect_id,status,attempt,worker,input_data,started_at
    ) values(
      ${row.prospect_id}::uuid,'RUNNING',${attempt},'cloudflare-workers-ai',
      ${JSON.stringify({render_pack_id:row.render_pack_id,version:row.version,prospect_code:row.prospect_code,contract:"V8_2_CREATIVE_QUALITY",runtime_revision:"V8.3_DETERMINISTIC_SIX_VIEW_QA",engine_revision:CREATIVE_ENGINE_REVISION})}::jsonb,now()
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

function extractHtmlImageUrls(html) {
  const source=String(html || "");
  const urls=new Set();
  for (const m of source.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
    if (/^https:\/\//i.test(m[1])) urls.add(m[1]);
  }
  for (const m of source.matchAll(/<source\b[^>]*\bsrcset=["']([^"']+)["']/gi)) {
    const first=String(m[1]||"").split(",")[0].trim().split(/\s+/)[0];
    if (/^https:\/\//i.test(first)) urls.add(first);
  }
  for (const m of source.matchAll(/(?:background|background-image)\s*:[^;{}]*url\(\s*["']?(https:\/\/[^"'\)\s]+)["']?\s*\)/gi)) {
    urls.add(m[1]);
  }
  return [...urls];
}

function buildVariantProvenance(row, html, ref) {
  const verifiedRefs=Array.isArray(row?.source_data?.source_references) ? row.source_data.source_references.filter(Boolean) : [];
  const images=extractHtmlImageUrls(html);
  return {
    verified_sources: verifiedRefs,
    render_source: ref,
    image_urls: images,
    official_logo: row?.logo || {},
    brand_dna_keys: Object.keys(row?.brand_dna || {})
  };
}

async function persistGeneratedPack(sql, row, jobId, htmlByKey, directions, preRenderGates) {
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
          rendering_studio_contract:"V8_2_CREATIVE_QUALITY",
          creative_quality_runtime:"V8.3_DETERMINISTIC_SIX_VIEW_QA",
          engine_revision:CREATIVE_ENGINE_REVISION,
          art_direction_model:"@cf/openai/gpt-oss-120b",
          html_model_primary:"@cf/openai/gpt-oss-120b",
          html_model_repair:"@cf/zai-org/glm-4.7-flash",
          visual_qa_model:VISUAL_QA_MODEL,
          direction:directions[key] || {},
          pre_render_gate:preRenderGates?.[key] || {}
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

    const provenance=buildVariantProvenance(row,html,ref);
    await sql`insert into render_variants(
        render_pack_id,variant_key,name,status,brand_dna,content_map,source_references
      ) values(
        ${row.render_pack_id}::uuid,${key},${"Versione "+key},'STAGED_SOURCE',
        ${JSON.stringify(row.brand_dna || {})}::jsonb,
        ${JSON.stringify({
          implementation_html:html,
          implementation_contract_version:"RENDERING_STUDIO_V1_HTML_REFERENCE",
          source_sha256:digest,
          source_transport:"CLOUDFLARE_INTERNAL",
          provenance,
          pre_render_gate:preRenderGates?.[key] || {}
        })}::jsonb,
        ${JSON.stringify([ref,...(row.source_data?.source_references || []),...provenance.image_urls])}::jsonb
      )
      on conflict(render_pack_id,variant_key) do update set
        name=excluded.name,
        status='STAGED_SOURCE',
        desktop_render_url=null,
        mobile_render_url=null,
        selected=false,
        brand_dna=excluded.brand_dna,
        content_map=excluded.content_map,
        source_references=excluded.source_references,
        updated_at=now()`;
  }

  await sql`update render_packs set
      status='RENDERING',
      content_map=coalesce(content_map,'{}'::jsonb) ||
        jsonb_build_object(
          'generation_failure_count',0,
          'last_generation_error',null,
          'generation_hold',false,
          'generation_success_at',now(),
          'generation_failure_source','RENDER_JOBS_SOURCE_OF_TRUTH',
          'creative_engine_revision',CREATIVE_ENGINE_REVISION,
          'v8_4_proof_candidate',true
        )
    where id=${row.render_pack_id}::uuid and status='AI_RENDERING'`;
  await sql`update render_jobs set status='COMPLETED',output_data=${JSON.stringify({
        variants:["A","B","C"],
        department:"RENDERING_STUDIO",
        contract:"V8_2_CREATIVE_QUALITY",
        runtime_revision:"V8.3_DETERMINISTIC_SIX_VIEW_QA",
        engine_revision:CREATIVE_ENGINE_REVISION,
        art_direction_model:"@cf/openai/gpt-oss-120b",
        html_model_primary:"@cf/openai/gpt-oss-120b",
          html_model_repair:"@cf/zai-org/glm-4.7-flash",
        visual_qa_model:VISUAL_QA_MODEL,
        direction_set_gate_pass:true,
        semantic_content_gate_pass:true
      })}::jsonb,
      error=null,completed_at=now(),updated_at=now()
    where id=${jobId}::uuid`;
  await sql`update prospects set current_step='RENDERING_ASSETS',next_action='AUTO_RENDER_DESKTOP_MOBILE',error=null,updated_at=now()
    where id=${row.prospect_id}::uuid`;
  return true;
}

async function applyGenerationFailureState(sql,row,message) {
  const packRows=await sql`select content_map->>'generation_success_at' as generation_success_at
    from render_packs where id=${row.render_pack_id}::uuid limit 1`;
  const successAt=packRows[0]?.generation_success_at || null;

  const countRows=await sql`select count(*)::int as n
    from render_jobs
    where worker='cloudflare-workers-ai'
      and status='FAILED'
      and input_data->>'render_pack_id'=${row.render_pack_id}
      and input_data->>'engine_revision'=${CREATIVE_ENGINE_REVISION}
      and coalesce(error,'') not like 'SUPERSEDED_BY%'
      and coalesce(error,'') <> 'CANCELLED_BY_GENERATION_CIRCUIT_BREAKER'
      and (${successAt}::timestamptz is null or started_at > ${successAt}::timestamptz)`;
  const generationFailures=Number(countRows[0]?.n || 0);

  await sql`update render_packs
    set content_map=coalesce(content_map,'{}'::jsonb) ||
      jsonb_build_object(
        'generation_failure_count',${generationFailures},
        'last_generation_error',${message},
        'generation_failure_source','RENDER_JOBS_SOURCE_OF_TRUTH'
      )
    where id=${row.render_pack_id}::uuid
      and approved_reference=false`;
  const hold=generationFailures>=MAX_GENERATION_FAILURES;

  if(hold) {
    await sql`update render_jobs
      set status='FAILED',
          error='CANCELLED_BY_GENERATION_CIRCUIT_BREAKER',
          completed_at=now(),
          updated_at=now()
      where worker='cloudflare-workers-ai'
        and status in ('RUNNING','COMPLETING')
        and input_data->>'render_pack_id'=${row.render_pack_id}`;

    await sql`update render_packs set
        status='ESCALATION_REQUIRED',
        content_map=coalesce(content_map,'{}'::jsonb) ||
          jsonb_build_object('generation_hold',true,'generation_failure_count',${generationFailures},'last_generation_error',${message})
      where id=${row.render_pack_id}::uuid
        and approved_reference=false`;

    await sql`update prospects set
        pipeline_status='RENDERING'::pipeline_status,
        render_status='ESCALATION_REQUIRED',
        current_step='GENERATION_HOLD',
        next_action='CABINA_CREATIVE_GENERATION_REVIEW',
        error=${message},
        updated_at=now()
      where id=${row.prospect_id}::uuid
        and render_status<>'RENDER_READY'`;
  } else {
    const active=await sql`select count(*)::int as n from render_jobs
      where worker='cloudflare-workers-ai'
        and status in ('RUNNING','COMPLETING')
        and input_data->>'render_pack_id'=${row.render_pack_id}`;
    if(Number(active[0]?.n || 0)===0) {
      const reset=await sql`update render_packs set
          status='ART_DIRECTION',
          content_map=coalesce(content_map,'{}'::jsonb) ||
            jsonb_build_object('generation_hold',false,'generation_failure_count',${generationFailures},'last_generation_error',${message})
        where id=${row.render_pack_id}::uuid
          and status='AI_RENDERING'
          and approved_reference=false
        returning id`;
      if(reset.length) {
        await sql`update prospects set
            pipeline_status='RENDER_REWORK'::pipeline_status,
            render_status='RENDER_REWORK',
            current_step='ART_DIRECTION',
            next_action='RETRY_AI_RENDER',
            error=${message},
            updated_at=now()
          where id=${row.prospect_id}::uuid
            and render_status<>'RENDER_READY'`;
      }
    }
  }

  await sql`insert into site_events(
      prospect_id,event_type,entity_type,entity_id,actor,from_status,to_status,payload
    ) values(
      ${row.prospect_id}::uuid,
      ${hold ? "CREATIVE_GENERATION_ESCALATION_REQUIRED" : "CREATIVE_GENERATION_RETRY"},
      'render_pack',${row.render_pack_id}::uuid,'rendering-studio-generator',
      'RENDERING'::pipeline_status,${hold ? "RENDERING" : "RENDER_REWORK"}::pipeline_status,
      ${JSON.stringify({
        generation_failures:generationFailures,
        max_generation_failures:MAX_GENERATION_FAILURES,
        error:message,
        engine_revision:CREATIVE_ENGINE_REVISION
      })}::jsonb
    )`;

  return {generationFailures,hold};
}

async function failGeneration(sql,row,jobId,error) {
  const message=String(error?.message || error || "AI_RENDER_FAILED").slice(0,600);
  const failed=await sql`update render_jobs set
      status='FAILED',error=${message},completed_at=now(),updated_at=now()
    where id=${jobId}::uuid
      and worker='cloudflare-workers-ai'
      and status in ('RUNNING','COMPLETING')
    returning id`;
  if(!failed.length) return;
  await applyGenerationFailureState(sql,row,message);
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

  await sql`update render_packs set
      official_logo=${JSON.stringify(workingRow.logo || {})}::jsonb,
      brand_dna=${JSON.stringify(workingRow.brand_dna || {})}::jsonb,
      source_references=${JSON.stringify(workingRow.source_data?.source_references || [])}::jsonb,
      content_map=coalesce(content_map,'{}'::jsonb) ||
        jsonb_build_object('brand_gate_frozen_pass',true,'brand_gate_frozen_pass_at',now())
    where id=${workingRow.render_pack_id}::uuid and approved_reference=false`;

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
    const discoveredFirstParty = await discoverFirstPartyImages(row.website_url);
    const approvedExternal = normalizeApprovedExternalAssets(row.source_data || {});
    const preVisionPayload = prospectPayload(row, discoveredFirstParty);
    const assetVision = await analyzeVisualAssetInventory(
      env,
      preVisionPayload,
      [...discoveredFirstParty,...approvedExternal]
    );
    const usableFirstParty=assetVision.usable.filter(x=>x.approved_external!==true);
    const usableExternal=assetVision.usable.filter(x=>x.approved_external===true);
    const creativeVisualAssets=assetVision.usable.filter(x=>{
      const role=String(x?.role || x?.vision_role || "").toLowerCase();
      if(role==="identity" || role==="trust" || role.includes("logo") || role.includes("badge")) return false;
      return Number(x?.hero_suitability || 0)>=6 || Number(x?.body_suitability || 0)>=6;
    });
    const assetMode=creativeVisualAssets.length ? "VERIFIED_VISUALS" : "ZERO_PHOTO_PREMIUM";
    const payload = prospectPayload(row, usableFirstParty);
    payload.approved_external_images=usableExternal;
    payload.asset_mode=assetMode;

    await sql`update render_packs set
        content_map=coalesce(content_map,'{}'::jsonb) ||
          ${JSON.stringify({
            visual_asset_inventory:assetVision.assets,
            visual_asset_inventory_count:assetVision.total,
            visual_asset_inventory_revision:"STRUCTURED_FIRST_PARTY_V3_ASSET_VISION",
            asset_vision_gate:{
              pass:assetVision.pass,
              revision:assetVision.revision,
              total:assetVision.total,
              reviewed:assetVision.reviewed,
              usable_count:assetVision.usable_count,
              rejected_count:assetVision.rejected_count
            },
            creative_asset_mode:assetMode,
            creative_visual_asset_count:creativeVisualAssets.length
          })}::jsonb
      where id=${row.render_pack_id}::uuid and approved_reference=false`;
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
      approvedExternalImages: payload.approved_external_images,
      assetMode,
      asset_mode:assetMode,
      visualReworkFeedback: feedbackRows.map(x => ({variant:x.variant_key, critique:x.visual_qa})),
      visualSetFeedback: row?.pack_content_map?.visual_set_qa_last_run || null,
      generationFailureFeedback: row?.pack_content_map?.last_generation_error || null,
      generationFailureCount: Number(row?.pack_content_map?.generation_failure_count || 0)
    };
    const studio = await generateRenderVariants(env, studioProspect);

    const directionGate=studio?.direction_set_gate || {};
    const directionScores=directionGate?.scores || {};
    const directionRequired=[
      "specificity_A","specificity_B","specificity_C",
      "feasibility_A","feasibility_B","feasibility_C",
      "diversity_AB","diversity_AC","diversity_BC"
    ];
    const directionGateValid=
      directionGate.pass===true &&
      Array.isArray(directionGate.issues) &&
      directionGate.issues.length===0 &&
      directionRequired.every(k=>Number.isFinite(Number(directionScores[k])) && Number(directionScores[k])>=8);
    if(!directionGateValid) throw new Error("DIRECTION_SET_GATE_EVIDENCE_REQUIRED");

    const htmlByKey = {};
    const directions = {};
    const preRenderGates = {};
    for (const variant of studio.variants || []) {
      const key=String(variant.key || "").toUpperCase();
      const semantic=variant?.gate?.semantic_content || {};
      if(!["A","B","C"].includes(key)) continue;
      if(variant?.gate?.pass!==true || semantic.pass!==true ||
         !Array.isArray(semantic.issues) || semantic.issues.length!==0) {
        throw new Error("SEMANTIC_PRE_RENDER_GATE_REQUIRED_"+key);
      }
      htmlByKey[key] = variant.html;
      directions[key] = variant.direction;
      preRenderGates[key] = variant.gate;
    }
    if (!htmlByKey.A || !htmlByKey.B || !htmlByKey.C) throw new Error("RENDERING_STUDIO_THREE_VARIANTS_REQUIRED");

    await sql`update render_packs set
        content_map=coalesce(content_map,'{}'::jsonb) ||
          ${JSON.stringify({
            creative_strategy:studio.creative_strategy || "",
            direction_set_gate:directionGate,
            creative_quality_revision:studio.creative_quality_revision || "V8.4_ZERO_PHOTO_DETERMINISTIC_REPAIR",
            creative_asset_mode:studio.asset_mode || assetMode,
            pre_render_semantic_gate_pass:true
          })}::jsonb
      where id=${row.render_pack_id}::uuid and approved_reference=false`;

    const persisted=await persistGeneratedPack(sql,row,jobId,htmlByKey,directions,preRenderGates);
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
      ${JSON.stringify({render_pack_id:row.render_pack_id,version:row.version,contract:"V8_2_CREATIVE_QUALITY",runtime_revision:"V8.3_DETERMINISTIC_SIX_VIEW_QA",engine_revision:CREATIVE_ENGINE_REVISION})}::jsonb,now()
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
  const packAssetRows=await sql`select content_map->'visual_asset_inventory' as asset_inventory
    from render_packs where id=${row.render_pack_id}::uuid limit 1`;
  const visualQaProspect = prospectPayload(
    prospectRows[0],
    Array.isArray(packAssetRows[0]?.asset_inventory) ? packAssetRows[0].asset_inventory : []
  );
  if (rows.length !== 3) {
    await sql`update render_packs set status='RENDERING' where id=${row.render_pack_id}::uuid and status='RENDERING_ASSETS'`;
    return {ok:false,pack_id:row.render_pack_id,error:"THREE_STAGED_VARIANTS_REQUIRED"};
  }

  const visualQa = [];
  const captured = [];

  const failTechnical = async (error) => {
    const message = String(error?.message || error || "RENDER_QA_TECHNICAL_FAILURE").slice(0, 600);
    await sql`update render_jobs set status='FAILED',error=${message},completed_at=now(),updated_at=now()
      where id=${browserJobId}::uuid`;

    const retryRows = await sql`select coalesce((content_map->>'technical_retry_count')::int,0)+1 as retry
      from render_packs where id=${row.render_pack_id}::uuid`;
    const technicalRetry = Number(retryRows[0]?.retry || 1);
    const technicalHold = technicalRetry >= MAX_TECH_RETRIES;

    await sql`update render_staging_payloads
      set status='RENDER_ERROR',render_error=${message},updated_at=now()
      where render_pack_id=${row.render_pack_id}::uuid
        and html_source is not null
        and status in ('VISUAL_QA_PENDING','VISUAL_QA_FAILED','VISUAL_QA_PASS','STAGED_SOURCE','RENDER_ERROR')`;
    await sql`update render_variants
      set status='RENDER_ERROR',desktop_render_url=null,mobile_render_url=null,selected=false,updated_at=now()
      where render_pack_id=${row.render_pack_id}::uuid
        and variant_key in ('A','B','C')
        and upper(coalesce(status,'')) not like '%REJECT%'
        and upper(coalesce(status,'')) not like '%ARCHIVED%'`;
    await sql`update render_packs set
        status=${technicalHold ? "TECHNICAL_HOLD" : "RENDERING"},
        content_map=coalesce(content_map,'{}'::jsonb) ||
          jsonb_build_object('technical_retry_count',${technicalRetry},'last_technical_error',${message})
      where id=${row.render_pack_id}::uuid and status='RENDERING_ASSETS'`;
    await sql`update prospects set
        render_status=${technicalHold ? "ESCALATION_REQUIRED" : "RENDERING"},
        current_step=${technicalHold ? "TECHNICAL_HOLD" : "RENDERING_ASSETS"},
        next_action=${technicalHold ? "CABINA_TECHNICAL_REVIEW" : "RETRY_BROWSER_RENDER"},
        error=${message},updated_at=now()
      where id=${row.prospect_id}::uuid`;
    return {ok:false,pack_id:row.render_pack_id,error:message,technical_retry:technicalRetry,technical_hold:technicalHold};
  };

  const browser = sharedBrowser || await puppeteer.launch(env.BROWSER);
  try {
    for (const item of rows) {
      const [desktop,mobile] = await Promise.all([
        renderHtml(browser,item.html_source,1440,900),
        renderHtml(browser,item.html_source,390,844)
      ]);
      const desktopB64=bytesToBase64(desktop.bytes);
      const mobileB64=bytesToBase64(mobile.bytes);
      captured.push({
        item,
        desktopB64,
        mobileB64,
        desktopDiagnostics:desktop.diagnostics,
        mobileDiagnostics:mobile.diagnostics
      });

      await sql`update render_staging_payloads set
          status='VISUAL_QA_PENDING',
          desktop_image_base64=${desktopB64},
          mobile_image_base64=${mobileB64},
          image_mime='image/jpeg',
          design_notes=coalesce(design_notes,'{}'::jsonb) ||
            ${JSON.stringify({render_diagnostics:{desktop:desktop.diagnostics,mobile:mobile.diagnostics}})}::jsonb,
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
    }
  } catch (error) {
    return await failTechnical(error);
  } finally {
    if (!sharedBrowser) await browser.close();
  }

  await sql`update render_jobs set status='QA_RUNNING',updated_at=now()
    where id=${browserJobId}::uuid and status='RUNNING'`;

  let setQa=null;
  try {
    const qaResults = await Promise.all(captured.map(async (frame) => {
      const item=frame.item;
      const deterministicIssues=deterministicRenderIssues(frame.desktopDiagnostics,frame.mobileDiagnostics);
      const qa = deterministicIssues.length
        ? deterministicFailQa(deterministicIssues)
        : await critiqueVisibleRender(
            env,
            master,
            visualQaProspect,
            item.variant_key,
            item.design_notes?.direction || {},
            frame.desktopB64,
            frame.mobileB64
          );
      return { variant_key:item.variant_key, variant_id:item.variant_id, staging_id:item.id, qa };
    }));

    visualQa.push(...qaResults);
    setQa=await critiqueVariantSet(env,visualQaProspect,captured,qaResults);

    await sql`update render_packs set
        content_map=coalesce(content_map,'{}'::jsonb) ||
          ${JSON.stringify({visual_set_qa_last_run:setQa})}::jsonb
      where id=${row.render_pack_id}::uuid`;

    await Promise.all(qaResults.map(async ({variant_id,staging_id,qa}) => {
      await sql`update render_staging_payloads set
          status=${qa.pass ? "VISUAL_QA_PASS" : "VISUAL_QA_FAILED"},
          design_notes=coalesce(design_notes,'{}'::jsonb) || ${JSON.stringify({visual_qa:qa})}::jsonb,
          updated_at=now()
        where id=${staging_id}::uuid`;

      await sql`update render_variants set
          status=${qa.pass ? "VISUAL_QA_PASS" : "VISUAL_QA_FAILED"},
          updated_at=now()
        where id=${variant_id}::uuid`;
    }));
  } catch (error) {
    return await failTechnical(error);
  }

  await sql`update render_packs set
      content_map=coalesce(content_map,'{}'::jsonb) || '{"technical_retry_count":0}'::jsonb
    where id=${row.render_pack_id}::uuid`;

  const failedVisualQa = visualQa.filter(x => !x.qa.pass);
  const setQaFailed = !setQa || setQa.pass!==true;
  if (visualQa.length !== 3 || failedVisualQa.length || setQaFailed) {
    const cycleRows = await sql`select coalesce((content_map->>'visual_rework_cycle')::int,0)+1 as cycle
      from render_packs where id=${row.render_pack_id}::uuid`;
    const cycle = Number(cycleRows[0]?.cycle || 1);
    const escalation = cycle >= MAX_VISUAL_REWORK_CYCLES;
    const qaSummary = visualQa.map(x => ({variant:x.variant_key, ...x.qa}));
    const combinedQa={variants:qaSummary,set:setQa};

    await sql`update render_packs set
        status=${escalation ? "ESCALATION_REQUIRED" : "ART_DIRECTION"},
        content_map=coalesce(content_map,'{}'::jsonb) ||
          ${JSON.stringify({visual_rework_cycle:cycle,visual_qa_last_run:qaSummary})}::jsonb
      where id=${row.render_pack_id}::uuid and approved_reference=false`;

    await sql`update render_jobs set
        status='COMPLETED',
        output_data=${JSON.stringify({variants:["A","B","C"],desktop_mobile:true,visual_qa_pass:false,set_qa_pass:false,visual_rework_cycle:cycle})}::jsonb,
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
        ${JSON.stringify({cycle,qa:combinedQa,model:VISUAL_QA_MODEL})}::jsonb
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

  await sql`update render_jobs set status='COMPLETED',output_data=${JSON.stringify({variants:["A","B","C"],desktop_mobile:true,visual_qa_pass:true,set_qa_pass:true})}::jsonb,
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
      ${JSON.stringify({version:row.version,variants:["A","B","C"],model:MODEL,contract:"V8_2_CREATIVE_QUALITY",runtime_revision:"V8.3_DETERMINISTIC_SIX_VIEW_QA",selection_required:true})}::jsonb
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
           where s.render_pack_id=rp.id
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

  const activeBrowserRows=await sql`select count(*)::int as n from render_jobs
    where worker='cloudflare-browser-renderer'
      and status='RUNNING'
      and started_at >= now()-interval '10 minutes'`;
  const activeBrowserJobs=Number(activeBrowserRows[0]?.n || 0);
  const browserSlots=Math.max(0,MAX_ACTIVE_BROWSER_JOBS-activeBrowserJobs);
  const readyToRender=browserSlots>0
    ? await renderCandidates(sql,Math.min(MAX_RENDER_PACKS_PER_TICK,browserSlots))
    : [];
  let rendered=[];
  let renderMaster="";
  if (readyToRender.length) {
    renderMaster=await loadFrozenMaster();
    rendered=await Promise.all(readyToRender.map(row=>renderPack(sql,env,row,null,renderMaster)));
  }

  const activeRows=await sql`select count(*)::int as n from render_jobs
    where worker='cloudflare-workers-ai' and status in ('RUNNING','COMPLETING')
      and started_at >= now()-interval '16 minutes'`;
  const active=Number(activeRows[0]?.n || 0);
  const generationPhaseAllowed=readyToRender.length===0;
  const slots=generationPhaseAllowed ? Math.max(0,MAX_PROSPECTS_PER_TICK-active) : 0;

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
    active_browser_jobs:activeBrowserJobs,
    browser_slots:browserSlots,
    active_generation_jobs:active,
    generation_slots:slots,
    generation_phase_allowed:generationPhaseAllowed,
    heavy_phase:readyToRender.length ? "BROWSER_QA" : (generated.length ? "AI_GENERATION" : "IDLE"),
    generated_count:generated.filter(x=>x.ok).length,
    render_ready_count:rendered.filter(x=>x.ok).length,
    generated,
    rendered
  };
}
