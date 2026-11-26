import {
  buildFallbackCover,
  fetchItunesMetadata,
  findTrackPreview,
  formatCountdown,
  getBeijingDate,
  getDailyAlbumIndex,
  startClock,
} from './common.js';

startClock(
  document.getElementById('clockDate'),
  document.getElementById('clockTime')
);

const audio = document.getElementById('audioPlayer');
const vinylRecord = document.getElementById('vinylRecord');
const nowPlayingBar = document.getElementById('nowPlayingBar');
const nowPlayingTitle = document.getElementById('nowPlayingTitle');
const btnPlayPause = document.getElementById('btnPlayPause');
const progressTrack = document.getElementById('progressTrack');
const progressFill = document.getElementById('progressFill');
const audioTimeLabel = document.getElementById('audioTimeLabel');
const btnToday = document.getElementById('btnToday');
const shelfSection = document.getElementById('shelfSection');
const shelfGrid = document.getElementById('shelfGrid');

let albums = [];
let currentAlbumIdx = 0;
let todayAlbumIdx = 0;
let currentPreviews = {};
let activeTrackIdx = -1;
let isScrubbing = false;

function formatSec(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = String(Math.floor(sec % 60)).padStart(2, '0');
  return `${m}:${s}`;
}

function updateProgressUI(currentTime, duration) {
  const dur = Number.isFinite(duration) && duration > 0 ? duration : 30;
  const pct = Math.min(100, Math.max(0, (currentTime / dur) * 100));
  progressFill.style.width = `${pct}%`;
  progressTrack.setAttribute('aria-valuenow', String(Math.round(pct)));
  audioTimeLabel.textContent = `${formatSec(currentTime)} / ${formatSec(dur)}`;
}

// 零点换碟倒计时
function startMidnightCountdown() {
  const el = document.getElementById('midnightCountdown');
  let lastDay = getBeijingDate(0).dayNumber;

  const tick = () => {
    const bj = getBeijingDate(0);
    el.textContent = `距离 00:00 自动换碟 ${formatCountdown(bj.msUntilMidnight)}`;
    if (bj.dayNumber !== lastDay && albums.length > 0) {
      lastDay = bj.dayNumber;
      todayAlbumIdx = getDailyAlbumIndex(albums.length, 0);
      renderAlbum(todayAlbumIdx, '今日推荐 · 刚过零点已自动换碟');
      renderShelf();
    }
  };
  tick();
  setInterval(tick, 1000);
}

function stopPlayback() {
  audio.pause();
  audio.currentTime = 0;
  vinylRecord.classList.remove('spinning');
  nowPlayingBar.classList.remove('visible');
  progressFill.style.width = '0%';
  activeTrackIdx = -1;
  document.querySelectorAll('.track-item.active').forEach((el) => el.classList.remove('active'));
}

async function renderAlbum(idx, badgeText) {
  stopPlayback();
  currentAlbumIdx = idx;
  const album = albums[idx];
  const accent = album.accentColor || '#6366f1';

  document.documentElement.style.setProperty('--vinyl-accent', accent);
  document.getElementById('ambientGlow').style.background = `
    radial-gradient(ellipse 70% 50% at 30% 15%, ${accent}26, transparent 68%)
  `;

  const isToday = idx === todayAlbumIdx;
  btnToday.style.display = isToday ? 'none' : 'inline-flex';
  document.getElementById('dayBadge').textContent = badgeText || (isToday ? `${getBeijingDate(0).displayDate} · 今日一碟` : '随机 / 历史唱片');
  document.getElementById('albumYear').textContent = album.year;
  document.getElementById('albumGenre').textContent = album.genre;
  document.getElementById('albumIndexBadge').textContent = `#${String(idx + 1).padStart(2, '0')} / ${albums.length}`;
  document.getElementById('albumTitle').textContent = album.title;
  document.getElementById('albumArtist').textContent = album.artist;
  document.getElementById('albumReview').textContent = album.review;
  document.getElementById('trackCount').textContent = `${album.tracks.length} 首`;
  document.title = `${album.title} — 今日一碟`;

  const coverEl = document.getElementById('albumCover');
  coverEl.src = buildFallbackCover(album);

  // 外部听歌直达链接
  const q = encodeURIComponent(`${album.artist} ${album.title}`);
  document.getElementById('listenLinks').innerHTML = `
    <a class="btn btn-sm" href="https://music.163.com/#/search/m/?s=${q}&type=10" target="_blank" rel="noopener noreferrer">网易云音乐 ↗</a>
    <a class="btn btn-sm" href="https://open.spotify.com/search/${q}" target="_blank" rel="noopener noreferrer">Spotify ↗</a>
    <a class="btn btn-sm" href="https://music.apple.com/search?term=${q}" target="_blank" rel="noopener noreferrer">Apple Music ↗</a>
    <a class="btn btn-sm" href="https://www.youtube.com/results?search_query=${q}+full+album" target="_blank" rel="noopener noreferrer">YouTube ↗</a>
  `;

  // 先渲染基础曲目表
  currentPreviews = {};
  renderTracks(album, {});

  // 异步拉取 iTunes 封面与 30s 试听
  const meta = await fetchItunesMetadata(album);
  if (currentAlbumIdx !== idx) return; // 防止快速切换时覆盖
  if (meta.artwork) {
    coverEl.src = meta.artwork;
  }
  currentPreviews = meta.previews || {};
  renderTracks(album, currentPreviews);
}

function renderTracks(album, previews) {
  const listEl = document.getElementById('tracklist');
  listEl.innerHTML = album.tracks
    .map((track, i) => {
      const matched = findTrackPreview(track.title, previews);
      const isActive = i === activeTrackIdx;
      return `
        <li class="track-item ${matched ? 'playable' : ''} ${isActive ? 'active' : ''}" data-idx="${i}">
          <div class="track-left">
            <span class="track-num">${isActive ? '▶' : String(i + 1).padStart(2, '0')}</span>
            <span class="track-title">${track.title}</span>
          </div>
          <div class="track-right">
            ${matched ? '<span class="preview-chip">▶ 30s</span>' : ''}
            <span>${track.duration}</span>
          </div>
        </li>
      `;
    })
    .join('');

  listEl.querySelectorAll('.track-item.playable').forEach((item) => {
    item.addEventListener('click', () => {
      const i = Number(item.dataset.idx);
      playTrack(i);
    });
  });
}

function playTrack(trackIdx) {
  const album = albums[currentAlbumIdx];
  const track = album.tracks[trackIdx];
  const matched = findTrackPreview(track.title, currentPreviews);
  if (!matched?.previewUrl) return;

  if (activeTrackIdx === trackIdx && !audio.paused) {
    audio.pause();
    return;
  }

  activeTrackIdx = trackIdx;
  audio.src = matched.previewUrl;
  audio.play().catch(() => {});
  nowPlayingTitle.textContent = track.title;
  nowPlayingBar.classList.add('visible');
  renderTracks(album, currentPreviews);
}

// Audio 事件绑定
audio.addEventListener('play', () => {
  vinylRecord.classList.add('spinning');
  btnPlayPause.textContent = '⏸ 暂停';
});

audio.addEventListener('pause', () => {
  vinylRecord.classList.remove('spinning');
  btnPlayPause.textContent = '▶ 继续';
});

audio.addEventListener('ended', () => {
  vinylRecord.classList.remove('spinning');
  progressFill.style.width = '0%';
  btnPlayPause.textContent = '▶ 重播';
});

audio.addEventListener('timeupdate', () => {
  if (!isScrubbing && audio.duration) {
    updateProgressUI(audio.currentTime, audio.duration);
  }
});

audio.addEventListener('loadedmetadata', () => {
  updateProgressUI(audio.currentTime, audio.duration);
});

// 支持点击与拖拽进度条定位播放
function seekByClientX(clientX) {
  const rect = progressTrack.getBoundingClientRect();
  if (!rect.width) return;
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 30;
  const targetTime = ratio * dur;
  updateProgressUI(targetTime, dur);
  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    audio.currentTime = targetTime;
  }
}

progressTrack.addEventListener('pointerdown', (e) => {
  isScrubbing = true;
  progressTrack.classList.add('dragging');
  progressTrack.setPointerCapture(e.pointerId);
  seekByClientX(e.clientX);
});

progressTrack.addEventListener('pointermove', (e) => {
  if (!isScrubbing) return;
  seekByClientX(e.clientX);
});

const finishScrub = (e) => {
  if (!isScrubbing) return;
  seekByClientX(e.clientX);
  isScrubbing = false;
  progressTrack.classList.remove('dragging');
};

progressTrack.addEventListener('pointerup', finishScrub);
progressTrack.addEventListener('pointercancel', finishScrub);

progressTrack.addEventListener('keydown', (e) => {
  if (!audio.duration) return;
  if (e.key === 'ArrowRight') {
    audio.currentTime = Math.min(audio.duration, audio.currentTime + 3);
  } else if (e.key === 'ArrowLeft') {
    audio.currentTime = Math.max(0, audio.currentTime - 3);
  }
});

btnPlayPause.addEventListener('click', () => {
  if (audio.paused) {
    audio.play().catch(() => {});
  } else {
    audio.pause();
  }
});

// 近期 7 天唱片架
function renderShelf() {
  const items = [];
  for (let offset = 0; offset >= -6; offset--) {
    const bj = getBeijingDate(offset);
    const idx = getDailyAlbumIndex(albums.length, offset);
    const a = albums[idx];
    items.push({ offset, bj, idx, album: a });
  }

  shelfGrid.innerHTML = items
    .map(
      ({ offset, bj, idx, album }) => `
      <button class="shelf-card ${idx === currentAlbumIdx ? 'selected' : ''}" data-idx="${idx}" data-label="${bj.displayDate}">
        <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-bottom:6px;">
          ${offset === 0 ? '今天 · ' : ''}${bj.dateStr}
        </div>
        <div style="font-size:14px;font-weight:600;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${album.title}
        </div>
        <div style="font-size:12px;color:var(--text-secondary);">
          ${album.artist} (${album.year})
        </div>
      </button>
    `
    )
    .join('');

  shelfGrid.querySelectorAll('.shelf-card').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      renderAlbum(idx, `${btn.dataset.label} · 唱片架回听`);
      renderShelf();
    });
  });
}

// 顶部按钮
btnToday.addEventListener('click', () => {
  renderAlbum(todayAlbumIdx);
  renderShelf();
});

document.getElementById('btnRandom').addEventListener('click', () => {
  if (albums.length <= 1) return;
  let next = currentAlbumIdx;
  while (next === currentAlbumIdx) {
    next = Math.floor(Math.random() * albums.length);
  }
  renderAlbum(next, '🎲 随机盲抽一碟');
  renderShelf();
});

document.getElementById('btnToggleShelf').addEventListener('click', () => {
  const isOpen = shelfSection.style.display !== 'none';
  shelfSection.style.display = isOpen ? 'none' : 'block';
});

async function init() {
  const res = await fetch('../data/albums.json');
  albums = await res.json();
  todayAlbumIdx = getDailyAlbumIndex(albums.length, 0);
  renderAlbum(todayAlbumIdx);
  renderShelf();
  startMidnightCountdown();
}

init();
