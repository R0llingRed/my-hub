import { SITE_CONFIG } from '../config.js';
import {
  escapeHtml,
  fetchNbaScoreboardByShanghaiOffset,
  fetchNbaStandings,
  fetchNbaSummary,
  formatShanghaiEventTime,
  getShanghaiDate,
  isSameNbaTeam,
  startClock,
} from './common.js';

startClock(
  document.getElementById('clockDate'),
  document.getElementById('clockTime')
);

const gamesGrid = document.getElementById('gamesGrid');
const standingsGrid = document.getElementById('standingsGrid');
const dateTabs = document.getElementById('dateTabs');
const boardSubtitle = document.getElementById('boardSubtitle');
const favTeamSelect = document.getElementById('favTeamSelect');
const autoRefreshSelect = document.getElementById('autoRefreshSelect');
const btnSpoiler = document.getElementById('btnSpoiler');

const boxscoreDrawer = document.getElementById('boxscoreDrawer');
const drawerTitle = document.getElementById('drawerTitle');
const drawerMeta = document.getElementById('drawerMeta');
const drawerBody = document.getElementById('drawerBody');
const btnRefreshDrawer = document.getElementById('btnRefreshDrawer');
const btnCloseDrawer = document.getElementById('btnCloseDrawer');

const PRE_GAME_WAKE_LEAD_MS = 5 * 60 * 1000;
const PRE_GAME_POLL_MAX_AFTER_MS = 2 * 60 * 60 * 1000;
const MAX_WAKE_WAIT_MS = 12 * 60 * 60 * 1000;

let currentView = 'games'; // 'games' | 'standings'
let currentOffset = 0;
let spoilerFree = localStorage.getItem('nba_spoiler_free') === '1';
let favTeam = localStorage.getItem('nba_fav_team') ?? SITE_CONFIG.nba.defaultFavoriteTeam;
let refreshIntervalSec = Number(localStorage.getItem('nba_refresh_sec') ?? '15');
if (!Number.isFinite(refreshIntervalSec) || refreshIntervalSec < 0) {
  refreshIntervalSec = 15;
}
let cachedEvents = [];
let cachedStandings = null;
let lastUpdatedStr = '';
let refreshTimer = null;
let gamesWakeTimer = null;
let isFetching = false;
let gamesRequestId = 0;
let standingsRequestId = 0;

let activeDrawerEventId = null;
let drawerGameState = null; // 'pre' | 'in' | 'post' | null
let drawerGameTipoffMs = null;
let drawerRevealed = false;
let drawerConfirmedSpoiler = false;
let drawerActiveTeamIdx = 0;
let drawerActiveTeamKey = null;
let drawerLastUpdatedStr = '';
let drawerRefreshTimer = null;
let drawerWakeTimer = null;
let isDrawerFetching = false;
let drawerSessionId = 0;

favTeamSelect.value = favTeam;
autoRefreshSelect.value = String(refreshIntervalSec);
updateSpoilerBtn();

function updateSpoilerBtn() {
  btnSpoiler.textContent = spoilerFree ? '🙈 防剧透：开' : '👀 防剧透：关';
  btnSpoiler.classList.toggle('btn-primary', spoilerFree);
}

function isFavGame(ev) {
  if (!favTeam) return false;
  return (ev.competitions?.[0]?.competitors || []).some((c) => isSameNbaTeam(c.team?.abbreviation, favTeam));
}

function hasLiveGame(events) {
  return events.some((ev) => ev.status?.type?.state === 'in');
}

function isNearOrPastTipoff(tipoffMs = drawerGameTipoffMs) {
  if (!Number.isFinite(tipoffMs)) return false;
  const now = Date.now();
  return now >= tipoffMs - PRE_GAME_WAKE_LEAD_MS && now <= tipoffMs + PRE_GAME_POLL_MAX_AFTER_MS;
}

function isGameImminent(ev) {
  if (ev?.status?.type?.state !== 'pre' || !ev?.date) return false;
  return isNearOrPastTipoff(new Date(ev.date).getTime());
}

function hasUpcomingGame(events) {
  return events.some((ev) => ev.status?.type?.state === 'pre');
}

function renderGames() {
  const sh = getShanghaiDate(currentOffset);
  const liveNow = hasLiveGame(cachedEvents);
  const imminentNow = currentOffset === 0 && cachedEvents.some(isGameImminent);
  const upcomingNow = currentOffset === 0 && hasUpcomingGame(cachedEvents);
  const autoTag =
    refreshIntervalSec > 0
      ? liveNow
        ? ` · 自动刷新 ${refreshIntervalSec}s`
        : imminentNow
        ? ` · 等待开赛 · 自动刷新 ${refreshIntervalSec}s`
        : upcomingNow
        ? ` · 自动刷新待机（开赛前生效）`
        : ''
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
      const state = ev.status?.type?.state;
      const fav = isFavGame(ev);

      const awayScore = Number(away?.score ?? 0);
      const homeScore = Number(home?.score ?? 0);
      const awayClass = state === 'post' && !spoilerFree ? (awayScore >= homeScore ? 'winner' : 'loser') : '';
      const homeClass = state === 'post' && !spoilerFree ? (homeScore >= awayScore ? 'winner' : 'loser') : '';

      const tipoff = formatShanghaiEventTime(ev.date);
      const statusHtml =
        state === 'in'
          ? `<span class="live-badge">● LIVE · ${escapeHtml(ev.status?.type?.shortDetail || '')}</span>`
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
          return `${escapeHtml(c.team?.abbreviation)}: ${escapeHtml(ptsLeader.athlete?.shortName || '')} ${escapeHtml(ptsLeader.displayValue)}分`;
        })
        .filter(Boolean)
        .join(' · ');

      return `
        <article class="card game-card ${fav ? 'fav-game' : ''}">
          <div class="game-top">
            <span>${fav ? '★ 主队焦点' : escapeHtml(comp?.venue?.fullName || 'NBA')}</span>
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
            <button class="btn btn-sm btn-primary btn-open-box" data-event-id="${escapeHtml(ev.id)}" data-state="${escapeHtml(state)}" data-matchup="${escapeHtml(away?.team?.abbreviation || 'AWY')} @ ${escapeHtml(home?.team?.abbreviation || 'HME')}">📊 站内统计</button>
            <a class="btn btn-sm" href="https://www.youtube.com/results?search_query=${ytQuery}" target="_blank" rel="noopener noreferrer">▶ YouTube 集锦</a>
            ${
              espnBox
                ? `<a class="btn btn-sm" href="${escapeHtml(espnBox)}" target="_blank" rel="noopener noreferrer">ESPN ↗</a>`
                : ''
            }
          </div>
        </article>
      `;
    })
    .join('');

  gamesGrid.querySelectorAll('.btn-open-box').forEach((btn) => {
    btn.addEventListener('click', () => {
      openBoxScoreDrawer(btn.dataset.eventId, btn.dataset.matchup, btn.dataset.state);
    });
  });
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
        ${team.logo ? `<img class="team-logo" src="${escapeHtml(team.logo)}" alt="${escapeHtml(team.abbreviation)}" loading="lazy" />` : ''}
        <div>
          <span class="team-name">${escapeHtml(team.shortDisplayName || team.abbreviation || 'TBD')}</span>
          ${record ? `<span class="team-record">${escapeHtml(record)}</span>` : ''}
        </div>
      </div>
      <div class="team-score ${scoreClass} ${blurClass}">${escapeHtml(scoreDisplay)}</div>
    </div>
  `;
}

// ==================== 东西部战绩榜 ====================
function getEntryStat(entry, name) {
  const s = (entry.stats || []).find((item) => item.name === name);
  return s ? { value: s.value, display: s.displayValue ?? String(s.value ?? '-') } : { value: 0, display: '-' };
}

function renderStandings() {
  if (!cachedStandings?.children?.length) {
    standingsGrid.innerHTML = `<div class="card empty-state">暂无战绩榜数据</div>`;
    return;
  }

  boardSubtitle.textContent = `NBA 东西部实时战绩榜 · 绿标 1-6 季后赛直通 · 黄标 7-10 附加赛`;

  standingsGrid.innerHTML = cachedStandings.children
    .map((conf) => {
      const confName = conf.name === 'Eastern Conference' ? '东部联盟 · Eastern' : conf.name === 'Western Conference' ? '西部联盟 · Western' : conf.name;
      const entries = [...(conf.standings?.entries || [])].sort(
        (a, b) => Number(getEntryStat(a, 'playoffSeed').value || 99) - Number(getEntryStat(b, 'playoffSeed').value || 99)
      );

      const rowsHtml = entries
        .map((entry, idx) => {
          const team = entry.team || {};
          const seed = Number(getEntryStat(entry, 'playoffSeed').value || idx + 1);
          const wins = getEntryStat(entry, 'wins').display;
          const losses = getEntryStat(entry, 'losses').display;
          const pct = getEntryStat(entry, 'winPercent').display;
          const gb = getEntryStat(entry, 'gamesBehind').display;
          const diff = getEntryStat(entry, 'differential').display;
          const isFav = Boolean(favTeam && isSameNbaTeam(team.abbreviation, favTeam));
          const seedClass = seed <= 6 ? 'seed-playoff' : seed <= 10 ? 'seed-playin' : '';

          return `
            <tr class="${seedClass} ${isFav ? 'fav-row' : ''}">
              <td>${seed}</td>
              <td>
                <div style="display:flex;align-items:center;gap:8px;">
                  ${team.logos?.[0]?.href ? `<img src="${escapeHtml(team.logos[0].href)}" alt="${escapeHtml(team.abbreviation)}" style="width:20px;height:20px;object-fit:contain;" loading="lazy" />` : ''}
                  <span style="font-family:var(--font-sans);font-weight:${isFav ? '700' : '500'};">${isFav ? '★ ' : ''}${escapeHtml(team.shortDisplayName || team.displayName || team.abbreviation)}</span>
                </div>
              </td>
              <td>${escapeHtml(wins)}-${escapeHtml(losses)}</td>
              <td>${escapeHtml(pct)}</td>
              <td>${escapeHtml(gb)}</td>
              <td style="color:${String(diff).startsWith('-') ? '#fda4af' : '#6ee7b7'};">${escapeHtml(diff)}</td>
            </tr>
          `;
        })
        .join('');

      return `
        <article class="card">
          <div class="card-header" style="margin-bottom:10px;">
            <span class="card-kicker">${escapeHtml(confName)}</span>
            <span style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">${entries.length} 支球队</span>
          </div>
          <div style="overflow-x:auto;">
            <table class="standings-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>球队</th>
                  <th>胜-负</th>
                  <th>胜率</th>
                  <th>胜差</th>
                  <th>净胜</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        </article>
      `;
    })
    .join('');
}

async function loadStandings() {
  const reqId = ++standingsRequestId;
  boardSubtitle.textContent = '正在拉取东西部战绩榜...';
  standingsGrid.innerHTML = `<div class="card empty-state" style="grid-column:1 / -1;">Fetching NBA Standings...</div>`;
  try {
    const data = await fetchNbaStandings();
    if (reqId !== standingsRequestId) return;
    cachedStandings = data;
    if (currentView === 'standings') {
      renderStandings();
    }
  } catch (err) {
    if (reqId !== standingsRequestId || currentView !== 'standings') return;
    boardSubtitle.textContent = '战绩榜加载失败';
    standingsGrid.innerHTML = `<div class="card empty-state" style="grid-column:1 / -1;">加载战绩榜失败：${escapeHtml(err.message)}</div>`;
  }
}

// ==================== 站内 Box Score 抽屉 ====================
function isDrawerOpen() {
  return boxscoreDrawer.classList.contains('open');
}

function shouldAutoRefreshDrawer() {
  if (refreshIntervalSec <= 0) return false;
  if (!isDrawerOpen() || !activeDrawerEventId || !drawerRevealed) return false;
  if (drawerGameState === 'in') return true;
  if (drawerGameState === 'pre' && isNearOrPastTipoff(drawerGameTipoffMs)) return true;
  return false;
}

function stopDrawerAutoRefresh() {
  if (drawerRefreshTimer) {
    clearTimeout(drawerRefreshTimer);
    drawerRefreshTimer = null;
  }
  if (drawerWakeTimer) {
    clearTimeout(drawerWakeTimer);
    drawerWakeTimer = null;
  }
}

function setDrawerRefreshButtonState(loading) {
  if (!btnRefreshDrawer) return;
  btnRefreshDrawer.disabled = loading;
  btnRefreshDrawer.textContent = loading ? '↻ 刷新中...' : '↻ 刷新';
}

function updateDrawerMeta({ error = false } = {}) {
  if (!drawerMeta) return;
  if (!drawerRevealed) {
    drawerMeta.textContent = '防剧透已开启 · 确认后加载数据';
    return;
  }

  const updatedPart = drawerLastUpdatedStr ? `更新于 ${escapeHtml(drawerLastUpdatedStr)}` : '';
  const errorPart = error
    ? shouldAutoRefreshDrawer()
      ? '本次刷新失败，稍后自动重试'
      : '本次刷新失败，请点击重试'
    : '';
  const parts = [];

  if (drawerGameState === 'in') {
    if (refreshIntervalSec > 0) {
      parts.push(`<span class="drawer-live-dot">● 自动刷新 ${refreshIntervalSec}s</span>`);
    } else {
      parts.push('自动刷新已关闭');
    }
  } else if (drawerGameState === 'pre') {
    if (refreshIntervalSec > 0 && isNearOrPastTipoff(drawerGameTipoffMs)) {
      parts.push(`<span class="drawer-live-dot">● 等待开赛 · 自动刷新 ${refreshIntervalSec}s</span>`);
    } else if (refreshIntervalSec > 0) {
      parts.push('未开赛 · 开赛前自动刷新');
    } else {
      parts.push('未开赛 · 自动刷新已关闭');
    }
  } else if (drawerGameState === 'post') {
    parts.push('比赛已结束');
  } else if (!updatedPart) {
    parts.push('正在拉取技术统计...');
  }

  if (updatedPart) parts.push(updatedPart);
  if (errorPart) parts.push(`<span style="color:#fda4af;">${errorPart}</span>`);

  drawerMeta.innerHTML = parts.join('<span>·</span>');
}

function scheduleDrawerAutoRefresh() {
  stopDrawerAutoRefresh();
  if (!isDrawerOpen() || !activeDrawerEventId || !drawerRevealed || refreshIntervalSec <= 0) {
    return;
  }

  const scheduledSession = drawerSessionId;
  if (shouldAutoRefreshDrawer()) {
    drawerRefreshTimer = setTimeout(() => {
      drawerRefreshTimer = null;
      if (scheduledSession !== drawerSessionId || !shouldAutoRefreshDrawer()) return;
      if (document.hidden) return;
      loadAndRenderBoxscore(activeDrawerEventId, { silent: true });
    }, refreshIntervalSec * 1000);
    return;
  }

  if (drawerGameState === 'pre' && Number.isFinite(drawerGameTipoffMs)) {
    const waitMs = drawerGameTipoffMs - PRE_GAME_WAKE_LEAD_MS - Date.now();
    if (waitMs > 0 && waitMs <= MAX_WAKE_WAIT_MS) {
      drawerWakeTimer = setTimeout(() => {
        drawerWakeTimer = null;
        if (scheduledSession !== drawerSessionId || !isDrawerOpen() || !drawerRevealed) return;
        updateDrawerMeta();
        if (document.hidden) return;
        loadAndRenderBoxscore(activeDrawerEventId, { silent: true });
      }, waitMs);
    }
  }
}

function showDrawerSpoilerShield(eventId) {
  stopDrawerAutoRefresh();
  drawerRevealed = false;
  drawerConfirmedSpoiler = false;
  btnRefreshDrawer.style.display = 'none';
  updateDrawerMeta();
  drawerBody.innerHTML = `
    <div class="card" style="text-align:center;padding:36px 20px;">
      <div style="font-size:28px;margin-bottom:10px;">🙈</div>
      <div style="font-size:15px;font-weight:600;margin-bottom:8px;">当前已开启「防剧透模式」</div>
      <p style="font-size:13px;color:var(--text-secondary);margin:0 0 18px;">技术统计会直接显示本场实时/终场比分与球员数据。</p>
      <button class="btn btn-primary" id="btnRevealBoxscore">查看本场数据（临时取消防剧透）</button>
    </div>
  `;
  document.getElementById('btnRevealBoxscore').addEventListener('click', () => {
    drawerRevealed = true;
    drawerConfirmedSpoiler = true;
    btnRefreshDrawer.style.display = '';
    loadAndRenderBoxscore(eventId);
  });
}

function closeDrawer() {
  stopDrawerAutoRefresh();
  drawerSessionId += 1;
  activeDrawerEventId = null;
  drawerGameState = null;
  drawerGameTipoffMs = null;
  drawerRevealed = false;
  drawerConfirmedSpoiler = false;
  drawerActiveTeamIdx = 0;
  drawerActiveTeamKey = null;
  drawerLastUpdatedStr = '';
  isDrawerFetching = false;
  setDrawerRefreshButtonState(false);
  boxscoreDrawer.classList.remove('open');
  document.body.style.overflow = '';
}

btnRefreshDrawer.addEventListener('click', () => {
  if (!activeDrawerEventId || !drawerRevealed) return;
  loadAndRenderBoxscore(activeDrawerEventId, {
    silent: false,
    preserveContent: Boolean(drawerLastUpdatedStr),
  });
});

btnCloseDrawer.addEventListener('click', closeDrawer);
boxscoreDrawer.addEventListener('click', (e) => {
  if (e.target === boxscoreDrawer) closeDrawer();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isDrawerOpen()) {
    closeDrawer();
  }
});

async function openBoxScoreDrawer(eventId, matchup, state) {
  stopDrawerAutoRefresh();
  drawerSessionId += 1;
  activeDrawerEventId = eventId;
  drawerGameState = state || null;
  const matchedEvent = cachedEvents.find((ev) => String(ev.id) === String(eventId));
  drawerGameTipoffMs = matchedEvent?.date ? new Date(matchedEvent.date).getTime() : null;
  drawerActiveTeamIdx = 0;
  drawerActiveTeamKey = null;
  drawerLastUpdatedStr = '';
  isDrawerFetching = false;
  setDrawerRefreshButtonState(false);

  drawerTitle.textContent = matchup || '比赛技术统计';
  drawerBody.scrollTop = 0;
  boxscoreDrawer.classList.add('open');
  document.body.style.overflow = 'hidden';

  if (spoilerFree && state !== 'pre') {
    showDrawerSpoilerShield(eventId);
    return;
  }

  drawerRevealed = true;
  drawerConfirmedSpoiler = !spoilerFree;
  btnRefreshDrawer.style.display = '';
  await loadAndRenderBoxscore(eventId);
}

async function loadAndRenderBoxscore(eventId, { silent = false, preserveContent = false } = {}) {
  if (!eventId || !isDrawerOpen() || activeDrawerEventId !== eventId || !drawerRevealed) return;
  if (silent && isDrawerFetching) return;

  stopDrawerAutoRefresh();
  if (!silent) {
    drawerSessionId += 1;
  }
  const reqSession = drawerSessionId;
  isDrawerFetching = true;

  if (!silent) {
    setDrawerRefreshButtonState(true);
    if (!preserveContent) {
      updateDrawerMeta();
      drawerBody.innerHTML = `<div style="font-family:var(--font-mono);font-size:13px;color:var(--text-muted);padding:32px 0;text-align:center;">正在拉取完整 Box Score...</div>`;
    }
  }

  try {
    const data = await fetchNbaSummary(eventId);
    if (reqSession !== drawerSessionId || !isDrawerOpen() || activeDrawerEventId !== eventId) return;

    const fetchedState = data.header?.competitions?.[0]?.status?.type?.state || null;
    if (spoilerFree && !drawerConfirmedSpoiler && !drawerLastUpdatedStr && fetchedState && fetchedState !== 'pre') {
      drawerGameState = fetchedState;
      showDrawerSpoilerShield(eventId);
      return;
    }

    const prevState = drawerGameState;
    drawerLastUpdatedStr = getShanghaiDate(0).timeStr;
    renderBoxscoreBody(data);
    updateDrawerMeta();

    if (prevState && drawerGameState && prevState !== drawerGameState && currentView === 'games') {
      loadGames(currentOffset, { silent: true });
    }
  } catch (err) {
    if (reqSession !== drawerSessionId || !isDrawerOpen() || activeDrawerEventId !== eventId) return;
    if (!silent && !preserveContent) {
      drawerBody.innerHTML = `<div style="color:#fda4af;padding:24px 0;text-align:center;">暂无法加载技术统计：${escapeHtml(err.message)}</div>`;
    }
    updateDrawerMeta({ error: true });
  } finally {
    if (reqSession === drawerSessionId) {
      isDrawerFetching = false;
      setDrawerRefreshButtonState(false);
      scheduleDrawerAutoRefresh();
    }
  }
}

function getTeamStatValue(teamStatsArr, key) {
  const item = (teamStatsArr || []).find((s) => s.name === key);
  return item?.displayValue ?? '-';
}

function renderBoxscoreBody(data) {
  const prevScrollTop = drawerBody.scrollTop;
  const prevBoxScrollLefts = Array.from(drawerBody.querySelectorAll('.box-scroll')).map((el) => el.scrollLeft);

  const comp = data.header?.competitions?.[0];
  const competitors = comp?.competitors || [];
  const away = competitors.find((c) => c.homeAway === 'away') || competitors[0];
  const home = competitors.find((c) => c.homeAway === 'home') || competitors[1];
  const state = comp?.status?.type?.state || null;
  const statusText = comp?.status?.type?.shortDetail || comp?.status?.type?.description || '';

  drawerGameState = state;
  if (comp?.date) {
    const tipoffMs = new Date(comp.date).getTime();
    if (Number.isFinite(tipoffMs)) {
      drawerGameTipoffMs = tipoffMs;
    }
  }

  drawerTitle.textContent = `${away?.team?.abbreviation || 'AWY'} @ ${home?.team?.abbreviation || 'HME'} · ${statusText}`;

  const awayLogo = away?.team?.logos?.[0]?.href || away?.team?.logo || '';
  const homeLogo = home?.team?.logos?.[0]?.href || home?.team?.logo || '';

  const matchupHtml = `
    <div class="drawer-matchup">
      <div class="drawer-team-box">
        ${awayLogo ? `<img src="${escapeHtml(awayLogo)}" style="width:42px;height:42px;object-fit:contain;" />` : ''}
        <div style="font-weight:600;font-size:14px;">${escapeHtml(away?.team?.displayName || away?.team?.abbreviation || '客队')}</div>
        <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">${escapeHtml(away?.record?.[0]?.summary || '')}</div>
      </div>
      <div style="text-align:center;">
        <div class="drawer-team-score">${state === 'pre' ? 'VS' : `${escapeHtml(away?.score ?? 0)} : ${escapeHtml(home?.score ?? 0)}`}</div>
        <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-top:4px;">${escapeHtml(statusText)}</div>
      </div>
      <div class="drawer-team-box">
        ${homeLogo ? `<img src="${escapeHtml(homeLogo)}" style="width:42px;height:42px;object-fit:contain;" />` : ''}
        <div style="font-weight:600;font-size:14px;">${escapeHtml(home?.team?.displayName || home?.team?.abbreviation || '主队')}</div>
        <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">${escapeHtml(home?.record?.[0]?.summary || '')}</div>
      </div>
    </div>
  `;

  if (state === 'pre' || !(data.boxscore?.players || []).length) {
    const tipoff = formatShanghaiEventTime(comp?.date);
    const venue = data.gameInfo?.venue?.fullName || '';
    const emptyTip =
      state === 'in'
        ? '比赛已开始，正在等待单节比分与球员技术统计同步...'
        : '比赛尚未开始，开赛后将展示单节比分与完整球员技术统计';
    drawerBody.innerHTML = `
      ${matchupHtml}
      <div class="card" style="text-align:center;padding:32px 18px;">
        <div style="font-size:14px;margin-bottom:6px;">${emptyTip}</div>
        <div style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);">上海时间 ${tipoff.mdhm}${venue ? ` · ${escapeHtml(venue)}` : ''}</div>
      </div>
    `;
    drawerBody.scrollTop = prevScrollTop;
    return;
  }

  // 单节比分表
  const maxQ = Math.max(away?.linescores?.length || 0, home?.linescores?.length || 0, 4);
  const qHeaders = Array.from({ length: maxQ }, (_, i) => (i < 4 ? `Q${i + 1}` : `OT${i - 3}`));
  const linescoreHtml = `
    <div style="margin-bottom:16px;">
      <div class="card-kicker" style="margin-bottom:8px;">单节比分 · Linescore</div>
      <div class="box-scroll">
        <table class="box-table">
          <thead>
            <tr>
              <th>球队</th>
              ${qHeaders.map((q) => `<th>${q}</th>`).join('')}
              <th>总分</th>
            </tr>
          </thead>
          <tbody>
            ${[away, home]
              .map((team) => {
                const ls = team?.linescores || [];
                return `
                  <tr>
                    <td><strong>${escapeHtml(team?.team?.abbreviation || '-')}</strong></td>
                    ${qHeaders.map((_, i) => `<td>${escapeHtml(ls[i]?.displayValue ?? '-')}</td>`).join('')}
                    <td><strong>${escapeHtml(team?.score ?? '-')}</strong></td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // 球队命中率与关键项对比
  const teamBoxes = data.boxscore?.teams || [];
  const awayTeamId = away?.team?.id ?? away?.id;
  const homeTeamId = home?.team?.id ?? home?.id;
  const awayBox = teamBoxes.find((t) => awayTeamId != null && String(t.team?.id) === String(awayTeamId)) || teamBoxes[0];
  const homeBox = teamBoxes.find((t) => homeTeamId != null && String(t.team?.id) === String(homeTeamId)) || teamBoxes[1];
  const statPairs = [
    ['投篮命中率', 'fieldGoalPct', '%'],
    ['三分命中率', 'threePointFieldGoalPct', '%'],
    ['罚球命中率', 'freeThrowPct', '%'],
    ['总篮板', 'totalRebounds', ''],
    ['助攻', 'assists', ''],
    ['失误', 'turnovers', ''],
  ];

  const formatStatWithSuffix = (val, suffix) => {
    const text = String(val ?? '-');
    if (text === '-' || !suffix || text.endsWith(suffix)) return escapeHtml(text);
    return `${escapeHtml(text)}${suffix}`;
  };

  const teamCompareHtml = `
    <div class="card-kicker">球队核心对比 · Team Stats</div>
    <div class="team-stat-grid">
      ${statPairs
        .map(([label, key, suffix]) => {
          const av = getTeamStatValue(awayBox?.statistics, key);
          const hv = getTeamStatValue(homeBox?.statistics, key);
          return `
            <div class="team-stat-cell">
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">${label}</div>
              <div style="font-size:13px;font-weight:600;">
                ${formatStatWithSuffix(av, suffix)} <span style="color:var(--text-muted);">vs</span> ${formatStatWithSuffix(hv, suffix)}
              </div>
            </div>
          `;
        })
        .join('')}
    </div>
  `;

  // 球员数据表（带主客队切换）
  const playersTeams = data.boxscore?.players || [];
  const desiredCols = ['MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'FG', '3PT', '+/-'];
  const getTeamTabKey = (pt, idx) => String(pt?.team?.id || pt?.team?.abbreviation || idx);

  function renderPlayerTable(teamIdx) {
    const teamBlock = playersTeams[teamIdx];
    const statBlock = teamBlock?.statistics?.[0];
    const athletes = statBlock?.athletes || [];
    if (!statBlock || !athletes.length) {
      return '<div style="padding:16px;color:var(--text-muted);text-align:center;">暂无球员统计，稍后自动同步</div>';
    }
    const labels = statBlock.labels || [];
    const colIndices = desiredCols
      .map((name) => ({ name, idx: labels.indexOf(name) }))
      .filter((c) => c.idx !== -1);

    const starters = athletes.filter((a) => a.starter);
    const bench = athletes.filter((a) => !a.starter);

    const renderGroup = (group, groupLabel) => {
      if (!group.length) return '';
      return `
        <tr>
          <td colspan="${colIndices.length + 1}" style="color:var(--text-muted);font-size:11px;background:rgba(255,255,255,0.02);">${groupLabel}</td>
        </tr>
        ${group
          .map((row) => {
            const name = row.athlete?.shortName || row.athlete?.displayName || '-';
            if (row.didNotPlay) {
              return `
                <tr class="dnp-row">
                  <td>${escapeHtml(name)}</td>
                  <td colspan="${colIndices.length}" style="text-align:left;">DNP${row.reason ? ` (${escapeHtml(row.reason)})` : ''}</td>
                </tr>
              `;
            }
            const stats = row.stats || [];
            return `
              <tr>
                <td><strong>${escapeHtml(name)}</strong></td>
                ${colIndices.map((c) => `<td>${escapeHtml(stats[c.idx] ?? '-')}</td>`).join('')}
              </tr>
            `;
          })
          .join('')}
      `;
    };

    return `
      <div class="box-scroll">
        <table class="box-table">
          <thead>
            <tr>
              <th>球员</th>
              ${colIndices.map((c) => `<th>${escapeHtml(c.name)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${renderGroup(starters, '首发 · Starters')}
            ${renderGroup(bench, '替补 · Bench')}
          </tbody>
        </table>
      </div>
    `;
  }

  if (drawerActiveTeamKey != null) {
    const matchedIdx = playersTeams.findIndex((pt, idx) => getTeamTabKey(pt, idx) === drawerActiveTeamKey);
    if (matchedIdx !== -1) {
      drawerActiveTeamIdx = matchedIdx;
    }
  }
  if (drawerActiveTeamIdx < 0 || drawerActiveTeamIdx >= playersTeams.length) {
    drawerActiveTeamIdx = 0;
  }
  if (playersTeams[drawerActiveTeamIdx]) {
    drawerActiveTeamKey = getTeamTabKey(playersTeams[drawerActiveTeamIdx], drawerActiveTeamIdx);
  }

  drawerBody.innerHTML = `
    ${matchupHtml}
    ${linescoreHtml}
    ${teamCompareHtml}
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;">
      <span class="card-kicker">球员数据 · Player Box Score</span>
      <div class="qotd-tabs">
        ${playersTeams
          .map(
            (pt, i) =>
              `<button class="qotd-tab ${i === drawerActiveTeamIdx ? 'active' : ''}" data-box-team="${i}">${escapeHtml(pt.team?.abbreviation || `Team ${i + 1}`)}</button>`
          )
          .join('')}
      </div>
    </div>
    <div id="playerBoxContainer">${renderPlayerTable(drawerActiveTeamIdx)}</div>
  `;

  drawerBody.scrollTop = prevScrollTop;
  drawerBody.querySelectorAll('.box-scroll').forEach((el, idx) => {
    if (prevBoxScrollLefts[idx] != null) {
      el.scrollLeft = prevBoxScrollLefts[idx];
    }
  });

  drawerBody.querySelectorAll('[data-box-team]').forEach((tab) => {
    tab.addEventListener('click', () => {
      drawerBody.querySelectorAll('[data-box-team]').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      drawerActiveTeamIdx = Number(tab.dataset.boxTeam);
      drawerActiveTeamKey = getTeamTabKey(playersTeams[drawerActiveTeamIdx], drawerActiveTeamIdx);
      document.getElementById('playerBoxContainer').innerHTML = renderPlayerTable(drawerActiveTeamIdx);
    });
  });
}

// ==================== 加载与视图控制 ====================
function shouldAutoRefreshGames() {
  if (refreshIntervalSec <= 0 || currentView !== 'games') return false;
  if (hasLiveGame(cachedEvents)) return true;
  if (currentOffset === 0 && cachedEvents.some(isGameImminent)) return true;
  return false;
}

function stopGamesAutoRefresh() {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  if (gamesWakeTimer) {
    clearTimeout(gamesWakeTimer);
    gamesWakeTimer = null;
  }
}

async function loadGames(offset, { silent = false } = {}) {
  if (silent && isFetching) return;

  stopGamesAutoRefresh();
  if (!silent) {
    gamesRequestId += 1;
  }
  const reqId = gamesRequestId;
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
    if (reqId !== gamesRequestId) return;
    cachedEvents = data.events || [];
    lastUpdatedStr = getShanghaiDate(0).timeStr;
    if (currentView === 'games') renderGames();
  } catch (err) {
    if (reqId !== gamesRequestId) return;
    if (!silent && currentView === 'games') {
      boardSubtitle.textContent = `加载失败`;
      gamesGrid.innerHTML = `
        <div class="card empty-state">
          <div style="margin-bottom:8px;">暂时无法连接到 NBA 数据源</div>
          <div style="font-size:12px;color:var(--text-muted);">${escapeHtml(err.message)}</div>
        </div>
      `;
    }
  } finally {
    if (reqId === gamesRequestId) {
      isFetching = false;
      scheduleAutoRefresh();
    }
  }
}

function scheduleAutoRefresh() {
  stopGamesAutoRefresh();
  if (refreshIntervalSec <= 0 || currentView !== 'games') return;

  const scheduledReqId = gamesRequestId;
  if (shouldAutoRefreshGames()) {
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      if (scheduledReqId !== gamesRequestId || !shouldAutoRefreshGames()) return;
      if (document.hidden) return;
      loadGames(currentOffset, { silent: true });
    }, refreshIntervalSec * 1000);
    return;
  }

  if (currentOffset === 0) {
    const now = Date.now();
    let earliestWait = Infinity;
    for (const ev of cachedEvents) {
      if (ev?.status?.type?.state !== 'pre' || !ev?.date) continue;
      const tipoffMs = new Date(ev.date).getTime();
      if (!Number.isFinite(tipoffMs)) continue;
      const waitMs = tipoffMs - PRE_GAME_WAKE_LEAD_MS - now;
      if (waitMs > 0 && waitMs < earliestWait) {
        earliestWait = waitMs;
      }
    }
    if (Number.isFinite(earliestWait) && earliestWait <= MAX_WAKE_WAIT_MS) {
      gamesWakeTimer = setTimeout(() => {
        gamesWakeTimer = null;
        if (scheduledReqId !== gamesRequestId || refreshIntervalSec <= 0 || currentView !== 'games' || currentOffset !== 0) return;
        if (document.hidden) return;
        loadGames(currentOffset, { silent: true });
      }, earliestWait);
    }
  }
}

document.querySelectorAll('.view-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.view-tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentView = btn.dataset.view;

    if (currentView === 'games') {
      dateTabs.style.display = 'flex';
      gamesGrid.style.display = 'grid';
      standingsGrid.style.display = 'none';
      if (!isFetching || lastUpdatedStr) {
        renderGames();
      }
      scheduleAutoRefresh();
    } else {
      dateTabs.style.display = 'none';
      gamesGrid.style.display = 'none';
      standingsGrid.style.display = 'grid';
      stopGamesAutoRefresh();
      if (cachedStandings) {
        renderStandings();
      } else {
        loadStandings();
      }
    }
  });
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (shouldAutoRefreshGames()) {
    loadGames(currentOffset, { silent: true });
  }
  if (shouldAutoRefreshDrawer()) {
    loadAndRenderBoxscore(activeDrawerEventId, { silent: true });
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
  if (currentView === 'games') {
    renderGames();
  } else {
    renderStandings();
  }
});

autoRefreshSelect.addEventListener('change', () => {
  refreshIntervalSec = Number(autoRefreshSelect.value);
  localStorage.setItem('nba_refresh_sec', String(refreshIntervalSec));
  if (currentView === 'games') {
    renderGames();
    scheduleAutoRefresh();
  }
  if (isDrawerOpen()) {
    updateDrawerMeta();
    scheduleDrawerAutoRefresh();
  }
});

btnSpoiler.addEventListener('click', () => {
  spoilerFree = !spoilerFree;
  localStorage.setItem('nba_spoiler_free', spoilerFree ? '1' : '0');
  updateSpoilerBtn();
  if (currentView === 'games') renderGames();
});

document.getElementById('btnRefresh').addEventListener('click', () => {
  if (currentView === 'games') {
    loadGames(currentOffset);
  } else {
    loadStandings();
  }
});

loadGames(0);
