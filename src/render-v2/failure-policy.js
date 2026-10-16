import { sha256, normalizeText } from "./utils.js";

export function classifyFailure(error, context={}) {
  const message=normalizeText(error?.message || error || "UNKNOWN",1200);
  const lower=message.toLowerCase();
  let failure_domain="UNKNOWN", failure_code="UNKNOWN_FAILURE", retryable=false;

  if (/hard_budget_exceeded/.test(lower)) {
    failure_domain="BUDGET"; failure_code="HARD_BUDGET_EXCEEDED"; retryable=false;
  } else if (/timeout|timed out|connection closed|network|fetch failed|5\d\d/.test(lower)) {
    failure_domain="INFRA"; failure_code="TRANSIENT_INFRA_FAILURE"; retryable=true;
  }
  if (/429|rate limit|model unavailable|provider/.test(lower)) {
    failure_domain="AI_PROVIDER"; failure_code="AI_PROVIDER_FAILURE"; retryable=true;
  }
  if (/json mode|schema|structured output|invalid json/.test(lower)) {
    failure_domain="AI_OUTPUT_SCHEMA"; failure_code="AI_OUTPUT_SCHEMA_FAILURE"; retryable=true;
  }
  if (/logo|identity|verified contact|source reference|input_blocked/.test(lower)) {
    failure_domain="INPUT_DATA"; failure_code="INPUT_DATA_FAILURE"; retryable=false;
  }
  if (/asset|image provenance|license|r2 input asset/.test(lower)) {
    failure_domain="ASSET"; failure_code="ASSET_FAILURE"; retryable=false;
  }
  if (/render_spec|compile|token|unsafe|forbidden|literal copy|html/.test(lower)) {
    failure_domain="STRUCTURAL_GENERATION"; failure_code="STRUCTURAL_GENERATION_FAILURE"; retryable=false;
  }
  if (/browser|screenshot|page crash|chromium/.test(lower)) {
    failure_domain="BROWSER"; failure_code="BROWSER_FAILURE"; retryable=true;
  }
  if (/truth|unsupported claim|semantic/.test(lower)) {
    failure_domain="CONTENT_TRUTH"; failure_code="CONTENT_TRUTH_FAILURE"; retryable=false;
  }
  if (/visual quality|quality_below|typography|composition|mobile quality/.test(lower)) {
    failure_domain="VISUAL_QUALITY"; failure_code="VISUAL_QUALITY_FAILURE"; retryable=false;
  }
  if (/diversity|too similar|set qa/.test(lower)) {
    failure_domain="SET_DIVERSITY"; failure_code="SET_DIVERSITY_FAILURE"; retryable=false;
  }
  if (/hash mismatch|invariant|multiple selected|certification bypass/.test(lower)) {
    failure_domain="SYSTEM_INVARIANT"; failure_code="SYSTEM_INVARIANT_FAILURE"; retryable=false;
  }

  return { failure_domain, failure_code, retryable, message, context };
}

export async function failureFingerprint(failure) {
  const source=[
    failure.failure_domain,
    failure.failure_code,
    failure.context?.step || "",
    failure.context?.variant_key || "",
    failure.context?.revision || "",
    failure.message
      .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi,"<uuid>")
      .replace(/\d{3,}/g,"<n>")
      .slice(0,500)
  ].join("|");
  return sha256(source);
}

export function shouldChangeStrategy(sameFingerprintCount) {
  return Number(sameFingerprintCount||0) >= 2;
}
