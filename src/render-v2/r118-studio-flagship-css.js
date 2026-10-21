export const R118_STUDIO_FLAGSHIP_CSS = `
/* R118 PERCEPTUAL JURY — Studio-grade spatial direction.
   Not a polish layer: breaks the repeated shell/section rhythm and turns the page into authored scenes. */
:root{
  --ix-r118-display:clamp(88px,10.2vw,176px);
  --ix-r118-scene-gap:clamp(120px,14vw,240px);
  --ix-r118-hairline:rgba(17,17,17,.18);
}

/* HERO: one cinematic field, not "copy + image" */
.ixf-hero{
  min-height:100svh!important;
  position:relative!important;
  isolation:isolate!important;
  overflow:hidden!important;
}
.ixf-hero__media{position:absolute!important;inset:0!important;margin:0!important}
.ixf-hero__media img{
  width:100%!important;height:100%!important;object-fit:cover!important;
  object-position:64% 48%!important;
  transform:scale(1.025)!important;
  filter:saturate(.58) contrast(1.19) brightness(.72)!important;
}
.ixf-hero__veil{
  position:absolute!important;inset:0!important;
  background:
    linear-gradient(90deg,rgba(5,6,7,.98) 0%,rgba(5,6,7,.92) 24%,rgba(5,6,7,.40) 58%,rgba(5,6,7,.02) 84%),
    linear-gradient(180deg,rgba(0,0,0,.10),transparent 54%,rgba(0,0,0,.76))!important;
}
.ixf-hero__inner{
  position:relative!important;z-index:2!important;
  min-height:100svh!important;
  width:min(1600px,94vw)!important;
  display:flex!important;align-items:flex-end!important;
  padding:clamp(150px,18vh,230px) 0 clamp(58px,7vh,92px)!important;
}
.ixf-hero__copy{max-width:min(1020px,74vw)!important}
.ixf-hero__copy h1{
  font-size:clamp(92px,10.6vw,180px)!important;
  line-height:.77!important;letter-spacing:-.082em!important;
  max-width:7.1ch!important;margin:0!important;
}
.ixf-hero__copy .ixg-kicker{
  position:absolute!important;left:0!important;top:118px!important;
  font-size:10px!important;letter-spacing:.18em!important;text-transform:uppercase!important;
}
.ixf-hero__copy .ixg-lede{
  max-width:43ch!important;margin:34px 0 0!important;
  font-size:clamp(16px,1.05vw,19px)!important;line-height:1.5!important;
}
.ixf-hero .ixg-actions{margin-top:34px!important;gap:10px!important}
.ixf-hero .ixg-cta{border-radius:0!important;min-height:58px!important}
.ixf-hero .ixg-cta--secondary{
  background:transparent!important;border-color:rgba(255,255,255,.36)!important;
}
.ixf-hero__signature{
  position:absolute!important;right:0!important;bottom:54px!important;
  width:min(44vw,720px)!important;height:52px!important;
  display:grid!important;grid-template-columns:1fr .34fr .12fr!important;gap:8px!important;
}
.ixf-hero__signature i{display:block!important;background:rgba(255,255,255,.72)!important}
.ixf-hero__signature i:nth-child(2){opacity:.46!important}
.ixf-hero__signature i:nth-child(3){opacity:.22!important}

/* POSITIONING: oversized editorial manifesto with image as architecture */
.ixf-positioning{
  padding:0!important;background:#f2f0eb!important;color:#101214!important;
  min-height:1100px!important;overflow:hidden!important;
}
.ixf-positioning__grid{
  width:min(1680px,96vw)!important;min-height:1100px!important;
  display:grid!important;
  grid-template-columns:minmax(0,.88fr) minmax(0,.38fr) minmax(560px,.74fr)!important;
  grid-template-rows:auto 1fr!important;
  column-gap:0!important;align-items:stretch!important;
}
.ixf-positioning__statement{
  grid-column:1/3!important;grid-row:1!important;
  padding:clamp(130px,12vw,200px) clamp(36px,4vw,70px) 68px 0!important;
  align-self:start!important;z-index:2!important;
}
.ixf-positioning__statement h2{
  font-size:clamp(78px,8.6vw,144px)!important;
  line-height:.80!important;letter-spacing:-.075em!important;
  max-width:8ch!important;margin:0!important;
}
.ixf-positioning__body{
  grid-column:1/2!important;grid-row:2!important;
  padding:56px clamp(52px,6vw,96px) 120px 0!important;
  border-top:1px solid var(--ix-r118-hairline)!important;
  align-self:end!important;
}
.ixf-positioning__body p{max-width:40ch!important;font-size:clamp(17px,1.25vw,21px)!important}
.ixf-positioning__media{
  grid-column:3!important;grid-row:1/3!important;
  width:calc(100% + 4vw)!important;min-height:1100px!important;
  margin-right:-4vw!important;position:relative!important;
}
.ixf-positioning__media img{
  width:100%!important;height:100%!important;object-fit:cover!important;
  filter:saturate(.62) contrast(1.12)!important;
}

/* SERVICES: a typographic chapter, not a collection of modules */
.ixf-services{
  padding:clamp(160px,15vw,260px) 0!important;
  background:#0b0d0e!important;color:#f7f6f2!important;
}
.ixf-services .ixg-shell{width:min(1640px,94vw)!important}
.ixf-services .ixg-section-head{
  display:grid!important;grid-template-columns:180px minmax(0,1fr)!important;
  gap:clamp(54px,8vw,140px)!important;align-items:start!important;
  margin-bottom:clamp(90px,9vw,150px)!important;
}
.ixf-services .ixg-kicker{
  font-size:10px!important;letter-spacing:.19em!important;text-transform:uppercase!important;
  padding-top:16px!important;
}
.ixf-services .ixg-section-intro{
  max-width:16ch!important;font-size:clamp(62px,6.9vw,116px)!important;
  line-height:.82!important;letter-spacing:-.07em!important;
}
.ixg-services__grid{display:block!important}
.ixf-service-line{
  position:relative!important;
  display:grid!important;grid-template-columns:150px minmax(0,1fr) 90px!important;
  gap:clamp(26px,4vw,66px)!important;
  min-height:clamp(390px,34vw,560px)!important;
  padding:clamp(70px,7vw,120px) 0!important;
  border-top:1px solid rgba(255,255,255,.24)!important;
}
.ixf-service-line:last-child{border-bottom:1px solid rgba(255,255,255,.24)!important}
.ixf-service-line:nth-child(even){padding-left:clamp(100px,12vw,210px)!important}
.ixf-service-line__index{align-self:start!important;min-height:100%!important;position:relative!important}
.ixf-service-line__mark{
  width:100%!important;height:100%!important;display:grid!important;
  grid-template-columns:1fr 1px 1px!important;gap:10px!important;
}
.ixf-service-line__mark i{display:block!important;background:rgba(255,255,255,.28)!important}
.ixf-service-line__copy{align-self:center!important}
.ixf-service-line__title{
  max-width:12ch!important;
  font-size:clamp(72px,7.7vw,132px)!important;line-height:.80!important;
  letter-spacing:-.078em!important;margin:0!important;
}
.ixf-service-line__body{max-width:42ch!important;margin-top:30px!important;font-size:18px!important}
.ixf-service-line__rule{align-self:stretch!important;width:1px!important;background:rgba(255,255,255,.18)!important}

/* FEATURE SCENES: each one behaves like a magazine spread */
.ixg-feature--one,.ixg-feature--two{
  padding:0!important;min-height:1050px!important;overflow:hidden!important;
}
.ixg-feature--one{background:#f4f1ea!important;color:#101214!important}
.ixg-feature--two{background:#161819!important;color:#f7f6f2!important}
.ixg-feature--one .ixf-feature__grid,
.ixg-feature--two .ixf-feature__grid{
  width:100%!important;max-width:none!important;min-height:1050px!important;
  display:grid!important;gap:0!important;
}
.ixg-feature--one .ixf-feature__grid{grid-template-columns:minmax(430px,.58fr) minmax(0,1.42fr)!important}
.ixg-feature--two .ixf-feature__grid{grid-template-columns:minmax(0,1.38fr) minmax(430px,.62fr)!important}
.ixg-feature--one .ixg-feature__copy,
.ixg-feature--two .ixg-feature__copy{
  padding:clamp(100px,9vw,160px) clamp(54px,6vw,104px)!important;
  display:flex!important;flex-direction:column!important;justify-content:flex-end!important;
}
.ixg-feature--two .ixg-feature__copy{grid-column:2!important}
.ixg-feature--two .ixg-feature__stage{grid-column:1!important;grid-row:1!important}
.ixg-feature__copy h2{
  font-size:clamp(72px,7vw,122px)!important;line-height:.82!important;
  letter-spacing:-.074em!important;max-width:8.5ch!important;margin:0 0 34px!important;
}
.ixg-feature__copy .ixg-section-intro{max-width:34ch!important;font-size:18px!important;line-height:1.55!important}
.ixg-feature__evidence{margin-top:54px!important;border-top:1px solid currentColor!important;opacity:.88!important}
.ixg-feature__evidence-row{padding:18px 0!important;border-bottom:1px solid currentColor!important;border-radius:0!important}
.ixg-feature__stage{min-height:1050px!important;margin:0!important;position:relative!important}
.ixg-feature__stage figure{position:absolute!important;inset:0!important;margin:0!important}
.ixg-feature__stage img{width:100%!important;height:100%!important;object-fit:cover!important}
.ixg-feature--one .ixg-feature__stage img{filter:saturate(.64) contrast(1.13)!important}
.ixg-feature--two .ixg-feature__stage img{filter:saturate(.50) contrast(1.20) brightness(.82)!important}
.ixg-feature__device{
  position:absolute!important;right:34px!important;bottom:34px!important;
  width:160px!important;height:160px!important;border:1px solid rgba(255,255,255,.34)!important;
  display:grid!important;grid-template-columns:repeat(3,1fr)!important;
}

/* kill decorative filler band */
.ixm-graphic-band{display:none!important}

/* TRUST: proof wall, not cards */
.ixg-trust-section{
  min-height:1000px!important;padding:0!important;position:relative!important;
  display:flex!important;align-items:stretch!important;background:#0c0e0f!important;
}
.ixg-trust-section .ixg-trust-bg{position:absolute!important;inset:0!important;margin:0!important}
.ixg-trust-section .ixg-trust-bg img{
  width:100%!important;height:100%!important;object-fit:cover!important;
  filter:saturate(.35) contrast(1.2) brightness(.44)!important;
}
.ixg-trust-bg__veil{position:absolute!important;inset:0!important;background:linear-gradient(90deg,rgba(4,5,6,.96),rgba(4,5,6,.63) 58%,rgba(4,5,6,.36))!important}
.ixg-trust-section .ixg-shell{
  position:relative!important;z-index:2!important;width:min(1640px,94vw)!important;
  padding:clamp(150px,13vw,220px) 0!important;
}
.ixg-trust-section .ixg-section-head{
  display:grid!important;grid-template-columns:190px minmax(0,1fr)!important;
  gap:clamp(60px,8vw,140px)!important;margin-bottom:110px!important;
}
.ixg-trust-section .ixg-section-intro{
  font-size:clamp(70px,7.6vw,128px)!important;line-height:.80!important;letter-spacing:-.075em!important;
  max-width:13ch!important;
}
.ixg-trust-reasons{
  display:grid!important;grid-template-columns:repeat(3,1fr)!important;
  border-top:1px solid rgba(255,255,255,.32)!important;
}
.ixg-trust-reason{
  min-height:390px!important;padding:42px 42px 44px 0!important;
  background:transparent!important;border:0!important;border-right:1px solid rgba(255,255,255,.18)!important;
  display:flex!important;flex-direction:column!important;justify-content:space-between!important;
}
.ixg-trust-reason:last-child{border-right:0!important;padding-left:42px!important}
.ixg-trust-reason:nth-child(2){padding-left:42px!important}
.ixg-trust-reason__graphic{height:92px!important;width:100%!important;display:grid!important;grid-template-columns:1fr .22fr .08fr!important;gap:8px!important}
.ixg-trust-reason__graphic i{display:block!important;background:rgba(255,255,255,.35)!important}
.ixg-trust-reason strong{
  max-width:14ch!important;font-size:clamp(27px,2.3vw,42px)!important;line-height:.96!important;
}

/* PARTNER: one museum wall */
.ixg-partner-proof{padding:0!important;background:#efede7!important;color:#111!important}
.ixg-partner-proof .ixg-shell{width:100%!important;max-width:none!important}
.ixg-partner-proof .ixg-section-head{
  width:min(1600px,92vw)!important;margin:0 auto!important;
  padding:110px 0 52px!important;border-bottom:1px solid var(--ix-r118-hairline)!important;
}
.ixg-partner-proof__grid{display:block!important}
.ixf-partner-feature{
  min-height:760px!important;display:grid!important;
  grid-template-columns:minmax(520px,.78fr) minmax(0,1.22fr)!important;
  border:0!important;
}
.ixf-partner-feature__identity{
  padding:clamp(80px,8vw,130px)!important;
  display:flex!important;align-items:center!important;justify-content:center!important;
  border-right:1px solid var(--ix-r118-hairline)!important;
}
.ixg-partner-logo{width:min(390px,72%)!important;max-height:220px!important;object-fit:contain!important}
.ixf-partner-feature__copy{
  padding:clamp(90px,9vw,150px)!important;
  display:flex!important;align-items:flex-end!important;
}
.ixf-partner-feature__copy strong{
  max-width:8.5ch!important;font-size:clamp(82px,8.6vw,146px)!important;
  line-height:.78!important;letter-spacing:-.078em!important;
}

/* BRIDGE: a deliberate breath before close */
.ixm-bridge{
  padding:0!important;background:#f7f6f2!important;color:#111!important;
  border-top:1px solid var(--ix-r118-hairline)!important;border-bottom:1px solid var(--ix-r118-hairline)!important;
}
.ixm-bridge__grid{
  width:min(1640px,94vw)!important;min-height:480px!important;
  display:grid!important;grid-template-columns:minmax(0,1fr) 340px!important;gap:80px!important;
  align-items:center!important;
}
.ixm-bridge__copy h2{
  font-size:clamp(84px,9.4vw,158px)!important;line-height:.78!important;
  letter-spacing:-.08em!important;max-width:6.8ch!important;
}
.ixm-bridge .ixg-actions{height:190px!important}
.ixm-bridge .ixg-cta--secondary{min-height:190px!important;border-radius:0!important}

/* CLOSE: nearly empty, huge and confident */
.ixg-contact{
  min-height:100svh!important;padding:0!important;
  background:#0a0c0d!important;color:#f7f6f2!important;
  position:relative!important;overflow:hidden!important;
}
.ixg-contact__inner{
  min-height:100svh!important;width:min(1640px,94vw)!important;
  display:flex!important;flex-direction:column!important;justify-content:flex-end!important;
  padding:clamp(140px,15vh,210px) 0 64px!important;
}
.ixg-contact h2{
  font-size:clamp(106px,11.7vw,198px)!important;line-height:.73!important;
  letter-spacing:-.085em!important;max-width:6.4ch!important;margin:0!important;
}
.ixg-contact .ixg-section-intro{max-width:36ch!important;margin-top:34px!important}
.ixg-contact .ixg-actions{
  position:absolute!important;right:3vw!important;bottom:64px!important;
  width:clamp(300px,24vw,410px)!important;height:220px!important;
}
.ixg-contact .ixg-cta--primary{min-height:220px!important;border-radius:0!important}
.ixr89-watermark{opacity:.035!important;transform:scale(1.7)!important;transform-origin:right bottom!important}

/* MOBILE: recut, not stacked desktop */
@media(max-width:700px){
  .ixf-hero{min-height:94svh!important}
  .ixf-hero__inner{width:calc(100% - 36px)!important;min-height:94svh!important;padding:108px 0 34px!important}
  .ixf-hero__copy{max-width:100%!important}
  .ixf-hero__copy h1{font-size:clamp(58px,17vw,86px)!important;line-height:.78!important;max-width:7.2ch!important}
  .ixf-hero__copy .ixg-kicker{top:88px!important}
  .ixf-hero__copy .ixg-lede{font-size:15px!important;max-width:29ch!important}
  .ixf-hero .ixg-actions{display:grid!important;grid-template-columns:1fr!important;width:100%!important}
  .ixf-hero .ixg-cta{min-height:54px!important;width:100%!important}
  .ixf-hero__signature{display:none!important}

  .ixf-positioning{min-height:0!important}
  .ixf-positioning__grid{width:100%!important;min-height:0!important;display:block!important}
  .ixf-positioning__statement{padding:96px 18px 46px!important}
  .ixf-positioning__statement h2{font-size:clamp(58px,16vw,82px)!important;line-height:.80!important;max-width:7.4ch!important}
  .ixf-positioning__body{padding:36px 18px 72px!important;border-top:1px solid var(--ix-r118-hairline)!important}
  .ixf-positioning__media{width:100%!important;min-height:72svh!important;margin:0!important}
    .ixf-positioning__media .ixg-section-visual{min-height:72svh!important}

  .ixf-services{padding:96px 0 112px!important}
  .ixf-services .ixg-shell{width:calc(100% - 36px)!important}
  .ixf-services .ixg-section-head{display:block!important;margin-bottom:58px!important}
  .ixf-services .ixg-section-intro{font-size:clamp(44px,13vw,64px)!important;max-width:13ch!important;margin-top:20px!important}
  .ixf-service-line,.ixf-service-line:nth-child(even){
    display:block!important;min-height:0!important;padding:58px 0 70px!important;
  }
  .ixf-service-line__index{height:58px!important;min-height:58px!important;margin-bottom:36px!important}
  .ixf-service-line__mark{width:42%!important}
  .ixf-service-line__title{font-size:clamp(50px,14vw,72px)!important;max-width:10ch!important}
  .ixf-service-line__rule{display:none!important}

  .ixg-feature--one,.ixg-feature--two{min-height:0!important}
  .ixg-feature--one .ixf-feature__grid,.ixg-feature--two .ixf-feature__grid{display:flex!important;flex-direction:column!important;min-height:0!important}
  .ixg-feature--one .ixg-feature__copy,.ixg-feature--two .ixg-feature__copy{
    order:1!important;padding:92px 18px 58px!important;
  }
  .ixg-feature--one .ixg-feature__stage,.ixg-feature--two .ixg-feature__stage{
    order:2!important;position:relative!important;min-height:78svh!important;width:100%!important;
  }
  .ixg-feature__copy h2{font-size:clamp(54px,15vw,76px)!important;line-height:.80!important;max-width:8ch!important}
  .ixg-feature__device{width:96px!important;height:96px!important;right:18px!important;bottom:18px!important}

  .ixg-trust-section{min-height:0!important}
  .ixg-trust-section .ixg-shell{width:calc(100% - 36px)!important;padding:100px 0!important}
  .ixg-trust-section .ixg-section-head{display:block!important;margin-bottom:58px!important}
  .ixg-trust-section .ixg-section-intro{font-size:clamp(48px,14vw,68px)!important;max-width:11ch!important;margin-top:20px!important}
  .ixg-trust-reasons{display:block!important}
  .ixg-trust-reason,.ixg-trust-reason:nth-child(2),.ixg-trust-reason:last-child{
    min-height:280px!important;padding:34px 0!important;border-right:0!important;border-bottom:1px solid rgba(255,255,255,.2)!important;
  }
  .ixg-trust-reason__graphic{width:45%!important;height:70px!important}
  .ixg-trust-reason strong{font-size:clamp(30px,8vw,40px)!important}

  .ixg-partner-proof .ixg-section-head{width:calc(100% - 36px)!important;padding:78px 0 34px!important}
  .ixf-partner-feature{display:block!important;min-height:0!important}
  .ixf-partner-feature__identity{min-height:300px!important;padding:60px 18px!important;border-right:0!important;border-bottom:1px solid var(--ix-r118-hairline)!important}
  .ixf-partner-feature__copy{min-height:430px!important;padding:70px 18px!important}
  .ixf-partner-feature__copy strong{font-size:clamp(56px,16vw,82px)!important;max-width:7.5ch!important}

  .ixm-bridge__grid{width:calc(100% - 36px)!important;min-height:520px!important;display:flex!important;flex-direction:column!important;justify-content:center!important;gap:44px!important}
  .ixm-bridge__copy h2{font-size:clamp(60px,17vw,88px)!important;max-width:6.6ch!important}
  .ixm-bridge .ixg-actions{height:82px!important;width:100%!important}
  .ixm-bridge .ixg-cta--secondary{min-height:82px!important;width:100%!important}

  .ixg-contact{min-height:88svh!important}
  .ixg-contact__inner{width:calc(100% - 36px)!important;min-height:88svh!important;padding:110px 0 30px!important}
  .ixg-contact h2{font-size:clamp(72px,20vw,106px)!important;line-height:.73!important;max-width:6.3ch!important}
  .ixg-contact .ixg-actions{position:static!important;width:100%!important;height:86px!important;margin-top:54px!important}
  .ixg-contact .ixg-cta--primary{min-height:86px!important;width:100%!important}
}
`;
