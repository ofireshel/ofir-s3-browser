const ALLOWED_ORIGINS = new Set([
  "https://33games.win",
  "https://www.33games.win",
]);

export function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://33games.win";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
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

export function guardOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return jsonResponse(request, { error: "forbidden" }, 403);
  }
  return null;
}

export function clientId(env) {
  return env.COMFY_CLIENT_ID || "28997e47-ce99-4d95-b4b3-c0deac845ab8";
}

export function comfyBase(env) {
  const raw = env.COMFY_URL || env.FANTASY_URL || env.TUNNEL_URL || "";
  return String(raw).replace(/\/+$/, "");
}

export async function comfyFetch(env, path, init = {}) {
  const base = comfyBase(env);
  if (!base) {
    throw new Error("Fantasy backend unreachable. The home tunnel may be offline — restart it and try again.");
  }
  const headers = new Headers(init.headers || {});
  const response = await fetch(base + path, { ...init, headers });
  return response;
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

export function buildWorkflow(env, scene, seed) {
  const ckpt = env.COMFY_CHECKPOINT || "v1-5-pruned-emaonly.safetensors";
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
  let comfy = false;
  try {
    const response = await comfyFetch(env, "/system_stats");
    comfy = response.ok;
  } catch {
    comfy = false;
  }
  return { ok: true, comfy, client_id: id };
}

export async function queuePrompt(env, scene) {
  const seed = Math.floor(Math.random() * 0xffffffff);
  const prompt = buildWorkflow(env, scene, seed);
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
    throw new Error(
      "Fantasy backend unreachable. The home tunnel may be offline — restart it and try again.",
    );
  }
  if (!response.ok) {
    throw new Error(data.error || data.message || "Failed to queue");
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
