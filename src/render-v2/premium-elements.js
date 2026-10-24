export const PREMIUM_ELEMENT_STANDARD="IMPRESAX_PREMIUM_ELEMENTS_V1";

function ensureFinalButtonStructure(html=""){
  return String(html).replace(
    /(<a\b[^>]*class=["'][^"']*r119-btn--final[^"']*["'][^>]*>)([^<]*)(<\/a>)/i,
    (_,open,label,close)=>open+'<span class="ixbtn-label">'+label.trim()+'</span><span class="ixbtn-mark" aria-hidden="true"><i></i></span>'+close
  );
}

export function applyPremiumElements(spec={}){
  const clone={...(spec||{})};
  let html=String(clone.main_html||"");
  let css=String(clone.custom_css||"");
  if(!html) return clone;
  if(html.includes('data-premium-elements="'+PREMIUM_ELEMENT_STANDARD+'"')) return clone;

  html=ensureFinalButtonStructure(html);
  html=html.replace(/<section\b([^>]*)id=["']hero["']([^>]*)>/i,'<section$1id="hero"$2 data-premium-elements="'+PREMIUM_ELEMENT_STANDARD+'">');

  css += '.r119-btn[data-premium-button],.r119-contact__link,.ix-v2-header-cta{position:relative!important;isolation:isolate!important;overflow:hidden!important;border-radius:0!important;text-transform:uppercase!important;letter-spacing:.11em!important;font-weight:800!important;clip-path:polygon(0 0,calc(100% - 15px) 0,100% 15px,100% 100%,0 100%)!important;transition:transform .3s ease,box-shadow .3s ease,background .3s ease!important}.r119-btn[data-premium-button]{min-height:62px!important;padding:0 12px 0 22px!important;border:1px solid rgba(255,255,255,.38)!important}.r119-btn--solid{background:linear-gradient(120deg,#b3171a,#7d0d10)!important;color:#fff!important;box-shadow:0 16px 38px rgba(94,7,9,.25)!important}.r119-btn--ghost{background:rgba(8,9,10,.38)!important;color:#fff!important;backdrop-filter:blur(12px)!important}.r119-btn[data-premium-button]>span:last-child,.ixbtn-mark{width:40px;height:40px;border:1px solid currentColor;display:grid;place-items:center;flex:0 0 40px}.r119-btn[data-premium-button]>span:last-child:empty,.ixbtn-mark i{width:13px;height:13px;border-top:2px solid currentColor;border-right:2px solid currentColor;transform:rotate(45deg)}.r119-btn--final{min-height:112px!important;background:linear-gradient(135deg,#f7f3ec,#fff)!important;color:#090a0b!important;border:0!important;padding:0 18px 0 28px!important;box-shadow:0 28px 80px rgba(0,0,0,.22)!important}.r119-btn--final .ixbtn-label{font-size:12px}.r119-contact__link{padding:20px 18px 20px 22px!important;border:1px solid rgba(255,255,255,.38)!important;background:rgba(8,9,10,.24)!important;backdrop-filter:blur(10px)!important}.ix-v2-header-cta{min-height:48px!important;padding:0 20px!important;background:linear-gradient(120deg,#111315,#2a2d2f)!important;color:#fff!important;border:1px solid rgba(255,255,255,.12)!important;box-shadow:0 12px 28px rgba(0,0,0,.16)!important}.r119-btn[data-premium-button]:hover,.r119-contact__link:hover,.ix-v2-header-cta:hover{transform:translateY(-3px)!important;box-shadow:0 22px 50px rgba(0,0,0,.24)!important}@media(max-width:700px){.r119-btn[data-premium-button]{min-height:52px!important;padding-left:14px!important}.r119-btn[data-premium-button]>span:last-child,.ixbtn-mark{width:34px;height:34px;flex-basis:34px}.r119-btn--final{min-height:82px!important}.ix-v2-header-cta{min-height:40px!important;padding:0 13px!important;font-size:9px!important}}';
  clone.main_html=html;
  clone.custom_css=css;
  clone.premium_element_standard=PREMIUM_ELEMENT_STANDARD;
  clone.implementation_notes=(String(clone.implementation_notes||"")+" PREMIUM ELEMENTS V1: chamfered industrial CTA objects, directional marks, glass/metal hierarchy, no generic rectangular buttons.").trim();
  return clone;
}

export function premiumElementViolations(spec={}){
  const html=String(spec?.main_html||"");
  const css=String(spec?.custom_css||"");
  const issues=[];
  if(!/data-premium-elements=["']IMPRESAX_PREMIUM_ELEMENTS_V1["']/i.test(html)) issues.push("PREMIUM_ELEMENT_STANDARD_REQUIRED");
  if(!/\.r119-btn\[data-premium-button\]/i.test(css)) issues.push("PREMIUM_BUTTON_SYSTEM_REQUIRED");
  if(!/\.ix-v2-header-cta\{/i.test(css)) issues.push("PREMIUM_HEADER_CTA_REQUIRED");
  if(!/\.r119-contact__link\{/i.test(css)) issues.push("PREMIUM_CONTACT_CTA_REQUIRED");
  return issues;
}
