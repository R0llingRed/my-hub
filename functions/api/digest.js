/**
 * Cloudflare Pages Function: /api/digest
 * 聚合 Hacker News、GitHub 近期热门仓库、V2EX 热议与 DEV.to 精选，提供 10 分钟边缘缓存。
 */
async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PersonalDevHub/1.0)',
        Accept: 'application/json',
        ...(options.headers || {}),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function onRequestGet() {
  const sinceDate = new Date(Date.now() - 14 * 86400 * 1000).toISOString().slice(0, 10);

  const [hnRes, ghRes, v2exRes, devRes] = await Promise.allSettled([
    fetchJsonWithTimeout('https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=8', {
      cf: { cacheTtl: 600, cacheEverything: true },
    }),
    fetchJsonWithTimeout(
      `https://api.github.com/search/repositories?q=created:>${sinceDate}&sort=stars&order=desc&per_page=8`,
      {
        headers: { Accept: 'application/vnd.github+json' },
        cf: { cacheTtl: 600, cacheEverything: true },
      }
    ),
    fetchJsonWithTimeout('https://www.v2ex.com/api/topics/hot.json', {
      cf: { cacheTtl: 600, cacheEverything: true },
    }),
    fetchJsonWithTimeout('https://dev.to/api/articles?top=1&per_page=8', {
      cf: { cacheTtl: 600, cacheEverything: true },
    }),
  ]);

  const buckets = { hn: [], github: [], v2ex: [], devto: [] };

  if (hnRes.status === 'fulfilled' && Array.isArray(hnRes.value?.hits)) {
    buckets.hn = hnRes.value.hits.slice(0, 8).map((hit) => ({
      id: `hn-${hit.objectID}`,
      source: 'hn',
      sourceLabel: 'HN',
      title: hit.title || 'Untitled',
      url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
      meta: `${hit.points || 0} pts · ${hit.num_comments || 0} 评论`,
      points: hit.points || 0,
      time: hit.created_at || '',
    }));
  }

  if (ghRes.status === 'fulfilled' && Array.isArray(ghRes.value?.items)) {
    buckets.github = ghRes.value.items.slice(0, 8).map((repo) => ({
      id: `gh-${repo.id}`,
      source: 'github',
      sourceLabel: 'GitHub',
      title: `${repo.full_name}${repo.description ? ` — ${repo.description}` : ''}`,
      url: repo.html_url,
      meta: `★ ${repo.stargazers_count}${repo.language ? ` · ${repo.language}` : ''}`,
      points: repo.stargazers_count || 0,
      time: repo.created_at || '',
    }));
  }

  if (v2exRes.status === 'fulfilled' && Array.isArray(v2exRes.value)) {
    buckets.v2ex = v2exRes.value.slice(0, 8).map((topic) => ({
      id: `v2ex-${topic.id}`,
      source: 'v2ex',
      sourceLabel: 'V2EX',
      title: topic.title || 'Untitled',
      url: topic.url,
      meta: `${topic.node?.title || '热议'} · ${topic.replies || 0} 回复`,
      points: topic.replies || 0,
      time: topic.created ? new Date(topic.created * 1000).toISOString() : '',
    }));
  }

  if (devRes.status === 'fulfilled' && Array.isArray(devRes.value)) {
    buckets.devto = devRes.value.slice(0, 8).map((art) => ({
      id: `devto-${art.id}`,
      source: 'devto',
      sourceLabel: 'DEV',
      title: art.title || 'Untitled',
      url: art.url,
      meta: `♥ ${art.public_reactions_count || 0} · ${art.reading_time_minutes || 3} min`,
      points: art.public_reactions_count || 0,
      time: art.published_at || '',
    }));
  }

  const items = [];
  const maxLen = Math.max(
    buckets.hn.length,
    buckets.github.length,
    buckets.v2ex.length,
    buckets.devto.length
  );
  for (let i = 0; i < maxLen; i++) {
    if (buckets.hn[i]) items.push(buckets.hn[i]);
    if (buckets.github[i]) items.push(buckets.github[i]);
    if (buckets.v2ex[i]) items.push(buckets.v2ex[i]);
    if (buckets.devto[i]) items.push(buckets.devto[i]);
  }

  return new Response(
    JSON.stringify({
      items,
      counts: {
        hn: buckets.hn.length,
        github: buckets.github.length,
        v2ex: buckets.v2ex.length,
        devto: buckets.devto.length,
      },
      updatedAt: new Date().toISOString(),
    }),
    {
      status: items.length > 0 ? 200 : 502,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=600',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}
