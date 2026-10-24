export const ICONOGRAPHIC_SYSTEM_STANDARD="IMPRESAX_ICONOGRAPHY_V2";

function injectAfterSectionOpen(html,id,markup){
  const re=new RegExp("(<section\\b[^>]*\\bid=[\\\"']"+id+"[\\\"'][^>]*>)","i");
  return re.test(html)?html.replace(re,"$1"+markup):html;
}

function injectTrustGlyph(html,index,markup){
  const re=new RegExp("(<article\\b[^>]*data-trust-reason=[\\\"']"+index+"[\\\"'][^>]*>)","i");
  return re.test(html)?html.replace(re,"$1"+markup):html;
}

export function applyPremiumIconography(spec={}){
  const clone={...(spec||{})};
  let html=String(clone.main_html||"");
  let css=String(clone.custom_css||"");
  if(!html) return clone;
  if(html.includes('data-iconography-system="'+ICONOGRAPHIC_SYSTEM_STANDARD+'"')) return clone;

  const materials='<div class="ixsig ixsig--materials" data-iconography-system="'+ICONOGRAPHIC_SYSTEM_STANDARD+'" data-iconographic-role="service-materials" aria-hidden="true"><i></i><i></i><i></i></div>';
  const rebar='<div class="ixsig ixsig--rebar" data-iconography-system="'+ICONOGRAPHIC_SYSTEM_STANDARD+'" data-iconographic-role="service-rebar" aria-hidden="true"><i></i><i></i><i></i><i></i></div>';
  const proofA='<span class="ixproof ixproof--a" data-iconography-system="'+ICONOGRAPHIC_SYSTEM_STANDARD+'" data-iconographic-role="proof-1" aria-hidden="true"><i></i><i></i></span>';
  const proofB='<span class="ixproof ixproof--b" data-iconography-system="'+ICONOGRAPHIC_SYSTEM_STANDARD+'" data-iconographic-role="proof-2" aria-hidden="true"><i></i><i></i></span>';
  const proofC='<span class="ixproof ixproof--c" data-iconography-system="'+ICONOGRAPHIC_SYSTEM_STANDARD+'" data-iconographic-role="proof-3" aria-hidden="true"><i></i><i></i><i></i></span>';
  const process='<div class="ixprocess" data-iconography-system="'+ICONOGRAPHIC_SYSTEM_STANDARD+'" data-iconographic-role="process" aria-hidden="true"><i></i><i></i><i></i><i></i></div>';
  const direction='<div class="ixdirection" data-iconography-system="'+ICONOGRAPHIC_SYSTEM_STANDARD+'" data-iconographic-role="direction" aria-hidden="true"><i></i><i></i></div>';

  html=injectAfterSectionOpen(html,"materials",materials);
  html=injectAfterSectionOpen(html,"services",rebar);
  html=injectTrustGlyph(html,1,proofA);
  html=injectTrustGlyph(html,2,proofB);
  html=injectTrustGlyph(html,3,proofC);
  html=injectAfterSectionOpen(html,"bridge",process);
  html=injectAfterSectionOpen(html,"final-cta",direction);

  css += '.ixsig{position:absolute;z-index:9;right:5vw;top:68px;width:104px;height:104px;border:1px solid currentColor;display:grid;place-items:center;opacity:.96}.ixsig i{display:block;position:absolute}.ixsig--materials i{width:50px;height:12px;border:2px solid currentColor}.ixsig--materials i:nth-child(1){transform:translateY(-20px)}.ixsig--materials i:nth-child(3){transform:translateY(20px)}.ixsig--rebar{grid-template-columns:repeat(4,1fr);padding:22px;gap:8px}.ixsig--rebar i{position:static;width:7px;height:58px;background:currentColor}.ixproof{width:54px;height:54px;border:1px solid currentColor;display:grid;place-items:center;flex:0 0 auto}.ixproof i{display:block}.ixproof--a i:first-child{width:24px;height:24px;border:2px solid currentColor}.ixproof--a i:last-child{width:26px;height:2px;background:currentColor}.ixproof--b i:first-child{width:25px;height:25px;border:2px solid currentColor;border-radius:50%}.ixproof--b i:last-child{width:2px;height:28px;background:currentColor}.ixproof--c{grid-template-columns:repeat(3,1fr);padding:12px;gap:5px}.ixproof--c i{width:7px;height:28px;background:currentColor}.r119-proof__facts article{position:relative;display:grid!important;grid-template-columns:auto 1fr!important;gap:18px!important;align-items:start!important}.ixprocess{position:absolute;z-index:9;right:5vw;top:36px;display:flex;align-items:center;gap:7px}.ixprocess i{width:36px;height:5px;background:currentColor}.ixprocess i:nth-child(2){width:74px}.ixprocess i:nth-child(3){width:24px}.ixdirection{position:absolute;z-index:9;right:5vw;top:56px;width:96px;height:96px;border:1px solid currentColor}.ixdirection i:first-child{position:absolute;left:20px;top:47px;width:54px;height:3px;background:currentColor;transform:rotate(-35deg)}.ixdirection i:last-child{position:absolute;right:16px;top:18px;width:24px;height:24px;border-top:3px solid currentColor;border-right:3px solid currentColor}@media(max-width:700px){.ixsig{right:16px;top:22px;width:76px;height:76px}.ixsig--rebar{padding:16px}.ixsig--rebar i{height:40px}.ixsig--materials i{width:38px}.ixproof{width:44px;height:44px}.ixprocess{right:16px;top:18px;transform:scale(.8);transform-origin:100% 0}.ixdirection{right:16px;top:22px;width:72px;height:72px}}';
  clone.main_html=html;
  clone.custom_css=css;
  clone.iconographic_system_standard=ICONOGRAPHIC_SYSTEM_STANDARD;
  clone.implementation_notes=(String(clone.implementation_notes||"")+" ICONOGRAPHY V2: large composition-level service signatures, proof glyphs inside proof items, process mark and directional signature.").trim();
  return clone;
}

export function iconographicSystemViolations(spec={}){
  const html=String(spec?.main_html||"");
  const css=String(spec?.custom_css||"");
  const issues=[];
  const count=(html.match(/data-iconography-system=["']IMPRESAX_ICONOGRAPHY_V2["']/gi)||[]).length;
  if(count<7) issues.push("ICONOGRAPHIC_SYSTEM_V2_REQUIRED:"+count+"/7");
  for(const role of ["service-materials","service-rebar","proof-1","proof-2","proof-3","process","direction"]){
    if(!new RegExp('data-iconographic-role=["\\\']'+role+'["\\\']','i').test(html)) issues.push("ICONOGRAPHIC_ROLE_REQUIRED:"+role);
  }
  if(!/\.ixsig\s*\{/i.test(css) || !/\.ixproof\s*\{/i.test(css)) issues.push("ICONOGRAPHIC_V2_CSS_REQUIRED");
  return issues;
}
