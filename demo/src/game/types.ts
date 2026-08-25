// 《诡秘之主·灰雾人生》Demo 类型定义

export type StatKey = 'phy' | 'spi' | 'mnd' | 'cha';

export interface PlayerStats {
  phy: number; spi: number; mnd: number; cha: number;
  san: number;      // 理智 0-100
  cor: number;      // 污染 0-100
  energy: number;   // 精力 0-100
}

export interface Pathway {
  id: string;
  name: string;          // 途径名
  title: string;         // 称号
  desc: string;          // 玩法描述
  tendency: string;      // 成长倾向
  seqNames: string[];    // 索引0=序列9 ... 索引9=序列0
  seq9Ability: string;   // 序列9能力描述
  actingHint: string;    // 扮演守则摘要
  seq9: { materials: string[] };                 // 服食序列9魔药所需
  seq8: { materials: string[]; ritual: string }; // 晋升序列8所需
}

/** 出身背景 */
export interface Origin {
  id: string;
  name: string;
  desc: string;
  pence: number;                    // 开局资金（家境）
  statMods: Partial<PlayerStats>;   // 初始属性修正
  favors?: Record<string, number>;  // 初始人脉
  intel?: string[];                 // 初始情报
  knowledge?: string[];             // 初始知识
  items?: Record<string, number>;   // 初始物品
  tags?: string[];                  // 初始标签
  workPayMult?: number;             // 打工收入倍率
  mealCost?: number;                // 每日饭钱（家境开销）
  exposureMult?: number;            // 暴露增速倍率
}

/** 天赋 */
export interface Talent {
  id: string;
  name: string;
  desc: string;      // 面板展示用
  effect: string;    // 效果说明
}

/** 程序生成的 NPC */
export interface GenNPC extends NPCDef {
  generated: true;
  traits: string[];
  motive: string;
  secret: string;
}

/** 委托 */
export interface Commission {
  id: string;
  kind: 'investigate' | 'collect' | 'hunt' | 'escort';
  stat: StatKey;
  difficulty: number;   // 0-100
  title: string;
  text: string;
  client: string;       // NPC id
  locationId: string;   // 委托地点（需前往该地冒险推进）
  reward: number;       // 便士
  daysLeft: number;
  occult: boolean;      // 暗藏非凡要素
}

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  price: number; // 便士
}

export interface ScheduleEntry {
  from: number; // 起始小时
  to: number;   // 结束小时（可跨夜，如 22→1）
  location: string;
  interactable: boolean;
  days?: number[]; // 星期几出现（0=周日…6=周六）；缺省=每天
}

export type NPCCategory = 'core' | 'gen' | 'special' | 'nemesis';

export interface NPCDef {
  id: string;
  name: string;
  identity: string;   // 表身份
  secret?: string;    // 里身份
  desc: string;
  schedule: ScheduleEntry[];
  category?: NPCCategory; // 缺省视为 core
}

/** 宿敌 */
export interface Nemesis {
  name: string;
  archetype: string;   // 类型：复仇者/清场人/黑帮杀手
  motive: string;      // 结仇原因
  power: number;       // 威胁度（检定难度）
  hostility: number;   // 敌意 0-100（决定动手频率与强度）
  known: boolean;      // 是否已查明底细
  alive: boolean;
}

export type SkillKey = 'investigate' | 'combat' | 'speech' | 'occult' | 'sneak';

export interface Effect {
  k: 'money' | 'energy' | 'san' | 'cor' | 'digestion' | 'stat' | 'item'
   | 'favor' | 'intel' | 'knowledge' | 'tag' | 'timer' | 'flag' | 'gameover'
   | 'exposure' | 'formula' | 'commission';
  v?: number;
  id?: string;
  stat?: StatKey;
  on?: boolean;
  timerLabel?: string;
  timerHours?: number;
  timerEffect?: Effect[];
}

export interface EventChoice {
  text: string;
  cond?: string;          // 条件表达式（简单键检查）
  effects: Effect[];
  result: string;         // 结果文本
}

/** 冒险地点 */
export interface LocationDef {
  id: string;
  name: string;
  region: string;  // 分区：城区 / 城郊 / 远方
  desc: string;
  hours: number;   // 往返耗时
  danger: number;  // 0-100，影响遭遇风险与报酬
  nightOnly?: boolean; // 仅 22:00-2:00 可前往
}

export interface GameEvent {
  id: string;
  slot: string;           // work / adventure / rest / study / social / act / street / daily / timer
  weight: number;
  cond?: string;          // 触发条件
  locations?: string[];   // 限定冒险地点（仅 adventure 类事件）
  npc?: string;           // 绑定 NPC
  once?: boolean;
  title: string;
  text: string;
  choices: EventChoice[];
}

export interface Timer {
  id: string;
  label: string;
  hoursLeft: number;
  effect: Effect[];       // 到期触发
  renewHours?: number;    // 周期型：到期后重置
}

export interface LogEntry {
  day: number;
  hour: number;
  text: string;
  kind: 'info' | 'good' | 'bad' | 'event' | 'system';
}

export interface GameState {
  started: boolean;
  playerName: string;
  originId: string;      // 出身
  talents: string[];     // 天赋
  pathwayId: string | null; // null = 普通人
  sequence: number | null;  // null = 普通人
  day: number;
  hour: number;
  stats: PlayerStats;
  pence: number;
  digestion: number; // 0-100
  exposure: number;  // 暴露度 0-100（非凡者才有意义）
  formulas: string[]; // 已获得的魔药配方，如 'seer9' / 'seer8'
  items: Record<string, number>;
  intel: string[];
  knowledge: string[];
  studyProgress: number;
  skills: Record<SkillKey, number>;  // 技能等级 0-10，检定时 +等级×4
  nemesis: Nemesis | null;           // 宿敌
  relations: Record<string, number>;
  tags: string[];
  flags: Record<string, number | string | boolean>;
  timers: Timer[];
  genNpcs: GenNPC[];              // 程序生成的 NPC 池
  board: Commission[];            // 委托板（每日刷新）
  activeCommission: Commission | null; // 已接取的委托
  log: LogEntry[];
  pendingEvent: string | null; // 待决策事件 id
  pendingNpc: string | null;   // 社交事件来源 NPC
  firedOnce: string[];         // 已触发的一次性事件
  gameOver: { title: string; text: string } | null;
}
