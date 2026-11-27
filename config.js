/**
 * 个人数字工作台配置文件
 * 部署自己的 IT-Tools 后，直接替换下方链接即可。
 */
export const SITE_CONFIG = {
  title: 'DEV // HUB',
  subtitle: '极简工具与日常自留地',
  timeZone: 'Asia/Shanghai', // 上海时间 (Asia/Shanghai)
  // true: 点击工具在站内工作区（iframe）打开；false: 新标签页跳转
  openToolsInWorkspace: true,

  tools: {
    itTools: {
      name: 'IT-Tools',
      tagline: '开发者日常瑞士军刀',
      description: 'JWT 解析、Hash/AES、JSON/YAML、Cron、CIDR 子网计算、正则测试等百余款纯前端工具。',
      // 已内置到本地同源目录，也可改为任意自建地址
      url: '/apps/it-tools/',
      tags: ['JWT', 'Hash', 'JSON', 'CIDR', 'Regex'],
      shortcut: '1',
    },
  },

  nba: {
    // 默认优先置顶的主队缩写（如 LAL, GSW, BOS, DEN, MIA, DAL, MIL 等），也可在页面内随时切换
    defaultFavoriteTeam: 'LAL',
    // Cloudflare Pages Functions 代理端点（本地开发无 Functions 时会自动降级直连 ESPN 公开接口）
    proxyEndpoint: '/api/nba',
    summaryProxyEndpoint: '/api/nba-summary',
    standingsProxyEndpoint: '/api/nba-standings',
  },

  digest: {
    proxyEndpoint: '/api/digest',
  },

  hana: {
    title: 'Hana // Muse',
    subtitle: 'Muse 专属创作与实验空间',
    path: './hana/',
  },

  // 可在首页底部的快捷链接栏添加其他常用地址
  extraLinks: [
    { name: 'GitHub', url: 'https://github.com', desc: '代码仓库' },
    { name: 'Cloudflare', url: 'https://dash.cloudflare.com', desc: 'DNS 与 Pages' },
    { name: 'Regex101', url: 'https://regex101.com', desc: '正则调试' },
    { name: 'Crontab.guru', url: 'https://crontab.guru', desc: 'Cron 速查' },
  ],
};
