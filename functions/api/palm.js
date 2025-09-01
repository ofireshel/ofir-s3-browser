// Palm analysis via GPT-4 vision: returns 3 positives and 3 negatives
export async function onRequestPost({ request, env }) {
  try {
    const ct = request.headers.get('content-type') || '';
    if (!ct.includes('multipart/form-data')) {
      return new Response(JSON.stringify({ error: 'multipart/form-data required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const form = await request.formData();
    const image = form.get('image');
    if (!image || typeof image.stream !== 'function') {
      return new Response(JSON.stringify({ error: 'image field missing' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const openaiKey = env.OPENAI_API_KEY;
    if (!openaiKey) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }

    const imgBuf = await image.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(imgBuf)));

    const prompt = `You are a playful palmistry assistant. Analyze the palm lines in this photo and output exactly two arrays: "positives" (3 short, uplifting one-liners) and "negatives" (3 short, constructive cautions). Keep each item under 90 characters. Avoid medical or legal claims.`;

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
      temperature: 0.7
    };

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const errText = await resp.text();
      return new Response(JSON.stringify({ error: 'OpenAI error', details: errText.slice(0, 400) }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }
    const data = await resp.json();
    const text = (data.choices?.[0]?.message?.content || '').trim();
    let positives = [], negatives = [];
    try {
      // Attempt to parse JSON-like output if model complied
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const obj = JSON.parse(match[0]);
        positives = Array.isArray(obj.positives) ? obj.positives.slice(0,3) : positives;
        negatives = Array.isArray(obj.negatives) ? obj.negatives.slice(0,3) : negatives;
      }
    } catch {}
    if (positives.length === 0 || negatives.length === 0) {
      // Fallback: split lines heuristically
      const lines = text.split(/\n+/).map(s=>s.replace(/^[-+*•\s]+/,'').trim()).filter(Boolean);
      positives = lines.slice(0,3);
      negatives = lines.slice(3,6);
    }
    return new Response(JSON.stringify({ positives, negatives }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Server error', message: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}


