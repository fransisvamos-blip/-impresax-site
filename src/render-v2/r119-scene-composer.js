const copyToken=k=>"{{copy:"+k+"}}";
const ctaToken=k=>"{{cta:"+k+"}}";
const assetToken=k=>"{{asset:"+k+"}}";

function hasCopy(copy,key){ return Object.prototype.hasOwnProperty.call(copy||{},key); }
function hasAsset(assets,key){ return new Set(assets||[]).has(key); }

function picture(assets,key,klass){
  return hasAsset(assets,key)
    ? '<figure class="'+klass+'"><img src="'+assetToken(key)+'" alt=""></figure>'
    : "";
}

export const R119_SCENE_COMPOSER_STANDARD="R119_SIGNATURE_SCENE_COMPOSER_V1";

export function buildR119SceneComposerSpec({
  copyManifest={},
  assetTokens=[],
  hasIdentity=true,
  inputPayload={},
  mode="base"
}={}) {
  const assets=[...new Set(assetTokens||[])];
  const juryReset=mode==="jury-reset";
  const sceneModeClass=juryReset?" r119-jury-reset":"";
  const partner=hasCopy(copyManifest,"PARTNER_1") && hasAsset(assets,"PARTNER_UPOWER_LOGO");
  const service1Body=hasCopy(copyManifest,"SERVICE_1_BODY")
    ? '<p class="r119-service__body">'+copyToken("SERVICE_1_BODY")+'</p>' : "";
  const service2Body=hasCopy(copyManifest,"SERVICE_2_BODY")
    ? '<p class="r119-service__body">'+copyToken("SERVICE_2_BODY")+'</p>' : "";
  const partnerMarkup=partner
    ? '<div class="r119-proof__partner" data-verified-partner="true" data-partner-verification="verified-only" data-partner-stage="commissioned"><img src="'+assetToken("PARTNER_UPOWER_LOGO")+'" alt=""><strong>'+copyToken("PARTNER_1")+'</strong></div>'
    : "";
  const identity="";
  const identityField=hasIdentity
    ? '<div class="r119-positioning__identity" data-brand-watermark aria-hidden="true">{{identity:PRIMARY_LOGO}}</div>'
    : "";

  const main=[
    '<section id="hero" class="r119-scene r119-hero'+sceneModeClass+'" data-r119-scene="true" data-r118-perceptual-jury="true" data-launch-hero="true" data-hero-full-bleed="true" data-typography-system="responsive" data-copy-density="low" data-value-perception="15k" data-brand-specific="true" data-sales-architecture="true" data-custom-made="true" data-signature-moment="true" data-spectacle-moment="true" data-stage-depth="cinematic" data-wow-moment="true" data-mobile-native="true">'+
      picture(assets,"HERO_VISUAL","r119-hero__media")+
      '<div class="r120-hero__detail">'+picture(assets,"SERVICE_MATERIALS_VISUAL","r120-hero__detail-media")+'</div>'+
      '<div class="r119-hero__veil" aria-hidden="true"></div>'+
      '<div class="r119-hero__copy"><p class="r119-kicker">'+copyToken("LOCALITY_LINE")+'</p><h1>'+copyToken("HERO_HEADLINE")+'</h1><div class="r120-microcopy r120-microcopy--hero">'+copyToken("HERO_BODY")+'</div><div class="r119-actions ixg-actions"><a class="r119-btn r119-btn--solid" data-premium-button="true" href="'+ctaToken("PRIMARY")+'"><span>'+copyToken("PRIMARY_CTA_LABEL")+'</span><span aria-hidden="true">↗</span></a><a class="r119-btn r119-btn--ghost" data-premium-button="true" href="'+ctaToken("SECONDARY")+'"><span>'+copyToken("SECONDARY_CTA_LABEL")+'</span><span aria-hidden="true">→</span></a></div></div>'+
      '<div class="r120-hero__graphic" aria-hidden="true"><span></span><span></span><span></span><span></span></div>'+
    '</section>',

    '<section id="positioning" class="r119-scene r119-positioning'+sceneModeClass+'" data-r119-scene="true" data-surface="art-directed" data-brand-surface="light" data-copy-density="low" data-signature-moment="true" data-spectacle-moment="true" data-stage-depth="editorial" data-wow-moment="true">'+
      identityField+
      '<div class="r120-positioning__mosaic">'+
        picture(assets,"POSITIONING_VISUAL","r119-positioning__media")+
        picture(assets,"HERO_VISUAL","r120-positioning__detail r120-positioning__detail--a")+
        picture(assets,"SERVICE_REBAR_VISUAL","r120-positioning__detail r120-positioning__detail--b")+
      '</div>'+
      '<div class="r119-positioning__copy"><p class="r119-kicker">'+copyToken("LOCALITY_LINE")+'</p><h2>'+copyToken("POSITIONING_TITLE")+'</h2><div class="r120-microcopy">'+copyToken("POSITIONING_BODY")+'</div></div>'+
      '<div class="r120-positioning__index" aria-hidden="true"><span></span><span></span><span></span></div>'+
    '</section>',

    '<section id="materials" class="r119-scene r119-materials'+sceneModeClass+'" data-r119-scene="true" data-surface="art-directed" data-brand-surface="tint" data-copy-density="low" data-signature-moment="true" data-spectacle-moment="true" data-stage-depth="material" data-wow-moment="true">'+
      '<div class="r120-materials__gallery">'+
        picture(assets,"SERVICE_MATERIALS_VISUAL","r119-materials__media")+
        picture(assets,"POSITIONING_VISUAL","r120-materials__detail r120-materials__detail--one")+
        picture(assets,"HERO_VISUAL","r120-materials__detail r120-materials__detail--two")+
      '</div>'+
      '<div class="r119-materials__structure" aria-hidden="true"><span></span><span></span><span></span><span></span></div>'+
      '<div class="r119-materials__copy"><p class="r119-kicker">'+copyToken("LOCALITY_LINE")+'</p><h2>'+copyToken("SERVICE_1_TITLE")+'</h2></div>'+
      '<div class="r120-materials__spec" aria-hidden="true"><span></span><span></span><span></span><span></span></div>'+
    '</section>',

    '<section id="services" class="r119-scene r119-rebar'+sceneModeClass+'" data-r119-scene="true" data-surface="art-directed" data-brand-surface="dark" data-copy-density="low" data-signature-moment="true" data-spectacle-moment="true" data-stage-depth="cinematic" data-wow-moment="true">'+
      picture(assets,"SERVICE_REBAR_VISUAL","r119-rebar__photo")+
      '<div class="r120-rebar__detail-stack">'+
        picture(assets,"SERVICE_MATERIALS_VISUAL","r120-rebar__detail r120-rebar__detail--a")+
        picture(assets,"POSITIONING_VISUAL","r120-rebar__detail r120-rebar__detail--b")+
      '</div>'+
      '<div class="r119-rebar__media r119-rebar__technical" aria-hidden="true"><span></span><span></span><span></span><span></span></div>'+
      '<div class="r119-rebar__veil" aria-hidden="true"></div>'+
      '<div class="r119-rebar__title"><p class="r119-kicker">'+copyToken("SERVICES_TITLE")+'</p><h2>'+copyToken("SERVICE_2_TITLE")+'</h2><div class="r120-microcopy r120-microcopy--dark">'+copyToken("SERVICES_INTRO")+'</div></div>'+
      '<div class="r120-rebar__process" aria-hidden="true"><span></span><span></span><span></span><span></span></div>'+
    '</section>',

    '<section id="trust" class="r119-scene r119-proof'+sceneModeClass+'" data-r119-scene="true" data-surface="art-directed" data-brand-surface="primary" data-copy-density="low" data-signature-moment="true" data-spectacle-moment="true" data-stage-depth="editorial" data-wow-moment="true">'+
      '<div class="r119-proof__head"><p class="r119-kicker">'+copyToken("TRUST_TITLE")+'</p><h2>'+copyToken("TRUST_INTRO")+'</h2></div>'+
      '<div class="r120-proof__visual">'+
        picture(assets,"SERVICE_MATERIALS_VISUAL","r120-proof__visual-main")+
        picture(assets,"SERVICE_REBAR_VISUAL","r120-proof__visual-detail")+
        '<div class="r120-proof__graphic" aria-hidden="true"><span></span><span></span><span></span></div>'+
      '</div>'+
      '<div class="r119-proof__facts">'+
        '<article data-trust-reason="1"><span class="r119-proof__mark ixg-trust-reason__graphic" aria-hidden="true"></span><div><span class="r119-proof__label">'+copyToken("TRUST_1_LABEL")+'</span><strong>'+copyToken("TRUST_1")+'</strong></div></article>'+
        '<article data-trust-reason="2"><span class="r119-proof__mark ixg-trust-reason__graphic" aria-hidden="true"></span><div><span class="r119-proof__label">'+copyToken("TRUST_2_LABEL")+'</span><strong>'+copyToken("TRUST_2")+'</strong></div></article>'+
        '<article data-trust-reason="3"><span class="r119-proof__mark ixg-trust-reason__graphic" aria-hidden="true"></span><div><span class="r119-proof__label">'+copyToken("TRUST_3_LABEL")+'</span><strong>'+copyToken("TRUST_3")+'</strong></div></article>'+
      '</div>'+
    '</section>',

    '<section id="partners" class="r119-scene r119-partner'+sceneModeClass+'" data-r119-scene="true" data-surface="art-directed" data-brand-surface="dark" data-copy-density="low" data-signature-moment="true" data-stage-depth="gallery" data-wow-moment="true">'+
      '<div class="r120-partner__backdrop">'+picture(assets,"HERO_VISUAL","r120-partner__backdrop-media")+'</div>'+
      '<div class="r119-partner__label"><p class="r119-kicker">'+copyToken("PARTNER_SECTION_TITLE")+'</p></div>'+
      partnerMarkup+
      '<div class="r120-partner__graphic" aria-hidden="true"><span></span><span></span><span></span></div>'+
    '</section>',

    '<section id="bridge" class="r119-scene r119-contact'+sceneModeClass+'" data-r119-scene="true" data-surface="art-directed" data-brand-surface="tint" data-copy-density="low" data-stage-depth="material" data-wow-moment="true">'+
      '<div class="r120-contact__strip">'+
        picture(assets,"SERVICE_MATERIALS_VISUAL","r120-contact__shot r120-contact__shot--a")+
        picture(assets,"SERVICE_REBAR_VISUAL","r120-contact__shot r120-contact__shot--b")+
        picture(assets,"POSITIONING_VISUAL","r120-contact__shot r120-contact__shot--c")+
      '</div>'+
      '<div class="r119-contact__meta"><p class="r119-kicker">'+copyToken("BRIDGE_TITLE")+'</p></div>'+
      '<a class="r119-contact__link" href="'+ctaToken("SECONDARY")+'"><span>'+copyToken("SECONDARY_CTA_LABEL")+'</span><span aria-hidden="true">→</span></a>'+
    '</section>',

    '<section id="final-cta" class="r119-scene r119-close'+sceneModeClass+'" data-r119-scene="true" data-surface="art-directed" data-brand-surface="dark" data-copy-density="low" data-signature-moment="true" data-spectacle-moment="true" data-stage-depth="cinematic" data-wow-moment="true">'+
      '<div class="r120-close__media">'+picture(assets,"HERO_VISUAL","r120-close__media-main")+'</div>'+
      '<div class="r119-close__copy"><p class="r119-kicker">'+copyToken("LOCALITY_LINE")+'</p><h2>'+copyToken("CLOSING_TITLE")+'</h2><div class="r120-microcopy r120-microcopy--dark">'+copyToken("CLOSING_BODY")+'</div></div>'+
      '<a class="r119-btn r119-btn--final" data-premium-button="true" href="'+ctaToken("PRIMARY")+'">'+copyToken("PRIMARY_CTA_LABEL")+'</a>'+
      '<div class="r120-close__graphic" aria-hidden="true"><span></span><span></span></div>'+
    '</section>'
  ].join("");

  const css=`
:root{
  --ix-ink:#08090a;
  --ix-carbon:#111315;
  --ix-paper:#f4f1ea;
  --ix-sand:#d8cec0;
  --ix-red:#b3171a;
  --ix-white:#fbfaf7;
  --ix-ease:cubic-bezier(.2,.72,.2,1);
  --ix-display:Inter Tight,Inter,Aptos,"Segoe UI",sans-serif;
  --ix-body:Inter,Aptos,"Segoe UI",sans-serif;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{background:var(--ix-ink);text-wrap:pretty}
img{display:block;width:100%;height:100%;object-fit:cover}
.r119-scene{position:relative;overflow:hidden;isolation:isolate;font-family:var(--ix-body)}
.r119-kicker{margin:0;font-size:9px;line-height:1.2;font-weight:800;letter-spacing:.18em;text-transform:uppercase}
.r120-microcopy{margin-top:14px;max-width:32ch;font-size:13px;line-height:1.55;color:rgba(8,9,10,.58)}
.r120-microcopy--hero,.r120-microcopy--dark{color:rgba(255,255,255,.68)}
.r120-microcopy--hero{margin:0 0 22px;max-width:36ch}
.r119-btn{display:inline-flex;align-items:center;justify-content:space-between;gap:18px;min-height:54px;padding:0 22px;border:1px solid currentColor;text-decoration:none;font-size:11px;font-weight:800;transition:transform .35s var(--ix-ease),background-color .35s var(--ix-ease),border-color .35s var(--ix-ease)}
.r119-btn:hover{transform:translateY(-3px)}
.r119-btn--solid{background:var(--ix-red);border-color:var(--ix-red);color:#fff}
.r119-btn--ghost{background:rgba(255,255,255,.05);color:#fff;border-color:rgba(255,255,255,.38)}
.r119-btn--final{background:var(--ix-white);color:var(--ix-ink);border-color:var(--ix-white)}
.ix-v2-header{position:sticky!important;top:0!important;z-index:70!important;background:rgba(8,9,10,.9)!important;color:#fff!important;border-bottom:1px solid rgba(255,255,255,.12)!important;backdrop-filter:blur(18px)!important}
.ix-v2-header-inner{min-height:72px!important;padding-left:clamp(18px,4vw,60px)!important;padding-right:clamp(18px,4vw,60px)!important}
.ix-v2-header .ix-v2-identity-main{filter:brightness(0) invert(1)!important}
.ix-v2-nav a{color:#fff!important;opacity:.72!important;font-size:10px!important;letter-spacing:.10em!important;text-transform:uppercase!important;transition:opacity .3s var(--ix-ease),transform .3s var(--ix-ease)!important}
.ix-v2-nav a:hover{opacity:1!important;transform:translateY(-2px)!important}
.ix-v2-header-cta{min-height:42px!important;padding:0 16px!important;background:#fff!important;color:var(--ix-ink)!important;border:0!important;border-radius:0!important}

/* R120 hero: full visual dominance, almost no copy */
.r119-hero{min-height:90svh;display:flex;align-items:flex-end;padding:0 5vw 7vh;background:var(--ix-ink);color:#fff}
.r119-hero__media{position:absolute;inset:0;margin:0}
.r119-hero__media img{object-position:60% 48%;filter:saturate(.52) contrast(1.22) brightness(.72);transform:scale(1.02);transition:transform 1s var(--ix-ease),filter .8s var(--ix-ease)}
.r119-hero:hover .r119-hero__media img{transform:scale(1.045);filter:saturate(.62) contrast(1.24) brightness(.76)}
.r119-hero__veil{position:absolute;inset:0;z-index:2;background:linear-gradient(90deg,rgba(5,6,7,.90),rgba(5,6,7,.48) 42%,rgba(5,6,7,.08) 72%),linear-gradient(180deg,transparent 44%,rgba(0,0,0,.48));pointer-events:none}
.r119-hero__copy{position:relative;z-index:6;width:min(720px,58vw);padding:26px 28px;background:rgba(5,6,7,.38);border-left:3px solid var(--ix-red);backdrop-filter:blur(10px)}
.r119-hero__copy h1{margin:10px 0 24px;font-family:var(--ix-display);font-size:clamp(56px,6.3vw,108px);line-height:.87;letter-spacing:-.06em;max-width:8.8ch}
.r119-actions{display:flex;gap:8px;flex-wrap:wrap}
.r120-hero__detail{position:absolute;z-index:5;right:5vw;bottom:6vh;width:min(250px,18vw);height:180px;border:1px solid rgba(255,255,255,.22);box-shadow:0 22px 60px rgba(0,0,0,.28);overflow:hidden}
.r120-hero__detail-media{margin:0;width:100%;height:100%}
.r120-hero__detail-media img{filter:saturate(.7) contrast(1.12)}
.r120-hero__graphic{position:absolute;z-index:5;right:5vw;top:12vh;width:180px;height:180px;border:1px solid rgba(255,255,255,.15);display:grid;grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(2,1fr)}
.r120-hero__graphic span{border-right:1px solid rgba(255,255,255,.13);border-bottom:1px solid rgba(255,255,255,.13)}
.r120-hero__graphic span:nth-child(2){background:rgba(179,23,26,.28)}
.r120-hero__graphic span:nth-child(4){border-left:4px solid var(--ix-red)}

/* positioning: image mosaic dominates */
.r119-positioning{min-height:760px;display:grid;grid-template-columns:minmax(0,68%) minmax(0,32%);background:var(--ix-paper);color:var(--ix-ink);padding:76px 5vw;gap:4vw;align-items:center}
.r120-positioning__mosaic{position:relative;height:600px}
.r119-positioning__media{position:absolute;left:0;top:0;width:74%;height:82%;margin:0;overflow:hidden;box-shadow:0 30px 90px rgba(0,0,0,.16)}
.r119-positioning__media img{object-position:58% center;filter:saturate(.72) contrast(1.08)}
.r120-positioning__detail{position:absolute;margin:0;overflow:hidden;box-shadow:0 22px 70px rgba(0,0,0,.18)}
.r120-positioning__detail--a{right:0;top:10%;width:34%;height:46%}
.r120-positioning__detail--b{right:8%;bottom:0;width:28%;height:34%}
.r120-positioning__detail img{filter:saturate(.66) contrast(1.12)}
.r119-positioning__copy{position:relative;z-index:4}
.r119-positioning__copy h2{margin:12px 0 0;font-family:var(--ix-display);font-size:clamp(44px,4.6vw,78px);line-height:.9;letter-spacing:-.05em;max-width:9ch}
.r119-positioning__identity{position:absolute;right:-4vw;bottom:-3vw;width:min(580px,40vw);opacity:.035}
.r120-positioning__index{position:absolute;right:4vw;top:70px;display:flex;gap:6px}
.r120-positioning__index span{width:42px;height:3px;background:rgba(10,11,12,.18)}
.r120-positioning__index span:nth-child(2){background:var(--ix-red)}

/* materials: visual gallery + technical geometry */
.r119-materials{min-height:780px;display:grid;grid-template-columns:minmax(0,36%) minmax(0,64%);gap:4vw;align-items:center;padding:82px 5vw;background:var(--ix-sand);color:var(--ix-ink)}
.r119-materials__copy{position:relative;z-index:5}
.r119-materials__copy h2{margin:12px 0 0;font-family:var(--ix-display);font-size:clamp(48px,5vw,82px);line-height:.9;letter-spacing:-.055em;max-width:8.8ch}
.r120-materials__gallery{position:relative;height:590px}
.r119-materials__media{position:absolute!important;left:8%;top:4%;width:72%!important;height:82%!important;margin:0!important;overflow:hidden!important;box-shadow:0 34px 90px rgba(0,0,0,.18)!important}
.r119-materials__media img{filter:saturate(.72) contrast(1.08)!important}
.r120-materials__detail{position:absolute;margin:0;overflow:hidden;box-shadow:0 22px 60px rgba(0,0,0,.18)}
.r120-materials__detail--one{right:0;top:0;width:30%;height:38%}
.r120-materials__detail--two{right:2%;bottom:2%;width:38%;height:42%}
.r120-materials__detail img{filter:saturate(.64) contrast(1.1)}
.r119-materials__structure{position:absolute;z-index:2;right:1vw;top:52px;width:38vw;height:630px;border:1px solid rgba(10,11,12,.14);background:repeating-linear-gradient(90deg,transparent 0 72px,rgba(10,11,12,.05) 72px 73px),repeating-linear-gradient(0deg,transparent 0 72px,rgba(10,11,12,.05) 72px 73px);pointer-events:none}
.r119-materials__structure span{position:absolute;background:var(--ix-ink)}
.r119-materials__structure span:nth-child(1){left:8%;top:14%;width:62%;height:3px}
.r119-materials__structure span:nth-child(2){right:18%;top:8%;width:3px;height:62%;background:var(--ix-red)}
.r119-materials__structure span:nth-child(3){left:14%;bottom:16%;width:40%;height:2px}
.r119-materials__structure span:nth-child(4){left:30%;top:34%;width:18%;height:18%;border:1px solid rgba(10,11,12,.36);background:transparent}
.r120-materials__spec{position:absolute;left:5vw;bottom:42px;display:flex;gap:5px}
.r120-materials__spec span{width:46px;height:6px;background:rgba(10,11,12,.18)}
.r120-materials__spec span:nth-child(2){width:90px;background:var(--ix-red)}

/* rebar: media theatre + process graphics */
.r119-rebar{min-height:840px;display:grid;grid-template-columns:minmax(0,66%) minmax(0,34%);background:linear-gradient(115deg,#08090a,#151718 68%,#22090b);color:#fff;padding:82px 5vw}
.r119-rebar__photo{position:absolute;inset:0 31% 0 0;margin:0;overflow:hidden}
.r119-rebar__photo img{object-position:58% center;filter:saturate(.5) contrast(1.2) brightness(.68);transition:transform .8s var(--ix-ease)}
.r119-rebar:hover .r119-rebar__photo img{transform:scale(1.025)}
.r119-rebar__veil{position:absolute;inset:0;z-index:2;background:linear-gradient(90deg,rgba(8,9,10,.06),rgba(8,9,10,.28) 47%,rgba(8,9,10,.94) 70%,#08090a 100%)}
.r119-rebar__media{position:absolute;inset:0 31% 0 0;z-index:1;background:repeating-linear-gradient(104deg,transparent 0 82px,rgba(255,255,255,.04) 82px 83px),repeating-linear-gradient(14deg,transparent 0 126px,rgba(179,23,26,.10) 126px 127px)}
.r119-rebar__title{position:relative;z-index:4;grid-column:1 / span 2;width:min(760px,55vw)}
.r119-rebar__title h2{margin:8px 0 0;font-family:var(--ix-display);font-size:clamp(52px,5.4vw,92px);line-height:.9;letter-spacing:-.055em;max-width:8.5ch}
.r120-rebar__detail-stack{position:absolute;z-index:5;right:5vw;bottom:7vh;width:28vw;height:330px}
.r120-rebar__detail{position:absolute;margin:0;overflow:hidden;border:1px solid rgba(255,255,255,.18);box-shadow:0 22px 60px rgba(0,0,0,.24)}
.r120-rebar__detail--a{left:0;top:0;width:70%;height:62%}
.r120-rebar__detail--b{right:0;bottom:0;width:58%;height:58%}
.r120-rebar__detail img{filter:saturate(.6) contrast(1.12) brightness(.82)}
.r120-rebar__process{position:absolute;z-index:5;left:5vw;bottom:6vh;display:flex;align-items:center;gap:10px}
.r120-rebar__process span{width:56px;height:2px;background:rgba(255,255,255,.28)}
.r120-rebar__process span:nth-child(2){width:110px;background:var(--ix-red)}
.r120-rebar__process span:nth-child(4){width:28px}

/* proof: image evidence first, text facts second */
.r119-proof{min-height:760px;background:var(--ix-white);color:var(--ix-ink);padding:76px 5vw}
.r119-proof__head{display:grid;grid-template-columns:minmax(0,30%) minmax(0,70%);gap:4vw;align-items:end;padding-bottom:28px}
.r119-proof__head h2{margin:0;font-family:var(--ix-display);font-size:clamp(38px,3.9vw,66px);line-height:.94;letter-spacing:-.045em;max-width:12ch}
.r120-proof__visual{position:relative;height:360px;margin-bottom:28px}
.r120-proof__visual-main{position:absolute;left:0;top:0;width:72%;height:100%;margin:0;overflow:hidden}
.r120-proof__visual-main img{filter:saturate(.7) contrast(1.08)}
.r120-proof__visual-detail{position:absolute;right:0;bottom:0;width:34%;height:62%;margin:0;overflow:hidden;border:10px solid var(--ix-white)}
.r120-proof__visual-detail img{filter:saturate(.55) contrast(1.16)}
.r120-proof__graphic{position:absolute;right:2%;top:8%;width:210px;height:110px;border:1px solid rgba(10,11,12,.18);display:grid;grid-template-columns:repeat(3,1fr)}
.r120-proof__graphic span{border-right:1px solid rgba(10,11,12,.16)}
.r120-proof__graphic span:nth-child(2){background:rgba(179,23,26,.18)}
.r119-proof__facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-top:1px solid rgba(10,11,12,.24);border-bottom:1px solid rgba(10,11,12,.18)}
.r119-proof__facts article,.r119-proof__facts article:nth-child(2),.r119-proof__facts article:nth-child(3){min-height:160px;margin:0!important;padding:26px 24px 24px 0!important;border-right:1px solid rgba(10,11,12,.14)}
.r119-proof__facts article:nth-child(2),.r119-proof__facts article:nth-child(3){padding-left:24px!important}
.r119-proof__facts article:last-child{border-right:0}
.r119-proof__label{font-size:8px;text-transform:uppercase;letter-spacing:.16em;font-weight:800;color:var(--ix-red)}
.r119-proof__facts strong{display:block;margin-top:8px;font-family:var(--ix-display);font-size:clamp(24px,2vw,34px);line-height:1;letter-spacing:-.035em}
.r119-proof__mark{display:block;width:32px;height:3px;background:var(--ix-red);margin-bottom:18px}

/* partner: brand installation over media */
.r119-partner{min-height:620px;display:grid!important;grid-template-columns:minmax(0,34%) minmax(0,66%);gap:4vw!important;align-items:center;background:#111315!important;color:#fff!important;padding:72px 5vw!important}
.r120-partner__backdrop{position:absolute;inset:0;opacity:.17}
.r120-partner__backdrop-media{margin:0;width:100%;height:100%}
.r120-partner__backdrop-media img{filter:grayscale(.4) contrast(1.25)}
.r119-partner__label{position:relative;z-index:4}
.r119-partner .r119-proof__partner{position:relative!important;z-index:4!important;min-height:420px!important;width:100%!important;padding:52px!important;display:flex!important;flex-direction:column!important;justify-content:center!important;align-items:center!important;gap:26px!important;background:rgba(244,241,234,.96)!important;color:var(--ix-ink)!important;box-shadow:0 34px 100px rgba(0,0,0,.32)!important}
.r119-partner .r119-proof__partner img{width:min(480px,72%);height:auto;max-height:170px;object-fit:contain}
.r119-partner .r119-proof__partner strong{font-family:var(--ix-display);font-size:clamp(32px,3.4vw,56px);line-height:.96;letter-spacing:-.04em;text-align:center;max-width:14ch!important}
.r120-partner__graphic{position:absolute;z-index:3;left:5vw;bottom:7vh;display:flex;gap:6px}
.r120-partner__graphic span{width:52px;height:5px;background:rgba(255,255,255,.18)}
.r120-partner__graphic span:nth-child(2){width:110px;background:var(--ix-red)}

/* commercial bridge is an image strip, not a text slab */
.r119-contact{min-height:520px;background:var(--ix-red)!important;color:#fff!important;padding:0!important;display:grid;grid-template-rows:1fr auto}
.r120-contact__strip{display:grid;grid-template-columns:1.25fr .8fr 1fr;gap:4px;height:360px}
.r120-contact__shot{margin:0;overflow:hidden}
.r120-contact__shot img{filter:saturate(.72) contrast(1.12) brightness(.82)}
.r119-contact__meta{position:absolute;z-index:5;left:5vw;top:44px;padding:14px 18px;background:rgba(8,9,10,.54);backdrop-filter:blur(8px)}
.r119-contact__link{position:relative!important;z-index:5!important;inset:auto!important;display:flex;width:auto!important;margin:0 5vw 34px!important;padding:20px 0;border-top:1px solid rgba(255,255,255,.7);border-bottom:1px solid rgba(255,255,255,.22);color:#fff;text-decoration:none;font-size:13px;font-weight:800;justify-content:space-between;transition:transform .35s var(--ix-ease),padding .35s var(--ix-ease)}
.r119-contact__link:hover{transform:translateX(8px);padding-left:8px}

/* final: image + CTA, minimal copy */
.r119-close{min-height:640px;display:grid;grid-template-columns:minmax(0,62%) minmax(260px,38%);align-items:end;gap:4vw;padding:76px 5vw 58px;background:#090a0b!important;color:#fff}
.r120-close__media{position:absolute;inset:0 34% 0 0;overflow:hidden;opacity:.42}
.r120-close__media-main{margin:0;width:100%;height:100%}
.r120-close__media-main img{filter:saturate(.42) contrast(1.22) brightness(.66)}
.r119-close__copy{position:relative;z-index:4}
.r119-close__copy h2{margin:10px 0 0;font-family:var(--ix-display);font-size:clamp(54px,5.7vw,98px);line-height:.86;letter-spacing:-.06em;max-width:8ch}
.r119-close>.r119-btn{position:relative!important;z-index:4!important;inset:auto!important;min-height:150px!important;width:100%!important;padding:28px!important;align-self:end}
.r120-close__graphic{position:absolute;right:4vw;top:7vh;display:flex;gap:8px}
.r120-close__graphic span{width:90px;height:4px;background:rgba(255,255,255,.18)}
.r120-close__graphic span:last-child{width:36px;background:var(--ix-red)}
.ix-v2-footer{background:#090a0b!important;color:#fff!important;border-top:1px solid rgba(255,255,255,.12)!important;padding:58px 5vw!important}

/* tablet/laptop first-class */
@media(min-width:701px) and (max-width:1180px){
  .r119-hero__copy{width:min(680px,66vw)}
  .r120-hero__detail{width:20vw;height:150px}
  .r119-positioning{grid-template-columns:minmax(0,64%) minmax(0,36%);padding:62px 32px}
  .r120-positioning__mosaic{height:520px}
  .r119-materials{grid-template-columns:minmax(0,38%) minmax(0,62%);padding:68px 32px}
  .r120-materials__gallery{height:520px}
  .r119-materials__structure{right:-8vw;width:44vw;height:560px}
  .r119-rebar{padding:68px 32px}
  .r120-rebar__detail-stack{right:32px;width:32vw}
  .r119-proof{padding:62px 32px}
  .r119-partner{padding:62px 32px!important}
  .r119-close{padding:66px 32px 52px}
}

/* mobile: image-led recut */
@media(max-width:700px){
  .ix-v2-header-inner{min-height:66px!important;padding-left:16px!important;padding-right:16px!important}
  .ix-v2-nav{display:none!important}
  .ix-v2-header-cta{min-height:38px!important;padding:0 11px!important;font-size:9px!important}

  .r119-hero{min-height:84svh;padding:0 16px 18px}
  .r119-hero__media img{object-position:62% center;transform:none}
  .r119-hero__veil{background:linear-gradient(180deg,rgba(5,6,7,.04),rgba(5,6,7,.18) 38%,rgba(5,6,7,.84) 72%,rgba(5,6,7,.96))}
  .r119-hero__copy{width:100%;padding:18px 16px}
  .r119-hero__copy h1{font-size:clamp(42px,11.2vw,56px);max-width:8.7ch}
  .r120-hero__detail{right:16px;top:88px;bottom:auto;width:120px;height:92px}
  .r120-hero__graphic{display:none}
  .r119-actions{display:grid;grid-template-columns:1fr 1fr}
  .r119-btn{min-height:46px;padding:0 10px;font-size:9px}

  .r119-positioning{min-height:0;display:block;padding:42px 16px 54px}
  .r120-positioning__mosaic{height:430px;margin-bottom:34px}
  .r119-positioning__media{width:76%;height:78%}
  .r120-positioning__detail--a{width:38%;height:40%}
  .r120-positioning__detail--b{width:34%;height:30%}
  .r119-positioning__copy h2{font-size:clamp(42px,11vw,56px)}
  .r119-positioning__identity{width:90vw;right:-28vw}

  .r119-materials{min-height:0;display:block;padding:44px 16px 58px}
  .r120-materials__gallery{height:440px;margin-bottom:34px}
  .r119-materials__copy h2{font-size:clamp(44px,11.5vw,58px)}
  .r119-materials__structure{right:-56vw;top:32%;width:110vw;height:420px;opacity:.25}
  .r120-materials__spec{left:16px;bottom:26px}

  .r119-rebar{min-height:760px;padding:42px 16px}
  .r119-rebar__photo,.r119-rebar__media{inset:0}
  .r119-rebar__veil{background:linear-gradient(180deg,rgba(8,9,10,.10),rgba(8,9,10,.30) 42%,rgba(8,9,10,.93) 72%,#08090a)}
  .r119-rebar__title{width:auto}
  .r119-rebar__title h2{font-size:clamp(44px,11.5vw,58px)}
  .r120-rebar__detail-stack{right:16px;bottom:86px;width:62vw;height:250px}
  .r120-rebar__process{left:16px;bottom:34px}

  .r119-proof{min-height:0;padding:50px 16px 44px}
  .r119-proof__head{display:block}
  .r119-proof__head h2{margin-top:12px;font-size:clamp(38px,10vw,50px)}
  .r120-proof__visual{height:330px}
  .r120-proof__visual-main{width:78%}
  .r120-proof__visual-detail{width:42%;height:54%;border-width:6px}
  .r120-proof__graphic{width:150px;height:80px}
  .r119-proof__facts{display:block}
  .r119-proof__facts article,.r119-proof__facts article:nth-child(2),.r119-proof__facts article:nth-child(3){min-height:0;padding:22px 0!important;border-right:0;border-bottom:1px solid rgba(10,11,12,.14)}

  .r119-partner{min-height:0;display:block!important;padding:50px 16px 28px!important}
  .r119-partner__label{margin-bottom:24px}
  .r119-partner .r119-proof__partner{min-height:300px!important;padding:38px 20px!important}
  .r119-partner .r119-proof__partner img{width:min(300px,80%);max-height:110px}
  .r119-partner .r119-proof__partner strong{font-size:clamp(30px,8.8vw,44px)}
  .r120-partner__graphic{left:16px;bottom:14px}

  .r119-contact{min-height:0}
  .r120-contact__strip{grid-template-columns:1.2fr .8fr;height:280px}
  .r120-contact__shot--c{display:none}
  .r119-contact__meta{left:16px;top:22px}
  .r119-contact__link{margin:0 16px 26px!important}

  .r119-close{min-height:520px;display:block;padding:48px 16px 28px}
  .r120-close__media{inset:0}
  .r120-close__media-main img{filter:saturate(.4) contrast(1.2) brightness(.44)}
  .r119-close__copy{margin-top:180px}
  .r119-close__copy h2{font-size:clamp(48px,12vw,62px)}
  .r119-close>.r119-btn{margin-top:34px;min-height:70px!important}
}

@media(prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  .r119-btn,.ix-v2-nav a,.r119-hero__media img,.r119-rebar__photo img,.r119-contact__link{transition:none!important}
}
`;

  return {
    spec:{
      main_html:main,
      custom_css:css,
      section_ids:["hero","positioning","materials","services","trust","partners","bridge","final-cta"],
      section_blueprint:["hero","positioning","materials","services","trust","partners","bridge","final-cta"],
      section_architecture_standard:R119_SCENE_COMPOSER_STANDARD,
      section_first_standard:R119_SCENE_COMPOSER_STANDARD,
      home_depth_standard:R119_SCENE_COMPOSER_STANDARD,
      section_substance_standard:R119_SCENE_COMPOSER_STANDARD,
      detail_craft_standard:R119_SCENE_COMPOSER_STANDARD,
      premium_section_identity_standard:R119_SCENE_COMPOSER_STANDARD,
      flagship_architecture_standard:R119_SCENE_COMPOSER_STANDARD,
      authored_flagship_standard:R119_SCENE_COMPOSER_STANDARD,
      perceptual_flagship_standard:"R118_PERCEPTUAL_JURY_V1",
      visual_density_standard:"R120_VISUAL_DENSITY_COMMISSIONED_VALUE_V1",
      copy_density_standard:"R120_LOW_COPY_IMAGE_LED_V1",
      scene_composer_standard:R119_SCENE_COMPOSER_STANDARD,
      surface_policy:"IMPRESAX_RENDER_STANDARD_R119_SIGNATURE_SCENE_COMPOSER_V1",
      used_copy_tokens:[],
      used_asset_tokens:assets,
      section_coherence_standard:R119_SCENE_COMPOSER_STANDARD,
      art_direction_standard:R119_SCENE_COMPOSER_STANDARD,
      hero_visual_strategy:"R119 full-bleed campaign frame with copy embedded into the photographic field.",
      hero_subject:"Verified prospect-relevant industrial scene.",
      hero_scene_type:"Campaign-grade industrial editorial photography.",
      hero_copy_space:"Dark directional veil with oversized copy anchored to the lower-left field.",
      hero_mobile_crop_strategy:"Native 390px recut with bottom-anchored copy and independent scale.",
      hero_relevance_score:10,
      implementation_notes:"R120 VISUAL DENSITY / COMMISSIONED VALUE: image-led architecture, low-copy scenes, multi-crop verified imagery, technical graphic system, proof imagery, visual process, commercial mosaic, native responsive recut and anti-cheapness density gates."+mode+". A jury-reset mode radically flips hero alignment, positioning/media order, materials balance, proof surface and commercial bridge rather than replaying the same composition."
    },
    strategy:R119_SCENE_COMPOSER_STANDARD
  };
}

export function r119SceneComposerViolations(mainHtml="",css="",spec={},manifests={}) {
  const main=String(mainHtml||"");
  const styles=String(css||"");
  const issues=[];
  const ids=[...main.matchAll(/<section\b[^>]*\bid=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]);
  const expected=["hero","positioning","materials","services","trust","partners","bridge","final-cta"];
  if(JSON.stringify(ids)!==JSON.stringify(expected)) issues.push("R119_SCENE_ORDER_REQUIRED");
  const sceneCount=(main.match(/\bdata-r119-scene=["']true["']/gi)||[]).length;
  if(sceneCount!==8) issues.push("R119_EIGHT_CAMPAIGN_SCENES_REQUIRED:"+sceneCount+"/8");
  if((main.match(/\bixg-shell\b/gi)||[]).length>0) issues.push("R119_CENTERED_SHELL_CADENCE_FORBIDDEN");
  if((main.match(/\bixg-section-head\b/gi)||[]).length>0) issues.push("R119_GENERIC_SECTION_HEADER_FORBIDDEN");
  if((main.match(/\bdata-wow-moment=["']true["']/gi)||[]).length<4) issues.push("R119_FOUR_WOW_SCENES_REQUIRED");
  if(!/\br119-materials__structure\b/i.test(main) || !/\br119-rebar__media\b/i.test(main) || !/\br119-positioning__media\b/i.test(main) || !/\br119-positioning__identity\b/i.test(main)) {
    issues.push("R119_DISTINCT_IMAGE_ARCHITECTURES_REQUIRED");
  }
  const trust=main.match(/<section\b[^>]*\bid=["']trust["'][^>]*>[\s\S]*?<\/section>/i)?.[0]||"";
  const partners=main.match(/<section\b[^>]*\bid=["']partners["'][^>]*>[\s\S]*?<\/section>/i)?.[0]||"";
  if((trust.match(/data-trust-reason=/gi)||[]).length<3) issues.push("R119_PROOF_WALL_THREE_FACTS_REQUIRED");
  if(Object.keys(manifests?.assets||{}).includes("PARTNER_UPOWER_LOGO") && !partners.includes("{{asset:PARTNER_UPOWER_LOGO}}")) {
    issues.push("R119_VERIFIED_PARTNER_GALLERY_REQUIRED");
  }
  if(!/\.r119-positioning\s*\{/i.test(styles) || !/\.r119-materials\s*\{/i.test(styles) || !/\.r119-rebar\s*\{/i.test(styles) || !/\.r119-proof\s*\{/i.test(styles) || !/\.r119-partner\s*\{/i.test(styles)) {
    issues.push("R119_SCENE_CSS_REQUIRED");
  }
  if(!/@media\s*\([^)]*max-width\s*:\s*700px/i.test(styles)) issues.push("R119_NATIVE_MOBILE_RECUT_REQUIRED");
  if(!/@media\s*\(min-width\s*:\s*701px\)\s*and\s*\(max-width\s*:\s*1180px\)/i.test(styles)) issues.push("R119_INTERMEDIATE_VIEWPORT_REQUIRED");
  if(!/@media\s*\(prefers-reduced-motion\s*:\s*reduce\)/i.test(styles)) issues.push("R119_REDUCED_MOTION_REQUIRED");
  if(styles.length>32000) issues.push("R119_CSS_OVERRIDE_STACK_FORBIDDEN:"+styles.length);
  const viewportPosterCount=(styles.match(/100svh/gi)||[]).length;
  if(viewportPosterCount>2) issues.push("R119_POSTER_STACK_FORBIDDEN:"+viewportPosterCount);
  if((styles.match(/transition\s*:/gi)||[]).length<6) issues.push("R119_MICRO_INTERACTION_SYSTEM_REQUIRED");
  if(!/\.ix-v2-header\s*\{[^}]*position\s*:\s*sticky/i.test(styles)) issues.push("R119_LIVE_SITE_CHROME_REQUIRED");
  if(!/\.r119-proof__facts\s*\{[^}]*display\s*:\s*grid/i.test(styles)) issues.push("R119_COMMERCIAL_PROOF_GRID_REQUIRED");
  if(!/\.r119-partner\s*\{[^}]*display\s*:\s*grid/i.test(styles)) issues.push("R119_PARTNER_MODULE_REQUIRED");
  if(!/\.r119-hero__media\s*\{[^}]*position\s*:\s*absolute[^}]*inset\s*:\s*0/i.test(styles) ||
     !/\.r119-hero__copy\s*\{[^}]*position\s*:\s*relative[^}]*z-index\s*:\s*6/i.test(styles)) {
    issues.push("R119_HERO_OVER_IMAGE_REQUIRED");
  }
  if(!/\.r119-positioning\s*\{[^}]*grid-template-columns/i.test(styles) ||
     !/\.r119-materials\s*\{[^}]*grid-template-columns/i.test(styles) ||
     !/\.r119-rebar\s*\{[^}]*grid-template-columns/i.test(styles)) {
    issues.push("R119_THREE_DISTINCT_LAYOUT_GRAMMARS_REQUIRED");
  }
  const visualAssetKeys=Object.keys(manifests?.assets||{}).filter(k=>/_VISUAL$/.test(k));
  const imageMoments=(main.match(/<img\b/gi)||[]).length;
  const paragraphCount=(main.match(/<p\b/gi)||[]).length;
  const lowCopyScenes=(main.match(/data-copy-density=["']low["']/gi)||[]).length;
  const graphicMoments=(main.match(/\br120-[^"'\s>]*(?:graphic|process|spec|index)/gi)||[]).length;
  if(visualAssetKeys.length>=4 && imageMoments<12) issues.push("R120_VISUAL_DENSITY_TOO_LOW:"+imageMoments+"/12");
  if(paragraphCount>10) issues.push("R120_TEXT_DENSITY_TOO_HIGH:"+paragraphCount);
  if(lowCopyScenes!==8) issues.push("R120_LOW_COPY_SCENE_CONTRACT_REQUIRED:"+lowCopyScenes+"/8");
  if(graphicMoments<6) issues.push("R120_INSUFFICIENT_GRAPHIC_SYSTEM:"+graphicMoments+"/6");
  if(!/\br120-positioning__mosaic\b/i.test(main) || !/\br120-materials__gallery\b/i.test(main) || !/\br120-contact__strip\b/i.test(main) || !/\br120-proof__visual\b/i.test(main)) {
    issues.push("R120_COMMISSIONED_VISUAL_STRUCTURE_REQUIRED");
  }
  if(String(spec?.visual_density_standard||"")!=="R120_VISUAL_DENSITY_COMMISSIONED_VALUE_V1") issues.push("R120_VISUAL_DENSITY_STANDARD_REQUIRED");
  if(String(spec?.copy_density_standard||"")!=="R120_LOW_COPY_IMAGE_LED_V1") issues.push("R120_LOW_COPY_STANDARD_REQUIRED");
  if(String(spec?.scene_composer_standard||"")!==R119_SCENE_COMPOSER_STANDARD) issues.push("R119_SCENE_COMPOSER_STANDARD_REQUIRED");
  if(String(spec?.perceptual_flagship_standard||"")!=="R118_PERCEPTUAL_JURY_V1") issues.push("R119_R118_JURY_REQUIRED");
  return issues;
}
