import {
  guardOrigin,
  jsonResponse,
  optionsResponse,
  proxyJson,
} from "../../_utils/fantasy.js";

export async function onRequestOptions({ request }) {
  return optionsResponse(request);
}

export async function onRequestGet({ request }) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  return jsonResponse(request, { error: "not found" }, 404);
}

export async function onRequestPost({ request, env }) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const body = await request.text();
  return proxyJson(request, env, "/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    timeoutMs: 30000,
  });
}
