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
  seq9: { materials: string[]; auxiliary: string }; // 序列9的两件主材料与固定辅助材料包
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
  initialJobId?: string;            // 初始职业
}

/** 可受雇的日常职业 */
export interface JobDef {
  id: string;
  name: string;
  location: string;
  shiftStart: number;
  shiftEnd: number;
  commuteHours: number;
  workHours: number;
  pay: number;                      // 每完成一个 workHours 工作时段的报酬（便士）
  energyCost: number;
  desc: string;
  tendency: string;
  coworkerIdentity: string;
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

export type ItemCategory = 'tool' | 'book' | 'misc' | 'occult';

export interface ItemSpiritVisionDef {
  result: string;
  sanityCost?: number;
  corruptionCost?: number;
  revealsOccult: boolean;
}

export interface ItemDivinationDef {
  title: string;
  difficulty: number;
  pressure: 'low' | 'high';
  antiDivination?: boolean;
  clueId?: string;
  successText: Record<DivinationMethod, string>;
}

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  category: Exclude<ItemCategory, 'book'>;
  /** 未经辨认时允许展示的外观；神秘物品不得直接把内部危害渲染给玩家。 */
  surfaceName?: string;
  surfaceDesc?: string;
  occultMarked?: boolean;
  spiritVision?: ItemSpiritVisionDef;
  divination?: ItemDivinationDef;
  seq9Product?: { kind: 'potion' | 'characteristic' | 'auxiliary'; pathwayId: string };
  price: number; // 便士
}

export type TradeFairProductKind = 'formula' | 'potion' | 'material' | 'characteristic' | 'auxiliary';

export interface TradeFairProductDef {
  id: string;
  pathwayId: string;
  sequence: 9;
  kind: TradeFairProductKind;
  price: number;
  initialStock: number;
  formulaId?: string;
  itemId?: string;
}

export interface TradeFairInvitation {
  sourceKind: 'organization' | 'npc';
  sourceId: string;
  acquiredDay: number;
  acquiredHour: number;
}

export interface TradeFairState {
  invitation: TradeFairInvitation | null;
  stock: Record<string, number>;
  purchasedCounts: Record<string, number>;
  consumedPurchasedCounts: Record<string, number>;
  identifiedCharacteristicIds: string[];
}

export interface ConfirmedBeyonderDeathRecord {
  sourceId: string;
  npcId: string;
  pathwayId: string;
  sequence: 9;
  characteristicItemId: string;
  confirmedDay: number;
  confirmedHour: number;
}

export interface BeyonderDeathSourceDef {
  id: string;
  npcId: string;
  publicIdentity: string;
  pathwayId: string;
  sequence: 9;
  characteristicItemId: string;
  eventId: string;
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

export type Sequence9ExplorationAbilityId =
  | 'seer_divination'
  | 'spectator_observation'
  | 'hunter_tracking'
  | 'sleepless_night_watch'
  | 'apprentice_passage_probe';

/** 序列9能力的机械定义；玩家界面只展示 label/description，不展示内部修正值。 */
export interface Sequence9ExplorationAbilityDef {
  id: Sequence9ExplorationAbilityId;
  pathwayId: string;
  mode: 'divination' | 'preparation';
  label: string;
  description: string;
  hours: number;
  energyCost: number;
  nightOnly?: boolean;
  commissionKinds: readonly Commission['kind'][];
  exploreEnergyRelief: number;
  commissionBonus: number;
  preparationText: string;
}

/** 当前地点的一次性探索准备；保留已消费记录以执行同地每日冷却。 */
export interface Sequence9PreparationRecord {
  abilityId: Sequence9ExplorationAbilityId;
  pathwayId: string;
  locationId: string;
  preparedDay: number;
  preparedHour: number;
  cooldownDay: number;
  consumed: boolean;
  consumedDay?: number;
  consumedHour?: number;
}

export type ClueSourceKind = 'public_records' | 'archive' | 'location' | 'npc' | 'event' | 'migration';

/** 玩家实际取得的调查线索；来源与取得时间随存档保留。 */
export interface ClueRecord {
  id: string;
  caseId: string;
  sourceKind: ClueSourceKind;
  sourceId: string;
  acquiredDay: number;
  acquiredHour: number;
}

/** 数据驱动的确定性探索检定。 */
export interface ExplorationCheckDef {
  id: string;
  caseId: string;
  stat: StatKey;
  skill: SkillKey;
  difficulty: number;
  skillMultiplier: number;
  requiredClueIds: string[];
  clueBonuses: Record<string, number>;
}

export interface ExplorationCheckResult {
  checkId: string;
  outcome: 'passed' | 'blocked';
  reason: 'passed' | 'unknown_check' | 'missing_required_clue' | 'insufficient';
  score: number;
  difficulty: number;
  contributingClueIds: string[];
}

export interface ExplorationAttempt {
  checkId: string;
  day: number;
  hour: number;
  outcome: 'passed' | 'blocked';
  reason: ExplorationCheckResult['reason'];
  score: number;
  contributingClueIds: string[];
}

export type CheckDomain = 'exploration';
export type CheckTargetKind = 'case' | 'location' | 'item';
export type CheckOutcome = 'passed' | 'blocked';
export type CheckReason = 'passed' | 'unknown_check' | 'unknown_target' | 'unknown_requirement' | 'missing_requirement' | 'insufficient';

export type CheckRequirement =
  | { kind: 'clue'; id: string }
  | { kind: 'tool'; id: string }
  | { kind: 'ability'; id: string }
  | { kind: 'location'; id: string };

export type CheckContributionDef =
  | { kind: 'stat'; id: StatKey; multiplier: number; publicLabel: string }
  | { kind: 'skill'; id: SkillKey; multiplier: number; publicLabel: string }
  | { kind: 'clue'; id: string; value: number; publicLabel: string }
  | { kind: 'tool'; id: string; value: number; publicLabel: string }
  | { kind: 'ability'; id: string; value: number; publicLabel: string };

/** 纯检定定义；结算成本和领域推进仍由对应 engine action 掌管。 */
export interface CheckDef {
  id: string;
  version: number;
  domain: CheckDomain;
  target: { kind: CheckTargetKind; id: string };
  difficulty: number;
  requirements: readonly CheckRequirement[];
  contributions: readonly CheckContributionDef[];
  receiptPolicy: Record<CheckOutcome, { hoursElapsed: number; effectIds: readonly string[] }>;
}

/** 只保存定义允许读取的输入，避免无关状态进入指纹或改变结果。 */
export interface CheckContext {
  target: { kind: CheckTargetKind; id: string };
  locationId?: string;
  stats: Partial<Record<StatKey, number>>;
  skills: Partial<Record<SkillKey, number>>;
  clueIds: string[];
  toolIds: string[];
  abilityIds: string[];
  companionId?: string;
  preparationIds: string[];
}

export interface CheckRequest {
  checkId: string;
  definitionVersion?: number;
  context: CheckContext;
  startedAt: { day: number; hour: number };
}

export interface CheckContribution {
  id: string;
  kind: CheckContributionDef['kind'];
  publicLabel: string;
  value: number;
}

/** 仅供规则层、测试和存档审计，禁止直接交给 UI。 */
export interface CheckInternalResult {
  checkId: string;
  definitionVersion: number;
  eligible: boolean;
  outcome: CheckOutcome;
  reason: CheckReason;
  score: number;
  difficulty: number;
  fingerprint: string;
  contributions: CheckContribution[];
}

/** 玩家侧结果不携带分数、难度、加成或概率。 */
export interface CheckPublicResult {
  checkId: string;
  eligible: boolean;
  outcome: CheckOutcome;
  reason: 'passed' | 'missing_prerequisite' | 'needs_preparation' | 'unavailable';
  helpedBy: string[];
}

export interface CheckReceiptEntry {
  id: string;
  applied: boolean;
  before?: number | string | boolean | null;
  after?: number | string | boolean | null;
  actualDelta?: number;
}

export interface CheckReceipt {
  hoursElapsed: number;
  effects: CheckReceiptEntry[];
}

/** 统一审计记录不是授权状态，不能据此反向授予线索、路线、物品或能力。 */
export interface CheckAttemptRecord {
  attemptId: string;
  checkId: string;
  definitionVersion: number;
  context: CheckContext;
  fingerprint: string;
  startedDay: number;
  startedHour: number;
  outcome: CheckOutcome;
  reason: CheckReason;
  publicContributionIds: string[];
  receipt: CheckReceipt;
}

export interface DockSequence9ActionDef {
  id: string;
  pathwayId: string;
  locationId: string;
  label: string;
  description: string;
  hours: number;
  energyCost: number;
  nightOnly?: boolean;
  openFrom?: number;
  openTo?: number;
  requiredClueIds?: readonly string[];
  requiredNpcId?: string;
  clueId: string;
  result: string;
}

export interface DockCaseDispositionDef {
  id: 'public_report' | 'workers_warning' | 'official_handoff';
  clueId: string;
  locationId: string;
  label: string;
  description: string;
  openFrom: number;
  openTo: number;
  requiredNpcId?: string;
  requiresFormalLocationAccess?: boolean;
}

export interface CaseJournalFact {
  clueId: string;
  title: string;
  sourceLabel: string;
}

export interface CaseJournalLocation {
  locationId: string;
  name: string;
}

export interface CaseJournalEntry {
  id: 'clocktower' | 'dock_manifest';
  title: string;
  stage: 'rumor' | 'investigating' | 'witnessed' | 'pathway_inquiry' | 'resolution_ready' | 'concluded';
  statusLabel: string;
  facts: CaseJournalFact[];
  unlockedLocations: CaseJournalLocation[];
  currentQuestion: string;
  directions: string[];
  milestone?: string;
  chapterReport?: {
    pathwayLabel: string;
    evidenceCount: number;
    evidenceSources: string[];
    dispositionLabel: string;
    unknowns: string;
  };
}

export type DivinationMethod = 'cards' | 'dream';
export type DivinationProvider = 'self' | 'nelson' | 'evelyn';
export type DivinationTargetKind = 'location' | 'item';
export type DivinationOutcome = 'inconclusive' | 'omen' | 'hint' | 'obscured' | 'backlash';

export interface DivinationTraining {
  cards: boolean;
  dream: boolean;
  media: string[];
  teachers: string[];
}

export type DivinationCredential =
  | {
      kind: 'training';
      source: 'formal_seer_training' | 'nelson';
      method: DivinationMethod;
      day: number;
      hour: number;
    }
  | {
      kind: 'consultation';
      provider: 'nelson' | 'evelyn';
      targetKind: DivinationTargetKind;
      targetId: string;
      method: DivinationMethod;
      day: number;
      hour: number;
    };

export interface DivinationInsight {
  id: string;
  targetKind: DivinationTargetKind;
  targetId: string;
  method: DivinationMethod;
  provider: DivinationProvider;
  outcome: DivinationOutcome;
  text: string;
  clueId?: string;
  day: number;
  hour: number;
}

export interface DivinationAttempt {
  targetKind: DivinationTargetKind;
  targetId: string;
  method: DivinationMethod;
  provider: DivinationProvider;
  outcome: DivinationOutcome;
  day: number;
  hour: number;
  /** 仅供确定性规则与存档复现；不得在玩家文案中展示。 */
  score: number;
}

export type LanguageProficiency = 'none' | 'reading' | 'fluent';
export type BookSourceKind = 'market' | 'public_location' | 'location' | 'npc';

export interface BookState {
  bookId: string;
  acquired: boolean;
  sourceId: string;
  acquiredDay?: number;
  acquiredHour?: number;
  readHours: number;
  completed: boolean;
  failedAttempts: number;
}

export type BookReward =
  | { kind: 'knowledge'; id: string }
  | { kind: 'skill'; id: SkillKey; maxGain: number }
  | { kind: 'language'; id: string; level: LanguageProficiency }
  | { kind: 'clue'; id: string }
  | { kind: 'flag'; id: string }
  | { kind: 'event'; id: string };

export interface BookDef {
  id: string;
  title: string;
  surfaceDesc: string;
  category: 'book';
  language: string;
  totalHours: number;
  minSkill?: { id: SkillKey; level: number };
  minMind?: number;
  check?: { stat: StatKey; skill: SkillKey; difficulty: number; clueBonuses: Record<string, number> };
  rewards: BookReward[];
}

export interface ItemKnowledgeState {
  itemId: string;
  spiritVisionInspected: boolean;
  identifiedAsOccult: boolean;
  knownInfo: string[];
  inspectedDay?: number;
  inspectedHour?: number;
}

export interface BookSourceDef {
  bookId: string;
  kind: BookSourceKind;
  sourceId: string;
  price: number;
}

export interface ActionResult {
  ok: boolean;
  msg?: string;
  outcome?: 'passed' | 'blocked';
}

export interface Effect {
  k: 'money' | 'energy' | 'san' | 'cor' | 'digestion' | 'stat' | 'item'
   | 'favor' | 'intel' | 'clue' | 'knowledge' | 'tag' | 'timer' | 'flag' | 'gameover'
   | 'exposure' | 'formula' | 'commission' | 'skill' | 'beyonder_death';
  v?: number;
  id?: string;
  stat?: StatKey;
  skill?: SkillKey;
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

/** 效果系统的实际结算结果；叙事层只可依据该回执展示奖励。 */
export interface AppliedEffectReceipt {
  effect: Effect;
  applied: boolean;
  before?: number | string | boolean | null;
  after?: number | string | boolean | null;
  actualDelta?: number;
  summary?: string;
}

/** 固定机制、随机叙事文本的事件选项蓝图。 */
export interface EventChoiceBlueprint {
  textVariants: string[];
  cond?: string;
  effects: Effect[];
  resultVariants: string[];
}

/** 事件蓝图中的条件、选项顺序与效果固定，只有文本变体会随机选择。 */
export interface EventBlueprint {
  id: string;
  slot: string;
  weight: number;
  cond?: string;
  locations?: string[];
  npc?: string;
  once?: boolean;
  contentVersion: number;
  titleVariants: string[];
  textVariants: string[];
  choices: EventChoiceBlueprint[];
}

export interface EventInstanceContext {
  slot: string;
  npcId?: string;
  locationId?: string;
  day: number;
  hour: number;
}

/** 冒险地点 */
export type TravelMode = 'walk' | 'rickshaw';
export type LocationActionId = 'explore' | 'wander' | 'tavern' | 'shop' | 'salvage';

export interface LocationStay {
  locationId: string;
  arrivedDay: number;
  arrivedHour: number;
  travelMode: TravelMode;
  returnHours: number;
  returnPrepaid: true;
  companionId?: string;
}

export interface SalvageDef {
  id: string;
  locationId: string;
  hours: number;
  energyCost: number;
  reward: { kind: 'money'; amount: number } | { kind: 'item'; itemId: string; amount: number };
  requiresVisited?: boolean;
}

export interface ShopDef {
  id: string;
  locationId: string;
  openFrom: number;
  openTo: number;
  inventory: readonly { itemId: string; price: number }[];
  organizationAuthorized?: boolean;
}

export interface LocationDef {
  id: string;
  name: string;
  region: string;  // 分区：城区 / 城郊 / 远方
  desc: string;
  hours: number;   // 往返耗时
  danger: number;  // 0-100，影响遭遇风险与报酬
  nightOnly?: boolean; // 仅 22:00-2:00 可前往
  public?: boolean;
  actions: readonly LocationActionId[];
}

export type TingenLandmarkRequirement = 'abnormal_witness';

export interface LandmarkIntroductionGrant {
  encounterId: string;
  /** 稳定的普通引见人身份 id；玩家文案只使用对应公开称呼。 */
  introducerId: string;
  introducerName: string;
}

export interface TingenLandmarkActionDef {
  id: string;
  locationId: string;
  label: string;
  description: string;
  hours: number;
  energyCost: number;
  openFrom?: number;
  openTo?: number;
  requirement?: TingenLandmarkRequirement;
  completion: { kind: 'clue' | 'intel' | 'knowledge' | 'flag'; id: string };
  effects: readonly Effect[];
  introductions?: readonly LandmarkIntroductionGrant[];
  result: string;
}

/** 地标高级人物定义；npc.secret 仅供规则层保存真实背景，禁止直接渲染。 */
export interface LandmarkEncounterDef {
  id: string;
  locationId: string;
  npc: NPCDef;
  triggerActionIds: readonly string[];
  minLocationRelation: number;
  chance: number;
  cooldownDays: number;
  guaranteeAfterAttempts?: number;
  initialFavor: number;
  meetText: string;
  missText: string;
}

export interface LandmarkIntroductionRecord {
  encounterId: string;
  sourceActionId: string;
  introducerId: string;
  acquiredDay: number;
  acquiredHour: number;
}

export interface LandmarkEncounterRecord {
  encounterId: string;
  attempts: number;
  /** 最近一次正式概率判定所匹配作息条目的归属日，而非原始日历日。 */
  lastAttemptDay?: number;
  met: boolean;
  metDay?: number;
  metHour?: number;
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

/** 已固化的随机文本事件。保存后不再从蓝图重抽任何文字或效果。 */
export interface EventInstance extends GameEvent {
  source: 'generated';
  instanceId: string;
  blueprintId: string;
  contentVersion: number;
  context: EventInstanceContext;
  effects: Effect[][];
}

/** string 是旧版静态事件存档格式。 */
export type PendingEvent = string | EventInstance;

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

export type Awareness = 'ordinary' | 'witness' | 'informed';
export type PathwaySource = 'official' | 'mentor' | 'black_market' | 'trade_fair' | 'accident' | 'legacy';
export type FormulaStatus = 'rumor' | 'fragment' | 'unverified' | 'verified';
export type PreparationMode = 'official_dose' | 'supervised_brew' | 'self_brew' | 'trade_fair_brew' | 'characteristic_brew' | 'purchased_dose';
export type OrganizationId = 'nightwatch' | 'secret_order' | 'psychology_alchemists' | 'iron_and_blood' | 'abraham_branch';
export type LeadStage = 'unknown' | 'found' | 'decoded' | 'identified' | 'verified';
export type OrganizationStatus = 'unknown' | 'contacted' | 'qualified' | 'member' | 'offer_pending' | 'committed';

export interface RouteAttempt {
  day: number;
  step: string;
  outcome: 'started' | 'passed' | 'failed' | 'declined' | 'migrated';
  note?: string;
  evidenceId?: string;
}

/** 每条途径独立保存资格与准备，防止一个组织的候选资格被挪到另一条途径。 */
export interface PathwayLead {
  currentSource?: PathwaySource;
  organizationId?: OrganizationId;
  history: RouteAttempt[];
  routeStep: string;
  formulaStatus?: FormulaStatus;
  preparationMode?: PreparationMode;
  commitment: boolean;
}

export interface StructuredLead {
  id: string;
  stage: LeadStage;
  source: string;
  organizationHint?: OrganizationId;
  unique: boolean;
  notes: string[];
}

export interface OrganizationRoute {
  organizationId: OrganizationId;
  status: OrganizationStatus;
  routeStep: string;
  selectedPathway?: string;
  history: RouteAttempt[];
}

export interface DiaryPageState {
  pageId: string;
  truth: 'authentic' | 'forged';
  acquired: boolean;
  decoded: boolean;
  authenticity: 'unknown' | 'authentic' | 'forged';
  operationalVerified: boolean;
  source: string;
}

export interface MaterialSourceState {
  sourceId: string;
  pathwayId: string;
  itemId: string;
  locationId: string;
  targetSequence: 8 | 9;
  acquisitionMode: 'collect' | 'purchase';
  unlocked: boolean;
  remaining: number;
}

export type Sequence8Stage = 'acting' | 'review_ready' | 'review_pending' | 'formula_verified' | 'ritual_planned' | 'ritual_ready' | 'completed';
export type Sequence8FormulaStatus = 'locked' | 'review_pending' | 'verified' | 'legacy_unverified';

export interface ActingEvidence {
  actionId: string;
  principleId: string;
  contextKey: string;
  day: number;
}

export interface ActingMistake {
  actionId: string;
  contextKey: string;
  day: number;
  note: string;
}

export interface Sequence8Progress {
  pathwayId: string;
  organizationId?: OrganizationId;
  /** 仅由v9及更早存档迁移生成；表示需要所属途径组织补做旧身份审计。 */
  legacyIdentityAudit: boolean;
  /** 保留审计来源以防普通v10角色仅伪造布尔标志取得豁免。 */
  legacyIdentityAuditFromSchema?: number;
  stage: Sequence8Stage;
  evidence: Record<string, ActingEvidence[]>;
  mistakes: ActingMistake[];
  requiredEvidencePerPrinciple: number;
  formulaStatus: Sequence8FormulaStatus;
  ritual: {
    planned: boolean;
    steps: string[];
    ready: boolean;
    consumed: boolean;
    readyUntilHour?: number;
  };
}

export interface GameState {
  schemaVersion: number;
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
  canReadRoselleScript: boolean;
  leads: Record<string, StructuredLead>;
  organizationRoutes: Record<OrganizationId, OrganizationRoute>;
  diaryPages: Record<string, DiaryPageState>;
  materialSources: Record<string, MaterialSourceState>;
  sequence8Progress: Sequence8Progress | null;
  visitedLocations: string[];
  currentLocation: LocationStay | null;
  completedLocationActions: string[];
  locationRelations: Record<string, number>;
  landmarkIntroductions: LandmarkIntroductionRecord[];
  landmarkEncounters: LandmarkEncounterRecord[];
  clues: ClueRecord[];
  explorationAttempts: ExplorationAttempt[];
  checkAttempts: CheckAttemptRecord[];
  divinationTraining: DivinationTraining;
  divinationCredentials: DivinationCredential[];
  divinationInsights: DivinationInsight[];
  divinationAttempts: DivinationAttempt[];
  books: Record<string, BookState>;
  languages: Record<string, LanguageProficiency>;
  awareness: Awareness;
  pathwayLeads: Record<string, PathwayLead>;
  items: Record<string, number>;
  itemKnowledge: Record<string, ItemKnowledgeState>;
  sequence9Preparations: Sequence9PreparationRecord[];
  tradeFair: TradeFairState;
  confirmedBeyonderDeaths: ConfirmedBeyonderDeathRecord[];
  intel: string[];
  knowledge: string[];
  /** v14及更早存档迁移兼容字段；v15运行时固定为0，不再增长或决定奖励。 */
  studyProgress: number;
  jobId: string | null;            // 当前职业；null = 失业
  atWork: boolean;                 // 是否已经通勤到工作地点
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
  pendingEvent: PendingEvent | null; // 旧事件 id 或已固化的随机文本事件实例
  pendingNpc: string | null;   // 社交事件来源 NPC
  firedOnce: string[];         // 已触发的一次性事件
  eventCounter: number;        // 稳定事件实例编号
  recentEventVariants: Record<string, number[]>; // 各文本槽近期使用的变体索引
  forcedEventQueue: string[];  // 被待决事件阻挡的关键事件
  gameOver: { title: string; text: string } | null;
}
