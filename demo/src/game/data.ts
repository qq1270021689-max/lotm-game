import type { Pathway, ItemDef, NPCDef, GameEvent, Origin, Talent, LocationDef, StatKey } from './types';

// ============ 出身 ============
export const ORIGINS: Origin[] = [
  {
    id: 'clerk', name: '东区小职员',
    desc: '电报局誊写员，父母早亡，独自租住在阁楼。不多不少的钱，不远不近的关系——一个随时可能被城市吞没的普通人。',
    pence: 240, statMods: {}, mealCost: 6,
  },
  {
    id: 'docker', name: '码头工人之子',
    desc: '在货箱与缆绳之间长大，父亲死于一场「事故」。你有一身力气，和一群从小混到大的码头朋友。',
    pence: 180, statMods: { phy: 6 },
    favors: { victor: 10 }, intel: ['dock_missing'],
    workPayMult: 1.25, mealCost: 6,
  },
  {
    id: 'orphan', name: '教会孤儿院出身',
    desc: '在圣塞缪尔教堂的孤儿院长大，唱诗、认字、守规矩。值夜者认得你的脸——这层熟悉，是护身符也是枷锁。',
    pence: 200, statMods: { san: 10 },
    favors: { evelyn: 15 }, knowledge: ['ritual_basic'],
    exposureMult: 0.8, mealCost: 6,
  },
  {
    id: 'merchant', name: '商人之子',
    desc: '家里经营着一间不起眼的杂货铺。你从小看惯了讨价还价，口袋里比同龄人多几个便士，嘴皮子也比他们利索。',
    pence: 480, statMods: { cha: 3 },
    items: { whiskey: 2 },
    workPayMult: 1.1, mealCost: 6,
  },
  {
    id: 'fallen_noble', name: '破落贵族',
    desc: '祖上曾有爵位，如今只剩姓氏和改不掉的体面。你受过良好教育、举止得体，但维持「体面」本身，就是一笔债。',
    pence: 600, statMods: { cha: 6, mnd: 3 },
    tags: ['体面负担'], mealCost: 12,
  },
];

// ============ 天赋（开局 8 选 2） ============
export const TALENTS: Talent[] = [
  { id: 'spirit_affinity', name: '灵性亲和', desc: '你从小就能「感觉」到别人感觉不到的东西。', effect: '初始灵性+5；学习收益+1' },
  { id: 'iron_nerves', name: '钢铁神经', desc: '天塌下来，你先算完手里这笔账。', effect: '理智损失减免25%' },
  { id: 'quick_wit', name: '过目不忘', desc: '读过的每一页书都躺在你脑子里。', effect: '学习进度额外+1' },
  { id: 'silver_tongue', name: '巧舌如簧', desc: '你说话，别人总是愿意多听两句。', effect: '好感获取+50%' },
  { id: 'night_owl', name: '夜行动物', desc: '夜晚的你比白天清醒得多。', effect: '18:00–6:00 行动精力消耗−30%' },
  { id: 'money_grubber', name: '精打细算', desc: '每一个便士在你手里都会下崽。', effect: '打工收入+20%' },
  { id: 'sixth_sense', name: '第六感', desc: '危险来临前，你的后颈总会先知道。', effect: '冒险前获得风险预警；初始灵性+3' },
  { id: 'strong_body', name: '膀大腰圆', desc: '这身板，码头工头看了都想招你。', effect: '初始体质+6；冒险精力消耗−5' },
];

// ============ 五条途径 ============

// ============ 五条途径 ============
export const PATHWAYS: Pathway[] = [
  {
    id: 'seer', name: '占卜家途径', title: '窥见命运之人',
    desc: '信息差流。用占卜预判风险、规避危险、在委托与黑市中先人一步；正面战力弱。',
    tendency: '灵性↑↑ 心智↑ 魅力↑ 体质—',
    seqNames: ['占卜家', '小丑', '魔术师', '无面人', '秘偶大师', '诡法师', '古代学者', '奇迹师', '诡秘侍者', '愚者'],
    seq9Ability: '灵摆与塔罗占卜：冒险前可预览风险等级；微弱的危险直觉。',
    actingHint: '常做占卜，但敬畏命运；不把结果说透。',
    seq9: { materials: ['octopus_blood', 'star_crystal'] },
    seq8: { materials: ['goat_horn', 'face_rose'], ritual: '在众人的嘲笑或漠视中服食魔药。' },
  },
  {
    id: 'spectator', name: '观众途径', title: '洞察人心之人',
    desc: '社交流天花板。洞察情绪、读取人心，靠人脉与情报立足；几乎没有战斗力。',
    tendency: '魅力↑↑ 心智↑↑ 灵性↑ 体质—',
    seqNames: ['观众', '读心者', '心理医生', '催眠师', '梦境行者', '操纵师', '织梦人', '洞察者', '作家', '空想家'],
    seq9Ability: '洞察情绪：社交时能看到对方的情绪倾向与谎言苗头。',
    actingHint: '做听众而非主角；先观察后开口；绝不暴露非凡身份。',
    seq9: { materials: ['manhal_eye', 'hornfish_blood'] },
    seq8: { materials: ['toad_brain', 'lizard_scale'], ritual: '独处镜前，直视自己的倒影服食。' },
  },
  {
    id: 'hunter', name: '猎人途径', title: '战争与火焰之人',
    desc: '战斗/阴谋流。追踪、挑衅、纵火；冒险收益最高，树敌也最快。',
    tendency: '体质↑↑ 魅力↑ 心智↑ 灵性—',
    seqNames: ['猎人', '挑衅者', '纵火家', '阴谋家', '收割者', '铁血骑士', '战争主教', '天气术士', '征服者', '红祭司'],
    seq9Ability: '追踪与陷阱：冒险行动精力消耗降低，收获提升。',
    actingHint: '每日保持狩猎练习；猎物必有所获；不杀无价值的目标。',
    seq9: { materials: ['deer_heart', 'iron_fern'] },
    seq8: { materials: ['ape_brain', 'scorpion_sting'], ritual: '在一场冲突的怒火中服食魔药。' },
  },
  {
    id: 'sleepless', name: '不眠者途径', title: '黑夜眷者',
    desc: '时间流。免除睡眠，每天多出 6-8 小时；夜晚全能力加成；代价是污染增速更快。',
    tendency: '灵性↑ 心智↑ 体质↑（夜间翻倍）',
    seqNames: ['不眠者', '午夜诗人', '梦魇', '安魂师', '灵巫', '守夜人', '恐惧主教', '隐秘之仆', '厄难骑士', '黑暗'],
    seq9Ability: '免除睡眠需求；夜视；深夜时段全判定加成。',
    actingHint: '昼伏夜出；守护他人的安眠；不在黑夜中恐惧。',
    seq9: { materials: ['bat_eye', 'deep_sleep_flower'] },
    seq8: { materials: ['nightingale_throat', 'jellyfish_crystal'], ritual: '于亲手写下的安眠诗吟诵声中服食。' },
  },
  {
    id: 'apprentice', name: '学徒途径', title: '穿行万门之人',
    desc: '探索流。穿墙、戏法、占星——冒险与探索的唯一真神；战斗与社交平庸。',
    tendency: '灵性↑↑ 心智↑ 体质— 魅力—',
    seqNames: ['学徒', '戏法大师', '占星人', '记录官', '旅行家', '秘法师', '漫游者', '旅法师', '星之匙', '门'],
    seq9Ability: '仪式魔法快速学习；每日一次短暂穿墙（绕过部分障碍）。',
    actingHint: '每日学习新知识；好奇心必须有行动；对未知保持记录。',
    seq9: { materials: ['gecko_skin', 'mold_spore'] },
    seq8: { materials: ['parrot_tongue', 'mirror_mercury'], ritual: '完成一场无人识破的公开戏法后服食。' },
  },
];

// ============ 物品 ============
export const ITEMS: ItemDef[] = [
  // 序列9 魔药材料
  { id: 'octopus_blood', name: '拉瓦章鱼血液', desc: '深蓝色的小瓶，晃一晃会泛起微光。', price: 48 },
  { id: 'star_crystal', name: '星水晶', desc: '对着光看，内部有星点缓缓移动。', price: 55 },
  { id: 'manhal_eye', name: '曼哈尔鱼眼珠', desc: '一对浑圆的鱼眼，据说死后的曼哈尔鱼仍在观察世界。', price: 40 },
  { id: 'hornfish_blood', name: '羊角黑鱼血液', desc: '粘稠如墨，倒入水中会聚成羊角形状。', price: 42 },
  { id: 'deer_heart', name: '红角麋鹿心脏', desc: '离体已久，摸起来仍是温热的。', price: 45 },
  { id: 'iron_fern', name: '铁线蕨粉末', desc: '磨得极细的灰绿粉末，有铁锈味。', price: 30 },
  { id: 'bat_eye', name: '夜光蝙蝠眼珠', desc: '在黑暗中会发出微弱的绿光。', price: 44 },
  { id: 'deep_sleep_flower', name: '深眠花粉末', desc: '闻一下就会犯困的紫色粉末。', price: 36 },
  { id: 'gecko_skin', name: '幻影壁虎尾皮', desc: '半透明的尾皮，边缘偶尔消失在空气里。', price: 46 },
  { id: 'mold_spore', name: '门后霉菌孢子', desc: '只生长在老宅门后的诡异霉菌。', price: 38 },
  // 序列8 魔药材料
  { id: 'goat_horn', name: '灰山羊独角结晶', desc: '霍纳奇斯山脉灰山羊的独角结晶，散发着让人想发笑的气味。', price: 96 },
  { id: 'face_rose', name: '人脸玫瑰', desc: '花瓣的纹路酷似一张扭曲的人脸。', price: 84 },
  { id: 'toad_brain', name: '三目蟾蜍脑垂体', desc: '浸泡在防腐液中的灰白色小块。', price: 90 },
  { id: 'lizard_scale', name: '心灵蜥蜴鳞粉', desc: '在光线下会随观察者情绪变色。', price: 88 },
  { id: 'ape_brain', name: '暴怒猿猴脑髓液', desc: '瓶中的液体至今仍在愤怒地翻涌。', price: 92 },
  { id: 'scorpion_sting', name: '仇恨之蝎尾针', desc: '被它蛰到的人会死于自己的怒火。', price: 86 },
  { id: 'nightingale_throat', name: '安魂夜莺歌喉', desc: '即使离体，午夜仍会发出无声的鸣唱。', price: 94 },
  { id: 'jellyfish_crystal', name: '沉眠水母伞盖结晶', desc: '握着它的人会做最深的梦。', price: 82 },
  { id: 'parrot_tongue', name: '双簧鹦鹉舌骨', desc: '能同时说出两句互相矛盾的真话。', price: 88 },
  { id: 'mirror_mercury', name: '镜面水银', desc: '水银表面映出的不是你的脸。', price: 90 },
  // 普通物品
  { id: 'cryptic_note', name: '看不懂的手抄纸', desc: '从死者身上找到的密文残页，字迹仿佛在缓慢蠕动。有神秘学基础的人或许能解读。（学习时可尝试破译）', price: 0 },
  { id: 'whiskey', name: '黑麦威士忌', desc: '南区蒸馏所出品，劣等但够劲。送礼佳品。', price: 12 },
  { id: 'occult_notes', name: '神秘学札记', desc: '老尼尔逊的手抄本，记录着仪式魔法的入门知识。', price: 60 },
  { id: 'revolver', name: '左轮手枪', desc: '六发。对非凡者意义有限，对劫匪意义重大。', price: 150 },
];

// ============ 魔药配方 ============
export const FORMULA_PRICE_NELSON = 180; // 老尼尔逊的价：15苏勒
export const FORMULA_PRICE_BLACK = 264;  // 黑市价：1镑2苏勒，更贵但不需要人情
export function formulaName(fid: string): string {
  const pw = PATHWAYS.find(p => fid.startsWith(p.id));
  if (!pw) return fid;
  const seq = fid.endsWith('8') ? 8 : 9;
  return `${pw.name}·序列${seq}「${pw.seqNames[9 - seq]}」配方`;
}

// ============ NPC ============
export const NPCS: NPCDef[] = [
  {
    id: 'victor', name: '「灰鼠」维克多', identity: '东区码头记账员', secret: '黑市非凡材料掮客',
    desc: '语速很快，先谈价再谈事。据说没有他搞不到的东西，只有他不敢碰的东西。',
    schedule: [
      { from: 9, to: 17, location: '码头账房', interactable: true, days: [1, 2, 3, 4, 5, 6] },
      { from: 18, to: 19, location: '「醉水手」酒馆', interactable: true },
      { from: 22, to: 26, location: '黑市后巷', interactable: true, days: [3, 6] }, // 周三、周六半夜开黑市
    ],
  },
  {
    id: 'martha', name: '玛尔塔婶婶', identity: '你的房东', secret: undefined,
    desc: '寡居的房东太太，嘴硬心软。房租一天不能晚，但汤也总是多给你盛一勺。',
    schedule: [
      { from: 7, to: 11, location: '公寓门厅', interactable: true },
      { from: 17, to: 21, location: '公寓门厅', interactable: true },
    ],
  },
  {
    id: 'nelson', name: '老尼尔逊', identity: '旧书店老板', secret: '退休的野生非凡者（序列8）',
    desc: '驼背、独眼、满嘴谜语。书店后间卖的不是书，是「知识」。',
    schedule: [{ from: 10, to: 20, location: '「斑纹」旧书店', interactable: true, days: [1, 2, 3, 4, 5, 6] }], // 周日闭店
  },
  {
    id: 'evelyn', name: '「夜莺」伊芙琳', identity: '圣塞缪尔教堂执事', secret: '值夜者小队队长（序列7）',
    desc: '黑夜教会的超凡执法者。对野生非凡者而言，她是保护伞，也是铡刀。',
    schedule: [{ from: 9, to: 18, location: '圣塞缪尔教堂', interactable: true }],
  },
  {
    id: 'ella', name: '艾拉医生', identity: '北区诊所心理医生', secret: '观众途径序列8',
    desc: '温和的灰眼女士。她的诊金不便宜，但疯过的人都说值。',
    schedule: [{ from: 9, to: 17, location: '北区诊所', interactable: true, days: [1, 2, 3, 4, 5, 6] }], // 周日休诊
  },
  {
    id: 'brandon', name: '「血手套」布兰登', identity: '码头帮打手', secret: '罪犯途径序列9',
    desc: '放贷、收债、打断腿，一条龙。欠他的钱，利息比他的耐心长得快。',
    schedule: [{ from: 19, to: 26, location: '「醉水手」酒馆', interactable: true }],
  },
  {
    id: 'mike', name: '「胖子」麦克', identity: '「醉水手」酒馆老板', secret: '几方势力的情报中转站',
    desc: '脸上的横肉笑起来像和风细雨。谁的闲事他都知道一点，谁的闲事他都假装不知道。',
    schedule: [{ from: 16, to: 26, location: '「醉水手」酒馆', interactable: true }],
  },
];

// ============ 情报/知识词条 ============
export const INTEL_NAMES: Record<string, string> = {
  dock_missing: '码头失踪案传闻',
  patrol_route: '值夜者巡逻路线',
  black_market: '黑市的开门暗号',
  victor_debt: '维克多欠血手套40镑',
  church_audit: '教会季度审查临近',
};
export const KNOWLEDGE_NAMES: Record<string, string> = {
  ritual_basic: '仪式魔法基础',
  spirit_vision: '灵视入门',
  potion_brew: '魔药调配要诀',
};

// ============ 技能 ============
export const SKILL_NAMES: Record<string, string> = {
  investigate: '侦查',
  combat: '格斗',
  speech: '话术',
  occult: '神秘学',
  sneak: '潜行',
};

// ============ 冒险地点（按小说世界观分区） ============
export const LOCATION_REGIONS = ['城区', '城郊', '远方'];
export const LOCATIONS: LocationDef[] = [
  // —— 城区：雾城之内，当日往返 ——
  { id: 'market', name: '铁十字街市集', region: '城区', desc: '全城最热闹的露天市集。三教九流在此碰头，消息比货物转手更快。', hours: 1, danger: 8 },
  { id: 'docks', name: '东区码头', region: '城区', desc: '货箱、缆绳与雾气。失踪案的传闻都从这里开始。', hours: 2, danger: 20 },
  { id: 'canal', name: '运河仓库', region: '城区', desc: '成排的货仓，锁着的门比开着的多。走私者的中转站。', hours: 2, danger: 25 },
  { id: 'black_market', name: '黑市后巷', region: '城区', desc: '只在深夜张开的灰色集市。规矩：不问来路，不问去处。', hours: 2, danger: 30, nightOnly: true },
  // —— 城郊：出城半日，雾野与废墟 ——
  { id: 'graveyard', name: '拉斐尔墓园', region: '城郊', desc: '新坟旧冢层层叠叠。夜里的抓挠声，守墓人已经习惯了。', hours: 3, danger: 40 },
  { id: 'sewer', name: '下水道', region: '城郊', desc: '城市的肠腹。黑暗、污水，和比狗大的东西。', hours: 3, danger: 45 },
  { id: 'factory', name: '废弃印刷厂', region: '城郊', desc: '停产三年的厂房。据说午夜还能听见机器运转的声音。', hours: 3, danger: 55 },
  { id: 'old_tower', name: '旧钟楼', region: '城郊', desc: '停了摆的钟楼，全城最高的地方。靠近它的人会做同一个梦。', hours: 4, danger: 70 },
  { id: 'manor', name: '雾林废弃庄园', region: '城郊', desc: '三十年前主人一家暴毙后无人敢住的宅邸。有夜行人说，听过里面传出钢琴声。', hours: 4, danger: 60 },
  // —— 远方：要花上一整天的路程，去之前掂量一下自己 ——
  { id: 'ramd', name: '拉姆德废镇', region: '远方', desc: '一夜之间全镇消失的小镇，官方口径是「瘟疫」。去过的人回来都病了——病在梦里。', hours: 6, danger: 80 },
  { id: 'honakisu', name: '霍纳奇斯山麓', region: '远方', desc: '主峰终年埋在云里，传说山顶有「夜之国度」的遗迹。采药人只在山麓活动，更深处的路标会自己挪动。', hours: 8, danger: 90 },
];

// ============ 特殊角色（高序列存在：天使与神） ============
// 不作息、不闲逛，只在特定条件下「注视」或「显现」
export const SPECIAL_BEINGS = [
  { id: 'sage', name: '「隐匿贤者」', desc: '隐秘集会的传说主持者，出售任何知识——只要你付得起「代价」之外的价钱。' },
  { id: 'gray_fog', name: '灰雾之上的存在', desc: '向灰雾祈祷的人偶尔会梦见一座宫殿。回应罕见，但从不出错。' },
  { id: 'angel_time', name: '时天使的幻影', desc: '戴着单片眼镜的幻影。它出现时，你的怀表会少几格。', danger: true },
  { id: 'true_creator', name: '呓语之主', desc: '污染越重，它的声音越清晰。那不是启示，是食欲。', danger: true },
];

// ============ 事件池 ============
export const EVENTS: GameEvent[] = [
  // ---- 普通人机缘 ----
  {
    id: 'fog_dream', slot: 'daily', weight: 4, cond: 'mortal', once: true, title: '灰雾之梦',
    text: '昨夜你做了一个奇怪的梦：无边无际的灰雾之上，矗立着一座古老宫殿，雾深处似乎有什么存在垂眸看了你一眼。醒来时，你的掌心全是汗，而窗台上落着一层不属于这个季节的灰。',
    choices: [
      { text: '把梦记下来', effects: [{ k: 'stat', stat: 'spi', v: 3 }, { k: 'flag', id: 'dreamed_fog', v: 1 }], result: '你记下了梦的每个细节。说来奇怪，落笔时你感到某种微弱的「感应」在血脉里苏醒——灵性，它叫灵性。' },
      { text: '只是个噩梦，忘了它', effects: [{ k: 'stat', stat: 'spi', v: 1 }], result: '你翻了个身继续睡。但那片灰雾，从此偶尔会在你闭眼的瞬间浮现。' },
    ],
  },
  {
    id: 'street_stranger', slot: 'street', weight: 3, cond: 'mortal', once: true, title: '擦肩而过的怪人',
    text: '一个裹在黑斗篷里的身影与你擦肩而过，你分明闻到一股铁锈与焚香的混合气味。那人忽然停下，回头看了你一眼——那一眼里有某种让你脊椎发凉的「重量」。',
    choices: [
      { text: '跟上去看看', effects: [{ k: 'stat', stat: 'spi', v: 2 }, { k: 'san', v: -3 }, { k: 'flag', id: 'met_beyonder', v: 1 }], result: '你跟了三条街，那人却在转角的浓雾里凭空消失了。地上只留一枚烧过的黑蜡烛头。这个世界，似乎没有你以为的那么简单。' },
      { text: '快步离开', effects: [{ k: 'san', v: -1 }], result: '你走得很快。可那一眼的重量，一路跟到了你家门口。' },
    ],
  },
  {
    id: 'study_forbidden', slot: 'study', weight: 3, cond: 'mortal&flag:met_beyonder', once: true, title: '不该存在的知识',
    text: '你在旧书堆里翻到一页手抄残卷：「……服食者须知：魔药即毒药。配方、材料、仪式，缺一不可；消化、扮演、克制，步步惊心……」残卷的其余部分被人为撕去了。',
    choices: [
      { text: '按残卷指引继续挖掘', effects: [{ k: 'knowledge', id: 'ritual_basic' }, { k: 'cor', v: 3 }, { k: 'stat', stat: 'spi', v: 2 }], result: '你拼凑出了「非凡者」「序列」「魔药」这些词的轮廓。知识是有重量的——这页纸压得你一整夜没睡稳。' },
      { text: '烧掉它', effects: [{ k: 'san', v: 2 }], result: '火苗吞掉残卷时，你莫名觉得躲过了什么。也错过了什么。' },
    ],
  },
  // ---- 打工 ----
  {
    id: 'work_overtime', slot: 'work', weight: 3, title: '加班的电报',
    text: '下班前，局长抱来一摞加急电报：「今晚发完，双倍工钱。」窗外天色已暗。',
    choices: [
      { text: '留下来加班（多耗2小时）', effects: [{ k: 'money', v: 24 }, { k: 'energy', v: -20 }], result: '你敲完最后一封电文已是深夜。多赚的2苏勒沉甸甸的。' },
      { text: '婉拒，准时下班', effects: [], result: '局长撇了撇嘴，没说什么。你的夜晚属于自己。' },
    ],
  },
  {
    id: 'work_rumor', slot: 'work', weight: 3, title: '同事的耳语',
    text: '午休时，同事压低声音：「码头又失踪了两个人……听说，连尸体都找不到，就像被雾吃掉了。」',
    choices: [
      { text: '仔细打听细节', effects: [{ k: 'intel', id: 'dock_missing' }], result: '你记下了失踪地点与时间。这条情报或许值钱——或者值钱的是它背后的麻烦。' },
      { text: '不掺和，埋头干活', effects: [{ k: 'stat', stat: 'mnd', v: 1 }], result: '你埋头干活。在这座城里，不知道有时是一种福气。' },
    ],
  },
  {
    id: 'work_accident', slot: 'work', weight: 2, cond: 'energy<40', title: '疲惫出错',
    text: '疲惫让你手指发抖，一封重要电文被你译错了一个数字。局长的脸沉了下来。',
    choices: [
      { text: '道歉并主动修正', effects: [{ k: 'money', v: -12 }, { k: 'stat', stat: 'cha', v: 1 }], result: '你被扣了半天工钱，但局长记住了你的担当。' },
      { text: '悄悄把错误混过去', effects: [{ k: 'san', v: -3 }, { k: 'flag', id: 'work_blunder', v: 1 }], result: '没人发现。至少今天没有。你总觉得那封电报还会回来找你。' },
    ],
  },
  // ---- 冒险 ----
  {
    id: 'adv_dock', slot: 'adventure', weight: 4, cond: 'intel:dock_missing', locations: ['docks', 'canal'], title: '雾中的码头',
    text: '凭着手里的失踪案情报，你在浓雾笼罩的码头区蹲守。午夜前后，雾深处传来拖拽重物的声音，还有……湿漉漉的、不像人的喘息。',
    choices: [
      { text: '循声摸过去查看', effects: [{ k: 'san', v: -8 }, { k: 'money', v: 60 }, { k: 'cor', v: 5 }, { k: 'stat', stat: 'spi', v: 2 }], result: '你在货箱后发现了失踪者的遗物——和一枚不属于人类的鳞片。雇主为这条线索付了5苏勒。那阵喘息声，你这辈子都忘不掉。' },
      { text: '保持距离，只记录动静', effects: [{ k: 'money', v: 24 }, { k: 'san', v: -2 }], result: '你安全地带回了外围记录。报酬只有2苏勒，但命是自己的。' },
      { text: '撤退', effects: [], result: '雾里的东西没有追来。至少你回头看的时候，没有。' },
    ],
  },
  {
    id: 'adv_rat', slot: 'adventure', weight: 3, locations: ['sewer'], title: '下水道悬赏',
    text: '市政厅悬赏清理下水道里的「大老鼠」。油灯照亮管道的刹那，你看见几十双红色的眼睛同时亮起——那些「老鼠」大得像狗。',
    choices: [
      { text: '动手清剿（体质判定）', effects: [{ k: 'money', v: 48 }, { k: 'energy', v: -15 }, { k: 'stat', stat: 'phy', v: 2 }], result: '一番恶战后你拎着鼠尾领了赏。有几道咬伤，但赏金足够买药。' },
      { text: '用陷阱智取', effects: [{ k: 'money', v: 48 }, { k: 'stat', stat: 'mnd', v: 2 }, { k: 'energy', v: -8 }], result: '诱饵加落石，事半功倍。你开始理解猎人为什么总说「猎物的脑子比牙齿值钱」。' },
      { text: '数量太多，撤', effects: [], result: '几十双红眼睛同时逼近半步——你果断退出了管道。赏金再好，也得有命花。' },
    ],
  },
  {
    id: 'adv_grave', slot: 'adventure', weight: 3, locations: ['graveyard'], title: '墓园异响',
    text: '守墓人出价请人调查夜间墓园的抓挠声。你举灯走近新下葬的墓穴——抓挠声来自棺材里面。还很急促。',
    choices: [
      { text: '立刻开棺', effects: [{ k: 'money', v: 36 }, { k: 'san', v: -5 }, { k: 'stat', stat: 'cha', v: 2 }], result: '棺中是假死下葬的年轻人，再晚半小时就真死了。家属的谢礼丰厚，守墓人看你的眼神像看圣人。' },
      { text: '先去找守墓人确认亡者情况', effects: [{ k: 'money', v: 24 }, { k: 'stat', stat: 'mnd', v: 1 }], result: '你们合力开棺救人。报酬分了一半出去，但你多了个守墓人朋友。' },
      { text: '不敢碰，离开墓园', effects: [{ k: 'san', v: -6 }], result: '你走得很快。第二天听说那口棺材安静了。你希望那是因为救援及时。' },
    ],
  },
  {
    id: 'adv_corpse', slot: 'adventure', weight: 3, cond: 'flag:met_beyonder', locations: ['factory', 'canal', 'old_tower'], once: true, title: '死去的非凡者',
    text: '在一条后巷的垃圾堆后，你发现了一具尸体——不是饿殍。死者衣着体面，手指却扭曲成非人的角度，心口处有一团正在缓慢凝结的、微微发光的……什么东西。他的口袋里有一页折叠的纸。',
    choices: [
      { text: '（有神秘学基础）你认出那页纸是魔药配方', cond: 'knowledge:ritual_basic|beyonder', effects: [{ k: 'formula', id: 'random9' }, { k: 'flag', id: 'loot_char', v: 1 }, { k: 'cor', v: 8 }, { k: 'san', v: -6 }], result: '你屏住呼吸辨认纸上的密文——是一份手抄的魔药配方！那团微光的东西握在手里时，你听见一声极轻的、满足的叹息——一份析出的非凡特性。从今夜起，你再也回不到「普通人」的世界了。' },
      { text: '收起那页纸和那团微光（看不懂上面的字）', effects: [{ k: 'item', id: 'cryptic_note', v: 1 }, { k: 'flag', id: 'loot_char', v: 1 }, { k: 'cor', v: 8 }, { k: 'san', v: -6 }], result: '纸上的字迹仿佛在缓慢蠕动，你一个词都读不懂——只能先收起来。那团微光的东西握在手里时，你听见一声极轻的叹息。（需要神秘学基础才能解读这张纸；也许「学习」能帮你）' },
      { text: '报警（交给值夜者）', effects: [{ k: 'favor', id: 'evelyn', v: 8 }, { k: 'money', v: 24 }], result: '教堂的人来得比你想象中快得多，接管现场的手法专业得可怕。一位黑风衣女士深深看了你一眼：「你做得很对。以及——今晚你什么都没看见。」他们给了你一笔「拾金不昧」的谢礼。' },
      { text: '装作没看见，离开', effects: [], result: '你绕开了那条巷子。但那团微光，在你梦里亮了好几天。' },
    ],
  },
  {
    id: 'adv_cult', slot: 'adventure', weight: 2, cond: 'beyonder&cor>30', locations: ['old_tower', 'factory', 'sewer'], title: '雾中的耳语',
    text: '冒险途中，你体内的非凡特性忽然躁动起来——雾里有某种同源的东西在「呼唤」你。跟着它走，也许有大收获。也许没有也许。',
    choices: [
      { text: '循着呼唤深入', effects: [{ k: 'cor', v: 10 }, { k: 'san', v: -10 }, { k: 'money', v: 120 }, { k: 'stat', stat: 'spi', v: 3 }], result: '你在雾的尽头找到一具非凡者的尸体——和析出到一半、微微发光的特性。黑市价至少10苏勒。你赢了。大概是赢了。' },
      { text: '咬牙抵抗呼唤', effects: [{ k: 'san', v: -4 }, { k: 'stat', stat: 'mnd', v: 3 }], result: '你掐着自己的手腕，一步步退出浓雾。身后传来类似失望的叹息。' },
    ],
  },
  {
    id: 'adv_market_ears', slot: 'adventure', weight: 4, locations: ['market'], title: '市集的耳目',
    text: '铁十字街人声鼎沸。一个摆摊的掮客朝你招手：「朋友，看你眼生。这儿的规矩——消息换便士，便士换消息。要来点哪样？」',
    choices: [
      { text: '花6便士买条消息', cond: 'money>=6', effects: [{ k: 'money', v: -6 }, { k: 'intel', id: 'black_market' }], result: '掮客收下便士，压低声音说了几个地名和暗号。在这座城里，知道去哪打听，比知道答案值钱。' },
      { text: '帮摊主搭把手换人情', effects: [{ k: 'energy', v: -8 }, { k: 'money', v: 10 }, { k: 'stat', stat: 'cha', v: 1 }], result: '你帮着吆喝了一下午收摊。摊主多给了你几便士，还记住你的名字——市集上多一个熟人，不算亏。' },
      { text: '只是随便逛逛', effects: [], result: '你在人群里转了一圈，闻了闻烤栗子的香味就走了。市集永远在这儿，不急。' },
    ],
  },
  {
    id: 'adv_manor', slot: 'adventure', weight: 3, locations: ['manor'], title: '深夜钢琴声',
    text: '废弃庄园的楼梯在你脚下呻吟。搜到二楼时，你听见了——琴房方向传来断断续续的钢琴声。可这宅子已经空了整整三十年。',
    choices: [
      { text: '循声推开琴房的门', effects: [{ k: 'san', v: -8 }, { k: 'cor', v: 5 }, { k: 'stat', stat: 'spi', v: 3 }, { k: 'money', v: 60 }], result: '琴凳上空无一人，琴键却在自己下沉。你强迫自己搜完琴房——在暗格里摸到一串珍珠项链和一本烧掉一半的琴谱。离开时琴声停了，像是目送你。' },
      { text: '只搜一楼书房就撤', effects: [{ k: 'money', v: 30 }, { k: 'san', v: -3 }], result: '你压着楼上的琴声翻完书房，带走几件银器。有些门，今天还不用推开。' },
      { text: '这宅子不对劲，立刻离开', effects: [{ k: 'san', v: -2 }], result: '你退到庄园外的雾里，回头望了一眼——琴房的窗户后，似乎有道白影也朝你望了一眼。' },
    ],
  },
  {
    id: 'adv_ramd', slot: 'adventure', weight: 2, locations: ['ramd'], title: '全镇跪拜的广场',
    text: '拉姆德的街道安静得能听见自己的血流。广场中央，上百具干尸保持着跪拜的姿势，朝向一座门窗都被钉死的教堂。风穿过他们空洞的嘴，像一声拉长的祷词。',
    choices: [
      { text: '走进那座被钉死的教堂', effects: [{ k: 'money', v: 150 }, { k: 'cor', v: 12 }, { k: 'san', v: -12 }, { k: 'stat', stat: 'spi', v: 3 }], result: '祭坛上没有神像——只有一片焦黑的、人形的痕迹。你在灰烬里扒出几件没被烧完的教会圣物，转手能卖个好价。跨出门槛时你不敢回头：你觉得那些干尸的头，转动了一个微小的角度。' },
      { text: '只搜外围的民居', effects: [{ k: 'money', v: 45 }, { k: 'san', v: -4 }], result: '民居里的碗筷还摆在桌上，床铺整齐，像全镇人在晚餐中途被「接走」了。你拿走几样值钱物件，没敢碰任何餐具。' },
      { text: '这地方不该来，马上走', effects: [{ k: 'san', v: -2 }], result: '你退出镇界时，背后的祷词声停了。你没有回头确认——这是你这辈子做过最正确的决定之一。' },
    ],
  },
  {
    id: 'adv_honakisu', slot: 'adventure', weight: 2, locations: ['honakisu'], once: true, title: '山麓的夜雾',
    text: '霍纳奇斯的雾比城里的冷。采药人警告过你：过了第二块界碑，路标会自己挪动。黄昏时分，你在雾中瞥见一座不属于任何年代的石拱门——以及拱门旁一具靠着背包坐化的旅人遗骸。',
    choices: [
      { text: '（灵性足够）翻开旅人的背包', cond: 'spi>=25', effects: [{ k: 'item', id: 'cryptic_note', v: 1 }, { k: 'cor', v: 8 }, { k: 'san', v: -8 }, { k: 'stat', stat: 'spi', v: 2 }], result: '背包里没有干粮，只有一摞写满密文的手稿——这位旅人死前仍在记录什么，最后一页的字迹扭曲得不像人手所书。你收好手稿下了山。（获得「看不懂的手抄纸」，可在学习中破译）' },
      { text: '去山民村落打探传说', effects: [{ k: 'money', v: -6 }, { k: 'stat', stat: 'spi', v: 1 }, { k: 'san', v: 2 }], result: '山民收了你几便士的柴火钱，围着火塘讲起「夜之国度」与「安提哥努斯」的古老名字。讲到一半，老人忽然不肯再说了，只劝你：「山上看一眼就够了，别住下。」' },
      { text: '天气不对，立刻下山', effects: [], result: '你赶在夜雾合拢前下了山。石拱门在你身后的雾里轻轻「合」上了——你没有看清，也庆幸没有看清。' },
    ],
  },
  // ---- 街道（闲逛） ----
  {
    id: 'street_pickpocket', slot: 'street', weight: 3, title: '三只手',
    text: '人流中，一只瘦小的手摸向你的口袋。',
    choices: [
      { text: '当场抓住他', effects: [{ k: 'stat', stat: 'phy', v: 1 }], result: '是个面黄肌瘦的孩子。你松开手，他消失在巷子里。' },
      { text: '随他去（损失现金）', effects: [{ k: 'money', v: -10 }], result: '你的钱袋轻了一点。这座城总要收点学费。' },
    ],
  },
  {
    id: 'street_preacher', slot: 'street', weight: 2, title: '街角的布道者',
    text: '一个黑袍教士在街角宣讲：「黑夜庇佑不眠之人，风暴涤荡不义之徒。」他独眼的目光扫过人群，在你身上停留了一瞬。',
    choices: [
      { text: '驻足聆听', effects: [{ k: 'san', v: 3 }], result: '祷词里有种让人平静的力量。你的精神好了一些。' },
      { text: '低头快步走开', effects: [], result: '非凡者最好离教会远一点——你想起这句忠告。' },
    ],
  },
  {
    id: 'street_beggar_seer', slot: 'street', weight: 2, title: '独眼占卜师',
    text: '巷口的瞎眼老妇人朝你的方向「看」过来：「年轻人，一便士，婆婆给你占一占前程。」',
    choices: [
      { text: '给她一便士', effects: [{ k: 'money', v: -1 }, { k: 'san', v: 2 }, { k: 'stat', stat: 'spi', v: 1 }], result: '她说了些模棱两可的吉言，但捏走便士时在你掌心敲了三下——某种节奏。你忽然对灵性有了一丝新的感应。' },
      { text: '摇头离开', effects: [], result: '「命运不要你的便士，」她在背后说，「那它就要别的了。」' },
    ],
  },
  // ---- 学习 ----
  {
    id: 'study_insight', slot: 'study', weight: 3, title: '灵光一现',
    text: '研读中，一段晦涩的仪式描述忽然与你最近的见闻重合——你隐约摸到了「灵视」的门框。',
    choices: [
      { text: '顺着直觉深挖', effects: [{ k: 'stat', stat: 'spi', v: 2 }, { k: 'cor', v: 3 }], result: '知识的甘甜里有一丝铁锈味。你感觉灵性强韧了些，鼻端却萦绕着若有若无的血腥气。' },
      { text: '按部就班做笔记', effects: [{ k: 'stat', stat: 'mnd', v: 2 }], result: '慢，但稳。神秘学最忌讳的就是「快」。' },
    ],
  },
  // ---- 扮演 ----
  {
    id: 'act_crowd', slot: 'act', weight: 3, cond: 'beyonder', title: '围观者',
    text: '你扮演时，一个醉醺醺的看客凑过来起哄，引来一群人围观。是麻烦，也是舞台。',
    choices: [
      { text: '把他变成表演的一部分', effects: [{ k: 'digestion', v: 6 }, { k: 'stat', stat: 'cha', v: 1 }, { k: 'exposure', v: 2 }], result: '哄笑声中你完成了今天最漂亮的一次扮演。魔药在体内松动了一丝。只是……人群里似乎有道过于专注的目光。' },
      { text: '收摊避开', effects: [{ k: 'digestion', v: 1 }], result: '你提前收摊。扮演讲究顺势而为，今天「势」不在你。' },
    ],
  },
  {
    id: 'act_overdone', slot: 'act', weight: 2, cond: 'beyonder&exposure>40', title: '入戏太深',
    text: '扮演结束时你恍惚了一瞬——刚才那个「角色」，和你自己，边界模糊了一秒。周围有个报童打扮的孩子多看了你两眼，跑开了。',
    choices: [
      { text: '（继续）', effects: [{ k: 'exposure', v: 4 }, { k: 'san', v: -2 }], result: '你压下心头的不安。这座城市里，多看你两眼的人，都可能是别人的眼睛。' },
    ],
  },
  // ---- 暴露事件链 ----
  {
    id: 'exposed_hint', slot: 'daily', weight: 10, cond: 'beyonder&exposure>=60', once: true, title: '被盯上了',
    text: '今天总有哪里不对劲：街对面读报的人翻了同一页半小时；教堂尖塔上的乌鸦跟着你飞了三条街；夜里你分明听见屋顶有极轻的脚步声。你被盯上了——问题只是被谁。',
    choices: [
      { text: '最近收敛一点', effects: [{ k: 'exposure', v: -8 }, { k: 'san', v: -4 }], result: '你减少了外出和扮演。那种被注视的感觉淡了些许，但没有消失。' },
      { text: '装作毫无察觉', effects: [{ k: 'san', v: -2 }], result: '你照常生活。注视仍在，像一根抵在后心的手指，迟迟不按下来。' },
    ],
  },
  {
    id: 'nighthawk_visit', slot: 'daily', weight: 10, cond: 'beyonder&exposure>=85', title: '值夜者上门',
    text: '门被敲响了。门外站着一位黑风衣女士——圣塞缪尔教堂的伊芙琳执事。她的目光平静得像深夜的湖：「别紧张。我是来给你三个选择的：登记、消失，或者……被消失。」你注意到她身后的小巷里，还有两个模糊的人影。',
    choices: [
      { text: '接受登记，成为「备案野生者」', effects: [{ k: 'exposure', v: -55 }, { k: 'tag', id: 'registered', on: true }, { k: 'favor', id: 'evelyn', v: 10 }], result: '你在一份写满密文的档案上按了手印。从此你是教会眼里的「可观察者」——自由少了，追杀令也撤了。伊芙琳收笔时低声说：「聪明的选择。上一个拒绝的人，现在是2-107号封印物的燃料。」' },
      { text: '连夜逃走（赌一把）', effects: [{ k: 'money', v: -60 }, { k: 'exposure', v: -30 }, { k: 'san', v: -8 }, { k: 'tag', id: 'fugitive', on: true }], result: '你从后窗翻出，在屋顶上跑出了有生以来最快的速度。值夜者没有追——至少今晚没有。你成了「在逃者」，从此睡觉都得睁半只眼。' },
      { text: '求伊芙琳通融（需好感≥40）', cond: 'favor:evelyn>=40', effects: [{ k: 'exposure', v: -50 }, { k: 'favor', id: 'evelyn', v: -20 }], result: '她沉默了很久，最终收起档案夹：「下不为例。把自己收拾干净点——下次来的人不会是我。」你欠了她一个大人情。' },
    ],
  },
  // ---- 特殊存在事件 ----
  {
    id: 'secret_gathering', slot: 'special', weight: 1, cond: 'beyonder', title: '隐秘集会',
    text: '黑市集会日。午夜的地窖里烛火摇曳，十几个兜帽身影围坐。主持者被灰雾般的薄纱笼罩——传说中「隐匿贤者」的代理人。「新人。」那声音直接响在你脑海里，「知识、材料、庇护，这里都有价。」',
    choices: [
      { text: '求购神秘学知识（−100便士，神秘学技能+1）', cond: 'money>=100', effects: [{ k: 'money', v: -100 }, { k: 'flag', id: 'sage_lesson', v: 1 }], result: '一段不属于任何语言的音节烙进你的记忆。回家后你发现自己「记起」了许多从未读过的仪式细节。（神秘学+1，灵性+2）' },
      { text: '向灰雾祈祷', effects: [{ k: 'san', v: 6 }, { k: 'stat', stat: 'spi', v: 1 }], result: '你在心里默念那个在同伴间低声流传的尊名。恍惚间你站在灰雾之上，一座宫殿的轮廓一闪而过。醒来时，内心出奇地平静。' },
      { text: '只观察，不交易', effects: [{ k: 'intel', id: 'patrol_route' }], result: '你记下在场者的口音、气味与手势。这些人的人脉网，本身就是情报。（获得情报：值夜者巡逻路线）' },
    ],
  },
  {
    id: 'true_creator_whispers', slot: 'special', weight: 1, title: '呓语',
    text: '污染让那道声音变得清晰了。它在你颅骨内侧呢喃，许诺力量、许诺真相、许诺「只要再靠近一点」。你的指甲缝里渗出血丝。',
    choices: [
      { text: '（抵抗）', effects: [{ k: 'san', v: -8 }, { k: 'cor', v: 4 }], result: '你用头撞墙直到耳鸣盖过呓语。这一夜你赢了，但它还会回来——它知道你听得见了。' },
    ],
  },
  // ---- 每日结算 ----
  {
    id: 'daily_dream_omen', slot: 'daily', weight: 2, cond: 'san<40', title: '不祥的梦',
    text: '你梦见自己站在灰雾之上，无数双眼睛在雾后注视着你。醒来时，枕边湿漉漉的。',
    choices: [
      { text: '（继续）', effects: [{ k: 'san', v: -2 }], result: '你点起灯，直到天亮。' },
    ],
  },
  // ---- 社交事件（绑定 NPC） ----
  {
    id: 'npc_victor_market', slot: 'social', npc: 'victor', weight: 5, title: '灰鼠的货架',
    text: '维克多搓着手凑过来：「朋友，最近到了批好东西……章鱼血、玫瑰、结晶，懂的都懂。当然，也收东西——你懂的。」',
    choices: [
      { text: '请他喝一杯（-12便士，+好感）', cond: 'money>=12', effects: [{ k: 'money', v: -12 }, { k: 'favor', id: 'victor', v: 8 }], result: '「上道！」他灌了口酒，压低声音，「下周……算了，到时候再说。」' },
      { text: '闲聊码头传闻', effects: [{ k: 'favor', id: 'victor', v: 3 }, { k: 'intel', id: 'black_market' }], result: '你们聊了半小时。他什么都没承诺，但你记住了黑市的开门暗号。' },
      { text: '（非凡者）出掉手里的析出特性', cond: 'beyonder&flag:loot_char', effects: [{ k: 'flag', id: 'loot_char', v: 0 }, { k: 'money', v: 120 }, { k: 'favor', id: 'victor', v: 5 }], result: '维克多戴上手套检查了那团微光：「好货。10苏勒，现结。」他数钱的手很快，收东西的手更快。' },
    ],
  },
  {
    id: 'npc_martha_soup', slot: 'social', npc: 'martha', weight: 5, title: '一勺汤的人情',
    text: '玛尔塔婶婶堵住你：「房租的日子记着呢吧？」顿了顿，又塞给你一碗热汤，「……喝你的，瘦成这样，死在我房子里我还要倒贴棺材钱。」',
    choices: [
      { text: '道谢并聊聊家常', effects: [{ k: 'favor', id: 'martha', v: 6 }, { k: 'san', v: 3 }, { k: 'energy', v: 10 }], result: '热汤下肚，婶婶唠叨着东区的物价。这种「有人在等你回家」的感觉，值很多钱。' },
      { text: '保证按时交租', effects: [{ k: 'favor', id: 'martha', v: 3 }], result: '「记住你说的话。」她转身走了，汤留下了。' },
    ],
  },
  {
    id: 'npc_martha_suspicion', slot: 'social', npc: 'martha', weight: 6, cond: 'beyonder&exposure>=50', once: true, title: '房东太太的疑心',
    text: '玛尔塔婶婶欲言又止地拦住你：「孩子……你最近半夜老出去。前天我打扫，你房间里有一股烧过的草药味，还有……」她压低声音，「你窗台上有烧剩的蜡烛油，摆成了奇怪的图案。你是不是……沾上什么不好的东西了？」',
    choices: [
      { text: '坦白一部分（她是可信的人）', effects: [{ k: 'favor', id: 'martha', v: 10 }, { k: 'exposure', v: -5 }, { k: 'san', v: 4 }], result: '她听完沉默很久，只说了一句：「别死在我房子里。」第二天你发现她悄悄在你的门口挂了一串驱邪的草环——粗陋，但真心。' },
      { text: '用谎言搪塞', effects: [{ k: 'favor', id: 'martha', v: -5 }, { k: 'exposure', v: 3 }], result: '「哦，偏方治失眠。」她盯着你看了几秒，没再问。但你能感觉到，那道门缝后的目光，从此多了一层担忧——和警惕。' },
    ],
  },
  {
    id: 'npc_nelson_book', slot: 'social', npc: 'nelson', weight: 5, title: '后间的买卖',
    text: '老尼尔逊用独眼打量你：「普通书在前面，『那种』书在后间。后间的价，一半收钱——一半收问题。答错了，给钱也不卖。」',
    choices: [
      { text: '买《神秘学札记》（-60便士）', cond: 'money>=60', effects: [{ k: 'money', v: -60 }, { k: 'item', id: 'occult_notes', v: 1 }], result: '「答得不错。」他把一本手抄本推过来，「读慢点。读快了的东西，会反着读你。」' },
      { text: '请教「那条路」的事', cond: 'flag:met_beyonder', effects: [{ k: 'favor', id: 'nelson', v: 5 }, { k: 'knowledge', id: 'potion_brew' }], result: '老人浑浊的独眼眯了起来：「看来你撞见过『他们』了。记住三件事：消化，仪式，配方。还有第四件——是你在吃魔药，别让魔药吃起来像它在吃你。」' },
      { text: '闲聊他的过去', effects: [{ k: 'favor', id: 'nelson', v: 4 }, { k: 'san', v: 2 }], result: '他讲了个退休水手与灯塔的故事。真假难辨，但你注意到书架后藏着一根海蛇骨手杖。' },
      { text: '只是随便逛逛', effects: [], result: '你在书架间转了一圈就走了。老人头也不抬地继续拨他的算盘。' },
    ],
  },
  {
    id: 'npc_evelyn_watch', slot: 'social', npc: 'evelyn', weight: 5, title: '夜莺的注视',
    text: '伊芙琳执事的目光在你眉心停留了半秒：「你最近……『睡』得好吗？」这不是寒暄。值夜者问这句话时，是在给人分类：平民，可观察者，还是可清除者。',
    choices: [
      { text: '坦然回答，表现无害', effects: [{ k: 'favor', id: 'evelyn', v: 6 }, { k: 'flag', id: 'church_noticed', v: 1 }], result: '「那就好。」她收回目光，「教会欢迎安分的市民。记住，是安分的。」你被登记了——这不完全是坏事。' },
      { text: '含糊其辞，尽快告辞', effects: [{ k: 'flag', id: 'church_suspect', v: 1 }, { k: 'exposure', v: 5 }], result: '她没有拦你。但走出教堂时，你后背发凉——被值夜者惦记，比被通缉好不了多少。' },
    ],
  },
  {
    id: 'npc_ella_clinic', slot: 'social', npc: 'ella', weight: 5, title: '灰眼睛的医生',
    text: '艾拉医生的诊所里飘着安神的熏香。「你的精神像一根绷了太久的弦。」她温声说，「治疗一次8便士。或者，你也可以只和我聊聊天——聊天免费。」',
    choices: [
      { text: '接受治疗（-8便士，恢复理智）', cond: 'money>=8', effects: [{ k: 'money', v: -8 }, { k: 'san', v: 15 }, { k: 'favor', id: 'ella', v: 5 }], result: '熏香与她平缓的声线里，你脑海中那些湿冷的呓语退潮了。' },
      { text: '只聊聊天', effects: [{ k: 'san', v: 5 }, { k: 'favor', id: 'ella', v: 3 }], result: '你们聊了天气、物价和梦。不知为何，聊完你轻松了许多——也许这就是她的「治疗」。' },
    ],
  },
  {
    id: 'npc_ella_peers', slot: 'social', npc: 'ella', weight: 6, cond: 'beyonder&san<50', once: true, title: '同类的识别',
    text: '诊疗结束，艾拉医生送你到门口，忽然轻声说：「你的『弦』不是被生活绷紧的。是被『扮演』绷紧的，对吗？」你浑身一僵。她笑了笑，灰眼睛里满是了然：「别怕。我也是『观众』——只不过比你早看了几年。」',
    choices: [
      { text: '承认并请教', effects: [{ k: 'favor', id: 'ella', v: 12 }, { k: 'knowledge', id: 'potion_brew' }, { k: 'exposure', v: 3 }], result: '她教了你一些控制扮演边界的技巧，临别时叮嘱：「这座城市里，认出你的人会越来越多。学会在他们认出你之前，先认出他们。」' },
      { text: '矢口否认', effects: [{ k: 'favor', id: 'ella', v: -3 }], result: '「也好。」她没有拆穿，「谨慎是美德。但如果你哪天绷不住了——诊所的门开着。」' },
    ],
  },
  {
    id: 'npc_mike_leads', slot: 'social', npc: 'mike', weight: 6, title: '吧台后的耳朵',
    text: '麦克擦着杯子听你闲聊，忽然压低声音：「最近有几桩活儿没人接……你要是想赚外快，我帮你留意着。这座城里没有我这吧台听不见的事。」',
    choices: [
      { text: '请他留意（获得一桩差事线索）', effects: [{ k: 'commission' }, { k: 'favor', id: 'mike', v: 4 }], result: '麦克朝你眨眨眼，在你耳边说了个大概：「细节去问委托人，就说是麦克介绍的。」' },
      { text: '请他喝一杯（-12便士）', cond: 'money>=12', effects: [{ k: 'money', v: -12 }, { k: 'favor', id: 'mike', v: 6 }], result: '「懂事。」他不动声色地把你的杯子满上了。' },
    ],
  },
  {
    id: 'npc_brandon_loan', slot: 'social', npc: 'brandon', weight: 5, title: '血手套的善意',
    text: '布兰登用缠着绷带的手指敲着桌面：「缺钱？找我借啊。一镑起借，一周还一镑四苏勒。还不上……」他笑了笑，「我这双手套本来是白的。」',
    choices: [
      { text: '借一镑（+240便士，挂上讨债倒计时）', effects: [{ k: 'money', v: 240 }, { k: 'timer', id: 'debt', timerLabel: '血手套的债', timerHours: 168, timerEffect: [{ k: 'money', v: -288 }, { k: 'san', v: -10 }] }], result: '他把一镑拍在你手心：「聪明人。」你注意到他指节上的旧血渍没洗干净。' },
      { text: '谢绝', effects: [{ k: 'favor', id: 'brandon', v: 2 }], result: '「行，有志气。」他咧嘴，「志气短了再来。」' },
    ],
  },
];

// ============ 工具函数 ============
export function findPathway(id: string | null) { return PATHWAYS.find(p => p.id === id); }
export function findItem(id: string) { return ITEMS.find(i => i.id === id); }
export function findNPC(id: string) { return NPCS.find(n => n.id === id); }
export function findEvent(id: string) { return EVENTS.find(e => e.id === id); }

/** 星期计算与作息判断 */
export const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
export function weekdayOf(day: number): number { return (day - 1) % 7; }

/** 判断 NPC 在指定日期的指定小时是否可交互 */
export function npcAvailable(npc: NPCDef, day: number, hour: number): boolean {
  const wd = weekdayOf(day);
  return npc.schedule.some(s => s.interactable && (!s.days || s.days.includes(wd)) && hour >= s.from && hour < s.to);
}
export function npcLocation(npc: NPCDef, day: number, hour: number): string | null {
  const wd = weekdayOf(day);
  for (const s of npc.schedule) {
    if (s.interactable && (!s.days || s.days.includes(wd)) && hour >= s.from && hour < s.to) return s.location;
  }
  return null;
}

/** 作息规律的人类可读摘要（供玩家“摸清”NPC 节奏） */
export function scheduleHint(npc: NPCDef): string {
  return npc.schedule.filter(s => s.interactable).map(s => {
    const h = `${s.from}:00–${s.to > 24 ? s.to - 24 : s.to}:00`;
    if (!s.days) return `每天${h} ${s.location}`;
    if (s.days.length === 6 && !s.days.includes(0)) return `周一至周六${h} ${s.location}`;
    const days = [...s.days].sort().map(d => WEEKDAY_NAMES[d]).join('/');
    return `${days}${h} ${s.location}`;
  }).join('；');
}

// ============ 同行者（好感≥40 可邀请一同冒险；检定时取队伍该属性最高值） ============
export const COMPANION_MIN_FAVOR = 40;
/** 同伴在检定中能提供的属性值：核心 NPC 按人设，随机 NPC 按职业 */
const CORE_COMPANION: Record<string, { stat: StatKey; value: number }> = {
  victor: { stat: 'cha', value: 32 },   // 掮客的嘴皮子
  martha: { stat: 'cha', value: 22 },   // 房东太太的泼辣
  nelson: { stat: 'mnd', value: 38 },   // 退休非凡者的经验
  evelyn: { stat: 'phy', value: 44 },   // 值夜者队长的战力
  ella: { stat: 'cha', value: 36 },     // 观众的洞察
  brandon: { stat: 'phy', value: 40 },  // 罪犯途径的打手
  mike: { stat: 'cha', value: 30 },     // 酒馆老板的场面
};
const JOB_COMPANION: Record<string, { stat: StatKey; value: number }> = {
  码头搬运工: { stat: 'phy', value: 32 }, 酒馆侍者: { stat: 'cha', value: 30 },
  报童: { stat: 'cha', value: 26 }, 裁缝: { stat: 'mnd', value: 26 },
  巡警: { stat: 'phy', value: 34 }, 大学旁听生: { stat: 'mnd', value: 32 },
  诊所助手: { stat: 'spi', value: 28 }, 运河水手: { stat: 'phy', value: 30 },
  墓地看守: { stat: 'spi', value: 30 }, 当铺伙计: { stat: 'mnd', value: 28 },
  烟囱清扫工: { stat: 'phy', value: 26 }, 剧院女演员: { stat: 'cha', value: 32 },
  商行账房: { stat: 'mnd', value: 30 }, 鱼贩: { stat: 'cha', value: 28 },
};
export function companionSpec(npc: NPCDef): { stat: StatKey; value: number } {
  return CORE_COMPANION[npc.id] ?? JOB_COMPANION[npc.identity] ?? { stat: 'mnd', value: 22 };
}
export const STAT_NAMES: Record<StatKey, string> = { phy: '体质', spi: '灵性', mnd: '心智', cha: '魅力' };
