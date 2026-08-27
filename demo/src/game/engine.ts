import type { ActionResult, AppliedEffectReceipt, BookReward, BookState, ClueRecord, ClueSourceKind, DivinationAttempt, DivinationCredential, DivinationInsight, DivinationMethod, DivinationOutcome, DivinationProvider, DivinationTargetKind, EventBlueprint, EventInstance, EventInstanceContext, ExplorationAttempt, ExplorationCheckResult, GameState, Effect, GameEvent, ItemCategory, ItemKnowledgeState, LandmarkEncounterRecord, LandmarkIntroductionRecord, LocationActionId, LogEntry, GenNPC, SkillKey, PathwayLead, PreparationMode, OrganizationId, OrganizationRoute, StructuredLead, DiaryPageState, MaterialSourceState, Sequence8Progress, Timer, TravelMode, TingenLandmarkActionDef } from './types';
import { BOOK_DEFS, BOOK_SOURCE_DEFS, CLUE_DEFS, EVENTS, EXPLORATION_CHECKS, RANDOM_TEXT_EVENTS, NPCS, PATHWAYS, ORIGINS, JOBS, SALVAGE_DEFS, SHOP_DEFS, TINGEN_LANDMARK_ACTIONS, TINGEN_LANDMARK_ENCOUNTERS, SKILL_NAMES, KNOWLEDGE_NAMES, LOCATIONS, ORGANIZATIONS, ORGANIZATION_LEAD_DEFS, ROSELLE_DIARY_PAGE_DEFS, MATERIAL_SOURCE_DEFS, SEQUENCE8_ACTING_DEFS, SEQUENCE8_RITUAL_DEFS, findEvent, findItem, findPathway, findJob, formulaName, npcAvailable, npcLocation, npcScheduleOwnerDay, companionSpec, COMPANION_MIN_FAVOR, STAT_NAMES } from './data';
import { generateNPC, generateCoworker, generateCommission, spawnNemesis } from './gen';
import type { NPCDef, JobDef } from './types';
import { hasVerifiedBlackthornReferral, isLocationUnlocked, locationAccessIssue, redactLockedLocationText } from './location-access';

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const rnd = (n: number) => Math.floor(Math.random() * n);
export const CURRENT_SCHEMA_VERSION = 18;
export type { ActionResult } from './types';
export { getVisibleLocations, hasVerifiedBlackthornReferral, isLocationUnlocked, isMaterialRouteValid, locationAccessIssue, redactLockedLocationText } from './location-access';

function blankPathwayLead(): PathwayLead {
  return { history: [], routeStep: 'none', commitment: false };
}

export function createPathwayLeads(): Record<string, PathwayLead> {
  return Object.fromEntries(PATHWAYS.map(pathway => [pathway.id, blankPathwayLead()]));
}

export function createStructuredLeads(): Record<string, StructuredLead> {
  return Object.fromEntries(ORGANIZATION_LEAD_DEFS.map(def => [def.id, {
    id: def.id, stage: 'unknown', source: def.source, organizationHint: def.organizationId, unique: true, notes: [],
  }]));
}

export function createOrganizationRoutes(): GameState['organizationRoutes'] {
  return Object.fromEntries(ORGANIZATIONS.map(org => [org.id, {
    organizationId: org.id, status: 'unknown', routeStep: 'none', history: [],
  }])) as unknown as GameState['organizationRoutes'];
}

export function createDiaryPages(): Record<string, DiaryPageState> {
  return Object.fromEntries(ROSELLE_DIARY_PAGE_DEFS.map(def => [def.id, {
    pageId: def.id, truth: def.truth, acquired: false, decoded: false, authenticity: 'unknown', operationalVerified: false, source: def.source,
  }]));
}

export function createMaterialSources(): Record<string, MaterialSourceState> {
  return Object.fromEntries(MATERIAL_SOURCE_DEFS.map(def => [def.id, {
    sourceId: def.id, pathwayId: def.pathwayId, itemId: def.itemId, locationId: def.locationId,
    targetSequence: def.targetSequence, acquisitionMode: def.acquisitionMode, unlocked: false, remaining: 1,
  }]));
}

export function createBooks(): Record<string, BookState> {
  return Object.fromEntries(BOOK_DEFS.map(book => {
    const source = BOOK_SOURCE_DEFS.find(candidate => candidate.bookId === book.id)!;
    return [book.id, {
      bookId: book.id, acquired: false, sourceId: source.sourceId,
      readHours: 0, completed: false, failedAttempts: 0,
    }];
  }));
}

function createSequence8Progress(pathwayId: string, organizationId: OrganizationId | undefined, requiredEvidencePerPrinciple: number, formulaStatus: Sequence8Progress['formulaStatus'] = 'locked'): Sequence8Progress {
  const principles = SEQUENCE8_ACTING_DEFS[pathwayId as keyof typeof SEQUENCE8_ACTING_DEFS]?.principles ?? [];
  return {
    pathwayId, organizationId, legacyIdentityAudit: false, stage: 'acting',
    evidence: Object.fromEntries(principles.map(principle => [principle.id, []])),
    mistakes: [], requiredEvidencePerPrinciple, formulaStatus,
    ritual: { planned: false, steps: [], ready: false, consumed: false },
  };
}

export function pathwayLead(s: GameState, pathwayId: string): PathwayLead {
  s.pathwayLeads[pathwayId] ??= blankPathwayLead();
  return s.pathwayLeads[pathwayId];
}

export const originOf = (s: GameState) => ORIGINS.find(o => o.id === s.originId) ?? ORIGINS[0];
export const hasTalent = (s: GameState, id: string) => s.talents.includes(id);
/** 高级地标人物在首遇前不进入玩家可见 NPC 池，避免姓名、作息和地点提前泄露。 */
const metLandmarkNPCs = (s: GameState): NPCDef[] => TINGEN_LANDMARK_ENCOUNTERS
  .filter(def => (s.landmarkEncounters ?? []).some(record => record.encounterId === def.id && record.met))
  .map(def => def.npc);
/** 全部玩家已知 NPC = 手写核心 + 已正式首遇的地标人物 + 程序生成 */
export const allNPCs = (s: GameState): NPCDef[] => [...NPCS, ...metLandmarkNPCs(s), ...s.genNpcs];
export const findAnyNPC = (s: GameState, id: string) => allNPCs(s).find(n => n.id === id);
const isNight = (h: number) => h >= 18 || h < 6;
const OCCULT_SHOP_ITEM_IDS = new Set([
  ...PATHWAYS.flatMap(pathway => [...pathway.seq9.materials, ...pathway.seq8.materials]),
]);
const SEQUENCE8_ITEM_IDS = new Set(PATHWAYS.flatMap(pathway => pathway.seq8.materials));
const MYSTIC_MATERIAL_ITEM_IDS = new Set(PATHWAYS.flatMap(pathway => [...pathway.seq9.materials, ...pathway.seq8.materials]));

// ============ 人脉阶段 ============
/** 好感达到该值才解锁「登门拜访」 */
export const VISIT_FAVOR = 20;
/** 是否已结识（relations 无记录 = 未结识的陌生人） */
export const isMet = (s: GameState, id: string) => s.relations[id] !== undefined;
export const hasVisitedLocation = (s: GameState, locationId: string) => (s.visitedLocations ?? []).includes(locationId);
export const hasClue = (s: GameState, clueId: string) => (s.clues ?? []).some(clue => clue.id === clueId);

/** 线索按稳定 id 去重；默认来源由内容定义给出，迁移时可显式覆盖。 */
export function acquireClue(s: GameState, clueId: string, sourceKind?: ClueSourceKind, sourceId?: string): boolean {
  if (hasClue(s, clueId)) return false;
  const def = CLUE_DEFS.find(clue => clue.id === clueId);
  if (!def) return false;
  const record: ClueRecord = {
    id: def.id,
    caseId: def.caseId,
    sourceKind: sourceKind ?? def.sourceKind,
    sourceId: sourceId ?? def.sourceId,
    acquiredDay: s.day,
    acquiredHour: s.hour,
  };
  s.clues ??= [];
  s.clues.push(record);
  return true;
}

/** 确定性探索检定：仅定义中指定的属性、技能和线索参与。 */
export function evaluateExplorationCheck(s: GameState, checkId: string): ExplorationCheckResult {
  const check = EXPLORATION_CHECKS.find(candidate => candidate.id === checkId);
  if (!check) {
    return {
      checkId, outcome: 'blocked', reason: 'unknown_check', score: 0,
      difficulty: Number.POSITIVE_INFINITY, contributingClueIds: [],
    };
  }
  const contributingClueIds = Object.keys(check.clueBonuses).filter(clueId => hasClue(s, clueId));
  const score = s.stats[check.stat] + (s.skills[check.skill] ?? 0) * check.skillMultiplier
    + contributingClueIds.reduce((sum, clueId) => sum + (check.clueBonuses[clueId] ?? 0), 0);
  if (check.requiredClueIds.some(clueId => !hasClue(s, clueId))) {
    return { checkId, outcome: 'blocked', reason: 'missing_required_clue', score, difficulty: check.difficulty, contributingClueIds };
  }
  return {
    checkId,
    outcome: score >= check.difficulty ? 'passed' : 'blocked',
    reason: score >= check.difficulty ? 'passed' : 'insufficient',
    score,
    difficulty: check.difficulty,
    contributingClueIds,
  };
}

function recordExplorationAttempt(s: GameState, result: ExplorationCheckResult) {
  const attempt: ExplorationAttempt = {
    checkId: result.checkId,
    day: s.day,
    hour: s.hour,
    outcome: result.outcome,
    reason: result.reason,
    score: result.score,
    contributingClueIds: [...result.contributingClueIds],
  };
  s.explorationAttempts ??= [];
  s.explorationAttempts.push(attempt);
}

type DivinationTargetDef = {
  kind: DivinationTargetKind;
  id: string;
  title: string;
  difficulty: number;
  pressure: 'low' | 'high';
  antiDivination?: boolean;
  clueId?: string;
  successText: Record<DivinationMethod, string>;
};

const DIVINATION_TARGETS: readonly DivinationTargetDef[] = [
  {
    kind: 'location', id: 'old_tower', title: '旧钟楼的夜间异响', difficulty: 32, pressure: 'low',
    clueId: 'clocktower_divination_omen',
    successText: {
      cards: '纸牌中的塔反复倒置，停摆的指针却总指向同一段夜色。若要前往，应先核对那些被反复改期的维修记录。',
      dream: '梦里，旧钟楼的指针一次次退回同一刻。醒来时你只确定一件事：维修记录里藏着比传闻更可靠的入口。',
    },
  },
];

const genericDivinationTargetIssue = '这个目标尚未进入你能核验的调查范围。';

function divinationTargetDefinition(kind: DivinationTargetKind, id: string): DivinationTargetDef | null {
  if (kind === 'location') return DIVINATION_TARGETS.find(candidate => candidate.kind === kind && candidate.id === id) ?? null;
  const item = findItem(id);
  if (item?.divination) return { kind, id, ...item.divination };
  if (!item || !MYSTIC_MATERIAL_ITEM_IDS.has(id)) return null;
  return {
    kind, id, title: item.surfaceName ?? '密封材料', difficulty: 42, pressure: 'high', antiDivination: true,
    successText: {
      cards: '象征在容器边缘停住：它并非普通材料，继续接触前应先核对来源与封存记录。',
      dream: '梦境始终停在未拆封的容器外。有什么在里面沉睡，而你缺少足以安全辨认它的来源记录。',
    },
  };
}

function divinationTarget(s: GameState, kind: DivinationTargetKind, id: string): DivinationTargetDef | null {
  const target = divinationTargetDefinition(kind, id);
  if (!target) return null;
  if (kind === 'location') return isLocationUnlocked(s, id) ? target : null;
  return (s.items[id] ?? 0) > 0 ? target : null;
}

function canonicalDivinationText(target: DivinationTargetDef, method: DivinationMethod, provider: DivinationProvider, outcome: DivinationOutcome): string {
  let text: string;
  if (outcome === 'omen' || outcome === 'hint') text = target.successText[method];
  else if (outcome === 'obscured') text = '所有象征都在关键处被雾遮住，像有另一只手故意把答案推离桌面。继续强求只会让记录失真。';
  else if (outcome === 'backlash') text = '象征突然越过了你设下的边界。你及时中断仪式，却仍被一阵不属于自己的恐惧攫住。';
  else text = '牌面彼此矛盾，没有形成可以交叉核验的指向。你只记录了“无结果”，没有自行补全答案。';
  return provider === 'evelyn' ? `${text} 伊芙琳把过程摘要封入了教会异常档案。` : text;
}

export function getDivinationTargets(s: GameState): { kind: DivinationTargetKind; id: string; title: string }[] {
  const known = DIVINATION_TARGETS.filter(def => divinationTarget(s, def.kind, def.id)).map(({ kind, id, title }) => ({ kind, id, title }));
  const canRecognizeItemTarget = s.divinationTraining.cards || s.divinationTraining.dream
    || (isMet(s, 'nelson') && (s.relations.nelson ?? -100) >= VISIT_FAVOR)
    || (isMet(s, 'evelyn') && (s.awareness === 'informed' || s.organizationRoutes.nightwatch.status !== 'unknown'));
  if (!canRecognizeItemTarget) return known;
  for (const [id, count] of Object.entries(s.items)) {
    const target = count > 0 ? divinationTarget(s, 'item', id) : null;
    if (!target || known.some(candidate => candidate.kind === 'item' && candidate.id === id)) continue;
    known.push({ kind: 'item', id, title: itemPresentation(s, id)?.name ?? target.title });
  }
  return known;
}

function successfulItemDivination(s: GameState, itemId: string): DivinationInsight | undefined {
  const target = divinationTargetDefinition('item', itemId);
  if (!target) return undefined;
  const record = [...(s.divinationInsights ?? [])].reverse().find(insight => insight.targetKind === 'item'
    && insight.targetId === itemId && insight.outcome === 'hint'
    && (s.divinationAttempts ?? []).some(candidate => {
      const attempt = normalizedRecordedDivinationAttempt(s, candidate);
      return attempt?.targetKind === insight.targetKind && attempt.targetId === insight.targetId
        && attempt.method === insight.method && attempt.provider === insight.provider
        && attempt.outcome === insight.outcome && attempt.day === insight.day && attempt.hour === insight.hour;
    }));
  return record ? { ...record, text: canonicalDivinationText(target, record.method, record.provider, record.outcome), clueId: target.clueId } : undefined;
}

function itemKnowledgeState(s: GameState, itemId: string): ItemKnowledgeState {
  s.itemKnowledge ??= {};
  return s.itemKnowledge[itemId] ??= {
    itemId, spiritVisionInspected: false, identifiedAsOccult: false, knownInfo: [],
  };
}

function hasDivinationTrainingCredential(s: GameState, source: 'formal_seer_training' | 'nelson', method: DivinationMethod): boolean {
  return (s.divinationCredentials ?? []).some(credential => credential.kind === 'training'
    && credential.source === source && credential.method === method);
}

function addDivinationTrainingCredential(s: GameState, source: 'formal_seer_training' | 'nelson', method: DivinationMethod) {
  s.divinationCredentials ??= [];
  if (hasDivinationTrainingCredential(s, source, method)) return;
  s.divinationCredentials.push({ kind: 'training', source, method, day: s.day, hour: s.hour });
}

function hasDivinationConsultationCredential(s: GameState, provider: 'nelson' | 'evelyn', targetKind: DivinationTargetKind, targetId: string, method: DivinationMethod, day: number, hour: number): boolean {
  return (s.divinationCredentials ?? []).some(credential => credential.kind === 'consultation'
    && credential.provider === provider && credential.targetKind === targetKind && credential.targetId === targetId
    && credential.method === method && credential.day === day && credential.hour === hour);
}

function addDivinationConsultationCredential(s: GameState, provider: 'nelson' | 'evelyn', targetKind: DivinationTargetKind, targetId: string, method: DivinationMethod, day: number, hour: number) {
  s.divinationCredentials ??= [];
  if (hasDivinationConsultationCredential(s, provider, targetKind, targetId, method, day, hour)) return;
  s.divinationCredentials.push({ kind: 'consultation', provider, targetKind, targetId, method, day, hour });
}

function hasTrustedSeerSpiritVisionSource(s: GameState): boolean {
  return hasSeerDivinationSequence(s)
    && s.divinationTraining.teachers.includes('formal_seer_training')
    && hasDivinationTrainingCredential(s, 'formal_seer_training', 'dream');
}

export function hasSpiritVisionAbility(s: GameState): boolean {
  return hasTrustedSeerSpiritVisionSource(s) && s.knowledge.includes('spirit_vision');
}

export function itemPresentation(s: GameState, itemId: string): { name: string; description: string } | null {
  const item = findItem(itemId);
  if (!item) return null;
  const concealed = item.occultMarked || MYSTIC_MATERIAL_ITEM_IDS.has(itemId);
  const knowledge = s.itemKnowledge?.[itemId];
  const name = concealed && !knowledge?.spiritVisionInspected ? (item.surfaceName ?? '未鉴定的密封样本') : item.name;
  const base = concealed ? (item.surfaceDesc ?? '密封容器上只剩外观与批次，来源和性质仍待核验。') : item.desc;
  const knownInfo = knowledge?.knownInfo ?? [];
  const insight = successfulItemDivination(s, itemId);
  const additions = [
    ...knownInfo.map(info => `灵视记录：${info}`),
    ...(insight ? [`占卜记录：${insight.text}`] : []),
  ];
  return { name, description: additions.length ? `${base} ${additions.join(' ')}` : base };
}

export function spiritVisionInspectionIssue(s: GameState, itemId: string): string | null {
  if (!hasSpiritVisionAbility(s)) return '你尚未真正掌握灵视；灵性数值或理论知识不能代替非凡能力。';
  if (!isAtHome(s)) return '需要先回到住处，在可控环境中检视物品。';
  if ((s.items[itemId] ?? 0) <= 0) return '这件物品并不在你的持有物中。';
  const item = findItem(itemId);
  if (!item?.spiritVision) return '这件物品没有可由灵视稳定辨认的记录。';
  if (s.itemKnowledge?.[itemId]?.spiritVisionInspected) return '这件物品已经完成过灵视检视。';
  if (s.stats.energy < energyCost(s, 5) + 3) return '你现在太疲惫，无法稳定维持灵视。';
  return null;
}

export function inspectItemWithSpiritVision(s: GameState, itemId: string): ActionResult {
  const issue = spiritVisionInspectionIssue(s, itemId);
  if (issue) return { ok: false, msg: issue };
  const item = findItem(itemId)!;
  const definition = item.spiritVision!;
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, 5) }]);
  if (definition.sanityCost) applyEffects(s, [{ k: 'san', v: -definition.sanityCost }]);
  if (definition.corruptionCost) applyEffects(s, [{ k: 'cor', v: definition.corruptionCost }]);
  advanceHours(s, 1);
  const knowledge = itemKnowledgeState(s, itemId);
  knowledge.spiritVisionInspected = true;
  knowledge.identifiedAsOccult = definition.revealsOccult;
  knowledge.inspectedDay = s.day;
  knowledge.inspectedHour = s.hour;
  if (!knowledge.knownInfo.includes(definition.result)) knowledge.knownInfo.push(definition.result);
  addLog(s, `灵视检视：${definition.result}`, definition.corruptionCost || (definition.sanityCost ?? 0) >= 3 ? 'bad' : 'info');
  return { ok: true, outcome: 'passed' };
}

export function getInventoryEntries(s: GameState): {
  kind: 'item' | 'book';
  id: string;
  category: ItemCategory;
  name: string;
  description: string;
  quantity: number;
  knownInfo: string[];
  actions: { spiritVision: boolean; divination: boolean; read: boolean };
}[] {
  const itemTargets = new Set(getDivinationTargets(s).filter(target => target.kind === 'item').map(target => target.id));
  const items = Object.entries(s.items).flatMap(([id, quantity]) => {
    if (quantity <= 0) return [];
    const definition = findItem(id);
    const presentation = itemPresentation(s, id);
    if (!definition || !presentation) return [];
    const knowledge = s.itemKnowledge?.[id];
    const occultKnown = knowledge?.identifiedAsOccult === true || !!successfulItemDivination(s, id);
    const category: ItemCategory = definition.category === 'occult' && !occultKnown ? 'misc' : definition.category;
    return [{
      kind: 'item' as const, id, category, name: presentation.name, description: presentation.description,
      quantity, knownInfo: [...(knowledge?.knownInfo ?? [])],
      actions: {
        spiritVision: hasSpiritVisionAbility(s) && !!definition.spiritVision && !knowledge?.spiritVisionInspected,
        divination: itemTargets.has(id), read: false,
      },
    }];
  });
  const books = Object.values(s.books).flatMap(book => {
    if (!book.acquired) return [];
    const definition = BOOK_DEFS.find(candidate => candidate.id === book.bookId);
    if (!definition) return [];
    return [{
      kind: 'book' as const, id: book.bookId, category: definition.category as ItemCategory,
      name: definition.title, description: definition.surfaceDesc, quantity: 1,
      knownInfo: [book.completed ? '已经读完' : `阅读进度 ${book.readHours}/${definition.totalHours}小时`],
      actions: { spiritVision: false, divination: false, read: !book.completed },
    }];
  });
  const order: ItemCategory[] = ['tool', 'book', 'misc', 'occult'];
  return [...items, ...books].sort((left, right) => order.indexOf(left.category) - order.indexOf(right.category));
}

export function locationRiskPresentation(s: GameState, locationId: string): string {
  const insight = [...(s.divinationInsights ?? [])].reverse().find(record => record.targetKind === 'location'
    && record.targetId === locationId && (record.outcome === 'omen' || record.outcome === 'hint'));
  if (insight) return `征兆：${insight.text}`;
  if (hasVisitedLocation(s, locationId)) return '你已亲历此地；现有经验提醒你预留退路。';
  return '危险性尚未确认';
}

function hasSeerDivinationSequence(s: GameState): boolean {
  return s.pathwayId === 'seer' && s.sequence !== null && s.sequence >= 1 && s.sequence <= 9;
}

function grantSeerDivinationTraining(s: GameState) {
  if (!hasSeerDivinationSequence(s)) return;
  s.divinationTraining.cards = true;
  s.divinationTraining.dream = true;
  if (!s.divinationTraining.media.includes('symbol_cards')) s.divinationTraining.media.push('symbol_cards');
  if (!s.divinationTraining.teachers.includes('formal_seer_training')) s.divinationTraining.teachers.push('formal_seer_training');
  s.items.symbol_cards = Math.max(1, s.items.symbol_cards ?? 0);
  addDivinationTrainingCredential(s, 'formal_seer_training', 'cards');
  addDivinationTrainingCredential(s, 'formal_seer_training', 'dream');
  if (!s.knowledge.includes('spirit_vision')) s.knowledge.push('spirit_vision');
}

function hasTrustedNelsonDivinationRelationship(s: GameState): boolean {
  return !!findAnyNPC(s, 'nelson') && isMet(s, 'nelson') && (s.relations.nelson ?? -100) >= VISIT_FAVOR;
}

function hasOfficialEvelynDivinationRelationship(s: GameState): boolean {
  return !!findAnyNPC(s, 'evelyn') && isMet(s, 'evelyn')
    && (s.awareness === 'informed' || organizationRoute(s, 'nightwatch').status !== 'unknown' || !!s.flags.church_noticed);
}

function hasTrustedCardDivinationTraining(s: GameState): boolean {
  if (!s.divinationTraining.cards || !s.divinationTraining.media.includes('symbol_cards')) return false;
  const formalSeerTraining = hasSeerDivinationSequence(s)
    && s.divinationTraining.teachers.includes('formal_seer_training')
    && hasDivinationTrainingCredential(s, 'formal_seer_training', 'cards');
  const nelsonTraining = s.divinationTraining.teachers.includes('nelson')
    && hasDivinationTrainingCredential(s, 'nelson', 'cards');
  return formalSeerTraining || nelsonTraining;
}

function recordedDivinationProviderAllowed(s: GameState, provider: DivinationProvider, method: DivinationMethod, target: DivinationTargetDef, day: number, hour: number): boolean {
  if (provider === 'self') {
    return method === 'cards'
      ? hasTrustedCardDivinationTraining(s)
      : hasTrustedSeerSpiritVisionSource(s) && s.divinationTraining.dream;
  }
  if (provider === 'nelson') return method === 'cards'
    && hasDivinationConsultationCredential(s, provider, target.kind, target.id, method, day, hour);
  return method === 'cards' && (target.id === 'old_tower' || target.id === 'anomaly_evidence')
    && hasDivinationConsultationCredential(s, provider, target.kind, target.id, method, day, hour);
}

export function learnCardDivinationIssue(s: GameState): string | null {
  if (s.atWork) return '需先下班离开工作地点。';
  if (hasTrustedCardDivinationTraining(s)) return '你已经掌握了这套安全纸牌方法。';
  const trust = trustedNpcIssue(s, 'nelson');
  if (trust) return trust;
  if (s.stats.energy < energyCost(s, 8) + 5) return '你现在太疲惫，难以记牢完整的象征次序。';
  return null;
}

export function learnCardDivination(s: GameState): ActionResult {
  const issue = learnCardDivinationIssue(s);
  if (issue) return { ok: false, msg: issue };
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, 8) }]);
  advanceHours(s, 2);
  s.divinationTraining.cards = true;
  if (!s.divinationTraining.media.includes('symbol_cards')) s.divinationTraining.media.push('symbol_cards');
  if (!s.divinationTraining.teachers.includes('nelson')) s.divinationTraining.teachers.push('nelson');
  s.items.symbol_cards = Math.max(1, s.items.symbol_cards ?? 0);
  addDivinationTrainingCredential(s, 'nelson', 'cards');
  addLog(s, '尼尔逊让你反复练习固定象征的摆放与收牌顺序，并明确划出不可越过的边界。你带走一副旧纸牌；它只能给出微弱、含混的启示。', 'good');
  return { ok: true };
}

function providerIssue(s: GameState, provider: DivinationProvider, method: DivinationMethod, target: DivinationTargetDef): string | null {
  if (s.atWork) return '需先下班离开工作地点。';
  if (provider === 'self') {
    if (method === 'cards') {
      if (!hasTrustedCardDivinationTraining(s) || (s.items.symbol_cards ?? 0) <= 0) {
        return '你尚未接受可信教学并准备固定象征纸牌。';
      }
    } else if (!(hasTrustedSeerSpiritVisionSource(s) && s.divinationTraining.dream)) {
      return '只有完成正式训练的占卜家才能独自进行梦境占卜。';
    }
  } else if (provider === 'nelson') {
    const issue = trustedNpcIssue(s, 'nelson');
    if (issue) return issue;
    if (s.pence < 24) return '你付不起尼尔逊这次代占的费用。';
    if (method !== 'cards') return '尼尔逊只愿意提供边界清楚的纸牌代占。';
  } else {
    const evelyn = findAnyNPC(s, 'evelyn');
    if (!evelyn || !isMet(s, 'evelyn')) return '你尚未与负责异常事务的教会执事建立联系。';
    if (!npcAvailable(evelyn, s.day, s.hour)) return '伊芙琳此刻不在圣赛琳娜教堂。';
    if (!hasOfficialEvelynDivinationRelationship(s)) return '教会尚未把你或这件事纳入正式异常记录。';
    if (!(target.id === 'old_tower' || target.id === 'anomaly_evidence')) return '这不属于伊芙琳会受理的官方异常或证物范围。';
    if (method !== 'cards') return '官方记录室采用的是受控象征核验。';
  }
  if (s.stats.energy < energyCost(s, provider === 'self' ? 8 : 5) + 5) return '你现在太疲惫，无法完成一轮专注核验。';
  return null;
}

export function divinationIssue(s: GameState, targetKind: DivinationTargetKind, targetId: string, method: DivinationMethod, provider: DivinationProvider): string | null {
  const target = divinationTarget(s, targetKind, targetId);
  if (!target) return genericDivinationTargetIssue;
  return providerIssue(s, provider, method, target);
}

function divinationScore(s: GameState, target: DivinationTargetDef, method: DivinationMethod, provider: DivinationProvider): number {
  let score = provider === 'self'
    ? s.stats.spi + (s.skills.occult ?? 0) * 4 + (method === 'dream' ? 10 : 5)
    : provider === 'nelson' ? 36 : 48;
  if (provider === 'self' && s.divinationTraining.media.includes('symbol_cards') && method === 'cards') score += 4;
  if (target.id === 'old_tower') {
    if (hasClue(s, 'clocktower_public_complaints')) score += 4;
    if (hasClue(s, 'clocktower_repair_orders')) score += 8;
  }
  if (target.id === 'cryptic_note' && hasClue(s, 'cryptic_note_warning')) score += 6;
  if (s.stats.san < 45) score -= 8;
  if (s.stats.cor >= 30) score -= 8;
  if (s.flags.jammed) score -= 20;
  return score;
}

export function evaluateDivination(s: GameState, targetKind: DivinationTargetKind, targetId: string, method: DivinationMethod, provider: DivinationProvider): { outcome: DivinationOutcome; score: number } | null {
  const target = divinationTarget(s, targetKind, targetId);
  if (!target || providerIssue(s, provider, method, target)) return null;
  const score = divinationScore(s, target, method, provider);
  if (s.flags.jammed) return { outcome: 'obscured', score };
  if (score >= target.difficulty) return { outcome: targetKind === 'location' ? 'omen' : 'hint', score };
  if (target.antiDivination && score >= target.difficulty - 6) return { outcome: 'obscured', score };
  if (method === 'dream' || target.pressure === 'high') return { outcome: 'backlash', score };
  return { outcome: 'inconclusive', score };
}

export function performDivination(s: GameState, targetKind: DivinationTargetKind, targetId: string, method: DivinationMethod, provider: DivinationProvider): ActionResult {
  const target = divinationTarget(s, targetKind, targetId);
  if (!target) return { ok: false, msg: genericDivinationTargetIssue };
  const issue = providerIssue(s, provider, method, target);
  if (issue) return { ok: false, msg: issue };
  const result = evaluateDivination(s, targetKind, targetId, method, provider)!;
  const cost = provider === 'self' ? 8 : 5;
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, cost) }]);
  if (provider === 'nelson') applyEffects(s, [{ k: 'money', v: -24 }]);
  advanceHours(s, method === 'dream' ? 4 : 2);
  const text = canonicalDivinationText(target, method, provider, result.outcome);
  if (result.outcome === 'backlash') {
    applyEffects(s, [{ k: 'san', v: -6 }, { k: 'cor', v: 3 }]);
  }
  if (provider === 'evelyn') {
    s.flags.official_divination_record = true;
  }
  const attempt: DivinationAttempt = { targetKind, targetId, method, provider, outcome: result.outcome, day: s.day, hour: s.hour, score: result.score };
  if (provider === 'nelson' || provider === 'evelyn') {
    addDivinationConsultationCredential(s, provider, targetKind, targetId, method, attempt.day, attempt.hour);
  }
  s.divinationAttempts.push(attempt);
  const insight: DivinationInsight = {
    id: `divination:${s.day}:${s.hour}:${s.divinationAttempts.length}`, targetKind, targetId, method, provider,
    outcome: result.outcome, text, day: s.day, hour: s.hour,
  };
  if ((result.outcome === 'omen' || result.outcome === 'hint') && target.clueId) {
    acquireClue(s, target.clueId, provider === 'self' ? 'event' : 'npc', `divination:${provider}`);
    insight.clueId = target.clueId;
    if (target.clueId === 'cryptic_note_warning') forceEvent(s, 'divination_note_echo');
  }
  if ((result.outcome === 'omen' || result.outcome === 'hint') && targetKind === 'item') {
    const item = findItem(targetId);
    if (item?.category === 'occult') itemKnowledgeState(s, targetId).identifiedAsOccult = true;
  }
  s.divinationInsights.push(insight);
  addLog(s, `占卜记录：${text}`, result.outcome === 'backlash' ? 'bad' : result.outcome === 'inconclusive' || result.outcome === 'obscured' ? 'info' : 'good');
  return { ok: true, outcome: result.outcome === 'omen' || result.outcome === 'hint' ? 'passed' : 'blocked' };
}
/** 结交事件：与陌生人正式相识（叙事由调用方补充） */
export function acquaint(s: GameState, id: string, base: number) {
  if (isMet(s, id)) return;
  applyEffects(s, [{ k: 'favor', id, v: base }]);
}
function energyCost(s: GameState, base: number): number {
  return Math.round(base * (hasTalent(s, 'night_owl') && isNight(s.hour) ? 0.7 : 1));
}

function trustedNpcIssue(s: GameState, npcId: string, minFavor = VISIT_FAVOR): string | null {
  const npc = findAnyNPC(s, npcId);
  if (!npc) return '找不到负责这条线索的人。';
  if (!isMet(s, npcId)) return `你还没有与${npc.name}正式结识。`;
  if ((s.relations[npcId] ?? -100) < minFavor) return `${npc.name}还没有信任你到愿意谈及敏感背景的程度。`;
  if (!npcAvailable(npc, s.day, s.hour)) return `${npc.name}此刻不在可交谈的地点；请按其作息另约时间。`;
  return null;
}

function recordLocationCompletion(s: GameState, locationId: string) {
  s.visitedLocations ??= [];
  if (!s.visitedLocations.includes(locationId)) s.visitedLocations.push(locationId);
  // 码头只记录实地到访；异常仓单必须通过后续调查取得。
  if (locationId === 'docks') return;
  const orgId = locationId === 'manor' ? 'abraham_branch' : null;
  if (!orgId || isBeyonder(s)) return;
  const def = leadDefForOrganization(orgId);
  const lead = def && s.leads[def.id];
  if (!def || !lead || lead.stage !== 'unknown') return;
  lead.stage = 'found';
  lead.notes.push(`在${def.place}完成实地调查后发现：${def.publicLabel}`);
  recordOrganizationRoute(s, orgId, `world_entry:${def.id}`, 'passed', locationId);
  if (orgId === 'abraham_branch' && !s.formulas.includes('apprentice9')) {
    s.formulas.push('apprentice9');
    pathwayLead(s, 'apprentice').formulaStatus = 'unverified';
    lead.notes.push('门框夹层中另有一份完整但未经鉴定的学徒配方抄本');
  }
  addLog(s, `✦ 实地调查记录：你发现了【${def.publicLabel}】。目前只能确认它值得辨认，尚不知道背后牵涉何方。`, 'event');
}

// ============ 初始状态（普通人开局，出身+天赋+随机城市人口） ============
export function newGame(name: string, originId: string, talents: string[]): GameState {
  const origin = ORIGINS.find(o => o.id === originId) ?? ORIGINS[0];
  const genNpcs: GenNPC[] = [];
  for (let i = 0; i < 8; i++) genNpcs.push(generateNPC());
  const s: GameState = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    started: true,
    playerName: name || '无名者',
    originId: origin.id,
    talents,
    pathwayId: null,
    sequence: null,
    day: 1,
    hour: 7,
    stats: { phy: 20, spi: 10, mnd: 20, cha: 20, san: 85, cor: 0, energy: 90 },
    pence: origin.pence,
    digestion: 0,
    exposure: 0,
    formulas: [],
    canReadRoselleScript: true,
    leads: createStructuredLeads(),
    organizationRoutes: createOrganizationRoutes(),
    diaryPages: createDiaryPages(),
    materialSources: createMaterialSources(),
    sequence8Progress: null,
    visitedLocations: [],
    currentLocation: null,
    completedLocationActions: [],
    locationRelations: {},
    landmarkIntroductions: [],
    landmarkEncounters: [],
    clues: [],
    explorationAttempts: [],
    divinationTraining: { cards: false, dream: false, media: [], teachers: [] },
    divinationCredentials: [],
    divinationInsights: [],
    divinationAttempts: [],
    books: createBooks(),
    languages: { ruen: 'fluent', old_feysac: 'none' },
    awareness: 'ordinary',
    pathwayLeads: createPathwayLeads(),
    items: { ...(origin.items ?? {}) },
    itemKnowledge: {},
    intel: [...(origin.intel ?? [])],
    knowledge: [...(origin.knowledge ?? [])],
    studyProgress: 0,
    jobId: origin.initialJobId ?? null,
    atWork: false,
    skills: { investigate: 0, combat: 0, speech: 0, occult: 0, sneak: 0 },
    nemesis: null,
    relations: {},
    tags: [...(origin.tags ?? [])],
    flags: {},
    timers: [
      {
        id: 'rent', label: '房租（玛尔塔婶婶）', hoursLeft: 7 * 24,
        effect: [{ k: 'flag', id: 'rent_due', v: 1 }], renewHours: 7 * 24,
      },
      { id: 'audit', label: '教会季度审查', hoursLeft: 30 * 24, effect: [{ k: 'flag', id: 'audit_now', v: 1 }], renewHours: 30 * 24 },
      { id: 'market', label: '黑市集会日', hoursLeft: 2 * 24, effect: [], renewHours: 3 * 24 },
    ],
    genNpcs,
    board: [],
    activeCommission: null,
    log: [],
    pendingEvent: null,
    pendingNpc: null,
    firedOnce: [],
    eventCounter: 0,
    recentEventVariants: {},
    forcedEventQueue: [],
    gameOver: null,
  };
  // 人脉：初始只认识房东婶婶与出身自带的关系；其余皆需「结交事件」开启
  s.relations.martha = 6;
  for (const [k, v] of Object.entries(origin.statMods)) {
    const key = k as keyof typeof s.stats;
    s.stats[key] = clamp(s.stats[key] + (v ?? 0));
  }
  for (const [npc, f] of Object.entries(origin.favors ?? {})) s.relations[npc] = f;
  if (origin.id === 'orphan') {
    const churchBook = s.books.church_festivals_excerpt;
    churchBook.acquired = true;
    churchBook.acquiredDay = 1;
    churchBook.acquiredHour = 7;
    churchBook.readHours = BOOK_DEFS.find(book => book.id === churchBook.bookId)!.totalHours;
    churchBook.completed = true;
    if (!s.knowledge.includes('church_liturgy')) s.knowledge.push('church_liturgy');
  }
  if (talents.includes('spirit_affinity')) s.stats.spi = clamp(s.stats.spi + 5);
  if (talents.includes('sixth_sense')) s.stats.spi = clamp(s.stats.spi + 3);
  if (talents.includes('strong_body')) s.stats.phy = clamp(s.stats.phy + 6);

  addLog(s, `第1天清晨，你在东区的阁楼里睁开眼。【${origin.name}】——${origin.desc}`, 'system');
  const initialJob = findJob(s.jobId);
  if (initialJob) addLog(s, `你目前受雇为【${initialJob.name}】，工作地点在${initialJob.location}。上班前要先安排通勤。`, 'info');
  addLog(s, `全部身家${fmtMoney(origin.pence)}，房租7天后到期。这座雾城表面平静，水面之下却有东西在动……活下去。至于会不会撞上「那个世界」——看机缘。`, 'info');
  addLog(s, '想赚外快就去「醉水手」坐坐——酒馆是这座城市的耳朵，老板麦克什么都听得见。', 'info');
  return s;
}

export function biography(s: GameState): string {
  const o = originOf(s);
  return `${s.playerName}，${o.name}。${o.desc}`;
}

// ============ 日志 ============
export function addLog(s: GameState, text: string, kind: LogEntry['kind'] = 'info') {
  s.log.push({ day: s.day, hour: s.hour, text, kind });
  if (s.log.length > 300) s.log.splice(0, s.log.length - 300);
}

// ============ 金钱格式化 ============
export function fmtMoney(pence: number): string {
  const sign = pence < 0 ? '−' : '';
  const abs = Math.abs(pence);
  const pounds = Math.floor(abs / 240);
  const soli = Math.floor((abs % 240) / 12);
  const p = abs % 12;
  const parts: string[] = [];
  if (pounds) parts.push(`${pounds}镑`);
  if (soli) parts.push(`${soli}苏勒`);
  if (p || !parts.length) parts.push(`${p}便士`);
  return sign + parts.join('');
}

export const isBeyonder = (s: GameState) => s.pathwayId !== null;
export const isAtHome = (s: GameState) => !s.atWork && !s.currentLocation;

// ============ 条件检查 ============
export function checkCond(s: GameState, cond?: string): boolean {
  if (!cond) return true;
  return cond.split('&').every(c => checkSingle(s, c.trim()));
}
function checkSingle(s: GameState, c: string): boolean {
  if (c.includes('|')) return c.split('|').some(x => checkSingle(s, x.trim())); // 或条件
  if (c === 'mortal') return !isBeyonder(s);
  if (c === 'beyonder') return isBeyonder(s);
  if (c.startsWith('intel:')) return s.intel.includes(c.slice(6));
  if (c.startsWith('clue:')) return hasClue(s, c.slice(5));
  if (c.startsWith('item:')) return (s.items[c.slice(5)] ?? 0) > 0;
  if (c.startsWith('not-item:')) return (s.items[c.slice(9)] ?? 0) <= 0;
  if (c.startsWith('knowledge:')) return s.knowledge.includes(c.slice(10));
  if (c.startsWith('not-knowledge:')) return !s.knowledge.includes(c.slice(14));
  if (c.startsWith('tag:')) return s.tags.includes(c.slice(4));
  if (c.startsWith('flag:')) return !!s.flags[c.slice(5)];
  if (c.startsWith('formula:')) return s.formulas.includes(c.slice(8));
  const m = c.match(/^(\w+)(?::(\w+))?\s*(>=|<=|>|<|==)\s*(-?\d+)$/);
  if (!m) return true;
  const [, key, sub, op, raw] = m;
  const target = Number(raw);
  let val = 0;
  if (key === 'money') val = s.pence;
  else if (key === 'digestion') val = s.digestion;
  else if (key === 'exposure') val = s.exposure;
  else if (key === 'favor' && sub) val = s.relations[sub] ?? 0;
  else if (key === 'skill' && sub) val = s.skills[sub as SkillKey] ?? 0;
  else if (key in s.stats) val = s.stats[key as keyof typeof s.stats];
  else return true;
  switch (op) {
    case '>=': return val >= target;
    case '<=': return val <= target;
    case '>': return val > target;
    case '<': return val < target;
    case '==': return val === target;
  }
  return true;
}

// ============ 效果应用（含天赋/出身修正） ============
export function applyEffects(s: GameState, effects: Effect[]): AppliedEffectReceipt[] {
  const receipts: AppliedEffectReceipt[] = [];
  for (const e of effects) {
    let v = e.v ?? 0;
    const receipt: AppliedEffectReceipt = { effect: e, applied: false };
    const recordNumber = (before: number, after: number) => {
      receipt.before = before;
      receipt.after = after;
      receipt.actualDelta = after - before;
      receipt.applied = before !== after;
    };
    switch (e.k) {
      case 'money': {
        const before = s.pence;
        s.pence += v;
        recordNumber(before, s.pence);
        break;
      }
      case 'energy': {
        const before = s.stats.energy;
        s.stats.energy = clamp(s.stats.energy + v);
        recordNumber(before, s.stats.energy);
        break;
      }
      case 'san':
        receipt.before = s.stats.san;
        if (v < 0 && hasTalent(s, 'iron_nerves')) v = Math.ceil(v * 0.75);
        s.stats.san = clamp(s.stats.san + v);
        receipt.after = s.stats.san;
        receipt.actualDelta = s.stats.san - Number(receipt.before);
        receipt.applied = receipt.actualDelta !== 0;
        break;
      case 'cor': {
        const before = s.stats.cor;
        s.stats.cor = clamp(s.stats.cor + v);
        recordNumber(before, s.stats.cor);
        break;
      }
      case 'digestion': {
        const before = s.digestion;
        s.digestion = clamp(s.digestion + v);
        recordNumber(before, s.digestion);
        break;
      }
      case 'exposure': {
        const before = s.exposure;
        const mult = originOf(s).exposureMult ?? 1;
        s.exposure = clamp(s.exposure + (v > 0 ? Math.ceil(v * mult) : v));
        recordNumber(before, s.exposure);
        break;
      }
      case 'stat': {
        if (e.stat) {
          const before = s.stats[e.stat];
          s.stats[e.stat] = clamp(s.stats[e.stat] + v, 1);
          recordNumber(before, s.stats[e.stat]);
        }
        break;
      }
      case 'item': {
        if (e.id) {
          const before = s.items[e.id] ?? 0;
          s.items[e.id] = Math.max(0, before + v);
          recordNumber(before, s.items[e.id]);
          if (receipt.applied) {
            const itemName = findItem(e.id)?.name ?? e.id;
            receipt.summary = `${(receipt.actualDelta ?? 0) > 0 ? '获得' : '失去'}物品：${itemName} ×${Math.abs(receipt.actualDelta ?? 0)}`;
          }
        }
        break;
      }
      case 'favor':
        if (e.id) {
          const before = s.relations[e.id] ?? 0;
          if (v > 0 && hasTalent(s, 'silver_tongue')) v = Math.ceil(v * 1.5);
          s.relations[e.id] = clamp((s.relations[e.id] ?? 0) + v, -100);
          recordNumber(before, s.relations[e.id]);
        }
        break;
      case 'intel':
        if (e.id) {
          receipt.before = s.intel.includes(e.id);
          if (!receipt.before) s.intel.push(e.id);
          receipt.after = s.intel.includes(e.id);
          receipt.applied = receipt.before !== receipt.after;
        }
        break;
      case 'clue':
        if (e.id) {
          receipt.before = hasClue(s, e.id);
          if (!receipt.before) acquireClue(s, e.id);
          receipt.after = hasClue(s, e.id);
          receipt.applied = receipt.before !== receipt.after;
        }
        break;
      case 'knowledge':
        if (e.id) {
          receipt.before = s.knowledge.includes(e.id);
          if (!receipt.before) s.knowledge.push(e.id);
          receipt.after = s.knowledge.includes(e.id);
          receipt.applied = receipt.before !== receipt.after;
          if (receipt.applied) receipt.summary = `获得知识：${KNOWLEDGE_NAMES[e.id] ?? e.id}`;
        }
        break;
      case 'skill':
        if (e.skill) {
          const before = s.skills[e.skill] ?? 0;
          s.skills[e.skill] = clamp(before + v, 0, 10);
          recordNumber(before, s.skills[e.skill]);
          if (receipt.applied) receipt.summary = `${SKILL_NAMES[e.skill] ?? e.skill}：Lv.${before} → Lv.${s.skills[e.skill]}`;
        }
        break;
      case 'formula':
        // random9 是旧版捷径：环境事件不得随机生成可服食的完整配方。
        if (e.id && e.id !== 'random9' && !s.formulas.includes(e.id)) {
          s.formulas.push(e.id);
          if (!isBeyonder(s)) {
            const pathway = PATHWAYS.find(candidate => e.id!.startsWith(candidate.id));
            if (pathway) pathwayLead(s, pathway.id).formulaStatus = 'unverified';
          }
          receipt.applied = true;
        }
        break;
      case 'tag':
        if (e.id) {
          if (e.on === false) s.tags = s.tags.filter(t => t !== e.id);
          else if (!s.tags.includes(e.id)) s.tags.push(e.id);
          receipt.applied = true;
        }
        break;
      case 'timer':
        if (e.id && !s.timers.some(t => t.id === e.id)) {
          s.timers.push({ id: e.id, label: e.timerLabel ?? e.id, hoursLeft: e.timerHours ?? 24, effect: e.timerEffect ?? [] });
          receipt.applied = true;
        }
        break;
      case 'commission': {
        const c = generateCommission(s);
        if (s.board.length >= 5) s.board.shift(); // 线索簿最多记5桩
        s.board.push(c);
        const client = findAnyNPC(s, c.client);
        addLog(s, `✦ 打听到一桩差事：「${c.title}」（委托人：${client?.name ?? '?'}，${c.daysLeft}天内有效）`, 'good');
        receipt.applied = true;
        break;
      }
      case 'flag':
        if (e.id) {
          s.flags[e.id] = e.v ?? 1;
          receipt.applied = true;
          // 私吞析出特性 → 可能引来死者的同门复仇
          if (e.id === 'loot_char' && e.v === 1 && !s.nemesis && rnd(100) < 40) {
            s.nemesis = spawnNemesis(s, 'revenge');
            addLog(s, '⚠️ 你隐约听说有人在黑市打听「那具尸体的东西落到谁手里了」。麻烦找上门了。', 'bad');
          }
        }
        break;
      case 'gameover': break;
    }
    receipts.push(receipt);
  }
  return receipts;
}

// ============ 时间推进 ============
/**
 * 世界日程可以在内部持续推进，但只有掌握了可靠来源的角色才能看到精确倒计时。
 * 未列入隐秘日程的生活义务与玩家主动接受的期限默认可见。
 */
export function isTimerVisible(s: GameState, timerId: string): boolean {
  if (timerId === 'market') {
    const route = s.organizationRoutes?.iron_and_blood;
    return !!route && ['contacted', 'qualified', 'member', 'offer_pending', 'committed'].includes(route.status);
  }
  if (timerId === 'audit') {
    const route = s.organizationRoutes?.nightwatch;
    return s.originId === 'orphan'
      || s.jobId === 'church_copyist'
      || s.intel.includes('church_audit')
      || s.tags.some(tag => ['registered', 'night_watcher', 'nightwatch_candidate'].includes(tag))
      || (isMet(s, 'evelyn') && (s.relations.evelyn ?? -100) >= VISIT_FAVOR)
      || (!!route && route.status !== 'unknown');
  }
  return true;
}

export function getVisibleTimers(s: GameState): Timer[] {
  return s.timers.filter(timer => isTimerVisible(s, timer.id));
}

export function advanceHours(s: GameState, hours: number) {
  for (let i = 0; i < hours; i++) {
    s.hour++;
    if (s.hour >= 24) {
      s.hour = 0;
      s.day++;
      dailySettlement(s);
    }
    tickTimers(s);
    if (s.gameOver) return;
  }
  checkGameOver(s);
}

function tickTimers(s: GameState) {
  for (const t of s.timers) {
    t.hoursLeft--;
    if (t.hoursLeft <= 0) {
      const visibleWhenDue = isTimerVisible(s, t.id);
      if (visibleWhenDue) addLog(s, `⏳【${t.label}】到期了。`, 'bad');
      applyEffects(s, t.effect);
      resolveTimerFlags(s, t.id, visibleWhenDue);
      if (t.renewHours) t.hoursLeft = t.renewHours;
      else s.timers = s.timers.filter(x => x.id !== t.id);
    }
  }
}

function resolveTimerFlags(s: GameState, timerId: string, visibleWhenDue: boolean) {
  if (timerId === 'rent' && s.flags.rent_due) {
    s.flags.rent_due = 0;
    if (s.pence >= 240) {
      s.pence -= 240;
      addLog(s, '玛尔塔婶婶准时来收租。你交出1镑，钱袋顿时瘪了下去。', 'bad');
    } else if (s.relations.martha >= 30) {
      s.relations.martha -= 15;
      addLog(s, '你付不起房租。玛尔塔婶婶看了你很久：「……宽限一周。就一周。」她显然非常失望。', 'bad');
    } else {
      s.tags.push('homeless');
      addLog(s, '你付不起房租，行李被扔到了街上。【无家可归】：露宿让你很难真正休息好。', 'bad');
    }
  }
  if (timerId === 'market' && visibleWhenDue && isBeyonder(s)) {
    forceEvent(s, 'secret_gathering');
  }
  if (timerId === 'audit' && s.flags.audit_now) {
    s.flags.audit_now = 0;
    if (!isBeyonder(s)) {
      if (visibleWhenDue) addLog(s, '教会审查季到了。普查表格、例行问询——对普通人来说只是烦琐的官样文章。', 'system');
    } else if (s.exposure >= 50 || s.flags.church_suspect) {
      addLog(s, '⚠️ 教会审查季。你的名字显然已在值夜者的名单上……', 'bad');
      forceEvent(s, 'nighthawk_visit');
    } else {
      s.exposure = clamp(s.exposure + 3);
      if (visibleWhenDue) addLog(s, '教会审查平稳过去。你的伪装还没破——但档案里关于你的记录又厚了一页。', 'system');
    }
  }
}

/** 每日 00:00 世界推进 */
function dailySettlement(s: GameState) {
  const meal = originOf(s).mealCost ?? 6;
  if (s.pence >= meal) { s.pence -= meal; }
  else { s.stats.san = clamp(s.stats.san - 5); addLog(s, '你没钱吃饭。饥饿啃噬着你的胃，也让思绪越来越阴沉。', 'bad'); }
  if (s.stats.cor >= 70) {
    addLog(s, '⚠️ 污染在你体内低语。失控的边缘越来越近……', 'bad');
    if (rnd(100) < 25) { s.stats.san = clamp(s.stats.san - 6); addLog(s, '你在镜子里看到自己的影子慢了半拍。那一幕久久无法从脑海里消失。', 'bad'); }
  }
  if (s.pathwayId === 'sleepless' && rnd(100) < 50) s.stats.cor = clamp(s.stats.cor + 1);
  if (isBeyonder(s) && s.stats.cor >= 70) s.exposure = clamp(s.exposure + 2);

  // 宿敌的日常骚扰
  nemesisDaily(s);
  // 诅咒缠身：每日侵蚀
  if (s.tags.includes('cursed')) {
    applyEffects(s, [{ k: 'san', v: -3 }]);
    addLog(s, '黑猫的诅咒仍在：整日耳鸣、心悸、噩兆连连。你恐怕得找懂行的人解除它。', 'bad');
  }
  // 占卜干扰倒计时
  if (typeof s.flags.jammed === 'number' && s.flags.jammed > 0) s.flags.jammed = (s.flags.jammed as number) - 1;
  // 高污染招来呓语之主
  if (s.stats.cor >= 80) forceEvent(s, 'true_creator_whispers');

  // 打听到的差事有保鲜期：每日衰减，过期作废
  if (s.board.length) {
    const before = s.board.length;
    for (const c of s.board) c.daysLeft--;
    s.board = s.board.filter(c => c.daysLeft > 0);
    if (s.board.length < before) addLog(s, '有几桩打听到的差事拖太久，已经凉了——委托人另找了别人。', 'system');
  }
  // 已接委托倒计时
  if (s.activeCommission) {
    s.activeCommission.daysLeft--;
    if (s.activeCommission.daysLeft <= 0) {
      const client = findAnyNPC(s, s.activeCommission.client);
      addLog(s, `⏳ 委托「${s.activeCommission.title}」超期了。${client?.name ?? '委托人'}很失望。`, 'bad');
      applyEffects(s, [{ k: 'favor', id: s.activeCommission.client, v: -6 }]);
      s.activeCommission = null;
      s.board = s.board.filter(commission => isLocationUnlocked(s, commission.locationId)
        && !!LOCATIONS.find(location => location.id === commission.locationId)?.actions.includes('explore'));
    }
  }
  // NPC 际遇骰：生成池 NPC 的日常生活
  if (s.genNpcs.length && rnd(100) < 20) {
    const npc = s.genNpcs[rnd(s.genNpcs.length)];
    const fortune = [
      `${npc.name}（${npc.identity}）最近似乎手头宽裕了些。`,
      `听说${npc.name}病了两天，${npc.schedule[0].location}没见到人。`,
      `${npc.name}和人吵了一架，起因似乎是「${npc.motive}」。`,
    ];
    addLog(s, `👥 ${fortune[rnd(fortune.length)]}`, 'system');
  }

  const news = [
    '《廷根市诚实报》：东区雾气持续，市政厅提醒市民减少夜间出行。',
    '《塔索克报》：码头工会与资方谈判破裂，罢工一触即发。',
    '《廷根市诚实报》：又一起失踪案，家属仍在等待治安部门的公开进展。',
    '《每日观察报》：黑面粉价格上涨，贫民区动荡加剧。',
  ];
  addLog(s, `📰 ${news[rnd(news.length)]}`, 'system');
  maybeTrigger(s, 'daily');
}

// ============ 事件系统 ============
const GENERATED_EFFECT_KINDS = new Set<Effect['k']>(['item', 'knowledge', 'skill']);

function validGeneratedBlueprint(blueprint: EventBlueprint): boolean {
  return blueprint.choices.every(choice => choice.effects.every(effect => {
    if (!GENERATED_EFFECT_KINDS.has(effect.k)) return false;
    if ((effect.k === 'item' || effect.k === 'knowledge') && !effect.id) return false;
    if (effect.k === 'skill' && !effect.skill) return false;
    return true;
  }));
}

function cloneEffects(effects: Effect[]): Effect[] {
  return effects.map(effect => ({
    ...effect,
    timerEffect: effect.timerEffect ? cloneEffects(effect.timerEffect) : undefined,
  }));
}

function pickTextVariant(s: GameState, key: string, variants: string[], rng: () => number): string {
  if (!variants.length) throw new Error(`事件文本变体为空：${key}`);
  const recent = s.recentEventVariants[key] ?? [];
  const unused = variants.map((_, index) => index).filter(index => !recent.includes(index));
  const candidates = unused.length ? unused : variants.map((_, index) => index);
  const rawIndex = Math.floor(rng() * candidates.length);
  const picked = candidates[Math.max(0, Math.min(candidates.length - 1, rawIndex))];
  s.recentEventVariants[key] = [...recent, picked].slice(-2);
  return variants[picked];
}

/** 从蓝图一次性固化完整事件；可注入随机源以进行确定性测试。 */
export function instantiateEventBlueprint(
  s: GameState,
  blueprint: EventBlueprint,
  context: EventInstanceContext,
  rng: () => number = Math.random,
): EventInstance {
  if (!validGeneratedBlueprint(blueprint)) throw new Error(`随机文本事件包含非确定性效果：${blueprint.id}`);
  s.eventCounter = (s.eventCounter ?? 0) + 1;
  s.recentEventVariants ??= {};
  const instanceId = `event_${s.eventCounter}`;
  const choices = blueprint.choices.map((choice, index) => ({
    text: pickTextVariant(s, `${blueprint.id}:choice:${index}:text`, choice.textVariants, rng),
    cond: choice.cond,
    effects: cloneEffects(choice.effects),
    result: pickTextVariant(s, `${blueprint.id}:choice:${index}:result`, choice.resultVariants, rng),
  }));
  return {
    id: instanceId,
    source: 'generated',
    instanceId,
    blueprintId: blueprint.id,
    contentVersion: blueprint.contentVersion,
    slot: blueprint.slot,
    weight: blueprint.weight,
    cond: blueprint.cond,
    locations: blueprint.locations ? [...blueprint.locations] : undefined,
    npc: blueprint.npc,
    once: blueprint.once,
    title: pickTextVariant(s, `${blueprint.id}:title`, blueprint.titleVariants, rng),
    text: pickTextVariant(s, `${blueprint.id}:text`, blueprint.textVariants, rng),
    choices,
    effects: choices.map(choice => cloneEffects(choice.effects)),
    context: { ...context },
  };
}

type EventCandidate =
  | { kind: 'static'; event: GameEvent }
  | { kind: 'generated'; event: EventBlueprint };

export function maybeTrigger(s: GameState, slot: string, npcId?: string, locationId?: string): boolean {
  if (s.pendingEvent) return false;
  const staticPool: EventCandidate[] = EVENTS.filter(e => {
    if (e.slot !== slot) return false;
    if (npcId && e.npc !== npcId) return false;
    if (!npcId && e.npc) return false;
    if (e.locations && locationId && !e.locations.includes(locationId)) return false;
    if (e.once && s.firedOnce.includes(e.id)) return false;
    return checkCond(s, e.cond);
  }).map(event => ({ kind: 'static', event }));
  const generatedPool: EventCandidate[] = RANDOM_TEXT_EVENTS.filter(e => {
    if (e.slot !== slot || !validGeneratedBlueprint(e)) return false;
    if (npcId && e.npc !== npcId) return false;
    if (!npcId && e.npc) return false;
    if (e.locations && locationId && !e.locations.includes(locationId)) return false;
    if (e.once && s.firedOnce.includes(e.id)) return false;
    return checkCond(s, e.cond);
  }).map(event => ({ kind: 'generated', event }));
  const pool = [...staticPool, ...generatedPool];
  if (!pool.length) return false;
  const total = pool.reduce((a, candidate) => a + candidate.event.weight, 0);
  let roll = rnd(total);
  let picked: EventCandidate = pool[0];
  for (const candidate of pool) {
    roll -= candidate.event.weight;
    if (roll < 0) { picked = candidate; break; }
  }
  const blueprintId = picked.event.id;
  const rendered = picked.kind === 'generated'
    ? instantiateEventBlueprint(s, picked.event, { slot, npcId, locationId, day: s.day, hour: s.hour })
    : picked.event;
  s.pendingEvent = picked.kind === 'generated' ? rendered as EventInstance : rendered.id;
  s.pendingNpc = npcId ?? null;
  if (picked.event.once) s.firedOnce.push(blueprintId);
  addLog(s, `▶ ${rendered.text}`, 'event');
  return true;
}

function activateStaticEvent(s: GameState, ev: GameEvent) {
  s.pendingEvent = ev.id;
  s.pendingNpc = null;
  if (ev.once && !s.firedOnce.includes(ev.id)) s.firedOnce.push(ev.id);
  addLog(s, `▶ ${ev.text}`, 'event');
}

export function forceEvent(s: GameState, eventId: string) {
  const ev = findEvent(eventId);
  if (!ev) return;
  if (ev.once && s.firedOnce.includes(ev.id)) return;
  if (s.pendingEvent) {
    s.forcedEventQueue ??= [];
    if (!s.forcedEventQueue.includes(eventId)) s.forcedEventQueue.push(eventId);
    return;
  }
  activateStaticEvent(s, ev);
}

function activateNextForcedEvent(s: GameState) {
  while (s.forcedEventQueue?.length && !s.pendingEvent) {
    const eventId = s.forcedEventQueue.shift()!;
    const ev = findEvent(eventId);
    if (!ev || (ev.once && s.firedOnce.includes(ev.id))) continue;
    activateStaticEvent(s, ev);
  }
}

export function resolveChoice(s: GameState, choiceIndex: number) {
  const ev = currentEvent(s);
  if (!ev) return;
  const validChoices = ev.choices.filter(c => checkCond(s, c.cond));
  const choice = validChoices[choiceIndex];
  if (!choice) return;
  applyEffects(s, choice.effects);
  addLog(s, `  → ${choice.result}`, choice.effects.some(e => (e.k === 'san' || e.k === 'cor' || e.k === 'money') && (e.v ?? 0) < 0) ? 'bad' : 'good');
  if (ev.id === 'adv_dock' && choiceIndex < 2) {
    if (s.skills.investigate > 0 || s.skills.occult > 0
      || ['occult_theory', 'archive_method', 'cargo_notation'].some(id => s.knowledge.includes(id))) {
      addLog(s, '你用学过的调查与神秘学常识逐项排除：常见动物、货箱摩擦和走私装卸都解释不完整，但现有记录仍不足以给它命名。', 'info');
    } else {
      addLog(s, '你没有可靠手段判断这些痕迹的来源；只能确认雾边的空气像被看不见的东西挤动过。', 'info');
    }
    addLog(s, '下一步：白天留在码头核对公开失踪登记与货运备份，再追查旧仓单。若带回证物，应先回到安全住处，再自行占卜或请可信者代占；也可以现在撤离，暂缓追查。', 'system');
  }
  s.pendingEvent = null;
  s.pendingNpc = null;
  activateNextForcedEvent(s);
  checkGameOver(s);
}

export function currentEvent(s: GameState): GameEvent | null {
  if (!s.pendingEvent) return null;
  return typeof s.pendingEvent === 'string' ? findEvent(s.pendingEvent) ?? null : s.pendingEvent;
}

// ============ 委托 ============
export function acceptCommission(s: GameState, id: string): ActionResult {
  if (s.atWork) return { ok: false, msg: '工作期间不能外出接取委托。' };
  if (s.activeCommission) return { ok: false, msg: '一次只能接一个委托。' };
  const c = s.board.find(x => x.id === id);
  if (!c) return { ok: false, msg: '委托已被人捷足先登。' };
  if (!isLocationUnlocked(s, c.locationId)) return { ok: false, msg: '这份委托的去向尚无法核实。' };
  const client = findAnyNPC(s, c.client);
  if (!client) return { ok: false, msg: '这份差事缺少可核实的委托人，不能正式接取。' };
  s.activeCommission = c;
  s.board = s.board.filter(x => x.id !== id);
  if (!isMet(s, c.client)) {
    acquaint(s, c.client, 4);
    addLog(s, `✦ 结交：你按地址找到委托人${client.name}（${client.identity}）面谈了细节，算是正式认识。`, 'good');
  }
  addLog(s, `你揭下了「${c.title}」。委托人：${client?.name ?? '?'}（${c.daysLeft}天内完成，报酬${fmtMoney(c.reward)}）。—— 去「冒险」来推进委托。`, 'good');
  return { ok: true };
}

export function abandonCommission(s: GameState) {
  if (s.atWork) return;
  if (!s.activeCommission) return;
  addLog(s, `你放弃了委托「${s.activeCommission.title}」。`, 'bad');
  applyEffects(s, [{ k: 'favor', id: s.activeCommission.client, v: -4 }]);
  s.activeCommission = null;
  s.board = s.board.filter(commission => isLocationUnlocked(s, commission.locationId));
}

// ============ 行动 ============
export const currentJob = (s: GameState): JobDef | undefined => findJob(s.jobId);

/** 与当前职业匹配、可在工作场景互动的同事。 */
export function workmatesFor(s: GameState): GenNPC[] {
  const job = currentJob(s);
  if (!job) return [];
  return s.genNpcs.filter(n => n.identity === job.coworkerIdentity);
}

export function takeJob(s: GameState, jobId: string): ActionResult {
  if (s.atWork) return { ok: false, msg: '你还在工作地点，不能当场换工作。' };
  if (s.jobId) return { ok: false, msg: '你已有工作；若想改行，请先离职。' };
  const job = findJob(jobId);
  if (!job) return { ok: false, msg: '这份工作已经不再招人。' };
  s.jobId = job.id;
  addLog(s, `你接受了【${job.name}】的工作。地点：${job.location}；班次：${job.shiftStart}:00–${job.shiftEnd}:00。`, 'good');
  return { ok: true };
}

/** 上班通勤：只有抵达后才进入工作场景。 */
export function commuteToWork(s: GameState): ActionResult {
  if (s.currentLocation) return { ok: false, msg: '你还在外出的地点，需先返回住处。' };
  const job = currentJob(s);
  if (!job) return { ok: false, msg: '你目前失业，需要先选择一份工作。' };
  if (s.atWork) return { ok: false, msg: `你已经在${job.location}。` };
  const arrival = s.hour + job.commuteHours;
  if (arrival < job.shiftStart) return { ok: false, msg: `现在出发会太早。${job.name}的班次从${job.shiftStart}:00开始。` };
  if (arrival + job.workHours > job.shiftEnd) return { ok: false, msg: `今天已来不及完成一轮${job.workHours}小时的工作（班次${job.shiftStart}:00–${job.shiftEnd}:00）。` };
  const commuteEnergy = energyCost(s, job.commuteHours * 3);
  if (s.stats.energy < commuteEnergy) return { ok: false, msg: '你已经累得连这段通勤都吃不消。' };
  applyEffects(s, [{ k: 'energy', v: -commuteEnergy }]);
  addLog(s, `你花了${job.commuteHours}小时通勤前往${job.location}，抵达【${job.name}】的工作地点。`, 'info');
  advanceHours(s, job.commuteHours);
  if (s.gameOver) return { ok: true };
  s.atWork = true;
  while (workmatesFor(s).length < 2) {
    s.genNpcs.push(generateCoworker(job.coworkerIdentity, job.location, job.shiftStart, job.shiftEnd));
  }
  return { ok: true };
}

/** 到岗后完成本职工作；收入仍受出身和精打细算天赋影响。 */
export function doWork(s: GameState): ActionResult {
  const job = currentJob(s);
  if (!job) return { ok: false, msg: '你目前失业，需要先选择一份工作。' };
  if (!s.atWork) return { ok: false, msg: `你还没到岗，请先通勤前往${job.location}。` };
  if (s.hour < job.shiftStart || s.hour + job.workHours > job.shiftEnd) return { ok: false, msg: `剩余班次不足以完成${job.workHours}小时工作，请下班离开。` };
  const actualEnergy = energyCost(s, job.energyCost);
  if (s.stats.energy < actualEnergy) return { ok: false, msg: '你已经太疲惫，无法完成这轮工作。' };
  const mult = (originOf(s).workPayMult ?? 1) * (hasTalent(s, 'money_grubber') ? 1.2 : 1);
  const pay = Math.round(job.pay * mult);
  applyEffects(s, [{ k: 'money', v: pay }, { k: 'energy', v: -actualEnergy }]);
  addLog(s, `你在${job.location}完成了${job.workHours}小时的【${job.name}】工作，领到${fmtMoney(pay)}工钱。`, 'info');
  advanceHours(s, job.workHours);
  if (!s.gameOver && rnd(100) < 45) maybeTrigger(s, 'work');
  return { ok: true };
}

/** 到岗后选择一位真实同事互动，并接入现有关系值。 */
export function interactWithWorkmate(s: GameState, npcId: string): ActionResult {
  const job = currentJob(s);
  if (!job || !s.atWork) return { ok: false, msg: '只有到岗后才能和同事互动。' };
  if (s.hour >= job.shiftEnd) return { ok: false, msg: '同事们已经收工了，请下班离开。' };
  const npc = workmatesFor(s).find(n => n.id === npcId);
  if (!npc) return { ok: false, msg: '这位同事不在你的工作场景中。' };
  const cost = energyCost(s, 6);
  if (s.stats.energy < cost) return { ok: false, msg: '你累得不想说话。' };
  applyEffects(s, [{ k: 'energy', v: -cost }]);
  const wasMet = isMet(s, npc.id);
  const gain = wasMet ? 2 + rnd(3) : 4 + rnd(3);
  applyEffects(s, [{ k: 'favor', id: npc.id, v: gain }]);
  const scenes = [
    `歇手时，你和${npc.name}聊起「${npc.motive}」。ta比平时多说了几句。`,
    `${npc.name}帮你接过一件麻烦活，你也替ta遮掩了一次小疏漏。你们的配合自然了些。`,
    `你和${npc.name}交换了些工作诀窍。ta${npc.traits.join('、')}，对你倒不算设防。`,
  ];
  addLog(s, wasMet ? scenes[rnd(scenes.length)] : `✦ 结交：你在${job.location}正式认识了同事${npc.name}（${npc.identity}）。ta${npc.traits.join('、')}，心里惦记着「${npc.motive}」。`, wasMet ? 'info' : 'good');
  advanceHours(s, 1);
  return { ok: true };
}

export function leaveWork(s: GameState): ActionResult {
  const job = currentJob(s);
  if (!job || !s.atWork) return { ok: false, msg: '你目前不在工作地点。' };
  const cost = energyCost(s, job.commuteHours * 3);
  applyEffects(s, [{ k: 'energy', v: -cost }]);
  s.atWork = false;
  addLog(s, `你结束在${job.location}的停留，花${job.commuteHours}小时通勤回到住处。`, 'info');
  advanceHours(s, job.commuteHours);
  return { ok: true };
}

export function resignJob(s: GameState): ActionResult {
  const job = currentJob(s);
  if (!job) return { ok: false, msg: '你目前没有可以辞去的工作。' };
  if (s.atWork) leaveWork(s);
  s.jobId = null;
  s.atWork = false;
  addLog(s, `你辞去了【${job.name}】。从现在起你处于失业状态，可以重新择业。`, 'bad');
  return { ok: true };
}

export interface TravelQuote {
  mode: TravelMode;
  hours: number;
  fee: number;
  travelers: number;
}

export function getTravelQuote(s: GameState, locationId: string, mode: TravelMode, travelers = 1): TravelQuote | null {
  if (locationAccessIssue(s, locationId)) return null;
  const loc = LOCATIONS.find(location => location.id === locationId);
  if (!loc || travelers < 1 || !Number.isInteger(travelers)) return null;
  if (mode === 'walk') return { mode, hours: loc.hours, fee: 0, travelers };
  const hours = Math.max(1, Math.ceil(loc.hours / 2));
  if (hours >= loc.hours) return null;
  const regionBase = loc.region === '城区' ? 2 : loc.region === '城郊' ? 4 : 8;
  return { mode, hours, fee: (regionBase + (loc.hours - hours) * 3) * travelers, travelers };
}

function performExploreAtLocation(s: GameState, locationId: string, actionHours: number, companionId?: string): ActionResult {
  const accessIssue = locationAccessIssue(s, locationId);
  if (accessIssue) return { ok: false, msg: accessIssue };
  if (s.atWork) return { ok: false, msg: '你还在工作地点，需先下班离开。' };
  const loc = LOCATIONS.find(l => l.id === locationId);
  if (!loc) return { ok: false, msg: accessIssue ?? '这个去向尚未查明。先从传闻、委托或可信路线中寻找入口。' };
  if (loc.nightOnly && !(s.hour >= 22 || s.hour < 2)) return { ok: false, msg: `${loc.name}只在深夜（22:00–2:00）张开。` };
  // 同行者校验：需信任（好感≥40）且此刻方便出门
  let comp: ReturnType<typeof findAnyNPC> = undefined;
  if (companionId) {
    const n = findAnyNPC(s, companionId);
    if (!n) return { ok: false, msg: '找不到这个人。' };
    if ((s.relations[companionId] ?? -999) < COMPANION_MIN_FAVOR) return { ok: false, msg: `${n.name}还没有信任你到愿意一起涉险的程度。` };
    if (!npcAvailable(n, s.day, s.hour)) return { ok: false, msg: `${n.name}此刻走不开——摸清ta的作息，挑ta得空的时候来邀。` };
    comp = n;
  }
  let cost = 6 + loc.hours * 8;
  if (s.pathwayId === 'hunter') cost -= 7;
  if (hasTalent(s, 'strong_body')) cost -= 5;
  cost = energyCost(s, cost);
  if (s.stats.energy < cost + 5) return { ok: false, msg: '你当前的状态撑不住这趟远门，勉强出发等于送死。' };
  applyEffects(s, [{ k: 'energy', v: -cost }]);
  const compSpec = comp ? companionSpec(comp) : null;
  addLog(s, comp
    ? `你和${comp.name}（擅长${STAT_NAMES[compSpec!.stat]}）开始调查【${loc.name}】。${loc.desc}`
    : `你开始调查【${loc.name}】。${loc.desc}`, 'info');
  if (hasTalent(s, 'sixth_sense')) {
    const omen = ['后颈微凉——此行有凶险，量力而行。', '没什么特别的感觉，应该顺利。', '一种说不清的不安萦绕不去……今天最好避开雾浓的地方。'][rnd(3)];
    addLog(s, `（第六感）${omen}`, 'system');
  }
  if (isBeyonder(s) && rnd(100) < 50) applyEffects(s, [{ k: 'exposure', v: 1 }]);
  if (actionHours > 0) advanceHours(s, actionHours);
  recordLocationCompletion(s, locationId);
  if (s.gameOver) return { ok: true };

  // 委托地点不符 → 提醒后按普通探索结算
  if (s.activeCommission && s.activeCommission.locationId !== locationId) {
    const target = LOCATIONS.find(l => l.id === s.activeCommission!.locationId);
    addLog(s, `（你接的委托「${s.activeCommission.title}」地点在【${target?.name ?? '?'}】，来这里帮不上忙。）`, 'system');
  }

  // 老存档或被篡改状态可能只留下“委托”外形，却没有真实委托人。
  // 这种记录不能成为凭空结算报酬的入口；清除后按普通地点调查继续。
  if (s.activeCommission && s.activeCommission.locationId === locationId && !findAnyNPC(s, s.activeCommission.client)) {
    addLog(s, '这份差事找不到可核实的委托人，也没有正式结算依据；你把它从委托记录中划掉了。', 'system');
    s.activeCommission = null;
  }

  // 有进行中的委托且地点正确 → 确定性检定结算（无随机）
  if (s.activeCommission && s.activeCommission.locationId === locationId) {
    const c = s.activeCommission;
    const skillKey = ({ investigate: 'investigate', hunt: 'combat', escort: 'speech', collect: 'sneak' } as const)[c.kind];
    const skillLv = s.skills[skillKey] ?? 0;
    // 队伍检定：取队伍成员该属性的最高值作基础
    let base = s.stats[c.stat];
    if (comp && compSpec) {
      if (compSpec.stat === c.stat && compSpec.value > base) {
        base = compSpec.value;
      } else if (compSpec.stat !== c.stat) {
        base += 3;
      }
    }
    let total = base + skillLv * 4;
    let pathBonus = 0;
    if (s.pathwayId === 'hunter' && c.stat === 'phy') pathBonus = 10;
    if (s.pathwayId === 'seer' && c.stat === 'spi') pathBonus = 8;
    if (s.pathwayId === 'spectator' && c.stat === 'cha') pathBonus = 8;
    if (s.pathwayId === 'apprentice' && c.kind === 'collect') pathBonus = 10;
    if (s.pathwayId === 'sleepless' && isNight(s.hour)) pathBonus += 8;
    total += pathBonus;
    if (typeof s.flags.jammed === 'number' && s.flags.jammed > 0) total -= 10;
    if (s.stats.energy < 20) total -= 8;
    addLog(s, `你按已有线索推进委托「${c.title}」。${comp ? `${comp.name}在擅长的环节从旁协助。` : ''}`, 'info');
    if (total >= c.difficulty) {
      const client = findAnyNPC(s, c.client);
      applyEffects(s, [{ k: 'money', v: c.reward }, { k: 'favor', id: c.client, v: 8 }]);
      if (c.occult) applyEffects(s, [{ k: 'cor', v: 3 }, { k: 'san', v: -2 }]);
      if (s.skills[skillKey] < 10) { s.skills[skillKey]++; addLog(s, `这次实践让你的【${SKILL_NAMES[skillKey]}】手法更加熟练。`, 'good'); }
      addLog(s, `✦ 委托完成！${client?.name ?? '委托人'}痛快地付了${fmtMoney(c.reward)}。${c.occult ? '只是过程中你瞥见了不该看的东西……' : ''}`, 'good');
      if (comp) {
        const cut = Math.round(c.reward * 0.3);
        applyEffects(s, [{ k: 'money', v: -cut }, { k: 'favor', id: comp.id, v: 4 }]);
        addLog(s, `${comp.name}按约定分走了${fmtMoney(cut)}。共同出生入死一场，ta看你的眼神多了几分信任。`, 'info');
      }
      s.activeCommission = null;
      s.board = s.board.filter(commission => isLocationUnlocked(s, commission.locationId));
      // 碰了非凡事务，可能惹上隐秘组织
      if (c.occult && !s.nemesis && rnd(100) < 30) {
        s.nemesis = spawnNemesis(s, 'occult');
        addLog(s, `⚠️ 回程路上你总觉得被什么视线黏着。有人盯上你了。`, 'bad');
      }
    } else {
      applyEffects(s, [{ k: 'san', v: -3 }]);
      if (comp) applyEffects(s, [{ k: 'favor', id: comp.id, v: -3 }]);
      if (s.skills[skillKey] < 10 && rnd(100) < 50) { s.skills[skillKey]++; }
      addLog(s, `✖ 这次推进失败了——线索断在关键处，对方比预想中棘手。委托还剩${c.daysLeft}天。${comp ? ` ${comp.name}陪你白跑一趟，颇有些怨言。` : ''}`, 'bad');
    }
    return { ok: true };
  }

  // 地点专属事件；若无事件，则按危险度结算一次探索收获
  const triggered = maybeTrigger(s, 'adventure', undefined, locationId);
  if (!triggered) {
    addLog(s, comp
      ? `你和${comp.name}把${loc.name}仔细查了一遍，没有发现新的异常。可带走的普通物资需要另行搜集。`
      : `你在${loc.name}仔细查了一圈，没有发现新的异常。可带走的普通物资需要另行搜集。`, 'info');
    if (comp) applyEffects(s, [{ k: 'favor', id: comp.id, v: 2 }]);
    if (loc.danger >= 50 && rnd(100) < 35) {
      applyEffects(s, [{ k: 'cor', v: 2 }, { k: 'san', v: -2 }]);
      addLog(s, '离开前，你总觉得暗处有什么在目送你。回程一路，那种阴冷的注视始终没有散去。', 'bad');
    }
  }
  return { ok: true };
}

export function travelToLocation(s: GameState, locationId: string, mode: TravelMode, companionId?: string): ActionResult {
  const accessIssue = locationAccessIssue(s, locationId);
  if (accessIssue) return { ok: false, msg: accessIssue };
  if (!isAtHome(s)) return { ok: false, msg: s.atWork ? '需先下班回家再出发。' : '你已经身处另一个地点，需先离开才能改道。' };
  const location = LOCATIONS.find(candidate => candidate.id === locationId);
  if (!location) return { ok: false, msg: accessIssue ?? '这个去向尚未查明。先从传闻、委托或可信路线中寻找入口。' };
  if (location.nightOnly && !(s.hour >= 22 || s.hour < 2)) return { ok: false, msg: `${location.name}只在深夜（22:00–2:00）张开。` };
  if (companionId) {
    const companion = findAnyNPC(s, companionId);
    if (!companion) return { ok: false, msg: '找不到这个人。' };
    if ((s.relations[companionId] ?? -999) < COMPANION_MIN_FAVOR) return { ok: false, msg: `${companion.name}还没有信任你到愿意一起出门的程度。` };
    if (!npcAvailable(companion, s.day, s.hour)) return { ok: false, msg: `${companion.name}此刻走不开。` };
  }
  const travelers = companionId ? 2 : 1;
  const travel = getTravelQuote(s, locationId, mode, travelers);
  if (!travel) return { ok: false, msg: '这种交通方式不能缩短这趟行程。' };
  if (s.pence < travel.fee) return { ok: false, msg: '付不起这趟车费。' };
  if (s.stats.energy < 5) return { ok: false, msg: '你现在太疲惫，无法安全出门。' };
  applyEffects(s, [{ k: 'money', v: -travel.fee }]);
  const outboundHours = Math.ceil(travel.hours / 2);
  const returnHours = Math.floor(travel.hours / 2);
  const transit = mode === 'rickshaw' ? (location.region === '远方' ? '乘人力车接驳与驿车' : '乘人力车') : '步行';
  addLog(s, `你${transit}前往【${location.name}】，车费已经一次结清。`, 'info');
  if (outboundHours > 0) advanceHours(s, outboundHours);
  s.currentLocation = {
    locationId, arrivedDay: s.day, arrivedHour: s.hour, travelMode: mode,
    returnHours, returnPrepaid: true, ...(companionId ? { companionId } : {}),
  };
  return { ok: true };
}

export function leaveCurrentLocation(s: GameState): ActionResult {
  const stay = s.currentLocation;
  if (!stay) return { ok: false, msg: '你目前不在外出的地点。' };
  const location = LOCATIONS.find(candidate => candidate.id === stay.locationId);
  s.currentLocation = null;
  if (stay.returnHours > 0) advanceHours(s, stay.returnHours);
  addLog(s, `你离开【${location?.name ?? '当前地点'}】并返回住处。返程已在出发时安排，不再收费。`, 'info');
  return { ok: true };
}

function salvageAtLocation(s: GameState, locationId: string): ActionResult {
  const def = SALVAGE_DEFS.find(candidate => candidate.locationId === locationId);
  if (!def) return { ok: false, msg: '这里没有可安全搜集的固定目标。' };
  if (s.completedLocationActions.includes(def.id)) return { ok: false, msg: '这处能带走的普通物资已经清理完了。' };
  if (def.requiresVisited && !hasVisitedLocation(s, locationId)) return { ok: false, msg: '需要先调查周边，确认哪些东西可以安全带走。' };
  if (s.stats.energy < energyCost(s, def.energyCost) + 3) return { ok: false, msg: '你太疲惫，无法继续搜集。' };
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, def.energyCost) }]);
  if (def.reward.kind === 'money') applyEffects(s, [{ k: 'money', v: def.reward.amount }]);
  else applyEffects(s, [{ k: 'item', id: def.reward.itemId, v: def.reward.amount }]);
  advanceHours(s, def.hours);
  s.completedLocationActions.push(def.id);
  addLog(s, '你按先前调查留下的安全范围搜集了一批普通物资。这里不会再重复产出。', 'good');
  return { ok: true };
}

function improveLocationRelationship(s: GameState, locationId: string, amount: number) {
  if (!TINGEN_LANDMARK_ENCOUNTERS.some(def => def.locationId === locationId)) return;
  s.locationRelations ??= {};
  s.locationRelations[locationId] = clamp((s.locationRelations[locationId] ?? 0) + amount);
}

export function locationRelationshipLabel(s: GameState, locationId: string): string {
  const value = s.locationRelations?.[locationId] ?? 0;
  if (value >= 8) return '这里已有一些人认得你';
  if (value >= 4) return '你开始熟悉这里的规矩';
  if (value > 0) return '你留下过几次普通来访记录';
  return '这里的人还不认识你';
}

export const hasLandmarkEncounters = (locationId: string): boolean => TINGEN_LANDMARK_ENCOUNTERS.some(def => def.locationId === locationId);

function recordLandmarkIntroductions(s: GameState, action: TingenLandmarkActionDef) {
  s.landmarkIntroductions ??= [];
  for (const grant of action.introductions ?? []) {
    const encounter = TINGEN_LANDMARK_ENCOUNTERS.find(def => def.id === grant.encounterId && def.locationId === action.locationId);
    if (!encounter || s.landmarkIntroductions.some(record => record.encounterId === grant.encounterId)) continue;
    s.landmarkIntroductions.push({
      encounterId: grant.encounterId, sourceActionId: action.id, introducerId: grant.introducerId,
      acquiredDay: s.day, acquiredHour: s.hour,
    });
    addLog(s, `${grant.introducerName}确认你是在处理公开事务，愿意在合适的时候替你向此地负责人作一次普通引见。`, 'info');
  }
}

export type LandmarkEncounterAttemptStatus = 'ineligible' | 'unavailable' | 'cooldown' | 'missed' | 'met' | 'already_met';
export interface LandmarkEncounterEvaluationMoment { day: number; hour: number }

function addLandmarkEncounterLog(s: GameState, moment: LandmarkEncounterEvaluationMoment, text: string, kind: LogEntry['kind']) {
  s.log.push({ day: moment.day, hour: moment.hour, text, kind });
  if (s.log.length > 300) s.log.splice(0, s.log.length - 300);
}

/**
 * 地标高级人物只在可解释引见或地点关系达标后进入抽取。randomSource 可由测试注入；
 * 内部 secret 不参与任何玩家文本。
 */
export function tryTingenLandmarkEncounter(
  s: GameState,
  locationId: string,
  actionId: string,
  randomSource: () => number = Math.random,
  evaluationMoment: LandmarkEncounterEvaluationMoment = { day: s.day, hour: s.hour },
): { status: LandmarkEncounterAttemptStatus; encounterId?: string } {
  s.locationRelations ??= {};
  s.landmarkIntroductions ??= [];
  s.landmarkEncounters ??= [];
  if (s.currentLocation?.locationId !== locationId || !isLocationUnlocked(s, locationId)) return { status: 'ineligible' };
  const def = TINGEN_LANDMARK_ENCOUNTERS.find(candidate => candidate.locationId === locationId && candidate.triggerActionIds.includes(actionId));
  if (!def) return { status: 'ineligible' };
  const existing = s.landmarkEncounters.find(record => record.encounterId === def.id);
  if (existing?.met) return { status: 'already_met', encounterId: def.id };
  const introduced = s.landmarkIntroductions.some(record => record.encounterId === def.id);
  const relationReady = (s.locationRelations[locationId] ?? 0) >= def.minLocationRelation;
  if (!introduced && !relationReady) return { status: 'ineligible' };
  if (!Number.isInteger(evaluationMoment.day) || evaluationMoment.day < 1
    || !Number.isInteger(evaluationMoment.hour) || evaluationMoment.hour < 0 || evaluationMoment.hour > 23) return { status: 'ineligible' };
  // 休息日或错误时段不是一次正式会面尝试：不给冷却、不累计保底，也不触碰 RNG。
  const scheduleOwnerDay = npcScheduleOwnerDay(def.npc, evaluationMoment.day, evaluationMoment.hour);
  if (scheduleOwnerDay === null) {
    addLandmarkEncounterLog(s, evaluationMoment, def.missText, 'info');
    return { status: 'unavailable', encounterId: def.id };
  }
  if (existing?.lastAttemptDay !== undefined && scheduleOwnerDay - existing.lastAttemptDay < def.cooldownDays) {
    return { status: 'cooldown', encounterId: def.id };
  }
  const record: LandmarkEncounterRecord = existing ?? { encounterId: def.id, attempts: 0, met: false };
  if (!existing) s.landmarkEncounters.push(record);
  record.attempts += 1;
  record.lastAttemptDay = scheduleOwnerDay;
  const guaranteed = def.guaranteeAfterAttempts !== undefined && record.attempts >= def.guaranteeAfterAttempts;
  const roll = guaranteed ? 0 : randomSource();
  if (!guaranteed && (!Number.isFinite(roll) || roll < 0 || roll >= 1 || roll >= def.chance)) {
    addLandmarkEncounterLog(s, evaluationMoment, def.missText, 'info');
    return { status: 'missed', encounterId: def.id };
  }
  record.met = true;
  record.metDay = evaluationMoment.day;
  record.metHour = evaluationMoment.hour;
  s.relations[def.npc.id] = Math.max(s.relations[def.npc.id] ?? 0, def.initialFavor);
  addLandmarkEncounterLog(s, evaluationMoment, `✦ 正式结识：${def.meetText}`, 'good');
  return { status: 'met', encounterId: def.id };
}

function performAtLocationActionInternal(
  s: GameState,
  actionId: LocationActionId,
  actionHours: number,
  randomSource: () => number = Math.random,
): ActionResult {
  const stay = s.currentLocation;
  if (!stay) return { ok: false, msg: '需要先抵达一个地点。' };
  const location = LOCATIONS.find(candidate => candidate.id === stay.locationId);
  if (!location || !location.actions.includes(actionId)) return { ok: false, msg: '当前地点没有这项行动。' };
  const evaluationMoment = { day: s.day, hour: s.hour };
  const result = actionId === 'explore'
    ? performExploreAtLocation(s, location.id, actionHours, stay.companionId)
    : actionId === 'wander'
      ? performWanderLocation(s, location.id, { mode: stay.travelMode, hours: actionHours, fee: 0, travelers: 1 })
      : actionId === 'tavern'
        ? performTavernLocation(s, location.id, { mode: stay.travelMode, hours: actionHours, fee: 0, travelers: 1 })
        : actionId === 'salvage'
          ? salvageAtLocation(s, location.id)
          : { ok: false, msg: '请从店铺的固定货单中选择商品。' };
  if (result.ok && actionId === 'explore') {
    improveLocationRelationship(s, location.id, 1);
    tryTingenLandmarkEncounter(s, location.id, actionId, randomSource, evaluationMoment);
  }
  return result;
}

export function performAtLocationAction(s: GameState, actionId: LocationActionId, randomSource: () => number = Math.random): ActionResult {
  return performAtLocationActionInternal(s, actionId, 1, randomSource);
}

const LANDMARK_EFFECT_KINDS = new Set<Effect['k']>(['clue', 'intel', 'knowledge', 'flag']);

function hasAbnormalWitnessForReferral(s: GameState): boolean {
  return s.awareness !== 'ordinary'
    || !!s.flags.met_beyonder
    || ['anomaly_evidence', 'cryptic_note', 'dock_scale_evidence'].some(itemId => (s.items[itemId] ?? 0) > 0)
    || hasClue(s, 'dock_crate_trace')
    || !!s.organizationRoutes.nightwatch?.history.some(entry => entry.step === 'clocktower_witness' && entry.outcome === 'started');
}

function landmarkRequirementMet(s: GameState, def: TingenLandmarkActionDef): boolean {
  return def.requirement !== 'abnormal_witness' || hasAbnormalWitnessForReferral(s);
}

function landmarkActionCompleted(s: GameState, def: TingenLandmarkActionDef): boolean {
  if (def.id === 'hound_leave_security_message') return hasVerifiedBlackthornReferral(s);
  const { kind, id } = def.completion;
  if (kind === 'clue') return hasClue(s, id);
  if (kind === 'intel') return s.intel.includes(id);
  if (kind === 'knowledge') return s.knowledge.includes(id);
  return !!s.flags[id];
}

function landmarkActionOpen(s: GameState, def: TingenLandmarkActionDef): boolean {
  if (def.openFrom === undefined || def.openTo === undefined) return true;
  const hour = def.openTo > 24 && s.hour < def.openFrom ? s.hour + 24 : s.hour;
  return hour >= def.openFrom && hour < def.openTo;
}

/** 只返回当前地点、且玩家已具备显示资格的公开地标行动。 */
export function getTingenLandmarkActions(s: GameState): readonly TingenLandmarkActionDef[] {
  const locationId = s.currentLocation?.locationId;
  if (!locationId || !isLocationUnlocked(s, locationId)) return [];
  return TINGEN_LANDMARK_ACTIONS.filter(def => def.locationId === locationId && landmarkRequirementMet(s, def));
}

export function landmarkActionIssue(s: GameState, actionId: string): string | null {
  const def = TINGEN_LANDMARK_ACTIONS.find(candidate => candidate.id === actionId);
  if (!def || s.currentLocation?.locationId !== def.locationId || !isLocationUnlocked(s, def.locationId) || !landmarkRequirementMet(s, def)) {
    return '当前地点没有这项可核实的公开活动。';
  }
  if (s.atWork) return '需先结束工作再处理地点事务。';
  if (landmarkActionCompleted(s, def)) return '这项公开资料已经记入笔记，重复查阅不会产生新收获。';
  if (!landmarkActionOpen(s, def)) {
    const end = def.openTo! > 24 ? def.openTo! - 24 : def.openTo!;
    return `该公开窗口在${def.openFrom}:00–${end}:00办理。`;
  }
  if (s.stats.energy < energyCost(s, def.energyCost) + 3) return '你现在太疲惫，无法认真完成这项查阅或交谈。';
  if (!def.effects.every(effect => LANDMARK_EFFECT_KINDS.has(effect.k))) return '这项地点活动的数据不符合公共奖励边界。';
  return null;
}

export function performTingenLandmarkAction(s: GameState, actionId: string, randomSource: () => number = Math.random): ActionResult {
  const issue = landmarkActionIssue(s, actionId);
  if (issue) return { ok: false, msg: issue };
  const def = TINGEN_LANDMARK_ACTIONS.find(candidate => candidate.id === actionId)!;
  const evaluationMoment = { day: s.day, hour: s.hour };
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, def.energyCost) }]);
  if (def.id === 'hound_leave_security_message') {
    s.clues = s.clues.filter(record => record.id !== 'blackthorn_referral');
  }
  applyEffects(s, [...def.effects]);
  if (def.id === 'hound_leave_security_message') {
    recordOrganizationRoute(s, 'nightwatch', 'hound_security_referral', 'passed', undefined, 'blackthorn_referral');
  }
  addLog(s, def.result, 'info');
  recordLandmarkIntroductions(s, def);
  improveLocationRelationship(s, def.locationId, 2);
  tryTingenLandmarkEncounter(s, def.locationId, def.id, randomSource, evaluationMoment);
  advanceHours(s, def.hours);
  return { ok: true };
}

export function performLocationAction(s: GameState, locationId: string, actionId: LocationActionId, mode: TravelMode, companionId?: string): ActionResult {
  if (s.currentLocation) {
    if (s.currentLocation.locationId !== locationId) return { ok: false, msg: '你已经身处另一个地点，需先离开才能改道。' };
    return performAtLocationActionInternal(s, actionId, 1);
  }
  const before = structuredClone(s);
  const travel = travelToLocation(s, locationId, mode, actionId === 'explore' ? companionId : undefined);
  if (!travel.ok) return travel;
  const action = performAtLocationActionInternal(s, actionId, 0);
  if (!action.ok) {
    Object.assign(s, before);
    return action;
  }
  leaveCurrentLocation(s);
  return action;
}

export function doAdventure(s: GameState, locationId: string, companionId?: string): ActionResult {
  return performLocationAction(s, locationId, 'explore', 'walk', companionId);
}

export function doAct(s: GameState): ActionResult {
  if (s.atWork) return { ok: false, msg: '你还在工作地点，需先下班离开。' };
  if (!isBeyonder(s)) return { ok: false, msg: '你还没有踏入非凡世界，扮演无从谈起——先找到属于你的「机缘」。' };
  return { ok: false, msg: '漫无目的地模仿角色没有意义；请选择一项与当前途径原则相符的真实场景。' };
}

export function doStudy(_s: GameState): ActionResult {
  return { ok: false, msg: '请选择一本已经取得的书。漫无目标的学习不会产生进度。' };
}

export function canReadLanguage(s: GameState, languageId: string): boolean {
  if (languageId === 'roselle') return s.canReadRoselleScript === true;
  return s.languages[languageId] === 'reading' || s.languages[languageId] === 'fluent';
}

function hasAbridgedOccultNotesAccess(s: GameState): boolean {
  return s.awareness !== 'ordinary' || !!s.flags.met_beyonder
    || Object.values(s.organizationRoutes).some(route => route.status !== 'unknown')
    || hasClue(s, 'clocktower_divination_omen') || hasClue(s, 'cryptic_note_warning');
}

function visibleBookSource(s: GameState, bookId: string): boolean {
  const source = BOOK_SOURCE_DEFS.find(candidate => candidate.bookId === bookId);
  if (!source) return false;
  if (source.kind === 'market' || source.kind === 'public_location') return s.currentLocation?.locationId === source.sourceId;
  if (source.kind === 'location') return s.currentLocation?.locationId === source.sourceId && hasVisitedLocation(s, source.sourceId);
  const npc = findAnyNPC(s, source.sourceId);
  const npcSourceVisible = !!npc && isMet(s, source.sourceId) && (s.relations[source.sourceId] ?? -100) >= VISIT_FAVOR
    && npcAvailable(npc, s.day, s.hour);
  return npcSourceVisible && (bookId !== 'abridged_occult_notes' || hasAbridgedOccultNotesAccess(s));
}

export function acquireBookIssue(s: GameState, bookId: string): string | null {
  const book = BOOK_DEFS.find(candidate => candidate.id === bookId);
  const source = BOOK_SOURCE_DEFS.find(candidate => candidate.bookId === bookId);
  if (!book || !source || !visibleBookSource(s, bookId)) return '这本书的可靠来源尚未进入你的视野。';
  const state = s.books[bookId];
  if (state?.acquired) return '这本固定书目已经在你的书架上。';
  if (s.atWork) return '需先下班离开工作地点。';
  if (bookId === 'abridged_occult_notes') {
    if (!hasAbridgedOccultNotesAccess(s)) return '尼尔逊只会把删节札记交给已经亲历异常或进入正式接触的人。';
  }
  if (s.pence < source.price) return `需要支付${fmtMoney(source.price)}。`;
  if (s.stats.energy < energyCost(s, 4) + 5) return '你太疲惫，无法完成借阅登记与往返。';
  return null;
}

export function getBookSourceOffers(s: GameState): { bookId: string; sourceId: string; price: number }[] {
  return BOOK_SOURCE_DEFS.filter(source => !s.books[source.bookId]?.acquired && visibleBookSource(s, source.bookId))
    .map(source => ({ bookId: source.bookId, sourceId: source.sourceId, price: source.price }));
}

export function acquireBook(s: GameState, bookId: string): ActionResult {
  const issue = acquireBookIssue(s, bookId);
  if (issue) return { ok: false, msg: issue };
  const source = BOOK_SOURCE_DEFS.find(candidate => candidate.bookId === bookId)!;
  const book = BOOK_DEFS.find(candidate => candidate.id === bookId)!;
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, 4) }, { k: 'money', v: -source.price }]);
  advanceHours(s, 1);
  const state = s.books[bookId];
  state.acquired = true;
  state.acquiredDay = s.day;
  state.acquiredHour = s.hour;
  addLog(s, `你从固定来源取得了${book.title}，并把来源与借阅时间写在扉页上。`, 'good');
  return { ok: true };
}

export function readingIssue(s: GameState, bookId: string): string | null {
  const book = BOOK_DEFS.find(candidate => candidate.id === bookId);
  const state = s.books[bookId];
  if (!book || !state?.acquired) return '这本书不在你的书架上。';
  if (state.completed) return '你已经完成并整理过这本书，重复阅读不会再次获得奖励。';
  if (s.atWork) return '需先下班离开工作地点。';
  if (!canReadLanguage(s, book.language)) return book.language === 'old_feysac' ? '你还不能阅读旧弗萨克语。' : '你不具备阅读这门语言的能力。';
  if (book.minMind !== undefined && s.stats.mnd < book.minMind) return '当前的心智能力还不足以跟上这本教材。';
  if (book.minSkill && (s.skills[book.minSkill.id] ?? 0) < book.minSkill.level) return `需要先具备基础的${SKILL_NAMES[book.minSkill.id]}经验。`;
  if (s.stats.energy < energyCost(s, 8) + 5) return '你太疲惫，无法保持专注阅读。';
  return null;
}

export function evaluateBookCheck(s: GameState, bookId: string): { outcome: 'passed' | 'blocked'; score: number } {
  const book = BOOK_DEFS.find(candidate => candidate.id === bookId);
  if (!book || !book.check) return { outcome: book ? 'passed' : 'blocked', score: 0 };
  const score = s.stats[book.check.stat] + (s.skills[book.check.skill] ?? 0) * 4
    + Object.entries(book.check.clueBonuses).reduce((sum, [clueId, bonus]) => sum + (hasClue(s, clueId) ? bonus : 0), 0);
  return { outcome: score >= book.check.difficulty ? 'passed' : 'blocked', score };
}

const FORBIDDEN_BOOK_KNOWLEDGE = new Set(['spirit_vision', 'ritual_basic', 'potion_brew']);

function applyBookReward(s: GameState, reward: BookReward) {
  if (reward.kind === 'knowledge') {
    if (FORBIDDEN_BOOK_KNOWLEDGE.has(reward.id)) return;
    if (!s.knowledge.includes(reward.id)) s.knowledge.push(reward.id);
  } else if (reward.kind === 'skill') {
    s.skills[reward.id] = Math.min(10, s.skills[reward.id] + Math.max(0, Math.min(1, reward.maxGain)));
  } else if (reward.kind === 'language') {
    s.languages[reward.id] = reward.level;
  } else if (reward.kind === 'clue') {
    acquireClue(s, reward.id, 'archive', `book:${reward.id}`);
  } else if (reward.kind === 'flag') {
    s.flags[reward.id] = true;
  } else if (reward.kind === 'event') {
    forceEvent(s, reward.id);
  }
}

export function completeBook(s: GameState, bookId: string): boolean {
  const book = BOOK_DEFS.find(candidate => candidate.id === bookId);
  const state = s.books[bookId];
  if (!book || !state?.acquired || state.completed || state.readHours < book.totalHours) return false;
  state.completed = true;
  for (const reward of book.rewards) applyBookReward(s, reward);
  addLog(s, `你读完${book.title}并整理了索引，把其中能够相互印证的内容逐条抄进调查笔记。`, 'good');
  return true;
}

export function readBookSession(s: GameState, bookId: string): ActionResult {
  if (s.currentLocation) return { ok: false, msg: '需要先回到住处再安静阅读。' };
  const issue = readingIssue(s, bookId);
  if (issue) return { ok: false, msg: issue };
  const book = BOOK_DEFS.find(candidate => candidate.id === bookId)!;
  const state = s.books[bookId];
  const check = evaluateBookCheck(s, bookId);
  if (check.outcome === 'blocked') {
    applyEffects(s, [{ k: 'energy', v: -energyCost(s, 5) }]);
    advanceHours(s, 1);
    state.failedAttempts++;
    addLog(s, `你在${book.title}的复杂章节前反复核对，却没能建立可靠对应。时间花掉了，阅读进度没有前进。`, 'info');
    return { ok: true, outcome: 'blocked' };
  }
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, 8) }]);
  advanceHours(s, 2);
  const gained = 2 + (hasTalent(s, 'quick_wit') ? 1 : 0);
  state.readHours = Math.min(book.totalHours, state.readHours + gained);
  addLog(s, `你按章节阅读${book.title}，把可核验的段落与自己的调查笔记分开整理。`, 'info');
  completeBook(s, bookId);
  return { ok: true, outcome: 'passed' };
}

/** 攀谈：在对方当前所在的公开场合搭话。陌生人会触发「结交事件」，初识则慢慢加深印象。 */
export function doChat(s: GameState, npcId: string): ActionResult {
  if (s.atWork) return { ok: false, msg: '你还在工作地点，不能外出攀谈。' };
  const npc = findAnyNPC(s, npcId);
  if (!npc) return { ok: false, msg: '找不到这个人。' };
  if (!npcAvailable(npc, s.day, s.hour)) return { ok: false, msg: `${npc.name}现在不在方便搭话的地方。` };
  const fav = s.relations[npcId];
  if (fav !== undefined && fav >= VISIT_FAVOR) return { ok: false, msg: '你们已经是熟人，可以直接「拜访」了。' };
  if (s.stats.energy < 6) return { ok: false, msg: '精力不足。' };
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, 6) }]);
  advanceHours(s, 1);
  if (s.gameOver) return { ok: true };

  const gen = s.genNpcs.find(n => n.id === npcId);
  if (fav === undefined) {
    // —— 结交事件：第一次正式相识 ——
    acquaint(s, npcId, 4 + rnd(4));
    if (gen) {
      addLog(s, `✦ 结交：你找机会和${gen.name}搭上了话（${gen.identity}）。ta${gen.traits.join('、')}——聊下来你隐约觉得，这个人心里装着「${gen.motive}」这回事。`, 'good');
    } else {
      addLog(s, `✦ 结交：你正式认识了${npc.name}（${npc.identity}）。${npc.desc}`, 'good');
    }
  } else {
    // —— 初识阶段的寒暄 ——
    applyEffects(s, [{ k: 'favor', id: npcId, v: 1 + rnd(3) }]);
    const smallTalk = gen
      ? [`你陪${gen.name}聊了几句${gen.motive}的进展。`, `${gen.name}对你熟络了些，顺嘴抱怨起今天的活计。`, `你给${gen.name}递了支烟，ta的话多了两句。`]
      : [`你和${npc.name}寒暄了一阵，ta对你多了几分印象。`, `${npc.name}抬眼认出是你，语气比上回缓和了些。`, `你陪${npc.name}聊了些街区见闻，关系近了一点。`];
    addLog(s, smallTalk[rnd(smallTalk.length)], 'info');
    const now = s.relations[npcId] ?? 0;
    if (now >= VISIT_FAVOR) addLog(s, `✦ ${npc.name}已经把你当自己人了——现在可以登门「拜访」了。`, 'system');
  }
  return { ok: true };
}

export function doSocial(s: GameState, npcId: string): ActionResult {
  if (s.atWork) return { ok: false, msg: '你还在工作地点，不能外出拜访。' };
  const npc = findAnyNPC(s, npcId);
  if (!npc) return { ok: false, msg: '找不到这个人。' };
  if (!npcAvailable(npc, s.day, s.hour)) return { ok: false, msg: `${npc.name}现在不在方便见客的地方。` };
  const fav = s.relations[npcId];
  if (fav === undefined) return { ok: false, msg: '你们还不认识。先找机会攀谈结交（酒馆、街头、市集都是认识人的地方）。' };
  if (fav < VISIT_FAVOR) return { ok: false, msg: '你们还只是点头之交。先多攀谈几次，等对方真正信任你再登门。' };
  if (s.stats.energy < 8) return { ok: false, msg: '精力不足。' };
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, 8) }]);
  addLog(s, `你拜访了${npc.name}（${npc.identity}）。`, 'info');
  advanceHours(s, 1);
  if (s.gameOver) return { ok: true };

  // 生成 NPC：通用社交结算
  const gen = s.genNpcs.find(n => n.id === npcId);
  if (gen) {
    applyEffects(s, [{ k: 'favor', id: npcId, v: 2 + rnd(3) }]);
    const roll = rnd(100);
    if ((s.relations[npcId] ?? 0) >= 20 && roll < 25) {
      addLog(s, `几杯酒下肚，${gen.name}压低声音说出一个秘密：「${gen.secret}——你可别往外说。」`, 'event');
      if (gen.secret.includes('野生非凡者') && !isBeyonder(s)) addLog(s, '你的心猛地一跳。非凡者……原来真的存在，而且就在你身边。', 'system');
      if (gen.secret.includes('野生非凡者') && isBeyonder(s)) applyEffects(s, [{ k: 'favor', id: npcId, v: 6 }]);
    } else if (roll < 45) {
      const c = generateCommission(s);
      if (s.board.length >= 5) s.board.shift();
      s.board.push(c);
      addLog(s, `${gen.name}提到最近有桩活儿没人接：「${c.title}」。你默默记下了。（可在右侧「打听到的差事」中揭下）`, 'info');
    } else {
      const small = [`你们聊了聊${gen.motive}的事。`, `${gen.name}抱怨起物价和雾。`, `你从${gen.name}那儿听到几个街头传闻。（不过是些家长里短）`];
      addLog(s, small[rnd(small.length)], 'info');
    }
    return { ok: true };
  }

  maybeTrigger(s, 'social', npcId);
  return { ok: true };
}

/** 去酒馆坐坐：酒馆见闻与社交主渠道。先认识老板麦克，再从常客里结识新面孔。 */
function performTavernLocation(s: GameState, locationId: string, travel: TravelQuote): ActionResult {
  if (s.atWork) return { ok: false, msg: '你还在工作地点，需先下班离开。' };
  if (!(s.hour >= 16 || s.hour < 2)) return { ok: false, msg: '「醉水手」要16:00才开门，凌晨2:00打烊。' };
  if (s.pence < 6 + travel.fee) return { ok: false, msg: travel.fee ? '付不起车费和酒钱。' : '连一杯麦酒的钱都没有了。' };
  if (s.stats.energy < 6) return { ok: false, msg: '精力不足。' };
  applyEffects(s, [{ k: 'money', v: -(6 + travel.fee) }, { k: 'energy', v: -energyCost(s, 5) }]);
  addLog(s, `${travel.mode === 'rickshaw' ? '你乘人力车赶到酒馆，' : ''}你推开「醉水手」的橡木门，买了杯麦酒。劣质烟草和潮湿的呢子大衣味扑面而来。`, 'info');
  advanceHours(s, travel.hours);
  recordLocationCompletion(s, locationId);
  if (s.gameOver) return { ok: true };

  // 此刻酒馆里的人
  const present = allNPCs(s).filter(n => (npcLocation(n, s.day, s.hour) ?? '').includes('醉水手'));
  // 第一次来：先认识吧台后的老板
  if (!isMet(s, 'mike')) {
    acquaint(s, 'mike', 5);
    addLog(s, '✦ 结交：吧台后的胖子朝你抬了抬下巴：「新面孔。麦克，这儿的老板。坐吧台吧，第一天来的都坐吧台。」——你认识了「胖子」麦克。', 'good');
  } else {
    const stranger = present.filter(n => !isMet(s, n.id) && n.id !== 'mike');
    if (stranger.length) {
      const npc = stranger[rnd(stranger.length)];
      const gen = s.genNpcs.find(n => n.id === npc.id);
      acquaint(s, npc.id, 4 + rnd(4));
      addLog(s, gen
        ? `✦ 结交：你在酒馆结识了${npc.name}（${npc.identity}）。几杯下肚，${gen.traits.join('、')}的ta说漏了嘴——ta正为「${gen.motive}」发愁。`
        : `✦ 结交：你在酒馆结识了${npc.name}（${npc.identity}）。${npc.desc}`, 'good');
    } else {
      const known = present.filter(n => n.id !== 'mike' && (s.relations[n.id] ?? 0) < VISIT_FAVOR);
      if (known.length) {
        const npc = known[rnd(known.length)];
        applyEffects(s, [{ k: 'favor', id: npc.id, v: 2 + rnd(3) }]);
        addLog(s, `你和${npc.name}拼了一桌，边喝边聊。散场时，你们已经比来时熟络。`, 'info');
        if ((s.relations[npc.id] ?? 0) >= VISIT_FAVOR) addLog(s, `✦ ${npc.name}已经把你当自己人了——现在可以登门「拜访」了。`, 'system');
      } else {
        applyEffects(s, [{ k: 'san', v: 2 }]);
        addLog(s, '今晚没有新面孔。你独自喝了两杯，听水手可耻地夸大战绩。', 'info');
      }
    }
    // 麦克是吧台后的耳朵：可能听到活儿
    if (rnd(100) < 30) {
      const c = generateCommission(s);
      if (s.board.length >= 5) s.board.shift();
      s.board.push(c);
      addLog(s, `麦克擦着杯子，状似无意地提起一桩活儿：「${c.title}」——细节去问委托人。（可在「打听到的差事」中揭下）`, 'event');
    }
  }
  return { ok: true };
}

export function doTavern(s: GameState): ActionResult {
  return performLocationAction(s, 'tavern', 'tavern', 'walk');
}

export function doNap(s: GameState): ActionResult {
  if (s.currentLocation) return { ok: false, msg: '你还在外出的地点，需先返回住处。' };
  if (s.atWork) return { ok: false, msg: '工作地点不是睡觉的地方。' };
  applyEffects(s, [{ k: 'energy', v: 12 }]);
  addLog(s, '你小憩了一小时，醒来时手脚轻快了些。', 'info');
  advanceHours(s, 1);
  return { ok: true };
}

export function doMeal(s: GameState): ActionResult {
  if (s.atWork) return { ok: false, msg: '你还在工作地点，需先下班离开。' };
  if (s.pence < 4) return { ok: false, msg: '连顿饭钱都付不起了。' };
  applyEffects(s, [{ k: 'money', v: -4 }, { k: 'energy', v: 20 }, { k: 'san', v: 2 }]);
  addLog(s, '你花4便士吃了顿像样的热食，胃里终于暖和起来。', 'info');
  advanceHours(s, 1);
  return { ok: true };
}

export function doSleep(s: GameState): ActionResult {
  if (s.currentLocation) return { ok: false, msg: '你还在外出的地点，需先返回住处。' };
  if (s.atWork) return { ok: false, msg: '你还在工作地点，需先下班离开。' };
  const hours = s.hour < 7 ? 7 - s.hour : 24 - s.hour + 7;
  if (s.pathwayId === 'sleepless') {
    applyEffects(s, [{ k: 'energy', v: 40 }, { k: 'san', v: 5 }]);
    addLog(s, '不眠者无需睡眠。你静夜冥想，让疲惫与杂念随着呼吸缓缓沉淀。', 'info');
    advanceHours(s, 2);
    return { ok: true };
  }
  const recover = s.tags.includes('homeless') ? 50 : 100;
  addLog(s, s.tags.includes('homeless') ? '你在桥洞下凑合了一夜。寒气和噪声让这场睡眠几乎称不上休息。' : '你睡了一觉。蒸汽城在窗外低鸣。', 'info');
  s.stats.energy = recover;
  s.stats.san = clamp(s.stats.san + 10);
  advanceHours(s, hours);
  return { ok: true };
}

function performWanderLocation(s: GameState, locationId: string, travel: TravelQuote): ActionResult {
  if (s.atWork) return { ok: false, msg: '你还在工作地点，需先下班离开。' };
  if (s.pence < travel.fee) return { ok: false, msg: '付不起这趟车费。' };
  if (s.stats.energy < 5) return { ok: false, msg: '精力不足。' };
  applyEffects(s, [{ k: 'money', v: -travel.fee }, { k: 'energy', v: -5 }]);
  addLog(s, '你在街上闲逛。雾、煤气灯、和永远行色匆匆的人群。', 'info');
  advanceHours(s, travel.hours);
  recordLocationCompletion(s, locationId);
  if (s.gameOver) return { ok: true };
  // 撞见此刻正在街面上的人：陌生人→结交事件；熟人→寒暄
  const present = allNPCs(s).filter(n => npcAvailable(n, s.day, s.hour) && n.id !== 'mike');
  if (present.length && rnd(100) < 45) {
    const strangers = present.filter(n => !isMet(s, n.id));
    const npc = (strangers.length ? strangers : present)[rnd((strangers.length ? strangers : present).length)];
    const spot = redactLockedLocationText(s, npcLocation(npc, s.day, s.hour) ?? '街上');
    if (!isMet(s, npc.id)) {
      acquaint(s, npc.id, 3 + rnd(3));
      const gen = s.genNpcs.find(n => n.id === npc.id);
      addLog(s, gen
        ? `✦ 结交：你在${spot}撞见了${npc.name}（${npc.identity}）——${gen.traits.join('、')}。你们站着聊了一刻钟，约好下回再会。`
        : `✦ 结交：你在${spot}遇上了${npc.name}（${npc.identity}），攀谈了几句，算是正式认识了。`, 'good');
    } else {
      applyEffects(s, [{ k: 'favor', id: npc.id, v: 1 + rnd(2) }]);
      addLog(s, `你撞见了${npc.name}——这个时间ta果然在${spot}。你们站在街边聊了几句，告别时语气亲近了些。`, 'info');
    }
    return { ok: true };
  }
  // 偶遇新面孔（人口池上限14）：打过照面即结交
  if (s.genNpcs.length < 14 && rnd(100) < 15) {
    const npc = generateNPC();
    s.genNpcs.push(npc);
    acquaint(s, npc.id, 2 + rnd(3));
    addLog(s, `✦ 结交：你结识了新面孔：${npc.name}，${npc.identity}。${npc.traits[0]}，${npc.motive}。`, 'good');
    return { ok: true };
  }
  if (rnd(100) < 40) maybeTrigger(s, 'street', undefined, locationId);
  return { ok: true };
}

export function doWander(s: GameState): ActionResult {
  return performLocationAction(s, 'market', 'wander', 'walk');
}

// ============ 凡人 → 官方不眠者路线 ============
function recordRoute(s: GameState, pathwayId: string, step: string, outcome: PathwayLead['history'][number]['outcome'], note?: string) {
  pathwayLead(s, pathwayId).history.push({ day: s.day, step, outcome, note });
}

export function organizationRoute(s: GameState, organizationId: OrganizationId): OrganizationRoute {
  s.organizationRoutes[organizationId] ??= { organizationId, status: 'unknown', routeStep: 'none', history: [] };
  return s.organizationRoutes[organizationId];
}

function recordOrganizationRoute(s: GameState, organizationId: OrganizationId, step: string, outcome: PathwayLead['history'][number]['outcome'], note?: string, evidenceId?: string) {
  organizationRoute(s, organizationId).history.push({ day: s.day, step, outcome, ...(note ? { note } : {}), ...(evidenceId ? { evidenceId } : {}) });
}

export const organizationDef = (organizationId: OrganizationId) => ORGANIZATIONS.find(org => org.id === organizationId);
export function joinedOrganization(s: GameState): OrganizationId | null {
  return (ORGANIZATIONS.find(org => ['member', 'offer_pending', 'committed'].includes(organizationRoute(s, org.id).status))?.id ?? null) as OrganizationId | null;
}

const organizationPreparation = (organizationId: OrganizationId): { source: PathwayLead['currentSource']; mode: PreparationMode } => ({
  nightwatch: { source: 'official', mode: 'official_dose' },
  secret_order: { source: 'mentor', mode: 'supervised_brew' },
  psychology_alchemists: { source: 'mentor', mode: 'official_dose' },
  iron_and_blood: { source: 'black_market', mode: 'supervised_brew' },
  abraham_branch: { source: 'mentor', mode: 'supervised_brew' },
}[organizationId] as { source: PathwayLead['currentSource']; mode: PreparationMode });

export function getOrganizationOffers(s: GameState, organizationId: OrganizationId): string[] {
  const route = organizationRoute(s, organizationId);
  if (!['member', 'offer_pending'].includes(route.status)) return [];
  return [...(organizationDef(organizationId)?.heldPathways ?? [])];
}

const leadDefForOrganization = (organizationId: OrganizationId) => ORGANIZATION_LEAD_DEFS.find(def => def.organizationId === organizationId);

export function organizationEntryIssue(s: GameState, organizationId: OrganizationId): string | null {
  if (s.atWork) return '工作期间不能调查敏感背景线索。';
  if (isBeyonder(s)) return '该入口只面向尚未选定途径的凡人。';
  if (organizationId === 'nightwatch') return '值夜者线索请从地方报纸与旧钟楼开始。';
  if (organizationId === 'iron_and_blood') return '码头到访记录不足以构成原始线索，请先核对失踪登记与货运档案。';
  const def = leadDefForOrganization(organizationId);
  if (!def) return '组织线索数据缺失。';
  const lead = s.leads[def.id];
  if (lead.stage !== 'unknown') return '这份一次性线索已经取得，不能重复刷新。';
  if (def.entryMode === 'npc_background') return trustedNpcIssue(s, def.contactNpc, def.minFavor);
  if (!def.locationId || !hasVisitedLocation(s, def.locationId)) return `需要先实际完成【${def.place}】的冒险调查。`;
  return null;
}

export function organizationIdentificationIssue(s: GameState, organizationId: OrganizationId, npcId: string): string | null {
  if (s.atWork) return '工作期间不能拜访鉴定人。';
  if (isBeyonder(s)) return '该入口只面向凡人。';
  const def = leadDefForOrganization(organizationId);
  const lead = def && s.leads[def.id];
  if (organizationId === 'iron_and_blood' && !hasClue(s, 'dock_marked_manifest')) return '需要先取得并整理那份异常仓单。';
  if (!def || !lead || lead.stage !== 'decoded') return '需要先取得并整理这份来源不明的线索。';
  if (npcId !== def.contactNpc) return '这个人无法为该线索提供可靠鉴定或引荐。';
  return trustedNpcIssue(s, npcId, def.minFavor);
}

/** 非夜鹰组织的固定线索入口；每份资源唯一，不依赖随机事件。 */
export function discoverOrganizationEvidence(s: GameState, organizationId: OrganizationId): ActionResult {
  const issue = organizationEntryIssue(s, organizationId);
  if (issue) return { ok: false, msg: issue };
  const def = leadDefForOrganization(organizationId);
  if (!def) return { ok: false, msg: '组织线索数据缺失。' };
  const lead = s.leads[def.id];
  if (s.stats.energy < 6) return { ok: false, msg: '你当前太过疲惫，无法仔细整理这次背景询问。' };
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, 6) }]);
  lead.stage = 'found';
  lead.notes.push(def.entryMode === 'npc_background'
    ? `${findAnyNPC(s, def.contactNpc)?.name ?? def.contactNpc}在建立信任后交出：${def.publicLabel}`
    : `在${def.place}实地调查后发现：${def.publicLabel}`);
  recordOrganizationRoute(s, organizationId, `world_entry:${def.id}`, 'passed', def.entryMode);
  if (organizationId === 'abraham_branch' && !s.formulas.includes('apprentice9')) {
    s.formulas.push('apprentice9');
    pathwayLead(s, 'apprentice').formulaStatus = 'unverified';
    lead.notes.push('地点夹层中同时发现一份完整但未经鉴定的学徒配方抄本');
  }
  addLog(s, `你取得了【${def.publicLabel}】。目前只知道它来自一段可信背景或实地调查，尚不能判断背后组织与用途。`, 'event');
  advanceHours(s, 1);
  return { ok: true };
}

export function decodeOrganizationEvidence(s: GameState, organizationId: OrganizationId): ActionResult {
  if (s.atWork) return { ok: false, msg: '工作期间不能整理线索。' };
  if (isBeyonder(s)) return { ok: false, msg: '该入口只面向凡人。' };
  const def = leadDefForOrganization(organizationId);
  const lead = def && s.leads[def.id];
  if (organizationId === 'iron_and_blood' && !hasClue(s, 'dock_marked_manifest')) return { ok: false, msg: '需要先取得码头的异常仓单。' };
  if (!lead || lead.stage !== 'found') return { ok: false, msg: '需要先取得该组织的原始线索。' };
  lead.stage = 'decoded';
  lead.notes.push('完成字面整理，未获得能力或资格');
  addLog(s, `你整理了【${def.source}】的字面内容，只得到联系人与地点暗示；这不会授予配方可信度、能力或组织资格。`, 'info');
  advanceHours(s, 2);
  return { ok: true };
}

export function identifyOrganizationEvidence(s: GameState, organizationId: OrganizationId, npcId: string): ActionResult {
  const issue = organizationIdentificationIssue(s, organizationId, npcId);
  if (issue) return { ok: false, msg: issue };
  const def = leadDefForOrganization(organizationId);
  const lead = def && s.leads[def.id];
  if (!def || !lead) return { ok: false, msg: '线索数据缺失。' };
  lead.stage = 'identified';
  recordOrganizationRoute(s, organizationId, `npc_identified:${def.id}`, 'passed', npcId);
  lead.notes.push(`${findAnyNPC(s, npcId)?.name ?? npcId}确认了线索所指的组织`);
  if (organizationId === 'iron_and_blood' && !s.formulas.includes('hunter9')) {
    s.formulas.push('hunter9');
    pathwayLead(s, 'hunter').formulaStatus = 'unverified';
    lead.notes.push('维克多交出一份完整但仍需组织核验的猎人配方抄本');
  }
  addLog(s, organizationId === 'secret_order'
    ? '老尼尔逊确认暗记属于一支隐秘研究结社，并愿意代转介绍信；他明确表示自己不是该结社成员。'
    : `${findAnyNPC(s, npcId)?.name ?? npcId}确认了线索来源，并愿意安排下一步身份核验。`, 'good');
  advanceHours(s, 1);
  return { ok: true };
}

export function verifyOrganizationEvidence(s: GameState, organizationId: OrganizationId): ActionResult {
  if (s.atWork) return { ok: false, msg: '工作期间不能参加组织核验。' };
  if (isBeyonder(s)) return { ok: false, msg: '该入口只面向凡人。' };
  const def = leadDefForOrganization(organizationId);
  const lead = def && s.leads[def.id];
  if (!lead || lead.stage !== 'identified') return { ok: false, msg: '需要先由正确联系人辨认线索。' };
  if (organizationId === 'abraham_branch' && !s.diaryPages.diary_door_fragment?.operationalVerified) {
    return { ok: false, msg: '亚伯拉罕遗物还缺少“门与学徒残页”的真伪鉴定及交叉操作核验。' };
  }
  lead.stage = 'verified';
  lead.notes.push('原始线索真实性通过组织外围核验；不等于成员资格');
  recordOrganizationRoute(s, organizationId, `lead_verified:${def.id}`, 'passed');
  addLog(s, '外围核验确认了线索真实，但核验员没有交付可用配方、材料或任何能力。', 'good');
  advanceHours(s, 2);
  return { ok: true };
}

export function contactOrganization(s: GameState, organizationId: OrganizationId): ActionResult {
  if (s.atWork) return { ok: false, msg: '工作期间不能参加组织接触。' };
  if (isBeyonder(s)) return { ok: false, msg: '该候选流程只面向凡人。' };
  const def = leadDefForOrganization(organizationId);
  if (!def || s.leads[def.id].stage !== 'verified') return { ok: false, msg: '需要先完成线索真实性核验。' };
  const route = organizationRoute(s, organizationId);
  if (route.status !== 'unknown') return { ok: false, msg: '已经建立过该组织接触记录。' };
  route.status = 'contacted';
  route.routeStep = 'contacted';
  recordOrganizationRoute(s, organizationId, 'contacted', 'passed');
  addLog(s, organizationId === 'iron_and_blood'
    ? `你与【${organizationDef(organizationId)?.name}】的外围联系人建立正式接触。对方明确告知了下一次秘密集会的日期；你仍可同时核验其他组织，但尚未加入任何一方。`
    : `你与【${organizationDef(organizationId)?.name}】的外围联系人建立正式接触。你仍可同时核验其他组织，但尚未加入任何一方。`, 'system');
  advanceHours(s, 1);
  return { ok: true };
}

export function completeOrganizationQualification(s: GameState, organizationId: OrganizationId): ActionResult {
  if (s.atWork) return { ok: false, msg: '工作期间不能完成组织资格任务。' };
  if (isBeyonder(s)) return { ok: false, msg: '该候选流程只面向凡人。' };
  const route = organizationRoute(s, organizationId);
  if (route.status !== 'contacted') return { ok: false, msg: '尚未与该组织建立正式接触。' };
  if (s.stats.energy < 18) return { ok: false, msg: '你当前太过疲惫，无法完成这项资格任务。' };
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, 18) }]);
  route.status = 'qualified';
  route.routeStep = 'qualified';
  recordOrganizationRoute(s, organizationId, 'qualification', 'passed');
  addLog(s, `你完成了${organizationDef(organizationId)?.name}安排的资格任务：${organizationDef(organizationId)?.qualification}。资格本身不会赠送配方或材料。`, 'good');
  advanceHours(s, 3);
  return { ok: true };
}

export function joinOrganization(s: GameState, organizationId: OrganizationId): ActionResult {
  if (s.atWork) return { ok: false, msg: '工作期间不能签署组织成员约定。' };
  if (isBeyonder(s)) return { ok: false, msg: '该流程只面向尚未选定途径的凡人。' };
  const route = organizationRoute(s, organizationId);
  if (route.status !== 'qualified') return { ok: false, msg: '尚未取得该组织加入资格。' };
  const joined = joinedOrganization(s);
  if (joined && joined !== organizationId) return { ok: false, msg: `你已经加入${organizationDef(joined)?.name}，不能同时加入第二个组织。` };
  route.status = 'member';
  route.routeStep = 'member';
  recordOrganizationRoute(s, organizationId, 'membership', 'passed');
  addLog(s, `第一次确认完成：你加入【${organizationDef(organizationId)?.name}】，并接受：${organizationDef(organizationId)?.membership}。现在只能查看该组织实际掌握的途径库存，尚未锁定具体途径。`, 'system');
  return { ok: true };
}

export function openOrganizationOffers(s: GameState, organizationId: OrganizationId): ActionResult {
  const route = organizationRoute(s, organizationId);
  if (route.status !== 'member') return { ok: false, msg: '未加入组织，不能查看魔药报价。' };
  route.status = 'offer_pending';
  route.routeStep = 'offer_pending';
  recordOrganizationRoute(s, organizationId, 'offers_opened', 'passed');
  return { ok: true };
}

export function leaveOrganization(s: GameState, organizationId: OrganizationId): ActionResult {
  if (s.atWork) return { ok: false, msg: '工作期间不能办理退出组织。' };
  const route = organizationRoute(s, organizationId);
  if (!['member', 'offer_pending'].includes(route.status)) return { ok: false, msg: '只有尚未承诺途径的成员可以退出。' };
  route.status = 'qualified';
  route.routeStep = 'qualified';
  route.selectedPathway = undefined;
  recordOrganizationRoute(s, organizationId, 'membership_exit', 'declined', '未领取配方或材料');
  addLog(s, `你退出了${organizationDef(organizationId)?.name}。没有获得或带走配方、材料与组织权限。`, 'info');
  return { ok: true };
}

export function commitOrganizationPathway(s: GameState, organizationId: OrganizationId, pathwayId: string): ActionResult {
  if (s.atWork) return { ok: false, msg: '工作期间不能签署途径承诺。' };
  if (isBeyonder(s)) return { ok: false, msg: '你已经是非凡者。' };
  const route = organizationRoute(s, organizationId);
  if (route.status !== 'offer_pending') return { ok: false, msg: '未加入组织或尚未打开该组织报价。' };
  if (!getOrganizationOffers(s, organizationId).includes(pathwayId)) return { ok: false, msg: '该组织不掌握或未报价这条途径。' };
  const other = joinedOrganization(s);
  if (other !== organizationId) return { ok: false, msg: '组织成员身份与报价来源不匹配。' };
  const pathLead = pathwayLead(s, pathwayId);
  route.status = 'committed';
  route.routeStep = 'committed';
  route.selectedPathway = pathwayId;
  pathLead.organizationId = organizationId;
  pathLead.commitment = true;
  const preparation = organizationPreparation(organizationId);
  pathLead.currentSource = preparation.source;
  pathLead.routeStep = 'dose_ready';
  pathLead.preparationMode = preparation.mode;
  if (preparation.mode !== 'official_dose') {
    pathLead.formulaStatus = 'verified';
    if (!s.formulas.includes(`${pathwayId}9`)) s.formulas.push(`${pathwayId}9`);
    for (const source of Object.values(s.materialSources).filter(source => source.pathwayId === pathwayId && source.targetSequence === 9)) source.unlocked = true;
  }
  recordOrganizationRoute(s, organizationId, `commit:${pathwayId}`, 'passed');
  recordRoute(s, pathwayId, 'organization_commitment', 'passed', organizationId);
  addLog(s, `第二次确认完成：你在${organizationDef(organizationId)?.name}内锁定【${findPathway(pathwayId)?.name}】。其他组织与途径资格不能串用。`, 'good');
  return { ok: true };
}

export function materialCollectionIssue(s: GameState, sourceId: string, locationId: string): string | null {
  if (s.atWork) return '工作期间不能领取或采集定向材料。';
  const source = s.materialSources[sourceId];
  if (!source || !source.unlocked) return '该定向材料来源尚未由已加入组织解锁。';
  if (source.targetSequence === 8) {
    if (s.sequence !== 9 || s.pathwayId !== source.pathwayId) return '序列8材料授权与当前途径/序列不匹配。';
    if (!s.sequence8Progress || s.sequence8Progress.formulaStatus !== 'verified') return '序列8配方尚未通过所属组织审核。';
  }
  if (source.locationId !== locationId) return '所选地点与这份定向材料来源不匹配。';
  const route = pathwayLead(s, source.pathwayId);
  const committedAccess = route.commitment && route.organizationId === joinedOrganization(s);
  const progress = s.sequence8Progress;
  const auditedLegacyAccess = source.targetSequence === 8 && !!progress && progress.pathwayId === source.pathwayId
    && progress.formulaStatus === 'verified' && !progress.legacyIdentityAudit
    && hasLegacyIdentityAuditProvenance(progress) && progress.organizationId !== undefined
    && organizationDef(progress.organizationId)?.heldPathways.some(id => id === source.pathwayId);
  if (!committedAccess && !auditedLegacyAccess) return '材料来源与当前组织/途径承诺或旧身份审计不匹配。';
  if (source.remaining <= 0) return '这个一次性材料来源已经取用，读档不会刷新。';
  const location = LOCATIONS.find(candidate => candidate.id === locationId);
  if (!location) return '材料地点不存在。';
  const cost = energyCost(s, 8 + location.hours * 2);
  if (s.stats.energy < cost) return '你当前太过疲惫，无法按这条定向路线前往目标地点。';
  return null;
}

export function collectMaterialSource(s: GameState, sourceId: string, locationId: string): ActionResult {
  const issue = materialCollectionIssue(s, sourceId, locationId);
  if (issue) return { ok: false, msg: issue };
  const source = s.materialSources[sourceId];
  const location = LOCATIONS.find(candidate => candidate.id === locationId)!;
  const cost = energyCost(s, 8 + location.hours * 2);
  applyEffects(s, [{ k: 'energy', v: -cost }]);
  source.remaining--;
  s.items[source.itemId] = (s.items[source.itemId] ?? 0) + 1;
  if (!hasVisitedLocation(s, locationId)) s.visitedLocations.push(locationId);
  addLog(s, `你按组织提供的路线前往【${location.name}】，从定向来源取得【${findItem(source.itemId)?.name ?? source.itemId}】。交接人随即重新封存了库存。`, 'good');
  advanceHours(s, location.hours);
  return { ok: true };
}

export function diarySourceIssue(s: GameState, pageId: string): string | null {
  if (s.atWork) return '工作期间不能追查日记页。';
  const def = ROSELLE_DIARY_PAGE_DEFS.find(page => page.id === pageId);
  const page = s.diaryPages[pageId];
  if (!def || !page) return '未知日记页。';
  if (page.acquired) return '这页日记已经取得，不能重复刷新。';
  if (pageId === 'diary_org_rules') {
    const nightwatch = organizationRoute(s, 'nightwatch');
    if (!nightwatch.history.some(record => record.step === 'public_records')) return '需要先查阅地方报纸与教区公开档案。';
  } else if (pageId === 'diary_door_fragment') {
    if (!hasVisitedLocation(s, 'manor')) return '需要先实际完成雾林废弃庄园的冒险调查并发现书房暗格。';
  } else if (pageId === 'diary_false_formula') {
    if (!hasVisitedLocation(s, 'black_market')) return '需要先实际进入过黑市后巷。';
    const trustIssue = trustedNpcIssue(s, 'victor', VISIT_FAVOR);
    if (trustIssue) return trustIssue;
    if (npcLocation(findAnyNPC(s, 'victor')!, s.day, s.hour) !== '黑市后巷') return '这张可疑纸页只会在维克多的黑市作息中出现。';
  }
  return null;
}

export function discoverDiaryPage(s: GameState, pageId: string): ActionResult {
  const issue = diarySourceIssue(s, pageId);
  if (issue) return { ok: false, msg: issue };
  const def = ROSELLE_DIARY_PAGE_DEFS.find(page => page.id === pageId)!;
  const page = s.diaryPages[pageId];
  page.acquired = true;
  addLog(s, `你从${def.source}取得一张可疑纸页。只有取得后才能阅读其标题与内容；页面真假已经随存档固化。`, 'event');
  advanceHours(s, 1);
  return { ok: true };
}

export function decodeDiaryPage(s: GameState, pageId: string): ActionResult {
  if (s.atWork) return { ok: false, msg: '工作期间不能译读日记。' };
  const def = ROSELLE_DIARY_PAGE_DEFS.find(page => page.id === pageId);
  const page = s.diaryPages[pageId];
  if (!def || !page?.acquired) return { ok: false, msg: '需要先取得这页日记。' };
  if (!s.canReadRoselleScript) return { ok: false, msg: '你无法读懂罗塞尔使用的文字。' };
  if (page.decoded) return { ok: false, msg: '这页日记已经完成字面译读。' };
  page.decoded = true;
  addLog(s, `你直接读懂了页面文字：${def.clue} 字面译读不会给予能力、组织资格、已验证配方或调配知识。`, 'info');
  if (pageId === 'diary_door_fragment') {
    const lead = s.leads.abraham_door_map;
    lead.notes.push('罗塞尔日记提供了门扉线索，但不构成操作验证');
  }
  advanceHours(s, 2);
  return { ok: true };
}

export function diaryAuthenticationIssue(s: GameState, pageId: string, npcId: string): string | null {
  if (s.atWork) return '工作期间不能进行纸张与来源鉴定。';
  const def = ROSELLE_DIARY_PAGE_DEFS.find(page => page.id === pageId);
  const page = s.diaryPages[pageId];
  if (!def || !page?.decoded) return '真实性鉴定必须晚于取得和字面译读。';
  if (npcId !== 'nelson') return '这个人无法可靠鉴定罗塞尔时期纸张与墨水。';
  if (page.authenticity !== 'unknown') return '这页日记已经完成真实性鉴定。';
  return trustedNpcIssue(s, 'nelson', VISIT_FAVOR);
}

export function authenticateDiaryPage(s: GameState, pageId: string, npcId: string): ActionResult {
  const issue = diaryAuthenticationIssue(s, pageId, npcId);
  if (issue) return { ok: false, msg: issue };
  const page = s.diaryPages[pageId];
  page.authenticity = page.truth;
  page.operationalVerified = false;
  addLog(s, page.truth === 'forged'
    ? '老尼尔逊确认纸张、墨水与笔迹都是后世伪造；其中所谓配方永久标记为伪作，不能被验证。'
    : '老尼尔逊确认纸张与笔迹属于罗塞尔时期，但强调：真迹只证明作者写过这些话，不代表内容已经完成可操作核验。', page.truth === 'forged' ? 'bad' : 'good');
  advanceHours(s, 1);
  return { ok: true };
}

export function verifyDiaryPageOperationally(s: GameState, pageId: string, npcId: string): ActionResult {
  if (s.atWork) return { ok: false, msg: '工作期间不能进行跨来源操作核验。' };
  const page = s.diaryPages[pageId];
  if (!page?.decoded || page.authenticity === 'unknown') return { ok: false, msg: '需要先完成字面译读与纸张真伪鉴定。' };
  if (page.authenticity === 'forged' || page.truth === 'forged') return { ok: false, msg: '伪造页面永久不能通过操作核验。' };
  if (page.operationalVerified) return { ok: false, msg: '这页真迹已经完成过交叉操作核验。' };
  if (pageId === 'diary_org_rules') {
    if (npcId !== 'evelyn') return { ok: false, msg: '这页制度记录需要由伊芙琳与教会档案交叉核验。' };
    if (organizationRoute(s, 'nightwatch').status === 'unknown') return { ok: false, msg: '需要先与值夜者建立正式接触。' };
    const issue = trustedNpcIssue(s, 'evelyn', VISIT_FAVOR);
    if (issue) return { ok: false, msg: issue };
  } else if (pageId === 'diary_door_fragment') {
    if (npcId !== 'nelson') return { ok: false, msg: '门扉残页需要由老尼尔逊与外围担保人交叉核验。' };
    if (s.leads.abraham_door_map?.stage !== 'identified') return { ok: false, msg: '需要先让老尼尔逊辨认庄园门框夹层里的空间草图。' };
    const issue = trustedNpcIssue(s, 'nelson', VISIT_FAVOR);
    if (issue) return { ok: false, msg: issue };
  } else {
    return { ok: false, msg: '这页没有可信的操作核验路径。' };
  }
  page.operationalVerified = true;
  addLog(s, '交叉证据只确认了这页真迹中可核对的制度或地点关系；它没有直接授予配方可信度、能力或组织资格。', 'good');
  advanceHours(s, 1);
  return { ok: true };
}

const lastPassedRouteDay = (lead: { history: PathwayLead['history'] }, step: string): number | undefined =>
  [...lead.history].reverse().find(item => item.step === step && item.outcome === 'passed')?.day;

export const isChurchOfficeHours = (hour: number) => hour >= 9 && hour < 17;
export const isClocktowerTraceHours = (hour: number) => hour >= 22 || hour < 2;

export type OfficialTimedAction = 'report' | 'screening' | 'stabilization' | 'interview' | 'night_watch' | 'offer' | 'commitment' | 'dose';

/** 供引擎与 UI 共用的办理时间门槛。 */
export function officialTimingIssue(s: GameState, action: OfficialTimedAction): string | null {
  const lead = organizationRoute(s, 'nightwatch');
  if (action === 'night_watch') {
    if (!isClocktowerTraceHours(s.hour) && s.hour < 18) return '观察勤务只在18:00至凌晨2:00开始。';
    const interviewDay = lastPassedRouteDay(lead, 'confidential_interview');
    if (interviewDay !== undefined && s.day <= interviewDay) return '观察勤务最早安排在面谈后的下一天。';
    return null;
  }
  if (!isChurchOfficeHours(s.hour)) return '教会办理与预约时段为9:00至17:00。';
  if (action === 'interview') {
    const requestDay = lastPassedRouteDay(lead, 'screening_request');
    if (requestDay !== undefined && s.day <= requestDay) return '保密面谈最早安排在申请后的下一天。';
  }
  if (action === 'dose') {
    const watchDay = lastPassedRouteDay(lead, 'night_observation');
    if (watchDay !== undefined && s.day <= watchDay) return '官方服药最早安排在观察勤务后的下一天。';
  }
  return null;
}

/** 确定性的世俗前置：只核对公开记录，不改变 awareness。 */
export function researchClocktowerRumors(s: GameState): ActionResult {
  if (s.atWork) return { ok: false, msg: '工作期间不能去档案室查资料。' };
  if (isBeyonder(s)) return { ok: false, msg: '这条公开记录只为尚未接触非凡世界的普通人提供入口。' };
  if (s.awareness !== 'ordinary') return { ok: false, msg: '你已亲历异常，无需再从公开传闻开始。' };
  const route = organizationRoute(s, 'nightwatch');
  const lead = s.leads.nightwatch_clocktower;
  if (lead.stage !== 'unknown' || route.routeStep !== 'none') return { ok: false, msg: '公开记录已经查阅过了。' };
  if (s.stats.energy < 8) return { ok: false, msg: '你当前太过疲惫，无法耐心查阅报纸与市政记录。' };
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, 8) }]);
  lead.stage = 'found';
  lead.notes.push('仅取得夜间扰民与失踪的世俗传闻');
  route.routeStep = 'public_rumor';
  acquireClue(s, 'clocktower_public_complaints');
  recordOrganizationRoute(s, 'nightwatch', 'public_records', 'started', '仅取得夜间扰民与失踪的世俗传闻');
  addLog(s, '你在地方报纸和市政投诉簿中找到同一座旧钟楼：多起夜间扰民记录与两宗失踪传闻反复指向那里。档案还引用了一组维修工单编号，但原件不在当前卷宗里。', 'info');
  addLog(s, '✦ 世俗线索已记录。你可以在白天继续核对维修档案，也可以在22:00至凌晨2:00前往观察；这些记录都不能证明超自然现象。', 'system');
  advanceHours(s, 2);
  return { ok: true };
}

export function compareClocktowerRepairRecordsIssue(s: GameState): string | null {
  if (s.atWork) return '工作期间不能去市政工程档案室。';
  if (isBeyonder(s) || s.awareness !== 'ordinary') return '这项世俗档案比对只面向尚未确认异常的普通人。';
  const route = organizationRoute(s, 'nightwatch');
  const lead = s.leads.nightwatch_clocktower;
  if (route.routeStep !== 'public_rumor' || lead.stage !== 'found' || !hasClue(s, 'clocktower_public_complaints')) return '请先整理旧钟楼的公开投诉记录。';
  if (hasClue(s, 'clocktower_repair_orders')) return '维修工单已经比对并记入调查笔记。';
  if (!isChurchOfficeHours(s.hour)) return '市政工程档案室只在9:00至17:00开放。';
  if (s.stats.energy < 8) return '你当前太过疲惫，无法完成细致的工单比对。';
  return null;
}

export function compareClocktowerRepairRecords(s: GameState): ActionResult {
  const issue = compareClocktowerRepairRecordsIssue(s);
  if (issue) return { ok: false, msg: issue };
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, 8) }]);
  acquireClue(s, 'clocktower_repair_orders');
  s.leads.nightwatch_clocktower.notes.push('维修工单显示异响总在无人施工时出现');
  addLog(s, '你把投诉日期与维修工单逐页对照：每次异响都发生在工队撤离之后，几名维修工还分别记下了方向相反的影子和无故停摆的怀表。彼此独立的记录终于拼出一条可追踪的规律。', 'info');
  addLog(s, '✦ 维修工单已记入调查笔记。它不能替你面对钟楼里的东西，但能让你知道该观察哪里。', 'system');
  advanceHours(s, 2);
  return { ok: true };
}

export function requestManorAddressIssue(s: GameState): string | null {
  if (s.atWork) return '工作期间不能去古书店追问旧地址。';
  if (isBeyonder(s)) return '这条地址线索只为尚未选定途径的普通人保留。';
  if (hasClue(s, 'manor_address')) return '那处旧宅的路线已经记入调查笔记。';
  if (s.leads.abraham_door_map.stage !== 'unknown') return '你已经走过那条路，无需再追问地址。';
  const trusted = trustedNpcIssue(s, 'nelson', VISIT_FAVOR);
  if (trusted) return trusted;
  if (s.stats.energy < 6) return '你当前太过疲惫，无法继续核对老地图。';
  return null;
}

export function requestManorAddress(s: GameState): ActionResult {
  const issue = requestManorAddressIssue(s);
  if (issue) return { ok: false, msg: issue };
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, 6) }]);
  acquireClue(s, 'manor_address', 'npc', 'nelson');
  addLog(s, '老尼尔逊没有说那处旧宅里藏着什么，只从一册旧地图上抄下一条穿过雾林的小路，并叮嘱你不要在天黑后轻易推门。', 'info');
  addLog(s, '✦ 一处少有人知道的旧宅路线已记入调查笔记。', 'system');
  advanceHours(s, 1);
  return { ok: true };
}

function dockManifestBaseIssue(s: GameState): string | null {
  if (s.atWork) return '工作期间不能离岗调查码头档案。';
  if (isBeyonder(s)) return '这条世俗调查只属于尚未成为非凡者的普通人。';
  if (!hasVisitedLocation(s, 'docks')) return '需要先亲自去过东区码头，才能核对当地记录。';
  if (s.leads.iron_blood_token.stage !== 'unknown') return '异常仓单已经取得，无需重复追查。';
  if (!isChurchOfficeHours(s.hour)) return '码头账房与公开档案只在9:00至17:00间可以查阅。';
  return null;
}

export function inspectDockMissingReportsIssue(s: GameState): string | null {
  if (s.atWork) return '工作期间不能离岗查阅失踪登记。';
  if (isBeyonder(s)) return '这条公开登记只属于尚未成为非凡者的普通人。';
  if (s.currentLocation?.locationId !== 'docks') return '需要先抵达东区码头，才能核对当地的公开失踪登记。';
  if (s.leads.iron_blood_token.stage !== 'unknown') return '异常仓单已经取得，无需重新查阅失踪登记。';
  if (hasClue(s, 'dock_missing_reports')) return '失踪登记已经记入调查笔记。';
  if (!isChurchOfficeHours(s.hour)) return '治安所与公开档案室只在9:00至17:00间可以查阅。';
  if (s.stats.energy < 8) return '你当前太过疲惫，无法耐心核对名册。';
  return null;
}

export function inspectDockMissingReports(s: GameState): ActionResult {
  const issue = inspectDockMissingReportsIssue(s);
  if (issue) return { ok: false, msg: issue };
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, 8) }]);
  // 这项登记只能在码头现场办理；成功核对本身也构成一次真实到访，
  // 后续货运档案步骤无需再强迫玩家做一次泛化“探索”。
  recordLocationCompletion(s, 'docks');
  acquireClue(s, 'dock_missing_reports');
  addLog(s, '你把治安所的失踪报案与码头公布的临时工名册逐项对照，确认有几个名字都曾在同一片仓区工作。', 'info');
  addLog(s, '✦ 公开失踪登记已记入调查笔记。它只能证明人员去向可疑，还需要货运记录作为旁证。', 'system');
  advanceHours(s, 2);
  return { ok: true };
}

export function compareDockCargoRecordsIssue(s: GameState): string | null {
  if (s.atWork) return '工作期间不能离岗调查码头档案。';
  if (isBeyonder(s)) return '这条世俗调查只属于尚未成为非凡者的普通人。';
  if (s.leads.iron_blood_token.stage !== 'unknown') return '异常仓单已经取得，无需重复追查。';
  if (!hasClue(s, 'dock_missing_reports')) return '请先核对码头的公开失踪登记。';
  const issue = dockManifestBaseIssue(s);
  if (issue) return issue;
  if (hasClue(s, 'dock_manifest_discrepancy')) return '货运记录已经比对并记入调查笔记。';
  if (s.stats.energy < 8) return '你当前太过疲惫，无法继续比对货运档案。';
  return null;
}

export function compareDockCargoRecords(s: GameState): ActionResult {
  const issue = compareDockCargoRecordsIssue(s);
  if (issue) return { ok: false, msg: issue };
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, 8) }]);
  acquireClue(s, 'dock_manifest_discrepancy');
  addLog(s, '你在货运备份中找到了一组对不上的记录：同一批货物换过船名和库位，却始终由那几名失踪工人经手。', 'info');
  addLog(s, '✦ 货运记录旁证已记入调查笔记。这些缺口足以指向一批值得重新查找的旧仓单。', 'system');
  advanceHours(s, 2);
  return { ok: true };
}

export function traceDockMarkedManifestIssue(s: GameState): string | null {
  if (s.atWork) return '工作期间不能离岗调查码头档案。';
  if (isBeyonder(s)) return '这条世俗调查只属于尚未成为非凡者的普通人。';
  if (s.leads.iron_blood_token.stage !== 'unknown') return '异常仓单已经取得，无需重复追查。';
  if (!hasClue(s, 'dock_missing_reports')) return '调查笔记里还缺少公开失踪登记。';
  const issue = dockManifestBaseIssue(s);
  if (issue) return issue;
  if (s.stats.energy < 15) return '你当前太过疲惫，无法完成这次细致追查。';
  const check = evaluateExplorationCheck(s, 'dock_manifest_trace');
  if (check.reason === 'missing_required_clue') return '调查笔记里还缺少公开失踪登记。';
  if (check.reason === 'unknown_check') return '这项码头调查暂时无法继续，请稍后再试。';
  return null;
}

export function traceDockMarkedManifest(s: GameState): ActionResult {
  const issue = traceDockMarkedManifestIssue(s);
  if (issue) return { ok: false, msg: issue };
  const check = evaluateExplorationCheck(s, 'dock_manifest_trace');
  if (check.reason === 'missing_required_clue') return { ok: false, msg: '调查笔记里还缺少公开失踪登记。' };
  if (check.reason === 'unknown_check') return { ok: false, msg: '这项码头调查暂时无法继续，请稍后再试。' };
  recordExplorationAttempt(s, check);
  if (check.reason === 'insufficient') {
    applyEffects(s, [{ k: 'energy', v: -energyCost(s, 5) }]);
    addLog(s, '你在仓单房里来回翻找，却无法把失踪者姓名、货物流向和库位变更连成可靠的追查顺序。', 'info');
    addLog(s, '也许应该再查看货运记录的备份，或先积累更多整理档案的经验。', 'system');
    advanceHours(s, 1);
    return { ok: true, outcome: 'blocked' };
  }
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, 15) }]);
  acquireClue(s, 'dock_marked_manifest');
  const lead = s.leads.iron_blood_token;
  lead.stage = 'found';
  lead.notes.push('从货运缺口中追查到一份留有陌生印记的旧仓单');
  recordOrganizationRoute(s, 'iron_and_blood', 'world_entry:iron_blood_token', 'passed', 'dock_manifest_trace');
  addLog(s, '你按照人员名册与货物转运次序，终于从被错放的旧档里抽出一份仓单。纸面的油污下留着一枚无法从公开记录解释的印记。', 'event');
  addLog(s, '✦ 异常仓单已记入调查笔记。你只能确认它值得整理和请可信的码头熟人辨认，尚不知道它指向何方。', 'system');
  advanceHours(s, 2);
  return { ok: true, outcome: 'passed' };
}

/** 主动调查一个固定异常，不依赖随机事件池；玩家也可以永远不触碰它。 */
export function traceClocktowerAnomaly(s: GameState): ActionResult {
  if (s.atWork) return { ok: false, msg: '工作期间不能去追查钟楼异响。' };
  if (isBeyonder(s)) return { ok: false, msg: '这条记录只属于尚未接触非凡世界的普通人。' };
  if (s.awareness !== 'ordinary') return { ok: false, msg: '你已经确认过异常存在，无需重复调查。' };
  const route = organizationRoute(s, 'nightwatch');
  const lead = s.leads.nightwatch_clocktower;
  if (route.routeStep !== 'public_rumor' || lead.stage !== 'found') return { ok: false, msg: '请先查阅地方报纸和市政失修记录，确认值得追查的世俗线索。' };
  if (!isClocktowerTraceHours(s.hour)) return { ok: false, msg: '钟楼异常只在22:00至凌晨2:00之间可追查。' };
  if (s.stats.energy < 15) return { ok: false, msg: '你当前太过疲惫，贸然追查旧钟楼并不安全。' };
  const check = evaluateExplorationCheck(s, 'clocktower_night_trace');
  if (check.reason === 'missing_required_clue') {
    return { ok: false, msg: '调查笔记里缺少支撑夜间追查的基础记录，请先核对旧钟楼的公开投诉。' };
  }
  if (check.reason === 'unknown_check') {
    return { ok: false, msg: '这项调查暂时无法继续，请稍后再试。' };
  }
  recordExplorationAttempt(s, check);
  if (check.reason === 'insufficient') {
    applyEffects(s, [{ k: 'energy', v: -energyCost(s, 5) }]);
    addLog(s, '你在旧钟楼外围守了很久，却始终无法把投诉中的时间、声音与现场痕迹连成一条可靠路线。继续贸然深入只会在雾里迷失。', 'info');
    addLog(s, '也许该去核对被分开归档的维修工单，或先从别的调查中磨练观察与推理。今晚你只能暂时退回街灯下。', 'system');
    advanceHours(s, 1);
    return { ok: true, outcome: 'blocked' };
  }
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, 15) }, { k: 'san', v: -3 }, { k: 'item', id: 'anomaly_evidence', v: 1 }, { k: 'flag', id: 'met_beyonder', v: 1 }]);
  s.awareness = 'witness';
  lead.stage = 'identified';
  lead.notes.push('取得染着冷灰的铜质铭牌');
  route.routeStep = 'evidence_ready';
  recordOrganizationRoute(s, 'nightwatch', 'clocktower_witness', 'started', '取得染着冷灰的铜质铭牌');
  addLog(s, '你循着停摆钟楼的午夜敲响追查到一名失去影子的伤者。黑风衣人封锁现场前，你捡到一枚染着冷灰的铜质铭牌。你无法解释所见，但证物真实存在。', 'event');
  addLog(s, '✦ 异常记录已建立。你可以把证物交给圣赛琳娜教堂的伊芙琳；也可以就此停下，继续普通生活。', 'system');
  advanceHours(s, 3);
  return { ok: true, outcome: 'passed' };
}

export function reportAnomalyToEvelyn(s: GameState): ActionResult {
  if (s.atWork) return { ok: false, msg: '工作期间不能前往教堂上报。' };
  if (isBeyonder(s)) return { ok: false, msg: '已成为非凡者，不能进入凡人候选上报流程。' };
  if (s.awareness !== 'witness') return { ok: false, msg: '你还没有可上报的亲历异常。' };
  if ((s.items.anomaly_evidence ?? 0) <= 0) return { ok: false, msg: '需要带上旧钟楼取得的铜质铭牌作为证物。' };
  const route = organizationRoute(s, 'nightwatch');
  const lead = s.leads.nightwatch_clocktower;
  if (route.routeStep !== 'evidence_ready' || lead.stage !== 'identified') return { ok: false, msg: '这份证物不属于当前官方路线记录。' };
  const timing = officialTimingIssue(s, 'report');
  if (timing) return { ok: false, msg: timing };
  s.items.anomaly_evidence--;
  s.awareness = 'informed';
  lead.stage = 'verified';
  lead.notes.push('证物由值夜者收存并确认异常');
  route.status = 'contacted';
  route.routeStep = 'reported';
  recordOrganizationRoute(s, 'nightwatch', 'report_to_evelyn', 'passed', '证物由值夜者收存并确认异常');
  applyEffects(s, [{ k: 'favor', id: 'evelyn', v: 8 }, { k: 'knowledge', id: 'occult_theory' }]);
  addLog(s, '伊芙琳先收走证物，再用三种彼此矛盾的说法反复询问。最后她承认：你遇见的不是普通案件，教会一直在管控这类危险。', 'event');
  addLog(s, '✦ 认知阶段：知情。你获准申请候选审查，但知情不等于获得配方、能力或晋升资格。', 'system');
  advanceHours(s, 2);
  return { ok: true };
}

export function officialScreeningMissing(s: GameState): string[] {
  const missing: string[] = [];
  if (isBeyonder(s)) missing.push('已是非凡者，不能申请凡人候选审查');
  if (s.awareness !== 'informed') missing.push('尚未由伊芙琳确认异常');
  if (s.stats.san < 60) missing.push('精神状态尚不稳定');
  if (s.stats.cor > 15) missing.push('异常侵蚀仍过于明显');
  if (s.tags.includes('fugitive')) missing.push('在逃身份不接受官方审查');
  return missing;
}

export function officialStabilizationIssue(s: GameState): string | null {
  if (isBeyonder(s)) return '已成为非凡者，不能使用凡人候选稳定观察。';
  if (s.awareness !== 'informed') return '只有已向伊芙琳上报并确认异常的知情者才能申请稳定观察。';
  const lead = organizationRoute(s, 'nightwatch');
  if (lead.status !== 'contacted' || !['reported', 'declined'].includes(lead.routeStep)) return '当前不在可恢复的官方候选节点。';
  if (s.stats.cor <= 15) return '你的状态已回到候选审查认可的安全范围，无需继续稳定观察。';
  if (lastPassedRouteDay(lead, 'official_stabilization') === s.day) return '今天已经完成过一次稳定观察，请次日再来。';
  const timing = officialTimingIssue(s, 'stabilization');
  if (timing) return timing;
  return null;
}

/** 污染超标后的可恢复路径：每日最多一次，逐档降低，不能一键清零。 */
export function undergoOfficialStabilization(s: GameState): ActionResult {
  if (s.atWork) return { ok: false, msg: '工作期间不能参加官方稳定观察。' };
  const issue = officialStabilizationIssue(s);
  if (issue) return { ok: false, msg: issue };
  if (s.stats.energy < 15) return { ok: false, msg: '你当前太过疲惫，不适合接受两小时稳定观察。' };
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, 15) }, { k: 'cor', v: -12 }]);
  recordOrganizationRoute(s, 'nightwatch', 'official_stabilization', 'passed', `稳定观察后污染降至${s.stats.cor}`);
  addLog(s, `值夜者在封闭观察室里用镇静香气、规律钟摆与记录问答帮助你稳定状态。结束时，记录员只说还需不需要次日再来，没有向你解释具体量表。`, 'good');
  advanceHours(s, 2);
  return { ok: true };
}

export function requestOfficialScreening(s: GameState): ActionResult {
  if (s.atWork) return { ok: false, msg: '工作期间不能申请教会审查。' };
  if (isBeyonder(s)) return { ok: false, msg: '已成为非凡者，不能申请凡人候选审查。' };
  const lead = organizationRoute(s, 'nightwatch');
  if (lead.status !== 'contacted' || !['reported', 'declined'].includes(lead.routeStep)) return { ok: false, msg: '请先把旧钟楼证物正式上报给伊芙琳。' };
  const missing = officialScreeningMissing(s);
  if (missing.length) {
    recordOrganizationRoute(s, 'nightwatch', 'screening_request', 'failed', missing.join('、'));
    return { ok: false, msg: '审查条件不足：' + missing.join('、') };
  }
  const timing = officialTimingIssue(s, 'screening');
  if (timing) return { ok: false, msg: timing };
  lead.routeStep = 'screening_scheduled';
  recordOrganizationRoute(s, 'nightwatch', 'screening_request', 'passed');
  addLog(s, '伊芙琳登记了你的申请：「先说清楚，审查通过也只代表你有资格听取报价，不代表你必须接受。」', 'system');
  advanceHours(s, 1);
  return { ok: true };
}

export function attendOfficialInterview(s: GameState): ActionResult {
  if (s.atWork) return { ok: false, msg: '工作期间不能参加审查面谈。' };
  if (isBeyonder(s)) return { ok: false, msg: '已成为非凡者，不能参加凡人候选面谈。' };
  const lead = organizationRoute(s, 'nightwatch');
  if (lead.status !== 'contacted' || lead.routeStep !== 'screening_scheduled') return { ok: false, msg: '尚未安排官方审查面谈。' };
  const timing = officialTimingIssue(s, 'interview');
  if (timing) return { ok: false, msg: timing };
  if (s.stats.energy < 10) return { ok: false, msg: '你当前太过疲惫，不适合参加这场保密面谈。' };
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, 10) }]);
  lead.routeStep = 'interview_passed';
  recordOrganizationRoute(s, 'nightwatch', 'confidential_interview', 'passed', '身份、动机与保密能力核验通过');
  addLog(s, '两名值夜者核对你的住址、工作与证词。伊芙琳最后问：「如果知道真相意味着从此被它盯上，你还要继续吗？」你通过了面谈，但还没有作出承诺。', 'event');
  advanceHours(s, 2);
  return { ok: true };
}

export function completeOfficialNightWatch(s: GameState): ActionResult {
  if (s.atWork) return { ok: false, msg: '工作期间不能参加观察勤务。' };
  if (isBeyonder(s)) return { ok: false, msg: '已成为非凡者，不能参加凡人候选观察勤务。' };
  const lead = organizationRoute(s, 'nightwatch');
  if (lead.status !== 'contacted' || lead.routeStep !== 'interview_passed') return { ok: false, msg: '请先完成保密面谈。' };
  const timing = officialTimingIssue(s, 'night_watch');
  if (timing) return { ok: false, msg: timing };
  if (s.stats.energy < 20) return { ok: false, msg: '你当前的状态撑不住四小时夜间观察。' };
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, 20) }, { k: 'san', v: -2 }]);
  lead.status = 'qualified';
  lead.routeStep = 'offer_pending';
  addLog(s, '你在封锁线外跟完整整一班，只记录、不触碰、不擅自追逐。天亮前，伊芙琳确认你能服从安全边界，并向你说明不眠者候选名额。', 'event');
  addLog(s, '✦ 审查通过。下一步是听取正式报价；在最终承诺前，你仍可退出。', 'system');
  advanceHours(s, 4);
  recordOrganizationRoute(s, 'nightwatch', 'night_observation', 'passed', '完成封锁线外围观察勤务');
  return { ok: true };
}

/** 第一次确认：只确认已读懂报价，不锁定途径，也不发放魔药。 */
export function acceptOfficialOffer(s: GameState): ActionResult {
  if (s.atWork) return { ok: false, msg: '工作期间不能处理值夜者候选文件。' };
  if (isBeyonder(s)) return { ok: false, msg: '已成为非凡者，不能接受凡人候选报价。' };
  const lead = organizationRoute(s, 'nightwatch');
  if (lead.status !== 'qualified' || lead.routeStep !== 'offer_pending') return { ok: false, msg: '当前没有可确认的官方候选报价。' };
  const timing = officialTimingIssue(s, 'offer');
  if (timing) return { ok: false, msg: timing };
  return joinOrganization(s, 'nightwatch');
}

export function declineOfficialOffer(s: GameState): ActionResult {
  if (s.atWork) return { ok: false, msg: '工作期间不能处理值夜者候选文件。' };
  if (isBeyonder(s)) return { ok: false, msg: '已成为非凡者，不能处理凡人候选报价。' };
  const lead = organizationRoute(s, 'nightwatch');
  if (!['qualified', 'member', 'offer_pending'].includes(lead.status)) return { ok: false, msg: '当前没有可拒绝的官方报价。' };
  const timing = officialTimingIssue(s, 'offer');
  if (timing) return { ok: false, msg: timing };
  lead.status = 'contacted';
  lead.routeStep = 'declined';
  recordOrganizationRoute(s, 'nightwatch', 'official_offer', 'declined');
  addLog(s, '你拒绝了候选报价。伊芙琳收起文件，没有威胁，也没有赠送配方：「继续过普通生活，是完全正当的选择。」', 'info');
  return { ok: true };
}

/** 第二次确认：签署誓约并把资格严格锁定到不眠者途径。 */
export function confirmOfficialCommitment(s: GameState): ActionResult {
  if (s.atWork) return { ok: false, msg: '工作期间不能签署值夜者誓约。' };
  if (isBeyonder(s)) return { ok: false, msg: '已成为非凡者，不能签署凡人候选誓约。' };
  const lead = organizationRoute(s, 'nightwatch');
  if (!['member', 'offer_pending'].includes(lead.status)) return { ok: false, msg: '请先加入值夜者并查看组织报价。' };
  const timing = officialTimingIssue(s, 'commitment');
  if (timing) return { ok: false, msg: timing };
  if (lead.status === 'member') openOrganizationOffers(s, 'nightwatch');
  return commitOrganizationPathway(s, 'nightwatch', 'sleepless');
}

// ============ 黑市与配方交易 ============
export function buyItem(s: GameState, itemId: string, price: number, sellerId?: string): ActionResult {
  if (s.atWork) return { ok: false, msg: '工作期间不能外出交易。' };
  if (itemId === 'occult_notes') return { ok: false, msg: '神秘学札记已改为固定书目，只能从可信书源取得。' };
  const authorizedSource = Object.values(s.materialSources).find(source => source.itemId === itemId
    && source.targetSequence === 8 && source.acquisitionMode === 'purchase' && source.unlocked && source.remaining > 0
    && source.pathwayId === s.pathwayId);
  if (SEQUENCE8_ITEM_IDS.has(itemId) && !authorizedSource) {
    return { ok: false, msg: '序列8材料默认不进入通用货架；需要当前组织明确解锁对应购买来源。' };
  }
  if (!isBeyonder(s) && OCCULT_SHOP_ITEM_IDS.has(itemId)) {
    return { ok: false, msg: '普通顾客看不到神秘学札记与非凡材料货架；本阶段尚未解锁可信黑市渠道。' };
  }
  if (s.pence < price) return { ok: false, msg: '钱不够。' };
  s.pence -= price;
  s.items[itemId] = (s.items[itemId] ?? 0) + 1;
  if (authorizedSource) authorizedSource.remaining--;
  if (sellerId && !isMet(s, sellerId)) {
    acquaint(s, sellerId, 3);
    const seller = findAnyNPC(s, sellerId);
    addLog(s, `✦ 结交：生意做成，${seller?.name ?? '卖家'}记住了你的脸。`, 'good');
  }
  addLog(s, `你买下了【${findItem(itemId)?.name ?? itemId}】。`, 'info');
  return { ok: true };
}

export function getAuthorizedShopItems(s: GameState): string[] {
  return Object.values(s.materialSources)
    .filter(source => source.targetSequence === 8 && source.acquisitionMode === 'purchase' && source.unlocked
      && source.remaining > 0 && source.pathwayId === s.pathwayId)
    .map(source => source.itemId);
}

function shopOpenAt(shopId: string, hour: number): boolean {
  const shop = SHOP_DEFS.find(candidate => candidate.id === shopId);
  if (!shop) return false;
  return shop.openTo > 24
    ? hour >= shop.openFrom || hour < shop.openTo - 24
    : hour >= shop.openFrom && hour < shop.openTo;
}

export function getShopInventory(s: GameState, shopId: string): { itemId: string; price: number }[] {
  const shop = SHOP_DEFS.find(candidate => candidate.id === shopId);
  if (!shop || s.currentLocation?.locationId !== shop.locationId || !shopOpenAt(shopId, s.hour)) return [];
  if (!shop.organizationAuthorized) return shop.inventory.map(item => ({ ...item }));
  if (!isBeyonder(s)) return [];
  return getAuthorizedShopItems(s).map(itemId => ({ itemId, price: findItem(itemId)?.price ?? 0 })).filter(item => item.price > 0);
}

export function buyFromShop(s: GameState, shopId: string, itemId: string): ActionResult {
  const shop = SHOP_DEFS.find(candidate => candidate.id === shopId);
  if (!shop || s.currentLocation?.locationId !== shop.locationId) return { ok: false, msg: '需要亲自到对应店铺才能购买。' };
  if (!shopOpenAt(shopId, s.hour)) return { ok: false, msg: '店铺现在没有营业。' };
  const offered = getShopInventory(s, shopId).find(item => item.itemId === itemId);
  if (!offered) return { ok: false, msg: '这件商品不在当前固定货单中。' };
  if (s.pence < offered.price) return { ok: false, msg: '钱不够。' };
  applyEffects(s, [{ k: 'money', v: -offered.price }, { k: 'item', id: itemId, v: 1 }]);
  const source = Object.values(s.materialSources).find(candidate => candidate.itemId === itemId && candidate.unlocked && candidate.remaining > 0);
  if (shop.organizationAuthorized && source) source.remaining--;
  addLog(s, `你按店铺明码标价买下了【${findItem(itemId)?.name ?? itemId}】。`, 'info');
  return { ok: true };
}

export function buyFormula(s: GameState, formulaId: string, price: number, sellerId?: string): ActionResult {
  if (s.atWork) return { ok: false, msg: '工作期间不能外出交易。' };
  if (!isBeyonder(s)) return { ok: false, msg: '普通顾客看不到魔药配方货架；必须先获得具体渠道与担保。' };
  if (formulaId.endsWith('8')) return { ok: false, msg: '序列8配方不在通用商店出售，只能由所属组织审核后定向提供。' };
  if (s.pence < price) return { ok: false, msg: '钱不够。' };
  if (s.formulas.includes(formulaId)) return { ok: false, msg: '这份配方你已经有了。' };
  s.pence -= price;
  s.formulas.push(formulaId);
  if (sellerId && !isMet(s, sellerId)) {
    acquaint(s, sellerId, 3);
    const seller = findAnyNPC(s, sellerId);
    addLog(s, `✦ 结交：这笔买卖让你和${seller?.name ?? '卖家'}搭上了线。`, 'good');
  }
  addLog(s, `✦ 获得魔药配方：【${formulaName(formulaId)}】`, 'good');
  if (isBeyonder(s)) applyEffects(s, [{ k: 'exposure', v: 2 }]);
  return { ok: true };
}

// ============ 服食魔药（普通人→序列9） ============
export function canDrink(s: GameState, pathwayId: string): { ok: boolean; missing: string[]; mode?: PreparationMode } {
  if (isBeyonder(s)) return { ok: false, missing: ['你已是非凡者'] };
  const pw = findPathway(pathwayId);
  if (!pw) return { ok: false, missing: ['途径数据缺失'] };
  const committed = Object.entries(s.pathwayLeads).find(([, lead]) => lead.commitment);
  if (committed && committed[0] !== pathwayId) return { ok: false, missing: [`资格已锁定到${findPathway(committed[0])?.name ?? committed[0]}途径`] };
  const lead = pathwayLead(s, pathwayId);
  if (!lead.commitment || !lead.organizationId) return { ok: false, missing: ['尚未在已加入组织内承诺这条途径'] };
  const orgRoute = organizationRoute(s, lead.organizationId);
  if (orgRoute.status !== 'committed' || orgRoute.selectedPathway !== pathwayId || joinedOrganization(s) !== lead.organizationId) {
    return { ok: false, missing: ['组织成员身份、报价与途径准备不匹配'] };
  }
  const expectedPreparation = organizationPreparation(lead.organizationId);
  if (lead.preparationMode === 'official_dose') {
    if (lead.currentSource !== expectedPreparation.source || lead.preparationMode !== expectedPreparation.mode) {
      return { ok: false, missing: ['途径来源或准备方式与组织记录不匹配'] };
    }
    if (!['nightwatch', 'psychology_alchemists'].includes(lead.organizationId) || lead.routeStep !== 'dose_ready') {
      return { ok: false, missing: ['官方成品魔药资格与当前途径不匹配'] };
    }
    return { ok: true, missing: [], mode: 'official_dose' };
  }
  if (!s.formulas.includes(pathwayId + '9')) return { ok: false, missing: ['没有配方'] };
  if (lead.formulaStatus !== 'verified') return { ok: false, missing: ['配方尚未由可信渠道验证'] };
  if (!['self_brew', 'supervised_brew', 'characteristic_brew'].includes(lead.preparationMode ?? '')) {
    return { ok: false, missing: ['尚未解锁明确的调配准备方式'] };
  }
  if (lead.preparationMode === 'self_brew' && !s.knowledge.includes('potion_brew')) {
    return { ok: false, missing: ['自行调配需要可信训练与魔药调配知识'] };
  }
  if (lead.currentSource !== expectedPreparation.source || lead.preparationMode !== expectedPreparation.mode) {
    return { ok: false, missing: ['途径来源或准备方式与组织记录不匹配'] };
  }
  const missing = pw.seq9.materials.filter(m => (s.items[m] ?? 0) <= 0);
  return { ok: missing.length === 0, missing, mode: lead.preparationMode };
}

export function drinkPotion(s: GameState, pathwayId: string): ActionResult {
  if (s.currentLocation) return { ok: false, msg: '需要先回到住处或正式监督场所再服食魔药。' };
  if (s.atWork) return { ok: false, msg: '工作期间不能服食魔药。' };
  const check = canDrink(s, pathwayId);
  if (!check.ok) return { ok: false, msg: '条件不足：' + check.missing.join('、') };
  if (check.mode === 'official_dose') return drinkOfficialDose(s, pathwayId);
  const pw = findPathway(pathwayId)!;
  // 确定性检定：准备分 = 85 + 理智修正 + 知识加成 + 神秘学技能×2 − 污染×0.3，≥60 成功
  const rate = Math.round(85 + (s.stats.san - 50) * 0.1 + (s.knowledge.includes('potion_brew') ? 5 : 0) + s.skills.occult * 2 - s.stats.cor * 0.3);
  addLog(s, `——服食魔药：${pw.name}·序列9——`, 'system');
  addLog(s, '你复核封签、材料和调配记录。瓶中的液体在煤气灯下泛着不祥的微光，任何遗漏都只能由身体承担。', 'system');
  for (const m of pw.seq9.materials) s.items[m] = Math.max(0, (s.items[m] ?? 0) - 1);
  advanceHours(s, 1);
  if (rate >= 60) {
    s.pathwayId = pathwayId;
    s.sequence = 9;
    grantSeerDivinationTraining(s);
    const lead = pathwayLead(s, pathwayId);
    s.sequence8Progress = createSequence8Progress(pathwayId, lead.organizationId, 2);
    s.awareness = 'informed';
    lead.preparationMode ??= 'self_brew';
    lead.routeStep = 'completed';
    s.digestion = 5;
    s.stats.spi = clamp(s.stats.spi + 10);
    s.stats.phy = clamp(s.stats.phy + 3);
    s.stats.cha = clamp(s.stats.cha + 3);
    addLog(s, `✦✦ 魔药入喉，世界骤然变得不同了——声音更远了，色彩更深了，影子们似乎都在看你。你已是【${pw.name}·序列9 ${pw.seqNames[0]}】！`, 'good');
    addLog(s, `${pw.seq9Ability}`, 'good');
    addLog(s, `从这一刻起：扮演守则「${pw.actingHint}」将消化你的魔药；而你的每一次出手，都可能被某些人看见。`, 'system');
  } else {
    applyEffects(s, [{ k: 'cor', v: 20 }, { k: 'san', v: -15 }, { k: 'energy', v: -50 }]);
    addLog(s, '✖ 魔药在你体内暴走了！耳语、幻象、皮肤下的蠕动一齐涌来，材料也在这次失败中尽毁。', 'bad');
    if (s.stats.cor >= 60) {
      s.gameOver = { title: '失控', text: '第一瓶魔药就要了你的命。你甚至没来得及成为非凡者，就先成为了值夜者档案里的一行字：「东区，未遂服食者，异变体，已清除。」' };
    } else {
      addLog(s, '你用尽全身力气把自己拽了回来。这次准备不足——下次，把理智养足、把神秘学练深再来。', 'info');
    }
  }
  return { ok: true };
}

export function drinkOfficialDose(s: GameState, pathwayId = 'sleepless'): ActionResult {
  if (s.currentLocation) return { ok: false, msg: '需要先离开当前地点再参加官方服药监督。' };
  if (s.atWork) return { ok: false, msg: '工作期间不能参加官方服药监督。' };
  if (isBeyonder(s)) return { ok: false, msg: '已成为非凡者，不能再次进入凡人官方服药流程。' };
  const check = canDrink(s, pathwayId);
  if (!check.ok || check.mode !== 'official_dose') return { ok: false, msg: '官方监督条件不足：' + check.missing.join('、') };
  const lead = pathwayLead(s, pathwayId);
  if (lead.organizationId === 'nightwatch') {
    const timing = officialTimingIssue(s, 'dose');
    if (timing) return { ok: false, msg: timing };
  }
  const pw = findPathway(pathwayId)!;
  const supervisor = lead.organizationId === 'nightwatch' ? '伊芙琳与值夜者' : '艾拉与心理研究会监督员';
  addLog(s, `——官方监督服药：${pw.name}·序列9——`, 'system');
  addLog(s, `${supervisor}核对封签与批次，分别负责记录和失控预案。这是组织配发的成品魔药，不消耗你的配方或自购材料。`, 'system');
  advanceHours(s, 2);
  s.pathwayId = pathwayId;
  s.sequence = 9;
  grantSeerDivinationTraining(s);
  s.sequence8Progress = createSequence8Progress(pathwayId, lead.organizationId, 2);
  s.awareness = 'informed';
  s.digestion = 5;
  s.stats.spi = clamp(s.stats.spi + 10);
  s.stats.phy = clamp(s.stats.phy + 3);
  s.stats.cha = clamp(s.stats.cha + 3);
  lead.routeStep = 'completed';
  recordRoute(s, pathwayId, 'official_dose', 'passed', `在${organizationDef(lead.organizationId!)?.name}监督下成为序列9`);
  s.tags = s.tags.filter(tag => tag !== 'nightwatch_candidate');
  if (!s.tags.includes('registered')) s.tags.push('registered');
  if (!s.tags.includes('night_watcher')) s.tags.push('night_watcher');
  addLog(s, `✦✦ 在组织监督下，魔药完成了对身体与灵性的改造。你已是【${pw.name}·序列9 ${pw.seqNames[0]}】。`, 'good');
  addLog(s, pw.seq9Ability, 'good');
  addLog(s, '药力沉入灵性深处，视野中的色彩与轮廓开始呈现出从前无法察觉的层次。', 'system');
  return { ok: true };
}

// ============ 晋升（序列9→8） ============
type SceneRequirement = { kind: 'visited' | 'npc' | 'night' | 'day' | 'knowledge' | 'none'; id: string };
const absoluteHour = (s: GameState) => (s.day - 1) * 24 + s.hour;

function inferredSequence8Organization(s: GameState, pathwayId: string): OrganizationId | undefined {
  const leadOrg = pathwayLead(s, pathwayId).organizationId;
  if (leadOrg && organizationDef(leadOrg)?.heldPathways.some(id => id === pathwayId)) return leadOrg;
  return ORGANIZATIONS.find(org => organizationRoute(s, org.id).status === 'committed'
    && organizationRoute(s, org.id).selectedPathway === pathwayId && org.heldPathways.some(id => id === pathwayId))?.id;
}

function trustedCommittedSequence8Organization(s: GameState, pathwayId: string): OrganizationId | undefined {
  const lead = pathwayLead(s, pathwayId);
  return ORGANIZATIONS.find(org => {
    const route = organizationRoute(s, org.id);
    return route.status === 'committed' && route.selectedPathway === pathwayId
      && lead.commitment === true && lead.organizationId === org.id
      && org.heldPathways.some(id => id === pathwayId);
  })?.id;
}

function legacyAuditOrganization(s: GameState, pathwayId: string): OrganizationId {
  if (pathwayId === 'sleepless') return 'nightwatch';
  if (pathwayId === 'spectator') return 'psychology_alchemists';
  if (pathwayId === 'hunter') return 'iron_and_blood';
  if (pathwayId === 'apprentice') return 'abraham_branch';
  if (pathwayId === 'seer') {
    const nightwatch = organizationRoute(s, 'nightwatch');
    const nightwatchTrace = pathwayLead(s, pathwayId).organizationId === 'nightwatch'
      || nightwatch.status !== 'unknown' || nightwatch.history.length > 0
      || s.tags.includes('night_watcher') || s.tags.includes('nightwatch_candidate');
    return nightwatchTrace ? 'nightwatch' : 'secret_order';
  }
  return 'secret_order';
}

function hasLegacyIdentityAuditProvenance(progress: Sequence8Progress): boolean {
  return Number.isInteger(progress.legacyIdentityAuditFromSchema)
    && (progress.legacyIdentityAuditFromSchema ?? 10) >= 0
    && (progress.legacyIdentityAuditFromSchema ?? 10) < 10;
}

function legacyAuditOrganizationAuthorized(progress: Sequence8Progress): boolean {
  return hasLegacyIdentityAuditProvenance(progress)
    && (progress.legacyIdentityAudit || progress.formulaStatus === 'verified');
}

export function ensureSequence8Progress(s: GameState, required = 2): Sequence8Progress | null {
  if (!s.pathwayId || ![8, 9].includes(s.sequence ?? -1)) return null;
  if (!s.sequence8Progress || s.sequence8Progress.pathwayId !== s.pathwayId) {
    s.sequence8Progress = createSequence8Progress(s.pathwayId, inferredSequence8Organization(s, s.pathwayId), required);
    if (s.sequence === 8) s.sequence8Progress.stage = 'completed';
  }
  return s.sequence8Progress;
}

function requirementIssue(s: GameState, requirement: SceneRequirement): string | null {
  if (requirement.kind === 'visited' && !hasVisitedLocation(s, requirement.id)) return `需要先实际探索【${LOCATIONS.find(location => location.id === requirement.id)?.name ?? requirement.id}】。`;
  if (requirement.kind === 'npc') {
    const npc = findAnyNPC(s, requirement.id);
    if (!npc || !isMet(s, requirement.id)) return '需要先与对应人物正式结识。';
    if (!npcAvailable(npc, s.day, s.hour)) return `${npc.name}当前不在可交谈时段。`;
  }
  if (requirement.kind === 'night' && !isNight(s.hour)) return '该场景必须在夜间进行。';
  if (requirement.kind === 'day' && (s.hour < 6 || s.hour >= 18)) return '该场景必须在白天进行。';
  if (requirement.kind === 'knowledge' && !s.knowledge.includes(requirement.id)) return '缺少对应的可信理论记录。';
  return null;
}

export function actingActionIssue(s: GameState, actionId: string): string | null {
  if (s.atWork) return '工作期间不能进行扮演场景。';
  if (s.sequence !== 9 || !s.pathwayId) return '只有序列9可以积累本阶段扮演证据。';
  const def = SEQUENCE8_ACTING_DEFS[s.pathwayId as keyof typeof SEQUENCE8_ACTING_DEFS];
  const action = def?.actions.find(candidate => candidate.id === actionId);
  if (!action) return '该行动不属于当前途径。';
  if (s.stats.energy < 10) return '你当前太过疲惫，无法维持这场扮演。';
  const issue = requirementIssue(s, action.requirement as SceneRequirement);
  if (issue) return issue;
  const progress = ensureSequence8Progress(s)!;
  const contextKey = `${action.id}:${action.requirement.id}:day${s.day}`;
  if (Object.values(progress.evidence).flat().some(record => record.contextKey === contextKey)
    || progress.mistakes.some(record => record.contextKey === contextKey)) return '同一真实对象与日期的情境已经记录过。';
  if (!('wrong' in action) && Object.values(progress.evidence).flat().filter(record => record.day === s.day).length >= 2) return '今天的扮演记录已经足够密集，换一天再观察魔药的反馈。';
  return null;
}

function updateReviewReady(s: GameState, progress: Sequence8Progress) {
  const def = SEQUENCE8_ACTING_DEFS[progress.pathwayId as keyof typeof SEQUENCE8_ACTING_DEFS];
  const complete = def.principles.every(principle => (progress.evidence[principle.id]?.length ?? 0) >= progress.requiredEvidencePerPrinciple);
  if (complete && s.digestion >= 100 && progress.stage === 'acting') progress.stage = 'review_ready';
}

export function performActingAction(s: GameState, actionId: string): ActionResult {
  const issue = actingActionIssue(s, actionId);
  if (issue) return { ok: false, msg: issue };
  const def = SEQUENCE8_ACTING_DEFS[s.pathwayId as keyof typeof SEQUENCE8_ACTING_DEFS];
  const action = def.actions.find(candidate => candidate.id === actionId)!;
  const progress = ensureSequence8Progress(s)!;
  const contextKey = `${action.id}:${action.requirement.id}:day${s.day}`;
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, 10) }]);
  if ('wrong' in action && action.wrong) {
    s.digestion = Math.max(0, s.digestion - 8);
    applyEffects(s, [{ k: 'san', v: -4 }, { k: 'cor', v: 1 }, { k: 'exposure', v: 2 }]);
    progress.mistakes.push({ actionId, contextKey, day: s.day, note: '违背途径原则：消化−8、理智−4、污染+1、暴露+2' });
    addLog(s, `${action.name}没有带来预想中的契合。你把能力当成目的，魔药在体内产生了明显排斥。`, 'bad');
  } else {
    progress.evidence[action.principleId] ??= [];
    progress.evidence[action.principleId].push({ actionId, principleId: action.principleId, contextKey, day: s.day });
    s.digestion = clamp(s.digestion + 16);
    applyEffects(s, [{ k: 'exposure', v: 1 }]);
    addLog(s, `${action.name}结束后，魔药不再像此前那样滞涩。你把这一情境记入等待组织核验的扮演记录。`, 'good');
    updateReviewReady(s, progress);
  }
  advanceHours(s, 1);
  return { ok: true };
}

export function sequence8ReviewMissing(s: GameState): string[] {
  const progress = ensureSequence8Progress(s);
  if (!progress || s.sequence !== 9 || !s.pathwayId) return ['当前不是可审核的序列9'];
  const def = SEQUENCE8_ACTING_DEFS[s.pathwayId as keyof typeof SEQUENCE8_ACTING_DEFS];
  const missing = def.principles.filter(principle => (progress.evidence[principle.id]?.length ?? 0) < progress.requiredEvidencePerPrinciple)
    .map(principle => `${principle.name}证据不足`);
  if (s.digestion < 100) missing.push('魔药尚未完全适应');
  const orgId = progress.organizationId ?? inferredSequence8Organization(s, s.pathwayId);
  const org = orgId && organizationDef(orgId);
  if (!orgId || !org || !org.heldPathways.some(id => id === s.pathwayId)) missing.push('缺少掌握当前途径的所属组织');
  else {
    const route = organizationRoute(s, orgId);
    if ((route.status !== 'committed' || route.selectedPathway !== s.pathwayId)
      && !legacyAuditOrganizationAuthorized(progress)) missing.push('所属组织承诺记录不一致');
  }
  return missing;
}

export function requestSeq8Review(s: GameState): ActionResult {
  if (s.atWork) return { ok: false, msg: '工作期间不能提交晋升审核。' };
  const missing = sequence8ReviewMissing(s);
  if (missing.length) return { ok: false, msg: missing.join('、') };
  const progress = ensureSequence8Progress(s)!;
  if (!['review_ready', 'acting'].includes(progress.stage)) return { ok: false, msg: '当前审核阶段不接受重复申请。' };
  progress.stage = 'review_pending';
  progress.formulaStatus = 'review_pending';
  const auditLabel = progress.legacyIdentityAudit ? '并启动旧档身份审计' : '';
  addLog(s, `所属组织收下三原则证据与消化记录${auditLabel}，开始交叉审核。此时仍未获得序列8配方。`, 'system');
  advanceHours(s, 1);
  return { ok: true };
}

export function completeSeq8Review(s: GameState): ActionResult {
  if (s.atWork) return { ok: false, msg: '工作期间不能参加组织复核。' };
  const progress = ensureSequence8Progress(s);
  if (!progress || progress.stage !== 'review_pending' || !s.pathwayId) return { ok: false, msg: '尚未提交或当前没有待完成的序列8审核。' };
  if (sequence8ReviewMissing(s).length) return { ok: false, msg: '审核期间状态已不再满足要求。' };
  const completedLegacyAudit = progress.legacyIdentityAudit && hasLegacyIdentityAuditProvenance(progress);
  const formulaId = `${s.pathwayId}8`;
  if (!s.formulas.includes(formulaId)) s.formulas.push(formulaId);
  progress.formulaStatus = 'verified';
  progress.legacyIdentityAudit = false;
  progress.stage = 'formula_verified';
  for (const source of Object.values(s.materialSources).filter(source => source.pathwayId === s.pathwayId && source.targetSequence === 8)) source.unlocked = true;
  addLog(s, `${completedLegacyAudit ? '旧档身份审计与' : ''}组织审核完成：序列8配方被标记为已验证，并只解锁当前途径的两项定向材料来源。`, 'good');
  advanceHours(s, 2);
  return { ok: true };
}

export function planSeq8Ritual(s: GameState): ActionResult {
  if (s.currentLocation) return { ok: false, msg: '需要先回到安全住处再规划稳定化情境。' };
  if (s.atWork) return { ok: false, msg: '工作期间不能制定稳定化情境计划。' };
  const progress = ensureSequence8Progress(s);
  if (!progress || progress.formulaStatus !== 'verified' || s.sequence !== 9) return { ok: false, msg: '需要先通过所属组织审核并获得已验证配方。' };
  if (progress.ritual.ready && (progress.ritual.readyUntilHour ?? -1) >= absoluteHour(s)) return { ok: false, msg: '稳定化情境仍在有效窗口内。' };
  progress.ritual = { planned: true, steps: [], ready: false, consumed: false };
  progress.stage = 'ritual_planned';
  addLog(s, '你制定了序列8稳定化情境计划。材料尚未消耗，三个步骤必须按顺序完成。', 'system');
  return { ok: true };
}

export function performSeq8RitualStep(s: GameState, stepId: string): ActionResult {
  if (s.currentLocation) return { ok: false, msg: '需要先回到安全住处再准备稳定化情境。' };
  if (s.atWork) return { ok: false, msg: '工作期间不能准备稳定化情境。' };
  const progress = ensureSequence8Progress(s);
  if (!progress?.ritual.planned || !s.pathwayId) return { ok: false, msg: '请先制定稳定化情境计划。' };
  const def = SEQUENCE8_RITUAL_DEFS[s.pathwayId as keyof typeof SEQUENCE8_RITUAL_DEFS];
  const expected = def.steps[progress.ritual.steps.length];
  if (!expected || expected.id !== stepId) return { ok: false, msg: '稳定化情境步骤必须按顺序完成。' };
  const issue = requirementIssue(s, expected.requirement as SceneRequirement);
  if (issue) return { ok: false, msg: issue };
  if (s.stats.energy < 8) return { ok: false, msg: '你当前太过疲惫，无法维持这一步稳定化准备。' };
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, 8) }]);
  progress.ritual.steps.push(stepId);
  advanceHours(s, 1);
  if (progress.ritual.steps.length === def.steps.length) {
    progress.ritual.ready = true;
    progress.ritual.readyUntilHour = absoluteHour(s) + def.windowHours;
    progress.stage = 'ritual_ready';
    addLog(s, `稳定化情境完成；晋升窗口为${def.windowHours}小时，过期后必须重新准备。`, 'good');
  }
  return { ok: true };
}

export function canPromote(s: GameState): { ok: boolean; missing: string[] } {
  if (!isBeyonder(s)) return { ok: false, missing: ['普通人无法晋升'] };
  if (s.sequence !== 9) return { ok: false, missing: ['Demo 目前只开放到序列8'] };
  const pw = findPathway(s.pathwayId);
  const progress = ensureSequence8Progress(s);
  if (!pw || !progress) return { ok: false, missing: ['途径进度数据缺失'] };
  const missing = sequence8ReviewMissing(s);
  if (progress.formulaStatus !== 'verified' || !s.formulas.includes(`${s.pathwayId}8`)) missing.push('序列8配方未经所属组织验证');
  for (const material of pw.seq8.materials) if ((s.items[material] ?? 0) <= 0) missing.push(material);
  if (!progress.ritual.ready || progress.ritual.consumed) missing.push('稳定化情境尚未完成');
  else if ((progress.ritual.readyUntilHour ?? -1) < absoluteHour(s)) missing.push('稳定化情境窗口已过期');
  if (s.stats.san < 60) missing.push('精神状态不足以承受晋升');
  if (s.stats.cor > 20) missing.push('异常侵蚀仍超出安全范围');
  return { ok: missing.length === 0, missing };
}

export function doPromote(s: GameState): ActionResult {
  if (s.currentLocation) return { ok: false, msg: '需要先回到安全住处再进行晋升。' };
  if (s.atWork) return { ok: false, msg: '工作期间不能举行晋升仪式。' };
  const check = canPromote(s);
  if (!check.ok) return { ok: false, msg: '条件不足：' + check.missing.join('、') };
  const pw = findPathway(s.pathwayId)!;
  const progress = ensureSequence8Progress(s)!;
  const rate = Math.round(20 + s.digestion * 0.45 + (s.knowledge.includes('potion_brew') ? 8 : 0)
    + s.skills.occult * 2 + (s.stats.san - 50) * 0.2 - s.stats.cor * 0.3);
  addLog(s, '——序列8晋升开始——', 'system');
  advanceHours(s, 1);
  for (const material of pw.seq8.materials) s.items[material] = Math.max(0, (s.items[material] ?? 0) - 1);
  progress.ritual.ready = false;
  progress.ritual.consumed = true;
  if (rate >= 60) {
    s.sequence = 8;
    s.digestion = 5;
    progress.stage = 'completed';
    s.stats.spi = clamp(s.stats.spi + 8);
    s.stats.phy = clamp(s.stats.phy + 4);
    s.stats.cha = clamp(s.stats.cha + 4);
    applyEffects(s, [{ k: 'exposure', v: 5 }]);
    addLog(s, `✦✦ 你已是【${pw.name}·序列8 ${pw.seqNames[1]}】！`, 'good');
  } else {
    applyEffects(s, [{ k: 'cor', v: 15 }, { k: 'energy', v: -50 }, { k: 'san', v: -15 }]);
    addLog(s, '晋升检定失败：材料与已完成的稳定化情境均已消耗。', 'bad');
  }
  return { ok: true };
}

// ============ 宿敌系统 ============
function nemesisDaily(s: GameState) {
  const n = s.nemesis;
  if (!n || !n.alive) return;
  n.hostility = clamp(n.hostility + 2);
  n.power = Math.round(n.power + 0.5);
  const roll = rnd(100);
  if (roll < 30) {
    // 刺杀（确定性检定：体质 + 格斗×4 + 武器/途径加成 vs 威胁度）
    const def = s.stats.phy + s.skills.combat * 4 + ((s.items.revolver ?? 0) > 0 ? 15 : 0) + (s.pathwayId === 'hunter' ? 8 : 0);
    addLog(s, '⚠️ 深夜传来异响——有人撬开了你的窗！', 'bad');
    if (def >= n.power) {
      addLog(s, '你早有防备，掀翻台灯砸向破窗而入的黑影。对方负伤逃走，但这场冲突显然不会就此结束。', 'good');
      n.hostility = clamp(n.hostility + 6);
    } else {
      addLog(s, '冰冷的刀刃划过肋侧，你拼死反抗才把人逼退。伤口和惊惧让你许久无法站稳。', 'bad');
      applyEffects(s, [{ k: 'energy', v: -30 }, { k: 'san', v: -6 }]);
    }
  } else if (roll < 55) {
    if (!s.tags.includes('cursed')) {
      s.tags.push('cursed');
      addLog(s, '⚠️ 清晨你发现门槛上钉着一只剖开的黑猫——诅咒仪式。只要它没有解除，厄运就会持续侵蚀你的精神。', 'bad');
    }
  } else if (roll < 75) {
    s.flags.jammed = 2;
    addLog(s, '⚠️ 你的直觉与占卜近日一片混沌——有人在暗中干扰你。接下来几天，依赖判断的行动恐怕都不可靠。', 'bad');
  }
}

/** 花钱通过麦克打听宿敌底细 */
export function nemesisIntel(s: GameState): ActionResult {
  if (s.atWork) return { ok: false, msg: '工作期间不能处理宿敌事务。' };
  const n = s.nemesis;
  if (!n || !n.alive) return { ok: false, msg: '没有宿敌。' };
  if (n.known) return { ok: false, msg: '底细已经查清。' };
  if (s.pence < 24) return { ok: false, msg: '麦克的情报不便宜：需要2苏勒。' };
  s.pence -= 24;
  n.known = true;
  const threat = n.power < 35 ? '尚可应付' : n.power < 60 ? '十分危险' : '足以致命';
  addLog(s, `麦克的渠道很快有了回音：盯上你的是【${n.name}】，${n.archetype}。${n.motive} 麦克判断，此人${threat}。`, 'event');
  addLog(s, '知己知彼——现在你可以主动「做个了断」了。', 'system');
  return { ok: true };
}

/** 求教会庇护 */
export function nemesisShelter(s: GameState): ActionResult {
  if (s.atWork) return { ok: false, msg: '工作期间不能处理宿敌事务。' };
  const n = s.nemesis;
  if (!n || !n.alive) return { ok: false, msg: '没有宿敌。' };
  const eligible = s.tags.includes('registered') || (s.relations.evelyn ?? 0) >= 30;
  if (!eligible) return { ok: false, msg: '教会不会为无干人等出手。你需要正式备案，或先取得伊芙琳足够的信任。' };
  n.hostility = clamp(n.hostility - 45);
  applyEffects(s, [{ k: 'favor', id: 'evelyn', v: -10 }]);
  addLog(s, '伊芙琳听完你的叙述，只说了一句「知道了」。三天后，那些盯梢的目光明显稀了下去——值夜者「路过」了几次对方的地盘。你也欠下教会一个人情。', 'good');
  return { ok: true };
}

/** 做个了断（确定性战斗检定） */
export function nemesisFight(s: GameState): ActionResult {
  if (s.atWork) return { ok: false, msg: '工作期间不能处理宿敌事务。' };
  const n = s.nemesis;
  if (!n || !n.alive) return { ok: false, msg: '没有宿敌。' };
  if (!n.known) return { ok: false, msg: '对方藏在暗处，先查清底细再动手。' };
  if (s.stats.energy < 40) return { ok: false, msg: '你现在的状态不适合主动寻仇，勉强出手等于送死。' };
  applyEffects(s, [{ k: 'energy', v: -35 }]);
  advanceHours(s, 4);
  const atk = s.stats.phy + s.skills.combat * 4 + ((s.items.revolver ?? 0) > 0 ? 15 : 0) + (s.pathwayId === 'hunter' ? 8 : 0) + Math.round(s.stats.spi * 0.3);
  const diff = n.power + 10; // 对方有准备
  addLog(s, `你查清了${n.name}的落脚点，在雨夜里摸了过去。接下来只能看准备与临场反应。`, 'system');
  if (atk >= diff) {
    addLog(s, `✦ 短促而惨烈的搏杀后，一切结束了。${n.name}倒在积水中，你在尸体旁站了很久。`, 'good');
    applyEffects(s, [{ k: 'money', v: 80 }, { k: 'cor', v: 4 }, { k: 'san', v: -4 }]);
    if (s.skills.combat < 10) s.skills.combat += 1;
    if (n.archetype !== '黑帮清道夫') addLog(s, '你只找到几封无法验证来源的密信，没有可直接使用的魔药配方。', 'info');
    addLog(s, '一条人命。你告诉自己：在这座城市的规则里，这已经是仁慈的结局。', 'system');
    s.nemesis = null;
  } else {
    addLog(s, '✖ 对方比你想象的更强。你拼死逃出那条巷子，肋骨断了三根；更糟的是，对方不会把这次失败当作结束。', 'bad');
    applyEffects(s, [{ k: 'energy', v: -40 }, { k: 'san', v: -10 }, { k: 'cor', v: 5 }]);
    n.hostility = clamp(n.hostility + 15);
  }
  return { ok: true };
}

/** 解除诅咒（找尼尔逊或艾拉） */
export function removeCurse(s: GameState): ActionResult {
  if (s.atWork) return { ok: false, msg: '工作期间不能外出解除诅咒。' };
  if (!s.tags.includes('cursed')) return { ok: false, msg: '你身上没有诅咒。' };
  if (s.pence < 60) return { ok: false, msg: '解除诅咒需要5苏勒的材料与酬劳。' };
  s.pence -= 60;
  s.tags = s.tags.filter(t => t !== 'cursed');
  addLog(s, '尼尔逊用银刀、盐和你的一撮头发完成了驱邪仪式。门槛上的黑猫化为黑灰，耳鸣消失了。（诅咒解除）', 'good');
  return { ok: true };
}

// ============ 终局检查 ============
function checkGameOver(s: GameState) {
  if (s.gameOver) return;
  if (s.stats.san <= 0) s.gameOver = { title: '精神崩溃', text: '呓语终于淹没了你。邻居说，那个人最后几天一直在和空气下棋。' };
  else if (s.stats.cor >= 100) s.gameOver = { title: '失控', text: '你的皮肤下有东西在蠕动。第二天，值夜者在巷子里发现了一滩会呼吸的暗影。' };
  else if (s.stats.energy <= 0) {
    s.stats.energy = 30;
    addLog(s, '你眼前一黑，昏倒在街边。醒来时已是8小时后，钱袋明显瘪了一圈。', 'bad');
    s.pence = Math.max(0, s.pence - 24);
    advanceHours(s, 8);
  }
  if (s.gameOver) addLog(s, `——${s.gameOver.title}——`, 'bad');
}

// ============ 存档 ============
function rawDivinationAttemptHasMatchingInsight(attempt: Partial<DivinationAttempt>, rawInsights: unknown[]): boolean {
  return rawInsights.some(value => {
    if (!value || typeof value !== 'object') return false;
    const insight = value as Partial<DivinationInsight>;
    return insight.targetKind === attempt.targetKind && insight.targetId === attempt.targetId
      && insight.method === attempt.method && insight.provider === attempt.provider && insight.outcome === attempt.outcome
      && insight.day === attempt.day && insight.hour === attempt.hour;
  });
}

function rebuildDivinationCredentials(s: GameState, rawCredentials: unknown[], rawAttempts: unknown[], rawInsights: unknown[]) {
  const credentials: DivinationCredential[] = [];
  const validTime = (day: unknown, hour: unknown) => Number.isInteger(day) && (day as number) >= 1
    && Number.isInteger(hour) && (hour as number) >= 0 && (hour as number) < 24;
  const pushCredential = (credential: DivinationCredential) => {
    const duplicate = credentials.some(existing => existing.kind === credential.kind
      && (credential.kind === 'training'
        ? existing.kind === 'training' && existing.source === credential.source && existing.method === credential.method
        : existing.kind === 'consultation' && existing.provider === credential.provider
          && existing.targetKind === credential.targetKind && existing.targetId === credential.targetId
          && existing.method === credential.method && existing.day === credential.day && existing.hour === credential.hour));
    if (!duplicate) credentials.push(credential);
  };
  for (const value of rawCredentials) {
    if (!value || typeof value !== 'object') continue;
    const raw = value as Partial<DivinationCredential>;
    if (!validTime(raw.day, raw.hour)) continue;
    if (raw.kind === 'training') {
      if (!['formal_seer_training', 'nelson'].includes(raw.source ?? '') || !['cards', 'dream'].includes(raw.method ?? '')) continue;
      const source = raw.source as 'formal_seer_training' | 'nelson';
      const method = raw.method as DivinationMethod;
      const trainingMatches = method === 'cards'
        ? s.divinationTraining.cards && s.divinationTraining.media.includes('symbol_cards') && s.divinationTraining.teachers.includes(source)
        : source === 'formal_seer_training' && s.divinationTraining.dream && s.divinationTraining.teachers.includes(source) && hasSeerDivinationSequence(s);
      if (trainingMatches) pushCredential({ kind: 'training', source, method, day: raw.day!, hour: raw.hour! });
      continue;
    }
    if (raw.kind !== 'consultation' || !['nelson', 'evelyn'].includes(raw.provider ?? '')
      || !['location', 'item'].includes(raw.targetKind ?? '') || typeof raw.targetId !== 'string'
      || !['cards', 'dream'].includes(raw.method ?? '')) continue;
    const provider = raw.provider as 'nelson' | 'evelyn';
    const targetKind = raw.targetKind as DivinationTargetKind;
    const method = raw.method as DivinationMethod;
    const target = divinationTargetDefinition(targetKind, raw.targetId);
    const matchingAttempt = rawAttempts.some(value => {
      if (!value || typeof value !== 'object') return false;
      const attempt = value as Partial<DivinationAttempt>;
      return attempt.provider === provider && attempt.targetKind === targetKind && attempt.targetId === raw.targetId
        && attempt.method === method && attempt.day === raw.day && attempt.hour === raw.hour
        && rawDivinationAttemptHasMatchingInsight(attempt, rawInsights);
    });
    const supported = !!target && method === 'cards'
      && (provider === 'nelson' || target.id === 'old_tower' || target.id === 'anomaly_evidence');
    if (supported && matchingAttempt) pushCredential({
      kind: 'consultation', provider, targetKind, targetId: raw.targetId, method, day: raw.day!, hour: raw.hour!,
    });
  }

  s.divinationCredentials = credentials;
  // 兼容旧档时只从可交叉核验的正式训练状态和当下可信关系保守补证；关系下降后的新凭据不会再被撤销。
  if (hasSeerDivinationSequence(s) && s.divinationTraining.teachers.includes('formal_seer_training')) {
    if (s.divinationTraining.cards && s.divinationTraining.media.includes('symbol_cards')) addDivinationTrainingCredential(s, 'formal_seer_training', 'cards');
    if (s.divinationTraining.dream) addDivinationTrainingCredential(s, 'formal_seer_training', 'dream');
  }
  if (hasTrustedNelsonDivinationRelationship(s) && s.divinationTraining.teachers.includes('nelson')
    && s.divinationTraining.cards && s.divinationTraining.media.includes('symbol_cards')) {
    addDivinationTrainingCredential(s, 'nelson', 'cards');
  }
  for (const value of rawAttempts) {
    if (!value || typeof value !== 'object') continue;
    const attempt = value as Partial<DivinationAttempt>;
    if (!['nelson', 'evelyn'].includes(attempt.provider ?? '') || !['location', 'item'].includes(attempt.targetKind ?? '')
      || typeof attempt.targetId !== 'string' || !['cards', 'dream'].includes(attempt.method ?? '')
      || !validTime(attempt.day, attempt.hour) || !rawDivinationAttemptHasMatchingInsight(attempt, rawInsights)) continue;
    const provider = attempt.provider as 'nelson' | 'evelyn';
    const targetKind = attempt.targetKind as DivinationTargetKind;
    const method = attempt.method as DivinationMethod;
    const target = divinationTargetDefinition(targetKind, attempt.targetId);
    const sourceWasTrusted = provider === 'nelson' ? hasTrustedNelsonDivinationRelationship(s) : hasOfficialEvelynDivinationRelationship(s);
    const supported = !!target && method === 'cards'
      && (provider === 'nelson' || target.id === 'old_tower' || target.id === 'anomaly_evidence');
    if (sourceWasTrusted && supported) addDivinationConsultationCredential(s, provider, targetKind, attempt.targetId, method, attempt.day!, attempt.hour!);
  }
}

function normalizedRecordedDivinationAttempt(s: GameState, value: unknown): DivinationAttempt | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<DivinationAttempt>;
  if (!['location', 'item'].includes(raw.targetKind ?? '') || typeof raw.targetId !== 'string') return null;
  if (!['cards', 'dream'].includes(raw.method ?? '') || !['self', 'nelson', 'evelyn'].includes(raw.provider ?? '')) return null;
  if (!['inconclusive', 'omen', 'hint', 'obscured', 'backlash'].includes(raw.outcome ?? '')) return null;
  if (!Number.isInteger(raw.day) || (raw.day ?? 0) < 1 || !Number.isInteger(raw.hour) || (raw.hour ?? -1) < 0 || (raw.hour ?? 24) > 23 || !Number.isFinite(raw.score)) return null;
  const targetKind = raw.targetKind as DivinationTargetKind;
  const method = raw.method as DivinationMethod;
  const provider = raw.provider as DivinationProvider;
  const outcome = raw.outcome as DivinationOutcome;
  const target = divinationTargetDefinition(targetKind, raw.targetId);
  if (!target || (targetKind === 'location' && !isLocationUnlocked(s, raw.targetId))) return null;
  if (!recordedDivinationProviderAllowed(s, provider, method, target, raw.day!, raw.hour!)) return null;
  const successOutcome = targetKind === 'location' ? 'omen' : 'hint';
  if ((outcome === 'omen' || outcome === 'hint') && (outcome !== successOutcome || raw.score! < target.difficulty)) return null;
  if (outcome === 'inconclusive' && (raw.score! >= target.difficulty || method !== 'cards' || target.pressure !== 'low')) return null;
  if (outcome === 'backlash' && (raw.score! >= target.difficulty || (method !== 'dream' && target.pressure !== 'high'))) return null;
  return {
    targetKind, targetId: raw.targetId, method, provider, outcome,
    day: raw.day!, hour: raw.hour!, score: raw.score!,
  };
}

function rebuildPersistedDivinationAndItemKnowledge(
  s: GameState,
  rawAttempts: unknown[],
  rawInsights: unknown[],
  rawItemKnowledge: Record<string, unknown>,
) {
  const usedInsights = new Set<number>();
  const attempts: DivinationAttempt[] = [];
  const insights: DivinationInsight[] = [];
  for (const candidate of rawAttempts) {
    const attempt = normalizedRecordedDivinationAttempt(s, candidate);
    if (!attempt) continue;
    const matchingInsightIndex = rawInsights.findIndex((value, index) => {
      if (usedInsights.has(index) || !value || typeof value !== 'object') return false;
      const raw = value as Partial<DivinationInsight>;
      return raw.targetKind === attempt.targetKind && raw.targetId === attempt.targetId
        && raw.method === attempt.method && raw.provider === attempt.provider && raw.outcome === attempt.outcome
        && raw.day === attempt.day && raw.hour === attempt.hour;
    });
    if (matchingInsightIndex < 0) continue;
    usedInsights.add(matchingInsightIndex);
    attempts.push(attempt);
    const target = divinationTargetDefinition(attempt.targetKind, attempt.targetId)!;
    const success = attempt.outcome === 'omen' || attempt.outcome === 'hint';
    insights.push({
      id: `divination:${attempt.day}:${attempt.hour}:${attempts.length}`,
      targetKind: attempt.targetKind,
      targetId: attempt.targetId,
      method: attempt.method,
      provider: attempt.provider,
      outcome: attempt.outcome,
      text: canonicalDivinationText(target, attempt.method, attempt.provider, attempt.outcome),
      clueId: success ? target.clueId : undefined,
      day: attempt.day,
      hour: attempt.hour,
    });
  }
  s.divinationAttempts = attempts;
  s.divinationInsights = insights;

  const successfullyDivinedItems = new Set(insights.filter(insight => insight.targetKind === 'item' && insight.outcome === 'hint').map(insight => insight.targetId));
  s.itemKnowledge = {};
  for (const itemId of new Set([...Object.keys(rawItemKnowledge), ...successfullyDivinedItems])) {
    const item = findItem(itemId);
    if (!item) continue;
    const raw = rawItemKnowledge[itemId] && typeof rawItemKnowledge[itemId] === 'object'
      ? rawItemKnowledge[itemId] as Partial<ItemKnowledgeState>
      : undefined;
    const authoritativeSpiritResult = item.spiritVision?.result;
    const spiritVisionInspected = !!(raw?.spiritVisionInspected && authoritativeSpiritResult
      && hasSpiritVisionAbility(s) && Array.isArray(raw.knownInfo) && raw.knownInfo.includes(authoritativeSpiritResult));
    const identifiedByDivination = item.category === 'occult' && successfullyDivinedItems.has(itemId);
    if (!spiritVisionInspected && !identifiedByDivination) continue;
    const inspectedDay = spiritVisionInspected && Number.isInteger(raw?.inspectedDay) && (raw?.inspectedDay ?? 0) >= 1 ? raw!.inspectedDay : undefined;
    const inspectedHour = spiritVisionInspected && Number.isInteger(raw?.inspectedHour) && (raw?.inspectedHour ?? -1) >= 0 && (raw?.inspectedHour ?? 24) <= 23 ? raw!.inspectedHour : undefined;
    s.itemKnowledge[itemId] = {
      itemId,
      spiritVisionInspected,
      identifiedAsOccult: identifiedByDivination || (spiritVisionInspected && item.spiritVision!.revealsOccult),
      knownInfo: spiritVisionInspected ? [authoritativeSpiritResult!] : [],
      inspectedDay,
      inspectedHour,
    };
  }
}

const SAVE_KEY = 'lotm-demo-save-v6';
export function saveGame(s: GameState) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState & {
      schemaVersion?: number;
      awareness?: GameState['awareness'];
      pathwayLeads?: GameState['pathwayLeads'];
      leads?: GameState['leads'];
      organizationRoutes?: GameState['organizationRoutes'];
      diaryPages?: GameState['diaryPages'];
      materialSources?: GameState['materialSources'];
      sequence8Progress?: GameState['sequence8Progress'];
      visitedLocations?: string[];
      currentLocation?: GameState['currentLocation'];
      completedLocationActions?: string[];
      locationRelations?: Record<string, number>;
      landmarkIntroductions?: LandmarkIntroductionRecord[];
      landmarkEncounters?: LandmarkEncounterRecord[];
      clues?: GameState['clues'];
      explorationAttempts?: GameState['explorationAttempts'];
      divinationTraining?: GameState['divinationTraining'];
      divinationCredentials?: GameState['divinationCredentials'];
      divinationInsights?: GameState['divinationInsights'];
      divinationAttempts?: GameState['divinationAttempts'];
      books?: GameState['books'];
      languages?: GameState['languages'];
      itemKnowledge?: GameState['itemKnowledge'];
      canReadRoselleScript?: boolean;
      jobId?: string | null;
      atWork?: boolean;
      eventCounter?: number;
      recentEventVariants?: Record<string, number[]>;
      forcedEventQueue?: string[];
    };
    const loadedVersion = Number.isInteger(s.schemaVersion) ? s.schemaVersion! : 6;
    const hadVisitedLocations = Array.isArray(s.visitedLocations);
    // v6 旧存档迁移：按出身补合理初始职业；缺少/失效的在岗状态一律安全回到非工作场景。
    if (s.jobId === undefined) s.jobId = ORIGINS.find(o => o.id === s.originId)?.initialJobId ?? null;
    if (s.jobId && !JOBS.some(j => j.id === s.jobId)) s.jobId = null;
    if (typeof s.atWork !== 'boolean' || !s.jobId) s.atWork = false;
    const legacySkills = s.skills as Partial<GameState['skills']> | undefined;
    s.skills = {
      investigate: legacySkills?.investigate ?? 0,
      combat: legacySkills?.combat ?? 0,
      speech: legacySkills?.speech ?? 0,
      occult: legacySkills?.occult ?? 0,
      sneak: legacySkills?.sneak ?? 0,
    };
    const seenClueIds = new Set<string>();
    s.clues = Array.isArray(s.clues) ? s.clues.filter(clue => {
      if (!clue || typeof clue.id !== 'string' || seenClueIds.has(clue.id) || !CLUE_DEFS.some(def => def.id === clue.id)) return false;
      seenClueIds.add(clue.id);
      return true;
    }) : [];
    s.explorationAttempts = Array.isArray(s.explorationAttempts)
      ? s.explorationAttempts.filter(attempt => attempt && typeof attempt.checkId === 'string'
        && ['passed', 'blocked'].includes(attempt.outcome))
      : [];
    s.relations = s.relations && typeof s.relations === 'object' ? s.relations : {};
    if (loadedVersion < 18) {
      s.locationRelations = {};
      s.landmarkIntroductions = [];
      s.landmarkEncounters = [];
    } else {
      const validEncounterLocations = new Set(TINGEN_LANDMARK_ENCOUNTERS.map(def => def.locationId));
      s.locationRelations = Object.fromEntries(Object.entries(s.locationRelations ?? {})
        .filter(([locationId, value]) => validEncounterLocations.has(locationId) && Number.isFinite(value))
        .map(([locationId, value]) => [locationId, clamp(Math.floor(value))]));

      const seenIntroductions = new Set<string>();
      s.landmarkIntroductions = Array.isArray(s.landmarkIntroductions) ? s.landmarkIntroductions.filter(record => {
        if (!record || seenIntroductions.has(record.encounterId)) return false;
        const action = TINGEN_LANDMARK_ACTIONS.find(def => def.id === record.sourceActionId);
        const grant = action?.introductions?.find(candidate => candidate.encounterId === record.encounterId
          && candidate.introducerId === record.introducerId);
        const encounter = TINGEN_LANDMARK_ENCOUNTERS.find(def => def.id === record.encounterId);
        if (!action || !grant || !encounter || action.locationId !== encounter.locationId || !landmarkActionCompleted(s, action)) return false;
        if (!Number.isInteger(record.acquiredDay) || record.acquiredDay < 1
          || !Number.isInteger(record.acquiredHour) || record.acquiredHour < 0 || record.acquiredHour > 23) return false;
        seenIntroductions.add(record.encounterId);
        return true;
      }) : [];

      const seenEncounters = new Set<string>();
      s.landmarkEncounters = Array.isArray(s.landmarkEncounters) ? s.landmarkEncounters.filter(record => {
        if (!record || seenEncounters.has(record.encounterId)) return false;
        const def = TINGEN_LANDMARK_ENCOUNTERS.find(candidate => candidate.id === record.encounterId);
        const introduced = s.landmarkIntroductions.some(item => item.encounterId === record.encounterId);
        const relationReady = !!def && (s.locationRelations[def.locationId] ?? 0) >= def.minLocationRelation;
        if (!def || (!introduced && !relationReady) || !Number.isInteger(record.attempts) || record.attempts < 1) return false;
        if (record.lastAttemptDay !== undefined && (!Number.isInteger(record.lastAttemptDay)
          || record.lastAttemptDay < 0 || record.lastAttemptDay > s.day)) return false;
        if (record.met && (!Number.isInteger(record.metDay) || (record.metDay ?? 0) < 1
          || !Number.isInteger(record.metHour) || (record.metHour ?? -1) < 0 || (record.metHour ?? 24) > 23
          || !Number.isFinite(s.relations[def.npc.id]))) return false;
        seenEncounters.add(record.encounterId);
        return true;
      }) : [];
    }
    for (const def of TINGEN_LANDMARK_ENCOUNTERS) {
      if (!s.landmarkEncounters.some(record => record.encounterId === def.id && record.met)) delete s.relations[def.npc.id];
    }
    const training = s.divinationTraining && typeof s.divinationTraining === 'object' ? s.divinationTraining : undefined;
    s.divinationTraining = {
      cards: training?.cards === true,
      dream: training?.dream === true,
      media: Array.isArray(training?.media) ? [...new Set(training.media.filter(id => typeof id === 'string'))] : [],
      teachers: Array.isArray(training?.teachers) ? [...new Set(training.teachers.filter(id => typeof id === 'string'))] : [],
    };
    const rawDivinationCredentials: unknown[] = Array.isArray(s.divinationCredentials) ? [...s.divinationCredentials] : [];
    const rawDivinationInsights: unknown[] = Array.isArray(s.divinationInsights) ? [...s.divinationInsights] : [];
    const rawDivinationAttempts: unknown[] = Array.isArray(s.divinationAttempts) ? [...s.divinationAttempts] : [];
    const rawItemKnowledge: Record<string, unknown> = s.itemKnowledge && typeof s.itemKnowledge === 'object' ? { ...s.itemKnowledge } : {};
    // 玩家可见的识别结果在完成全部身份迁移后，从权威定义和可核验尝试记录重建。
    s.divinationCredentials = [];
    s.divinationInsights = [];
    s.divinationAttempts = [];
    s.itemKnowledge = {};
    const legacyOccultNotes = s.items?.occult_notes ?? 0;
    const legacyStudyProgress = Number.isFinite(s.studyProgress) ? Math.max(0, s.studyProgress) : 0;
    const oldBooks = s.books && typeof s.books === 'object' ? s.books : {};
    s.books = createBooks();
    for (const book of BOOK_DEFS) {
      const old = oldBooks[book.id];
      if (!old || typeof old !== 'object') continue;
      const state = s.books[book.id];
      state.acquired = old.acquired === true;
      state.acquiredDay = Number.isInteger(old.acquiredDay) ? old.acquiredDay : undefined;
      state.acquiredHour = Number.isInteger(old.acquiredHour) ? old.acquiredHour : undefined;
      state.readHours = Math.min(book.totalHours, Math.max(0, Number.isFinite(old.readHours) ? old.readHours : 0));
      state.completed = old.completed === true && state.acquired;
      state.failedAttempts = Math.max(0, Number.isInteger(old.failedAttempts) ? old.failedAttempts : 0);
    }
    const oldLanguages = s.languages && typeof s.languages === 'object' ? s.languages : {};
    s.languages = { ...oldLanguages, ruen: 'fluent' };
    if (!['none', 'reading', 'fluent'].includes(s.languages.old_feysac)) s.languages.old_feysac = 'none';
    s.firedOnce ??= [];
    s.eventCounter = Number.isInteger(s.eventCounter) && (s.eventCounter ?? -1) >= 0 ? s.eventCounter! : 0;
    s.recentEventVariants = s.recentEventVariants && typeof s.recentEventVariants === 'object' ? s.recentEventVariants : {};
    const removedShortcutEvents = new Set([
      'ambient_item_occult_notes', 'ambient_knowledge_spirit_vision', 'study_forbidden', 'study_insight',
    ]);
    s.forcedEventQueue = Array.isArray(s.forcedEventQueue)
      ? s.forcedEventQueue.filter(id => typeof id === 'string' && !removedShortcutEvents.has(id))
      : [];
    // 旧版 pendingEvent 是静态事件 id；保留该字符串即可由 currentEvent 正常解析。
    if (s.pendingEvent && typeof s.pendingEvent !== 'string') {
      const pending = s.pendingEvent as EventInstance;
      if (removedShortcutEvents.has(pending.blueprintId)
        || pending.source !== 'generated' || !pending.instanceId || !pending.blueprintId || !Array.isArray(pending.choices)) {
        s.pendingEvent = null;
      }
    }
    if (typeof s.pendingEvent === 'string' && removedShortcutEvents.has(s.pendingEvent)) s.pendingEvent = null;

    const existingLeads = s.pathwayLeads && typeof s.pathwayLeads === 'object' ? s.pathwayLeads : {};
    s.pathwayLeads = createPathwayLeads();
    for (const pathway of PATHWAYS) {
      const old = existingLeads[pathway.id];
      if (!old || typeof old !== 'object') continue;
      s.pathwayLeads[pathway.id] = {
        currentSource: old.currentSource,
        organizationId: old.organizationId,
        history: Array.isArray(old.history) ? old.history : [],
        routeStep: typeof old.routeStep === 'string' ? old.routeStep : 'none',
        formulaStatus: old.formulaStatus,
        preparationMode: old.preparationMode,
        commitment: old.commitment === true,
      };
    }

    const oldStructuredLeads = s.leads && typeof s.leads === 'object' ? s.leads : {};
    s.leads = createStructuredLeads();
    for (const [id, lead] of Object.entries(oldStructuredLeads)) {
      if (s.leads[id] && lead && typeof lead === 'object') s.leads[id] = { ...s.leads[id], ...lead, notes: Array.isArray(lead.notes) ? lead.notes : [] };
    }
    const oldOrganizationRoutes: Partial<GameState['organizationRoutes']> = s.organizationRoutes && typeof s.organizationRoutes === 'object' ? s.organizationRoutes : {};
    s.organizationRoutes = createOrganizationRoutes();
    for (const org of ORGANIZATIONS) {
      const route = oldOrganizationRoutes[org.id];
      if (route && typeof route === 'object') s.organizationRoutes[org.id] = { ...s.organizationRoutes[org.id], ...route, history: Array.isArray(route.history) ? route.history : [] };
    }
    // 猎犬酒馆转介必须同时保有权威来源线索与行动时写入的结构化凭据。
    // 单独注入 clue id 或伪造来源不能在读档后开放黑荆棘。
    if (!hasVerifiedBlackthornReferral(s)) {
      s.clues = s.clues.filter(record => record.id !== 'blackthorn_referral');
    }
    const oldDiaryPages = s.diaryPages && typeof s.diaryPages === 'object' ? s.diaryPages : {};
    s.diaryPages = createDiaryPages();
    for (const [id, page] of Object.entries(oldDiaryPages)) if (s.diaryPages[id] && page && typeof page === 'object') s.diaryPages[id] = { ...s.diaryPages[id], ...page };
    const oldMaterialSources = s.materialSources && typeof s.materialSources === 'object' ? s.materialSources : {};
    s.materialSources = createMaterialSources();
    for (const [id, source] of Object.entries(oldMaterialSources)) {
      if (s.materialSources[id] && source && typeof source === 'object') {
        s.materialSources[id] = {
          ...s.materialSources[id], ...source,
          locationId: s.materialSources[id].locationId,
          targetSequence: s.materialSources[id].targetSequence,
          acquisitionMode: s.materialSources[id].acquisitionMode,
        };
      }
    }
    s.visitedLocations = Array.isArray(s.visitedLocations)
      ? [...new Set(s.visitedLocations.filter(id => LOCATIONS.some(location => location.id === id)))]
      : [];
    if (!isLocationUnlocked(s, 'blackthorn_security')) {
      s.visitedLocations = s.visitedLocations.filter(id => id !== 'blackthorn_security');
      if (s.activeCommission?.locationId === 'blackthorn_security') s.activeCommission = null;
    }
    if (loadedVersion < 16) {
      s.currentLocation = null;
      s.completedLocationActions = [];
    } else {
      const stay = s.currentLocation;
      const validCompanion = !stay?.companionId || !!findAnyNPC(s, stay.companionId);
      const trustedQuote = stay && validCompanion && ['walk', 'rickshaw'].includes(stay.travelMode)
        ? getTravelQuote(s, stay.locationId, stay.travelMode, stay.companionId ? 2 : 1)
        : null;
      const validStay = !!stay
        && LOCATIONS.some(location => location.id === stay.locationId)
        && isLocationUnlocked(s, stay.locationId)
        && ['walk', 'rickshaw'].includes(stay.travelMode)
        && Number.isInteger(stay.arrivedDay) && stay.arrivedDay >= 1
        && Number.isInteger(stay.arrivedHour) && stay.arrivedHour >= 0 && stay.arrivedHour < 24
        && !!trustedQuote
        && stay.returnHours === Math.floor(trustedQuote.hours / 2)
        && stay.returnPrepaid === true
        && validCompanion;
      s.currentLocation = validStay ? stay : null;
      const validOnceKeys = new Set(SALVAGE_DEFS.map(def => def.id));
      s.completedLocationActions = Array.isArray(s.completedLocationActions)
        ? [...new Set(s.completedLocationActions.filter(key => validOnceKeys.has(key)))] : [];
    }
    if (s.atWork) s.currentLocation = null;
    s.canReadRoselleScript = s.canReadRoselleScript !== false;

    if (loadedVersion < 7) {
      if (!isBeyonder(s)) {
        const downgraded = ['spirit_vision', 'ritual_basic', 'potion_brew'].some(id => s.knowledge.includes(id));
        s.knowledge = s.knowledge.filter(id => !['spirit_vision', 'ritual_basic', 'potion_brew'].includes(id));
        if (downgraded && !s.knowledge.includes('occult_theory')) s.knowledge.push('occult_theory');
        if (!s.knowledge.includes('spirit_vision_theory') && downgraded) s.knowledge.push('spirit_vision_theory');
        if (s.originId === 'orphan' && !s.knowledge.includes('church_liturgy')) s.knowledge.push('church_liturgy');

        for (const formulaId of s.formulas) {
          const pathway = PATHWAYS.find(candidate => formulaId.startsWith(candidate.id));
          if (!pathway) continue;
          const lead = pathwayLead(s, pathway.id);
          lead.currentSource ??= 'legacy';
          lead.formulaStatus = 'unverified';
          if (lead.routeStep === 'none') lead.routeStep = 'legacy_formula';
          if (!lead.history.some(item => item.step === `legacy:${formulaId}`)) {
            lead.history.push({ day: s.day, step: `legacy:${formulaId}`, outcome: 'migrated', note: '旧存档配方降级为待验证线索' });
          }
        }
      } else {
        s.awareness = 'informed';
        if (s.pathwayId) {
          const lead = pathwayLead(s, s.pathwayId);
          if (lead.routeStep === 'none') lead.routeStep = 'completed';
        }
      }
    }
    if (loadedVersion < 8) {
      const oldNight = pathwayLead(s, 'sleepless');
      const night = organizationRoute(s, 'nightwatch');
      const oldStep = oldNight.routeStep;
      night.history = [...oldNight.history];
      const nightCandidateSteps = new Set(['public_rumor', 'evidence_ready', 'reported', 'screening_scheduled', 'interview_passed', 'offer_pending', 'oath_confirmation', 'declined', 'dose_ready', 'completed']);
      night.routeStep = nightCandidateSteps.has(oldStep) ? oldStep : 'none';
      const stageByStep: Record<string, StructuredLead['stage']> = {
        public_rumor: 'found', evidence_ready: 'identified', reported: 'verified', screening_scheduled: 'verified',
        interview_passed: 'verified', offer_pending: 'verified', oath_confirmation: 'verified', declined: 'verified', dose_ready: 'verified', completed: 'verified',
      };
      s.leads.nightwatch_clocktower.stage = stageByStep[oldStep] ?? 'unknown';
      if (['reported', 'screening_scheduled', 'interview_passed', 'declined'].includes(oldStep)) night.status = 'contacted';
      if (oldStep === 'offer_pending') night.status = 'qualified';
      if (oldStep === 'oath_confirmation') night.status = 'member';
      if (oldNight.commitment || oldStep === 'dose_ready' || (s.pathwayId === 'sleepless' && isBeyonder(s))) {
        night.status = 'committed';
        night.routeStep = 'committed';
        night.selectedPathway = 'sleepless';
        oldNight.organizationId = 'nightwatch';
        oldNight.commitment = true;
        oldNight.preparationMode = 'official_dose';
        oldNight.routeStep = isBeyonder(s) ? 'completed' : 'dose_ready';
      } else {
        oldNight.currentSource = undefined;
        oldNight.preparationMode = undefined;
        oldNight.commitment = false;
        oldNight.routeStep = 'none';
        oldNight.history = [];
      }
    }
    if (loadedVersion === 8 && !isBeyonder(s)) {
      const cleanDiaryPages = createDiaryPages();
      const nightwatchHistory = organizationRoute(s, 'nightwatch').history;
      if (!nightwatchHistory.some(record => record.step === 'public_records')) {
        s.diaryPages.diary_org_rules = cleanDiaryPages.diary_org_rules;
      }

      const routeHasWorldEntry = (organizationId: OrganizationId, leadId: string) =>
        organizationRoute(s, organizationId).history.some(record => record.step === `world_entry:${leadId}` && record.outcome === 'passed');
      const contactTrusted = (npcId: string, minFavor: number) => isMet(s, npcId) && (s.relations[npcId] ?? -100) >= minFavor;
      const locationTrusted = (organizationId: OrganizationId, leadId: string, locationId: string | null) =>
        (!!locationId && hadVisitedLocations && s.visitedLocations.includes(locationId)) || routeHasWorldEntry(organizationId, leadId);

      const manorTrusted = locationTrusted('abraham_branch', 'abraham_door_map', 'manor');
      if (!manorTrusted) s.diaryPages.diary_door_fragment = cleanDiaryPages.diary_door_fragment;
      const blackMarketTrusted = hadVisitedLocations && s.visitedLocations.includes('black_market') && contactTrusted('victor', VISIT_FAVOR);
      if (!blackMarketTrusted) s.diaryPages.diary_false_formula = cleanDiaryPages.diary_false_formula;

      for (const org of ORGANIZATIONS.filter(candidate => candidate.id !== 'nightwatch')) {
        const organizationId = org.id as OrganizationId;
        const def = leadDefForOrganization(organizationId)!;
        const lead = s.leads[def.id];
        const route = organizationRoute(s, organizationId);
        const npcTrusted = contactTrusted(def.contactNpc, def.minFavor);
        const entryTrusted = def.entryMode === 'npc_background'
          ? npcTrusted || routeHasWorldEntry(organizationId, def.id)
          : locationTrusted(organizationId, def.id, def.locationId);
        const identifiedTrusted = entryTrusted && npcTrusted;
        const operationalTrusted = organizationId !== 'abraham_branch' || s.diaryPages.diary_door_fragment.operationalVerified;
        const verifiedTrusted = identifiedTrusted && operationalTrusted;
        const selectedPathways = new Set<string>([
          ...org.heldPathways,
          ...(route.selectedPathway ? [route.selectedPathway] : []),
        ]);

        if (!entryTrusted) {
          s.leads[def.id] = { ...createStructuredLeads()[def.id], notes: [] };
        } else if (!identifiedTrusted && ['identified', 'verified'].includes(lead.stage)) {
          lead.stage = 'decoded';
          lead.notes.push('v8→v9：缺少可验证的NPC信任记录，需重新当面辨认');
        } else if (!verifiedTrusted && lead.stage === 'verified') {
          lead.stage = 'identified';
          lead.notes.push('v8→v9：缺少完整交叉证据，需重新完成真实性核验');
        }

        const committedLead = route.selectedPathway ? pathwayLead(s, route.selectedPathway) : undefined;
        const expectedPreparation = organizationPreparation(organizationId);
        const commitmentConsistent = route.status !== 'committed' || (!!route.selectedPathway
          && Array.from(org.heldPathways).some(pathwayId => pathwayId === route.selectedPathway)
          && committedLead?.organizationId === organizationId
          && committedLead.commitment
          && committedLead.currentSource === expectedPreparation.source
          && committedLead.preparationMode === expectedPreparation.mode);
        const routeTrusted = verifiedTrusted && s.leads[def.id].stage === 'verified' && commitmentConsistent;
        if (route.status !== 'unknown' && !routeTrusted) {
          s.organizationRoutes[organizationId] = createOrganizationRoutes()[organizationId];
          for (const pathwayId of selectedPathways) {
            const pathLead = pathwayLead(s, pathwayId);
            if (pathLead.organizationId === organizationId || route.selectedPathway === pathwayId) {
              s.pathwayLeads[pathwayId] = blankPathwayLead();
            }
          }
        }
        if (!routeTrusted) {
          for (const pathwayId of selectedPathways) {
            if (pathwayLead(s, pathwayId).organizationId === organizationId) s.pathwayLeads[pathwayId] = blankPathwayLead();
          }
        }

        const currentRoute = organizationRoute(s, organizationId);
        const committedPathway = currentRoute.status === 'committed' ? currentRoute.selectedPathway : undefined;
        for (const pathwayId of selectedPathways) {
          const pathLead = pathwayLead(s, pathwayId);
          const preparation = organizationPreparation(organizationId);
          const materialAccessTrusted = routeTrusted
            && committedPathway === pathwayId
            && pathLead.commitment
            && pathLead.organizationId === organizationId
            && preparation.mode !== 'official_dose';
          for (const source of Object.values(s.materialSources).filter(candidate => candidate.pathwayId === pathwayId)) {
            if (materialAccessTrusted) {
              const collectionTrusted = source.remaining >= 1
                || (hadVisitedLocations && s.visitedLocations.includes(source.locationId));
              if (collectionTrusted) continue;
              if ((s.items[source.itemId] ?? 0) > 0) s.items[source.itemId]--;
              source.remaining = 1;
              continue;
            }
            if (source.remaining < 1 && (s.items[source.itemId] ?? 0) > 0) s.items[source.itemId]--;
            source.unlocked = false;
            source.remaining = 1;
          }
        }

        if (!routeTrusted) {
          for (const pathwayId of selectedPathways) s.formulas = s.formulas.filter(formulaId => formulaId !== `${pathwayId}9`);
          if (organizationId === 'abraham_branch' && entryTrusted) {
            if (!s.formulas.includes('apprentice9')) s.formulas.push('apprentice9');
            pathwayLead(s, 'apprentice').formulaStatus = 'unverified';
          }
          if (organizationId === 'iron_and_blood' && identifiedTrusted) {
            if (!s.formulas.includes('hunter9')) s.formulas.push('hunter9');
            pathwayLead(s, 'hunter').formulaStatus = 'unverified';
          }
        }
      }
    }
    if (loadedVersion < 10) {
      if (!s.pathwayId || s.sequence === null) {
        s.sequence8Progress = null;
      } else if (s.sequence === 8) {
        const completed = createSequence8Progress(s.pathwayId, inferredSequence8Organization(s, s.pathwayId), 1,
          s.formulas.includes(`${s.pathwayId}8`) ? 'verified' : 'locked');
        completed.stage = 'completed';
        completed.ritual = { planned: true, steps: [], ready: false, consumed: true };
        s.sequence8Progress = completed;
      } else if (s.sequence === 9) {
        const legacyFormula = s.formulas.includes(`${s.pathwayId}8`);
        const trustedOrganization = trustedCommittedSequence8Organization(s, s.pathwayId);
        const auditOrganization = trustedOrganization ?? legacyAuditOrganization(s, s.pathwayId);
        s.sequence8Progress = createSequence8Progress(s.pathwayId, auditOrganization, 1,
          legacyFormula ? 'legacy_unverified' : 'locked');
        if (!trustedOrganization) {
          s.sequence8Progress.legacyIdentityAudit = true;
          s.sequence8Progress.legacyIdentityAuditFromSchema = loadedVersion;
        }
      } else {
        s.sequence8Progress = null;
      }
    } else if (s.sequence8Progress && s.pathwayId) {
      const defaults = createSequence8Progress(s.pathwayId, s.sequence8Progress.organizationId, s.sequence8Progress.requiredEvidencePerPrinciple || 2,
        s.sequence8Progress.formulaStatus ?? 'locked');
      s.sequence8Progress = {
        ...defaults, ...s.sequence8Progress,
        legacyIdentityAudit: s.sequence8Progress.legacyIdentityAudit === true
          && Number.isInteger(s.sequence8Progress.legacyIdentityAuditFromSchema)
          && (s.sequence8Progress.legacyIdentityAuditFromSchema ?? 10) < 10,
        legacyIdentityAuditFromSchema: Number.isInteger(s.sequence8Progress.legacyIdentityAuditFromSchema)
          && (s.sequence8Progress.legacyIdentityAuditFromSchema ?? 10) < 10
          ? s.sequence8Progress.legacyIdentityAuditFromSchema : undefined,
        evidence: { ...defaults.evidence, ...(s.sequence8Progress.evidence ?? {}) },
        mistakes: Array.isArray(s.sequence8Progress.mistakes) ? s.sequence8Progress.mistakes : [],
        ritual: { ...defaults.ritual, ...(s.sequence8Progress.ritual ?? {}) },
      };
    } else if (!s.pathwayId) {
      s.sequence8Progress = null;
    }
    if (loadedVersion < 11) {
      const clocktowerStep = organizationRoute(s, 'nightwatch').routeStep;
      const witnessedSteps = new Set([
        'evidence_ready', 'reported', 'screening_scheduled', 'interview_passed', 'offer_pending',
        'oath_confirmation', 'member', 'committed', 'declined', 'dose_ready', 'completed',
      ]);
      if (clocktowerStep === 'public_rumor' || witnessedSteps.has(clocktowerStep)) {
        acquireClue(s, 'clocktower_public_complaints', 'migration', `schema:${loadedVersion}`);
      }
      if (witnessedSteps.has(clocktowerStep)) {
        acquireClue(s, 'clocktower_repair_orders', 'migration', `schema:${loadedVersion}`);
      }
    }
    if (loadedVersion < 12) {
      const dockLead = s.leads.iron_blood_token;
      const dockRoute = organizationRoute(s, 'iron_and_blood');
      const hunterLead = pathwayLead(s, 'hunter');
      const trustedDockProgress = ['found', 'decoded', 'identified', 'verified'].includes(dockLead.stage)
        || dockRoute.history.some(record => record.step === 'world_entry:iron_blood_token' && record.outcome === 'passed')
        || dockRoute.status !== 'unknown'
        || (hunterLead.organizationId === 'iron_and_blood' && hunterLead.commitment)
        || s.pathwayId === 'hunter';
      if (trustedDockProgress) {
        acquireClue(s, 'dock_missing_reports', 'migration', `schema:${loadedVersion}`);
        acquireClue(s, 'dock_manifest_discrepancy', 'migration', `schema:${loadedVersion}`);
        acquireClue(s, 'dock_marked_manifest', 'migration', `schema:${loadedVersion}`);
      }
    }
    rebuildDivinationCredentials(s, rawDivinationCredentials, rawDivinationAttempts, rawDivinationInsights);
    if (loadedVersion < 17 && hasSeerDivinationSequence(s)) grantSeerDivinationTraining(s);
    if (loadedVersion < 15) {
      if (legacyOccultNotes > 0) {
        const notes = s.books.abridged_occult_notes;
        notes.acquired = true;
        notes.acquiredDay ??= s.day;
        notes.acquiredHour ??= s.hour;
        const total = BOOK_DEFS.find(book => book.id === notes.bookId)!.totalHours;
        notes.readHours = Math.max(notes.readHours, Math.min(Math.max(0, total - 1), legacyStudyProgress));
        s.items.occult_notes = 0;
      }
      if (s.originId === 'orphan' || s.knowledge.includes('church_liturgy')) {
        const churchBook = s.books.church_festivals_excerpt;
        const total = BOOK_DEFS.find(book => book.id === churchBook.bookId)!.totalHours;
        churchBook.acquired = true;
        churchBook.acquiredDay ??= s.day;
        churchBook.acquiredHour ??= s.hour;
        churchBook.readHours = total;
        churchBook.completed = true;
      }
    }
    s.items.occult_notes = 0;
    s.studyProgress = 0;
    // 灵视只由占卜家正式训练授予；普通人和其他途径旧档中的误授予一律清理。
    if (!hasTrustedSeerSpiritVisionSource(s)) s.knowledge = s.knowledge.filter(id => id !== 'spirit_vision');
    else if (!s.knowledge.includes('spirit_vision')) s.knowledge.push('spirit_vision');
    rebuildPersistedDivinationAndItemKnowledge(s, rawDivinationAttempts, rawDivinationInsights, rawItemKnowledge);
    // v13 开始委托板不得泄露尚未掌握的去向；已接委托作为有效入口保留。
    s.board = Array.isArray(s.board)
      ? s.board.filter(commission => commission && typeof commission.locationId === 'string'
        && isLocationUnlocked(s, commission.locationId)
        && !!LOCATIONS.find(location => location.id === commission.locationId)?.actions.includes('explore'))
      : [];
    if (!['ordinary', 'witness', 'informed'].includes(s.awareness)) s.awareness = isBeyonder(s) ? 'informed' : 'ordinary';
    s.schemaVersion = CURRENT_SCHEMA_VERSION;
    return s;
  } catch { return null; }
}
export function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }
