import {
  guardOrigin,
  healthPayload,
  jsonResponse,
  optionsResponse,
} from "../../_utils/fantasy.js";

export async function onRequestOptions({ request }) {
  return optionsResponse(request);
}

export async function onRequestGet({ request, env }) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  try {
    return jsonResponse(request, await healthPayload(env));
  } catch (error) {
    return jsonResponse(request, { ok: true, comfy: false, error: error.message }, 200);
  }
}
