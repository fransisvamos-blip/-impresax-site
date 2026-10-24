export const PREMIUM_ELEMENT_STANDARD="IMPRESAX_PREMIUM_ELEMENTS_V1";
export const FINAL_CONVERSION_OBJECT_STANDARD="IMPRESAX_FINAL_CONVERSION_OBJECT_V1";

function ensureFinalConversionObject(html=""){
  return String(html).replace(
    /(<a\b[^>]*class=["'][^"']*r119-btn--final[^"']*["'][^>]*>)([\s\S]*?)(<\/a>)/i,
    (_,open,inner,close)=>{
      const token=String(inner).match(/\{\{copy:[A-Z0-9_]+\}\}/i)?.[0]||inner.replace(/<[^>]+>/g,"").trim();
      const tagged=open.includes("data-final-conversion-object=")
        ? open
        : open.replace(/>$/,' data-final-conversion-object="'+FINAL_CONVERSION_OBJECT_STANDARD+'">');
      return tagged
        +'<span class="ixconvert__label">'+token+'</span>'
        +'<span class="ixconvert__action" aria-hidden="true"><span class="ixconvert__rail"></span><span class="ixconvert__arrow"><i></i></span></span>'
        +close;
    }
  );
}

export function applyPremiumElements(spec={}){
  const clone={...(spec||{})};
  let html=String(clone.main_html||"");
  let css=String(clone.custom_css||"");
  if(!html) return clone;

  html=ensureFinalConversionObject(html);
  if(!html.includes('data-premium-elements="'+PREMIUM_ELEMENT_STANDARD+'"')){
    html=html.replace(/<section\b([^>]*)id=["']hero["']([^>]*)>/i,'<section$1id="hero"$2 data-premium-elements="'+PREMIUM_ELEMENT_STANDARD+'">');
  }

  css += '.r119-btn[data-premium-button],.r119-contact__link,.ix-v2-header-cta{position:relative!important;overflow:hidden!important;border-radius:0!important;text-transform:uppercase!important;letter-spacing:.1em!important;font-weight:800!important;clip-path:polygon(0 0,calc(100% - 15px) 0,100% 15px,100% 100%,0 100%)!important;transition:transform .3s ease,box-shadow .3s ease!important}.r119-btn[data-premium-button]{min-height:62px!important;padding:0 12px 0 22px!important;border:1px solid rgba(255,255,255,.38)!important}.r119-btn--solid{background:linear-gradient(120deg,#b3171a,#7d0d10)!important;color:#fff!important}.r119-btn--ghost{background:rgba(8,9,10,.38)!important;color:#fff!important;backdrop-filter:blur(12px)!important}.r119-contact__link{padding:20px 18px 20px 22px!important;border:1px solid rgba(255,255,255,.38)!important;background:rgba(8,9,10,.24)!important}.ix-v2-header-cta{min-height:48px!important;padding:0 20px!important;background:#17191b!important;color:#fff!important;border:1px solid rgba(255,255,255,.12)!important}.r119-btn[data-premium-button]:hover,.r119-contact__link:hover,.ix-v2-header-cta:hover{transform:translateY(-3px)!important}';

  css += '.r119-close>.r119-btn--final[data-final-conversion-object]{width:min(720px,90%)!important;min-height:104px!important;margin:38px 0 0!important;padding:0!important;display:grid!important;grid-template-columns:1fr 116px!important;justify-self:start!important;background:#f6f3ed!important;color:#0a0b0c!important;border:1px solid rgba(255,255,255,.5)!important;box-shadow:0 30px 90px rgba(0,0,0,.28)!important;clip-path:polygon(0 0,calc(100% - 20px) 0,100% 20px,100% 100%,0 100%)!important}.ixconvert__label{display:flex!important;align-items:center!important;padding:0 30px!important;font-size:12px!important;font-weight:850!important;letter-spacing:.12em!important}.ixconvert__action{position:relative!important;display:grid!important;place-items:center!important;background:#111315!important;color:#fff!important}.ixconvert__rail{position:absolute!important;inset:0 auto 0 0!important;width:5px!important;background:#b3171a!important}.ixconvert__arrow{width:46px!important;height:46px!important;border:1px solid rgba(255,255,255,.42)!important;display:grid!important;place-items:center!important;transition:transform .3s ease!important}.ixconvert__arrow i{width:15px!important;height:15px!important;border-top:2px solid!important;border-right:2px solid!important;transform:rotate(45deg)!important}.r119-close>.r119-btn--final[data-final-conversion-object]:hover{transform:translateY(-4px)!important}.r119-close>.r119-btn--final[data-final-conversion-object]:hover .ixconvert__arrow{transform:translateX(4px)!important}';

  css += '@media(max-width:700px){.r119-btn[data-premium-button]{min-height:52px!important}.ix-v2-header-cta{min-height:40px!important;padding:0 13px!important}.r119-close>.r119-btn--final[data-final-conversion-object]{width:100%!important;min-height:82px!important;margin-top:28px!important;grid-template-columns:1fr 82px!important}.ixconvert__label{padding:0 18px!important;font-size:10px!important}.ixconvert__arrow{width:38px!important;height:38px!important}.ixconvert__rail{width:4px!important}}';

  clone.main_html=html;
  clone.custom_css=css;
  clone.premium_element_standard=PREMIUM_ELEMENT_STANDARD;
  clone.final_conversion_object_standard=FINAL_CONVERSION_OBJECT_STANDARD;
  clone.implementation_notes=(String(clone.implementation_notes||"")+" PREMIUM ELEMENTS V1 + FINAL CONVERSION OBJECT V1: final CTA is a controlled-width asymmetric conversion object with dedicated action module, brand rail and directional control; generic full-width slab forbidden.").trim();
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
  const hasR119Final=/class=["'][^"']*r119-btn--final[^"']*["']/i.test(html);
  if(hasR119Final && !/data-final-conversion-object=["']IMPRESAX_FINAL_CONVERSION_OBJECT_V1["']/i.test(html)) issues.push("FINAL_CONVERSION_OBJECT_REQUIRED");
  if(hasR119Final && (!/\.ixconvert__action\{/i.test(css) || !/\.ixconvert__rail\{/i.test(css))) issues.push("FINAL_CONVERSION_OBJECT_CSS_REQUIRED");
  return issues;
}
