import { getBuiltinTenant } from "./tenant-registry.js";

const ROOT_HOST = "impresax.org";
const WWW_HOST = "www.impresax.org";
const DOMAIN_SUFFIX = ".impresax.org";
const VALID_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;\nconst FACTORY_VERSION = "pilot-001-v1";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = normalizeHostname(url.hostname);

    // Enforce the official HTTPS origin before serving the public domain.
    if ((host === ROOT_HOST || host === WWW_HOST) && url.protocol !== "https:") {
      const target = new URL(request.url);
      target.protocol = "https:";
      target.hostname = ROOT_HOST;
      return new Response(null, {
        status: 301,
        headers: {
          Location: target.toString(),
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    // Keep the existing workers.dev endpoint as a technical fallback.
    if (host.endsWith(".workers.dev")) {
      return serveMainSite(request, env);
    }

    // Canonical public domain.
    if (host === ROOT_HOST) {
      return serveMainSite(request, env);
    }

    // Permanent canonical redirect.
    if (host === WWW_HOST) {
      const target = new URL(request.url);
      target.protocol = "https:";
      target.hostname = ROOT_HOST;
      return new Response(null, {
        status: 301,
        headers: {
          Location: target.toString(),
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    // Reject hosts outside the official zone.
    if (!host.endsWith(DOMAIN_SUFFIX)) {
      return redirectToRoot("invalid-host");
    }

    const slug = host.slice(0, -DOMAIN_SUFFIX.length);

    // A tenant is exactly one validated DNS label.
    if (!VALID_SLUG.test(slug) || slug.includes(".")) {
      return redirectToRoot("invalid-slug");
    }

    const tenant = await resolveTenant(env, slug);

    // Unknown, archived or not-yet-approved tenants never expose internal data.
    if (!tenant || !isPublicTenant(tenant)) {
      return redirectToRoot("tenant-not-found");
    }

    return serveTenant(request, env, tenant);
  },
};

function normalizeHostname(hostname) {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

async function serveMainSite(request, env) {
  const response = await env.ASSETS.fetch(request);
  const secured = withSecurityHeaders(response, false);
  const headers = new Headers(secured.headers);
  headers.set("X-ImpresaX-Factory-Version", FACTORY_VERSION);
  return new Response(secured.body, {
    status: secured.status,
    statusText: secured.statusText,
    headers,
  });
}

async function resolveTenant(env, slug) {
  // Preferred fast path: KV mapping keyed only by the validated slug.
  if (env.TENANTS && typeof env.TENANTS.get === "function") {
    const tenant = await env.TENANTS.get(`tenant:${slug}`, { type: "json" });
    if (tenant) return tenant;
  }

  // Optional D1 fallback for the future canonical tenant table.
  if (env.DB && typeof env.DB.prepare === "function") {
    const row = await env.DB.prepare(
      `SELECT tenant_id, prospect_id, slug, business_name, vertical, status,
              qa_status, content_data, rendered_html, updated_at
       FROM tenants
       WHERE slug = ?
       LIMIT 1`
    )
      .bind(slug)
      .first();

    if (row) {
      return {
        ...row,
        content_data: parseJson(row.content_data),
      };
    }
  }

  const builtin = getBuiltinTenant(slug);
  if (builtin) return builtin;

  return null;
}

function isPublicTenant(tenant) {
  return (
    tenant &&
    typeof tenant.slug === "string" &&
    VALID_SLUG.test(tenant.slug) &&
    (
      tenant.status === "DEMO_READY" ||
      tenant.status === "CONVERTED_CLIENT" ||
      (tenant.status === "QA_READY" && tenant.qa_status === "PASS" && tenant.public_preview === true)
    ) &&
    (tenant.qa_status === "PASS" || tenant.status === "CONVERTED_CLIENT")
  );
}

async function serveTenant(request, env, tenant) {
  const requestUrl = new URL(request.url);
  const tenantAssetPrefix = `/tenants/${tenant.slug}/`;

  // Serve only this tenant's own static assets. Never allow a tenant hostname
  // to traverse into another tenant's asset directory.
  if (
    requestUrl.pathname !== "/" &&
    requestUrl.pathname.startsWith(tenantAssetPrefix) &&
    !requestUrl.pathname.includes("..")
  ) {
    const assetResponse = await env.ASSETS.fetch(request);
    return withSecurityHeaders(assetResponse, true);
  }

  let html = "";

  if (typeof tenant.rendered_html === "string" && tenant.rendered_html.trim()) {
    html = tenant.rendered_html;
  } else if (
    typeof tenant.asset_path === "string" &&
    tenant.asset_path.startsWith("/tenants/") &&
    !tenant.asset_path.includes("..")
  ) {
    const assetUrl = new URL(tenant.asset_path, request.url);
    const assetResponse = await env.ASSETS.fetch(new Request(assetUrl, request));
    if (!assetResponse.ok) return brandedUnavailable();
    html = await assetResponse.text();
  } else {
    return brandedUnavailable();
  }

  html = enforceDemoGuards(html);

  return new Response(html, {
    status: 200,
    headers: demoHeaders({
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "private, no-store",
      "X-ImpresaX-Site-Factory": "tenant",
      "X-ImpresaX-Tenant": tenant.slug,
      "X-ImpresaX-Tenant-Status": tenant.status,
      "X-ImpresaX-Factory-Version": FACTORY_VERSION,
    }),
  });
}

function enforceDemoGuards(html) {
  let output = html;

  if (!/<meta[^>]+name=["']robots["']/i.test(output)) {
    output = output.replace(
      /<head([^>]*)>/i,
      '<head$1><meta name="robots" content="noindex,nofollow,noarchive">'
    );
  }

  const disclaimer =
    '<div data-impresax-demo-notice style="position:fixed;left:12px;bottom:12px;z-index:2147483647;padding:7px 10px;border-radius:999px;background:rgba(17,17,17,.86);color:#fff;font:500 11px/1.2 system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;letter-spacing:.02em;backdrop-filter:blur(8px)">Anteprima non ufficiale realizzata da ImpresaX</div>';

  if (!output.includes("data-impresax-demo-notice")) {
    output = /<\/body>/i.test(output)
      ? output.replace(/<\/body>/i, `${disclaimer}</body>`)
      : `${output}${disclaimer}`;
  }

  return output;
}

function brandedUnavailable() {
  const html = `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>Anteprima in preparazione · ImpresaX</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#111;color:#f7f6f2;font-family:Inter,system-ui,sans-serif}
    main{max-width:620px;padding:40px 24px;text-align:center}
    p{color:#c9c6bf;line-height:1.55}
    a{color:#ff5a36}
  </style>
</head>
<body>
  <main>
    <h1>Anteprima in preparazione</h1>
    <p>Questa anteprima non è ancora disponibile pubblicamente.</p>
    <p><a href="https://impresax.org/">ImpresaX</a></p>
  </main>
</body>
</html>`;

  return new Response(html, {
    status: 503,
    headers: demoHeaders({
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "no-store",
      "Retry-After": "300",
      "X-ImpresaX-Site-Factory": "pending",
    }),
  });
}

function redirectToRoot(reason) {
  return new Response(null, {
    status: 302,
    headers: demoHeaders({
      Location: "https://impresax.org/",
      "Cache-Control": "no-store",
      "X-ImpresaX-Site-Factory": "fallback",
      "X-ImpresaX-Fallback": reason,
      "X-ImpresaX-Factory-Version": FACTORY_VERSION,
    }),
  });
}

function demoHeaders(initial = {}) {
  const headers = new Headers(initial);
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return headers;
}

function withSecurityHeaders(response, isDemo) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (isDemo) {
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function parseJson(value) {
  if (value == null || typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
