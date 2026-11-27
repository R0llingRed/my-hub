# DEV // HUB — 个人数字工作台

极简深色极客风（Linear / Vercel 质感）个人导航与趣味小站，纯静态前端零构建步骤，开箱即用，原生适配 Cloudflare Pages + Pages Functions。

## 包含模块

- **首页工作台 (`/`)**：Bento 卡片布局，聚合 IT-Tools、今日一碟、今日一影、3 分钟极客早报、今日一词/每日一问交互卡、NBA 今日焦点、Hana // Muse 预留区、本地暂存便签与常用直达链接；支持键盘快捷键 `1`–`6` 秒切。
- **站内工具箱 (`/tools/`)**：内置同源静态版 **IT-Tools** (`/apps/it-tools/`)，顶部导航栏与主站保持完全一致，支持宽屏模式，无需跳出当前域名。
- **极客早报 (`/digest/`)**：3 分钟信息降噪台，优先读取 Muse 每日精选定刊 `data/digest.json`（点击条目滑出站内摘要抽屉阅读，含 TL;DR、核心要点与 Muse 点评），同时支持切换实时流模式（聚合 HN、GitHub、V2EX、DEV.to）与本地已读进度条。
- **今日一碟 (`/vinyl/`)**：每天上海时间 `00:00` 自动切换一张经典摇滚专辑，带黑胶旋转动效、iTunes 30 秒原声试听、**盲听猜碟挑战**、**Web Audio 黑胶底噪 / 深夜雨声 + 番茄钟**、**个人听歌打卡与评分**、全部曲库唱片架以及 **PNG 日签海报导出**。
- **今日一影 (`/film/`)**：每天零点切换一部影史佳作，包含风格化文字海报、**5 色电影色盘（点击复制 HEX）**、经典台词、短评、豆瓣/IMDb/Letterboxd 直达与个人观影打卡评分。
- **今日一词 / 每日一问 (`/qotd/`)**：精选 Linux / 网络 / Git 命令速记、分布式/安全核心概念与系统设计思考题，支持分类筛选、关键词搜索与本地收藏。
- **NBA 看板 (`/nba/`)**：按上海时间（`Asia/Shanghai`）精准归类的昨/今/明三日赛程、智能自动刷新、主队置顶、防剧透模式、**站内完整 Box Score 抽屉**（`functions/api/nba-summary.js`）以及 **东西部实时战绩榜**（`functions/api/nba-standings.js`）。
- **Hana 空间 (`/hana/`)**：为 Muse 预留的独立创作与实验自留地，可自由接管与发挥。

## 本地预览

无需安装任何依赖，在项目目录下启动任意静态服务器即可：

```bash
python3 -m http.server 8788
```

然后浏览器打开 `http://localhost:8788`（本地静态模式下没有 Cloudflare Pages Functions，NBA 接口与支持 CORS 的早报数据源会自动降级直连）。

## 自定义配置

1. **替换自建 IT-Tools 链接**：编辑 `config.js` 中的 `tools.itTools.url`。
2. **扩充曲库 / 片库 / 题库**：分别编辑 `data/albums.json`、`data/films.json` 与 `data/daily-bits.json`，按相同格式追加即可。
3. **接入 Muse 每日早报 (`data/digest.json`)**：
   - Muse 每天定时抓取与提炼后，覆写 `data/digest.json` 并推送即可，`/digest/` 与首页预览会自动优先加载：
   - 顶层字段：`date`、`edition`、`editor`、`updatedAt`、`editorNote`、`items[]`。
   - 单条字段：`id`、`source`（`hn` | `github` | `v2ex` | `devto`）、`title`（原标题）、`zhTitle`（中文标题）、`url`（原文链接）、`discussUrl`（可选讨论链接）、`meta`、`tags[]`、`tldr`（一句话结论）、`bullets[]`（核心要点数组）、`museTake`（Muse 点评）。
4. **接管 `/hana/`**：直接编辑 `hana/index.html` 或将独立子应用放入 `hana/` 目录。

## 部署到 Cloudflare Pages

1. 将本目录推送到你的 GitHub 仓库。
2. 登录 Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → 关联该仓库。
3. **Build command** 留空，**Build output directory** 填 `.`（根目录），点击部署。
   - `functions/api/nba.js`、`nba-summary.js`、`nba-standings.js` 与 `digest.js` 会自动作为 Cloudflare Pages Functions 生效。
4. 部署完成后进入项目的 **Custom domains**，添加你的域名并按提示配置 `CNAME` 记录即可。
