export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  return "{" + Object.keys(value).sort().map(k => JSON.stringify(k)+":"+stableStringify(value[k])).join(",") + "}";
}

export async function sha256(value) {
  const data = typeof value === "string"
    ? new TextEncoder().encode(value)
    : value instanceof Uint8Array
      ? value
      : new Uint8Array(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

export function bytesToBase64(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out="";
  const size=0x8000;
  for(let i=0;i<data.length;i+=size) out += String.fromCharCode(...data.subarray(i,i+size));
  return btoa(out);
}

export function normalizeText(value, max=20000) {
  return String(value ?? "").replace(/\s+/g," ").trim().slice(0,max);
}

export function parseMaybeJson(value, fallback=null) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string" || !value.trim()) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

export function ensureArray(value) {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

export function safeHttpUrl(value) {
  try {
    const u=new URL(String(value||""));
    if(!["http:","https:"].includes(u.protocol)) return "";
    u.hash="";
    return u.href;
  } catch { return ""; }
}

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

export function nowIso() { return new Date().toISOString(); }

export function slug(value) {
  return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,80);
}

export function unique(values) {
  return [...new Set(values.filter(Boolean))];
}


export function safeExternalHttpUrl(value) {
  const normalized=safeHttpUrl(value);
  if(!normalized) return "";
  let u;
  try { u=new URL(normalized); } catch { return ""; }
  const host=u.hostname.toLowerCase().replace(/^\[|\]$/g,"");
  if(!host || host==="localhost" || host.endsWith(".localhost") || host==="metadata.google.internal") return "";
  if(host==="::1" || host==="0:0:0:0:0:0:0:1" || /^f[cd][0-9a-f:]*$/i.test(host) || /^fe[89ab][0-9a-f:]*$/i.test(host)) return "";
  const m=host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if(m) {
    const oct=m.slice(1).map(Number);
    if(oct.some(x=>x<0||x>255)) return "";
    const [a,b]=oct;
    if(a===0 || a===10 || a===127 || (a===169&&b===254) || (a===172&&b>=16&&b<=31) || (a===192&&b===168) || a>=224) return "";
  }
  return u.href;
}
