-- ImpresaX Ops
-- Richieste inbound provenienti dal sito impresax.org.

create table if not exists inbound_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'NUOVA',
  name text not null,
  company text not null,
  sector text not null,
  website text,
  phone text not null,
  email text not null,
  improvement_area text not null,
  diagnostic_area text,
  message text,
  source_page text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  source text not null default 'IMPRESAX_SITE',
  notes text,
  contacted_at timestamptz,
  closed_at timestamptz
);

create index if not exists inbound_requests_created_idx
  on inbound_requests(created_at desc);

create index if not exists inbound_requests_status_idx
  on inbound_requests(status, created_at desc);
