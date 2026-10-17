export const QUALITY_CONTRACT_VERSION = "RS_QUALITY_V8_LAUNCH_GRADE";
export const EXECUTION_ENGINE_VERSION = "RS_ENGINE_V2_7_LAUNCH_GRADE";
export const COMPILER_VERSION = "RS_COMPILER_V1_8_LAUNCH_GRADE";
export const MODEL_ROUTE_VERSION = "ROUTES_2026_10_D_SHOWROOM";
export const PROMPT_VERSION = "RENDER_V2_PROMPTS_V10_LAUNCH_GRADE";
export const REMEDIATION_POLICY_VERSION = "V6_LAUNCH_GRADE_POLICY";
export const SHOWROOM_RULES_VERSION = "IMPRESAX_RENDER_STANDARD_R90_LAUNCH_GRADE_SPECTACLE_V1";
export const RENDER_GENERATION_MODE = "CHATGPT_CABINA_ZERO_EXTRA_AI";
export const EXTERNAL_AI_CALLS_ALLOWED = false;
export const MIN_SECTION_VISUALS = 3;

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
  "brand_elevation","cta_spectacle","showroom_conversion_power",
  "section_imagery_quality","real_imagery_credibility","copy_sophistication",
  "section_copy_distinctness","visual_storytelling","surface_personalization",
  "background_art_direction","brand_motif_integration","no_flat_color_blocks",
  "brand_color_presence","chromatic_rhythm","surface_richness","watermark_visibility",
  "launch_grade_art_direction","cinematic_tension","spectacle_moments","scale_contrast",
  "iconic_brand_presence","custom_composition","material_depth","editorial_drama"
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
