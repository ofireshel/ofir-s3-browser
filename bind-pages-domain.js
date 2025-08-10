const https = require('https');

// Configuration via environment variables; do not hardcode secrets
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const PROJECT = process.env.CF_PAGES_PROJECT || 'lexiorbit';
if (!TOKEN) throw new Error('CLOUDFLARE_API_TOKEN not set');
if (!ACCOUNT) throw new Error('CLOUDFLARE_ACCOUNT_ID not set');
const HOST = 'api.cloudflare.com';
const BASE = `/client/v4/accounts/${ACCOUNT}/pages/projects/${PROJECT}/domains`;

function request(method, path, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: HOST,
      path,
      method,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => (chunks += c));
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(chunks); } catch {}
        resolve({ status: res.statusCode, body: chunks, json: parsed });
      });
    });
    req.on('error', (err) => {
      resolve({ status: 0, error: err.message });
    });
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  console.log('Attaching apex: habgida.info');
  const r1 = await request('POST', BASE, { domain: 'habgida.info' });
  console.log('Apex response:', r1.status, r1.json || r1.body);

  console.log('Attaching www: www.habgida.info');
  const r2 = await request('POST', BASE, { domain: 'www.habgida.info' });
  console.log('WWW response:', r2.status, r2.json || r2.body);

  console.log('Listing current bindings:');
  const r3 = await request('GET', BASE, null);
  console.log('List response:', r3.status, r3.json || r3.body);
})();


