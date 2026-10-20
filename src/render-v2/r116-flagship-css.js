export const R116_FLAGSHIP_CSS = `
/* R116 FLAGSHIP PREMIUM ARCHITECTURE — concept A only. */
.ixf-hero{min-height:clamp(820px,92svh,1120px)!important;background:#0c0d0e!important}
.ixf-hero__media{inset:0!important}
.ixf-hero__media img{transform:scale(1.025)!important;filter:saturate(.84) contrast(1.08) brightness(.82)!important}
.ixf-hero__veil{
 background:
 linear-gradient(90deg,rgba(7,8,9,.96) 0%,rgba(7,8,9,.72) 34%,rgba(7,8,9,.20) 66%,rgba(7,8,9,.08) 100%),
 linear-gradient(180deg,rgba(0,0,0,.08) 0%,transparent 58%,rgba(0,0,0,.58) 100%)!important
}
.ixf-hero__inner{
 min-height:clamp(820px,92svh,1120px)!important;
 display:grid!important;
 grid-template-columns:minmax(0,1.12fr) minmax(260px,.42fr)!important;
 grid-template-rows:1fr auto!important;
 align-items:end!important;
 gap:40px 70px!important;
 padding-top:clamp(120px,14vh,180px)!important;
 padding-bottom:clamp(48px,6vw,82px)!important
}
.ixf-hero__copy{max-width:850px!important;align-self:end!important}
.ixf-hero__copy .ixg-kicker{font-size:10px!important;letter-spacing:.19em!important;margin-bottom:24px!important;color:rgba(255,255,255,.72)!important}
.ixf-hero__copy h1{
 max-width:10.2ch!important;
 font-size:clamp(72px,8.5vw,138px)!important;
 line-height:.84!important;
 letter-spacing:-.065em!important;
 text-transform:none!important;
 color:#fff!important
}
.ixf-hero__copy .ixg-lede{max-width:58ch!important;margin-top:30px!important;font-size:clamp(16px,1.28vw,20px)!important;line-height:1.55!important;color:rgba(255,255,255,.75)!important}
.ixf-hero__copy .ixg-actions{margin-top:38px!important}
.ixf-hero__meta-rail{
 grid-column:2!important;
 grid-row:1 / span 2!important;
 align-self:end!important;
 display:grid!important;
 gap:0!important;
 border-top:1px solid rgba(255,255,255,.34)!important;
 border-bottom:1px solid rgba(255,255,255,.16)!important;
 backdrop-filter:blur(8px)!important
}
.ixf-hero__meta-item{
 min-height:96px!important;
 display:grid!important;
 grid-template-columns:42px 1fr!important;
 gap:14px!important;
 align-items:center!important;
 padding:16px 4px!important;
 border-bottom:1px solid rgba(255,255,255,.12)!important
}
.ixf-hero__meta-item:last-child{border-bottom:0!important}
.ixf-hero__meta-item span{font:800 10px/1 var(--ix-body-font)!important;letter-spacing:.15em!important;color:var(--ix-brand-primary)!important}
.ixf-hero__meta-item strong{font:620 clamp(14px,1.15vw,18px)/1.25 var(--ix-body-font)!important;color:rgba(255,255,255,.86)!important}
.ixf-hero__signature{
 grid-column:1!important;grid-row:2!important;
 width:min(520px,72%)!important;height:34px!important;
 display:grid!important;grid-template-columns:2.2fr .7fr 1fr!important;gap:8px!important;align-items:center!important
}
.ixf-hero__signature i{display:block!important;height:2px!important;background:rgba(255,255,255,.30)!important}
.ixf-hero__signature i:first-child{background:var(--ix-brand-primary)!important;height:4px!important}

.ixf-positioning{
 padding:clamp(120px,12vw,190px) 0!important;
 background:
 linear-gradient(90deg,rgba(179,19,25,.035),transparent 20%),
 #f5f3ee!important
}
.ixf-positioning__grid{
 display:grid!important;
 grid-template-columns:minmax(0,1.18fr) minmax(380px,.72fr)!important;
 grid-template-rows:auto auto!important;
 gap:clamp(54px,7vw,116px)!important;
 align-items:start!important
}
.ixf-positioning__statement{position:relative!important;padding-top:32px!important}
.ixf-section-index{
 display:block!important;margin-bottom:30px!important;
 font:800 11px/1 var(--ix-body-font)!important;letter-spacing:.17em!important;
 color:var(--ix-brand-primary)!important
}
.ixf-positioning__statement h2{
 max-width:12ch!important;
 font-size:clamp(58px,6.4vw,102px)!important;
 line-height:.88!important;
 letter-spacing:-.06em!important
}
.ixf-positioning__body{
 max-width:620px!important;
 padding-top:86px!important;
 border-top:1px solid rgba(32,34,36,.22)!important
}
.ixf-positioning__body>p:first-child{font-size:clamp(18px,1.45vw,23px)!important;line-height:1.55!important;color:rgba(32,34,36,.74)!important}
.ixf-positioning__body .ixg-locality{margin-top:24px!important;font-size:11px!important;letter-spacing:.12em!important;text-transform:uppercase!important}
.ixf-positioning__proof-rail{margin-top:44px!important;display:grid!important;gap:0!important;border-top:1px solid rgba(32,34,36,.18)!important}
.ixf-positioning__proof{
 display:grid!important;grid-template-columns:52px 1fr!important;gap:14px!important;align-items:center!important;
 min-height:68px!important;border-bottom:1px solid rgba(32,34,36,.13)!important
}
.ixf-positioning__proof span{font:800 10px/1 var(--ix-body-font)!important;color:var(--ix-brand-primary)!important}
.ixf-positioning__proof strong{font:650 13px/1.35 var(--ix-body-font)!important;color:rgba(32,34,36,.80)!important}
.ixf-positioning__media{grid-column:1/-1!important;position:relative!important;margin-top:8px!important}
.ixf-positioning__media .ixg-section-visual{min-height:clamp(420px,46vw,700px)!important;max-height:none!important;margin:0!important;box-shadow:none!important}
.ixf-positioning__media .ixg-section-visual img{object-fit:cover!important}

.ixf-services{
 padding:clamp(118px,11vw,180px) 0!important;
 background:#111315!important;color:#f6f4ef!important
}
.ixf-services .ixg-section-head{
 display:grid!important;grid-template-columns:minmax(0,.38fr) minmax(0,1fr)!important;
 gap:60px!important;align-items:end!important;margin-bottom:58px!important
}
.ixf-services .ixg-kicker{color:rgba(255,255,255,.52)!important}
.ixf-services .ixg-section-intro{
 max-width:30ch!important;
 font:560 clamp(28px,3vw,48px)/1.04 var(--ix-display-font)!important;
 letter-spacing:-.045em!important;color:#fff!important
}
.ixf-services .ixg-services__composition{
 grid-template-columns:minmax(0,.88fr) minmax(500px,1.12fr)!important;
 gap:0!important;background:rgba(255,255,255,.08)!important
}
.ixf-services .ixg-services__grid{grid-template-columns:1fr!important;gap:1px!important;background:rgba(255,255,255,.10)!important}
.ixf-services .ixg-service{
 min-height:320px!important;
 background:#16181a!important;
 color:#fff!important;
 border:0!important;
 padding:38px 42px!important;
 grid-template-rows:auto 1fr!important
}
.ixf-services .ixg-service:nth-child(even){background:#1c1e20!important;padding:38px 42px!important}
.ixf-services .ixg-service__top{min-height:72px!important;border-color:rgba(255,255,255,.12)!important}
.ixf-services .ixg-service__index{color:var(--ix-brand-primary)!important;opacity:1!important;font-size:38px!important}
.ixf-services .ixg-service__icon{opacity:.45!important}
.ixf-services .ixg-service__tag{border-color:rgba(255,255,255,.18)!important;color:rgba(255,255,255,.68)!important}
.ixf-services .ixg-service__title{max-width:12ch!important;color:#fff!important;font-size:clamp(38px,3.6vw,58px)!important}
.ixf-services .ixg-service__body{color:rgba(255,255,255,.66)!important;font-size:14px!important}
.ixf-services .ixg-services__composition>.ixg-section-visual{
 min-height:641px!important;
 box-shadow:none!important;
 border-left:1px solid rgba(255,255,255,.10)!important
}
.ixf-services .ixg-services__composition>.ixg-section-visual img{filter:saturate(.82) contrast(1.08)!important}

.ixf-feature{overflow:visible!important}
.ixf-feature__grid{position:relative!important}
.ixf-feature__index{
 display:block!important;margin-bottom:20px!important;
 font:820 10px/1 var(--ix-body-font)!important;letter-spacing:.18em!important;color:var(--ix-brand-primary)!important
}
.ixg-feature--one{
 padding:clamp(130px,12vw,190px) 0!important;
 background:#0d0f10!important;color:#f7f4ee!important
}
.ixg-feature--one .ixf-feature__grid{
 grid-template-columns:minmax(0,.68fr) minmax(560px,1.32fr)!important;
 align-items:center!important
}
.ixg-feature--one .ixf-feature__copy{padding-right:clamp(24px,4vw,72px)!important}
.ixg-feature--one .ixg-feature__copy h2{font-size:clamp(58px,6vw,96px)!important;max-width:8.5ch!important}
.ixg-feature--one .ixg-feature__stage{
 min-height:clamp(620px,54vw,820px)!important;
 transform:translateY(54px)!important;
 border:1px solid rgba(255,255,255,.11)!important
}
.ixg-feature--one .ixg-section-visual img{filter:saturate(.88) contrast(1.05)!important}
.ixg-feature--one .ixg-feature__device{background:linear-gradient(145deg,rgba(255,255,255,.045),rgba(255,255,255,.01))!important;border-color:rgba(255,255,255,.12)!important}
.ixg-feature--one .ixg-feature__evidence-row{border-color:rgba(255,255,255,.15)!important;color:#fff!important}

.ixg-feature--two{
 padding:clamp(130px,12vw,190px) 0!important;
 background:
 linear-gradient(90deg,rgba(179,19,25,.055),transparent 24%),
 #f3f1eb!important;color:#202224!important
}
.ixg-feature--two .ixf-feature__grid{
 grid-template-columns:minmax(560px,1.08fr) minmax(0,.92fr)!important;
 gap:clamp(60px,7vw,120px)!important
}
.ixg-feature--two .ixg-feature__stage{
 min-height:clamp(560px,50vw,760px)!important;
 transform:translateX(-32px)!important;
 border:0!important
}
.ixg-feature--two .ixg-feature__stage>.ixg-section-visual{box-shadow:0 34px 90px rgba(17,17,17,.12)!important}
.ixg-feature--two .ixf-feature__copy{padding-left:0!important}
.ixg-feature--two .ixg-feature__copy h2{font-size:clamp(56px,5.7vw,90px)!important;max-width:9ch!important}
.ixg-feature--two .ixg-feature__evidence-row{border-color:rgba(32,34,36,.18)!important}

.ixg-trust-section{
 padding:clamp(130px,12vw,190px) 0!important;
 min-height:900px!important;
 display:flex!important;align-items:center!important
}
.ixg-trust-bg__veil{
 background:linear-gradient(90deg,rgba(10,11,12,.94),rgba(10,11,12,.76) 50%,rgba(10,11,12,.45))!important
}
.ixg-trust-section .ixg-shell{position:relative!important;z-index:4!important}
.ixg-trust-section .ixg-section-head{
 display:grid!important;
 grid-template-columns:minmax(0,.44fr) minmax(0,.92fr)!important;
 gap:80px!important;align-items:end!important
}
.ixg-trust-section .ixg-kicker{font-size:10px!important;letter-spacing:.17em!important;color:rgba(255,255,255,.58)!important}
.ixg-trust-section .ixg-section-intro{
 max-width:19ch!important;
 font:580 clamp(42px,4.4vw,72px)/.98 var(--ix-display-font)!important;
 letter-spacing:-.05em!important;color:#fff!important
}
.ixg-trust-proof{margin-top:52px!important;background:transparent!important;border-top:1px solid rgba(255,255,255,.20)!important}
.ixg-trust-proof__item{
 min-height:102px!important;background:transparent!important;border-bottom:1px solid rgba(255,255,255,.10)!important
}
.ixg-trust-reasons{
 margin-top:42px!important;
 grid-template-columns:repeat(5,minmax(0,1fr))!important;
 gap:0!important;background:transparent!important;border-top:1px solid rgba(255,255,255,.16)!important
}
.ixg-trust-reason{
 min-height:300px!important;
 background:rgba(10,11,12,.34)!important;
 border-right:1px solid rgba(255,255,255,.12)!important;
 padding:26px 22px!important
}
.ixg-trust-reason:last-child{border-right:0!important}
.ixg-trust-reason__graphic{opacity:.64!important}
.ixg-trust-reason strong{font-size:clamp(17px,1.55vw,24px)!important;color:#fff!important}
.ixg-trust-reason p{color:rgba(255,255,255,.62)!important}

.ixg-partner-proof{
 padding:clamp(120px,11vw,170px) 0!important;
 background:#f4f2ed!important
}
.ixg-partner-proof .ixg-section-head{
 display:grid!important;grid-template-columns:.42fr 1fr!important;gap:70px!important;margin-bottom:54px!important
}
.ixg-partner-proof .ixg-section-intro{max-width:32ch!important;font-size:clamp(24px,2.4vw,38px)!important;line-height:1.2!important}
.ixg-partner-proof__grid{
 display:grid!important;
 grid-template-columns:1.55fr repeat(3,1fr)!important;
 gap:12px!important;align-items:stretch!important
}
.ixg-partner-card{min-height:260px!important;padding:30px!important;display:flex!important;flex-direction:column!important;justify-content:space-between!important}
.ixg-partner-card:not(.ixg-partner-card--demo){border-top:5px solid var(--ix-brand-primary)!important;box-shadow:0 28px 70px rgba(24,25,27,.08)!important}
.ixg-partner-logo{max-width:210px!important;max-height:100px!important}
.ixg-partner-card--demo{box-shadow:none!important;background:#eceae5!important}
.ixg-partner-card--demo .ixg-demo-partner-mark{margin:auto 0 30px!important}

.ixm-bridge{
 padding:clamp(110px,10vw,160px) 0!important;
 background:#f6f4ef!important
}
.ixm-bridge__grid{
 min-height:360px!important;
 display:grid!important;
 grid-template-columns:minmax(0,1.1fr) auto!important;
 align-items:center!important;
 gap:70px!important;
 border-top:1px solid rgba(32,34,36,.18)!important;
 border-bottom:1px solid rgba(32,34,36,.18)!important;
 padding:46px 0!important
}
.ixm-bridge__copy .ixg-kicker{color:var(--ix-brand-primary)!important}
.ixm-bridge__copy h2{
 max-width:10ch!important;
 font-size:clamp(58px,6.2vw,100px)!important;
 line-height:.88!important;letter-spacing:-.06em!important
}
.ixm-bridge__copy .ixg-section-intro{max-width:48ch!important;margin-top:22px!important;font-size:16px!important}

.ixg-contact{
 min-height:clamp(650px,68vw,880px)!important;
 background:
 radial-gradient(circle at 82% 60%,rgba(179,19,25,.42),transparent 28%),
 linear-gradient(125deg,#0e1011 0%,#17191b 54%,#290e10 100%)!important
}
.ixg-contact__inner{
 min-height:clamp(650px,68vw,880px)!important;
 display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;align-items:center!important;gap:80px!important
}
.ixg-contact h2{
 max-width:8ch!important;
 font-size:clamp(74px,8.8vw,142px)!important;
 line-height:.82!important;letter-spacing:-.07em!important
}
.ixg-contact .ixg-section-intro{max-width:50ch!important;margin-top:28px!important;font-size:16px!important}
.ixg-contact .ixg-actions{align-self:center!important}

.ix-v2-footer{
 padding:clamp(100px,9vw,150px) clamp(26px,6vw,96px) 52px!important;
 background:#0b0d0e!important;color:#f5f3ee!important
}
.ix-v2-footer-grid{
 grid-template-columns:minmax(400px,1.4fr) minmax(180px,.42fr) minmax(340px,.82fr)!important;
 gap:clamp(64px,8vw,128px)!important;
 border-top:1px solid rgba(255,255,255,.14)!important;
 padding-top:38px!important
}
.ix-v2-footer-logo{max-width:320px!important;max-height:100px!important}
.ix-v2-footer-tagline{font-size:15px!important;line-height:1.55!important;color:rgba(255,255,255,.58)!important}
.ix-v2-footer-nav a{font-size:10px!important;letter-spacing:.15em!important;color:rgba(255,255,255,.72)!important}
.ix-v2-footer-contact-block{padding:22px!important;border:1px solid rgba(255,255,255,.13)!important;background:rgba(255,255,255,.025)!important}

@media(max-width:980px){
 .ixf-hero__inner{grid-template-columns:1fr!important;grid-template-rows:auto!important;align-content:end!important}
 .ixf-hero__meta-rail{grid-column:1!important;grid-row:auto!important;grid-template-columns:repeat(3,1fr)!important}
 .ixf-hero__meta-item{grid-template-columns:34px 1fr!important;padding:14px!important}
 .ixf-positioning__grid{grid-template-columns:1fr!important}
 .ixf-positioning__body{padding-top:32px!important}
 .ixf-services .ixg-services__composition{grid-template-columns:1fr!important}
 .ixf-services .ixg-services__composition>.ixg-section-visual{min-height:480px!important;border-left:0!important;border-top:1px solid rgba(255,255,255,.10)!important}
 .ixg-feature--one .ixf-feature__grid,.ixg-feature--two .ixf-feature__grid{grid-template-columns:1fr!important}
 .ixg-feature--one .ixg-feature__stage,.ixg-feature--two .ixg-feature__stage{transform:none!important;min-height:480px!important}
 .ixg-feature--two .ixg-feature__stage{grid-column:1!important;grid-row:2!important}
 .ixg-feature--two .ixf-feature__copy{grid-column:1!important;grid-row:1!important}
 .ixg-trust-reasons{grid-template-columns:repeat(2,1fr)!important}
 .ixg-partner-proof__grid{grid-template-columns:repeat(2,1fr)!important}
 .ixg-partner-card:not(.ixg-partner-card--demo){grid-column:1/-1!important}
 .ix-v2-footer-grid{grid-template-columns:1fr 1fr!important}
}

@media(max-width:700px){
 .ixf-hero__inner,.ixf-positioning__grid,.ixf-services .ixg-services__composition,.ixf-services .ixg-services__grid,.ixf-feature__grid,.ixg-trust-section .ixg-shell,.ixg-partner-proof__grid,.ixm-bridge__grid,.ixg-contact__inner,.ix-v2-footer-grid{min-width:0!important;max-width:100%!important}
 .ixf-hero__inner>*,.ixf-positioning__grid>*,.ixf-services .ixg-services__composition>*,.ixf-feature__grid>*,.ixg-trust-section .ixg-shell>*,.ixg-partner-proof__grid>*,.ixm-bridge__grid>*,.ixg-contact__inner>*,.ix-v2-footer-grid>*{min-width:0!important;max-width:100%!important}
 .ixf-hero img,.ixf-positioning img,.ixf-services img,.ixf-feature img,.ixg-trust-section img,.ixg-partner-proof img{max-width:100%!important}
 .ixg-actions{max-width:100%!important;flex-wrap:wrap!important}
 .ixg-cta{max-width:100%!important;white-space:normal!important}
 .ixf-positioning__media,.ixg-feature__stage,.ixg-section-visual{max-width:100%!important}

 .ixf-hero{min-height:820px!important}
 .ixf-hero__inner{min-height:820px!important;padding-top:110px!important;padding-bottom:32px!important;gap:30px!important}
 .ixf-hero__copy h1{font-size:clamp(50px,14vw,74px)!important;max-width:9ch!important}
 .ixf-hero__meta-rail{grid-template-columns:1fr!important}
 .ixf-hero__meta-item{min-height:64px!important}
 .ixf-hero__signature{width:100%!important}
 .ixf-positioning{padding:86px 0!important}
 .ixf-positioning__statement h2{font-size:clamp(48px,12vw,68px)!important}
 .ixf-positioning__media .ixg-section-visual{min-height:280px!important}
 .ixf-services{padding:86px 0!important}
 .ixf-services .ixg-section-head{grid-template-columns:1fr!important;gap:18px!important}
 .ixf-services .ixg-section-intro{font-size:32px!important}
 .ixf-services .ixg-service{min-height:300px!important;padding:26px!important}
 .ixf-services .ixg-service:nth-child(even){padding:26px!important}
 .ixf-services .ixg-services__composition>.ixg-section-visual{min-height:300px!important}
 .ixg-feature--one,.ixg-feature--two{padding:90px 0!important}
 .ixg-feature--one .ixg-feature__copy h2,.ixg-feature--two .ixg-feature__copy h2{font-size:clamp(46px,12vw,66px)!important;max-width:100%!important}
 .ixg-feature--one .ixg-feature__stage,.ixg-feature--two .ixg-feature__stage{min-height:300px!important}
 .ixg-trust-section{padding:88px 0!important;min-height:0!important}
 .ixg-trust-section .ixg-section-head{grid-template-columns:1fr!important;gap:18px!important}
 .ixg-trust-section .ixg-section-intro{font-size:clamp(36px,10vw,50px)!important}
 .ixg-trust-reasons{grid-template-columns:1fr!important}
 .ixg-trust-reason{min-height:220px!important}
 .ixg-partner-proof{padding:86px 0!important}
 .ixg-partner-proof .ixg-section-head{grid-template-columns:1fr!important;gap:18px!important}
 .ixg-partner-proof__grid{grid-template-columns:1fr!important}
 .ixg-partner-card:not(.ixg-partner-card--demo){grid-column:auto!important}
 .ixm-bridge{padding:80px 0!important}
 .ixm-bridge__grid{grid-template-columns:1fr!important;gap:30px!important}
 .ixm-bridge__copy h2{font-size:clamp(52px,14vw,74px)!important}
 .ixg-contact,.ixg-contact__inner{min-height:560px!important}
 .ixg-contact__inner{grid-template-columns:1fr!important;gap:30px!important}
 .ixg-contact h2{font-size:clamp(60px,16vw,88px)!important}
 .ix-v2-footer{padding:78px 20px 34px!important}
 .ix-v2-footer-grid{grid-template-columns:1fr!important;gap:36px!important}
}
`;
