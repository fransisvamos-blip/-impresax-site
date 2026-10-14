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
  const serviceTitles=availableIndexed(copyManifest,"SERVICE_","_TITLE");
  const serviceBodies=availableIndexed(copyManifest,"SERVICE_","_BODY");
  const trustKeys=availableIndexed(copyManifest,"TRUST_");
  const positionTitle=serviceTitles[0]||"LOCALITY_LINE";
  const positionBody=serviceBodies[0]||"HERO_BODY";
  const bridgeTitle=serviceTitles[1]||"FOOTER_LINE";
  const bridgeBody=serviceBodies[1]||trustKeys[0]||"HERO_BODY";
  const vclass="ixg-"+variantKey.toLowerCase();

  const primary="<a class=\"ixg-cta ixg-cta--primary\" href=\""+ctaToken("PRIMARY")+"\">"+copyToken("PRIMARY_CTA_LABEL")+"</a>";
  const secondary="<a class=\"ixg-cta ixg-cta--secondary\" href=\""+ctaToken("SECONDARY")+"\">"+copyToken("SECONDARY_CTA_LABEL")+"</a>";

  const main=[
    "<section id=\"hero\" class=\"ixg ixg-hero "+vclass+"\"><div class=\"ixg-shell\"><div class=\"ixg-hero__grid\"><div class=\"ixg-hero__copy\"><p class=\"ixg-kicker\">"+copyToken("LOCALITY_LINE")+"</p><h1>"+copyToken("HERO_HEADLINE")+"</h1><p class=\"ixg-lede\">"+copyToken("HERO_BODY")+"</p><div class=\"ixg-actions\">"+primary+secondary+"</div></div><div class=\"ixg-hero__device\" aria-hidden=\"true\"><span></span><span></span><span></span><span></span></div></div></div></section>",
    "<section id=\"positioning\" class=\"ixg ixg-positioning "+vclass+"\"><div class=\"ixg-shell ixg-split\"><div class=\"ixg-positioning__statement\"><h2>"+copyToken(positionTitle)+"</h2></div><div class=\"ixg-positioning__body\"><p>"+copyToken(positionBody)+"</p><p class=\"ixg-locality\">"+copyToken("LOCALITY_LINE")+"</p></div></div></section>",
    "<section id=\"services\" class=\"ixg ixg-services "+vclass+"\"><div class=\"ixg-shell\"><div class=\"ixg-services__grid\">"+services+"</div></div></section>",
    "<section id=\"trust\" class=\"ixg ixg-trust-section "+vclass+"\"><div class=\"ixg-shell\"><div class=\"ixg-trust-grid\">"+trust+"</div></div></section>",
    "<section id=\"bridge\" class=\"ixg ixg-bridge "+vclass+"\"><div class=\"ixg-shell ixg-bridge__grid\"><div class=\"ixg-bridge__copy\"><h2>"+copyToken(bridgeTitle)+"</h2><p>"+copyToken(bridgeBody)+"</p></div><div class=\"ixg-bridge__device\" aria-hidden=\"true\"><i></i><i></i><i></i></div></div></section>",
    "<section id=\"contact\" class=\"ixg ixg-contact "+vclass+"\"><div class=\"ixg-shell ixg-contact__inner\"><div><p class=\"ixg-kicker\">"+copyToken("LOCALITY_LINE")+"</p><h2>"+copyToken("PRIMARY_CTA_LABEL")+"</h2></div><div class=\"ixg-actions\">"+primary+secondary+"</div></div></section>"
  ].join("");

  const base=`
:root{--ix-ink:#111;--ix-paper:#f4f1ea;--ix-muted:#6b6964;--ix-line:rgba(17,17,17,.18);--ix-dark:#111;--ix-light:#fff;--ix-space:clamp(24px,4.2vw,72px)}
.ixg{position:relative;overflow:hidden;font-family:Arial,Helvetica,sans-serif}.ixg-shell{width:min(1320px,calc(100% - 2*var(--ix-space)));margin:0 auto}
.ixg h1,.ixg h2,.ixg h3,.ixg p{margin:0}.ixg h1{font-size:clamp(58px,8.4vw,138px);line-height:.86;letter-spacing:-.065em;max-width:10ch}
.ixg h2{font-size:clamp(36px,5.4vw,82px);line-height:.94;letter-spacing:-.045em}.ixg h3{font-size:clamp(24px,2.4vw,38px);line-height:1.02;letter-spacing:-.025em}
.ixg p{font-size:clamp(16px,1.3vw,20px);line-height:1.55}.ixg-kicker{font-size:12px!important;letter-spacing:.16em;text-transform:uppercase;font-weight:700}
.ixg-lede{max-width:56ch;margin-top:30px!important;color:var(--ix-muted)}.ixg-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:36px}
.ixg-cta{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:0 24px;border:1px solid currentColor;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:.02em}
.ixg-cta--primary{background:var(--ix-ink);color:#fff}.ixg-cta--secondary{background:transparent;color:inherit}
.ixg-hero{background:var(--ix-paper);color:var(--ix-ink);padding:clamp(70px,8vw,130px) 0 clamp(80px,10vw,150px)}
.ixg-hero__grid{display:grid;grid-template-columns:minmax(0,1.22fr) minmax(320px,.78fr);gap:clamp(36px,6vw,92px);align-items:center}
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
.ixg-trust strong{font-size:clamp(22px,2.1vw,34px);line-height:1.08;letter-spacing:-.025em}
.ixg-bridge{padding:clamp(76px,9vw,130px) 0;background:var(--ix-paper);color:var(--ix-ink)}
.ixg-bridge__grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(260px,.75fr);gap:clamp(42px,7vw,100px);align-items:center}.ixg-bridge__copy{display:grid;gap:26px}
.ixg-bridge__device{position:relative;height:280px}.ixg-bridge__device i{position:absolute;display:block;background:var(--ix-ink)}
.ixg-bridge__device i:nth-child(1){left:0;top:18%;width:100%;height:12px}.ixg-bridge__device i:nth-child(2){right:20%;top:0;width:12px;height:100%}.ixg-bridge__device i:nth-child(3){left:14%;bottom:20%;width:62%;height:7px;background:rgba(17,17,17,.34)}
.ixg-contact{padding:clamp(68px,7vw,105px) 0;background:#fff;color:var(--ix-ink);border-top:1px solid var(--ix-line)}.ixg-contact__inner{display:grid;grid-template-columns:1fr auto;gap:40px;align-items:end}
@media(max-width:700px){
 .ixg-shell{width:min(calc(100% - 40px),1320px)}.ixg h1{font-size:clamp(42px,11.5vw,62px);max-width:none;overflow-wrap:normal;word-break:normal;hyphens:none}.ixg h2{font-size:clamp(32px,9vw,48px)}
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
.ixg-a .ixg-hero__device span:nth-child(3){left:8%;width:76%;height:10px}.ixg-a .ixg-hero__device span:nth-child(4){left:54%;height:76%;width:10px}
.ixg-a.ixg-positioning{background:#f7f5ef}.ixg-a .ixg-positioning__statement h2{max-width:12ch}.ixg-a .ixg-service:nth-child(2n){background:#f4f1ea}
.ixg-a .ixg-bridge__device i:nth-child(1){height:14px}.ixg-a .ixg-bridge__device i:nth-child(2){width:14px}
`,
    B:`
.ixg-b{--ix-paper:#111;--ix-ink:#f4f1ea;--ix-muted:#b8b5ae;--ix-line:rgba(244,241,234,.22)}
.ixg-b.ixg-hero,.ixg-b.ixg-positioning{background:#111;color:#f4f1ea;border-color:rgba(244,241,234,.22)}
.ixg-b.ixg-hero .ixg-hero__grid{grid-template-columns:minmax(300px,.72fr) minmax(0,1.28fr);align-items:center}
.ixg-b.ixg-hero .ixg-hero__copy{order:2}.ixg-b.ixg-hero .ixg-hero__device{order:1}
.ixg-b .ixg-hero__device span{background:#f4f1ea}.ixg-b .ixg-hero__device span:nth-child(1){transform:rotate(-9deg);top:26%;height:16px}.ixg-b .ixg-hero__device span:nth-child(2){transform:rotate(8deg);right:32%;width:16px}
.ixg-b .ixg-hero__device span:nth-child(3){transform:rotate(-9deg);left:12%;bottom:24%;width:74%;background:#77736b}.ixg-b .ixg-hero__device span:nth-child(4){transform:rotate(8deg);left:58%;background:#77736b}
.ixg-b h1,.ixg-b h2,.ixg-b h3{font-family:Georgia,'Times New Roman',serif;font-weight:500}.ixg-b h1{letter-spacing:-.055em}
.ixg-b .ixg-cta--primary{background:#f4f1ea;color:#111}.ixg-b .ixg-cta--secondary{color:inherit}
.ixg-b.ixg-services{background:#f4f1ea;color:#111}.ixg-b.ixg-services .ixg-services__grid{grid-template-columns:repeat(2,minmax(0,1fr));overflow:hidden;background:#111;border-right:1px solid #111}.ixg-b.ixg-services .ixg-service{width:100%;min-width:0}.ixg-b.ixg-services .ixg-service:not(:nth-child(2n)) .ixg-service__body{color:#2b2926}.ixg-b.ixg-services .ixg-service:nth-child(2n){background:#111;color:#f4f1ea}.ixg-b.ixg-services .ixg-service:nth-child(2n) .ixg-service__body{color:#c9c5bd}
.ixg-b.ixg-bridge{background:#111;color:#f4f1ea}.ixg-b .ixg-bridge__device i{background:#f4f1ea}.ixg-b .ixg-bridge__device i:nth-child(3){background:#77736b}
.ixg-b.ixg-contact{background:#f4f1ea;color:#111}.ixg-b.ixg-contact .ixg-cta--primary{background:#111;color:#f4f1ea;border-color:#111}.ixg-b.ixg-contact .ixg-cta--secondary{color:#111;border-color:#111}.ixg-b.ixg-contact h2{color:#111}.ixg-b.ixg-hero .ixg-actions{margin-top:44px}
@media(max-width:700px){.ixg-b.ixg-hero .ixg-hero__copy{order:1}.ixg-b.ixg-hero .ixg-hero__device{order:2;transform:none}.ixg-b .ixg-hero__device span{transform:none!important}.ixg-b.ixg-services .ixg-services__grid{grid-template-columns:1fr!important}.ixg-b.ixg-services .ixg-service{width:100%!important}.ixg-b.ixg-services .ixg-service:not(:nth-child(2n)) .ixg-service__body{color:#2b2926!important}}
`,
    C:`
.ixg-c.ixg-hero{background:#fafafa}.ixg-c.ixg-hero .ixg-hero__grid{grid-template-columns:minmax(0,1fr) minmax(340px,.92fr);align-items:center}
.ixg-c .ixg-hero__device{background:#efefeb;min-height:360px}.ixg-c .ixg-hero__device span:nth-child(1){left:4%;top:15%;width:92%;height:12px}.ixg-c .ixg-hero__device span:nth-child(2){right:15%;top:4%;width:12px;height:92%}
.ixg-c .ixg-hero__device span:nth-child(3){left:10%;bottom:18%;width:82%;height:10px;background:#8f8c85}.ixg-c .ixg-hero__device span:nth-child(4){left:34%;top:10%;width:10px;height:82%;background:#8f8c85}
.ixg-c h1,.ixg-c h2{font-family:Georgia,'Times New Roman',serif;font-weight:500}.ixg-c.ixg-positioning{background:#f2f2ef}.ixg-c.ixg-positioning .ixg-split{grid-template-columns:.8fr 1.2fr}.ixg-c.ixg-positioning .ixg-positioning__body p{font-size:clamp(18px,1.6vw,24px)}
.ixg-c.ixg-services .ixg-services__grid{grid-template-columns:1.15fr .85fr}.ixg-c.ixg-bridge{background:#ededE8}
.ixg-c .ixg-bridge__device{background:#e3e3de}.ixg-c .ixg-bridge__device i:nth-child(1){left:3%;top:16%;width:92%;height:11px}.ixg-c .ixg-bridge__device i:nth-child(2){right:14%;top:4%;width:11px;height:92%}.ixg-c .ixg-bridge__device i:nth-child(3){left:12%;bottom:20%;width:76%;height:9px;background:#8f8c85}
@media(max-width:700px){.ixg-c.ixg-positioning .ixg-split,.ixg-c.ixg-services .ixg-services__grid{grid-template-columns:1fr}.ixg-c .ixg-hero__device{min-height:150px;height:150px}.ixg-c .ixg-bridge__device{height:150px}}
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
      used_asset_tokens:[],
      implementation_notes:"Deterministic ZERO_PHOTO_PREMIUM grammar v1.4 "+variantKey+": unique shell identity, verified copy distribution, structural rule system, responsive 1440/390."
    },
    strategy:"ZERO_PHOTO_PREMIUM_GRAMMAR_V1_4"
  };
}
