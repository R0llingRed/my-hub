import {
  copyText,
  escapeHtml,
  getDailyItemIndex,
  startClock,
} from './common.js';

startClock(
  document.getElementById('clockDate'),
  document.getElementById('clockTime')
);

const BOOKMARK_KEY = 'qotd_bookmarks_v1';
const featuredCard = document.getElementById('featuredCard');
const archiveGrid = document.getElementById('archiveGrid');
const catChips = document.getElementById('catChips');
const searchInput = document.getElementById('searchInput');
const btnOnlyBookmarked = document.getElementById('btnOnlyBookmarked');

let dataset = { tips: [], questions: [] };
let mode = 'tips'; // 'tips' | 'questions'
let activeCat = '全部';
let onlyBookmarked = false;
let revealedAnswers = new Set();

function loadBookmarks() {
  try {
    return new Set(JSON.parse(localStorage.getItem(BOOKMARK_KEY) || '[]'));
  } catch (_) {
    return new Set();
  }
}

function saveBookmarks(set) {
  try {
    localStorage.setItem(BOOKMARK_KEY, JSON.stringify(Array.from(set)));
  } catch (_) {}
}

let bookmarks = loadBookmarks();

function renderTipCard(item, isFeatured = false) {
  const isBm = bookmarks.has(item.id);
  return `
    <article class="${isFeatured ? '' : 'card'}">
      <div class="card-header" style="margin-bottom:8px;">
        <span class="card-kicker">${isFeatured ? '★ 今日推荐 · ' : ''}${escapeHtml(item.category)} · ${item.kind === 'cmd' ? '命令速记' : '核心概念'}</span>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-sm btn-copy-snippet" data-snippet="${escapeHtml(item.snippet)}">复制片段</button>
          <button class="btn btn-sm btn-bookmark ${isBm ? 'active' : ''}" data-id="${escapeHtml(item.id)}">${isBm ? '★ 已收藏' : '☆ 收藏'}</button>
        </div>
      </div>
      <h2 style="margin:0 0 4px;font-size:17px;">${escapeHtml(item.title)}</h2>
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:6px;">${escapeHtml(item.subtitle)}</div>
      <pre class="qotd-code">${escapeHtml(item.snippet)}</pre>
      <p style="margin:6px 0 6px;font-size:13px;line-height:1.65;color:#d4d4d8;">${escapeHtml(item.explanation)}</p>
      <div style="font-size:12px;color:var(--text-muted);">要点：${escapeHtml(item.takeaway)}</div>
    </article>
  `;
}

function renderQuestionCard(item, isFeatured = false) {
  const isBm = bookmarks.has(item.id);
  const isOpen = revealedAnswers.has(item.id);
  return `
    <article class="${isFeatured ? '' : 'card'}">
      <div class="card-header" style="margin-bottom:8px;">
        <span class="card-kicker">${isFeatured ? '★ 今日一问 · ' : ''}${escapeHtml(item.category)}</span>
        <button class="btn btn-sm btn-bookmark ${isBm ? 'active' : ''}" data-id="${escapeHtml(item.id)}">${isBm ? '★ 已收藏' : '☆ 收藏'}</button>
      </div>
      <h2 style="margin:0 0 8px;font-size:16.5px;line-height:1.5;">${escapeHtml(item.question)}</h2>
      <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:10px;">思路提示：${escapeHtml(item.hint)}</div>
      <div>
        <button class="btn btn-sm btn-primary btn-toggle-ans" data-id="${escapeHtml(item.id)}">
          ${isOpen ? '收起参考答案' : '显示参考答案'}
        </button>
      </div>
      ${
        isOpen
          ? `<div class="qotd-answer">
              <div style="margin-bottom:6px;">${escapeHtml(item.answer)}</div>
              <div style="font-size:12px;color:#a7f3d0;">延伸：${escapeHtml(item.followUp)}</div>
            </div>`
          : ''
      }
    </article>
  `;
}

function renderCategories(list) {
  const cats = ['全部', ...Array.from(new Set(list.map((i) => i.category)))];
  if (!cats.includes(activeCat)) activeCat = '全部';
  catChips.innerHTML = cats
    .map(
      (cat) =>
        `<button class="btn btn-sm cat-chip ${cat === activeCat ? 'active' : ''}" data-cat="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`
    )
    .join('');

  catChips.querySelectorAll('.cat-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeCat = btn.dataset.cat;
      render();
    });
  });
}

function bindCardActions(root) {
  root.querySelectorAll('.btn-copy-snippet').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await copyText(btn.dataset.snippet);
      btn.textContent = ok ? '✓ 已复制' : '复制失败';
      setTimeout(() => {
        btn.textContent = '复制片段';
      }, 1400);
    });
  });

  root.querySelectorAll('.btn-bookmark').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (bookmarks.has(id)) {
        bookmarks.delete(id);
      } else {
        bookmarks.add(id);
      }
      saveBookmarks(bookmarks);
      render();
    });
  });

  root.querySelectorAll('.btn-toggle-ans').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (revealedAnswers.has(id)) {
        revealedAnswers.delete(id);
      } else {
        revealedAnswers.add(id);
      }
      render();
    });
  });
}

function render() {
  const list = mode === 'tips' ? dataset.tips : dataset.questions;
  renderCategories(list);

  const todayIdx = getDailyItemIndex(list.length, 0, mode === 'tips' ? 13 : 29);
  const todayItem = list[todayIdx];
  featuredCard.innerHTML = todayItem
    ? mode === 'tips'
      ? renderTipCard(todayItem, true)
      : renderQuestionCard(todayItem, true)
    : '';

  const kw = searchInput.value.trim().toLowerCase();
  const filtered = list.filter((item) => {
    if (activeCat !== '全部' && item.category !== activeCat) return false;
    if (onlyBookmarked && !bookmarks.has(item.id)) return false;
    if (!kw) return true;
    const hay = JSON.stringify(item).toLowerCase();
    return hay.includes(kw);
  });

  if (!filtered.length) {
    archiveGrid.innerHTML = `<div class="card" style="grid-column:1 / -1;text-align:center;padding:36px;color:var(--text-secondary);">没有匹配的条目</div>`;
  } else {
    archiveGrid.innerHTML = filtered
      .map((item) => (mode === 'tips' ? renderTipCard(item, false) : renderQuestionCard(item, false)))
      .join('');
  }

  bindCardActions(featuredCard);
  bindCardActions(archiveGrid);
}

document.querySelectorAll('[data-mode]').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('[data-mode]').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    mode = tab.dataset.mode;
    activeCat = '全部';
    render();
  });
});

searchInput.addEventListener('input', render);

btnOnlyBookmarked.addEventListener('click', () => {
  onlyBookmarked = !onlyBookmarked;
  btnOnlyBookmarked.classList.toggle('btn-primary', onlyBookmarked);
  render();
});

async function init() {
  const res = await fetch('../data/daily-bits.json');
  dataset = await res.json();
  render();
}

init();
