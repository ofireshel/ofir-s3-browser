const ALLOWED_ORIGINS = new Set([
  "https://33games.win",
  "https://www.33games.win",
]);

const KV_URL_KEY = "fantasy_comfy_url";
const KV_CACHE_KEY = "fantasy_comfy_cache";
const UNREACHABLE =
  "Fantasy backend unreachable. The home tunnel may be offline — restart it and try again.";

const ENV_URL_KEYS = [
  "COMFY_URL",
  "COMFYUI_URL",
  "COMFY_BASE_URL",
  "COMFY_BASE",
  "COMFY_HOST",
  "COMFY_ORIGIN",
  "COMFY_ENDPOINT",
  "COMFYUI_BASE_URL",
  "FANTASY_URL",
  "FANTASY_COMFY_URL",
  "FANTASY_BACKEND",
  "FANTASY_ORIGIN",
  "FANTASY_TUNNEL",
  "FANTASY_HOME",
  "TUNNEL_URL",
  "TUNNEL",
  "CLOUDFLARE_TUNNEL",
  "CF_TUNNEL_URL",
  "ARGO_URL",
  "ARGO_TUNNEL_URL",
  "CLOUDFLARED_URL",
  "QUICK_TUNNEL_URL",
  "TRYCLOUDFLARE_URL",
  "HOME_URL",
  "HOME_TUNNEL",
  "HOME_COMFY",
  "HOME_COMFY_URL",
  "LOCAL_URL",
  "LOCAL_COMFY",
  "LOCAL_COMFY_URL",
  "BACKEND_URL",
  "SD_URL",
  "A1111_URL",
  "FORGE_URL",
  "WEBUI_URL",
  "IMAGE_GEN_URL",
  "GENERATION_URL",
];

const BINDING_NAMES = ["COMFY", "COMFYUI", "FANTASY", "TUNNEL", "HOME"];

let cachedTarget = null;
let cachedAt = 0;

function abortAfter(ms) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

const KV_URL_KEYS = [
  KV_URL_KEY,
  "comfy_url",
  "COMFY_URL",
  "tunnel_url",
  "home_tunnel",
  "fantasy:comfy",
  "fantasy/config",
  "config:fantasy",
  "comfyui_url",
  "fantasy_tunnel",
];

export function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  let allow = "https://33games.win";
  if (ALLOWED_ORIGINS.has(origin)) allow = origin;
  else if (isPagesDev(origin)) allow = origin;
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}

function isPagesDev(origin) {
  try {
    const host = new URL(origin).host;
    return host.endsWith(".pages.dev") || host.endsWith(".workers.dev");
  } catch {
    return false;
  }
}

export function optionsResponse(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export function jsonResponse(request, body, status = 200, spaced = false) {
  const payload = spaced ? jsonSpaced(body) : JSON.stringify(body);
  return new Response(payload, {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function jsonSpaced(value) {
  return JSON.stringify(value, null, 0).replace(/":/g, '": ').replace(/","/g, '", "');
}

function requestHost(request) {
  try {
    return new URL(request.url).host;
  } catch {
    return "";
  }
}

export function guardOrigin(request) {
  const origin = request.headers.get("Origin");
  const host = requestHost(request);
  if (!origin) {
    if (
      host === "33games.win" ||
      host === "www.33games.win" ||
      host.endsWith(".pages.dev")
    ) {
      return null;
    }
    return jsonResponse(request, { error: "forbidden" }, 403);
  }
  if (ALLOWED_ORIGINS.has(origin) || isPagesDev(origin)) return null;
  return jsonResponse(request, { error: "forbidden" }, 403);
}

export function clientId(env) {
  return env.COMFY_CLIENT_ID || "28997e47-ce99-4d95-b4b3-c0deac845ab8";
}

function extractHttpsUrl(raw) {
  if (raw == null) return "";
  if (typeof raw === "object") {
    const nested = raw.url || raw.base || raw.origin || raw.tunnel || raw.comfy;
    return extractHttpsUrl(nested);
  }
  const text = String(raw).trim();
  if (!text) return "";
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      return extractHttpsUrl(JSON.parse(text));
    } catch {
      /* continue */
    }
  }
  const match = text.match(/https:\/\/[^\s"'<>\\]+/i);
  const candidate = match ? match[0] : text;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:") return "";
    const host = url.hostname.toLowerCase();
    if (host === "33games.win" || host === "www.33games.win") return "";
    if (host.endsWith(".pages.dev")) return "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "";
    url.search = "";
    url.hash = "";
    const base = url.toString().replace(/\/+$/, "");
    return base;
  } catch {
    return "";
  }
}

function looksLikeComfyService(service) {
  const s = String(service || "").toLowerCase();
  return (
    s.includes("8188") ||
    s.includes("comfy") ||
    s.includes("8189") ||
    s.includes("7860")
  );
}

function comfyBinding(env) {
  for (const name of BINDING_NAMES) {
    const binding = env[name];
    if (binding && typeof binding.fetch === "function") return binding;
  }
  return null;
}

async function probeComfy(base, binding) {
  const paths = ["/system_stats", "/queue", "/object_info"];
  for (const path of paths) {
    try {
      const response = await comfyRequest(base, binding, path, { method: "GET" });
      if (response && (response.ok || response.status === 405 || response.status === 400)) {
        return true;
      }
    } catch {
      /* try next */
    }
  }
  return false;
}

async function comfyRequest(base, binding, path, init = {}) {
  const headers = new Headers(init.headers || {});
  const opts = { ...init, headers };
  if (!opts.signal) {
    opts.signal = abortAfter(8000);
  }
  if (binding) {
    return binding.fetch(new Request(`https://comfy.local${path}`, opts));
  }
  if (!base) throw new Error(UNREACHABLE);
  return fetch(base + path, opts);
}

async function readKvUrls(env) {
  const found = [];
  if (!env.SCORES) return found;
  for (const key of KV_URL_KEYS) {
    try {
      const raw = await env.SCORES.get(key);
      const url = extractHttpsUrl(raw);
      if (url) found.push(url);
    } catch {
      /* ignore */
    }
  }
  try {
    for (const prefix of ["fantasy", "comfy", "tunnel", "home"]) {
      const listed = await env.SCORES.list({ prefix, limit: 40 });
      for (const entry of listed.keys || []) {
        if (String(entry.name).startsWith("fantasy_job:")) continue;
        const raw = await env.SCORES.get(entry.name);
        const url = extractHttpsUrl(raw);
        if (url) found.push(url);
      }
    }
  } catch {
    /* ignore */
  }
  return found;
}

function envUrls(env) {
  const found = [];
  for (const key of ENV_URL_KEYS) {
    const url = extractHttpsUrl(env[key]);
    if (url) found.push(url);
  }
  return found;
}

async function cfApi(env, path) {
  if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) return null;
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}${path}`,
    {
      headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` },
      signal: abortAfter(8000),
    },
  );
  if (!response.ok) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function urlsFromCloudflare(env) {
  const found = [];
  const project = await cfApi(env, "/pages/projects/lexiorbit");
  const envVars =
    project?.result?.deployment_configs?.production?.env_vars ||
    project?.result?.canonical_deployment?.env_vars ||
    {};
  for (const value of Object.values(envVars)) {
    const raw = value && (value.value || value);
    const url = extractHttpsUrl(raw);
    if (url) found.push(url);
  }

  const tunnels = await cfApi(env, "/cfd_tunnel?is_deleted=false&per_page=50");
  const list = tunnels?.result || [];
  const ranked = [...list].sort((a, b) => {
    const score = (t) =>
      /comfy|fantasy|sd|8188|home|local|studio/i.test(String(t.name || "")) ? 0 : 1;
    return score(a) - score(b);
  });
  for (const tunnel of ranked.slice(0, 8)) {
    const id = tunnel.id;
    if (!id) continue;
    const cfg = await cfApi(env, `/cfd_tunnel/${id}/configurations`);
    const ingress = cfg?.result?.config?.ingress || cfg?.result?.ingress || [];
    for (const rule of ingress) {
      if (!looksLikeComfyService(rule.service) && !/comfy|fantasy|sd/i.test(rule.hostname || "")) {
        continue;
      }
      if (rule.hostname) found.push(extractHttpsUrl(`https://${rule.hostname}`));
    }
  }
  return found.filter(Boolean);
}

async function rememberBase(env, base) {
  try {
    if (env.SCORES) {
      await env.SCORES.put(
        KV_CACHE_KEY,
        JSON.stringify({ base, at: Date.now() }),
        { expirationTtl: 60 * 30 },
      );
    }
  } catch {
    /* ignore */
  }
}

export async function resolveComfyTarget(env) {
  if (cachedTarget && Date.now() - cachedAt < 15000) return cachedTarget;

  async function accept(base, binding, source) {
    const ok = await probeComfy(base, binding);
    if (!ok) return null;
    if (base) await rememberBase(env, base);
    cachedTarget = { base, binding, source };
    cachedAt = Date.now();
    return cachedTarget;
  }

  const binding = comfyBinding(env);
  if (binding) {
    const hit = await accept("", binding, "binding");
    if (hit) return hit;
  }
  for (const base of envUrls(env)) {
    const hit = await accept(base, null, "env");
    if (hit) return hit;
  }
  for (const base of await readKvUrls(env)) {
    const hit = await accept(base, null, "kv");
    if (hit) return hit;
  }
  try {
    const cached = env.SCORES ? await env.SCORES.get(KV_CACHE_KEY) : null;
    if (cached) {
      const parsed = JSON.parse(cached);
      const base = extractHttpsUrl(parsed && parsed.base);
      if (base) {
        const hit = await accept(base, null, "cache");
        if (hit) return hit;
      }
    }
  } catch {
    /* ignore */
  }
  for (const base of await urlsFromCloudflare(env)) {
    const hit = await accept(base, null, "cf");
    if (hit) return hit;
  }

  cachedTarget = { base: "", binding: null, source: "missing" };
  cachedAt = Date.now();
  return cachedTarget;
}

export async function saveComfyUrl(env, raw) {
  const base = extractHttpsUrl(raw);
  if (!base) throw new Error("Need an https:// tunnel URL for local ComfyUI.");
  const ok = await probeComfy(base, null);
  cachedTarget = null;
  cachedAt = 0;
  if (env.SCORES) {
    await env.SCORES.put(KV_URL_KEY, base);
    await env.SCORES.put(KV_CACHE_KEY, JSON.stringify({ base, at: Date.now() }));
  }
  if (!ok) {
    throw new Error(
      "Saved the URL, but ComfyUI did not answer yet. Keep the home tunnel running and try again.",
    );
  }
  cachedTarget = { base, binding: null, source: "kv" };
  cachedAt = Date.now();
  return base;
}

export async function comfyFetch(env, path, init = {}) {
  const target = await resolveComfyTarget(env);
  if (!target.binding && !target.base) {
    throw new Error(UNREACHABLE);
  }
  return comfyRequest(target.base, target.binding, path, init);
}

export function sceneFromBody(body) {
  const src = body && typeof body === "object" ? body : {};
  const pick = (key, fallback) => {
    const value = src[key];
    if (value == null || value === "") return fallback;
    return String(value);
  };
  return {
    age: pick("age", "30"),
    nationality: pick("nationality", "american"),
    background: pick("background", "beach"),
    event: pick("event", "none"),
    lighting: pick("lighting", "golden_hour"),
    weather: pick("weather", "clear"),
    body_type: pick("body_type", "fit"),
    style: pick("style", "candid"),
  };
}

function phrase(map, key, fallback) {
  return map[key] || fallback || String(key || "").replace(/_/g, " ");
}

export function buildPrompt(scene) {
  const backgrounds = {
    beach: "on a sunlit beach with wet sand and ocean horizon",
    city: "on a busy city street with architecture behind her",
    desert: "in a vast desert with dunes",
    forest: "in a dense forest with dappled light",
    mountains: "in a mountain landscape",
    lake: "beside a calm lake",
    rooftop: "on a city rooftop at night",
    bedroom: "in a softly styled bedroom interior",
    palace: "in an ornate fantasy palace",
    castle: "in a castle courtyard",
    tavern: "inside a medieval tavern",
    spaceship: "inside a detailed spaceship interior",
  };
  const events = {
    none: "",
    moon_landing: ", at the 1969 moon landing",
    berlin_wall: ", at the fall of the Berlin Wall",
    woodstock: ", at the Woodstock festival",
    roman_forum: ", in the Ancient Roman Forum",
    ww2_ve_day: ", on VE-Day 1945",
    titanic: ", with the Titanic on the horizon",
    jfk_motorcade: ", at a 1960s motorcade",
    bastille: ", at the Storming of the Bastille",
    wright_flight: ", at the Wright brothers first flight",
    gold_rush: ", during the California Gold Rush",
    eiffel_opening: ", at the Eiffel Tower opening in 1889",
    independence_hall: ", at the signing of the Declaration",
  };
  const lighting = {
    golden_hour: "golden hour light",
    midday: "bright midday light",
    sunset: "dramatic sunset light",
    moonlit: "moonlit night",
    neon: "neon night lighting",
    soft_window: "soft window light",
    candle: "warm candlelight",
    storm: "stormy cinematic light",
  };
  const weather = {
    clear: "clear air",
    windy: "wind in hair and clothes",
    rain: "light rain",
    fog: "foggy mist",
    snow: "light snow",
    humid: "warm humid air",
  };
  const bodies = {
    slim: "slim figure",
    fit: "fit athletic figure",
    athletic: "fit athletic figure",
    curvy: "curvy figure",
    petite: "petite figure",
    tall_slim: "tall slim figure",
    voluptuous: "voluptuous figure",
    muscular: "muscular figure",
    average: "average figure",
  };
  const styles = {
    candid: "candid photograph, natural pose",
    cinematic: "cinematic still, anamorphic look",
    fantasy_art: "detailed fantasy art",
    hdr: "HDR photorealistic",
    film: "35mm film photograph",
  };

  const eventBit = phrase(events, scene.event, "");
  return [
    `A ${scene.age}-year-old ${String(scene.nationality).replace(/_/g, " ")} woman`,
    phrase(bodies, scene.body_type, scene.body_type),
    phrase(backgrounds, scene.background, scene.background),
    eventBit.replace(/^, /, ""),
    phrase(lighting, scene.lighting, scene.lighting),
    phrase(weather, scene.weather, scene.weather),
    phrase(styles, scene.style, scene.style),
    "highly detailed, sharp focus, no text, no watermark",
  ]
    .filter(Boolean)
    .join(", ");
}

export function buildWorkflow(env, scene, seed, ckptName) {
  const ckpt = ckptName || env.COMFY_CHECKPOINT || "v1-5-pruned-emaonly.safetensors";
  const prompt = buildPrompt(scene);
  const negative =
    "low quality, blurry, extra fingers, deformed hands, watermark, text, logo, cartoon, ugly";
  const width = Number(env.COMFY_WIDTH || 768);
  const height = Number(env.COMFY_HEIGHT || 768);
  const steps = Number(env.COMFY_STEPS || 20);
  return {
    3: {
      class_type: "KSampler",
      inputs: {
        seed,
        steps,
        cfg: 7,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: 1,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0],
      },
    },
    4: {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: ckpt },
    },
    5: {
      class_type: "EmptyLatentImage",
      inputs: { width, height, batch_size: 1 },
    },
    6: {
      class_type: "CLIPTextEncode",
      inputs: { text: prompt, clip: ["4", 1] },
    },
    7: {
      class_type: "CLIPTextEncode",
      inputs: { text: negative, clip: ["4", 1] },
    },
    8: {
      class_type: "VAEDecode",
      inputs: { samples: ["3", 0], vae: ["4", 2] },
    },
    9: {
      class_type: "SaveImage",
      inputs: { filename_prefix: "33games_fantasy", images: ["8", 0] },
    },
  };
}

export async function saveJob(env, promptId, meta) {
  if (!env.SCORES) return;
  await env.SCORES.put(`fantasy_job:${promptId}`, JSON.stringify(meta), {
    expirationTtl: 60 * 60 * 6,
  });
}

export async function loadJob(env, promptId) {
  if (!env.SCORES) return null;
  const raw = await env.SCORES.get(`fantasy_job:${promptId}`);
  return raw ? JSON.parse(raw) : null;
}

export async function healthPayload(env) {
  const id = clientId(env);
  try {
    const target = await resolveComfyTarget(env);
    if (!target.binding && !target.base) {
      return { ok: true, comfy: false, client_id: id, configured: false };
    }
    const comfy = await probeComfy(target.base, target.binding);
    return {
      ok: true,
      comfy,
      client_id: id,
      configured: true,
    };
  } catch {
    return { ok: true, comfy: false, client_id: id, configured: false };
  }
}

function errorFromComfy(data, fallback) {
  if (!data) return fallback;
  if (typeof data.error === "string" && data.error) return data.error;
  if (data.error && typeof data.error === "object") {
    return data.error.message || data.error.type || fallback;
  }
  if (typeof data.message === "string" && data.message) return data.message;
  return fallback;
}

async function firstCheckpoint(env) {
  try {
    const response = await comfyFetch(env, "/object_info/CheckpointLoaderSimple");
    if (!response.ok) return "";
    const info = await response.json();
    const list =
      info?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] ||
      info?.input?.required?.ckpt_name?.[0] ||
      [];
    return Array.isArray(list) && list[0] ? String(list[0]) : "";
  } catch {
    return "";
  }
}

async function postPrompt(env, scene, seed, ckptName) {
  const prompt = buildWorkflow(env, scene, seed, ckptName);
  const body = {
    prompt,
    client_id: clientId(env),
    extra_data: { scene, seed },
  };
  const response = await comfyFetch(env, "/prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(UNREACHABLE);
  }
  return { response, data };
}

export async function queuePrompt(env, scene) {
  const seed = Math.floor(Math.random() * 0xffffffff);
  let { response, data } = await postPrompt(env, scene, seed);
  if (!response.ok) {
    const msg = errorFromComfy(data, "Failed to queue");
    if (/ckpt|checkpoint/i.test(JSON.stringify(data))) {
      const ckpt = await firstCheckpoint(env);
      if (ckpt) {
        ({ response, data } = await postPrompt(env, scene, seed, ckpt));
      }
    }
    if (!response.ok) throw new Error(msg);
  }
  const promptId = data.prompt_id;
  if (!promptId) throw new Error("No job id returned from Fantasy Studio.");
  await saveJob(env, promptId, { scene, seed });
  return { prompt_id: promptId, client_id: clientId(env), seed, scene };
}

function imagesFromHistory(entry) {
  const images = [];
  const outputs = (entry && entry.outputs) || {};
  for (const node of Object.values(outputs)) {
    const list = (node && node.images) || [];
    for (const img of list) {
      images.push({
        filename: img.filename,
        subfolder: img.subfolder || "",
        type: img.type || "output",
      });
    }
  }
  return images;
}

export async function progressPayload(env, promptId) {
  const job = (await loadJob(env, promptId)) || {};
  const base = {
    prompt_id: promptId,
    status: "unknown",
    percent: 0,
    value: 0,
    max: 0,
    node: null,
    images: [],
    error: null,
    seed: job.seed ?? null,
    scene: job.scene || null,
  };

  let history = {};
  let queue = {};
  try {
    const histRes = await comfyFetch(env, `/history/${encodeURIComponent(promptId)}`);
    history = histRes.ok ? await histRes.json() : {};
  } catch {
    return base;
  }
  try {
    const queueRes = await comfyFetch(env, "/queue");
    queue = queueRes.ok ? await queueRes.json() : {};
  } catch {
    queue = {};
  }

  const entry = history[promptId];
  if (entry) {
    const images = imagesFromHistory(entry);
    const statusStr = JSON.stringify(entry.status || {});
    if (/error/i.test(statusStr) && images.length === 0) {
      return {
        ...base,
        status: "error",
        error: entry.status?.messages?.[0]?.[1] || "Generation failed",
      };
    }
    if (images.length) {
      return { ...base, status: "done", percent: 100, images };
    }
    return { ...base, status: "finalizing", percent: 95, images };
  }

  const pending = (queue.queue_pending || []).some((item) => item?.[1] === promptId);
  const running = (queue.queue_running || []).some((item) => item?.[1] === promptId);
  if (running) return { ...base, status: "running", percent: 35 };
  if (pending) return { ...base, status: "queued", percent: 2 };
  return base;
}
