const ALLOWED_ORIGINS = new Set([
  "https://33games.win",
  "https://www.33games.win",
]);

const UNREACHABLE =
  "Fantasy backend unreachable. The home tunnel may be offline — restart it and try again.";

export function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://33games.win";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}

export function optionsResponse(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export function jsonResponse(request, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export function guardOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return jsonResponse(request, { error: "forbidden" }, 403);
  }
  return null;
}

function abortAfter(ms) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export function backendBase(env) {
  const raw = String(
    env.FANTASY_BACKEND_URL ||
      env.COMFY_URL ||
      env.FANTASY_URL ||
      env.TUNNEL_URL ||
      "https://fantasy-home.33games.win",
  ).trim();
  return raw.replace(/\/+$/, "");
}

function backendUrl(env, pathAndQuery) {
  const base = backendBase(env);
  const suffix = pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`;
  if (base.endsWith("/api") && suffix.startsWith("/api/")) {
    return base + suffix.slice(4);
  }
  return base + suffix;
}

export async function backendFetch(env, pathAndQuery, init = {}) {
  const headers = new Headers(init.headers || {});
  const secret = env.FANTASY_SHARED_SECRET || env.FANTASY_KEY || "";
  if (secret) headers.set("X-Fantasy-Key", secret);
  const opts = {
    method: init.method || "GET",
    headers,
    signal: init.signal || abortAfter(init.timeoutMs || 20000),
  };
  if (init.body != null) opts.body = init.body;
  return fetch(backendUrl(env, pathAndQuery), opts);
}

export async function proxyJson(request, env, pathAndQuery, init = {}) {
  try {
    const upstream = await backendFetch(env, pathAndQuery, init);
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        ...corsHeaders(request),
        "Content-Type": upstream.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return jsonResponse(request, { error: UNREACHABLE, ok: false, comfy: false }, 409);
  }
}

export async function proxyBinary(request, env, pathAndQuery) {
  try {
    const upstream = await backendFetch(env, pathAndQuery, { timeoutMs: 60000 });
    const headers = new Headers(corsHeaders(request));
    headers.set("Cache-Control", "no-store");
    headers.set(
      "Content-Type",
      upstream.headers.get("content-type") || "application/octet-stream",
    );
    const disposition = upstream.headers.get("content-disposition");
    if (disposition) headers.set("Content-Disposition", disposition);
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return jsonResponse(request, { error: UNREACHABLE }, 409);
  }
}
