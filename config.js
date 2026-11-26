/**
 * 个人数字工作台配置文件
 * 部署自己的 IT-Tools / CyberChef 后，直接替换下方链接即可。
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
    cyberChef: {
      name: 'CyberChef',
      tagline: '安全与编解码流水线',
      description: 'GCHQ 开源网络瑞士军刀，支持多步骤 Recipe 串联加解密、Magic 自动识别与证书解析。',
      // 已内置到本地同源目录，也可改为任意自建地址
      url: '/apps/cyberchef/',
      tags: ['Recipe', 'Base64', 'AES', 'Magic', 'X.509'],
      shortcut: '2',
    },
  },

  nba: {
    // 默认优先置顶的主队缩写（如 LAL, GSW, BOS, DEN, MIA, DAL, MIL 等），也可在页面内随时切换
    defaultFavoriteTeam: 'LAL',
    // Cloudflare Pages Functions 代理端点（本地开发无 Functions 时会自动降级直连 ESPN 公开接口）
    proxyEndpoint: '/api/nba',
  },

  // 可在首页底部的快捷链接栏添加其他常用地址
  extraLinks: [
    { name: 'GitHub', url: 'https://github.com', desc: '代码仓库' },
    { name: 'Cloudflare', url: 'https://dash.cloudflare.com', desc: 'DNS 与 Pages' },
    { name: 'Regex101', url: 'https://regex101.com', desc: '正则调试' },
    { name: 'Crontab.guru', url: 'https://crontab.guru', desc: 'Cron 速查' },
  ],
};
