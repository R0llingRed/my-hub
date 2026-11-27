import { SITE_CONFIG } from '../config.js';
import {
  escapeHtml,
  fetchNbaScoreboardByShanghaiOffset,
  fetchNbaStandings,
  fetchNbaSummary,
  formatShanghaiEventTime,
  getShanghaiDate,
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
const drawerBody = document.getElementById('drawerBody');
const btnCloseDrawer = document.getElementById('btnCloseDrawer');

let currentView = 'games'; // 'games' | 'standings'
let currentOffset = 0;
let spoilerFree = localStorage.getItem('nba_spoiler_free') === '1';
let favTeam = localStorage.getItem('nba_fav_team') ?? SITE_CONFIG.nba.defaultFavoriteTeam;
let refreshIntervalSec = Number(localStorage.getItem('nba_refresh_sec') ?? '15');
let cachedEvents = [];
let cachedStandings = null;
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
      const state = ev.status?.type?.state;
      const fav = isFavGame(ev);

      const awayScore = Number(away?.score ?? 0);
      const homeScore = Number(home?.score ?? 0);
      const awayClass = state === 'post' ? (awayScore >= homeScore ? 'winner' : 'loser') : '';
      const homeClass = state === 'post' ? (homeScore >= awayScore ? 'winner' : 'loser') : '';

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
          const isFav = favTeam && team.abbreviation === favTeam;
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
  boardSubtitle.textContent = '正在拉取东西部战绩榜...';
  standingsGrid.innerHTML = `<div class="card empty-state" style="grid-column:1 / -1;">Fetching NBA Standings...</div>`;
  try {
    cachedStandings = await fetchNbaStandings();
    renderStandings();
  } catch (err) {
    standingsGrid.innerHTML = `<div class="card empty-state" style="grid-column:1 / -1;">加载战绩榜失败：${escapeHtml(err.message)}</div>`;
  }
}

// ==================== 站内 Box Score 抽屉 ====================
function closeDrawer() {
  boxscoreDrawer.classList.remove('open');
  document.body.style.overflow = '';
}

btnCloseDrawer.addEventListener('click', closeDrawer);
boxscoreDrawer.addEventListener('click', (e) => {
  if (e.target === boxscoreDrawer) closeDrawer();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && boxscoreDrawer.classList.contains('open')) {
    closeDrawer();
  }
});

async function openBoxScoreDrawer(eventId, matchup, state) {
  drawerTitle.textContent = matchup || '比赛技术统计';
  boxscoreDrawer.classList.add('open');
  document.body.style.overflow = 'hidden';

  if (spoilerFree && state !== 'pre') {
    drawerBody.innerHTML = `
      <div class="card" style="text-align:center;padding:36px 20px;">
        <div style="font-size:28px;margin-bottom:10px;">🙈</div>
        <div style="font-size:15px;font-weight:600;margin-bottom:8px;">当前已开启「防剧透模式」</div>
        <p style="font-size:13px;color:var(--text-secondary);margin:0 0 18px;">技术统计会直接显示本场实时/终场比分与球员数据。</p>
        <button class="btn btn-primary" id="btnRevealBoxscore">查看本场数据（临时取消防剧透）</button>
      </div>
    `;
    document.getElementById('btnRevealBoxscore').addEventListener('click', () => {
      loadAndRenderBoxscore(eventId);
    });
    return;
  }

  await loadAndRenderBoxscore(eventId);
}

async function loadAndRenderBoxscore(eventId) {
  drawerBody.innerHTML = `<div style="font-family:var(--font-mono);font-size:13px;color:var(--text-muted);padding:32px 0;text-align:center;">正在拉取完整 Box Score...</div>`;

  try {
    const data = await fetchNbaSummary(eventId);
    renderBoxscoreBody(data);
  } catch (err) {
    drawerBody.innerHTML = `<div style="color:#fda4af;padding:24px 0;text-align:center;">暂无法加载技术统计：${escapeHtml(err.message)}</div>`;
  }
}

function getTeamStatValue(teamStatsArr, key) {
  const item = (teamStatsArr || []).find((s) => s.name === key);
  return item?.displayValue ?? '-';
}

function renderBoxscoreBody(data) {
  const comp = data.header?.competitions?.[0];
  const competitors = comp?.competitors || [];
  const away = competitors.find((c) => c.homeAway === 'away') || competitors[0];
  const home = competitors.find((c) => c.homeAway === 'home') || competitors[1];
  const state = comp?.status?.type?.state;
  const statusText = comp?.status?.type?.shortDetail || comp?.status?.type?.description || '';

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
    drawerBody.innerHTML = `
      ${matchupHtml}
      <div class="card" style="text-align:center;padding:32px 18px;">
        <div style="font-size:14px;margin-bottom:6px;">比赛尚未开始，开赛后将展示单节比分与完整球员技术统计</div>
        <div style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);">上海时间 ${tipoff.mdhm}${venue ? ` · ${escapeHtml(venue)}` : ''}</div>
      </div>
    `;
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
  const awayBox = teamBoxes.find((t) => t.team?.id === away?.id) || teamBoxes[0];
  const homeBox = teamBoxes.find((t) => t.team?.id === home?.id) || teamBoxes[1];
  const statPairs = [
    ['投篮命中率', 'fieldGoalPct', '%'],
    ['三分命中率', 'threePointFieldGoalPct', '%'],
    ['罚球命中率', 'freeThrowPct', '%'],
    ['总篮板', 'totalRebounds', ''],
    ['助攻', 'assists', ''],
    ['失误', 'turnovers', ''],
  ];

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
                ${escapeHtml(av)}${av !== '-' ? suffix : ''} <span style="color:var(--text-muted);">vs</span> ${escapeHtml(hv)}${hv !== '-' ? suffix : ''}
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

  function renderPlayerTable(teamIdx) {
    const teamBlock = playersTeams[teamIdx];
    const statBlock = teamBlock?.statistics?.[0];
    if (!statBlock) return '<div style="padding:16px;color:var(--text-muted);">暂无球员统计</div>';
    const labels = statBlock.labels || [];
    const colIndices = desiredCols
      .map((name) => ({ name, idx: labels.indexOf(name) }))
      .filter((c) => c.idx !== -1);

    const athletes = statBlock.athletes || [];
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
              `<button class="qotd-tab ${i === 0 ? 'active' : ''}" data-box-team="${i}">${escapeHtml(pt.team?.abbreviation || `Team ${i + 1}`)}</button>`
          )
          .join('')}
      </div>
    </div>
    <div id="playerBoxContainer">${renderPlayerTable(0)}</div>
  `;

  drawerBody.querySelectorAll('[data-box-team]').forEach((tab) => {
    tab.addEventListener('click', () => {
      drawerBody.querySelectorAll('[data-box-team]').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('playerBoxContainer').innerHTML = renderPlayerTable(Number(tab.dataset.boxTeam));
    });
  });
}

// ==================== 加载与视图控制 ====================
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
    if (currentView === 'games') renderGames();
    scheduleAutoRefresh();
  } catch (err) {
    if (!silent) {
      boardSubtitle.textContent = `加载失败`;
      gamesGrid.innerHTML = `
        <div class="card empty-state">
          <div style="margin-bottom:8px;">暂时无法连接到 NBA 数据源</div>
          <div style="font-size:12px;color:var(--text-muted);">${escapeHtml(err.message)}</div>
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
  if (refreshIntervalSec <= 0 || currentOffset !== 0 || currentView !== 'games') return;

  refreshTimer = setInterval(() => {
    if (document.hidden) return;
    if (!hasLiveGame(cachedEvents)) return;
    loadGames(currentOffset, { silent: true });
  }, refreshIntervalSec * 1000);
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
      renderGames();
      scheduleAutoRefresh();
    } else {
      dateTabs.style.display = 'none';
      gamesGrid.style.display = 'none';
      standingsGrid.style.display = 'grid';
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
      if (cachedStandings) {
        renderStandings();
      } else {
        loadStandings();
      }
    }
  });
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && refreshIntervalSec > 0 && currentOffset === 0 && currentView === 'games' && hasLiveGame(cachedEvents)) {
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
