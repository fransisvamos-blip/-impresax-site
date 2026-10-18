
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
  const sourceV2 = variant.source_system === "V2";
  const pilotCandidate = Boolean(variant.pilot_candidate);
  const direction = sourceV2 ? String(variant.creative_direction || (
    variant.variant_key==="A" ? "ICONIC_EDITORIAL" :
    variant.variant_key==="B" ? "STRUCTURED_TECHNICAL_PREMIUM" :
    "BRAND_DRAMATIC_SALES_IMPACT"
  )) : "";
  const rankings=[];
  if(variant.best_overall) rankings.push("BEST OVERALL");
  if(variant.best_premium) rankings.push("BEST PREMIUM / EDITORIAL");
  if(variant.best_technical) rankings.push("BEST TECHNICAL / B2B");
  if(variant.best_conversion) rankings.push("BEST CONVERSION / SALES");

  let html = "";
  html += '<article class="render-pack-card render-variant-card ' + (variant.winner_suggested ? 'winner-suggested ' : '') + (selected ? 'approved' : '') + '">';
  html += '<div class="render-pack-head"><div>';
  html += '<span class="kicker">' + (sourceV2 ? 'VARIANT ' + esc(variant.variant_key) + ' · REV. ' + esc(variant.revision || variant.certified_revision || '') : (pilotCandidate ? 'PILOT MASTER · REV. ' + esc(variant.pilot_candidate_revision || variant.revision || '') : 'VERSIONE ' + esc(variant.variant_key))) + '</span>';
  html += '<h3>' + esc(sourceV2 ? direction : (variant.name || ("Versione " + variant.variant_key))) + '</h3>';
  if(sourceV2){
    html += '<div class="render-v2-badges">';
    if(variant.winner_suggested) html += '<span class="winner-badge">WINNER SUGGERITO</span>';
    if(selected) html += '<span class="candidate-badge">CANDIDATA SCELTA · NON MASTER</span>';
    html += '</div>';
  }
  html += '</div><span class="' + statusClass(selected ? "APPROVED" : variant.status) + '">';
  html += selected ? (pack.approved_reference ? 'IMPLEMENTATA' : 'SCELTA · NON MASTER') : esc(tStatus(variant.status));
  html += '</span></div>';

  if(sourceV2){
    html += '<div class="render-v2-summary">';
    html += '<span><strong>SCORE</strong> ' + esc(variant.reference_score != null ? variant.reference_score : "—") + '</span>';
    html += '<span><strong>DIREZIONE</strong> ' + esc(direction) + '</span>';
    html += '<span><strong>DESKTOP</strong> 1440</span><span><strong>MOBILE</strong> 390</span>';
    html += '</div>';
    if(rankings.length) html += '<div class="render-v2-ranking">' + rankings.map(x=>'<span>'+esc(x)+'</span>').join("") + '</div>';
  } else {
    html += '<div class="full-home-note">Home completa obbligatoria · Desktop 1440 + Mobile 390 · ' + renderSyncStateLabel(variant) + '</div>';
  }

  html += '<div class="render-pair">';
  html += '<div><div class="render-label">Desktop · 1440</div>';
  if (variant.desktop_render_url) {
    html += '<a href="' + esc(variant.desktop_render_url) + '" target="_blank" rel="noopener">';
    html += '<img src="' + esc(variant.desktop_render_url) + '" alt="Variant ' + esc(variant.variant_key) + ' desktop 1440"></a>';
  } else {
    html += '<div class="missing-render">Render desktop certificato non disponibile</div>';
  }
  html += '</div>';

  html += '<div><div class="render-label">Mobile · 390</div>';
  if (variant.mobile_render_url) {
    html += '<a href="' + esc(variant.mobile_render_url) + '" target="_blank" rel="noopener">';
    html += '<img src="' + esc(variant.mobile_render_url) + '" alt="Variant ' + esc(variant.variant_key) + ' mobile 390"></a>';
  } else {
    html += '<div class="missing-render">Render mobile certificato non disponibile</div>';
  }
  html += '</div></div>';

  html += '<div class="variant-preview-actions">';
  if (variant.desktop_render_url) html += '<a href="' + esc(variant.desktop_render_url) + '" target="_blank" rel="noopener">Apri desktop 1440 ↗</a>';
  if (variant.mobile_render_url) html += '<a href="' + esc(variant.mobile_render_url) + '" target="_blank" rel="noopener">Apri mobile 390 ↗</a>';
  html += '</div>';

  html += '<div class="render-pack-actions">';
  html += '<span class="id">' + (sourceV2 ? 'REV. ' + esc(variant.revision || variant.certified_revision || '') + ' · SCORE ' + esc(variant.reference_score != null ? variant.reference_score : "—") : (variant.reference_score != null ? 'Punteggio ' + esc(variant.reference_score) : 'Versione completa')) + '</span>';
  if (pilotCandidate && !sourceV2) {
    html += '<div class="render-decision-actions"><span class="preview-site disabled">PILOT · REVISIONE VISIVA CABINA</span></div>';
  } else {
    html += '<div class="render-decision-actions">';
    html += '<button class="choose-render" data-render-source="' + (sourceV2 ? 'V2' : 'V1') + '" data-prospect-id="' + esc(prospectId) + '" data-pack-id="' + esc(pack.id) + '" data-variant-id="' + esc(variant.id) + '"';
    if (!complete || rejected || selected || pack.approved_reference) html += ' disabled';
    html += '>' + (selected ? 'Candidata scelta' : 'Scegli questa variante') + '</button>';
    html += '<button class="implement-render" data-render-source="' + (sourceV2 ? 'V2' : 'V1') + '" data-prospect-id="' + esc(prospectId) + '" data-pack-id="' + esc(pack.id) + '" data-variant-id="' + esc(variant.id) + '"';
    if (!complete || rejected || !selected || pack.approved_reference) html += ' disabled';
    html += '>' + (pack.approved_reference && selected ? 'Versione implementata' : 'Approva e invia alla Site Factory') + '</button>';
    html += '</div>';
  }
  html += '</div>';
  if(sourceV2) html += '<div class="master-human-only">MASTER: approvazione umana obbligatoria · il winner suggerito non viene approvato automaticamente.</div>';
  html += '</article>';
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

renderRenderingList = function() {
  const allowed = ["READY_FOR_RENDERING","RENDERING","RENDER_REWORK","APPROVED_REFERENCE","READY_FOR_BUILD","BUILDING","BUILD_REWORK","QA_RUNNING","QA_FAILED","ESCALATION_REQUIRED","DEMO_READY"];
  const rows = state.prospects.filter(p => allowed.includes(p.pipeline_status));
  let html = "";

  if (!rows.length) {
    html = '<div class="empty">Nessuna azienda con proposte visive disponibili.</div>';
  } else {
    rows.forEach(p => {
      const v2ReadyCount=Number(p.render_v2_ready_count||0);
      const v2Ready=String(p.render_v2_status||"").toUpperCase()==="RENDER_READY" && v2ReadyCount===3;
      const pilotCandidate=Boolean(p.render_v2_pilot_candidate);
      // A complete certified A/B/C set always wins over the legacy single-pilot presentation.
      const visualStatus=v2Ready ? "RENDER_READY" : (pilotCandidate ? "RENDER_READY" : (p.render_status || p.pipeline_status));
      const visualLabel=v2Ready
        ? "3 VERSIONI PRONTE"
        : (pilotCandidate ? "PILOT PRONTO · REV. " + esc(p.render_v2_pilot_candidate_revision || "") : tStatus(visualStatus));
      html += '<article class="render-prospect-row ' + (state.renderingSelected === p.id_prospect ? 'selected' : '') + '">';
      html += '<button class="render-prospect-open" data-render-prospect="' + esc(p.id_prospect) + '">';
      html += '<span><strong>' + esc(p.azienda) + '</strong><small>' + esc(tVertical(p.vertical)) + '</small></span>';
      html += '<span class="' + statusClass((pilotCandidate || v2Ready) ? "RENDER_READY" : p.pipeline_status) + '">' + esc(visualLabel) + '</span>';
      html += '</button>';
      html += '<div class="render-prospect-actions">';
      if (v2Ready) {
        html += '<button class="preview-site" data-render-prospect="' + esc(p.id_prospect) + '">Apri A / B / C →</button>';
      } else if (pilotCandidate) {
        html += '<button class="preview-site" data-render-prospect="' + esc(p.id_prospect) + '">Apri pilot rev. ' + esc(p.render_v2_pilot_candidate_revision || "") + ' →</button>';
      } else if (v2ReadyCount>0) {
        html += '<span class="preview-site disabled">' + esc(v2ReadyCount) + '/3 versioni certificate</span>';
      } else if (String(p.render_v2_status||"").toUpperCase()==="GENERATING") {
        html += '<span class="preview-site disabled">Rendering V3 in corso</span>';
      } else if (p.live_url) {
        html += '<a class="preview-site" href="' + esc(p.live_url) + '" target="_blank" rel="noopener">Anteprima sito ↗</a>';
      } else {
        html += '<span class="preview-site disabled">Nessun render pronto</span>';
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
    const allVariants = d.render_variants || [];
    const allPacks = d.render_packs || [];
    const packs = allPacks.filter(pack => {
      const status = String(pack.status || "").toUpperCase();
      return !status.includes("REJECT") && !status.includes("ARCHIVED") && !status.includes("SUPERSEDED");
    });
    const activePackIds = new Set(packs.map(pack => pack.id));
    const variants = allVariants.filter(v => activePackIds.has(v.render_pack_id));

    const allV2Packs = d.render_v2_packs || [];
    const v2Packs = allV2Packs.filter(pack => !["CANCELLED","SUPERSEDED"].includes(String(pack.status || "").toUpperCase()));
    const v2PackIds = new Set(v2Packs.map(pack => pack.id));
    const v2Variants = (d.render_v2_variants || []).filter(v => v2PackIds.has(v.render_pack_id));
    const latestV2Pack = v2Packs[0] || null;
    const latestV2Variants = latestV2Pack ? v2Variants.filter(v => v.render_pack_id === latestV2Pack.id) : [];
    const certifiedV2Variants = latestV2Variants
      .filter(v => Boolean(v.desktop_render_url && v.mobile_render_url))
      .sort((a,b) => String(a.variant_key||"").localeCompare(String(b.variant_key||"")));
    const completeV2Set = certifiedV2Variants.length === 3 &&
      ["A","B","C"].every(key => certifiedV2Variants.some(v => String(v.variant_key||"") === key));
    const pilotCandidateVariants = latestV2Variants.filter(v => Boolean(v.pilot_candidate && v.desktop_render_url && v.mobile_render_url));

    let renderContent = "";

    const v2PackStatus = String(latestV2Pack?.status || "").toUpperCase();
    const premiumUpgrade = latestV2Pack && (
      String(latestV2Pack.quality_contract_version || "") === "RS_QUALITY_V3_PREMIUM_HOME" &&
      !["RENDER_READY","SELECTED","APPROVED"].includes(v2PackStatus)
    );

    if (latestV2Pack && completeV2Set) {
      const meta=latestV2Pack.metadata || {};
      renderContent += '<div class="render-contract-note v2-contract"><strong>3 VARIANTI CREATIVE CERTIFICATE · A / B / C</strong><span>Winner suggerito = raccomandazione. MASTER resta human-only e richiede una seconda azione esplicita.</span></div>';
      renderContent += '<div class="render-v2-pack-meta">';
      renderContent += '<span>SET QA <strong>' + esc(meta.set_qa_score || certifiedV2Variants[0]?.set_qa_score || "—") + ' · ' + esc(meta.set_qa_status || certifiedV2Variants[0]?.set_qa_status || "—") + '</strong></span>';
      renderContent += '<span>DIVERSITY A/B <strong>' + esc(meta.diversity_ab || certifiedV2Variants[0]?.diversity_ab || "—") + '</strong></span>';
      renderContent += '<span>A/C <strong>' + esc(meta.diversity_ac || certifiedV2Variants[0]?.diversity_ac || "—") + '</strong></span>';
      renderContent += '<span>B/C <strong>' + esc(meta.diversity_bc || certifiedV2Variants[0]?.diversity_bc || "—") + '</strong></span>';
      renderContent += '<span>WINNER SUGGERITO <strong>' + esc(meta.winner_variant || "—") + '</strong></span>';
      renderContent += '</div>';
      certifiedV2Variants.forEach(v => {
        // Once the full A/B/C set exists, the old single-pilot flag must never hide or disable Variant A.
        renderContent += renderVariantCardV2({...v,pilot_candidate:false,pilot_candidate_status:null,pilot_candidate_revision:null}, latestV2Pack, p.id);
      });
    } else if (pilotCandidateVariants.length) {
      renderContent += '<div class="render-contract-note"><strong>PILOT MASTER PRONTO · REV. ' + esc(pilotCandidateVariants[0].pilot_candidate_revision || "") + '</strong><span>Questa è la candidate singola attualmente in revisione Cabina. La queue globale resta bloccata finché il set completo non è certificato.</span></div>';
      pilotCandidateVariants.forEach(v => {
        renderContent += renderVariantCardV2(v, latestV2Pack, p.id);
      });
    } else if (premiumUpgrade) {
      renderContent += '<div class="render-contract-note warning"><strong>UPGRADE PREMIUM HOME IN CORSO</strong><span>Stiamo ricostruendo le 3 proposte con header/menu premium, hero completa con CTA, sezioni commerciali, trust, CTA finale e footer. Le nuove versioni compariranno insieme solo dopo la certificazione completa A/B/C.</span></div>';
    } else if (latestV2Pack && certifiedV2Variants.length) {
      renderContent += '<div class="render-contract-note"><strong>PREMIUM HOME · ' + certifiedV2Variants.length + '/3 VERSIONI CERTIFICATE</strong><span>Queste sono le revisioni complete certificate. Prima scegli la versione; solo dopo una seconda conferma esplicita la invii alla Site Factory.</span></div>';
      certifiedV2Variants.forEach(v => {
        renderContent += renderVariantCardV2(v, latestV2Pack, p.id);
      });
    } else if (latestV2Pack) {
      renderContent += '<div class="render-contract-note warning"><strong>RENDERING V2 IN LAVORAZIONE</strong><span>Le 3 versioni complete compariranno qui automaticamente solo quando saranno certificate.</span></div>';
    } else if (variants.length) {
      renderContent += '<div class="render-contract-note"><strong>3 VERSIONI COMPLETE</strong><span>Prima scegli la versione. Solo dopo una seconda conferma esplicita la invii alla Site Factory.</span></div>';
      variants.forEach(v => {
        const pack = packs.find(x => x.id === v.render_pack_id);
        if (pack) renderContent += renderVariantCardV2(v, pack, p.id);
      });
    } else if (packs.length) {
      renderContent += '<div class="render-contract-note warning"><strong>FORMATO VECCHIO</strong><span>Queste proposte sono precedenti alla nuova regola. Le tre immagini parziali non sono più considerate versioni. Il prossimo rendering dovrà produrre 3 home complete desktop + mobile.</span></div>';
      packs.forEach(pack => { renderContent += renderLegacyPackCardV2(pack); });
    } else {
      renderContent = '<div class="empty">Nuovi render in lavorazione. I render rifiutati o archiviati non vengono più mostrati.</div>';
    }

    let head = '<div class="detail-head render-detail-head"><div>';
    head += '<span class="kicker">PROGETTAZIONE VISIVA</span><h3>' + esc(p.business_name) + '</h3>';
    head += '<p class="reference-note">Confronta A/B/C su desktop e mobile. Il winner è solo una raccomandazione: scegliere una candidata NON crea il MASTER; l’approvazione resta una seconda azione umana esplicita.</p></div>';
    if (p.live_url) {
      head += '<a class="preview-site prominent" href="' + esc(p.live_url) + '" target="_blank" rel="noopener">Anteprima sito ↗</a>';
    } else {
      head += '<span class="preview-site disabled">Sito non ancora creato</span>';
    }
    head += '</div>';

    $("#rendering-detail").innerHTML = head + '<div class="render-pack-stack">' + renderContent + '</div>';

    document.querySelectorAll(".choose-render").forEach(b => b.addEventListener("click", () => chooseRender(
      b.dataset.prospectId,
      b.dataset.packId,
      b.dataset.variantId,
      b,
      b.dataset.renderSource || "V1"
    )));
    document.querySelectorAll(".implement-render").forEach(b => b.addEventListener("click", () => implementRender(
      b.dataset.prospectId,
      b.dataset.packId,
      b.dataset.variantId,
      b,
      b.dataset.renderSource || "V1"
    )));
  } catch (e) {
    $("#rendering-detail").innerHTML = '<div class="empty error">Impossibile caricare le proposte visive.</div>';
    console.error(e);
  }
};

chooseRender = async function(prospectId, packId, variantId, button, source = "V1") {
  if (!confirm("Scegliere questa versione? La Site Factory NON partirà ancora.")) return;
  button.disabled = true;
  button.textContent = "Salvataggio scelta…";

  try {
    const endpoint = source === "V2" ? "/ops/api/render-v2/select" : "/ops/api/render/select";
    await api(endpoint, {
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

implementRender = async function(prospectId, packId, variantId, button, source = "V1") {
  if (!confirm("Confermi l'implementazione di questa versione? Solo ora verrà approvata e inviata alla Site Factory.")) return;
  button.disabled = true;
  button.textContent = "Invio alla Site Factory…";

  try {
    const endpoint = source === "V2" ? "/ops/api/render-v2/implement" : "/ops/api/render/implement";
    await api(endpoint, {
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
