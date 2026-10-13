export function recoveryDecision({failureDomain,sameFingerprintCount=1,hasPreview=false}) {
  const count=Number(sameFingerprintCount||1);
  const preserve=Boolean(hasPreview);

  if(failureDomain==="INPUT_DATA" || failureDomain==="ASSET") {
    return {action:"INPUT_BLOCKED",retry:false,preserve_artifacts:true};
  }
  if(failureDomain==="SYSTEM_INVARIANT") {
    return {action:"STOP_AND_ESCALATE",retry:false,preserve_artifacts:true};
  }
  if(failureDomain==="VISUAL_QUALITY") {
    return {action:"REWORK_VARIANT_ONLY",retry:false,preserve_artifacts:true};
  }
  if(failureDomain==="SET_DIVERSITY") {
    return {action:"REWORK_WEAKEST_VARIANT_ONLY",retry:false,preserve_artifacts:true};
  }
  if(failureDomain==="STRUCTURAL_GENERATION") {
    return {action:count>=2?"CHANGE_VARIANT_STRATEGY":"REPAIR_VARIANT_ONLY",retry:false,preserve_artifacts:true};
  }
  if(failureDomain==="BROWSER") {
    return count<2
      ? {action:"RETRY_CAPTURE_ONLY",retry:true,preserve_artifacts:true}
      : {action:"ESCALATE_BROWSER",retry:false,preserve_artifacts:true};
  }
  if(failureDomain==="AI_PROVIDER" || failureDomain==="AI_OUTPUT_SCHEMA" || failureDomain==="INFRA") {
    return count<2
      ? {action:"RETRY_SAME_STEP_OR_FALLBACK",retry:true,preserve_artifacts:true}
      : {action:"ESCALATE_PROVIDER_OR_INFRA",retry:false,preserve_artifacts:true};
  }
  if(failureDomain==="CONTENT_TRUTH") {
    return {action:"REPAIR_CONTENT_TRUTH_ONLY",retry:false,preserve_artifacts:true};
  }
  return count<2
    ? {action:"ONE_SAFE_RETRY",retry:true,preserve_artifacts:preserve}
    : {action:"ESCALATE_UNKNOWN",retry:false,preserve_artifacts:true};
}
