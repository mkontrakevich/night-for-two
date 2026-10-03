export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const base = "https://terem-visual-dna.kontrakevich.workers.dev";
    if (url.pathname === "/library-index" || url.pathname === "/library-index/") {
      const upstream = await fetch(base + "/");
      return new Response(upstream.body, {
        status: upstream.status,
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" }
      });
    }
    if (url.pathname.startsWith("/source/")) {
      const upstream = await fetch(base + "/" + url.pathname.slice(8) + url.search);
      const headers = new Headers(upstream.headers);
      headers.set("cache-control","public, max-age=86400");
      return new Response(upstream.body,{status:upstream.status,headers});
    }
    return env.ASSETS.fetch(request);
  }
};
