export async function onRequestGet({ env }) {
  const seed = {
    players: {
      Ofir: { used: 85, total: 100 },
      Avi: { used: 60, total: 80 },
      Dana: { used: 72, total: 95 },
      Noa: { used: 50, total: 70 },
      Lior: { used: 20, total: 35 },
    },
  };
  let data;
  try {
    const raw = await env.SCORES.get('players');
    if (!raw) {
      await env.SCORES.put('players', JSON.stringify(seed));
      data = seed;
    } else {
      data = JSON.parse(raw);
    }
  } catch (e) {
    data = seed;
  }

  const players = data.players || {};
  const list = Object.entries(players)
    .map(([player, agg]) => {
      const used = Number(agg.used || 0);
      const total = Math.max(1, Number(agg.total || 1));
      const avg = total > 0 ? used / total : 0;
      return { player, used, total, avg };
    })
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 5);

  return new Response(JSON.stringify({ top5: list }, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const playerRaw = (body.player || '').toString().trim();
    const player = playerRaw || `Player-${Math.floor(Math.random() * 1e6).toString(36).toUpperCase()}`;
    const used = Math.max(0, Math.min(20, Number(body.used || 0)));
    const total = Math.max(1, Math.min(20, Number(body.total || 20)));

    let data;
    const raw = await env.SCORES.get('players');
    if (!raw) {
      data = { players: {} };
    } else {
      data = JSON.parse(raw);
    }
    if (!data.players) data.players = {};
    if (!data.players[player]) data.players[player] = { used: 0, total: 0 };
    data.players[player].used += used;
    data.players[player].total += total;

    await env.SCORES.put('players', JSON.stringify(data));

    const players = data.players || {};
    const list = Object.entries(players)
      .map(([p, agg]) => {
        const u = Number(agg.used || 0);
        const t = Math.max(1, Number(agg.total || 1));
        const a = t > 0 ? u / t : 0;
        return { player: p, used: u, total: t, avg: a };
      })
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 5);

    return new Response(JSON.stringify({ status: 'ok', top5: list }, null, 2), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ status: 'error', message: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}


