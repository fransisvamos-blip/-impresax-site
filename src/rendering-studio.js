const ART_MODEL = "@cf/openai/gpt-oss-120b";
const HTML_MODEL = "@cf/zai-org/glm-4.7-flash";
const FALLBACK_MODEL = "@cf/openai/gpt-oss-120b";
const MASTER_URL = "https://raw.githubusercontent.com/fransisvamos-blip/-impresax-site/9578da3fa1b173283bf5c748b0e7d89497537e76/docs/RENDERING_STUDIO_V1_FROZEN.md";

const MASTER_FALLBACK = [
  "RENDERING_STUDIO_V1 FROZEN.",
  "Verified data first. Official logo first and immutable. Never redraw or approximate it.",
  "Extract real Brand DNA before art direction.",
  "Art direction first. LoveFrom / Ferrari Luce is a quality benchmark, not a template.",
  "Virtually unlimited creative-budget mentality.",
  "Three genuinely different complete full-home directions A/B/C.",
  "Each direction requires full desktop 1440 and mobile 390 art direction.",
  "Editorial contemporary luxury, strong composition, typographic hierarchy, visual rhythm, materiality, restraint, signature imagery.",
  "No generic SaaS, no agency-template feel, no card-grid dependence, no fake proof, no invented facts.",
  "Commercially effective without aggressive sales tactics.",
  "Complete header, hero, body, verified offering, verified trust, conversion/contact path and footer.",
  "Mobile is a deliberate pass, not a broken desktop stack.",
  "Critique and rework before RENDER_READY. User selection is required before Site Factory."
].join("\n");

function aiText(result) {
  if (typeof result === "string") return result;
  if (typeof result?.response === "string") return result.response;
  if (typeof result?.output_text === "string") return result.output_text;
  if (typeof result?.result?.response === "string") return result.result.response;
  if (Array.isArray(result?.choices)) {
    const content = result.choices[0]?.message?.content;
    if (typeof content === "string") return content;
  }
  if (Array.isArray(result?.output)) {
    const parts = [];
    for (const item of result.output) {
      if (typeof item?.content === "string") parts.push(item.content);
      if (Array.isArray(item?.content)) {
        for (const part of item.content) {
          if (typeof part?.text === "string") parts.push(part.text);
        }
      }
    }
    if (parts.length) return parts.join("\n");
  }
  return "";
}

async function runModel(env, model, messages, maxTokens, temperature) {
  if (!env.AI || typeof env.AI.run !== "function") throw new Error("WORKERS_AI_BINDING_NOT_CONFIGURED");
  try {
    return await env.AI.run(model, {
      messages,
      max_tokens: maxTokens,
      temperature,
      top_p: 0.92
    });
  } catch (primaryError) {
    if (model === FALLBACK_MODEL) throw primaryError;
    return await env.AI.run(FALLBACK_MODEL, {
      messages,
      max_tokens: maxTokens,
      temperature,
      top_p: 0.92
    });
  }
}

function extractJson(text) {
  const raw = String(text || "").trim();
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  try { return JSON.parse(raw.slice(first, last + 1)); }
  catch { return null; }
}

function extractHtml(text) {
  let raw = String(text || "").trim();
  raw = raw.replace(/^\s*\`\`\`(?:html)?/i, "").replace(/\`\`\`\s*$/i, "").trim();
  let start = raw.toLowerCase().indexOf("<!doctype html");
  if (start < 0) start = raw.toLowerCase().indexOf("<html");
  const end = raw.toLowerCase().lastIndexOf("</html>");
  if (start < 0 || end < start) throw new Error("AI_HTML_DOCUMENT_REQUIRED");
  const html = raw.slice(start, end + 7).trim();
  if (html.length < 4500) throw new Error("AI_HTML_TOO_SHORT");
  if (html.length > 180000) throw new Error("AI_HTML_TOO_LARGE");
  if (/<script[\s>]/i.test(html) || /javascript\s*:/i.test(html)) throw new Error("AI_ACTIVE_SCRIPT_NOT_ALLOWED");
  if (/<iframe[\s>]/i.test(html) || /<object[\s>]/i.test(html) || /<embed[\s>]/i.test(html)) throw new Error("AI_EMBED_NOT_ALLOWED");
  return html;
}

function officialLogoUrl(prospect) {
  const logo = prospect?.logo || {};
  if (logo?.status === "PASS" && typeof logo?.url === "string" && logo.url.startsWith("https://")) return logo.url;
  if (logo?.status === "OFFICIAL_LOGO_LOCKED" && typeof logo?.url === "string") return logo.url;
  return null;
}

function verifiedImageHosts(prospect) {
  const hosts=new Set();
  const add=(value)=>{
    try {
      const u=new URL(String(value || ""));
      if (u.protocol==="https:") hosts.add(u.hostname.replace(/^www\./,"").toLowerCase());
    } catch {}
  };
  add(prospect?.websiteUrl || prospect?.website_url);
  const logo=prospect?.logo || {};
  add(logo.url || logo.official_source || logo.source_url);
  for (const ref of prospect?.sourceReferences || prospect?.source_references || []) add(ref);
  for (const img of prospect?.firstPartyImages || prospect?.first_party_images || []) add(img);
  return hosts;
}

function htmlImageUrls(html) {
  const urls=new Set();
  for (const m of String(html || "").matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
    if (/^https:\/\//i.test(m[1])) urls.add(m[1]);
  }
  for (const m of String(html || "").matchAll(/url\(\s*["']?(https:\/\/[^"'\)\s]+)["']?\s*\)/gi)) {
    urls.add(m[1]);
  }
  return [...urls];
}

function unverifiedImageUrls(html, prospect) {
  const allowed=verifiedImageHosts(prospect);
  const logo=officialLogoUrl(prospect);
  return htmlImageUrls(html).filter(value => {
    if (logo && value===logo) return false;
    try {
      const host=new URL(value).hostname.replace(/^www\./,"").toLowerCase();
      return ![...allowed].some(a => host===a || host.endsWith("."+a));
    } catch {
      return true;
    }
  });
}

function hardGate(html, prospect) {
  const issues = [];
  const logoUrl = officialLogoUrl(prospect);
  const lower = html.toLowerCase();

  if (!/<header[\s>]/i.test(html)) issues.push("header_missing");
  if (!/<footer[\s>]/i.test(html)) issues.push("footer_missing");
  if (!/<main[\s>]/i.test(html)) issues.push("main_missing");
  if ((html.match(/<section[\s>]/gi) || []).length < 4) issues.push("body_too_thin");
  if ((html.match(/<h[12][\s>]/gi) || []).length < 3) issues.push("hierarchy_too_thin");
  if (!/@media/i.test(html)) issues.push("mobile_pass_missing");
  if (!/viewport/i.test(html)) issues.push("viewport_missing");
  if (logoUrl && !html.includes(logoUrl)) issues.push("official_logo_not_used");
  if (/lorem ipsum|coming soon|your company/i.test(html)) issues.push("placeholder_copy");
  if (!/mailto:|tel:/i.test(html) && prospect?.verifiedContacts) issues.push("verified_contact_path_missing");
  if (!/<img[\s>]/i.test(html) && !/background-image/i.test(html)) {
    const imageryOptional = String(prospect?.logo?.status || "").toUpperCase()==="NO_OFFICIAL_LOGO_CONFIRMED";
    if (!imageryOptional) issues.push("imagery_missing");
  }
  const unverifiedImages=unverifiedImageUrls(html,prospect);
  if (unverifiedImages.length) issues.push("unverified_image_provenance:" + unverifiedImages.slice(0,4).join("|"));
  if (String(prospect?.logo?.status || "").toUpperCase()==="NO_OFFICIAL_LOGO_CONFIRMED") {
    if (/\b(?:logo|monogram|mark|emblem)\b/i.test(html) && !String(prospect?.businessName || prospect?.business_name || "").trim()) {
      issues.push("invented_identity_mark_risk");
    }
  }
  if (lower.includes("award-winning") || lower.includes("leader di mercato") || lower.includes("n. 1")) issues.push("unverified_claim_risk");

  return { pass: issues.length === 0, issues, image_provenance:{verified_hosts:[...verifiedImageHosts(prospect)],image_urls:htmlImageUrls(html)} };
}

function validDirections(parsed) {
  if (!parsed?.A || !parsed?.B || !parsed?.C) return false;
  const values = [parsed.A, parsed.B, parsed.C].map(v => String(v || "").trim());
  if (values.some(v => v.length < 120)) return false;
  if (new Set(values.map(v => v.toLowerCase())).size !== 3) return false;
  return true;
}

async function deriveIndependentDirection(env, master, prospect, key) {
  const contrast = {
    A: "Make this direction identity-led: let the verified brand DNA, material/visual signature and typographic composition determine the page architecture.",
    B: "Make this direction evidence-and-imagery-led: build a cinematic but credible narrative around the prospect's real work, offer, territory and first-party evidence.",
    C: "Make this direction precision-and-information-led: create a highly designed editorial system where hierarchy, verified detail and commercial clarity become the visual signature."
  }[key];

  const prompt = [
    "Create ONE original premium full-home art-direction brief for ImpresaX Rendering Studio.",
    "Variant: " + key,
    contrast,
    "This is NOT a template family. Every decision must be justified by THIS prospect's verified logo, Brand DNA, services, trust, local context and imagery evidence.",
    "Specify hero logic, grid/composition, typography behavior, imagery language, visual rhythm, signature device, section progression, CTA treatment, desktop behavior and deliberate mobile reinterpretation.",
    "Do not write HTML. Do not invent company facts. Do not use generic SaaS/card-grid/agency tropes.",
    "Return only the detailed art-direction brief as plain text, without JSON.",
    "",
    "FROZEN MASTER:",
    master,
    "",
    "VERIFIED PROSPECT:",
    JSON.stringify(prospect)
  ].join("\n");

  const result = await runModel(env, ART_MODEL, [
    { role:"system", content:"You are ImpresaX Rendering Studio senior art director. Produce a prospect-specific flagship direction, never a generic sector template." },
    { role:"user", content:prompt }
  ], 1800, 0.48);

  const text = aiText(result).trim();
  if (text.length < 180) throw new Error("PROSPECT_SPECIFIC_ART_DIRECTION_REQUIRED");
  return text;
}

async function deriveDirections(env, master, prospect) {
  const prompt = [
    "Create three distinct art-direction briefs A/B/C for one premium business homepage.",
    "Do not write HTML yet.",
    "Each brief must be prospect-specific, not reusable as a sector template.",
    "They must differ materially in hero logic, grid, typography, imagery language, rhythm, signature device, information hierarchy and CTA treatment.",
    "Base every direction on the verified logo, Brand DNA, real services, real trust, local context and available first-party imagery.",
    "If the verified prospect data is too weak to create three genuinely prospect-specific directions, say INSUFFICIENT_VERIFIED_BRAND_INPUT instead of inventing.",
    "Return ONLY valid JSON in this exact shape: {\"A\":\"...\",\"B\":\"...\",\"C\":\"...\"}.",
    "",
    "FROZEN MASTER:",
    master,
    "",
    "PROSPECT:",
    JSON.stringify(prospect)
  ].join("\n");

  const result = await runModel(env, ART_MODEL, [
    { role: "system", content: "You are ImpresaX Rendering Studio art director. Generic fallback directions are forbidden. Be prospect-specific, premium and commercially grounded." },
    { role: "user", content: prompt }
  ], 2200, 0.42);

  const raw = aiText(result);
  let parsed = extractJson(raw);
  if (validDirections(parsed)) return parsed;

  const repairPrompt = [
    "Normalize or recreate the following art-direction output into STRICT JSON only.",
    "Do not simplify, generalize or replace it with generic sector directions.",
    "Use the verified prospect data below to preserve or increase prospect specificity.",
    "Return exactly: {\"A\":\"...\",\"B\":\"...\",\"C\":\"...\"}.",
    "Each value must be a detailed, prospect-specific art-direction brief of at least 120 characters.",
    "If the inputs do not support prospect-specific art direction, return {\"error\":\"INSUFFICIENT_VERIFIED_BRAND_INPUT\"}.",
    "",
    "RAW ART-DIRECTOR OUTPUT:",
    raw || "(empty)",
    "",
    "VERIFIED PROSPECT:",
    JSON.stringify(prospect),
    "",
    "FROZEN MASTER:",
    master
  ].join("\n");

  const repaired = await runModel(env, HTML_MODEL, [
    { role: "system", content: "You are a strict structured-output editor. Output valid JSON only; generic fallback directions are forbidden." },
    { role: "user", content: repairPrompt }
  ], 2400, 0.2);

  parsed = extractJson(aiText(repaired));
  if (validDirections(parsed)) return parsed;

  const [A,B,C] = await Promise.all([
    deriveIndependentDirection(env,master,prospect,"A"),
    deriveIndependentDirection(env,master,prospect,"B"),
    deriveIndependentDirection(env,master,prospect,"C")
  ]);
  const independent = {A,B,C};
  if (!validDirections(independent)) throw new Error("PROSPECT_SPECIFIC_ART_DIRECTION_REQUIRED");
  return independent;
}

function buildVariantPrompt(master, prospect, key, direction, repairIssues, previousHtml) {
  const parts = [
    "Build ONE complete premium homepage implementation reference for ImpresaX Rendering Studio.",
    "Variant: " + key,
    "Art direction: " + direction,
    "",
    "FROZEN MASTER:",
    master,
    "",
    "VERIFIED PROSPECT DATA:",
    JSON.stringify(prospect),
    "",
    "NON-NEGOTIABLE OUTPUT:",
    "- Return ONLY one complete standalone HTML document, starting with <!doctype html> and ending with </html>.",
    "- Embedded CSS only. NO JavaScript. NO iframe/object/embed.",
    "- Full desktop art direction for 1440px and deliberate mobile art direction for 390px.",
    "- Complete header/navigation, distinctive hero, at least four meaningful body sections, verified offering, verified trust/evidence where available, conversion/contact section and footer.",
    "- Use ONLY verified facts in the supplied prospect data. Do not invent staff, projects, awards, branches, clients, metrics or capabilities.",
    "- If an official logo URL is supplied and marked verified, use that exact URL in <img>; never redraw, restyle, spell or approximate the logo.",
    "- Use imagery ONLY from the supplied verified first-party/source URLs. Do not introduce Unsplash, Pexels, random stock, AI-image URLs or any unverified external image host.",
    "- If verified imagery is insufficient, solve the page with typography, verified logo, material/color fields, geometry and negative space. Never fake company staff, facilities, projects or premises.",
    "- Typography and composition must do most of the design work. Avoid generic cards, gradients, glows, glassmorphism, blobs, dashboards and SaaS tropes.",
    "- CTA language must match the verified business and contacts.",
    "- If verified contact data exists, include at least one clickable tel: and/or mailto: link using ONLY the verified phone/email values.",
    "- Include responsive @media rules that materially redesign mobile hierarchy and spacing.",
    "- Keep the HTML compact enough to render fast while looking like a flagship custom design."
  ];

  if (repairIssues?.length && previousHtml) {
    parts.push(
      "",
      "REWORK PASS. The previous draft failed these gates:",
      repairIssues.join(", "),
      "Repair the failures without flattening the art direction.",
      "PREVIOUS HTML:",
      previousHtml
    );
  }

  return parts.join("\n");
}

async function generateOne(env, master, prospect, key, direction) {
  let lastError = null;
  let previousHtml = null;
  let repairIssues = [];

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const retryNote = attempt > 1
        ? [
            "",
            "STRICT RETRY " + attempt + ": the prior model response was unusable.",
            "Failure: " + (lastError?.message || repairIssues.join(", ") || "invalid HTML output"),
            "Return exactly one complete HTML document. No markdown, no commentary, no truncation."
          ].join("\n")
        : "";

      const result = await runModel(env, HTML_MODEL, [
        {
          role: "system",
          content: attempt === 1
            ? "You are a senior editorial web art director and frontend designer. Output production-grade HTML only."
            : "You are repairing a failed homepage generation. Output one complete standalone HTML document only."
        },
        {
          role: "user",
          content: buildVariantPrompt(
            master,
            prospect,
            key,
            direction,
            previousHtml ? repairIssues : null,
            previousHtml
          ) + retryNote
        }
      ], 9000, attempt === 1 ? 0.52 : 0.32);

      const html = extractHtml(aiText(result));
      const gate = hardGate(html, prospect);
      if (gate.pass) return { key, html, direction, gate };

      previousHtml = html;
      repairIssues = gate.issues;
      lastError = new Error("QUALITY_GATE_" + gate.issues.join("_"));
    } catch (error) {
      lastError = error;
      if (!previousHtml) repairIssues = [String(error?.message || error)];
    }
  }

  throw lastError || new Error("VARIANT_" + key + "_GENERATION_FAILED");
}
async function loadMaster() {
  try {
    const r = await fetch(MASTER_URL, { headers: { "Cache-Control": "no-cache" } });
    if (r.ok) {
      const text = await r.text();
      if (text && text.length > 1000) return text;
    }
  } catch {}
  return MASTER_FALLBACK;
}

export async function generateRenderVariants(env, prospect) {
  const master = await loadMaster();
  const directions = await deriveDirections(env, master, prospect);

  const variants = await Promise.all([
    generateOne(env, master, prospect, "A", directions.A),
    generateOne(env, master, prospect, "B", directions.B),
    generateOne(env, master, prospect, "C", directions.C)
  ]);

  return {
    master: "RENDERING_STUDIO_V1_FROZEN",
    master_commit: "9578da3fa1b173283bf5c748b0e7d89497537e76",
    model: HTML_MODEL,
    variants
  };
}
