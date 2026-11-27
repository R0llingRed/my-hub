import {
  buildFallbackCover,
  escapeHtml,
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
const quizAudio = document.getElementById('quizAudio');
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

const btnListened = document.getElementById('btnListened');
const starBtns = Array.from(document.querySelectorAll('.star-btn'));
const albumNoteInput = document.getElementById('albumNoteInput');

const NOTES_KEY = 'vinyl_notes_v1';
const QUIZ_BEST_KEY = 'vinyl_quiz_best_streak';

let albums = [];
let currentAlbumIdx = 0;
let todayAlbumIdx = 0;
let currentPreviews = {};
let currentCoverUrl = '';
let activeTrackIdx = -1;
let isScrubbing = false;
let shelfMode = 'recent'; // 'recent' | 'all'

// ==================== 个人听过打卡与笔记 ====================
function loadAllNotes() {
  try {
    return JSON.parse(localStorage.getItem(NOTES_KEY) || '{}');
  } catch (_) {
    return {};
  }
}

function saveAlbumLog(albumId, patch) {
  const all = loadAllNotes();
  const prev = all[albumId] || { listened: false, rating: 0, note: '' };
  all[albumId] = { ...prev, ...patch };
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(all));
  } catch (_) {}
  return all[albumId];
}

function renderPersonalLog(album) {
  const log = loadAllNotes()[album.id] || { listened: false, rating: 0, note: '' };
  btnListened.classList.toggle('active', Boolean(log.listened));
  btnListened.textContent = log.listened ? '✓ 已听过' : '○ 标记已听';

  starBtns.forEach((btn) => {
    const star = Number(btn.dataset.star);
    btn.classList.toggle('filled', star <= (log.rating || 0));
  });

  albumNoteInput.value = log.note || '';
}

btnListened.addEventListener('click', () => {
  const album = albums[currentAlbumIdx];
  if (!album) return;
  const cur = loadAllNotes()[album.id] || {};
  saveAlbumLog(album.id, { listened: !cur.listened });
  renderPersonalLog(album);
  renderShelf();
});

starBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const album = albums[currentAlbumIdx];
    if (!album) return;
    const star = Number(btn.dataset.star);
    const cur = loadAllNotes()[album.id] || {};
    const nextRating = cur.rating === star ? 0 : star;
    saveAlbumLog(album.id, { rating: nextRating, listened: nextRating > 0 ? true : cur.listened });
    renderPersonalLog(album);
    renderShelf();
  });
});

let noteSaveTimer;
albumNoteInput.addEventListener('input', () => {
  const album = albums[currentAlbumIdx];
  if (!album) return;
  clearTimeout(noteSaveTimer);
  noteSaveTimer = setTimeout(() => {
    saveAlbumLog(album.id, { note: albumNoteInput.value.trim() });
  }, 240);
});

// ==================== 播放器与倒计时 ====================
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

  renderPersonalLog(album);

  const fallbackCover = buildFallbackCover(album);
  currentCoverUrl = fallbackCover;
  const coverEl = document.getElementById('albumCover');
  coverEl.src = fallbackCover;

  const q = encodeURIComponent(`${album.artist} ${album.title}`);
  document.getElementById('listenLinks').innerHTML = `
    <a class="btn btn-sm" href="https://music.163.com/#/search/m/?s=${q}&type=10" target="_blank" rel="noopener noreferrer">网易云音乐 ↗</a>
    <a class="btn btn-sm" href="https://open.spotify.com/search/${q}" target="_blank" rel="noopener noreferrer">Spotify ↗</a>
    <a class="btn btn-sm" href="https://music.apple.com/search?term=${q}" target="_blank" rel="noopener noreferrer">Apple Music ↗</a>
    <a class="btn btn-sm" href="https://www.youtube.com/results?search_query=${q}+full+album" target="_blank" rel="noopener noreferrer">YouTube ↗</a>
  `;

  currentPreviews = {};
  renderTracks(album, {});

  const meta = await fetchItunesMetadata(album);
  if (currentAlbumIdx !== idx) return;
  if (meta.artwork) {
    currentCoverUrl = meta.artwork;
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
            <span class="track-title">${escapeHtml(track.title)}</span>
          </div>
          <div class="track-right">
            ${matched ? '<span class="preview-chip">▶ 30s</span>' : ''}
            <span>${escapeHtml(track.duration)}</span>
          </div>
        </li>
      `;
    })
    .join('');

  listEl.querySelectorAll('.track-item.playable').forEach((item) => {
    item.addEventListener('click', () => {
      playTrack(Number(item.dataset.idx));
    });
  });
}

function playTrack(trackIdx) {
  const album = albums[currentAlbumIdx];
  const track = album.tracks[trackIdx];
  const matched = findTrackPreview(track.title, currentPreviews);
  if (!matched?.previewUrl) return;

  // 与猜碟音频互斥
  quizAudio.pause();

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

audio.addEventListener('play', () => {
  quizAudio.pause();
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

// ==================== 盲听猜碟小游戏 ====================
const quizPanel = document.getElementById('quizPanel');
const btnToggleQuiz = document.getElementById('btnToggleQuiz');
const btnCloseQuiz = document.getElementById('btnCloseQuiz');
const quizCover = document.getElementById('quizCover');
const quizPrompt = document.getElementById('quizPrompt');
const quizHint = document.getElementById('quizHint');
const quizOptionsEl = document.getElementById('quizOptions');
const quizResultText = document.getElementById('quizResultText');
const btnNextQuiz = document.getElementById('btnNextQuiz');
const btnQuizPlay = document.getElementById('btnQuizPlay');
const quizProgressFill = document.getElementById('quizProgressFill');
const quizTimeLabel = document.getElementById('quizTimeLabel');
const quizPlayerBar = document.getElementById('quizPlayerBar');
const quizStreakBadge = document.getElementById('quizStreakBadge');

let quizStreak = 0;
let quizBest = Number(localStorage.getItem(QUIZ_BEST_KEY) || '0');
let quizTargetIdx = -1;
let quizLocked = false;
let quizTrackTitle = '';

function updateQuizStreakUI() {
  quizStreakBadge.textContent = `连胜 ${quizStreak} · 最高 ${quizBest}`;
}

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function startQuizRound() {
  if (albums.length < 4) return;
  quizLocked = false;
  quizAudio.pause();
  quizAudio.currentTime = 0;
  quizProgressFill.style.width = '0%';
  quizTimeLabel.textContent = '0:00';
  btnNextQuiz.style.display = 'none';
  quizResultText.textContent = '';
  quizCover.classList.add('blurred');
  quizPrompt.textContent = '正在抽取随机谜题与前奏片段...';
  quizOptionsEl.innerHTML = '';
  updateQuizStreakUI();

  // 尝试抽取有 30s 试听的专辑（最多试 4 个候选）
  const candidateIndices = shuffleArray(albums.map((_, i) => i).filter((i) => i !== quizTargetIdx)).slice(0, 4);
  let chosenIdx = candidateIndices[0];
  let chosenMeta = null;
  let chosenPreview = null;

  for (const idx of candidateIndices) {
    const album = albums[idx];
    const meta = await fetchItunesMetadata(album);
    const previewList = Object.entries(meta.previews || {});
    if (previewList.length > 0) {
      chosenIdx = idx;
      chosenMeta = meta;
      const picked = previewList[Math.floor(Math.random() * previewList.length)];
      chosenPreview = picked[1]?.previewUrl || null;
      const matchedTrack = album.tracks.find((t) => findTrackPreview(t.title, { [picked[0]]: picked[1] }));
      quizTrackTitle = matchedTrack?.title || '专辑曲目';
      break;
    }
    if (!chosenMeta) chosenMeta = meta;
  }

  quizTargetIdx = chosenIdx;
  const targetAlbum = albums[chosenIdx];
  quizCover.src = chosenMeta?.artwork || buildFallbackCover(targetAlbum);

  if (chosenPreview) {
    quizPlayerBar.style.display = 'flex';
    quizAudio.src = chosenPreview;
    quizPrompt.textContent = `线索：${targetAlbum.year} · ${targetAlbum.genre}`;
    quizHint.textContent = '点击播放 30 秒前奏，结合模糊封面猜出这是哪张专辑';
    btnQuizPlay.textContent = '▶ 播放前奏';
  } else {
    quizPlayerBar.style.display = 'none';
    quizPrompt.textContent = `模糊封面猜碟 · ${targetAlbum.year} · ${targetAlbum.genre}`;
    quizHint.textContent = '当前网络未获取到试听片段，已切换为封面视觉猜碟模式';
  }

  const distractors = shuffleArray(albums.map((_, i) => i).filter((i) => i !== chosenIdx)).slice(0, 3);
  const optionIndices = shuffleArray([chosenIdx, ...distractors]);

  quizOptionsEl.innerHTML = optionIndices
    .map((idx) => {
      const a = albums[idx];
      return `
        <button class="quiz-opt" data-idx="${idx}">
          <div style="font-size:13.5px;font-weight:600;margin-bottom:2px;">${escapeHtml(a.title)}</div>
          <div style="font-size:12px;color:var(--text-secondary);">${escapeHtml(a.artist)} · ${a.year}</div>
        </button>
      `;
    })
    .join('');

  quizOptionsEl.querySelectorAll('.quiz-opt').forEach((btn) => {
    btn.addEventListener('click', () => handleQuizAnswer(Number(btn.dataset.idx), btn));
  });
}

function handleQuizAnswer(pickedIdx, btnEl) {
  if (quizLocked) return;
  quizLocked = true;
  quizCover.classList.remove('blurred');

  const isCorrect = pickedIdx === quizTargetIdx;
  const target = albums[quizTargetIdx];

  quizOptionsEl.querySelectorAll('.quiz-opt').forEach((btn) => {
    btn.disabled = true;
    const idx = Number(btn.dataset.idx);
    if (idx === quizTargetIdx) btn.classList.add('correct');
  });

  if (isCorrect) {
    quizStreak += 1;
    if (quizStreak > quizBest) {
      quizBest = quizStreak;
      try {
        localStorage.setItem(QUIZ_BEST_KEY, String(quizBest));
      } catch (_) {}
    }
    quizResultText.innerHTML = `<span style="color:#6ee7b7;font-weight:600;">✓ 猜对了！</span> ${escapeHtml(target.title)}（${escapeHtml(quizTrackTitle)}）`;
  } else {
    btnEl.classList.add('wrong');
    quizStreak = 0;
    quizResultText.innerHTML = `<span style="color:#fda4af;font-weight:600;">✗ 差一点</span>，正确答案是 《${escapeHtml(target.title)}》`;
  }

  updateQuizStreakUI();
  btnNextQuiz.style.display = 'inline-flex';
}

btnToggleQuiz.addEventListener('click', () => {
  const opening = quizPanel.style.display === 'none';
  quizPanel.style.display = opening ? 'block' : 'none';
  btnToggleQuiz.classList.toggle('btn-primary', opening);
  if (opening) {
    audio.pause();
    startQuizRound();
  } else {
    quizAudio.pause();
  }
});

btnCloseQuiz.addEventListener('click', () => {
  quizPanel.style.display = 'none';
  btnToggleQuiz.classList.remove('btn-primary');
  quizAudio.pause();
});

btnNextQuiz.addEventListener('click', () => startQuizRound());

btnQuizPlay.addEventListener('click', () => {
  if (!quizAudio.src) return;
  audio.pause();
  if (quizAudio.paused) {
    quizAudio.play().catch(() => {});
  } else {
    quizAudio.pause();
  }
});

quizAudio.addEventListener('play', () => {
  audio.pause();
  btnQuizPlay.textContent = '⏸ 暂停';
});

quizAudio.addEventListener('pause', () => {
  btnQuizPlay.textContent = '▶ 播放前奏';
});

quizAudio.addEventListener('timeupdate', () => {
  const dur = Number.isFinite(quizAudio.duration) && quizAudio.duration > 0 ? quizAudio.duration : 30;
  quizProgressFill.style.width = `${Math.min(100, (quizAudio.currentTime / dur) * 100)}%`;
  quizTimeLabel.textContent = formatSec(quizAudio.currentTime);
});

// ==================== Web Audio 黑胶底噪 / 雨声 + 极简番茄钟 ====================
const btnVinylNoise = document.getElementById('btnVinylNoise');
const btnRainNoise = document.getElementById('btnRainNoise');
const ambientStatus = document.getElementById('ambientStatus');

let audioCtx = null;
let activeAmbient = null; // 'vinyl' | 'rain' | null
let ambientCleanup = null;

function ensureAudioCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function stopAmbient() {
  if (ambientCleanup) {
    ambientCleanup();
    ambientCleanup = null;
  }
  activeAmbient = null;
  btnVinylNoise.classList.remove('active');
  btnRainNoise.classList.remove('active');
  ambientStatus.textContent = '纯 Web Audio 合成 · 零流量';
}

function startAmbient(mode) {
  if (activeAmbient === mode) {
    stopAmbient();
    return;
  }
  stopAmbient();
  const ctx = ensureAudioCtx();
  if (!ctx) {
    ambientStatus.textContent = '当前浏览器不支持 Web Audio';
    return;
  }

  const bufferSize = ctx.sampleRate * 3;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  if (mode === 'vinyl') {
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.04 * white) / 1.04;
      let sample = lastOut * 0.45;
      // 随机细腻炒豆脉冲
      if (Math.random() < 0.0008) {
        sample += (Math.random() * 2 - 1) * 0.55;
      }
      data[i] = sample;
    }
  } else {
    // 柔和粉红噪声雨声
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.96300 * b1 + white * 0.2965164;
      b2 = 0.57000 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.14;
    }
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = mode === 'vinyl' ? 'bandpass' : 'lowpass';
  filter.frequency.value = mode === 'vinyl' ? 1400 : 950;
  filter.Q.value = mode === 'vinyl' ? 0.65 : 0.7;

  const gain = ctx.createGain();
  gain.gain.value = mode === 'vinyl' ? 0.12 : 0.18;

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start();

  activeAmbient = mode;
  btnVinylNoise.classList.toggle('active', mode === 'vinyl');
  btnRainNoise.classList.toggle('active', mode === 'rain');
  ambientStatus.textContent = mode === 'vinyl' ? '正在播放：黑胶底噪' : '正在播放：深夜雨声';

  ambientCleanup = () => {
    try {
      source.stop();
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    } catch (_) {}
  };
}

function playBellChime() {
  const ctx = ensureAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  [523.25, 659.25, 783.99].forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.001, now + idx * 0.14);
    gain.gain.exponentialRampToValueAtTime(0.08, now + idx * 0.14 + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.14 + 0.8);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + idx * 0.14);
    osc.stop(now + idx * 0.14 + 0.85);
  });
}

btnVinylNoise.addEventListener('click', () => startAmbient('vinyl'));
btnRainNoise.addEventListener('click', () => startAmbient('rain'));

// 极简番茄钟
const btnPomoMode = document.getElementById('btnPomoMode');
const pomoDisplay = document.getElementById('pomoDisplay');
const btnPomoToggle = document.getElementById('btnPomoToggle');
const btnPomoReset = document.getElementById('btnPomoReset');

let pomoMode = 'focus'; // 'focus' (25m) | 'break' (5m)
let pomoSecLeft = 25 * 60;
let pomoTimer = null;

function renderPomo() {
  const m = String(Math.floor(pomoSecLeft / 60)).padStart(2, '0');
  const s = String(pomoSecLeft % 60).padStart(2, '0');
  pomoDisplay.textContent = `${m}:${s}`;
  btnPomoToggle.textContent = pomoTimer ? '暂停' : '开始';
}

function resetPomo() {
  if (pomoTimer) {
    clearInterval(pomoTimer);
    pomoTimer = null;
  }
  pomoSecLeft = pomoMode === 'focus' ? 25 * 60 : 5 * 60;
  renderPomo();
}

btnPomoMode.addEventListener('click', () => {
  pomoMode = pomoMode === 'focus' ? 'break' : 'focus';
  btnPomoMode.textContent = pomoMode === 'focus' ? '🍅 专注 25m' : '☕ 休息 5m';
  resetPomo();
});

btnPomoToggle.addEventListener('click', () => {
  if (pomoTimer) {
    clearInterval(pomoTimer);
    pomoTimer = null;
    renderPomo();
    return;
  }
  ensureAudioCtx();
  pomoTimer = setInterval(() => {
    pomoSecLeft -= 1;
    if (pomoSecLeft <= 0) {
      clearInterval(pomoTimer);
      pomoTimer = null;
      pomoSecLeft = 0;
      playBellChime();
    }
    renderPomo();
  }, 1000);
  renderPomo();
});

btnPomoReset.addEventListener('click', resetPomo);
renderPomo();

// ==================== 导出 PNG 日签海报 ====================
function loadImageForCanvas(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const paragraphs = String(text || '').split('\n');
  let drawnLines = 0;
  let curY = y;

  for (let p = 0; p < paragraphs.length; p++) {
    const chars = Array.from(paragraphs[p]);
    let line = '';

    for (let i = 0; i < chars.length; i++) {
      const testLine = line + chars[i];
      if (ctx.measureText(testLine).width > maxWidth && line.length > 0) {
        if (drawnLines + 1 >= maxLines) {
          ctx.fillText(`${line.slice(0, -1)}…`, x, curY);
          return curY + lineHeight;
        }
        ctx.fillText(line, x, curY);
        line = chars[i];
        curY += lineHeight;
        drawnLines += 1;
      } else {
        line = testLine;
      }
    }

    if (line) {
      if (drawnLines + 1 >= maxLines && p < paragraphs.length - 1) {
        ctx.fillText(`${line.slice(0, -1)}…`, x, curY);
        return curY + lineHeight;
      }
      ctx.fillText(line, x, curY);
      curY += lineHeight;
      drawnLines += 1;
      if (drawnLines >= maxLines) return curY;
    }
  }

  return curY;
}

document.getElementById('btnExportPoster').addEventListener('click', async () => {
  const album = albums[currentAlbumIdx];
  if (!album) return;
  const btn = document.getElementById('btnExportPoster');
  const prevText = btn.textContent;
  btn.textContent = '生成中...';

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 1200;
    const ctx = canvas.getContext('2d');
    const accent = album.accentColor || '#6366f1';

    // 背景与氛围光晕
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, 900, 1200);
    const glow = ctx.createRadialGradient(450, 260, 40, 450, 260, 560);
    glow.addColorStop(0, `${accent}44`);
    glow.addColorStop(1, 'rgba(9,9,11,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 900, 1200);

    // 卡片边框
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 2;
    ctx.strokeRect(42, 42, 816, 1116);

    // 顶部日期标签
    const bj = getBeijingDate(0);
    ctx.fillStyle = '#a1a1aa';
    ctx.font = '500 22px monospace';
    ctx.fillText(`DAILY VINYL · ${bj.displayDate}`, 84, 108);

    // 唱片圆盘
    ctx.beginPath();
    ctx.arc(580, 390, 200, 0, Math.PI * 2);
    ctx.fillStyle = '#111114';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(580, 390, 62, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();

    // 封面（CORS 失败时降级使用内置 SVG Cover）
    let coverImg;
    try {
      coverImg = await loadImageForCanvas(currentCoverUrl || buildFallbackCover(album));
    } catch (_) {
      coverImg = await loadImageForCanvas(buildFallbackCover(album));
    }
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(84, 168, 444, 444, 20);
    ctx.clip();
    ctx.drawImage(coverImg, 84, 168, 444, 444);
    ctx.restore();

    // 标题与艺术家
    ctx.fillStyle = '#fafafa';
    ctx.font = '700 44px sans-serif';
    let nextY = drawWrappedText(ctx, album.title, 84, 688, 732, 54, 2);

    ctx.fillStyle = '#a1a1aa';
    ctx.font = '500 28px sans-serif';
    ctx.fillText(`${album.artist} · ${album.year} · ${album.genre}`, 84, nextY + 12);

    // 短评或个人笔记
    const log = loadAllNotes()[album.id] || {};
    const bodyText = log.note ? `“${log.note}”\n${album.review}` : album.review;

    ctx.fillStyle = accent;
    ctx.fillRect(84, nextY + 54, 5, 220);

    ctx.fillStyle = '#d4d4d8';
    ctx.font = '400 24px sans-serif';
    drawWrappedText(ctx, bodyText, 110, nextY + 86, 706, 38, 6);

    // 评分与底栏
    if (log.rating) {
      ctx.fillStyle = '#fbbf24';
      ctx.font = '600 26px sans-serif';
      ctx.fillText('★'.repeat(log.rating) + '☆'.repeat(5 - log.rating), 84, 1086);
    }
    ctx.fillStyle = '#71717a';
    ctx.font = '500 20px monospace';
    ctx.fillText('DEV // HUB · PERSONAL DIGITAL WORKBENCH', 84, 1126);

    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `vinyl-${album.id}-${bj.yyyymmdd}.png`;
    link.href = dataUrl;
    link.click();
    btn.textContent = '✓ 已导出';
    setTimeout(() => { btn.textContent = prevText; }, 1600);
  } catch (_) {
    btn.textContent = '导出失败';
    setTimeout(() => { btn.textContent = prevText; }, 1600);
  }
});

// ==================== 唱片架（近期 7 天 / 全部曲库） ====================
function renderShelf() {
  const notes = loadAllNotes();
  const tabAll = document.getElementById('tabAllAlbums');
  if (tabAll) tabAll.textContent = `全部曲库 (${albums.length})`;

  let items = [];
  if (shelfMode === 'recent') {
    for (let offset = 0; offset >= -6; offset--) {
      const bj = getBeijingDate(offset);
      const idx = getDailyAlbumIndex(albums.length, offset);
      items.push({
        idx,
        album: albums[idx],
        topLabel: `${offset === 0 ? '今天 · ' : ''}${bj.dateStr}`,
        clickLabel: `${bj.displayDate} · 唱片架回听`,
      });
    }
  } else {
    items = albums.map((album, idx) => ({
      idx,
      album,
      topLabel: `#${String(idx + 1).padStart(2, '0')} · ${album.genre}`,
      clickLabel: `全部曲库 · #${String(idx + 1).padStart(2, '0')}`,
    }));
  }

  const listenedCount = albums.filter((a) => notes[a.id]?.listened).length;
  document.getElementById('shelfSummary').textContent = `已听 ${listenedCount} / ${albums.length} · 点击切换试听`;

  shelfGrid.innerHTML = items
    .map(({ idx, album, topLabel, clickLabel }) => {
      const log = notes[album.id] || {};
      const badge = log.listened
        ? `<span style="color:#6ee7b7;">✓${log.rating ? ` ★${log.rating}` : ''}</span>`
        : '';
      return `
        <button class="shelf-card ${idx === currentAlbumIdx ? 'selected' : ''}" data-idx="${idx}" data-label="${escapeHtml(clickLabel)}">
          <div style="display:flex;justify-content:space-between;gap:6px;font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-bottom:6px;">
            <span>${escapeHtml(topLabel)}</span>
            ${badge}
          </div>
          <div style="font-size:14px;font-weight:600;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${escapeHtml(album.title)}
          </div>
          <div style="font-size:12px;color:var(--text-secondary);">
            ${escapeHtml(album.artist)} (${album.year})
          </div>
        </button>
      `;
    })
    .join('');

  shelfGrid.querySelectorAll('.shelf-card').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      renderAlbum(idx, btn.dataset.label);
      renderShelf();
    });
  });
}

document.querySelectorAll('[data-shelf-tab]').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('[data-shelf-tab]').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    shelfMode = tab.dataset.shelfTab;
    renderShelf();
  });
});

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
