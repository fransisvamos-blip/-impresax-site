const $=s=>document.querySelector(s);
let state={prospects:[],selected:null};

const labels={
 total_prospects:"Total prospects",
 ready_for_rendering:"Ready for rendering",
 rendering:"Rendering",
 approved_reference:"Approved reference",
 building:"Building",
 qa:"QA",
 demo_ready:"Demo ready",
 escalation_required:"Escalation"
};

function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));}
function smallId(id){return id?String(id).slice(0,8)+"…":"—";}
function fmtDate(v){if(!v)return"—";try{return new Intl.DateTimeFormat("it-IT",{dateStyle:"short",timeStyle:"short"}).format(new Date(v))}catch{return v}}
function statusClass(v){return v==="ESCALATION_REQUIRED"?"status escalation":(v==="DEMO_READY"||v==="SALES_READY"||v==="WON"?"status ready":"status")}

async function api(path,options){const r=await fetch(path,options);if(!r.ok)throw new Error(await r.text());return r.json();}

function renderMetrics(counts){
  $("#metrics").innerHTML=Object.entries(labels).map(([k,l])=>`<article class="metric"><span>${esc(l)}</span><strong>${Number(counts[k]||0)}</strong></article>`).join("");
}
function renderRows(){
  const q=$("#search").value.trim().toLowerCase();
  const rows=state.prospects.filter(p=>!q||[p.azienda,p.id_prospect,p.vertical,p.current_step].some(v=>String(v||"").toLowerCase().includes(q)));
  $("#rows").innerHTML=rows.map(p=>`<tr data-id="${esc(p.id_prospect)}" class="${state.selected===p.id_prospect?"selected":""}">
    <td>${esc(p.rank??"—")}</td>
    <td class="id" title="${esc(p.id_prospect)}">${esc(smallId(p.id_prospect))}</td>
    <td><strong>${esc(p.azienda)}</strong></td>
    <td>${esc(p.vertical)}</td>
    <td>${esc(p.render_status||"—")}</td>
    <td>${esc(p.build_status||"—")}</td>
    <td>${esc(p.qa_status||"—")}</td>
    <td>${p.live_url?`<a class="live" href="${esc(p.live_url)}" target="_blank" rel="noopener">LIVE ↗</a>`:"—"}</td>
    <td><span class="${statusClass(p.pipeline_status)}">${esc(p.current_step)}</span></td>
    <td>${esc(p.last_event||"—")}<br><span class="id">${esc(fmtDate(p.last_event_at))}</span></td>
    <td class="${p.error?"error":""}">${esc(p.error||"—")}</td>
    <td>${esc(p.next_action||"—")}</td>
  </tr>`).join("");
  document.querySelectorAll("tr[data-id]").forEach(tr=>tr.addEventListener("click",()=>selectProspect(tr.dataset.id)));
}
function renderEvents(events){
  $("#events").innerHTML=(events||[]).map(e=>`<div class="event-row">
    <time>${esc(fmtDate(e.created_at))}</time>
    <strong>${esc(e.event_type)}</strong>
    <span>${esc(e.prospect_id?smallId(e.prospect_id):e.entity_type||"system")}</span>
  </div>`).join("");
}
function listBlock(title,items,formatter){
  return `<section class="detail-section"><h4>${esc(title)} · ${items?.length||0}</h4>${(items&&items.length)?items.slice(0,20).map(formatter).join(""):'<span class="id">Nessun record</span>'}</section>`;
}
async function selectProspect(id){
  state.selected=id;renderRows();
  $("#detail").innerHTML='<div class="empty">Loading…</div>';
  const d=await api("/ops/api/prospects/"+encodeURIComponent(id));
  const p=d.prospect;
  $("#detail").innerHTML=`
    <div class="detail-head"><span class="kicker">${esc(p.pipeline_status)}</span><h3>${esc(p.business_name)}</h3>
      <div class="id">${esc(p.id)}</div>${p.live_url?`<p><a href="${esc(p.live_url)}" target="_blank" rel="noopener">Apri demo ↗</a></p>`:""}</div>
    <section class="detail-section"><h4>Prospect</h4><dl class="kv">
      <dt>Rank</dt><dd>${esc(p.rank??"—")}</dd><dt>Verticale</dt><dd>${esc(p.vertical)}</dd>
      <dt>Sito attuale</dt><dd>${p.website_url?`<a href="${esc(p.website_url)}" target="_blank" rel="noopener">${esc(p.website_url)}</a>`:"—"}</dd>
      <dt>Current step</dt><dd>${esc(p.current_step)}</dd><dt>Next action</dt><dd>${esc(p.next_action)}</dd>
      <dt>Error</dt><dd class="${p.error?"error":""}">${esc(p.error||"—")}</dd>
    </dl></section>
    ${listBlock("Render jobs",d.render_jobs,x=>`<article class="timeline"><strong>${esc(x.status)} · attempt ${esc(x.attempt)}</strong><time>${esc(fmtDate(x.created_at))}</time></article>`)}
    ${listBlock("Render packs",d.render_packs,x=>`<article class="timeline"><strong>v${esc(x.version)} · ${esc(x.status)}</strong><time>${esc(fmtDate(x.created_at))}</time></article>`)}
    ${listBlock("Assets",d.render_assets,x=>`<article class="timeline"><strong>${esc(x.asset_type)}</strong><time>${esc(x.asset_url)}</time></article>`)}
    ${listBlock("Build",d.site_builds,x=>`<article class="timeline"><strong>${esc(x.status)} · ${esc(x.commit_sha||"no commit")}</strong><time>${esc(fmtDate(x.created_at))}</time></article>`)}
    ${listBlock("QA",d.qa_runs,x=>`<article class="timeline"><strong>${esc(x.status)} · attempt ${esc(x.attempt)}</strong><time>${esc(fmtDate(x.created_at))}</time></article>`)}
    ${listBlock("Timeline",d.events,x=>`<article class="timeline"><strong>${esc(x.event_type)}</strong><time>${esc(fmtDate(x.created_at))}</time></article>`)}
  `;
}
async function load(){
  try{
    const d=await api("/ops/api/dashboard");
    state.prospects=d.prospects||[];
    renderMetrics(d.counts||{});renderRows();renderEvents(d.recent_events||[]);
    $("#updated").textContent="Updated "+fmtDate(d.generated_at);
  }catch(e){$("#updated").textContent="ERROR";console.error(e)}
}
$("#refresh").addEventListener("click",load);
$("#run").addEventListener("click",async()=>{const b=$("#run");b.disabled=true;b.textContent="Running…";try{await api("/ops/api/orchestrator/run",{method:"POST"});await load()}finally{b.disabled=false;b.textContent="Run orchestrator"}});
$("#search").addEventListener("input",renderRows);
load();
setInterval(load,30000);