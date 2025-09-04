export async function onRequestPost({ request, env }) {
  try {
    const ct = (request.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('application/json')) {
      return new Response(JSON.stringify({ error: 'application/json required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const body = await request.json();
    const mode = (body.mode || 'generate').toString();

    const openaiKey = env.OPENAI_API_KEY;
    if (!openaiKey) {
      return new Response(JSON.stringify({ error: 'OpenAI not configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }

    const MODEL_ID = 'gpt-5-mini-2025-08-07';

    async function runModel(modelId, messages, json = true, temperature = 0.8){
      const p = { model: modelId, messages, temperature };
      if (json) p.response_format = { type: 'json_object' };
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(p)
      });
      return r;
    }

    if (mode === 'generate') {
      function pick(arr){ return arr[(Math.random()*arr.length)|0]; }
      const themes = ['ocean', 'space', 'forest', 'desert', 'mountain', 'city night', 'festival', 'storm', 'harvest', 'invention', 'journey', 'dream', 'market', 'island', 'glacier', 'volcano'];
      const moods = ['hopeful', 'melancholic', 'playful', 'urgent', 'mysterious', 'celebratory', 'tranquil', 'defiant', 'wistful', 'electric'];
      const devices = ['metaphor', 'contrast', 'cause-and-effect', 'before-and-after', 'quest', 'transformation', 'reunion', 'ritual', 'migration'];
      const elements = ['weather', 'time', 'animal', 'tool', 'music', 'food', 'sport', 'travel', 'community', 'work', 'flag', 'sign', 'vehicle', 'star', 'fire', 'water'];
      const countries = ['Japan', 'Kenya', 'Brazil', 'Iceland', 'India', 'France', 'Mexico', 'Egypt', 'Canada', 'Italy'];
      const animals = ['fox', 'whale', 'owl', 'crab', 'butterfly', 'camel', 'tiger', 'panda', 'dolphin', 'eagle'];
      const symbols = ['key', 'hourglass', 'compass', 'anchor', 'mask', 'bridge', 'lantern', 'crown', 'map', 'coin'];
      const brief = `Theme: ${pick(themes)} | Mood: ${pick(moods)} | Device: ${pick(devices)} | Include: ${pick(elements)}, ${pick(elements)} | Touch: ${pick(countries)}, ${pick(animals)}, ${pick(symbols)}`;
      const sys = `You are an expert game prompt writer. Your job is to craft a single short sentence (with real words only) that can be expressed by EXACTLY 5 emojis with high fidelity.
Rules:
- Sentence MUST use ordinary words, punctuation, and spaces ONLY. Do NOT include any emojis or pictographs.
- The sentence should be highly creative and evocative, potentially combining multiple domains (e.g., nature + technology + feelings), or using metaphor/contrast/sequence to require thoughtful emoji selection.
- Encourage use of abstract and concrete ideas that are still representable by common emoji (time, change, growth, celebration, danger, weather, travel, tools, animals, food, music, sport, work, love, community, vehicles, celestial bodies, symbols, flags).
- Aim for vivid and concise phrasing, roughly 2 words shorter than your first instinct (brief and punchy), and under 110 characters.
- You MAY include common country names or iconic places; avoid specific people's names and dates.
- Prefer universal concepts that can be mapped via 5 emojis.
- Keep content suitable for all audiences.
Output STRICT JSON: { "sentence": "..." }`;

      const user = `Create one sentence now. Avoid dull tropes like "cat chases mouse". Every emoji category is fair game if it fits. Creative brief -> ${brief}`;

      let resp, usedModelId = MODEL_ID;
      try {
        resp = await runModel(MODEL_ID, [ { role:'system', content: sys }, { role:'user', content: user } ], true, 1.2);
      } catch {}
      if (!resp || !resp.ok) {
        const errText = resp ? await resp.text() : 'No response';
        return new Response(
          JSON.stringify({ error: 'OpenAI error', details: (errText || '').slice(0, 1000) }),
          { status: (resp && resp.status) || 502, headers: { 'Content-Type': 'application/json' } }
        );
      }
      const jd = await resp.json();
      const text = (jd.choices?.[0]?.message?.content || '').trim();
      let obj = {};
      try { obj = JSON.parse(text); } catch { obj = { sentence: text.slice(0, 160) }; }
      if (!obj || typeof obj !== 'object' || typeof obj.sentence !== 'string' || obj.sentence.length < 3) {
        obj = { sentence: 'A happy family picnics as rain starts and a rainbow appears.' };
      }
      try { obj.sentence = (obj.sentence || '').replace(/\p{Extended_Pictographic}/gu, '').trim(); } catch {}
      obj.modelUsed = usedModelId;
      return new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
    }

    if (mode === 'grade') {
      const sentence = ((body.sentence || '').toString()).slice(0, 300);
      const timeSec = Math.max(0, Math.min(600, Number(body.timeSec || 0)));
      let emojis = [];
      if (Array.isArray(body.emojis)) emojis = body.emojis.map(e => (e || '').toString()).filter(Boolean);
      else if (typeof body.emojis === 'string') {
        emojis = body.emojis.toString().trim().slice(0, 40).split(/\s+/);
      }
      emojis = emojis.slice(0, 5);
      if (emojis.length !== 5 || !sentence) {
        return new Response(JSON.stringify({ error: 'Provide sentence and exactly 5 emojis' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }

      const sys = `You are "Emoji Judge", an impartial grader.
Given a natural-language sentence and a candidate set of exactly 5 emojis, grade how well the emojis capture the meaning, actions, entities, and mood.
Scoring guidelines (0-100):
- 90–100: Nearly perfect mapping; each emoji corresponds to a key element; clear and unambiguous.
- 70–89: Strong mapping with minor mismatches or omissions.
- 40–69: Mixed; several mismatches or missing core ideas.
- 10–39: Poor mapping; emojis mostly unrelated.
- 0–9: Nonsense or inappropriate.
Be concise and fair. Prefer universal interpretations.
Also set nonsense=true if NONE of the 5 emojis meaningfully correspond to any key element, action, entity, or the overall mood of the sentence (i.e., no real matches at all). Use false when at least one emoji clearly maps to a main idea.
Output STRICT JSON: { "score": 0-100, "rationale": "short reason (<=140 chars)", "suggested": ["emoji","emoji","emoji","emoji","emoji"], "nonsense": true|false }`;

      const user = `SENTENCE: ${sentence}\nEMOJIS: ${emojis.join(' ')}\nReturn strict JSON.`;

      let resp, usedModelId = MODEL_ID;
      try {
        resp = await runModel(MODEL_ID, [ { role:'system', content: sys }, { role:'user', content: user } ], true, 0.4);
      } catch {}
      if (!resp || !resp.ok) {
        const errText = resp ? await resp.text() : 'No response';
        return new Response(
          JSON.stringify({ error: 'OpenAI error', details: (errText || '').slice(0, 1000) }),
          { status: (resp && resp.status) || 502, headers: { 'Content-Type': 'application/json' } }
        );
      }
      const jd = await resp.json();
      const text = (jd.choices?.[0]?.message?.content || '').trim();
      let obj = {};
      try { obj = JSON.parse(text); } catch { obj = { score: 50, rationale: 'Baseline score; parsing failed', suggested: [], nonsense: false }; }
      let score = Math.max(0, Math.min(100, Number(obj.score || 0)));
      const nonsense = !!obj.nonsense;
      // Hard rule: if emojis don't match at all, force 0 regardless of speed
      if (nonsense) {
        score = 0;
      } else {
        // Time-aware penalty for extremely fast very-poor answers
        try { if (timeSec <= 2.5 && score <= 15) { score = 0; } } catch {}
      }
      const out = {
        score,
        rationale: (obj.rationale || '').toString().slice(0, 200),
        suggested: Array.isArray(obj.suggested) ? obj.suggested.slice(0,5).map(s=> (s||'').toString()) : [],
        modelUsed: usedModelId
      };
      return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
    }

    return new Response(JSON.stringify({ error: 'Invalid mode' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Server error', message: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}



