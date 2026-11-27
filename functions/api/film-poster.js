/**
 * Cloudflare Pages Function: /api/film-poster?q=Blade%20Runner&year=1982
 * 代理 IMDb 公开 Suggestion 接口，为未预填 posterUrl 的新电影自动补抓高清海报（7 天边缘缓存）。
 */
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const rawQ = (url.searchParams.get('q') || '').trim().slice(0, 100);
  const yearParam = url.searchParams.get('year') || '';
  const targetYear = /^\d{4}$/.test(yearParam) ? Number(yearParam) : null;

  if (!rawQ) {
    return new Response(JSON.stringify({ error: 'Missing query parameter q' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  const searchTerm = targetYear ? `${rawQ} ${targetYear}` : rawQ;
  const targetUrl = `https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(searchTerm)}.json`;

  try {
    const upstream = await fetch(targetUrl, {
      cf: { cacheTtl: 604800, cacheEverything: true },
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PersonalDevHub/1.0)',
        Accept: 'application/json',
      },
    });

    if (!upstream.ok) {
      throw new Error(`Upstream HTTP ${upstream.status}`);
    }

    const json = await upstream.json();
    const list = Array.isArray(json?.d) ? json.d : [];

    const isMovieItem = (item) =>
      item?.i?.imageUrl && (item.qid === 'movie' || item.qid === 'tvMovie' || !item.qid);

    let match = null;
    if (targetYear) {
      match = list.find(
        (item) => isMovieItem(item) && item.y && Math.abs(Number(item.y) - targetYear) <= 2
      );
    }
    if (!match) {
      match = list.find((item) => isMovieItem(item));
    }

    const posterUrl = match?.i?.imageUrl
      ? match.i.imageUrl.replace(/\._V1_.*\.jpg$/i, '._V1_UX600_.jpg')
      : '';

    return new Response(
      JSON.stringify({
        posterUrl,
        title: match?.l || '',
        year: match?.y || null,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=604800',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (_) {
    return new Response(JSON.stringify({ posterUrl: '', error: 'Poster lookup failed' }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
