export const BUILTIN_TENANTS = Object.freeze({
  studiodentisticogiardinelli: Object.freeze({
    tenant_id: "tenant_000001",
    prospect_id: "pilot_001",
    slug: "studiodentisticogiardinelli",
    business_name: "Studio Dentistico Dott. Francesco Giardinelli",
    vertical: "DENTAL_MEDICAL",
    dental_master_version: "V4_REFERENCE_LOCK",
    dental_master_status: "REFERENCE_LOCKED_PILOT",
    status: "DEMO_READY",
    pilot_status: "LIVE_REFERENCE_LOCKED",
    implementation_mode: "REFERENCE_LOCK",
    reference_lock_required: true,
    approved_visual_reference: true,
    direct_go_live_authorized: true,
    outreach_forbidden: true,
    demo_ready: true,
    qa_status: "PASS",
    visual_quality_status: "APPROVED",
    commercial_quality_status: "APPROVED",
    brand_quality_status: "APPROVED",
    mobile_quality_status: "APPROVED",
    art_direction_quality_status: "APPROVED",
    cabina_approval_required: true,
    old_demo_status: "V1_REJECTED_VISUAL / V2_REJECTED_VISUAL / V3_REJECTED_VISUAL",
    reference_lock_live_at: "2026-10-11T07:02:00+02:00",
    recovery_metrics: {
      rebuild_started_at: "2026-10-11T05:33:08+02:00",
      first_v2_viewport_pass_at: "2026-10-11T05:34:35+02:00",
      final_v2_qa_pass_at: "2026-10-11T05:37:37+02:00",
      time_to_first_render_seconds: 87,
      time_to_qa_seconds: 269,
      time_to_demo_ready_seconds: null,
      v3_rebuild_started_at: "2026-10-11T05:31:00+02:00",
      v3_first_render_at: "2026-10-11T05:52:37+02:00",
      v3_final_internal_qa_at: "2026-10-11T05:59:18+02:00",
      v3_time_to_first_render_seconds: 1297,
      v3_time_to_qa_seconds: 1698,
      v3_time_to_demo_ready_seconds: null
    },
    public_preview: true,
    noindex: true,
    disclaimer_enabled: true,
    asset_path: "/tenants/studiodentisticogiardinelli/",
    primary_problem:
      "Il sito esistente contiene molte informazioni utili ma le presenta con gerarchia debole, navigazione profonda e forte densità di testo, rendendo più faticoso il percorso mobile verso contatto e appuntamento.",
    what_we_changed: [
      "Gerarchia mobile-first con proposta di valore immediata",
      "Servizi raggruppati per comprensione rapida",
      "Trust verificato portato prima della conversione",
      "Contatto telefonico ed email resi immediatamente accessibili",
      "Riduzione della densità e della navigazione ridondante"
    ],
    commercial_angle:
      "Trasformare un sito informativo già ricco in un'esperienza più contemporanea, leggibile e orientata alla richiesta di appuntamento.",
    outreach_hook:
      "Abbiamo mantenuto i contenuti e i punti di forza reali dello studio, ma li abbiamo riorganizzati per far capire in pochi secondi chi siete, cosa fate e come contattarvi.",
    verified_contacts: {
      phone_landline: "+390961747810",
      phone_mobile: "+393932227446",
      email: "studiodentisticogiardinelli@gmail.com",
      address: "Via Melchiorre Jannelli, 47, 88100 Catanzaro CZ"
    },
    data_notes: [
      "Orari non pubblicati nella demo: le fonti pubbliche consultate non sono perfettamente coerenti.",
      "Nessuna recensione, rating, numero pazienti o dato prestazionale inventato."
    ],
    created_at: "2026-10-11T05:05:00+02:00",
    updated_at: "2026-10-11T06:12:00+02:00"
  })
});

export function getBuiltinTenant(slug) {
  return BUILTIN_TENANTS[slug] || null;
}
