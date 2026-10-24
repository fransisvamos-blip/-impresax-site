export const ICONOGRAPHIC_SYSTEM_STANDARD="IMPRESAX_ICONOGRAPHY_V1";

function injectAfterSectionOpen(html,id,markup){
  const re=new RegExp("(<section\\b[^>]*\\bid=[\\\"']"+id+"[\\\"'][^>]*>)","i");
  return re.test(html)?html.replace(re,"$1"+markup):html;
}

export function applyPremiumIconography(spec={},options={}){
  const clone={...(spec||{})};
  let html=String(clone.main_html||"");
  let css=String(clone.custom_css||"");
  if(!html || html.includes('data-iconography-system="'+ICONOGRAPHIC_SYSTEM_STANDARD+'"')) return clone;

  const services='<div class="ix-ico ix-ico--services" data-iconography-system="'+ICONOGRAPHIC_SYSTEM_STANDARD+'" data-iconographic-role="services" aria-hidden="true"><span class="ix-g ix-g--stack"><i></i><i></i><i></i></span><span class="ix-g ix-g--bars"><i></i><i></i><i></i></span></div>';
  const proof='<div class="ix-ico ix-ico--proof" data-iconography-system="'+ICONOGRAPHIC_SYSTEM_STANDARD+'" data-iconographic-role="proof" aria-hidden="true"><span class="ix-g ix-g--proof-a"><i></i><i></i></span><span class="ix-g ix-g--proof-b"><i></i><i></i></span><span class="ix-g ix-g--proof-c"><i></i><i></i></span></div>';
  const process='<div class="ix-ico ix-ico--process" data-iconography-system="'+ICONOGRAPHIC_SYSTEM_STANDARD+'" data-iconographic-role="process" aria-hidden="true"><i></i><i></i><i></i></div>';
  const direction='<div class="ix-ico ix-ico--direction" data-iconography-system="'+ICONOGRAPHIC_SYSTEM_STANDARD+'" data-iconographic-role="direction" aria-hidden="true"><i></i><i></i></div>';

  html=injectAfterSectionOpen(html,"services",services);
  html=injectAfterSectionOpen(html,"trust",proof);
  html=injectAfterSectionOpen(html,"bridge",process);
  html=injectAfterSectionOpen(html,"final-cta",direction);

  const iconCss='.ix-ico{position:absolute;z-index:8;pointer-events:none;color:currentColor}.ix-g{width:52px;height:52px;border:1px solid;display:grid;place-items:center}.ix-g i{display:block}.ix-ico--services,.ix-ico--proof{right:5vw;top:72px;display:flex;gap:8px}.ix-g--stack i{width:27px;height:7px;border:1px solid;margin:2px}.ix-g--bars{grid-template-columns:repeat(3,1fr);padding:10px;gap:5px}.ix-g--bars i{width:4px;height:29px;background:currentColor}.ix-g--bars i:nth-child(2){height:21px}.ix-ico--proof .ix-g{width:40px;height:40px}.ix-g--proof-a i:first-child{width:19px;height:19px;border:1px solid}.ix-g--proof-a i:last-child{width:21px;height:2px;background:currentColor}.ix-g--proof-b i:first-child{width:19px;height:19px;border-radius:50%;border:1px solid}.ix-g--proof-b i:last-child{width:2px;height:17px;background:currentColor}.ix-g--proof-c{grid-template-columns:1fr 1fr;padding:8px;gap:4px}.ix-g--proof-c i{width:9px;height:9px;background:currentColor}.ix-ico--process{right:5vw;top:38px;display:flex;align-items:center;gap:6px}.ix-ico--process i{display:block;width:32px;height:3px;background:currentColor}.ix-ico--process i:nth-child(2){width:58px}.ix-ico--direction{right:5vw;top:64px;width:64px;height:64px;border:1px solid}.ix-ico--direction i:first-child{position:absolute;left:15px;top:31px;width:33px;height:2px;background:currentColor;transform:rotate(-35deg)}.ix-ico--direction i:last-child{position:absolute;right:11px;top:14px;width:15px;height:15px;border-top:2px solid;border-right:2px solid}@media(max-width:700px){.ix-ico--services,.ix-ico--proof,.ix-ico--process,.ix-ico--direction{right:16px;top:24px;transform:scale(.78);transform-origin:100% 0}}';
  css += iconCss;
  clone.main_html=html;
  clone.custom_css=css;
  clone.iconographic_system_standard=ICONOGRAPHIC_SYSTEM_STANDARD;
  clone.implementation_notes=(String(clone.implementation_notes||"")+" ICONOGRAPHIC SYSTEM: 2 service glyphs, 3 proof glyphs, 1 process mark and 1 directional mark; geometric CSS/HTML only, no stock iconography.").trim();
  return clone;
}

export function iconographicSystemViolations(spec={}){
  const html=String(spec?.main_html||"");
  const css=String(spec?.custom_css||"");
  const issues=[];
  const count=(html.match(/data-iconography-system=["']IMPRESAX_ICONOGRAPHY_V1["']/gi)||[]).length;
  if(count<4) issues.push("ICONOGRAPHIC_SYSTEM_REQUIRED:"+count+"/4");
  if(!/data-iconographic-role=["']services["']/i.test(html)) issues.push("ICONOGRAPHIC_SERVICES_REQUIRED");
  if(!/data-iconographic-role=["']proof["']/i.test(html)) issues.push("ICONOGRAPHIC_PROOF_REQUIRED");
  if(!/data-iconographic-role=["']process["']/i.test(html)) issues.push("ICONOGRAPHIC_PROCESS_REQUIRED");
  if(!/data-iconographic-role=["']direction["']/i.test(html)) issues.push("ICONOGRAPHIC_DIRECTION_REQUIRED");
  if(!/\.ix-ico\s*\{/i.test(css)) issues.push("ICONOGRAPHIC_CSS_REQUIRED");
  return issues;
}
