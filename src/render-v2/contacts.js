export function normalizeVerifiedPhone(raw,country="") {
  const source=String(raw||"").trim();
  if(!source) return "";
  let digits=source.replace(/\D/g,"");
  if(!digits) return "";
  if(source.startsWith("+")) return "+"+digits;
  if(digits.startsWith("00")) return "+"+digits.slice(2);
  const geo=String(country||"").toUpperCase();
  if(geo==="IT") {
    if(digits.startsWith("39") && digits.length>=11) return "+"+digits;
    return "+39"+digits;
  }
  return digits;
}

export function buildContactManifest(input) {
  const text=String(input?.verified_contacts||"");
  const email=(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)||[])[0]||"";
  const phoneRaw=(text.match(/(?:\+?\d[\d\s().-]{6,}\d)/)||[])[0]||"";
  const phone=normalizeVerifiedPhone(phoneRaw,input?.country);
  const primary=phone ? "tel:"+phone : email ? "mailto:"+email : "";
  const secondary=email ? "mailto:"+email : primary;
  if(!primary) throw new Error("INPUT_DATA:VERIFIED_CONTACT_PATH_UNRESOLVED");
  const address=String(input?.address||"").trim();
  return {PRIMARY:primary,SECONDARY:secondary,ADDRESS:address};
}
