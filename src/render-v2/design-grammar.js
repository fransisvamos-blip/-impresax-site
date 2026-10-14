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

function trustMarkup(copyManifest,klass) {
  const keys=availableIndexed(copyManifest,"TRUST_");
  return keys.map(key=>"<div class=\""+klass+"\"><strong>"+copyToken(key)+"</strong></div>").join("");
}

function commonUsedCopy(copyManifest) {
  return Object.keys(copyManifest||{}).filter(k=>
    /^(HERO_HEADLINE|HERO_BODY|LOCALITY_LINE|PRIMARY_CTA_LABEL|SECONDARY_CTA_LABEL|FOOTER_LINE|SERVICE_\d+_(?:TITLE|BODY)|TRUST_\d+)$/.test(k)
  );
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

export function buildZeroPhotoPremiumSpec({variantKey,copyManifest,hasIdentity=true}) {
  const services=serviceMarkup(copyManifest,"ixg-service");
  const trust=trustMarkup(copyManifest,"ixg-trust");
  const identity=hasIdentity && variantKey==="A" ? "<div class=\"ixg-hero__identity\">{{identity:PRIMARY_LOGO}}</div>" : "";
  const primary="<a class=\"ixg-cta ixg-cta--primary\" href=\""+ctaToken("PRIMARY")+"\">"+copyToken("PRIMARY_CTA_LABEL")+"</a>";
  const secondary="<a class=\"ixg-cta ixg-cta--secondary\" href=\""+ctaToken("SECONDARY")+"\">"+copyToken("SECONDARY_CTA_LABEL")+"</a>";

  const main=[
    "<section id=\"hero\" class=\"ixg ixg-hero ixg-"+variantKey.toLowerCase()+"\"><div class=\"ixg-shell\"><div class=\"ixg-hero__grid\"><div class=\"ixg-hero__copy\"><p class=\"ixg-kicker\">"+copyToken("LOCALITY_LINE")+"</p><h1>"+copyToken("HERO_HEADLINE")+"</h1><p class=\"ixg-lede\">"+copyToken("HERO_BODY")+"</p><div class=\"ixg-actions\">"+primary+secondary+"</div></div><div class=\"ixg-hero__device\" aria-hidden=\"true\"><span></span><span></span><span></span><span></span></div>"+identity+"</div></div></section>",
    "<section id=\"positioning\" class=\"ixg ixg-positioning\"><div class=\"ixg-shell ixg-split\"><div class=\"ixg-positioning__statement\"><h2>"+copyToken("HERO_HEADLINE")+"</h2></div><div class=\"ixg-positioning__body\"><p>"+copyToken("HERO_BODY")+"</p><p class=\"ixg-locality\">"+copyToken("LOCALITY_LINE")+"</p></div></div></section>",
    "<section id=\"services\" class=\"ixg ixg-services\"><div class=\"ixg-shell\"><div class=\"ixg-services__grid\">"+services+"</div></div></section>",
    "<section id=\"trust\" class=\"ixg ixg-trust-section\"><div class=\"ixg-shell\"><div class=\"ixg-trust-grid\">"+trust+"</div></div></section>",
    "<section id=\"bridge\" class=\"ixg ixg-bridge\"><div class=\"ixg-shell ixg-bridge__grid\"><div class=\"ixg-bridge__copy\"><h2>"+copyToken("FOOTER_LINE")+"</h2><p>"+copyToken("HERO_BODY")+"</p></div><div class=\"ixg-bridge__device\" aria-hidden=\"true\"><i></i><i></i><i></i></div></div></section>",
    "<section id=\"contact\" class=\"ixg ixg-contact\"><div class=\"ixg-shell ixg-contact__inner\"><div><p class=\"ixg-kicker\">"+copyToken("LOCALITY_LINE")+"</p><h2>"+copyToken("PRIMARY_CTA_LABEL")+"</h2></div><div class=\"ixg-actions\">"+primary+secondary+"</div></div></section>"
  ].join("");

  const base=`
:root{--ix-ink:#111;--ix-paper:#f4f1ea;--ix-muted:#6b6964;--ix-line:rgba(17,17,17,.18);--ix-dark:#111;--ix-light:#fff;--ix-space:clamp(24px,4.2vw,72px)}
.ixg{position:relative;overflow:hidden}.ixg-shell{width:min(1320px,calc(100% - 2*var(--ix-space)));margin:0 auto}
.ixg h1,.ixg h2,.ixg h3,.ixg p{margin:0}.ixg h1{font-size:clamp(58px,8.4vw,138px);line-height:.86;letter-spacing:-.065em;max-width:10ch}
.ixg h2{font-size:clamp(36px,5.4vw,82px);line-height:.94;letter-spacing:-.045em}.ixg h3{font-size:clamp(24px,2.4vw,38px);line-height:1.02;letter-spacing:-.025em}
.ixg p{font-size:clamp(16px,1.3vw,20px);line-height:1.55}.ixg-kicker{font-size:12px!important;letter-spacing:.16em;text-transform:uppercase;font-weight:700}
.ixg-lede{max-width:56ch;margin-top:30px!important;color:var(--ix-muted)}.ixg-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:36px}
.ixg-cta{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:0 24px;border:1px solid currentColor;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:.02em}
.ixg-cta--primary{background:var(--ix-ink);color:#fff}.ixg-cta--secondary{background:transparent;color:inherit}
.ixg-hero{background:var(--ix-paper);color:var(--ix-ink);padding:clamp(70px,8vw,130px) 0 clamp(80px,10vw,160px)}
.ixg-hero__grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(280px,.65fr);gap:clamp(40px,7vw,120px);align-items:end}
.ixg-hero__device{height:clamp(320px,45vw,620px);display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:8px;align-self:stretch}
.ixg-hero__device span{display:block;background:var(--ix-ink)}.ixg-hero__device span:nth-child(2){background:transparent;border:1px solid var(--ix-ink)}
.ixg-hero__device span:nth-child(3){background:rgba(17,17,17,.12)}.ixg-hero__device span:nth-child(4){background:var(--ix-ink);transform:translateY(18%)}
.ixg-hero__identity{grid-column:1/-1;margin-top:34px;width:min(420px,70vw)}
.ixg-positioning{padding:clamp(70px,9vw,140px) 0;background:#fff;color:var(--ix-ink);border-top:1px solid var(--ix-line);border-bottom:1px solid var(--ix-line)}
.ixg-split{display:grid;grid-template-columns:1fr 1fr;gap:clamp(50px,9vw,140px);align-items:start}.ixg-positioning__body{display:grid;gap:24px;padding-top:8px}.ixg-locality{font-weight:700}
.ixg-services{background:#fff;padding:0;color:var(--ix-ink)}.ixg-services__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border-left:1px solid var(--ix-line);border-top:1px solid var(--ix-line)}
.ixg-service{min-height:320px;padding:clamp(30px,4.5vw,64px);border-right:1px solid var(--ix-line);border-bottom:1px solid var(--ix-line);display:flex;flex-direction:column;justify-content:space-between;gap:44px}
.ixg-service__body{color:var(--ix-muted);max-width:48ch}.ixg-trust-section{padding:clamp(70px,8vw,120px) 0;background:var(--ix-dark);color:#fff}
.ixg-trust-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-top:1px solid rgba(255,255,255,.22);border-left:1px solid rgba(255,255,255,.22)}
.ixg-trust{min-height:150px;padding:28px;border-right:1px solid rgba(255,255,255,.22);border-bottom:1px solid rgba(255,255,255,.22);display:flex;align-items:flex-end}
.ixg-trust strong{font-size:clamp(22px,2.1vw,34px);line-height:1.08;letter-spacing:-.025em}
.ixg-bridge{padding:clamp(80px,10vw,150px) 0;background:var(--ix-paper);color:var(--ix-ink)}
.ixg-bridge__grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,.75fr);gap:clamp(40px,8vw,120px);align-items:center}.ixg-bridge__copy{display:grid;gap:26px}
.ixg-bridge__device{height:320px;display:grid;grid-template-columns:2fr 1fr;grid-template-rows:1fr 1fr;gap:10px}.ixg-bridge__device i{display:block;background:var(--ix-ink)}
.ixg-bridge__device i:nth-child(2){background:#fff;border:1px solid var(--ix-ink)}.ixg-bridge__device i:nth-child(3){grid-column:1/-1;background:rgba(17,17,17,.14)}
.ixg-contact{padding:clamp(70px,8vw,120px) 0;background:#fff;color:var(--ix-ink);border-top:1px solid var(--ix-line)}.ixg-contact__inner{display:grid;grid-template-columns:1fr auto;gap:40px;align-items:end}
@media(max-width:700px){
 .ixg-shell{width:min(100% - 40px,1320px)}.ixg h1{font-size:clamp(50px,14vw,74px);max-width:none;overflow-wrap:anywhere}.ixg h2{font-size:clamp(34px,10vw,52px)}
 .ixg-hero{padding:60px 0 76px}.ixg-hero__grid,.ixg-split,.ixg-bridge__grid,.ixg-contact__inner{grid-template-columns:1fr}.ixg-hero__device{height:220px;grid-template-columns:1.4fr .6fr;order:2}
 .ixg-hero__copy{order:1}.ixg-hero__identity{order:3;margin-top:6px}.ixg-actions{display:grid;grid-template-columns:1fr;margin-top:26px}.ixg-cta{width:100%;min-height:50px}
 .ixg-positioning{padding:64px 0}.ixg-split{gap:28px}.ixg-services__grid{grid-template-columns:1fr}.ixg-service{min-height:0;padding:34px 24px;gap:22px}
 .ixg-trust-section{padding:58px 0}.ixg-trust-grid{grid-template-columns:1fr}.ixg-trust{min-height:0;padding:24px}.ixg-bridge{padding:70px 0}.ixg-bridge__grid{gap:38px}.ixg-bridge__device{height:210px}
 .ixg-contact{padding:60px 0}.ixg-contact__inner{align-items:start}.ixg-contact .ixg-actions{margin-top:0}
}
`;

  const variants={
    A:`
.ixg-a .ixg-hero__device{grid-template-columns:.8fr 1.2fr}.ixg-a .ixg-hero__device span:nth-child(1){background:#111}.ixg-a .ixg-hero__device span:nth-child(2){border-width:10px}
.ixg-a .ixg-positioning__statement h2{max-width:11ch}.ixg-a .ixg-service:nth-child(2n){background:#f4f1ea}
`,
    B:`
.ixg-b{--ix-paper:#111;--ix-ink:#f4f1ea;--ix-muted:#b8b5ae;--ix-line:rgba(244,241,234,.22)}
.ixg-b.ixg-hero{background:#111;color:#f4f1ea}.ixg-b .ixg-hero__grid{grid-template-columns:minmax(0,.9fr) minmax(320px,1.1fr);align-items:center}
.ixg-b .ixg-hero__copy{order:2}.ixg-b .ixg-hero__device{order:1}.ixg-b .ixg-hero__device span{background:#f4f1ea}.ixg-b .ixg-hero__device span:nth-child(2){background:#111;border-color:#f4f1ea}.ixg-b .ixg-hero__device span:nth-child(3){background:#393733}
.ixg-b .ixg-cta--primary{background:#f4f1ea;color:#111}.ixg-b .ixg-cta--secondary{color:#f4f1ea}.ixg-b h1{font-family:Georgia,'Times New Roman',serif;font-weight:500;letter-spacing:-.055em}
.ixg-b+.ixg-positioning{background:#111;color:#f4f1ea;border-color:rgba(244,241,234,.22)}.ixg-b+.ixg-positioning .ixg-locality{color:#f4f1ea}
@media(max-width:700px){.ixg-b .ixg-hero__copy{order:1}.ixg-b .ixg-hero__device{order:2}}
`,
    C:`
.ixg-c.ixg-hero{background:#fafafa}.ixg-c .ixg-hero__grid{grid-template-columns:minmax(0,1fr) minmax(360px,1fr);align-items:start}
.ixg-c .ixg-hero__device{height:520px;grid-template-columns:1.2fr .8fr;grid-template-rows:.7fr 1.3fr}.ixg-c .ixg-hero__device span:nth-child(1){background:#dedbd3}.ixg-c .ixg-hero__device span:nth-child(2){border:0;background:#111}.ixg-c .ixg-hero__device span:nth-child(3){background:#111}.ixg-c .ixg-hero__device span:nth-child(4){background:#dedbd3;transform:none}
.ixg-c h1{font-family:Georgia,'Times New Roman',serif;font-weight:500}.ixg-c .ixg-lede{max-width:48ch}
.ixg-c+.ixg-positioning .ixg-split{grid-template-columns:.8fr 1.2fr}.ixg-c+.ixg-positioning{background:#f3f3f0}
@media(max-width:700px){.ixg-c .ixg-hero__device{height:240px}.ixg-c+.ixg-positioning .ixg-split{grid-template-columns:1fr}}
`
  };

  return {
    spec:{
      main_html:main,
      custom_css:base+(variants[variantKey]||variants.A),
      section_ids:["hero","positioning","services","trust","bridge","contact"],
      used_copy_tokens:commonUsedCopy(copyManifest),
      used_asset_tokens:[],
      implementation_notes:"Deterministic ZERO_PHOTO_PREMIUM grammar "+variantKey+": content-verified, static, no placeholder geometry, responsive 1440/390 composition."
    },
    strategy:"ZERO_PHOTO_PREMIUM_GRAMMAR_V1"
  };
}
