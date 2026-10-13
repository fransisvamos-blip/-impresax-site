import { sha256, bytesToBase64 } from "./utils.js";
import { EXECUTION_ENGINE_VERSION } from "./constants.js";

function bodyBytes(body) {
  if(typeof body==="string") return new TextEncoder().encode(body);
  if(body instanceof Uint8Array) return body;
  if(body instanceof ArrayBuffer) return new Uint8Array(body);
  throw new Error("R2_ARTIFACT_BODY_TYPE_UNSUPPORTED");
}

export async function putArtifact(env,sql,{packId,revisionId=null,type,key,body,mime,producerStep}) {
  if(!env.RENDER_ARTIFACTS) throw new Error("R2_BINDING_NOT_CONFIGURED");
  const bytes=bodyBytes(body);
  const hash=await sha256(bytes);
  await env.RENDER_ARTIFACTS.put(key,bytes,{httpMetadata:{contentType:mime},customMetadata:{sha256:hash,engine:EXECUTION_ENGINE_VERSION}});
  const rows=await sql`
    insert into render_artifacts_v2(
      render_pack_id,variant_revision_id,artifact_type,r2_key,sha256,mime,bytes,producer_step,execution_engine_version
    ) values(
      \${packId}::uuid,\${revisionId}::uuid,\${type},\${key},\${hash},\${mime},\${bytes.byteLength},\${producerStep},\${EXECUTION_ENGINE_VERSION}
    )
    on conflict(r2_key) do update set
      sha256=excluded.sha256,mime=excluded.mime,bytes=excluded.bytes,producer_step=excluded.producer_step
    returning *`;
  return rows[0];
}

export async function ingestInputAssets(env,sql,{pack,inputPack}) {
  const payload=inputPack.payload||{};
  const assets={};
  for(const asset of payload.assets||[]) {
    const key="render-v2/"+payload.prospect_code+"/"+pack.id+"/inputs/"+asset.asset_id;
    try {
      const resp=await fetch(asset.source_url,{headers:{"User-Agent":"ImpresaX-Render-V2/1.0"}});
      if(!resp.ok) throw new Error("R2_INPUT_ASSET_FETCH_"+resp.status);
      const mime=(resp.headers.get("content-type")||"application/octet-stream").split(";")[0].trim();
      if(asset.role==="identity" && !/^image\//i.test(mime)) throw new Error("PRIMARY_LOGO_NOT_IMAGE");
      const bytes=new Uint8Array(await resp.arrayBuffer());
      if(bytes.byteLength<32) throw new Error("INPUT_ASSET_TOO_SMALL");
      const rec=await putArtifact(env,sql,{packId:pack.id,type:"INPUT_ASSET_"+asset.asset_id,key,body:bytes,mime,producerStep:"INPUT_INGEST"});
      assets[asset.asset_id]={...asset,r2_key:key,mime,sha256:rec.sha256,bytes:rec.bytes};
    } catch(error) {
      if(asset.required) throw new Error("REQUIRED_INPUT_ASSET_FAILED:"+asset.asset_id+":"+String(error?.message||error));
      assets[asset.asset_id]={...asset,unavailable:true,error:String(error?.message||error)};
    }
  }
  return assets;
}

export async function materializeAssetDataUrls(env,assets) {
  const out={};
  for(const [token,meta] of Object.entries(assets||{})) {
    if(meta.unavailable || !meta.r2_key) continue;
    const obj=await env.RENDER_ARTIFACTS.get(meta.r2_key);
    if(!obj) throw new Error("R2_INPUT_ASSET_MISSING:"+token);
    const bytes=new Uint8Array(await obj.arrayBuffer());
    out[token]="data:"+(meta.mime||"application/octet-stream")+";base64,"+bytesToBase64(bytes);
  }
  return out;
}

export async function readArtifactBytes(env,key) {
  const obj=await env.RENDER_ARTIFACTS.get(key);
  if(!obj) throw new Error("R2_ARTIFACT_NOT_FOUND:"+key);
  return new Uint8Array(await obj.arrayBuffer());
}
