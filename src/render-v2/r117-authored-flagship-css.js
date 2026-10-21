export const R117_AUTHORED_FLAGSHIP_CSS = `
/* R117 AUTHORED FLAGSHIP — €15K creative-direction hard gate.
   Intent: authored editorial composition, radical hierarchy, zero template feel. */
:root{
 --ix-r117-rule:clamp(90px,10vw,168px);
 --ix-r117-display:clamp(76px,8.6vw,148px);
 --ix-r117-micro:10px;
}

/* HERO — portfolio screenshot #1 */
.ixf-hero{min-height:100svh!important}
.ixf-hero__media img{
 transform:scale(1.07)!important;
 filter:saturate(.68) contrast(1.16) brightness(.78)!important;
 object-position:62% 50%!important
}
.ixf-hero__veil{
 background:
 linear-gradient(90deg,rgba(6,7,8,.98) 0%,rgba(6,7,8,.90) 23%,rgba(6,7,8,.48) 50%,rgba(6,7,8,.06) 78%),
 linear-gradient(180deg,rgba(0,0,0,.08),transparent 48%,rgba(0,0,0,.74))!important
}
.ixf-hero__inner{
 min-height:100svh!important;
 grid-template-columns:minmax(0,1.34fr) minmax(230px,.34fr)!important;
 padding-top:clamp(132px,15vh,196px)!important;
 padding-bottom:clamp(52px,6vw,92px)!important
}
.ixf-hero__copy{max-width:920px!important;padding-bottom:0!important}
.ixf-hero__copy h1{
 font-size:clamp(82px,9.4vw,156px)!important;
 line-height:.79!important;
 letter-spacing:-.078em!important;
 max-width:8.6ch!important;
 text-wrap:balance!important
}
.ixf-hero__copy .ixg-lede{
 max-width:46ch!important;
 font-size:clamp(16px,1.18vw,19px)!important;
 margin-top:34px!important
}
.ixf-hero__meta-rail{
 border:0!important;
 border-left:1px solid rgba(255,255,255,.24)!important;
 padding-left:26px!important;
 backdrop-filter:none!important;
 background:transparent!important
}
.ixf-hero__meta-item{min-height:112px!important;padding:18px 0!important}
.ixf-hero__signature{
 width:min(620px,58vw)!important;
 height:18px!important;
 bottom:auto!important;right:auto!important
}
.ixf-hero__signature i:first-child{height:6px!important}

/* POSITIONING — not a normal section: editorial triptych */
.ixf-positioning__grid{
 min-height:clamp(860px,78vw,1080px)!important;
 grid-template-columns:minmax(250px,.52fr) minmax(270px,.48fr) minmax(540px,1.30fr)!important
}
.ixf-positioning__statement{
 padding-right:clamp(38px,5vw,84px)!important
}
.ixf-positioning__statement h2{
 font-size:clamp(68px,6.8vw,112px)!important;
 line-height:.82!important;
 max-width:7.2ch!important
}
.ixf-positioning__body{padding-left:clamp(38px,4vw,68px)!important;padding-right:clamp(38px,4vw,68px)!important}
.ixf-positioning__media{min-height:clamp(860px,78vw,1080px)!important}
.ixf-positioning__media .ixg-section-visual img{
 transform:scale(1.08)!important;
 filter:saturate(.64) contrast(1.14) brightness(.90)!important
}

/* SERVICES — manifesto ledger, never card soup */
.ixf-services{padding:clamp(150px,13vw,220px) 0!important}
.ixf-services .ixg-section-head{
 grid-template-columns:minmax(170px,.25fr) minmax(0,1fr)!important;
 gap:clamp(60px,9vw,150px)!important;
 margin-bottom:82px!important
}
.ixf-services .ixg-section-intro{
 max-width:21ch!important;
 font-size:clamp(42px,4.8vw,78px)!important;
 line-height:.93!important;
 letter-spacing:-.06em!important
}
.ixf-service-line{
 min-height:clamp(340px,29vw,450px)!important;
 grid-template-columns:minmax(130px,.16fr) minmax(0,1fr) minmax(56px,.08fr)!important;
 gap:clamp(32px,6vw,98px)!important;
 padding:52px 0!important
}
.ixf-service-line:nth-child(even){padding-left:clamp(48px,9vw,150px)!important}
.ixf-service-line__title{
 font-size:clamp(64px,6.6vw,108px)!important;
 line-height:.84!important;
 max-width:13ch!important
}
.ixf-service-line__body{max-width:52ch!important;font-size:clamp(15px,1.05vw,18px)!important}

/* SIGNATURE MID-PAGE MOMENTS */
.ixg-feature--one,.ixg-feature--two{padding:clamp(150px,14vw,230px) 0!important}
.ixg-feature--one .ixf-feature__grid{grid-template-columns:minmax(0,.48fr) minmax(650px,1.52fr)!important}
.ixg-feature--one .ixg-feature__stage{
 min-height:clamp(760px,64vw,980px)!important;
 margin-right:calc((100vw - min(1380px,92vw))/ -2)!important
}
.ixg-feature--one .ixg-feature__copy h2,
.ixg-feature--two .ixg-feature__copy h2{
 font-size:clamp(70px,7.2vw,118px)!important;
 line-height:.83!important;
 letter-spacing:-.07em!important
}
.ixg-feature--two .ixf-feature__grid{grid-template-columns:minmax(680px,1.28fr) minmax(0,.72fr)!important}
.ixg-feature--two .ixg-feature__stage{
 min-height:clamp(720px,60vw,920px)!important;
 margin-left:calc((100vw - min(1380px,92vw))/ -2)!important;
 transform:none!important
}

/* TRUST — evidence as architecture, not cards */
.ixg-trust-section{min-height:1000px!important;padding:clamp(150px,13vw,220px) 0!important}
.ixg-trust-section .ixg-section-head{
 grid-template-columns:minmax(180px,.25fr) minmax(0,1fr)!important;
 gap:clamp(70px,10vw,160px)!important
}
.ixg-trust-section .ixg-section-intro{
 max-width:15ch!important;
 font-size:clamp(54px,6vw,98px)!important;
 line-height:.88!important
}
.ixg-trust-reasons{
 grid-template-columns:repeat(5,1fr)!important;
 border-top:1px solid rgba(255,255,255,.28)!important;
 border-bottom:1px solid rgba(255,255,255,.18)!important
}
.ixg-trust-reason{
 min-height:430px!important;
 background:transparent!important;
 padding:44px 28px!important;
 border-right:1px solid rgba(255,255,255,.14)!important
}
.ixg-trust-reason strong{font-size:clamp(28px,2.5vw,44px)!important;line-height:.96!important}

/* VERIFIED PARTNER — gallery-grade set piece */
.ixg-partner-proof{padding:clamp(140px,12vw,205px) 0!important}
.ixf-partner-feature{min-height:clamp(650px,54vw,800px)!important;grid-template-columns:minmax(420px,.72fr) minmax(0,1.28fr)!important}
.ixf-partner-feature__identity{padding:clamp(64px,6vw,105px)!important}
.ixf-partner-feature__copy{padding:clamp(72px,7vw,118px)!important}
.ixf-partner-feature__copy strong{
 font-size:clamp(72px,7.4vw,122px)!important;
 line-height:.82!important;
 max-width:10ch!important
}

/* COMMERCIAL BRIDGE — giant typographic intermission */
.ixm-bridge{padding:clamp(145px,13vw,220px) 0!important}
.ixm-bridge__grid{min-height:520px!important;grid-template-columns:minmax(0,1fr) minmax(300px,380px)!important}
.ixm-bridge__copy h2{
 font-size:clamp(84px,8.8vw,146px)!important;
 line-height:.80!important;
 max-width:7.4ch!important
}
.ixm-bridge .ixg-actions{height:250px!important}
.ixm-bridge .ixg-cta--secondary{min-height:250px!important}

/* CLOSING — portfolio screenshot #5 */
.ixg-contact,.ixg-contact__inner{min-height:92svh!important}
.ixg-contact{
 background:
 radial-gradient(circle at 82% 62%,color-mix(in srgb,var(--ix-brand-primary) 58%,transparent),transparent 30%),
 linear-gradient(118deg,#090b0c 0%,#151719 54%,#21090b 100%)!important
}
.ixg-contact h2{
 font-size:clamp(100px,10.8vw,178px)!important;
 line-height:.77!important;
 max-width:6.8ch!important
}
.ixg-contact .ixg-actions{width:clamp(280px,23vw,380px)!important;height:240px!important}
.ixg-contact .ixg-cta--primary{min-height:240px!important}

/* PREMIUM RESTRAINT */
.ixg-service,.ixg-trust,.ixg-bridge__evidence-row{border-radius:0!important}
.ixg-feature__evidence-row{border-radius:0!important}
.ix-v2-footer-contact-block{border-radius:0!important}

/* MOBILE IS NATIVE — not desktop stacked */
@media(max-width:700px){
 .ixf-hero{min-height:92svh!important}
 .ixf-hero__inner{min-height:92svh!important;padding:104px 0 34px!important;display:flex!important;flex-direction:column!important;justify-content:flex-end!important}
 .ixf-hero__copy{order:2!important;padding:0!important}
 .ixf-hero__copy h1{font-size:clamp(58px,16vw,84px)!important;line-height:.80!important;max-width:8.2ch!important}
 .ixf-hero__copy .ixg-lede{max-width:30ch!important;margin-top:24px!important}
 .ixf-hero__meta-rail{order:1!important;display:flex!important;overflow:hidden!important;border-left:0!important;border-top:1px solid rgba(255,255,255,.22)!important;padding:0!important;margin-bottom:24px!important}
 .ixf-hero__meta-item{min-width:44%!important;min-height:70px!important;padding:12px 14px 12px 0!important}
 .ixf-hero__signature{display:none!important}

 .ixf-positioning__grid{grid-template-columns:1fr!important;grid-template-rows:auto auto auto!important}
 .ixf-positioning__statement{min-height:390px!important;padding:82px 0 46px!important}
 .ixf-positioning__statement h2{font-size:clamp(58px,15vw,78px)!important;max-width:7.4ch!important}
 .ixf-positioning__media{width:100vw!important;margin-left:calc(50% - 50vw)!important;min-height:78svh!important}
 .ixf-positioning__media .ixg-section-visual{min-height:78svh!important}
 .ixf-positioning__body{padding:48px 0 86px!important}

 .ixf-services{padding:100px 0!important}
 .ixf-services .ixg-section-head{grid-template-columns:1fr!important;gap:22px!important;margin-bottom:52px!important}
 .ixf-services .ixg-section-intro{font-size:clamp(38px,10vw,52px)!important;max-width:15ch!important}
 .ixf-service-line,.ixf-service-line:nth-child(even){padding:44px 0 54px!important;grid-template-columns:1fr!important}
 .ixf-service-line__title{font-size:clamp(50px,13vw,70px)!important;line-height:.86!important}

 .ixg-feature--one,.ixg-feature--two{padding:100px 0!important}
 .ixg-feature--one .ixf-feature__grid,.ixg-feature--two .ixf-feature__grid{grid-template-columns:1fr!important}
 .ixg-feature--one .ixg-feature__stage,.ixg-feature--two .ixg-feature__stage{
  width:100vw!important;max-width:100vw!important;margin:28px calc(50% - 50vw) 0!important;min-height:72svh!important
 }
 .ixg-feature--one .ixg-feature__copy h2,.ixg-feature--two .ixg-feature__copy h2{font-size:clamp(54px,14vw,76px)!important;max-width:8.8ch!important}

 .ixg-trust-section{padding:104px 0!important}
 .ixg-trust-section .ixg-section-head{grid-template-columns:1fr!important;gap:20px!important}
 .ixg-trust-section .ixg-section-intro{font-size:clamp(44px,12vw,62px)!important;max-width:12ch!important}
 .ixg-trust-reasons{display:block!important}
 .ixg-trust-reason{min-height:250px!important;padding:34px 0!important;border-right:0!important;border-bottom:1px solid rgba(255,255,255,.14)!important}

 .ixf-partner-feature{grid-template-columns:1fr!important}
 .ixf-partner-feature__identity{min-height:300px!important;padding:42px 28px!important}
 .ixf-partner-feature__copy{min-height:420px!important;padding:52px 28px!important}
 .ixf-partner-feature__copy strong{font-size:clamp(52px,14vw,74px)!important}

 .ixm-bridge{padding:100px 0!important}
 .ixm-bridge__copy h2{font-size:clamp(64px,16vw,88px)!important;max-width:7.6ch!important}
 .ixm-bridge .ixg-actions{height:90px!important}
 .ixm-bridge .ixg-cta--secondary{min-height:90px!important}

 .ixg-contact,.ixg-contact__inner{min-height:84svh!important}
 .ixg-contact h2{font-size:clamp(72px,19vw,104px)!important;max-width:6.6ch!important}
 .ixg-contact .ixg-actions{height:92px!important;width:100%!important}
 .ixg-contact .ixg-cta--primary{min-height:92px!important}
}
`;
