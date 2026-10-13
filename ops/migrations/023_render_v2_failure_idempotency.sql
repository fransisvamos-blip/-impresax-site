-- ImpresaX Rendering Pipeline V2 — failure idempotency.
create unique index if not exists render_failures_v2_idempotency_uniq
on public.render_failures_v2(
  render_pack_id,
  coalesce(workflow_id,'00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(variant_revision_id,'00000000-0000-0000-0000-000000000000'::uuid),
  step,
  fingerprint,
  strategy_version
);
