// Server STT endpoint (beta): prefers Cloudflare Workers AI, falls back to OpenAI if configured
export async function onRequestPost({ request, env }) {
  try {
    console.log('STT request received, content-type:', request.headers.get('content-type'));
    const ct = request.headers.get('content-type') || '';
    let file;
    let hints = '';
    if (ct.includes('multipart/form-data')) {
      const form = await request.formData();
      file = form.get('file');
      hints = (form.get('hints') || '').toString().slice(0, 4000);
      console.log('Form data received, file size:', file?.size, 'hints length:', hints.length);
      if (!file || typeof file.stream !== 'function') {
        console.log('Invalid file object received');
        return new Response(JSON.stringify({ error: 'No audio file provided' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
    } else {
      // Accept raw body as audio
      const buf = await request.arrayBuffer();
      console.log('Raw audio body received, size:', buf.byteLength);
      if (!buf || buf.byteLength === 0) {
        console.log('Empty audio body');
        return new Response(JSON.stringify({ error: 'Empty audio body' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      const ext = ct.includes('wav') ? 'wav' : ct.includes('mp4') ? 'mp4' : ct.includes('ogg') ? 'ogg' : ct.includes('mpeg') ? 'mp3' : 'webm';
      file = new File([buf], `audio.${ext}`, { type: ct || 'application/octet-stream' });
    }

    // 1) Try Workers AI (@cf/openai/whisper)
    if (env.AI && typeof env.AI.run === 'function') {
      const buf = await file.arrayBuffer();
      const audio = [...new Uint8Array(buf)];
      console.log('Calling Workers AI with audio array length:', audio.length);
      try {
        // Try both local model ids that Cloudflare commonly exposes
        let result;
        const basePrompt = 'English single-word answer for a category game.' + (hints ? ` Options: ${hints}` : '') + ' Return only the exact word you hear.';
        console.log('Using prompt:', basePrompt.slice(0, 200));
        try {
          console.log('Trying @cf/openai/whisper...');
          result = await env.AI.run('@cf/openai/whisper', { audio, language: 'en', task: 'transcribe', translate: false, temperature: 0, prompt: basePrompt });
          console.log('Whisper result:', result);
        } catch (e1) {
          console.log('Whisper failed, trying large model:', e1.message);
          result = await env.AI.run('@cf/openai/whisper-large-v3', { audio, language: 'en', task: 'transcribe', translate: false, temperature: 0, prompt: basePrompt });
          console.log('Whisper-large-v3 result:', result);
        }
        const text = (result && (result.text || '').trim()) || '';
        console.log('Final transcribed text:', text);
        return new Response(JSON.stringify({ text }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      } catch (e) {
        console.log('Workers AI failed completely:', e.message);
        // fall through to OpenAI if configured
      }
    }

    // 2) Fallback: OpenAI Whisper if key is provided
    const apiKey = env.OPENAI_API_KEY;
    if (apiKey) {
      const out = new FormData();
      out.append('file', file, file.name);
      out.append('model', 'whisper-1');
      out.append('response_format', 'json');
      out.append('language', 'en');
      if (hints) out.append('prompt', 'English single-word answer for a category game. Options: ' + hints + ' Return only the exact word you hear.');
      const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: out,
      });
      if (!resp.ok) {
        const errText = await resp.text();
        return new Response(JSON.stringify({ error: 'STT provider error', details: errText.slice(0, 512) }), { status: 502, headers: { 'Content-Type': 'application/json' } });
      }
      const data = await resp.json();
      const text = (data && (data.text || data.text?.trim())) || '';
      return new Response(JSON.stringify({ text }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }

    return new Response(JSON.stringify({ error: 'STT not configured (Workers AI binding or OPENAI_API_KEY required)' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Server error', message: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}


