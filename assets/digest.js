import {
  escapeHtml,
  fetchCuratedDigest,
  fetchGeekDigest,
  getShanghaiDate,
  startClock,
} from './common.js';

startClock(
  document.getElementById('clockDate'),
  document.getElementById('clockTime')
);

const READ_KEY = 'digest_read_v1';
const digestList = document.getElementById('digestList');
const readBarFill = document.getElementById('readBarFill');
const readProgressBadge = document.getElementById('readProgressBadge');
const digestDateLabel = document.getElementById('digestDateLabel');
const digestNotice = document.getElementById('digestNotice');

const modeCuratedBtn = document.getElementById('modeCuratedBtn');
const modeLiveBtn = document.getElementById('modeLiveBtn');
const museEditorBanner = document.getElementById('museEditorBanner');
const museEditionBadge = document.getElementById('museEditionBadge');
const museUpdatedAt = document.getElementById('museUpdatedAt');
const museEditorNote = document.getElementById('museEditorNote');

const digestDrawer = document.getElementById('digestDrawer');
const drawerSourceBadge = document.getElementById('drawerSourceBadge');
const drawerMetaText = document.getElementById('drawerMetaText');
const digestDrawerBody = document.getElementById('digestDrawerBody');
const btnCloseDigestDrawer = document.getElementById('btnCloseDigestDrawer');

let activeMode = 'curated'; // 'curated' | 'live'
let curatedData = null;
let liveData = null;
let allItems = [];
let filteredItems = [];
let activeSource = 'all';
let activeDrawerIdx = -1;

function loadReadSet() {
  try {
    const arr = JSON.parse(localStorage.getItem(READ_KEY) || '[]');
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (_) {
    return new Set();
  }
}

function saveReadSet(set) {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify(Array.from(set).slice(-300)));
  } catch (_) {}
}

let readSet = loadReadSet();

function isSafeHttpUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

function hasSummaryContent(item) {
  return Boolean(
    item &&
      (item.tldr ||
        item.summary ||
        (Array.isArray(item.bullets) && item.bullets.length > 0) ||
        item.museTake)
  );
}

function markAsRead(id) {
  if (!id || readSet.has(id)) return;
  readSet.add(id);
  saveReadSet(readSet);
}

function updateProgress() {
  const total = allItems.length;
  const readCount = allItems.filter((item) => readSet.has(item.id)).length;
  const pct = total > 0 ? Math.round((readCount / total) * 100) : 0;
  readBarFill.style.width = `${pct}%`;
  readProgressBadge.textContent = `已读 ${readCount} / ${total}`;
}

function updateModeUI() {
  modeCuratedBtn.classList.toggle('active', activeMode === 'curated');
  modeLiveBtn.classList.toggle('active', activeMode === 'live');
  modeCuratedBtn.disabled = false;

  if (activeMode === 'curated' && curatedData) {
    if (curatedData.editorNote) {
      museEditorBanner.classList.add('visible');
      museEditionBadge.textContent = `✦ ${curatedData.editor || 'Muse'} 定刊 · ${curatedData.edition || curatedData.date || '今日精选'}`;
      museUpdatedAt.textContent = curatedData.date || '';
      museEditorNote.textContent = curatedData.editorNote;
    } else {
      museEditorBanner.classList.remove('visible');
    }
    digestNotice.style.display = 'none';
  } else {
    museEditorBanner.classList.remove('visible');
    if (liveData?.mode === 'direct') {
      digestNotice.style.display = 'block';
      digestNotice.textContent =
        '提示：当前处于本地静态预览实时流，已直连 HN / GitHub / DEV.to（V2EX 需部署至 Cloudflare Pages 后通过 /api/digest 代理聚合）。';
    } else {
      digestNotice.style.display = 'none';
    }
  }
}

function renderList() {
  filteredItems =
    activeSource === 'all'
      ? allItems
      : allItems.filter((item) => item.source === activeSource);

  updateProgress();
  updateModeUI();

  if (!filteredItems.length) {
    digestList.innerHTML = `
      <div class="card" style="text-align:center;padding:36px 20px;color:var(--text-secondary);">
        该数据源暂无可展示条目
      </div>
    `;
    return;
  }

  digestList.innerHTML = filteredItems
    .map((item, idx) => {
      const isRead = readSet.has(item.id);
      const hasSummary = hasSummaryContent(item);
      const displayTitle = item.zhTitle || item.title;
      const showOrig = item.zhTitle && item.title && item.zhTitle !== item.title;
      const safeUrl = isSafeHttpUrl(item.url) ? item.url : '#';

      return `
        <article class="digest-row ${hasSummary ? 'has-summary' : ''} ${isRead ? 'is-read' : ''}" data-id="${escapeHtml(item.id)}" data-idx="${idx}">
          <div class="digest-main" ${hasSummary ? `data-open-idx="${idx}"` : ''}>
            <span class="source-badge source-${escapeHtml(item.source)}">${escapeHtml(item.sourceLabel)}</span>
            <div style="min-width:0;flex:1;">
              ${
                hasSummary
                  ? `<button type="button" class="digest-title-btn" data-open-idx="${idx}">${escapeHtml(displayTitle)}</button>`
                  : `<a class="digest-title digest-link" href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer" data-id="${escapeHtml(item.id)}">${escapeHtml(displayTitle)} ↗</a>`
              }
              ${showOrig ? `<div class="digest-orig-title">${escapeHtml(item.title)}</div>` : ''}
              ${item.tldr ? `<div class="digest-tldr-preview">${escapeHtml(item.tldr)}</div>` : ''}
              <div class="digest-meta">
                ${hasSummary ? '<span class="muse-chip">✦ Muse 摘要</span>' : ''}
                <span>${escapeHtml(item.meta)}</span>
              </div>
            </div>
          </div>
          <div class="digest-row-actions">
            ${
              hasSummary && isSafeHttpUrl(item.url)
                ? `<a class="btn btn-sm digest-link" href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer" data-id="${escapeHtml(item.id)}" title="直接打开原文">原文 ↗</a>`
                : ''
            }
            <button type="button" class="btn-mark-read ${isRead ? 'done' : ''}" data-id="${escapeHtml(item.id)}">
              ${isRead ? '✓ 已读' : '标记已读'}
            </button>
          </div>
        </article>
      `;
    })
    .join('');

  digestList.querySelectorAll('[data-open-idx]').forEach((el) => {
    el.addEventListener('click', (e) => {
      // Avoid double trigger if button inside .digest-main was clicked
      e.stopPropagation();
      const idx = Number(el.dataset.openIdx);
      openSummaryDrawer(idx);
    });
  });

  digestList.querySelectorAll('.digest-link').forEach((a) => {
    a.addEventListener('click', () => {
      markAsRead(a.dataset.id);
      renderList();
    });
  });

  digestList.querySelectorAll('.btn-mark-read').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (readSet.has(id)) {
        readSet.delete(id);
      } else {
        readSet.add(id);
      }
      saveReadSet(readSet);
      renderList();
    });
  });
}

// ==================== Muse 摘要阅读抽屉 ====================
function openSummaryDrawer(idx) {
  const item = filteredItems[idx];
  if (!item) return;

  activeDrawerIdx = idx;
  markAsRead(item.id);
  renderList();

  digestDrawer.classList.add('open');
  document.body.style.overflow = 'hidden';
  renderDrawerContent();
}

function closeSummaryDrawer() {
  digestDrawer.classList.remove('open');
  document.body.style.overflow = '';
  activeDrawerIdx = -1;
}

function renderDrawerContent() {
  const item = filteredItems[activeDrawerIdx];
  if (!item) return;

  drawerSourceBadge.className = `source-badge source-${item.source}`;
  drawerSourceBadge.textContent = item.sourceLabel || item.source.toUpperCase();
  drawerMetaText.textContent = item.meta || `${activeDrawerIdx + 1} / ${filteredItems.length}`;

  const displayTitle = item.zhTitle || item.title;
  const showOrig = item.zhTitle && item.title && item.zhTitle !== item.title;
  const isRead = readSet.has(item.id);
  const hasPrev = activeDrawerIdx > 0;
  const hasNext = activeDrawerIdx < filteredItems.length - 1;

  const tagsHtml = (item.tags || []).length
    ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;">${item.tags
        .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
        .join('')}</div>`
    : '';

  const tldrText = item.tldr || item.summary || '';
  const tldrHtml = tldrText
    ? `<div class="card-kicker" style="margin-bottom:8px;">TL;DR · 一句话结论</div>
       <div class="summary-tldr-box">${escapeHtml(tldrText)}</div>`
    : '';

  const bulletsHtml = (item.bullets || []).length
    ? `<div class="card-kicker" style="margin-bottom:8px;">Key Takeaways · 核心要点</div>
       <ul class="summary-bullets">${item.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`
    : '';

  const museHtml = item.museTake
    ? `<div class="card-kicker" style="margin-bottom:8px;color:#fda4af;">✦ Muse 的视角</div>
       <div class="muse-take-box">${escapeHtml(item.museTake)}</div>`
    : '';

  const safeUrl = isSafeHttpUrl(item.url) ? item.url : '';
  const safeDiscuss = isSafeHttpUrl(item.discussUrl) && item.discussUrl !== item.url ? item.discussUrl : '';

  digestDrawerBody.innerHTML = `
    <h2 style="margin:0 0 8px;font-size:21px;line-height:1.38;">${escapeHtml(displayTitle)}</h2>
    ${showOrig ? `<div style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);margin-bottom:14px;overflow-wrap:anywhere;">${escapeHtml(item.title)}</div>` : ''}
    ${tagsHtml}
    ${tldrHtml}
    ${bulletsHtml}
    ${museHtml}
    <div class="drawer-footer-actions">
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${safeUrl ? `<a class="btn btn-sm btn-primary" href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">阅读原文 ↗</a>` : ''}
        ${safeDiscuss ? `<a class="btn btn-sm" href="${escapeHtml(safeDiscuss)}" target="_blank" rel="noopener noreferrer">查看讨论 ↗</a>` : ''}
        <button type="button" class="btn btn-sm" id="btnDrawerToggleRead">${isRead ? '✓ 已读（点此标未读）' : '标记已读'}</button>
      </div>
      <div style="display:flex;gap:8px;">
        <button type="button" class="btn btn-sm" id="btnDrawerPrev" ${hasPrev ? '' : 'disabled style="opacity:0.4;cursor:not-allowed;"'}>← 上一篇</button>
        <button type="button" class="btn btn-sm" id="btnDrawerNext" ${hasNext ? '' : 'disabled style="opacity:0.4;cursor:not-allowed;"'}>下一篇 →</button>
      </div>
    </div>
  `;

  document.getElementById('btnDrawerToggleRead').addEventListener('click', () => {
    if (readSet.has(item.id)) {
      readSet.delete(item.id);
    } else {
      readSet.add(item.id);
    }
    saveReadSet(readSet);
    renderList();
    renderDrawerContent();
  });

  if (hasPrev) {
    document.getElementById('btnDrawerPrev').addEventListener('click', () => {
      openSummaryDrawer(activeDrawerIdx - 1);
    });
  }

  if (hasNext) {
    document.getElementById('btnDrawerNext').addEventListener('click', () => {
      openSummaryDrawer(activeDrawerIdx + 1);
    });
  }
}

btnCloseDigestDrawer.addEventListener('click', closeSummaryDrawer);
digestDrawer.addEventListener('click', (e) => {
  if (e.target === digestDrawer) closeSummaryDrawer();
});
document.addEventListener('keydown', (e) => {
  if (!digestDrawer.classList.contains('open')) return;
  if (e.key === 'Escape') {
    closeSummaryDrawer();
  } else if (e.key === 'ArrowLeft' && activeDrawerIdx > 0) {
    openSummaryDrawer(activeDrawerIdx - 1);
  } else if (e.key === 'ArrowRight' && activeDrawerIdx < filteredItems.length - 1) {
    openSummaryDrawer(activeDrawerIdx + 1);
  }
});

// ==================== 数据加载与模式切换 ====================
async function loadCurated({ force = false } = {}) {
  if (!curatedData || force) {
    curatedData = await fetchCuratedDigest('..');
  }
  if (curatedData?.items?.length) {
    activeMode = 'curated';
    allItems = curatedData.items;
    renderList();
    return true;
  }
  return false;
}

async function loadLive({ force = false } = {}) {
  digestList.innerHTML = `
    <div class="card" style="text-align:center;padding:42px 20px;font-family:var(--font-mono);font-size:13px;color:var(--text-muted);">
      正在聚合 HN / GitHub / V2EX / DEV.to 实时精选...
    </div>
  `;
  try {
    if (!liveData || force) {
      liveData = await fetchGeekDigest();
    }
    activeMode = 'live';
    allItems = liveData.items || [];
    renderList();
  } catch (err) {
    digestList.innerHTML = `
      <div class="card" style="text-align:center;padding:36px 20px;color:#fda4af;">
        加载实时早报失败：${escapeHtml(err.message)}
      </div>
    `;
  }
}

async function init() {
  const sh = getShanghaiDate(0);
  digestDateLabel.textContent = `${sh.displayDate} · 预计阅读 3 分钟`;

  const okCurated = await loadCurated();
  if (!okCurated) {
    await loadLive();
  }
}

modeCuratedBtn.addEventListener('click', async () => {
  const ok = await loadCurated();
  if (!ok) {
    digestNotice.style.display = 'block';
    digestNotice.textContent = '暂无 data/digest.json 定刊内容，已保持实时流模式。';
  }
});

modeLiveBtn.addEventListener('click', () => loadLive());

document.querySelectorAll('.filter-pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-pill').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    activeSource = btn.dataset.source;
    renderList();
  });
});

document.getElementById('btnRefreshDigest').addEventListener('click', async () => {
  if (activeMode === 'curated') {
    const ok = await loadCurated({ force: true });
    if (!ok) await loadLive({ force: true });
  } else {
    await loadLive({ force: true });
  }
});

document.getElementById('btnResetRead').addEventListener('click', () => {
  readSet = new Set();
  saveReadSet(readSet);
  renderList();
  if (digestDrawer.classList.contains('open')) {
    renderDrawerContent();
  }
});

init();
