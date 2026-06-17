// Anime broadcast schedule data
// Organized by day of the week with airing info

export interface AnimeScheduleItem {
  id: string;
  title: string;
  title_cn: string;
  poster: string;
  douban_id?: string;
  weekday: number; // 1=周一 ... 7=周日
  time?: string; // e.g. "22:00"
  status: 'airing' | 'upcoming' | 'finished';
  season: string; // e.g. "2025-07"
  genres: string[];
  summary?: string;
  episodes?: number;
  current_episode?: number;
}

export interface AnimeScheduleDay {
  weekday: number;
  label: string;
  items: AnimeScheduleItem[];
}

// Current season anime schedule data
// This serves as curated data; can be extended to fetch from external APIs
const currentSeasonSchedule: AnimeScheduleItem[] = [
  {
    id: '368502',
    title: '鬼灭之刃 无限城篇',
    title_cn: '鬼灭之刃 无限城篇',
    poster:
      'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2915087658.webp',
    douban_id: '368502',
    weekday: 5,
    time: '23:15',
    status: 'airing',
    season: '2025-07',
    genres: ['动作', '奇幻', '热血'],
    summary: '灶门炭治郎等人终于抵达无限城，与鬼舞辻无惨的最终决战即将展开。',
    episodes: 12,
    current_episode: 1,
  },
  {
    id: '367893',
    title: '葬送的芙莉莲 第二季',
    title_cn: '葬送的芙莉莲 第二季',
    poster:
      'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2917889118.webp',
    douban_id: '367893',
    weekday: 5,
    time: '23:00',
    status: 'airing',
    season: '2025-07',
    genres: ['奇幻', '冒险', '治愈'],
    summary: '芙莉莲一行继续踏上了解人类的旅程，新的冒险与邂逅在前方等待。',
    episodes: 24,
    current_episode: 1,
  },
  {
    id: '362177',
    title: '咒术回战 第三季',
    title_cn: '咒术回战 第三季',
    poster:
      'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p2911026681.webp',
    douban_id: '362177',
    weekday: 4,
    time: '23:56',
    status: 'airing',
    season: '2025-07',
    genres: ['战斗', '奇幻', '黑暗'],
    summary: '死灭回游篇正式开幕，咒术师们陷入更加残酷的战斗。',
    episodes: 24,
    current_episode: 1,
  },
  {
    id: '363282',
    title: '间谍过家家 第三季',
    title_cn: '间谍过家家 第三季',
    poster:
      'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p2915769834.webp',
    douban_id: '363282',
    weekday: 6,
    time: '23:00',
    status: 'airing',
    season: '2025-07',
    genres: ['喜剧', '日常', '温馨'],
    summary: '福杰一家的日常冒险继续，新的任务和学校生活交织展开。',
    episodes: 12,
    current_episode: 1,
  },
  {
    id: '356993',
    title: '我推的孩子 第三季',
    title_cn: '我推的孩子 第三季',
    poster:
      'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2915128038.webp',
    douban_id: '356993',
    weekday: 3,
    time: '23:00',
    status: 'airing',
    season: '2025-07',
    genres: ['偶像', '悬疑', '演艺圈'],
    summary: '舞台剧篇开启，阿库亚和露比在演艺圈的道路愈发复杂。',
    episodes: 13,
    current_episode: 1,
  },
  {
    id: '364322',
    title: 'Re:从零开始的异世界生活 第三季',
    title_cn: 'Re:从零开始的异世界生活 第三季',
    poster:
      'https://img3.doubanio.com/view/photo/s_ratio_poster/public/p2912673852.webp',
    douban_id: '364322',
    weekday: 3,
    time: '22:30',
    status: 'airing',
    season: '2025-07',
    genres: ['奇幻', '冒险', '心理'],
    summary: '水门都市普利斯提拉篇，菜月昴面临前所未有的挑战。',
    episodes: 16,
    current_episode: 1,
  },
  {
    id: '359822',
    title: '进击的巨人 最终季 完结篇',
    title_cn: '进击的巨人 最终季 完结篇',
    poster:
      'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p2910889131.webp',
    douban_id: '359822',
    weekday: 1,
    time: '00:00',
    status: 'airing',
    season: '2025-07',
    genres: ['战斗', '黑暗', '史诗'],
    summary: '艾伦与三笠、阿尔敏的命运交织，巨人的故事走向最终结局。',
    episodes: 2,
    current_episode: 1,
  },
  {
    id: '349279',
    title: '迷宫饭 第二季',
    title_cn: '迷宫饭 第二季',
    poster:
      'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p2911248776.webp',
    douban_id: '349279',
    weekday: 4,
    time: '22:30',
    status: 'airing',
    season: '2025-07',
    genres: ['美食', '冒险', '奇幻', '喜剧'],
    summary: '莱欧斯一行继续深入迷宫，用魔物制作美食的冒险再次展开。',
    episodes: 24,
    current_episode: 1,
  },
  {
    id: '360937',
    title: '冰菓 第二季',
    title_cn: '冰菓 第二季',
    poster:
      'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2909831569.webp',
    douban_id: '360937',
    weekday: 6,
    time: '22:00',
    status: 'airing',
    season: '2025-07',
    genres: ['校园', '推理', '日常'],
    summary: '古典部再次集结，折木奉太郎的灰色青春迎来了新的谜题。',
    episodes: 12,
    current_episode: 1,
  },
  {
    id: '302523',
    title: '海贼王',
    title_cn: '海贼王',
    poster:
      'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p2914886731.webp',
    douban_id: '302523',
    weekday: 7,
    time: '09:30',
    status: 'airing',
    season: 'ongoing',
    genres: ['冒险', '热血', '友情'],
    summary: '路飞与伙伴们继续伟大航路的冒险，蛋头岛篇激战正酣。',
    episodes: 1200,
    current_episode: 1122,
  },
  {
    id: '304761',
    title: '名侦探柯南',
    title_cn: '名侦探柯南',
    poster:
      'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p2914879506.webp',
    douban_id: '304761',
    weekday: 6,
    time: '18:00',
    status: 'airing',
    season: 'ongoing',
    genres: ['推理', '悬疑', '日常'],
    summary: '江户川柯南继续解决各种案件，黑衣组织的阴影逐渐浮现。',
    episodes: 1200,
    current_episode: 1150,
  },
  {
    id: '362498',
    title: '黑执事 寄宿学校篇',
    title_cn: '黑执事 寄宿学校篇',
    poster:
      'https://img3.doubanio.com/view/photo/s_ratio_poster/public/p2910456712.webp',
    douban_id: '362498',
    weekday: 2,
    time: '23:30',
    status: 'airing',
    season: '2025-07',
    genres: ['黑暗', '奇幻', '悬疑'],
    summary: '夏尔和塞巴斯蒂安潜入威斯顿寄宿学校，调查学生失踪事件。',
    episodes: 11,
    current_episode: 1,
  },
];

export function getAnimeSchedule(): AnimeScheduleDay[] {
  const weekdays = [
    { weekday: 1, label: '周一' },
    { weekday: 2, label: '周二' },
    { weekday: 3, label: '周三' },
    { weekday: 4, label: '周四' },
    { weekday: 5, label: '周五' },
    { weekday: 6, label: '周六' },
    { weekday: 7, label: '周日' },
  ];

  return weekdays.map((day) => ({
    ...day,
    items: currentSeasonSchedule.filter((item) => item.weekday === day.weekday),
  }));
}

export function getAllAnime(): AnimeScheduleItem[] {
  return currentSeasonSchedule;
}
