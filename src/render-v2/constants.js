export const QUALITY_CONTRACT_VERSION = "RS_QUALITY_V4_SHOWROOM_WOW";
export const EXECUTION_ENGINE_VERSION = "RS_ENGINE_V2_3_SHOWROOM_WOW";
export const COMPILER_VERSION = "RS_COMPILER_V1_4_PREMIUM_HOME";
export const MODEL_ROUTE_VERSION = "ROUTES_2026_10_D_SHOWROOM";
export const PROMPT_VERSION = "RENDER_V2_PROMPTS_V6_SHOWROOM_WOW";
export const REMEDIATION_POLICY_VERSION = "V2_CONTACT_PROVENANCE_V2";

export const VARIANT_KEYS = Object.freeze(["A","B","C"]);
export const MAX_VISUAL_REVISIONS = 5;
export const SAME_FAILURE_BREAKER = 2;

export const QA_SCORE_KEYS = Object.freeze([
  "first_impression","art_direction","prospect_specificity","brand_fidelity",
  "hero_strength","hero_relevance","hero_image_quality","hero_mobile_crop",
  "header_quality","navigation_quality","page_architecture","section_quality","final_cta_quality",
  "composition","typography","imagery","materiality","signature_visual_language",
  "rhythm","restraint","cta_integration","commercial_clarity","desktop_quality",
  "mobile_quality","footer_quality","no_template_feel","no_saas_feel",
  "no_ai_feel","truth_integrity","consistency",
  "logo_integration_quality","color_system_from_logo","typography_brand_fit","brand_identity_coherence",
  "hero_full_bleed_quality","hero_overlay_design","hero_copy_integration","hero_cta_quality","hero_desirability",
  "premium_feel","wow_effect","prospect_desire","preview_sales_power",
  "section_premium_quality","iconography_quality","graphic_support_quality","trust_visual_quality",
  "commercial_desirability","client_wow_effect",
  "luxury_b2b_feel","premium_visual_rhythm","editorial_showcase_quality","high_end_typography",
  "brand_elevation","cta_spectacle","showroom_conversion_power"
]);

export const DEFAULT_MODELS = Object.freeze({
  creative: "@cf/zai-org/glm-5.3-flash",
  generator: "@cf/zai-org/glm-5.3-flash",
  repair: "@cf/zai-org/glm-5.3-flash",
  codeFallback: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  visualQa: "@cf/qwen/qwen3.8-27b",
  setQa: "@cf/qwen/qwen3.8-27b",
  textFallback: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  visionFallback: "@cf/moonshotai/kimi-k2.7-code",
  heroImage: "@cf/black-forest-labs/flux-2-dev"
});

export const STEP_RETRY = Object.freeze({
  db: { limit: 2, delay: "2 seconds", backoff: "exponential" },
  provider: { limit: 1, delay: "3 seconds", backoff: "exponential" },
  browser: { limit: 1, delay: "3 seconds", backoff: "constant" },
  storage: { limit: 2, delay: "2 seconds", backoff: "exponential" }
});
