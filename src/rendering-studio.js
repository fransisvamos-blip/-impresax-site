const ART_MODEL = "@cf/openai/gpt-oss-120b";
const HTML_MODEL = "@cf/openai/gpt-oss-20b";
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
  if (/lorem ipsum|placeholder|coming soon|your company/i.test(html)) issues.push("placeholder_copy");
  if (!/mailto:|tel:/i.test(html) && prospect?.verifiedContacts) issues.push("verified_contact_path_missing");
  if (!/<img[\s>]/i.test(html) && !/background-image/i.test(html)) issues.push("imagery_missing");
  if (lower.includes("award-winning") || lower.includes("leader di mercato") || lower.includes("n. 1")) issues.push("unverified_claim_risk");

  return { pass: issues.length === 0, issues };
}

function directionFallbacks(prospect) {
  const dna = prospect?.brandDna || {};
  const signature = dna.visual_signature || dna.materiality || dna.local_character || prospect.vertical || "real business";
  return {
    A: "Editorial flagship direction built around the prospect-specific signature: " + signature + ". Monumental hierarchy, asymmetric composition, strong material evidence and restrained conversion.",
    B: "Image-led operational narrative derived from the prospect's real work and territory. Immersive but credible photography, cinematic pacing, sparse typography, direct commercial path.",
    C: "Precision architecture direction derived from the prospect's real business logic. Distinctive typographic system, structured information rhythm, measured technical details, high-end editorial restraint."
  };
}

async function deriveDirections(env, master, prospect) {
  const fallback = directionFallbacks(prospect);
  const prompt = [
    "Create three distinct art-direction briefs A/B/C for one premium business homepage.",
    "Do not write HTML yet.",
    "Each brief must be prospect-specific, not reusable as a sector template.",
    "They must differ materially in hero logic, grid, typography, imagery language, rhythm, signature device, information hierarchy and CTA treatment.",
    "Return ONLY valid JSON in this exact shape: {\"A\":\"...\",\"B\":\"...\",\"C\":\"...\"}.",
    "",
    "FROZEN MASTER:",
    master,
    "",
    "PROSPECT:",
    JSON.stringify(prospect)
  ].join("\n");

  try {
    const result = await runModel(env, ART_MODEL, [
      { role: "system", content: "You are ImpresaX Rendering Studio art director. Be specific, premium and commercially grounded." },
      { role: "user", content: prompt }
    ], 1400, 0.5);
    const parsed = extractJson(aiText(result));
    if (parsed?.A && parsed?.B && parsed?.C) return parsed;
  } catch {}
  return fallback;
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
    "- Use credible real/category photography via stable HTTPS URLs only when it improves comprehension. Never fake company staff or facilities.",
    "- Typography and composition must do most of the design work. Avoid generic cards, gradients, glows, glassmorphism, blobs, dashboards and SaaS tropes.",
    "- CTA language must match the verified business and contacts.",
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
  let result = await runModel(env, HTML_MODEL, [
    { role: "system", content: "You are a senior editorial web art director and frontend designer. Output production-grade HTML only." },
    { role: "user", content: buildVariantPrompt(master, prospect, key, direction, null, null) }
  ], 9000, 0.56);

  let html = extractHtml(aiText(result));
  let gate = hardGate(html, prospect);

  if (!gate.pass) {
    result = await runModel(env, HTML_MODEL, [
      { role: "system", content: "You are a senior editorial web art director fixing a premium homepage without changing its core direction. Output HTML only." },
      { role: "user", content: buildVariantPrompt(master, prospect, key, direction, gate.issues, html) }
    ], 9000, 0.46);
    html = extractHtml(aiText(result));
    gate = hardGate(html, prospect);
  }

  if (!gate.pass) throw new Error("VARIANT_" + key + "_QUALITY_GATE_" + gate.issues.join("_"));
  return { key, html, direction, gate };
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
