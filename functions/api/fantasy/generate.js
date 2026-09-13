import {
  guardOrigin,
  jsonResponse,
  optionsResponse,
  queuePrompt,
  sceneFromBody,
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
  let body = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }
  try {
    const scene = sceneFromBody(body);
    const queued = await queuePrompt(env, scene);
    return jsonResponse(request, {
      prompt_id: queued.prompt_id,
      client_id: queued.client_id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to queue";
    const status = /unreachable|offline|tunnel/i.test(message) ? 409 : 400;
    return jsonResponse(request, { error: message }, status);
  }
}
