/**
 * Cloudflare Pages Function: /api/nba?date=YYYYMMDD
 * 代理 ESPN 公开 NBA Scoreboard 接口，避免跨域并启用 5 秒边缘缓存。
 */
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const dateParam = url.searchParams.get('date') || '';
  const safeDate = /^\d{8}$/.test(dateParam) ? `?dates=${dateParam}` : '';
  const targetUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard${safeDate}`;

  try {
    const upstream = await fetch(targetUrl, {
      cf: { cacheEverything: true, cacheTtlByStatus: { '200-299': 5, '400-599': 0 } },
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PersonalDevHub/1.0)',
      },
    });

    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': upstream.ok ? 'public, max-age=5' : 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Upstream ESPN fetch failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}
