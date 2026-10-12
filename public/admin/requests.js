
const requestStatusLabels = {
  NUOVA: "Nuova",
  IN_LAVORAZIONE: "In lavorazione",
  CONTATTATA: "Contattata",
  CHIUSA: "Chiusa"
};

function requestStatusLabel(value) {
  return requestStatusLabels[value] || String(value || "—").replaceAll("_", " ");
}

function safeHrefPhone(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const normalized = raw.replace(/[^+\d]/g, "");
  return normalized ? "tel:" + normalized : "";
}

function safeHrefEmail(value) {
  const raw = String(value || "").trim();
  return raw ? "mailto:" + raw : "";
}

function renderRequestMetrics(counts = {}) {
  const node = document.querySelector("#request-metrics");
  if (!node) return;
  const items = [
    ["Totali", counts.total || 0],
    ["Nuove", counts.nuove || 0],
    ["In lavorazione", counts.in_lavorazione || 0],
    ["Contattate", counts.contattate || 0],
    ["Chiuse", counts.chiuse || 0]
  ];
  node.innerHTML = items.map(([label, value]) =>
    '<article><span>' + esc(label) + '</span><strong>' + Number(value || 0) + '</strong></article>'
  ).join("");
}

function renderRequests(rows = []) {
  const node = document.querySelector("#requests-list");
  if (!node) return;

  if (!rows.length) {
    node.innerHTML = '<div class="empty">Nessuna richiesta ricevuta.</div>';
    return;
  }

  node.innerHTML = rows.map(row => {
    const phoneHref = safeHrefPhone(row.phone);
    const emailHref = safeHrefEmail(row.email);
    const website = String(row.website || "").trim();
    const utm = [
      row.utm_source ? "Sorgente: " + row.utm_source : "",
      row.utm_medium ? "Mezzo: " + row.utm_medium : "",
      row.utm_campaign ? "Campagna: " + row.utm_campaign : ""
    ].filter(Boolean).join(" · ");

    return '<article class="request-card">' +
      '<div class="request-card-head">' +
        '<div><span class="kicker">' + esc(requestStatusLabel(row.status)) + '</span>' +
        '<h3>' + esc(row.company || "Azienda non indicata") + '</h3>' +
        '<small>' + esc(fmtDate(row.created_at)) + '</small></div>' +
        '<span class="request-status ' + esc(String(row.status || "").toLowerCase()) + '">' + esc(requestStatusLabel(row.status)) + '</span>' +
      '</div>' +

      '<div class="request-main">' +
        '<div class="request-person">' +
          '<strong>' + esc(row.name || "—") + '</strong>' +
          '<span>' + esc(row.sector || "—") + '</span>' +
        '</div>' +
        '<div class="request-actions">' +
          (phoneHref ? '<a href="' + esc(phoneHref) + '">Chiama · ' + esc(row.phone) + '</a>' : '') +
          (emailHref ? '<a href="' + esc(emailHref) + '">Email · ' + esc(row.email) + '</a>' : '') +
          (website ? '<a href="' + esc(website) + '" target="_blank" rel="noopener">Apri sito ↗</a>' : '') +
        '</div>' +
      '</div>' +

      '<div class="request-grid">' +
        '<div><span>Obiettivo</span><strong>' + esc(row.improvement_area || "—") + '</strong></div>' +
        '<div><span>Diagnosi</span><strong>' + esc(row.diagnostic_area || "—") + '</strong></div>' +
        '<div><span>Fonte</span><strong>' + esc(row.source || "Sito ImpresaX") + '</strong></div>' +
      '</div>' +

      (row.message ? '<div class="request-message"><span>Messaggio</span><p>' + esc(row.message) + '</p></div>' : '') +
      (utm ? '<div class="request-meta">' + esc(utm) + '</div>' : '') +
    '</article>';
  }).join("");
}

async function loadRequests() {
  const button = document.querySelector("#refresh-requests");
  if (button) {
    button.disabled = true;
    button.textContent = "Aggiornamento…";
  }

  try {
    const data = await api("/ops/api/requests");
    renderRequestMetrics(data.counts || {});
    renderRequests(data.requests || []);
  } catch (error) {
    const node = document.querySelector("#requests-list");
    if (node) node.innerHTML = '<div class="empty error">Impossibile caricare le richieste.</div>';
    console.error(error);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Aggiorna richieste";
    }
  }
}

document.querySelector("#refresh-requests")?.addEventListener("click", loadRequests);
loadRequests();
setInterval(loadRequests, 30000);
