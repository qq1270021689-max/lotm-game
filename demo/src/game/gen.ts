// 程序化生成器：随机 NPC 与委托事件
import type { GenNPC, Commission, GameState, StatKey, Nemesis } from './types';
import { NPCS, LOCATIONS } from './data';

const rnd = (n: number) => Math.floor(Math.random() * n);
const pick = <T,>(arr: T[]): T => arr[rnd(arr.length)];

// ============ 名字库 ============
const FIRST = ['汤姆', '杰森', '玛丽', '安妮', '露西亚', '罗恩', '哈罗德', '薇拉', '山姆', '贝丝', '乔治', '艾达', '柯林', '莫娜', '鲁伯特', '西比尔', '艾格尼丝', '多莉', '内特', '奥斯温', '格温', '巴尼', '伊迪丝', '芬恩'];
const LAST = ['格雷', '芬奇', '霍布斯', '怀特', '布莱克伍德', '科恩', '斯通', '里德', '巴克', '温赖特', '克劳利', '夏普', '莫顿', '费尔', '奥克利', '邓恩', '海耶斯', '波顿'];

// ============ 职业与作息模板 ============
interface Job { name: string; identity: string; from: number; to: number; location: string; workDays: number[]; extra?: { from: number; to: number; location: string } }
const WORKWEEK = [1, 2, 3, 4, 5, 6]; // 周一至周六，周日休
const JOBS: Job[] = [
  { name: 'docker', identity: '码头搬运工', from: 5, to: 14, location: '东区码头', workDays: WORKWEEK, extra: { from: 19, to: 23, location: '「醉水手」酒馆' } },
  { name: 'barmaid', identity: '酒馆侍者', from: 16, to: 25, location: '「醉水手」酒馆', workDays: [0, 1, 2, 3, 4, 5, 6] },
  { name: 'newsboy', identity: '报童', from: 6, to: 12, location: '佐特兰街街角', workDays: [0, 1, 2, 3, 4, 5, 6], extra: { from: 14, to: 18, location: '工厂区门口' } },
  { name: 'tailor', identity: '裁缝', from: 9, to: 18, location: '水仙花街裁缝铺', workDays: WORKWEEK },
  { name: 'constable', identity: '巡警', from: 8, to: 18, location: '东区街道巡逻中', workDays: [0, 1, 2, 3, 4, 5, 6] },
  { name: 'student', identity: '大学旁听生', from: 9, to: 16, location: '霍伊大学图书馆', workDays: WORKWEEK, extra: { from: 18, to: 22, location: '北区咖啡馆' } },
  { name: 'medic', identity: '诊所助手', from: 9, to: 17, location: '北区诊所', workDays: WORKWEEK },
  { name: 'sailor', identity: '运河水手', from: 7, to: 19, location: '运河码头', workDays: WORKWEEK, extra: { from: 20, to: 25, location: '「醉水手」酒馆' } },
  { name: 'gravedigger', identity: '墓地看守', from: 19, to: 27, location: '拉斐尔墓园', workDays: [0, 1, 2, 3, 4, 5, 6] },
  { name: 'pawnbroker', identity: '当铺伙计', from: 9, to: 19, location: '「金汤匙」当铺', workDays: WORKWEEK },
  { name: 'sweep', identity: '烟囱清扫工', from: 6, to: 13, location: '各区屋顶', workDays: WORKWEEK, extra: { from: 17, to: 21, location: '「醉水手」酒馆' } },
  { name: 'actress', identity: '剧院女演员', from: 12, to: 23, location: '微风剧院', workDays: [2, 3, 4, 5, 6, 0] }, // 周一休息
  { name: 'bookkeeper', identity: '商行账房', from: 9, to: 18, location: '铁十字街商行', workDays: WORKWEEK },
  { name: 'fishwife', identity: '鱼贩', from: 5, to: 13, location: '东区市场', workDays: [0, 1, 2, 3, 4, 5, 6], extra: { from: 17, to: 20, location: '「醉水手」酒馆' } },
];

// ============ 性格 / 动机 / 秘密 ============
const TRAITS = ['健谈', '吝啬', '热心肠', '多疑', '虔诚', '酗酒', '爱打听', '沉默寡言', '暴脾气', '笑面虎', '记仇', '慷慨', '胆小', '精明', '阴郁', '嘴碎'];
const MOTIVES = [
  '攒钱离开这座雾城', '给死去的父亲补办体面的葬礼', '供弟弟读文法学校', '查清三年前那场「事故」',
  '攒钱盘下一个小摊位', '躲避乡下的旧债', '攒钱治病', '往上爬，不择手段',
  '只想安安稳稳过日子', '寻找失踪的妹妹', '偿还赌债', '攒一笔嫁妆',
];
const SECRETS_NORMAL = [
  '偷拿过雇主的钱柜零钱', '有个不敢公开的私生子', '身份文书是伪造的', '欠着血手套一笔旧债',
  '是码头工潮的秘密组织者', '床底下藏着一箱禁书', '年轻时蹲过三个月监狱', '在给报社写匿名揭发信',
];
const SECRETS_GRAY = [
  '是走私船的岸上联络人', '替黑帮销赃抽成', '伪造教会印章的副业', '向警局出卖邻居的行踪',
];
const SECRETS_BEYONDER = [
  '其实是序列9的野生非凡者，正为消化发愁', '是某隐秘组织的外围眼线', '目击过一次失控事件并瞒报至今', '家里阁楼藏着一件来路不明的封印物',
];

let npcCounter = 0;

/** 生成一个随机 NPC */
export function generateNPC(): GenNPC {
  const job = pick(JOBS);
  const name = `${pick(FIRST)}·${pick(LAST)}`;
  const traits = [...new Set([pick(TRAITS), pick(TRAITS)])];
  const motive = pick(MOTIVES);
  const roll = rnd(100);
  const secret = roll < 70 ? pick(SECRETS_NORMAL) : roll < 90 ? pick(SECRETS_GRAY) : pick(SECRETS_BEYONDER);
  // 固定生活节奏：工作日上班 + 每周固定的消遣夜（每人不同）
  const leisureDays = [...new Set([pick([5, 6, 0]), pick([5, 6, 0])])]; // 周五/周六/周日晚
  const schedule = [
    { from: job.from, to: job.to, location: job.location, interactable: true, days: job.workDays },
    ...(job.extra ? [{ from: job.extra.from, to: job.extra.to, location: job.extra.location, interactable: true, days: leisureDays }] : []),
  ];
  return {
    id: `gen_${Date.now().toString(36)}_${npcCounter++}`,
    name,
    identity: job.identity,
    desc: `${traits.join('、')}。${motive}。`,
    schedule,
    generated: true,
    traits,
    motive,
    secret,
  };
}

// ============ 委托模板 ============
const STRANGE = ['夜半的歌声', '连续失踪的货物', '渗血的墙壁', '镜中多出来的倒影', '暴毙的牲畜', '总在移动的石像'];
const BEASTS = ['大如狗的巨鼠群', '雾中的野犬', '下水道的鳞怪', '发狂的流浪猫群'];
const CARGO = ['一箱「茶叶」', '密封的铅盒', '不愿登记的药剂', '贴假标签的酒桶'];

const KINDS: { kind: Commission['kind']; stat: StatKey; beyonderBias: boolean }[] = [
  { kind: 'investigate', stat: 'mnd', beyonderBias: false },
  { kind: 'investigate', stat: 'spi', beyonderBias: true },
  { kind: 'hunt', stat: 'phy', beyonderBias: false },
  { kind: 'escort', stat: 'cha', beyonderBias: false },
  { kind: 'collect', stat: 'spi', beyonderBias: true },
];

/** 按委托类型选择合适的真实地点 */
function pickLocationFor(kind: Commission['kind']): string {
  const table: Record<string, string[]> = {
    investigate: ['docks', 'graveyard', 'factory', 'old_tower', 'canal', 'manor', 'ramd'],
    hunt: ['sewer', 'factory', 'docks', 'manor'],
    escort: ['canal', 'docks', 'market'],
    collect: ['canal', 'factory', 'black_market', 'manor'],
  };
  return pick(table[kind] ?? ['docks']);
}

/** 生成一个委托 */
export function generateCommission(state: GameState): Commission {
  const allNpcIds = [...NPCS.map(n => n.id), ...state.genNpcs.map(n => n.id)];
  const client = pick(allNpcIds);
  const beyonder = state.pathwayId !== null;
  const occult = beyonder && rnd(100) < 30;
  const t = pick(KINDS);
  const difficulty = 20 + rnd(60);
  const baseReward = 36 + difficulty * 2 + (occult ? 60 : 0);
  const loc = LOCATIONS.find(l => l.id === pickLocationFor(t.kind)) ?? LOCATIONS[0];
  let title = '', text = '';
  switch (t.kind) {
    case 'investigate':
      title = `调查${loc.name}的怪事`;
      text = occult
        ? `委托人压低声音：${loc.name}出现了${pick(STRANGE)}——「我知道你不是一般人。去查查，别声张。」`
        : `${loc.name}最近不太平：${pick(STRANGE)}。委托人想知道真相，又不想自己惹麻烦。`;
      break;
    case 'hunt':
      title = `清剿${loc.name}的${pick(BEASTS)}`;
      text = occult ? `那不是普通的野兽——委托人的眼神闪烁，「它……咬死的人不对劲。」` : `雇主按尾巴结算，干净利落。`;
      break;
    case 'escort':
      title = `护送委托人到${loc.name}`;
      text = `夜路不太平，委托人需要一个「看起来不好惹」的陪同。`;
      break;
    case 'collect':
      title = `去${loc.name}取回${pick(CARGO)}`;
      text = occult ? `「不要打开看。不要问。送到就走。」——越是这么说，越说明里面不是普通货。` : `跑腿取货，问价不问货。`;
      break;
  }
  return {
    id: `com_${Date.now().toString(36)}_${rnd(9999)}`,
    kind: t.kind, stat: t.stat, difficulty,
    title, text, client,
    locationId: loc.id,
    reward: Math.round(baseReward),
    daysLeft: 2 + rnd(2),
    occult,
  };
}

/** 每日刷新委托板（3 个） */
export function refreshBoard(state: GameState) {
  state.board = [generateCommission(state), generateCommission(state), generateCommission(state)];
}

// ============ 宿敌生成 ============
const NEMESIS_ARCHETYPES: { archetype: string; name: () => string; motive: Record<string, string> }[] = [
  {
    archetype: '非凡者复仇者',
    name: () => `「${pick(['独眼', '灰羽', '缝针', '哑钟'])}」${pick(FIRST)}`,
    motive: { revenge: '你取走的那份析出特性，属于ta的同门（或血亲）。这份债要用命来还。' },
  },
  {
    archetype: '隐秘组织清场人',
    name: () => `「${pick(['缄默', '无面', '剔骨', '守秘'])}者」`,
    motive: { occult: '你碰了不该碰的非凡事务。某个隐秘组织决定让你连同你知道的东西一起消失。' },
  },
  {
    archetype: '黑帮清道夫',
    name: () => `「${pick(['剃刀', '铁靴', '绞索', '碎颅'])}」${pick(LAST)}`,
    motive: { debt: '你挡了码头上某些人的财路。黑帮的规矩：断人财路者，沉河。' },
  },
];

export function spawnNemesis(s: GameState, cause: 'revenge' | 'occult' | 'debt'): Nemesis {
  const t = pick(NEMESIS_ARCHETYPES);
  const avg = (s.stats.phy + s.stats.spi + s.stats.mnd + s.stats.cha) / 4;
  const n: Nemesis = {
    name: t.name(),
    archetype: t.archetype,
    motive: t.motive[cause] ?? '你无意间成了ta必须除掉的人。',
    power: Math.round(35 + avg * 0.3 + rnd(15)),
    hostility: 40 + rnd(20),
    known: false,
    alive: true,
  };
  return n;
}
