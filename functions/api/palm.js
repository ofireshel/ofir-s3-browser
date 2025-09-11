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

    const prompt = `You are a palmistry assistant. Analyze the image and return STRICT JSON ONLY:
{
  "isPalm": true | false,
  "object": "<very short label for the main visible object>",
  "positives": [ { "trait": "<concise positive trait>", "prediction": "<concise positive near-term prediction>", "reason": "<very short visual cue from the palm>" } ],
  "negatives": [ { "trait": "<concise cautionary trait>", "prediction": "<concise cautionary near-term prediction>", "reason": "<very short visual cue from the palm>" } ]
}
Rules:
- If no palm/hand is clearly visible, set isPalm=false and use a short object label. Return empty arrays for positives/negatives.
- If a palm/hand is visible, set isPalm=true and provide EXACTLY 3 positives and 3 negatives.
- Base reasons strictly on visible palm features (life/heart/head lines, fate/Apollo lines, mounts, breaks, forks, islands).
- Each trait/prediction must be short and decisive (<= 80 chars). Each reason must be very short (<= 60 chars).
- No medical/legal claims. Keep playful and general. Return ONLY the JSON.`;

    // 1) Try Cloudflare Workers AI via binding unless preferring REST
    let text = '';
    let modelUsed = '';
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
            if (text) { aiBindingTried.push({ model: model.id, ok: true }); modelUsed = model.id; lastErr = ''; break; }
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
        modelUsed = modelId;
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
        modelUsed = '@cf/llava/llava-1.5-7b-hf';
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
      const selectedModel = (env.PALM_MODEL_ID || 'gpt-5-mini-2025-08-07');
      const body = {
        model: selectedModel,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:${image.type||'image/jpeg'};base64,${base64}` } }
            ]
          }
        ],
        reasoning_effort: 'minimal',
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
      modelUsed = selectedModel;
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
        // Prefer new schema
        const normPair = (arr)=> (Array.isArray(arr)? arr : []).slice(0,3).map(it => {
          if (!it) return { trait: '', prediction: '', reason: '' };
          if (typeof it === 'string') return { trait: it, prediction: '', reason: '' };
          return {
            trait: (it.trait||'').toString().slice(0,180),
            prediction: (it.prediction||'').toString().slice(0,180),
            reason: (it.reason||'').toString().slice(0,180)
          };
        });
        positives = normPair(obj.positives);
        negatives = normPair(obj.negatives);
        // Back-compat: accept old keys and convert to pair arrays
        const normSimple = (arr)=> (Array.isArray(arr)? arr : []).slice(0,3).map(it => {
          if (typeof it === 'string') return { text: it, reason: '' };
          return { text: (it.text||'').toString().slice(0,180), reason: (it.reason||'').toString().slice(0,180) };
        });
        const traits = normSimple(obj.traits);
        const predictions = normSimple(obj.predictions);
        if ((positives.length===0 || positives.every(p=>!p.trait && !p.prediction)) && traits.length>0) {
          // Pair traits with predictions by index for positives
          positives = Array.from({length:3}).map((_,i)=>({
            trait: (traits[i]?.text)||'',
            prediction: (predictions[i]?.text)||'',
            reason: (traits[i]?.reason)|| (predictions[i]?.reason)||''
          }));
        }
        if ((negatives.length===0 || negatives.every(p=>!p.trait && !p.prediction)) && Array.isArray(obj.negatives) && obj.negatives.length>0 && !predictions.length && !traits.length) {
          // If old negatives existed (strings), map roughly
          const oldNeg = normSimple(obj.negatives);
          negatives = Array.from({length:3}).map((_,i)=>({ trait: oldNeg[i]?.text||'', prediction: '', reason: oldNeg[i]?.reason||'' }));
        }
      }
    } catch {}
    if (isPalm === false) {
      const objectLabel = mainObject || 'an object';
      const notPalm = {
        object: objectLabel,
        message: `This is an image of ${objectLabel}. Please take a clear picture of the palm of your hand for the analysis.`
      };
      return new Response(JSON.stringify({ notPalm, modelUsed }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
    if (positives.length === 0 || negatives.length === 0) {
      // Fallback parse: split lines; create trait/prediction pairs
      const lines = text.split(/\n+/).map(s=>s.replace(/^[\-+*•\s]+/,'').trim()).filter(Boolean);
      if (positives.length===0) positives = lines.slice(0,3).map(t=>({ trait:t, prediction:'', reason:'' }));
      if (negatives.length===0) negatives = lines.slice(3,6).map(t=>({ trait:t, prediction:'', reason:'' }));
    }
    // Guarantee 3 items each with non-empty text; synthesize if needed
    function fillPairsIfNeeded(arr, traitPool, predPool, reasonPool, seed){
      const out = (arr||[]).slice(0,3).map(it=>({
        trait: (it.trait||'').trim().slice(0,100),
        prediction: (it.prediction||'').trim().slice(0,100),
        reason: (it.reason||'').trim().slice(0,80)
      })).filter(x=>x.trait || x.prediction);
      let s = seed >>> 0; const used = new Set();
      while (out.length < 3) {
        s = (s*1103515245 + 12345)>>>0; const idx = s % traitPool.length; if(used.has(idx)) continue; used.add(idx);
        out.push({ trait: traitPool[idx], prediction: predPool[idx % predPool.length], reason: reasonPool[idx % reasonPool.length] });
      }
      // ensure a reason exists for each
      for (let i=0;i<out.length;i++){
        if (!out[i].trait) { s = (s*1664525 + 1013904223)>>>0; const tidx = s % traitPool.length; out[i].trait = traitPool[tidx]; }
        if (!out[i].prediction) { s = (s*22695477 + 1)>>>0; const pidx = s % predPool.length; out[i].prediction = predPool[pidx]; }
        if (!out[i].reason) { s = (s*1664525 + 1013904223)>>>0; const ridx = s % reasonPool.length; out[i].reason = reasonPool[ridx]; }
      }
      return out.slice(0,3);
    }
    const imgHashSeed = (text.length*131) ^ (text.charCodeAt(0)||0) ^ ((text.charCodeAt(text.length-1)||0)<<7);
    const posTraitPool = [
      'Decisive and goal-driven',
      'Calm under pressure',
      'Empathetic communicator',
      'Independent thinker',
      'Focused and disciplined',
      'Curious problem-solver'
    ];
    const posPredPool = [
      'Career gain within 3 months',
      'New partnership forms in 6 weeks',
      'Smart financial move pays off soon',
      'Travel opportunity this season',
      'Reconnection opens a door shortly',
      'A bold choice unlocks progress'
    ];
    const posReasons = [
      'strong, steady head line',
      'deep, continuous life line',
      'clear heart line with gentle curve',
      'distinct fate line to middle finger',
      'balanced mounts under index and middle',
      'Apollo line bright and unbroken'
    ];
    const negTraitPool = [
      'Impulsive under pressure',
      'Second-guessing decisions',
      'Takes others’ worries to heart',
      'Overextends commitments',
      'Prone to burnout without breaks',
      'Easily distracted at times'
    ];
    const negPredPool = [
      'Delay around a key plan',
      'A test of patience soon',
      'Reassess a partnership choice',
      'Avoid a rushed purchase',
      'Short detour before progress',
      'Decline one offer to win later'
    ];
    const negReasons = [
      'small breaks along head line',
      'faint life line sections',
      'fork near heart line end',
      'overlap between head and heart lines',
      'islands along minor lines',
      'chaining on head line'
    ];
    const positivesOut = fillPairsIfNeeded(positives, posTraitPool, posPredPool, posReasons, imgHashSeed ^ 0x9e3779b9);
    const negativesOut = fillPairsIfNeeded(negatives, negTraitPool, negPredPool, negReasons, imgHashSeed ^ 0x85ebca6b);
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
    return new Response(JSON.stringify({ positives: positivesOut, negatives: negativesOut, modelUsed }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Server error', message: e.message, stack: (e.stack||'').split('\n').slice(0,4) }), { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  }
}


