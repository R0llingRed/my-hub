import { SITE_CONFIG } from '../config.js';
import {
  buildFallbackCover,
  fetchItunesMetadata,
  fetchNbaScoreboardByShanghaiOffset,
  formatCountdown,
  formatShanghaiEventTime,
  getDailyAlbumIndex,
  getShanghaiDate,
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

// 2. 渲染 IT-Tools & CyberChef 卡片
function getToolHref(appKey, cfg) {
  if (SITE_CONFIG.openToolsInWorkspace) {
    return `./tools/?app=${appKey}`;
  }
  return cfg.url;
}

function renderToolCard(prefix, appKey, cfg, cardId) {
  const card = document.getElementById(cardId);
  card.href = getToolHref(appKey, cfg);
  if (SITE_CONFIG.openToolsInWorkspace) {
    card.removeAttribute('target');
    card.removeAttribute('rel');
  }
  document.getElementById(`${prefix}Name`).textContent = cfg.name;
  document.getElementById(`${prefix}Desc`).textContent = cfg.description;
  const tagsEl = document.getElementById(`${prefix}Tags`);
  tagsEl.innerHTML = cfg.tags.map((t) => `<span class="tag">${t}</span>`).join('');
}

renderToolCard('itTools', 'it-tools', SITE_CONFIG.tools.itTools, 'cardItTools');
renderToolCard('cyberChef', 'cyberchef', SITE_CONFIG.tools.cyberChef, 'cardCyberChef');

// 3. 渲染快捷链接
const quickLinksEl = document.getElementById('quickLinks');
quickLinksEl.innerHTML = SITE_CONFIG.extraLinks
  .map(
    (link) => `
      <a class="quick-link" href="${link.url}" target="_blank" rel="noopener noreferrer">
        <span>${link.name}</span>
        <span style="color:var(--text-muted);font-size:12px;">${link.desc}</span>
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

    // 异步拉取高清专辑封面
    const meta = await fetchItunesMetadata(album);
    if (meta.artwork) {
      thumbEl.src = meta.artwork;
    }
  } catch (err) {
    document.getElementById('vinylTitle').textContent = '今日一碟';
    document.getElementById('vinylSnippet').textContent = '点击进入完整黑胶唱片页';
  }

  // 零点换碟倒计时
  const countdownEl = document.getElementById('vinylCountdown');
  const updateCountdown = () => {
    const sh = getShanghaiDate(0);
    countdownEl.textContent = `换碟 ${formatCountdown(sh.msUntilMidnight)}`;
  };
  updateCountdown();
  setInterval(updateCountdown, 1000);
}

// 5. 加载 NBA 迷你预览（按上海时间当日赛程，最多 3 场，主队优先）
async function initNbaWidget() {
  const listEl = document.getElementById('nbaMiniList');
  const favTeam = localStorage.getItem('nba_fav_team') || SITE_CONFIG.nba.defaultFavoriteTeam;
  const sh = getShanghaiDate(0);

  try {
    const data = await fetchNbaScoreboardByShanghaiOffset(0);
    let events = data.events || [];

    if (events.length === 0) {
      listEl.innerHTML = `
        <div class="nba-mini-game" style="grid-column:1 / -1;">
          <div class="nba-mini-status"><span>${sh.displayDate} (上海时间)</span><span>休赛日 / 暂无比赛</span></div>
          <div class="nba-mini-row" style="color:var(--text-secondary);"><span>点击进入 NBA 看板查看昨日赛果与明日赛程</span><span>→</span></div>
        </div>
      `;
      return;
    }

    // 主队置顶，进行中的比赛靠前
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
            ? `<span class="live-badge">● LIVE ${ev.status?.type?.shortDetail || ''}</span>`
            : state === 'post'
            ? '<span>已结束</span>'
            : `<span>${formatShanghaiEventTime(ev.date).hm} 上海</span>`;
        const favStar = isFavGame(ev, favTeam) ? '★ ' : '';
        return `
          <div class="nba-mini-game">
            <div class="nba-mini-status">
              <span>${favStar}${away?.team?.abbreviation || 'AWY'} @ ${home?.team?.abbreviation || 'HME'}</span>
              ${statusText}
            </div>
            <div class="nba-mini-row">
              <span>${away?.team?.shortDisplayName || away?.team?.abbreviation || '-'}</span>
              <strong>${state === 'pre' ? '-' : away?.score ?? '-'}</strong>
            </div>
            <div class="nba-mini-row">
              <span>${home?.team?.shortDisplayName || home?.team?.abbreviation || '-'}</span>
              <strong>${state === 'pre' ? '-' : home?.score ?? '-'}</strong>
            </div>
          </div>
        `;
      })
      .join('');
  } catch (_) {
    listEl.innerHTML = `
      <div class="nba-mini-game" style="grid-column:1 / -1;">
        <div class="nba-mini-status"><span>NBA 看板</span><span>点击查看完整赛程</span></div>
        <div class="nba-mini-row" style="color:var(--text-secondary);"><span>实时比分、上海时间换算与 YouTube 集锦聚合</span><span>→</span></div>
      </div>
    `;
  }
}

function isFavGame(ev, favAbbr) {
  if (!favAbbr) return false;
  const comps = ev.competitions?.[0]?.competitors || [];
  return comps.some((c) => c.team?.abbreviation === favAbbr);
}

// 6. 本地草稿便签（localStorage）
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

// 7. 键盘快捷键 (1 / 2 / 3 / 4)
document.addEventListener('keydown', (e) => {
  const tag = (e.target?.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || e.metaKey || e.ctrlKey || e.altKey) return;

  if (e.key === '1') {
    if (SITE_CONFIG.openToolsInWorkspace) {
      window.location.href = './tools/?app=it-tools';
    } else {
      window.open(SITE_CONFIG.tools.itTools.url, '_blank', 'noopener,noreferrer');
    }
  } else if (e.key === '2') {
    if (SITE_CONFIG.openToolsInWorkspace) {
      window.location.href = './tools/?app=cyberchef';
    } else {
      window.open(SITE_CONFIG.tools.cyberChef.url, '_blank', 'noopener,noreferrer');
    }
  } else if (e.key === '3') {
    window.location.href = './vinyl/';
  } else if (e.key === '4') {
    window.location.href = './nba/';
  }
});

initVinylWidget();
initNbaWidget();
