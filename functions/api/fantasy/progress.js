import {
  guardOrigin,
  jsonResponse,
  optionsResponse,
  proxyJson,
} from "../../_utils/fantasy.js";

export async function onRequestOptions({ request }) {
  return optionsResponse(request);
}

export async function onRequestGet({ request, env }) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const url = new URL(request.url);
  const promptId = url.searchParams.get("prompt_id") || "";
  if (!promptId) {
    return jsonResponse(request, { error: "prompt_id required" }, 400);
  }
  return proxyJson(
    request,
    env,
    `/api/progress?prompt_id=${encodeURIComponent(promptId)}`,
  );
}
