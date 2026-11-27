import {
  escapeHtml,
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

let allItems = [];
let activeSource = 'all';

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

function updateProgress() {
  const total = allItems.length;
  const readCount = allItems.filter((item) => readSet.has(item.id)).length;
  const pct = total > 0 ? Math.round((readCount / total) * 100) : 0;
  readBarFill.style.width = `${pct}%`;
  readProgressBadge.textContent = `已读 ${readCount} / ${total}`;
}

function renderList() {
  const filtered = activeSource === 'all'
    ? allItems
    : allItems.filter((item) => item.source === activeSource);

  updateProgress();

  if (!filtered.length) {
    digestList.innerHTML = `
      <div class="card" style="text-align:center;padding:36px 20px;color:var(--text-secondary);">
        该数据源暂无可展示条目
      </div>
    `;
    return;
  }

  digestList.innerHTML = filtered
    .map((item) => {
      const isRead = readSet.has(item.id);
      return `
        <article class="digest-row ${isRead ? 'is-read' : ''}" data-id="${escapeHtml(item.id)}">
          <div class="digest-main">
            <span class="source-badge source-${escapeHtml(item.source)}">${escapeHtml(item.sourceLabel)}</span>
            <div style="min-width:0;flex:1;">
              <a class="digest-title digest-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" data-id="${escapeHtml(item.id)}">
                ${escapeHtml(item.title)}
              </a>
              <div class="digest-meta">${escapeHtml(item.meta)}</div>
            </div>
          </div>
          <button class="btn-mark-read ${isRead ? 'done' : ''}" data-id="${escapeHtml(item.id)}">
            ${isRead ? '✓ 已读' : '标记已读'}
          </button>
        </article>
      `;
    })
    .join('');

  digestList.querySelectorAll('.digest-link').forEach((a) => {
    a.addEventListener('click', () => {
      readSet.add(a.dataset.id);
      saveReadSet(readSet);
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

async function loadDigest() {
  const sh = getShanghaiDate(0);
  digestDateLabel.textContent = `${sh.displayDate} · 预计阅读 3 分钟`;
  digestList.innerHTML = `
    <div class="card" style="text-align:center;padding:42px 20px;font-family:var(--font-mono);font-size:13px;color:var(--text-muted);">
      正在聚合 HN / GitHub / V2EX / DEV.to 精选内容...
    </div>
  `;

  try {
    const data = await fetchGeekDigest();
    allItems = data.items || [];
    if (data.mode === 'direct') {
      digestNotice.style.display = 'block';
      digestNotice.textContent =
        '提示：当前处于本地静态预览模式，已直连加载 HN / GitHub / DEV.to（V2EX 需部署至 Cloudflare Pages 后通过 /api/digest 代理聚合）。';
    } else {
      digestNotice.style.display = 'none';
    }
    renderList();
  } catch (err) {
    digestList.innerHTML = `
      <div class="card" style="text-align:center;padding:36px 20px;color:#fda4af;">
        加载早报失败：${escapeHtml(err.message)}
      </div>
    `;
  }
}

document.querySelectorAll('.filter-pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-pill').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    activeSource = btn.dataset.source;
    renderList();
  });
});

document.getElementById('btnRefreshDigest').addEventListener('click', loadDigest);
document.getElementById('btnResetRead').addEventListener('click', () => {
  readSet = new Set();
  saveReadSet(readSet);
  renderList();
});

loadDigest();
