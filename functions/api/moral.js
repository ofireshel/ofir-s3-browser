export async function onRequestPost({ request, env }) {
  try {
    const ct = (request.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('application/json')) {
      return new Response(JSON.stringify({ error: 'application/json required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const body = await request.json();
    const mode = (body.mode || 'start');
    const history = Array.isArray(body.history) ? body.history : [];
    const seed = (typeof body.seed === 'string') ? body.seed.slice(0,64) : '';
    const totalSteps = Math.min(10, Math.max(8, Number(body.totalSteps) || 9));
    const step = Number(body.step) || 1;

    const openaiKey = env.OPENAI_API_KEY;
    if (!openaiKey) {
      return new Response(JSON.stringify({ error: 'OpenAI not configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }

    const primaryModel = (env.MORAL_MODEL_ID || 'gpt-5-mini');
    const gpt5Candidates = [primaryModel, 'gpt-5o-mini', 'gpt-5.1-mini', 'gpt-5-mini'];
    const fallbackModel = 'gpt-4o-mini';

    const sys = `You are Moral Detective, a creative story engine. You write a short detective story that reveals subtle moral decisions.
Output STRICT JSON only, no prose, using the schema per mode.
House rules:
- Keep language concise and vivid. British or American English is fine.
- Each turn: continue the story in 2-4 sentences, and provide exactly two subtle moral choices that affect the tone, relationships, or ethics—not cartoonish good/evil.
- Detective thread: weave in clues, contradictions, and motives leading to a mystery to solve at the end.
- Choices must be grounded in the scene and be distinct but tempting; avoid obvious moral poles.
- Keep content suitable for all audiences.
`;

    const schemaStart = `{
  "mode": "start",
  "chunk": "<2-3 sentences to set the stage>",
  "choices": [ { "label": "A", "text": "<choice A>" }, { "label": "B", "text": "<choice B>" } ],
  "step": 1,
  "totalSteps": ${totalSteps},
  "finished": false
}`;

    const schemaStep = `{
  "mode": "step",
  "chunk": "<2-4 sentence continuation>",
  "choices": [ { "label": "A", "text": "<choice A>" }, { "label": "B", "text": "<choice B>" } ],
  "step": ${step},
  "totalSteps": ${totalSteps},
  "finished": ${step >= totalSteps ? 'true' : 'false'},
  "requireGuess": ${step >= totalSteps ? 'true' : 'false'}
}`;

    const schemaGuess = `{
  "mode": "guess_result",
  "resolution": "<concise answer to the mystery and key evidence>",
  "analysis": "<reflective analysis of the player's moral pattern (120-200 chars)>",
  "critiques": [ "<gentle critique 1>", "<gentle critique 2>" ],
  "recap": [ { "step": 1, "label": "A", "choice": "<short paraphrase>", "trait": "<1-3 words>", "insight": "<one sentence>" } ]
}`;

    let userContent = '';
    if (mode === 'start') {
      userContent = `SEED: ${seed}\nMODE: start\nReturn strict JSON per:\n${schemaStart}`;
    } else if (mode === 'step') {
      userContent = `SEED: ${seed}\nMODE: step\nTOTAL_STEPS: ${totalSteps}\nCURRENT_STEP: ${step}\nHISTORY JSON: ${JSON.stringify(history).slice(0, 4000)}\nReturn strict JSON per:\n${schemaStep}`;
    } else if (mode === 'guess') {
      const guess = (body.guess || '').toString().slice(0, 400);
      userContent = `SEED: ${seed}\nMODE: guess\nPLAYER_GUESS: ${guess}\nTOTAL_STEPS: ${totalSteps}\nHISTORY JSON: ${JSON.stringify(history).slice(0, 4000)}\nReturn strict JSON per:\n${schemaGuess}`;
    } else {
      return new Response(JSON.stringify({ error: 'Invalid mode' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    async function runModel(modelId){
      const p = {
        model: modelId,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: userContent }
        ],
        temperature: 0.9,
        response_format: { type: 'json_object' }
      };
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(p)
      });
      return r;
    }

    let jd;
    let usedModelId = '';
    let resp;
    // Try GPT-5 variants first
    for (const mid of gpt5Candidates) {
      try {
        resp = await runModel(mid);
        if (resp.ok) { usedModelId = mid; break; }
      } catch {}
    }
    if (!resp || !resp.ok) {
      // Fallback to 4o-mini
      resp = await runModel(fallbackModel);
      usedModelId = fallbackModel;
      if (!resp.ok) {
        const errText = await resp.text();
        return new Response(JSON.stringify({ error: 'OpenAI error', details: errText.slice(0, 1200) }), { status: resp.status || 502, headers: { 'Content-Type': 'application/json' } });
      }
    }
    jd = await resp.json();
    const text = (jd.choices?.[0]?.message?.content || '').trim();
    let obj = {};
    try { obj = JSON.parse(text); } catch {
      // minimal salvage: wrap into expected container
      if (mode === 'start') obj = { mode: 'start', chunk: text.slice(0, 500), choices: [{label:'A',text:'Proceed politely'},{label:'B',text:'Probe quietly'}], step:1, totalSteps, finished:false };
      else if (mode === 'step') obj = { mode: 'step', chunk: text.slice(0, 600), choices: [{label:'A',text:'Choose path A'},{label:'B',text:'Choose path B'}], step, totalSteps, finished: step>=totalSteps, requireGuess: step>=totalSteps };
      else obj = { mode: 'guess_result', resolution: text.slice(0, 600), analysis: 'Thoughtful, balanced decision-making.', critiques: ['Consider the tradeoff you favored most','Notice where empathy was de-emphasized'], recap: [] };
    }
    // attach which model was used for this response
    try {
      if (obj && typeof obj === 'object') {
        obj.modelUsed = usedModelId;
      }
    } catch {}

    return new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Server error', message: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}


