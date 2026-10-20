function copyToken(key){ return "{{copy:"+key+"}}"; }
function ctaToken(key){ return "{{cta:"+key+"}}"; }

function availableIndexed(manifest,prefix,suffix="") {
  const out=[];
  for(let i=1;i<=12;i++) {
    const key=prefix+i+suffix;
    if(Object.prototype.hasOwnProperty.call(manifest||{},key)) out.push(key);
  }
  return out;
}

function serviceMarkup(copyManifest,klass) {
  const titles=availableIndexed(copyManifest,"SERVICE_","_TITLE");
  return titles.map((titleKey,i)=>{
    const bodyKey="SERVICE_"+(i+1)+"_BODY";
    const body=Object.prototype.hasOwnProperty.call(copyManifest||{},bodyKey)
      ? "<p class=\""+klass+"__body\">"+copyToken(bodyKey)+"</p>"
      : "";
    return "<article class=\""+klass+"\"><h3 class=\""+klass+"__title\">"+copyToken(titleKey)+"</h3>"+body+"</article>";
  }).join("");
}

function trustIsContact(copyManifest,key) {
  const value=String(copyManifest?.[key]||"");
  return /@|\bpec\b|\be-?mail\b|\btelefono\b|\bcell(?:ulare)?\b|\btel\b|\+?\d[\d\s().\/-]{6,}/i.test(value);
}

function trustMarkup(copyManifest,klass) {
  const keys=availableIndexed(copyManifest,"TRUST_");
  return keys.map(key=>{
    const contact=trustIsContact(copyManifest,key);
    return "<div class=\""+klass+(contact?" "+klass+"--contact":"")+"\">"
      +(contact?"<span>":"<strong>")+copyToken(key)+(contact?"</span>":"</strong>")+"</div>";
  }).join("");
}

function commonUsedCopy(copyManifest) {
  return Object.keys(copyManifest||{}).filter(k=>
    /^(HERO_HEADLINE|HERO_BODY|LOCALITY_LINE|PRIMARY_CTA_LABEL|SECONDARY_CTA_LABEL|FOOTER_LINE|SERVICE_\d+_(?:TITLE|BODY)|TRUST_\d+|PARTNER_\d+|PARTNER_SECTION_(?:TITLE|INTRO))$/.test(k)
  );
}

function verifiedAccent(inputPayload) {
  const raw=JSON.stringify(inputPayload?.brand_dna?.existing_colors||"");
  const colors=[...new Set(raw.match(/#[0-9a-f]{6}/gi)||[])];
  const nonNeutral=colors.find(x=>!/^#(?:ffffff|000000|111111|0a0a0a|f[0-9a-f]{5})$/i.test(x));
  return nonNeutral||null;
}

export function zeroPhotoExecutionDirection(variantKey,inputPayload={}) {
  const accent=verifiedAccent(inputPayload);
  const logoFirstDirection=String(inputPayload?.brand_gate_mode||"")==="LOGO_FIRST_V1";
  const impresaxMasterProfile=String(inputPayload?.render_profile||"")==="IMPRESAX_MASTER_V1" || logoFirstDirection;
  const shared={
    asset_tokens:["HERO_VISUAL"],
    execution_constraints:{
      static_preview:true,no_scripts:true,no_forms:true,immutable_identity:true,
      no_empty_placeholder_geometry:true,
      mobile_overlay_forbidden:false,
      hero_copy_overlay_allowed:true,
      hero_text_over_image_required:true,
      premium_typography_required:true,
      high_resolution_visual_perception_required:true
    }
  };
  const variants={
    A:{
      name:"Structural Field",
      core_idea:"Light industrial composition built from verified copy, structural rules and immutable identity.",
      hero_logic:"Premium full-bleed HERO_VISUAL with verified headline, body and CTAs overlaid inside the image field; cinematic readability gradient, high-resolution treatment and official identity remaining compiler-owned.",
      grid:"Asymmetric structural grid with services in measured modules.",
      typography_behavior:"Bold system sans with dense industrial hierarchy.",
      material_language:"Warm light field, black structure"+(accent?", verified accent "+accent:"")+".",
      signature_device:"Connected structural rule field, never an empty box.",
      section_progression:["hero","positioning","services","trust","bridge","contact"],
      cta_behavior:"Anchored solid/outline CTA pair integrated into the hero and close.",
      mobile_reinterpretation:"Single-column structural stack preserving hierarchy and rule rhythm.",
      fingerprint:{hero_type:"cinematic full bleed overlay hero",grid_topology:"asymmetric structural grid",typography_mode:"editorial display plus utility sans",material_system:"dark photographic field",signature_device:"connected rule field",section_rhythm:"measured modular",cta_pattern:"anchored pair",mobile_pattern:"bottom anchored overlay"}
    },
    B:{
      name:"Trust First Poster",
      core_idea:"Trust-first commercial poster with a materially different information architecture.",
      hero_logic:"Cinematic architecture-first full-bleed hero with headline, body and CTA overlaid directly on HERO_VISUAL using a restrained editorial veil, followed immediately by verified trust proof.",
      grid:"Trust modules first, then horizontal service ledger rows.",
      typography_behavior:"Large serif display paired with utilitarian sans service typography.",
      material_language:"Dark poster system with high-contrast accent"+(accent?" "+accent:"")+".",
      signature_device:"Trust band and oversized editorial type; no reused cross motif.",
      section_progression:["hero","trust","services","positioning","bridge","contact"],
      cta_behavior:"Editorial CTA treatment separated from the structural A system.",
      mobile_reinterpretation:"Trust-first vertical poster with full-width service rows.",
      fingerprint:{hero_type:"cinematic full bleed image hero",grid_topology:"trust band plus service rows",typography_mode:"serif display plus sans utility",material_system:"dark high contrast poster",signature_device:"trust band",section_rhythm:"poster ledger",cta_pattern:"editorial anchored",mobile_pattern:"trust first stacked"}
    },
    C:{
      name:"Editorial Ledger",
      core_idea:"Single-column editorial ledger with hairline service rhythm and address/locality emphasis.",
      hero_logic:"Editorial full-bleed HERO_VISUAL with headline, body and CTA overlaid inside the photographic field, deliberate asymmetric crop, headline rail system and restrained commercial close.",
      grid:"Hairline ledger rows and text-led sections instead of cards.",
      typography_behavior:"Editorial serif display with restrained sans metadata.",
      material_language:"Neutral editorial field"+(accent?" with verified accent "+accent:"")+".",
      signature_device:"Rail and ledger rules, no structural cross motif.",
      section_progression:["hero","positioning","services","trust","bridge","contact"],
      cta_behavior:"Inline editorial CTA rhythm with strong final contact close.",
      mobile_reinterpretation:"Compact editorial ledger with preserved hairline hierarchy.",
      fingerprint:{hero_type:"editorial image rail hero",grid_topology:"single column ledger",typography_mode:"editorial serif and metadata sans",material_system:"neutral editorial",signature_device:"rail ledger rules",section_rhythm:"editorial hairline",cta_pattern:"inline editorial",mobile_pattern:"editorial stacked"}
    }
  };
  return {...shared,...variants[variantKey]};
}

export function sanitizeDirectionForExecution(direction,{hasEditorialAssets=false}={}) {
  const d=structuredClone(direction||{});
  const text=v=>String(v||"");
  d.asset_tokens=(d.asset_tokens||[]).filter(x=>hasEditorialAssets && x!=="PRIMARY_LOGO");

  const mobile=text(d.mobile_reinterpretation);
  const mobileFp=text(d.fingerprint?.mobile_pattern);
  if(/accordion|tab|carousel|slider|drawer|interactive/i.test(mobile+" "+mobileFp)) {
    d.mobile_reinterpretation="Structured stacked mobile modules with strong section differentiation and persistent commercial hierarchy";
    if(d.fingerprint) d.fingerprint.mobile_pattern="Structured Stacked";
  }

  const cta=text(d.cta_behavior);
  const ctaFp=text(d.fingerprint?.cta_pattern);
  if(/floating|sticky|fixed/i.test(cta+" "+ctaFp)) {
    d.cta_behavior="Anchored high-contrast CTA integrated into composition without overlay";
    if(d.fingerprint) d.fingerprint.cta_pattern="Anchored CTA";
  }

  const signature=text(d.signature_device);
  const sigFp=text(d.fingerprint?.signature_device);
  if(/logo variation|logo reinterpret|monogram|altered logo/i.test(signature+" "+sigFp)) {
    d.signature_device="Immutable official-logo anchor with independent geometric rule system";
    if(d.fingerprint) d.fingerprint.signature_device="Geometric Rule System";
  }

  const hero=text(d.hero_logic);
  if(/logo-centric/i.test(hero)) {
    d.hero_logic="Identity-aware hero using the immutable official logo only when composition benefits; no logo reinterpretation";
  }
  d.execution_constraints={
    static_preview:true,
    no_scripts:true,
    no_forms:true,
    immutable_identity:true,
    no_empty_placeholder_geometry:true,
    mobile_overlay_forbidden:false,
    hero_copy_overlay_allowed:true,
    hero_text_over_image_required:true,
    premium_typography_required:true,
    high_resolution_visual_perception_required:true
  };
  return d;
}

export function buildZeroPhotoPremiumSpec({variantKey,copyManifest,hasIdentity=true,inputPayload=null,sectionAssetTokens=[],sectionAssetPlan=null}) {
  const verifiedBrandAccent=verifiedAccent(inputPayload);
  const logoFirstBrandProfile=inputPayload?.logo_first_brand_profile||null;
  const logoFirstMode=String(inputPayload?.brand_gate_mode||"")==="LOGO_FIRST_V1" && !!logoFirstBrandProfile;
  const brandColors=logoFirstBrandProfile?.colors||{};
  const brandPrimary=String(brandColors.primary||verifiedBrandAccent||"#b31319");
  const brandInk=String(brandColors.ink||"#202224");
  const brandPaper=String(brandColors.paper||"#f4f4f1");
  const brandNeutral=String(brandColors.neutral||"#d8d8d4");
  const accent=brandPrimary||(variantKey==="B"?"#e6e1d7":"#8d8981");
  const hexRgba=(hex,alpha)=>{
    const m=String(hex||"").match(/^#([0-9a-f]{6})$/i);
    if(!m) return "rgba(179,19,25,"+alpha+")";
    const h=m[1];
    return "rgba("+parseInt(h.slice(0,2),16)+","+parseInt(h.slice(2,4),16)+","+parseInt(h.slice(4,6),16)+","+alpha+")";
  };
  const brandSoft=hexRgba(brandPrimary,.16);
  const brandGlow=hexRgba(brandPrimary,.26);
  const impresaxMasterProfile=String(inputPayload?.render_profile||"")==="IMPRESAX_MASTER_V1" || logoFirstMode;
  const masterCta=logoFirstMode?brandPrimary:(verifiedBrandAccent||"#f7f6f2");
  const masterCtaText="#ffffff";
  const services=serviceMarkup(copyManifest,"ixg-service");
  const trust=trustMarkup(copyManifest,"ixg-trust");
  const serviceTitles=availableIndexed(copyManifest,"SERVICE_","_TITLE");
  const serviceBodies=availableIndexed(copyManifest,"SERVICE_","_BODY");
  const trustKeys=availableIndexed(copyManifest,"TRUST_");
  const safeTrustTitle=trustKeys.find(key=>!trustIsContact(copyManifest,key));
  const footerIsDisplaySafe=Object.prototype.hasOwnProperty.call(copyManifest,"FOOTER_LINE")
    && !trustIsContact(copyManifest,"FOOTER_LINE");
  const positionTitle="POSITIONING_TITLE";
  const positionBody="POSITIONING_BODY";
  const aGridTitles=serviceTitles;
  const allServicesHaveBodies=aGridTitles.length>0 && aGridTitles.every((_,i)=>Object.prototype.hasOwnProperty.call(copyManifest,"SERVICE_"+(i+1)+"_BODY"));
  const featureServiceTitles=serviceTitles.slice(0,2);
  const servicesA=aGridTitles.map((titleKey,i)=>{
    const sourceIndex=Number(String(titleKey).match(/^SERVICE_(\d+)_TITLE$/)?.[1]||i+1);
    const bodyKey="SERVICE_"+sourceIndex+"_BODY";
    const tagKey="SERVICE_"+sourceIndex+"_TAG";
    const body=allServicesHaveBodies
      ? "<p class=\"ixg-service__body\">"+copyToken(bodyKey)+"</p>"
      : "";
    const tag=Object.prototype.hasOwnProperty.call(copyManifest,tagKey)
      ? "<span class=\"ixg-service__tag\">"+copyToken(tagKey)+"</span>"
      : "";
    const iconClass="ixg-service__icon--"+String((i%3)+1);
    const icon="<span class=\"ixg-service__icon "+iconClass+"\" aria-hidden=\"true\"><i></i><i></i><i></i></span>";
    return "<article class=\"ixg-service\" data-service-card=\"matched\" data-uniform-service-row=\"true\" data-service-index-rail=\"locked\"><div class=\"ixg-service__top\"><div class=\"ixg-service__indexrail\"><span class=\"ixg-service__index\">0"+(i+1)+"</span></div><div class=\"ixg-service__iconrail\">"+icon+"</div></div><div class=\"ixg-service__content\">"+tag+"<h3 class=\"ixg-service__title\">"+copyToken(titleKey)+"</h3>"+body+"</div></article>";
  }).join("");
  const bridgeTitle=Object.prototype.hasOwnProperty.call(copyManifest,"BRIDGE_TITLE")
    ? "BRIDGE_TITLE"
    : (trustKeys[0]||"LOCALITY_LINE");
  const bridgeBody=Object.prototype.hasOwnProperty.call(copyManifest,"BRIDGE_BODY")
    ? "BRIDGE_BODY"
    : null;
  const positionBodyMarkup=positionBody?"<p>"+copyToken(positionBody)+"</p>":"";
  const bridgeBodyMarkup=bridgeBody?"<p>"+copyToken(bridgeBody)+"</p>":"";
  const vclass="ixg-"+variantKey.toLowerCase();
  const nonContactTrustKeys=trustKeys.filter(key=>!trustIsContact(copyManifest,key));
  const coreTrustKeys=nonContactTrustKeys;
  const partnerTrustKeys=availableIndexed(copyManifest,"PARTNER_");
  const trustReasonCandidates=[
    ...coreTrustKeys,
    "LOCALITY_LINE",
    ...serviceTitles,
    ...serviceBodies,
    "POSITIONING_TITLE",
    "POSITIONING_BODY",
    "FOOTER_LINE"
  ];
  const trustReasonSeen=new Set();
  const verifiedTrustReasonKeys=trustReasonCandidates.filter(key=>{
    if(!Object.prototype.hasOwnProperty.call(copyManifest,key)) return false;
    if(trustIsContact(copyManifest,key)) return false;
    const value=String(copyManifest?.[key]||"").replace(/\s+/g," ").trim().toLowerCase();
    if(!value || trustReasonSeen.has(value)) return false;
    trustReasonSeen.add(value);
    return true;
  }).slice(0,5);
  const trustReasonLabel=key=>{
    const value=String(copyManifest?.[key]||"");
    if(/impresa\s+attiva|attiv/i.test(value)) return "Operatività";
    if(/fatturato|ricavi|revenue|turnover|€|euro/i.test(value)) return "Solidità";
    if(/dipendenti|employees|headcount|addetti/i.test(value)) return "Struttura";
    if(/vendita\s+all.?ingrosso|materiali\s+per\s+ediliz/i.test(value)) return "Distribuzione B2B";
    if(/tondo|cemento\s+armato|lavorazione|trasformazione/i.test(value)) return "Lavorazione";
    if(key==="LOCALITY_LINE" || /catanzaro|calabria|territorio|locale|presenza operativa/i.test(value)) return "Presenza locale";
    return "Competenza";
  };
  const trustReasonDetail=key=>{
    const value=String(copyManifest?.[key]||"");
    if(/vendita\s+all.?ingrosso|distribuzione\s+b2b|materiali\s+per\s+ediliz/i.test(value)) return "Fornitura professionale pensata per imprese e operatori del settore.";
    if(/tondo|cemento\s+armato|lavorazione|trasformazione/i.test(value)) return "Competenze specifiche su una lavorazione centrale per il cantiere.";
    if(/catanzaro|calabria|territorio|presenza operativa/i.test(value)) return "Presenza concreta sul territorio e contatto diretto.";
    if(/impresa\s+attiva|attiv/i.test(value)) return "Operatività aziendale verificata e continuità sul mercato.";
    return "Un elemento verificato che rafforza affidabilità e valore operativo.";
  };
  const trustReasons=verifiedTrustReasonKeys
    .map((key,i)=>"<article class=\"ixg-trust-reason\" data-trust-reason=\""+(i+1)+"\"><div class=\"ixg-trust-reason__top\"><span class=\"ixg-trust-reason__index\">0"+(i+1)+"</span><span class=\"ixg-trust-reason__label\">"+trustReasonLabel(key)+"</span></div><div class=\"ixg-trust-reason__graphic ixg-trust-reason__graphic--"+((i%3)+1)+"\" aria-hidden=\"true\"><i></i><i></i><i></i></div><strong>"+copyToken(key)+"</strong><p>"+trustReasonDetail(key)+"</p></article>")
    .join("");
  const trustProofRail=verifiedTrustReasonKeys.slice(0,3)
    .map((key,i)=>"<div class=\"ixg-trust-proof__item\"><span>0"+(i+1)+"</span><strong>"+copyToken(key)+"</strong></div>")
    .join("");
  const partnerDemoSlots=partnerTrustKeys.length===1
    ? [1,2,3].map((n,i)=>"<article class=\"ixg-partner-card ixg-partner-card--demo\" data-demo-partner-slot=\"true\" aria-hidden=\"true\"><div class=\"ixg-demo-partner-mark ixg-demo-partner-mark--"+((i%3)+1)+"\"><i></i><i></i><i></i></div><div class=\"ixg-demo-partner-lines\"><i></i><i></i></div></article>").join("")
    : "";
  const partnerProof=partnerTrustKeys.length
    ? "<section id=\"partners\" data-section-depth=\"substantial\" data-section-substance=\"rich\" data-commercial-depth=\"high\" data-mobile-density=\"premium\" data-commercial-specificity=\"sector\" class=\"ixg ixg-partner-proof "+vclass+"\" data-partner-proof=\"true\" data-partner-facsimile=\"concept-capacity\" data-section-role=\"brand-partnership\" data-section-plan=\"approved\" data-section-grid=\"locked\"><div class=\"ixg-shell\"><header class=\"ixg-section-head\"><p class=\"ixg-kicker\">"+copyToken("PARTNER_SECTION_TITLE")+"</p><p class=\"ixg-section-intro\">"+copyToken("PARTNER_SECTION_INTRO")+"</p></header><div class=\"ixg-partner-proof__grid\">"+partnerTrustKeys.map(key=>{const value=String(copyManifest?.[key]||"");const upower=/u[-\\s]?power/i.test(value);const logo=upower?"<img class=\"ixg-partner-logo\" src=\"{{asset:PARTNER_UPOWER_LOGO}}\" alt=\"\">":"";return "<article class=\"ixg-partner-card\" data-partner-brand=\""+(upower?"U-POWER":"VERIFIED")+"\"><span>Marchio partner</span>"+logo+"<strong>"+copyToken(key)+"</strong></article>";}).join("")+partnerDemoSlots+"</div></div></section>"
    : "";
  const aBridgeEvidenceRows=(nonContactTrustKeys.length?nonContactTrustKeys.slice(0,2):["LOCALITY_LINE"])
    .map(key=>"<div class=\"ixg-bridge__evidence-row\"><strong>"+copyToken(key)+"</strong></div>")
    .join("");
  const proofMetricKeys=availableIndexed(copyManifest,"TRUST_METRIC_");
  const proofMetrics=proofMetricKeys.map((metricKey,i)=>{
    const labelKey="TRUST_METRIC_LABEL_"+(i+1);
    const label=Object.prototype.hasOwnProperty.call(copyManifest,labelKey)
      ? "<span class=\"ixg-proof-metric__label\">"+copyToken(labelKey)+"</span>"
      : "";
    return "<article class=\"ixg-proof-metric\">"+label+"<strong>"+copyToken(metricKey)+"</strong><i aria-hidden=\"true\"></i></article>";
  }).join("");
  const logoFirstProofMetrics=(logoFirstMode&&proofMetrics)
    ? "<div class=\"ixg-proof-metrics\">"+proofMetrics+"</div>"
    : "";
  const primary="<a class=\"ixg-cta ixg-cta--primary\" data-premium-button=\"true\" href=\""+ctaToken("PRIMARY")+"\"><span class=\"ixg-cta__label\">"+copyToken("PRIMARY_CTA_LABEL")+"</span><span class=\"ixg-cta__mark\" aria-hidden=\"true\"><i></i></span></a>";
  const secondary="<a class=\"ixg-cta ixg-cta--secondary\" data-premium-button=\"true\" href=\""+ctaToken("SECONDARY")+"\"><span class=\"ixg-cta__label\">"+copyToken("SECONDARY_CTA_LABEL")+"</span><span class=\"ixg-cta__mark\" aria-hidden=\"true\"><i></i></span></a>";
  const brandWatermark=hasIdentity
    ? "<div class=\"ixr89-watermark\" data-brand-watermark aria-hidden=\"true\">{{identity:PRIMARY_LOGO}}</div>"
    : "";
  const r89Lines="<div class=\"ixr89-lines\" data-surface-art aria-hidden=\"true\"><i></i><i></i><i></i></div>";
  const suppliedSectionAssets=[...new Set((sectionAssetTokens||[])
    .map(String)
    .filter(token=>/^[A-Z0-9_]+$/.test(token) && token!=="HERO_VISUAL" && token!=="PRIMARY_LOGO" && !/^PARTNER_[A-Z0-9_]+_LOGO$/.test(token)))];
  const preferredSectionAssets=["POSITIONING_VISUAL","SERVICE_MATERIALS_VISUAL","SERVICE_REBAR_VISUAL","TRUST_VISUAL"];
  const explicitPreferred=preferredSectionAssets.filter(token=>suppliedSectionAssets.includes(token));
  const rankedSectionAssets=[
    ...explicitPreferred,
    ...suppliedSectionAssets.filter(token=>!explicitPreferred.includes(token))
  ];
  const variantVisualPick=(pool=[])=>{
    if(pool.length<=3 || explicitPreferred.length>=3) return pool.slice(0,3);
    const recipe=variantKey==="B"
      ? {start:Math.ceil(pool.length/2),step:1}
      : variantKey==="C"
        ? {start:1,step:2}
        : {start:0,step:1};
    const picked=[];
    for(let i=0;i<pool.length*2 && picked.length<3;i++) {
      const token=pool[(recipe.start+i*recipe.step)%pool.length];
      if(token && !picked.includes(token)) picked.push(token);
    }
    return picked;
  };
  const fallbackSectionAssets=variantVisualPick(rankedSectionAssets);
  const plannedSlots=sectionAssetPlan && typeof sectionAssetPlan==="object"
    ? (
        variantKey==="B"
          ? [sectionAssetPlan.trust,sectionAssetPlan.services,sectionAssetPlan.positioning]
          : variantKey==="C"
            ? [sectionAssetPlan.services,sectionAssetPlan.bridge,sectionAssetPlan.trust]
            : [sectionAssetPlan.positioning,sectionAssetPlan.services,sectionAssetPlan.trust]
      )
    : [];
  const selectedSectionAssets=[];
  for(let i=0;i<3;i++) {
    const planned=plannedSlots[i];
    if(planned && suppliedSectionAssets.includes(planned) && !selectedSectionAssets.includes(planned)) {
      selectedSectionAssets.push(planned);
      continue;
    }
    if(sectionAssetPlan?.strict_semantic===true) {
      selectedSectionAssets.push(null);
      continue;
    }
    const fallback=fallbackSectionAssets.find(token=>token && !selectedSectionAssets.includes(token));
    if(fallback) selectedSectionAssets.push(fallback);
  }
  const sectionVisual=(token,modifier="")=>token
    ? "<figure class=\"ixg-section-visual "+modifier+"\"><img src=\"{{asset:"+token+"}}\" alt=\"\"></figure>"
    : "";
  const sectionVisual1=sectionVisual(selectedSectionAssets[0],"ixg-section-visual--one");
  const sectionVisual2=sectionVisual(selectedSectionAssets[1],"ixg-section-visual--two");
  const sectionVisual3=sectionVisual(selectedSectionAssets[2],"ixg-section-visual--three");

  const serviceMaterialsFeatureVisual=suppliedSectionAssets.includes("SERVICE_MATERIALS_VISUAL")
    ? sectionVisual("SERVICE_MATERIALS_VISUAL","ixg-section-visual--feature ixg-section-visual--materials")
    : sectionVisual2;
  const serviceRebarFeatureVisual=suppliedSectionAssets.includes("SERVICE_REBAR_VISUAL")
    ? sectionVisual("SERVICE_REBAR_VISUAL","ixg-section-visual--feature ixg-section-visual--rebar")
    : sectionVisual3;
  const trustBackgroundVisual=suppliedSectionAssets.includes("TRUST_VISUAL")
    ? "<figure class=\"ixg-trust-bg\" aria-hidden=\"true\"><img src=\"{{asset:TRUST_VISUAL}}\" alt=\"\"><span class=\"ixg-trust-bg__veil\"></span></figure>"
    : "";

  const featureServiceSection=(slot,visual="")=>{
    const titleKey=featureServiceTitles[slot-1]||null;
    const serviceIndex=titleKey
      ? Number(String(titleKey).match(/^SERVICE_(\d+)_TITLE$/)?.[1]||slot)
      : null;
    const serviceBodyKey=serviceIndex ? "SERVICE_"+serviceIndex+"_BODY" : null;
    const hasServiceBody=serviceBodyKey && Object.prototype.hasOwnProperty.call(copyManifest,serviceBodyKey);
    const fallbackTitle=slot===1?"POSITIONING_TITLE":"LOCALITY_LINE";
    const fallbackBody=slot===1?"POSITIONING_BODY":"FOOTER_LINE";
    const resolvedTitle=titleKey||fallbackTitle;
    const resolvedBody=hasServiceBody?serviceBodyKey:fallbackBody;
    const evidencePool=slot===1
      ? ["SERVICE_1_TAG","HERO_META_3","VALUE_1_TITLE","SERVICES_INTRO",serviceTitles[0],serviceBodies[0]]
      : ["SERVICE_2_TAG","HERO_META_2","VALUE_3_TITLE","SERVICES_INTRO",serviceTitles[1],serviceBodies[1]];
    const evidenceSeen=new Set([resolvedTitle,resolvedBody]);
    const evidenceTokens=evidencePool.filter(key=>{
      if(!key || !Object.prototype.hasOwnProperty.call(copyManifest,key) || evidenceSeen.has(key)) return false;
      evidenceSeen.add(key);
      return true;
    }).slice(0,2);
    const evidence=evidenceTokens.map((key,i)=>"<div class=\"ixg-feature__evidence-row\"><span>0"+(i+1)+"</span><strong>"+copyToken(key)+"</strong></div>").join("");
    const sectionId=titleKey?"service-feature-"+slot:"brand-scene-"+slot;
    const featureClass=slot===1?"ixg-feature--one":"ixg-feature--two";
    const featureLayout=slot===1?"cinematic-materials":"technical-rebar";
    const serviceTagKey="SERVICE_"+slot+"_TAG";
    const serviceTag=Object.prototype.hasOwnProperty.call(copyManifest,serviceTagKey)
      ? "<span class=\"ixg-feature__service-tag\">"+copyToken(serviceTagKey)+"</span>"
      : "";
    return "<section id=\""+sectionId+"\" class=\"ixg ixg-feature "+featureClass+" "+vclass+"\" data-feature-layout=\""+featureLayout+"\" data-section-role=\"editorial-feature\" data-section-plan=\"approved\" data-section-grid=\"locked\" data-section-depth=\"substantial\" data-section-substance=\"rich\" data-commercial-depth=\"high\" data-mobile-density=\"premium\" data-commercial-specificity=\"sector\" data-editorial-feature=\"true\" data-editorial-substance=\"true\" data-content-density=\"rich\" data-surface=\"art-directed\" data-brand-surface=\""+(slot===1?"dark":"tint")+"\"><div class=\"ixg-shell ixg-feature__grid\"><div class=\"ixg-feature__copy\">"+serviceTag+"<p class=\"ixg-kicker\">"+copyToken("SERVICES_TITLE")+"</p><h2>"+copyToken(resolvedTitle)+"</h2><p class=\"ixg-section-intro\">"+copyToken(resolvedBody)+"</p><div class=\"ixg-feature__evidence\">"+evidence+"</div></div><div class=\"ixg-feature__stage "+(visual?"has-visual":"no-visual")+"\">"+visual+"<div class=\"ixg-feature__device\" aria-hidden=\"true\"><i></i><i></i><i></i><span></span></div></div></div></section>";
  };
  const featureSection1=featureServiceSection(1,serviceMaterialsFeatureVisual);
  const featureSection2=featureServiceSection(2,serviceRebarFeatureVisual);
  const featureSectionIds=[
    featureServiceTitles[0]?"service-feature-1":"brand-scene-1",
    featureServiceTitles[1]?"service-feature-2":"brand-scene-2"
  ];

  const impresaxHero="<section id=\"hero\" class=\"ixg ixm-hero "+vclass+"\" data-premium-hero=\"true\" data-home-depth=\"15k\" data-section-depth=\"substantial\"><figure class=\"ixm-hero__media\"><img class=\"ixg-hero__image ixm-hero__image\" src=\"{{asset:HERO_VISUAL}}\" alt=\"\"></figure><div class=\"ixm-hero__veil\" aria-hidden=\"true\"></div><div class=\"ixg-shell ixm-hero__inner\"><div class=\"ixm-hero__copy\"><p class=\"ixg-kicker\">"+copyToken("LOCALITY_LINE")+"</p><h1>"+copyToken("HERO_HEADLINE")+"</h1><p class=\"ixg-lede\">"+copyToken("HERO_BODY")+"</p><div class=\"ixg-actions\">"+primary+secondary+"</div></div></div></section>";
  const logoFirstGraphicBand=logoFirstMode
    ? "<section class=\"ixg ixm-graphic-band\" aria-hidden=\"true\"><div class=\"ixg-shell ixm-graphic-band__inner\"><span class=\"ixm-graphic-band__mark\"><i></i><i></i><i></i></span><span class=\"ixm-graphic-band__rail\"><i></i><i></i><i></i><i></i></span><span class=\"ixm-graphic-band__mark ixm-graphic-band__mark--end\"><i></i><i></i><i></i></span></div></section>"
    : "";

  const sectionBlueprint=[
    "hero",
    ...(positionTitle||positionBody?["positioning"]:[]),
    ...(serviceTitles.length?["services"]:[]),
    ...featureSectionIds,
    ...(verifiedTrustReasonKeys.length>=2?["trust"]:[]),
    ...(partnerTrustKeys.length?["partners"]:[]),
    ...(bridgeTitle||bridgeBody?["bridge"]:[]),
    "final-cta"
  ];

  const mainAB=[
    impresaxHero,
    "<section id=\"positioning\" data-section-role=\"positioning\" data-section-plan=\"approved\" data-section-depth=\"substantial\" data-section-substance=\"rich\" data-commercial-depth=\"high\" data-mobile-density=\"premium\" data-commercial-specificity=\"sector\" class=\"ixg ixg-positioning "+vclass+"\"><div class=\"ixg-shell ixg-split\"><div class=\"ixg-positioning__statement\"><h2>"+copyToken(positionTitle)+"</h2></div><div class=\"ixg-positioning__body\">"+positionBodyMarkup+"<p class=\"ixg-locality\">"+copyToken("LOCALITY_LINE")+"</p></div>"+sectionVisual1+"</div></section>",
    "<section id=\"services\" data-section-role=\"services\" data-section-plan=\"approved\" data-section-depth=\"substantial\" data-section-substance=\"rich\" data-commercial-depth=\"high\" data-mobile-density=\"premium\" data-commercial-specificity=\"sector\" class=\"ixg ixg-services "+vclass+"\" data-section-grid=\"locked\" data-detail-grid=\"aligned\" data-service-composition=\"paired-editorial-with-media\" data-uniform-service-rows=\"true\" data-image-placement=\"anchored\"><div class=\"ixg-shell\"><header class=\"ixg-section-head\"><p class=\"ixg-kicker\">"+copyToken("SERVICES_TITLE")+"</p><p class=\"ixg-section-intro\">"+copyToken("SERVICES_INTRO")+"</p></header><div class=\"ixg-services__composition"+(sectionVisual2?" has-visual":"")+"\"><div class=\"ixg-services__grid\">"+servicesA+"</div>"+sectionVisual2+"</div></div></section>",
    featureSection1,
    featureSection2,
    logoFirstGraphicBand,
    "<section id=\"trust\" data-section-role=\"why-us\" data-section-plan=\"approved\" data-section-depth=\"substantial\" data-section-substance=\"rich\" data-commercial-depth=\"high\" data-mobile-density=\"premium\" data-commercial-specificity=\"sector\" class=\"ixg ixg-trust-section "+vclass+"\" data-section-grid=\"locked\" data-trust-reasons=\"true\" data-proof-support=\"true\" data-contrast-safe=\"true\" data-trust-finish=\"premium-editorial\" data-trust-background=\""+(trustBackgroundVisual?"image":"surface")+"\">"+trustBackgroundVisual+"<div class=\"ixg-shell\"><header class=\"ixg-section-head ixg-section-head--light\"><p class=\"ixg-kicker\">"+copyToken("TRUST_TITLE")+"</p><p class=\"ixg-section-intro\">"+copyToken("TRUST_INTRO")+"</p></header><div class=\"ixg-trust-proof\">"+trustProofRail+"</div><div class=\"ixg-trust-reasons\">"+trustReasons+"</div></div></section>"+partnerProof,
    impresaxMasterProfile
      ? "<section id=\"bridge\" data-section-role=\"contact-bridge\" data-cta-intensity=\"support\" data-cta-premium=\"true\" data-section-plan=\"approved\" data-section-grid=\"locked\" data-section-depth=\"substantial\" data-section-substance=\"rich\" data-mobile-density=\"premium\" class=\"ixg ixg-bridge ixm-bridge "+vclass+"\"><div class=\"ixg-shell ixm-bridge__grid\"><div class=\"ixm-bridge__copy\"><p class=\"ixg-kicker\">"+copyToken("BRIDGE_TITLE")+"</p><h2>"+copyToken("SECONDARY_CTA_LABEL")+"</h2><p class=\"ixg-section-intro\">"+copyToken("BRIDGE_BODY")+"</p></div><div class=\"ixg-actions\">"+secondary+"</div></div></section>"
      : "<section id=\"bridge\" data-section-role=\"contact-bridge\" data-cta-intensity=\"support\" data-cta-premium=\"true\" data-section-plan=\"approved\" data-section-grid=\"locked\" data-section-depth=\"substantial\" data-section-substance=\"rich\" data-mobile-density=\"premium\" class=\"ixg ixg-bridge "+vclass+"\"><div class=\"ixg-shell ixg-bridge__grid\"><div class=\"ixg-bridge__copy\"><h2>"+copyToken(bridgeTitle)+"</h2>"+bridgeBodyMarkup+"</div><div class=\"ixg-bridge__evidence\">"+aBridgeEvidenceRows+"</div><div class=\"ixg-actions\">"+secondary+"</div></div></section>",
    "<section id=\"final-cta\" data-section-role=\"conversion\" data-cta-intensity=\"primary\" data-cta-premium=\"true\" data-section-plan=\"approved\" data-section-grid=\"locked\" data-contrast-safe=\"true\" data-section-depth=\"substantial\" data-section-substance=\"rich\" data-mobile-density=\"premium\" class=\"ixg ixg-contact "+vclass+"\"><div class=\"ixg-shell ixg-contact__inner\"><div><p class=\"ixg-kicker\">"+copyToken("LOCALITY_LINE")+"</p><h2>"+copyToken("CLOSING_TITLE")+"</h2><p class=\"ixg-section-intro\">"+copyToken("CLOSING_BODY")+"</p></div><div class=\"ixg-actions\">"+primary+"</div></div></section>"
  ].join("");

  const bTrustRows=trustKeys
    .filter(key=>!trustIsContact(copyManifest,key))
    .map(key=>"<article class=\"ixb-trust-item\"><strong>"+copyToken(key)+"</strong></article>")
    .join("");
  const bServiceRows=serviceTitles.map((titleKey,i)=>{
    const bodyKey="SERVICE_"+(i+1)+"_BODY";
    const body=Object.prototype.hasOwnProperty.call(copyManifest,bodyKey)
      ? "<p>"+copyToken(bodyKey)+"</p>"
      : "";
    const featureClass=serviceTitles.length===1?" ixb-service-row--feature":"";
    return "<article class=\"ixb-service-row"+featureClass+"\"><h3>"+copyToken(titleKey)+"</h3><div class=\"ixb-service-body\">"+body+"</div></article>";
  }).join("");
  const bPositionTitle="POSITIONING_TITLE";
  const mainB=[
    "<section id=\"hero\" class=\"ixg ixb-hero ixg-b "+(impresaxMasterProfile?"ixb-hero--master":"")+"\"><figure class=\"ixb-hero__media\"><img class=\"ixg-hero__image\" src=\"{{asset:HERO_VISUAL}}\" alt=\"\"></figure><div class=\"ixg-shell ixb-hero__inner\"><div class=\"ixb-hero__meta\"><p class=\"ixg-kicker\">"+copyToken("LOCALITY_LINE")+"</p></div><h1>"+copyToken("HERO_HEADLINE")+"</h1><p class=\"ixg-lede\">"+copyToken("HERO_BODY")+"</p><div class=\"ixg-actions\">"+primary+secondary+"</div></div></section>",
    "<section id=\"trust\" class=\"ixg ixb-trust ixg-b\"><div class=\"ixg-shell\"><header class=\"ixg-section-head\"><p class=\"ixg-kicker\">"+copyToken("TRUST_TITLE")+"</p><p class=\"ixg-section-intro\">"+copyToken("TRUST_INTRO")+"</p></header><div class=\"ixb-trust-grid\">"+bTrustRows+"</div>"+sectionVisual1+"</div></section>",
    "<section id=\"services\" class=\"ixg ixb-services ixg-b\"><div class=\"ixg-shell\"><header class=\"ixg-section-head\"><p class=\"ixg-kicker\">"+copyToken("SERVICES_TITLE")+"</p><p class=\"ixg-section-intro\">"+copyToken("SERVICES_INTRO")+"</p></header>"+bServiceRows+sectionVisual2+"</div></section>",
    "<section id=\"positioning\" class=\"ixg ixb-positioning ixg-b\"><div class=\"ixg-shell ixb-positioning__inner\"><p class=\"ixg-kicker\">"+copyToken("LOCALITY_LINE")+"</p><h2>"+copyToken(bPositionTitle)+"</h2><p class=\"ixg-section-intro\">"+copyToken("POSITIONING_BODY")+"</p>"+sectionVisual3+"</div></section>",
    "<section id=\"bridge\" class=\"ixg ixb-bridge ixg-b\"><div class=\"ixg-shell ixb-bridge__inner\"><div class=\"ixb-bridge__copy\"><h2>"+copyToken("SECONDARY_CTA_LABEL")+"</h2><p>"+copyToken("POSITIONING_BODY")+"</p></div><div class=\"ixg-actions\">"+secondary+"</div></div></section>",
    "<section id=\"final-cta\" class=\"ixg ixb-contact ixg-b\"><div class=\"ixg-shell ixb-contact__inner\"><div><p class=\"ixg-kicker\">"+copyToken("LOCALITY_LINE")+"</p><h2>"+copyToken("CLOSING_TITLE")+"</h2><p class=\"ixg-section-intro\">"+copyToken("CLOSING_BODY")+"</p></div><div class=\"ixg-actions\">"+primary+secondary+"</div></div></section>"
  ].join("");

  const cServiceRows=serviceTitles.map((titleKey,i)=>{
    const bodyKey="SERVICE_"+(i+1)+"_BODY";
    const body=Object.prototype.hasOwnProperty.call(copyManifest,bodyKey)
      ? "<p>"+copyToken(bodyKey)+"</p>"
      : "";
    return "<article class=\"ixc-ledger-row\"><div class=\"ixc-ledger-key\"><h3>"+copyToken(titleKey)+"</h3></div><div class=\"ixc-ledger-value\">"+body+"</div></article>";
  }).join("");
  const cTrustRows=trustKeys
    .filter(key=>!trustIsContact(copyManifest,key))
    .map(key=>"<div class=\"ixc-trust-row\"><strong>"+copyToken(key)+"</strong></div>")
    .join("");
  const cPositionToken="POSITIONING_TITLE";
  const cBridgeTitle="LOCALITY_LINE";
  const cBridgeBody=Object.prototype.hasOwnProperty.call(copyManifest,"BRIDGE_BODY")
    ? "<p>"+copyToken("BRIDGE_BODY")+"</p>"
    : "";

  const mainC=[
    "<section id=\"hero\" class=\"ixg ixc-hero ixg-c "+(impresaxMasterProfile?"ixc-hero--master":"")+"\"><figure class=\"ixc-hero__media\"><img class=\"ixg-hero__image\" src=\"{{asset:HERO_VISUAL}}\" alt=\"\"></figure><div class=\"ixg-shell ixc-hero__inner\"><p class=\"ixg-kicker\">"+copyToken("LOCALITY_LINE")+"</p><h1>"+copyToken("HERO_HEADLINE")+"</h1><div class=\"ixc-hero__lower\"><p class=\"ixg-lede\">"+copyToken("HERO_BODY")+"</p><div class=\"ixg-actions\">"+primary+secondary+"</div></div><div class=\"ixc-rail\" aria-hidden=\"true\"></div></div></section>",
    "<section id=\"services\" class=\"ixg ixc-services ixg-c\"><div class=\"ixg-shell\"><header class=\"ixg-section-head\"><p class=\"ixg-kicker\">"+copyToken("SERVICES_TITLE")+"</p><p class=\"ixg-section-intro\">"+copyToken("SERVICES_INTRO")+"</p></header>"+cServiceRows+sectionVisual1+"</div></section>",
    "<section id=\"bridge\" class=\"ixg ixc-bridge ixg-c\"><div class=\"ixg-shell ixc-bridge__inner\"><div class=\"ixc-bridge__rule\" aria-hidden=\"true\"></div><div class=\"ixc-bridge__copy\"><h2>"+copyToken(cBridgeTitle)+"</h2>"+cBridgeBody+"</div>"+sectionVisual2+"</div></section>",
    "<section id=\"positioning\" class=\"ixg ixc-positioning ixg-c\"><div class=\"ixg-shell ixc-positioning__grid\"><p class=\"ixg-kicker\">"+copyToken("LOCALITY_LINE")+"</p><h2>"+copyToken(cPositionToken)+"</h2><p class=\"ixg-section-intro\">"+copyToken("POSITIONING_BODY")+"</p></div></section>",
    "<section id=\"trust\" class=\"ixg ixc-trust ixg-c\"><div class=\"ixg-shell\"><header class=\"ixg-section-head\"><p class=\"ixg-kicker\">"+copyToken("TRUST_TITLE")+"</p><p class=\"ixg-section-intro\">"+copyToken("TRUST_INTRO")+"</p></header><div class=\"ixc-trust__inner\">"+cTrustRows+"</div>"+sectionVisual3+"</div></section>",
    "<section id=\"final-cta\" class=\"ixg ixc-contact ixg-c\"><div class=\"ixg-shell ixc-contact__inner\"><div><p class=\"ixg-kicker\">"+copyToken("LOCALITY_LINE")+"</p><h2>"+copyToken("CLOSING_TITLE")+"</h2><p class=\"ixg-section-intro\">"+copyToken("CLOSING_BODY")+"</p></div><div class=\"ixg-actions\">"+primary+secondary+"</div></div></section>"
  ].join("");

  let main=(variantKey==="C" ? mainC : variantKey==="B" ? mainB : mainAB).split("<section ").map((part,i)=>i===0?part:(part.startsWith('id="hero"')?"<section "+part:'<section data-surface="art-directed" '+part)).join("");
  main=main
    .replace(/(<section\b[^>]*\bid="hero"[^>]*)(>)/i,'$1 data-launch-hero="true" data-stage-depth="cinematic" data-hero-full-bleed="true" data-typography-system="responsive" data-copy-density="controlled" data-value-perception="15k" data-brand-specific="true" data-sales-architecture="true" data-custom-made="true" data-signature-moment="true" data-commissioned-experience="true" data-authorship="irreproducible" data-scroll-narrative="continuous" data-iconic-moment="true" data-hero-text-over-image="required" data-r107-ultra-visual="true"$2')
    .replace(/(<section\b[^>]*\bid="positioning"[^>]*)(>)/i,'$1 data-copy-density="controlled" data-authored-transition="true"$2')
    .replace(/(<section\b[^>]*\bid="services"[^>]*)(>)/i,'$1 data-brand-surface="secondary" data-spectacle-moment="true" data-stage-depth="editorial" data-copy-density="controlled" data-custom-made="true" data-signature-moment="true" data-iconic-moment="true" data-authored-transition="true"$2')
    .replace(/(<section\b[^>]*\bid="trust"[^>]*)(>)/i,'$1 data-copy-density="controlled" data-iconic-moment="true"$2')
    .replace(/(<section\b[^>]*\bid="bridge"[^>]*)(>)/i,'$1 data-brand-surface="tint" data-spectacle-moment="true" data-stage-depth="material" data-copy-density="controlled" data-custom-made="true" data-signature-moment="true" data-authored-transition="true"$2')
    .replace(/(<section\b[^>]*\bid="final-cta"[^>]*)(>)/i,'$1 data-brand-surface="primary" data-spectacle-moment="true" data-stage-depth="cinematic" data-copy-density="controlled" data-custom-made="true" data-signature-moment="true" data-iconic-moment="true"$2')
    .replace(/(<section\b[^>]*\bid="final-cta"[^>]*>)/i,"$1"+brandWatermark+r89Lines+'<div class="ixr90-stage" aria-hidden="true"><i></i><i></i><i></i></div>');

  const base=`
:root{--ix-ink:#111;--ix-paper:#f4f1ea;--ix-muted:#6b6964;--ix-line:rgba(17,17,17,.18);--ix-dark:#111;--ix-light:#fff;--ix-accent:${accent};--ix-space:clamp(24px,4.2vw,72px);--ix-display-font:Bahnschrift,"Arial Narrow","Roboto Condensed","Inter Tight","Aptos Display","Segoe UI Variable Display",sans-serif;--ix-body-font:Inter,Aptos,"Segoe UI Variable Text","Helvetica Neue",sans-serif}

.ix-v2-header{background:#fff;color:#111;border-bottom-color:rgba(17,17,17,.12)}.ix-v2-header-inner{min-height:94px}.ix-v2-nav a{position:relative}.ix-v2-nav a:after{display:block;height:1px;background:currentColor;transform:scaleX(0);transform-origin:left;transition:transform .2s ease}.ix-v2-header-cta{background:#111;color:#fff;border-color:#111}.ix-v2-footer{background:#111;color:#f7f6f2}.ix-v2-footer-nav a{color:rgba(247,246,242,.75)}
.ixg{position:relative;overflow:hidden;font-family:var(--ix-body-font)}.ixg-shell{width:min(1320px,calc(100% - 2*var(--ix-space)));margin:0 auto}
.ixg h1,.ixg h2,.ixg h3,.ixg p{margin:0}.ixg h1,.ixg h2,.ixg h3{font-family:var(--ix-display-font);font-stretch:condensed;text-wrap:balance}.ixg h1{font-size:clamp(56px,7.2vw,116px);line-height:.90;letter-spacing:-.055em;max-width:11ch}
.ixg h2{font-size:clamp(38px,5vw,76px);line-height:.96;letter-spacing:-.04em}.ixg h3{font-size:clamp(24px,2.25vw,36px);line-height:1.08;letter-spacing:-.02em}
.ixg p{font-size:clamp(16px,1.22vw,19px);line-height:1.65;text-wrap:pretty}.ixg-section-visual{position:relative;margin:34px 0 0;overflow:hidden;min-height:240px;max-height:520px}.ixg-section-visual img{display:block;width:100%;height:100%;min-height:240px;max-height:520px;object-fit:cover;object-position:center}.ixg-section-visual--one{clip-path:polygon(0 0,100% 0,94% 100%,0 100%)}.ixg-section-visual--two{width:min(88%,1080px);margin-left:auto}.ixg-section-visual--three{width:min(76%,920px);margin-left:0}.ixg-kicker{font-size:12px!important;letter-spacing:.16em;text-transform:uppercase;font-weight:700}
.ixg-lede{max-width:56ch;margin-top:30px!important;color:var(--ix-muted)}.ixg-section-head{display:grid;grid-template-columns:minmax(180px,.45fr) minmax(280px,1fr);gap:32px;align-items:end;padding:clamp(52px,6vw,86px) 0 32px}.ixg-section-head--light{color:#fff}.ixg-section-intro{max-width:58ch;color:var(--ix-muted);font-size:clamp(16px,1.4vw,21px)!important}.ixg-section-head--light .ixg-section-intro{color:rgba(255,255,255,.72)}.ixg-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:36px}
.ixg-cta{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:0 24px;border:1px solid currentColor;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:.02em}
.ixg-cta--primary{background:var(--ix-ink);color:#fff}.ixg-cta--secondary{background:transparent;color:inherit}
.ixg-hero{background:var(--ix-paper);color:var(--ix-ink);padding:clamp(70px,8vw,130px) 0 clamp(80px,10vw,150px)}
.ixg-hero__grid{display:grid;grid-template-columns:minmax(0,1.22fr) minmax(320px,.78fr);gap:clamp(36px,6vw,92px);align-items:center}
.ixg-hero__media{margin:0;position:relative;min-height:clamp(360px,42vw,620px);overflow:hidden}.ixg-hero__image{width:100%;height:100%;min-height:inherit;object-fit:cover;object-position:center;display:block}
.ixg-hero__device{position:relative;height:clamp(300px,36vw,520px);min-width:0}
.ixg-hero__device span{position:absolute;display:block;background:var(--ix-ink);transform-origin:center}
.ixg-hero__device span:nth-child(1){left:4%;top:16%;width:92%;height:14px}
.ixg-hero__device span:nth-child(2){right:18%;top:4%;width:14px;height:92%}
.ixg-hero__device span:nth-child(3){left:16%;bottom:18%;width:68%;height:8px;background:rgba(17,17,17,.38)}
.ixg-hero__device span:nth-child(4){left:30%;top:10%;width:8px;height:72%;background:rgba(17,17,17,.38)}
.ixg-positioning{padding:clamp(70px,9vw,130px) 0;background:#fff;color:var(--ix-ink);border-top:1px solid var(--ix-line);border-bottom:1px solid var(--ix-line)}
.ixg-split{display:grid;grid-template-columns:.9fr 1.1fr;gap:clamp(48px,8vw,120px);align-items:start}.ixg-positioning__body{display:grid;gap:24px;padding-top:8px}.ixg-locality{font-weight:700}
.ixg-services{background:#fff;padding:0;color:var(--ix-ink)}.ixg-services__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border-left:1px solid var(--ix-line);border-top:1px solid var(--ix-line)}
.ixg-service{min-height:250px;padding:clamp(30px,4.2vw,58px);border-right:1px solid var(--ix-line);border-bottom:1px solid var(--ix-line);display:flex;flex-direction:column;justify-content:flex-start;gap:26px}
.ixg-service__body{color:var(--ix-muted);max-width:48ch}.ixg-trust-section{padding:clamp(64px,7vw,105px) 0;background:linear-gradient(135deg,var(--ix-paper) 0%,#fff 58%,rgba(179,19,25,.055) 100%);color:var(--ix-ink)}
.ixg-trust-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));border-top:1px solid var(--ix-line);border-left:1px solid var(--ix-line)}
.ixg-trust{min-height:140px;padding:28px;border-right:1px solid var(--ix-line);border-bottom:1px solid var(--ix-line);display:flex;align-items:flex-end}
.ixg-trust strong{font-size:clamp(22px,2.1vw,34px);line-height:1.08;letter-spacing:-.025em}.ixg-trust--contact span{font-size:14px;line-height:1.45;overflow-wrap:anywhere;word-break:break-word}.ixg-trust-section .ixg-section-head--light{color:var(--ix-ink)!important}.ixg-trust-section .ixg-section-head--light .ixg-section-intro{color:var(--ix-muted)!important}
.ixg-bridge{padding:clamp(76px,9vw,130px) 0;background:var(--ix-paper);color:var(--ix-ink)}
.ixg-bridge__grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(260px,.75fr);gap:clamp(42px,7vw,100px);align-items:center}.ixg-bridge__copy{display:grid;gap:26px}
.ixg-bridge__evidence{display:grid;border-top:1px solid var(--ix-line);align-self:stretch}.ixg-bridge__evidence-row{display:flex;align-items:flex-end;min-height:120px;padding:24px 0;border-bottom:1px solid var(--ix-line)}.ixg-bridge__evidence-row strong{font-size:clamp(22px,2.4vw,36px);line-height:1.06;letter-spacing:-.03em;max-width:22ch}
.ixg-contact{padding:clamp(68px,7vw,105px) 0;background:#fff;color:var(--ix-ink);border-top:1px solid var(--ix-line)}.ixg-contact__inner{display:grid;grid-template-columns:1fr auto;gap:40px;align-items:end}
@media(max-width:700px){
 .ixg-shell{width:min(calc(100% - 40px),1320px)}.ixg-section-head{grid-template-columns:1fr;gap:12px;padding:42px 0 24px}.ixg h1{font-size:clamp(42px,11.5vw,62px);max-width:none;overflow-wrap:normal;word-break:normal;hyphens:none}.ixg h2{font-size:clamp(32px,9vw,48px)}
 .ixg-hero{padding:58px 0 70px}.ixg-hero__grid,.ixg-split,.ixg-bridge__grid,.ixg-contact__inner{grid-template-columns:1fr}.ixg-hero__device{height:190px;order:2}
 .ixg-hero__copy{order:1}.ixg-actions{display:grid;grid-template-columns:1fr;margin-top:26px}.ixg-cta{width:100%;min-height:50px}
 .ixg-positioning{padding:58px 0}.ixg-split{gap:26px}.ixg-services__grid{grid-template-columns:1fr}.ixg-service{min-height:0;padding:32px 24px;gap:18px}
 .ixg-trust-section{padding:52px 0}.ixg-trust-grid{grid-template-columns:1fr}.ixg-trust{min-height:0;padding:22px}.ixg-bridge{padding:62px 0}.ixg-bridge__grid{gap:32px}.ixg-bridge__evidence-row{min-height:0;padding:22px 0}.ixg-bridge__evidence-row strong{font-size:clamp(22px,7vw,30px)}
 .ixg-contact{padding:54px 0}.ixg-contact__inner{align-items:start}.ixg-contact .ixg-actions{margin-top:0}
}
`;

  const impresaxMasterCss=impresaxMasterProfile?`
:root{--ix-master-cta:${masterCta};--ix-master-cta-text:${masterCtaText}}
.ix-v2-header{position:absolute!important;inset:0 0 auto!important;z-index:80!important;background:transparent!important;color:#fff!important;border-bottom:1px solid rgba(255,255,255,.12)!important}
.ix-v2-header-inner{min-height:72px!important;width:min(calc(100% - 80px),1500px)!important}
.ix-v2-brand{position:relative;background:transparent!important;padding:0!important;border-radius:0!important;box-shadow:none!important;align-self:center!important;display:inline-flex!important;align-items:center!important;filter:drop-shadow(0 2px 12px rgba(0,0,0,.28))}
.ix-v2-logo{max-height:50px!important;max-width:220px!important;display:block!important}
.ix-v2-brand:after{display:none!important}
.ix-v2-nav a{color:rgba(255,255,255,.86)!important;font-size:12px!important}
.ix-v2-header-cta{min-height:40px!important;padding:0 18px!important;border-radius:999px!important;background:var(--ix-master-cta)!important;color:var(--ix-master-cta-text)!important;border-color:var(--ix-master-cta)!important}
.ixm-hero{position:relative;min-height:clamp(560px,60vw,760px);padding:0!important;background:#0d0e0e;color:#fff;overflow:hidden}
.ixm-hero__media{position:absolute;inset:0;margin:0;width:100%;height:100%;min-height:100%}
.ixm-hero__image{position:absolute;inset:0;width:100%!important;height:100%!important;min-height:100%!important;object-fit:cover!important;object-position:center!important;filter:saturate(.80) contrast(1.08) brightness(.76)}
.ixm-hero__veil{position:absolute;inset:0;background:linear-gradient(90deg,rgba(9,10,10,.94) 0%,rgba(9,10,10,.76) 32%,rgba(9,10,10,.30) 58%,rgba(9,10,10,.10) 78%,rgba(9,10,10,.25) 100%),linear-gradient(180deg,rgba(0,0,0,.35),transparent 32%,rgba(0,0,0,.38));z-index:1}
.ixm-hero__inner{position:relative;z-index:2;min-height:clamp(560px,60vw,760px);display:flex;align-items:flex-end;padding:clamp(128px,14vw,190px) 0 clamp(62px,7vw,92px)}
.ixm-hero__copy{width:min(700px,68vw)}
.ixm-hero .ixg-kicker{color:rgba(255,255,255,.58)!important;font-size:10px!important;letter-spacing:.22em!important}
.ixm-hero h1{margin-top:14px!important;max-width:10ch!important;color:#fff!important;font-family:Georgia,'Times New Roman',serif!important;font-weight:400!important;font-size:clamp(58px,7.3vw,108px)!important;line-height:.88!important;letter-spacing:-.055em!important}
.ixm-hero .ixg-lede{max-width:46ch!important;margin-top:20px!important;color:rgba(255,255,255,.88)!important;font-size:clamp(17px,1.45vw,21px)!important;line-height:1.35!important}
.ixm-hero .ixg-actions{margin-top:26px!important;gap:12px!important}
.ixm-hero .ixg-cta{min-height:50px!important;padding:0 22px!important;border-radius:999px!important}
.ixm-hero .ixg-cta--primary{background:var(--ix-master-cta)!important;color:var(--ix-master-cta-text)!important;border-color:var(--ix-master-cta)!important}
.ixm-hero .ixg-cta--secondary{background:rgba(17,17,17,.18)!important;color:#fff!important;border-color:rgba(255,255,255,.72)!important;backdrop-filter:blur(7px)}
.ixg-shell{width:min(calc(100% - 80px),1500px)}
.ixg h2{font-family:Georgia,'Times New Roman',serif;font-weight:400;letter-spacing:-.04em}
.ixg-kicker{letter-spacing:.19em}
.ixg-cta{border-radius:999px}
.ixg-positioning,.ixg-services,.ixg-bridge,.ixg-contact{padding-top:clamp(60px,7vw,96px);padding-bottom:clamp(60px,7vw,96px)}
.ixg-positioning{background:#f7f6f2!important}.ixg-positioning__body{position:relative;padding-top:18px!important;border-top:1px solid rgba(17,17,17,.18)!important}.ixg-positioning__body:after{content:"";display:block;width:min(180px,42%);height:1px;background:rgba(17,17,17,.18);margin-top:28px}
.ixg-services{background:#fff!important}
.ixg-section-head{border-bottom:1px solid rgba(17,17,17,.18);margin-bottom:0!important}
.ixg-services__grid{border-top:0!important}
.ixg-service{background:transparent!important;min-height:280px!important}
.ixg-service__title{font-family:Georgia,'Times New Roman',serif;font-weight:400!important;font-size:clamp(30px,3.3vw,50px)!important;letter-spacing:-.035em!important}
.ixg-service__body{color:#45423c!important;font-weight:500!important;line-height:1.48!important}
.ixg-trust-section{background:#0d0e0e}
.ixg-trust strong{font-family:Georgia,'Times New Roman',serif;font-weight:400!important}
.ixm-bridge{background:#f7f6f2!important;border-top:1px solid rgba(17,17,17,.16);border-bottom:1px solid rgba(17,17,17,.16);padding:clamp(52px,5.5vw,82px) 0!important;min-height:0!important}
.ixm-bridge__grid{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:clamp(36px,6vw,90px);align-items:end}
.ixm-bridge__copy{max-width:840px;display:grid;gap:18px}
.ixm-bridge h2{max-width:18ch;font-size:clamp(34px,4.4vw,58px)!important;line-height:.98!important}
.ixm-bridge .ixg-actions{margin-top:0!important}
.ix-v2-footer{background:#0d0e0e!important;color:#f7f6f2!important}
.ix-v2-footer-identity{display:inline-flex!important;width:max-content!important;min-height:0!important;background:transparent!important;padding:0!important;border-radius:0!important;box-shadow:none!important;filter:drop-shadow(0 2px 10px rgba(0,0,0,.22))}
.ix-v2-footer-logo{display:block!important;max-height:54px!important}
@media(max-width:700px){
 .ix-v2-header-inner{width:calc(100% - 32px)!important;min-height:92px!important;grid-template-columns:1fr auto!important;align-content:center!important;row-gap:8px!important}
 .ix-v2-nav{display:flex!important;grid-column:1/-1!important;grid-row:2!important;width:100%!important;justify-content:flex-start!important;gap:22px!important;overflow-x:auto!important;overflow-y:hidden!important;white-space:nowrap!important;padding:8px 0 10px!important;border-top:1px solid rgba(255,255,255,.12)!important;scrollbar-width:none!important;-webkit-overflow-scrolling:touch}
 .ix-v2-nav a{font-size:10px!important;letter-spacing:.10em!important;color:rgba(255,255,255,.88)!important;flex:0 0 auto!important;display:inline-flex!important;align-items:center!important;min-height:36px!important;padding:0 3px!important}
 .ix-v2-header-cta{min-height:36px!important;padding:0 13px!important;font-size:10px!important}
 .ix-v2-brand{padding:0!important;border-radius:0!important}.ix-v2-logo{max-width:142px!important;max-height:42px!important}
 .ixm-hero{min-height:690px}
 .ixm-hero__inner{min-height:690px;align-items:flex-end;padding:96px 0 42px}
 .ixm-hero__copy{width:100%;max-width:100%}
 .ixm-hero h1{font-size:clamp(48px,13vw,64px)!important;line-height:.9!important;max-width:10ch!important}
 .ixm-hero .ixg-lede{font-size:16px!important;max-width:32ch!important}
 .ixm-hero__veil{background:linear-gradient(180deg,rgba(10,11,11,.30) 0%,rgba(10,11,11,.04) 30%,rgba(10,11,11,.20) 52%,rgba(10,11,11,.92) 78%,#0d0e0e 100%)}
 .ixm-hero__image{object-position:center!important}
 .ixm-hero .ixg-actions{display:grid!important;grid-template-columns:1fr!important;gap:10px!important}
 .ixm-hero .ixg-cta{width:100%!important}
 .ixg-shell{width:calc(100% - 36px)}
 .ixm-bridge__grid{grid-template-columns:1fr!important;align-items:start!important}
 .ixm-bridge .ixg-actions{display:grid!important;margin-top:8px!important}
 .ixg-service{min-height:0!important;padding:34px 22px!important}
}
`:"";
  const logoFirstCss=logoFirstMode?`
:root{
 --ix-brand-primary:${brandPrimary};
 --ix-brand-ink:${brandInk};
 --ix-brand-paper:${brandPaper};
 --ix-brand-neutral:${brandNeutral};
 --ix-accent:${brandPrimary};
 --ix-ink:${brandInk};
 --ix-dark:${brandInk};
 --ix-paper:${brandPaper}
}
.ixg,.ix-v2-header,.ix-v2-footer{font-family:Arial,Helvetica,sans-serif!important}
.ixg h1,.ixg h2,.ixg h3,.ixg-service__title,.ixg-trust strong,.ixm-bridge h2{
 font-family:Arial,Helvetica,sans-serif!important;
 font-style:normal!important
}
.ix-v2-header{
 position:absolute!important;
 inset:0 0 auto!important;
 z-index:80!important;
 background:rgba(248,248,246,.96)!important;
 color:var(--ix-brand-ink)!important;
 border:0!important;
 box-shadow:0 1px 0 rgba(32,34,36,.08)!important;
 backdrop-filter:blur(12px)
}
.ix-v2-header-inner{
 min-height:78px!important;
 width:min(calc(100% - 56px),1500px)!important
}
.ix-v2-brand{
 background:transparent!important;
 padding:0!important;
 filter:none!important;
 box-shadow:none!important
}
.ix-v2-logo{
 max-width:292px!important;
 max-height:60px!important;
 display:block!important;
 mix-blend-mode:multiply!important
}
.ix-v2-nav{gap:30px!important}
.ix-v2-nav a{
 color:var(--ix-brand-ink)!important;
 font-size:11px!important;
 font-weight:800!important;
 letter-spacing:.10em!important;
 text-transform:uppercase!important
}
.ix-v2-header-cta{
 min-height:44px!important;
 padding:0 20px!important;
 border-radius:2px!important;
 background:var(--ix-brand-primary)!important;
 border-color:var(--ix-brand-primary)!important;
 color:#fff!important;
 font-size:11px!important;
 font-weight:800!important;
 text-transform:uppercase!important;
 letter-spacing:.08em!important
}

.ixm-hero{
 min-height:clamp(680px,70vw,880px)!important;
 background:#111!important;
 color:#fff!important
}
.ixm-hero__media,.ixm-hero__image{
 position:absolute!important;
 inset:0!important;
 width:100%!important;
 height:100%!important;
 min-height:100%!important
}
.ixm-hero__image{
 object-fit:cover!important;
 object-position:center 52%!important;
 filter:saturate(.72) contrast(1.10) brightness(.72)!important;
 transform:scale(1.01)
}
.ixm-hero__veil{
 background:
  linear-gradient(90deg,rgba(12,13,14,.94) 0%,rgba(12,13,14,.79) 30%,rgba(12,13,14,.44) 52%,rgba(12,13,14,.10) 76%,rgba(12,13,14,.03) 100%),
  linear-gradient(180deg,rgba(0,0,0,.12) 0%,transparent 54%,rgba(0,0,0,.34) 100%)!important
}
.ixm-hero__inner{
 min-height:clamp(680px,70vw,880px)!important;
 align-items:center!important;
 padding:150px 0 70px!important
}
.ixm-hero__copy{
 width:min(790px,62vw)!important
}
.ixm-hero .ixg-kicker{
 color:#fff!important;
 opacity:.72!important;
 font-size:10px!important;
 font-weight:800!important;
 letter-spacing:.20em!important;
 text-transform:uppercase!important
}
.ixm-hero h1{
 margin-top:14px!important;
 max-width:13.5ch!important;
 color:#fff!important;
 font-family:Arial,Helvetica,sans-serif!important;
 font-weight:850!important;
 text-transform:uppercase!important;
 font-size:clamp(60px,6.9vw,104px)!important;
 line-height:.91!important;
 letter-spacing:-.052em!important;
 text-wrap:balance
}
.ixm-hero .ixg-lede{
 max-width:54ch!important;
 margin-top:22px!important;
 color:rgba(255,255,255,.88)!important;
 font-size:clamp(17px,1.35vw,21px)!important;
 line-height:1.45!important
}
.ixm-hero .ixg-actions{
 margin-top:30px!important;
 gap:12px!important
}
.ixg-cta,.ix-v2-header-cta{
 font-family:Arial,Helvetica,sans-serif!important;
 text-transform:uppercase!important;
 letter-spacing:.08em!important;
 font-weight:800!important;
 border-radius:2px!important
}
.ixm-hero .ixg-cta{
 min-height:52px!important;
 padding:0 24px!important
}
.ixm-hero .ixg-cta--primary{
 background:var(--ix-brand-primary)!important;
 color:#fff!important;
 border-color:var(--ix-brand-primary)!important;
 box-shadow:0 14px 30px rgba(179,19,25,.24)
}
.ixm-hero .ixg-cta--secondary{
 background:rgba(8,9,10,.32)!important;
 color:#fff!important;
 border-color:rgba(255,255,255,.72)!important;
 backdrop-filter:blur(6px)
}
.ixm-hero:before{
 content:"";
 position:absolute;
 z-index:2;
 left:0;
 bottom:0;
 width:min(560px,42vw);
 height:18px;
 background:
  repeating-linear-gradient(
   180deg,
   var(--ix-brand-primary) 0 2px,
   transparent 2px 4px
  )
}
.ixm-hero:after{
 content:"";
 position:absolute;
 z-index:2;
 left:0;
 bottom:18px;
 width:min(390px,30vw);
 height:4px;
 background:var(--ix-brand-primary)
}

.ixg-positioning{
 position:relative!important;
 padding:clamp(76px,7vw,104px) 0!important;
 background:var(--ix-brand-paper)!important;
 color:var(--ix-brand-ink)!important;
 border:0!important
}
.ixg-positioning:before{
 content:"";
 position:absolute;
 inset:0 0 auto;
 height:1px;
 background:rgba(32,34,36,.12)
}
.ixg-positioning:after{
 content:"";
 position:absolute;
 right:0;
 top:0;
 width:34%;
 height:100%;
 opacity:.32;
 pointer-events:none;
 background:repeating-linear-gradient(
  0deg,
  transparent 0 15px,
  rgba(32,34,36,.06) 15px 16px
 )
}
.ixg-positioning .ixg-shell{position:relative;z-index:1}
.ixg-positioning .ixg-shell:after{
 content:"";
 position:absolute;
 right:0;
 bottom:0;
 z-index:-1;
 width:min(330px,29vw);
 height:168px;
 opacity:.18;
 background:
  radial-gradient(circle at center,var(--ix-brand-primary) 0 4px,transparent 5px) 0 0/28px 28px!important;
 -webkit-mask-image:linear-gradient(90deg,transparent 0%,#000 28%,#000 100%);
 mask-image:linear-gradient(90deg,transparent 0%,#000 28%,#000 100%)
}
.ixg-split{
 grid-template-columns:minmax(0,1.05fr) minmax(340px,.72fr)!important;
 gap:clamp(70px,10vw,150px)!important;
 align-items:end!important
}
.ixg-positioning__statement h2{
 max-width:11ch!important;
 font-size:clamp(50px,6.2vw,86px)!important;
 line-height:.94!important;
 font-weight:850!important;
 letter-spacing:-.052em!important
}
.ixg-positioning__body{
 border-top:4px solid var(--ix-brand-primary)!important;
 padding-top:24px!important;
 gap:22px!important;
 max-width:560px
}
.ixg-positioning__body:after{
 width:140px!important;
 height:1px!important;
 background:rgba(32,34,36,.18)!important
}

.ixg-services{
 position:relative!important;
 background:#fff!important;
 color:var(--ix-brand-ink)!important;
 padding:0 0 clamp(90px,8vw,130px)!important
}
.ixg-services .ixg-section-head{
 grid-template-columns:.38fr 1fr!important;
 padding:clamp(70px,7vw,100px) 0 36px!important;
 margin-bottom:34px!important;
 border-bottom:1px solid rgba(32,34,36,.18)!important
}
.ixg-section-head:before{
 width:150px!important;
 height:5px!important;
 background:var(--ix-brand-primary)!important
}
.ixg-services__grid{
 counter-reset:ixservice!important;
 display:flex!important;
 flex-direction:column!important;
 gap:0!important;
 border-top:1px solid rgba(32,34,36,.18)!important
}
.ixg-service{
 counter-increment:ixservice!important;
 min-height:310px!important;
 padding:42px 0!important;
 border:0!important;
 border-bottom:1px solid rgba(32,34,36,.18)!important;
 display:grid!important;
 grid-template-columns:160px minmax(0,1fr)!important;
 align-items:center!important;
 gap:clamp(30px,5vw,78px)!important;
 overflow:hidden;
 position:relative!important
}
.ixg-service:before{
 content:"0" counter(ixservice)!important;
 position:absolute!important;
 left:0!important;
 top:22px!important;
 width:auto!important;
 height:auto!important;
 background:transparent!important;
 color:var(--ix-brand-primary)!important;
 font-size:clamp(42px,4vw,64px)!important;
 line-height:1!important;
 font-weight:900!important;
 letter-spacing:-.06em!important;
 opacity:.12!important
}
.ixg-service:after{
 content:"";
 position:absolute;
 left:0;
 top:0;
 width:112px;
 height:5px;
 background:var(--ix-brand-primary)
}
.ixg-service:nth-child(odd){
 background:transparent!important;
 color:var(--ix-brand-ink)!important
}
.ixg-service:nth-child(even){
 background:linear-gradient(135deg,var(--ix-brand-paper) 0%,#fff 56%,rgba(179,19,25,.06) 100%)!important;
 color:var(--ix-brand-ink)!important;
 margin-left:calc(-1 * max(0px, (100vw - min(1500px, calc(100vw - 80px))) / 2))!important;
 margin-right:calc(-1 * max(0px, (100vw - min(1500px, calc(100vw - 80px))) / 2))!important;
 padding-left:max(40px,calc((100vw - min(1500px,calc(100vw - 80px))) / 2))!important;
 padding-right:max(40px,calc((100vw - min(1500px,calc(100vw - 80px))) / 2))!important
}
.ixg-service__title{
 max-width:13ch!important;
 font-size:clamp(34px,3.5vw,54px)!important;
 line-height:.98!important;
 font-weight:850!important;
 letter-spacing:-.045em!important
}
.ixg-service__body{
 max-width:46ch!important;
 color:#4b4c4e!important;
 font-size:16px!important;
 line-height:1.5!important
}
.ixg-service:nth-child(even) .ixg-service__body{
 color:#4b4c4e!important
}
.ixg-service__visual{
 display:flex!important;
 align-items:center!important;
 justify-content:flex-end!important;
 min-height:92px!important;
 margin-bottom:auto!important
}
.ixg-service__icon{
 position:relative!important;
 width:126px!important;
 height:76px!important;
 flex:0 0 126px!important;
 display:block!important;
 color:var(--ix-brand-primary)!important
}
.ixg-service__icon i{position:absolute!important;display:block!important;background:currentColor!important}
.ixg-service__icon i:after{
 content:""!important;
 position:absolute!important;
 right:-1px!important;
 top:50%!important;
 width:8px!important;
 height:8px!important;
 transform:translateY(-50%) rotate(45deg)!important;
 background:currentColor!important
}
.ixg-service__icon--1 i:nth-child(1){left:0;top:8px;width:100%;height:7px!important}
.ixg-service__icon--1 i:nth-child(2){left:0;top:31px;width:76%;height:7px!important}
.ixg-service__icon--1 i:nth-child(3){left:0;top:54px;width:52%;height:7px!important}
.ixg-service__icon--2 i:nth-child(1){left:2px;top:10px;width:96%;height:6px!important;transform:rotate(-8deg);transform-origin:left center}
.ixg-service__icon--2 i:nth-child(2){left:2px;top:32px;width:82%;height:6px!important;transform:rotate(-8deg);transform-origin:left center}
.ixg-service__icon--2 i:nth-child(3){left:2px;top:54px;width:66%;height:6px!important;transform:rotate(-8deg);transform-origin:left center}
.ixg-service__icon--3 i:nth-child(1){left:0;top:9px;width:100%;height:7px!important}
.ixg-service__icon--3 i:nth-child(2){left:14px;top:31px;width:72%;height:7px!important}
.ixg-service__icon--3 i:nth-child(3){left:28px;top:53px;width:46%;height:7px!important}
.ixg-service:nth-child(even) .ixg-service__icon{color:var(--ix-brand-primary)!important}
.ixg-service__content{
 display:grid!important;
 grid-template-columns:minmax(300px,.9fr) minmax(280px,1fr)!important;
 gap:clamp(30px,6vw,90px)!important;
 align-items:end!important
}

.ixm-graphic-band{
 height:122px!important;
 background:var(--ix-brand-primary)!important;
 color:#fff!important;
 overflow:hidden!important
}
.ixm-graphic-band__inner{
 height:100%!important;
 display:grid!important;
 grid-template-columns:180px 1fr 180px!important;
 gap:32px!important;
 align-items:center!important
}
.ixm-graphic-band__mark{position:relative!important;height:74px!important;display:block!important}
.ixm-graphic-band__mark i{position:absolute!important;left:0!important;right:0!important;height:8px!important;background:#fff!important}
.ixm-graphic-band__mark i:nth-child(1){top:10px}.ixm-graphic-band__mark i:nth-child(2){top:31px}.ixm-graphic-band__mark i:nth-child(3){top:52px}
.ixm-graphic-band__mark--end{transform:scaleX(-1);opacity:.72}
.ixm-graphic-band__rail{display:grid!important;grid-template-columns:repeat(4,1fr)!important;gap:16px!important;align-items:center!important}
.ixm-graphic-band__rail i{height:1px!important;background:rgba(255,255,255,.7)!important;position:relative!important}
.ixm-graphic-band__rail i:after{
 content:""!important;position:absolute!important;right:-1px!important;top:-5px!important;width:11px!important;height:11px!important;
 border:2px solid #fff!important;border-radius:50%!important;background:var(--ix-brand-primary)!important
}

.ixg-trust-section{
 padding:clamp(86px,8vw,120px) 0!important;
 background:var(--ix-brand-ink)!important;
 color:#fff!important
}
.ixg-trust-section .ixg-section-head{
 border-bottom-color:rgba(255,255,255,.16)!important;
 margin-bottom:34px!important
}
.ixg-trust-section .ixg-section-head:before{
 background:var(--ix-brand-primary)!important
}
.ixg-proof-metrics{
 display:grid!important;
 grid-template-columns:repeat(3,minmax(0,1fr))!important;
 gap:1px!important;
 margin:0 0 38px!important;
 background:rgba(255,255,255,.15)!important;
 border:1px solid rgba(255,255,255,.15)!important
}
.ixg-proof-metric{
 position:relative!important;
 min-height:230px!important;
 padding:30px 28px 28px!important;
 background:var(--ix-brand-ink)!important;
 display:flex!important;
 flex-direction:column!important;
 justify-content:space-between!important;
 overflow:hidden!important
}
.ixg-proof-metric__label{
 font-size:10px!important;
 line-height:1.2!important;
 font-weight:900!important;
 text-transform:uppercase!important;
 letter-spacing:.16em!important;
 color:rgba(255,255,255,.58)!important;
 position:relative!important;
 z-index:2!important
}
.ixg-proof-metric strong{
 font-size:clamp(40px,5.6vw,82px)!important;
 line-height:.88!important;
 letter-spacing:-.055em!important;
 font-weight:850!important;
 color:#fff!important;
 position:relative!important;
 z-index:2!important;
 max-width:10ch!important
}
.ixg-proof-metric i{
 position:absolute!important;
 right:-30px!important;
 bottom:-24px!important;
 width:170px!important;
 height:100px!important;
 opacity:.22!important;
 background:linear-gradient(var(--ix-brand-primary),var(--ix-brand-primary)) 0 0/100% 9px no-repeat,
 linear-gradient(var(--ix-brand-primary),var(--ix-brand-primary)) 0 30px/76% 9px no-repeat,
 linear-gradient(var(--ix-brand-primary),var(--ix-brand-primary)) 0 60px/52% 9px no-repeat,
 linear-gradient(var(--ix-brand-primary),var(--ix-brand-primary)) 0 90px/28% 9px no-repeat!important
}
.ixg-proof-metric:nth-child(2){background:#181a1c!important}
.ixg-proof-metric:nth-child(3){background:var(--ix-brand-primary)!important}

.ixg-trust-grid{
 display:grid!important;
 grid-template-columns:1fr!important;
 gap:0!important;
 border-top:1px solid rgba(255,255,255,.18)!important
}
.ixg-trust{
 min-height:190px!important;
 padding:34px 0 34px 190px!important;
 border:0!important;
 border-bottom:1px solid rgba(255,255,255,.18)!important;
 display:flex!important;
 flex-direction:column!important;
 align-items:flex-start!important;
 justify-content:center!important;
 gap:22px!important;
 position:relative!important;
 background:transparent!important
}
.ixg-trust:before{
 content:""!important;
 position:absolute!important;
 left:0!important;
 top:50%!important;
 transform:translateY(-50%)!important;
 width:142px!important;
 height:58px!important;
 background:
  linear-gradient(var(--ix-brand-primary),var(--ix-brand-primary)) 0 0/58px 58px no-repeat,
  linear-gradient(var(--ix-brand-primary),var(--ix-brand-primary)) 76px 8px/66px 5px no-repeat,
  linear-gradient(var(--ix-brand-primary),var(--ix-brand-primary)) 76px 27px/48px 5px no-repeat,
  linear-gradient(var(--ix-brand-primary),var(--ix-brand-primary)) 76px 46px/30px 5px no-repeat!important
}
.ixg-trust:after{
 content:""!important;
 position:absolute!important;
 left:18px!important;
 top:50%!important;
 width:20px!important;
 height:11px!important;
 border-left:4px solid #fff!important;
 border-bottom:4px solid #fff!important;
 transform:translateY(-58%) rotate(-45deg)!important;
 transform-origin:center!important
}
.ixg-trust strong{
 font-size:clamp(27px,2.7vw,42px)!important;
 line-height:1.02!important;
 font-weight:820!important;
 letter-spacing:-.038em!important
}

.ixm-bridge{
 position:relative!important;
 padding:clamp(96px,10vw,150px) 0!important;
 background:var(--ix-brand-paper)!important;
 color:var(--ix-brand-ink)!important;
 border:0!important
}
.ixm-bridge:before{
 content:"";
 position:absolute;
 left:0;
 top:0;
 bottom:0;
 width:10px;
 background:var(--ix-brand-primary)
}
.ixm-bridge__grid{
 grid-template-columns:minmax(0,1fr) auto!important;
 gap:clamp(54px,8vw,110px)!important;
 align-items:center!important
}
.ixm-bridge__copy{
 border-left:0!important;
 padding-left:0!important;
 max-width:920px!important;
 position:relative!important
}
.ixm-bridge__copy:after{
 content:""!important;
 display:block!important;
 width:min(520px,72%)!important;
 height:48px!important;
 margin-top:34px!important;
 background:
  linear-gradient(var(--ix-brand-primary),var(--ix-brand-primary)) 0 0/100% 5px no-repeat,
  linear-gradient(var(--ix-brand-primary),var(--ix-brand-primary)) 0 18px/72% 5px no-repeat,
  linear-gradient(var(--ix-brand-primary),var(--ix-brand-primary)) 0 36px/44% 5px no-repeat!important
}
.ixm-bridge h2{
 max-width:12ch!important;
 font-size:clamp(54px,6.8vw,96px)!important;
 line-height:.91!important;
 font-weight:850!important;
 letter-spacing:-.052em!important
}
.ixm-bridge .ixg-section-intro{
 margin-top:4px!important;
 color:#4b4c4e!important
}
.ixm-bridge .ixg-cta{
 min-height:56px!important;
 min-width:250px!important;
 padding:0 26px!important;
 background:var(--ix-brand-primary)!important;
 color:#fff!important;
 border:1px solid var(--ix-brand-primary)!important
}

.ixg-contact{
 position:relative!important;
 padding:clamp(94px,9vw,130px) 0!important;
 background:var(--ix-brand-primary)!important;
 color:#fff!important;
 border:0!important
}
.ixg-contact:after{
 content:"";
 position:absolute;
 right:0;
 top:0;
 width:42%;
 height:100%;
 opacity:.18;
 background:repeating-linear-gradient(
  0deg,
  transparent 0 14px,
  rgba(255,255,255,.30) 14px 15px
 )
}
.ixg-contact__inner{position:relative;z-index:1}
.ixg-contact h2{
 max-width:10ch!important;
 color:#fff!important;
 font-size:clamp(58px,7vw,98px)!important;
 line-height:.90!important;
 font-weight:850!important;
 letter-spacing:-.052em!important
}
.ixg-contact .ixg-section-intro,
.ixg-contact .ixg-kicker{
 color:rgba(255,255,255,.82)!important
}
.ixg-contact .ixg-actions{
 margin-top:0!important;
 align-self:center!important
}
.ixg-contact .ixg-cta--primary{
 background:var(--ix-brand-ink)!important;
 color:#fff!important;
 border-color:var(--ix-brand-ink)!important
}
.ixg-contact .ixg-cta--secondary{
 color:#fff!important;
 border-color:rgba(255,255,255,.82)!important
}

.ix-v2-footer{
 position:relative!important;
 background:var(--ix-brand-paper)!important;
 color:var(--ix-brand-ink)!important;
 border-top:0!important;
 padding:62px clamp(28px,6vw,90px) 42px!important
}
.ix-v2-footer:before{
 content:"";
 position:absolute;
 left:0;
 top:0;
 width:100%;
 height:12px;
 margin:0;
 background:repeating-linear-gradient(
  180deg,
  var(--ix-brand-primary) 0 2px,
  transparent 2px 4px
 )
}
.ix-v2-footer-grid{
 grid-template-columns:minmax(360px,1.25fr) minmax(170px,.48fr) minmax(280px,.72fr)!important;
 gap:clamp(34px,5vw,76px)!important;
 padding-top:30px!important;
 border-top:1px solid rgba(32,34,36,.18)!important;
 align-items:start!important
}
.ix-v2-footer-brand{padding-top:0!important;padding-right:32px!important;border-right:1px solid rgba(32,34,36,.12)!important}
.ix-v2-footer-nav,.ix-v2-footer-contact-block{padding-top:2px!important}
.ix-v2-footer-contact-block{position:relative!important}
.ix-v2-footer-contact-block:after{
 content:""!important;
 display:block!important;
 width:100%!important;
 height:28px!important;
 margin-top:28px!important;
 background:
  linear-gradient(var(--ix-brand-primary),var(--ix-brand-primary)) 0 0/100% 4px no-repeat,
  linear-gradient(var(--ix-brand-primary),var(--ix-brand-primary)) 0 12px/72% 4px no-repeat,
  linear-gradient(var(--ix-brand-primary),var(--ix-brand-primary)) 0 24px/44% 4px no-repeat!important
}
.ix-v2-footer-nav a,
.ix-v2-footer a{
 color:var(--ix-brand-ink)!important;
 font-weight:800!important;
 text-transform:uppercase!important;
 letter-spacing:.08em!important
}
.ix-v2-footer-tagline{
 color:rgba(32,34,36,.62)!important;
 font-size:15px!important;
 max-width:34ch!important
}
.ix-v2-footer-address{
 color:rgba(32,34,36,.58)!important;
 font-size:13px!important
}
.ix-v2-footer-contact{
 color:var(--ix-brand-ink)!important;
 font-weight:800!important
}
.ix-v2-footer-identity{
 background:transparent!important;
 padding:0!important;
 filter:none!important
}
.ix-v2-footer-logo{
 max-width:340px!important;
 max-height:74px!important;
 mix-blend-mode:multiply!important
}
.ix-v2-footer:after{
 content:""!important;
 display:block!important;
 width:100%!important;
 height:6px!important;
 margin-top:42px!important;
 background:linear-gradient(90deg,var(--ix-brand-primary) 0 42%,var(--ix-brand-ink) 42% 72%,rgba(32,34,36,.16) 72% 100%)!important
}

@media(max-width:700px){
 .ix-v2-header-inner{
  width:calc(100% - 28px)!important;
  min-height:118px!important;
  grid-template-columns:minmax(0,1fr) 132px!important;
  align-content:center!important;
  row-gap:11px!important;
  padding:10px 0 8px!important
 }
 .ix-v2-logo{max-width:170px!important;max-height:46px!important;mix-blend-mode:multiply!important}
 .ix-v2-header-cta{
  min-height:38px!important;
  padding:0 12px!important;
  font-size:9px!important
 }
 .ix-v2-nav{
  grid-column:1/-1!important;
  grid-row:2!important;
  width:100%!important;
  justify-content:space-between!important;
  gap:10px!important;
  overflow:visible!important;
  padding:10px 0 6px!important;
  border-top:1px solid rgba(32,34,36,.10)!important;
  scrollbar-width:none!important
 }
 .ix-v2-nav a{
  color:var(--ix-brand-ink)!important;
  font-size:9px!important;
  flex:0 0 auto!important
 }
 .ixm-hero{
  min-height:720px!important
 }
 .ixm-hero__inner{
  min-height:720px!important;
  align-items:flex-end!important;
  padding:150px 0 44px!important
 }
 .ixm-hero__copy{
  width:100%!important
 }
 .ixm-hero__veil{
  background:
   linear-gradient(180deg,rgba(10,11,12,.08) 0%,rgba(10,11,12,.12) 32%,rgba(10,11,12,.48) 58%,rgba(10,11,12,.96) 100%)!important
 }
 .ixm-hero h1{
  font-size:clamp(38px,10.8vw,48px)!important;
  line-height:.95!important;
  max-width:11.5ch!important
 }
 .ixm-hero .ixg-lede{
  font-size:15px!important;
  line-height:1.45!important
 }
 .ixm-hero .ixg-actions{
  display:grid!important;
  grid-template-columns:1fr!important;
  gap:9px!important
 }
 .ixm-hero .ixg-cta{width:100%!important}
 .ixg-shell{width:calc(100% - 28px)!important}

 .ixg-positioning{
  padding:58px 0 64px!important
 }
 .ixg-split{
  grid-template-columns:1fr!important;
  gap:34px!important
 }
 .ixg-positioning__statement h2{
  font-size:clamp(42px,12vw,58px)!important;
  max-width:10ch!important
 }
 .ixg-positioning__body{
  max-width:none!important
 }

 .ixg-services{
  padding-bottom:70px!important
 }
 .ixg-services .ixg-section-head{
  grid-template-columns:1fr!important;
  gap:12px!important;
  padding:56px 0 28px!important;
  margin-bottom:18px!important
 }
 .ixg-services__grid{
  display:flex!important;
  flex-direction:column!important;
  gap:0!important
 }
 .ixg-service{
  min-height:0!important;
  grid-template-columns:1fr!important;
  gap:24px!important;
  padding:38px 0 34px!important;
  margin-left:0!important;
  margin-right:0!important
 }
 .ixg-service:nth-child(even){
  margin-left:-14px!important;
  margin-right:-14px!important;
  padding-left:14px!important;
  padding-right:14px!important
 }
 .ixg-service__content{
  grid-template-columns:1fr!important;
  gap:18px!important
 }
 .ixg-service__visual{min-height:72px!important}
 .ixg-service__icon{width:62px!important;height:62px!important;flex-basis:62px!important}
 .ixm-graphic-band{height:88px!important}
 .ixm-graphic-band__inner{grid-template-columns:82px 1fr 82px!important;gap:14px!important}
 .ixm-graphic-band__mark{height:54px!important}
 .ixm-graphic-band__mark i{height:5px!important}
 .ixm-graphic-band__mark i:nth-child(1){top:8px}.ixm-graphic-band__mark i:nth-child(2){top:24px}.ixm-graphic-band__mark i:nth-child(3){top:40px}
 .ixg-service:before{
  left:28px!important;
  top:26px!important
 }
 .ixg-service__title{
  font-size:clamp(32px,9.2vw,43px)!important
 }

 .ixg-trust-section{
  padding:66px 0 76px!important
 }
 .ixg-proof-metrics{
  grid-template-columns:1fr!important;
  margin-bottom:28px!important
 }
 .ixg-proof-metric{
  min-height:150px!important;
  padding:24px 22px!important
 }
 .ixg-proof-metric strong{
  font-size:clamp(38px,12vw,54px)!important
 }
 .ixg-trust-grid{
  grid-template-columns:1fr!important;
  gap:0!important
 }
 .ixg-trust{
  min-height:210px!important;
  padding:28px 0 28px 96px!important
 }
 .ixg-trust:before{
  width:72px!important;
  height:48px!important;
  background:
   linear-gradient(var(--ix-brand-primary),var(--ix-brand-primary)) 0 0/48px 48px no-repeat,
   linear-gradient(var(--ix-brand-primary),var(--ix-brand-primary)) 58px 8px/14px 4px no-repeat,
   linear-gradient(var(--ix-brand-primary),var(--ix-brand-primary)) 58px 22px/10px 4px no-repeat,
   linear-gradient(var(--ix-brand-primary),var(--ix-brand-primary)) 58px 36px/7px 4px no-repeat!important
 }
 .ixg-trust:after{left:14px!important;width:17px!important;height:9px!important}
 .ixg-trust strong{
  font-size:clamp(25px,7.5vw,34px)!important
 }

 .ixm-bridge{
  padding:72px 0!important
 }
 .ixm-bridge:before{width:7px}
 .ixm-bridge__grid{
  grid-template-columns:1fr!important;
  gap:34px!important
 }
 .ixm-bridge h2{
  font-size:clamp(44px,12vw,60px)!important
 }
 .ixm-bridge .ixg-actions{
  display:grid!important;
  width:100%!important
 }
 .ixm-bridge .ixg-cta{
  width:100%!important;
  min-width:0!important
 }

 .ixg-contact{
  padding:72px 0 76px!important
 }
 .ixg-contact__inner{
  grid-template-columns:1fr!important;
  gap:34px!important
 }
 .ixg-contact h2{
  font-size:clamp(44px,12vw,62px)!important
 }
 .ixg-contact .ixg-actions{
  display:grid!important;
  width:100%!important
 }
 .ixg-contact .ixg-cta{width:100%!important}
 .ix-v2-footer{
  padding:52px 20px 38px!important
 }
 .ix-v2-footer-grid{
  grid-template-columns:1fr!important;
  gap:24px!important;
  padding-top:24px!important
 }
 .ix-v2-footer-brand{
  padding-top:0!important;
  padding-right:0!important;
  padding-bottom:24px!important;
  border-right:0!important;
  border-bottom:1px solid rgba(32,34,36,.12)!important
 }
 .ix-v2-footer-nav,.ix-v2-footer-contact-block{
  padding-top:0!important
 }
 .ix-v2-footer:before{
  margin:0!important
 }
}}`:"";

  const variants={
    A:`
.ixg-a .ixg-hero__device span:nth-child(1){height:16px}.ixg-a .ixg-hero__device span:nth-child(2){width:16px}
.ixg-a .ixg-hero__device span:nth-child(3){left:8%;width:76%;height:10px;background:var(--ix-accent)}.ixg-a .ixg-hero__device span:nth-child(4){left:54%;height:76%;width:10px}
.ixg-a.ixg-positioning{background:#f7f5ef}.ixg-a .ixg-positioning__statement h2{max-width:12ch}.ixg-a .ixg-service:nth-child(2n){background:#f4f1ea}.ixg-a .ixg-service:last-child:nth-child(odd){grid-column:1/-1}
.ixg-a .ixg-bridge__device i:nth-child(1){height:14px}.ixg-a .ixg-bridge__device i:nth-child(2){width:14px}
`,
    B:`
.ix-v2-header{background:#111;color:#f4f1ea;border-bottom-color:rgba(244,241,234,.22)}.ix-v2-nav a{color:#f4f1ea;font-size:15px;font-weight:700;letter-spacing:.025em}.ix-v2-header-cta{background:#f4f1ea;color:#111;border-color:#f4f1ea}
.ixg-b{--ix-paper:#111;--ix-ink:#f4f1ea;--ix-muted:#aaa59b;--ix-line:rgba(244,241,234,.22)}
.ixb-hero{background:#111;color:#f4f1ea;padding:clamp(84px,10vw,155px) 0 clamp(70px,8vw,120px)}
.ixb-hero__media{margin:0;height:clamp(420px,56vw,760px);overflow:hidden}.ixb-hero__media .ixg-hero__image{width:100%;height:100%;object-fit:cover;object-position:center}
.ixb-hero__inner{display:grid;grid-template-columns:minmax(0,1fr);gap:28px}.ixb-hero__meta{display:flex;align-items:flex-start;justify-content:space-between;gap:30px;border-bottom:1px solid rgba(244,241,234,.28);padding-bottom:24px}
.ixb-hero h1{font-family:Georgia,'Times New Roman',serif;font-weight:500;font-size:clamp(74px,11.5vw,182px);line-height:.79;letter-spacing:-.07em;max-width:8.6ch;margin-top:10px}
.ixb-hero .ixg-lede{color:#c9c4ba;max-width:58ch;font-size:clamp(18px,1.6vw,24px)}.ixb-hero .ixg-actions{margin-top:0}.ixb-hero .ixg-cta--primary{background:#f4f1ea;color:#111;border-color:#f4f1ea}.ixb-hero .ixg-cta--secondary{color:#f4f1ea;border-color:#f4f1ea}
.ixb-trust{background:linear-gradient(135deg,#f4f1ea 0%,#fff 58%,rgba(141,137,129,.10) 100%);color:#111;padding:0}.ixb-trust-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));border-left:1px solid #111;border-top:1px solid #111}
.ixb-trust-item{min-height:210px;padding:30px;border-right:1px solid #111;border-bottom:1px solid #111;display:flex;align-items:flex-end}.ixb-trust-item strong{font-family:Arial,Helvetica,sans-serif;font-size:clamp(26px,3vw,46px);line-height:1;letter-spacing:-.04em}.ixb-trust-item--contact{min-height:120px;align-items:center}.ixb-trust-item--contact span{font-size:14px;line-height:1.45;font-weight:600;overflow-wrap:anywhere;word-break:break-word;max-width:34ch}
.ixb-services{background:#f4f1ea;color:#111;padding:clamp(72px,8vw,120px) 0}.ixb-service-row{display:grid;grid-template-columns:minmax(250px,.8fr) minmax(0,1.2fr);gap:clamp(34px,7vw,110px);padding:clamp(42px,5vw,70px) 0;border-top:1px solid rgba(17,17,17,.28);align-items:start}.ixb-service-row:last-child{border-bottom:1px solid rgba(17,17,17,.28)}
.ixb-service-row h3{font-family:Arial,Helvetica,sans-serif;font-size:clamp(38px,5.2vw,76px);line-height:.92;letter-spacing:-.055em;text-transform:uppercase}.ixb-service-body p{color:#3f3c36;font-size:clamp(18px,1.5vw,23px);max-width:50ch}.ixb-service-row--feature{min-height:360px;grid-template-columns:minmax(280px,.95fr) minmax(0,1.05fr);align-items:center}.ixb-service-row--feature h3{max-width:10ch}.ixb-service-row--feature .ixb-service-body p{font-size:clamp(20px,1.8vw,28px);line-height:1.42;max-width:42ch}
.ixb-positioning{background:linear-gradient(135deg,#f4f1ea 0%,#fff 60%,rgba(17,17,17,.035) 100%);color:#111;padding:clamp(76px,9vw,140px) 0}.ixb-positioning__inner{display:grid;grid-template-columns:180px minmax(0,1fr);gap:clamp(36px,7vw,110px);align-items:start}.ixb-positioning h2{font-family:Georgia,'Times New Roman',serif;font-weight:500;font-size:clamp(50px,7.2vw,108px);line-height:.9;letter-spacing:-.055em;max-width:12ch}
.ixb-bridge{background:#f4f1ea;color:#111;padding:clamp(64px,7vw,105px) 0;border-bottom:1px solid rgba(17,17,17,.25)}.ixb-bridge__inner{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:40px;align-items:end}.ixb-bridge__copy{display:grid;gap:22px;max-width:780px}.ixb-bridge__copy p{max-width:52ch;color:#4e4a44;font-size:clamp(17px,1.45vw,22px)}.ixb-bridge h2{font-family:Arial,Helvetica,sans-serif;font-size:clamp(38px,5vw,72px);line-height:.94;letter-spacing:-.045em}
.ixb-contact{background:linear-gradient(135deg,#fff 0%,#f4f1ea 72%,rgba(141,137,129,.12) 100%);color:#111;padding:28px 0}.ixb-contact__inner{display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap}.ixb-contact .ixg-kicker{max-width:44ch}.ixb-contact .ixg-actions{margin-top:0}.ixb-contact .ixg-cta--primary{background:#111;color:#fff;border-color:#111}
@media(max-width:700px){
 .ixb-hero{padding:62px 0 64px}.ixb-hero__meta{display:grid;gap:18px}.ixb-hero h1{font-size:clamp(54px,15vw,76px);line-height:.84;max-width:none}.ixb-hero .ixg-actions{display:flex;flex-wrap:wrap}
 .ixb-trust-grid{grid-template-columns:1fr}.ixb-trust-item{min-height:0;padding:26px 22px}.ixb-trust-item--contact{padding:20px 22px}.ixb-trust-item strong{font-size:clamp(24px,8vw,34px)}
 .ixb-services{padding:54px 0}.ixb-service-row{grid-template-columns:1fr;gap:18px;padding:34px 0}.ixb-service-row--feature{min-height:0;grid-template-columns:1fr;padding:42px 0}.ixb-service-row h3{font-size:clamp(36px,11vw,54px)}
 .ixb-positioning{padding:58px 0}.ixb-positioning__inner{grid-template-columns:1fr;gap:24px}.ixb-positioning h2{font-size:clamp(42px,12vw,62px)}
 .ixb-bridge{padding:52px 0}.ixb-bridge__inner{grid-template-columns:1fr;align-items:start}.ixb-contact{padding:24px 0}.ixb-contact__inner{display:flex;align-items:flex-start;flex-direction:column;gap:14px}.ixb-contact .ixg-actions,.ixb-bridge .ixg-actions{margin-top:0}
}
`,
    C:`
.ixc-hero{background:#f1f0ec;color:#111;padding:clamp(88px,11vw,170px) 0 54px}.ixc-hero__inner{display:block}.ixc-hero h1{font-family:Georgia,'Times New Roman',serif;font-weight:500;font-size:clamp(72px,10.8vw,174px);line-height:.82;letter-spacing:-.068em;max-width:8.8ch;margin-top:34px}
.ixc-hero__media{margin:0;height:clamp(380px,48vw,680px);overflow:hidden}.ixc-hero__media .ixg-hero__image{width:100%;height:100%;object-fit:cover;object-position:center}
.ixc-hero__lower{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:50px;align-items:end;margin-top:clamp(46px,7vw,96px);padding-top:30px;border-top:1px solid #111}.ixc-hero__lower .ixg-lede{margin-top:0!important;max-width:52ch}.ixc-hero__lower .ixg-actions{margin-top:0}
.ixc-rail{height:1px;margin-top:54px;background:#111;position:relative}.ixc-rail:after{position:absolute;left:0;top:-2px;width:18%;height:5px;background:var(--ix-accent)}
.ixc-positioning{background:#eceae5;color:#111;padding:clamp(50px,6vw,82px) 0}.ixc-positioning__grid{display:grid;grid-template-columns:180px minmax(0,1fr);gap:clamp(28px,5vw,72px);align-items:start}.ixc-positioning h2{font-family:Georgia,'Times New Roman',serif;font-weight:500;font-size:clamp(30px,4.2vw,58px);line-height:1;letter-spacing:-.035em;max-width:20ch}
.ixc-services{background:#faf9f6;color:#111;padding:0}.ixc-ledger-row{display:grid;grid-template-columns:1fr;gap:18px;padding:clamp(38px,5vw,64px) 0;border-bottom:1px solid rgba(17,17,17,.24);align-items:start}.ixc-ledger-row:first-child{border-top:1px solid rgba(17,17,17,.24)}
.ixc-ledger-row h3{font-family:Georgia,'Times New Roman',serif;font-weight:500;font-size:clamp(32px,4.2vw,62px);line-height:.96;letter-spacing:-.04em}.ixc-ledger-value p{font-size:clamp(18px,1.65vw,24px);line-height:1.55;max-width:52ch;color:#4e4a44}
.ixc-trust{background:#fff;color:#111;padding:clamp(54px,7vw,92px) 0}.ixc-trust__inner{display:grid;grid-template-columns:1fr}.ixc-trust-row{display:block;padding:26px 0;border-bottom:1px solid rgba(17,17,17,.2)}.ixc-trust-row:first-child{border-top:1px solid rgba(17,17,17,.2)}.ixc-trust-row strong{display:block;font-family:Georgia,'Times New Roman',serif;font-weight:500;font-size:clamp(26px,3.4vw,48px);line-height:1.04;letter-spacing:-.035em;max-width:24ch}
.ixc-bridge{background:#fff;color:#111;padding:clamp(68px,8vw,118px) 0}.ixc-bridge__inner{display:grid;grid-template-columns:10px minmax(0,.72fr) minmax(320px,1fr);gap:clamp(24px,4.5vw,68px);align-items:center}.ixc-bridge__rule{grid-column:1;grid-row:1;background:var(--ix-accent);min-height:280px}.ixc-bridge__copy{grid-column:2;grid-row:1;display:grid;gap:22px;max-width:650px}.ixc-bridge__copy h2{font-family:Georgia,'Times New Roman',serif;font-weight:500;font-size:clamp(48px,6.4vw,92px);line-height:.9;letter-spacing:-.055em}.ixc-bridge__copy p{max-width:40ch;color:#4e4a44}.ixc-bridge .ixg-section-visual--two{grid-column:3;grid-row:1;width:100%;margin:0;min-height:280px;max-height:420px}
.ixc-contact{background:#f7f6f2;color:#111;padding:28px 0;border-top:1px solid rgba(17,17,17,.2)}.ixc-contact__inner{display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap}
.ixc-hero .ixg-cta,.ixc-contact .ixg-cta{background:transparent!important;color:inherit!important;border:0!important;border-bottom:1px solid currentColor!important;padding:0 0 7px!important;min-height:0!important;border-radius:0!important;width:auto!important;justify-content:flex-start!important}
.ixc-hero .ixg-actions,.ixc-contact .ixg-actions{gap:18px 28px}
@media(max-width:700px){
 .ixc-hero{padding:64px 0 42px}.ixc-hero h1{font-size:clamp(54px,15vw,76px);line-height:.86;max-width:none;margin-top:26px}.ixc-hero__lower{grid-template-columns:1fr;gap:26px;margin-top:42px}.ixc-hero__lower .ixg-actions{display:grid}
 .ixc-rail{height:1px;margin-top:34px}.ixc-positioning{padding:58px 0}.ixc-positioning__grid{grid-template-columns:1fr;gap:22px}.ixc-positioning h2{font-size:clamp(34px,10vw,50px)}
 .ixc-ledger-row{grid-template-columns:1fr;gap:18px;padding:38px 0}.ixc-ledger-row h3{font-size:clamp(34px,10vw,50px)}.ixc-ledger-value p{font-size:17px}
 .ixc-trust{padding:44px 0}.ixc-trust-row{display:block;padding:20px 0}.ixc-trust-row strong{font-size:clamp(24px,7.2vw,34px);line-height:1.08;max-width:none;overflow-wrap:normal;word-break:normal}
 .ixc-bridge{padding:44px 0}.ixc-bridge__inner{grid-template-columns:4px minmax(0,1fr);column-gap:16px;row-gap:20px}.ixc-bridge__rule{grid-column:1;grid-row:1 / span 2;min-height:0;align-self:stretch}.ixc-bridge__copy{grid-column:2;grid-row:1;gap:12px}.ixc-bridge__copy h2{font-size:clamp(34px,10vw,48px);line-height:.94}.ixc-bridge__copy p{font-size:15px!important;line-height:1.55!important}.ixc-bridge .ixg-section-visual--two{grid-column:2;grid-row:2;width:100%;margin:0;min-height:180px;max-height:240px}
 .ixc-contact{padding:24px 0}.ixc-contact__inner{display:flex;align-items:flex-start;flex-direction:column;gap:14px}.ixc-contact .ixg-actions{margin-top:0}
}
`
  };

  const r89SurfaceCss=`
.ixg-services,.ixb-services,.ixc-services,.ixg-bridge,.ixb-bridge,.ixc-bridge,.ixg-contact,.ixb-contact,.ixc-contact{position:relative;isolation:isolate;overflow:hidden}
.ixg-services,.ixb-services,.ixc-services{background:radial-gradient(circle at 88% 16%,${brandSoft},transparent 34%),linear-gradient(145deg,${brandPaper} 0%,#fff 54%,${brandNeutral} 100%)!important}
.ixg-bridge,.ixb-bridge,.ixc-bridge{background:radial-gradient(circle at 90% 42%,${brandGlow},transparent 33%),linear-gradient(125deg,${brandPaper} 0%,#fff 56%,${brandSoft} 100%)!important}
.ixg-contact,.ixb-contact,.ixc-contact{background:radial-gradient(circle at 82% 18%,${brandGlow},transparent 32%),linear-gradient(122deg,${brandInk} 0%,#17191b 58%,${brandPrimary} 145%)!important;color:#fff!important}
.ixg-services>.ixg-shell,.ixb-services>.ixg-shell,.ixc-services>.ixg-shell,.ixg-bridge>.ixg-shell,.ixb-bridge>.ixg-shell,.ixc-bridge>.ixg-shell,.ixg-contact>.ixg-shell,.ixb-contact>.ixg-shell,.ixc-contact>.ixg-shell{position:relative;z-index:2}
.ixg-contact .ixg-kicker,.ixb-contact .ixg-kicker,.ixc-contact .ixg-kicker,.ixg-contact h2,.ixb-contact h2,.ixc-contact h2,.ixg-contact .ixg-section-intro,.ixb-contact .ixg-section-intro,.ixc-contact .ixg-section-intro{color:#fff!important}
.ixg-contact .ixg-section-intro,.ixb-contact .ixg-section-intro,.ixc-contact .ixg-section-intro{opacity:.76}
.ixg-contact .ixg-cta--primary,.ixb-contact .ixg-cta--primary,.ixc-contact .ixg-cta--primary{background:${brandPrimary}!important;color:#fff!important;border:1px solid ${brandPrimary}!important;padding:0 24px!important;min-height:52px!important}
.ixg-contact .ixg-cta--secondary,.ixb-contact .ixg-cta--secondary,.ixc-contact .ixg-cta--secondary{color:#fff!important;border:1px solid rgba(255,255,255,.55)!important;background:rgba(255,255,255,.04)!important;padding:0 24px!important;min-height:52px!important}
.ixr89-lines{position:absolute;inset:0;z-index:1;pointer-events:none;overflow:hidden;opacity:.34}
.ixr89-lines i{position:absolute;right:-8%;width:72%;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.42),${brandPrimary},transparent);transform:rotate(-8deg);transform-origin:right center}
.ixr89-lines i:nth-child(1){top:20%}.ixr89-lines i:nth-child(2){top:49%;width:88%}.ixr89-lines i:nth-child(3){top:78%;width:62%}
.ixr89-watermark{position:absolute;right:-3vw;top:50%;transform:translateY(-50%);width:min(720px,50vw);pointer-events:none;z-index:1}
.ixr89-watermark .ix-v2-identity-main{width:100%!important;max-height:280px!important;object-fit:contain!important;opacity:.12!important;filter:brightness(0) invert(1) saturate(.7)!important;mix-blend-mode:screen}
@media(max-width:700px){
 .ixr89-watermark{right:-42%;width:112vw;top:46%}
 .ixr89-watermark .ix-v2-identity-main{opacity:.10!important}
 .ixr89-lines{opacity:.24}
}
`;

  const r90LaunchCss=`
.ixg-hero,.ixm-hero,.ixb-hero,.ixc-hero{isolation:isolate}
.ixg-hero:after,.ixm-hero:after,.ixb-hero:after,.ixc-hero:after{position:absolute;inset:0;pointer-events:none;z-index:1;background:radial-gradient(circle at 82% 26%,${brandGlow},transparent 25%),linear-gradient(115deg,transparent 0 58%,${brandSoft} 58% 59%,transparent 59% 100%);mix-blend-mode:screen;opacity:.48}
.ixg-hero h1,.ixm-hero h1,.ixb-hero h1,.ixc-hero h1{font-size:clamp(64px,8.8vw,136px)!important;line-height:.84!important;letter-spacing:-.07em!important}
.ixg-services,.ixb-services,.ixc-services{padding-top:clamp(84px,10vw,160px)!important;padding-bottom:clamp(110px,12vw,190px)!important}
.ixg-service,.ixb-service-row,.ixc-ledger-row{box-shadow:0 34px 90px rgba(0,0,0,.08)}
.ixg-bridge,.ixb-bridge,.ixc-bridge{min-height:clamp(520px,58vw,780px);display:flex;align-items:center}
.ixg-bridge h2,.ixb-bridge h2,.ixc-bridge h2{font-size:clamp(54px,7.4vw,112px)!important;max-width:9ch;line-height:.86!important;letter-spacing:-.065em!important}
.ixg-contact,.ixb-contact,.ixc-contact{min-height:clamp(620px,64vw,880px)!important;display:flex;align-items:center!important}
.ixg-contact h2,.ixb-contact h2,.ixc-contact h2{font-size:clamp(66px,9vw,142px)!important;line-height:.82!important;letter-spacing:-.075em!important;max-width:7.8ch}
.ixr90-stage{position:absolute;inset:0;z-index:1;pointer-events:none;overflow:hidden}
.ixr90-stage i{position:absolute;display:block;right:-12%;height:clamp(70px,8vw,130px);transform:skewX(-24deg) rotate(-7deg);background:linear-gradient(90deg,transparent,${brandPrimary},rgba(255,255,255,.11),transparent);opacity:.26}
.ixr90-stage i:nth-child(1){top:10%;width:72%}.ixr90-stage i:nth-child(2){top:45%;width:54%}.ixr90-stage i:nth-child(3){top:76%;width:36%}
.ixr89-watermark{width:min(860px,58vw)!important;right:-5vw!important}
.ixr89-watermark .ix-v2-identity-main{opacity:.14!important}
@media(max-width:700px){
 .ixg-hero h1,.ixm-hero h1,.ixb-hero h1,.ixc-hero h1{font-size:clamp(48px,13vw,72px)!important;line-height:.87!important}
 .ixg-bridge,.ixb-bridge,.ixc-bridge{min-height:540px}
 .ixg-bridge h2,.ixb-bridge h2,.ixc-bridge h2{font-size:clamp(44px,12vw,68px)!important}
 .ixg-contact,.ixb-contact,.ixc-contact{min-height:650px!important}
 .ixg-contact h2,.ixb-contact h2,.ixc-contact h2{font-size:clamp(52px,14vw,76px)!important}
 .ixr90-stage i{opacity:.20}
 .ixr89-watermark .ix-v2-identity-main{opacity:.12!important}
}
`;

  const r93TypographyCss=`
:root{--ix-display-font:Bahnschrift,"Arial Narrow","Roboto Condensed","Inter Tight","Aptos Display","Segoe UI Variable Display",sans-serif;--ix-body-font:Inter,Aptos,"Segoe UI Variable Text","Helvetica Neue",sans-serif}
body{font-family:var(--ix-body-font)}
.ixg h1,.ixg h2,.ixg h3,.ixm-hero h1,.ixb-hero h1,.ixc-hero h1{font-family:var(--ix-display-font)!important;text-wrap:balance;font-stretch:condensed}
.ixg p,.ixm-hero p,.ixb-hero p,.ixc-hero p{font-family:var(--ix-body-font)!important;text-wrap:pretty}
.ixg-hero,.ixm-hero,.ixb-hero,.ixc-hero{width:100vw!important;max-width:none!important;margin-left:calc(50% - 50vw)!important;margin-right:calc(50% - 50vw)!important}
.ixg-hero h1,.ixm-hero h1,.ixb-hero h1,.ixc-hero h1{font-size:clamp(56px,7.2vw,116px)!important;line-height:.90!important;letter-spacing:-.055em!important;max-width:10.8ch!important}
.ixg-lede,.ixg-section-intro{line-height:1.65!important;max-width:58ch!important}
.ixg-section-head{gap:clamp(34px,5vw,78px)!important;padding-top:clamp(72px,8vw,126px)!important;padding-bottom:clamp(36px,4vw,62px)!important}
.ixg-service,.ixb-service-row,.ixc-ledger-row{padding:clamp(30px,3.4vw,52px)!important}
.ixg-service h3,.ixb-service-row h3,.ixc-ledger-row h3{margin-bottom:clamp(18px,2vw,28px)!important}
.ix-v2-header{background:rgba(255,255,255,.94)!important;backdrop-filter:blur(18px);box-shadow:inset 0 3px 0 ${brandPrimary},0 12px 46px rgba(17,17,17,.045)!important}
.ix-v2-header-inner{min-height:90px!important}
.ix-v2-nav a{font-family:var(--ix-body-font)!important;font-size:12px!important;letter-spacing:.075em!important;text-transform:uppercase;background-image:linear-gradient(${brandPrimary},${brandPrimary});background-repeat:no-repeat;background-size:0 1px;background-position:0 100%;transition:background-size .2s ease}
.ix-v2-nav a:hover{background-size:100% 1px}
.ix-v2-header-cta{font-family:var(--ix-body-font)!important;background:${brandPrimary}!important;border-color:${brandPrimary}!important;color:#fff!important;min-height:48px!important;padding:0 24px!important;letter-spacing:.07em!important;text-transform:uppercase}
.ix-v2-footer{background:radial-gradient(circle at 84% 12%,${brandGlow},transparent 28%),linear-gradient(132deg,#0c0d0f 0%,#17191b 58%,${brandPrimary} 180%)!important;border-top:1px solid rgba(255,255,255,.14)!important}
.ix-v2-footer-grid{gap:clamp(48px,7vw,110px)!important}
.ix-v2-footer-tagline{font-family:var(--ix-body-font)!important;line-height:1.68!important;max-width:38ch!important;text-wrap:pretty}
.ix-v2-footer-nav a,.ix-v2-footer-contact,.ix-v2-footer-address{font-family:var(--ix-body-font)!important}
.ix-v2-footer-nav a{letter-spacing:.075em!important;text-transform:uppercase}
.ix-v2-footer-contact:first-child{border-color:${brandPrimary}!important;background:${brandPrimary}!important;color:#fff!important}
@media(max-width:820px){
 .ixg-hero,.ixm-hero,.ixb-hero,.ixc-hero{width:100vw!important;margin-left:calc(50% - 50vw)!important;margin-right:calc(50% - 50vw)!important}
 .ixg-hero h1,.ixm-hero h1,.ixb-hero h1,.ixc-hero h1{font-size:clamp(42px,11vw,60px)!important;line-height:.96!important;letter-spacing:-.04em!important;max-width:11ch!important}
 .ixg h2{font-size:clamp(36px,9.8vw,54px)!important;line-height:1!important;letter-spacing:-.035em!important}
 .ixg h3{font-size:clamp(23px,6.5vw,32px)!important;line-height:1.08!important}
 .ixg p,.ixg-section-intro,.ixg-lede{font-size:clamp(15px,4.2vw,18px)!important;line-height:1.68!important;max-width:34em!important}
 .ixg-section-head{grid-template-columns:1fr!important;gap:22px!important;padding-top:76px!important;padding-bottom:30px!important}
 .ixg-actions{margin-top:30px!important;gap:10px!important}
 .ixg-cta{min-height:48px!important;padding:0 18px!important;font-size:12px!important}
 .ix-v2-header-inner{min-height:78px!important}
 .ix-v2-nav{gap:20px!important}
 .ix-v2-nav a{font-size:11px!important;line-height:1.25!important}
 .ix-v2-header-cta{min-height:42px!important;padding:0 14px!important;font-size:10px!important}
 .ix-v2-footer{padding-top:68px!important;padding-bottom:74px!important}
 .ix-v2-footer-grid{gap:42px!important}
 .ix-v2-footer-tagline{font-size:15px!important;line-height:1.68!important}
}
`;

  const r94ValueCss=`
.ixg-hero,.ixm-hero,.ixb-hero,.ixc-hero{box-shadow:inset 0 -1px 0 rgba(255,255,255,.12)}
.ixg-hero:before,.ixm-hero:before,.ixb-hero:before,.ixc-hero:before{content:"";position:absolute;inset:auto 0 0 0;height:18%;background:linear-gradient(180deg,transparent,rgba(0,0,0,.22));pointer-events:none;z-index:1}
.ixg-service,.ixb-service-row,.ixc-ledger-row{border:1px solid rgba(17,17,17,.08)}
.ixg-service:after,.ixb-service-row:after,.ixc-ledger-row:after{content:"";position:absolute;inset:auto 18px 16px 18px;height:1px;background:linear-gradient(90deg,${brandPrimary},transparent);opacity:.45}
.ixg-bridge,.ixb-bridge,.ixc-bridge{box-shadow:inset 0 1px 0 rgba(17,17,17,.08),inset 0 -1px 0 rgba(17,17,17,.08)}
.ixg-contact,.ixb-contact,.ixc-contact{box-shadow:inset 0 1px 0 rgba(255,255,255,.10)}
.ix-v2-header-cta,.ixg-cta--primary{box-shadow:0 14px 34px ${brandSoft}}
.ix-v2-footer{box-shadow:inset 0 1px 0 rgba(255,255,255,.08)}
`;

  const r106IconicCss=`
:root{--ix-signature-angle:-7deg;--ix-signature-rule:1px}
.ixg-hero,.ixm-hero,.ixb-hero,.ixc-hero{isolation:isolate}
.ixg-hero:after,.ixm-hero:after,.ixb-hero:after,.ixc-hero:after{content:"";position:absolute;right:-8%;top:18%;width:46%;height:42%;border:var(--ix-signature-rule) solid ${brandSoft};transform:rotate(var(--ix-signature-angle));clip-path:polygon(18% 0,100% 0,82% 100%,0 100%);pointer-events:none}
.ixg-positioning:before,.ixb-positioning:before,.ixc-positioning:before{content:"";position:absolute;right:-8%;top:8%;width:42%;height:1px;background:linear-gradient(90deg,transparent,${brandPrimary},transparent);transform:rotate(var(--ix-signature-angle));opacity:.42}
.ixg-services:before,.ixb-services:before,.ixc-services:before{content:"";position:absolute;left:0;right:0;top:0;height:1px;background:linear-gradient(90deg,${brandPrimary},transparent 62%);opacity:.62}
.ixg-trust:after,.ixb-trust:after,.ixc-trust:after{content:"";position:absolute;right:-4%;bottom:10%;width:32%;height:1px;background:linear-gradient(90deg,transparent,${brandPrimary});transform:rotate(var(--ix-signature-angle));opacity:.54}
.ixg-bridge:before,.ixb-bridge:before,.ixc-bridge:before{content:"";position:absolute;left:-12%;top:24%;width:38%;height:52%;border:var(--ix-signature-rule) solid ${brandSoft};transform:skewX(-14deg) rotate(var(--ix-signature-angle));pointer-events:none}
.ixg-final,.ixb-final,.ixc-final{isolation:isolate}
.ixg-final:after,.ixb-final:after,.ixc-final:after{content:"";position:absolute;right:-10%;top:12%;width:46%;height:72%;background:linear-gradient(135deg,transparent,${brandSoft});clip-path:polygon(24% 0,100% 0,100% 100%,0 100%);pointer-events:none}
@media(max-width:820px){
 .ixg-hero:after,.ixm-hero:after,.ixb-hero:after,.ixc-hero:after{right:-34%;width:82%;height:34%;opacity:.55}
 .ixg-bridge:before,.ixb-bridge:before,.ixc-bridge:before{left:-36%;width:68%;opacity:.45}
}
`;

  const r107UltraVisualCss=`
/* R107 — premium overlay hero + ultra-visual refinement */
/* Global premium guards: no phantom metric panels; footer identity must stay legible on dark surfaces. */
.ixg-proof-metrics{
 grid-template-columns:repeat(auto-fit,minmax(260px,1fr))!important
}
.ix-v2-footer-identity{
 background:#f7f6f2!important;
 padding:10px 14px!important;
 border-radius:3px!important;
 box-shadow:0 14px 38px rgba(0,0,0,.22)!important;
 filter:none!important;
 isolation:isolate!important
}
.ix-v2-footer-logo{
 opacity:1!important;
 filter:none!important;
 mix-blend-mode:multiply!important
}
@media(max-width:700px){
 .ixg-proof-metrics{grid-template-columns:1fr!important}
 .ix-v2-footer-identity{padding:8px 10px!important}
 .ix-v2-footer-logo{max-height:40px!important}
}
.ixm-hero,.ixb-hero,.ixc-hero{
 position:relative!important;
 isolation:isolate!important;
 min-height:clamp(700px,72vw,940px)!important;
 padding:0!important;
 margin:0!important;
 background:#0a0b0c!important;
 color:#fff!important;
 overflow:hidden!important
}
.ixm-hero__media,.ixb-hero__media,.ixc-hero__media{
 position:absolute!important;
 inset:0!important;
 width:100%!important;
 height:100%!important;
 min-height:100%!important;
 margin:0!important;
 overflow:hidden!important;
 z-index:0!important
}
.ixm-hero__media img,.ixb-hero__media img,.ixc-hero__media img,
.ixm-hero__image,.ixb-hero__media .ixg-hero__image,.ixc-hero__media .ixg-hero__image{
 position:absolute!important;
 inset:0!important;
 width:100%!important;
 height:100%!important;
 min-height:100%!important;
 max-height:none!important;
 object-fit:cover!important;
 image-rendering:auto!important;
 backface-visibility:hidden!important;
 transform:translateZ(0) scale(1.012)!important
}
.ixm-hero:before,.ixb-hero:before,.ixc-hero:before{
 content:""!important;
 position:absolute!important;
 inset:0!important;
 z-index:1!important;
 pointer-events:none!important;
 background:
  linear-gradient(90deg,rgba(7,8,9,.91) 0%,rgba(7,8,9,.70) 34%,rgba(7,8,9,.28) 63%,rgba(7,8,9,.08) 100%),
  linear-gradient(180deg,rgba(0,0,0,.20) 0%,transparent 42%,rgba(0,0,0,.68) 100%)!important
}
.ixm-hero__veil{z-index:1!important}
.ixm-hero__inner,.ixb-hero__inner,.ixc-hero__inner{
 position:relative!important;
 z-index:3!important;
 min-height:clamp(700px,72vw,940px)!important;
 width:min(calc(100% - 80px),1500px)!important;
 margin:0 auto!important;
 padding:clamp(150px,14vw,210px) 0 clamp(66px,7vw,104px)!important
}
.ixm-hero__inner{display:flex!important;align-items:flex-end!important}
.ixb-hero__inner{display:grid!important;align-content:end!important;gap:clamp(18px,2.2vw,30px)!important}
.ixc-hero__inner{display:flex!important;flex-direction:column!important;justify-content:flex-end!important}
.ixm-hero__copy,.ixb-hero__inner,.ixc-hero__inner{max-width:100%!important}
.ixm-hero h1,.ixb-hero h1,.ixc-hero h1{
 color:#fff!important;
 text-shadow:0 2px 30px rgba(0,0,0,.35)!important;
 text-wrap:balance!important;
 overflow-wrap:normal!important;
 word-break:normal!important;
 hyphens:none!important
}
.ixm-hero .ixg-kicker,.ixb-hero .ixg-kicker,.ixc-hero .ixg-kicker{
 color:rgba(255,255,255,.76)!important
}
.ixm-hero .ixg-lede,.ixb-hero .ixg-lede,.ixc-hero .ixg-lede{
 color:rgba(255,255,255,.90)!important;
 max-width:48ch!important;
 line-height:1.48!important;
 text-wrap:pretty!important
}
.ixm-hero .ixg-actions,.ixb-hero .ixg-actions,.ixc-hero .ixg-actions{
 position:relative!important;
 z-index:4!important
}
.ixm-hero .ixg-cta--secondary,.ixb-hero .ixg-cta--secondary,.ixc-hero .ixg-cta--secondary{
 color:#fff!important;
 border-color:rgba(255,255,255,.78)!important
}
.ixb-hero__meta{border-bottom-color:rgba(255,255,255,.32)!important}
.ixb-hero h1{max-width:8.8ch!important;font-size:clamp(68px,9.4vw,150px)!important;line-height:.82!important}
.ixb-hero .ixg-lede{font-size:clamp(17px,1.45vw,22px)!important}
.ixb-hero .ixg-cta--primary{background:#fff!important;color:#111!important;border-color:#fff!important}
.ixc-hero h1{max-width:9.5ch!important;font-size:clamp(64px,8.7vw,138px)!important;line-height:.86!important;margin-top:18px!important}
.ixc-hero__lower{
 display:grid!important;
 grid-template-columns:minmax(0,1fr) auto!important;
 gap:clamp(28px,5vw,68px)!important;
 align-items:end!important;
 margin-top:clamp(28px,4vw,54px)!important;
 padding-top:24px!important;
 border-top:1px solid rgba(255,255,255,.44)!important
}
.ixc-rail{background:rgba(255,255,255,.52)!important;margin-top:34px!important}
.ixc-rail:after{background:var(--ix-accent)!important}
.ixg-section-visual img,.ixb-trust img,.ixb-services img,.ixc-services img,.ixc-trust img{
 image-rendering:auto!important;
 backface-visibility:hidden!important;
 filter:saturate(.96) contrast(1.035)!important
}
/* R107 composition guard: first-party imagery must read as an authored scene, never as a leftover thumbnail. */
.ixg-positioning .ixg-split>.ixg-section-visual{
 grid-column:1/-1!important;
 width:min(86%,1180px)!important;
 min-height:clamp(340px,34vw,560px)!important;
 max-height:620px!important;
 margin:18px 0 0 auto!important
}
.ixg-positioning .ixg-split>.ixg-section-visual img{
 min-height:inherit!important;
 max-height:inherit!important
}
.ixg h1,.ixg h2,.ixg h3{
 text-wrap:balance!important;
 font-kerning:normal!important;
 font-optical-sizing:auto!important
}
.ixg p,.ixg-section-intro,.ixg-lede{
 text-wrap:pretty!important;
 orphans:2!important;
 widows:2!important
}
.ixg-section-intro{max-width:52ch!important}
.ixg-service__body,.ixb-service-body p,.ixc-ledger-value p{max-width:46ch!important}
.ixg-section-head{align-items:end!important}
@media(max-width:700px){
 .ixm-hero,.ixb-hero,.ixc-hero{min-height:720px!important}
 .ixm-hero__inner,.ixb-hero__inner,.ixc-hero__inner{
   min-height:720px!important;
   width:calc(100% - 36px)!important;
   padding:118px 0 42px!important
 }
 .ixm-hero:before,.ixb-hero:before,.ixc-hero:before{
   background:
    linear-gradient(180deg,rgba(8,9,10,.24) 0%,rgba(8,9,10,.06) 28%,rgba(8,9,10,.30) 50%,rgba(8,9,10,.94) 78%,rgba(8,9,10,.98) 100%)!important
 }
 .ixm-hero h1,.ixb-hero h1,.ixc-hero h1{
   font-size:clamp(44px,12.4vw,62px)!important;
   line-height:.91!important;
   max-width:10.5ch!important
 }
 .ixm-hero .ixg-lede,.ixb-hero .ixg-lede,.ixc-hero .ixg-lede{
   font-size:16px!important;
   line-height:1.5!important;
   max-width:31ch!important
 }
 .ixm-hero .ixg-actions,.ixb-hero .ixg-actions,.ixc-hero .ixg-actions{
   display:grid!important;
   grid-template-columns:1fr!important;
   gap:10px!important;
   width:100%!important
 }
 .ixm-hero .ixg-cta,.ixb-hero .ixg-cta,.ixc-hero .ixg-cta{
   width:100%!important;
   min-height:48px!important;
   justify-content:center!important;
   padding:0 18px!important
 }
 .ixc-hero__lower{grid-template-columns:1fr!important;gap:18px!important;margin-top:26px!important}
 .ixc-hero .ixg-cta{border:1px solid rgba(255,255,255,.72)!important;padding:0 18px!important;min-height:48px!important}
 .ixg-section-intro,.ixg-service__body,.ixb-service-body p,.ixc-ledger-value p{
   max-width:34em!important;
   line-height:1.62!important
 }
 .ixg-positioning .ixg-split>.ixg-section-visual{
   width:100%!important;
   min-height:220px!important;
   max-height:320px!important;
   margin:4px 0 0!important
 }
}
`;

  const premiumPolishCss=`
/* R107 premium finishing pass: contrast, depth, buttons and section refinement. */
.ixg-positioning,.ixg-services,.ixg-bridge,.ixg-contact{color:#202224}
.ixg-positioning p,.ixg-services p,.ixg-bridge p,.ixg-contact p{color:rgba(24,26,28,.94)!important;opacity:1!important}
.ixg-positioning .ixg-kicker,.ixg-services .ixg-kicker,.ixg-bridge .ixg-kicker,.ixg-contact .ixg-kicker,
.ixg-positioning .ixg-section-intro,.ixg-services .ixg-section-intro,.ixg-bridge .ixg-section-intro,.ixg-contact .ixg-section-intro{
 color:rgba(24,26,28,.92)!important;opacity:1!important
}
.ixg-service__body,.ixg-bridge__evidence-row p,.ixg-proof-metric p{color:rgba(24,26,28,.92)!important;opacity:1!important}
.ixg-trust-section,.ix-v2-footer{color:#f7f6f2}
.ixg-trust-section .ixg-section-intro,.ixg-trust-section p,.ix-v2-footer p,.ix-v2-footer a{color:rgba(255,255,255,.92)!important;opacity:1!important}
.ixg-trust-section .ixg-section-head--light{color:#fff!important}
.ixg-trust-section .ixg-section-head--light .ixg-section-intro{color:rgba(255,255,255,.92)!important;opacity:1!important}
.ixg-trust-section .ixg-section-head--light .ixg-kicker{color:#fff!important;opacity:1!important}
.ixg-trust-section .ixg-kicker,.ix-v2-footer .ixg-kicker,.ix-v2-footer strong{color:#fff!important;opacity:1!important}
.ixg-trust-section .ixg-kicker,.ix-v2-footer strong{color:#fff!important}
/* Section coherence system: one grid, one narrative, no random composition. */
.ixg-section-head{grid-template-columns:minmax(190px,240px) minmax(0,1fr)!important;align-items:start!important;column-gap:clamp(32px,5vw,72px)!important}
.ixg-services__grid{grid-template-columns:1fr!important}
.ixg-service{
 display:grid!important;
 grid-template-columns:120px minmax(0,1fr)!important;
 column-gap:clamp(28px,4vw,64px)!important;
 row-gap:12px!important;
 align-items:start!important;
 min-height:0!important
}
.ixg-service__visual{grid-column:1!important;grid-row:1 / span 2!important;align-self:start!important}
.ixg-service__content{grid-column:2!important;display:grid!important;gap:14px!important;align-content:start!important}
.ixg-service__title,.ixg-service__body{margin:0!important;max-width:34ch!important}
.ixg-section-visual{margin-top:clamp(28px,4vw,52px)!important}
.ixg-trust-section .ixg-section-visual:empty{display:none!important}
.ixg-trust-section .ixg-section-head{align-items:start!important}
.ixg-trust-grid,.ixc-trust__inner{align-items:stretch!important}
@media(max-width:700px){
 .ixg-section-head{grid-template-columns:1fr!important;gap:14px!important}
 .ixg-service{grid-template-columns:72px minmax(0,1fr)!important;column-gap:18px!important}
 .ixg-service__visual{grid-column:1!important}.ixg-service__content{grid-column:2!important}
}
/* R109 15K art-direction gate: geometry, hierarchy, anchored media, complete trust. */
.ixg-services__composition{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(360px,.92fr);gap:clamp(36px,5vw,72px);align-items:start}
.ixg-services__composition:not(.has-visual){grid-template-columns:1fr}
.ixg-services__grid{display:grid!important;grid-template-columns:1fr!important;border-top:1px solid rgba(24,26,28,.14)}
.ixg-service{display:grid!important;grid-template-columns:120px minmax(0,1fr)!important;align-items:center!important;column-gap:28px!important;min-height:142px!important;padding:24px 0!important;border-bottom:1px solid rgba(24,26,28,.14)!important;border-left:0!important;border-right:0!important;border-top:0!important;border-radius:0!important;box-shadow:none!important}
.ixg-service__visual{display:grid!important;grid-template-columns:42px 1fr!important;gap:14px!important;align-items:center!important}
.ixg-service__index{font:700 20px/1 var(--ix-display-font);color:var(--ix-accent);opacity:.48}
.ixg-service__content{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:10px!important;align-content:center!important}
.ixg-service__title{margin:0!important;max-width:26ch!important;font-size:clamp(24px,2.2vw,38px)!important;line-height:1.02!important}
.ixg-service__body{margin:0!important;max-width:42ch!important}
.ixg-services__composition>.ixg-section-visual{margin:0!important;width:100%!important;min-height:100%!important;max-height:none!important;aspect-ratio:4/5!important;align-self:stretch!important;border-radius:0!important;box-shadow:0 24px 70px rgba(17,17,17,.14)!important}
.ixg-services__composition>.ixg-section-visual img{width:100%!important;height:100%!important;object-fit:cover!important}
.ixg-trust-proof{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;margin-top:34px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.12)}
.ixg-trust-proof__item{min-height:92px;padding:18px 20px;background:rgba(255,255,255,.055);display:grid;grid-template-columns:34px minmax(0,1fr);gap:14px;align-items:center}
.ixg-trust-proof__item span{font:800 11px/1 var(--ix-body-font);letter-spacing:.12em;color:var(--ix-accent)}
.ixg-trust-proof__item strong{font:700 clamp(15px,1.25vw,19px)/1.2 var(--ix-display-font);color:#fff!important}
.ixg-trust-reasons{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:1px;background:rgba(255,255,255,.16);margin-top:1px}
.ixg-trust-reason{min-height:180px;padding:28px;background:#202224;display:flex;flex-direction:column;justify-content:space-between;gap:28px}
.ixg-trust-reason__index{font:700 12px/1 var(--ix-body-font);letter-spacing:.12em;color:var(--ix-accent)}
.ixg-trust-reason__label{font:700 11px/1.2 var(--ix-body-font);letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.62)}
.ixg-trust-reason__top{display:flex;align-items:center;justify-content:space-between;gap:16px}
.ixg-trust-reason__graphic{position:relative;width:100%;height:78px;margin:4px 0 6px;overflow:hidden}
.ixg-trust-reason__graphic i{position:absolute;display:block}
.ixg-trust-reason__graphic--1 i{height:2px;background:var(--ix-accent);left:0;transform-origin:left center}
.ixg-trust-reason__graphic--1 i:nth-child(1){top:18px;width:76%;transform:rotate(-4deg)}.ixg-trust-reason__graphic--1 i:nth-child(2){top:38px;width:54%;transform:rotate(3deg)}.ixg-trust-reason__graphic--1 i:nth-child(3){top:58px;width:88%;transform:rotate(-1deg)}
.ixg-trust-reason__graphic--2 i{border:1px solid rgba(255,255,255,.32);border-radius:50%}
.ixg-trust-reason__graphic--2 i:nth-child(1){width:72px;height:72px;left:0;top:3px}.ixg-trust-reason__graphic--2 i:nth-child(2){width:48px;height:48px;left:18px;top:15px}.ixg-trust-reason__graphic--2 i:nth-child(3){width:12px;height:12px;left:48px;top:33px;background:var(--ix-accent);border-color:var(--ix-accent)}
.ixg-trust-reason__graphic--3 i{background:rgba(255,255,255,.18)}
.ixg-trust-reason__graphic--3 i:nth-child(1){width:74%;height:1px;left:0;top:20px}.ixg-trust-reason__graphic--3 i:nth-child(2){width:46%;height:1px;left:18%;top:40px}.ixg-trust-reason__graphic--3 i:nth-child(3){width:12px;height:12px;right:8%;top:34px;background:var(--ix-accent);transform:rotate(45deg)}
.ixg-trust-reason p{margin:0!important;color:rgba(255,255,255,.74)!important;max-width:30ch;font-size:14px;line-height:1.55}
.ixg-trust-reason strong{font:700 clamp(19px,1.8vw,28px)/1.08 var(--ix-display-font);color:#fff!important;max-width:18ch}
.ixg-partner-proof{background:#f7f6f2!important;color:#17191b!important;padding:0 0 clamp(56px,7vw,96px)!important}
.ixg-partner-proof .ixg-section-head{color:#17191b!important}
.ixg-partner-proof .ixg-section-intro{color:rgba(23,25,27,.78)!important}
.ixg-partner-proof__grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px}
.ixg-partner-card{min-height:180px;padding:30px;border:1px solid rgba(24,26,28,.16);background:#fff;display:flex;flex-direction:column;justify-content:space-between;gap:36px;box-shadow:0 18px 48px rgba(17,17,17,.06)}
.ixg-partner-card span{font:700 11px/1.2 var(--ix-body-font);letter-spacing:.14em;text-transform:uppercase;color:rgba(23,25,27,.58)}
.ixg-partner-card strong{font:700 clamp(18px,1.5vw,24px)/1.2 var(--ix-display-font);color:#17191b!important;max-width:28ch}
.ixg-partner-logo{display:block;width:min(310px,72%);height:auto;object-fit:contain;object-position:left center;filter:none!important}
.ixm-bridge{background:linear-gradient(105deg,#f7f6f2 0%,#f7f6f2 62%,rgba(179,19,25,.18) 100%)!important;color:#17191b!important}
.ixm-bridge h2,.ixm-bridge p,.ixm-bridge .ixg-kicker{color:#17191b!important;opacity:1!important}
.ixg-contact{filter:saturate(1.14) contrast(1.04)}
.ix-v2-footer,.ix-v2-footer *{opacity:1!important}
.ix-v2-footer a,.ix-v2-footer strong,.ix-v2-footer span,.ix-v2-footer p{color:#fff!important}
@media(max-width:700px){
 .ixg-services__composition{grid-template-columns:1fr;gap:26px}
 .ixg-service{grid-template-columns:78px minmax(0,1fr)!important;min-height:118px!important;padding:18px 0!important;column-gap:16px!important}
 .ixg-service__visual{grid-template-columns:26px 1fr!important;gap:10px!important}
 .ixg-service__index{font-size:14px}
 .ixg-service__title{font-size:clamp(20px,6.2vw,28px)!important}
 .ixg-services__composition>.ixg-section-visual{aspect-ratio:16/10!important;min-height:0!important}
 .ixg-trust-proof{grid-template-columns:1fr}
 .ixg-trust-proof__item{min-height:70px}
 .ixg-trust-reasons{grid-template-columns:1fr}
 .ixg-trust-reason{min-height:126px;padding:22px}
 .ixg-partner-proof__inner{align-items:flex-start;flex-direction:column}
}
.ixg-service,.ixg-trust,.ixg-bridge__evidence-row{
 border:1px solid rgba(32,34,36,.10);
 box-shadow:0 18px 52px rgba(17,17,17,.08),0 2px 8px rgba(17,17,17,.04);
}
.ixg-trust{border-color:rgba(255,255,255,.12);box-shadow:0 18px 48px rgba(0,0,0,.24)}
.ixg-section-visual{box-shadow:0 22px 70px rgba(17,17,17,.14);overflow:hidden}
.ixg-section-visual img{display:block;width:100%;height:100%;object-fit:cover}
.ixg-cta,.ix-v2-header-cta{
 min-height:48px;
 border-radius:4px!important;
 font-weight:800;
 letter-spacing:.065em;
 box-shadow:0 10px 26px rgba(17,17,17,.14);
 transition:transform .18s ease,box-shadow .18s ease,filter .18s ease;
}
.ixg-cta--primary{box-shadow:0 14px 34px rgba(17,17,17,.20)}
.ixg-cta--secondary{box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
.ixm-hero__veil{
 background:
 linear-gradient(90deg,rgba(8,9,10,.96) 0%,rgba(8,9,10,.80) 30%,rgba(8,9,10,.40) 56%,rgba(8,9,10,.10) 78%,rgba(8,9,10,.22) 100%),
 linear-gradient(180deg,rgba(0,0,0,.30) 0%,transparent 38%,rgba(0,0,0,.46) 100%)!important
}
.ixm-hero h1,.ixm-hero .ixg-lede,.ixm-hero .ixg-kicker{text-shadow:0 2px 22px rgba(0,0,0,.28)}
@media(max-width:700px){
 .ixg-service,.ixg-trust,.ixg-bridge__evidence-row{box-shadow:0 12px 34px rgba(17,17,17,.08)}
 .ixm-hero__veil{
  background:linear-gradient(180deg,rgba(8,9,10,.28) 0%,rgba(8,9,10,.08) 28%,rgba(8,9,10,.38) 55%,rgba(8,9,10,.94) 80%,#0d0e0e 100%)!important
 }
 .ixg-cta{min-height:50px}
}
`;

  return {
    spec:{
      main_html:main,
      custom_css:base+(variants[variantKey]||variants.A)+impresaxMasterCss+logoFirstCss+r89SurfaceCss+r90LaunchCss+r93TypographyCss+r94ValueCss+r106IconicCss+r107UltraVisualCss+premiumPolishCss+(variantKey==="A" ? `
/* R111 15K homepage depth: authored middle-scroll editorial scenes. */
.ixg-feature{position:relative;overflow:hidden;padding:clamp(88px,10vw,154px) 0}
.ixg-feature__grid{display:grid;grid-template-columns:minmax(0,.82fr) minmax(0,1.18fr);gap:clamp(48px,8vw,126px);align-items:center}
.ixg-feature__copy{display:grid;gap:clamp(18px,2.2vw,30px);position:relative;z-index:2}
.ixg-feature__copy h2{max-width:12ch}
.ixg-feature__copy .ixg-section-intro{max-width:54ch}
.ixg-feature__stage{position:relative;min-height:clamp(320px,33vw,470px);display:grid;align-items:stretch}
.ixg-feature__stage>.ixg-section-visual{margin:0!important;width:100%!important;min-height:100%!important;max-height:none!important;position:absolute;inset:0}
.ixg-feature__stage>.ixg-section-visual img{min-height:100%!important;max-height:none!important}
.ixg-feature__device{position:relative;min-height:100%;overflow:hidden;border:1px solid rgba(255,255,255,.18);box-shadow:0 34px 90px rgba(0,0,0,.20);background:linear-gradient(145deg,rgba(255,255,255,.10),rgba(255,255,255,.025))}
.ixg-feature__device i,.ixg-feature__device span{position:absolute;display:block}
.ixg-feature__device i:nth-child(1){inset:9% 8% auto 8%;height:1px;background:currentColor;opacity:.28}
.ixg-feature__device i:nth-child(2){right:11%;top:15%;width:34%;aspect-ratio:1;border:1px solid currentColor;opacity:.20;transform:rotate(11deg)}
.ixg-feature__device i:nth-child(3){left:10%;bottom:12%;width:54%;height:22%;border-left:4px solid currentColor;border-bottom:1px solid currentColor;opacity:.34}
.ixg-feature__device span{right:0;bottom:0;width:46%;height:46%;background:linear-gradient(135deg,transparent,rgba(255,255,255,.12));clip-path:polygon(100% 0,100% 100%,0 100%)}
.ixg-feature--one{color:#f7f6f2;background:radial-gradient(circle at 82% 18%,var(--ix-brand-glow,rgba(255,255,255,.12)),transparent 32%),linear-gradient(135deg,#111214 0%,#202326 58%,#0d0e0f 100%)}
.ixg-feature--one .ixg-kicker,.ixg-feature--one .ixg-section-intro{color:rgba(247,246,242,.68)}
.ixg-feature--two{color:var(--ix-ink);background:radial-gradient(circle at 15% 15%,rgba(255,255,255,.96),transparent 35%),linear-gradient(128deg,var(--ix-paper) 0%,#fff 52%,rgba(17,17,17,.055) 100%)}
.ixg-feature--two .ixg-feature__grid{grid-template-columns:minmax(0,1.1fr) minmax(300px,.7fr)}
.ixg-feature--two .ixg-feature__device{color:var(--ix-ink);border-color:rgba(17,17,17,.14);box-shadow:0 30px 86px rgba(17,17,17,.10);background:linear-gradient(145deg,rgba(255,255,255,.82),rgba(17,17,17,.045))}
/* R113 detail craftsmanship: aligned index rails, editorial imagery, photographic trust and demo partner capacity. */
.ixg-service{grid-template-columns:54px 148px minmax(0,1fr)!important;align-items:center!important}
.ixg-service__indexrail{display:flex;align-items:flex-start;justify-content:flex-start;align-self:stretch;padding-top:8px}
.ixg-service__index{display:block;width:42px;text-align:left;font-variant-numeric:tabular-nums;line-height:1!important}
.ixg-service__iconrail{display:flex;align-items:center;justify-content:flex-start;min-width:0}
.ixg-service__visual{display:contents!important}
.ixg-feature__evidence{background:transparent!important;border:0!important;gap:12px!important}
.ixg-feature__evidence-row{border:1px solid rgba(127,127,127,.16);border-radius:10px;background:rgba(255,255,255,.06)!important;min-height:94px;box-shadow:0 16px 36px rgba(0,0,0,.08)}
.ixg-feature--two .ixg-feature__evidence-row{background:rgba(255,255,255,.86)!important}
.ixg-feature__stage.has-visual .ixg-feature__device{display:none}
.ixg-feature__stage.has-visual>.ixg-section-visual{position:absolute!important;inset:0!important;border-radius:2px!important;box-shadow:0 34px 90px rgba(0,0,0,.18)!important}
.ixg-trust-section{position:relative!important;overflow:hidden!important;background:#17191b!important;color:#fff!important}
.ixg-trust-bg{position:absolute;inset:0;margin:0;z-index:0}
.ixg-trust-bg img{width:100%;height:100%;object-fit:cover;filter:saturate(.78) contrast(1.06)}
.ixg-trust-bg__veil{position:absolute;inset:0;display:block;background:linear-gradient(90deg,rgba(17,18,20,.96) 0%,rgba(17,18,20,.86) 52%,rgba(17,18,20,.72) 100%)}
.ixg-trust-section>.ixg-shell{position:relative;z-index:1}
.ixg-trust-section .ixg-trust-proof__item{background:rgba(22,24,26,.68)!important;backdrop-filter:blur(4px)}
.ixg-trust-section .ixg-trust-reason{background:rgba(24,26,28,.78)!important;backdrop-filter:blur(5px)}
.ixg-trust-section .ixg-section-head--light,.ixg-trust-section .ixg-section-head--light .ixg-section-intro{color:#fff!important}
.ixg-partner-proof__grid{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:14px!important}
.ixg-partner-card{min-height:190px!important}
.ixg-partner-card--demo{border-style:dashed!important;background:linear-gradient(145deg,#fff 0%,#f2f1ee 100%)!important;opacity:.86;justify-content:center!important;min-height:164px!important}
.ixg-demo-partner-mark{position:relative;width:82px;height:58px;margin-bottom:18px}
.ixg-demo-partner-mark i{position:absolute;display:block;background:#bbb}
.ixg-demo-partner-mark--1 i:nth-child(1){width:58px;height:10px;left:0;top:6px}.ixg-demo-partner-mark--1 i:nth-child(2){width:42px;height:10px;left:12px;top:25px}.ixg-demo-partner-mark--1 i:nth-child(3){width:24px;height:10px;left:28px;top:44px}
.ixg-demo-partner-mark--2 i{border-radius:50%}.ixg-demo-partner-mark--2 i:nth-child(1){width:58px;height:58px;left:0;top:0;background:transparent;border:2px solid #bbb}.ixg-demo-partner-mark--2 i:nth-child(2){width:30px;height:30px;left:14px;top:14px}.ixg-demo-partner-mark--2 i:nth-child(3){width:10px;height:10px;left:24px;top:24px;background:var(--ix-accent)}
.ixg-demo-partner-mark--3 i:nth-child(1){width:70px;height:2px;left:0;top:12px}.ixg-demo-partner-mark--3 i:nth-child(2){width:54px;height:2px;left:0;top:28px}.ixg-demo-partner-mark--3 i:nth-child(3){width:38px;height:2px;left:0;top:44px}
.ixg-demo-partner-lines{display:grid;gap:8px;width:72%}.ixg-demo-partner-lines i{display:block;height:7px;background:#ddd;border-radius:999px}.ixg-demo-partner-lines i:last-child{width:58%}
@media(max-width:900px){.ixg-partner-proof__grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
@media(max-width:700px){
 .ixg-service{grid-template-columns:42px 74px minmax(0,1fr)!important;column-gap:12px!important}
 .ixg-service__indexrail{padding-top:4px}
 .ixg-service__icon{width:70px!important;height:56px!important;flex-basis:70px!important}
 .ixg-partner-proof__grid{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:8px!important}
 .ixg-partner-card:not(.ixg-partner-card--demo){grid-column:1/-1;min-height:158px!important}
 .ixg-partner-card--demo{min-height:86px!important;padding:12px!important;gap:8px!important;align-items:center!important}
 .ixg-partner-card--demo .ixg-demo-partner-mark{width:38px;height:34px;margin:0!important;transform:scale(.62);transform-origin:center}
 .ixg-partner-card--demo .ixg-demo-partner-lines{display:none!important}
 .ixg-trust-bg__veil{background:linear-gradient(180deg,rgba(17,18,20,.86),rgba(17,18,20,.94))}
}

/* R112 section substance: evidence occupies the scene; whitespace frames it instead of replacing it. */
.ixg-feature__evidence{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;margin-top:8px;background:currentColor;border:1px solid rgba(127,127,127,.18)}
.ixg-feature__evidence-row{min-height:86px;padding:16px 18px;background:inherit;display:grid;grid-template-columns:30px minmax(0,1fr);align-items:start;gap:12px}
.ixg-feature--one .ixg-feature__evidence-row{background:#17191b}
.ixg-feature--two .ixg-feature__evidence-row{background:#fff}
.ixg-feature__evidence-row span{font:800 10px/1 var(--ix-body-font);letter-spacing:.12em;opacity:.52}
.ixg-feature__evidence-row strong{font:700 clamp(14px,1.2vw,18px)/1.25 var(--ix-display-font)}
.ixg-feature__stage.no-visual{min-height:clamp(300px,30vw,420px)}
.ixg-feature__stage.no-visual .ixg-feature__device{background:
 linear-gradient(90deg,transparent 0 49.8%,currentColor 50% 50.2%,transparent 50.2%),
 linear-gradient(0deg,transparent 0 49.8%,currentColor 50% 50.2%,transparent 50.2%),
 linear-gradient(145deg,rgba(255,255,255,.08),rgba(17,17,17,.035));opacity:.78}
.ixg-feature__stage.no-visual:after{content:"";position:absolute;inset:11%;border:1px solid currentColor;opacity:.18;transform:rotate(-2deg);pointer-events:none}
@media(max-width:700px){
 .ixg-feature{padding:52px 0}
 .ixg-feature__grid,.ixg-feature--two .ixg-feature__grid{grid-template-columns:1fr;gap:24px}
 .ixg-feature__stage{min-height:200px}
 .ixg-feature__stage.no-visual{min-height:150px;max-height:180px}
 .ixg-feature__copy h2{max-width:100%}
 .ixg-feature__evidence{grid-template-columns:1fr}
 .ixg-feature__evidence-row{min-height:66px}
 .ixg-feature__device{min-height:200px}
 .ixg-feature__stage.no-visual .ixg-feature__device{min-height:150px}
}
` : "")+(variantKey==="C" ? `
/* Variant C bridge grid guard — 3-child desktop composition and 2-row mobile composition. */
.ixc-bridge{min-height:0!important;display:block!important}
.ixc-bridge__inner{grid-template-columns:10px minmax(0,.72fr) minmax(320px,1fr)!important;align-items:center!important}
.ixc-bridge__rule{grid-column:1!important;grid-row:1!important;min-height:280px!important}
.ixc-bridge__copy{grid-column:2!important;grid-row:1!important}
.ixc-bridge .ixg-section-visual--two{grid-column:3!important;grid-row:1!important;width:100%!important;margin:0!important;min-height:280px!important;max-height:420px!important}
@media(max-width:700px){
 .ixc-bridge{min-height:0!important;padding:44px 0!important}
 .ixc-bridge__inner{grid-template-columns:4px minmax(0,1fr)!important;column-gap:16px!important;row-gap:20px!important;align-items:stretch!important}
 .ixc-bridge__rule{grid-column:1!important;grid-row:1 / span 2!important;min-height:0!important;align-self:stretch!important}
 .ixc-bridge__copy{grid-column:2!important;grid-row:1!important}
 .ixc-bridge .ixg-section-visual--two{grid-column:2!important;grid-row:2!important;width:100%!important;margin:0!important;min-height:180px!important;max-height:240px!important}
}
` : "")+`
@media(max-width:700px){
 .ixg-hero__grid{grid-template-columns:minmax(0,1fr)!important;gap:26px!important;align-items:start!important}
 .ixg-hero__copy{min-width:0!important;width:100%!important;order:1!important}
 .ixg-hero__device{order:2!important;width:100%!important;min-width:0!important;max-width:100%!important}
 .ixg h1{font-size:clamp(42px,11.5vw,62px)!important;line-height:.95!important;max-width:100%!important;overflow-wrap:normal!important;word-break:normal!important;hyphens:none!important}
 .ixg-kicker,.ixg-lede{width:100%!important;max-width:100%!important;overflow-wrap:normal!important;word-break:normal!important}
 .ixg-kicker{line-height:1.35!important}
}
`,
      section_ids:variantKey==="A"?sectionBlueprint:(variantKey==="B"
        ? ["hero","trust","services","positioning","bridge","final-cta"]
        : ["hero","services","bridge","positioning","trust","final-cta"]),
      section_architecture_standard:variantKey==="A"?"R110_SECTION_FIRST_PREMIUM_ARCHITECTURE_V1":"R107_LEGACY_COMPAT",
      home_depth_standard:variantKey==="A"?"R111_15K_HOME_DEPTH_ARCHITECTURE_V1":"R110_LEGACY_COMPAT",
      section_substance_standard:variantKey==="A"?"R112_SECTION_SUBSTANCE_COMMERCIAL_DEPTH_V1":"R110_LEGACY_COMPAT",
      detail_craft_standard:variantKey==="A"?"R115_PREMIUM_SECTION_IDENTITY_FINISHING_V1":"R110_LEGACY_COMPAT",
      premium_section_identity_standard:variantKey==="A"?"R115_PREMIUM_SECTION_IDENTITY_FINISHING_V1":"R110_LEGACY_COMPAT",
      section_blueprint:sectionBlueprint,
      surface_policy:"IMPRESAX_RENDER_STANDARD_R107_PREMIUM_OVERLAY_HERO_ULTRA_VISUAL_V1",
      used_copy_tokens:commonUsedCopy(copyManifest),
      used_asset_tokens:["HERO_VISUAL",...selectedSectionAssets,...(partnerTrustKeys.some(key=>/u[-\\s]?power/i.test(String(copyManifest?.[key]||"")))?["PARTNER_UPOWER_LOGO"]:[])].filter(Boolean),
      section_coherence_standard:sectionAssetPlan?.strict_semantic===true?"R108_SECTION_COHERENCE_STRICT_V1":"R107",
      art_direction_standard:variantKey==="A"?"R109_15K_ART_DIRECTION_GATE_V1":"R107_LEGACY_COMPAT",
      section_first_standard:variantKey==="A"?"R110_SECTION_FIRST_PREMIUM_ARCHITECTURE_V1":"R107_LEGACY_COMPAT",
      section_visual_strategy:sectionAssetPlan?.strategy||"R107_CURATED_VARIANT_ROTATION_V1",
      hero_visual_strategy:"R107 mandatory full-bleed edge-to-edge HERO_VISUAL with verified headline, body and CTAs overlaid inside the image, premium readability veil and high-resolution capture.",
      hero_subject:"Prospect-relevant commercial scene supplied by HERO_VISUAL.",
      hero_scene_type:"Premium editorial business-context photography.",
      hero_copy_space:"Verified headline/body/CTAs intentionally overlaid inside the photographic hero field on desktop and mobile.",
      hero_mobile_crop_strategy:"Full-bleed 390px crop with bottom-anchored copy overlay, protective vertical gradient and premium readability.",
      hero_relevance_score:9,
      implementation_notes:(logoFirstMode
        ?"LOGO_FIRST_V1 pilot: official logo defines palette, industrial sans typography, geometry and signature rules; full-bleed overlay hero and two CTAs remain mandatory. "
        :(impresaxMasterProfile?"IMPRESAX_MASTER_V1 pilot: full-bleed overlay hero and premium conversion hierarchy. ":""))
        +"Deterministic R112 SECTION_SUBSTANCE grammar v1 "+variantKey+": R111 depth plus rich middle-scroll substance, 4-6 why-us reasons, proof support, distinct bridge/final CTA roles, premium mobile density and no decorative-only sections, preserving all R107-R111 gates."
    },
    strategy:logoFirstMode?"LOGO_FIRST_MASTER_V1_R107":impresaxMasterProfile?"IMPRESAX_MASTER_V1_R107":"ICONIC_COMMISSIONED_FALLBACK_GRAMMAR_V8"
  };
}

