import { SITE_CONFIG } from '../config.js';
import {
  buildFallbackCover,
  copyText,
  escapeHtml,
  fetchCuratedDigest,
  fetchFilmPoster,
  fetchGeekDigest,
  fetchItunesMetadata,
  fetchNbaScoreboardByShanghaiOffset,
  formatCountdown,
  formatShanghaiEventTime,
  getDailyAlbumIndex,
  getDailyItemIndex,
  getShanghaiDate,
  isSameNbaTeam,
  startClock,
} from './common.js';

// 1. 渲染基础配置与顶部时钟
document.getElementById('siteTitle').textContent = SITE_CONFIG.title;
document.getElementById('siteSub').textContent = SITE_CONFIG.subtitle;
document.title = `${SITE_CONFIG.title} — ${SITE_CONFIG.subtitle}`;

startClock(
  document.getElementById('clockDate'),
  document.getElementById('clockTime')
);

// 2. 渲染 IT-Tools 卡片
function getToolHref(cfg) {
  if (SITE_CONFIG.openToolsInWorkspace) {
    return './tools/';
  }
  return cfg.url;
}

function renderItToolsCard() {
  const cfg = SITE_CONFIG.tools.itTools;
  const card = document.getElementById('cardItTools');
  card.href = getToolHref(cfg);
  if (!SITE_CONFIG.openToolsInWorkspace) {
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
  }
  document.getElementById('itToolsName').textContent = cfg.name;
  document.getElementById('itToolsDesc').textContent = cfg.description;
  const tagsEl = document.getElementById('itToolsTags');
  tagsEl.innerHTML = cfg.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('');
}

renderItToolsCard();

// 3. 渲染快捷链接
const quickLinksEl = document.getElementById('quickLinks');
quickLinksEl.innerHTML = SITE_CONFIG.extraLinks
  .map(
    (link) => `
      <a class="quick-link" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">
        <span>${escapeHtml(link.name)}</span>
        <span style="color:var(--text-muted);font-size:12px;">${escapeHtml(link.desc)}</span>
      </a>
    `
  )
  .join('');

// 4. 加载「今日一碟」实时预览
async function initVinylWidget() {
  try {
    const res = await fetch('./data/albums.json');
    const albums = await res.json();
    const idx = getDailyAlbumIndex(albums.length, 0);
    const album = albums[idx];

    document.getElementById('vinylTitle').textContent = album.title;
    document.getElementById('vinylArtist').textContent = `${album.artist} · ${album.year}`;
    document.getElementById('vinylSnippet').textContent = album.review;
    document.getElementById('vinylGenre').textContent = album.genre;

    const thumbEl = document.getElementById('vinylThumb');
    thumbEl.src = buildFallbackCover(album);

    const discEl = document.getElementById('vinylDiscMini');
    if (album.accentColor) {
      discEl.style.background = `radial-gradient(circle at center, #18181b 0 14%, ${album.accentColor} 14% 26%, #111 27% 100%)`;
    }

    const meta = await fetchItunesMetadata(album);
    if (meta.artwork) {
      thumbEl.src = meta.artwork;
    }
  } catch (_) {
    document.getElementById('vinylTitle').textContent = '今日一碟';
    document.getElementById('vinylSnippet').textContent = '点击进入完整黑胶唱片页';
  }

  const countdownEl = document.getElementById('vinylCountdown');
  const updateCountdown = () => {
    const sh = getShanghaiDate(0);
    countdownEl.textContent = `换碟 ${formatCountdown(sh.msUntilMidnight)}`;
  };
  updateCountdown();
  setInterval(updateCountdown, 1000);
}

// 5. 加载「今日一影」实时预览
async function initFilmWidget() {
  try {
    const res = await fetch('./data/films.json');
    const films = await res.json();
    const idx = getDailyItemIndex(films.length, 0, 7);
    const film = films[idx];

    document.getElementById('filmTitle').textContent = film.title;
    document.getElementById('filmMeta').textContent = `${film.director} · ${film.year} · ${film.genre}`;
    document.getElementById('filmSnippet').textContent = film.review;
    document.getElementById('filmRatingTag').textContent = `★ ${film.rating}`;

    const palette = film.palette || ['#09090b', film.accentColor || '#6366f1'];
    const posterWrap = document.getElementById('filmPosterWrap');
    const posterThumb = document.getElementById('filmPosterThumb');
    if (posterWrap) {
      posterWrap.style.background = `linear-gradient(155deg, ${palette[0] || '#09090b'} 0%, ${palette[1] || '#18181b'} 60%, ${palette[2] || film.accentColor || '#6366f1'}66 100%)`;
    }

    const paletteEl = document.getElementById('filmPalettePreview');
    paletteEl.innerHTML = (film.palette || [])
      .map((hex) => `<span class="palette-swatch" style="background:${escapeHtml(hex)};"></span>`)
      .join('');

    const posterUrl = await fetchFilmPoster(film);
    if (posterThumb && posterUrl) {
      posterThumb.onload = () => posterThumb.classList.add('loaded');
      posterThumb.onerror = () => posterThumb.classList.remove('loaded');
      posterThumb.alt = `${film.title} 海报`;
      posterThumb.src = posterUrl;
    }
  } catch (_) {
    document.getElementById('filmTitle').textContent = '今日一影';
    document.getElementById('filmSnippet').textContent = '点击进入完整电影卡片与色盘';
  }

  const countdownEl = document.getElementById('filmCountdown');
  const updateCountdown = () => {
    const sh = getShanghaiDate(0);
    countdownEl.textContent = `换片 ${formatCountdown(sh.msUntilMidnight)}`;
  };
  updateCountdown();
  setInterval(updateCountdown, 1000);
}

// 6. 加载「极客早报」预览（优先 Muse 定刊，无则降级实时流，展示 4 条）
async function initDigestWidget() {
  const listEl = document.getElementById('digestMiniList');
  const sourcesTagEl = document.getElementById('digestSourcesTag');
  try {
    const curated = await fetchCuratedDigest('.');
    const data = curated || (await fetchGeekDigest());
    const top4 = (data.items || []).slice(0, 4);
    if (!top4.length) throw new Error('empty');

    if (curated && sourcesTagEl) {
      sourcesTagEl.textContent = `✦ Muse 定刊 · ${curated.date || '今日'}`;
    }

    listEl.innerHTML = top4
      .map(
        (item) => `
          <div class="digest-mini-item">
            <span class="source-badge source-${escapeHtml(item.source)}">${escapeHtml(item.sourceLabel)}</span>
            <span class="digest-mini-title">${escapeHtml(item.zhTitle || item.title)}</span>
            <span class="digest-mini-meta">${escapeHtml(item.meta)}</span>
          </div>
        `
      )
      .join('');
  } catch (_) {
    listEl.innerHTML = `
      <div class="digest-mini-item">
        <span class="digest-mini-title">点击进入「极客早报」查看 HN / GitHub / V2EX / DEV.to 精选</span>
      </div>
    `;
  }
}

// 7. 首页内联「今日一词 / 每日一问」互动卡片
async function initQotdWidget() {
  const bodyEl = document.getElementById('homeQotdBody');
  const tabTip = document.getElementById('homeTabTip');
  const tabQ = document.getElementById('homeTabQ');
  const btnRoll = document.getElementById('btnQotdRoll');

  let data;
  try {
    const res = await fetch('./data/daily-bits.json');
    data = await res.json();
  } catch (_) {
    bodyEl.innerHTML = `<div style="font-size:13px;color:var(--text-muted);">暂无法加载每日一词题库</div>`;
    return;
  }

  let qMode = 'tip'; // 'tip' | 'question'
  let tipIdx = getDailyItemIndex(data.tips.length, 0, 13);
  let qIdx = getDailyItemIndex(data.questions.length, 0, 29);
  let answerVisible = false;

  function renderQotd() {
    tabTip.classList.toggle('active', qMode === 'tip');
    tabQ.classList.toggle('active', qMode === 'question');

    if (qMode === 'tip') {
      const tip = data.tips[tipIdx];
      bodyEl.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;">
          <strong style="font-size:15px;">${escapeHtml(tip.title)}</strong>
          <span class="tag">${escapeHtml(tip.category)}</span>
        </div>
        <div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:6px;">${escapeHtml(tip.subtitle)}</div>
        <pre class="qotd-code">${escapeHtml(tip.snippet)}</pre>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:8px;">
          <span style="font-size:12px;color:var(--text-muted);flex:1;min-width:180px;">${escapeHtml(tip.takeaway)}</span>
          <button class="btn btn-sm" id="btnCopyHomeTip">复制命令/片段</button>
        </div>
      `;
      document.getElementById('btnCopyHomeTip').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const ok = await copyText(tip.snippet);
        btn.textContent = ok ? '✓ 已复制' : '复制失败';
        setTimeout(() => {
          btn.textContent = '复制命令/片段';
        }, 1400);
      });
    } else {
      const q = data.questions[qIdx];
      bodyEl.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
          <span class="tag">${escapeHtml(q.category)}</span>
          <button class="btn btn-sm btn-primary" id="btnToggleHomeAnswer">${answerVisible ? '收起解析' : '查看参考解析'}</button>
        </div>
        <div style="font-size:14.5px;font-weight:500;line-height:1.55;margin-bottom:6px;">${escapeHtml(q.question)}</div>
        <div style="font-size:12px;color:var(--text-muted);">提示：${escapeHtml(q.hint)}</div>
        ${
          answerVisible
            ? `<div class="qotd-answer">${escapeHtml(q.answer)}</div>`
            : ''
        }
      `;
      document.getElementById('btnToggleHomeAnswer').addEventListener('click', () => {
        answerVisible = !answerVisible;
        renderQotd();
      });
    }
  }

  tabTip.addEventListener('click', () => {
    qMode = 'tip';
    renderQotd();
  });

  tabQ.addEventListener('click', () => {
    qMode = 'question';
    answerVisible = false;
    renderQotd();
  });

  btnRoll.addEventListener('click', () => {
    if (qMode === 'tip' && data.tips.length > 1) {
      let next = tipIdx;
      while (next === tipIdx) next = Math.floor(Math.random() * data.tips.length);
      tipIdx = next;
    } else if (qMode === 'question' && data.questions.length > 1) {
      let next = qIdx;
      while (next === qIdx) next = Math.floor(Math.random() * data.questions.length);
      qIdx = next;
      answerVisible = false;
    }
    renderQotd();
  });

  renderQotd();
}

// 8. 加载 NBA 迷你预览（按上海时间当日赛程，最多 3 场，主队优先）
async function initNbaWidget() {
  const listEl = document.getElementById('nbaMiniList');
  const favTeam = localStorage.getItem('nba_fav_team') ?? SITE_CONFIG.nba.defaultFavoriteTeam;
  const spoilerFree = localStorage.getItem('nba_spoiler_free') === '1';
  const sh = getShanghaiDate(0);

  try {
    const data = await fetchNbaScoreboardByShanghaiOffset(0);
    let events = data.events || [];

    if (events.length === 0) {
      listEl.innerHTML = `
        <div class="nba-mini-game" style="grid-column:1 / -1;">
          <div class="nba-mini-status"><span>${sh.displayDate} (上海时间)</span><span>休赛日 / 暂无比赛</span></div>
          <div class="nba-mini-row" style="color:var(--text-secondary);"><span>点击进入 NBA 看板查看昨日赛果、战绩榜与明日赛程</span><span>→</span></div>
        </div>
      `;
      return;
    }

    events = [...events].sort((a, b) => {
      const aFav = isFavGame(a, favTeam) ? 1 : 0;
      const bFav = isFavGame(b, favTeam) ? 1 : 0;
      if (aFav !== bFav) return bFav - aFav;
      const aLive = a.status?.type?.state === 'in' ? 1 : 0;
      const bLive = b.status?.type?.state === 'in' ? 1 : 0;
      return bLive - aLive;
    });

    const top3 = events.slice(0, 3);
    listEl.innerHTML = top3
      .map((ev) => {
        const comp = ev.competitions?.[0];
        const away = comp?.competitors?.find((c) => c.homeAway === 'away');
        const home = comp?.competitors?.find((c) => c.homeAway === 'home');
        const state = ev.status?.type?.state;
        const statusText =
          state === 'in'
            ? `<span class="live-badge">● LIVE ${escapeHtml(ev.status?.type?.shortDetail || '')}</span>`
            : state === 'post'
            ? '<span>已结束</span>'
            : `<span>${formatShanghaiEventTime(ev.date).hm} 上海</span>`;
        const favStar = isFavGame(ev, favTeam) ? '★ ' : '';
        const blurClass = spoilerFree && state !== 'pre' ? 'spoiler-hidden' : '';
        return `
          <div class="nba-mini-game">
            <div class="nba-mini-status">
              <span>${favStar}${escapeHtml(away?.team?.abbreviation || 'AWY')} @ ${escapeHtml(home?.team?.abbreviation || 'HME')}</span>
              ${statusText}
            </div>
            <div class="nba-mini-row">
              <span>${escapeHtml(away?.team?.shortDisplayName || away?.team?.abbreviation || '-')}</span>
              <strong class="${blurClass}">${state === 'pre' ? '-' : escapeHtml(away?.score ?? '-')}</strong>
            </div>
            <div class="nba-mini-row">
              <span>${escapeHtml(home?.team?.shortDisplayName || home?.team?.abbreviation || '-')}</span>
              <strong class="${blurClass}">${state === 'pre' ? '-' : escapeHtml(home?.score ?? '-')}</strong>
            </div>
          </div>
        `;
      })
      .join('');
  } catch (_) {
    listEl.innerHTML = `
      <div class="nba-mini-game" style="grid-column:1 / -1;">
        <div class="nba-mini-status"><span>NBA 看板</span><span>点击查看完整赛程</span></div>
        <div class="nba-mini-row" style="color:var(--text-secondary);"><span>实时比分、站内 Box Score 与东西部战绩榜</span><span>→</span></div>
      </div>
    `;
  }
}

function isFavGame(ev, favAbbr) {
  if (!favAbbr) return false;
  const comps = ev.competitions?.[0]?.competitors || [];
  return comps.some((c) => isSameNbaTeam(c.team?.abbreviation, favAbbr));
}

// 9. 本地草稿便签（localStorage）
const scratchEl = document.getElementById('scratchpad');
const scratchStatus = document.getElementById('scratchStatus');
const SCRATCH_KEY = 'dev_hub_scratchpad_v1';

try {
  scratchEl.value = localStorage.getItem(SCRATCH_KEY) || '';
} catch (_) {}

let saveTimer;
scratchEl.addEventListener('input', () => {
  scratchStatus.textContent = '保存中...';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(SCRATCH_KEY, scratchEl.value);
      scratchStatus.textContent = '已存本机';
    } catch (_) {
      scratchStatus.textContent = '存储受限';
    }
  }, 260);
});

// 10. 键盘快捷键 (1 - 6)
document.addEventListener('keydown', (e) => {
  const tag = (e.target?.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || e.metaKey || e.ctrlKey || e.altKey) return;

  if (e.key === '1') {
    if (SITE_CONFIG.openToolsInWorkspace) {
      window.location.href = './tools/';
    } else {
      window.open(SITE_CONFIG.tools.itTools.url, '_blank', 'noopener,noreferrer');
    }
  } else if (e.key === '2') {
    window.location.href = './vinyl/';
  } else if (e.key === '3') {
    window.location.href = './film/';
  } else if (e.key === '4') {
    window.location.href = './digest/';
  } else if (e.key === '5') {
    window.location.href = './nba/';
  } else if (e.key === '6') {
    window.location.href = './hana/';
  }
});

initVinylWidget();
initFilmWidget();
initDigestWidget();
initQotdWidget();
initNbaWidget();
