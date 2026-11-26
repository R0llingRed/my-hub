# DEV // HUB — 个人数字工作台

极简深色极客风（Linear / Vercel 质感）个人导航与趣味小站，纯静态前端零构建步骤，开箱即用。

## 包含模块

- **首页工作台 (`/`)**：Bento 卡片布局，聚合 IT-Tools、CyberChef、「今日一碟」实时预览、NBA 今日焦点、本地暂存便签与常用直达链接；支持键盘快捷键 `1`–`4` 秒切。
- **站内工具箱 (`/tools/`)**：内置同源静态版 **IT-Tools** (`/apps/it-tools/`) 与 **CyberChef v11.6.0** (`/apps/cyberchef/`)，顶部导航栏与主站保持完全一致，支持一键切换与宽屏模式，无需跳出当前域名。
- **今日一碟 (`/vinyl/`)**：每天上海时间 `00:00` 自动切换一张经典摇滚专辑，带黑胶旋转动效、专辑主色光晕、短评、完整曲目表、可拖拽进度条的 iTunes 30 秒原声试听、近期 7 天唱片架与随机盲抽。
- **NBA 看板 (`/nba/`)**：按上海时间（`Asia/Shanghai`）精准归类的昨/今/明三日赛程、智能自动刷新、主队置顶、防剧透模式、得分领跑者与 YouTube 官方集锦直达。

## 本地预览

无需安装任何依赖，在项目目录下启动任意静态服务器即可：

```bash
python3 -m http.server 8788
```

然后浏览器打开 `http://localhost:8788`。

## 自定义配置

1. **替换自建 IT-Tools / CyberChef 链接**：编辑 `config.js` 中的 `tools.itTools.url` 和 `tools.cyberChef.url`。
2. **扩充「今日一碟」曲库**：编辑 `data/albums.json`，按相同格式追加专辑即可。

## 部署到 Cloudflare Pages 并绑定 hidns 子域名

1. 将本目录推送到你的 GitHub 仓库。
2. 登录 Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → 关联该仓库。
3. **Build command** 留空，**Build output directory** 填 `.`（根目录），点击部署。
   - `functions/api/nba.js` 会自动作为 Cloudflare Pages Functions 生效。
4. 部署完成后进入项目的 **Custom domains**，添加你的 `hidns` 子域名，按 Cloudflare 提示在 hidns 后台添加对应的 `CNAME` 记录即可。
