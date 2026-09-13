import {
  comfyFetch,
  corsHeaders,
  guardOrigin,
  jsonResponse,
  optionsResponse,
} from "../../_utils/fantasy.js";

export async function onRequestOptions({ request }) {
  return optionsResponse(request);
}

export async function onRequestGet({ request, env }) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const url = new URL(request.url);
  const filename = url.searchParams.get("filename") || "";
  if (!filename) {
    return jsonResponse(request, { error: "filename required" }, 400);
  }
  const subfolder = url.searchParams.get("subfolder") || "";
  const type = url.searchParams.get("type") || "output";
  const qs = new URLSearchParams({ filename, subfolder, type });
  try {
    const upstream = await comfyFetch(env, `/view?${qs}`);
    const headers = new Headers(corsHeaders(request));
    headers.set("Cache-Control", "no-store");
    const contentType = upstream.headers.get("content-type") || "image/png";
    headers.set("Content-Type", contentType);
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    return jsonResponse(request, { error: error.message || "image proxy failed" }, 502);
  }
}
