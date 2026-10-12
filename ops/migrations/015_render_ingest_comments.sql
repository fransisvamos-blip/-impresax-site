alter table render_staging_payloads add column if not exists source_comment_id bigint;
alter table render_staging_payloads add column if not exists source_sha256 text;
alter table render_staging_payloads add column if not exists desktop_image_base64 text;
alter table render_staging_payloads add column if not exists mobile_image_base64 text;
alter table render_staging_payloads add column if not exists image_mime text not null default 'image/jpeg';
alter table render_staging_payloads add column if not exists render_error text;
alter table render_staging_payloads add column if not exists rendered_at timestamptz;

create table if not exists render_ingest_comments (
  comment_id bigint primary key,
  comment_url text,
  prospect_code text,
  render_version integer,
  variant_key text,
  status text not null default 'RECEIVED',
  error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_render_ingest_comments_status
  on render_ingest_comments(status,comment_id);
