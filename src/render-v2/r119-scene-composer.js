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
      '<div class="r119-hero__copy"><p class="r119-kicker">'+copyToken("LOCALITY_LINE")+'</p><h1>'+copyToken("HERO_HEADLINE")+'</h1><p class="r119-lede ixg-lede">'+copyToken("HERO_BODY")+'</p><div class="r119-actions ixg-actions"><a class="r119-btn r119-btn--solid" data-premium-button="true" href="'+ctaToken("PRIMARY")+'"><span>'+copyToken("PRIMARY_CTA_LABEL")+'</span><span aria-hidden="true">↗</span></a><a class="r119-btn r119-btn--ghost" data-premium-button="true" href="'+ctaToken("SECONDARY")+'"><span>'+copyToken("SECONDARY_CTA_LABEL")+'</span><span aria-hidden="true">→</span></a></div></div>'+
      '<div class="r119-hero__edge-index" aria-hidden="true"><span></span><span></span><span></span></div>'+

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
      picture(assets,"SERVICE_REBAR_VISUAL","r119-rebar__photo")+
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
      '<a class="r119-contact__link" href="'+ctaToken("SECONDARY")+'"><span>'+copyToken("SECONDARY_CTA_LABEL")+'</span><span aria-hidden="true">→</span></a>'+
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
  --ix-ink:#0a0b0c;
  --ix-carbon:#111315;
  --ix-paper:#f3f0e9;
  --ix-sand:#ddd4c8;
  --ix-red:#b4171a;
  --ix-white:#fbfaf7;
  --ix-line-dark:rgba(10,11,12,.16);
  --ix-line-light:rgba(255,255,255,.18);
  --ix-shadow:0 28px 80px rgba(0,0,0,.18);
  --ix-shadow-deep:0 42px 120px rgba(0,0,0,.30);
  --ix-ease:cubic-bezier(.2,.72,.2,1);
  --ix-display:Inter Tight,Inter,Aptos,"Segoe UI",sans-serif;
  --ix-body:Inter,Aptos,"Segoe UI",sans-serif;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{text-wrap:pretty;background:var(--ix-ink)}
h1,h2,strong{text-wrap:balance}
img{display:block;max-width:100%}
.r119-scene{
  position:relative;
  overflow:hidden;
  isolation:isolate;
  font-family:var(--ix-body);
}
.r119-kicker{
  margin:0;
  font-size:10px;
  line-height:1.2;
  font-weight:800;
  letter-spacing:.16em;
  text-transform:uppercase;
}
.r119-actions{display:flex;gap:10px;flex-wrap:wrap}
.r119-btn{
  display:inline-flex;
  align-items:center;
  justify-content:space-between;
  gap:22px;
  min-height:58px;
  padding:0 26px;
  border:1px solid currentColor;
  border-radius:0;
  text-decoration:none;
  font-size:12px;
  font-weight:800;
  letter-spacing:.03em;
  transition:transform .35s var(--ix-ease),background-color .35s var(--ix-ease),color .35s var(--ix-ease),border-color .35s var(--ix-ease);
}
.r119-btn:hover{transform:translateY(-3px)}
.r119-btn--solid{background:var(--ix-red);border-color:var(--ix-red);color:white}
.r119-btn--solid:hover{background:#971215;border-color:#971215}
.r119-btn--ghost{background:rgba(255,255,255,.04);color:white;border-color:rgba(255,255,255,.42)}
.r119-btn--ghost:hover{background:rgba(255,255,255,.10);border-color:rgba(255,255,255,.72)}
.r119-btn--final{background:var(--ix-white);color:var(--ix-ink);border-color:var(--ix-white)}

/* site chrome: product UI, not poster chrome */
.ix-v2-header{
  position:sticky!important;
  top:0!important;
  z-index:60!important;
  background:rgba(10,11,12,.90)!important;
  color:white!important;
  border-bottom:1px solid rgba(255,255,255,.12)!important;
  backdrop-filter:blur(18px) saturate(1.1)!important;
}
.ix-v2-header-inner{
  min-height:76px!important;
  padding-left:clamp(20px,4vw,64px)!important;
  padding-right:clamp(20px,4vw,64px)!important;
}
.ix-v2-header .ix-v2-identity-main{filter:brightness(0) invert(1)!important}
.ix-v2-nav{gap:24px!important}
.ix-v2-nav a{
  color:white!important;
  opacity:.72!important;
  font-size:11px!important;
  letter-spacing:.09em!important;
  text-transform:uppercase!important;
  transition:opacity .3s var(--ix-ease),transform .3s var(--ix-ease)!important;
}
.ix-v2-nav a:hover{opacity:1!important;transform:translateY(-2px)!important}
.ix-v2-header-cta{
  min-height:46px!important;
  padding:0 20px!important;
  border-radius:0!important;
  background:white!important;
  color:var(--ix-ink)!important;
  border:1px solid white!important;
  transition:transform .3s var(--ix-ease)!important;
}
.ix-v2-header-cta:hover{transform:translateY(-2px)!important}

/* 01 — HERO: commercial interface + immersive media */
.r119-hero{
  min-height:88svh;
  display:grid;
  grid-template-columns:minmax(0,46%) minmax(0,54%);
  background:var(--ix-carbon);
  color:white;
}
.r119-hero__media{
  position:relative;
  grid-column:2;
  grid-row:1;
  margin:0;
  min-height:88svh;
  overflow:hidden;
  box-shadow:-28px 0 80px rgba(0,0,0,.22);
}
.r119-hero__media img{
  width:100%;
  height:100%;
  object-fit:cover;
  object-position:58% 48%;
  filter:saturate(.46) contrast(1.18) brightness(.76);
  transform:scale(1.025);
  transition:transform 1s var(--ix-ease),filter .8s var(--ix-ease);
}
.r119-hero:hover .r119-hero__media img{transform:scale(1.045);filter:saturate(.56) contrast(1.2) brightness(.79)}
.r119-hero__veil{
  position:absolute;
  z-index:2;
  inset:0 0 0 44%;
  background:linear-gradient(90deg,rgba(17,19,21,.98),rgba(17,19,21,.42) 24%,transparent 62%);
  pointer-events:none;
}
.r119-hero__copy{
  position:relative;
  z-index:6;
  grid-column:1;
  grid-row:1;
  align-self:end;
  padding:clamp(70px,9vh,120px) 5vw 7vh;
  max-width:860px;
}
.r119-hero__copy h1{
  margin:16px 0 24px;
  font-family:var(--ix-display);
  font-size:clamp(58px,6.4vw,112px);
  line-height:.88;
  letter-spacing:-.06em;
  max-width:9.2ch;
}
.r119-lede{
  margin:0 0 30px;
  max-width:39ch;
  font-size:clamp(16px,1.15vw,19px);
  line-height:1.62;
  color:rgba(255,255,255,.78);
}
.r119-hero__edge-index{
  position:absolute;
  z-index:7;
  right:18px;
  top:50%;
  width:18px;
  transform:translateY(-50%);
  display:grid;
  gap:8px;
}
.r119-hero__edge-index span{
  height:42px;
  border-left:1px solid rgba(255,255,255,.28);
}
.r119-hero__edge-index span:nth-child(2){border-left:3px solid var(--ix-red)}
.r119-beam--hero{display:none}

/* 02 — POSITIONING: layered editorial module, not full-page poster */
.r119-positioning{
  min-height:720px;
  display:grid;
  grid-template-columns:minmax(0,52%) minmax(0,48%);
  background:var(--ix-paper);
  color:var(--ix-ink);
  padding:84px 0 88px;
}
.r119-positioning__media{
  position:relative;
  grid-column:1;
  grid-row:1;
  width:calc(100% + 54px);
  height:560px;
  margin:0;
  align-self:center;
  overflow:hidden;
  box-shadow:var(--ix-shadow);
  z-index:2;
}
.r119-positioning__media img{
  width:100%;
  height:100%;
  object-fit:cover;
  object-position:60% center;
  filter:saturate(.62) contrast(1.12);
  transition:transform .8s var(--ix-ease);
}
.r119-positioning:hover .r119-positioning__media img{transform:scale(1.025)}
.r119-positioning__veil{
  position:absolute;
  z-index:3;
  left:0;
  top:84px;
  bottom:88px;
  width:54%;
  background:linear-gradient(90deg,rgba(180,23,26,.12),transparent 42%);
  pointer-events:none;
}
.r119-positioning__copy{
  position:relative;
  z-index:5;
  grid-column:2;
  grid-row:1;
  align-self:center;
  padding:56px 5vw 56px 7vw;
}
.r119-positioning__copy h2{
  margin:16px 0 28px;
  font-family:var(--ix-display);
  font-size:clamp(50px,5vw,82px);
  line-height:.92;
  letter-spacing:-.05em;
  max-width:10ch;
}
.r119-positioning__copy>p:last-child{
  max-width:36ch;
  margin:0;
  font-size:17px;
  line-height:1.68;
  color:rgba(10,11,12,.70);
}
.r119-positioning__identity{
  position:absolute;
  z-index:1;
  right:-5vw;
  bottom:-4vh;
  width:min(620px,44vw);
  opacity:.04;
  pointer-events:none;
}
.r119-positioning__identity .ix-v2-identity-main{width:100%!important;height:auto!important}
.r119-beam--positioning{display:none}

/* 03 — MATERIALS: structured product story + floating media */
.r119-materials{
  min-height:760px;
  display:grid;
  grid-template-columns:minmax(0,44%) minmax(0,56%);
  background:#dcd3c7;
  color:var(--ix-ink);
  padding:96px 5vw;
  align-items:center;
}
.r119-materials__copy{
  position:relative;
  z-index:5;
  grid-column:1;
  max-width:610px;
  padding-right:5vw;
}
.r119-materials__copy h2{
  margin:16px 0 28px;
  font-family:var(--ix-display);
  font-size:clamp(54px,5.2vw,90px);
  line-height:.9;
  letter-spacing:-.055em;
  max-width:9.5ch;
}
.r119-materials__copy .r119-service__body{
  max-width:32ch;
  margin:0;
  font-size:17px;
  line-height:1.68;
  color:rgba(10,11,12,.72);
}
.r119-materials__media{
  position:relative!important;
  inset:auto!important;
  grid-column:2;
  width:100%!important;
  height:560px!important;
  margin:0!important;
  opacity:1!important;
  overflow:hidden!important;
  box-shadow:var(--ix-shadow)!important;
  transform:translateY(24px);
  transition:transform .6s var(--ix-ease)!important;
}
.r119-materials:hover .r119-materials__media{transform:translateY(10px)}
.r119-materials__media img{
  width:100%!important;
  height:100%!important;
  object-fit:cover!important;
  object-position:58% center!important;
  transform:none!important;
  filter:saturate(.65) contrast(1.1) brightness(.92)!important;
}
.r119-materials__veil{display:none!important}
.r119-materials__structure{
  position:absolute;
  z-index:2;
  right:2vw;
  top:56px;
  width:34vw;
  height:620px;
  border:1px solid rgba(10,11,12,.14);
  background:
    repeating-linear-gradient(90deg,transparent 0 78px,rgba(10,11,12,.055) 78px 79px),
    repeating-linear-gradient(0deg,transparent 0 78px,rgba(10,11,12,.055) 78px 79px);
  pointer-events:none;
}
.r119-materials__structure span{position:absolute;display:block}
.r119-materials__structure span:nth-child(1){left:8%;top:16%;width:72%;height:4px;background:var(--ix-ink)}
.r119-materials__structure span:nth-child(2){right:16%;top:8%;width:4px;height:72%;background:var(--ix-red)}
.r119-materials__structure span:nth-child(3){left:14%;bottom:16%;width:42%;height:2px;background:rgba(10,11,12,.48)}
.r119-materials__edge{position:absolute;left:5vw;bottom:54px;width:15vw;height:3px;background:var(--ix-red)}
.r119-beam--materials{display:none}

/* 04 — SERVICES / REBAR: immersive media with floating service panel */
.r119-rebar{
  min-height:820px;
  display:grid;
  grid-template-columns:minmax(0,62%) minmax(0,38%);
  grid-template-rows:auto 1fr;
  background:linear-gradient(115deg,#090a0b 0%,#15181a 68%,#21090b 100%);
  color:white;
  padding:86px 5vw;
}
.r119-rebar__photo{
  position:absolute;
  inset:0 34% 0 0;
  margin:0;
  overflow:hidden;
  z-index:0;
}
.r119-rebar__photo img{
  width:100%;
  height:100%;
  object-fit:cover;
  object-position:58% center;
  filter:saturate(.42) contrast(1.18) brightness(.70);
  transition:transform .85s var(--ix-ease);
}
.r119-rebar:hover .r119-rebar__photo img{transform:scale(1.025)}
.r119-rebar__media{
  position:absolute;
  inset:0 34% 0 0;
  z-index:1;
  pointer-events:none;
  background:
    repeating-linear-gradient(102deg,transparent 0 86px,rgba(255,255,255,.035) 86px 87px),
    repeating-linear-gradient(12deg,transparent 0 122px,rgba(180,23,26,.10) 122px 123px);
}
.r119-rebar__veil{
  position:absolute;
  inset:0;
  z-index:2;
  background:linear-gradient(90deg,rgba(10,11,12,.12) 0%,rgba(10,11,12,.22) 48%,rgba(10,11,12,.94) 69%,rgba(10,11,12,1) 100%);
  pointer-events:none;
}
.r119-rebar__title{
  position:relative;
  z-index:4;
  grid-column:1 / span 2;
  width:min(800px,58vw);
}
.r119-rebar__title h2{
  margin:8px 0 0;
  font-family:var(--ix-display);
  font-size:clamp(54px,5.6vw,96px);
  line-height:.9;
  letter-spacing:-.055em;
  max-width:9ch;
}
.r119-rebar__body{
  position:relative;
  z-index:5;
  grid-column:2;
  align-self:end;
  margin-left:4vw;
  padding:30px;
  background:rgba(255,255,255,.06);
  border:1px solid rgba(255,255,255,.16);
  backdrop-filter:blur(14px);
  box-shadow:0 24px 70px rgba(0,0,0,.20);
}
.r119-rebar__body p{margin:0 0 14px;font-size:15px;line-height:1.65;color:rgba(255,255,255,.76)}
.r119-rebar__body p:last-child{margin-bottom:0}
.r119-beam--rebar{display:none}

/* 05 — PROOF: compact commercial evidence, no giant poster field */
.r119-proof{
  min-height:0;
  background:var(--ix-white);
  color:var(--ix-ink);
  padding:86px 5vw 76px;
}
.r119-proof__head{
  display:grid;
  grid-template-columns:minmax(0,32%) minmax(0,68%);
  gap:5vw;
  align-items:end;
  padding-bottom:38px;
  border-bottom:1px solid rgba(10,11,12,.24);
}
.r119-proof__head h2{
  margin:0;
  font-family:var(--ix-display);
  font-size:clamp(42px,4.2vw,72px);
  line-height:.94;
  letter-spacing:-.045em;
  max-width:12ch;
}
.r119-proof__facts{
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  border-bottom:1px solid rgba(10,11,12,.22);
}
.r119-proof__facts article,
.r119-proof__facts article:nth-child(2),
.r119-proof__facts article:nth-child(3){
  min-height:260px;
  margin:0!important;
  padding:32px 28px 28px 0!important;
  display:flex;
  flex-direction:column;
  gap:18px;
  border-right:1px solid rgba(10,11,12,.14);
  transition:transform .35s var(--ix-ease),background-color .35s var(--ix-ease),padding-left .35s var(--ix-ease);
}
.r119-proof__facts article:nth-child(2),.r119-proof__facts article:nth-child(3){padding-left:28px!important}
.r119-proof__facts article:last-child{border-right:0}
.r119-proof__facts article:hover{transform:translateY(-6px);background:rgba(180,23,26,.035)}
.r119-proof__facts article>div{display:flex;flex-direction:column;gap:8px}
.r119-proof__facts strong{
  font-family:var(--ix-display);
  font-size:clamp(25px,2.2vw,38px);
  line-height:1;
  letter-spacing:-.035em;
  max-width:14ch;
}
.r119-proof__facts p{margin:auto 0 0;max-width:34ch;font-size:14px;line-height:1.65;color:rgba(10,11,12,.64)}
.r119-proof__label{font-size:9px;text-transform:uppercase;letter-spacing:.16em;font-weight:800;color:var(--ix-red)}
.r119-proof__mark{width:34px;height:3px;background:var(--ix-red)}
.r119-proof__locality{margin-top:24px;font-size:11px;letter-spacing:.10em;text-transform:uppercase;color:rgba(10,11,12,.48)}
.r119-beam--proof{display:none}

/* 06 — PARTNER: compact premium partnership module */
.r119-partner{
  min-height:560px;
  display:grid!important;
  grid-template-columns:minmax(0,34%) minmax(0,66%);
  gap:4vw!important;
  align-items:center;
  background:#17191b!important;
  color:white!important;
  padding:76px 5vw!important;
}
.r119-partner__label{
  position:relative!important;
  z-index:3!important;
  width:auto!important;
  padding:0!important;
  align-self:center;
}
.r119-partner__label>p:last-child{max-width:30ch;font-size:16px;line-height:1.65;color:rgba(255,255,255,.66)}
.r119-partner__frame{position:absolute;left:0;bottom:-34px;width:82px;height:2px;background:var(--ix-red)}
.r119-partner .r119-proof__partner{
  position:relative!important;
  inset:auto!important;
  min-height:400px!important;
  width:100%!important;
  margin:0!important;
  padding:54px 5vw!important;
  display:flex!important;
  flex-direction:column!important;
  align-items:center!important;
  justify-content:center!important;
  gap:28px!important;
  background:var(--ix-paper)!important;
  color:var(--ix-ink)!important;
  box-shadow:var(--ix-shadow-deep)!important;
  transition:transform .45s var(--ix-ease),box-shadow .45s var(--ix-ease)!important;
}
.r119-partner .r119-proof__partner:hover{transform:translateY(-6px);box-shadow:0 54px 140px rgba(0,0,0,.38)!important}
.r119-partner .r119-proof__partner img{width:min(480px,70%);max-height:170px;object-fit:contain;filter:none!important}
.r119-partner .r119-proof__partner strong{
  max-width:16ch!important;
  font-family:var(--ix-display);
  font-size:clamp(34px,3.6vw,60px);
  line-height:.96;
  letter-spacing:-.04em;
  text-align:center;
}
.r119-beam--partner{display:none!important}

/* 07 — BRIDGE: sales moment, visually alive but compact */
.r119-contact{
  min-height:430px;
  display:grid;
  grid-template-columns:minmax(0,62%) minmax(0,38%);
  align-items:center;
  gap:5vw;
  background:linear-gradient(115deg,#a91316 0%,#c41e21 56%,#821014 100%)!important;
  color:white!important;
  padding:72px 5vw!important;
}
.r119-contact__meta{position:relative;z-index:4;width:auto!important}
.r119-contact__meta .r119-kicker{color:rgba(255,255,255,.68)}
.r119-contact__meta p:last-child{
  margin:16px 0 0;
  max-width:18ch;
  font-family:var(--ix-display);
  font-size:clamp(38px,4vw,66px);
  line-height:.94;
  letter-spacing:-.045em;
}
.r119-contact__locality{display:none}
.r119-contact__link{
  position:relative!important;
  inset:auto!important;
  z-index:5;
  width:100%!important;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:24px;
  padding:24px 0;
  border-top:1px solid rgba(255,255,255,.72);
  border-bottom:1px solid rgba(255,255,255,.24);
  color:white;
  text-decoration:none;
  font-size:14px;
  font-weight:800;
  transition:transform .35s var(--ix-ease),padding .35s var(--ix-ease);
}
.r119-contact__link:hover{transform:translateX(8px);padding-left:8px}
.r119-contact__link span:last-child{font-size:26px}
.r119-beam--contact{display:none}

/* 08 — FINAL: website close, not another full-screen poster */
.r119-close{
  min-height:560px;
  display:grid;
  grid-template-columns:minmax(0,65%) minmax(260px,35%);
  align-items:end;
  gap:4vw;
  background:linear-gradient(105deg,#090a0b 0%,#151718 72%,#26090b 100%)!important;
  color:white;
  padding:86px 5vw 72px;
}
.r119-close__copy{width:auto!important}
.r119-close__copy h2{
  margin:14px 0 22px;
  font-family:var(--ix-display);
  font-size:clamp(58px,6vw,104px);
  line-height:.86;
  letter-spacing:-.06em;
  max-width:8ch;
}
.r119-close__copy>p:last-child{margin:0;max-width:34ch;font-size:16px;line-height:1.65;color:rgba(255,255,255,.66)}
.r119-close>.r119-btn{
  position:relative!important;
  inset:auto!important;
  width:100%!important;
  min-height:180px!important;
  align-self:end;
  padding:30px!important;
  box-shadow:0 28px 70px rgba(0,0,0,.22);
}
.r119-close>.r119-btn:hover{transform:translateY(-6px)!important}
.r119-beam--close{display:none}

/* footer integrated with site, not another unrelated slab */
.ix-v2-footer{
  background:#090a0b!important;
  color:white!important;
  padding:64px 5vw!important;
  border-top:1px solid rgba(255,255,255,.12)!important;
}
.ix-v2-footer-grid{
  padding-top:28px!important;
  border-top:1px solid rgba(255,255,255,.14)!important;
  grid-template-columns:1.2fr .6fr 1fr!important;
  gap:54px!important;
}

/* intermediate viewport is a first-class layout */
@media(min-width:701px) and (max-width:1180px){
  .r119-hero{grid-template-columns:minmax(0,51%) minmax(0,49%)}
  .r119-hero__copy{padding-left:32px;padding-right:32px}
  .r119-hero__copy h1{font-size:clamp(52px,6.8vw,78px)}
  .r119-positioning{grid-template-columns:minmax(0,48%) minmax(0,52%);padding:64px 0}
  .r119-positioning__media{height:500px;width:calc(100% + 26px)}
  .r119-positioning__copy{padding-left:52px;padding-right:32px}
  .r119-positioning__copy h2{font-size:clamp(46px,5.6vw,66px)}
  .r119-materials{grid-template-columns:minmax(0,46%) minmax(0,54%);padding:72px 32px}
  .r119-materials__copy{padding-right:32px}
  .r119-materials__copy h2{font-size:clamp(48px,5.8vw,72px)}
  .r119-materials__media{height:500px!important}
  .r119-materials__structure{right:-8vw;width:44vw;height:560px}
  .r119-rebar{grid-template-columns:minmax(0,58%) minmax(0,42%);padding:70px 32px}
  .r119-rebar__photo,.r119-rebar__media{right:39%}
  .r119-rebar__veil{background:linear-gradient(90deg,rgba(10,11,12,.12),rgba(10,11,12,.90) 64%,rgba(10,11,12,1))}
  .r119-rebar__body{margin-left:28px}
  .r119-proof{padding:72px 32px 62px}
  .r119-proof__facts article,.r119-proof__facts article:nth-child(2),.r119-proof__facts article:nth-child(3){padding-left:20px!important;padding-right:20px!important}
  .r119-partner{grid-template-columns:minmax(0,38%) minmax(0,62%);padding:62px 32px!important}
  .r119-contact{grid-template-columns:minmax(0,58%) minmax(0,42%);padding:62px 32px!important}
  .r119-close{padding:72px 32px 58px;grid-template-columns:minmax(0,60%) minmax(260px,40%)}
  .r119-close__copy h2{font-size:clamp(54px,6.4vw,82px)}
}

/* mobile: native composition, not scaled desktop */
@media(max-width:700px){
  .ix-v2-header{position:sticky!important}
  .ix-v2-header-inner{min-height:68px!important;padding-left:18px!important;padding-right:18px!important}
  .ix-v2-nav{display:none!important}
  .ix-v2-header-cta{min-height:40px!important;padding:0 12px!important;font-size:10px!important}

  .r119-hero{min-height:0;display:flex;flex-direction:column;background:var(--ix-carbon)}
  .r119-hero__media{order:1;min-height:54svh;height:54svh;width:100%;box-shadow:none}
  .r119-hero__media img{object-position:60% center;transform:none}
  .r119-hero__veil{display:none}
  .r119-hero__copy{order:2;padding:42px 18px 38px;max-width:none}
  .r119-hero__copy h1{font-size:clamp(46px,12vw,60px);line-height:.9;max-width:9.2ch}
  .r119-lede{font-size:15px;max-width:31ch}
  .r119-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .r119-btn{min-height:50px;padding:0 12px;font-size:10px;gap:10px}
  .r119-hero__edge-index{display:none}

  .r119-positioning{min-height:0;display:flex;flex-direction:column;padding:0}
  .r119-positioning__media{order:1;width:100%;height:44svh;box-shadow:none}
  .r119-positioning__copy{order:2;padding:48px 18px 58px}
  .r119-positioning__copy h2{font-size:clamp(44px,11.5vw,58px);max-width:9.4ch}
  .r119-positioning__copy>p:last-child{font-size:15px;max-width:31ch}
  .r119-positioning__identity{width:96vw;right:-30vw;bottom:-4vw}

  .r119-materials{min-height:0;display:flex;flex-direction:column;padding:0}
  .r119-materials__media{order:1;width:100%!important;height:44svh!important;transform:none;box-shadow:none!important}
  .r119-materials__copy{order:2;padding:48px 18px 64px}
  .r119-materials__copy h2{font-size:clamp(46px,12vw,62px);max-width:9ch}
  .r119-materials__copy .r119-service__body{font-size:15px;max-width:30ch}
  .r119-materials__structure{right:-52vw;top:36svh;width:104vw;height:52svh;opacity:.28}
  .r119-materials__edge{left:18px;bottom:34px;width:32vw}

  .r119-rebar{min-height:0;display:flex;flex-direction:column;padding:0;background:linear-gradient(160deg,#090a0b,#15181a 72%,#21090b)}
  .r119-rebar__photo{position:relative;inset:auto;height:52svh;order:1}
  .r119-rebar__media{inset:0;height:52svh}
  .r119-rebar__veil{display:none}
  .r119-rebar__title{order:2;width:auto;padding:44px 18px 0}
  .r119-rebar__title h2{font-size:clamp(46px,12vw,62px);max-width:9ch}
  .r119-rebar__body{order:3;margin:28px 18px 52px;padding:20px}
  .r119-rebar__body p{font-size:14px}

  .r119-proof{padding:58px 18px 48px}
  .r119-proof__head{display:block;padding-bottom:30px}
  .r119-proof__head h2{margin-top:14px;font-size:clamp(42px,11vw,56px);max-width:10ch}
  .r119-proof__facts{display:block}
  .r119-proof__facts article,.r119-proof__facts article:nth-child(2),.r119-proof__facts article:nth-child(3){
    min-height:0;padding:26px 0!important;border-right:0;border-bottom:1px solid rgba(10,11,12,.14)
  }
  .r119-proof__facts article:hover{transform:none;background:transparent}
  .r119-proof__facts p{margin:0;max-width:30ch}
  .r119-proof__locality{font-size:10px;line-height:1.5}

  .r119-partner{min-height:0;display:flex!important;flex-direction:column;gap:30px!important;padding:54px 18px 30px!important}
  .r119-partner__label{width:auto!important;max-width:30ch}
  .r119-partner .r119-proof__partner{min-height:300px!important;width:100%!important;padding:40px 20px!important;box-shadow:0 24px 60px rgba(0,0,0,.28)!important}
  .r119-partner .r119-proof__partner img{width:min(300px,82%);max-height:110px}
  .r119-partner .r119-proof__partner strong{font-size:clamp(32px,9.2vw,46px);max-width:10ch!important}

  .r119-contact{min-height:0;display:block;padding:54px 18px 42px!important}
  .r119-contact__meta p:last-child{font-size:clamp(38px,10.5vw,52px);max-width:11ch}
  .r119-contact__link{margin-top:46px;padding:20px 0}

  .r119-close{min-height:0;display:block;padding:58px 18px 30px}
  .r119-close__copy h2{font-size:clamp(50px,13vw,66px);max-width:8ch}
  .r119-close__copy>p:last-child{font-size:14px;max-width:30ch}
  .r119-close>.r119-btn{margin-top:38px;min-height:72px!important;padding:0 18px!important}

  .ix-v2-footer{padding:50px 18px!important}
  .ix-v2-footer-grid{grid-template-columns:1fr!important;gap:34px!important}
}

@media(prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  .r119-btn,.ix-v2-nav a,.ix-v2-header-cta,.r119-hero__media img,.r119-positioning__media img,.r119-materials__media,.r119-rebar__photo img,.r119-proof__facts article,.r119-partner .r119-proof__partner,.r119-contact__link{
    transition:none!important
  }
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
      implementation_notes:"R119 V29 PRODUCTIZED EXPERIENCE HARD RESET: clean CSS architecture, commercial pacing, layered media, three distinct section grammars, tablet/laptop breakpoint, micro-interactions, responsive mobile recomposition and strict anti-poster rules."+mode+". A jury-reset mode radically flips hero alignment, positioning/media order, materials balance, proof surface and commercial bridge rather than replaying the same composition."
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
  if(!/\.r119-hero\s*\{[^}]*grid-template-columns/i.test(styles) || !/\.r119-positioning\s*\{[^}]*grid-template-columns/i.test(styles) || !/\.r119-materials\s*\{[^}]*grid-template-columns/i.test(styles)) {
    issues.push("R119_THREE_DISTINCT_LAYOUT_GRAMMARS_REQUIRED");
  }
  if(String(spec?.scene_composer_standard||"")!==R119_SCENE_COMPOSER_STANDARD) issues.push("R119_SCENE_COMPOSER_STANDARD_REQUIRED");
  if(String(spec?.perceptual_flagship_standard||"")!=="R118_PERCEPTUAL_JURY_V1") issues.push("R119_R118_JURY_REQUIRED");
  return issues;
}
