import { db, getProspect, findActiveV2Pack } from "./db.js";
import { QUALITY_CONTRACT_VERSION, EXECUTION_ENGINE_VERSION, MODEL_ROUTE_VERSION } from "./constants.js";
import { ensureArray, safeHttpUrl, safeExternalHttpUrl, stableStringify, sha256, unique } from "./utils.js";

const REQUIRED_DNA=[
  "brand_personality","visual_cues","tone","business_type","audience","offer",
  "local_context","trust_signals","existing_colors","typography_cues","imagery_cues",
  "business_positioning","commercial_behavior"
];

const UNAVAILABLE_MARKERS=new Set(["","NON_DISPONIBILE","NON DISPONIBILE","N/A","NA","UNKNOWN","NON_VERIFICATO","NON VERIFICATO","NOT_AVAILABLE"]);

function meaningfulVerifiedValue(v) {
  if(Array.isArray(v)) return v.some(meaningfulVerifiedValue);
  if(v && typeof v==="object") return Object.values(v).some(meaningfulVerifiedValue);
  const text=String(v??"").trim();
  return text.length>2 && !UNAVAILABLE_MARKERS.has(text.toUpperCase());
}

function objectHasValue(v) {
  return meaningfulVerifiedValue(v);
}

function verifiedOrEmpty(v) {
  return meaningfulVerifiedValue(v) ? v : "";
}

function assetCandidates(prospect) {
  const s=prospect.source_data||{};
  const out=[];
  const logo=prospect.logo||{};
  const logoUrl=safeHttpUrl(logo.url||logo.official_source);
  if(logoUrl) out.push({asset_id:"PRIMARY_LOGO",role:"identity",source_url:logoUrl,source_type:"OFFICIAL_IDENTITY",commercial_use_status:"OFFICIAL_IDENTITY",required:true});

  const fields=["first_party_images","approved_external_images","visual_assets","image_assets"];
  let n=1;
  for(const field of fields) {
    for(const raw of ensureArray(s[field])) {
      const url=safeHttpUrl(typeof raw==="string"?raw:(raw?.url||raw?.src||raw?.asset_url));
      if(!url) continue;
      const approvedExternal=field==="approved_external_images";
      out.push({
        asset_id:"VISUAL_"+String(n++).padStart(2,"0"),
        role:String(raw?.role||"visual"),
        source_url:url,
        source_type:approvedExternal?"APPROVED_EXTERNAL":"FIRST_PARTY",
        commercial_use_status:String(raw?.commercial_use_status||(approvedExternal?"APPROVED_EXTERNAL":"FIRST_PARTY_REFERENCE")),
        required:false
      });
    }
  }
  const seen=new Set();
  return out.filter(x=>{ if(seen.has(x.source_url)) return false; seen.add(x.source_url); return true; }).slice(0,20);
}

export function buildInputPayload(prospect) {
  const s=prospect.source_data||{};
  const logo=prospect.logo||{};
  const status=String(logo.status||"").toUpperCase();
  const assets=assetCandidates(prospect);
  return {
    prospect_id:prospect.id,
    prospect_code:prospect.legacy_ids?.id_prospect||s.id_prospect||prospect.id,
    business_name:prospect.business_name,
    vertical:prospect.vertical,
    city:prospect.city,
    country:prospect.country,
    website_url:prospect.website_url,
    address:s.address||prospect.city||"",
    official_logo:logo,
    identity_mode:status==="NO_OFFICIAL_LOGO_CONFIRMED"?"TEXT_IDENTITY":"OFFICIAL_LOGO",
    brand_dna:prospect.brand_dna||{},
    verified_services:verifiedOrEmpty(s.verified_services),
    verified_contacts:verifiedOrEmpty(s.verified_contacts),
    contact_data_state:String(s.contact_data_state||""),
    contact_remediation_status:String(s.v2_remediation_status||""),
    contact_verification_evidence:ensureArray(s.v2_remediation_evidence?.contact_evidence),
    verified_trust:verifiedOrEmpty(s.verified_trust),
    commercial_goal:verifiedOrEmpty(s.commercial_goal),
    primary_cta:verifiedOrEmpty(s.primary_cta),
    secondary_cta:verifiedOrEmpty(s.secondary_cta),
    source_references:ensureArray(s.source_references).map(safeHttpUrl).filter(Boolean),
    assets,
    asset_mode:assets.some(x=>x.role!=="identity")?"VERIFIED_VISUALS":"ZERO_PHOTO_PREMIUM",
    locale:"it-IT",
    restrictions:{
      no_invented_claims:true,
      no_unverified_assets:true,
      no_logo_reinterpretation:true
    }
  };
}

export function certifyInputPayload(payload) {
  const issues=[];
  const logoStatus=String(payload?.official_logo?.status||"").toUpperCase();
  if(!["PASS","OFFICIAL_LOGO_LOCKED","NO_OFFICIAL_LOGO_CONFIRMED"].includes(logoStatus)) issues.push("OFFICIAL_IDENTITY_NOT_CERTIFIED");
  if(["PASS","OFFICIAL_LOGO_LOCKED"].includes(logoStatus) && !payload.assets.some(x=>x.asset_id==="PRIMARY_LOGO")) issues.push("PRIMARY_LOGO_ASSET_MISSING");
  if(logoStatus==="NO_OFFICIAL_LOGO_CONFIRMED") {
    if(payload?.official_logo?.generated!==false) issues.push("NO_LOGO_IDENTITY_MUST_NOT_BE_GENERATED");
    if(payload?.official_logo?.use_verified_name_as_text!==true) issues.push("NO_LOGO_VERIFIED_TEXT_IDENTITY_REQUIRED");
  }
  for(const key of REQUIRED_DNA) if(!objectHasValue(payload?.brand_dna?.[key])) issues.push("BRAND_DNA_MISSING:"+key);
  if(!meaningfulVerifiedValue(payload?.verified_services)) issues.push("VERIFIED_SERVICES_REQUIRED");
  if(!meaningfulVerifiedValue(payload?.verified_contacts)) issues.push("VERIFIED_CONTACTS_REQUIRED");
  const contactState=String(payload?.contact_data_state||"").toUpperCase();
  const remediatedContact=Boolean(String(payload?.contact_remediation_status||"").trim());
  const highConfidenceContactEvidence=ensureArray(payload?.contact_verification_evidence).some(e=>
    String(e?.scope||"").toUpperCase()==="BUSINESS_CONTACT" &&
    String(e?.confidence||"").toUpperCase()==="HIGH"
  );
  if(
    meaningfulVerifiedValue(payload?.verified_contacts) &&
    remediatedContact &&
    !["VERIFICATO","V2_FIRST_PARTY_VERIFIED"].includes(contactState) &&
    !highConfidenceContactEvidence
  ) issues.push("VERIFIED_CONTACT_PROVENANCE_REQUIRED");
  if(!meaningfulVerifiedValue(payload?.address)) issues.push("VERIFIED_LOCATION_REQUIRED");
  if(!payload?.source_references?.length) issues.push("SOURCE_REFERENCES_REQUIRED");
  const ids=payload?.assets?.map(x=>x.asset_id)||[];
  if(unique(ids).length!==ids.length) issues.push("DUPLICATE_ASSET_ID");
  const allowedUse=new Set(["OFFICIAL_IDENTITY","FIRST_PARTY_REFERENCE","APPROVED_EXTERNAL","APPROVED_COMMERCIAL","LICENSED_COMMERCIAL"]);
  for(const asset of payload?.assets||[]) {
    if(!safeExternalHttpUrl(asset?.source_url)) issues.push("ASSET_SOURCE_URL_INVALID_OR_PRIVATE:"+String(asset?.asset_id||"UNKNOWN"));
    if(!allowedUse.has(String(asset?.commercial_use_status||"").toUpperCase())) {
      issues.push("ASSET_COMMERCIAL_USE_UNRESOLVED:"+String(asset?.asset_id||"UNKNOWN"));
    }
  }
  return {pass:issues.length===0,issues};
}

export async function createShadowInputPack(env,prospectRef) {
  const sql=db(env);
  const prospect=await getProspect(sql,prospectRef);
  let existing=await findActiveV2Pack(sql,prospect.id);
  if(existing && (
    String(existing.quality_contract_version||"")!==QUALITY_CONTRACT_VERSION ||
    String(existing.execution_engine_version||"")!==EXECUTION_ENGINE_VERSION
  )) {
    const activeRows=await sql`
      select count(*)::int n
      from render_workflows_v2
      where render_pack_id=${existing.id}::uuid
        and status in ('QUEUED','RUNNING','PAUSED')`;
    const migratable=["ESCALATION_REQUIRED","INPUT_READY","INPUT_BLOCKED"].includes(String(existing.status||""));
    if(Number(activeRows[0]?.n||0)===0 && migratable) {
      await sql`
        update render_v2_packs
        set status='SUPERSEDED',
            metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
              'superseded_by_contract_upgrade',true,
              'superseded_from_quality_contract',coalesce(quality_contract_version,''),
              'superseded_from_engine',coalesce(execution_engine_version,''),
              'superseded_to_quality_contract',${QUALITY_CONTRACT_VERSION}::text,
              'superseded_to_engine',${EXECUTION_ENGINE_VERSION}::text,
              'superseded_at',to_jsonb(now())
            ),
            updated_at=now()
        where id=${existing.id}::uuid`;
      existing=null;
    }
  }
  if(existing) {
    const rows=await sql`select * from render_input_packs where render_pack_id=${existing.id}::uuid limit 1`;
    if(rows.length) {
      const input=rows[0];
      if(String(existing.input_pack_id||"")!==String(input.id)) {
        await sql`update render_v2_packs set input_pack_id=${input.id}::uuid,updated_at=now() where id=${existing.id}::uuid`;
      }
      return {created:false,pack:{...existing,input_pack_id:input.id},input_pack:input,recovered_pointer:String(existing.input_pack_id||"")!==String(input.id)};
    }

    const payload=buildInputPayload(prospect);
    const certification=certifyInputPayload(payload);
    const contentHash=await sha256(stableStringify(payload));
    const versions=await sql`select coalesce(max(input_version),0)+1 as v from render_input_packs where prospect_id=${prospect.id}::uuid`;
    const inputVersion=Number(versions[0]?.v||1);
    const inserted=await sql`
      insert into render_input_packs(
        render_pack_id,prospect_id,input_version,quality_contract_version,content_hash,
        certification_status,certification_issues,payload
      ) values(
        ${existing.id}::uuid,${prospect.id}::uuid,${inputVersion},${QUALITY_CONTRACT_VERSION},${contentHash},
        ${certification.pass?"PASS":"FAIL"},${JSON.stringify(certification.issues)}::jsonb,${JSON.stringify(payload)}::jsonb
      ) returning *`;
    const input=inserted[0];
    await sql`
      update render_v2_packs
      set input_pack_id=${input.id}::uuid,
          status=${certification.pass?"INPUT_READY":"INPUT_BLOCKED"},
          metadata=coalesce(metadata,'{}'::jsonb)||${JSON.stringify({input_recovered:true,input_hash:contentHash})}::jsonb,
          updated_at=now()
      where id=${existing.id}::uuid`;
    return {created:false,recovered_input:true,pack:{...existing,input_pack_id:input.id,status:certification.pass?"INPUT_READY":"INPUT_BLOCKED"},input_pack:input,certification};
  }

  const payload=buildInputPayload(prospect);
  const certification=certifyInputPayload(payload);
  const contentHash=await sha256(stableStringify(payload));
  const versions=await sql`select coalesce(max(input_version),0)+1 as v from render_input_packs where prospect_id=${prospect.id}::uuid`;
  const inputVersion=Number(versions[0]?.v||1);
  const packRows=await sql`
    insert into render_v2_packs(
      prospect_id,status,quality_contract_version,execution_engine_version,model_route_version,priority,shadow_mode,metadata
    ) values(
      ${prospect.id}::uuid,${certification.pass?"INPUT_READY":"INPUT_BLOCKED"},
      ${QUALITY_CONTRACT_VERSION},${EXECUTION_ENGINE_VERSION},${MODEL_ROUTE_VERSION},
      ${prospect.priority==="A"?10:prospect.priority==="B"?50:100},true,
      ${JSON.stringify({source:"V2_SHADOW",input_hash:contentHash})}::jsonb
    ) returning *`;
  const pack=packRows[0];
  const inputRows=await sql`
    insert into render_input_packs(
      render_pack_id,prospect_id,input_version,quality_contract_version,content_hash,
      certification_status,certification_issues,payload
    ) values(
      ${pack.id}::uuid,${prospect.id}::uuid,${inputVersion},${QUALITY_CONTRACT_VERSION},${contentHash},
      ${certification.pass?"PASS":"FAIL"},${JSON.stringify(certification.issues)}::jsonb,${JSON.stringify(payload)}::jsonb
    ) returning *`;
  const input=inputRows[0];
  await sql`update render_v2_packs set input_pack_id=${input.id}::uuid,updated_at=now() where id=${pack.id}::uuid`;
  return {created:true,pack:{...pack,input_pack_id:input.id},input_pack:input,certification};
}
