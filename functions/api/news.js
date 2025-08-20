export async function onRequestGet({ request, env }) {
  try {
    const rssUrl = 'https://www.ynet.co.il/Integration/StoryRss2.xml';
    const rssResp = await fetch(rssUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OfirNewsBot/1.0)' } });
    if (!rssResp.ok) {
      return new Response(JSON.stringify({ error: 'Failed to fetch RSS', status: rssResp.status }), { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
    }
    const xml = await rssResp.text();

    const decode = (str) => (str || '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .trim();

    const allItemBlocks = [...xml.matchAll(/<item>[\s\S]*?<\/item>/g)].map(m => m[0]);

    const parsed = allItemBlocks.map(block => {
      const get = (tag) => {
        const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\/${tag}>`, 'i'));
        return decode(m ? m[1].replace(/<!\[CDATA\[|]]>/g, '') : '');
      };
      const categories = [...block.matchAll(/<category>([\s\S]*?)<\/category>/gi)].map(m => decode(m[1]));
      return {
        block,
        title: get('title'),
        link: get('link'),
        description: get('description').replace(/<[^>]+>/g, '').trim(),
        pubDate: get('pubDate'),
        categories
      };
    });

    const isHebrew = (s) => /[\u0590-\u05FF]/.test(s || '');
    const hasAny = (s, arr) => arr.some(k => (s || '').includes(k));
    const includeKw = ['ישראל','כנסת','ממשלה','בג"ץ','צה"ל','משטרה','ירושלים','תל אביב','חיפה','באר שבע','גליל','נגב','עוטף עזה','יהודה ושומרון','קיבוץ','מושב','עיריית','מחוז','שר','ראש הממשלה','שב"כ'];
    const excludeKw = ['בעולם','חדשות בעולם','world','חוץ'];

    const internal = parsed.filter(it => {
      const text = `${it.title} ${it.description} ${it.categories.join(' ')}`;
      const heb = isHebrew(it.title) || isHebrew(it.description);
      const hasInclude = hasAny(text, includeKw) || it.categories.some(c => /חדשות|פוליטי|ביטחון|מקומי/.test(c));
      const hasExclude = hasAny(text, excludeKw);
      return heb && hasInclude && !hasExclude;
    });

    const fallbackHeb = parsed.filter(it => (isHebrew(it.title) || isHebrew(it.description)) && !internal.includes(it));
    const selected = internal.concat(fallbackHeb).slice(0, 4);

    async function callKimi(messages, maxTokens) {
      const url = (env.KIMI_API_URL || '').trim();
      const key = (env.KIMI_API_KEY || '').trim();
      if (!url || !key) return null;
      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify({ model: 'kimi-k2-instruct', messages, max_tokens: Math.max(120, Math.min(320, maxTokens || 240)), temperature: 0.2 })
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        const c = data.choices?.[0]?.message?.content || data.output || data.response || '';
        return String(c || '').trim();
      } catch { return null; }
    }

    async function callOpenAI(messages, maxTokens) {
      const key = (env.OPENAI_API_KEY || '').trim();
      if (!key) return null;
      try {
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify({ model: 'o4-mini', messages, max_tokens: Math.max(120, Math.min(320, maxTokens || 240)), temperature: 0.2 })
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        const c = data.choices?.[0]?.message?.content || '';
        return String(c || '').trim();
      } catch { return null; }
    }

    async function extractPeopleAndSummary(title, description) {
      const userContent = `Return valid JSON only: {"people":[{"name":"Name","roleHint":"text"},...],"summary":"English summary"}.\nTitle: ${title}\nDescription: ${description}`;
      const kimi = await callKimi([
        { role: 'system', content: 'Return JSON only; no extra text.' },
        { role: 'user', content: userContent }
      ], 280);
      if (kimi) {
        try {
          const parsed = JSON.parse(kimi);
          const people = Array.isArray(parsed.people) ? parsed.people.slice(0, 3).map(p => ({ name: String(p.name||'').trim(), roleHint: String(p.roleHint||'').trim() })).filter(p => p.name) : [];
          const summary = String(parsed.summary || description.slice(0, 300));
          return { people, summary };
        } catch {}
      }
      if (env.AI && typeof env.AI.run === 'function') {
        try {
          const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', { messages: [
            { role: 'system', content: 'Return JSON only; no extra text.' },
            { role: 'user', content: userContent }
          ], max_tokens: 260, temperature: 0.2 });
          const raw = (result && (result.response || result.text || '')).trim();
          const parsed = JSON.parse(raw);
          const people = Array.isArray(parsed.people) ? parsed.people.slice(0, 3).map(p => ({ name: String(p.name||'').trim(), roleHint: String(p.roleHint||'').trim() })).filter(p => p.name) : [];
          const summary = String(parsed.summary || description.slice(0, 300));
          return { people, summary };
        } catch {}
      }
      return { people: [], summary: description.slice(0, 300) };
    }

    async function enrichFromC14(name) {
      try {
        const url = `https://www.c14.co.il/?s=${encodeURIComponent(name)}`;
        const resp = await fetch(url, { headers: { 'User-Agent': 'OfirNewsBot/1.0', 'Accept-Language': 'he' } });
        if (!resp.ok) return { name, elected: null, alignment: null, evidence: [] };
        const html = await resp.text();
        const text = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const windowText = text.slice(0, 12000);
        const electedTokens = ['חבר הכנסת','ח"כ','שר ','שרת ','שרי','ראש הממשלה','ראש עיר','ראש העיר','חבר מועצה','חברי כנסת','שרים'];
        const nonelectedTokens = ['שופט','שופטים','יועץ משפטי','פרקליט','פרקליטות','מבקר המדינה','נציב','פקיד','פקידות','מנכ"ל משרד'];
        const rightTokens = ['ימין','הליכוד','הציונות הדתית','עוצמה יהודית','ש"ס','יהדות התורה'];
        const leftTokens = ['שמאל','יש עתיד','העבודה','מרצ','חד"ש','בל"ד','רע"ם','מחנה ממלכתי','כחול לבן'];
        const hasTok = (arr) => arr.some(t => windowText.includes(t));
        let elected = null; if (hasTok(electedTokens)) elected = true; else if (hasTok(nonelectedTokens)) elected = false;
        let alignment = null; if (hasTok(rightTokens)) alignment = 'right'; else if (hasTok(leftTokens)) alignment = 'left';
        const evidence = [windowText.slice(0, 400)];
        return { name, elected, alignment, evidence };
      } catch { return { name, elected: null, alignment: null, evidence: [] }; }
    }

    async function translateToHebrew(text) {
      if (!text) return '';
      // Prefer OpenAI, then Kimi, then Workers AI
      const prompt = `Translate the entire input to Hebrew. Output must be complete and not omit or summarize any content. Preserve meaning and tone.\n\n${text}`;
      // Try OpenAI with higher token budget
      const open = await callOpenAI([
        { role: 'system', content: 'You translate to Hebrew fully and accurately without omissions.' },
        { role: 'user', content: prompt }
      ], 800);
      if (open && open.length > 0) return open;
      // Try Kimi
      const kimi = await callKimi([
        { role: 'system', content: 'Translate to Hebrew fully and accurately without omissions.' },
        { role: 'user', content: prompt }
      ], 800);
      if (kimi && kimi.length > 0) return kimi;
      // Workers AI fallback
      if (env.AI && typeof env.AI.run === 'function') {
        try {
          const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', { messages: [
            { role: 'system', content: 'Translate to Hebrew fully and accurately without omissions.' },
            { role: 'user', content: prompt }
          ], max_tokens: 800, temperature: 0.2 });
          const out = ((result && (result.response || result.text || '')) + '').trim();
          if (out) return out;
        } catch {}
      }
      return '';
    }

    const articles = [];
    for (const it of selected) {
      const { title, link, description, pubDate } = it;

      const extr = await extractPeopleAndSummary(title, description);
      const people = extr.people || [];
      const summary = extr.summary || description.slice(0, 300);

      const enriched = [];
      for (const p of people.slice(0, 3)) { enriched.push(await enrichFromC14(p.name)); }

      const peopleLines = enriched.map(e => {
        const electedStr = e.elected === true ? 'elected' : e.elected === false ? 'non-elected' : 'unknown election status';
        const alignStr = e.alignment === 'right' ? 'right-leaning' : e.alignment === 'left' ? 'left-leaning' : 'alignment unknown';
        return `${e.name}: ${electedStr}, ${alignStr}`;
      }).join('\n');

      // Ultra-concise reasoning: 2–3 sentences, motives + propaganda deception
      let analysis = '';
      const assumption = 'Analytical frame: left-leaning actors influence police, army, courts, and much of the media; most Israelis are right-leaning.';
      const reasoningInstructions = `In 2–3 sentences, state (a) the likely motive for this article now, and (b) how the wording/structure uses propaganda to steer or mislead readers (e.g., emotional language, cherry-picking, appeal to authority, data overload, straw man, bandwagon, problem→solution). Quote a short phrase from title/description to ground claims.`;

      const openAi = await callOpenAI([
        { role: 'system', content: 'You are a concise reasoning analyst. Write in English. Be specific and grounded in the provided text.' },
        { role: 'user', content: `${assumption}\n\nTitle: ${title}\nDescription: ${description}\nPeople profile (from C14 hints):\n${peopleLines || 'none'}\n\n${reasoningInstructions}` }
      ], 240);
      if (openAi) analysis = openAi;

      if (!analysis) {
        const kimiAnalysis = await callKimi([
          { role: 'system', content: 'You are a concise reasoning analyst. Write in English. Be specific and grounded in the provided text.' },
          { role: 'user', content: `${assumption}\n\nTitle: ${title}\nDescription: ${description}\nPeople profile:\n${peopleLines || 'none'}\n\n${reasoningInstructions}` }
        ], 240);
        if (kimiAnalysis) analysis = kimiAnalysis;
      }

      if (!analysis && env.AI && typeof env.AI.run === 'function') {
        try {
          const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', { messages: [
            { role: 'system', content: 'You are a concise reasoning analyst. Write in English. Be specific and grounded in the provided text.' },
            { role: 'user', content: `${assumption}\n\nTitle: ${title}\nDescription: ${description}\nPeople profile:\n${peopleLines || 'none'}\n\n${reasoningInstructions}` }
          ], max_tokens: 240, temperature: 0.2 });
          analysis = ((result && (result.response || result.text || '')) + '').trim();
        } catch {}
      }

      if (!analysis) {
        analysis = `In 2–3 sentences: insufficient detail to infer motives. Title: "${title}".`;
      }

      const analysisHe = await translateToHebrew(analysis);

      articles.push({ title, link, pubDate, summary, analysis, analysis_he: analysisHe, people: enriched });
    }

    return new Response(JSON.stringify({ source: 'ynet', count: articles.length, articles }, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Server error', message: e.message }), { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  }
}


