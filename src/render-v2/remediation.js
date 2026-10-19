import { db, getProspect } from "./db.js";
import { createShadowInputPack } from "./input-pack.js";
import { safeExternalHttpUrl, ensureArray } from "./utils.js";
import { REMEDIATION_POLICY_VERSION } from "./constants.js";

const UNAVAILABLE=/^(?:|NON[_ ]?DISPONIBILE|N\/A|NA|UNKNOWN|NON[_ ]?VERIFICAT[OA]|NOT_AVAILABLE)$/i;

function meaningful(v) {
  const s=String(v??"").trim();
  return s.length>2 && !UNAVAILABLE.test(s);
}

function cleanText(s) {
  return String(s||"")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi," ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;|&#160;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&lt;/gi,"<")
    .replace(/&gt;/gi,">")
    .replace(/\s+/g," ")
    .trim();
}

function attr(tag,name) {
  const m=String(tag||"").match(new RegExp("\\b"+name+"\\s*=\\s*[\"']([^\"']+)[\"']","i"));
  return m?.[1]||"";
}

function absUrl(value,base) {
  try {
    const u=new URL(value,base).toString();
    return safeExternalHttpUrl(u);
  } catch { return null; }
}

async function fetchDoc(url) {
  const safe=safeExternalHttpUrl(url);
  if(!safe) return null;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try {
    const res=await fetch(safe,{
      redirect:"follow",
      signal:controller.signal,
      headers:{
        "user-agent":"ImpresaX-InputRemediation/1.0",
        "accept":"text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.2"
      }
    });
    if(!res.ok) return null;
    const type=String(res.headers.get("content-type")||"").toLowerCase();
    if(!/text\/html|application\/xhtml|text\/plain/.test(type)) return null;
    const raw=(await res.text()).slice(0,450000);
    return {
      requested_url:safe,
      url:safeExternalHttpUrl(res.url)||safe,
      raw,
      text:cleanText(raw).slice(0,70000)
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function discoverServiceLinks(doc) {
  if(!doc?.raw) return [];
  const candidates=[];
  const seen=new Set();
  const origin=(()=>{try{return new URL(doc.url).origin}catch{return null}})();
  if(!origin) return [];
  const re=/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let order=0;
  for(const m of doc.raw.matchAll(re)) {
    const href=absUrl(m[1],doc.url);
    if(!href||seen.has(href)) continue;
    let u; try { u=new URL(href); } catch { continue; }
    if(u.origin!==origin) continue;
    const signal=u.pathname+u.search;
    if(!/(serviz|service|prestaz|trattament|attivit|soluzion|prodott|nolegg|costruzion|odontoiatr|fisioterap|specialit|competen|contatt|contact|dove|sede|chi-siamo|azienda|about)/i.test(signal)) continue;
    seen.add(href);
    const priority=/(contatt|contact|dove|sede)/i.test(signal)?0:
      /(chi-siamo|azienda|about)/i.test(signal)?1:2;
    candidates.push({href,priority,order:order++});
    if(candidates.length>=40) break;
  }
  return candidates
    .sort((a,b)=>a.priority-b.priority||a.order-b.order)
    .slice(0,5)
    .map(x=>x.href);
}

function firstPartyImageCandidates(docs,prospect) {
  let officialOrigin=null;
  try { officialOrigin=new URL(prospect?.website_url||prospect?.source_data?.current_site||"").origin; } catch {}
  if(!officialOrigin) return [];
  const out=[];
  const seen=new Set();
  for(const doc of docs||[]) {
    let docOrigin=null;
    try { docOrigin=new URL(doc.url).origin; } catch {}
    if(docOrigin!==officialOrigin || !doc.raw) continue;
    for(const m of doc.raw.matchAll(/<img\b[^>]*>/gi)) {
      const tag=m[0];
      const candidates=[
        attr(tag,"data-src"),
        attr(tag,"data-lazy-src"),
        attr(tag,"data-original"),
        attr(tag,"src")
      ].filter(Boolean);
      const srcset=attr(tag,"srcset")||attr(tag,"data-srcset");
      if(srcset) {
        const largest=srcset.split(",")
          .map(x=>x.trim().split(/\s+/))
          .filter(x=>x[0])
          .sort((a,b)=>{
            const na=parseFloat(a[1])||0, nb=parseFloat(b[1])||0;
            return nb-na;
          })[0]?.[0];
        if(largest) candidates.unshift(largest);
      }
      const rawUrl=candidates[0];
      const url=absUrl(rawUrl,doc.url);
      if(!url || seen.has(url)) continue;
      let u; try { u=new URL(url); } catch { continue; }
      if(u.origin!==officialOrigin) continue;
      const signal=[
        rawUrl,attr(tag,"alt"),attr(tag,"class"),attr(tag,"id"),
        u.pathname
      ].join(" ").toLowerCase();
      if(/logo|favicon|icon|sprite|avatar|emoji|badge|payment|cookie|tracking|pixel|placeholder|loader|spinner|captcha|social|facebook|instagram|whatsapp/.test(signal)) continue;
      if(/\.svg(?:$|\?)/i.test(u.pathname+u.search) || /\.gif(?:$|\?)/i.test(u.pathname+u.search)) continue;
      const width=parseInt(attr(tag,"width")||"0",10)||0;
      const height=parseInt(attr(tag,"height")||"0",10)||0;
      if((width>0&&width<480)||(height>0&&height<280)) continue;
      const area=(width||900)*(height||600);
      let score=0;
      if(width>=1000) score+=3; else if(width>=700) score+=2;
      if(height>=500) score+=2; else if(height>=350) score+=1;
      if(/hero|banner|gallery|project|portfolio|work|realizz|serviz|azienda|team|studio|showroom|cantiere|prodot/.test(signal)) score+=3;
      if(/thumb|small|mini|150x|300x|200x/.test(signal)) score-=4;
      if(area>=600000) score+=2;
      seen.add(url);
      out.push({
        url,
        role:"editorial",
        commercial_use_status:"FIRST_PARTY_REFERENCE",
        source_url:doc.url,
        source_type:"AUTOMATED_FIRST_PARTY_IMAGE_DISCOVERY",
        evidence_rule:"SAME_ORIGIN_OFFICIAL_SITE_IMAGE",
        width_hint:width||null,
        height_hint:height||null,
        score
      });
    }
  }
  return out
    .sort((a,b)=>b.score-a.score)
    .slice(0,8)
    .map(({score,...x})=>x);
}

function logoCandidate(doc,businessName) {
  if(!doc?.raw) return null;
  const nameTokens=String(businessName||"").toLowerCase().replace(/[^a-z0-9à-ÿ]+/g," ").split(/\s+/).filter(x=>x.length>=4).slice(0,3);
  let best=null,bestScore=0;
  for(const m of doc.raw.matchAll(/<img\b[^>]*>/gi)) {
    const tag=m[0];
    const src=attr(tag,"src")||attr(tag,"data-src")||attr(tag,"data-lazy-src");
    const url=absUrl(src,doc.url);
    if(!url) continue;
    const signal=[src,attr(tag,"alt"),attr(tag,"class"),attr(tag,"id")].join(" ").toLowerCase();
    let score=0;
    if(/logo|brand|marchio/.test(signal)) score+=5;
    for(const token of nameTokens) if(signal.includes(token)) score+=2;
    if(/header|navbar|site-logo/.test(signal)) score+=2;
    if(score>bestScore){bestScore=score;best=url;}
  }
  return bestScore>=4?best:null;
}

function extractOfferHeadings(docs) {
  const out=[];
  const pathSignal=/(serviz|service|prestaz|trattament|attivit|soluzion|prodott|nolegg|costruzion|odontoiatr|fisioterap|specialit|competen)/i;
  for(const doc of docs) {
    let u; try { u=new URL(doc.url); } catch { continue; }
    if(!pathSignal.test(u.pathname+u.search)) continue;
    const labels=[];
    for(const m of doc.raw.matchAll(/<(?:h1|h2|h3)\b[^>]*>([\s\S]*?)<\/(?:h1|h2|h3)>/gi)) {
      const t=cleanText(m[1]);
      if(t.length>=4 && t.length<=140 && !/(cookie|privacy|newsletter|menu|login|home)/i.test(t)) labels.push(t);
    }
    const title=doc.raw.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    if(title) {
      const t=cleanText(title[1]).replace(/\s*[|–—-]\s*[^|–—-]+$/,"").trim();
      if(t.length>=4 && t.length<=140 && !/(cookie|privacy|home)/i.test(t)) labels.unshift(t);
    }
    for(const label of labels) {
      const key=label.toLowerCase();
      if(!out.some(x=>x.toLowerCase()===key)) out.push(label);
      if(out.length>=8) break;
    }
    if(out.length>=8) break;
  }
  return out;
}

function contactPageSignal(doc) {
  try {
    const u=new URL(doc.url);
    const path=(u.pathname+u.search).toLowerCase();
    return path==="/" || /(contatt|contact|dove|sede|chi-siamo|azienda|about)/i.test(path);
  } catch {
    return false;
  }
}

function contactKey(type,value) {
  if(type==="email") return String(value||"").trim().toLowerCase();
  return String(value||"").replace(/\D/g,"");
}

function extractContacts(docs,prospect) {
  const observations=[];
  let officialOrigin=null;
  try {
    officialOrigin=new URL(prospect?.website_url||prospect?.source_data?.current_site||"").origin;
  } catch {}

  const pushObservation=(type,value,doc)=>{
    const key=contactKey(type,value);
    if(!key) return;
    observations.push({type,value,key,source_url:doc.url,official:officialOrigin?new URL(doc.url).origin===officialOrigin:false,authoritative:contactPageSignal(doc)});
  };

  for(const doc of docs) {
    for(const m of doc.raw.matchAll(/mailto:([^"'?\s>]+)/gi)) {
      const value=decodeURIComponent(m[1]).trim().toLowerCase();
      if(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) pushObservation("email",value,doc);
    }
    for(const m of doc.text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
      pushObservation("email",m[0].toLowerCase(),doc);
    }
    for(const m of doc.raw.matchAll(/tel:([^"'\s>]+)/gi)) {
      const value=decodeURIComponent(m[1]).replace(/[^+\d]/g,"");
      const digits=value.replace(/\D/g,"");
      if(digits.length>=7&&digits.length<=13) pushObservation("phone",value,doc);
    }
  }

  const sourcesByKey=new Map();
  const originsByKey=new Map();
  for(const o of observations) {
    if(!sourcesByKey.has(o.key)) sourcesByKey.set(o.key,new Set());
    sourcesByKey.get(o.key).add(o.source_url);
    let origin="";
    try { origin=new URL(o.source_url).origin; } catch {}
    if(!originsByKey.has(o.key)) originsByKey.set(o.key,new Set());
    if(origin) originsByKey.get(o.key).add(origin);
  }

  const accepted=[];
  const rejected=[];
  const seen=new Set();
  for(const o of observations) {
    const distinctSources=sourcesByKey.get(o.key)?.size||0;
    const distinctOrigins=originsByKey.get(o.key)?.size||0;
    const pass=officialOrigin
      ? o.official && (o.authoritative || distinctSources>=2)
      : distinctOrigins>=2;
    const enriched={
      type:o.type,
      value:o.value,
      source_url:o.source_url,
      scope:pass?"BUSINESS_CONTACT":"UNVERIFIED_CONTACT",
      confidence:pass?"HIGH":"REJECTED",
      evidence_rule:officialOrigin
        ? (o.authoritative?"FIRST_PARTY_CONTACT_SURFACE":distinctSources>=2?"FIRST_PARTY_REPEATED":"FIRST_PARTY_CONTEXT_INSUFFICIENT")
        : (distinctOrigins>=2?"MULTI_SOURCE_CORROBORATED":"SINGLE_THIRD_PARTY_SOURCE")
    };
    if(pass) {
      if(!seen.has(o.key)) accepted.push(enriched);
      seen.add(o.key);
    } else {
      rejected.push(enriched);
    }
  }

  const phones=accepted.filter(x=>x.type==="phone").map(x=>x.value);
  const emails=accepted.filter(x=>x.type==="email").map(x=>x.value);
  return {
    value:[...phones,...emails].slice(0,8).join(" | "),
    evidence:accepted.slice(0,12),
    rejected_evidence:rejected.slice(0,12)
  };
}

function parseJson(value) {
  if(value&&typeof value==="object"&&!Array.isArray(value)) return value;
  if(typeof value!=="string") return null;
  const clean=value.replace(/^\s*```(?:json)?\s*/i,"").replace(/\s*```\s*$/,"").trim();
  const candidates=[clean];
  const a=clean.indexOf("{"),b=clean.lastIndexOf("}");
  if(a>=0&&b>a) candidates.push(clean.slice(a,b+1));
  for(const x of candidates){ try{return JSON.parse(x)}catch{} }
  return null;
}

function extractAiObject(result) {
  const values=[
    result?.response,result?.response?.response,result?.response?.content,
    result?.result,result?.result?.response,result?.choices?.[0]?.message?.content,
    result?.output_text,result?.text
  ];
  for(const v of values){ const p=parseJson(v); if(p) return p; }
  throw new Error("REMEDIATION_AI_OUTPUT_INVALID");
}

function evidenceSupported(item,docs) {
  const doc=docs.find(d=>d.url===item?.source_url || d.requested_url===item?.source_url);
  if(!doc) return false;
  const needle=String(item?.evidence||"").replace(/\s+/g," ").trim().toLowerCase();
  const hay=String(doc.text||"").replace(/\s+/g," ").trim().toLowerCase();
  return needle.length>=8 && hay.includes(needle);
}

async function extractServices(env,docs,prospect) {
  if(!env.AI||!docs.length) return {services:[],trust:[]};
  const sourceBlocks=docs.map((d,i)=>"SOURCE_"+(i+1)+" "+d.url+"\n"+d.text.slice(0,18000)).join("\n\n");
  const schema={
    type:"object",additionalProperties:false,
    properties:{
      services:{type:"array",maxItems:8,items:{
        type:"object",additionalProperties:false,
        properties:{text:{type:"string"},source_url:{type:"string"},evidence:{type:"string"}},
        required:["text","source_url","evidence"]
      }},
      trust:{type:"array",maxItems:6,items:{
        type:"object",additionalProperties:false,
        properties:{text:{type:"string"},source_url:{type:"string"},evidence:{type:"string"}},
        required:["text","source_url","evidence"]
      }}
    },
    required:["services","trust"]
  };
  const prompt=[
    "Extract ONLY directly evidenced business services and trust facts for an ImpresaX prospect.",
    "Never infer a service from the company category alone.",
    "Every item MUST cite one exact source_url from the supplied sources and a short evidence substring copied verbatim from that source text.",
    "Do not output addresses, generic marketing claims, ratings unless explicitly present, or contact data as services.",
    "BUSINESS: "+prospect.business_name,
    "VERTICAL: "+String(prospect.vertical||""),
    sourceBlocks
  ].join("\n\n");
  const model=env.V2_MODEL_TEXT_FALLBACK||"@cf/meta/llama-3.3-70b-instruct-fp8-fast";
  const result=await env.AI.run(model,{
    messages:[
      {role:"system",content:"You are a strict evidence extraction engine. No unsupported claims."},
      {role:"user",content:prompt}
    ],
    response_format:{type:"json_schema",json_schema:schema},
    temperature:0,
    max_tokens:2600
  },env.AI_GATEWAY_ID?{gateway:{id:env.AI_GATEWAY_ID,skipCache:true}}:undefined);
  const data=extractAiObject(result);
  const services=(data.services||[]).filter(x=>evidenceSupported(x,docs)&&meaningful(x.text));
  const trust=(data.trust||[]).filter(x=>evidenceSupported(x,docs)&&meaningful(x.text));
  return {services,trust};
}

function conservativeDna(prospect,{services,contacts,trust,logo}) {
  const s=prospect.source_data||{};
  const address=String(s.address||prospect.city||"").trim();
  const city=String(prospect.city||"").trim();
  const vertical=String(prospect.vertical||"attività locale").trim();
  const identityLocked=["PASS","OFFICIAL_LOGO_LOCKED"].includes(String(logo?.status||"").toUpperCase());
  return {
    brand_personality:"Professionale, chiara e fattuale; evitare attributi di marca non verificati.",
    visual_cues:identityLocked
      ?"Usare esclusivamente il logo ufficiale verificato come identità; nessuna reinterpretazione."
      :"Usare la ragione sociale verificata come text identity; nessun logo inventato.",
    tone:"Professionale, diretto e basato esclusivamente su informazioni verificate.",
    business_type:vertical,
    audience:"Pubblico locale interessato ai servizi verificati dell'attività; non assumere segmenti non documentati.",
    offer:services,
    local_context:[city,address].filter(Boolean).join(" · "),
    trust_signals:trust||"Usare solo segnali di fiducia esplicitamente verificati nelle fonti.",
    existing_colors:identityLocked
      ?"Derivare eventuali colori solo dall'identità ufficiale verificata."
      :"Nessuna palette di brand verificata; usare una palette neutra senza attribuirla al brand.",
    typography_cues:"Nessun carattere proprietario verificato; usare tipografia di sistema leggibile e neutra.",
    imagery_cues:"Usare solo immagini first-party o con uso commerciale verificato; altrimenti ZERO_PHOTO_PREMIUM.",
    business_positioning:"Presentare l'attività in base a servizi, sede e fonti verificate, senza claim aggiuntivi.",
    commercial_behavior:"Usare esclusivamente i percorsi di contatto verificati: "+contacts
  };
}

async function collectDocs(prospect) {
  const s=prospect.source_data||{};
  const seeds=[
    prospect.website_url,
    s.current_site,
    ...ensureArray(s.source_references)
  ].map(safeExternalHttpUrl).filter(Boolean);
  const unique=[...new Set(seeds)].slice(0,6);
  const docs=[];
  for(const url of unique) {
    const doc=await fetchDoc(url);
    if(doc&&doc.text.length>80) docs.push(doc);
  }
  const firstParty=docs.find(d=>{
    try {
      const site=new URL(prospect.website_url||s.current_site||"");
      return new URL(d.url).origin===site.origin;
    } catch { return false; }
  });
  if(firstParty) {
    for(const url of discoverServiceLinks(firstParty)) {
      if(docs.some(d=>d.url===url)) continue;
      const doc=await fetchDoc(url);
      if(doc&&doc.text.length>80) docs.push(doc);
      if(docs.length>=11) break;
    }
  }
  return docs;
}

export async function remediateBlockedPack(env,{prospectId,packId}) {
  const sql=db(env);
  const prospect=await getProspect(sql,prospectId);
  const source=prospect.source_data||{};
  const sameRemediationPolicy=String(source.v2_remediation_policy_version||"")===REMEDIATION_POLICY_VERSION;
  const attempts=(sameRemediationPolicy?Number(source.v2_remediation_attempts||0):0)+1;
  const docs=await collectDocs(prospect);
  const contactsFound=extractContacts(docs,prospect);
  const firstPartyImages=firstPartyImageCandidates(docs,prospect);
  const ai=await extractServices(env,docs,prospect).catch(()=>({services:[],trust:[]}));
  const deterministicOffers=extractOfferHeadings(docs);

  const existingServices=meaningful(source.verified_services)?String(source.verified_services):"";
  const rawExistingContacts=meaningful(source.verified_contacts)?String(source.verified_contacts):"";
  const priorContactEvidence=ensureArray(source.v2_remediation_evidence?.contact_evidence);
  const remediationDerivedContacts=
    Boolean(source.v2_remediation_status) &&
    String(source.contact_data_state||"").toUpperCase()!=="VERIFICATO" &&
    priorContactEvidence.length>0;
  const existingContacts=remediationDerivedContacts?"":rawExistingContacts;
  const existingTrust=meaningful(source.verified_trust)?String(source.verified_trust):"";

  const verifiedServices=existingServices || ai.services.map(x=>x.text).join("; ") || deterministicOffers.join("; ");
  const verifiedContacts=existingContacts || contactsFound.value;
  const verifiedTrust=existingTrust || ai.trust.map(x=>x.text).join("; ");

  let logo=prospect.logo||{};
  const logoStatus=String(logo.status||"").toUpperCase();
  if(!["PASS","OFFICIAL_LOGO_LOCKED","NO_OFFICIAL_LOGO_CONFIRMED"].includes(logoStatus)) {
    const firstParty=docs.find(d=>{
      try {
        const site=new URL(prospect.website_url||source.current_site||"");
        return new URL(d.url).origin===site.origin;
      } catch { return false; }
    });
    const candidate=firstParty?logoCandidate(firstParty,prospect.business_name):null;
    logo=candidate ? {
      status:"OFFICIAL_LOGO_LOCKED",
      url:candidate,
      source:"AUTOMATED_FIRST_PARTY_REMEDIATION",
      source_url:firstParty.url,
      generated:false,
      lock:"IMMUTABLE",
      verification:"FIRST_PARTY_HTML_LOGO_SIGNAL"
    } : {
      status:"NO_OFFICIAL_LOGO_CONFIRMED",
      source_url:prospect.website_url||source.current_site||null,
      generated:false,
      use_verified_name_as_text:true,
      verification_note:"No direct official logo asset was found in the available first-party/source references during automated V2 remediation."
    };
  }

  const dna=conservativeDna(prospect,{
    services:verifiedServices,
    contacts:verifiedContacts,
    trust:verifiedTrust,
    logo
  });

  const evidence={
    fetched_sources:docs.map(d=>d.url),
    service_evidence:ai.services,
    deterministic_offer_headings:deterministicOffers,
    trust_evidence:ai.trust,
    contact_evidence:contactsFound.evidence,
    rejected_contact_evidence:contactsFound.rejected_evidence,
    first_party_image_evidence:firstPartyImages,
    contact_verification_rule:"FIRST_PARTY_CONTACT_SURFACE_OR_REPEATED_OFFICIAL_EVIDENCE",
    remediation_policy_version:REMEDIATION_POLICY_VERSION,
    remediated_at:new Date().toISOString()
  };

  const canCertify=meaningful(verifiedServices)&&meaningful(verifiedContacts)&&docs.length>0;
  await sql`
    update prospects
    set logo=${JSON.stringify(logo)}::jsonb,
        brand_dna=${JSON.stringify(dna)}::jsonb,
        source_data=coalesce(source_data,'{}'::jsonb)||${JSON.stringify({
          verified_services:verifiedServices||"NON_DISPONIBILE",
          verified_contacts:verifiedContacts||"NON_DISPONIBILE",
          contact_data_state:existingContacts
            ? (source.contact_data_state||"VERIFICATO")
            : (contactsFound.value?"V2_FIRST_PARTY_VERIFIED":(source.contact_data_state||"NON_VERIFICATO")),
          verified_trust:verifiedTrust||source.verified_trust||"NON_DISPONIBILE",
          first_party_images:[
            ...ensureArray(source.first_party_images),
            ...firstPartyImages
          ].filter((item,index,arr)=>{
            const url=typeof item==="string"?item:item?.url;
            return url && arr.findIndex(x=>(typeof x==="string"?x:x?.url)===url)===index;
          }).slice(0,12),
          v2_remediation_attempts:attempts,
          v2_remediation_policy_version:REMEDIATION_POLICY_VERSION,
          v2_remediation_status:canCertify?"EVIDENCE_READY":"EVIDENCE_INCOMPLETE",
          v2_remediation_evidence:evidence
        })}::jsonb
    where id=${prospect.id}::uuid`;

  if(!canCertify) {
    const exhausted=attempts>=2;
    await sql`
      update render_v2_packs
      set metadata=coalesce(metadata,'{}'::jsonb)||${JSON.stringify({
        remediation_attempts:attempts,
        remediation_policy_version:REMEDIATION_POLICY_VERSION,
        remediation_status:"EVIDENCE_INCOMPLETE",
        remediation_exhausted:exhausted,
        remediation_exhausted_reason:exhausted?"VERIFIED_INPUT_EVIDENCE_NOT_FOUND":null,
        remediation_checked_at:new Date().toISOString()
      })}::jsonb,
      updated_at=now()
      where id=${packId}::uuid`;
    if(exhausted) {
      await sql`
        update prospects
        set render_status='INPUT_BLOCKED',
            current_step='INPUT_EVIDENCE_REQUIRED',
            error='V2_INPUT_EVIDENCE_EXHAUSTED',
            next_action='SOURCE_ENRICHMENT_REQUIRED',
            updated_at=now()
        where id=${prospect.id}::uuid`;
    }
    return {status:"INPUT_BLOCKED",attempts,can_certify:false,exhausted,evidence};
  }

  await sql`
    update render_v2_packs
    set status='SUPERSEDED',
        metadata=coalesce(metadata,'{}'::jsonb)||${JSON.stringify({
          superseded_by_input_remediation:true,
          remediation_attempts:attempts,
          remediated_at:new Date().toISOString()
        })}::jsonb,
        updated_at=now()
    where id=${packId}::uuid and status='INPUT_BLOCKED'`;

  const refreshed=await createShadowInputPack(env,prospect.id);
  return {
    status:refreshed.input_pack?.certification_status==="PASS"?"INPUT_READY":"INPUT_BLOCKED",
    attempts,
    can_certify:true,
    new_pack_id:refreshed.pack?.id,
    certification:refreshed.input_pack?.certification_status,
    issues:refreshed.input_pack?.certification_issues||[],
    evidence
  };
}
