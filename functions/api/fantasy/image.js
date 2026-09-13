import {
  guardOrigin,
  jsonResponse,
  optionsResponse,
  proxyBinary,
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
  const qs = new URLSearchParams({
    filename,
    subfolder: url.searchParams.get("subfolder") || "",
    type: url.searchParams.get("type") || "output",
  });
  return proxyBinary(request, env, `/api/image?${qs}`);
}
