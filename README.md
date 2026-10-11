# ImpresaX

Repository di produzione ImpresaX.

## Cloudflare Workers Builds
Worker name: `quiet-salad-5340`
Production branch: `main`
Build command: `npm install`
Deploy command: `npx wrangler deploy`

Gli asset del sito sono in `/public`.
Ogni push su `main` può essere distribuito automaticamente da Cloudflare Workers Builds.

## Domain foundation

Official domain:

- `impresax.org` → main ImpresaX site
- `www.impresax.org` → permanent redirect to `impresax.org`
- `*.impresax.org` → Site Factory multi-tenant Worker route
- `quiet-salad-5340.fransisvamos.workers.dev` → technical fallback retained

The Worker resolves prospect demo hostnames server-side from the first DNS label.
Unknown or invalid tenant hostnames redirect safely to `https://impresax.org/`.

Prospect demos always receive:

- `X-Robots-Tag: noindex, nofollow, noarchive`
- an HTML robots meta guard
- the notice `Anteprima non ufficiale realizzata da ImpresaX`

### Required wildcard DNS record

Cloudflare Workers Custom Domains do not support wildcard DNS records, so the wildcard uses a Worker Route.

The Cloudflare zone must contain one proxied wildcard DNS record:

```text
Type: AAAA
Name: *
IPv6 address: 100::
Proxy status: Proxied
```

This is an originless placeholder. Traffic is intercepted by the Worker route:

```text
*.impresax.org/*
```

Do not disable the `workers.dev` hostname until the custom-domain QA is fully complete.
