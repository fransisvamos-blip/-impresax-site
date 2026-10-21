export const QUALITY_CONTRACT_VERSION = "RS_QUALITY_V14_R112_SECTION_SUBSTANCE";
export const EXECUTION_ENGINE_VERSION = "RS_ENGINE_V2_13_R112_SECTION_SUBSTANCE";
export const COMPILER_VERSION = "RS_COMPILER_V1_14_R112_SECTION_SUBSTANCE";
export const MODEL_ROUTE_VERSION = "ROUTES_2026_10_D_SHOWROOM";
export const PROMPT_VERSION = "RENDER_V2_PROMPTS_V16_R112_SECTION_SUBSTANCE";
export const REMEDIATION_POLICY_VERSION = "V12_R107_MEDIA_DISCOVERY_ZERO_AI_POLICY";
export const SHOWROOM_RULES_VERSION = "IMPRESAX_RENDER_STANDARD_R112_SECTION_SUBSTANCE_V1";
export const RENDER_GENERATION_MODE = "CHATGPT_CABINA_ZERO_EXTRA_AI";
export const EXTERNAL_AI_CALLS_ALLOWED = false;
export const MIN_SECTION_VISUALS = 3;
export const HERO_TEXT_OVER_IMAGE_REQUIRED = true;
export const HERO_OVERLAY_LEGIBILITY_REQUIRED = true;
export const HIGH_RESOLUTION_VISUAL_PERCEPTION_REQUIRED = true;
export const SITEWIDE_VISUAL_POLISH_REQUIRED = true;
export const PREMIUM_TYPOGRAPHY_REQUIRED = true;
export const CHEAP_AI_LOOK_FORBIDDEN = true;
export const LOW_DETAIL_IMAGERY_FORBIDDEN = true;
export const RENDER_DEVICE_SCALE_FACTOR = 2;
export const RENDER_JPEG_QUALITY = 96;
export const QA_JPEG_QUALITY = 72;
export const HERO_FIRST_PIPELINE_REQUIRED = true;
export const HERO_SELECTION_PREMIUM_RANKING_REQUIRED = true;
export const TEXT_BACKGROUND_CONTRAST_REQUIRED = true;
export const FULL_SIZE_CLIENT_PREVIEW_REQUIRED = true;
export const PREMIUM_SECTION_POLISH_REQUIRED = true;
export const SECTION_COHERENCE_STANDARD = "R108_SECTION_COHERENCE_STRICT_V1";
export const ART_DIRECTION_STANDARD = "R109_15K_ART_DIRECTION_GATE_V1";
export const SECTION_ARCHITECTURE_STANDARD = "R110_SECTION_FIRST_PREMIUM_ARCHITECTURE_V1";
export const HOME_DEPTH_STANDARD = "R111_15K_HOME_DEPTH_ARCHITECTURE_V1";
export const MIN_HOME_SECTIONS = 8;
export const MAX_HOME_SECTIONS = 12;
export const MIN_HOME_EDITORIAL_FEATURES = 2;
export const MIN_HOME_SUBSTANTIAL_SECTIONS = 7;
export const SECTION_SUBSTANCE_STANDARD = "R112_SECTION_SUBSTANCE_COMMERCIAL_DEPTH_V1";
export const MIN_WHY_US_REASONS = 4;
export const MAX_WHY_US_REASONS = 6;
export const MIN_HIGH_VALUE_MIDDLE_SECTIONS = 3;
export const MIN_RICH_EDITORIAL_FEATURES = 2;
export const CTA_DUPLICATION_FORBIDDEN = true;
export const EMPTY_DECORATIVE_SECTION_FORBIDDEN = true;
export const PREMIUM_BUTTON_SYSTEM_REQUIRED = true;
export const MATERIAL_DEPTH_REQUIRED = true;
export const DETAIL_CRAFT_STANDARD = "R113_DETAIL_CRAFTSMANSHIP_V1";
export const PREMIUM_SECTION_IDENTITY_STANDARD = "R115_PREMIUM_SECTION_IDENTITY_FINISHING_V1";
export const FLAGSHIP_ARCHITECTURE_STANDARD = "R116_FLAGSHIP_PREMIUM_ARCHITECTURE_V1";
export const AUTHORED_FLAGSHIP_STANDARD = "R117_AUTHORED_FLAGSHIP_15K_V1";
export const AUTHORED_FLAGSHIP_SCORE_FLOOR = 90;
export const AUTHORED_FLAGSHIP_DIMENSION_FLOOR = 8;
export const AUTHORED_FLAGSHIP_WOW_MOMENTS = 3;
export const AUTHORED_FLAGSHIP_PORTFOLIO_PASS_MIN = 4;
export const PERCEPTUAL_FLAGSHIP_STANDARD = "R118_PERCEPTUAL_JURY_V1";
export const PERCEPTUAL_VISUAL_QA_REQUIRED = true;
export const PERCEPTUAL_VISUAL_QA_FLOOR = 9.6;
export const PERCEPTUAL_CRITICAL_FLOOR = 9.7;
export const R118_EXTERNAL_GENERATION_ALLOWED = true;
export const R118_EXTERNAL_VISUAL_QA_ALLOWED = true;
export const R118_FAST_VISUAL_REVISIONS = 2;
export const R118_FAST_JURY_MODEL = "@cf/zai-org/glm-5.3-flash";
export const R118_QA_DEVICE_SCALE_FACTOR = 1;
export const R118_QA_JPEG_QUALITY = 58;
export const SERVICE_INDEX_ALIGNMENT_REQUIRED = true;
export const EDITORIAL_FEATURE_IMAGE_REQUIRED_WHEN_AVAILABLE = true;
export const TRUST_BACKGROUND_IMAGE_PREFERRED = true;
export const DEMO_PARTNER_PLACEHOLDER_ALLOWED = true;

// Delivery policy: new prospect packs ship one ImpresaX-authored concept.
// Legacy A/B/C packs remain readable/recoverable for backward compatibility.
export const DELIVERY_RENDER_MODE = "SINGLE_CONCEPT";
export const DELIVERY_VARIANT_KEYS = Object.freeze(["A"]);
export const DELIVERY_VARIANTS_PER_PACK = 1;

export const VARIANT_KEYS = Object.freeze(["A"]);
export const TRIPLE_VARIANT_REQUIRED = false;
export const MINIMUM_VARIANTS_PER_PACK = 1;
export const VARIANT_DIVERGENCE_REQUIRED = false;
export const VARIANT_DIVERGENCE_FLOOR = 0;
export const STRUCTURAL_DIVERGENCE_REQUIRED = false;
export const STRUCTURAL_DOM_SIMILARITY_CEILING = 0.72;
export const STRUCTURAL_HERO_SIMILARITY_CEILING = 0.70;
export const STRUCTURAL_SECTION_POSITION_SIMILARITY_CEILING = 0.75;
export const STRUCTURAL_DISTINCT_SECTION_ORDER_REQUIRED = false;
export const AUTO_SELECT_VARIANT_WINNER = false;
export const MASTER_AUTO_APPROVE = false;
export const VARIANT_CREATIVE_ROLES = Object.freeze({
  A:"IMPRESAX_MASTER_CONCEPT"
});
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
  "luxury_b2b_feel","premium_visual_rhythm","editorial_showcase_quality",
  "flagship_presence","section_identity","editorial_composition","luxury_simplicity","fifteen_k_credibility","high_end_typography",
  "brand_elevation","cta_spectacle","showroom_conversion_power",
  "section_imagery_quality","real_imagery_credibility","copy_sophistication",
  "section_copy_distinctness","visual_storytelling","surface_personalization",
  "background_art_direction","brand_motif_integration","no_flat_color_blocks",
  "brand_color_presence","chromatic_rhythm","surface_richness","watermark_visibility",
  "launch_grade_art_direction","cinematic_tension","spectacle_moments","scale_contrast",
  "iconic_brand_presence","custom_composition","material_depth","editorial_drama",
  "text_breathing","responsive_type_quality","hero_full_bleed","copy_density_control",
  "desktop_readability_balance","mobile_readability_balance","font_fit_and_originality",
  "headline_line_break_quality","spacing_rhythm",
  "header_composition_quality","navigation_professionalism","footer_composition_quality","footer_professionalism",
  "custom_made_feel","premium_art_direction","hero_wow_effect","brand_specificity",
  "imagery_premium_credibility","sales_structure_quality","detail_refinement",
  "mobile_premium_integrity","fifteen_k_value_perception",
  "irreproducible_brand_authorship","commissioned_experience_quality",
  "scroll_narrative_continuity","signature_system_coherence","editorial_campaign_quality",
  "transition_art_direction","visual_memory_factor","hero_text_on_image_integration",
  "hero_overlay_legibility",
  "sitewide_visual_refinement",
  "image_quality_perception",
  "premium_typography_quality",
  "anti_template_feel",
  "anti_fake_ai_credibility",
  "homepage_richness","section_depth","content_architecture","commercial_story_depth",
  "section_substance","commercial_depth","middle_scroll_value","why_us_strength",
  "anti_empty_layout","cta_distinction","mobile_density_quality",
  "micro_alignment_quality","service_module_quality","section_image_completeness","partner_showcase_quality",
  "cross_viewport_art_direction"
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
