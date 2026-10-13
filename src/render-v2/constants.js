export const QUALITY_CONTRACT_VERSION = "RS_QUALITY_V1";
export const EXECUTION_ENGINE_VERSION = "RS_ENGINE_V2_0";
export const COMPILER_VERSION = "RS_COMPILER_V1";
export const MODEL_ROUTE_VERSION = "ROUTES_2026_10_A";
export const PROMPT_VERSION = "RENDER_V2_PROMPTS_V1";

export const VARIANT_KEYS = Object.freeze(["A","B","C"]);
export const MAX_VISUAL_REVISIONS = 5;
export const SAME_FAILURE_BREAKER = 2;

export const QA_SCORE_KEYS = Object.freeze([
  "first_impression","art_direction","prospect_specificity","brand_fidelity",
  "composition","typography","imagery","materiality","signature_visual_language",
  "rhythm","restraint","cta_integration","commercial_clarity","desktop_quality",
  "mobile_quality","footer_quality","no_template_feel","no_saas_feel",
  "no_ai_feel","truth_integrity","consistency"
]);

export const DEFAULT_MODELS = Object.freeze({
  creative: "@cf/moonshotai/kimi-k2.7-code",
  generator: "@cf/moonshotai/kimi-k2.7-code",
  repair: "@cf/moonshotai/kimi-k2.7-code",
  visualQa: "@cf/qwen/qwen3.8-27b",
  setQa: "@cf/qwen/qwen3.8-27b",
  textFallback: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  visionFallback: "@cf/moonshotai/kimi-k2.7-code"
});

export const STEP_RETRY = Object.freeze({
  db: { limit: 2, delay: "2 seconds", backoff: "exponential" },
  provider: { limit: 1, delay: "3 seconds", backoff: "exponential" },
  browser: { limit: 1, delay: "3 seconds", backoff: "constant" },
  storage: { limit: 2, delay: "2 seconds", backoff: "exponential" }
});
