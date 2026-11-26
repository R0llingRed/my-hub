import { SITE_CONFIG } from '../config.js';
import {
  fetchNbaScoreboardByShanghaiOffset,
  formatShanghaiEventTime,
  getShanghaiDate,
  startClock,
} from './common.js';

startClock(
  document.getElementById('clockDate'),
  document.getElementById('clockTime')
);

const gamesGrid = document.getElementById('gamesGrid');
const boardSubtitle = document.getElementById('boardSubtitle');
const favTeamSelect = document.getElementById('favTeamSelect');
const autoRefreshSelect = document.getElementById('autoRefreshSelect');
const btnSpoiler = document.getElementById('btnSpoiler');

let currentOffset = 0;
let spoilerFree = localStorage.getItem('nba_spoiler_free') === '1';
let favTeam = localStorage.getItem('nba_fav_team') ?? SITE_CONFIG.nba.defaultFavoriteTeam;
let refreshIntervalSec = Number(localStorage.getItem('nba_refresh_sec') ?? '15');
let cachedEvents = [];
let lastUpdatedStr = '';
let refreshTimer = null;
let isFetching = false;

favTeamSelect.value = favTeam;
autoRefreshSelect.value = String(refreshIntervalSec);
updateSpoilerBtn();

function updateSpoilerBtn() {
  btnSpoiler.textContent = spoilerFree ? '🙈 防剧透：开' : '👀 防剧透：关';
  btnSpoiler.classList.toggle('btn-primary', spoilerFree);
}

function isFavGame(ev) {
  if (!favTeam) return false;
  return (ev.competitions?.[0]?.competitors || []).some((c) => c.team?.abbreviation === favTeam);
}

function hasLiveGame(events) {
  return events.some((ev) => ev.status?.type?.state === 'in');
}

function renderGames() {
  const sh = getShanghaiDate(currentOffset);
  const liveNow = hasLiveGame(cachedEvents);
  const autoTag =
    refreshIntervalSec > 0
      ? liveNow
        ? ` · 自动刷新 ${refreshIntervalSec}s`
        : ` · 自动刷新待机（开赛后生效）`
      : '';
  const updatedTag = lastUpdatedStr ? ` · 更新于 ${lastUpdatedStr}` : '';

  if (!cachedEvents.length) {
    boardSubtitle.textContent = `${sh.displayDate} (上海时间) · 共 0 场比赛${updatedTag}`;
    gamesGrid.innerHTML = `
      <div class="card empty-state">
        <div style="font-size:28px;margin-bottom:10px;">🏀</div>
        <div style="font-size:15px;margin-bottom:6px;">${sh.displayDate}（上海时间）暂无 NBA 赛程</div>
        <div style="font-size:12.5px;color:var(--text-muted);">可以切换「昨日赛果」或「明日预告」查看</div>
      </div>
    `;
    return;
  }

  const sorted = [...cachedEvents].sort((a, b) => {
    const aFav = isFavGame(a) ? 1 : 0;
    const bFav = isFavGame(b) ? 1 : 0;
    if (aFav !== bFav) return bFav - aFav;
    const aLive = a.status?.type?.state === 'in' ? 1 : 0;
    const bLive = b.status?.type?.state === 'in' ? 1 : 0;
    if (aLive !== bLive) return bLive - aLive;
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  boardSubtitle.textContent = `${sh.displayDate} (上海时间) · 共 ${sorted.length} 场比赛${favTeam ? ` · 主队 ${favTeam} 置顶` : ''}${autoTag}${updatedTag}`;

  gamesGrid.innerHTML = sorted
    .map((ev) => {
      const comp = ev.competitions?.[0];
      const away = comp?.competitors?.find((c) => c.homeAway === 'away');
      const home = comp?.competitors?.find((c) => c.homeAway === 'home');
      const state = ev.status?.type?.state; // pre | in | post
      const fav = isFavGame(ev);

      const awayScore = Number(away?.score ?? 0);
      const homeScore = Number(home?.score ?? 0);
      const awayClass = state === 'post' ? (awayScore >= homeScore ? 'winner' : 'loser') : '';
      const homeClass = state === 'post' ? (homeScore >= awayScore ? 'winner' : 'loser') : '';

      const tipoff = formatShanghaiEventTime(ev.date);
      const statusHtml =
        state === 'in'
          ? `<span class="live-badge">● LIVE · ${ev.status?.type?.shortDetail || ''}</span>`
          : state === 'post'
          ? `<span>FINAL · 已结束</span>`
          : `<span>${tipoff.mdhm} 上海时间</span>`;

      const ytQuery = encodeURIComponent(
        `NBA Highlights ${away?.team?.displayName || away?.team?.abbreviation} vs ${home?.team?.displayName || home?.team?.abbreviation} ${sh.dateStr}`
      );
      const espnBox = ev.links?.find((l) => l.rel?.includes('boxscore'))?.href || ev.links?.[0]?.href || '';

      const leaders = (comp?.competitors || [])
        .map((c) => {
          const ptsLeader = c.leaders?.find((l) => l.name === 'points')?.leaders?.[0];
          if (!ptsLeader) return '';
          return `${c.team?.abbreviation}: ${ptsLeader.athlete?.shortName || ''} ${ptsLeader.displayValue}分`;
        })
        .filter(Boolean)
        .join(' · ');

      return `
        <article class="card game-card ${fav ? 'fav-game' : ''}">
          <div class="game-top">
            <span>${fav ? '★ 主队焦点' : comp?.venue?.fullName || 'NBA'}</span>
            ${statusHtml}
          </div>

          <div>
            ${renderTeamRow(away, state, awayClass)}
            ${renderTeamRow(home, state, homeClass)}
          </div>

          ${
            leaders && !spoilerFree
              ? `<div class="game-leader">得分领跑：${leaders}</div>`
              : ''
          }

          <div class="game-actions">
            <a class="btn btn-sm btn-primary" href="https://www.youtube.com/results?search_query=${ytQuery}" target="_blank" rel="noopener noreferrer">▶ YouTube 集锦</a>
            ${
              espnBox
                ? `<a class="btn btn-sm" href="${espnBox}" target="_blank" rel="noopener noreferrer">技术统计 ↗</a>`
                : ''
            }
          </div>
        </article>
      `;
    })
    .join('');
}

function renderTeamRow(competitor, state, scoreClass) {
  if (!competitor) return '';
  const team = competitor.team || {};
  const record = competitor.records?.[0]?.summary || '';
  const scoreDisplay = state === 'pre' ? '—' : competitor.score ?? '0';
  const blurClass = spoilerFree && state !== 'pre' ? 'spoiler-hidden' : '';

  return `
    <div class="team-row">
      <div class="team-info">
        ${team.logo ? `<img class="team-logo" src="${team.logo}" alt="${team.abbreviation}" loading="lazy" />` : ''}
        <div>
          <span class="team-name">${team.shortDisplayName || team.abbreviation || 'TBD'}</span>
          ${record ? `<span class="team-record">${record}</span>` : ''}
        </div>
      </div>
      <div class="team-score ${scoreClass} ${blurClass}">${scoreDisplay}</div>
    </div>
  `;
}

async function loadGames(offset, { silent = false } = {}) {
  if (isFetching) return;
  isFetching = true;
  currentOffset = offset;
  const sh = getShanghaiDate(offset);

  if (!silent) {
    boardSubtitle.textContent = `正在拉取 ${sh.displayDate}（上海时间）赛程...`;
    gamesGrid.innerHTML = `
      <div class="card empty-state">
        <div style="font-family:var(--font-mono);font-size:13px;">Fetching NBA scoreboard (Asia/Shanghai)...</div>
      </div>
    `;
  }

  try {
    const data = await fetchNbaScoreboardByShanghaiOffset(offset);
    cachedEvents = data.events || [];
    lastUpdatedStr = getShanghaiDate(0).timeStr;
    renderGames();
    scheduleAutoRefresh();
  } catch (err) {
    if (!silent) {
      boardSubtitle.textContent = `加载失败`;
      gamesGrid.innerHTML = `
        <div class="card empty-state">
          <div style="margin-bottom:8px;">暂时无法连接到 NBA 数据源</div>
          <div style="font-size:12px;color:var(--text-muted);">${err.message}</div>
        </div>
      `;
    }
  } finally {
    isFetching = false;
  }
}

function scheduleAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  // 仅在开启自动刷新、当前查看今日赛程、且有进行中比赛时定时拉取（避免无意义请求）
  if (refreshIntervalSec <= 0 || currentOffset !== 0) return;

  refreshTimer = setInterval(() => {
    if (document.hidden) return; // 标签页在后台时自动暂停
    if (!hasLiveGame(cachedEvents)) return;
    loadGames(currentOffset, { silent: true });
  }, refreshIntervalSec * 1000);
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && refreshIntervalSec > 0 && currentOffset === 0 && hasLiveGame(cachedEvents)) {
    loadGames(currentOffset, { silent: true });
  }
});

document.querySelectorAll('.date-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.date-tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    loadGames(Number(btn.dataset.offset));
  });
});

favTeamSelect.addEventListener('change', () => {
  favTeam = favTeamSelect.value;
  localStorage.setItem('nba_fav_team', favTeam);
  renderGames();
});

autoRefreshSelect.addEventListener('change', () => {
  refreshIntervalSec = Number(autoRefreshSelect.value);
  localStorage.setItem('nba_refresh_sec', String(refreshIntervalSec));
  renderGames();
  scheduleAutoRefresh();
});

btnSpoiler.addEventListener('click', () => {
  spoilerFree = !spoilerFree;
  localStorage.setItem('nba_spoiler_free', spoilerFree ? '1' : '0');
  updateSpoilerBtn();
  renderGames();
});

document.getElementById('btnRefresh').addEventListener('click', () => {
  loadGames(currentOffset);
});

loadGames(0);
