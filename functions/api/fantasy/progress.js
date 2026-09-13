import {
  guardOrigin,
  jsonResponse,
  optionsResponse,
  progressPayload,
} from "../../_utils/fantasy.js";

export async function onRequestOptions({ request }) {
  return optionsResponse(request);
}

export async function onRequestGet({ request, env }) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const promptId = new URL(request.url).searchParams.get("prompt_id") || "";
  if (!promptId) {
    return jsonResponse(request, { error: "prompt_id required" }, 400);
  }
  try {
    return jsonResponse(request, await progressPayload(env, promptId));
  } catch (error) {
    return jsonResponse(request, { error: error.message || "Progress check failed" }, 409);
  }
}
