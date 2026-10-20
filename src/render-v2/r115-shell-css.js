export const R115_SHELL_CSS = `
/* R115 premium shell, CTA and footer finishing. */
.ix-v2-header{background:transparent!important;border-bottom:0!important;box-shadow:none!important;padding:16px clamp(18px,3vw,42px) 0!important;position:relative!important;z-index:50!important}
.ix-v2-header-inner{width:min(1380px,100%)!important;min-height:82px!important;padding:10px 12px 10px clamp(18px,2vw,30px)!important;border:1px solid rgba(32,34,36,.11)!important;background:rgba(250,249,246,.94)!important;box-shadow:0 18px 54px rgba(24,25,27,.09)!important;backdrop-filter:blur(22px)!important;position:relative!important;overflow:hidden!important}
.ix-v2-header-inner:before{content:""!important;position:absolute!important;left:0!important;top:0!important;bottom:0!important;width:4px!important;background:var(--ix-brand-primary)!important}
.ix-v2-nav{gap:8px!important;padding:5px!important;border:1px solid rgba(32,34,36,.08)!important;background:rgba(255,255,255,.68)!important}
.ix-v2-nav a{padding:11px 15px!important;font-size:10px!important;letter-spacing:.12em!important;background:none!important;transition:background .2s ease,color .2s ease!important}
.ix-v2-nav a:hover{background:var(--ix-brand-ink)!important;color:#fff!important}
.ix-v2-header-cta{min-height:52px!important;padding:0 22px!important;border:0!important;background:var(--ix-brand-primary)!important;box-shadow:0 12px 28px var(--ix-brand-glow)!important;font-size:10px!important;letter-spacing:.12em!important}
.ixg-cta{min-height:58px!important;padding:0 8px 0 20px!important;border-radius:0!important;display:inline-flex!important;align-items:center!important;gap:18px!important;font-size:10px!important;letter-spacing:.115em!important;box-shadow:none!important;transition:transform .2s ease,box-shadow .2s ease!important}
.ixg-cta:hover{transform:translateY(-2px)!important}
.ixg-cta__mark{width:42px!important;height:42px!important;display:grid!important;place-items:center!important;border-left:1px solid currentColor!important;position:relative!important}
.ixg-cta__mark i{display:block!important;width:13px!important;height:1px!important;background:currentColor!important;position:relative!important}
.ixg-cta__mark i:after{content:""!important;position:absolute!important;right:0!important;top:-3px!important;width:7px!important;height:7px!important;border-top:1px solid currentColor!important;border-right:1px solid currentColor!important;transform:rotate(45deg)!important}
.ixg-cta--primary{box-shadow:0 14px 34px var(--ix-brand-glow)!important}
.ixm-bridge{background:linear-gradient(135deg,#fbfaf7 0%,#fff 66%,var(--ix-brand-soft) 100%)!important;border-top:1px solid rgba(32,34,36,.10)!important}
.ixm-bridge__grid{min-height:330px!important;align-items:center!important}
.ixg-contact{min-height:520px!important;background:radial-gradient(circle at 78% 38%,var(--ix-brand-glow),transparent 27%),linear-gradient(128deg,#111214,#232527 66%,#161719)!important}
.ixg-contact__inner{min-height:520px!important;align-items:center!important}
.ixg-contact h2{max-width:9ch!important;font-size:clamp(58px,7vw,104px)!important;line-height:.88!important}
.ix-v2-footer{position:relative!important;margin-top:-1px!important;padding:clamp(84px,8vw,120px) clamp(24px,6vw,90px) 44px!important;background:linear-gradient(180deg,#17191b 0%,#101113 66%,#0b0c0d 100%)!important;border-top:0!important;overflow:hidden!important}
.ix-v2-footer:before{content:""!important;position:absolute!important;left:0!important;right:0!important;top:0!important;height:5px!important;background:linear-gradient(90deg,var(--ix-brand-primary) 0 36%,rgba(255,255,255,.12) 36% 62%,transparent 62%)!important}
.ix-v2-footer:after{content:""!important;position:absolute!important;right:-12%!important;top:10%!important;width:48%!important;height:70%!important;border:1px solid rgba(255,255,255,.05)!important;transform:skewX(-14deg)!important;pointer-events:none!important}
.ix-v2-footer-grid{position:relative!important;z-index:2!important;grid-template-columns:minmax(360px,1.35fr) minmax(180px,.48fr) minmax(320px,.9fr)!important;gap:clamp(54px,7vw,110px)!important;padding-top:24px!important;border-top:1px solid rgba(255,255,255,.14)!important}
.ix-v2-footer-logo{max-width:min(300px,54vw)!important;max-height:86px!important}
.ix-v2-footer-tagline{font-size:14px!important;max-width:46ch!important;color:rgba(247,246,242,.64)!important}
.ix-v2-footer-nav{gap:22px!important}.ix-v2-footer-nav a{font-size:10px!important;letter-spacing:.12em!important;opacity:.78!important}
.ix-v2-footer-contact-block{padding:18px!important;border:1px solid rgba(255,255,255,.12)!important;background:rgba(255,255,255,.025)!important}
.ix-v2-footer-contact:first-child{min-height:50px!important;padding:0 16px!important;border:0!important;background:var(--ix-brand-primary)!important;color:#fff!important;width:max-content!important}
@media(max-width:700px){.ix-v2-header{padding:10px 10px 0!important}.ix-v2-header-inner{min-height:70px!important;padding:9px 9px 9px 14px!important;grid-template-columns:minmax(0,1fr) auto!important}.ix-v2-nav{grid-column:1/-1!important;gap:4px!important;padding:4px!important;overflow-x:auto!important}.ix-v2-nav a{padding:9px 11px!important;font-size:9px!important}.ix-v2-header-cta{min-height:44px!important;padding:0 14px!important;font-size:9px!important}.ixg-contact,.ixg-contact__inner{min-height:430px!important}.ixg-contact h2{font-size:clamp(52px,15vw,76px)!important}.ix-v2-footer{padding:66px 20px 34px!important}.ix-v2-footer-grid{grid-template-columns:1fr!important;gap:34px!important}}
`;
