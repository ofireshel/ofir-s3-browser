import {
  guardOrigin,
  jsonResponse,
  optionsResponse,
  saveComfyUrl,
} from "../../_utils/fantasy.js";

export async function onRequestOptions({ request }) {
  return optionsResponse(request);
}

export async function onRequestPost({ request, env }) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  try {
    const url = await saveComfyUrl(env, body.url || body.comfy || body.tunnel);
    return jsonResponse(request, { ok: true, comfy: true, saved: true, host: new URL(url).host });
  } catch (error) {
    return jsonResponse(
      request,
      { ok: false, comfy: false, error: error.message || "Could not save tunnel URL" },
      400,
    );
  }
}
