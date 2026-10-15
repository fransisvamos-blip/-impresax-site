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
    /^(HERO_HEADLINE|HERO_BODY|LOCALITY_LINE|PRIMARY_CTA_LABEL|SECONDARY_CTA_LABEL|FOOTER_LINE|SERVICE_\d+_(?:TITLE|BODY)|TRUST_\d+)$/.test(k)
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
  const shared={
    asset_tokens:["HERO_VISUAL"],
    execution_constraints:{
      static_preview:true,no_scripts:true,no_forms:true,immutable_identity:true,
      no_empty_placeholder_geometry:true,mobile_overlay_forbidden:true
    }
  };
  const variants={
    A:{
      name:"Structural Field",
      core_idea:"Light industrial composition built from verified copy, structural rules and immutable identity.",
      hero_logic:"Premium image-led split hero using HERO_VISUAL as the dominant photographic anchor, with verified headline/CTA in a clean copy field; official identity remains compiler-owned.",
      grid:"Asymmetric structural grid with services in measured modules.",
      typography_behavior:"Bold system sans with dense industrial hierarchy.",
      material_language:"Warm light field, black structure"+(accent?", verified accent "+accent:"")+".",
      signature_device:"Connected structural rule field, never an empty box.",
      section_progression:["hero","positioning","services","trust","bridge","contact"],
      cta_behavior:"Anchored solid/outline CTA pair integrated into the hero and close.",
      mobile_reinterpretation:"Single-column structural stack preserving hierarchy and rule rhythm.",
      fingerprint:{hero_type:"premium image split hero",grid_topology:"asymmetric structural grid",typography_mode:"bold industrial sans",material_system:"light industrial field",signature_device:"connected rule field",section_rhythm:"measured modular",cta_pattern:"anchored pair",mobile_pattern:"structured stacked"}
    },
    B:{
      name:"Trust First Poster",
      core_idea:"Trust-first commercial poster with a materially different information architecture.",
      hero_logic:"Cinematic architecture-first hero using HERO_VISUAL as the dominant full-bleed photographic field with restrained dark copy treatment, followed immediately by verified trust proof.",
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
      hero_logic:"Editorial image-and-copy hero using HERO_VISUAL with a deliberate asymmetric crop, headline rail system and restrained commercial close.",
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
    mobile_overlay_forbidden:true
  };
  return d;
}

export function buildZeroPhotoPremiumSpec({variantKey,copyManifest,hasIdentity=true,inputPayload=null}) {
  const accent=verifiedAccent(inputPayload)||(variantKey==="B"?"#e6e1d7":"#8d8981");
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
  const splitLastService=serviceTitles.length>2;
  const aGridTitles=splitLastService?serviceTitles.slice(0,-1):serviceTitles;
  const servicesA=aGridTitles.map((titleKey,i)=>{
    const bodyKey="SERVICE_"+(i+1)+"_BODY";
    const body=Object.prototype.hasOwnProperty.call(copyManifest,bodyKey)
      ? "<p class=\"ixg-service__body\">"+copyToken(bodyKey)+"</p>"
      : "";
    return "<article class=\"ixg-service\"><h3 class=\"ixg-service__title\">"+copyToken(titleKey)+"</h3>"+body+"</article>";
  }).join("");
  const bridgeTitle=splitLastService
    ? serviceTitles[serviceTitles.length-1]
    : (trustKeys[0]||"LOCALITY_LINE");
  const bridgeBody=splitLastService && Object.prototype.hasOwnProperty.call(copyManifest,"SERVICE_"+serviceTitles.length+"_BODY")
    ? "SERVICE_"+serviceTitles.length+"_BODY"
    : null;
  const positionBodyMarkup=positionBody?"<p>"+copyToken(positionBody)+"</p>":"";
  const bridgeBodyMarkup=bridgeBody?"<p>"+copyToken(bridgeBody)+"</p>":"";
  const vclass="ixg-"+variantKey.toLowerCase();

  const primary="<a class=\"ixg-cta ixg-cta--primary\" href=\""+ctaToken("PRIMARY")+"\">"+copyToken("PRIMARY_CTA_LABEL")+"</a>";
  const secondary="<a class=\"ixg-cta ixg-cta--secondary\" href=\""+ctaToken("SECONDARY")+"\">"+copyToken("SECONDARY_CTA_LABEL")+"</a>";

  const mainAB=[
    "<section id=\"hero\" class=\"ixg ixg-hero "+vclass+"\"><div class=\"ixg-shell\"><div class=\"ixg-hero__grid\"><div class=\"ixg-hero__copy\"><p class=\"ixg-kicker\">"+copyToken("LOCALITY_LINE")+"</p><h1>"+copyToken("HERO_HEADLINE")+"</h1><p class=\"ixg-lede\">"+copyToken("HERO_BODY")+"</p><div class=\"ixg-actions\">"+primary+secondary+"</div></div><figure class=\"ixg-hero__media\"><img class=\"ixg-hero__image\" src=\"{{asset:HERO_VISUAL}}\" alt=\"\"></figure></div></div></section>",
    "<section id=\"positioning\" class=\"ixg ixg-positioning "+vclass+"\"><div class=\"ixg-shell ixg-split\"><div class=\"ixg-positioning__statement\"><h2>"+copyToken(positionTitle)+"</h2></div><div class=\"ixg-positioning__body\">"+positionBodyMarkup+"<p class=\"ixg-locality\">"+copyToken("LOCALITY_LINE")+"</p></div></div></section>",
    "<section id=\"services\" class=\"ixg ixg-services "+vclass+"\"><div class=\"ixg-shell\"><header class=\"ixg-section-head\"><p class=\"ixg-kicker\">"+copyToken("SERVICES_TITLE")+"</p><p class=\"ixg-section-intro\">"+copyToken("SERVICES_INTRO")+"</p></header><div class=\"ixg-services__grid\">"+servicesA+"</div></div></section>",
    "<section id=\"trust\" class=\"ixg ixg-trust-section "+vclass+"\"><div class=\"ixg-shell\"><header class=\"ixg-section-head ixg-section-head--light\"><p class=\"ixg-kicker\">"+copyToken("TRUST_TITLE")+"</p><p class=\"ixg-section-intro\">"+copyToken("TRUST_INTRO")+"</p></header><div class=\"ixg-trust-grid\">"+trust+"</div></div></section>",
    "<section id=\"bridge\" class=\"ixg ixg-bridge "+vclass+"\"><div class=\"ixg-shell ixg-bridge__grid\"><div class=\"ixg-bridge__copy\"><h2>"+copyToken(bridgeTitle)+"</h2>"+bridgeBodyMarkup+"</div><div class=\"ixg-bridge__device\" aria-hidden=\"true\"><i></i><i></i><i></i></div></div></section>",
    "<section id=\"final-cta\" class=\"ixg ixg-contact "+vclass+"\"><div class=\"ixg-shell ixg-contact__inner\"><div><p class=\"ixg-kicker\">"+copyToken("LOCALITY_LINE")+"</p><h2>"+copyToken("CLOSING_TITLE")+"</h2><p class=\"ixg-section-intro\">"+copyToken("CLOSING_BODY")+"</p></div><div class=\"ixg-actions\">"+primary+secondary+"</div></div></section>"
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
    return "<article class=\"ixb-service-row\"><h3>"+copyToken(titleKey)+"</h3><div class=\"ixb-service-body\">"+body+"</div></article>";
  }).join("");
  const bPositionTitle="POSITIONING_TITLE";
  const mainB=[
    "<section id=\"hero\" class=\"ixg ixb-hero ixg-b\"><figure class=\"ixb-hero__media\"><img class=\"ixg-hero__image\" src=\"{{asset:HERO_VISUAL}}\" alt=\"\"></figure><div class=\"ixg-shell ixb-hero__inner\"><div class=\"ixb-hero__meta\"><p class=\"ixg-kicker\">"+copyToken("LOCALITY_LINE")+"</p></div><h1>"+copyToken("HERO_HEADLINE")+"</h1><p class=\"ixg-lede\">"+copyToken("HERO_BODY")+"</p><div class=\"ixg-actions\">"+primary+secondary+"</div></div></section>",
    "<section id=\"trust\" class=\"ixg ixb-trust ixg-b\"><div class=\"ixg-shell\"><header class=\"ixg-section-head\"><p class=\"ixg-kicker\">"+copyToken("TRUST_TITLE")+"</p><p class=\"ixg-section-intro\">"+copyToken("TRUST_INTRO")+"</p></header><div class=\"ixb-trust-grid\">"+bTrustRows+"</div></div></section>",
    "<section id=\"services\" class=\"ixg ixb-services ixg-b\"><div class=\"ixg-shell\"><header class=\"ixg-section-head\"><p class=\"ixg-kicker\">"+copyToken("SERVICES_TITLE")+"</p><p class=\"ixg-section-intro\">"+copyToken("SERVICES_INTRO")+"</p></header>"+bServiceRows+"</div></section>",
    "<section id=\"positioning\" class=\"ixg ixb-positioning ixg-b\"><div class=\"ixg-shell ixb-positioning__inner\"><p class=\"ixg-kicker\">"+copyToken("LOCALITY_LINE")+"</p><h2>"+copyToken(bPositionTitle)+"</h2><p class=\"ixg-section-intro\">"+copyToken("POSITIONING_BODY")+"</p></div></section>",
    "<section id=\"bridge\" class=\"ixg ixb-bridge ixg-b\"><div class=\"ixg-shell ixb-bridge__inner\"><h2>"+copyToken("SECONDARY_CTA_LABEL")+"</h2><div class=\"ixg-actions\">"+secondary+"</div></div></section>",
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
  const cBridgeBody=null;

  const mainC=[
    "<section id=\"hero\" class=\"ixg ixc-hero ixg-c\"><figure class=\"ixc-hero__media\"><img class=\"ixg-hero__image\" src=\"{{asset:HERO_VISUAL}}\" alt=\"\"></figure><div class=\"ixg-shell ixc-hero__inner\"><p class=\"ixg-kicker\">"+copyToken("LOCALITY_LINE")+"</p><h1>"+copyToken("HERO_HEADLINE")+"</h1><div class=\"ixc-hero__lower\"><p class=\"ixg-lede\">"+copyToken("HERO_BODY")+"</p><div class=\"ixg-actions\">"+primary+secondary+"</div></div><div class=\"ixc-rail\" aria-hidden=\"true\"></div></div></section>",
    "<section id=\"positioning\" class=\"ixg ixc-positioning ixg-c\"><div class=\"ixg-shell ixc-positioning__grid\"><p class=\"ixg-kicker\">"+copyToken("LOCALITY_LINE")+"</p><h2>"+copyToken(cPositionToken)+"</h2><p class=\"ixg-section-intro\">"+copyToken("POSITIONING_BODY")+"</p></div></section>",
    "<section id=\"services\" class=\"ixg ixc-services ixg-c\"><div class=\"ixg-shell\"><header class=\"ixg-section-head\"><p class=\"ixg-kicker\">"+copyToken("SERVICES_TITLE")+"</p><p class=\"ixg-section-intro\">"+copyToken("SERVICES_INTRO")+"</p></header>"+cServiceRows+"</div></section>",
    "<section id=\"trust\" class=\"ixg ixc-trust ixg-c\"><div class=\"ixg-shell\"><header class=\"ixg-section-head\"><p class=\"ixg-kicker\">"+copyToken("TRUST_TITLE")+"</p><p class=\"ixg-section-intro\">"+copyToken("TRUST_INTRO")+"</p></header><div class=\"ixc-trust__inner\">"+cTrustRows+"</div></div></section>",
    "<section id=\"bridge\" class=\"ixg ixc-bridge ixg-c\"><div class=\"ixg-shell ixc-bridge__inner\"><div class=\"ixc-bridge__rule\" aria-hidden=\"true\"></div><div class=\"ixc-bridge__copy\"><h2>"+copyToken(cBridgeTitle)+"</h2></div></div></section>",
    "<section id=\"final-cta\" class=\"ixg ixc-contact ixg-c\"><div class=\"ixg-shell ixc-contact__inner\"><div><p class=\"ixg-kicker\">"+copyToken("LOCALITY_LINE")+"</p><h2>"+copyToken("CLOSING_TITLE")+"</h2><p class=\"ixg-section-intro\">"+copyToken("CLOSING_BODY")+"</p></div><div class=\"ixg-actions\">"+primary+secondary+"</div></div></section>"
  ].join("");

  const main=variantKey==="C" ? mainC : variantKey==="B" ? mainB : mainAB;

  const base=`
:root{--ix-ink:#111;--ix-paper:#f4f1ea;--ix-muted:#6b6964;--ix-line:rgba(17,17,17,.18);--ix-dark:#111;--ix-light:#fff;--ix-accent:${accent};--ix-space:clamp(24px,4.2vw,72px)}

.ix-v2-header{background:#fff;color:#111;border-bottom-color:rgba(17,17,17,.12)}.ix-v2-header-inner{min-height:94px}.ix-v2-nav a{position:relative}.ix-v2-nav a:after{display:block;height:1px;background:currentColor;transform:scaleX(0);transform-origin:left;transition:transform .2s ease}.ix-v2-header-cta{background:#111;color:#fff;border-color:#111}.ix-v2-footer{background:#111;color:#f7f6f2}.ix-v2-footer-nav a{color:rgba(247,246,242,.75)}
.ixg{position:relative;overflow:hidden;font-family:Arial,Helvetica,sans-serif}.ixg-shell{width:min(1320px,calc(100% - 2*var(--ix-space)));margin:0 auto}
.ixg h1,.ixg h2,.ixg h3,.ixg p{margin:0}.ixg h1{font-size:clamp(58px,8.4vw,138px);line-height:.86;letter-spacing:-.065em;max-width:10ch}
.ixg h2{font-size:clamp(36px,5.4vw,82px);line-height:.94;letter-spacing:-.045em}.ixg h3{font-size:clamp(24px,2.4vw,38px);line-height:1.02;letter-spacing:-.025em}
.ixg p{font-size:clamp(16px,1.3vw,20px);line-height:1.55}.ixg-kicker{font-size:12px!important;letter-spacing:.16em;text-transform:uppercase;font-weight:700}
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
.ixg-service__body{color:var(--ix-muted);max-width:48ch}.ixg-trust-section{padding:clamp(64px,7vw,105px) 0;background:var(--ix-dark);color:#fff}
.ixg-trust-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));border-top:1px solid rgba(255,255,255,.22);border-left:1px solid rgba(255,255,255,.22)}
.ixg-trust{min-height:140px;padding:28px;border-right:1px solid rgba(255,255,255,.22);border-bottom:1px solid rgba(255,255,255,.22);display:flex;align-items:flex-end}
.ixg-trust strong{font-size:clamp(22px,2.1vw,34px);line-height:1.08;letter-spacing:-.025em}.ixg-trust--contact span{font-size:14px;line-height:1.45;overflow-wrap:anywhere;word-break:break-word}
.ixg-bridge{padding:clamp(76px,9vw,130px) 0;background:var(--ix-paper);color:var(--ix-ink)}
.ixg-bridge__grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(260px,.75fr);gap:clamp(42px,7vw,100px);align-items:center}.ixg-bridge__copy{display:grid;gap:26px}
.ixg-bridge__device{position:relative;height:280px}.ixg-bridge__device i{position:absolute;display:block;background:var(--ix-ink)}
.ixg-bridge__device i:nth-child(1){left:0;top:18%;width:100%;height:12px}.ixg-bridge__device i:nth-child(2){right:20%;top:0;width:12px;height:100%}.ixg-bridge__device i:nth-child(3){left:14%;bottom:20%;width:62%;height:7px;background:rgba(17,17,17,.34)}
.ixg-contact{padding:clamp(68px,7vw,105px) 0;background:#fff;color:var(--ix-ink);border-top:1px solid var(--ix-line)}.ixg-contact__inner{display:grid;grid-template-columns:1fr auto;gap:40px;align-items:end}
@media(max-width:700px){
 .ixg-shell{width:min(calc(100% - 40px),1320px)}.ixg-section-head{grid-template-columns:1fr;gap:12px;padding:42px 0 24px}.ixg h1{font-size:clamp(42px,11.5vw,62px);max-width:none;overflow-wrap:normal;word-break:normal;hyphens:none}.ixg h2{font-size:clamp(32px,9vw,48px)}
 .ixg-hero{padding:58px 0 70px}.ixg-hero__grid,.ixg-split,.ixg-bridge__grid,.ixg-contact__inner{grid-template-columns:1fr}.ixg-hero__device{height:190px;order:2}
 .ixg-hero__copy{order:1}.ixg-actions{display:grid;grid-template-columns:1fr;margin-top:26px}.ixg-cta{width:100%;min-height:50px}
 .ixg-positioning{padding:58px 0}.ixg-split{gap:26px}.ixg-services__grid{grid-template-columns:1fr}.ixg-service{min-height:0;padding:32px 24px;gap:18px}
 .ixg-trust-section{padding:52px 0}.ixg-trust-grid{grid-template-columns:1fr}.ixg-trust{min-height:0;padding:22px}.ixg-bridge{padding:62px 0}.ixg-bridge__grid{gap:32px}.ixg-bridge__device{height:170px}
 .ixg-contact{padding:54px 0}.ixg-contact__inner{align-items:start}.ixg-contact .ixg-actions{margin-top:0}
}
`;

  const variants={
    A:`
.ixg-a .ixg-hero__device span:nth-child(1){height:16px}.ixg-a .ixg-hero__device span:nth-child(2){width:16px}
.ixg-a .ixg-hero__device span:nth-child(3){left:8%;width:76%;height:10px;background:var(--ix-accent)}.ixg-a .ixg-hero__device span:nth-child(4){left:54%;height:76%;width:10px}
.ixg-a.ixg-positioning{background:#f7f5ef}.ixg-a .ixg-positioning__statement h2{max-width:12ch}.ixg-a .ixg-service:nth-child(2n){background:#f4f1ea}.ixg-a .ixg-service:last-child:nth-child(odd){grid-column:1/-1}
.ixg-a .ixg-bridge__device i:nth-child(1){height:14px}.ixg-a .ixg-bridge__device i:nth-child(2){width:14px}
`,
    B:`
.ixg-b{--ix-paper:#111;--ix-ink:#f4f1ea;--ix-muted:#aaa59b;--ix-line:rgba(244,241,234,.22)}
.ixb-hero{background:#111;color:#f4f1ea;padding:clamp(84px,10vw,155px) 0 clamp(70px,8vw,120px)}
.ixb-hero__media{margin:0;height:clamp(420px,56vw,760px);overflow:hidden}.ixb-hero__media .ixg-hero__image{width:100%;height:100%;object-fit:cover;object-position:center}
.ixb-hero__inner{display:grid;grid-template-columns:minmax(0,1fr);gap:28px}.ixb-hero__meta{display:flex;align-items:flex-start;justify-content:space-between;gap:30px;border-bottom:1px solid rgba(244,241,234,.28);padding-bottom:24px}
.ixb-hero h1{font-family:Georgia,'Times New Roman',serif;font-weight:500;font-size:clamp(74px,11.5vw,182px);line-height:.79;letter-spacing:-.07em;max-width:8.6ch;margin-top:10px}
.ixb-hero .ixg-lede{color:#c9c4ba;max-width:58ch;font-size:clamp(18px,1.6vw,24px)}.ixb-hero .ixg-actions{margin-top:0}.ixb-hero .ixg-cta--primary{background:#f4f1ea;color:#111;border-color:#f4f1ea}.ixb-hero .ixg-cta--secondary{color:#f4f1ea;border-color:#f4f1ea}
.ixb-trust{background:var(--ix-accent);color:#111;padding:0}.ixb-trust-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));border-left:1px solid #111;border-top:1px solid #111}
.ixb-trust-item{min-height:210px;padding:30px;border-right:1px solid #111;border-bottom:1px solid #111;display:flex;align-items:flex-end}.ixb-trust-item strong{font-family:Arial,Helvetica,sans-serif;font-size:clamp(26px,3vw,46px);line-height:1;letter-spacing:-.04em}.ixb-trust-item--contact{min-height:120px;align-items:center}.ixb-trust-item--contact span{font-size:14px;line-height:1.45;font-weight:600;overflow-wrap:anywhere;word-break:break-word;max-width:34ch}
.ixb-services{background:#f4f1ea;color:#111;padding:clamp(72px,8vw,120px) 0}.ixb-service-row{display:grid;grid-template-columns:minmax(250px,.8fr) minmax(0,1.2fr);gap:clamp(34px,7vw,110px);padding:clamp(42px,5vw,70px) 0;border-top:1px solid rgba(17,17,17,.28);align-items:start}.ixb-service-row:last-child{border-bottom:1px solid rgba(17,17,17,.28)}
.ixb-service-row h3{font-family:Arial,Helvetica,sans-serif;font-size:clamp(38px,5.2vw,76px);line-height:.92;letter-spacing:-.055em;text-transform:uppercase}.ixb-service-body p{color:#3f3c36;font-size:clamp(18px,1.5vw,23px);max-width:50ch}
.ixb-positioning{background:#111;color:#f4f1ea;padding:clamp(76px,9vw,140px) 0}.ixb-positioning__inner{display:grid;grid-template-columns:180px minmax(0,1fr);gap:clamp(36px,7vw,110px);align-items:start}.ixb-positioning h2{font-family:Georgia,'Times New Roman',serif;font-weight:500;font-size:clamp(50px,7.2vw,108px);line-height:.9;letter-spacing:-.055em;max-width:12ch}
.ixb-bridge{background:#f4f1ea;color:#111;padding:clamp(64px,7vw,105px) 0;border-bottom:1px solid rgba(17,17,17,.25)}.ixb-bridge__inner{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:40px;align-items:end}.ixb-bridge h2{font-family:Arial,Helvetica,sans-serif;font-size:clamp(38px,5vw,72px);line-height:.94;letter-spacing:-.045em}
.ixb-contact{background:var(--ix-accent);color:#111;padding:28px 0}.ixb-contact__inner{display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap}.ixb-contact .ixg-kicker{max-width:44ch}.ixb-contact .ixg-actions{margin-top:0}.ixb-contact .ixg-cta--primary{background:#111;color:#fff;border-color:#111}
@media(max-width:700px){
 .ixb-hero{padding:62px 0 64px}.ixb-hero__meta{display:grid;gap:18px}.ixb-hero h1{font-size:clamp(54px,15vw,76px);line-height:.84;max-width:none}.ixb-hero .ixg-actions{display:flex;flex-wrap:wrap}
 .ixb-trust-grid{grid-template-columns:1fr}.ixb-trust-item{min-height:0;padding:26px 22px}.ixb-trust-item--contact{padding:20px 22px}.ixb-trust-item strong{font-size:clamp(24px,8vw,34px)}
 .ixb-services{padding:54px 0}.ixb-service-row{grid-template-columns:1fr;gap:18px;padding:34px 0}.ixb-service-row h3{font-size:clamp(36px,11vw,54px)}
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
.ixc-bridge{background:#fff;color:#111;padding:clamp(80px,10vw,150px) 0}.ixc-bridge__inner{display:grid;grid-template-columns:12px minmax(0,1fr);gap:clamp(34px,6vw,84px);align-items:stretch}.ixc-bridge__rule{background:var(--ix-accent);min-height:260px}.ixc-bridge__copy{display:grid;gap:30px;max-width:950px}.ixc-bridge__copy h2{font-family:Georgia,'Times New Roman',serif;font-weight:500;font-size:clamp(52px,7.4vw,108px);line-height:.9;letter-spacing:-.055em}.ixc-bridge__copy p{max-width:52ch;color:#4e4a44}
.ixc-contact{background:#f7f6f2;color:#111;padding:28px 0;border-top:1px solid rgba(17,17,17,.2)}.ixc-contact__inner{display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap}
.ixc-hero .ixg-cta,.ixc-contact .ixg-cta{background:transparent!important;color:inherit!important;border:0!important;border-bottom:1px solid currentColor!important;padding:0 0 7px!important;min-height:0!important;border-radius:0!important;width:auto!important;justify-content:flex-start!important}
.ixc-hero .ixg-actions,.ixc-contact .ixg-actions{gap:18px 28px}
@media(max-width:700px){
 .ixc-hero{padding:64px 0 42px}.ixc-hero h1{font-size:clamp(54px,15vw,76px);line-height:.86;max-width:none;margin-top:26px}.ixc-hero__lower{grid-template-columns:1fr;gap:26px;margin-top:42px}.ixc-hero__lower .ixg-actions{display:grid}
 .ixc-rail{height:1px;margin-top:34px}.ixc-positioning{padding:58px 0}.ixc-positioning__grid{grid-template-columns:1fr;gap:22px}.ixc-positioning h2{font-size:clamp(34px,10vw,50px)}
 .ixc-ledger-row{grid-template-columns:1fr;gap:18px;padding:38px 0}.ixc-ledger-row h3{font-size:clamp(34px,10vw,50px)}.ixc-ledger-value p{font-size:17px}
 .ixc-trust{padding:44px 0}.ixc-trust-row{display:block;padding:20px 0}.ixc-trust-row strong{font-size:clamp(24px,7.2vw,34px);line-height:1.08;max-width:none;overflow-wrap:normal;word-break:normal}
 .ixc-bridge{padding:64px 0}.ixc-bridge__inner{grid-template-columns:7px 1fr;gap:24px}.ixc-bridge__rule{min-height:220px}.ixc-bridge__copy h2{font-size:clamp(46px,13vw,66px)}
 .ixc-contact{padding:24px 0}.ixc-contact__inner{display:flex;align-items:flex-start;flex-direction:column;gap:14px}.ixc-contact .ixg-actions{margin-top:0}
}
`
  };

  return {
    spec:{
      main_html:main,
      custom_css:base+(variants[variantKey]||variants.A)+`
@media(max-width:700px){
 .ixg-hero__grid{grid-template-columns:minmax(0,1fr)!important;gap:26px!important;align-items:start!important}
 .ixg-hero__copy{min-width:0!important;width:100%!important;order:1!important}
 .ixg-hero__device{order:2!important;width:100%!important;min-width:0!important;max-width:100%!important}
 .ixg h1{font-size:clamp(42px,11.5vw,62px)!important;line-height:.95!important;max-width:100%!important;overflow-wrap:normal!important;word-break:normal!important;hyphens:none!important}
 .ixg-kicker,.ixg-lede{width:100%!important;max-width:100%!important;overflow-wrap:normal!important;word-break:normal!important}
 .ixg-kicker{line-height:1.35!important}
}
`,
      section_ids:["hero","positioning","services","trust","bridge","contact"],
      used_copy_tokens:commonUsedCopy(copyManifest),
      used_asset_tokens:["HERO_VISUAL"],
      hero_visual_strategy:"Mandatory premium image-led hero with verified copy field and responsive crop.",
      hero_subject:"Prospect-relevant commercial scene supplied by HERO_VISUAL.",
      hero_scene_type:"Premium editorial business-context photography.",
      hero_copy_space:"Dedicated HTML copy field kept separate from the image.",
      hero_mobile_crop_strategy:"Object-fit cover with subject-preserving 390px crop.",
      hero_relevance_score:9,
      implementation_notes:"Deterministic HERO_PREMIUM fallback grammar v3 "+variantKey+": mandatory HERO_VISUAL, verified copy distribution, responsive 1440/390."
    },
    strategy:"HERO_PREMIUM_FALLBACK_GRAMMAR_V3"
  };
}
