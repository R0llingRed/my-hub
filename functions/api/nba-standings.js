/**
 * Cloudflare Pages Function: /api/nba-standings
 * 代理 ESPN NBA 东西部战绩榜接口，启用 5 分钟边缘缓存。
 */
export async function onRequestGet() {
  const targetUrl = 'https://site.api.espn.com/apis/v2/sports/basketball/nba/standings';

  try {
    const upstream = await fetch(targetUrl, {
      cf: { cacheEverything: true, cacheTtlByStatus: { '200-299': 300, '400-599': 0 } },
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PersonalDevHub/1.0)',
      },
    });

    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': upstream.ok ? 'public, max-age=300' : 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Upstream ESPN standings fetch failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}
