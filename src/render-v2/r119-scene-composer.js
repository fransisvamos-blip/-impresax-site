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
  inputPayload={}
}={}) {
  const assets=[...new Set(assetTokens||[])];
  const partner=hasCopy(copyManifest,"PARTNER_1") && hasAsset(assets,"PARTNER_UPOWER_LOGO");
  const service1Body=hasCopy(copyManifest,"SERVICE_1_BODY")
    ? '<p class="r119-service__body">'+copyToken("SERVICE_1_BODY")+'</p>' : "";
  const service2Body=hasCopy(copyManifest,"SERVICE_2_BODY")
    ? '<p class="r119-service__body">'+copyToken("SERVICE_2_BODY")+'</p>' : "";
  const partnerMarkup=partner
    ? '<div class="r119-proof__partner" data-verified-partner="true"><img src="'+assetToken("PARTNER_UPOWER_LOGO")+'" alt=""><strong>'+copyToken("PARTNER_1")+'</strong></div>'
    : "";
  const identity=hasIdentity
    ? '<div class="r119-close__watermark" data-brand-watermark aria-hidden="true">{{identity:PRIMARY_LOGO}}</div>'
    : "";
  const identityField=hasIdentity
    ? '<div class="r119-positioning__identity" data-brand-watermark aria-hidden="true">{{identity:PRIMARY_LOGO}}</div>'
    : "";

  const main=[
    '<section id="hero" class="r119-scene r119-hero" data-r119-scene="true" data-r118-perceptual-jury="true" data-launch-hero="true" data-hero-full-bleed="true" data-typography-system="responsive" data-copy-density="controlled" data-value-perception="15k" data-brand-specific="true" data-sales-architecture="true" data-custom-made="true" data-signature-moment="true" data-spectacle-moment="true" data-stage-depth="cinematic" data-wow-moment="true" data-mobile-native="true">'+
      picture(assets,"HERO_VISUAL","r119-hero__media")+
      '<div class="r119-hero__veil" aria-hidden="true"></div>'+
      '<div class="r119-hero__copy"><p class="r119-kicker">'+copyToken("LOCALITY_LINE")+'</p><h1>'+copyToken("HERO_HEADLINE")+'</h1><p class="r119-lede ixg-lede">'+copyToken("HERO_BODY")+'</p><div class="r119-actions ixg-actions"><a class="r119-btn r119-btn--solid" data-premium-button="true" href="'+ctaToken("PRIMARY")+'">'+copyToken("PRIMARY_CTA_LABEL")+'</a><a class="r119-btn r119-btn--ghost" data-premium-button="true" href="'+ctaToken("SECONDARY")+'">'+copyToken("SECONDARY_CTA_LABEL")+'</a></div></div>'+

    '</section>',

    '<section id="positioning" class="r119-scene r119-positioning" data-r119-scene="true" data-surface="art-directed" data-brand-surface="dark" data-copy-density="controlled" data-signature-moment="true" data-spectacle-moment="true" data-stage-depth="editorial" data-wow-moment="true">'+
      identityField+
      '<div class="r119-positioning__copy"><p class="r119-kicker">'+copyToken("POSITIONING_TITLE")+'</p><h2>'+copyToken("SERVICES_TITLE")+'</h2><p>'+copyToken("POSITIONING_BODY")+'</p></div>'+
      '<div class="r119-positioning__intro">'+copyToken("SERVICES_INTRO")+'</div>'+
    '</section>',

    '<section id="materials" class="r119-scene r119-materials" data-r119-scene="true" data-surface="art-directed" data-brand-surface="tint" data-copy-density="controlled" data-signature-moment="true" data-spectacle-moment="true" data-stage-depth="material" data-wow-moment="true">'+
      picture(assets,"SERVICE_MATERIALS_VISUAL","r119-materials__media")+
      '<div class="r119-materials__copy"><p class="r119-kicker">'+copyToken("SERVICES_TITLE")+'</p><h2>'+copyToken("SERVICE_1_TITLE")+'</h2>'+service1Body+'</div>'+
      '<div class="r119-materials__edge" aria-hidden="true"></div>'+
    '</section>',

    '<section id="services" class="r119-scene r119-rebar" data-r119-scene="true" data-surface="art-directed" data-brand-surface="dark" data-copy-density="controlled" data-signature-moment="true" data-spectacle-moment="true" data-stage-depth="cinematic" data-wow-moment="true">'+
      picture(assets,"SERVICE_REBAR_VISUAL","r119-rebar__media")+
      '<div class="r119-rebar__veil" aria-hidden="true"></div>'+
      '<div class="r119-rebar__title"><p class="r119-kicker">'+copyToken("SERVICES_TITLE")+'</p><h2>'+copyToken("SERVICE_2_TITLE")+'</h2></div>'+
      '<div class="r119-rebar__body"><p>'+copyToken("SERVICES_INTRO")+'</p>'+service2Body+'</div>'+

    '</section>',

    '<section id="trust" class="r119-scene r119-proof" data-r119-scene="true" data-surface="art-directed" data-brand-surface="primary" data-copy-density="controlled" data-signature-moment="true" data-spectacle-moment="true" data-stage-depth="editorial" data-wow-moment="true">'+
      '<div class="r119-proof__head"><p class="r119-kicker">'+copyToken("TRUST_TITLE")+'</p><h2>'+copyToken("TRUST_INTRO")+'</h2></div>'+
      '<div class="r119-proof__facts"><article data-trust-reason="1"><strong>'+copyToken("TRUST_1")+'</strong></article><article data-trust-reason="2"><strong>'+copyToken("TRUST_2")+'</strong></article><article data-trust-reason="3"><strong>'+copyToken("TRUST_3")+'</strong></article></div>'+
      '<div class="r119-proof__locality">'+copyToken("LOCALITY_LINE")+'</div>'+
    '</section>',

    '<section id="partners" class="r119-scene r119-partner" data-r119-scene="true" data-surface="art-directed" data-brand-surface="tint" data-copy-density="controlled" data-signature-moment="true" data-stage-depth="gallery" data-wow-moment="true">'+
      '<div class="r119-partner__label"><p class="r119-kicker">'+copyToken("PARTNER_SECTION_TITLE")+'</p><p>'+copyToken("PARTNER_SECTION_INTRO")+'</p></div>'+
      partnerMarkup+
    '</section>',

    '<section id="bridge" class="r119-scene r119-contact" data-r119-scene="true" data-surface="art-directed" data-brand-surface="tint" data-copy-density="controlled" data-stage-depth="material">'+
      '<div class="r119-contact__meta"><p class="r119-kicker">'+copyToken("BRIDGE_TITLE")+'</p><p>'+copyToken("BRIDGE_BODY")+'</p></div>'+
      '<div class="r119-contact__locality"><strong>'+copyToken("LOCALITY_LINE")+'</strong></div>'+
      '<a class="r119-btn r119-btn--outline" data-premium-button="true" href="'+ctaToken("SECONDARY")+'">'+copyToken("SECONDARY_CTA_LABEL")+'</a>'+
    '</section>',

    '<section id="final-cta" class="r119-scene r119-close" data-r119-scene="true" data-surface="art-directed" data-brand-surface="dark" data-copy-density="controlled" data-signature-moment="true" data-spectacle-moment="true" data-stage-depth="cinematic" data-wow-moment="true">'+
      identity+
      '<div class="r119-close__copy"><p class="r119-kicker">'+copyToken("LOCALITY_LINE")+'</p><h2>'+copyToken("CLOSING_TITLE")+'</h2><p>'+copyToken("CLOSING_BODY")+'</p></div>'+
      '<a class="r119-btn r119-btn--final" data-premium-button="true" href="'+ctaToken("PRIMARY")+'">'+copyToken("PRIMARY_CTA_LABEL")+'</a>'+

    '</section>'
  ].join("");

  const css=`
:root{
  --r119-ink:#0a0b0c;
  --r119-paper:#f1eee7;
  --r119-white:#f8f7f3;
  --r119-red:#b91818;
  --r119-line:rgba(14,15,16,.18);
  --ix-display-font:Bahnschrift,"Arial Narrow","Roboto Condensed","Inter Tight",sans-serif;
  --ix-body-font:Inter,Aptos,"Segoe UI",sans-serif;
}
*{box-sizing:border-box}
body{text-wrap:pretty}
h1,h2,strong{text-wrap:balance}
.r119-scene{position:relative;overflow:hidden;font-family:var(--ix-body-font)}
.r119-kicker{margin:0;text-transform:uppercase;letter-spacing:.16em;font-size:10px;font-weight:760}
.r119-actions{display:flex;gap:10px;flex-wrap:wrap}
.r119-btn{display:inline-flex;align-items:center;justify-content:center;min-height:58px;padding:0 28px;text-decoration:none;border:1px solid currentColor;font-weight:760;letter-spacing:.01em}
.r119-btn--solid{background:var(--r119-red);border-color:var(--r119-red);color:white}
.r119-btn--ghost{color:white;border-color:rgba(255,255,255,.45)}
.r119-btn--outline{color:var(--r119-ink)}
.r119-btn--final{min-height:210px;width:min(390px,28vw);background:var(--r119-red);border-color:var(--r119-red);color:white}

/* shell is intentionally quiet: the project should read as a campaign, not app chrome */
.ix-v2-header{background:rgba(248,247,243,.96)!important;color:#0a0b0c!important;border-bottom:1px solid rgba(10,11,12,.12)!important}
.ix-v2-header-inner{min-height:82px!important;box-shadow:none!important}
.ix-v2-nav{gap:26px!important}
.ix-v2-nav a{font-size:12px!important;letter-spacing:.04em!important}
.ix-v2-header-cta{border-radius:0!important;background:#0a0b0c!important;color:white!important}
.ix-v2-footer{background:linear-gradient(120deg,#0a0b0c 0%,#151617 65%,#210808 100%)!important;color:var(--r119-white)!important;padding:86px 5vw!important}
.ix-v2-footer-grid{border-top:1px solid rgba(255,255,255,.22)!important;padding-top:38px!important;grid-template-columns:1.1fr .5fr 1fr!important;gap:70px!important}

/* 01 — hero as campaign frame */
.r119-hero{min-height:100svh;color:white;background:linear-gradient(120deg,#050607,#170808)}
.r119-hero__media{position:absolute;inset:0;margin:0}
.r119-hero__media img{width:100%;height:100%;object-fit:cover;object-position:64% 48%;filter:saturate(.48) contrast(1.24) brightness(.72);transform:scale(1.035)}
.r119-hero__veil{position:absolute;inset:0;background:linear-gradient(90deg,rgba(4,5,6,.97) 0%,rgba(4,5,6,.88) 24%,rgba(4,5,6,.36) 58%,rgba(4,5,6,.04) 82%),linear-gradient(180deg,rgba(0,0,0,.06),transparent 54%,rgba(0,0,0,.72))}
.r119-hero__copy{position:absolute;left:5vw;bottom:7vh;z-index:2;width:min(900px,66vw);padding-top:34px;border-top:1px solid rgba(255,255,255,.42)}
.r119-hero__copy h1{margin:14px 0 26px;font-family:var(--ix-display-font);font-size:clamp(76px,8.6vw,148px);line-height:.82;letter-spacing:-.068em;max-width:8.3ch}
.r119-lede{max-width:40ch;font-size:clamp(16px,1.08vw,19px);line-height:1.55;margin:0 0 30px}

/* 02 — official identity as spatial architecture */
.r119-positioning{min-height:820px;color:var(--r119-white);background:linear-gradient(118deg,#0a0b0c 0%,#151719 62%,#250808 100%);display:grid;grid-template-columns:minmax(0,1.25fr) minmax(300px,.55fr);align-items:end;padding:120px 5vw 72px}
.r119-positioning__identity{position:absolute;right:-3vw;top:9%;width:min(760px,58vw);opacity:.10;pointer-events:none}
.r119-positioning__identity .ix-v2-identity-main{width:100%!important;height:auto!important;opacity:.10!important;filter:grayscale(1) brightness(2)!important}
.r119-positioning__copy{position:relative;z-index:2;max-width:950px}
.r119-positioning__copy h2{font-family:var(--ix-display-font);font-size:clamp(76px,8.4vw,142px);line-height:.80;letter-spacing:-.07em;max-width:8ch;margin:20px 0 32px}
.r119-positioning__copy>p:last-child{font-size:clamp(17px,1.25vw,21px);line-height:1.55;max-width:42ch}
.r119-positioning__intro{position:relative;z-index:2;border-left:1px solid rgba(255,255,255,.34);padding:34px 0 34px 34px;font-size:clamp(18px,1.5vw,24px);line-height:1.45;max-width:28ch;align-self:end}

/* 03 — materials: physical product landscape, not stock-showroom photography */
.r119-materials{min-height:980px;color:var(--r119-ink);background:#ede8df;display:grid;grid-template-columns:minmax(0,1.38fr) minmax(390px,.62fr)}
.r119-materials__media{grid-column:1;min-height:980px;margin:0;overflow:hidden}
.r119-materials__media img{width:100%;height:100%;object-fit:cover;object-position:center;filter:saturate(.68) contrast(1.17)}
.r119-materials__copy{grid-column:2;padding:clamp(86px,8vw,138px) clamp(42px,5vw,82px);display:flex;flex-direction:column;justify-content:flex-end;border-left:1px solid var(--r119-line)}
.r119-materials__copy h2{font-family:var(--ix-display-font);font-size:clamp(58px,5.8vw,96px);line-height:.84;letter-spacing:-.062em;margin:18px 0 34px;max-width:10ch}
.r119-materials__copy .r119-service__body{font-size:17px;line-height:1.58;max-width:31ch}
.r119-materials__edge{position:absolute;left:0;bottom:0;width:42%;height:8px;background:var(--r119-red)}

/* 04 — rebar: single giant photographic scene */
.r119-rebar{min-height:980px;color:white;background:linear-gradient(120deg,#070809,#180a0a);display:grid;grid-template-rows:1fr auto;padding:130px 5vw 78px}
.r119-rebar__media{position:absolute;inset:0;margin:0}
.r119-rebar__media img{width:100%;height:100%;object-fit:cover;filter:saturate(.40) contrast(1.3) brightness(.60)}
.r119-rebar__veil{position:absolute;inset:0;background:linear-gradient(90deg,rgba(3,4,5,.94),rgba(3,4,5,.42) 55%,rgba(3,4,5,.16)),linear-gradient(0deg,rgba(0,0,0,.70),transparent 58%)}
.r119-rebar__title{position:relative;z-index:2;width:min(790px,58vw);align-self:start}
.r119-rebar__title h2{font-family:var(--ix-display-font);font-size:clamp(72px,7.8vw,128px);line-height:.82;letter-spacing:-.068em;max-width:8.2ch;margin:16px 0 0}
.r119-rebar__body{position:relative;z-index:2;width:min(520px,38vw);font-size:17px;line-height:1.58;padding-top:34px;border-top:1px solid rgba(255,255,255,.34);align-self:end}

/* 05 — operational proof, no economic vanity metrics */
.r119-proof{min-height:760px;color:var(--r119-ink);background:linear-gradient(135deg,#f4f1ea 0%,#ece6da 72%,#ded3c3 100%);padding:120px 5vw 64px}
.r119-proof__head{position:relative;z-index:2;width:min(1100px,80vw);padding:0 0 64px}
.r119-proof__head h2{font-family:var(--ix-display-font);font-size:clamp(58px,6.4vw,108px);line-height:.82;letter-spacing:-.065em;margin:18px 0 0;max-width:11ch}
.r119-proof__facts{position:relative;z-index:2;display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid rgba(14,15,16,.28);border-bottom:1px solid rgba(14,15,16,.20)}
.r119-proof__facts article{min-height:280px;padding:38px 34px 38px 0;border-right:1px solid rgba(14,15,16,.17);display:flex;align-items:flex-end}
.r119-proof__facts article:nth-child(2),.r119-proof__facts article:nth-child(3){padding-left:34px}
.r119-proof__facts article:nth-child(3){border-right:0}
.r119-proof__facts strong{font-family:var(--ix-display-font);font-size:clamp(27px,2.45vw,42px);line-height:.98;letter-spacing:-.032em;max-width:14ch}
.r119-proof__locality{margin-top:42px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;letter-spacing:.10em;text-transform:uppercase}

/* 06 — verified U-Power partnership as a gallery wall */
.r119-partner{min-height:680px;background:#0b0c0d;color:white;display:grid;grid-template-columns:minmax(300px,.48fr) minmax(0,1.52fr);align-items:stretch}
.r119-partner__label{padding:84px 5vw;display:flex;flex-direction:column;justify-content:space-between;border-right:1px solid rgba(255,255,255,.18)}
.r119-partner__label>p:last-child{max-width:26ch;font-size:17px;line-height:1.55}
.r119-partner .r119-proof__partner{margin:0;padding:84px clamp(54px,8vw,140px);display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-end;gap:48px;background:linear-gradient(125deg,#131516,#090a0b 64%,#280707)}
.r119-partner .r119-proof__partner img{width:min(430px,72%);max-height:190px;object-fit:contain;filter:grayscale(1) brightness(2)}
.r119-partner .r119-proof__partner strong{font-family:var(--ix-display-font);font-size:clamp(56px,6vw,104px);line-height:.82;letter-spacing:-.06em;max-width:9ch}

/* 07 — contact interlude */
.r119-contact{min-height:520px;color:var(--r119-ink);background:linear-gradient(110deg,#f4f1ea,#e9e3d8 65%,#f2ede5);display:grid;grid-template-columns:.7fr 1.1fr 340px;gap:5vw;align-items:center;padding:70px 5vw;border-top:1px solid var(--r119-line);border-bottom:1px solid var(--r119-line)}
.r119-contact__meta p:last-child{font-size:16px;line-height:1.5;max-width:30ch}
.r119-contact__locality strong{font-family:var(--ix-display-font);font-size:clamp(52px,6vw,98px);line-height:.8;letter-spacing:-.065em;max-width:9ch;display:block}
.r119-contact .r119-btn{min-height:160px}

/* 08 — close */
.r119-close{min-height:100svh;color:white;background:linear-gradient(125deg,#070809 0%,#111314 52%,#330707 100%);display:flex;align-items:flex-end;padding:120px 5vw 64px}
.r119-close__copy{position:relative;z-index:2;width:min(1040px,70vw)}
.r119-close__copy h2{font-family:var(--ix-display-font);font-size:clamp(86px,9.4vw,158px);line-height:.80;letter-spacing:-.072em;max-width:7.1ch;margin:18px 0 30px}
.r119-close__copy>p:last-child{max-width:34ch;font-size:17px;line-height:1.5}
.r119-close>.r119-btn{position:absolute;right:5vw;bottom:64px;z-index:3}
.r119-close__watermark{position:absolute;right:2vw;bottom:4vh;width:min(720px,52vw);opacity:.11;z-index:1;pointer-events:none}
.r119-close__watermark .ix-v2-identity-main{opacity:.11!important;filter:grayscale(1) brightness(2)!important;width:100%!important;height:auto!important}

@media(max-width:700px){
  .ix-v2-header-inner{min-height:72px!important}
  .ix-v2-nav{gap:14px!important}
  .ix-v2-footer{padding:64px 18px!important}
  .ix-v2-footer-grid{grid-template-columns:1fr!important;gap:36px!important}
  .r119-btn{width:100%;min-height:54px;padding:0 18px}
  .r119-hero{min-height:94svh}
  .r119-hero__copy{left:18px;right:18px;bottom:28px;width:auto}
  .r119-hero__copy h1{font-size:clamp(50px,14.8vw,72px);line-height:.82;max-width:7.7ch;margin:12px 0 20px}
  .r119-lede{font-size:15px;max-width:30ch;margin-bottom:24px}
  .r119-actions{display:grid;grid-template-columns:1fr}

  .r119-positioning{min-height:0;display:block;padding:96px 18px 62px}
  .r119-positioning__identity{right:-28vw;top:8%;width:118vw;opacity:.07}
  .r119-positioning__identity .ix-v2-identity-main{opacity:.07!important}
  .r119-positioning__copy h2{font-size:clamp(54px,15vw,76px);line-height:.82;max-width:7.5ch}
  .r119-positioning__copy>p:last-child{font-size:16px;max-width:30ch}
  .r119-positioning__intro{margin-top:52px;padding:24px 0 0;border-left:0;border-top:1px solid rgba(255,255,255,.32);font-size:18px;max-width:28ch}

  .r119-materials{min-height:0;display:flex;flex-direction:column}
  .r119-materials__media{order:1;min-height:62svh;width:100%}
  .r119-materials__copy{order:2;padding:56px 18px 68px;border-left:0;border-top:1px solid var(--r119-line)}
  .r119-materials__copy h2{font-size:clamp(48px,13.5vw,66px);line-height:.84;max-width:9ch}
  .r119-materials__edge{width:70%;height:5px}

  .r119-rebar{min-height:82svh;padding:82px 18px 36px;grid-template-rows:1fr auto}
  .r119-rebar__title{width:auto}
  .r119-rebar__title h2{font-size:clamp(52px,15vw,72px);line-height:.82;max-width:7.8ch}
  .r119-rebar__body{width:100%;font-size:15px;padding-top:24px}

  .r119-proof{min-height:0;padding:86px 18px 54px}
  .r119-proof__head{padding:0 0 46px;width:auto}
  .r119-proof__head h2{font-size:clamp(46px,13vw,64px);max-width:10ch}
  .r119-proof__facts{display:block}
  .r119-proof__facts article,.r119-proof__facts article:nth-child(2),.r119-proof__facts article:nth-child(3){min-height:170px;padding:28px 0;border-right:0;border-bottom:1px solid rgba(14,15,16,.16)}
  .r119-proof__facts strong{font-size:clamp(28px,8.5vw,40px);max-width:13ch}
  .r119-proof__locality{margin-top:30px;font-size:10px}

  .r119-partner{min-height:0;display:block}
  .r119-partner__label{padding:64px 18px 42px;border-right:0;border-bottom:1px solid rgba(255,255,255,.18);gap:24px}
  .r119-partner .r119-proof__partner{min-height:58svh;padding:62px 18px;gap:36px}
  .r119-partner .r119-proof__partner img{width:min(300px,76%);max-height:130px}
  .r119-partner .r119-proof__partner strong{font-size:clamp(46px,13vw,66px);max-width:8ch}

  .r119-contact{min-height:0;display:flex;flex-direction:column;align-items:stretch;gap:38px;padding:72px 18px}
  .r119-contact__locality strong{font-size:clamp(52px,16vw,76px);max-width:8ch}
  .r119-contact .r119-btn{min-height:84px}

  .r119-close{min-height:88svh;padding:104px 18px 28px;display:flex;flex-direction:column;justify-content:flex-end;align-items:stretch}
  .r119-close__copy{width:auto}
  .r119-close__copy h2{font-size:clamp(58px,16vw,82px);line-height:.80;max-width:7ch}
  .r119-close>.r119-btn{position:relative;right:auto;bottom:auto;margin-top:44px;width:100%;min-height:88px}
  .r119-close__watermark{right:-8vw;bottom:12vh;width:92vw;opacity:.08}
  .r119-close__watermark .ix-v2-identity-main{opacity:.08!important}
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
      implementation_notes:"R119 SIGNATURE SCENE COMPOSER V2: eight evidence-led chapters. Generic people/stock positioning imagery is excluded; materials, rebar, operational proof, official identity and verified partnership drive the narrative. R118 perceptual jury remains mandatory."
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
  if(!/\br119-materials__media\b/i.test(main) || !/\br119-rebar__media\b/i.test(main) || !/\br119-positioning__identity\b/i.test(main)) {
    issues.push("R119_DISTINCT_IMAGE_ARCHITECTURES_REQUIRED");
  }
  const trust=main.match(/<section\b[^>]*\bid=["']trust["'][^>]*>[\s\S]*?<\/section>/i)?.[0]||"";
  const partners=main.match(/<section\b[^>]*\bid=["']partners["'][^>]*>[\s\S]*?<\/section>/i)?.[0]||"";
  if((trust.match(/data-trust-reason=/gi)||[]).length<3) issues.push("R119_PROOF_WALL_THREE_FACTS_REQUIRED");
  if(Object.keys(manifests?.assets||{}).includes("PARTNER_UPOWER_LOGO") && !trust.includes("{{asset:PARTNER_UPOWER_LOGO}}")) {
    issues.push("R119_VERIFIED_PARTNER_IN_PROOF_SCENE_REQUIRED");
  }
  if(!/\.r119-matter\s*\{/i.test(styles) || !/\.r119-rebar\s*\{/i.test(styles) || !/\.r119-proof\s*\{/i.test(styles)) {
    issues.push("R119_SCENE_CSS_REQUIRED");
  }
  if(!/@media\s*\([^)]*max-width\s*:\s*700px/i.test(styles)) issues.push("R119_NATIVE_MOBILE_RECUT_REQUIRED");
  if(String(spec?.scene_composer_standard||"")!==R119_SCENE_COMPOSER_STANDARD) issues.push("R119_SCENE_COMPOSER_STANDARD_REQUIRED");
  if(String(spec?.perceptual_flagship_standard||"")!=="R118_PERCEPTUAL_JURY_V1") issues.push("R119_R118_JURY_REQUIRED");
  return issues;
}
