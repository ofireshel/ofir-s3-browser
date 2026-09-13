import {
  guardOrigin,
  jsonResponse,
  optionsResponse,
  proxyJson,
} from "../_utils/fantasy.js";

export async function onRequestOptions({ request }) {
  return optionsResponse(request);
}

export async function onRequestGet({ request, env }) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  return proxyJson(request, env, "/api/health");
}

export async function onRequestPost({ request }) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  return jsonResponse(request, { error: "not found" }, 404);
}
