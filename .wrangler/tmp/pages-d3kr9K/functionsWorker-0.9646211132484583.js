var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// api/news.js
async function onRequestGet({ request, env }) {
  try {
    const rssUrl = "https://www.ynet.co.il/Integration/StoryRss2.xml";
    const rssResp = await fetch(rssUrl, { headers: { "User-Agent": "Mozilla/5.0 (compatible; OfirNewsBot/1.0)" } });
    if (!rssResp.ok) {
      return new Response(JSON.stringify({ error: "Failed to fetch RSS", status: rssResp.status }), { status: 502, headers: { "Content-Type": "application/json; charset=utf-8" } });
    }
    const xml = await rssResp.text();
    const decode = /* @__PURE__ */ __name((str) => (str || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").trim(), "decode");
    const allItemBlocks = [...xml.matchAll(/<item>[\s\S]*?<\/item>/g)].map((m) => m[0]);
    const parsed = allItemBlocks.map((block) => {
      const get = /* @__PURE__ */ __name((tag) => {
        const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
        return decode(m ? m[1].replace(/<!\[CDATA\[|]]>/g, "") : "");
      }, "get");
      const categories = [...block.matchAll(/<category>([\s\S]*?)<\/category>/gi)].map((m) => decode(m[1]));
      return {
        block,
        title: get("title"),
        link: get("link"),
        description: get("description").replace(/<[^>]+>/g, "").trim(),
        pubDate: get("pubDate"),
        categories
      };
    });
    const isHebrew = /* @__PURE__ */ __name((s) => /[\u0590-\u05FF]/.test(s || ""), "isHebrew");
    const hasAny = /* @__PURE__ */ __name((s, arr) => arr.some((k) => (s || "").includes(k)), "hasAny");
    const includeKw = ["\u05D9\u05E9\u05E8\u05D0\u05DC", "\u05DB\u05E0\u05E1\u05EA", "\u05DE\u05DE\u05E9\u05DC\u05D4", '\u05D1\u05D2"\u05E5', '\u05E6\u05D4"\u05DC', "\u05DE\u05E9\u05D8\u05E8\u05D4", "\u05D9\u05E8\u05D5\u05E9\u05DC\u05D9\u05DD", "\u05EA\u05DC \u05D0\u05D1\u05D9\u05D1", "\u05D7\u05D9\u05E4\u05D4", "\u05D1\u05D0\u05E8 \u05E9\u05D1\u05E2", "\u05D2\u05DC\u05D9\u05DC", "\u05E0\u05D2\u05D1", "\u05E2\u05D5\u05D8\u05E3 \u05E2\u05D6\u05D4", "\u05D9\u05D4\u05D5\u05D3\u05D4 \u05D5\u05E9\u05D5\u05DE\u05E8\u05D5\u05DF", "\u05E7\u05D9\u05D1\u05D5\u05E5", "\u05DE\u05D5\u05E9\u05D1", "\u05E2\u05D9\u05E8\u05D9\u05D9\u05EA", "\u05DE\u05D7\u05D5\u05D6", "\u05E9\u05E8", "\u05E8\u05D0\u05E9 \u05D4\u05DE\u05DE\u05E9\u05DC\u05D4", '\u05E9\u05D1"\u05DB'];
    const excludeKw = ["\u05D1\u05E2\u05D5\u05DC\u05DD", "\u05D7\u05D3\u05E9\u05D5\u05EA \u05D1\u05E2\u05D5\u05DC\u05DD", "world", "\u05D7\u05D5\u05E5"];
    const internal = parsed.filter((it) => {
      const text = `${it.title} ${it.description} ${it.categories.join(" ")}`;
      const heb = isHebrew(it.title) || isHebrew(it.description);
      const hasInclude = hasAny(text, includeKw) || it.categories.some((c) => /חדשות|פוליטי|ביטחון|מקומי/.test(c));
      const hasExclude = hasAny(text, excludeKw);
      return heb && hasInclude && !hasExclude;
    });
    const fallbackHeb = parsed.filter((it) => (isHebrew(it.title) || isHebrew(it.description)) && !internal.includes(it));
    const selected = internal.concat(fallbackHeb).slice(0, 4);
    async function callKimi(messages, maxTokens) {
      const url = (env.KIMI_API_URL || "").trim();
      const key = (env.KIMI_API_KEY || "").trim();
      if (!url || !key) return null;
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
          body: JSON.stringify({ model: "kimi-k2-instruct", messages, max_tokens: Math.max(120, Math.min(320, maxTokens || 240)), temperature: 0.2 })
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        const c = data.choices?.[0]?.message?.content || data.output || data.response || "";
        return String(c || "").trim();
      } catch {
        return null;
      }
    }
    __name(callKimi, "callKimi");
    async function callOpenAI(messages, maxTokens) {
      const key = (env.OPENAI_API_KEY || "").trim();
      if (!key) return null;
      try {
        const resp = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
          body: JSON.stringify({ model: "o4-mini", messages, max_tokens: Math.max(120, Math.min(320, maxTokens || 240)), temperature: 0.2 })
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        const c = data.choices?.[0]?.message?.content || "";
        return String(c || "").trim();
      } catch {
        return null;
      }
    }
    __name(callOpenAI, "callOpenAI");
    async function extractPeopleAndSummary(title, description) {
      const userContent = `Return valid JSON only: {"people":[{"name":"Name","roleHint":"text"},...],"summary":"English summary"}.
Title: ${title}
Description: ${description}`;
      const kimi = await callKimi([
        { role: "system", content: "Return JSON only; no extra text." },
        { role: "user", content: userContent }
      ], 280);
      if (kimi) {
        try {
          const parsed2 = JSON.parse(kimi);
          const people = Array.isArray(parsed2.people) ? parsed2.people.slice(0, 3).map((p) => ({ name: String(p.name || "").trim(), roleHint: String(p.roleHint || "").trim() })).filter((p) => p.name) : [];
          const summary = String(parsed2.summary || description.slice(0, 300));
          return { people, summary };
        } catch {
        }
      }
      if (env.AI && typeof env.AI.run === "function") {
        try {
          const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", { messages: [
            { role: "system", content: "Return JSON only; no extra text." },
            { role: "user", content: userContent }
          ], max_tokens: 260, temperature: 0.2 });
          const raw = (result && (result.response || result.text || "")).trim();
          const parsed2 = JSON.parse(raw);
          const people = Array.isArray(parsed2.people) ? parsed2.people.slice(0, 3).map((p) => ({ name: String(p.name || "").trim(), roleHint: String(p.roleHint || "").trim() })).filter((p) => p.name) : [];
          const summary = String(parsed2.summary || description.slice(0, 300));
          return { people, summary };
        } catch {
        }
      }
      return { people: [], summary: description.slice(0, 300) };
    }
    __name(extractPeopleAndSummary, "extractPeopleAndSummary");
    async function enrichFromC14(name) {
      try {
        const url = `https://www.c14.co.il/?s=${encodeURIComponent(name)}`;
        const resp = await fetch(url, { headers: { "User-Agent": "OfirNewsBot/1.0", "Accept-Language": "he" } });
        if (!resp.ok) return { name, elected: null, alignment: null, evidence: [] };
        const html = await resp.text();
        const text = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        const windowText = text.slice(0, 12e3);
        const electedTokens = ["\u05D7\u05D1\u05E8 \u05D4\u05DB\u05E0\u05E1\u05EA", '\u05D7"\u05DB', "\u05E9\u05E8 ", "\u05E9\u05E8\u05EA ", "\u05E9\u05E8\u05D9", "\u05E8\u05D0\u05E9 \u05D4\u05DE\u05DE\u05E9\u05DC\u05D4", "\u05E8\u05D0\u05E9 \u05E2\u05D9\u05E8", "\u05E8\u05D0\u05E9 \u05D4\u05E2\u05D9\u05E8", "\u05D7\u05D1\u05E8 \u05DE\u05D5\u05E2\u05E6\u05D4", "\u05D7\u05D1\u05E8\u05D9 \u05DB\u05E0\u05E1\u05EA", "\u05E9\u05E8\u05D9\u05DD"];
        const nonelectedTokens = ["\u05E9\u05D5\u05E4\u05D8", "\u05E9\u05D5\u05E4\u05D8\u05D9\u05DD", "\u05D9\u05D5\u05E2\u05E5 \u05DE\u05E9\u05E4\u05D8\u05D9", "\u05E4\u05E8\u05E7\u05DC\u05D9\u05D8", "\u05E4\u05E8\u05E7\u05DC\u05D9\u05D8\u05D5\u05EA", "\u05DE\u05D1\u05E7\u05E8 \u05D4\u05DE\u05D3\u05D9\u05E0\u05D4", "\u05E0\u05E6\u05D9\u05D1", "\u05E4\u05E7\u05D9\u05D3", "\u05E4\u05E7\u05D9\u05D3\u05D5\u05EA", '\u05DE\u05E0\u05DB"\u05DC \u05DE\u05E9\u05E8\u05D3'];
        const rightTokens = ["\u05D9\u05DE\u05D9\u05DF", "\u05D4\u05DC\u05D9\u05DB\u05D5\u05D3", "\u05D4\u05E6\u05D9\u05D5\u05E0\u05D5\u05EA \u05D4\u05D3\u05EA\u05D9\u05EA", "\u05E2\u05D5\u05E6\u05DE\u05D4 \u05D9\u05D4\u05D5\u05D3\u05D9\u05EA", '\u05E9"\u05E1', "\u05D9\u05D4\u05D3\u05D5\u05EA \u05D4\u05EA\u05D5\u05E8\u05D4"];
        const leftTokens = ["\u05E9\u05DE\u05D0\u05DC", "\u05D9\u05E9 \u05E2\u05EA\u05D9\u05D3", "\u05D4\u05E2\u05D1\u05D5\u05D3\u05D4", "\u05DE\u05E8\u05E6", '\u05D7\u05D3"\u05E9', '\u05D1\u05DC"\u05D3', '\u05E8\u05E2"\u05DD', "\u05DE\u05D7\u05E0\u05D4 \u05DE\u05DE\u05DC\u05DB\u05EA\u05D9", "\u05DB\u05D7\u05D5\u05DC \u05DC\u05D1\u05DF"];
        const hasTok = /* @__PURE__ */ __name((arr) => arr.some((t) => windowText.includes(t)), "hasTok");
        let elected = null;
        if (hasTok(electedTokens)) elected = true;
        else if (hasTok(nonelectedTokens)) elected = false;
        let alignment = null;
        if (hasTok(rightTokens)) alignment = "right";
        else if (hasTok(leftTokens)) alignment = "left";
        const evidence = [windowText.slice(0, 400)];
        return { name, elected, alignment, evidence };
      } catch {
        return { name, elected: null, alignment: null, evidence: [] };
      }
    }
    __name(enrichFromC14, "enrichFromC14");
    async function translateToHebrew(text) {
      if (!text) return "";
      const prompt = `Translate the entire input to Hebrew. Output must be complete and not omit or summarize any content. Preserve meaning and tone.

${text}`;
      const open = await callOpenAI([
        { role: "system", content: "You translate to Hebrew fully and accurately without omissions." },
        { role: "user", content: prompt }
      ], 800);
      if (open && open.length > 0) return open;
      const kimi = await callKimi([
        { role: "system", content: "Translate to Hebrew fully and accurately without omissions." },
        { role: "user", content: prompt }
      ], 800);
      if (kimi && kimi.length > 0) return kimi;
      if (env.AI && typeof env.AI.run === "function") {
        try {
          const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", { messages: [
            { role: "system", content: "Translate to Hebrew fully and accurately without omissions." },
            { role: "user", content: prompt }
          ], max_tokens: 800, temperature: 0.2 });
          const out = ((result && (result.response || result.text || "")) + "").trim();
          if (out) return out;
        } catch {
        }
      }
      return "";
    }
    __name(translateToHebrew, "translateToHebrew");
    const articles = [];
    for (const it of selected) {
      const { title, link, description, pubDate } = it;
      const extr = await extractPeopleAndSummary(title, description);
      const people = extr.people || [];
      const summary = extr.summary || description.slice(0, 300);
      const enriched = [];
      for (const p of people.slice(0, 3)) {
        enriched.push(await enrichFromC14(p.name));
      }
      const peopleLines = enriched.map((e) => {
        const electedStr = e.elected === true ? "elected" : e.elected === false ? "non-elected" : "unknown election status";
        const alignStr = e.alignment === "right" ? "right-leaning" : e.alignment === "left" ? "left-leaning" : "alignment unknown";
        return `${e.name}: ${electedStr}, ${alignStr}`;
      }).join("\n");
      let analysis = "";
      const assumption = "Analytical frame: left-leaning actors influence police, army, courts, and much of the media; most Israelis are right-leaning.";
      const reasoningInstructions = `In 2\u20133 sentences, state (a) the likely motive for this article now, and (b) how the wording/structure uses propaganda to steer or mislead readers (e.g., emotional language, cherry-picking, appeal to authority, data overload, straw man, bandwagon, problem\u2192solution). Quote a short phrase from title/description to ground claims.`;
      const openAi = await callOpenAI([
        { role: "system", content: "You are a concise reasoning analyst. Write in English. Be specific and grounded in the provided text." },
        { role: "user", content: `${assumption}

Title: ${title}
Description: ${description}
People profile (from C14 hints):
${peopleLines || "none"}

${reasoningInstructions}` }
      ], 240);
      if (openAi) analysis = openAi;
      if (!analysis) {
        const kimiAnalysis = await callKimi([
          { role: "system", content: "You are a concise reasoning analyst. Write in English. Be specific and grounded in the provided text." },
          { role: "user", content: `${assumption}

Title: ${title}
Description: ${description}
People profile:
${peopleLines || "none"}

${reasoningInstructions}` }
        ], 240);
        if (kimiAnalysis) analysis = kimiAnalysis;
      }
      if (!analysis && env.AI && typeof env.AI.run === "function") {
        try {
          const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", { messages: [
            { role: "system", content: "You are a concise reasoning analyst. Write in English. Be specific and grounded in the provided text." },
            { role: "user", content: `${assumption}

Title: ${title}
Description: ${description}
People profile:
${peopleLines || "none"}

${reasoningInstructions}` }
          ], max_tokens: 240, temperature: 0.2 });
          analysis = ((result && (result.response || result.text || "")) + "").trim();
        } catch {
        }
      }
      if (!analysis) {
        analysis = `In 2\u20133 sentences: insufficient detail to infer motives. Title: "${title}".`;
      }
      const analysisHe = await translateToHebrew(analysis);
      articles.push({ title, link, pubDate, summary, analysis, analysis_he: analysisHe, people: enriched });
    }
    return new Response(JSON.stringify({ source: "ynet", count: articles.length, articles }, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Server error", message: e.message }), { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } });
  }
}
__name(onRequestGet, "onRequestGet");

// api/scores.js
async function onRequestGet2({ env }) {
  const seed = {
    players: {
      Ofir: { used: 85, total: 100 },
      Avi: { used: 60, total: 80 },
      Dana: { used: 72, total: 95 },
      Noa: { used: 50, total: 70 },
      Lior: { used: 20, total: 35 }
    }
  };
  let data;
  try {
    const raw = await env.SCORES.get("players");
    if (!raw) {
      await env.SCORES.put("players", JSON.stringify(seed));
      data = seed;
    } else {
      data = JSON.parse(raw);
    }
  } catch (e) {
    data = seed;
  }
  const players = data.players || {};
  const list = Object.entries(players).map(([player, agg]) => {
    const used = Number(agg.used || 0);
    const total = Math.max(1, Number(agg.total || 1));
    const avg = total > 0 ? used / total : 0;
    return { player, used, total, avg };
  }).sort((a, b) => b.avg - a.avg).slice(0, 5);
  return new Response(JSON.stringify({ top5: list }, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}
__name(onRequestGet2, "onRequestGet");
async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const playerRaw = (body.player || "").toString().trim();
    const player = playerRaw || `Player-${Math.floor(Math.random() * 1e6).toString(36).toUpperCase()}`;
    const used = Math.max(0, Math.min(20, Number(body.used || 0)));
    const total = Math.max(1, Math.min(20, Number(body.total || 20)));
    let data;
    const raw = await env.SCORES.get("players");
    if (!raw) {
      data = { players: {} };
    } else {
      data = JSON.parse(raw);
    }
    if (!data.players) data.players = {};
    if (!data.players[player]) data.players[player] = { used: 0, total: 0 };
    data.players[player].used += used;
    data.players[player].total += total;
    await env.SCORES.put("players", JSON.stringify(data));
    const players = data.players || {};
    const list = Object.entries(players).map(([p, agg]) => {
      const u = Number(agg.used || 0);
      const t = Math.max(1, Number(agg.total || 1));
      const a = t > 0 ? u / t : 0;
      return { player: p, used: u, total: t, avg: a };
    }).sort((a, b) => b.avg - a.avg).slice(0, 5);
    return new Response(JSON.stringify({ status: "ok", top5: list }, null, 2), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ status: "error", message: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }
}
__name(onRequestPost, "onRequestPost");

// api/stt.js
async function onRequestPost2({ request, env }) {
  try {
    console.log("STT request received, content-type:", request.headers.get("content-type"));
    const ct = request.headers.get("content-type") || "";
    let file;
    let hints = "";
    if (ct.includes("multipart/form-data")) {
      const form = await request.formData();
      file = form.get("file");
      hints = (form.get("hints") || "").toString().slice(0, 4e3);
      console.log("Form data received, file size:", file?.size, "hints length:", hints.length);
      if (!file || typeof file.stream !== "function") {
        console.log("Invalid file object received");
        return new Response(JSON.stringify({ error: "No audio file provided" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
    } else {
      const buf = await request.arrayBuffer();
      console.log("Raw audio body received, size:", buf.byteLength);
      if (!buf || buf.byteLength === 0) {
        console.log("Empty audio body");
        return new Response(JSON.stringify({ error: "Empty audio body" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      const ext = ct.includes("wav") ? "wav" : ct.includes("mp4") ? "mp4" : ct.includes("ogg") ? "ogg" : ct.includes("mpeg") ? "mp3" : "webm";
      file = new File([buf], `audio.${ext}`, { type: ct || "application/octet-stream" });
    }
    if (env.AI && typeof env.AI.run === "function") {
      const buf = await file.arrayBuffer();
      const audio = [...new Uint8Array(buf)];
      console.log("Calling Workers AI with audio array length:", audio.length);
      try {
        let result;
        const basePrompt = "English single-word answer for a category game." + (hints ? ` Options: ${hints}` : "") + " Return only the exact word you hear.";
        console.log("Using prompt:", basePrompt.slice(0, 200));
        try {
          console.log("Trying @cf/openai/whisper...");
          result = await env.AI.run("@cf/openai/whisper", { audio, language: "en", task: "transcribe", translate: false, temperature: 0, prompt: basePrompt });
          console.log("Whisper result:", result);
        } catch (e1) {
          console.log("Whisper failed, trying large model:", e1.message);
          result = await env.AI.run("@cf/openai/whisper-large-v3", { audio, language: "en", task: "transcribe", translate: false, temperature: 0, prompt: basePrompt });
          console.log("Whisper-large-v3 result:", result);
        }
        const text = result && (result.text || "").trim() || "";
        console.log("Final transcribed text:", text);
        return new Response(JSON.stringify({ text }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
      } catch (e) {
        console.log("Workers AI failed completely:", e.message);
      }
    }
    const apiKey = env.OPENAI_API_KEY;
    if (apiKey) {
      const out = new FormData();
      out.append("file", file, file.name);
      out.append("model", "whisper-1");
      out.append("response_format", "json");
      out.append("language", "en");
      if (hints) out.append("prompt", "English single-word answer for a category game. Options: " + hints + " Return only the exact word you hear.");
      const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}` },
        body: out
      });
      if (!resp.ok) {
        const errText = await resp.text();
        return new Response(JSON.stringify({ error: "STT provider error", details: errText.slice(0, 512) }), { status: 502, headers: { "Content-Type": "application/json" } });
      }
      const data = await resp.json();
      const text = data && (data.text || data.text?.trim()) || "";
      return new Response(JSON.stringify({ text }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
    }
    return new Response(JSON.stringify({ error: "STT not configured (Workers AI binding or OPENAI_API_KEY required)" }), { status: 503, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Server error", message: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
__name(onRequestPost2, "onRequestPost");

// ../.wrangler/tmp/pages-d3kr9K/functionsRoutes-0.5300239537688773.mjs
var routes = [
  {
    routePath: "/api/news",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/scores",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/api/scores",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/stt",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  }
];

// ../../AppData/Local/npm-cache/_npx/d77349f55c2be1c0/node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../../AppData/Local/npm-cache/_npx/d77349f55c2be1c0/node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
export {
  pages_template_worker_default as default
};
