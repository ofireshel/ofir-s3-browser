export default {
  async fetch(request) {
    const url = new URL(request.url);
    const upstream = new URL(`https://lexiorbit.pages.dev${url.pathname}${url.search}`);

    const init = {
      method: request.method,
      headers: new Headers(request.headers),
      redirect: 'follow'
    };
    // Ensure Host header matches upstream
    init.headers.set('Host', 'lexiorbit.pages.dev');
    // Remove encoding/length for streaming safety
    init.headers.delete('content-length');
    init.headers.delete('content-encoding');

    if (!['GET', 'HEAD'].includes(request.method)) {
      init.body = request.body;
    }

    const resp = await fetch(upstream, init);
    // Pass-through response
    const newHeaders = new Headers(resp.headers);
    // Fix COOP/COEP/CSP if any issues arise (optional)
    return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: newHeaders });
  }
};


