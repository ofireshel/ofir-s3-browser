export async function onRequestGet({ env }) {
  const key = 'lexi_flash_leader';
  let leader = null;
  try {
    const raw = await env.SCORES.get(key);
    leader = raw ? JSON.parse(raw) : null;
  } catch (e) {
    leader = null;
  }
  if (!leader) {
    leader = { name: '—', level: 0, capturedSum: 0, updatedAt: new Date().toISOString() };
  }
  return new Response(JSON.stringify({ leader }, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function onRequestPost({ request, env }) {
  const key = 'lexi_flash_leader';
  try {
    const body = await request.json();
    const nameRaw = (body.name || '').toString().trim().slice(0, 40);
    const name = nameRaw || 'Player';
    const level = Math.max(0, Number(body.level || 0));
    const capturedSum = Math.max(0, Number(body.capturedSum || 0));

    // Load current
    let current = null;
    try {
      const raw = await env.SCORES.get(key);
      current = raw ? JSON.parse(raw) : null;
    } catch (e) {
      current = null;
    }
    const better = isBetter({ level, capturedSum }, current);
    if (better) {
      const next = { name, level, capturedSum, updatedAt: new Date().toISOString() };
      await env.SCORES.put(key, JSON.stringify(next));
      return json({ updated: true, leader: next });
    }
    return json({ updated: false, leader: current });
  } catch (e) {
    return new Response(JSON.stringify({ status: 'error', message: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}

function isBetter(candidate, current) {
  if (!current) return true;
  if (candidate.level !== current.level) return candidate.level > current.level;
  return candidate.capturedSum > (current.capturedSum || 0);
}

function json(obj) {
  return new Response(JSON.stringify(obj, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}


