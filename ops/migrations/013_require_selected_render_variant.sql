-- ImpresaX Ops
-- Impedisce il passaggio ad APPROVED_REFERENCE senza una variante A/B/C completa selezionata nel Gestionale.

create or replace function guard_selected_render_before_approval()
returns trigger
language plpgsql
as $$
begin
  if new.pipeline_status::text = 'APPROVED_REFERENCE'
     and (old.pipeline_status is null or old.pipeline_status::text <> 'APPROVED_REFERENCE') then
    if not exists (
      select 1
      from render_variants rv
      join render_packs rp on rp.id = rv.render_pack_id
      where rp.prospect_id = new.id
        and rp.approved_reference = true
        and upper(coalesce(rp.status,'')) = 'APPROVED'
        and rv.selected = true
        and upper(coalesce(rv.status,'')) = 'SELECTED'
        and rv.desktop_render_url is not null
        and rv.mobile_render_url is not null
    ) then
      raise exception 'SELECTED_RENDER_VARIANT_REQUIRED';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists trg_guard_selected_render_before_approval on prospects;

create trigger trg_guard_selected_render_before_approval
before update of pipeline_status on prospects
for each row
execute function guard_selected_render_before_approval();
