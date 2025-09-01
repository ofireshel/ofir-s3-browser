// Palm analysis via GPT-4 vision: returns 3 positives and 3 negatives
export async function onRequestPost({ request, env }) {
  try {
    const ct = (request.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('multipart/form-data')) {
      return new Response(JSON.stringify({ error: 'multipart/form-data required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const form = await request.formData();
    const image = form.get('image');
    if (!image || typeof image.stream !== 'function') {
      return new Response(JSON.stringify({ error: 'image field missing' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const prompt = `You are a playful palmistry assistant. Analyze the image and return STRICT JSON ONLY with this schema:
{
  "isPalm": true | false,
  "object": "<very short label for the main visible object>",
  "positives": [ { "text": "<short positive>", "reason": "<very short visual reason from the palm>" } ],
  "negatives": [ { "text": "<short caution>", "reason": "<very short visual reason from the palm>" } ]
}
Rules:
- If no palm/hand is clearly visible, set isPalm=false and leave positives and negatives as empty arrays.
- If a palm/hand is clearly visible, set isPalm=true and provide exactly 3 positives and 3 negatives with reasons based on palm features (life/heart/head lines, mounts, breaks, forks). Keep each under 120 characters.
- No medical/legal claims; keep playful and general.
- Return ONLY the JSON object, nothing else.`;

    // 1) Try Cloudflare Workers AI via binding unless preferring REST
    let text = '';
    let aiBindingPresent = false;
    let aiBindingError = '';
    const preferRest = (env.PREFER_REST === 'true');
    const aiBindingTried = [];
    try {
      if (!preferRest && env.AI && typeof env.AI.run === 'function') {
        aiBindingPresent = true;
        const buf = new Uint8Array(await image.arrayBuffer());
        const preferredId = (env.VISION_MODEL_ID || '').trim();
        const candidates = [
          ...(preferredId ? [{ id: preferredId, kind: preferredId.includes('llava') ? 'llava' : 'chat' }] : []),
          { id: '@cf/llama/llama-3.2-11b-vision-instruct', kind: 'chat' },
          { id: '@cf/meta/llama-3.2-11b-vision-instruct', kind: 'chat' },
          { id: '@cf/microsoft/phi-3.5-vision-instruct', kind: 'chat' },
          { id: '@cf/llava/llava-1.5-7b-hf', kind: 'llava' }
        ];
        let lastErr = '';
        for (const model of candidates) {
          try {
            let visionResult;
            if (model.kind === 'chat') {
              visionResult = await env.AI.run(model.id, {
                messages: [
                  { role: 'user', content: [ { type: 'input_text', text: prompt }, { type: 'input_image', image: buf } ] }
                ]
              });
            } else {
              visionResult = await env.AI.run(model.id, { prompt, image: buf });
            }
            text = (visionResult && (visionResult.response || visionResult.output_text || visionResult.text || '')) + '';
            if (text) { aiBindingTried.push({ model: model.id, ok: true }); lastErr = ''; break; }
          } catch (e1) {
            lastErr = (e1 && e1.message) ? e1.message : (e1+'');
            aiBindingTried.push({ model: model.id, ok: false, error: lastErr });
            continue;
          }
        }
        if (!text && lastErr) aiBindingError = lastErr;
      }
    } catch (e) {
      aiBindingError = (e && e.message) ? e.message : (e+'');
    }

    // 1b) If no binding, try Workers AI REST with CF credentials if provided
    if (!text && env.CF_ACCOUNT_ID && env.CF_API_TOKEN) {
      const imgBuf2 = await image.arrayBuffer();
      function abToBase64(ab) {
        const bytes = new Uint8Array(ab);
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          const sub = bytes.subarray(i, i + chunk);
          binary += String.fromCharCode.apply(null, sub);
        }
        return btoa(binary);
      }
      const b64 = abToBase64(imgBuf2);
      async function runCfChatModel(modelId){
        const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/run/${modelId}`;
        const body = {
          messages:[{ role:'user', content:[ { type:'input_text', text: prompt }, { type:'input_image', image: b64 } ] }]
        };
        const r = await fetch(url, {
          method:'POST',
          headers:{ 'Authorization': `Bearer ${env.CF_API_TOKEN}`, 'Content-Type':'application/json', 'Accept':'application/json' },
          body: JSON.stringify(body)
        });
        if (!r.ok) throw new Error(await r.text());
        const jd = await r.json();
        const result = jd.result || jd;
        return (result.response || result.output_text || result.text || '').toString();
      }
      async function runCfLlava(){
        const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/run/@cf/llava/llava-1.5-7b-hf`;
        const body = { prompt, image: b64 };
        const r = await fetch(url, {
          method:'POST',
          headers:{ 'Authorization': `Bearer ${env.CF_API_TOKEN}`, 'Content-Type':'application/json', 'Accept':'application/json' },
          body: JSON.stringify(body)
        });
        if (!r.ok) throw new Error(await r.text());
        const jd = await r.json();
        const result = jd.result || jd;
        return (result.response || result.output_text || result.text || '').toString();
      }
      const preferredId = (env.VISION_MODEL_ID || '').trim();
      const restCandidates = [
        ...(preferredId ? [{ id: preferredId, kind: preferredId.includes('llava') ? 'llava' : 'chat' }] : []),
        { id: '@cf/meta/llama-3.2-11b-vision-instruct', kind: 'chat' },
        { id: '@cf/llama/llama-3.2-11b-vision-instruct', kind: 'chat' },
        { id: '@cf/microsoft/phi-3.5-vision-instruct', kind: 'chat' },
        { id: '@cf/llava/llava-1.5-7b-hf', kind: 'llava' }
      ];
      for (const model of restCandidates) {
        try {
          if (model.kind === 'chat') {
            text = await runCfChatModel(model.id);
          } else {
            text = await runCfLlava();
          }
          if (text) break;
        } catch (_) { continue; }
      }
    }

    // 2) Fallback: OpenAI if explicitly allowed
    const allowOpenAI = (env.USE_OPENAI === 'true');
    if (!text && allowOpenAI) {
      const openaiKey = env.OPENAI_API_KEY;
      if (!openaiKey) {
        return new Response(JSON.stringify({ error: 'No vision model configured (enable Workers AI or set OPENAI_API_KEY)' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
      }
      const imgBuf = await image.arrayBuffer();
      // Convert ArrayBuffer to base64 in chunks to avoid call stack / argument limits
      function abToBase64(ab) {
        const bytes = new Uint8Array(ab);
        let binary = '';
        const chunk = 0x8000; // 32KB
        for (let i = 0; i < bytes.length; i += chunk) {
          const sub = bytes.subarray(i, i + chunk);
          binary += String.fromCharCode.apply(null, sub);
        }
        return btoa(binary);
      }
      const base64 = abToBase64(imgBuf);
      const body = {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:${image.type||'image/jpeg'};base64,${base64}` } }
            ]
          }
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' }
      };
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json', 'Accept':'application/json' },
        body: JSON.stringify(body)
      });
      if (!resp.ok) {
        const errText = await resp.text();
        return new Response(JSON.stringify({ error: 'OpenAI error', details: errText.slice(0, 1000) }), { status: resp.status||502, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
      }
      const data = await resp.json();
      text = (data.choices?.[0]?.message?.content || '').trim();
    }
    let positives = [], negatives = [];
    let isPalm = undefined;
    let mainObject = '';
    try {
      // Attempt to parse strict JSON
      let raw = '';
      let match = text.match(/\{[\s\S]*\}$/);
      if (!match) {
        const i0 = text.indexOf('{');
        const i1 = text.lastIndexOf('}');
        if (i0 !== -1 && i1 !== -1 && i1 > i0) raw = text.slice(i0, i1+1);
      } else { raw = match[0]; }
      if (raw) {
        const obj = JSON.parse(raw);
        if (typeof obj.isPalm === 'boolean') isPalm = obj.isPalm;
        if (typeof obj.object === 'string') mainObject = obj.object.slice(0, 120);
        const norm = (arr)=> (Array.isArray(arr)? arr : []).slice(0,3).map(it => {
          if (typeof it === 'string') return { text: it, reason: '' };
          return { text: (it.text||'').toString().slice(0,180), reason: (it.reason||'').toString().slice(0,180) };
        });
        positives = norm(obj.positives);
        negatives = norm(obj.negatives);
      }
    } catch {}
    if (isPalm === false) {
      const objectLabel = mainObject || 'an object';
      const notPalm = {
        object: objectLabel,
        message: `This is an image of ${objectLabel}. Please take a clear picture of the palm of your hand for the analysis.`
      };
      return new Response(JSON.stringify({ notPalm }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
    if (positives.length === 0 || negatives.length === 0) {
      // Fallback parse: split lines, pair as text with blank reason
      const lines = text.split(/\n+/).map(s=>s.replace(/^[-+*•\s]+/,'').trim()).filter(Boolean);
      positives = lines.slice(0,3).map(t=>({ text:t, reason:'' }));
      negatives = lines.slice(3,6).map(t=>({ text:t, reason:'' }));
    }
    // Guarantee 3 items each with non-empty text; synthesize if needed
    function fillIfNeeded(arr, pool, reasonPool, seed){
      const out = (arr||[]).filter(it => (it.text||'').trim()).slice(0,3).map(it=>({ text: it.text.trim().slice(0,180), reason: (it.reason||'').trim().slice(0,180) }));
      let s = seed >>> 0; const used = new Set();
      while (out.length < 3) {
        s = (s*1103515245 + 12345)>>>0; const idx = s % pool.length; if(used.has(idx)) continue; used.add(idx);
        out.push({ text: pool[idx], reason: reasonPool[idx % reasonPool.length] });
      }
      // ensure a reason exists for each
      for (let i=0;i<out.length;i++){
        if (!out[i].reason) { s = (s*1664525 + 1013904223)>>>0; const ridx = s % reasonPool.length; out[i].reason = reasonPool[ridx]; }
      }
      return out.slice(0,3);
    }
    const imgHashSeed = (text.length*131) ^ (text.charCodeAt(0)||0) ^ ((text.charCodeAt(text.length-1)||0)<<7);
    const posPool = [
      'Creative streak brings new opportunities',
      'Strong intuition guides wise choices',
      'Reliable friend, loyal and caring',
      'Quick learner with adaptable mind',
      'Natural problem-solver under stress',
      'Optimistic outlook attracts support'
    ];
    const posReasons = [
      'clear, unbroken heart line',
      'deep life line curvature',
      'balanced head line length',
      'distinct Apollo line near ring finger',
      'well-defined mounts under fingers'
    ];
    const negPool = [
      'Tendency to overcommit your time',
      'Impatience may cloud judgment',
      'Avoid taking others’ worries personally',
      'Watch for burnout—pace yourself',
      'Guard against second-guessing decisions',
      'Distractions can dilute your focus'
    ];
    const negReasons = [
      'small breaks along head line',
      'faint life line sections',
      'fork near heart line end',
      'overlap between head and heart lines',
      'islands along minor lines'
    ];
    positives = fillIfNeeded(positives, posPool, posReasons, imgHashSeed ^ 0x9e3779b9);
    negatives = fillIfNeeded(negatives, negPool, negReasons, imgHashSeed ^ 0x85ebca6b);
    if (!text && !allowOpenAI) {
      // Workers AI not available and OpenAI fallback disabled: include diagnostics
      const hasRestCreds = !!(env.CF_ACCOUNT_ID && env.CF_API_TOKEN);
      return new Response(JSON.stringify({
        error: 'Workers AI not configured',
        message: 'Bind AI in wrangler.toml or set CF_ACCOUNT_ID/CF_API_TOKEN for REST',
        diagnostics: {
          aiBindingPresent,
          aiBindingError,
          hasRestCreds,
          bindingType: typeof env.AI,
          aiBindingTried
        }
      }), { status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
    }
    return new Response(JSON.stringify({ positives, negatives }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Server error', message: e.message, stack: (e.stack||'').split('\n').slice(0,4) }), { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  }
}


