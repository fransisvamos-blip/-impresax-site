const $=s=>document.querySelector(s);
let state={prospects:[],queue:[],selected:null,currentView:"home",renderingSelected:null};

const labels={
 total_prospects:"Aziende totali",
 ready_for_rendering:"Pronte per il rendering",
 rendering:"Rendering in corso",
 approved_reference:"Riferimento approvato",
 building:"Costruzione",
 qa:"Controllo qualità",
 demo_ready:"Demo pronte",
 escalation_required:"Intervento richiesto"
};

const statusLabels={
 READY_FOR_RENDERING:"Pronto per il rendering",
 RENDERING:"Rendering in corso",
 RENDER_REWORK:"Rendering da rifare",
 APPROVED_REFERENCE:"Riferimento approvato",
 READY_FOR_BUILD:"Pronto per la costruzione",
 BUILDING:"Costruzione in corso",
 BUILD_REWORK:"Costruzione da rifare",
 QA_RUNNING:"Controllo qualità in corso",
 QA_FAILED:"Controllo qualità fallito",
 ESCALATION_REQUIRED:"Intervento Cabina richiesto",
 DEMO_READY:"Demo pronta",
 SALES_READY:"Pronto per il Reparto Vendite",
 CONTACTED:"Contattato",
 WON:"Cliente acquisito",
 LOST:"Perso",
 HOLD:"In pausa",
 QUEUED:"In coda",
 RUNNING:"In corso",
 COMPLETED:"Completato",
 FAILED:"Fallito",
 CANCELLED:"Annullato",
 PASS:"Superato",
 FAIL:"Fallito",
 APPROVED:"Approvato",
 GENERATED:"Generato",
 READY:"Pronto",
 PENDING:"In attesa",
 SENT:"Inviata",
 DELIVERED:"Consegnata",
 DELIVERY_FAILED:"Consegna fallita",
 REVERIFY_REQUIRED:"Riverifica necessaria"
};

const actionLabels={
 START_RENDERING:"Avvia il rendering",
 WAIT_RENDER:"Attendi il rendering",
 RETRY_RENDER:"Ripeti il rendering",
 PREPARE_BUILD:"Prepara la costruzione",
 START_BUILD:"Avvia la costruzione",
 WAIT_BUILD:"Attendi la costruzione",
 RETRY_BUILD:"Ripeti la costruzione",
 RUN_QA:"Avvia il controllo qualità",
 QA_REWORK:"Correggi dopo il controllo qualità",
 CABINA_REVIEW:"Revisione della Cabina",
 CREATE_SALES_HANDOFF:"Prepara il passaggio al Reparto Vendite",
 WAIT_SALES_ENGINE:"Attendi il Reparto Vendite",
 TRACK_SALES:"Segui la trattativa",
 CONVERT_CLIENT:"Converti in cliente",
 ARCHIVE:"Archivia",
 HOLD:"Mantieni in pausa",
 REVERIFY:"Riverifica i dati",
 MONITOR:"Monitora"
};

const eventLabels={
 RENDER_STARTED:"Rendering avviato",
 RENDER_FAILED:"Rendering fallito",
 RENDER_COMPLETED:"Rendering completato",
 RENDER_STATE_ADVANCED:"Rendering avanzato alla fase successiva",
 READY_FOR_BUILD:"Pronto per la costruzione",
 BUILD_STARTED:"Costruzione avviata",
 BUILD_FAILED:"Costruzione fallita",
 BUILD_COMPLETED:"Costruzione completata",
 BUILD_STATE_ADVANCED:"Costruzione avanzata alla fase successiva",
 QA_FAILED:"Controllo qualità fallito",
 QA_PASSED:"Controllo qualità superato",
 QA_REWORK_ROUTED:"Correzione QA inoltrata alla costruzione",
 SALES_HANDOFF_CREATED:"Passaggio al Reparto Vendite creato",
 STATUS_CHANGED:"Stato modificato",
 PROSPECTS_INSERT:"Azienda inserita",
 PROSPECTS_UPDATE:"Azienda aggiornata",
 RENDER_JOBS_INSERT:"Lavoro di rendering creato",
 RENDER_JOBS_UPDATE:"Lavoro di rendering aggiornato",
 RENDER_JOBS_DELETE:"Lavoro di rendering eliminato",
 RENDER_PACKS_INSERT:"Pacchetto di rendering creato",
 RENDER_PACKS_UPDATE:"Pacchetto di rendering aggiornato",
 RENDER_PACKS_DELETE:"Pacchetto di rendering eliminato",
 RENDER_ASSETS_INSERT:"Risorsa di rendering aggiunta",
 RENDER_ASSETS_UPDATE:"Risorsa di rendering aggiornata",
 RENDER_ASSETS_DELETE:"Risorsa di rendering eliminata",
 SITE_BUILDS_INSERT:"Costruzione sito creata",
 SITE_BUILDS_UPDATE:"Costruzione sito aggiornata",
 SITE_BUILDS_DELETE:"Costruzione sito eliminata",
 QA_RUNS_INSERT:"Controllo qualità creato",
 QA_RUNS_UPDATE:"Controllo qualità aggiornato",
 QA_RUNS_DELETE:"Controllo qualità eliminato",
 SALES_HANDOFFS_INSERT:"Passaggio vendite creato",
 SALES_HANDOFFS_UPDATE:"Passaggio vendite aggiornato",
 SALES_HANDOFFS_DELETE:"Passaggio vendite eliminato",
 ORCHESTRATOR_QUEUE_INSERT:"Attività orchestratore aggiunta",
 ORCHESTRATOR_QUEUE_UPDATE:"Attività orchestratore aggiornata",
 ORCHESTRATOR_QUEUE_DELETE:"Attività orchestratore eliminata",
 OPS_GUARDRAIL_RESTORED:"Protezione operativa ripristinata",
 BUILD_JOB_CREATED:"Lavoro di costruzione creato",
 BUILD_CLAIMED:"Costruzione presa in carico",
 QA_STARTED:"Controllo qualità avviato",
 BUILD_REWORK:"Costruzione da correggere",
 DEMO_READY:"Demo pronta",
 ESCALATION_REQUIRED:"Intervento Cabina richiesto",
 JOB_STALE_RECOVERED:"Lavoro bloccato recuperato"
};

const verticalLabels={
 DENTAL_MEDICAL:"Dentale / Medicale",
 BEAUTY:"Bellezza / Estetica",
 RESTAURANT_HOSPITALITY:"Ristorazione / Ospitalità",
 PROFESSIONAL_SERVICES:"Servizi professionali",
 HOME_SERVICES_CONSTRUCTION:"Servizi casa / Edilizia"
};

const fieldLabels={
 pilot_id:"ID pilot",
 address:"Indirizzo",
 ops_import:"Importazione Ops",
 commercial_angle:"Angolo commerciale",
 outreach_hook:"Aggancio commerciale",
 source:"Fonte",
 operation:"Operazione",
 row:"Record",
 desktop_render_url:"Rendering desktop",
 mobile_render_url:"Rendering mobile",
 brand_dna:"DNA del brand",
 reference_score:"Punteggio riferimento",
 repository:"Repository",
 branch:"Ramo",
 commit_sha:"Commit",
 deploy_id:"ID distribuzione",
 live_url:"URL online",
 id_prospect:"ID prospect",
 global_priority_rank:"Posizione priorità globale",
 global_priority_score:"Punteggio priorità globale",
 production_order:"Ordine di produzione",
 priority_tier:"Fascia di priorità",
 current_site:"Sito attuale",
 site_status:"Stato del sito",
 website_confidence:"Affidabilità del sito",
 logo_source:"Fonte del logo",
 logo_source_status:"Stato della fonte logo",
 verified_services:"Servizi verificati",
 verified_contacts:"Contatti verificati",
 verified_trust:"Elementi di fiducia verificati",
 contact_data_state:"Stato dei dati di contatto",
 confidence:"Affidabilità dei dati",
 last_verified:"Ultima verifica",
 data_quality_status:"Qualità dei dati",
 source_references:"Fonti di verifica",
 warm_strategic:"Relazione strategica",
 warm_reason:"Motivo della relazione strategica",
 primary_digital_gap:"Gap digitale principale",
 primary_marketing_gap:"Gap marketing principale",
 commercial_goal:"Obiettivo commerciale",
 demo_angle:"Angolo della demo",
 primary_cta:"CTA primaria",
 secondary_cta:"CTA secondaria",
 outreach_policy:"Regola di contatto",
 desired_ops_status:"Stato Ops desiderato",
 master_version:"Versione master"
};

const valueLabels={
 ALTA:"Alta",
 MEDIA:"Media",
 VERIFICATO:"Verificato",
 DATO_DA_FONTE_TERZA:"Dato da fonte terza",
 CORRETTO:"Corretto",
 "DA CONTROLLARE":"Da controllare",
 NON_DISPONIBILE:"Non disponibile",
 SOURCE_CANDIDATE_NOT_ASSET_VERIFIED:"Fonte candidata · risorsa non ancora verificata",
 NO_OUTREACH_UNTIL_SALES_READY:"Nessun contatto prima dello stato Pronto per il Reparto Vendite",
 NESSUN_SITO_VERIFICATO:"Nessun sito verificato",
 SITO_ACCETTABILE:"Sito accettabile",
 SITO_BUONO:"Sito buono",
 SITO_FORTE:"Sito forte",
 SITO_MOLTO_DEBOLE:"Sito molto debole",
 SITO_NON_FUNZIONANTE:"Sito non funzionante",
 SITO_OBSOLETO:"Sito obsoleto",
 SITO_PROVVISORIO:"Sito provvisorio"
};

function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));}
function smallId(id){return id?String(id).slice(0,8)+"…":"—";}
function fmtDate(v){if(!v)return"—";try{return new Intl.DateTimeFormat("it-IT",{dateStyle:"short",timeStyle:"short"}).format(new Date(v))}catch{return v}}
function statusClass(v){return v==="ESCALATION_REQUIRED"?"status escalation":(v==="DEMO_READY"||v==="SALES_READY"||v==="WON"||v==="PASS"||v==="APPROVED"?"status ready":"status")}
function tStatus(v){return statusLabels[v]||v||"—";}
function tAction(v){return actionLabels[v]||v||"—";}
function tEvent(v){return eventLabels[v]||v||"—";}
function tVertical(v){return verticalLabels[v]||String(v||"—").replaceAll("_"," ");}
function tField(v){return fieldLabels[v]||String(v||"").replaceAll("_"," ");}
function localizedObject(value){
  if(typeof value==="boolean") return value?"Sì":"No";
  if(Array.isArray(value)) return value.map(localizedObject);
  if(value&&typeof value==="object"){
    return Object.fromEntries(Object.entries(value).map(([k,v])=>[tField(k),localizedObject(v)]));
  }
  if(typeof value==="string"){
    if(statusLabels[value]) return statusLabels[value];
    if(actionLabels[value]) return actionLabels[value];
    if(eventLabels[value]) return eventLabels[value];
    if(verticalLabels[value]) return verticalLabels[value];
    if(valueLabels[value]) return valueLabels[value];
  }
  return value;
}

async function api(path,options){const r=await fetch(path,options);if(!r.ok)throw new Error(await r.text());return r.json();}

function emailLogSummary(row){
  if(!row)return"—";
  return [tStatus(row.status),row.recipient,fmtDate(row.created_at)].filter(Boolean).join(" · ");
}
function renderEmailSystem(email){
  const ready=email?.status==="IMPRESAX_EMAIL_READY";
  $("#email-status").textContent=ready?"READY":"NON READY";
  $("#email-status").className="email-overall status "+(ready?"ready":"");
  $("#email-status-text").textContent=email?.status||"—";
  $("#email-sending").textContent=email?.sending||"—";

  const tracking=email?.delivery_tracking||{};
  $("#email-delivery-tracking").textContent=tracking.status||"PENDING";
  $("#email-delivery-tracking").className=tracking.status==="ACTIVE"?"pass":tracking.status==="ERROR"?"fail":"pending";

  $("#email-from").textContent=email?.from_address||"—";
  $("#email-last-send").textContent=emailLogSummary(email?.last_send);
  $("#email-last-delivery").textContent=emailLogSummary(email?.last_delivery);
  $("#email-last-error").textContent=email?.last_error
    ? [tStatus(email.last_error.status),email.last_error.error||"",fmtDate(email.last_error.created_at)].filter(Boolean).join(" · ")
    : "—";

  const permission=tracking.required_permission;
  $("#email-delivery-note").textContent=permission
    ? "Delivery analytics: serve permesso "+permission
    : tracking.reason
      ? "Delivery analytics: "+tracking.reason.replaceAll("_"," ")
      : "";

  const qaLabels={
    email_service_connection:"Email service connection",
    from_domain:"From domain",
    spf:"SPF",
    dkim:"DKIM",
    test_send:"Test send",
    no_send_error:"No send error"
  };
  $("#email-qa").innerHTML=Object.entries(qaLabels).map(([key,label])=>{
    const value=email?.qa?.[key]||"PENDING";
    const cls=value==="PASS"?"pass":value==="FAIL"?"fail":"pending";
    return `<div class="email-qa-item"><span>${esc(label)}</span><strong class="${cls}">${esc(value)}</strong></div>`;
  }).join("");
}

async function loadEmailSystem(){
  try{
    const d=await api("/ops/api/email/status");
    renderEmailSystem(d.email||{});
  }catch(e){
    $("#email-status").textContent="ERRORE";
    $("#email-status").className="email-overall status escalation";
    $("#email-status-text").textContent="EMAIL_SYSTEM_ERROR";
    console.error(e);
  }
}

function renderMetrics(counts){
  $("#metrics").innerHTML=Object.entries(labels).map(([k,l])=>`<article class="metric"><span>${esc(l)}</span><strong>${Number(counts[k]||0)}</strong></article>`).join("");
}
function renderRows(){
  const q=$("#search").value.trim().toLowerCase();
  const rows=state.prospects.filter(p=>!q||[
    p.azienda,p.id_prospect,p.vertical,tVertical(p.vertical),p.current_step,tStatus(p.current_step),p.pipeline_status,tStatus(p.pipeline_status),p.next_action,tAction(p.next_action)
  ].some(v=>String(v||"").toLowerCase().includes(q)));
  $("#rows").innerHTML=rows.map(p=>`<tr data-id="${esc(p.id_prospect)}" class="${state.selected===p.id_prospect?"selected":""}">
    <td>${esc(p.rank??"—")}</td>
    <td class="id" title="${esc(p.id_prospect)}">${esc(smallId(p.id_prospect))}</td>
    <td><strong>${esc(p.azienda)}</strong></td>
    <td>${esc(tVertical(p.vertical))}</td>
    <td>${esc(tStatus(p.render_status))}</td>
    <td>${esc(tStatus(p.build_status))}</td>
    <td>${esc(tStatus(p.qa_status))}</td>
    <td>${esc(p.attempt??0)}</td>
    <td>${p.live_url?`<a class="live" href="${esc(p.live_url)}" target="_blank" rel="noopener">ONLINE ↗</a>`:"—"}</td>
    <td><span class="${statusClass(p.pipeline_status)}">${esc(tStatus(p.current_step))}</span></td>
    <td>${esc(tEvent(p.last_event))}<br><span class="id">${esc(fmtDate(p.last_event_at))}</span></td>
    <td class="${p.error?"error":""}">${esc(p.error||"—")}</td>
    <td>${esc(tAction(p.next_action))}</td>
  </tr>`).join("");
  document.querySelectorAll("tr[data-id]").forEach(tr=>tr.addEventListener("click",()=>selectProspect(tr.dataset.id)));
}
function renderEvents(events){
  $("#events").innerHTML=(events||[]).map(e=>`<div class="event-row">
    <time>${esc(fmtDate(e.created_at))}</time>
    <strong>${esc(tEvent(e.event_type))}</strong>
    <span>${esc(e.prospect_id?smallId(e.prospect_id):e.entity_type||"sistema")}</span>
  </div>`).join("");
}

function setView(view){
  state.currentView=view;
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  document.querySelectorAll("[data-view-panel]").forEach(p=>p.classList.toggle("active",p.dataset.viewPanel===view));
}
function renderHome(counts){
  const active=state.prospects.filter(p=>["RENDERING","READY_FOR_BUILD","BUILDING","QA_RUNNING","BUILD_REWORK"].includes(p.pipeline_status));
  const ready=state.prospects.filter(p=>p.pipeline_status==="DEMO_READY");
  $("#home-status").innerHTML=`
    <div class="home-status-row"><span>Attività in corso</span><strong>${active.length}</strong></div>
    <div class="home-status-row"><span>Demo pronte</span><strong>${ready.length}</strong></div>
    <div class="home-status-row"><span>Render approvati</span><strong>${Number(counts.approved_reference||0)}</strong></div>
  `;
  const escs=state.prospects.filter(p=>p.pipeline_status==="ESCALATION_REQUIRED");
  $("#home-escalations").innerHTML=escs.length?escs.map(p=>`
    <button class="mini-prospect" data-open-prospect="${esc(p.id_prospect)}">
      <strong>${esc(p.azienda)}</strong><span>${esc(p.error||"Intervento richiesto")}</span>
    </button>`).join(""):'<span class="id">Nessun intervento richiesto</span>';
  document.querySelectorAll("[data-open-prospect]").forEach(b=>b.addEventListener("click",()=>{
    setView("prospects");selectProspect(b.dataset.openProspect);
  }));
}
function renderRenderingList(){
  const allowed=["READY_FOR_RENDERING","RENDERING","RENDER_REWORK","APPROVED_REFERENCE","READY_FOR_BUILD","BUILDING","BUILD_REWORK","QA_RUNNING","QA_FAILED","ESCALATION_REQUIRED","DEMO_READY"];
  const rows=state.prospects.filter(p=>allowed.includes(p.pipeline_status));
  $("#rendering-list").innerHTML=rows.length?rows.map(p=>`
    <button class="render-prospect-row ${state.renderingSelected===p.id_prospect?"selected":""}" data-render-prospect="${esc(p.id_prospect)}">
      <span><strong>${esc(p.azienda)}</strong><small>${esc(tVertical(p.vertical))}</small></span>
      <span class="${statusClass(p.pipeline_status)}">${esc(tStatus(p.render_status||p.pipeline_status))}</span>
    </button>`).join(""):'<div class="empty">Nessun prospect con rendering disponibile.</div>';
  document.querySelectorAll("[data-render-prospect]").forEach(b=>b.addEventListener("click",()=>openRenderingProspect(b.dataset.renderProspect)));
}
function renderPackCard(pack,assets){
  const rejected=String(pack.status||"").includes("REJECT");
  const complete=Boolean(pack.desktop_render_url&&pack.mobile_render_url);
  const directions=(assets||[]).filter(a=>a.render_pack_id===pack.id&&/^DIRECTION_[ABC]$/.test(String(a.asset_type||""))).sort((a,b)=>String(a.asset_type).localeCompare(String(b.asset_type)));
  return `
    <article class="render-pack-card ${pack.approved_reference?"approved":""}">
      <div class="render-pack-head">
        <div><span class="kicker">RENDER PACK</span><h3>Versione ${esc(pack.version)}</h3></div>
        <span class="${statusClass(pack.approved_reference?"APPROVED":pack.status)}">${pack.approved_reference?"SELEZIONATO":esc(tStatus(pack.status))}</span>
      </div>
      <div class="render-pair">
        <div><div class="render-label">Desktop 1440</div>${pack.desktop_render_url?`<a href="${esc(pack.desktop_render_url)}" target="_blank" rel="noopener"><img src="${esc(pack.desktop_render_url)}" alt="Render desktop"></a>`:'<div class="missing-render">Mancante</div>'}</div>
        <div><div class="render-label">Mobile 390</div>${pack.mobile_render_url?`<a href="${esc(pack.mobile_render_url)}" target="_blank" rel="noopener"><img src="${esc(pack.mobile_render_url)}" alt="Render mobile"></a>`:'<div class="missing-render">Mancante</div>'}</div>
      </div>
      ${directions.length?`<div class="direction-mini-grid">${directions.map(a=>`<a href="${esc(a.asset_url)}" target="_blank" rel="noopener"><img src="${esc(a.asset_url)}" alt="${esc(a.asset_type)}"><span>${esc(a.asset_type.replace("DIRECTION_","Direzione "))}</span></a>`).join("")}</div>`:""}
      <div class="render-pack-actions">
        <span class="id">${pack.reference_score!=null?"Score "+esc(pack.reference_score):""}</span>
        <button class="select-render" data-prospect-id="${esc(pack.prospect_id)}" data-pack-id="${esc(pack.id)}" ${(!complete||rejected||pack.approved_reference)?"disabled":""}>
          ${pack.approved_reference?"Render selezionato":"Implementa questo render"}
        </button>
      </div>
    </article>`;
}
async function openRenderingProspect(id){
  state.renderingSelected=id;renderRenderingList();
  $("#rendering-detail").innerHTML='<div class="empty">Caricamento render…</div>';
  try{
    const d=await api("/ops/api/prospects/"+encodeURIComponent(id));
    const p=d.prospect;
    $("#rendering-detail").innerHTML=`
      <div class="detail-head">
        <span class="kicker">RENDERING</span>
        <h3>${esc(p.business_name)}</h3>
        <p class="reference-note">Scegli solo una reference completa desktop + mobile. La scelta invia automaticamente il prospect alla Site Factory.</p>
      </div>
      <div class="render-pack-stack">${(d.render_packs||[]).length?(d.render_packs||[]).map(pack=>renderPackCard(pack,d.render_assets||[])).join(""):'<div class="empty">Nessun Render Pack disponibile.</div>'}</div>
    `;
    document.querySelectorAll(".select-render").forEach(b=>b.addEventListener("click",()=>selectRender(b.dataset.prospectId,b.dataset.packId,b)));
  }catch(e){
    $("#rendering-detail").innerHTML='<div class="empty error">Impossibile caricare i render.</div>';console.error(e);
  }
}
async function selectRender(prospectId,packId,button){
  if(!confirm("Inviare questo render alla Site Factory?"))return;
  button.disabled=true;button.textContent="Invio alla Site Factory…";
  try{
    await api("/ops/api/render/select",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prospect_id:prospectId,render_pack_id:packId})});
    await load();await openRenderingProspect(prospectId);
  }catch(e){
    alert("Selezione render non riuscita.");console.error(e);button.disabled=false;button.textContent="Implementa questo render";
  }
}
function renderFactoryList(){
  const stages=["APPROVED_REFERENCE","READY_FOR_BUILD","BUILDING","BUILD_REWORK","QA_RUNNING","QA_FAILED","ESCALATION_REQUIRED","DEMO_READY"];
  const rows=state.prospects.filter(p=>stages.includes(p.pipeline_status));
  $("#factory-list").innerHTML=rows.length?rows.map(p=>`
    <article class="factory-row">
      <div><strong>${esc(p.azienda)}</strong><small>${esc(tVertical(p.vertical))}</small></div>
      <div><span>Build</span><strong>${esc(tStatus(p.build_status))}</strong></div>
      <div><span>QA</span><strong>${esc(tStatus(p.qa_status))}</strong></div>
      <div><span>Fase</span><strong>${esc(tStatus(p.current_step))}</strong></div>
      <div><span>Tentativo</span><strong>${esc(p.attempt??0)}</strong></div>
      <div class="factory-actions">${p.live_url?`<a href="${esc(p.live_url)}" target="_blank" rel="noopener">Apri demo ↗</a>`:""}<button data-factory-prospect="${esc(p.id_prospect)}">Dettaglio</button></div>
    </article>`).join(""):'<div class="empty">Nessun sito in lavorazione.</div>';
  document.querySelectorAll("[data-factory-prospect]").forEach(b=>b.addEventListener("click",()=>{setView("prospects");selectProspect(b.dataset.factoryProspect)}));
}
function renderSalesList(){
  const salesStates=["DEMO_READY","SALES_READY","CONTACTED","WON","LOST"];
  const rows=state.prospects.filter(p=>salesStates.includes(p.pipeline_status));
  $("#sales-list").innerHTML=rows.length?rows.map(p=>`
    <article class="sales-row">
      <div><strong>${esc(p.azienda)}</strong><small>${esc(tVertical(p.vertical))}</small></div>
      <span class="${statusClass(p.pipeline_status)}">${esc(tStatus(p.pipeline_status))}</span>
      <div>${p.live_url?`<a href="${esc(p.live_url)}" target="_blank" rel="noopener">Demo ↗</a>`:"—"}</div>
      <button data-sales-prospect="${esc(p.id_prospect)}">Apri scheda</button>
    </article>`).join(""):'<div class="empty">Nessun prospect ancora pronto per Sales.</div>';
  document.querySelectorAll("[data-sales-prospect]").forEach(b=>b.addEventListener("click",()=>{setView("prospects");selectProspect(b.dataset.salesProspect)}));
}
function renderSystemQueue(){
  const q=state.queue||[];
  $("#system-queue").innerHTML=q.length?q.map(job=>`
    <article class="queue-row">
      <div><strong>${esc(job.task_type)}</strong><small>${esc(smallId(job.prospect_id))}</small></div>
      <span class="${statusClass(job.status)}">${esc(tStatus(job.status))}</span>
      <span>Attempt ${esc(job.attempt_count||0)}/${esc(job.max_attempts||0)}</span>
      <span class="${job.error?"error":"id"}">${esc(job.error||"—")}</span>
      <time>${esc(fmtDate(job.updated_at))}</time>
    </article>`).join(""):'<div class="empty">Coda orchestratore vuota.</div>';
}

function listBlock(title,items,formatter){
  return `<section class="detail-section"><h4>${esc(title)} · ${items?.length||0}</h4>${(items&&items.length)?items.slice(0,20).map(formatter).join(""):'<span class="id">Nessun record</span>'}</section>`;
}
function jsonBlock(title,value){
  const empty=value==null||(typeof value==="object"&&Object.keys(value).length===0);
  const translated=localizedObject(value);
  return `<section class="detail-section"><h4>${esc(title)}</h4>${empty?'<span class="id">Nessun dato</span>':`<pre class="json">${esc(JSON.stringify(translated,null,2))}</pre>`}</section>`;
}
function linkMaybe(url,label){
  return url?`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label||url)} ↗</a>`:"—";
}
function renderReferenceStudio(packs,assets){
  const pack=(packs||[]).find(x=>x.approved_reference)||(packs||[])[0];
  if(!pack)return '<section class="detail-section"><h4>Reference finale</h4><span class="id">Nessun Render Pack disponibile</span></section>';

  const cta=pack.cta_map||{};
  const directions=(assets||[])
    .filter(x=>/^DIRECTION_[ABC]$/.test(String(x.asset_type||"")))
    .sort((a,b)=>String(a.asset_type).localeCompare(String(b.asset_type)));

  const desktop=pack.desktop_render_url||"";
  const mobile=pack.mobile_render_url||"";

  return `
    <section class="detail-section reference-studio">
      <div class="reference-title">
        <div>
          <span class="kicker">REFERENCE FINALE</span>
          <h4>Home completa · v${esc(pack.version)}</h4>
        </div>
        <span class="${statusClass(pack.approved_reference?"APPROVED":"PENDING")}">${pack.approved_reference?"APPROVATA":"DA VALIDARE"}</span>
      </div>
      <p class="reference-note">Le tre direzioni creative sono concept di selezione. Qui sotto trovi invece la reference completa che la Site Factory deve riprodurre.</p>

      <div class="cta-preview">
        ${cta.primary?`<span><b>CTA primaria</b>${esc(cta.primary)}</span>`:""}
        ${cta.secondary?`<span><b>CTA secondaria</b>${esc(cta.secondary)}</span>`:""}
        ${cta.phone?`<span><b>Telefono</b>${esc(cta.phone)}</span>`:""}
        ${cta.email?`<span><b>Email</b>${esc(cta.email)}</span>`:""}
      </div>

      <div class="reference-grid">
        <article class="reference-card">
          <div class="reference-card-head"><strong>DESKTOP · 1440</strong>${linkMaybe(desktop,"Apri a piena risoluzione")}</div>
          ${desktop?`<a href="${esc(desktop)}" target="_blank" rel="noopener"><img class="reference-shot desktop-shot" src="${esc(desktop)}" alt="Reference desktop completa"></a>`:'<span class="id">Reference desktop mancante</span>'}
        </article>
        <article class="reference-card">
          <div class="reference-card-head"><strong>MOBILE · 390</strong>${linkMaybe(mobile,"Apri a piena risoluzione")}</div>
          ${mobile?`<a href="${esc(mobile)}" target="_blank" rel="noopener"><img class="reference-shot mobile-shot" src="${esc(mobile)}" alt="Reference mobile completa"></a>`:'<span class="id">Reference mobile mancante</span>'}
        </article>
      </div>

      ${directions.length?`
        <div class="directions-block">
          <h4>Direzioni creative · concept di selezione</h4>
          <p class="reference-note">A / B / C non sono home complete: servono solo a scegliere l'art direction. La home completa è quella mostrata sopra.</p>
          <div class="direction-grid">
            ${directions.map(x=>`<a class="direction-card" href="${esc(x.asset_url)}" target="_blank" rel="noopener">
              <img src="${esc(x.asset_url)}" alt="${esc(x.asset_type)}">
              <span>${esc(x.asset_type.replace("DIRECTION_","Direzione "))}</span>
            </a>`).join("")}
          </div>
        </div>`:""}
    </section>`;
}
async function selectProspect(id){
  state.selected=id;renderRows();
  $("#detail").innerHTML='<div class="empty">Caricamento…</div>';
  try{
    const d=await api("/ops/api/prospects/"+encodeURIComponent(id));
    const p=d.prospect;
    $("#detail").innerHTML=`
      <div class="detail-head"><span class="kicker">${esc(tStatus(p.pipeline_status))}</span><h3>${esc(p.business_name)}</h3>
        <div class="id">${esc(p.id)}</div>${p.live_url?`<p><a href="${esc(p.live_url)}" target="_blank" rel="noopener">Apri demo ↗</a></p>`:""}</div>
      <section class="detail-section"><h4>Azienda</h4><dl class="kv">
        <dt>Posizione</dt><dd>${esc(p.rank??"—")}</dd><dt>Verticale</dt><dd>${esc(tVertical(p.vertical))}</dd>
        <dt>Sito attuale</dt><dd>${linkMaybe(p.website_url,p.website_url)}</dd>
        <dt>URL demo</dt><dd>${linkMaybe(p.live_url,p.live_url)}</dd>
        <dt>Fase attuale</dt><dd>${esc(tStatus(p.current_step))}</dd>
        <dt>Prossima azione</dt><dd>${esc(tAction(p.next_action))}</dd>
        <dt>Motivo pausa</dt><dd>${esc(p.hold_reason||"—")}</dd>\n        <dt>Errore</dt><dd class="${p.error?"error":""}">${esc(p.error||"—")}</dd>
      </dl></section>
      ${renderReferenceStudio(d.render_packs,d.render_assets)}
      ${jsonBlock("Dati azienda / fonti",p.source_data)}
      ${jsonBlock("Logo",p.logo)}
      ${jsonBlock("DNA del brand",p.brand_dna)}
      ${listBlock("Lavori di rendering",d.render_jobs,x=>`<article class="timeline"><strong>${esc(tStatus(x.status))} · tentativo ${esc(x.attempt)}</strong><time>${esc(fmtDate(x.created_at))}</time></article>`)}
      ${listBlock("Pacchetti di rendering",d.render_packs,x=>`<article class="timeline"><strong>v${esc(x.version)} · ${esc(tStatus(x.status))}</strong><div class="asset-links">${linkMaybe(x.desktop_render_url,"Rendering desktop")} · ${linkMaybe(x.mobile_render_url,"Rendering mobile")}</div><time>${esc(fmtDate(x.created_at))}</time></article>`)}
      ${listBlock("Risorse",d.render_assets,x=>`<article class="timeline"><strong>${esc(tField(x.asset_type))}</strong><div class="asset-links">${linkMaybe(x.asset_url,"Apri risorsa")}</div><time>${esc(x.rights_status||x.source_type||"")}</time></article>`)}
      ${listBlock("Costruzioni",d.site_builds,x=>`<article class="timeline"><strong>${esc(tStatus(x.status))} · ${esc(x.commit_sha||"nessun commit")}</strong><div class="asset-links">${linkMaybe(x.live_url,"Apri sito online")}</div><time>${esc(fmtDate(x.created_at))}</time></article>`)}
      ${listBlock("Controlli qualità e schermate",d.qa_runs,x=>`<article class="timeline"><strong>${esc(tStatus(x.status))} · tentativo ${esc(x.attempt)}</strong><pre class="json compact">${esc(JSON.stringify(localizedObject(x.screenshots||{}),null,2))}</pre><time>${esc(fmtDate(x.created_at))}</time></article>`)}
      ${listBlock("Passaggi al Reparto Vendite",d.sales_handoffs,x=>`<article class="timeline"><strong>${esc(tStatus(x.status))}</strong><time>${esc(fmtDate(x.created_at))}</time></article>`)}
      ${listBlock("Cronologia",d.events,x=>`<article class="timeline"><strong>${esc(tEvent(x.event_type))}</strong><time>${esc(fmtDate(x.created_at))}</time></article>`)}
    `;
  }catch(e){
    $("#detail").innerHTML='<div class="empty error">Impossibile caricare il dettaglio dell\'azienda.</div>';
    console.error(e);
  }
}
async function load(){
  try{
    const d=await api("/ops/api/dashboard");
    state.prospects=d.prospects||[];
    state.queue=d.queue||[];
    renderMetrics(d.counts||{});
    renderHome(d.counts||{});
    renderRows();
    renderEvents(d.recent_events||[]);
    renderRenderingList();
    renderFactoryList();
    renderSalesList();
    renderSystemQueue();
    $("#updated").textContent="Aggiornato "+fmtDate(d.generated_at);
    await loadEmailSystem();
  }catch(e){
    $("#updated").textContent="ERRORE";
    console.error(e);
  }
}
$("#refresh").addEventListener("click",load);
$("#email-test-form").addEventListener("submit",async e=>{
  e.preventDefault();
  const input=$("#email-recipient");
  const button=$("#email-test-button");
  const feedback=$("#email-feedback");
  const recipient=input.value.trim();
  button.disabled=true;
  button.textContent="Invio…";
  feedback.textContent="Invio test in corso…";
  feedback.className="email-feedback";
  try{
    await api("/ops/api/email/test",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({recipient})
    });
    feedback.textContent="Invio accettato da Cloudflare. Email sending operativo; delivery tracking separato.";
    feedback.className="email-feedback success";
    await loadEmailSystem();
  }catch(e){
    feedback.textContent="Test email fallito. Controlla LAST ERROR.";
    feedback.className="email-feedback error";
    await loadEmailSystem();
    console.error(e);
  }finally{
    button.disabled=false;
    button.textContent="Invia email di test";
  }
});

$("#run").addEventListener("click",async()=>{
  const b=$("#run");
  b.disabled=true;
  b.textContent="Esecuzione…";
  try{
    await api("/ops/api/orchestrator/run",{method:"POST"});
    await load();
  }catch(e){
    console.error(e);
    alert("Errore durante l'esecuzione dell'orchestratore.");
  }finally{
    b.disabled=false;
    b.textContent="Esegui orchestratore";
  }
});
$("#search").addEventListener("input",renderRows);
document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.view)));
load();
setInterval(load,30000);