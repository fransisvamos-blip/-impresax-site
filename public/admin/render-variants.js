
/* Gestionale ImpresaX — rendering variants UI
   Overrides the legacy render panel with complete A/B/C full-home candidates. */

function renderSyncStateLabel(variant){
  const hasDesktop=Boolean(variant.desktop_render_url);
  const hasMobile=Boolean(variant.mobile_render_url);
  if(hasDesktop&&hasMobile) return "SINCRONIZZATO";
  if(hasDesktop||hasMobile) return "SINCRONIZZAZIONE PARZIALE";
  return "IN SINCRONIZZAZIONE";
}

function renderVariantCardV2(variant, pack, prospectId) {
  const rejected = /REJECT|ARCHIVED/i.test(String(variant.status || ""));
  const complete = Boolean(variant.desktop_render_url && variant.mobile_render_url);
  const selected = Boolean(variant.selected);
  let html = "";
  html += '<article class="render-pack-card render-variant-card ' + (selected ? 'approved' : '') + '">';
  html += '<div class="render-pack-head"><div>';
  html += '<span class="kicker">VERSIONE ' + esc(variant.variant_key) + '</span>';
  html += '<h3>' + esc(variant.name || ("Versione " + variant.variant_key)) + '</h3>';
  html += '</div><span class="' + statusClass(selected ? "APPROVED" : variant.status) + '">';
  html += selected ? (pack.approved_reference ? 'IMPLEMENTATA' : 'SCELTA · NON ANCORA IMPLEMENTATA') : esc(tStatus(variant.status));
  html += '</span></div>';

  html += '<div class="full-home-note">Home completa obbligatoria · Desktop 1440 + Mobile 390 · ' + renderSyncStateLabel(variant) + '</div>';
  html += '<div class="render-pair">';

  html += '<div><div class="render-label">Home completa desktop · 1440</div>';
  if (variant.desktop_render_url) {
    html += '<a href="' + esc(variant.desktop_render_url) + '" target="_blank" rel="noopener">';
    html += '<img src="' + esc(variant.desktop_render_url) + '" alt="Versione ' + esc(variant.variant_key) + ' desktop completa"></a>';
  } else {
    html += '<div class="missing-render">Render desktop in sincronizzazione dal Rendering Studio</div>';
  }
  html += '</div>';

  html += '<div><div class="render-label">Home completa mobile · 390</div>';
  if (variant.mobile_render_url) {
    html += '<a href="' + esc(variant.mobile_render_url) + '" target="_blank" rel="noopener">';
    html += '<img src="' + esc(variant.mobile_render_url) + '" alt="Versione ' + esc(variant.variant_key) + ' mobile completa"></a>';
  } else {
    html += '<div class="missing-render">Render mobile in sincronizzazione dal Rendering Studio</div>';
  }
  html += '</div></div>';

  html += '<div class="variant-preview-actions">';
  if (variant.desktop_render_url) html += '<a href="' + esc(variant.desktop_render_url) + '" target="_blank" rel="noopener">Anteprima desktop ↗</a>';
  if (variant.mobile_render_url) html += '<a href="' + esc(variant.mobile_render_url) + '" target="_blank" rel="noopener">Anteprima mobile ↗</a>';
  html += '</div>';

  html += '<div class="render-pack-actions">';
  html += '<span class="id">' + (variant.reference_score != null ? 'Punteggio ' + esc(variant.reference_score) : 'Versione completa') + '</span>';
  html += '<div class="render-decision-actions">';
  html += '<button class="choose-render" data-prospect-id="' + esc(prospectId) + '" data-pack-id="' + esc(pack.id) + '" data-variant-id="' + esc(variant.id) + '"';
  if (!complete || rejected || selected || pack.approved_reference) html += ' disabled';
  html += '>' + (selected ? 'Versione scelta' : 'Scegli questa versione') + '</button>';
  html += '<button class="implement-render" data-prospect-id="' + esc(prospectId) + '" data-pack-id="' + esc(pack.id) + '" data-variant-id="' + esc(variant.id) + '"';
  if (!complete || rejected || !selected || pack.approved_reference) html += ' disabled';
  html += '>' + (pack.approved_reference && selected ? 'Versione implementata' : 'Implementa questa versione') + '</button>';
  html += '</div></div></article>';
  return html;
}

function renderLegacyPackCardV2(pack) {
  const rejected = String(pack.status || "").includes("REJECT");
  const complete = Boolean(pack.desktop_render_url && pack.mobile_render_url);
  let html = "";
  html += '<article class="render-pack-card legacy-render-pack ' + (pack.approved_reference ? 'approved' : '') + '">';
  html += '<div class="render-pack-head"><div><span class="kicker">FORMATO PRECEDENTE</span><h3>Pacchetto v' + esc(pack.version) + '</h3></div>';
  html += '<span class="' + statusClass(pack.approved_reference ? "APPROVED" : pack.status) + '">';
  html += pack.approved_reference ? 'SELEZIONATO' : esc(tStatus(pack.status));
  html += '</span></div>';
  html += '<div class="legacy-warning">Le vecchie direzioni A / B / C erano solo porzioni iniziali della home e non vengono più considerate versioni selezionabili. Da ora una versione è valida solo se contiene la home completa desktop e mobile.</div>';
  html += '<div class="render-pair">';

  html += '<div><div class="render-label">Home completa desktop · 1440</div>';
  html += pack.desktop_render_url
    ? '<a href="' + esc(pack.desktop_render_url) + '" target="_blank" rel="noopener"><img src="' + esc(pack.desktop_render_url) + '" alt="Home desktop completa"></a>'
    : '<div class="missing-render">Mancante</div>';
  html += '</div>';

  html += '<div><div class="render-label">Home completa mobile · 390</div>';
  html += pack.mobile_render_url
    ? '<a href="' + esc(pack.mobile_render_url) + '" target="_blank" rel="noopener"><img src="' + esc(pack.mobile_render_url) + '" alt="Home mobile completa"></a>'
    : '<div class="missing-render">Mancante</div>';
  html += '</div></div>';

  html += '<div class="render-pack-actions"><span class="id">';
  html += pack.reference_score != null ? 'Punteggio ' + esc(pack.reference_score) : '';
  html += '</span><button class="legacy-render-disabled" disabled>Formato precedente non selezionabile</button></div>';
  html += '</article>';
  return html;
}

function renderR107Compliance(variant, pack){
  const packR107=String(pack?.quality_contract_version||"")==="RS_QUALITY_V12_R107_ULTRA_VISUAL";
  const compilerR107=String(variant?.compiler_version||"")==="RS_COMPILER_V1_12_R107_ULTRA_VISUAL";
  const policyR107=/R107_PREMIUM_OVERLAY_HERO_ULTRA_VISUAL/i.test(String(variant?.surface_policy||""));
  const retrofit=/^(true|1|yes)$/i.test(String(pack?.retrofit_required||pack?.r107_retrofit_required||""))
    || /RUNNING|REQUIRED|CABINA/i.test(String(pack?.retrofit_status||""));
  if(packR107 && compilerR107 && policyR107) return {label:"R107 UPGRADED",cls:"r107-ok"};
  if(retrofit) return {label:"RETROFIT REQUIRED",cls:"r107-retrofit"};
  return {label:"OLD STANDARD",cls:"r107-old"};
}

function renderV2Ranking(variant, pack) {
  const tags=[];
  if(pack.best_overall_variant===variant.variant_key) tags.push("BEST OVERALL");
  if(pack.best_premium_variant===variant.variant_key) tags.push("BEST PREMIUM / EDITORIAL");
  if(pack.best_technical_variant===variant.variant_key) tags.push("BEST TECHNICAL / B2B");
  if(pack.best_conversion_variant===variant.variant_key) tags.push("BEST CONVERSION / SALES");
  return tags;
}

function renderCertifiedVariantCard(variant, pack, prospectId) {
  const complete=Boolean(variant.desktop_render_url && variant.mobile_render_url);
  const selected=Boolean(variant.selected);
  const winner=Boolean(variant.winner_suggested);
  const rankings=renderV2Ranking(variant,pack);
  let html="";
  html += '<article class="render-pack-card render-variant-card render-v2-certified ' + (winner ? 'winner-suggested ' : '') + (selected ? 'approved' : '') + '">';
  html += '<div class="render-pack-head"><div>';
  html += '<span class="kicker">CONCEPT IMPRESAX</span>';
  html += '<h3>' + esc(variant.creative_direction || variant.name || ("Variant "+variant.variant_key)) + '</h3>';
  const compliance=renderR107Compliance(variant,pack);
  html += '<div class="render-v2-badges">';
  html += '<span class="r107-badge '+compliance.cls+'">'+esc(compliance.label)+'</span>';
  if(winner) html += '<span class="winner-badge">WINNER SUGGERITO</span>';
  if(selected) html += '<span class="candidate-badge">CANDIDATA SCELTA · NON MASTER</span>';
  html += '</div></div>';
  html += '<span class="' + statusClass(variant.revision_status || variant.status) + '">' + esc(tStatus(variant.revision_status || variant.status)) + '</span></div>';

  html += '<div class="render-v2-summary">';
  html += '<span><strong>REV.</strong> ' + esc(variant.revision) + '</span>';
  html += '<span><strong>SCORE</strong> ' + esc(variant.reference_score ?? "—") + '</span>';
  html += '<span><strong>DIREZIONE</strong> ' + esc(variant.creative_direction || "—") + '</span>';
  html += '<span><strong>COMPILER</strong> ' + esc(variant.compiler_version || "—") + '</span>';
  html += '</div>';

  if(rankings.length) {
    html += '<div class="render-v2-ranking">' + rankings.map(x=>'<span>'+esc(x)+'</span>').join("") + '</div>';
  }

  html += '<div class="render-pair">';
  html += '<div><div class="render-label">Desktop · 1440</div>';
  html += complete
    ? '<a href="' + esc(variant.desktop_render_url) + '" target="_blank" rel="noopener"><img src="' + esc(variant.desktop_render_url) + '" alt="Variant ' + esc(variant.variant_key) + ' desktop 1440"></a>'
    : '<div class="missing-render">Desktop certificato non disponibile</div>';
  html += '</div>';
  html += '<div><div class="render-label">Mobile · 390</div>';
  html += complete
    ? '<a href="' + esc(variant.mobile_render_url) + '" target="_blank" rel="noopener"><img src="' + esc(variant.mobile_render_url) + '" alt="Variant ' + esc(variant.variant_key) + ' mobile 390"></a>'
    : '<div class="missing-render">Mobile certificato non disponibile</div>';
  html += '</div></div>';

  html += '<div class="variant-preview-actions">';
  if(variant.desktop_render_url) html += '<a href="' + esc(variant.desktop_render_url) + '" target="_blank" rel="noopener">Apri desktop 1440 ↗</a>';
  if(variant.mobile_render_url) html += '<a href="' + esc(variant.mobile_render_url) + '" target="_blank" rel="noopener">Apri mobile 390 ↗</a>';
  html += '</div>';

  if(variant.implementation_notes) {
    html += '<div class="render-v2-direction-note"><strong>ART DIRECTION</strong><p>' + esc(variant.implementation_notes) + '</p></div>';
  }

  html += '<div class="render-pack-actions">';
  html += '<span class="id">Revision ID ' + esc(variant.revision_id) + '</span>';
  html += '<button class="choose-v2-render" data-prospect-id="' + esc(prospectId) + '" data-pack-id="' + esc(pack.id) + '" data-revision-id="' + esc(variant.revision_id) + '"';
  if(!complete || selected || pack.approved_reference) html += ' disabled';
  html += '>' + (selected ? 'Candidata scelta' : 'Scegli questa variante') + '</button>';
  html += '</div>';
  html += '<div class="master-human-only">MASTER: approvazione umana obbligatoria · la selezione non approva e non avvia la Site Factory.</div>';
  html += '</article>';
  return html;
}

async function chooseV2Render(prospectId,packId,revisionId,button){
  if(!confirm("Selezionare questa variante come candidata? Non diventerà MASTER e non partirà la Site Factory.")) return;
  button.disabled=true;
  button.textContent="Salvataggio scelta…";
  try{
    await api("/ops/api/render-v2/select",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({prospect_id:prospectId,render_pack_id:packId,revision_id:revisionId})
    });
    await load();
    await openRenderingProspect(prospectId);
  }catch(e){
    alert("Selezione della variante non riuscita.");
    console.error(e);
    button.disabled=false;
    button.textContent="Scegli questa variante";
  }
}

renderRenderingList = function() {
  const allowed = ["READY_FOR_RENDERING","RENDERING","RENDER_REWORK","APPROVED_REFERENCE","READY_FOR_BUILD","BUILDING","BUILD_REWORK","QA_RUNNING","QA_FAILED","ESCALATION_REQUIRED","DEMO_READY"];
  const rows = state.prospects.filter(p => allowed.includes(p.pipeline_status));
  let html = "";

  if (!rows.length) {
    html = '<div class="empty">Nessuna azienda con proposte visive disponibili.</div>';
  } else {
    rows.forEach(p => {
      html += '<article class="render-prospect-row ' + (state.renderingSelected === p.id_prospect ? 'selected' : '') + '">';
      html += '<button class="render-prospect-open" data-render-prospect="' + esc(p.id_prospect) + '">';
      html += '<span><strong>' + esc(p.azienda) + '</strong><small>' + esc(tVertical(p.vertical)) + '</small></span>';
      html += '<span class="' + statusClass(p.pipeline_status) + '">' + esc(tStatus(p.render_status || p.pipeline_status)) + '</span>';
      html += '</button>';
      html += '<div class="render-prospect-actions">';
      if (p.live_url) {
        html += '<a class="preview-site" href="' + esc(p.live_url) + '" target="_blank" rel="noopener">Anteprima sito ↗</a>';
      } else {
        html += '<span class="preview-site disabled">Anteprima non disponibile</span>';
      }
      html += '</div></article>';
    });
  }

  $("#rendering-list").innerHTML = html;
  document.querySelectorAll("[data-render-prospect]").forEach(b => b.addEventListener("click", () => openRenderingProspect(b.dataset.renderProspect)));
};

openRenderingProspect = async function(id) {
  state.renderingSelected = id;
  renderRenderingList();
  $("#rendering-detail").innerHTML = '<div class="empty">Caricamento proposte…</div>';

  try {
    const d = await api("/ops/api/prospects/" + encodeURIComponent(id));
    const p = d.prospect;
    const v2Packs=(d.render_v2_packs || []).filter(pack=>{
      const status=String(pack.status||"").toUpperCase();
      return !status.includes("REJECT") && !status.includes("ARCHIVED") && !status.includes("CANCEL");
    });
    const v2Pack=v2Packs.find(pack=>String(pack.status||"").toUpperCase()==="RENDER_READY") || v2Packs[0] || null;
    const v2Variants=(d.render_v2_variants || [])
      .filter(v=>v2Pack && v.render_pack_id===v2Pack.id && String(v.variant_key)==="A")
      .sort((a,b)=>String(a.variant_key).localeCompare(String(b.variant_key)));

    const allVariants = d.render_variants || [];
    const allPacks = d.render_packs || [];
    const packs = allPacks.filter(pack => {
      const status = String(pack.status || "").toUpperCase();
      return !status.includes("REJECT") && !status.includes("ARCHIVED");
    });
    const activePackIds = new Set(packs.map(pack => pack.id));
    const variants = allVariants.filter(v => activePackIds.has(v.render_pack_id));
    let renderContent = "";

    if(v2Pack && v2Variants.length){
      const expected=["A"];
      const keys=v2Variants.map(v=>v.variant_key);
      const completeContract=expected.every(k=>keys.includes(k));
      renderContent += '<div class="render-contract-note v2-contract"><strong>1 CONCEPT · MASSIMA CURA</strong>';
      renderContent += '<span>ImpresaX concentra il lavoro su un unico concept desktop + mobile. MASTER = human-only.</span></div>';
      renderContent += '<div class="render-v2-pack-meta">';
      renderContent += '<span>SET QA <strong>' + esc(v2Pack.set_qa_score || "—") + ' · ' + esc(v2Pack.set_qa_status || "—") + '</strong></span>';
      renderContent += '<span>CONCEPT <strong>IMPRESAX MASTER</strong></span>';
      renderContent += '<span>DELIVERY <strong>DESKTOP 1440 + MOBILE 390</strong></span>';
      renderContent += '<span>STANDARD <strong>' + esc(v2Pack.quality_contract_version || "—") + '</strong></span>';
      renderContent += '<span>RETROFIT <strong>' + esc(v2Pack.retrofit_status || (String(v2Pack.retrofit_required)==="true" ? "REQUIRED" : "—")) + '</strong></span>';
      renderContent += '</div>';
      if(!completeContract){
        renderContent += '<div class="legacy-warning">CONCEPT IN PREPARAZIONE: attendo desktop + mobile completi prima della validazione MASTER.</div>';
      }
      v2Variants.forEach(v=>{ renderContent += renderCertifiedVariantCard(v,v2Pack,p.id); });
    } else if (variants.length) {
      renderContent += '<div class="render-contract-note"><strong>3 VERSIONI COMPLETE</strong><span>Formato legacy: prima scegli la versione, poi confermi separatamente l’implementazione.</span></div>';
      variants.forEach(v => {
        const pack = packs.find(x => x.id === v.render_pack_id);
        if (pack) renderContent += renderVariantCardV2(v, pack, p.id);
      });
    } else if (packs.length) {
      renderContent += '<div class="render-contract-note warning"><strong>FORMATO VECCHIO</strong><span>Queste proposte precedono la source of truth Rendering V2.</span></div>';
      packs.forEach(pack => { renderContent += renderLegacyPackCardV2(pack); });
    } else {
      renderContent = '<div class="empty">Nessun render certificato disponibile.</div>';
    }

    let head = '<div class="detail-head render-detail-head"><div>';
    head += '<span class="kicker">PROGETTAZIONE VISIVA</span><h3>' + esc(p.business_name) + '</h3>';
    head += '<p class="reference-note">Un solo concept ImpresaX ad altissimo livello. Apri desktop o mobile per vedere la homepage completa a grandezza naturale; MASTER solo dopo approvazione umana.</p></div>';
    if (p.live_url) {
      head += '<a class="preview-site prominent" href="' + esc(p.live_url) + '" target="_blank" rel="noopener">Anteprima sito ↗</a>';
    } else {
      head += '<span class="preview-site disabled">Sito non ancora creato</span>';
    }
    head += '</div>';

    $("#rendering-detail").innerHTML = head + '<div class="render-pack-stack">' + renderContent + '</div>';

    document.querySelectorAll(".choose-v2-render").forEach(b => b.addEventListener("click", () => chooseV2Render(
      b.dataset.prospectId,b.dataset.packId,b.dataset.revisionId,b
    )));
    document.querySelectorAll(".choose-render").forEach(b => b.addEventListener("click", () => chooseRender(
      b.dataset.prospectId,b.dataset.packId,b.dataset.variantId,b
    )));
    document.querySelectorAll(".implement-render").forEach(b => b.addEventListener("click", () => implementRender(
      b.dataset.prospectId,b.dataset.packId,b.dataset.variantId,b
    )));
  } catch (e) {
    $("#rendering-detail").innerHTML = '<div class="empty error">Impossibile caricare le proposte visive.</div>';
    console.error(e);
  }
};

chooseRender = async function(prospectId, packId, variantId, button) {
  if (!confirm("Scegliere questa versione? La Site Factory NON partirà ancora.")) return;
  button.disabled = true;
  button.textContent = "Salvataggio scelta…";

  try {
    await api("/ops/api/render/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prospect_id: prospectId,
        render_pack_id: packId,
        render_variant_id: variantId
      })
    });
    await load();
    await openRenderingProspect(prospectId);
  } catch (e) {
    alert("Scelta della versione non riuscita.");
    console.error(e);
    button.disabled = false;
    button.textContent = "Scegli questa versione";
  }
};

implementRender = async function(prospectId, packId, variantId, button) {
  if (!confirm("Confermi l'implementazione di questa versione? Solo ora verrà approvata e inviata alla Site Factory.")) return;
  button.disabled = true;
  button.textContent = "Invio alla Site Factory…";

  try {
    await api("/ops/api/render/implement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prospect_id: prospectId,
        render_pack_id: packId,
        render_variant_id: variantId
      })
    });
    await load();
    await openRenderingProspect(prospectId);
  } catch (e) {
    alert("Implementazione della versione non riuscita.");
    console.error(e);
    button.disabled = false;
    button.textContent = "Implementa questa versione";
  }
};

if (typeof load === "function") load();

let renderAutoRefreshBusy=false;
setInterval(async () => {
  if(renderAutoRefreshBusy) return;
  const panel=document.querySelector('[data-view-panel="rendering"]');
  if(!panel || !panel.classList.contains('active') || !state.renderingSelected) return;
  renderAutoRefreshBusy=true;
  try{
    await load();
    await openRenderingProspect(state.renderingSelected);
  }catch(e){
    console.warn("Aggiornamento automatico render non riuscito",e);
  }finally{
    renderAutoRefreshBusy=false;
  }
},30000);
