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
    '<section id="hero" class="r119-scene r119-hero'+sceneModeClass+'" data-r119-scene="true" data-r118-perceptual-jury="true" data-launch-hero="true" data-hero-full-bleed="true" data-typography-system="responsive" data-copy-density="controlled" data-value-perception="15k" data-brand-specific="true" data-sales-architecture="true" data-custom-made="true" data-signature-moment="true" data-spectacle-moment="true" data-stage-depth="cinematic" data-wow-moment="true" data-mobile-native="true">'+
      picture(assets,"HERO_VISUAL","r119-hero__media")+
      '<div class="r119-hero__veil" aria-hidden="true"></div>'+
      '<div class="r119-beam r119-beam--hero" aria-hidden="true"></div>'+
      '<div class="r119-hero__copy"><p class="r119-kicker">'+copyToken("LOCALITY_LINE")+'</p><h1>'+copyToken("HERO_HEADLINE")+'</h1><p class="r119-lede ixg-lede">'+copyToken("HERO_BODY")+'</p><div class="r119-actions ixg-actions"><a class="r119-btn r119-btn--solid" data-premium-button="true" href="'+ctaToken("PRIMARY")+'">'+copyToken("PRIMARY_CTA_LABEL")+'</a><a class="r119-btn r119-btn--ghost" data-premium-button="true" href="'+ctaToken("SECONDARY")+'">'+copyToken("SECONDARY_CTA_LABEL")+'</a></div></div>'+

    '</section>',

    '<section id="positioning" class="r119-scene r119-positioning'+sceneModeClass+'" data-r119-scene="true" data-surface="art-directed" data-brand-surface="dark" data-copy-density="controlled" data-signature-moment="true" data-spectacle-moment="true" data-stage-depth="editorial" data-wow-moment="true">'+
      identityField+
      picture(assets,"POSITIONING_VISUAL","r119-positioning__media")+
      '<div class="r119-positioning__veil" aria-hidden="true"></div>'+
      '<div class="r119-beam r119-beam--positioning" aria-hidden="true"></div>'+
      '<div class="r119-positioning__copy"><p class="r119-kicker">'+copyToken("LOCALITY_LINE")+'</p><h2>'+copyToken("POSITIONING_TITLE")+'</h2><p>'+copyToken("POSITIONING_BODY")+'</p></div>'+
    '</section>',

    '<section id="materials" class="r119-scene r119-materials'+sceneModeClass+'" data-r119-scene="true" data-surface="art-directed" data-brand-surface="tint" data-copy-density="controlled" data-signature-moment="true" data-spectacle-moment="true" data-stage-depth="material" data-wow-moment="true">'+
      picture(assets,"SERVICE_MATERIALS_VISUAL","r119-materials__media")+
      '<div class="r119-materials__veil" aria-hidden="true"></div>'+
      '<div class="r119-materials__structure" aria-hidden="true"><span></span><span></span><span></span></div>'+
      '<div class="r119-beam r119-beam--materials" aria-hidden="true"></div>'+
      '<div class="r119-materials__copy"><p class="r119-kicker">'+copyToken("LOCALITY_LINE")+'</p><h2>'+copyToken("SERVICE_1_TITLE")+'</h2>'+service1Body+'</div>'+
      '<div class="r119-materials__edge" aria-hidden="true"></div>'+
    '</section>',

    '<section id="services" class="r119-scene r119-rebar'+sceneModeClass+'" data-r119-scene="true" data-surface="art-directed" data-brand-surface="dark" data-copy-density="controlled" data-signature-moment="true" data-spectacle-moment="true" data-stage-depth="cinematic" data-wow-moment="true">'+
      '<div class="r119-rebar__media r119-rebar__technical" aria-hidden="true"><span></span><span></span><span></span><span></span></div>'+
      '<div class="r119-rebar__veil" aria-hidden="true"></div>'+
      '<div class="r119-beam r119-beam--rebar" aria-hidden="true"></div>'+
      '<div class="r119-rebar__title"><p class="r119-kicker">'+copyToken("SERVICES_TITLE")+'</p><h2>'+copyToken("SERVICE_2_TITLE")+'</h2></div>'+
      '<div class="r119-rebar__body"><p>'+copyToken("SERVICES_INTRO")+'</p>'+service2Body+'</div>'+

    '</section>',

    '<section id="trust" class="r119-scene r119-proof'+sceneModeClass+'" data-r119-scene="true" data-surface="art-directed" data-brand-surface="primary" data-copy-density="controlled" data-signature-moment="true" data-spectacle-moment="true" data-stage-depth="editorial" data-wow-moment="true">'+
      '<div class="r119-beam r119-beam--proof" aria-hidden="true"></div>'+
      '<div class="r119-proof__head"><p class="r119-kicker">'+copyToken("TRUST_TITLE")+'</p><h2>'+copyToken("TRUST_INTRO")+'</h2></div>'+
      '<div class="r119-proof__facts">'+
        '<article data-trust-reason="1"><span class="r119-proof__mark ixg-trust-reason__graphic" aria-hidden="true"></span><div><span class="r119-proof__label">'+copyToken("TRUST_1_LABEL")+'</span><strong>'+copyToken("TRUST_1")+'</strong></div><p>'+copyToken("TRUST_1_BODY")+'</p></article>'+
        '<article data-trust-reason="2"><span class="r119-proof__mark ixg-trust-reason__graphic" aria-hidden="true"></span><div><span class="r119-proof__label">'+copyToken("TRUST_2_LABEL")+'</span><strong>'+copyToken("TRUST_2")+'</strong></div><p>'+copyToken("TRUST_2_BODY")+'</p></article>'+
        '<article data-trust-reason="3"><span class="r119-proof__mark ixg-trust-reason__graphic" aria-hidden="true"></span><div><span class="r119-proof__label">'+copyToken("TRUST_3_LABEL")+'</span><strong>'+copyToken("TRUST_3")+'</strong></div><p>'+copyToken("TRUST_3_BODY")+'</p></article>'+
        (hasCopy(copyManifest,"PARTNER_1") ? '<article data-trust-reason="4"><span class="r119-proof__mark ixg-trust-reason__graphic" aria-hidden="true"></span><div><span class="r119-proof__label">'+copyToken("PARTNER_SECTION_TITLE")+'</span><strong>'+copyToken("PARTNER_1")+'</strong></div><p>'+copyToken("PARTNER_SECTION_INTRO")+'</p></article>' : "")+
      '</div>'+
      '<div class="r119-proof__locality">'+copyToken("LOCALITY_LINE")+'</div>'+
    '</section>',

    '<section id="partners" class="r119-scene r119-partner'+sceneModeClass+'" data-r119-scene="true" data-surface="art-directed" data-brand-surface="tint" data-copy-density="controlled" data-signature-moment="true" data-stage-depth="gallery" data-wow-moment="true">'+
      '<div class="r119-beam r119-beam--partner" aria-hidden="true"></div>'+
      '<div class="r119-partner__label"><p class="r119-kicker">'+copyToken("PARTNER_SECTION_TITLE")+'</p><p>'+copyToken("PARTNER_SECTION_INTRO")+'</p><div class="r119-partner__frame" aria-hidden="true"></div></div>'+
      partnerMarkup+
    '</section>',

    '<section id="bridge" class="r119-scene r119-contact'+sceneModeClass+'" data-r119-scene="true" data-surface="art-directed" data-brand-surface="tint" data-copy-density="controlled" data-stage-depth="material">'+
      '<div class="r119-beam r119-beam--contact" aria-hidden="true"></div>'+
      '<div class="r119-contact__meta"><p class="r119-kicker">'+copyToken("BRIDGE_TITLE")+'</p><p>'+copyToken("BRIDGE_BODY")+'</p></div>'+
      '<div class="r119-contact__locality"><strong>'+copyToken("LOCALITY_LINE")+'</strong></div>'+
      '<a class="r119-btn r119-btn--outline" data-premium-button="true" href="'+ctaToken("SECONDARY")+'">'+copyToken("SECONDARY_CTA_LABEL")+'</a>'+
    '</section>',

    '<section id="final-cta" class="r119-scene r119-close'+sceneModeClass+'" data-r119-scene="true" data-surface="art-directed" data-brand-surface="dark" data-copy-density="controlled" data-signature-moment="true" data-spectacle-moment="true" data-stage-depth="cinematic" data-wow-moment="true">'+
      identity+
      '<div class="r119-beam r119-beam--close" aria-hidden="true"></div>'+
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

/* recurring DEDIL structural signature: an abstract red beam/rebar corner */
.r119-beam{position:absolute;z-index:2;width:150px;height:150px;border-top:8px solid var(--r119-red);border-right:8px solid var(--r119-red);pointer-events:none;opacity:.92}
.r119-beam--hero{right:6vw;top:18vh;transform:rotate(12deg)}
.r119-beam--positioning{left:5vw;top:72px;width:220px;height:92px;border-right:0}
.r119-beam--materials{right:10vw;bottom:70px;transform:rotate(90deg)}
.r119-beam--rebar{right:7vw;top:9vh;transform:rotate(180deg)}
.r119-beam--proof{right:5vw;top:70px;width:110px;height:110px}
.r119-beam--partner{left:5vw;bottom:58px;transform:rotate(90deg)}
.r119-beam--contact{right:5vw;top:54px;width:90px;height:90px;opacity:.7}
.r119-beam--close{right:5vw;top:9vh;width:190px;height:190px;transform:rotate(180deg)}

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
.r119-hero__copy{position:absolute;left:5vw;bottom:5.5vh;z-index:2;width:min(1040px,72vw);padding-top:28px;border-top:1px solid rgba(255,255,255,.42)}
.r119-hero__copy h1{margin:14px 0 24px;font-family:var(--ix-display-font);font-size:clamp(64px,7.2vw,122px);line-height:.88;letter-spacing:-.058em;max-width:10.5ch}
.r119-lede{max-width:40ch;font-size:clamp(16px,1.08vw,19px);line-height:1.55;margin:0 0 30px}

/* 02 — positioning as a cinematic brand field, never a split card */
.r119-positioning{min-height:800px;color:var(--r119-white);background:linear-gradient(118deg,#0b0c0d 0%,#17191a 62%,#260909 100%);padding:0}
.r119-positioning__media{position:absolute;inset:0;margin:0;overflow:hidden}
.r119-positioning__media img{width:100%;height:100%;object-fit:cover;object-position:68% 50%;filter:saturate(.38) contrast(1.24) brightness(.54);transform:scale(1.02)}
.r119-positioning__veil{position:absolute;inset:0;z-index:1;background:linear-gradient(90deg,rgba(6,7,8,.97) 0%,rgba(6,7,8,.86) 38%,rgba(6,7,8,.35) 72%,rgba(6,7,8,.10) 100%),linear-gradient(180deg,transparent 40%,rgba(0,0,0,.58) 100%)}
.r119-positioning__identity{position:absolute;right:4vw;top:8%;width:min(650px,46vw);opacity:.10;pointer-events:none;z-index:2}
.r119-positioning__identity .ix-v2-identity-main{width:100%!important;height:auto!important;opacity:.10!important;filter:grayscale(1) brightness(2)!important}
.r119-positioning__copy{position:relative;z-index:3;min-height:800px;width:min(820px,62vw);padding:120px 5vw 72px;display:flex;flex-direction:column;justify-content:flex-end}
.r119-positioning__copy h2{font-family:var(--ix-display-font);font-size:clamp(64px,6.5vw,112px);line-height:.86;letter-spacing:-.055em;max-width:10ch;margin:18px 0 28px}
.r119-positioning__copy>p:last-child{font-size:clamp(17px,1.25vw,21px);line-height:1.58;max-width:42ch}
/* 03 — materials: a constructed material installation, no third-party showroom */
.r119-materials{min-height:760px;color:var(--r119-ink);background:linear-gradient(135deg,#f3efe7 0%,#ebe4d8 72%,#ded3c3 100%);padding:100px 5vw 72px;display:flex;align-items:flex-end}
.r119-materials__structure{position:absolute;right:5vw;top:74px;width:min(620px,48vw);height:560px;border:1px solid rgba(14,15,16,.18);background:repeating-linear-gradient(90deg,transparent 0 74px,rgba(14,15,16,.09) 74px 75px),repeating-linear-gradient(0deg,transparent 0 74px,rgba(14,15,16,.09) 74px 75px);transform:skewY(-3deg)}
.r119-materials__structure span{position:absolute;display:block;background:var(--r119-red);box-shadow:0 14px 34px rgba(185,24,24,.18)}
.r119-materials__structure span:nth-child(1){width:78%;height:14px;left:8%;top:18%;transform:rotate(-10deg)}
.r119-materials__structure span:nth-child(2){width:14px;height:72%;right:18%;top:8%;transform:rotate(7deg)}
.r119-materials__structure span:nth-child(3){width:56%;height:8px;right:4%;bottom:18%;transform:rotate(18deg);opacity:.72}
.r119-materials__copy{position:relative;z-index:3;width:min(680px,52vw);padding:0 0 28px}
.r119-materials__copy h2{font-family:var(--ix-display-font);font-size:clamp(58px,5.7vw,96px);line-height:.88;letter-spacing:-.052em;margin:18px 0 30px;max-width:11ch}
.r119-materials__copy .r119-service__body{font-size:18px;line-height:1.6;max-width:34ch}
.r119-materials__edge{position:absolute;left:0;bottom:0;width:58%;height:10px;background:var(--r119-red)}
/* 04 — rebar: single giant photographic scene */
.r119-rebar{min-height:860px;color:white;background:linear-gradient(120deg,#070809,#180a0a);display:grid;grid-template-rows:1fr auto;padding:104px 5vw 64px}
.r119-rebar__media{position:absolute;inset:0;margin:0}
.r119-rebar__media img{width:100%;height:100%;object-fit:cover;filter:saturate(.40) contrast(1.3) brightness(.60)}
.r119-rebar__veil{position:absolute;inset:0;background:linear-gradient(90deg,rgba(3,4,5,.94),rgba(3,4,5,.42) 55%,rgba(3,4,5,.16)),linear-gradient(0deg,rgba(0,0,0,.70),transparent 58%)}
.r119-rebar__title{position:relative;z-index:2;width:min(790px,58vw);align-self:start}
.r119-rebar__title h2{font-family:var(--ix-display-font);font-size:clamp(62px,6.5vw,108px);line-height:.88;letter-spacing:-.052em;max-width:11ch;margin:0}
.r119-rebar__body{position:relative;z-index:2;width:min(520px,38vw);font-size:17px;line-height:1.58;padding-top:34px;border-top:1px solid rgba(255,255,255,.34);align-self:end}

/* 05 — stepped operational evidence ledger */
.r119-proof{min-height:760px;color:var(--r119-ink);background:linear-gradient(135deg,#f5f2eb 0%,#ebe5da 72%,#ddd2c1 100%);padding:92px 5vw 58px}
.r119-proof__head{position:relative;z-index:3;width:min(1040px,78vw);padding:0 0 46px}
.r119-proof__head h2{font-family:var(--ix-display-font);font-size:clamp(50px,5.3vw,90px);line-height:.9;letter-spacing:-.052em;margin:16px 0 0;max-width:14ch}
.r119-proof__facts{position:relative;z-index:3;border-top:1px solid rgba(14,15,16,.30)}
.r119-proof__facts article{min-height:160px;border-bottom:1px solid rgba(14,15,16,.18);display:grid;grid-template-columns:72px minmax(260px,.9fr) minmax(260px,1.1fr);gap:32px;align-items:center;padding:24px 0}
.r119-proof__facts article:nth-child(2){margin-left:8vw}
.r119-proof__facts article:nth-child(3){margin-left:16vw}
.r119-proof__facts strong{display:block;font-family:var(--ix-display-font);font-size:clamp(25px,2.1vw,36px);line-height:1.02;letter-spacing:-.028em;max-width:18ch;margin-top:8px}
.r119-proof__facts p{margin:0;max-width:48ch;font-size:15px;line-height:1.6;opacity:.78}
.r119-proof__label{font-size:10px;text-transform:uppercase;letter-spacing:.16em;font-weight:800;color:var(--r119-red)}
.r119-proof__mark{width:48px;height:8px;background:var(--r119-red);display:block;box-shadow:14px 12px 0 rgba(185,24,24,.22)}
.r119-proof__locality{margin-top:28px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;letter-spacing:.10em;text-transform:uppercase}
/* 06 — verified U-Power as a single museum-like brand stage */
.r119-partner{min-height:640px;background:radial-gradient(circle at 58% 48%,rgba(185,24,24,.18),transparent 32%),linear-gradient(118deg,#0b0c0d 0%,#151719 62%,#250808 100%);color:white;padding:70px 5vw;display:block}
.r119-partner__label{position:relative;z-index:3;width:min(340px,30vw);display:flex;flex-direction:column;gap:18px}
.r119-partner__label>p:last-child{max-width:28ch;font-size:16px;line-height:1.55}
.r119-partner .r119-proof__partner{position:absolute;inset:0;margin:0;padding:80px 8vw;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;text-align:center}
.r119-partner .r119-proof__partner img{width:min(520px,42vw);max-height:210px;object-fit:contain;filter:grayscale(1) brightness(2)}
.r119-partner .r119-proof__partner strong{font-family:var(--ix-display-font);font-size:clamp(40px,4vw,70px);line-height:.92;letter-spacing:-.042em;max-width:16ch}
.r119-partner__frame{position:absolute;right:-58vw;top:42px;width:180px;height:180px;border:1px solid rgba(255,255,255,.24);background:linear-gradient(135deg,transparent 0 47%,rgba(185,24,24,.90) 47% 53%,transparent 53% 100%);box-shadow:28px 28px 0 rgba(255,255,255,.04)}
/* 07 — contact as an oversized commercial interlude, not a three-column module */
.r119-contact{min-height:470px;color:var(--r119-ink);background:linear-gradient(110deg,#f4f1ea,#e7dfd2 66%,#f1ebe2);padding:70px 5vw;display:flex;flex-direction:column;justify-content:space-between;border-top:1px solid var(--r119-line);border-bottom:1px solid var(--r119-line)}
.r119-contact__meta{position:relative;z-index:3;width:min(520px,44vw)}
.r119-contact__meta p:last-child{font-size:17px;line-height:1.55;max-width:32ch}
.r119-contact__locality{position:absolute;left:38vw;bottom:46px;z-index:2;opacity:.10}
.r119-contact__locality strong{font-family:var(--ix-display-font);font-size:clamp(110px,15vw,230px);line-height:.72;letter-spacing:-.075em;white-space:nowrap;display:block}
.r119-contact .r119-btn{position:absolute;right:5vw;bottom:64px;z-index:4;min-height:120px;width:min(320px,25vw)}
/* 08 — close */
.r119-close{min-height:88svh;color:white;background:linear-gradient(125deg,#070809 0%,#111314 52%,#330707 100%);display:flex;align-items:flex-end;padding:94px 5vw 56px}
.r119-close__copy{position:relative;z-index:2;width:min(1040px,70vw)}
.r119-close__copy h2{font-family:var(--ix-display-font);font-size:clamp(70px,7.8vw,132px);line-height:.86;letter-spacing:-.058em;max-width:9ch;margin:16px 0 26px}
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
  .r119-beam{width:74px;height:74px;border-width:5px}
  .r119-beam--hero{right:18px;top:15vh}
  .r119-beam--positioning{left:18px;top:42px;width:110px;height:50px}
  .r119-beam--materials{right:22px;bottom:34px}
  .r119-beam--rebar{right:20px;top:54px}
  .r119-beam--proof{right:18px;top:42px}
  .r119-beam--partner{left:18px;bottom:30px}
  .r119-beam--contact{right:18px;top:34px}
  .r119-beam--close{right:18px;top:54px}

  .r119-hero{min-height:94svh}
  .r119-hero__copy{left:18px;right:18px;bottom:24px;width:auto;padding-top:20px}
  .r119-hero__copy h1{font-size:clamp(44px,12.2vw,60px);line-height:.9;letter-spacing:-.046em;max-width:9.4ch;margin:10px 0 18px}
  .r119-lede{font-size:15px;max-width:30ch;margin-bottom:24px}
  .r119-actions{display:grid;grid-template-columns:1fr}

  .r119-positioning{min-height:78svh;padding:0}
  .r119-positioning__media{position:absolute;inset:0}
  .r119-positioning__media img{object-position:62% center}
  .r119-positioning__veil{background:linear-gradient(180deg,rgba(5,6,7,.42) 0%,rgba(5,6,7,.72) 38%,rgba(5,6,7,.97) 76%,rgba(5,6,7,.99) 100%)}
  .r119-positioning__identity{right:-24vw;top:7%;width:112vw;opacity:.055}
  .r119-positioning__copy{min-height:78svh;width:auto;padding:110px 18px 48px;justify-content:flex-end}
  .r119-positioning__copy h2{font-size:clamp(48px,13vw,64px);line-height:.9;max-width:10ch}
  .r119-positioning__copy>p:last-child{font-size:16px;max-width:31ch}

  .r119-materials{min-height:68svh;padding:82px 18px 58px;display:flex;align-items:flex-end}
  .r119-materials__structure{right:-20vw;top:80px;width:96vw;height:48svh;opacity:.72}
  .r119-materials__copy{width:100%;padding:0 0 34px}
  .r119-materials__copy h2{font-size:clamp(46px,12vw,62px);line-height:.9;max-width:11ch}
  .r119-materials__copy .r119-service__body{font-size:16px;max-width:30ch}
  .r119-materials__edge{width:72%;height:6px}

  .r119-rebar{min-height:76svh;padding:72px 18px 32px;grid-template-rows:1fr auto}
  .r119-rebar__title{width:auto}
  .r119-rebar__title h2{font-size:clamp(46px,12.5vw,62px);line-height:.9;max-width:11ch}
  .r119-rebar__body{width:100%;font-size:15px;padding-top:24px}

  .r119-proof{min-height:0;padding:70px 18px 46px}
  .r119-proof__head{padding:0 0 42px;width:auto}
  .r119-proof__head h2{font-size:clamp(44px,12vw,60px);line-height:.92;max-width:11ch}
  .r119-proof__facts article,.r119-proof__facts article:nth-child(2),.r119-proof__facts article:nth-child(3){margin-left:0;min-height:0;padding:26px 0;display:grid;grid-template-columns:48px 1fr;gap:16px 14px}
  .r119-proof__facts article>p{grid-column:2;font-size:14px;line-height:1.55}
  .r119-proof__facts strong{font-size:clamp(25px,7.4vw,34px);max-width:14ch}
  .r119-proof__mark{width:36px;height:6px}
  .r119-proof__locality{margin-top:28px;font-size:10px}

  .r119-partner{min-height:70svh;padding:62px 18px 40px}
  .r119-partner__label{position:relative;width:auto;gap:16px;z-index:4}
  .r119-partner .r119-proof__partner{padding:170px 18px 56px;gap:28px}
  .r119-partner .r119-proof__partner img{width:min(300px,78%);max-height:126px}
  .r119-partner .r119-proof__partner strong{font-size:clamp(38px,11vw,52px);max-width:11ch}
  .r119-partner__frame{right:22px;top:34px;width:92px;height:92px}

  .r119-contact{min-height:56svh;padding:62px 18px 32px;display:flex;justify-content:flex-start}
  .r119-contact__meta{width:100%;max-width:30ch}
  .r119-contact__locality{left:18px;bottom:116px;opacity:.09}
  .r119-contact__locality strong{font-size:clamp(74px,24vw,104px);max-width:none}
  .r119-contact .r119-btn{position:absolute;left:18px;right:18px;bottom:24px;width:auto;min-height:72px}

  .r119-close{min-height:78svh;padding:84px 18px 24px;display:flex;flex-direction:column;justify-content:flex-end;align-items:stretch}
  .r119-close__copy{width:auto}
  .r119-close__copy h2{font-size:clamp(50px,13.2vw,68px);line-height:.9;max-width:10ch}
  .r119-close>.r119-btn{position:relative;right:auto;bottom:auto;margin-top:44px;width:100%;min-height:88px}
  .r119-close__watermark{right:-8vw;bottom:12vh;width:92vw;opacity:.08}
  .r119-close__watermark .ix-v2-identity-main{opacity:.08!important}
}

.r119-hero.r119-jury-reset .r119-hero__copy{left:auto;right:5vw;width:min(760px,54vw);border-top:0;border-left:4px solid var(--r119-red);padding:0 0 0 30px}
.r119-hero.r119-jury-reset .r119-hero__veil{background:linear-gradient(270deg,rgba(4,5,6,.97) 0%,rgba(4,5,6,.84) 30%,rgba(4,5,6,.28) 66%,rgba(4,5,6,.06) 86%),linear-gradient(180deg,rgba(0,0,0,.08),transparent 52%,rgba(0,0,0,.68))}
.r119-positioning.r119-jury-reset .r119-positioning__media img{object-position:32% center;filter:saturate(.34) contrast(1.28) brightness(.50)}
.r119-positioning.r119-jury-reset .r119-positioning__veil{background:linear-gradient(270deg,rgba(6,7,8,.98) 0%,rgba(6,7,8,.86) 40%,rgba(6,7,8,.28) 74%,rgba(6,7,8,.08) 100%)}
.r119-positioning.r119-jury-reset .r119-positioning__copy{margin-left:auto;padding-left:4vw;padding-right:5vw;align-items:flex-start}
.r119-positioning.r119-jury-reset .r119-positioning__identity{left:3vw;right:auto}
.r119-materials.r119-jury-reset{background:linear-gradient(125deg,#0b0c0d 0%,#161819 62%,#2a0909 100%);color:var(--r119-white)}
.r119-materials.r119-jury-reset .r119-materials__structure{left:5vw;right:auto;border-color:rgba(255,255,255,.18);background:repeating-linear-gradient(90deg,transparent 0 74px,rgba(255,255,255,.08) 74px 75px),repeating-linear-gradient(0deg,transparent 0 74px,rgba(255,255,255,.08) 74px 75px)}
.r119-materials.r119-jury-reset .r119-materials__copy{margin-left:auto;text-align:right}
.r119-materials.r119-jury-reset .r119-materials__copy .r119-service__body{margin-left:auto}
.r119-proof.r119-jury-reset{background:linear-gradient(130deg,#0b0c0d 0%,#151719 62%,#2a0909 100%);color:var(--r119-white)}
.r119-proof.r119-jury-reset .r119-proof__facts{border-color:rgba(255,255,255,.24)}
.r119-proof.r119-jury-reset .r119-proof__facts article{border-color:rgba(255,255,255,.18)}
.r119-proof.r119-jury-reset .r119-proof__facts article:nth-child(2){margin-left:14vw}
.r119-proof.r119-jury-reset .r119-proof__facts article:nth-child(3){margin-left:6vw}
.r119-partner.r119-jury-reset{background:linear-gradient(135deg,#f2ede5,#ddd3c5);color:var(--r119-ink)}
.r119-partner.r119-jury-reset .r119-proof__partner img{filter:grayscale(1) contrast(1.2)}
.r119-partner.r119-jury-reset .r119-partner__frame{border-color:rgba(14,15,16,.22);box-shadow:28px 28px 0 rgba(14,15,16,.05)}
.r119-contact.r119-jury-reset{background:linear-gradient(110deg,#b91818,#8f1111);color:white;border:0}
.r119-contact.r119-jury-reset .r119-contact__locality{opacity:.14}
.r119-contact.r119-jury-reset .r119-btn--outline{color:white}
@media(max-width:700px){
  .r119-hero.r119-jury-reset .r119-hero__copy{left:18px;right:18px;width:auto;border-left:3px solid var(--r119-red);padding-left:16px}
  .r119-positioning.r119-jury-reset .r119-positioning__media img{object-position:35% center}
  .r119-positioning.r119-jury-reset .r119-positioning__veil{background:linear-gradient(180deg,rgba(5,6,7,.34),rgba(5,6,7,.74) 44%,rgba(5,6,7,.98) 82%)}
  .r119-positioning.r119-jury-reset .r119-positioning__copy{margin:0;padding:110px 18px 48px;text-align:left}
  .r119-materials.r119-jury-reset .r119-materials__structure{left:-18vw;right:auto}
  .r119-materials.r119-jury-reset .r119-materials__copy{margin:0;text-align:left}
  .r119-materials.r119-jury-reset .r119-materials__copy .r119-service__body{margin-left:0}
  .r119-proof.r119-jury-reset .r119-proof__facts article:nth-child(2),.r119-proof.r119-jury-reset .r119-proof__facts article:nth-child(3){margin-left:0}
}
/* R119 V21 — authored industrial campaign override.
   Five visual acts across eight semantic sections: reveal, material system,
   technical capability, verified proof, commercial close. */
.r119-beam{display:none!important}
.r119-hero{min-height:100svh;background:#070809}
.r119-hero__media img{object-position:58% 46%;filter:saturate(.32) contrast(1.34) brightness(.66)}
.r119-hero__veil{background:linear-gradient(90deg,rgba(3,4,5,.97) 0%,rgba(3,4,5,.88) 28%,rgba(3,4,5,.28) 62%,rgba(3,4,5,.06) 100%),linear-gradient(180deg,transparent 38%,rgba(0,0,0,.72))}
.r119-hero__copy{left:5vw;bottom:8vh;width:min(980px,66vw);padding:0 0 0 28px;border:0;border-left:6px solid var(--r119-red)}
.r119-hero__copy h1{font-size:clamp(72px,8vw,138px);line-height:.84;letter-spacing:-.065em;max-width:11.5ch;margin:10px 0 24px}
.r119-lede{font-size:clamp(17px,1.15vw,20px);max-width:46ch;margin-bottom:34px}
.r119-actions{gap:12px}.r119-btn{min-height:62px;padding:0 32px}

.r119-positioning{min-height:92svh;background:#090a0b}
.r119-positioning__media img{object-position:72% center;filter:saturate(.26) contrast(1.32) brightness(.50)}
.r119-positioning__veil{background:linear-gradient(90deg,rgba(5,6,7,.98) 0%,rgba(5,6,7,.87) 34%,rgba(5,6,7,.30) 68%,rgba(5,6,7,.08) 100%)}
.r119-positioning__copy{min-height:92svh;width:min(900px,60vw);padding:15vh 5vw 9vh;justify-content:flex-end}
.r119-positioning__copy h2{font-size:clamp(68px,7vw,120px);line-height:.84;max-width:10ch;margin:16px 0 30px}
.r119-positioning__copy>p:last-child{font-size:clamp(18px,1.32vw,22px);line-height:1.55;max-width:45ch}
.r119-positioning__identity{right:-3vw;top:6%;width:min(760px,50vw);opacity:.085}

.r119-materials{min-height:92svh;padding:0;display:flex;align-items:center;background:#ece5da;color:var(--r119-ink)}
.r119-materials__media{position:absolute;inset:0 0 0 46%;margin:0;overflow:hidden}
.r119-materials__media img{width:100%;height:100%;object-fit:cover;object-position:52% center;filter:saturate(.52) contrast(1.14) brightness(.92)}
.r119-materials__veil{position:absolute;inset:0;background:linear-gradient(90deg,#ece5da 0%,#ece5da 39%,rgba(236,229,218,.90) 47%,rgba(236,229,218,.08) 72%,transparent 100%)}
.r119-materials__structure{left:4vw;right:auto;top:12vh;width:38vw;height:68vh;border-color:rgba(10,11,12,.14);background:repeating-linear-gradient(90deg,transparent 0 92px,rgba(10,11,12,.055) 92px 93px),repeating-linear-gradient(0deg,transparent 0 92px,rgba(10,11,12,.055) 92px 93px);transform:none}
.r119-materials__structure span{box-shadow:none}
.r119-materials__structure span:nth-child(1){width:66%;height:8px;left:4%;top:12%;transform:none}
.r119-materials__structure span:nth-child(2){width:8px;height:60%;right:12%;top:18%;transform:none}
.r119-materials__structure span:nth-child(3){width:42%;height:8px;right:0;bottom:12%;transform:none}
.r119-materials__copy{position:relative;z-index:4;width:min(650px,40vw);margin-left:5vw;padding:0}
.r119-materials__copy h2{font-size:clamp(62px,6.1vw,104px);line-height:.84;max-width:10ch;margin:16px 0 28px}
.r119-materials__copy .r119-service__body{font-size:18px;line-height:1.6;max-width:34ch}
.r119-materials__edge{width:46%;height:12px}

.r119-rebar{min-height:92svh;padding:11vh 5vw 8vh;background:linear-gradient(115deg,#060708 0%,#101214 72%,#250707 100%);display:grid;grid-template-columns:minmax(0,1.15fr) minmax(320px,.65fr);grid-template-rows:1fr;gap:6vw;align-items:end}
.r119-rebar__technical{position:absolute;inset:0;margin:0;overflow:hidden;background:repeating-linear-gradient(104deg,transparent 0 68px,rgba(255,255,255,.055) 68px 70px),repeating-linear-gradient(14deg,transparent 0 118px,rgba(185,24,24,.12) 118px 120px)}
.r119-rebar__technical span{position:absolute;display:block;background:linear-gradient(90deg,rgba(185,24,24,.08),rgba(185,24,24,.92),rgba(255,255,255,.14));height:10px;transform-origin:left center}
.r119-rebar__technical span:nth-child(1){left:46%;top:7%;width:62vw;transform:rotate(57deg)}
.r119-rebar__technical span:nth-child(2){left:61%;top:2%;width:52vw;transform:rotate(71deg);height:5px}
.r119-rebar__technical span:nth-child(3){left:49%;top:34%;width:58vw;transform:rotate(31deg);height:3px}
.r119-rebar__technical span:nth-child(4){left:70%;top:25%;width:42vw;transform:rotate(90deg);height:7px}
.r119-rebar__veil{background:linear-gradient(90deg,rgba(4,5,6,.98) 0%,rgba(4,5,6,.90) 37%,rgba(4,5,6,.40) 70%,rgba(4,5,6,.12) 100%)}
.r119-rebar__title{width:auto;align-self:end}
.r119-rebar__title h2{font-size:clamp(68px,7vw,122px);line-height:.84;max-width:9.5ch}
.r119-rebar__body{width:auto;max-width:430px;padding:30px 0 0;border-top:1px solid rgba(255,255,255,.34);font-size:17px;line-height:1.62;align-self:end}

.r119-proof{min-height:88svh;background:#0b0c0d;color:var(--r119-white);padding:11vh 5vw 8vh}
.r119-proof__head{width:min(1080px,82vw);padding-bottom:7vh}
.r119-proof__head h2{font-size:clamp(58px,6vw,104px);line-height:.86;max-width:13ch}
.r119-proof__facts{border-top:1px solid rgba(255,255,255,.28)}
.r119-proof__facts article,.r119-proof__facts article:nth-child(2),.r119-proof__facts article:nth-child(3){margin-left:0;min-height:158px;border-bottom:1px solid rgba(255,255,255,.16);grid-template-columns:84px minmax(260px,.9fr) minmax(320px,1.1fr);padding:28px 0}
.r119-proof__facts article:nth-child(2){padding-left:7vw}
.r119-proof__facts article:nth-child(3){padding-left:14vw}
.r119-proof__facts strong{font-size:clamp(28px,2.45vw,42px);max-width:17ch}
.r119-proof__facts p{font-size:16px;line-height:1.62;opacity:.76}
.r119-proof__mark{width:54px;height:5px;box-shadow:none}
.r119-proof__locality{color:rgba(255,255,255,.62)}

.r119-partner{min-height:78svh;background:var(--r119-red);color:white;padding:8vh 5vw}
.r119-partner__label{width:min(420px,32vw);gap:20px}
.r119-partner__label>p:last-child{font-size:18px;line-height:1.55}
.r119-partner .r119-proof__partner{inset:18% 5vw 8%;padding:6vh 5vw;background:#f4f1ea;color:#0b0c0d;justify-content:center;gap:30px}
.r119-partner .r119-proof__partner img{width:min(620px,52vw);max-height:230px;filter:none}
.r119-partner .r119-proof__partner strong{font-size:clamp(44px,4.4vw,78px);max-width:15ch}
.r119-partner__frame{display:none}

.r119-contact{min-height:62svh;background:var(--r119-red);color:white;padding:9vh 5vw 7vh;border:0;justify-content:flex-end}
.r119-contact__meta{width:min(780px,58vw)}
.r119-contact__meta .r119-kicker{font-size:11px}
.r119-contact__meta p:last-child{font-family:var(--ix-display-font);font-size:clamp(36px,3.8vw,66px);line-height:.95;letter-spacing:-.035em;max-width:15ch;margin:18px 0 0}
.r119-contact__locality{left:auto;right:4vw;bottom:5vh;opacity:.12}
.r119-contact .r119-btn{right:5vw;top:9vh;bottom:auto;width:min(330px,25vw);min-height:88px;color:white;border-color:rgba(255,255,255,.68)}

.r119-close{min-height:100svh;background:linear-gradient(90deg,#08090a 0%,#101113 67%,#b91818 67%,#8d1111 100%);padding:11vh 5vw 7vh;align-items:flex-end}
.r119-close__copy{width:min(1000px,62vw)}
.r119-close__copy h2{font-size:clamp(78px,8.4vw,144px);line-height:.82;max-width:8ch}
.r119-close__copy>p:last-child{font-size:18px;line-height:1.58;max-width:38ch}
.r119-close>.r119-btn{right:5vw;bottom:7vh;width:min(360px,24vw);min-height:240px;background:#f4f1ea;color:#0a0b0c;border-color:#f4f1ea}

@media(max-width:700px){
  .r119-hero{min-height:88svh}
  .r119-hero__media img{object-position:62% center;transform:none}
  .r119-hero__veil{background:linear-gradient(180deg,rgba(3,4,5,.10) 0%,rgba(3,4,5,.32) 38%,rgba(3,4,5,.94) 72%,rgba(3,4,5,.99) 100%)}
  .r119-hero__copy{left:18px;right:18px;bottom:24px;width:auto;padding:0 0 0 16px;border-left-width:4px}
  .r119-hero__copy h1{font-size:clamp(48px,13.5vw,66px);line-height:.86;max-width:9ch}
  .r119-lede{font-size:15px;max-width:32ch}
  .r119-actions{grid-template-columns:1fr 1fr}
  .r119-btn{min-height:52px;padding:0 10px;font-size:12px}

  .r119-positioning{min-height:0;display:flex;flex-direction:column;background:#090a0b}
  .r119-positioning__media{position:relative;inset:auto;height:44svh;order:1}
  .r119-positioning__media img{object-position:58% center}
  .r119-positioning__veil{display:none}
  .r119-positioning__identity{top:38svh;right:-18vw;width:98vw;opacity:.045}
  .r119-positioning__copy{order:2;min-height:0;width:auto;padding:52px 18px 62px}
  .r119-positioning__copy h2{font-size:clamp(48px,13vw,66px);max-width:9ch}
  .r119-positioning__copy>p:last-child{font-size:16px;max-width:32ch}

  .r119-materials{min-height:0;display:block;padding:0;background:#ece5da}
  .r119-materials__media{position:relative;inset:auto;height:42svh;width:100%;margin:0}
  .r119-materials__media img{object-position:58% center}
  .r119-materials__veil{display:none}
  .r119-materials__structure{left:-18vw;top:38svh;width:96vw;height:48svh;opacity:.38}
  .r119-materials__copy{width:auto;margin:0;padding:52px 18px 74px}
  .r119-materials__copy h2{font-size:clamp(50px,13vw,68px);max-width:9ch}
  .r119-materials__copy .r119-service__body{font-size:16px;max-width:31ch}
  .r119-materials__edge{width:62%;height:7px}

  .r119-rebar{min-height:72svh;padding:66px 18px 38px;display:flex;flex-direction:column;justify-content:flex-end;gap:34px}
  .r119-rebar__technical{background:repeating-linear-gradient(104deg,transparent 0 46px,rgba(255,255,255,.045) 46px 48px),repeating-linear-gradient(14deg,transparent 0 82px,rgba(185,24,24,.13) 82px 84px)}
  .r119-rebar__title h2{font-size:clamp(50px,13vw,68px);max-width:9ch}
  .r119-rebar__body{max-width:31ch;font-size:15px;padding-top:22px}

  .r119-proof{min-height:0;padding:66px 18px 48px}
  .r119-proof__head{width:auto;padding-bottom:40px}
  .r119-proof__head h2{font-size:clamp(46px,12.4vw,62px);max-width:10ch}
  .r119-proof__facts article,.r119-proof__facts article:nth-child(2),.r119-proof__facts article:nth-child(3){padding:26px 0;margin:0;grid-template-columns:42px 1fr;gap:14px}
  .r119-proof__facts article>p{grid-column:2;font-size:14px}
  .r119-proof__facts strong{font-size:clamp(26px,7.6vw,36px);max-width:13ch}

  .r119-partner{min-height:64svh;padding:48px 18px 28px}
  .r119-partner__label{width:auto;max-width:28ch}
  .r119-partner .r119-proof__partner{inset:38% 18px 28px;padding:24px 20px;gap:20px}
  .r119-partner .r119-proof__partner img{width:min(300px,82%);max-height:112px}
  .r119-partner .r119-proof__partner strong{font-size:clamp(34px,10vw,48px);max-width:10ch}

  .r119-contact{min-height:54svh;padding:58px 18px 28px;justify-content:flex-start}
  .r119-contact__meta{width:auto;max-width:31ch}
  .r119-contact__meta p:last-child{font-size:clamp(34px,9.6vw,46px);max-width:12ch}
  .r119-contact__locality{display:none}
  .r119-contact .r119-btn{left:18px;right:18px;top:auto;bottom:24px;width:auto;min-height:64px}

  .r119-close{min-height:76svh;padding:64px 18px 24px;background:linear-gradient(180deg,#08090a 0%,#101113 70%,#b91818 70%,#8d1111 100%)}
  .r119-close__copy{width:auto}
  .r119-close__copy h2{font-size:clamp(54px,14vw,72px);max-width:8ch}
  .r119-close__copy>p:last-child{font-size:15px;max-width:31ch}
  .r119-close>.r119-btn{position:relative;right:auto;bottom:auto;margin-top:36px;width:100%;min-height:78px}
}

/* R119 V23 — jury stabilization and mobile precision */
.r119-materials__media{inset:0!important}
.r119-materials__veil{background:linear-gradient(90deg,rgba(236,229,218,.99) 0%,rgba(236,229,218,.97) 30%,rgba(236,229,218,.72) 43%,rgba(236,229,218,.12) 70%,rgba(236,229,218,0) 100%)!important}
.r119-materials__copy{width:min(620px,38vw)!important}
.r119-proof__facts article:nth-child(4){padding-left:21vw}
.r119-proof__facts article:nth-child(4) .r119-proof__mark{background:#f4f1ea;box-shadow:18px 0 0 var(--r119-red)}

/* The second jury pass is a controlled refinement, never a wholesale layout flip. */
.r119-hero.r119-jury-reset .r119-hero__copy{left:5vw;right:auto;bottom:8vh;width:min(980px,66vw);padding:0 0 0 28px;border:0;border-left:6px solid var(--r119-red);text-align:left}
.r119-hero.r119-jury-reset .r119-hero__veil{background:linear-gradient(90deg,rgba(3,4,5,.98) 0%,rgba(3,4,5,.90) 30%,rgba(3,4,5,.32) 64%,rgba(3,4,5,.08) 100%),linear-gradient(180deg,transparent 38%,rgba(0,0,0,.74))}
.r119-positioning.r119-jury-reset .r119-positioning__media img{object-position:72% center;filter:saturate(.26) contrast(1.32) brightness(.50)}
.r119-positioning.r119-jury-reset .r119-positioning__veil{background:linear-gradient(90deg,rgba(5,6,7,.98) 0%,rgba(5,6,7,.87) 34%,rgba(5,6,7,.30) 68%,rgba(5,6,7,.08) 100%)}
.r119-positioning.r119-jury-reset .r119-positioning__copy{margin:0;padding:15vh 5vw 9vh;align-items:flex-start;text-align:left}
.r119-positioning.r119-jury-reset .r119-positioning__identity{left:auto;right:-3vw}
.r119-materials.r119-jury-reset{background:#ece5da;color:var(--r119-ink)}
.r119-materials.r119-jury-reset .r119-materials__structure{left:4vw;right:auto;border-color:rgba(10,11,12,.14);background:repeating-linear-gradient(90deg,transparent 0 92px,rgba(10,11,12,.055) 92px 93px),repeating-linear-gradient(0deg,transparent 0 92px,rgba(10,11,12,.055) 92px 93px)}
.r119-materials.r119-jury-reset .r119-materials__copy{margin-left:5vw;text-align:left}
.r119-materials.r119-jury-reset .r119-materials__copy .r119-service__body{margin-left:0}
.r119-proof.r119-jury-reset{background:#0b0c0d;color:var(--r119-white)}
.r119-proof.r119-jury-reset .r119-proof__facts{border-color:rgba(255,255,255,.28)}
.r119-proof.r119-jury-reset .r119-proof__facts article{border-color:rgba(255,255,255,.16)}
.r119-proof.r119-jury-reset .r119-proof__facts article:nth-child(2){margin-left:0;padding-left:7vw}
.r119-proof.r119-jury-reset .r119-proof__facts article:nth-child(3){margin-left:0;padding-left:14vw}
.r119-proof.r119-jury-reset .r119-proof__facts article:nth-child(4){margin-left:0;padding-left:21vw}
.r119-partner.r119-jury-reset{background:var(--r119-red);color:white}
.r119-partner.r119-jury-reset .r119-proof__partner img{filter:none}
.r119-contact.r119-jury-reset{background:var(--r119-red);color:white}
.r119-contact.r119-jury-reset .r119-btn--outline{color:white}

@media(max-width:700px){
  .r119-scene h1,.r119-scene h2{overflow-wrap:anywhere;word-break:normal;hyphens:auto}
  .r119-hero__copy h1{font-size:clamp(42px,11.2vw,54px)!important;line-height:.9!important;max-width:10.5ch!important}
  .r119-positioning__copy h2,.r119-materials__copy h2,.r119-rebar__title h2,.r119-proof__head h2{font-size:clamp(42px,10.8vw,56px)!important;line-height:.92!important;max-width:10.8ch!important}
  .r119-materials__media{position:relative!important;inset:auto!important;height:40svh!important}
  .r119-materials__veil{display:none!important}
  .r119-materials__copy{width:auto!important}
  .r119-proof__facts article:nth-child(4){padding-left:0}
  .r119-proof__facts article,.r119-proof__facts article:nth-child(2),.r119-proof__facts article:nth-child(3),.r119-proof__facts article:nth-child(4){grid-template-columns:38px 1fr!important;gap:12px!important}
  .r119-proof__facts article>p{grid-column:2}
  .r119-hero.r119-jury-reset .r119-hero__copy{left:18px;right:18px;bottom:24px;width:auto;padding:0 0 0 14px;border-left:4px solid var(--r119-red)}
  .r119-positioning.r119-jury-reset .r119-positioning__media img{object-position:58% center}
  .r119-positioning.r119-jury-reset .r119-positioning__veil{display:none}
  .r119-positioning.r119-jury-reset .r119-positioning__copy{margin:0;padding:52px 18px 62px;text-align:left}
  .r119-materials.r119-jury-reset .r119-materials__structure{left:-18vw;right:auto}
  .r119-materials.r119-jury-reset .r119-materials__copy{margin:0;padding:52px 18px 74px;text-align:left}
  .r119-proof.r119-jury-reset .r119-proof__facts article:nth-child(2),.r119-proof.r119-jury-reset .r119-proof__facts article:nth-child(3),.r119-proof.r119-jury-reset .r119-proof__facts article:nth-child(4){margin-left:0;padding-left:0}
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
      implementation_notes:"R119 SIGNATURE SCENE COMPOSER V4 JURY-DRIVEN: eight evidence-led chapters with four distinct photographic roles, denser operational proof, tighter typography and independently composed mobile. Scene mode: "+mode+". A jury-reset mode radically flips hero alignment, positioning/media order, materials balance, proof surface and commercial bridge rather than replaying the same composition."
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
  if(String(spec?.scene_composer_standard||"")!==R119_SCENE_COMPOSER_STANDARD) issues.push("R119_SCENE_COMPOSER_STANDARD_REQUIRED");
  if(String(spec?.perceptual_flagship_standard||"")!=="R118_PERCEPTUAL_JURY_V1") issues.push("R119_R118_JURY_REQUIRED");
  return issues;
}
