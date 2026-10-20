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
.ixg-partner-logo{max-width:210px!important;max-height:100px!important}

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


/* R116 final art-direction hardening after Cabina visual review. */
.ix-v2-header{
 position:absolute!important;top:0!important;left:0!important;right:0!important;
 z-index:100!important;padding:22px clamp(22px,3vw,48px) 0!important;
 background:transparent!important
}
.ix-v2-header-inner{
 width:min(1380px,100%)!important;min-height:76px!important;
 padding:10px 12px 10px 18px!important;
 background:rgba(10,12,13,.64)!important;
 color:#fff!important;
 border:1px solid rgba(255,255,255,.16)!important;
 box-shadow:0 18px 60px rgba(0,0,0,.20)!important;
 backdrop-filter:blur(24px)!important
}
.ix-v2-header-inner:before{display:none!important}
.ix-v2-brand{color:#fff!important}
.ix-v2-wordmark{color:#fff!important}
.ix-v2-nav{background:transparent!important;border:0!important;padding:0!important}
.ix-v2-nav a{color:rgba(255,255,255,.76)!important;padding:11px 14px!important}
.ix-v2-nav a:hover{background:rgba(255,255,255,.08)!important;color:#fff!important}
.ix-v2-header-cta{background:var(--ix-brand-primary)!important;color:#fff!important;box-shadow:none!important;border:1px solid rgba(255,255,255,.08)!important}

.ixm-graphic-band{display:none!important}

.ixg-bridge[data-r116-set-piece="bridge"]{
 position:relative!important;overflow:hidden!important;
 padding:clamp(120px,11vw,180px) 0!important;
 background:#f3f1eb!important;color:#202224!important
}
.ixg-bridge[data-r116-set-piece="bridge"]:before,
.ixg-bridge[data-r116-set-piece="bridge"]:after{display:none!important}
.ixg-bridge[data-r116-set-piece="bridge"] .ixg-bridge__grid{
 display:grid!important;
 grid-template-columns:minmax(0,1.08fr) minmax(260px,.55fr) auto!important;
 gap:clamp(42px,6vw,96px)!important;
 align-items:end!important;
 padding:48px 0!important;
 border-top:1px solid rgba(32,34,36,.18)!important;
 border-bottom:1px solid rgba(32,34,36,.18)!important
}
.ixg-bridge[data-r116-set-piece="bridge"] .ixg-bridge__copy{display:grid!important;gap:22px!important}
.ixg-bridge[data-r116-set-piece="bridge"] .ixg-bridge__copy h2{
 max-width:8.6ch!important;
 font-size:clamp(64px,7vw,110px)!important;
 line-height:.86!important;letter-spacing:-.065em!important
}
.ixg-bridge[data-r116-set-piece="bridge"] .ixg-bridge__copy p{
 max-width:48ch!important;font-size:15px!important;line-height:1.55!important;color:rgba(32,34,36,.66)!important
}
.ixg-bridge[data-r116-set-piece="bridge"] .ixg-bridge__evidence{
 align-self:stretch!important;border-top:0!important;border-left:1px solid rgba(32,34,36,.16)!important;
 padding-left:28px!important;display:grid!important;align-content:end!important
}
.ixg-bridge[data-r116-set-piece="bridge"] .ixg-bridge__evidence-row{
 min-height:0!important;padding:17px 0!important;border-bottom:1px solid rgba(32,34,36,.12)!important
}
.ixg-bridge[data-r116-set-piece="bridge"] .ixg-bridge__evidence-row strong{
 font:650 13px/1.35 var(--ix-body-font)!important;letter-spacing:.01em!important;max-width:25ch!important
}
.ixg-bridge[data-r116-set-piece="bridge"] .ixg-actions{align-self:end!important;margin:0!important}


/* R116 verified editorial architecture — no placeholder partners, no service-card grammar. */
.ixf-services .ixg-services__composition{
 display:block!important;
 grid-template-columns:none!important;
 background:transparent!important;
 border-top:1px solid rgba(255,255,255,.22)!important
}
.ixf-services .ixg-services__grid{
 display:grid!important;
 grid-template-columns:1fr!important;
 gap:0!important;
 background:transparent!important
}
.ixf-service-line{
 position:relative!important;
 display:grid!important;
 grid-template-columns:minmax(170px,.32fr) minmax(0,1fr) 76px!important;
 gap:clamp(28px,5vw,84px)!important;
 align-items:center!important;
 min-height:clamp(270px,25vw,360px)!important;
 padding:34px 0!important;
 border-bottom:1px solid rgba(255,255,255,.18)!important;
 background:transparent!important;
 color:#fff!important
}
.ixf-service-line:nth-child(2){padding-left:clamp(0px,5vw,78px)!important}
.ixf-service-line__index{
 align-self:stretch!important;
 display:flex!important;
 flex-direction:column!important;
 justify-content:space-between!important;
 gap:22px!important;
 padding:12px 0!important
}
.ixf-service-line__mark{
 width:clamp(72px,8vw,124px)!important;
 height:clamp(58px,6vw,92px)!important;
 display:grid!important;
 align-content:center!important;
 gap:8px!important
}
.ixf-service-line__mark i{
 display:block!important;
 height:3px!important;
 background:var(--ix-brand-primary)!important
}
.ixf-service-line__mark i:nth-child(1){width:100%!important}
.ixf-service-line__mark i:nth-child(2){width:68%!important}
.ixf-service-line__mark i:nth-child(3){width:36%!important}
.ixf-service-line__tag{
 max-width:24ch!important;
 font:760 9px/1.35 var(--ix-body-font)!important;
 letter-spacing:.16em!important;
 text-transform:uppercase!important;
 color:rgba(255,255,255,.50)!important
}
.ixf-service-line__copy{min-width:0!important;max-width:920px!important}
.ixf-service-line__title{
 margin:0!important;
 max-width:14ch!important;
 font:610 clamp(48px,5.3vw,82px)/.92 var(--ix-display-font)!important;
 letter-spacing:-.055em!important;
 color:#fff!important
}
.ixf-service-line__body{
 margin:28px 0 0!important;
 max-width:60ch!important;
 font:430 clamp(14px,1.1vw,17px)/1.65 var(--ix-body-font)!important;
 color:rgba(255,255,255,.62)!important
}
.ixf-service-line__rule{
 justify-self:end!important;
 width:56px!important;
 height:56px!important;
 border-top:1px solid rgba(255,255,255,.28)!important;
 border-right:1px solid rgba(255,255,255,.28)!important;
 position:relative!important
}
.ixf-service-line__rule:after{
 content:""!important;
 position:absolute!important;
 right:-1px!important;top:-1px!important;
 width:14px!important;height:14px!important;
 background:var(--ix-brand-primary)!important
}

.ixg-feature--one .ixg-feature__stage.has-visual>.ixg-section-visual{overflow:hidden!important}
.ixg-feature--one .ixg-feature__stage.has-visual>.ixg-section-visual img{
 object-position:82% 48%!important;
 transform:scale(1.11)!important;
 transform-origin:78% 50%!important;
 filter:saturate(.72) contrast(1.12) brightness(.88)!important
}

.ixg-trust-reasons{
 grid-template-columns:repeat(3,minmax(0,1fr))!important;
 gap:0!important;
 background:transparent!important;
 border-top:1px solid rgba(255,255,255,.18)!important
}
.ixg-trust-reason{
 min-height:360px!important;
 padding:34px 30px!important;
 background:rgba(10,11,12,.30)!important
}
.ixg-trust-reason__graphic{
 width:min(150px,62%)!important;
 min-height:94px!important;
 display:grid!important;
 align-content:center!important;
 gap:9px!important;
 margin-bottom:auto!important
}
.ixg-trust-reason__graphic i{
 display:block!important;
 height:3px!important;
 background:rgba(255,255,255,.22)!important
}
.ixg-trust-reason__graphic i:nth-child(1){width:100%!important;background:var(--ix-brand-primary)!important}
.ixg-trust-reason__graphic i:nth-child(2){width:72%!important}
.ixg-trust-reason__graphic i:nth-child(3){width:44%!important}
.ixg-trust-reason strong{
 max-width:18ch!important;
 font:620 clamp(22px,2.2vw,34px)/1.05 var(--ix-display-font)!important;
 letter-spacing:-.035em!important;
 color:#fff!important
}
.ixg-partner-proof__grid{
 display:grid!important;
 grid-template-columns:1fr!important;
 gap:0!important;
 border-top:1px solid rgba(32,34,36,.18)!important
}
.ixf-partner-feature{
 position:relative!important;
 display:grid!important;
 grid-template-columns:minmax(300px,.72fr) minmax(0,1.28fr)!important;
 min-height:clamp(390px,38vw,560px)!important;
 border-bottom:1px solid rgba(32,34,36,.18)!important;
 background:transparent!important
}
.ixf-partner-feature__identity{
 min-width:0!important;
 padding:clamp(38px,5vw,72px) clamp(30px,5vw,76px) clamp(38px,5vw,72px) 0!important;
 display:flex!important;
 flex-direction:column!important;
 justify-content:space-between!important;
 border-right:1px solid rgba(32,34,36,.18)!important
}
.ixf-partner-feature__mark{
 width:min(190px,58%)!important;
 display:grid!important;
 gap:10px!important
}
.ixf-partner-feature__mark i{
 display:block!important;
 height:3px!important;
 background:rgba(32,34,36,.20)!important
}
.ixf-partner-feature__mark i:nth-child(1){width:100%!important;background:var(--ix-brand-primary)!important}
.ixf-partner-feature__mark i:nth-child(2){width:68%!important}
.ixf-partner-feature__mark i:nth-child(3){width:38%!important}
.ixf-partner-feature .ixg-partner-logo{
 width:min(320px,88%)!important;
 max-width:100%!important;
 max-height:145px!important;
 object-fit:contain!important;
 object-position:left center!important
}
.ixf-partner-feature__copy{
 min-width:0!important;
 padding:clamp(38px,5vw,72px) 0 clamp(38px,5vw,72px) clamp(34px,6vw,96px)!important;
 display:flex!important;
 flex-direction:column!important;
 justify-content:flex-end!important;
 gap:40px!important
}
.ixf-partner-feature__copy strong{
 max-width:17ch!important;
 font:590 clamp(42px,5.4vw,82px)/.94 var(--ix-display-font)!important;
 letter-spacing:-.055em!important;
 color:#202224!important
}
.ixf-partner-feature__copy i{
 display:block!important;
 width:min(360px,60%)!important;
 height:4px!important;
 background:linear-gradient(90deg,var(--ix-brand-primary) 0 36%,rgba(32,34,36,.18) 36% 100%)!important
}


/* R116 commissioned art-direction pass V2 — Cabina rejected r179 as below flagship. */
.ixf-hero__copy{
 align-self:end!important;
 padding-bottom:clamp(54px,7vh,94px)!important;
 max-width:min(760px,74vw)!important
}
.ixf-hero__copy h1{
 max-width:10.5ch!important;
 font-size:clamp(78px,7.2vw,116px)!important;
 line-height:.84!important;
 letter-spacing:-.068em!important
}
.ixf-hero__copy .ixg-lede{
 max-width:54ch!important;
 margin-top:26px!important;
 font-size:clamp(15px,1.1vw,18px)!important;
 line-height:1.55!important;
 color:rgba(255,255,255,.74)!important
}
.ixf-hero__copy .ixg-actions{margin-top:34px!important;gap:10px!important}
.ixf-hero__copy .ixg-cta{min-height:58px!important;padding-inline:24px!important}
.ixf-hero__signature{right:0!important;bottom:70px!important;width:min(310px,24vw)!important}

.ixf-positioning{
 padding:0!important;
 background:#f2efe8!important;
 color:#202224!important
}
.ixf-positioning__grid{
 min-height:clamp(760px,72vw,980px)!important;
 display:grid!important;
 grid-template-columns:minmax(250px,.62fr) minmax(260px,.52fr) minmax(520px,1.16fr)!important;
 grid-template-rows:1fr!important;
 gap:0!important;
 align-items:stretch!important
}
.ixf-positioning__statement{
 padding:clamp(92px,8vw,138px) clamp(34px,4.5vw,76px) clamp(72px,6vw,110px) 0!important;
 display:flex!important;
 flex-direction:column!important;
 justify-content:flex-end!important;
 border-right:1px solid rgba(32,34,36,.16)!important
}
.ixf-positioning__statement h2{
 max-width:8.4ch!important;
 font-size:clamp(62px,5.8vw,94px)!important;
 line-height:.88!important;
 letter-spacing:-.06em!important
}
.ixf-positioning__body{
 padding:clamp(92px,8vw,138px) clamp(34px,4vw,66px) clamp(72px,6vw,110px)!important;
 display:flex!important;
 flex-direction:column!important;
 justify-content:flex-end!important;
 border-right:1px solid rgba(32,34,36,.16)!important
}
.ixf-positioning__body>p:first-child{
 max-width:34ch!important;
 font-size:clamp(17px,1.35vw,21px)!important;
 line-height:1.5!important
}
.ixf-positioning__body .ixg-locality{
 margin-top:34px!important;
 padding-top:22px!important;
 border-top:1px solid rgba(32,34,36,.16)!important;
 max-width:32ch!important;
 font-size:11px!important;
 line-height:1.45!important;
 letter-spacing:.03em!important;
 color:rgba(32,34,36,.58)!important
}
.ixf-positioning__media{
 min-width:0!important;
 min-height:clamp(760px,72vw,980px)!important;
 overflow:hidden!important
}
.ixf-positioning__media .ixg-section-visual{
 width:100%!important;height:100%!important;min-height:100%!important;
 border:0!important;overflow:hidden!important
}
.ixf-positioning__media .ixg-section-visual img{
 width:100%!important;height:100%!important;object-fit:cover!important;
 object-position:58% 50%!important;
 filter:saturate(.72) contrast(1.08) brightness(.92)!important;
 transform:scale(1.035)!important
}

.ixf-services{padding:clamp(130px,11vw,178px) 0!important}
.ixf-services .ixg-section-head{margin-bottom:58px!important}
.ixf-service-line{
 min-height:clamp(300px,26vw,390px)!important;
 grid-template-columns:minmax(130px,.20fr) minmax(0,1fr) 74px!important
}
.ixf-service-line__title{
 max-width:16ch!important;
 font-size:clamp(58px,5.8vw,92px)!important;
 line-height:.89!important
}
.ixf-service-line:nth-child(2){padding-left:clamp(36px,7vw,110px)!important}

.ixg-feature--one .ixf-feature__grid{
 grid-template-columns:minmax(0,.60fr) minmax(620px,1.40fr)!important
}
.ixg-feature--one .ixg-feature__stage{min-height:clamp(680px,58vw,860px)!important}
.ixg-feature--two .ixf-feature__grid{
 grid-template-columns:minmax(620px,1.22fr) minmax(0,.78fr)!important;
 gap:clamp(74px,8vw,132px)!important
}
.ixg-feature--two .ixg-feature__stage{
 min-height:clamp(650px,55vw,820px)!important;
 transform:translateX(-54px)!important
}
.ixg-feature--two .ixg-feature__stage>.ixg-section-visual{
 overflow:hidden!important;
 box-shadow:0 38px 110px rgba(17,17,17,.15)!important
}
.ixg-feature--two .ixg-feature__stage>.ixg-section-visual img{
 width:100%!important;height:100%!important;object-fit:cover!important;
 object-position:50% 48%!important;
 filter:saturate(.86) contrast(1.08) brightness(.98)!important;
 transform:scale(1.04)!important
}
.ixf-feature__evidence-mark{
 width:34px!important;height:3px!important;display:block!important;background:var(--ix-brand-primary)!important
}

.ixg-trust-section{min-height:980px!important}
.ixg-trust-reasons{margin-top:58px!important}
.ixg-trust-reason{
 min-height:390px!important;
 padding:42px 36px!important;
 display:flex!important;
 flex-direction:column!important;
 justify-content:space-between!important
}
.ixg-trust-reason strong{
 max-width:16ch!important;
 font-size:clamp(28px,2.65vw,42px)!important;
 line-height:1.02!important;
 letter-spacing:-.045em!important
}
.ixg-trust-reason__graphic{margin-bottom:70px!important}

.ixg-partner-proof{
 padding:clamp(118px,10vw,158px) 0!important;
 background:#edeae2!important
}
.ixg-partner-proof .ixg-section-head{
 margin-bottom:42px!important;
 grid-template-columns:minmax(220px,.38fr) minmax(0,.82fr)!important
}
.ixf-partner-feature{
 grid-template-columns:minmax(380px,.80fr) minmax(0,1.20fr)!important;
 min-height:clamp(560px,48vw,690px)!important;
 border:0!important;
 box-shadow:0 24px 70px rgba(17,17,17,.08)!important
}
.ixf-partner-feature__identity{
 padding:clamp(54px,5vw,84px)!important;
 background:#fff!important;
 border-right:0!important
}
.ixf-partner-feature .ixg-partner-logo{
 width:min(390px,92%)!important;
 max-height:185px!important
}
.ixf-partner-feature__mark{width:min(250px,72%)!important}
.ixf-partner-feature__copy{
 padding:clamp(58px,6vw,96px)!important;
 justify-content:center!important;
 background:#101213!important;
 color:#fff!important
}
.ixf-partner-feature__copy strong{
 max-width:12ch!important;
 font-size:clamp(58px,6vw,96px)!important;
 line-height:.88!important;
 color:#fff!important
}
.ixf-partner-feature__copy i{
 width:min(430px,78%)!important;
 background:linear-gradient(90deg,var(--ix-brand-primary) 0 46%,rgba(255,255,255,.18) 46% 100%)!important
}

.ixm-bridge{padding:clamp(120px,10vw,160px) 0!important}
.ixm-bridge__grid{
 min-height:430px!important;
 grid-template-columns:minmax(0,1fr) minmax(280px,360px)!important;
 gap:clamp(64px,8vw,120px)!important
}
.ixm-bridge__copy h2{font-size:clamp(72px,7.2vw,116px)!important;max-width:8.5ch!important}
.ixm-bridge .ixg-actions{
 width:100%!important;height:210px!important;
 align-self:center!important
}
.ixm-bridge .ixg-cta--secondary{
 width:100%!important;height:100%!important;min-height:210px!important;
 display:flex!important;align-items:center!important;justify-content:center!important;
 background:var(--ix-brand-primary)!important;color:#fff!important;
 border:0!important;border-radius:0!important;
 box-shadow:none!important
}
.ixm-bridge .ixg-cta--secondary .ixg-cta__label{font-size:13px!important;letter-spacing:.12em!important}

.ixg-contact,.ixg-contact__inner{min-height:clamp(760px,70vw,940px)!important}
.ixg-contact h2{font-size:clamp(88px,9.6vw,154px)!important;max-width:7.4ch!important}
.ixg-contact .ixg-actions{width:clamp(250px,21vw,340px)!important;height:190px!important}
.ixg-contact .ixg-cta--primary{
 width:100%!important;height:100%!important;min-height:190px!important;
 border-radius:0!important;display:flex!important;align-items:center!important;justify-content:center!important
}

.ix-v2-footer-grid{align-items:stretch!important}
.ix-v2-footer-contact-block{
 padding:34px!important;
 border:0!important;
 background:var(--ix-brand-primary)!important;
 color:#fff!important
}
.ix-v2-footer-contact-block a,.ix-v2-footer-contact-block strong,.ix-v2-footer-contact-block span{color:#fff!important}
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
 .ixg-partner-proof__grid{grid-template-columns:1fr!important}
 .ixf-service-line{grid-template-columns:minmax(120px,.25fr) minmax(0,1fr) 44px!important;gap:28px!important}
 .ixf-service-line:nth-child(2){padding-left:0!important}
 .ixf-partner-feature{grid-template-columns:minmax(220px,.55fr) minmax(0,1fr)!important}
 .ixf-partner-feature__identity{padding-right:36px!important}
 .ixf-partner-feature__copy{padding-left:44px!important}
 .ix-v2-footer-grid{grid-template-columns:1fr 1fr!important}
}

@media(max-width:700px){

 .ix-v2-header{padding:10px 10px 0!important}
 .ix-v2-header-inner{min-height:62px!important;padding:8px 8px 8px 12px!important;grid-template-columns:minmax(0,1fr) auto!important}
 .ix-v2-nav{display:none!important}
 .ix-v2-header-inner:after{
  content:""!important;display:block!important;width:22px!important;height:14px!important;margin-left:10px!important;
  background:linear-gradient(#fff,#fff) 0 0/100% 1px no-repeat,linear-gradient(#fff,#fff) 0 50%/72% 1px no-repeat,linear-gradient(#fff,#fff) 0 100%/100% 1px no-repeat!important;
  opacity:.74!important
 }
 .ix-v2-header-cta{min-height:42px!important;padding:0 12px!important;font-size:8px!important}
 .ixf-hero__inner{padding-top:118px!important}
 .ixg-feature--one .ixg-feature__stage:before,
 .ixg-feature--two .ixg-feature__stage.has-visual:after{display:none!important}
 .ixg-bridge[data-r116-set-piece="bridge"]{padding:82px 0!important}
 .ixg-bridge[data-r116-set-piece="bridge"] .ixg-bridge__grid{grid-template-columns:1fr!important;gap:26px!important;padding:32px 0!important}
 .ixg-bridge[data-r116-set-piece="bridge"] .ixg-bridge__copy h2{font-size:clamp(52px,14vw,72px)!important;max-width:9ch!important}
 .ixg-bridge[data-r116-set-piece="bridge"] .ixg-bridge__evidence{border-left:0!important;border-top:1px solid rgba(32,34,36,.16)!important;padding-left:0!important}

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
 .ixm-bridge{padding:80px 0!important}
 .ixm-bridge__grid{grid-template-columns:1fr!important;gap:30px!important}
 .ixm-bridge__copy h2{font-size:clamp(52px,14vw,74px)!important}
 .ixg-contact,.ixg-contact__inner{min-height:560px!important}
 .ixg-contact__inner{grid-template-columns:1fr!important;gap:30px!important}
 .ixg-contact h2{font-size:clamp(60px,16vw,88px)!important}
 .ix-v2-footer{padding:78px 20px 34px!important}
 .ix-v2-footer-grid{grid-template-columns:1fr!important;gap:36px!important}

 .ixf-service-line{
  grid-template-columns:1fr!important;
  gap:18px!important;
  min-height:0!important;
  padding:34px 0 42px!important
 }
 .ixf-service-line__index{min-height:68px!important;padding:0!important}
 .ixf-service-line__mark{width:92px!important;height:58px!important}
 .ixf-service-line__title{font-size:clamp(42px,11vw,58px)!important;max-width:100%!important}
 .ixf-service-line__body{margin-top:18px!important}
 .ixf-service-line__rule{display:none!important}
 .ixf-partner-feature{grid-template-columns:1fr!important;min-height:0!important}
 .ixf-partner-feature__identity{
  min-height:220px!important;
  padding:28px 0!important;
  border-right:0!important;
  border-bottom:1px solid rgba(32,34,36,.16)!important
 }
 .ixf-partner-feature .ixg-partner-logo{width:min(250px,76%)!important;max-height:110px!important}
 .ixf-partner-feature__copy{padding:40px 0!important;gap:28px!important}
 .ixf-partner-feature__copy strong{font-size:clamp(38px,10vw,52px)!important;max-width:100%!important}

 .ixf-hero__copy{padding-bottom:44px!important;max-width:100%!important}
 .ixf-hero__copy h1{font-size:clamp(52px,13.5vw,72px)!important;max-width:10.5ch!important}
 .ixf-hero__signature{bottom:30px!important;width:42%!important}

 .ixf-positioning{padding:0!important}
 .ixf-positioning__grid{
  min-height:0!important;
  display:grid!important;
  grid-template-columns:1fr!important;
  grid-template-rows:auto auto auto!important
 }
 .ixf-positioning__statement{
  grid-row:1!important;
  min-height:370px!important;
  padding:72px 0 44px!important;
  border-right:0!important
 }
 .ixf-positioning__statement h2{font-size:clamp(52px,13vw,68px)!important;max-width:9ch!important}
 .ixf-positioning__media{
  grid-row:2!important;
  min-height:430px!important;
  margin:0 calc(50% - 50vw)!important;
  width:100vw!important;
  max-width:100vw!important
 }
 .ixf-positioning__media .ixg-section-visual{min-height:430px!important}
 .ixf-positioning__body{
  grid-row:3!important;
  padding:44px 0 76px!important;
  border-right:0!important
 }
 .ixf-positioning__body>p:first-child{font-size:18px!important;max-width:30ch!important}

 .ixf-services{padding:94px 0!important}
 .ixf-service-line:nth-child(2){padding-left:0!important}
 .ixf-service-line__title{font-size:clamp(46px,11.5vw,62px)!important}
 .ixg-feature--one .ixg-feature__stage,.ixg-feature--two .ixg-feature__stage{min-height:390px!important}
 .ixg-feature--two .ixg-feature__stage{transform:none!important}

 .ixg-trust-section{min-height:0!important;padding:96px 0!important}
 .ixg-trust-reason{min-height:190px!important;padding:30px 24px!important}
 .ixg-trust-reason__graphic{margin-bottom:34px!important;min-height:52px!important}
 .ixg-trust-reason strong{font-size:clamp(24px,6.6vw,32px)!important;max-width:15ch!important}

 .ixg-partner-proof{padding:92px 0!important}
 .ixf-partner-feature{grid-template-columns:1fr!important;min-height:0!important}
 .ixf-partner-feature__identity{
  min-height:250px!important;padding:38px 28px!important;
  border-bottom:0!important
 }
 .ixf-partner-feature .ixg-partner-logo{width:min(270px,86%)!important;max-height:128px!important}
 .ixf-partner-feature__copy{min-height:300px!important;padding:46px 28px!important}
 .ixf-partner-feature__copy strong{font-size:clamp(46px,12vw,62px)!important;max-width:10ch!important}

 .ixm-bridge__grid{grid-template-columns:1fr!important;min-height:0!important;gap:38px!important}
 .ixm-bridge .ixg-actions{height:78px!important;width:100%!important}
 .ixm-bridge .ixg-cta--secondary{min-height:78px!important}

 .ixg-contact,.ixg-contact__inner{min-height:650px!important}
 .ixg-contact h2{font-size:clamp(68px,17vw,92px)!important;max-width:7.5ch!important}
 .ixg-contact .ixg-actions{width:100%!important;height:78px!important}
 .ixg-contact .ixg-cta--primary{min-height:78px!important}

 .ix-v2-footer-contact-block{padding:28px!important}
}
`;
