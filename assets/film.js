import {
  copyText,
  escapeHtml,
  fetchFilmPoster,
  formatCountdown,
  getDailyItemIndex,
  getShanghaiDate,
  startClock,
} from './common.js';

startClock(
  document.getElementById('clockDate'),
  document.getElementById('clockTime')
);

const FILM_NOTES_KEY = 'film_notes_v1';
const btnToday = document.getElementById('btnToday');
const btnWatched = document.getElementById('btnWatched');
const starBtns = Array.from(document.querySelectorAll('.star-btn'));
const filmNoteInput = document.getElementById('filmNoteInput');
const btnToggleShelf = document.getElementById('btnToggleShelf');
const filmShelfDrawer = document.getElementById('filmShelfDrawer');
const btnCloseFilmShelf = document.getElementById('btnCloseFilmShelf');
const filmShelfSearch = document.getElementById('filmShelfSearch');
const shelfGrid = document.getElementById('shelfGrid');
const paletteHint = document.getElementById('paletteHint');
const posterImage = document.getElementById('posterImage');

posterImage.addEventListener('load', () => {
  if (posterImage.getAttribute('src')) {
    posterImage.classList.add('loaded');
  }
});
posterImage.addEventListener('error', () => {
  posterImage.classList.remove('loaded');
});

let films = [];
let currentFilmIdx = 0;
let todayFilmIdx = 0;
let shelfMode = 'recent';

function loadNotes() {
  try {
    return JSON.parse(localStorage.getItem(FILM_NOTES_KEY) || '{}');
  } catch (_) {
    return {};
  }
}

function saveFilmLog(filmId, patch) {
  const all = loadNotes();
  const prev = all[filmId] || { watched: false, rating: 0, note: '' };
  all[filmId] = { ...prev, ...patch };
  try {
    localStorage.setItem(FILM_NOTES_KEY, JSON.stringify(all));
  } catch (_) {}
}

function renderPersonalLog(film) {
  const log = loadNotes()[film.id] || { watched: false, rating: 0, note: '' };
  btnWatched.classList.toggle('active', Boolean(log.watched));
  btnWatched.textContent = log.watched ? '✓ 已看过' : '○ 标记看过';
  starBtns.forEach((btn) => {
    btn.classList.toggle('filled', Number(btn.dataset.star) <= (log.rating || 0));
  });
  filmNoteInput.value = log.note || '';
}

btnWatched.addEventListener('click', () => {
  const film = films[currentFilmIdx];
  if (!film) return;
  const cur = loadNotes()[film.id] || {};
  saveFilmLog(film.id, { watched: !cur.watched });
  renderPersonalLog(film);
  renderShelf();
});

starBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const film = films[currentFilmIdx];
    if (!film) return;
    const star = Number(btn.dataset.star);
    const cur = loadNotes()[film.id] || {};
    const next = cur.rating === star ? 0 : star;
    saveFilmLog(film.id, { rating: next, watched: next > 0 ? true : cur.watched });
    renderPersonalLog(film);
    renderShelf();
  });
});

let noteTimer;
function flushFilmNote() {
  const film = films[currentFilmIdx];
  if (!film) return;
  clearTimeout(noteTimer);
  saveFilmLog(film.id, { note: filmNoteInput.value.trim() });
}

filmNoteInput.addEventListener('input', () => {
  const film = films[currentFilmIdx];
  if (!film) return;
  const targetId = film.id;
  const value = filmNoteInput.value.trim();
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => {
    saveFilmLog(targetId, { note: value });
  }, 240);
});

filmNoteInput.addEventListener('blur', flushFilmNote);

async function renderFilm(idx, badgeText) {
  currentFilmIdx = idx;
  const film = films[idx];
  const accent = film.accentColor || '#6366f1';
  const palette = film.palette || ['#09090b', accent, '#27272a', '#a1a1aa', '#fafafa'];

  posterImage.classList.remove('loaded');
  posterImage.removeAttribute('src');

  document.documentElement.style.setProperty('--film-accent', accent);
  document.getElementById('ambientGlow').style.background = `
    radial-gradient(ellipse 70% 50% at 30% 15%, ${accent}28, transparent 68%)
  `;

  const isToday = idx === todayFilmIdx;
  btnToday.style.display = isToday ? 'none' : 'inline-flex';
  document.getElementById('dayBadge').textContent =
    badgeText || (isToday ? `${getShanghaiDate(0).displayDate} · 今日一影` : '随机 / 历史佳片');

  const posterFrame = document.getElementById('posterFrame');
  posterFrame.style.background = `
    radial-gradient(circle at 25% 20%, ${palette[2] || accent}66, transparent 60%),
    linear-gradient(155deg, ${palette[0] || '#09090b'} 0%, ${palette[1] || '#18181b'} 55%, ${palette[2] || accent}44 100%)
  `;
  document.getElementById('posterKicker').textContent = `DAILY CINEMA · #${String(idx + 1).padStart(2, '0')}`;
  document.getElementById('posterTitle').textContent = film.title;
  document.getElementById('posterOriginal').textContent = film.originalTitle;
  document.getElementById('posterDirector').textContent = film.director;
  document.getElementById('posterYearRuntime').textContent = `${film.year} · ${film.runtime}`;

  document.getElementById('filmYear').textContent = film.year;
  document.getElementById('filmCountry').textContent = film.country;
  document.getElementById('filmRuntime').textContent = film.runtime;
  document.getElementById('filmGenre').textContent = film.genre;
  document.getElementById('filmRating').textContent = `★ ${film.rating}`;

  document.getElementById('filmTitle').textContent = film.title;
  document.getElementById('filmSub').textContent = `${film.originalTitle} · 导演 ${film.director}`;
  document.getElementById('filmQuote').textContent = `“${film.quote}”`;
  document.getElementById('filmReview').textContent = film.review;
  document.title = `${film.title} — 今日一影`;

  document.getElementById('filmTags').innerHTML = (film.tags || [])
    .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
    .join('');

  const paletteStrip = document.getElementById('paletteStrip');
  paletteStrip.innerHTML = palette
    .map(
      (hex) =>
        `<button class="palette-swatch-lg" style="background:${escapeHtml(hex)};" title="${escapeHtml(hex)}" data-hex="${escapeHtml(hex)}"></button>`
    )
    .join('');

  paletteStrip.querySelectorAll('.palette-swatch-lg').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const hex = btn.dataset.hex;
      const ok = await copyText(hex);
      paletteHint.textContent = ok ? `已复制 ${hex}` : hex;
      setTimeout(() => {
        paletteHint.textContent = '点击色块复制 HEX';
      }, 1500);
    });
  });

  const q = encodeURIComponent(`${film.title} ${film.year}`);
  const qOrig = encodeURIComponent(`${film.originalTitle} ${film.year}`);
  document.getElementById('filmLinks').innerHTML = `
    <a class="btn btn-sm" href="https://search.douban.com/movie/subject_search?search_text=${q}" target="_blank" rel="noopener noreferrer">豆瓣电影 ↗</a>
    <a class="btn btn-sm" href="https://www.imdb.com/find/?q=${qOrig}" target="_blank" rel="noopener noreferrer">IMDb ↗</a>
    <a class="btn btn-sm" href="https://letterboxd.com/search/${qOrig}/" target="_blank" rel="noopener noreferrer">Letterboxd ↗</a>
    <a class="btn btn-sm" href="https://search.bilibili.com/all?keyword=${q}" target="_blank" rel="noopener noreferrer">B站解说 ↗</a>
  `;

  renderPersonalLog(film);

  const posterUrl = await fetchFilmPoster(film);
  if (currentFilmIdx !== idx || !posterUrl) return;
  posterImage.alt = `${film.title} 海报`;
  posterImage.src = posterUrl;
}

function openFilmShelfDrawer() {
  filmShelfDrawer.classList.add('open');
  document.body.style.overflow = 'hidden';
  btnToggleShelf.classList.add('btn-primary');
  renderShelf();
}

function closeFilmShelfDrawer() {
  filmShelfDrawer.classList.remove('open');
  document.body.style.overflow = '';
  btnToggleShelf.classList.remove('btn-primary');
}

function renderShelf() {
  const notes = loadNotes();
  const tabAll = document.getElementById('tabAllFilms');
  if (tabAll) tabAll.textContent = `全部片库 (${films.length})`;

  let items = [];
  if (shelfMode === 'recent') {
    for (let offset = 0; offset >= -6; offset--) {
      const sh = getShanghaiDate(offset);
      const idx = getDailyItemIndex(films.length, offset, 7);
      items.push({
        idx,
        film: films[idx],
        topLabel: `${offset === 0 ? '今天 · ' : ''}${sh.dateStr}`,
        clickLabel: `${sh.displayDate} · 片单回看`,
      });
    }
  } else {
    items = films.map((film, idx) => ({
      idx,
      film,
      topLabel: `#${String(idx + 1).padStart(2, '0')} · ${film.year}`,
      clickLabel: `全部片库 · #${String(idx + 1).padStart(2, '0')}`,
    }));
    if (shelfMode === 'watched') {
      items = items.filter(({ film }) => Boolean(notes[film.id]?.watched));
    }
  }

  const kw = (filmShelfSearch?.value || '').trim().toLowerCase();
  if (kw) {
    items = items.filter(({ film }) =>
      `${film.title} ${film.originalTitle} ${film.director} ${film.genre} ${film.year}`.toLowerCase().includes(kw)
    );
  }

  const watchedCount = films.filter((f) => notes[f.id]?.watched).length;
  document.getElementById('shelfSummary').textContent = `已看 ${watchedCount} / ${films.length}`;

  if (!items.length) {
    shelfGrid.innerHTML = `<div class="card" style="grid-column:1 / -1;text-align:center;padding:36px 20px;color:var(--text-secondary);">没有找到匹配的影片</div>`;
    return;
  }

  shelfGrid.innerHTML = items
    .map(({ idx, film, topLabel, clickLabel }) => {
      const log = notes[film.id] || {};
      const palette = (film.palette || [film.accentColor || '#6366f1']).slice(0, 5);
      const badge = log.watched
        ? `<span style="color:#6ee7b7;">✓${log.rating ? ` ★${log.rating}` : ''}</span>`
        : `<span style="color:#fbbf24;">★ ${escapeHtml(film.rating)}</span>`;
      return `
        <button class="film-crate-card ${idx === currentFilmIdx ? 'selected' : ''}" data-idx="${idx}" data-label="${escapeHtml(clickLabel)}">
          <div class="film-crate-poster" style="background:linear-gradient(155deg, ${escapeHtml(palette[0] || '#09090b')} 0%, ${escapeHtml(palette[1] || '#18181b')} 60%, ${escapeHtml(palette[2] || film.accentColor || '#6366f1')}55 100%);">
            <div class="film-crate-poster-fallback">${escapeHtml(film.title)}</div>
            ${
              film.posterUrl
                ? `<img src="${escapeHtml(film.posterUrl)}" alt="${escapeHtml(film.title)}" loading="lazy" referrerpolicy="no-referrer" onload="this.classList.add('loaded')" onerror="this.remove()" />`
                : ''
            }
          </div>
          <div class="film-crate-palette">
            ${palette.map((hex) => `<span style="background:${escapeHtml(hex)};"></span>`).join('')}
          </div>
          <div class="film-crate-body">
            <div style="display:flex;justify-content:space-between;gap:6px;font-family:var(--font-mono);font-size:10.5px;color:var(--text-muted);margin-bottom:5px;">
              <span>${escapeHtml(topLabel)}</span>
              ${badge}
            </div>
            <div style="font-size:13.5px;font-weight:600;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${escapeHtml(film.title)}
            </div>
            <div style="font-size:11.5px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${escapeHtml(film.director)} · ${escapeHtml(film.year)}
            </div>
          </div>
        </button>
      `;
    })
    .join('');

  shelfGrid.querySelectorAll('.film-crate-card').forEach((btn) => {
    btn.addEventListener('click', () => {
      renderFilm(Number(btn.dataset.idx), btn.dataset.label);
      closeFilmShelfDrawer();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

function startMidnightCountdown() {
  const el = document.getElementById('midnightCountdown');
  let lastDay = getShanghaiDate(0).dayNumber;

  const tick = () => {
    const sh = getShanghaiDate(0);
    el.textContent = `距离 00:00 自动换片 ${formatCountdown(sh.msUntilMidnight)}`;
    if (sh.dayNumber !== lastDay && films.length > 0) {
      lastDay = sh.dayNumber;
      todayFilmIdx = getDailyItemIndex(films.length, 0, 7);
      renderFilm(todayFilmIdx, '今日推荐 · 刚过零点已自动换片');
      renderShelf();
    }
  };
  tick();
  setInterval(tick, 1000);
}

document.querySelectorAll('[data-shelf-tab]').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('[data-shelf-tab]').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    shelfMode = tab.dataset.shelfTab;
    renderShelf();
  });
});

filmShelfSearch.addEventListener('input', renderShelf);

btnToday.addEventListener('click', () => {
  renderFilm(todayFilmIdx);
  renderShelf();
});

document.getElementById('btnRandomFilm').addEventListener('click', () => {
  if (films.length <= 1) return;
  let next = currentFilmIdx;
  while (next === currentFilmIdx) {
    next = Math.floor(Math.random() * films.length);
  }
  renderFilm(next, '🎲 随机盲抽佳片');
  renderShelf();
});

btnToggleShelf.addEventListener('click', () => {
  if (filmShelfDrawer.classList.contains('open')) {
    closeFilmShelfDrawer();
  } else {
    openFilmShelfDrawer();
  }
});

btnCloseFilmShelf.addEventListener('click', closeFilmShelfDrawer);
filmShelfDrawer.addEventListener('click', (e) => {
  if (e.target === filmShelfDrawer) closeFilmShelfDrawer();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && filmShelfDrawer.classList.contains('open')) {
    closeFilmShelfDrawer();
  }
});

async function init() {
  const res = await fetch('../data/films.json');
  films = await res.json();
  todayFilmIdx = getDailyItemIndex(films.length, 0, 7);
  renderFilm(todayFilmIdx);
  renderShelf();
  startMidnightCountdown();
}

init();
