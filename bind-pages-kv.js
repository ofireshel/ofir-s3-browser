const https = require('https');

const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const PROJECT = process.env.CF_PAGES_PROJECT || 'lexiorbit';
const KV_TITLE = process.env.KV_TITLE || 'lexi-flash-kv';
const BINDING = process.env.KV_BINDING || 'SCORES';

if (!TOKEN || !ACCOUNT) {
  console.error('Missing CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID.');
  process.exit(1);
}

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.cloudflare.com',
      path,
      method,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => (chunks += c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(chunks); } catch {}
        resolve({ status: res.statusCode, json, text: chunks });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function ensureKvNamespace() {
  // Try to find by title
  const list = await request('GET', `/client/v4/accounts/${ACCOUNT}/storage/kv/namespaces?per_page=1000`);
  if (list.status !== 200) throw new Error('Failed to list KV namespaces: ' + (list.text || list.status));
  const existing = (list.json && list.json.result || []).find(ns => ns.title === KV_TITLE);
  if (existing) {
    console.log('KV namespace exists:', existing.id, existing.title);
    return existing.id;
  }
  // Create
  const created = await request('POST', `/client/v4/accounts/${ACCOUNT}/storage/kv/namespaces`, { title: KV_TITLE });
  if (created.status !== 200 || !(created.json && created.json.result && created.json.result.id)) {
    throw new Error('Failed to create KV namespace: ' + (created.text || created.status));
  }
  console.log('KV namespace created:', created.json.result.id);
  return created.json.result.id;
}

async function bindKvToPages(namespaceId) {
  // Get existing project
  const proj = await request('GET', `/client/v4/accounts/${ACCOUNT}/pages/projects/${PROJECT}`);
  if (proj.status !== 200) throw new Error('Failed to fetch Pages project: ' + (proj.text || proj.status));
  const current = proj.json.result || {};
  const cfg = current.deployment_configs || {};
  const prod = cfg.production || {};
  const kvs = Array.isArray(prod.kv_namespaces) ? prod.kv_namespaces.slice() : [];
  const idx = kvs.findIndex(k => k.binding_name === BINDING);
  if (idx >= 0) kvs[idx] = { binding_name: BINDING, namespace_id: namespaceId };
  else kvs.push({ binding_name: BINDING, namespace_id: namespaceId });

  const payload = {
    deployment_configs: {
      ...cfg,
      production: { ...prod, kv_namespaces: kvs },
    },
  };
  const patch = await request('PATCH', `/client/v4/accounts/${ACCOUNT}/pages/projects/${PROJECT}`, payload);
  if (patch.status !== 200) throw new Error('Failed to bind KV to Pages project: ' + (patch.text || patch.status));
  console.log('Bound KV to Pages project:', { binding: BINDING, namespaceId });
}

(async () => {
  try {
    const nsId = await ensureKvNamespace();
    await bindKvToPages(nsId);
    console.log('Done.');
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();


