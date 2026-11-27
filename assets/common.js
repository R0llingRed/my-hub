import { SITE_CONFIG } from '../config.js';

const TIME_ZONE = SITE_CONFIG.timeZone || 'Asia/Shanghai';
const DAY_MS = 86400 * 1000;
// 固定参考起始日（2026-01-01），用于确定性每日轮换
const EPOCH_DAY = Math.floor(Date.UTC(2026, 0, 1) / DAY_MS);

const shanghaiPartsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  weekday: 'short',
  hour12: false,
});

const WEEKDAY_MAP = {
  Sun: '周日',
  Mon: '周一',
  Tue: '周二',
  Wed: '周三',
  Thu: '周四',
  Fri: '周五',
  Sat: '周六',
};

function getZonedParts(dateObj) {
  const parts = {};
  for (const p of shanghaiPartsFmt.formatToParts(dateObj)) {
    parts[p.type] = p.value;
  }
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return {
    year: Number(parts.year),
    month: parts.month,
    day: parts.day,
    hour,
    minute: parts.minute,
    second: parts.second,
    weekday: WEEKDAY_MAP[parts.weekday] || '',
  };
}

/**
 * 获取上海地区（Asia/Shanghai）日期与时间信息
 */
export function getShanghaiDate(offsetDays = 0) {
  const now = new Date();
  const target = new Date(now.getTime() + offsetDays * DAY_MS);
  const p = getZonedParts(target);
  const nowP = getZonedParts(now);

  const dayNumber = Math.floor(Date.UTC(p.year, Number(p.month) - 1, Number(p.day)) / DAY_MS);
  const elapsedSecToday =
    Number(nowP.hour) * 3600 + Number(nowP.minute) * 60 + Number(nowP.second);
  const msUntilMidnight = Math.max(0, (86400 - elapsedSecToday) * 1000);

  return {
    year: p.year,
    month: p.month,
    day: p.day,
    weekday: p.weekday,
    dayNumber,
    dateStr: `${p.year}-${p.month}-${p.day}`,
    yyyymmdd: `${p.year}${p.month}${p.day}`,
    displayDate: `${p.year}.${p.month}.${p.day} ${p.weekday}`,
    timeStr: `${p.hour}:${p.minute}:${p.second}`,
    msUntilMidnight,
  };
}

// 兼容旧引用名
export const getBeijingDate = getShanghaiDate;

/**
 * 将 ISO 时间转换为上海时间的日期字符串与时分
 */
export function formatShanghaiEventTime(isoStr) {
  if (!isoStr) return { dateStr: '', hm: '待定', mdhm: '待定' };
  const p = getZonedParts(new Date(isoStr));
  return {
    dateStr: `${p.year}-${p.month}-${p.day}`,
    hm: `${p.hour}:${p.minute}`,
    mdhm: `${p.month}-${p.day} ${p.hour}:${p.minute}`,
  };
}

/**
 * HTML 转义，防止外部 Feed 内容注入
 */
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 剪贴板写入（兼容局域网 HTTP 预览环境的降级复制）
 */
export async function copyText(text) {
  const value = String(text ?? '');
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (_) {
      // fall through to execCommand fallback
    }
  }
  const ta = document.createElement('textarea');
  ta.value = value;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  ta.style.pointerEvents = 'none';
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, value.length);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch (_) {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

/**
 * 根据上海时间日期确定性地选出当天的索引（支持 salt 避免不同模块同索引同步）
 */
export function getDailyItemIndex(total, offsetDays = 0, salt = 0) {
  if (!total) return 0;
  const { dayNumber } = getBeijingDate(offsetDays);
  const diff = dayNumber - EPOCH_DAY + salt;
  return ((diff % total) + total) % total;
}

/**
 * 根据北京时间日期确定性地选出当天的专辑索引
 */
export function getDailyAlbumIndex(totalAlbums, offsetDays = 0) {
  return getDailyItemIndex(totalAlbums, offsetDays, 0);
}

/**
 * 格式化倒计时 HH:MM:SS
 */
export function formatCountdown(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/**
 * 启动顶部实时时钟
 */
export function startClock(dateEl, timeEl) {
  const tick = () => {
    const bj = getBeijingDate(0);
    if (dateEl) dateEl.textContent = bj.displayDate;
    if (timeEl) timeEl.textContent = bj.timeStr;
  };
  tick();
  return setInterval(tick, 1000);
}

/**
 * 生成离线/兜底用的高质感黑胶封面 SVG Data URL
 */
export function buildFallbackCover(album) {
  const accent = album.accentColor || '#6366f1';
  const safeTitle = (album.title || 'Album').replace(/[<>&"']/g, '');
  const safeArtist = (album.artist || 'Artist').replace(/[<>&"']/g, '');
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#18181b"/>
          <stop offset="100%" stop-color="${accent}" stop-opacity="0.45"/>
        </linearGradient>
      </defs>
      <rect width="600" height="600" fill="url(#bg)"/>
      <circle cx="300" cy="270" r="140" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>
      <circle cx="300" cy="270" r="95" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/>
      <circle cx="300" cy="270" r="46" fill="${accent}" fill-opacity="0.85"/>
      <circle cx="300" cy="270" r="10" fill="#09090b"/>
      <text x="48" y="490" fill="#fafafa" font-family="sans-serif" font-size="30" font-weight="700">${safeTitle.slice(0, 26)}</text>
      <text x="48" y="534" fill="#a1a1aa" font-family="monospace" font-size="20">${safeArtist.slice(0, 32)} · ${album.year || ''}</text>
    </svg>
  `.trim();
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * 通过 iTunes Search API 拉取专辑高清封面与 30 秒试听链接（带 24h localStorage 缓存）
 */
export async function fetchItunesMetadata(album) {
  const cacheKey = `itunes_meta_v1_${album.id}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.ts < 24 * 3600 * 1000) {
        return parsed.data;
      }
    }
  } catch (_) {}

  const query = encodeURIComponent(album.itunesQuery || `${album.artist} ${album.title}`);
  const result = {
    artwork: buildFallbackCover(album),
    collectionViewUrl: '',
    previews: {},
  };

  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${query}&entity=song&limit=25`);
    if (!res.ok) return result;
    const json = await res.json();
    const items = json.results || [];
    if (items.length > 0) {
      const first = items[0];
      if (first.artworkUrl100) {
        result.artwork = first.artworkUrl100.replace('100x100bb', '600x600bb');
      }
      result.collectionViewUrl = first.collectionViewUrl || '';

      for (const item of items) {
        if (item.trackName && item.previewUrl) {
          const norm = normalizeTrackName(item.trackName);
          if (!result.previews[norm]) {
            result.previews[norm] = {
              previewUrl: item.previewUrl,
              trackViewUrl: item.trackViewUrl || '',
            };
          }
        }
      }
    }

    try {
      localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: result }));
    } catch (_) {}
  } catch (_) {
    // 网络不可用或被拦截时静默降级到默认封面
  }

  return result;
}

export function normalizeTrackName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
}

/**
 * 匹配曲目试听 URL
 */
export function findTrackPreview(trackTitle, previewsMap) {
  if (!previewsMap) return null;
  const target = normalizeTrackName(trackTitle);
  if (previewsMap[target]) return previewsMap[target];
  for (const [key, val] of Object.entries(previewsMap)) {
    if (key.includes(target) || target.includes(key)) {
      return val;
    }
  }
  return null;
}

/**
 * 拉取单个 ESPN 日期（美东日历）的赛程
 */
async function fetchSingleEspnDate(yyyymmdd) {
  const proxyUrl = `${SITE_CONFIG.nba.proxyEndpoint}?date=${yyyymmdd}`;
  const directUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${yyyymmdd}`;

  for (const url of [proxyUrl, directUrl]) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) continue;
      const data = await res.json();
      if (data && Array.isArray(data.events)) {
        return data.events;
      }
    } catch (_) {
      // fallback to next url
    }
  }
  return null;
}

/**
 * 按上海地区（Asia/Shanghai）日历日拉取 NBA 赛程
 * 由于中美时差约 12-13 小时，上海当天的上午比赛对应美东前一日晚间，
 * 因此并行请求美东前一日与当日数据后，再按上海日期精准归类去重。
 */
export async function fetchNbaScoreboardByShanghaiOffset(offsetDays = 0) {
  const shTarget = getShanghaiDate(offsetDays);
  const shPrev = getShanghaiDate(offsetDays - 1);

  const [prevEvents, currEvents] = await Promise.all([
    fetchSingleEspnDate(shPrev.yyyymmdd),
    fetchSingleEspnDate(shTarget.yyyymmdd),
  ]);

  if (prevEvents === null && currEvents === null) {
    throw new Error('无法获取 NBA 赛程数据，请检查网络连接');
  }

  const map = new Map();
  for (const ev of [...(prevEvents || []), ...(currEvents || [])]) {
    if (!ev?.id) continue;
    const { dateStr } = formatShanghaiEventTime(ev.date);
    if (dateStr === shTarget.dateStr) {
      map.set(ev.id, ev);
    }
  }

  return {
    shanghaiDate: shTarget,
    events: Array.from(map.values()),
  };
}

export async function fetchNbaScoreboard(yyyymmdd) {
  const events = await fetchSingleEspnDate(yyyymmdd);
  if (events === null) {
    throw new Error('无法获取 NBA 赛程数据，请检查网络连接');
  }
  return { events };
}

/**
 * 拉取单场 NBA 比赛详情（含 Box Score、Linescores 与球队统计）
 */
export async function fetchNbaSummary(eventId) {
  const safeId = String(eventId || '').replace(/[^0-9]/g, '');
  if (!safeId) throw new Error('无效的比赛 ID');

  const proxyBase = SITE_CONFIG.nba.summaryProxyEndpoint || '/api/nba-summary';
  const proxyUrl = `${proxyBase}?event=${safeId}`;
  const directUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${safeId}`;

  for (const url of [proxyUrl, directUrl]) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) continue;
      const data = await res.json();
      if (data && (data.boxscore || data.header)) {
        return data;
      }
    } catch (_) {
      // fallback to next url
    }
  }
  throw new Error('无法获取比赛详细技术统计');
}

/**
 * 拉取 NBA 东西部战绩榜
 */
export async function fetchNbaStandings() {
  const proxyUrl = SITE_CONFIG.nba.standingsProxyEndpoint || '/api/nba-standings';
  const directUrl = 'https://site.api.espn.com/apis/v2/sports/basketball/nba/standings';

  for (const url of [proxyUrl, directUrl]) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) continue;
      const data = await res.json();
      if (data && Array.isArray(data.children)) {
        return data;
      }
    } catch (_) {
      // fallback to next url
    }
  }
  throw new Error('无法获取 NBA 东西部战绩榜');
}

/**
 * 拉取「Muse 每日定刊」静态摘要（data/digest.json）
 * 返回 null 表示暂未配置或格式无效，调用方可自动降级到实时流。
 */
export async function fetchCuratedDigest(basePath = '.') {
  const SOURCE_LABELS = {
    hn: 'HN',
    github: 'GitHub',
    v2ex: 'V2EX',
    devto: 'DEV',
  };

  try {
    const url = `${basePath.replace(/\/$/, '')}/data/digest.json`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !Array.isArray(data.items) || data.items.length === 0) {
      return null;
    }

    const items = data.items.map((item, idx) => {
      const source = item.source || 'hn';
      return {
        ...item,
        id: item.id || `curated-${idx}`,
        source,
        sourceLabel: item.sourceLabel || SOURCE_LABELS[source] || source.toUpperCase(),
        title: item.title || item.zhTitle || 'Untitled',
        zhTitle: item.zhTitle || item.title || 'Untitled',
        meta: item.meta || '',
        tags: Array.isArray(item.tags) ? item.tags : [],
        bullets: Array.isArray(item.bullets) ? item.bullets : [],
      };
    });

    return {
      ...data,
      items,
      mode: 'curated',
    };
  } catch (_) {
    return null;
  }
}

/**
 * 拉取「极客早报」聚合数据
 * 优先走 Cloudflare Pages Function (/api/digest)；本地开发无 Functions 时自动降级直连支持 CORS 的公开源。
 */
export async function fetchGeekDigest() {
  const proxyUrl = SITE_CONFIG.digest?.proxyEndpoint || '/api/digest';
  try {
    const res = await fetch(proxyUrl, { cache: 'no-store' });
    if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
      const data = await res.json();
      if (data && Array.isArray(data.items) && data.items.length > 0) {
        return { ...data, mode: 'proxy' };
      }
    }
  } catch (_) {
    // fallback to direct client-side fetch
  }

  const sinceDate = new Date(Date.now() - 14 * DAY_MS).toISOString().slice(0, 10);
  const [hnRes, ghRes, devRes] = await Promise.allSettled([
    fetch('https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=8').then((r) =>
      r.ok ? r.json() : Promise.reject(new Error('HN failed'))
    ),
    fetch(
      `https://api.github.com/search/repositories?q=created:>${sinceDate}&sort=stars&order=desc&per_page=8`,
      { headers: { Accept: 'application/vnd.github+json' } }
    ).then((r) => (r.ok ? r.json() : Promise.reject(new Error('GitHub failed')))),
    fetch('https://dev.to/api/articles?top=1&per_page=8').then((r) =>
      r.ok ? r.json() : Promise.reject(new Error('DEV.to failed'))
    ),
  ]);

  const buckets = { hn: [], github: [], devto: [] };

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
  const maxLen = Math.max(buckets.hn.length, buckets.github.length, buckets.devto.length);
  for (let i = 0; i < maxLen; i++) {
    if (buckets.hn[i]) items.push(buckets.hn[i]);
    if (buckets.github[i]) items.push(buckets.github[i]);
    if (buckets.devto[i]) items.push(buckets.devto[i]);
  }

  if (items.length === 0) {
    throw new Error('暂时无法拉取早报数据源，请检查网络');
  }

  return {
    items,
    counts: {
      hn: buckets.hn.length,
      github: buckets.github.length,
      v2ex: 0,
      devto: buckets.devto.length,
    },
    updatedAt: new Date().toISOString(),
    mode: 'direct',
  };
}

/**
 * 获取电影海报：优先使用 data/films.json 预置的 posterUrl，
 * 若未预填则走 /api/film-poster 边缘代理并缓存到 localStorage（7 天）。
 */
export async function fetchFilmPoster(film) {
  if (!film) return '';
  if (typeof film.posterUrl === 'string' && /^https?:\/\//i.test(film.posterUrl)) {
    return film.posterUrl;
  }

  const cacheKey = `film_poster_v1_${film.id || film.title}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.ts < 7 * DAY_MS) {
        return parsed.url || '';
      }
    }
  } catch (_) {}

  const query = film.originalTitle || film.title;
  if (!query) return '';

  const proxyBase = SITE_CONFIG.film?.posterProxyEndpoint || '/api/film-poster';
  const url = `${proxyBase}?q=${encodeURIComponent(query)}&year=${encodeURIComponent(film.year || '')}`;

  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return '';
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return '';
    const data = await res.json();
    const posterUrl = typeof data?.posterUrl === 'string' ? data.posterUrl : '';
    if (posterUrl) {
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), url: posterUrl }));
      } catch (_) {}
    }
    return posterUrl;
  } catch (_) {
    return '';
  }
}
