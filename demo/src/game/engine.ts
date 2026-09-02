import type { ActionResult, ActiveHunt, AppliedEffectReceipt, AreaSuspicionRecord, AreaSuspicionSource, BookReward, BookState, CaseThreatState, CheckAttemptRecord, CheckContext, CheckDef, CheckInternalResult, CheckReceipt, ClueRecord, ClueSourceKind, CombatApproach, CombatProfile, CombatRoundAction, CombatRoundState, CombatTechniqueEffect, Commission, CriticalActivity, DeepInvestigationDef, DivinationAttempt, DivinationCredential, DivinationInsight, DivinationMethod, DivinationOutcome, DivinationProvider, DivinationScoreInput, DivinationTargetKind, DockCombatPreparationId, DockEncounterAftermathChoiceId, DockGrayHatOperationId, DockOldYardActionId, DockSequence9ActionDef, DockTransferFollowupId, DockWitnessCrisisChoiceId, DockWitnessFollowupRouteId, EventBlueprint, EventInstance, EventInstanceContext, ExplorationAttempt, ExplorationCheckResult, GameState, Effect, GameEvent, HuntPreparationKey, HuntTargetDef, IdentityCover, IdentityTraceDiscovery, IdentityTraceKind, IdentityTraceResolution, IdentityTraceResolutionMethod, ItemCategory, ItemKnowledgeState, LandmarkEncounterRecord, LandmarkIntroductionRecord, LocationActionId, LogEntry, GenNPC, SkillKey, PathwayLead, PreparationMode, OrganizationId, OrganizationRoute, OpeningScenarioId, StructuredLead, DiaryPageState, MaterialSourceState, MurderRecord, Sequence8Progress, Sequence9ExplorationAbilityDef, Sequence9ExplorationAbilityId, Sequence9PreparationRecord, Timer, TravelMode, TingenLandmarkActionDef, TradeFairState, TradeFairProductDef, NightwatchRoutineActionId, DivinationClubCommissionId, ElliotLocatorMode, SeerTrainingNodeId, WoundActionKind, WoundLevel, InvestigationAssessmentOutcome, InvestigationHypothesisId, InvestigationMethodId, InvestigationWorkspace } from './types';
import { BOOK_DEFS, BOOK_SOURCE_DEFS, CLUE_DEFS, DEEP_INVESTIGATION_DEFS, DIVINATION_METHOD_DEFS, DOCK_CASE_DISPOSITIONS, DOCK_COMBAT_PREPARATIONS, DOCK_SEQUENCE9_ACTIONS, EVENTS, EXPLORATION_CHECKS, INVESTIGATION_EVIDENCE_DEFS, INVESTIGATION_HYPOTHESIS_DEFS, INVESTIGATION_METHOD_DEFS, investigationHypothesisCheckId, RANDOM_TEXT_EVENTS, NPCS, PATHWAYS, ORIGINS, OPENING_SCENARIOS, JOBS, ORGANIZATION_QUALIFICATION_TASKS, NIGHTWATCH_ROUTINE_ACTIONS, DIVINATION_CLUB_COMMISSIONS, SEER_TRAINING_NODES, SALVAGE_DEFS, SEQUENCE9_COMBAT_SKILLS, SEQUENCE9_EXPLORATION_ABILITIES, SHOP_DEFS, TINGEN_LANDMARK_ACTIONS, TINGEN_LANDMARK_ENCOUNTERS, TRADE_FAIR_PRODUCTS, BEYONDER_DEATH_SOURCES, HUNT_TARGET_DEFS, ITEMS, INTEL_NAMES, SKILL_NAMES, KNOWLEDGE_NAMES, LOCATIONS, ORGANIZATIONS, ORGANIZATION_LEAD_DEFS, ROSELLE_DIARY_PAGE_DEFS, MATERIAL_SOURCE_DEFS, SEQUENCE8_ACTING_DEFS, SEQUENCE8_RITUAL_DEFS, findEvent, findItem, findPathway, findJob, formulaName, npcAvailable, npcLocation, npcScheduleOwnerDay, weekdayOf, companionSpec, COMPANION_MIN_FAVOR, STAT_NAMES } from './data';
import { evaluateCheck, sanitizeCheckAttemptRecord, toPublicCheckResult } from './checks';
import { generateNPC, generateCoworker, generateCommission, spawnNemesis } from './gen';
import type { NPCDef, JobDef } from './types';
import { hasFormalNightwatchRoute, hasVerifiedBlackthornReferral, isLocationUnlocked, locationAccessIssue, redactLockedLocationText } from './location-access';

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const rnd = (n: number) => Math.floor(Math.random() * n);
export const CURRENT_SCHEMA_VERSION = 32;
export type { ActionResult } from './types';
export { getVisibleLocations, hasFormalNightwatchRoute, hasVerifiedBlackthornReferral, isLocationUnlocked, isMaterialRouteValid, locationAccessIssue, redactLockedLocationText } from './location-access';

const COMBAT_PATHWAY_BONUSES: Record<string, Partial<Omit<CombatProfile, 'injuryPenalty'>>> = {
  seer: { maxSpirit: 10, spiritualAttack: 4, spiritualDefense: 4, critical: 6, dodge: 6 },
  spectator: { maxSpirit: 12, spiritualAttack: 10, spiritualDefense: 8, dodge: 2 },
  hunter: { maxHp: 20, physicalAttack: 10, physicalDefense: 5, critical: 10 },
  sleepless: { maxHp: 10, maxSpirit: 8, physicalDefense: 4, spiritualDefense: 6 },
  apprentice: { maxSpirit: 10, spiritualAttack: 4, spiritualDefense: 4, dodge: 10, critical: 4 },
};

function equippedCombatItems(s: GameState) {
  const loadout = s.combatLoadout ?? { weaponId: null, armorId: null, focusId: null };
  return ([loadout.weaponId, loadout.armorId, loadout.focusId] as const).flatMap(itemId => {
    const item = itemId ? findItem(itemId) : undefined;
    if (!item?.combat?.profileBonus || (s.items?.[item.id] ?? 0) <= 0) return [];
    if (item.combat.slot === 'focus' && !hasInheritedSequence9Ability(s)) return [];
    if (item.id === 'revolver' && (s.items?.revolver_ammo ?? 0) <= 0) return [];
    return [item];
  });
}

function combatItemProfileBonus(s: GameState) {
  const result: Partial<CombatProfile> = {};
  for (const item of equippedCombatItems(s)) {
    for (const [key, value] of Object.entries(item.combat!.profileBonus!)) {
      const profileKey = key as keyof CombatProfile;
      result[profileKey] = ((result[profileKey] as number | undefined) ?? 0) + (value ?? 0) as never;
    }
  }
  return result;
}

export function getCombatEquipmentView(s: GameState) {
  const activeIds = new Set(equippedCombatItems(s).map(item => item.id));
  const loadout = s.combatLoadout ?? { weaponId: null, armorId: null, focusId: null };
  return ([loadout.weaponId, loadout.armorId, loadout.focusId] as const).flatMap(itemId => {
    const item = itemId ? findItem(itemId) : undefined;
    if (!item?.combat?.profileBonus || (s.items?.[item.id] ?? 0) <= 0) return [];
    return [{
      id: item.id, name: item.name, slot: item.combat.slot, active: activeIds.has(item.id),
      status: item.id === 'revolver' && (s.items.revolver_ammo ?? 0) <= 0 ? '没有弹药，当前只能作为普通负重携带。'
        : item.combat.slot === 'focus' && !hasInheritedSequence9Ability(s) ? '尚未成为非凡者，无法稳定发挥灵性媒介。' : null,
    }];
  });
}

const LOADOUT_KEYS = { weapon: 'weaponId', armor: 'armorId', focus: 'focusId' } as const;

function strongestOwnedCombatItem(s: GameState, slot: 'weapon' | 'armor' | 'focus') {
  return ITEMS.filter(item => item.combat?.slot === slot && item.combat.profileBonus && (s.items?.[item.id] ?? 0) > 0
    && (slot !== 'focus' || hasInheritedSequence9Ability(s)))
    .sort((a, b) => Object.values(b.combat!.profileBonus!).reduce((sum, value) => sum + (value ?? 0), 0)
      - Object.values(a.combat!.profileBonus!).reduce((sum, value) => sum + (value ?? 0), 0))[0]?.id ?? null;
}

function sanitizedCombatLoadout(s: GameState, raw: unknown, migrateAutomatic: boolean) {
  if (migrateAutomatic) return {
    weaponId: strongestOwnedCombatItem(s, 'weapon'), armorId: strongestOwnedCombatItem(s, 'armor'),
    focusId: strongestOwnedCombatItem(s, 'focus'),
  };
  const value = raw && typeof raw === 'object' ? raw as Partial<GameState['combatLoadout']> : {};
  const valid = (itemId: unknown, slot: 'weapon' | 'armor' | 'focus') => {
    if (itemId === null) return null;
    const item = typeof itemId === 'string' ? findItem(itemId) : undefined;
    return item?.combat?.slot === slot && item.combat.profileBonus && (s.items?.[item.id] ?? 0) > 0
      && (slot !== 'focus' || hasInheritedSequence9Ability(s)) ? item.id : null;
  };
  return { weaponId: valid(value.weaponId, 'weapon'), armorId: valid(value.armorId, 'armor'), focusId: valid(value.focusId, 'focus') };
}

export function combatItemEquipStatus(s: GameState, itemId: string) {
  const item = findItem(itemId);
  if (!item?.combat?.profileBonus || item.combat.slot === 'consumable') return null;
  const key = LOADOUT_KEYS[item.combat.slot];
  return { slot: item.combat.slot, equipped: s.combatLoadout?.[key] === itemId };
}

export function equipCombatItem(s: GameState, itemId: string): ActionResult {
  const item = findItem(itemId);
  if (!item?.combat?.profileBonus || item.combat.slot === 'consumable') return { ok: false, msg: '这件物品不能装备到战斗栏。' };
  if ((s.items[itemId] ?? 0) <= 0) return { ok: false, msg: '你并未持有这件装备。' };
  if (s.pendingEncounter || s.activeHunt?.phase === 'combat') return { ok: false, msg: '冲突已经开始，不能临时更换装备。' };
  if (s.atWork || s.currentLocation) return { ok: false, msg: '需要回到住处整理随身装备。' };
  if (item.combat.slot === 'focus' && !hasInheritedSequence9Ability(s)) return { ok: false, msg: '普通人无法稳定装备灵性媒介。' };
  s.combatLoadout ??= { weaponId: null, armorId: null, focusId: null };
  s.combatLoadout[LOADOUT_KEYS[item.combat.slot]] = itemId;
  addLog(s, `你把${item.name}放进了随身战斗装备栏。`, 'info');
  return { ok: true };
}

export function unequipCombatSlot(s: GameState, slot: 'weapon' | 'armor' | 'focus'): ActionResult {
  if (s.pendingEncounter || s.activeHunt?.phase === 'combat') return { ok: false, msg: '冲突已经开始，不能临时更换装备。' };
  if (s.atWork || s.currentLocation) return { ok: false, msg: '需要回到住处整理随身装备。' };
  s.combatLoadout ??= { weaponId: null, armorId: null, focusId: null };
  s.combatLoadout[LOADOUT_KEYS[slot]] = null;
  return { ok: true };
}

function equippedRevolverReady(s: GameState) {
  return s.combatLoadout?.weaponId === 'revolver' && (s.items.revolver ?? 0) > 0 && (s.items.revolver_ammo ?? 0) > 0;
}

function consumeRevolverRound(s: GameState) {
  if (!equippedRevolverReady(s)) return false;
  s.items.revolver_ammo = Math.max(0, (s.items.revolver_ammo ?? 0) - 1);
  addLog(s, `你开了一枪；左轮弹药还剩${s.items.revolver_ammo}发。`, 'info');
  return true;
}

export function getCombatProfile(s: GameState): CombatProfile {
  const pathwayBonus = s.pathwayId && hasInheritedSequence9Ability(s, s.pathwayId)
    ? COMBAT_PATHWAY_BONUSES[s.pathwayId] ?? {} : {};
  const itemBonus = combatItemProfileBonus(s);
  const maxHp = 40 + s.stats.phy * 2 + (pathwayBonus.maxHp ?? 0);
  const maxSpirit = 20 + s.stats.spi * 2 + Math.floor(s.stats.mnd / 2) + (pathwayBonus.maxSpirit ?? 0);
  const currentHp = Number.isFinite(s.combatVitals?.hp) ? s.combatVitals.hp : maxHp;
  const hpRatio = maxHp > 0 ? currentHp / maxHp : 0;
  const injuryPenalty: 0 | 4 | 8 = hpRatio <= 0.25 ? 8 : hpRatio <= 0.5 ? 4 : 0;
  const nightDodge = s.pathwayId === 'sleepless' && hasInheritedSequence9Ability(s, 'sleepless')
    && (s.hour >= 18 || s.hour < 6) ? 6 : 0;
  return {
    maxHp,
    maxSpirit,
    physicalAttack: Math.max(0, 8 + Math.floor(s.stats.phy / 2) + (s.skills.combat ?? 0) * 3
      + (itemBonus.physicalAttack ?? 0) + (pathwayBonus.physicalAttack ?? 0) - injuryPenalty),
    spiritualAttack: Math.max(0, 6 + Math.floor(s.stats.spi * 0.8) + (s.skills.occult ?? 0) * 3
      + (itemBonus.spiritualAttack ?? 0) + (pathwayBonus.spiritualAttack ?? 0)),
    physicalDefense: Math.max(0, 5 + Math.floor(s.stats.phy / 3) + (s.skills.combat ?? 0)
      + (itemBonus.physicalDefense ?? 0) + (pathwayBonus.physicalDefense ?? 0) - injuryPenalty),
    spiritualDefense: Math.max(0, 5 + Math.floor(s.stats.mnd / 3) + Math.floor(s.stats.spi / 4)
      + (s.skills.occult ?? 0) + (itemBonus.spiritualDefense ?? 0) + (pathwayBonus.spiritualDefense ?? 0)),
    critical: Math.max(0, 5 + (s.skills.combat ?? 0) * 3 + Math.floor(s.stats.mnd / 10)
      + (itemBonus.critical ?? 0) + (pathwayBonus.critical ?? 0)),
    dodge: Math.max(0, 5 + (s.skills.sneak ?? 0) * 3 + Math.floor((s.stats.phy + s.stats.mnd) / 8)
      + (itemBonus.dodge ?? 0) + (pathwayBonus.dodge ?? 0) + nightDodge - injuryPenalty),
    injuryPenalty,
  };
}

export function getWoundStatus(s: GameState): { level: WoundLevel; label: string; description: string } {
  const profile = getCombatProfile(s);
  const ratio = profile.maxHp > 0 ? s.combatVitals.hp / profile.maxHp : 0;
  if (ratio <= 0.25) return { level: 'critical', label: '濒危', description: '你只能勉强维持行动，不能主动迎向战斗。' };
  if (ratio <= 0.5) return { level: 'severe', label: '重伤', description: '伤势明显拖累物理攻击、防御与闪避。' };
  if (ratio < 1) return { level: 'light', label: '轻伤', description: '伤口仍在影响状态；继续受创可能迅速恶化。' };
  return { level: 'unhurt', label: '无明显伤势', description: '目前没有影响行动的外伤。' };
}

const SEVERE_BLOCKED_ACTIONS = new Set<WoundActionKind>([
  'explore', 'salvage', 'deep_investigation', 'active_hunt', 'active_combat',
]);

const CRITICAL_ALLOWED_ACTIVITIES = new Set<CriticalActivity>([
  'encounter_escape', 'forced_defense', 'leave', 'rest', 'emergency_aid', 'clinic_travel', 'clinic_treatment',
]);

/** 濒危状态的统一行动白名单。纯查询不调用此函数；所有主动推进默认传 active_progress。 */
export function criticalActivityIssue(s: GameState, activity: CriticalActivity = 'active_progress'): string | null {
  if (getWoundStatus(s).level !== 'critical' || CRITICAL_ALLOWED_ACTIVITIES.has(activity)) return null;
  return '你已处于濒危状态，只能处理眼前袭击、撤离、休息、求助或乘车前往北区诊所。';
}

/** 所有剧烈行动共用的伤势门禁；公开 API 必须在任何资源扣除前调用。 */
export function woundActionIssue(s: GameState, action: WoundActionKind): string | null {
  const wound = getWoundStatus(s);
  if (wound.level === 'critical') return criticalActivityIssue(s);
  if (wound.level === 'severe' && SEVERE_BLOCKED_ACTIONS.has(action)) {
    return '重伤正在拖累你的行动；先接受治疗，不能继续进行这类剧烈活动。';
  }
  return null;
}

const CLINIC_TREATMENT_PLANS = {
  light: { fee: 20, hours: 2, healing: 18, label: '轻伤清创与换药' },
  severe: { fee: 45, hours: 4, healing: 30, label: '重伤处置与留观' },
  critical: { fee: 80, hours: 6, healing: 40, label: '濒危急救与长时留观' },
} as const;

export function getClinicTreatmentPlan(s: GameState) {
  const level = getWoundStatus(s).level;
  return level === 'unhurt' ? null : { level, ...CLINIC_TREATMENT_PLANS[level] };
}

export function homeBandageIssue(s: GameState): string | null {
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return encounterIssue;
  if (currentEvent(s)) return '先处理眼前正在发生的事情。';
  if (s.atWork || s.currentLocation) return '需要回到住处，在干净环境中处理伤口。';
  if (getWoundStatus(s).level !== 'light') return '家庭包扎只适合轻伤；更严重的伤势必须去诊所。';
  if ((s.items.medical_dressing ?? 0) <= 0) return '缺少一份消毒绷带与敷料。';
  return null;
}

export function applyHomeBandage(s: GameState): ActionResult {
  const issue = homeBandageIssue(s);
  if (issue) return { ok: false, msg: issue };
  const beforeHp = s.combatVitals.hp;
  s.items.medical_dressing--;
  s.combatVitals.hp += 8;
  clampCombatVitals(s);
  advanceHours(s, 1);
  addLog(s, `你用一份消毒敷料重新包扎伤口，恢复了${s.combatVitals.hp - beforeHp}点生命。`, 'good');
  return { ok: true };
}

export function emergencyAidIssue(s: GameState): string | null {
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return encounterIssue;
  if (currentEvent(s)) return '先处理眼前正在发生的事情。';
  if (s.atWork || s.currentLocation) return '需要先回到住处，才能请邻居联系慈善救护。';
  if (getWoundStatus(s).level !== 'critical') return '慈善救护优先接应已经无法自行就医的濒危伤者。';
  return null;
}

/** 防止濒危且身无分文时永久锁死；只稳定到重伤，后续仍需工作筹钱并接受正规治疗。 */
export function requestEmergencyAid(s: GameState): ActionResult {
  const issue = emergencyAidIssue(s);
  if (issue) return { ok: false, msg: issue };
  const profile = getCombatProfile(s);
  const stabilizedHp = Math.max(s.combatVitals.hp + 1, Math.floor(profile.maxHp * 0.25) + 1);
  const beforeHp = s.combatVitals.hp;
  s.combatVitals.hp = Math.min(profile.maxHp, stabilizedHp);
  advanceHours(s, 6);
  addLog(s, `邻居替你叫来慈善救护。经过六小时止血与固定，你恢复了${s.combatVitals.hp - beforeHp}点生命，但仍属重伤；后续治疗费用仍需自行筹措。`, 'good');
  return { ok: true };
}

export function clinicTreatmentIssue(s: GameState): string | null {
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return encounterIssue;
  if (currentEvent(s)) return '先处理眼前正在发生的事情。';
  if (s.atWork) return '工作期间无法接受完整治疗。';
  if (s.currentLocation?.locationId !== 'north_clinic') return '需要亲自前往北区诊所。';
  const plan = getClinicTreatmentPlan(s);
  if (!plan) return '目前没有需要诊所处理的外伤。';
  if (!actionFitsWindow(s.hour, plan.hours, 8, 18)) return '诊所无法在今日门诊结束前完成这档处置。';
  if (s.pence < plan.fee) return '现有钱款不足以支付这档治疗费用。';
  return null;
}

export function receiveClinicTreatment(s: GameState): ActionResult {
  const issue = clinicTreatmentIssue(s);
  if (issue) return { ok: false, msg: issue };
  const plan = getClinicTreatmentPlan(s)!;
  const beforeHp = s.combatVitals.hp;
  s.pence -= plan.fee;
  s.combatVitals.hp += plan.healing;
  clampCombatVitals(s);
  advanceHours(s, plan.hours);
  addLog(s, `北区诊所完成了${plan.label}。你支付${fmtMoney(plan.fee)}，恢复了${s.combatVitals.hp - beforeHp}点生命；后续仍需休养。`, 'good');
  return { ok: true };
}

export function clampCombatVitals(s: GameState) {
  const profile = getCombatProfile(s);
  const rawHp = Number.isFinite(s.combatVitals?.hp) ? Math.floor(s.combatVitals.hp) : profile.maxHp;
  const rawSpirit = Number.isFinite(s.combatVitals?.spirit) ? Math.floor(s.combatVitals.spirit) : profile.maxSpirit;
  s.combatVitals = {
    hp: Math.max(0, Math.min(profile.maxHp, rawHp)),
    spirit: Math.max(0, Math.min(profile.maxSpirit, rawSpirit)),
  };
}

export function applyCombatImpact(s: GameState, physicalPower: number, spiritualPower = 0, accuracy = 40) {
  const profile = getCombatProfile(s);
  const dodgeReduction = profile.dodge >= accuracy ? 6 : profile.dodge >= accuracy - 8 ? 3 : 0;
  const hpDamage = physicalPower > 0
    ? Math.max(1, Math.floor(physicalPower) - Math.floor(profile.physicalDefense / 2) - dodgeReduction) : 0;
  const spiritDamage = spiritualPower > 0
    ? Math.max(1, Math.floor(spiritualPower) - Math.floor(profile.spiritualDefense / 2)) : 0;
  s.combatVitals.hp = Math.max(0, s.combatVitals.hp - hpDamage);
  s.combatVitals.spirit = Math.max(0, s.combatVitals.spirit - spiritDamage);
  return { hpDamage, spiritDamage, dodgeReduction };
}

function rescueFromFatalInjury(s: GameState, sceneText: string) {
  if (s.combatVitals.hp > 0) return false;
  s.combatVitals.hp = 1;
  const treatmentCost = Math.min(36, Math.max(0, s.pence));
  s.pence -= treatmentCost;
  s.pendingEncounter = null;
  s.currentLocation = null;
  s.atWork = false;
  addLog(s, `${sceneText}你在救援与简单救治后保住了性命，医药与车费共花去${fmtMoney(treatmentCost)}。`, 'bad');
  return true;
}

const validAreaId = (areaId: string) => areaId === 'home' || LOCATIONS.some(location => location.id === areaId);

const IDENTITY_TRACE_RULES: Record<IdentityTraceKind, {
  sources: readonly AreaSuspicionSource[];
  investigationCheckId: string;
  resolutionCheckId: string;
  method: IdentityTraceResolutionMethod;
  reduction: number;
  fee: number;
  blockedFee: number;
  investigationLabel: string;
  knownLabel: string;
  nextStepText: string;
  resolutionLabel: string;
}> = {
  witness_description: {
    sources: ['dock_escape_failed'], investigationCheckId: 'identity_investigate_witness',
    resolutionCheckId: 'identity_resolve_witness', method: 'alibi_correction', reduction: 25, fee: 12, blockedFee: 6,
    investigationLabel: '侧面核对目击描述', knownLabel: '有人记住了你匆忙离开的轮廓',
    nextStepText: '整理当日行程与工作凭据，让中间人纠正把你和冲突者混为一人的描述。',
    resolutionLabel: '提交行程凭据并修正描述',
  },
  public_confrontation: {
    sources: ['dock_defensive_physical', 'dock_active_physical', 'dock_defensive_spiritual', 'dock_active_spiritual'],
    investigationCheckId: 'identity_investigate_confrontation', resolutionCheckId: 'identity_resolve_confrontation',
    method: 'scene_misdirection', reduction: 35, fee: 30, blockedFee: 15,
    investigationLabel: '复盘公开冲突留下的痕迹', knownLabel: '冲突现场留下了可以相互印证的衣着与行动描述',
    nextStepText: '准备一套不同衣着，并通过可靠中间人处理仍在流传的错误特征。',
    resolutionLabel: '安排中间人处理现场描述',
  },
  death_connection: {
    sources: ['hunt_death'], investigationCheckId: 'identity_investigate_death',
    resolutionCheckId: 'identity_resolve_death', method: 'legal_record_review', reduction: 10, fee: 60, blockedFee: 24,
    investigationLabel: '核对死者最后的交易与会面记录', knownLabel: '地下交易记录把你与死者最后一次单独接触联系起来',
    nextStepText: '请熟悉灰色交易的事务代理核对登记。即使记录得到处理，恶名与全局执法关注也不会消失。',
    resolutionLabel: '委托事务代理复核交易登记',
  },
};

function identityTraceKind(source: AreaSuspicionSource): IdentityTraceKind {
  if (source === 'dock_escape_failed') return 'witness_description';
  if (source === 'hunt_death') return 'death_connection';
  return 'public_confrontation';
}

function identityTraceRule(source: AreaSuspicionSource) {
  return IDENTITY_TRACE_RULES[identityTraceKind(source)];
}

function rebuildAreaSuspicion(s: GameState) {
  const base: Record<string, number> = {};
  const lastIncident: Record<string, number> = {};
  for (const record of s.areaSuspicionRecords ?? []) {
    if (!validAreaId(record.areaId)) continue;
    base[record.areaId] = (base[record.areaId] ?? 0) + record.amount;
    lastIncident[record.areaId] = Math.max(lastIncident[record.areaId] ?? 0, (record.day - 1) * 24 + record.hour);
  }
  const relief: Record<string, number> = {};
  for (const resolution of s.identityTraceResolutions ?? []) {
    const source = s.areaSuspicionRecords?.find(record => record.id === resolution.sourceRecordId);
    if (!source) continue;
    relief[source.areaId] = (relief[source.areaId] ?? 0) + resolution.amount;
  }
  const aggregate: Record<string, number> = {};
  for (const [areaId, rawBase] of Object.entries(base)) {
    const remainingAfterActions = Math.max(0, rawBase - (relief[areaId] ?? 0));
    let value = remainingAfterActions;
    if (value < 100) {
      const quietHours = Math.max(0, absoluteHour(s) - (lastIncident[areaId] ?? absoluteHour(s)) - 72);
      value = Math.max(0, value - Math.floor(quietHours / 24) * 5);
    }
    if (value > 0) aggregate[areaId] = Math.min(100, value);
  }
  s.areaSuspicion = aggregate;
  s.wantedAreas = Object.entries(aggregate).filter(([, value]) => value >= 100).map(([areaId]) => areaId).sort();
}

export function getIdentityCoverStatus(s: GameState) {
  const active = !!s.identityCover && s.identityCover.expiresAbsoluteHour > absoluteHour(s);
  return {
    active,
    remainingHours: active ? s.identityCover!.expiresAbsoluteHour - absoluteHour(s) : 0,
    label: active ? '普通伪装仍可使用' : '没有正在使用的身份掩饰',
  };
}

function isPublicIdentityCheckpoint(locationId: string) {
  const location = LOCATIONS.find(candidate => candidate.id === locationId);
  return !!location && (location.public === true
    || (location.region === '城区' && !['black_market', 'canal', 'forston_hideout'].includes(locationId)));
}

export function getIdentityExposureEntries(s: GameState) {
  const areaIds = [...new Set((s.areaSuspicionRecords ?? []).map(record => record.areaId))];
  return areaIds.map(areaId => {
    const status = getAreaSuspicionStatus(s, areaId);
    const traces = s.areaSuspicionRecords.filter(record => record.areaId === areaId).map(record => {
      const kind = identityTraceKind(record.source);
      const rule = IDENTITY_TRACE_RULES[kind];
      const discovered = s.identityTraceDiscoveries?.some(entry => entry.sourceRecordId === record.id) ?? false;
      const resolved = s.identityTraceResolutions?.some(entry => entry.sourceRecordId === record.id) ?? false;
      return {
        sourceRecordId: record.id,
        kind,
        discovered,
        resolved,
        label: discovered ? rule.knownLabel : '尚未查明具体来源的可追查痕迹',
        nextStepText: discovered ? (resolved ? '这条痕迹已经完成一次有效处理。' : rule.nextStepText) : '先从公开记录、目击者口风和自己的行动时间线中核对。',
        investigationLabel: rule.investigationLabel,
        resolutionLabel: rule.resolutionLabel,
      };
    });
    return { ...status, traces };
  });
}

function identityActionBaseIssue(s: GameState): string | null {
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return encounterIssue;
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
  if (currentEvent(s)) return '先处理眼前正在发生的事情。';
  if (!isAtHome(s)) return s.atWork ? '需要先下班回到住处整理身份记录。' : '需要先回到住处，才能安全核对身份痕迹。';
  return null;
}

function nextUndiscoveredIdentityTrace(s: GameState, areaId: string) {
  return (s.areaSuspicionRecords ?? []).find(record => record.areaId === areaId
    && !s.identityTraceDiscoveries?.some(entry => entry.sourceRecordId === record.id));
}

function nextUnresolvedIdentityTrace(s: GameState, areaId: string) {
  return (s.areaSuspicionRecords ?? []).find(record => record.areaId === areaId
    && s.identityTraceDiscoveries?.some(entry => entry.sourceRecordId === record.id)
    && !s.identityTraceResolutions?.some(entry => entry.sourceRecordId === record.id));
}

export function identityTraceInvestigationIssue(s: GameState, areaId: string): string | null {
  const baseIssue = identityActionBaseIssue(s);
  if (baseIssue) return baseIssue;
  if (!validAreaId(areaId)) return '这不是能够核验的地区。';
  const trace = nextUndiscoveredIdentityTrace(s, areaId);
  if (!trace) return '当前没有尚未查明来源的身份痕迹。';
  const rule = identityTraceRule(trace.source);
  const internal = evaluateExplorationCheckInternal(s, rule.investigationCheckId);
  const repeatedIssue = repeatedBlockedExplorationIssue(s, internal);
  if (repeatedIssue) return repeatedIssue;
  if (s.stats.energy < energyCost(s, internal.outcome === 'passed' ? 10 : 6)) return '精力不足以完成这轮核对。';
  return null;
}

export function investigateIdentityTrace(s: GameState, areaId: string): ActionResult {
  const issue = identityTraceInvestigationIssue(s, areaId);
  if (issue) return { ok: false, msg: issue };
  const trace = nextUndiscoveredIdentityTrace(s, areaId)!;
  const rule = identityTraceRule(trace.source);
  const startedAt = { day: s.day, hour: s.hour };
  const request = explorationCheckRequest(s, rule.investigationCheckId, startedAt);
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  const passed = internal.outcome === 'passed';
  const hours = passed ? 2 : 1;
  const effects = applyEffects(s, [{ k: 'energy', v: -energyCost(s, passed ? 10 : 6) }]);
  const receipt: CheckReceipt = { hoursElapsed: hours, effects: [receiptEntry('energy', effects[0]), hoursReceipt(hours)] };
  if (passed) receipt.effects.push({ id: 'identity:trace', applied: true, before: false, after: true });
  const attempt = recordCheckAttempt(s, internal, request.context, receipt, startedAt);
  if (passed) {
    s.identityTraceDiscoveries.push({
      sourceRecordId: trace.id, kind: identityTraceKind(trace.source), investigationAttemptId: attempt.attemptId,
    });
    addLog(s, `你把公开记录、目击者口风和自己的时间线逐项对照，确认了【${rule.knownLabel}】。下一步：${rule.nextStepText}`, 'system');
  } else {
    addLog(s, '现有记录无法说明是谁、在什么环节把你的特征联系起来。继续重复询问只会让人记住你，需要先提升调查或交谈能力。', 'info');
  }
  advanceHours(s, hours);
  return { ok: true, outcome: passed ? 'passed' : 'blocked' };
}

export function identityTraceResolutionIssue(s: GameState, areaId: string): string | null {
  const baseIssue = identityActionBaseIssue(s);
  if (baseIssue) return baseIssue;
  const trace = nextUnresolvedIdentityTrace(s, areaId);
  if (!trace) return '需要先查明一条尚未处理的具体身份痕迹。';
  const rule = identityTraceRule(trace.source);
  if (s.pence < rule.fee) return '现有钱款不足以支付凭据、跑腿和事务代理费用。';
  if (identityTraceKind(trace.source) === 'public_confrontation' && (s.items.plain_disguise_kit ?? 0) <= 0) {
    return '需要一份普通伪装用品，才能替换仍在流传的衣着特征。';
  }
  const internal = evaluateExplorationCheckInternal(s, rule.resolutionCheckId);
  const repeatedIssue = repeatedBlockedExplorationIssue(s, internal);
  if (repeatedIssue) return repeatedIssue;
  if (s.stats.energy < energyCost(s, internal.outcome === 'passed' ? 12 : 8)) return '精力不足以完成这轮处理。';
  return null;
}

export function resolveIdentityTrace(s: GameState, areaId: string): ActionResult {
  const issue = identityTraceResolutionIssue(s, areaId);
  if (issue) return { ok: false, msg: issue };
  const trace = nextUnresolvedIdentityTrace(s, areaId)!;
  const kind = identityTraceKind(trace.source);
  const rule = IDENTITY_TRACE_RULES[kind];
  const startedAt = { day: s.day, hour: s.hour };
  const request = explorationCheckRequest(s, rule.resolutionCheckId, startedAt);
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  const passed = internal.outcome === 'passed';
  const hours = passed ? (kind === 'witness_description' ? 2 : kind === 'public_confrontation' ? 3 : 4)
    : kind === 'witness_description' ? 1 : 2;
  const fee = passed ? rule.fee : rule.blockedFee;
  const requestedEffects: Effect[] = [
    { k: 'energy', v: -energyCost(s, passed ? 12 : 8) },
    { k: 'money', v: -fee },
    ...(kind === 'public_confrontation' ? [{ k: 'item' as const, id: 'plain_disguise_kit', v: -1 }] : []),
  ];
  const applied = applyEffects(s, requestedEffects);
  const receiptEffects = [receiptEntry('energy', applied[0]), receiptEntry('money', applied[1])];
  if (kind === 'public_confrontation') receiptEffects.push(receiptEntry('item:plain_disguise_kit', applied[2]));
  receiptEffects.push(hoursReceipt(hours));
  const receipt: CheckReceipt = { hoursElapsed: hours, effects: receiptEffects };
  if (passed) receipt.effects.push({ id: 'identity:resolved', applied: true, before: false, after: true });
  const attempt = recordCheckAttempt(s, internal, request.context, receipt, startedAt);
  if (passed) {
    s.identityTraceResolutions.push({
      sourceRecordId: trace.id, method: rule.method, amount: rule.reduction, resolutionAttemptId: attempt.attemptId,
    });
    rebuildAreaSuspicion(s);
    const status = getAreaSuspicionStatus(s, areaId);
    addLog(s, `针对【${rule.knownLabel}】的处理形成了可核验结果。它不改写已经发生的事，但当地现有记录不再像之前那样容易闭合。当前情况：${status.label}。`, 'good');
  } else {
    addLog(s, '事务处理没有形成可信闭环。跑腿与材料已经花掉，但对方不愿凭现有说法改动记录；需要先改善相关能力。', 'info');
  }
  advanceHours(s, hours);
  return { ok: true, outcome: passed ? 'passed' : 'blocked' };
}

export function identityCoverIssue(s: GameState): string | null {
  const baseIssue = identityActionBaseIssue(s);
  if (baseIssue) return baseIssue;
  if (getIdentityCoverStatus(s).active) return '现有伪装仍能使用，不必立刻重新准备。';
  if ((s.items.plain_disguise_kit ?? 0) <= 0) return '缺少一份普通伪装用品。';
  const internal = evaluateExplorationCheckInternal(s, 'identity_prepare_cover');
  const repeatedIssue = repeatedBlockedExplorationIssue(s, internal);
  if (repeatedIssue) return repeatedIssue;
  if (s.stats.energy < energyCost(s, internal.outcome === 'passed' ? 8 : 5)) return '精力不足以完成细节准备。';
  return null;
}

export function prepareIdentityCover(s: GameState): ActionResult {
  const issue = identityCoverIssue(s);
  if (issue) return { ok: false, msg: issue };
  const startedAt = { day: s.day, hour: s.hour };
  const request = explorationCheckRequest(s, 'identity_prepare_cover', startedAt);
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  const passed = internal.outcome === 'passed';
  const hours = passed ? 2 : 1;
  const applied = applyEffects(s, [
    { k: 'energy', v: -energyCost(s, passed ? 8 : 5) },
    { k: 'item', id: 'plain_disguise_kit', v: -1 },
  ]);
  const receipt: CheckReceipt = {
    hoursElapsed: hours,
    effects: [receiptEntry('energy', applied[0]), receiptEntry('item:plain_disguise_kit', applied[1]), hoursReceipt(hours)],
  };
  if (passed) receipt.effects.push({ id: 'identity:cover', applied: true, before: false, after: true });
  const attempt = recordCheckAttempt(s, internal, request.context, receipt, startedAt);
  if (passed) {
    s.identityCover = {
      preparationAttemptId: attempt.attemptId, createdDay: startedAt.day, createdHour: startedAt.hour,
      expiresAbsoluteHour: (startedAt.day - 1) * 24 + startedAt.hour + hours + 24,
    };
    addLog(s, '你改变了头发、眼镜、领巾与说话习惯，并为可能的盘问准备了一套普通身份说辞。它只能应付一般辨认，不能推翻正式通缉。', 'good');
  } else {
    addLog(s, '镜中的变化彼此矛盾，说辞也经不起追问。你丢掉已经用坏的材料，没有带着这套破绽出门。', 'info');
  }
  advanceHours(s, hours);
  return { ok: true, outcome: passed ? 'passed' : 'blocked' };
}

export function getAreaSuspicionStatus(s: GameState, requestedAreaId?: string) {
  const currentAreaId = s.currentLocation?.locationId ?? (s.atWork ? findJob(s.jobId)?.locationId ?? 'home' : 'home');
  const areaId = requestedAreaId && validAreaId(requestedAreaId) ? requestedAreaId : currentAreaId;
  const value = Math.max(0, Math.min(100, Math.floor(s.areaSuspicion?.[areaId] ?? 0)));
  const wanted = value >= 100 && (s.wantedAreas ?? []).includes(areaId);
  const label = wanted ? '已被通缉' : value >= 70 ? '身份正在被追查' : value >= 40 ? '多次引起注意' : value > 0 ? '留下可辨认印象' : '无人特别留意';
  return {
    areaId,
    areaName: areaId === 'home' ? '住处周边' : LOCATIONS.find(location => location.id === areaId)!.name,
    value,
    label,
    wanted,
  };
}

function recordAreaSuspicion(
  s: GameState,
  areaId: string,
  source: AreaSuspicionSource,
  amount: number,
  attempt: CheckAttemptRecord,
) {
  if (!validAreaId(areaId) || amount <= 0) return;
  s.areaSuspicionRecords ??= [];
  const id = `${source}:${attempt.attemptId}`;
  if (s.areaSuspicionRecords.some(record => record.id === id || record.settlementAttemptId === attempt.attemptId)) return;
  s.areaSuspicionRecords.push({
    id, areaId, source, amount, day: attempt.startedDay, hour: attempt.startedHour,
    settlementAttemptId: attempt.attemptId,
  });
  rebuildAreaSuspicion(s);
  const status = getAreaSuspicionStatus(s, areaId);
  addLog(s, status.wanted
    ? `你在【${status.areaName}】留下的目击与追查记录已经闭合，当地开始公开通缉你的身份。`
    : `你在【${status.areaName}】留下了新的可追查痕迹。当前情况：${status.label}。`, 'bad');
}

function dockAreaSuspicionAmount(source: Exclude<AreaSuspicionSource, 'hunt_death'>, preparations: readonly DockCombatPreparationId[]) {
  const base: Record<Exclude<AreaSuspicionSource, 'hunt_death'>, number> = {
    dock_escape_failed: 40,
    dock_defensive_physical: 65,
    dock_active_physical: 75,
    dock_defensive_spiritual: 75,
    dock_active_spiritual: 100,
  };
  let amount = base[source];
  if (preparations.includes('mapped_retreat')) amount -= 10;
  if (source === 'dock_active_physical' && preparations.includes('prepared_ambush')) amount -= 10;
  if ((source === 'dock_defensive_spiritual' || source === 'dock_active_spiritual')
    && preparations.includes('spiritual_guard')) amount -= 10;
  return Math.max(20, amount);
}

function blankPathwayLead(): PathwayLead {
  return { history: [], routeStep: 'none', commitment: false };
}

export function createTradeFairState(): TradeFairState {
  return {
    invitation: null,
    stock: Object.fromEntries(TRADE_FAIR_PRODUCTS.map(product => [product.id, product.initialStock])),
    purchasedCounts: Object.fromEntries(TRADE_FAIR_PRODUCTS.map(product => [product.id, 0])),
    consumedPurchasedCounts: Object.fromEntries(TRADE_FAIR_PRODUCTS.map(product => [product.id, 0])),
    identifiedCharacteristicIds: [],
  };
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

export function createNightwatchEarlyLoopState(): GameState['nightwatchEarlyLoop'] {
  return { reputation: 0, trainingProgress: {}, records: [] };
}

export function createDivinationClubState(): GameState['divinationClub'] {
  return { joined: false, reputation: 0, activeCommissionId: null, completedCommissionIds: [] };
}

export function createElliotCaseState(): GameState['elliotCase'] {
  return { stage: 'unknown', employerId: null, assignedPartnerId: null, locatorMode: null, rewardClaimed: false };
}

export function createSeerTrainingState(): GameState['seerTraining'] {
  return {
    learnedNodeIds: [], lessonRecords: [], meditationPracticeDays: [], focusPreparation: false,
    ritualPracticeComplete: false, spiritChannelingCaseIds: [], blankCharmPracticeComplete: false,
  };
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
const completeNPCPool = (s: GameState): NPCDef[] => [...NPCS, ...metLandmarkNPCs(s), ...s.genNpcs];
const huntTargetDef = (targetId: string): HuntTargetDef | undefined => HUNT_TARGET_DEFS.find(target => target.id === targetId);
const huntTargetIsDead = (s: GameState, target: HuntTargetDef) => (s.confirmedBeyonderDeaths ?? []).some(record => record.npcId === target.npcId)
  || BEYONDER_DEATH_SOURCES.some(source => source.huntTargetId === target.id && !!source.eventId && (s.firedOnce ?? []).includes(source.eventId));
/** 特殊猎杀目标只在玩家亲临其活动地点、已经结识或正在调查时出现；死亡后从人脉池移除。 */
function visibleCoreNPC(s: GameState, npc: NPCDef): boolean {
  if (npc.id === 'old_neil') return isFormalNightwatchSeerStudent(s)
    && s.currentLocation?.locationId === 'blackthorn_security' && npcAvailable(npc, s.day, s.hour);
  if ((npc.id === 'vickroyer' || npc.id === 'leonard') && s.elliotCase?.stage === 'unknown') return false;
  const target = HUNT_TARGET_DEFS.find(candidate => candidate.npcId === npc.id);
  if (!target) return true;
  if (huntTargetIsDead(s, target) || s.flags?.[`hunt_target_departed:${target.id}`]) return false;
  return s.relations[npc.id] !== undefined || s.activeHunt?.targetId === target.id
    || (s.currentLocation?.locationId === target.locationId && isTradeFairOpen(s));
}
/** 全部玩家已知 NPC = 手写核心 + 已正式首遇的地标人物 + 程序生成。 */
export const allNPCs = (s: GameState): NPCDef[] => completeNPCPool(s).filter(npc => visibleCoreNPC(s, npc));
/** 规则层可以查找尚未公开的固定 NPC，但 UI 必须使用 allNPCs。 */
export const findAnyNPC = (s: GameState, id: string) => completeNPCPool(s).find(n => n.id === id);
const isNight = (h: number) => h >= 18 || h < 6;
const OCCULT_SHOP_ITEM_IDS = new Set([
  ...PATHWAYS.flatMap(pathway => [...pathway.seq9.materials, ...pathway.seq8.materials]),
  ...TRADE_FAIR_PRODUCTS.flatMap(product => product.itemId ? [product.itemId] : []),
]);
const SEQUENCE8_ITEM_IDS = new Set(PATHWAYS.flatMap(pathway => pathway.seq8.materials));
const MYSTIC_MATERIAL_ITEM_IDS = new Set([
  ...PATHWAYS.flatMap(pathway => [...pathway.seq9.materials, pathway.seq9.auxiliary, ...pathway.seq8.materials]),
  ...PATHWAYS.map(pathway => `${pathway.id}9_characteristic`),
]);

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

function explorationCheckRequest(s: GameState, checkId: string, startedAt = { day: s.day, hour: s.hour }) {
  const def = EXPLORATION_CHECKS.find(candidate => candidate.id === checkId);
  const context: CheckContext = {
    target: def?.target ?? { kind: 'case', id: checkId },
    stats: {}, skills: {}, clueIds: [], toolIds: [], abilityIds: [], preparationIds: [],
  };
  if (def) {
    context.locationId = s.currentLocation?.locationId;
    for (const term of def.contributions) {
      if (term.kind === 'stat') context.stats[term.id] = s.stats[term.id];
      else if (term.kind === 'skill') context.skills[term.id] = s.skills[term.id] ?? 0;
    }
    const relevantClues = new Set([
      ...def.requirements.filter(requirement => requirement.kind === 'clue').map(requirement => requirement.id),
      ...def.contributions.filter(term => term.kind === 'clue').map(term => term.id),
    ]);
    context.clueIds = s.clues.map(clue => clue.id).filter(id => relevantClues.has(id));
    const relevantTools = new Set([
      ...def.requirements.filter(requirement => requirement.kind === 'tool').map(requirement => requirement.id),
      ...def.contributions.filter(term => term.kind === 'tool').map(term => term.id),
    ]);
    context.toolIds = Object.entries(s.items)
      .filter(([id, amount]) => amount > 0 && relevantTools.has(id) && (id !== 'revolver' || equippedRevolverReady(s)))
      .map(([id]) => id);
    const relevantAbilities = new Set([
      ...def.requirements.filter(requirement => requirement.kind === 'ability').map(requirement => requirement.id),
      ...def.contributions.filter(term => term.kind === 'ability').map(term => term.id),
    ]);
    if (relevantAbilities.has('spirit_vision') && hasSpiritVisionAbility(s)) context.abilityIds.push('spirit_vision');
    if (relevantAbilities.has('seer_divination') && hasSeerDivinationSequence(s)) context.abilityIds.push('seer_divination');
    const seerAbilities: Array<[string, SeerTrainingNodeId | 'focus_preparation']> = [
      ['seer_meditation_focus', 'focus_preparation'],
      ['seer_spirit_vision_focus', 'spirit_vision_focus'],
      ['seer_dowsing', 'dowsing'],
      ['seer_spirituality_wall', 'spirituality_wall'],
      ['seer_ritual_safety', 'ritual_safety'],
      ['seer_spirit_channeling', 'spirit_channeling'],
      ['seer_charm_theory', 'charm_theory'],
    ];
    for (const [abilityId, source] of seerAbilities) {
      if (!relevantAbilities.has(abilityId)) continue;
      if (source === 'focus_preparation' ? s.seerTraining?.focusPreparation === true : hasSeerTrainingNode(s, source)) {
        context.abilityIds.push(abilityId);
      }
    }
    const relevantPreparations = new Set(def.contributions
      .filter(term => term.kind === 'preparation').map(term => term.id));
    const dockAssessments = s.investigationWorkspaces?.dock_manifest?.assessments ?? [];
    for (const hypothesis of INVESTIGATION_HYPOTHESIS_DEFS) {
      if (!relevantPreparations.has(hypothesis.preparationId)) continue;
      if (dockAssessments.some(assessment => assessment.hypothesisId === hypothesis.id
        && (assessment.outcome === 'reliable' || assessment.outcome === 'strong'))) {
        context.preparationIds.push(hypothesis.preparationId);
      }
    }
  }
  return { checkId, definitionVersion: def?.version, context, startedAt };
}

/** 规则层内部结果；包含审计数值，UI 不得直接读取。 */
export function evaluateExplorationCheckInternal(s: GameState, checkId: string, startedAt = { day: s.day, hour: s.hour }): CheckInternalResult {
  return evaluateCheck(EXPLORATION_CHECKS, explorationCheckRequest(s, checkId, startedAt));
}

export function getExplorationCheckPublicResult(s: GameState, checkId: string) {
  return toPublicCheckResult(evaluateExplorationCheckInternal(s, checkId));
}

/** 兼容旧 API：公式由纯内核计算，旧结果形状保持不变。 */
export function evaluateExplorationCheck(s: GameState, checkId: string): ExplorationCheckResult {
  const result = evaluateExplorationCheckInternal(s, checkId);
  const reason: ExplorationCheckResult['reason'] = result.reason === 'passed' ? 'passed'
    : result.reason === 'missing_requirement' ? 'missing_required_clue'
      : result.reason === 'insufficient' ? 'insufficient' : 'unknown_check';
  return {
    checkId,
    outcome: result.outcome,
    reason,
    score: result.score,
    difficulty: result.difficulty,
    contributingClueIds: result.contributions
      .filter(term => term.kind === 'clue').map(term => term.id.slice('clue:'.length)),
  };
}

function recordExplorationAttempt(s: GameState, result: ExplorationCheckResult, startedAt = { day: s.day, hour: s.hour }) {
  const attempt: ExplorationAttempt = {
    checkId: result.checkId,
    day: startedAt.day,
    hour: startedAt.hour,
    outcome: result.outcome,
    reason: result.reason,
    score: result.score,
    contributingClueIds: [...result.contributingClueIds],
  };
  s.explorationAttempts ??= [];
  s.explorationAttempts.push(attempt);
}

function recordCheckAttempt(s: GameState, internal: CheckInternalResult, context: CheckContext, receipt: CheckReceipt, startedAt: { day: number; hour: number }): CheckAttemptRecord {
  s.checkAttempts ??= [];
  let sequence = s.checkAttempts.length + 1;
  let attemptId = `${internal.checkId}:${startedAt.day}:${startedAt.hour}:${sequence}`;
  while (s.checkAttempts.some(attempt => attempt.attemptId === attemptId)) {
    sequence += 1;
    attemptId = `${internal.checkId}:${startedAt.day}:${startedAt.hour}:${sequence}`;
  }
  const attempt: CheckAttemptRecord = {
    attemptId,
    checkId: internal.checkId,
    definitionVersion: internal.definitionVersion,
    context: structuredClone(context),
    fingerprint: internal.fingerprint,
    startedDay: startedAt.day,
    startedHour: startedAt.hour,
    outcome: internal.outcome,
    reason: internal.reason,
    publicContributionIds: internal.contributions.map(term => term.id).sort(),
    receipt: structuredClone(receipt),
  };
  s.checkAttempts.push(attempt);
  if (s.checkAttempts.length > 200) {
    const protectedIds = new Set([
      ...(s.murderRecords ?? []).flatMap(record => [record.settlementAttemptId, record.initiatingAttemptId].filter((id): id is string => !!id)),
      ...(s.activeHunt?.initiatingAttemptId ? [s.activeHunt.initiatingAttemptId] : []),
      ...(s.areaSuspicionRecords ?? []).map(record => record.settlementAttemptId),
      ...(s.identityTraceDiscoveries ?? []).map(record => record.investigationAttemptId),
      ...(s.identityTraceResolutions ?? []).map(record => record.resolutionAttemptId),
      ...(s.identityCover?.preparationAttemptId ? [s.identityCover.preparationAttemptId] : []),
      ...Object.values(s.investigationWorkspaces ?? {}).flatMap(workspace => workspace.assessments.map(assessment => assessment.attemptId)),
      ...s.checkAttempts.filter(candidate => candidate.outcome === 'passed'
        && DIVINATION_CLUB_COMMISSIONS.some(def => candidate.checkId === def.acceptCheckId
          || candidate.checkId === def.fieldCheckId || candidate.checkId === def.checkId))
        .map(candidate => candidate.attemptId),
    ]);
    for (let index = 0; s.checkAttempts.length > 200 && index < s.checkAttempts.length;) {
      if (protectedIds.has(s.checkAttempts[index].attemptId)) index += 1;
      else s.checkAttempts.splice(index, 1);
    }
  }
  return attempt;
}

function repeatedBlockedExplorationIssue(s: GameState, internal: CheckInternalResult): string | null {
  if (internal.reason !== 'insufficient') return null;
  const repeated = [...(s.checkAttempts ?? [])].reverse().find(attempt => attempt.checkId === internal.checkId
    && attempt.definitionVersion === internal.definitionVersion && attempt.fingerprint === internal.fingerprint);
  return repeated?.outcome === 'blocked'
    ? '现有调查条件与上次没有实质变化；请先补充线索、工具或调查经验。'
    : null;
}

const DOCK_THREAT_ID = 'dock_manifest_cleaner';
const DOCK_ENCOUNTER_ID = 'encounter_dock_manifest_cleaner';

function caseThreat(s: GameState, threatId: string): CaseThreatState {
  s.caseThreats ??= {};
  return s.caseThreats[threatId] ??= {
    threatId, attention: 0, status: 'active', encounterCount: 0,
    noticedSourceIds: [], shownSignalStages: [],
  };
}

function raiseCaseThreat(
  s: GameState,
  threatId: string,
  sourceKind: 'deep_investigation' | 'divination' | 'hypothesis' | 'case_choice',
  sourceId: string,
  amount: number,
) {
  if (amount <= 0) return;
  const threat = caseThreat(s, threatId);
  if (threat.status === 'resolved' || threat.noticedSourceIds.includes(sourceId)) return;
  threat.noticedSourceIds.push(sourceId);
  threat.attention = clamp(threat.attention + amount);

  const signals: readonly [number, string][] = [
    [25, '你离开记录室时，街角那顶灰帽似乎已经出现过不止一次。你无法确认这是否只是巧合。'],
    [50, '你刚查看过的记录被人重新翻动过，几页纸的位置与先前不同。有人似乎比你更在意这些痕迹。'],
  ];
  for (const [stage, text] of signals) {
    if (threat.attention >= stage && !threat.shownSignalStages.includes(stage)) {
      threat.shownSignalStages.push(stage);
      addLog(s, text, 'event');
    }
  }
  if (threat.attention < 75 || threat.encounterCount > 0 || s.pendingEncounter) return;
  threat.encounterCount = 1;
  threat.shownSignalStages.push(75);
  s.pendingEncounter = {
    encounterId: DOCK_ENCOUNTER_ID,
    threatId,
    phase: 'escape_choice',
    sourceKind,
    sourceId,
    startedDay: s.day,
    startedHour: s.hour,
    narrativeVariant: (s.day + s.hour + s.eventCounter) % 3,
    preparations: [],
  };
  addLog(s, '回程的窄巷里，一串脚步不再掩饰。那个戴灰帽的陌生人堵住了通向灯火的方向。', 'bad');
}

export function activeEncounterIssue(s: GameState): string | null {
  if (s.pendingEncounter) return '眼前的跟踪者尚未摆脱，必须先处理这次遭遇。';
  if (s.activeHunt?.phase === 'confronted' || s.activeHunt?.phase === 'combat') {
    return '目标已经察觉异常，必须先处理眼前的对峙。';
  }
  return null;
}

export function dockThreatSignal(s: GameState): string | null {
  const threat = s.caseThreats?.[DOCK_THREAT_ID];
  if (!threat || threat.status === 'resolved') return null;
  if (threat.attention >= 50) return '有人正在主动翻动或清理你查过的记录。';
  if (threat.attention >= 25) return '你偶尔会在调查地点附近看到相似的灰帽身影。';
  return null;
}

const INVESTIGATION_RESULT_LABELS: Record<InvestigationAssessmentOutcome, string> = {
  inconclusive: '没理出头绪',
  limited: '有些说得通',
  reliable: '几处能够对上',
  strong: '多处彼此印证',
};

function readInvestigationWorkspace(s: GameState, caseId: string): InvestigationWorkspace {
  return s.investigationWorkspaces?.[caseId] ?? { caseId, selectedClueIds: [], assessments: [] };
}

function editableInvestigationWorkspace(s: GameState, caseId: string): InvestigationWorkspace {
  s.investigationWorkspaces ??= {};
  return s.investigationWorkspaces[caseId] ??= { caseId, selectedClueIds: [], assessments: [] };
}

function investigationOutcome(result: CheckInternalResult): InvestigationAssessmentOutcome {
  const margin = result.score - result.difficulty;
  if (margin >= 10) return 'strong';
  if (margin >= 0) return 'reliable';
  if (margin >= -6) return 'limited';
  return 'inconclusive';
}

function investigationHypothesis(hypothesisId: InvestigationHypothesisId) {
  return INVESTIGATION_HYPOTHESIS_DEFS.find(candidate => candidate.id === hypothesisId) ?? null;
}

function investigationMethod(methodId: InvestigationMethodId) {
  return INVESTIGATION_METHOD_DEFS.find(candidate => candidate.id === methodId) ?? null;
}

function investigationCheckRequest(
  s: GameState,
  hypothesisId: InvestigationHypothesisId,
  methodId: InvestigationMethodId,
  selectedClueIds: readonly string[],
  startedAt = { day: s.day, hour: s.hour },
) {
  const checkId = investigationHypothesisCheckId(hypothesisId, methodId);
  const request = explorationCheckRequest(s, checkId, startedAt);
  const relevant = new Set(EXPLORATION_CHECKS.find(def => def.id === checkId)?.contributions
    .filter(term => term.kind === 'clue').map(term => term.id) ?? []);
  request.context.clueIds = [...new Set(selectedClueIds)].filter(id => hasClue(s, id) && relevant.has(id)).sort();
  return request;
}

export function toggleInvestigationEvidence(s: GameState, caseId: string, clueId: string): ActionResult {
  if (caseId !== 'dock_manifest') return { ok: false, msg: '这个案子还没有可以梳理的记录。' };
  const record = s.clues.find(clue => clue.id === clueId && clue.caseId === caseId);
  if (!record || !INVESTIGATION_EVIDENCE_DEFS.some(def => def.clueId === clueId)) {
    return { ok: false, msg: '这条记录还没拿到手，不能放进案情梳理。' };
  }
  const workspace = editableInvestigationWorkspace(s, caseId);
  if (workspace.selectedClueIds.includes(clueId)) {
    workspace.selectedClueIds = workspace.selectedClueIds.filter(id => id !== clueId);
    return { ok: true };
  }
  if (workspace.selectedClueIds.length >= 3) return { ok: false, msg: '桌面已经摆了三份材料，先收起一份再换。' };
  workspace.selectedClueIds.push(clueId);
  workspace.selectedClueIds.sort();
  return { ok: true };
}

export function investigationHypothesisMethodIssue(
  s: GameState,
  hypothesisId: InvestigationHypothesisId,
  methodId: InvestigationMethodId,
): string | null {
  const hypothesis = investigationHypothesis(hypothesisId);
  const method = investigationMethod(methodId);
  if (!hypothesis || !method || !hypothesis.methodIds.includes(methodId)) return '这条思路不适合这样查。';
  if (dockCaseDispositionClue(s)) return '案子已经暂时告一段落，眼下没有必要继续惊动旁人。';
  if (s.pendingEncounter) return activeEncounterIssue(s);
  if (s.pendingEvent) return '眼前还有一件事情没有处理完。';
  const woundIssue = woundActionIssue(s, 'deep_investigation');
  if (woundIssue) return woundIssue;
  if (s.atWork) return '工作期间不能展开这轮案件核验。';
  const workspace = readInvestigationWorkspace(s, hypothesis.caseId);
  if (!hypothesis.requiredClueIds.every(id => workspace.selectedClueIds.includes(id))) {
    return '摆在一起的材料还接不上这条思路。';
  }
  const selectedKey = [...workspace.selectedClueIds].sort().join('|');
  if (workspace.assessments.some(assessment => assessment.hypothesisId === hypothesisId
    && assessment.methodId === methodId && [...assessment.clueIds].sort().join('|') === selectedKey)) {
    return '这些材料已经这样查过一次了。换份材料，或者换个查法。';
  }
  if (methodId === 'compare_records' && s.currentLocation && s.currentLocation.locationId !== 'docks') {
    return '需要回家整理笔记，或在码头记录窗口附近比对材料。';
  }
  if (methodId === 'interview_witness') {
    if (s.currentLocation?.locationId !== 'tavern') return '需要前往「醉水手」酒馆拜访知情者。';
    const visitIssue = npcVisitSessionIssue(s, 'mike');
    if (visitIssue) return visitIssue;
  }
  if (methodId === 'inspect_scene' && s.currentLocation?.locationId !== 'docks') return '需要回到东区码头复核现场。';
  if (methodId === 'occult_verify') {
    if (!hasSpiritVisionAbility(s)) return '你尚不具备能够受控检视异常的灵视能力。';
    if (s.currentLocation) return '受控检视需要回到住处，在能够及时中止的环境中进行。';
  }
  const request = investigationCheckRequest(s, hypothesisId, methodId, workspace.selectedClueIds);
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  if (!internal.eligible && internal.reason !== 'insufficient') return '眼下的条件还不够，暂时查不下去。';
  if (s.stats.energy <= energyCost(s, method.energyCost)) return '你已经很累了，脑子里很难再理清这些东西。';
  return null;
}

export function testInvestigationHypothesis(
  s: GameState,
  hypothesisId: InvestigationHypothesisId,
  methodId: InvestigationMethodId,
): ActionResult {
  const issue = investigationHypothesisMethodIssue(s, hypothesisId, methodId);
  if (issue) return { ok: false, msg: issue };
  const hypothesis = investigationHypothesis(hypothesisId)!;
  const method = investigationMethod(methodId)!;
  const workspace = editableInvestigationWorkspace(s, hypothesis.caseId);
  const startedAt = { day: s.day, hour: s.hour };
  const request = investigationCheckRequest(s, hypothesisId, methodId, workspace.selectedClueIds, startedAt);
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  if (!internal.eligible) return { ok: false, msg: '眼下的条件还不够，暂时查不下去。' };
  const outcome = investigationOutcome(internal);
  const applied = applyEffects(s, [{ k: 'energy', v: -energyCost(s, method.energyCost) }]);
  const receipt: CheckReceipt = {
    hoursElapsed: method.hours,
    effects: [
      receiptEntry('energy', applied[0]),
      hoursReceipt(method.hours),
      { id: `hypothesis:${hypothesisId}:assessment`, applied: true, before: false, after: true },
    ],
  };
  const attempt = recordCheckAttempt(s, internal, request.context, receipt, startedAt);
  workspace.assessments.push({
    hypothesisId, methodId, clueIds: [...workspace.selectedClueIds].sort(), outcome,
    attemptId: attempt.attemptId, day: startedAt.day, hour: startedAt.hour,
  });
  if (workspace.assessments.length > 30) workspace.assessments.splice(0, workspace.assessments.length - 30);
  addLog(s, `案情梳理 · ${hypothesis.label}：${INVESTIGATION_RESULT_LABELS[outcome]}。${hypothesis.nextStepByOutcome[outcome]}`,
    outcome === 'reliable' || outcome === 'strong' ? 'good' : 'info');
  maybeAnnounceDockWitnessCrisis(s);
  raiseCaseThreat(s, DOCK_THREAT_ID, 'hypothesis', `hypothesis:${hypothesisId}:${methodId}`, method.attentionOnAttempt);
  advanceHours(s, method.hours);
  return { ok: true, outcome: internal.outcome };
}

export function getInvestigationBoardView(s: GameState, caseId = 'dock_manifest') {
  if (caseId !== 'dock_manifest') return null;
  const workspace = readInvestigationWorkspace(s, caseId);
  const ownedClueIds = new Set(s.clues.filter(clue => clue.caseId === caseId).map(clue => clue.id));
  const evidence = INVESTIGATION_EVIDENCE_DEFS.filter(def => ownedClueIds.has(def.clueId)).flatMap(def => {
    const clue = CLUE_DEFS.find(candidate => candidate.id === def.clueId);
    return clue ? [{
      clueId: def.clueId, title: clue.title, sourceLabel: clue.sourceLabel,
      claim: def.claim, sourceQuality: def.sourceQuality,
      selected: workspace.selectedClueIds.includes(def.clueId),
    }] : [];
  });
  const hypotheses = INVESTIGATION_HYPOTHESIS_DEFS
    .filter(def => def.caseId === caseId && def.requiredClueIds.every(id => ownedClueIds.has(id)))
    .map(def => ({
      id: def.id,
      label: def.label,
      statement: def.statement,
      ready: def.requiredClueIds.every(id => workspace.selectedClueIds.includes(id)),
      methods: def.methodIds.map(methodId => {
        const method = investigationMethod(methodId)!;
        const assessments = workspace.assessments.filter(assessment => assessment.hypothesisId === def.id
          && assessment.methodId === methodId);
        const latest = assessments[assessments.length - 1];
        return {
          id: method.id, label: method.label, description: method.description, hours: method.hours,
          issue: investigationHypothesisMethodIssue(s, def.id, method.id),
          latest: latest ? {
            label: INVESTIGATION_RESULT_LABELS[latest.outcome],
            nextStep: def.nextStepByOutcome[latest.outcome],
            outcome: latest.outcome,
          } : null,
        };
      }),
    }));
  return {
    caseId,
    evidence,
    selectedCount: workspace.selectedClueIds.length,
    maxSelected: 3,
    hypotheses,
    guidance: evidence.length < 2
      ? '手里的材料太少，还看不出它们有没有联系。'
      : hypotheses.length === 0
        ? '这些材料暂时接不上。再去别处找一份记录，也许会有变化。'
        : '从手头材料里挑出至多三份，看看哪些能彼此对上。',
  };
}

const DOCK_WITNESS_CRISIS_CLUES = {
  warn_worker: 'dock_witness_warned',
  shadow_watcher: 'dock_watcher_route',
  request_protection: 'dock_witness_protected',
} as const;

const DOCK_WITNESS_CRISIS_ALL_OUTCOMES = [
  ...Object.values(DOCK_WITNESS_CRISIS_CLUES),
  'dock_witness_disappeared',
] as const;

function dockWitnessCrisisOutcomeClue(s: GameState): string | null {
  return DOCK_WITNESS_CRISIS_ALL_OUTCOMES.find(clueId => hasClue(s, clueId)) ?? null;
}

function dockWitnessCrisisReady(s: GameState) {
  if (!hasClue(s, 'dock_missing_reports') || !isMet(s, 'mike') || dockCaseDispositionClue(s)) return false;
  const assessments = s.investigationWorkspaces?.dock_manifest?.assessments ?? [];
  const supported = assessments.some(assessment => assessment.outcome === 'reliable' || assessment.outcome === 'strong');
  const confirmed = DEEP_INVESTIGATION_DEFS.filter(def => def.caseId === 'dock_manifest'
    && !!s.deepInvestigations?.[def.id]).length >= 2;
  return supported || confirmed;
}

function maybeAnnounceDockWitnessCrisis(s: GameState) {
  if (!dockWitnessCrisisReady(s) || dockWitnessCrisisOutcomeClue(s) || s.flags.dock_witness_crisis_announced) return;
  s.flags.dock_witness_crisis_announced = true;
  addLog(s, '麦克让人捎来一张折了两次的纸条：有个夜班工人发现陌生人在打听点名册，今晚已经不敢独自回家。', 'event');
  addLog(s, '你可以先提醒他避开原路，也可以去交接处暗中守候；如果已经有正式门路，还能请求安保人员接走他。', 'info');
}

const DOCK_WITNESS_CHECK_IDS: Record<DockWitnessCrisisChoiceId, string> = {
  warn_worker: 'dock_witness_crisis_warn',
  shadow_watcher: 'dock_witness_crisis_shadow',
  request_protection: 'dock_witness_crisis_protection',
};

export function dockWitnessCrisisChoiceIssue(s: GameState, choiceId: DockWitnessCrisisChoiceId): string | null {
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return encounterIssue;
  if (!dockWitnessCrisisReady(s)) return '眼下还没有能够确认的知情人危机。';
  if (dockWitnessCrisisOutcomeClue(s)) return '这次危机已经留下结果，无法重新选择。';
  if (s.atWork) return '工作期间无法离岗处理这件事。';
  if (choiceId === 'warn_worker') {
    if (s.currentLocation?.locationId !== 'tavern') return '需要到「醉水手」酒馆，请麦克把口信送进夜班工棚。';
  } else if (choiceId === 'shadow_watcher') {
    if (s.currentLocation?.locationId !== 'docks') return '需要先到东区码头的夜班交接处。';
    if (!isNight(s.hour)) return '盯梢者只在夜班交接后露面，需要等到入夜。';
  } else if (choiceId === 'request_protection') {
    if (!hasFormalNightwatchRoute(s)) return '你还没有能受理敏感保护请求的正式门路。';
    if (s.currentLocation?.locationId !== 'blackthorn_security') return '需要亲自到黑荆棘安保公司说明情况。';
  } else return '没有这个处理办法。';
  const cost = choiceId === 'shadow_watcher' ? 12 : choiceId === 'request_protection' ? 8 : 6;
  if (s.stats.energy < energyCost(s, cost)) return '你现在太疲惫，无法把这件事处理妥当。';
  return null;
}

export function getDockWitnessCrisisView(s: GameState) {
  if (!dockWitnessCrisisReady(s)) return null;
  const outcomeClue = dockWitnessCrisisOutcomeClue(s);
  const resolvedNarratives: Record<string, string> = {
    dock_witness_warned: '麦克送出了口信。知情工人暂时藏了起来，但盯梢者也会知道有人插了手。',
    dock_watcher_route: '你没有惊动盯梢者，并记下了他绕向转运仓区的路线。',
    dock_witness_disappeared: '你在雾里跟丢了人。第二天，知情工人的床铺空着，夜班点名册上也没有请假。',
    dock_witness_protected: '安保人员接走了知情工人。他暂时安全，但当晚陈述也被一并封存。',
  };
  if (outcomeClue) return {
    phase: 'resolved' as const,
    title: '夜班口信',
    narrative: resolvedNarratives[outcomeClue],
    choices: [],
  };
  const shadowResult = toPublicCheckResult(evaluateExplorationCheckInternal(s, DOCK_WITNESS_CHECK_IDS.shadow_watcher));
  return {
    phase: 'choice' as const,
    title: '夜班口信',
    narrative: '麦克传来消息：一个可能看见过交接异常的夜班工人正被陌生人打听。今晚过去后，事情也许就会变样。',
    choices: [
      {
        id: 'warn_worker' as const,
        label: '托麦克提醒工人',
        description: '先让知情人避开原路。能保住证词，却可能让盯梢者察觉有人介入。',
        hours: 1,
        issue: dockWitnessCrisisChoiceIssue(s, 'warn_worker'),
        helpedBy: [] as string[],
      },
      {
        id: 'shadow_watcher' as const,
        label: '去交接处暗中守候',
        description: '尝试反过来跟住打听者。即使失手，时间也不会倒退，案件会留下另一种结果。',
        hours: 2,
        issue: dockWitnessCrisisChoiceIssue(s, 'shadow_watcher'),
        helpedBy: shadowResult.helpedBy,
      },
      {
        id: 'request_protection' as const,
        label: '请求正式保护',
        description: '用已经建立的正式门路先把人接走。风险较低，但证词会暂时进入对方档案。',
        hours: 1,
        issue: dockWitnessCrisisChoiceIssue(s, 'request_protection'),
        helpedBy: [] as string[],
      },
    ],
  };
}

export function resolveDockWitnessCrisis(s: GameState, choiceId: DockWitnessCrisisChoiceId): ActionResult {
  const issue = dockWitnessCrisisChoiceIssue(s, choiceId);
  if (issue) return { ok: false, msg: issue };
  const checkId = DOCK_WITNESS_CHECK_IDS[choiceId];
  const startedAt = { day: s.day, hour: s.hour };
  const request = explorationCheckRequest(s, checkId, startedAt);
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  if (!internal.eligible) return { ok: false, msg: '当前条件无法支持这个处理办法。' };

  const passed = internal.outcome === 'passed';
  const hours = choiceId === 'shadow_watcher' ? 2 : 1;
  const cost = choiceId === 'shadow_watcher' ? 12 : choiceId === 'request_protection' ? 8 : 6;
  const energyReceipt = applyEffects(s, [{ k: 'energy', v: -energyCost(s, cost) }])[0];
  const clueId = choiceId === 'shadow_watcher' && !passed
    ? 'dock_witness_disappeared' : DOCK_WITNESS_CRISIS_CLUES[choiceId];
  const acquired = acquireClue(s, clueId);
  const receipt: CheckReceipt = { hoursElapsed: hours, effects: [
    receiptEntry('energy', energyReceipt),
    hoursReceipt(hours),
    { id: `clue:${clueId}`, applied: acquired, before: false, after: acquired },
  ] };
  if (choiceId === 'warn_worker') {
    const favorReceipt = applyEffects(s, [{ k: 'favor', id: 'mike', v: 3 }])[0];
    receipt.effects.push(receiptEntry('favor:mike', favorReceipt));
  }
  if (choiceId === 'warn_worker') {
    addLog(s, '麦克看完纸条，没有多问。他把工人的名字抄进酒单背面，答应在换班前把人带离原路。', 'event');
  } else if (choiceId === 'request_protection') {
    addLog(s, '接待员核对了你的来路，随后派出两名便衣。知情工人会被接到安全处，他的陈述也将暂时封存。', 'event');
  } else if (passed) {
    addLog(s, '你隔着两排货箱跟住灰帽身影，看见他避开主路，绕向一片不在公开仓单上的转运仓区。', 'good');
  } else {
    addLog(s, '雾里一声货钩落地让你错过了转角。第二天再去工棚时，那名夜班工人的床铺已经空了。', 'bad');
    addLog(s, '你没能保住证人，但空铺、点名册和失踪时间成为了新的事实。案件没有停下，只是代价变了。', 'info');
  }
  const attention = choiceId === 'warn_worker' ? 10 : choiceId === 'request_protection' ? 5 : passed ? 25 : 35;
  const threatBefore = s.caseThreats?.[DOCK_THREAT_ID]?.attention ?? 0;
  raiseCaseThreat(s, DOCK_THREAT_ID, 'case_choice', `witness_crisis:${choiceId}`, attention);
  const threatAfter = s.caseThreats?.[DOCK_THREAT_ID]?.attention ?? threatBefore;
  receipt.effects.push({
    id: 'threat:dock_manifest_cleaner', applied: threatAfter !== threatBefore,
    before: threatBefore, after: threatAfter, actualDelta: threatAfter - threatBefore,
  });
  recordCheckAttempt(s, internal, request.context, receipt, startedAt);
  advanceHours(s, hours);
  return { ok: true, outcome: passed ? 'passed' : 'blocked' };
}

const DOCK_WITNESS_FOLLOWUP_CHECK_IDS: Record<DockWitnessFollowupRouteId, string> = {
  warned_witness: 'dock_witness_followup_warned',
  watched_transfer: 'dock_witness_followup_transfer',
  missing_witness: 'dock_witness_followup_missing',
  protected_witness: 'dock_witness_followup_protected',
};

const DOCK_WITNESS_FOLLOWUP_ROUTE_BY_CLUE: Record<string, DockWitnessFollowupRouteId> = {
  dock_witness_warned: 'warned_witness',
  dock_watcher_route: 'watched_transfer',
  dock_witness_disappeared: 'missing_witness',
  dock_witness_protected: 'protected_witness',
};

const DOCK_WITNESS_FOLLOWUP_RESULT_CLUES = [
  'dock_witness_statement', 'dock_witness_fragment',
  'dock_transfer_watch_record', 'dock_transfer_decoy',
  'dock_witness_locker_token', 'dock_witness_last_errand',
  'dock_sealed_statement_excerpt', 'dock_official_case_summary',
] as const;

function dockWitnessFollowupRoute(s: GameState): DockWitnessFollowupRouteId | null {
  const crisisClue = dockWitnessCrisisOutcomeClue(s);
  return crisisClue ? DOCK_WITNESS_FOLLOWUP_ROUTE_BY_CLUE[crisisClue] ?? null : null;
}

function dockWitnessFollowupOutcomeClue(s: GameState): string | null {
  return DOCK_WITNESS_FOLLOWUP_RESULT_CLUES.find(clueId => hasClue(s, clueId)) ?? null;
}

export function dockWitnessFollowupIssue(s: GameState): string | null {
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return encounterIssue;
  const route = dockWitnessFollowupRoute(s);
  if (!route) return '需要先处理夜班知情人的危机。';
  if (dockWitnessFollowupOutcomeClue(s)) return '这条后续已经留下可以核验的结果。';
  if (dockCaseDispositionClue(s)) return '案件已经完成阶段处置。';
  if (s.atWork) return '工作期间无法离岗继续调查。';
  if (route === 'warned_witness') {
    if (s.currentLocation?.locationId !== 'tavern') return '需要回到「醉水手」酒馆，让麦克安排一次隐蔽会面。';
  } else if (route === 'watched_transfer') {
    if (s.currentLocation?.locationId !== 'canal') return '需要沿着记录中的路线前往运河仓库。';
    if (!isNight(s.hour)) return '那条转运路线只在夜间出现动静。';
  } else if (route === 'missing_witness') {
    if (s.currentLocation?.locationId !== 'docks') return '需要回到东区码头，从工棚和点名册查起。';
    if (s.hour < 7 || s.hour >= 19) return '工棚管理员和领货簿只在白天能够找到。';
  } else if (route === 'protected_witness') {
    if (!hasFormalNightwatchRoute(s)) return '只有已经建立的正式接触才能继续询问保护记录。';
    if (s.currentLocation?.locationId !== 'blackthorn_security') return '需要到黑荆棘安保公司申请核验封存陈述。';
  }
  const cost = route === 'watched_transfer' ? 14 : route === 'warned_witness' ? 10 : route === 'missing_witness' ? 10 : 8;
  if (s.stats.energy < energyCost(s, cost)) return '你现在太疲惫，无法完成这轮调查。';
  return null;
}

export function getDockWitnessFollowupView(s: GameState) {
  const route = dockWitnessFollowupRoute(s);
  if (!route) return null;
  const outcomeClue = dockWitnessFollowupOutcomeClue(s);
  const resolvedNarratives: Record<string, string> = {
    dock_witness_statement: '知情人说清了汽笛、领货牌与灰帽接头人的先后关系。三件事第一次落在同一段时间里。',
    dock_witness_fragment: '你没能让惊惶的工人久留，但他写下的“第二声汽笛”和残缺库位号仍可继续核对。',
    dock_transfer_watch_record: '你守到了那次没有登记的停靠，并把时间、货车和库门位置一一记下。',
    dock_transfer_decoy: '仓区已经被清理，只剩一枚临时替换的转运标记。有人知道原路线可能暴露。',
    dock_witness_locker_token: '储物柜里的领货牌与异常仓单上的一处涂改相同，知情人的最后去向终于有了实物联系。',
    dock_witness_last_errand: '领货牌不见了，但点名册背面的临时差事仍证明他被调去搬运一件无编号货物。',
    dock_sealed_statement_excerpt: '你获准抄下有限摘录：第二声汽笛、被换过的领货牌，以及一名灰帽接头人。',
    dock_official_case_summary: '完整陈述仍被封存，但公开摘要确认威胁确实发生在同一段交接空档。',
  };
  if (outcomeClue) return {
    phase: 'resolved' as const,
    title: '口信之后',
    narrative: resolvedNarratives[outcomeClue],
    action: null,
  };
  const routeViews: Record<DockWitnessFollowupRouteId, {
    title: string; narrative: string; label: string; description: string; hoursText: string;
  }> = {
    warned_witness: {
      title: '藏起来的知情人',
      narrative: '麦克把人暂时安置在别处。工人愿不愿意把当晚所见说完整，取决于你能否问得足够克制。',
      label: '请麦克安排隐蔽会面', description: '用已经掌握的事实核对陈述，不逼问他不知道的幕后身份。', hoursText: '2小时',
    },
    watched_transfer: {
      title: '通向运河仓区的路线',
      narrative: '灰帽人绕开的主路通向运河仓区。只有亲自守到下一次转运，才能知道这是不是诱饵。',
      label: '监看下一次夜间转运', description: '在不惊动仓区人员的情况下记录时间、货车和库门。', hoursText: '3小时',
    },
    missing_witness: {
      title: '空铺留下的东西',
      narrative: '知情人没有回家。工棚储物柜、点名册和领货簿，是他失踪前最后留下的普通记录。',
      label: '核对储物柜与领货簿', description: '先确认他最后接过什么差事，再判断是否值得继续追人。', hoursText: '2小时',
    },
    protected_witness: {
      title: '被封存的陈述',
      narrative: '知情人已经安全，但完整陈述不再由你掌握。你只能凭正式接触申请一份有限核验。',
      label: '申请核验封存陈述', description: '提交手中可追溯的记录，争取抄下与案件直接相关的部分。', hoursText: '1至2小时',
    },
  };
  const def = routeViews[route];
  const publicResult = toPublicCheckResult(evaluateExplorationCheckInternal(s, DOCK_WITNESS_FOLLOWUP_CHECK_IDS[route]));
  return {
    phase: 'action' as const,
    title: def.title,
    narrative: def.narrative,
    action: {
      route, label: def.label, description: def.description, hoursText: def.hoursText,
      issue: dockWitnessFollowupIssue(s), helpedBy: publicResult.helpedBy,
    },
  };
}

export function resolveDockWitnessFollowup(s: GameState): ActionResult {
  const issue = dockWitnessFollowupIssue(s);
  if (issue) return { ok: false, msg: issue };
  const route = dockWitnessFollowupRoute(s)!;
  const startedAt = { day: s.day, hour: s.hour };
  const request = explorationCheckRequest(s, DOCK_WITNESS_FOLLOWUP_CHECK_IDS[route], startedAt);
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  if (!internal.eligible) return { ok: false, msg: '当前条件无法支持这轮调查。' };
  const passed = internal.outcome === 'passed';
  const resultClues: Record<DockWitnessFollowupRouteId, readonly [string, string]> = {
    warned_witness: ['dock_witness_statement', 'dock_witness_fragment'],
    watched_transfer: ['dock_transfer_watch_record', 'dock_transfer_decoy'],
    missing_witness: ['dock_witness_locker_token', 'dock_witness_last_errand'],
    protected_witness: ['dock_sealed_statement_excerpt', 'dock_official_case_summary'],
  };
  const clueId = resultClues[route][passed ? 0 : 1];
  const hours = route === 'watched_transfer' ? 3 : route === 'protected_witness' && !passed ? 1 : 2;
  const cost = route === 'watched_transfer' ? 14 : route === 'warned_witness' ? 10 : route === 'missing_witness' ? 10 : 8;
  const energyReceipt = applyEffects(s, [{ k: 'energy', v: -energyCost(s, cost) }])[0];
  const acquired = acquireClue(s, clueId);
  const receipt: CheckReceipt = { hoursElapsed: hours, effects: [
    receiptEntry('energy', energyReceipt), hoursReceipt(hours),
    { id: `clue:${clueId}`, applied: acquired, before: false, after: acquired },
  ] };
  if (route === 'warned_witness' && passed) {
    const favorReceipt = applyEffects(s, [{ k: 'favor', id: 'mike', v: 2 }])[0];
    receipt.effects.push(receiptEntry('favor:mike', favorReceipt));
  }
  const attentionByRoute: Record<DockWitnessFollowupRouteId, readonly [number, number]> = {
    warned_witness: [10, 20], watched_transfer: [30, 40], missing_witness: [25, 35], protected_witness: [5, 10],
  };
  const attention = attentionByRoute[route][passed ? 0 : 1];
  const narrativeByClue: Record<string, string> = {
    dock_witness_statement: '知情人压低声音，说清了第二声汽笛、被换过的领货牌和灰帽接头人的出现顺序。',
    dock_witness_fragment: '工人听见巷外脚步便匆匆离开，只在纸上留下“第二声汽笛”和半截库位号。',
    dock_transfer_watch_record: '第二声汽笛后，一辆没有灯号的货车贴着仓墙停下。你记下了时间、库门和换车的位置。',
    dock_transfer_decoy: '你守到天色发白也没见到货车，只在墙角找到一枚刚被替换的转运标记。原路线已经被清理。',
    dock_witness_locker_token: '储物柜夹层里压着一枚领货牌，库位号与异常仓单上被涂改的那一格完全相同。',
    dock_witness_last_errand: '柜子里没有实物，点名册背面却写着一件临时差事：搬运无编号货物，地点只留了半个库位号。',
    dock_sealed_statement_excerpt: '接待员核对你提交的记录后，允许你抄下三处能独立核验的内容，其余姓名仍被遮去。',
    dock_official_case_summary: '完整陈述没有开放。你只拿到一份公开摘要，但其中确认了威胁发生在同一段交接空档。',
  };
  addLog(s, narrativeByClue[clueId], passed ? 'good' : 'info');
  const threatBefore = s.caseThreats?.[DOCK_THREAT_ID]?.attention ?? 0;
  raiseCaseThreat(s, DOCK_THREAT_ID, 'case_choice', `witness_followup:${route}`, attention);
  const threatAfter = s.caseThreats?.[DOCK_THREAT_ID]?.attention ?? threatBefore;
  receipt.effects.push({
    id: 'threat:dock_manifest_cleaner', applied: threatAfter !== threatBefore,
    before: threatBefore, after: threatAfter, actualDelta: threatAfter - threatBefore,
  });
  recordCheckAttempt(s, internal, request.context, receipt, startedAt);
  advanceHours(s, hours);
  return { ok: true, outcome: passed ? 'passed' : 'blocked' };
}

const DOCK_GRAY_HAT_CHECK_IDS: Record<DockGrayHatOperationId, string> = {
  observe_exchange: 'dock_gray_hat_observe',
  bait_manifest: 'dock_gray_hat_bait',
  joint_watch: 'dock_gray_hat_joint_watch',
};

const DOCK_GRAY_HAT_RESULT_CLUES = [
  'dock_gray_hat_exchange_pattern', 'dock_gray_hat_abandoned_route',
  'dock_gray_hat_countermark', 'dock_gray_hat_trap_exposed',
  'dock_gray_hat_joint_watch', 'dock_gray_hat_watch_delayed',
] as const;

function dockGrayHatOperationReady(s: GameState) {
  return !!dockWitnessFollowupOutcomeClue(s) && !dockCaseDispositionClue(s);
}

function dockGrayHatOperationOutcomeClue(s: GameState): string | null {
  return DOCK_GRAY_HAT_RESULT_CLUES.find(clueId => hasClue(s, clueId)) ?? null;
}

export function dockGrayHatOperationIssue(s: GameState, operationId: DockGrayHatOperationId): string | null {
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return encounterIssue;
  if (!dockGrayHatOperationReady(s)) return '需要先把口信之后的事实核验清楚。';
  if (dockGrayHatOperationOutcomeClue(s)) return '针对灰帽人的行动已经留下结果，不能重新选择。';
  if (s.atWork) return '工作期间无法离岗安排这次行动。';
  if (operationId === 'observe_exchange') {
    if (s.currentLocation?.locationId !== 'canal') return '需要前往已经查明的运河仓区。';
    if (!isNight(s.hour)) return '交换点只在夜间可能出现动静。';
  } else if (operationId === 'bait_manifest') {
    if (!hasClue(s, 'dock_marked_manifest')) return '手中缺少能够模仿对方暗记的旧仓单。';
    if (s.currentLocation?.locationId !== 'docks') return '需要回到东区码头，在原交接范围内放出假仓单。';
    if (!isNight(s.hour)) return '白天人来人往，假仓单无法只落到目标手里。';
  } else if (operationId === 'joint_watch') {
    if (!hasFormalNightwatchRoute(s)) return '你还没有能够申请联合盯守的正式门路。';
    if (s.currentLocation?.locationId !== 'blackthorn_security') return '需要到黑荆棘安保公司递交联合盯守申请。';
  } else return '没有这个行动方案。';
  const cost = operationId === 'observe_exchange' ? 14 : operationId === 'bait_manifest' ? 12 : 8;
  if (s.stats.energy < energyCost(s, cost)) return '你现在太疲惫，无法妥善执行这次行动。';
  return null;
}

export function getDockGrayHatOperationView(s: GameState) {
  if (!dockGrayHatOperationReady(s)) return null;
  const outcomeClue = dockGrayHatOperationOutcomeClue(s);
  const outcomeNarratives: Record<string, string> = {
    dock_gray_hat_exchange_pattern: '连续守候确认：灰帽人负责核验领货牌、替换仓单暗记并清理暴露记录，但他并不直接搬运货物。',
    dock_gray_hat_abandoned_route: '交换点已经被放弃。你仍能确认对方拥有及时撤换路线的消息来源，但真实姓名与落脚处依旧未知。',
    dock_gray_hat_countermark: '假仓单引出了一道回应暗记。灰帽人确实负责核验交接，但设局也让他离你更近。',
    dock_gray_hat_trap_exposed: '假仓单被识破并留下警告。你确认了灰帽人的职责，却也让对方确定有人正在追查。',
    dock_gray_hat_joint_watch: '联合盯守确认灰帽人是清理记录与核验交接的中间人。正式记录没有给出他的真实姓名。',
    dock_gray_hat_watch_delayed: '联合行动没有获准，但受理答复证明类似灰帽人曾出现在其他记录清理现场。',
  };
  if (outcomeClue) return {
    phase: 'resolved' as const,
    title: '灰帽人的位置',
    narrative: outcomeNarratives[outcomeClue],
    choices: [],
  };
  const choiceDefs: Array<{
    id: DockGrayHatOperationId; label: string; description: string; hours: number;
  }> = [
    {
      id: 'observe_exchange', label: '继续监视交换点', hours: 3,
      description: '风险较慢地累积，争取看清他的行动规律；路线也可能在你赶到前被放弃。',
    },
    {
      id: 'bait_manifest', label: '放出假仓单设局', hours: 2,
      description: '用旧仓单模仿暗记，引对方主动回应；一旦被识破，可能立刻引来追踪。',
    },
    {
      id: 'joint_watch', label: '申请联合盯守', hours: 2,
      description: '借正式门路共同确认目标；风险较低，但行动是否获准不由你单独决定。',
    },
  ];
  return {
    phase: 'choice' as const,
    title: '灰帽人的位置',
    narrative: '现有事实只能说明灰帽人反复出现在仓单、领货牌与记录清理之间。他可能只是中间人，但也是目前唯一能继续追下去的活线。',
    choices: choiceDefs.map(choice => {
      const result = toPublicCheckResult(evaluateExplorationCheckInternal(s, DOCK_GRAY_HAT_CHECK_IDS[choice.id]));
      return { ...choice, issue: dockGrayHatOperationIssue(s, choice.id), helpedBy: result.helpedBy };
    }),
  };
}

export function resolveDockGrayHatOperation(s: GameState, operationId: DockGrayHatOperationId): ActionResult {
  const issue = dockGrayHatOperationIssue(s, operationId);
  if (issue) return { ok: false, msg: issue };
  const startedAt = { day: s.day, hour: s.hour };
  const request = explorationCheckRequest(s, DOCK_GRAY_HAT_CHECK_IDS[operationId], startedAt);
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  if (!internal.eligible) return { ok: false, msg: '当前条件无法支持这次行动。' };
  const passed = internal.outcome === 'passed';
  const resultClues: Record<DockGrayHatOperationId, readonly [string, string]> = {
    observe_exchange: ['dock_gray_hat_exchange_pattern', 'dock_gray_hat_abandoned_route'],
    bait_manifest: ['dock_gray_hat_countermark', 'dock_gray_hat_trap_exposed'],
    joint_watch: ['dock_gray_hat_joint_watch', 'dock_gray_hat_watch_delayed'],
  };
  const clueId = resultClues[operationId][passed ? 0 : 1];
  const hours = operationId === 'observe_exchange' ? 3 : 2;
  const cost = operationId === 'observe_exchange' ? 14 : operationId === 'bait_manifest' ? 12 : 8;
  const energyReceipt = applyEffects(s, [{ k: 'energy', v: -energyCost(s, cost) }])[0];
  const acquired = acquireClue(s, clueId);
  const receipt: CheckReceipt = { hoursElapsed: hours, effects: [
    receiptEntry('energy', energyReceipt), hoursReceipt(hours),
    { id: `clue:${clueId}`, applied: acquired, before: false, after: acquired },
  ] };
  const narratives: Record<string, string> = {
    dock_gray_hat_exchange_pattern: '你守过两轮汽笛，终于看清灰帽人从不碰货。他只核验领货牌、替换仓单暗记，再把旧纸投入火盆。',
    dock_gray_hat_abandoned_route: '交换点整夜无人出现。天亮前，你发现门缝里的旧暗记已被刮掉；对方先一步放弃了这条路线。',
    dock_gray_hat_countermark: '假仓单在第二声汽笛后被人翻过，角落多了一道新的回应暗记。灰帽人已经咬钩。',
    dock_gray_hat_trap_exposed: '假仓单被整齐划去，背面只留下一道像眼睛的警告。远处随即传来不再掩饰的脚步。',
    dock_gray_hat_joint_watch: '两名便衣与你分守路口，共同确认灰帽人只负责核验与清理。他察觉包围前已经消失在雾里。',
    dock_gray_hat_watch_delayed: '申请没有获准。接待员只肯确认：相似装束的人曾出现在另外两处记录被清理的现场。',
  };
  addLog(s, narratives[clueId], passed ? 'good' : operationId === 'bait_manifest' ? 'bad' : 'info');
  const attentionByOperation: Record<DockGrayHatOperationId, readonly [number, number]> = {
    observe_exchange: [25, 40], bait_manifest: [40, 75], joint_watch: [10, 20],
  };
  const attention = attentionByOperation[operationId][passed ? 0 : 1];
  const threatBefore = s.caseThreats?.[DOCK_THREAT_ID]?.attention ?? 0;
  raiseCaseThreat(s, DOCK_THREAT_ID, 'case_choice', `gray_hat_operation:${operationId}`, attention);
  const threatAfter = s.caseThreats?.[DOCK_THREAT_ID]?.attention ?? threatBefore;
  receipt.effects.push({
    id: 'threat:dock_manifest_cleaner', applied: threatAfter !== threatBefore,
    before: threatBefore, after: threatAfter, actualDelta: threatAfter - threatBefore,
  });
  recordCheckAttempt(s, internal, request.context, receipt, startedAt);
  advanceHours(s, hours);
  return { ok: true, outcome: passed ? 'passed' : 'blocked' };
}

const DOCK_ENCOUNTER_AFTERMATH_CHECK_IDS: Record<DockEncounterAftermathChoiceId, string> = {
  trace_retreat: 'dock_encounter_aftermath_trace',
  handoff_token: 'dock_encounter_aftermath_handoff',
  preserve_evidence: 'dock_encounter_aftermath_preserve',
};

const DOCK_ENCOUNTER_AFTERMATH_RESULT_CLUES = [
  'dock_gray_hat_retreat_route', 'dock_gray_hat_trail_lost',
  'dock_gray_hat_token_handoff', 'dock_gray_hat_evidence_preserved',
] as const;

function dockEncounterAftermathSourceClue(s: GameState): string | null {
  return ['dock_gray_hat_dropped_token', 'dock_gray_hat_escape_recollection', 'dock_gray_hat_scene_lost']
    .find(clueId => hasClue(s, clueId)) ?? null;
}

function dockEncounterAftermathOutcomeClue(s: GameState): string | null {
  return DOCK_ENCOUNTER_AFTERMATH_RESULT_CLUES.find(clueId => hasClue(s, clueId)) ?? null;
}

export function dockEncounterAftermathIssue(s: GameState, choiceId: DockEncounterAftermathChoiceId): string | null {
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
  if (s.pendingEncounter) return activeEncounterIssue(s);
  const sourceClue = dockEncounterAftermathSourceClue(s);
  if (!sourceClue || sourceClue === 'dock_gray_hat_scene_lost') return '这次遭遇没有留下能够继续处理的现场证物。';
  if (dockEncounterAftermathOutcomeClue(s)) return '这次遭遇留下的线索已经完成处理。';
  if (dockCaseDispositionClue(s)) return '案件已经完成阶段处置。';
  if (s.atWork) return '工作期间无法整理这次遭遇。';
  if (choiceId === 'trace_retreat') {
    if (s.currentLocation) return '需要先回到住处，把路线、时间和现场记录摊开复盘。';
  } else if (choiceId === 'handoff_token') {
    if (sourceClue !== 'dock_gray_hat_dropped_token') return '这次脱身没有取得能够移交的实物。';
    if (!hasFormalNightwatchRoute(s)) return '你还没有能够正式接收敏感证物的可靠门路。';
    if (s.currentLocation?.locationId !== 'blackthorn_security') return '需要亲自把黄铜牌带到黑荆棘安保公司。';
  } else if (choiceId === 'preserve_evidence') {
    if (s.currentLocation) return '需要回到住处，把证物与原始笔记分开封存。';
  } else return '没有这个处理办法。';
  const cost = choiceId === 'trace_retreat' ? 10 : choiceId === 'handoff_token' ? 6 : 4;
  if (s.stats.energy < energyCost(s, cost)) return '你现在太疲惫，无法妥善处理这些线索。';
  return null;
}

export function getDockEncounterAftermathView(s: GameState) {
  const sourceClue = dockEncounterAftermathSourceClue(s);
  if (!sourceClue) return null;
  const outcomeClue = dockEncounterAftermathOutcomeClue(s);
  const resolvedNarratives: Record<string, string> = {
    dock_gray_hat_scene_lost: '你保住了性命和调查笔记，但现场已经被清空。眼下只能确认灰帽人确实愿意为这些记录动手。',
    dock_gray_hat_retreat_route: '复盘后的撤退方向指向运河下游旧装卸区，但仍不足以证明那里就是灰帽人的落脚处。',
    dock_gray_hat_trail_lost: '路线在人流与岔口中断开。你划清了无法继续确认的边界，没有把猜测写成地址。',
    dock_gray_hat_token_handoff: '正式人员接收黄铜牌并出具回条；他们确认这不是公开港务凭证。',
    dock_gray_hat_evidence_preserved: '你停止追击，把黄铜牌或路线回忆与原始调查笔记分开封存。',
  };
  if (sourceClue === 'dock_gray_hat_scene_lost' || outcomeClue) return {
    phase: 'resolved' as const,
    title: '遭遇之后',
    narrative: resolvedNarratives[outcomeClue ?? sourceClue],
    choices: [],
  };
  const choices: Array<{ id: DockEncounterAftermathChoiceId; label: string; description: string; hours: number }> = [
    {
      id: 'trace_retreat', label: '复盘他的撤退方向', hours: 2,
      description: '把遭遇中的转向、汽笛和既有路线重新对照；失败也只会留下明确的追索边界。',
    },
    ...(sourceClue === 'dock_gray_hat_dropped_token' ? [{
      id: 'handoff_token' as const, label: '正式移交黄铜牌', hours: 1,
      description: '把实物交给已经建立正式接触的人员核验，并保留接收回条。',
    }] : []),
    {
      id: 'preserve_evidence', label: '封存证物并停止追击', hours: 1,
      description: '保全目前已经得到的事实，不再为一条未经确认的方向继续冒险。',
    },
  ];
  return {
    phase: 'choice' as const,
    title: '遭遇之后',
    narrative: sourceClue === 'dock_gray_hat_dropped_token'
      ? '灰帽人撤退时掉下一枚黄铜牌。你可以追索路线、正式移交，也可以先保存证物。'
      : '你甩脱了跟踪者，仍记得几个关键转向。继续追索可能得到方向，也可能只把自己带回雾里。',
    choices: choices.map(choice => {
      const result = toPublicCheckResult(evaluateExplorationCheckInternal(s, DOCK_ENCOUNTER_AFTERMATH_CHECK_IDS[choice.id]));
      return { ...choice, issue: dockEncounterAftermathIssue(s, choice.id), helpedBy: result.helpedBy };
    }),
  };
}

export function resolveDockEncounterAftermath(s: GameState, choiceId: DockEncounterAftermathChoiceId): ActionResult {
  const issue = dockEncounterAftermathIssue(s, choiceId);
  if (issue) return { ok: false, msg: issue };
  const startedAt = { day: s.day, hour: s.hour };
  const request = explorationCheckRequest(s, DOCK_ENCOUNTER_AFTERMATH_CHECK_IDS[choiceId], startedAt);
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  if (!internal.eligible) return { ok: false, msg: '当前条件无法支持这个处理办法。' };
  const passed = internal.outcome === 'passed';
  const clueId = choiceId === 'trace_retreat'
    ? passed ? 'dock_gray_hat_retreat_route' : 'dock_gray_hat_trail_lost'
    : choiceId === 'handoff_token' ? 'dock_gray_hat_token_handoff' : 'dock_gray_hat_evidence_preserved';
  const hours = choiceId === 'trace_retreat' ? 2 : 1;
  const cost = choiceId === 'trace_retreat' ? 10 : choiceId === 'handoff_token' ? 6 : 4;
  const energyReceipt = applyEffects(s, [{ k: 'energy', v: -energyCost(s, cost) }])[0];
  const acquired = acquireClue(s, clueId);
  const receipt: CheckReceipt = { hoursElapsed: hours, effects: [
    receiptEntry('energy', energyReceipt), hoursReceipt(hours),
    { id: `clue:${clueId}`, applied: acquired, before: false, after: acquired },
  ] };
  recordCheckAttempt(s, internal, request.context, receipt, startedAt);
  const narratives: Record<string, string> = {
    dock_gray_hat_retreat_route: '你把转角、汽笛与仓区路线重新排在一起，确认灰帽人撤向运河下游的旧装卸区。那是方向，不是身份。',
    dock_gray_hat_trail_lost: '几处转向能够对上，但痕迹最终混进主街人流。你只能把无法继续确认的位置如实记下。',
    dock_gray_hat_token_handoff: '接待员戴上手套收起黄铜牌，在回条上注明：并非公开港务凭证，来源仍待核验。',
    dock_gray_hat_evidence_preserved: '你没有继续追进雾里，而是把证物、路线回忆和原始笔记分开放好。',
  };
  addLog(s, narratives[clueId], passed ? 'good' : 'info');
  advanceHours(s, hours);
  return { ok: true, outcome: passed ? 'passed' : 'blocked' };
}

const DOCK_OLD_YARD_CHECK_IDS: Record<DockOldYardActionId, string> = {
  survey_perimeter: 'dock_old_yard_survey',
  question_porters: 'dock_old_yard_question',
  watch_night_transfer: 'dock_old_yard_watch',
};

const DOCK_OLD_YARD_RESULT_CLUES: Record<DockOldYardActionId, readonly [string, string]> = {
  survey_perimeter: ['dock_old_yard_perimeter_map', 'dock_old_yard_public_boundary'],
  question_porters: ['dock_old_yard_porter_schedule', 'dock_old_yard_workers_silent'],
  watch_night_transfer: ['dock_old_yard_night_transfer', 'dock_old_yard_watch_disturbed'],
};

function dockOldYardActionResult(s: GameState, actionId: DockOldYardActionId) {
  return DOCK_OLD_YARD_RESULT_CLUES[actionId].find(clueId => hasClue(s, clueId)) ?? null;
}

function dockOldYardResolved(s: GameState) {
  return !!dockOldYardActionResult(s, 'watch_night_transfer');
}

export function dockOldYardActionIssue(s: GameState, actionId: DockOldYardActionId): string | null {
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
  if (s.pendingEncounter) return activeEncounterIssue(s);
  if (!hasClue(s, 'dock_gray_hat_retreat_route')) return '你还没有能够指向这片旧装卸区的可靠路线。';
  if (dockCaseDispositionClue(s)) return '案件已经完成阶段处置。';
  if (s.atWork) return '工作期间无法离岗调查。';
  if (s.currentLocation?.locationId !== 'old_loading_yard') return '需要先抵达运河下游旧装卸区。';
  if (!DOCK_OLD_YARD_CHECK_IDS[actionId]) return '这里没有这种调查办法。';
  if (dockOldYardActionResult(s, actionId)) return '这项调查已经留下记录。';
  if (actionId === 'survey_perimeter' && (s.hour < 7 || s.hour >= 19)) return '天色太暗，无法分清公共边界、积水和废弃通路。';
  if (actionId === 'question_porters') {
    if (s.relations.mike === undefined) return '附近搬运工不愿和陌生人谈旧库位；需要先有可信的人引见。';
    if (s.hour < 9 || s.hour >= 18) return '临时搬运工只会在白天换班时短暂停留。';
  }
  if (actionId === 'watch_night_transfer') {
    if (!dockOldYardActionResult(s, 'survey_perimeter')) return '你还没有确认可用的观察位置和撤离边界。';
    if (!dockOldYardActionResult(s, 'question_porters')) return '你还不知道临时搬运何时可能出现。';
    if (!isNight(s.hour)) return '这片区域只有夜间汽笛前后才可能出现转运。';
  }
  const cost = actionId === 'watch_night_transfer' ? 14 : 8;
  if (s.stats.energy <= energyCost(s, cost)) return '你必须保留最低行动能力，当前精力不足以继续。';
  return null;
}

export function getDockOldYardView(s: GameState) {
  if (!hasClue(s, 'dock_gray_hat_retreat_route')) return null;
  const terminal = dockOldYardActionResult(s, 'watch_night_transfer');
  const narratives: Record<string, string> = {
    dock_old_yard_night_transfer: '你确认这里会短暂停靠没有编号的篷车，交接暗记与灰帽人的做法一致；仍没有证据证明这里是某个组织的固定据点。',
    dock_old_yard_watch_disturbed: '预定灯号提前熄灭。你只能确认这处路线可能已经受到戒备，无法把未出现的货车写进结论。',
  };
  const actions: Array<{ id: DockOldYardActionId; label: string; description: string; hours: number }> = [
    { id: 'survey_perimeter', label: '沿公共边界踩点', hours: 2, description: '核对围栏、临河通道和可以安全离开的方向。' },
    { id: 'question_porters', label: '请麦克引见临时搬运工', hours: 2, description: '只询问班次、汽笛和无编号封箱，不追问对方不知道的身份。' },
    { id: 'watch_night_transfer', label: '守候夜间转运', hours: 3, description: '把踩点与口述合在一起选择观察位置，确认是否真的有未登记交接。' },
  ];
  return {
    phase: terminal ? 'resolved' as const : 'active' as const,
    title: '旧装卸区调查',
    narrative: terminal ? narratives[terminal] : '这里不是公开营业的仓库。先确认外围和作息，再决定是否值得夜间守候。',
    actions: actions.map(action => {
      const result = toPublicCheckResult(evaluateExplorationCheckInternal(s, DOCK_OLD_YARD_CHECK_IDS[action.id]));
      return {
        ...action,
        completed: !!dockOldYardActionResult(s, action.id),
        issue: dockOldYardActionIssue(s, action.id),
        helpedBy: result.helpedBy,
      };
    }),
  };
}

export function resolveDockOldYardAction(s: GameState, actionId: DockOldYardActionId): ActionResult {
  const issue = dockOldYardActionIssue(s, actionId);
  if (issue) return { ok: false, msg: issue };
  const startedAt = { day: s.day, hour: s.hour };
  const request = explorationCheckRequest(s, DOCK_OLD_YARD_CHECK_IDS[actionId], startedAt);
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  if (!internal.eligible) return { ok: false, msg: '当前条件无法支持这项调查。' };
  const passed = internal.outcome === 'passed';
  const clueId = DOCK_OLD_YARD_RESULT_CLUES[actionId][passed ? 0 : 1];
  const hours = actionId === 'watch_night_transfer' ? 3 : 2;
  const cost = actionId === 'watch_night_transfer' ? 14 : 8;
  const energyReceipt = applyEffects(s, [{ k: 'energy', v: -energyCost(s, cost) }])[0];
  const acquired = acquireClue(s, clueId);
  const receipt: CheckReceipt = { hoursElapsed: hours, effects: [
    receiptEntry('energy', energyReceipt), hoursReceipt(hours),
    { id: `clue:${clueId}`, applied: acquired, before: false, after: acquired },
  ] };
  if (actionId !== 'survey_perimeter') {
    const attention = actionId === 'question_porters' ? (passed ? 8 : 18) : (passed ? 18 : 32);
    const threatBefore = s.caseThreats?.[DOCK_THREAT_ID]?.attention ?? 0;
    raiseCaseThreat(s, DOCK_THREAT_ID, 'case_choice', `old_loading_yard:${actionId}`, attention);
    const threatAfter = s.caseThreats?.[DOCK_THREAT_ID]?.attention ?? threatBefore;
    receipt.effects.push({
      id: 'threat:dock_manifest_cleaner', applied: threatAfter !== threatBefore,
      before: threatBefore, after: threatAfter, actualDelta: threatAfter - threatBefore,
    });
  }
  recordCheckAttempt(s, internal, request.context, receipt, startedAt);
  const narratives: Record<string, string> = {
    dock_old_yard_perimeter_map: '你沿围栏走完一圈，确认一条临河通道能绕过正门，但它只能提供观察位置，不能证明内部用途。',
    dock_old_yard_public_boundary: '值守、积水和封死的侧门挡住了视线。你至少记清哪些方向无法安全接近，没有把猜测画进地图。',
    dock_old_yard_porter_schedule: '麦克引见的临时工只肯说：第二声夜间汽笛前后，有人会临时加钱搬走没有编号的封箱。',
    dock_old_yard_workers_silent: '对方听见库位号便收住话头，借口要赶工离开。你没有得到班次，却确认这个问题已经容易引起戒备。',
    dock_old_yard_night_transfer: '第二声汽笛后，一辆没有港务编号的篷车停了不到十分钟。交接者没有叫名字，只在领货牌背面留下灰帽人用过的回应暗记。',
    dock_old_yard_watch_disturbed: '你刚换到第二个观察点，河边灯号便提前熄灭。没有篷车出现；你只能记下路线可能已经受到戒备。',
  };
  addLog(s, narratives[clueId], passed ? 'good' : actionId === 'watch_night_transfer' ? 'bad' : 'info');
  advanceHours(s, hours);
  return { ok: true, outcome: passed ? 'passed' : 'blocked' };
}

const DOCK_TRANSFER_FOLLOWUP_CHECK_IDS: Record<DockTransferFollowupId, string> = {
  tail_wagon: 'dock_transfer_tail_wagon',
  inspect_crate: 'dock_transfer_inspect_crate',
  request_interception: 'dock_transfer_request_interception',
};

const DOCK_TRANSFER_FOLLOWUP_RESULT_CLUES: Record<DockTransferFollowupId, readonly [string, string]> = {
  tail_wagon: ['dock_wagon_coal_yard_route', 'dock_wagon_lost_at_bridge'],
  inspect_crate: ['dock_crate_tar_seal', 'dock_crate_packing_trace'],
  request_interception: ['dock_official_interception_record', 'dock_interception_declined'],
};

function dockTransferFollowupOutcomeClue(s: GameState) {
  return Object.values(DOCK_TRANSFER_FOLLOWUP_RESULT_CLUES).flat()
    .find(clueId => hasClue(s, clueId)) ?? null;
}

export function dockTransferFollowupIssue(s: GameState, choiceId: DockTransferFollowupId): string | null {
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
  if (s.pendingEncounter) return activeEncounterIssue(s);
  if (!hasClue(s, 'dock_old_yard_night_transfer')) return '需要先确认旧装卸区确实存在无编号夜间转运。';
  if (dockTransferFollowupOutcomeClue(s)) return '无编号篷车已经选择了一条后续处理路线。';
  if (dockCaseDispositionClue(s)) return '案件已经完成阶段处置。';
  if (!DOCK_TRANSFER_FOLLOWUP_CHECK_IDS[choiceId]) return '没有这种处理路线。';
  if (s.atWork) return '工作期间无法处理这条转运线。';
  if (choiceId === 'tail_wagon') {
    if (s.currentLocation?.locationId !== 'old_loading_yard') return '需要在旧装卸区等待下一辆无编号篷车出现。';
    if (!isNight(s.hour)) return '篷车只在夜间汽笛前后出现。';
  } else if (choiceId === 'inspect_crate') {
    if (s.currentLocation?.locationId !== 'old_loading_yard') return '需要回到旧装卸区检查转运后留下的封箱。';
  } else {
    if (!hasFormalNightwatchRoute(s)) return '你还没有能够申请联合截查的正式门路。';
    if (s.currentLocation?.locationId !== 'blackthorn_security') return '需要亲自到黑荆棘安保公司递交记录。';
    if (s.hour < 9 || s.hour >= 17) return '联合截查申请只在白天办理。';
  }
  const cost = choiceId === 'tail_wagon' ? 15 : choiceId === 'inspect_crate' ? 10 : 12;
  if (s.stats.energy <= energyCost(s, cost)) return '你必须保留最低行动能力，当前精力不足以继续。';
  return null;
}

export function getDockTransferFollowupView(s: GameState) {
  if (!hasClue(s, 'dock_old_yard_night_transfer')) return null;
  const outcomeClue = dockTransferFollowupOutcomeClue(s);
  const narratives: Record<string, string> = {
    dock_wagon_coal_yard_route: '你跟到河湾煤栈后侧，看见篷车驶入一扇不在公开货场图上的矮门；这只是下一处可核验地点。',
    dock_wagon_lost_at_bridge: '篷车借运煤车遮挡消失在桥区。你记下最后位置，没有把猜测当成新的地址。',
    dock_crate_tar_seal: '你从遗留封箱上取下一枚沾焦油的铅封。它可以在安全环境下用灵视检视，或作为明确目标进行占卜。',
    dock_crate_packing_trace: '封箱已经被清空，你只留下煤灰、湿麻绳和重新钉合的包装记录。',
    dock_official_interception_record: '联合截查确认篷车没有公开港务编号，但一次性运煤票据仍不足以指向幕后身份。',
    dock_interception_declined: '截查没有获准；正式答复只登记了车体、灯号与出现时段。',
  };
  if (outcomeClue) return {
    phase: 'resolved' as const, title: '无编号篷车', narrative: narratives[outcomeClue], choices: [],
  };
  const choices: Array<{ id: DockTransferFollowupId; label: string; description: string; hours: number }> = [
    { id: 'tail_wagon', label: '保持距离跟住篷车', hours: 3, description: '尝试确认下一处停靠点；失败只记录跟踪中断的位置。' },
    { id: 'inspect_crate', label: '检查转运后遗留的封箱', hours: 2, description: '寻找封签与包装痕迹，不徒手翻动无法判断的内容物。' },
    { id: 'request_interception', label: '申请联合截查', hours: 4, description: '把车体、灯号和时段交给正式人员，由他们决定是否截停。' },
  ];
  return {
    phase: 'choice' as const,
    title: '无编号篷车',
    narrative: '你已经确认篷车确实存在，但一次行动只能守住一种目标：去向、遗留实物，或正式截查记录。',
    choices: choices.map(choice => {
      const result = toPublicCheckResult(evaluateExplorationCheckInternal(s, DOCK_TRANSFER_FOLLOWUP_CHECK_IDS[choice.id]));
      return { ...choice, issue: dockTransferFollowupIssue(s, choice.id), helpedBy: result.helpedBy };
    }),
  };
}

export function resolveDockTransferFollowup(s: GameState, choiceId: DockTransferFollowupId): ActionResult {
  const issue = dockTransferFollowupIssue(s, choiceId);
  if (issue) return { ok: false, msg: issue };
  const startedAt = { day: s.day, hour: s.hour };
  const request = explorationCheckRequest(s, DOCK_TRANSFER_FOLLOWUP_CHECK_IDS[choiceId], startedAt);
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  if (!internal.eligible) return { ok: false, msg: '当前条件无法支持这条处理路线。' };
  const passed = internal.outcome === 'passed';
  const clueId = DOCK_TRANSFER_FOLLOWUP_RESULT_CLUES[choiceId][passed ? 0 : 1];
  const hours = choiceId === 'tail_wagon' ? 3 : choiceId === 'inspect_crate' ? 2 : passed ? 4 : 3;
  const cost = choiceId === 'tail_wagon' ? 15 : choiceId === 'inspect_crate' ? 10 : 12;
  const energyReceipt = applyEffects(s, [{ k: 'energy', v: -energyCost(s, cost) }])[0];
  const acquired = acquireClue(s, clueId);
  const receipt: CheckReceipt = { hoursElapsed: hours, effects: [
    receiptEntry('energy', energyReceipt), hoursReceipt(hours),
    { id: `clue:${clueId}`, applied: acquired, before: false, after: acquired },
  ] };
  if (choiceId === 'inspect_crate' && passed) {
    const itemReceipt = applyEffects(s, [{ k: 'item', id: 'tarred_cargo_seal', v: 1 }])[0];
    receipt.effects.push(receiptEntry('item:tarred_cargo_seal', itemReceipt));
  }
  if (choiceId === 'tail_wagon') {
    const threatBefore = s.caseThreats?.[DOCK_THREAT_ID]?.attention ?? 0;
    raiseCaseThreat(s, DOCK_THREAT_ID, 'case_choice', 'dock_transfer_followup:tail_wagon', passed ? 20 : 32);
    const threatAfter = s.caseThreats?.[DOCK_THREAT_ID]?.attention ?? threatBefore;
    receipt.effects.push({
      id: 'threat:dock_manifest_cleaner', applied: threatAfter !== threatBefore,
      before: threatBefore, after: threatAfter, actualDelta: threatAfter - threatBefore,
    });
  }
  recordCheckAttempt(s, internal, request.context, receipt, startedAt);
  const result = getDockTransferFollowupView(s);
  addLog(s, result?.narrative ?? '你完成了对无编号篷车的后续处理。', passed ? 'good' : 'info');
  advanceHours(s, hours);
  return { ok: true, outcome: passed ? 'passed' : 'blocked' };
}

function deepInvestigationDef(investigationId: string): DeepInvestigationDef | null {
  return DEEP_INVESTIGATION_DEFS.find(def => def.id === investigationId) ?? null;
}

export function getDeepInvestigationView(s: GameState, clueId: string) {
  const def = DEEP_INVESTIGATION_DEFS.find(candidate => candidate.clueId === clueId);
  if (!def || !hasClue(s, clueId)) return null;
  const completed = !!s.deepInvestigations?.[def.id];
  return {
    id: def.id,
    clueId: def.clueId,
    label: def.label,
    description: def.description,
    hours: def.passHours,
    completed,
    nextStepText: completed ? def.nextStepText : undefined,
    issue: completed ? null : deepInvestigationIssue(s, def.id),
  };
}

export function deepInvestigationIssue(s: GameState, investigationId: string): string | null {
  const def = deepInvestigationDef(investigationId);
  if (!def) return '这条线索没有可继续核验的调查方向。';
  if (s.pendingEncounter) return activeEncounterIssue(s);
  const woundIssue = woundActionIssue(s, 'deep_investigation');
  if (woundIssue) return woundIssue;
  if (s.deepInvestigations?.[def.id]) return '这条线索的下一步已经确认。';
  if (!hasClue(s, def.clueId)) return '调查笔记中没有这条可核验线索。';
  if (dockCaseDispositionClue(s)) return '这份案件已经完成阶段处置；如需继续追查，应等待新的可靠线索。';
  if (s.atWork) return '工作期间不能离岗深入调查。';
  if (s.currentLocation?.locationId !== def.locationId) return '需要回到取得相关记录的码头，才能继续核验。';
  if (def.openFrom !== undefined && def.openTo !== undefined && !isWithinWindow(s.hour, def.openFrom, def.openTo)) {
    return `相关记录只在${def.openFrom}:00至${def.openTo}:00之间开放。`;
  }
  const internal = evaluateExplorationCheckInternal(s, def.checkId);
  if (!internal.eligible && internal.reason !== 'insufficient') return '当前条件无法支持这次深入调查。';
  const repeatedIssue = repeatedBlockedExplorationIssue(s, internal);
  if (repeatedIssue) return repeatedIssue;
  if (s.stats.energy <= energyCost(s, def.passEnergyCost)) return '你现在太疲惫，无法完成这轮细致核验。';
  return null;
}

export function performDeepInvestigation(s: GameState, investigationId: string): ActionResult {
  const issue = deepInvestigationIssue(s, investigationId);
  if (issue) return { ok: false, msg: issue };
  const def = deepInvestigationDef(investigationId)!;
  const startedAt = { day: s.day, hour: s.hour };
  const request = explorationCheckRequest(s, def.checkId, startedAt);
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  if (!internal.eligible) return { ok: false, msg: '当前条件无法支持这次深入调查。' };

  const passed = internal.outcome === 'passed';
  const hours = passed ? def.passHours : def.blockedHours;
  const cost = passed ? def.passEnergyCost : def.blockedEnergyCost;
  const applied = applyEffects(s, [{ k: 'energy', v: -energyCost(s, cost) }]);
  const receipt: CheckReceipt = { hoursElapsed: hours, effects: [receiptEntry('energy', applied[0]), hoursReceipt(hours)] };
  if (passed) {
    s.deepInvestigations ??= {};
    s.deepInvestigations[def.id] = {
      investigationId: def.id, clueId: def.clueId,
      confirmedDay: startedAt.day, confirmedHour: startedAt.hour, nextStepId: def.nextStepId,
    };
    receipt.effects.push({ id: `investigation:${def.id}`, applied: true, before: false, after: true });
    addLog(s, `深入调查：${def.nextStepText}`, 'good');
    maybeAnnounceDockWitnessCrisis(s);
  } else {
    addLog(s, `深入调查：${def.blockedText}`, 'info');
  }
  recordCheckAttempt(s, internal, request.context, receipt, startedAt);
  if (def.threatId && def.attentionOnAttempt) {
    raiseCaseThreat(s, def.threatId, 'deep_investigation', def.id, def.attentionOnAttempt);
  }
  advanceHours(s, hours);
  return { ok: true, outcome: passed ? 'passed' : 'blocked' };
}

function dockEncounter(s: GameState) {
  const encounter = s.pendingEncounter;
  return encounter?.encounterId === DOCK_ENCOUNTER_ID ? encounter : null;
}

function hasDockCombatPreparationPrerequisites(s: GameState, preparationId: DockCombatPreparationId) {
  if (preparationId === 'mapped_retreat') return hasClue(s, 'dock_crate_trace');
  if (preparationId === 'prepared_ambush') {
    return hasClue(s, 'dock_manifest_discrepancy') && (s.items.revolver ?? 0) > 0;
  }
  return hasClue(s, 'dock_scale_transfer_omen') && (s.items.ritual_chalk ?? 0) > 0
    && hasSpiritVisionAbility(s);
}

export function dockCombatPreparationIssue(s: GameState, preparationId: DockCombatPreparationId): string | null {
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
  const encounter = dockEncounter(s);
  if (!encounter || encounter.phase !== 'escape_choice') return '当前没有可供布置的码头遭遇。';
  if (encounter.preparations.includes(preparationId)) return '这项准备已经完成。';
  const def = DOCK_COMBAT_PREPARATIONS.find(candidate => candidate.id === preparationId);
  if (!def) return '没有这项准备。';
  if (preparationId === 'mapped_retreat' && !hasClue(s, 'dock_crate_trace')) return '你还没有核对货箱外围与可用间隙。';
  if (preparationId === 'prepared_ambush') {
    if (!hasClue(s, 'dock_manifest_discrepancy')) return '你还不知道交接空档出现在哪一段时间。';
    if ((s.items.revolver ?? 0) <= 0) return '你没有足以支撑这项反击计划的可靠武器。';
  }
  if (preparationId === 'spiritual_guard') {
    if (!hasClue(s, 'dock_scale_transfer_omen')) return '你还没有得到能够指向转运与退路的占卜记录。';
    if ((s.items.ritual_chalk ?? 0) <= 0) return '你缺少用于划定边界的普通仪式粉笔。';
    if (!hasSpiritVisionAbility(s)) return '你没有能够维持这道防护边界的合法灵视能力。';
  }
  if (s.stats.energy <= energyCost(s, def.energyCost)) return '你必须保留最低行动能力，当前精力不足以完成这项布置。';
  return null;
}

export function getDockCombatPreparations(s: GameState) {
  const encounter = dockEncounter(s);
  if (!encounter || encounter.phase !== 'escape_choice') return [];
  return DOCK_COMBAT_PREPARATIONS
    .filter(def => def.id !== 'spiritual_guard' || hasClue(s, 'dock_scale_transfer_omen'))
    .map(def => ({
    ...def,
    completed: encounter.preparations.includes(def.id),
    issue: dockCombatPreparationIssue(s, def.id),
  }));
}

export function prepareDockEncounter(s: GameState, preparationId: DockCombatPreparationId): ActionResult {
  const issue = dockCombatPreparationIssue(s, preparationId);
  if (issue) return { ok: false, msg: issue };
  const encounter = dockEncounter(s)!;
  const def = DOCK_COMBAT_PREPARATIONS.find(candidate => candidate.id === preparationId)!;
  const startedAt = { day: s.day, hour: s.hour };
  const request = explorationCheckRequest(s, def.checkId, startedAt);
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  if (!internal.eligible || internal.outcome !== 'passed') return { ok: false, msg: '现有条件无法形成可执行的准备。' };
  const effects = applyEffects(s, [{ k: 'energy', v: -energyCost(s, def.energyCost) }]);
  const receipt: CheckReceipt = {
    hoursElapsed: 1,
    effects: [receiptEntry('energy', effects[0]), hoursReceipt(1), {
      id: `combat-prep:${preparationId}`, applied: true, before: false, after: true,
    }],
  };
  encounter.preparations.push(preparationId);
  recordCheckAttempt(s, internal, request.context, receipt, startedAt);
  addLog(s, `${def.label}：${def.benefitText}`, 'good');
  advanceHours(s, 1);
  return { ok: true, outcome: 'passed' };
}

function canUseSpiritualCombat(s: GameState) {
  return ['seer', 'spectator', 'apprentice'].some(pathwayId => hasInheritedSequence9Ability(s, pathwayId));
}

function freshCombatRound(initiated: boolean, advantage = 0): CombatRoundState {
  return { version: 1, round: 0, advantage, initiated, finisherReady: false, lastAction: null, criticalUsed: false, usedTechniqueIds: [] };
}

function sanitizeCombatRound(value: unknown, initiatedFallback: boolean): CombatRoundState | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<CombatRoundState>;
  const validAction = raw.lastAction === null || raw.lastAction === 'physical' || raw.lastAction === 'spiritual' || raw.lastAction === 'guard';
  if (raw.version !== 1 || !Number.isInteger(raw.round) || raw.round! < 0 || raw.round! > 2
    || !Number.isInteger(raw.advantage) || raw.advantage! < -3 || raw.advantage! > 5
    || typeof raw.initiated !== 'boolean' || typeof raw.finisherReady !== 'boolean'
    || raw.finisherReady !== (raw.round! >= 2) || !validAction || typeof raw.criticalUsed !== 'boolean') return null;
  const usedTechniqueIds = Array.isArray(raw.usedTechniqueIds)
    ? [...new Set(raw.usedTechniqueIds.filter(id => typeof id === 'string' && id.length > 0 && id.length < 80))].slice(0, 8)
    : [];
  return {
    version: 1, round: raw.round!, advantage: raw.advantage!, initiated: raw.initiated ?? initiatedFallback,
    finisherReady: raw.finisherReady, lastAction: raw.lastAction ?? null, criticalUsed: raw.criticalUsed,
    usedTechniqueIds,
  };
}

function combatRoundSignal(round: CombatRoundState) {
  if (round.advantage >= 3) return '对方的动作开始迟疑，你看见了结束冲突的机会。';
  if (round.advantage >= 1) return '你暂时稳住了距离，对方没能继续逼近。';
  if (round.advantage <= -2) return '压力仍在加重，再贸然抢攻可能让伤势恶化。';
  return '双方都没有暴露身份，短促试探仍在继续。';
}

type EnemyCombatStyleId = 'concealed_enforcer' | 'seer_smuggler';

const ENEMY_COMBAT_STYLES: Record<EnemyCombatStyleId, readonly [
  { targetBonus: number; physicalBonus: number; spiritualBonus: number; dodgePressure: number; signal: string },
  { targetBonus: number; physicalBonus: number; spiritualBonus: number; dodgePressure: number; signal: string },
]> = {
  concealed_enforcer: [
    { targetBonus: 2, physicalBonus: 4, spiritualBonus: 0, dodgePressure: 2, signal: '对方不断换手试探，重心却始终压向你的退路。' },
    { targetBonus: 0, physicalBonus: 0, spiritualBonus: 6, dodgePressure: 0, signal: '灰帽人避开灯火，周围的声音像被短暂压低。' },
  ],
  seer_smuggler: [
    { targetBonus: 6, physicalBonus: -2, spiritualBonus: 2, dodgePressure: 2, signal: '你尚未真正发力，对方已经提前偏离了瞄准方向。' },
    { targetBonus: 2, physicalBonus: 2, spiritualBonus: 8, dodgePressure: 0, signal: '对方没有追击，手指却在衣袖中完成了某种固定动作。' },
  ],
};

function enemyRoundStyle(styleId: EnemyCombatStyleId, round: number) {
  return ENEMY_COMBAT_STYLES[styleId][Math.min(1, Math.max(0, round)) as 0 | 1];
}

function enemyIntentSignal(styleId: EnemyCombatStyleId, round: number) {
  return enemyRoundStyle(styleId, round).signal;
}

function combatExchangeIssue(s: GameState, round: CombatRoundState | undefined, action: CombatRoundAction): string | null {
  if (!round || round.finisherReady || round.round >= 2) return '当前交锋已经可以进入最终处置。';
  if (!['physical', 'spiritual', 'guard'].includes(action)) return '没有这种可执行的交锋方式。';
  const energyNeeded = action === 'guard' ? 1 : action === 'physical' ? 8 : 6;
  if (s.stats.energy < energyNeeded) return `精力不足，至少需要${energyNeeded}点才能完成这次行动。`;
  if (action === 'spiritual') {
    if (!canUseSpiritualCombat(s)) return '你没有可以用于压制冲突的合法序列能力。';
    if (s.combatVitals.spirit < 8) return '精神值不足，无法维持灵性压制。';
  }
  return null;
}

function performCombatExchange(
  s: GameState,
  round: CombatRoundState,
  action: CombatRoundAction,
  enemyPower: number,
  preparations: readonly DockCombatPreparationId[] = [],
  technique?: { id: string; label: string; effect: CombatTechniqueEffect; consumeItemId?: string },
  enemyStyleId: EnemyCombatStyleId = 'concealed_enforcer',
) {
  const issue = combatExchangeIssue(s, round, action);
  if (issue) return { ok: false as const, msg: issue };
  if (technique && round.usedTechniqueIds.includes(technique.id)) return { ok: false as const, msg: '这项战术在本次冲突中已经使用过。' };
  if (technique && s.combatVitals.spirit < technique.effect.spiritCost) return { ok: false as const, msg: '精神值不足，无法稳定使用这项能力。' };
  if (technique?.consumeItemId && (s.items[technique.consumeItemId] ?? 0) <= 0) return { ok: false as const, msg: '对应物品已经用尽。' };
  const profile = getCombatProfile(s);
  if (action === 'physical') consumeRevolverRound(s);
  const enemyStyle = enemyRoundStyle(enemyStyleId, round.round);
  const criticalTriggered = action === 'physical' && round.initiated && !round.criticalUsed
    && preparations.includes('prepared_ambush') && profile.critical >= 18;
  const actionScore = (action === 'physical' ? profile.physicalAttack
    : action === 'spiritual' ? profile.spiritualAttack
      : Math.max(profile.physicalDefense, profile.spiritualDefense) + Math.floor(profile.dodge / 2))
    + (technique?.effect.scoreBonus ?? 0);
  const target = enemyPower + round.round * 2 + enemyStyle.targetBonus;
  let advantageGain = actionScore >= target ? 2 : actionScore >= target - 7 ? 1 : -1;
  if (criticalTriggered) advantageGain += 2;
  advantageGain += technique?.effect.advantageBonus ?? 0;
  if (action === 'guard' && advantageGain < 0) advantageGain = 0;

  const requestedEnergyCost = action === 'guard' ? 5 : action === 'physical' ? 8 : 6;
  const energyCostValue = action === 'guard'
    ? Math.min(requestedEnergyCost, Math.max(0, s.stats.energy - 1))
    : requestedEnergyCost;
  applyEffects(s, [{ k: 'energy', v: -energyCostValue }]);
  if (action === 'spiritual') s.combatVitals.spirit = Math.max(0, s.combatVitals.spirit - 8);
  if (technique?.effect.spiritCost) s.combatVitals.spirit = Math.max(0, s.combatVitals.spirit - technique.effect.spiritCost);

  const guardReduction = action === 'guard' ? 9 : 0;
  const controlReduction = Math.max(0, round.advantage + advantageGain) * 2;
  const retreatReduction = preparations.includes('mapped_retreat') ? 3 : 0;
  const spiritualReduction = preparations.includes('spiritual_guard') ? 4 : 0;
  const impact = applyCombatImpact(
    s,
    Math.max(1, enemyPower + enemyStyle.physicalBonus - 10 - guardReduction - controlReduction - retreatReduction - (technique?.effect.incomingReduction ?? 0)),
    Math.max(0, Math.floor(enemyPower / 4) + enemyStyle.spiritualBonus - (action === 'spiritual' ? 3 : 0) - spiritualReduction - Math.floor((technique?.effect.incomingReduction ?? 0) / 2)),
    35 + round.round * 3 + enemyStyle.dodgePressure,
  );
  round.round += 1;
  round.advantage = Math.max(-3, Math.min(5, round.advantage + advantageGain));
  round.lastAction = action;
  round.criticalUsed ||= criticalTriggered;
  if (technique) round.usedTechniqueIds.push(technique.id);
  round.finisherReady = round.round >= 2;
  if (technique?.consumeItemId) s.items[technique.consumeItemId] = Math.max(0, (s.items[technique.consumeItemId] ?? 0) - 1);
  if (criticalTriggered) addLog(s, '你利用预先选定的角度抓住破绽，固定完成了一次先手反击，在对方站稳前夺回了一步距离。', 'good');
  const actionText = action === 'physical' ? '你以武器和格斗迫使对方改变站位'
    : action === 'spiritual' ? '你用短促的灵性压制扰乱对方的逼近'
      : '你收住追击，护住要害并重新确认退路';
  addLog(s, `${actionText}，这一轮损失了${impact.hpDamage}点生命、${impact.spiritDamage}点精神值。${combatRoundSignal(round)}`, impact.hpDamage > 0 ? 'info' : 'good');
  if (technique) addLog(s, `${technique.label}：你把能力或物品转化成了这一轮可验证的战术优势。`, 'good');
  return { ok: true as const, impact };
}

function availableCombatTechniques(s: GameState) {
  const techniques: Array<{ id: string; label: string; description: string; effect: CombatTechniqueEffect; consumeItemId?: string }> = [];
  if (hasInheritedSequence9Ability(s)) {
    const skill = SEQUENCE9_COMBAT_SKILLS.find(candidate => candidate.pathwayId === s.pathwayId);
    if (skill) {
      const nightBonus = (s.hour >= 18 || s.hour < 6) ? skill.nightScoreBonus ?? 0 : 0;
      techniques.push({
        id: `pathway:${skill.id}`, label: skill.label, description: skill.description,
        effect: { baseAction: skill.baseAction, scoreBonus: skill.scoreBonus + nightBonus, advantageBonus: skill.advantageBonus, incomingReduction: skill.incomingReduction, spiritCost: skill.spiritCost },
      });
    }
  }
  for (const item of ITEMS) {
    const technique = item.combat?.technique;
    if (!technique || (s.items[item.id] ?? 0) <= 0) continue;
    techniques.push({
      id: `item:${item.id}`, label: technique.label, description: technique.description,
      effect: technique, ...(technique.consume ? { consumeItemId: item.id } : {}),
    });
  }
  return techniques;
}

export function getCombatTechniqueViews(s: GameState) {
  const round = s.pendingEncounter?.phase === 'combat' ? s.pendingEncounter.combatRound
    : s.activeHunt?.phase === 'combat' ? s.activeHunt.combatRound : undefined;
  return availableCombatTechniques(s).map(technique => ({
    id: technique.id, label: technique.label, description: technique.description,
    used: !!round?.usedTechniqueIds.includes(technique.id),
    issue: !round ? '当前没有可以使用战术的交锋。'
      : round.finisherReady ? '当前交锋已经进入最终处置。'
        : round.usedTechniqueIds.includes(technique.id) ? '本次冲突中已经使用过。'
          : s.combatVitals.spirit < technique.effect.spiritCost ? '精神值不足。' : null,
  }));
}

function combatTechniqueById(s: GameState, techniqueId: string) {
  return availableCombatTechniques(s).find(technique => technique.id === techniqueId);
}

export function dockCombatExchangeIssue(s: GameState, action: CombatRoundAction): string | null {
  const encounter = dockEncounter(s);
  if (!encounter || encounter.phase !== 'combat') return '当前没有正在进行的码头交锋。';
  return combatExchangeIssue(s, encounter.combatRound, action);
}

export function performDockCombatExchange(s: GameState, action: CombatRoundAction): ActionResult {
  const encounter = dockEncounter(s);
  if (!encounter || encounter.phase !== 'combat' || !encounter.combatRound) return { ok: false, msg: '当前没有正在进行的码头交锋。' };
  const result = performCombatExchange(s, encounter.combatRound, action, 30, encounter.preparations, undefined, 'concealed_enforcer');
  if (!result.ok) return result;
  if (rescueFromFatalInjury(s, '短促交锋令你失去意识。')) {
    addLog(s, '巡夜人的灯光逼退了袭击者；等你醒来时，这次遭遇已经中止。', 'bad');
  }
  return { ok: true, outcome: encounter.combatRound?.finisherReady ? 'passed' : 'blocked' };
}

export function performDockCombatTechnique(s: GameState, techniqueId: string): ActionResult {
  const encounter = dockEncounter(s);
  const technique = combatTechniqueById(s, techniqueId);
  if (!encounter || encounter.phase !== 'combat' || !encounter.combatRound || !technique) return { ok: false, msg: '当前无法使用这项战术。' };
  const result = performCombatExchange(s, encounter.combatRound, technique.effect.baseAction, 30, encounter.preparations, technique, 'concealed_enforcer');
  if (!result.ok) return result;
  if (rescueFromFatalInjury(s, '战术交锋仍令你失去意识。')) addLog(s, '巡夜人的灯光逼退了袭击者；这次遭遇已经中止。', 'bad');
  return { ok: true, outcome: encounter.combatRound?.finisherReady ? 'passed' : 'blocked' };
}

export function dockCombatApproachIssue(s: GameState, approach: CombatApproach, initiated = false): string | null {
  const encounter = dockEncounter(s);
  if (!encounter || (initiated ? encounter.phase !== 'escape_choice' : encounter.phase !== 'combat')) return '当前没有可结算的码头冲突。';
  if (approach !== 'physical' && approach !== 'spiritual') return '没有这种可执行的应战方式。';
  if (initiated) {
    const woundIssue = woundActionIssue(s, 'active_combat');
    if (woundIssue) return woundIssue;
  }
  if (approach === 'spiritual') {
    if (!canUseSpiritualCombat(s)) return '你没有可以用于压制冲突的合法序列能力。';
    if (s.combatVitals.spirit < 8) return '精神值不足，无法维持灵性压制。';
  }
  return null;
}

export function engageDockEncounter(s: GameState, approach: CombatApproach): ActionResult {
  const issue = dockCombatApproachIssue(s, approach, true);
  if (issue) return { ok: false, msg: issue };
  s.pendingEncounter!.phase = 'combat';
  s.pendingEncounter!.combatRound = freshCombatRound(true);
  return performDockCombatExchange(s, approach);
}

function dockDangerAssessment(s: GameState, encounter: NonNullable<GameState['pendingEncounter']>) {
  if (encounter.preparations.includes('spiritual_guard')) return '防护边界出现短促扰动：对方可能干扰感知。保持边界，避免追入无灯区域。';
  if (hasClue(s, 'dock_scale_transfer_omen')) return '已有预兆只指向固定转运与退路受阻；它没有揭示对方身份。优先保留撤离路线。';
  if (hasClue(s, 'dock_crate_trace') || hasClue(s, 'dock_manifest_discrepancy')) return '现场记录表明对方熟悉交接空档与货箱遮挡。先利用已核对的路线，不要盲目追击。';
  return null;
}

export function getPendingEncounterView(s: GameState) {
  const encounter = s.pendingEncounter;
  if (!encounter || encounter.encounterId !== DOCK_ENCOUNTER_ID) return null;
  if (encounter.phase === 'combat') {
    const combatRound = encounter.combatRound;
    return {
      phase: encounter.phase,
      title: '退路被截断',
      text: '第一次脱身没有成功。灰帽人逼近时始终避开灯火，你只能先挡住这次袭击，再寻找离开的机会。',
      actionLabel: '抵挡并寻找脱身机会',
      assessment: dockDangerAssessment(s, encounter),
      combatRound: combatRound ? {
        round: combatRound.round, finisherReady: combatRound.finisherReady,
        signal: combatRoundSignal(combatRound),
        enemyIntent: enemyIntentSignal('concealed_enforcer', combatRound.round),
      } : { round: 2, finisherReady: true, signal: '你已经撑过最危险的贴身逼迫，必须立刻结束冲突。', enemyIntent: '对方正在重新判断是否继续追击。' },
    };
  }
  const texts = [
    '灰帽人从旧仓方向跟了出来。他没有表明身份，只在你转向灯火时挡住了路。',
    '橱窗倒影里，那顶灰帽第三次出现在同一个距离。前方巷口也有人停下了脚步。',
    '身后的脚步忽然加快。对方显然不打算再装作偶然同路。',
  ];
  return {
    phase: encounter.phase,
    title: '有人跟了上来',
    text: texts[encounter.narrativeVariant % texts.length],
    actionLabel: '利用已知路线设法甩脱',
    assessment: dockDangerAssessment(s, encounter),
  };
}

export function attemptEncounterEscape(s: GameState): ActionResult {
  const encounter = s.pendingEncounter;
  if (!encounter || encounter.encounterId !== DOCK_ENCOUNTER_ID || encounter.phase !== 'escape_choice') {
    return { ok: false, msg: '目前没有可以进行的逃脱检定。' };
  }
  const startedAt = { day: s.day, hour: s.hour };
  const preparations = [...encounter.preparations];
  const request = explorationCheckRequest(s, 'dock_manifest_cleaner_escape', startedAt);
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  if (!internal.eligible) return { ok: false, msg: '当前遭遇状态无法进行逃脱检定。' };
  const passed = internal.outcome === 'passed';
  // 逃脱失败后仍需立刻进入防御战；保留最低行动能力，避免通用昏倒结算插入两阶段遭遇中间。
  const escapeEnergyCost = Math.min(energyCost(s, passed ? 8 : 12), Math.max(0, s.stats.energy - 1));
  const escapeSanCost = passed ? 0 : Math.min(2, Math.max(0, s.stats.san - 1));
  const effects = applyEffects(s, passed
    ? [{ k: 'energy', v: -escapeEnergyCost }]
    : [{ k: 'energy', v: -escapeEnergyCost }, { k: 'san', v: -escapeSanCost }]);
  const receipt: CheckReceipt = {
    hoursElapsed: 1,
    effects: effects.map((entry, index) => receiptEntry(index === 0 ? 'energy' : 'san', entry)).concat(hoursReceipt(1)),
  };
  const threat = caseThreat(s, encounter.threatId);
  let rescued = false;
  if (passed) {
    threat.attention = Math.min(threat.attention, 60);
    s.pendingEncounter = null;
    s.currentLocation = null;
    addLog(s, '你借先前记下的货箱间隙和人流转向甩开了跟踪者。对方没有追进灯火最亮的街口。', 'good');
  } else {
    const impact = applyCombatImpact(s, encounter.preparations.includes('mapped_retreat') ? 12 : 18, 0, 34);
    rescued = rescueFromFatalInjury(s, '转角处的第一轮袭击令你失去意识。');
    if (rescued) {
      addLog(s, '巡夜人的灯光逼退了追踪者；这次遭遇已经中止。', 'bad');
    } else {
      encounter.phase = 'combat';
      encounter.combatRound = freshCombatRound(false);
      addLog(s, `你试图借巷道脱身，却在转角被提前截住，伤势消耗了${impact.hpDamage}点生命。逃跑的机会已经过去，只能先挡住对方。`, 'bad');
    }
  }
  receipt.effects.push({ id: passed ? 'encounter:escaped' : 'encounter:combat', applied: true });
  const attempt = recordCheckAttempt(s, internal, request.context, receipt, startedAt);
  if (passed) acquireClue(s, 'dock_gray_hat_escape_recollection');
  else if (rescued) acquireClue(s, 'dock_gray_hat_scene_lost');
  if (!passed) {
    recordAreaSuspicion(s, 'docks', 'dock_escape_failed',
      dockAreaSuspicionAmount('dock_escape_failed', preparations), attempt);
  }
  advanceHours(s, 1);
  return { ok: true, outcome: passed ? 'passed' : 'blocked' };
}

function settleDockEncounterCombat(s: GameState, approach: CombatApproach, initiated: boolean): ActionResult {
  const encounter = s.pendingEncounter;
  if (!encounter || encounter.encounterId !== DOCK_ENCOUNTER_ID || encounter.phase !== 'combat') {
    return { ok: false, msg: '目前没有需要结算的防御战。' };
  }
  if (encounter.combatRound && !encounter.combatRound.finisherReady) {
    return { ok: false, msg: '还没有形成结束冲突的机会；先完成眼前的交锋。' };
  }
  const approachIssue = dockCombatApproachIssue(s, approach);
  if (approachIssue) return { ok: false, msg: approachIssue };
  const profile = getCombatProfile(s);
  const preparations = [...encounter.preparations];
  const startedAt = { day: s.day, hour: s.hour };
  const combatCheckId = approach === 'spiritual'
    ? initiated ? 'dock_manifest_cleaner_active_spiritual_combat' : 'dock_manifest_cleaner_spiritual_combat'
    : initiated ? 'dock_manifest_cleaner_active_combat' : 'dock_manifest_cleaner_combat';
  const request = explorationCheckRequest(s, combatCheckId, startedAt);
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  if (!internal.eligible) return { ok: false, msg: '当前遭遇状态无法结算。' };
  const passed = internal.outcome === 'passed';
  if (approach === 'physical') consumeRevolverRound(s);
  const combatSanCost = Math.min(passed ? 3 : 8, Math.max(0, s.stats.san - 1));
  const effects = applyEffects(s, passed
    ? [{ k: 'energy', v: -25 }, { k: 'san', v: -combatSanCost }]
    : [{ k: 'energy', v: -35 }, { k: 'san', v: -combatSanCost }]);
  const receipt: CheckReceipt = {
    hoursElapsed: 1,
    effects: [receiptEntry('energy', effects[0]), receiptEntry('san', effects[1]), hoursReceipt(1)],
  };
  const threat = caseThreat(s, encounter.threatId);
  if (approach === 'spiritual') {
    const spiritBefore = s.combatVitals.spirit;
    s.combatVitals.spirit -= 8;
    receipt.effects.push({ id: 'spirit', applied: true, before: spiritBefore, after: s.combatVitals.spirit, actualDelta: -8 });
  }
  const criticalTriggered = approach === 'physical' && initiated
    && encounter.preparations.includes('prepared_ambush') && profile.critical >= 18;
  let physicalPower = passed ? 22 : 34;
  let spiritualPower = passed ? 6 : 12;
  if (approach === 'physical') physicalPower -= Math.floor(profile.physicalAttack / 6) + (criticalTriggered ? 8 : 0);
  else {
    physicalPower -= Math.floor(profile.spiritualAttack / 10);
    spiritualPower -= Math.floor(profile.spiritualAttack / 6);
  }
  if (encounter.preparations.includes('spiritual_guard')) spiritualPower -= 6;
  const impact = applyCombatImpact(s, Math.max(1, physicalPower), Math.max(1, spiritualPower), passed ? 38 : 44);
  const rescued = rescueFromFatalInjury(s, '你在冲突中伤重倒下，附近巡夜人及时赶到。');
  if (criticalTriggered) addLog(s, '你利用预先选定的角度抓住破绽，固定完成了一次先手反击。', 'good');
  if (approach === 'spiritual') addLog(s, '你以自身途径能力维持短促压制，没有试图追索对方身份。', 'info');
  if (passed) {
    threat.status = 'resolved';
    addLog(s, `你没有追击，只在对方失去平衡时冲向街灯。你损失了${impact.hpDamage}点生命、${impact.spiritDamage}点精神值；灰帽人放弃继续纠缠。`, rescued ? 'bad' : 'good');
    receipt.effects.push({ id: 'threat:resolved', applied: true, before: 'active', after: 'resolved' });
  } else {
    threat.attention = Math.min(threat.attention, 50);
    s.flags.dock_encounter_wounded = true;
    addLog(s, `你带着伤撑到巡夜人的灯光附近，损失了${impact.hpDamage}点生命、${impact.spiritDamage}点精神值。灰帽人没有冒险追来；你保住了调查笔记，却必须回去休养。`, 'bad');
    receipt.effects.push({ id: 'encounter:survived', applied: true });
  }
  s.pendingEncounter = null;
  s.currentLocation = null;
  s.atWork = false;
  const attempt = recordCheckAttempt(s, internal, request.context, receipt, startedAt);
  acquireClue(s, passed && !rescued ? 'dock_gray_hat_dropped_token' : 'dock_gray_hat_scene_lost');
  const source: Exclude<AreaSuspicionSource, 'hunt_death'> = approach === 'spiritual'
    ? initiated ? 'dock_active_spiritual' : 'dock_defensive_spiritual'
    : initiated ? 'dock_active_physical' : 'dock_defensive_physical';
  recordAreaSuspicion(s, 'docks', source, dockAreaSuspicionAmount(source, preparations), attempt);
  advanceHours(s, 1);
  return { ok: true, outcome: passed ? 'passed' : 'blocked' };
}

/** 公开入口仅结算逃脱失败后的防御战；主动应战只能经 engageDockEncounter 进入。 */
export function resolveEncounterCombat(s: GameState, approach: CombatApproach = 'physical'): ActionResult {
  return settleDockEncounterCombat(s, approach, s.pendingEncounter?.combatRound?.initiated ?? false);
}

function receiptEntry(id: string, receipt: AppliedEffectReceipt) {
  return {
    id,
    applied: receipt.applied,
    before: receipt.before,
    after: receipt.after,
    actualDelta: receipt.actualDelta,
  };
}

function hoursReceipt(hours: number) {
  return { id: 'hours', applied: hours > 0, before: 0, after: hours, actualDelta: hours };
}

type DivinationTargetDef = {
  kind: DivinationTargetKind;
  id: string;
  title: string;
  difficulty: number;
  pressure: 'low' | 'high';
  antiDivination?: boolean;
  clueId?: string;
  clueBonuses?: Readonly<Record<string, number>>;
  successText: Record<DivinationMethod, string>;
};

const DIVINATION_TARGETS: readonly DivinationTargetDef[] = [
  {
    kind: 'location', id: 'old_tower', title: '旧钟楼的夜间异响', difficulty: 32, pressure: 'low',
    clueId: 'clocktower_divination_omen',
    clueBonuses: { clocktower_public_complaints: 4, clocktower_repair_orders: 8 },
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

/** 序列9获得的基础能力会被更高序列继承；非法途径、序列0与凡人均不成立。 */
export function hasInheritedSequence9Ability(s: GameState, pathwayId = s.pathwayId): boolean {
  return pathwayId !== null
    && s.pathwayId === pathwayId
    && PATHWAYS.some(pathway => pathway.id === pathwayId)
    && Number.isInteger(s.sequence)
    && s.sequence !== null
    && s.sequence >= 1
    && s.sequence <= 9;
}

export function hasSpiritVisionAbility(s: GameState): boolean {
  return hasInheritedSequence9Ability(s);
}

export function itemPresentation(s: GameState, itemId: string): { name: string; description: string } | null {
  const item = findItem(itemId);
  if (!item) return null;
  const concealed = item.occultMarked || MYSTIC_MATERIAL_ITEM_IDS.has(itemId);
  const knowledge = s.itemKnowledge?.[itemId];
  const tradeGuaranteed = verifiedTradeFairItemQuantity(s, itemId) > 0;
  const tradeAppraised = isTradeFairCharacteristicIdentified(s, itemId);
  const identified = knowledge?.spiritVisionInspected || knowledge?.identifiedAsOccult || tradeGuaranteed || tradeAppraised;
  const name = concealed && !identified ? (item.surfaceName ?? '未鉴定的密封样本') : item.name;
  const base = concealed && !identified ? (item.surfaceDesc ?? '密封容器上只剩外观与批次，来源和性质仍待核验。') : item.desc;
  const knownInfo = knowledge?.knownInfo ?? [];
  const insight = successfulItemDivination(s, itemId);
  const additions = [
    ...(tradeGuaranteed || tradeAppraised ? ['交易会担保记录：封签、用途与途径已由主持方核验；这不等于你已经锁定该途径。'] : []),
    ...knownInfo.map(info => `灵视记录：${info}`),
    ...(insight ? [`占卜记录：${insight.text}`] : []),
  ];
  return { name, description: additions.length ? `${base} ${additions.join(' ')}` : base };
}

export function spiritVisionInspectionIssue(s: GameState, itemId: string): string | null {
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
  if (!hasSpiritVisionAbility(s)) return '你尚未真正掌握灵视；灵性数值或理论知识不能代替非凡能力。';
  if (!isAtHome(s)) return '需要先回到住处，在可控环境中检视物品。';
  if ((s.items[itemId] ?? 0) <= 0) return '这件物品并不在你的持有物中。';
  const item = findItem(itemId);
  if (!item?.spiritVision) return '这件物品没有可由灵视稳定辨认的记录。';
  if (s.itemKnowledge?.[itemId]?.spiritVisionInspected) return '这件物品已经完成过灵视检视。';
  if (s.combatVitals.spirit < 6) return '精神值不足，无法稳定维持灵视。';
  if (s.stats.energy < energyCost(s, 5) + 3) return '你现在太疲惫，无法稳定维持灵视。';
  return null;
}

export function inspectItemWithSpiritVision(s: GameState, itemId: string): ActionResult {
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return { ok: false, msg: encounterIssue };
  const issue = spiritVisionInspectionIssue(s, itemId);
  if (issue) return { ok: false, msg: issue };
  const item = findItem(itemId)!;
  const definition = item.spiritVision!;
  s.combatVitals.spirit -= 6;
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
  if (itemId === STRANGE_NOTEBOOK_ITEM_ID) {
    s.strangeNotebook.nextManifestationAbsoluteHour = Math.min(s.strangeNotebook.nextManifestationAbsoluteHour, absoluteHour(s));
    progressStrangeNotebook(s);
  }
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
    const occultKnown = knowledge?.identifiedAsOccult === true || !!successfulItemDivination(s, id)
      || verifiedTradeFairItemQuantity(s, id) > 0 || isTradeFairCharacteristicIdentified(s, id);
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
  return hasInheritedSequence9Ability(s, 'seer');
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

function grantSequence9CoreAbilities(s: GameState) {
  if (!hasInheritedSequence9Ability(s)) return;
  if (!s.knowledge.includes('spirit_vision')) s.knowledge.push('spirit_vision');
  if (s.pathwayId === 'seer') grantSeerDivinationTraining(s);
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
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
  if (s.atWork) return '需先下班离开工作地点。';
  if (hasTrustedCardDivinationTraining(s)) return '你已经掌握了这套安全纸牌方法。';
  const trust = trustedNpcIssue(s, 'nelson');
  if (trust) return trust;
  if (s.stats.energy < energyCost(s, 8) + 5) return '你现在太疲惫，难以记牢完整的象征次序。';
  return null;
}

export function learnCardDivination(s: GameState): ActionResult {
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return { ok: false, msg: encounterIssue };
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
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
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
    const sessionIssue = npcVisitSessionIssue(s, 'nelson');
    if (sessionIssue) return sessionIssue;
    if (s.pence < 24) return '你付不起尼尔逊这次代占的费用。';
    if (method !== 'cards') return '尼尔逊只愿意提供边界清楚的纸牌代占。';
  } else {
    const evelyn = findAnyNPC(s, 'evelyn');
    if (!evelyn || !isMet(s, 'evelyn')) return '你尚未与负责异常事务的教会执事建立联系。';
    const sessionIssue = npcVisitSessionIssue(s, 'evelyn');
    if (sessionIssue) return sessionIssue;
    if (!hasOfficialEvelynDivinationRelationship(s)) return '教会尚未把你或这件事纳入正式异常记录。';
    if (!(target.id === 'old_tower' || target.id === 'anomaly_evidence')) return '这不属于伊芙琳会受理的官方异常或证物范围。';
    if (method !== 'cards') return '官方记录室采用的是受控象征核验。';
  }
  if (provider === 'self' && s.combatVitals.spirit < (method === 'dream' ? 12 : 6)) return '精神值不足，无法维持这次占卜。';
  if (s.stats.energy < energyCost(s, provider === 'self' ? 8 : 5) + 5) return '你现在太疲惫，无法完成一轮专注核验。';
  return null;
}

export function divinationIssue(s: GameState, targetKind: DivinationTargetKind, targetId: string, method: DivinationMethod, provider: DivinationProvider): string | null {
  const target = divinationTarget(s, targetKind, targetId);
  if (!target) return genericDivinationTargetIssue;
  return providerIssue(s, provider, method, target);
}

export function getNpcDivinationRequests(s: GameState, npcId: string) {
  if (npcId !== 'nelson' && npcId !== 'evelyn') return [];
  if (npcVisitSessionIssue(s, npcId)) return [];
  return getDivinationTargets(s).filter(target => npcId === 'nelson'
    || target.id === 'old_tower' || target.id === 'anomaly_evidence');
}

function divinationScoreInput(
  s: GameState,
  target: DivinationTargetDef,
  method: DivinationMethod,
  provider: DivinationProvider,
): Extract<DivinationScoreInput, { version: 1 }> {
  const methodDef = DIVINATION_METHOD_DEFS.find(candidate => candidate.id === method)!;
  const self = provider === 'self';
  return {
    version: 1,
    spirituality: self ? s.stats.spi : 0,
    occultSkill: self ? (s.skills.occult ?? 0) : 0,
    methodBase: self ? methodDef.baseValue : provider === 'nelson' ? 36 : 48,
    toolIds: self ? methodDef.toolBonuses.filter(tool => (s.items[tool.itemId] ?? 0) > 0).map(tool => tool.itemId) : [],
    seerDivinationBonus: self && hasSeerDivinationSequence(s) ? 2 : 0,
    clueIds: Object.keys(target.clueBonuses ?? {}).filter(clueId => hasClue(s, clueId)),
    lowSanity: self && s.stats.san < 45,
    highCorruption: self && s.stats.cor >= 30,
    jammed: !!s.flags.jammed,
  };
}

function scoreDivinationInput(target: DivinationTargetDef, method: DivinationMethod, provider: DivinationProvider, input: DivinationScoreInput): number | null {
  if (input.version === 23) {
    return input.provenance === 'validated_v23_attempt'
      && Number.isInteger(input.validatedScore)
      && input.validatedScore >= -100
      && input.validatedScore <= 500
      ? input.validatedScore : null;
  }
  const methodDef = DIVINATION_METHOD_DEFS.find(candidate => candidate.id === method);
  if (!methodDef || !Number.isFinite(input.spirituality) || !Number.isFinite(input.occultSkill)
    || !Number.isFinite(input.methodBase) || !Number.isFinite(input.seerDivinationBonus)
    || !Array.isArray(input.toolIds) || !input.toolIds.every(id => typeof id === 'string')
    || new Set(input.toolIds).size !== input.toolIds.length
    || !Array.isArray(input.clueIds) || !input.clueIds.every(id => typeof id === 'string')
    || new Set(input.clueIds).size !== input.clueIds.length
    || typeof input.lowSanity !== 'boolean' || typeof input.highCorruption !== 'boolean' || typeof input.jammed !== 'boolean') return null;
  if (provider === 'self') {
    if (input.spirituality < 0 || input.spirituality > 100 || input.occultSkill < 0 || input.occultSkill > 10
      || input.methodBase !== methodDef.baseValue || ![0, 2].includes(input.seerDivinationBonus)
      || input.toolIds.some(id => !methodDef.toolBonuses.some(tool => tool.itemId === id))) return null;
  } else if (input.spirituality !== 0 || input.occultSkill !== 0 || input.toolIds.length > 0
    || input.seerDivinationBonus !== 0 || input.lowSanity || input.highCorruption
    || input.methodBase !== (provider === 'nelson' ? 36 : 48)) return null;
  if (input.clueIds.some(id => (target.clueBonuses?.[id] ?? 0) === 0)) return null;
  let score = input.methodBase + input.spirituality + input.occultSkill * 4 + input.seerDivinationBonus;
  for (const itemId of input.toolIds) score += methodDef.toolBonuses.find(tool => tool.itemId === itemId)?.value ?? 0;
  for (const clueId of input.clueIds) score += target.clueBonuses?.[clueId] ?? 0;
  if (input.lowSanity) score -= 8;
  if (input.highCorruption) score -= 8;
  if (input.jammed) score -= 20;
  return score;
}

function divinationScore(s: GameState, target: DivinationTargetDef, method: DivinationMethod, provider: DivinationProvider): number {
  return scoreDivinationInput(target, method, provider, divinationScoreInput(s, target, method, provider))!;
}

export function evaluateDivination(s: GameState, targetKind: DivinationTargetKind, targetId: string, method: DivinationMethod, provider: DivinationProvider): { outcome: DivinationOutcome; score: number } | null {
  const target = divinationTarget(s, targetKind, targetId);
  if (!target || providerIssue(s, provider, method, target)) return null;
  const score = divinationScore(s, target, method, provider);
  if (divinationScoreInput(s, target, method, provider).jammed) return { outcome: 'obscured', score };
  if (score >= target.difficulty) return { outcome: targetKind === 'location' ? 'omen' : 'hint', score };
  if (target.antiDivination && score >= target.difficulty - 6) return { outcome: 'obscured', score };
  if (method === 'dream' || target.pressure === 'high') return { outcome: 'backlash', score };
  return { outcome: 'inconclusive', score };
}

export function performDivination(s: GameState, targetKind: DivinationTargetKind, targetId: string, method: DivinationMethod, provider: DivinationProvider): ActionResult {
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return { ok: false, msg: encounterIssue };
  const target = divinationTarget(s, targetKind, targetId);
  if (!target) return { ok: false, msg: genericDivinationTargetIssue };
  const issue = providerIssue(s, provider, method, target);
  if (issue) return { ok: false, msg: issue };
  const scoreInput = divinationScoreInput(s, target, method, provider);
  const result = evaluateDivination(s, targetKind, targetId, method, provider)!;
  if (provider === 'self') s.combatVitals.spirit -= method === 'dream' ? 12 : 6;
  else s.npcVisitSession = null;
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
  const attempt: DivinationAttempt = { targetKind, targetId, method, provider, outcome: result.outcome, day: s.day, hour: s.hour, score: result.score, scoreInput };
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
  if (targetKind === 'item' && targetId === STRANGE_NOTEBOOK_ITEM_ID
    && (result.outcome === 'hint' || result.outcome === 'backlash')) {
    s.strangeNotebook.nextManifestationAbsoluteHour = Math.min(s.strangeNotebook.nextManifestationAbsoluteHour, absoluteHour(s));
    progressStrangeNotebook(s);
  }
  s.divinationInsights.push(insight);
  if (provider === 'self' && targetKind === 'item' && targetId === 'dock_scale_evidence') {
    const attention = result.outcome === 'hint' ? 15
      : result.outcome === 'obscured' ? 25
        : result.outcome === 'backlash' ? 35 : 0;
    raiseCaseThreat(s, DOCK_THREAT_ID, 'divination', `divination:self:${targetId}`, attention);
  }
  addLog(s, `占卜记录：${text}`, result.outcome === 'backlash' ? 'bad' : result.outcome === 'inconclusive' || result.outcome === 'obscured' ? 'info' : 'good');
  return { ok: true, outcome: result.outcome === 'omen' || result.outcome === 'hint' ? 'passed' : 'blocked' };
}
/** 结交事件：与陌生人正式相识（叙事由调用方补充） */
export function acquaint(s: GameState, id: string, base: number) {
  if (isMet(s, id)) return;
  applyEffects(s, [{ k: 'favor', id, v: base }]);
}
function energyCostAtHour(s: GameState, base: number, hour: number): number {
  return Math.round(base * (hasTalent(s, 'night_owl') && isNight(hour) ? 0.7 : 1));
}

function energyCost(s: GameState, base: number): number {
  return energyCostAtHour(s, base, s.hour);
}

function actionFitsWindow(hour: number, hours: number, openFrom: number, openTo: number): boolean {
  return hour >= openFrom && hour + hours <= openTo;
}

export function isActiveNightwatchSequence9Member(s: GameState): boolean {
  const route = s.organizationRoutes?.nightwatch;
  const nightwatch = ORGANIZATIONS.find(organization => organization.id === 'nightwatch');
  if (s.sequence !== 9 || !s.pathwayId || !route || route.status !== 'committed'
    || route.selectedPathway !== s.pathwayId || !nightwatch?.heldPathways.some(pathwayId => pathwayId === s.pathwayId)) return false;
  const lead = s.pathwayLeads?.[s.pathwayId];
  return !!lead && lead.organizationId === 'nightwatch' && lead.commitment === true;
}

export function isFormalNightwatchSeerStudent(s: GameState): boolean {
  if (s.sequence !== 9 || s.pathwayId !== 'seer') return false;
  const route = s.organizationRoutes?.nightwatch;
  const lead = s.pathwayLeads?.seer;
  return !!route && route.status === 'committed' && route.selectedPathway === 'seer'
    && !!lead && lead.organizationId === 'nightwatch' && lead.commitment === true;
}

export function hasSeerTrainingNode(s: GameState, nodeId: SeerTrainingNodeId): boolean {
  return isFormalNightwatchSeerStudent(s) && (s.seerTraining?.learnedNodeIds ?? []).includes(nodeId);
}

function oldNeilTeachingIssue(s: GameState, hours: number): string | null {
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
  if (s.atWork) return '工作期间不能参加值夜者内部课程。';
  if (!isFormalNightwatchSeerStudent(s)) return '这套课程只向黑夜教会正式掌握的序列9占卜家开放。';
  if (s.currentLocation?.locationId !== 'blackthorn_security') return '需要先到黑荆棘安保公司参加正式课程。';
  const mentor = findAnyNPC(s, 'old_neil');
  if (!mentor || !npcAvailable(mentor, s.day, s.hour) || !actionFitsWindow(s.hour, hours, 9, 17)) {
    return '老尼尔只在周一至周六9:00–17:00安排能够完整结束的课程。';
  }
  return null;
}

export function getSeerTrainingNodes(s: GameState) {
  return oldNeilTeachingIssue(s, 0) ? [] : SEER_TRAINING_NODES;
}

export function seerTrainingNodeIssue(s: GameState, nodeId: SeerTrainingNodeId): string | null {
  const node = SEER_TRAINING_NODES.find(candidate => candidate.id === nodeId);
  if (!node) return '没有这项正式课程。';
  const teachingIssue = oldNeilTeachingIssue(s, node.hours);
  if (teachingIssue) return teachingIssue;
  if (s.seerTraining.learnedNodeIds.includes(node.id)) return '这项课程已经完成。';
  const missing = node.prerequisites.filter(id => !s.seerTraining.learnedNodeIds.includes(id));
  if (missing.length) return '请先完成前置课程。';
  if (node.requiredItemId && (s.items[node.requiredItemId] ?? 0) <= 0) return `课程需要准备普通工具【${findItem(node.requiredItemId)?.name ?? node.requiredItemId}】。`;
  if (node.requiredPractice === 'meditation' && s.seerTraining.meditationPracticeDays.length === 0) return '请先完成一次有记录的冥想练习。';
  if (node.requiredPractice === 'ritual_safety' && !s.seerTraining.ritualPracticeComplete) return '请先在监督下完成一次结构化仪式安全练习。';
  if (node.requiredPractice === 'spirit_channeling_review' && !s.seerTraining.spiritChannelingCaseIds.includes('elliot_kidnapping')) {
    return '请先在黑荆棘监督下完成一次正式案件记录回溯。';
  }
  if (s.stats.energy < energyCost(s, node.energyCost)) return '你当前太过疲惫，无法完成整段课程。';
  return null;
}

export function learnSeerTrainingNode(s: GameState, nodeId: SeerTrainingNodeId): ActionResult {
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return { ok: false, msg: encounterIssue };
  const issue = seerTrainingNodeIssue(s, nodeId);
  if (issue) return { ok: false, msg: issue };
  const node = SEER_TRAINING_NODES.find(candidate => candidate.id === nodeId)!;
  const startedAt = { day: s.day, hour: s.hour };
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, node.energyCost) }]);
  s.seerTraining.learnedNodeIds.push(node.id);
  s.seerTraining.lessonRecords.push({ nodeId: node.id, day: startedAt.day, hour: startedAt.hour });
  acquaint(s, 'old_neil', 0);
  addLog(s, `老尼尔带你完成【${node.label}】课程，把练习边界写进记录，随后收回教具，要求你先用现有案件验证这些步骤。`, 'good');
  advanceHours(s, node.hours);
  return { ok: true };
}

function seerSafePracticeLocation(s: GameState): boolean {
  return isAtHome(s) || s.currentLocation?.locationId === 'blackthorn_security';
}

export function practiceSeerMeditation(s: GameState): ActionResult {
  const issue = seerMeditationPracticeIssue(s);
  if (issue) return { ok: false, msg: issue };
  const practiceDay = s.day;
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, 6) }]);
  s.seerTraining.meditationPracticeDays.push(practiceDay);
  s.seerTraining.focusPreparation = true;
  addLog(s, '你按记录完成冥想并主动结束。留下的是一次可消费的专注准备，不是永久属性。', 'good');
  advanceHours(s, 1);
  return { ok: true };
}

export function seerMeditationPracticeIssue(s: GameState): string | null {
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return encounterIssue;
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
  if (s.atWork) return '工作期间不能进行冥想练习。';
  if (!hasSeerTrainingNode(s, 'meditation_control')) return '请先完成老尼尔的冥想控制课程。';
  if (!seerSafePracticeLocation(s)) return '这里只适合赶路，不适合建立安全的冥想结束边界。';
  if (s.seerTraining.meditationPracticeDays.includes(s.day)) return '今天已经完成过一次有记录的冥想练习。';
  if (s.seerTraining.focusPreparation) return '上一次冥想形成的专注准备尚未使用。';
  if (s.stats.energy < energyCost(s, 6)) return '你当前太过疲惫，无法维持清晰的结束口令。';
  return null;
}

function consumeSeerFocusPreparation(s: GameState, request: ReturnType<typeof explorationCheckRequest>, receipt: CheckReceipt) {
  if (!request.context.abilityIds.includes('seer_meditation_focus') || !s.seerTraining.focusPreparation) return;
  s.seerTraining.focusPreparation = false;
  receipt.effects.push({ id: 'seer_training:focus_preparation', applied: true, before: true, after: false });
}

export function performSeerRitualSafetyPractice(s: GameState): ActionResult {
  const issue = seerRitualSafetyPracticeIssue(s);
  if (issue) return { ok: false, msg: issue };
  const startedAt = { day: s.day, hour: s.hour };
  const request = explorationCheckRequest(s, 'seer_ritual_safety_practice', startedAt);
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  const passed = internal.outcome === 'passed';
  const hours = passed ? 2 : 1;
  const cost = energyCost(s, passed ? 12 : 5);
  const applied = applyEffects(s, [{ k: 'energy', v: -cost }]);
  const receipt: CheckReceipt = { hoursElapsed: hours, effects: [receiptEntry('energy', applied[0]), hoursReceipt(hours)] };
  if (passed) {
    s.seerTraining.ritualPracticeComplete = true;
    receipt.effects.push({ id: 'seer_training:ritual_practice', applied: true, before: false, after: true });
    addLog(s, '你按顺序完成材料核对、边界封闭、主动终止和现场清理。粉笔线被擦除，器材清点归位，老尼尔在记录上签了字。', 'good');
  } else {
    addLog(s, '老尼尔在边界闭合前叫停练习：退出条件还不够清晰。粉笔线被擦除，现场封存；提升相关经验后可重新练习。', 'info');
  }
  recordCheckAttempt(s, internal, request.context, receipt, startedAt);
  advanceHours(s, hours);
  return { ok: true, outcome: passed ? 'passed' : 'blocked' };
}

export function seerRitualSafetyPracticeIssue(s: GameState): string | null {
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return encounterIssue;
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
  const teachingIssue = oldNeilTeachingIssue(s, 2);
  if (teachingIssue) return teachingIssue;
  if (!hasSeerTrainingNode(s, 'spirituality_wall') || !hasSeerTrainingNode(s, 'ritual_safety')) {
    return '请先完成灵性之墙与仪式安全课程。';
  }
  if (s.seerTraining.ritualPracticeComplete) return '这项结构化安全练习已经完成。';
  const request = explorationCheckRequest(s, 'seer_ritual_safety_practice', { day: s.day, hour: s.hour });
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  if (!internal.eligible) return '练习边界或普通工具尚未准备完整。';
  const repeated = repeatedBlockedExplorationIssue(s, internal);
  if (repeated) return repeated;
  const cost = energyCost(s, internal.outcome === 'passed' ? 12 : 5);
  if (s.stats.energy < cost) return '你当前太过疲惫，无法完成这轮结构化练习。';
  return null;
}

export function performSeerSpiritChannelingReview(s: GameState): ActionResult {
  const issue = seerSpiritChannelingReviewIssue(s);
  if (issue) return { ok: false, msg: issue };
  const startedAt = { day: s.day, hour: s.hour };
  const request = explorationCheckRequest(s, 'seer_spirit_channeling_review', startedAt);
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  const passed = internal.outcome === 'passed';
  const hours = passed ? 2 : 1;
  const cost = energyCost(s, passed ? 10 : 4);
  const applied = applyEffects(s, [{ k: 'energy', v: -cost }]);
  const receipt: CheckReceipt = { hoursElapsed: hours, effects: [receiptEntry('energy', applied[0]), hoursReceipt(hours)] };
  if (passed) {
    s.seerTraining.spiritChannelingCaseIds.push('elliot_kidnapping');
    receipt.effects.push({ id: 'seer_training:case_review', applied: true, before: false, after: true });
    addLog(s, '你只按委托书回溯已知时间线，并在出现无来源的联想前主动结束。老尼尔将越过记录边界的内容逐条划掉。', 'good');
  } else {
    addLog(s, '回溯开始混入无法由案件记录支持的联想，老尼尔立即终止并要求你重新区分事实与猜测。', 'info');
  }
  recordCheckAttempt(s, internal, request.context, receipt, startedAt);
  advanceHours(s, hours);
  return { ok: true, outcome: passed ? 'passed' : 'blocked' };
}

export function seerSpiritChannelingReviewIssue(s: GameState): string | null {
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return encounterIssue;
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
  const teachingIssue = oldNeilTeachingIssue(s, 2);
  if (teachingIssue) return teachingIssue;
  if (!hasSeerTrainingNode(s, 'spirit_channeling')) return '请先完成通灵基础课程。';
  if (s.seerTraining.spiritChannelingCaseIds.includes('elliot_kidnapping')) return '艾略特案件的记录回溯已经完成。';
  if (s.elliotCase.employerId !== 'vickroyer' || !hasClue(s, 'elliot_commission_brief')) return '必须持有来源完整的正式案件记录。';
  const request = explorationCheckRequest(s, 'seer_spirit_channeling_review', { day: s.day, hour: s.hour });
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  if (!internal.eligible) return '正式案件记录或监督条件不完整。';
  const repeated = repeatedBlockedExplorationIssue(s, internal);
  if (repeated) return repeated;
  const cost = energyCost(s, internal.outcome === 'passed' ? 10 : 4);
  if (s.stats.energy < cost) return '你当前太过疲惫，无法保持记录边界。';
  return null;
}

export function performBlankCharmTheoryPractice(s: GameState): ActionResult {
  const issue = blankCharmTheoryPracticeIssue(s);
  if (issue) return { ok: false, msg: issue };
  const startedAt = { day: s.day, hour: s.hour };
  const request = explorationCheckRequest(s, 'seer_blank_charm_structure', startedAt);
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  const passed = internal.outcome === 'passed';
  const hours = passed ? 2 : 1;
  const cost = energyCost(s, passed ? 8 : 3);
  const effects: Effect[] = [{ k: 'energy', v: -cost }, ...(passed ? [{ k: 'item' as const, id: 'blank_charm_paper', v: -1 }] : [])];
  const applied = applyEffects(s, effects);
  const receipt: CheckReceipt = { hoursElapsed: hours, effects: [receiptEntry('energy', applied[0]), hoursReceipt(hours)] };
  if (passed) {
    s.seerTraining.blankCharmPracticeComplete = true;
    receipt.effects.push(receiptEntry('item:blank_charm_paper', applied[1]));
    receipt.effects.push({ id: 'seer_training:blank_charm', applied: true, before: false, after: true });
    addLog(s, '你在空白纸上标出结构、承载区与作废线。老尼尔盖上「作废练习」印记，并让你当场撕毁。', 'good');
  } else {
    addLog(s, '结构线越过了预定承载区，老尼尔要求立刻作废草图。空白载体没有被激活，也没有留下可用成品。', 'info');
  }
  recordCheckAttempt(s, internal, request.context, receipt, startedAt);
  advanceHours(s, hours);
  return { ok: true, outcome: passed ? 'passed' : 'blocked' };
}

export function blankCharmTheoryPracticeIssue(s: GameState): string | null {
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return encounterIssue;
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
  const teachingIssue = oldNeilTeachingIssue(s, 2);
  if (teachingIssue) return teachingIssue;
  if (!hasSeerTrainingNode(s, 'charm_theory')) return '请先完成符咒理论课程。';
  if (s.seerTraining.blankCharmPracticeComplete) return '空白载体结构练习已经完成。';
  const request = explorationCheckRequest(s, 'seer_blank_charm_structure', { day: s.day, hour: s.hour });
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  if (!internal.eligible) return '缺少空白纸质载体或监督条件。';
  const repeated = repeatedBlockedExplorationIssue(s, internal);
  if (repeated) return repeated;
  const cost = energyCost(s, internal.outcome === 'passed' ? 8 : 3);
  if (s.stats.energy < cost) return '你当前太过疲惫，无法完成结构核对。';
  return null;
}

function hasSequence9DivinationClubAccess(s: GameState): boolean {
  return s.pathwayId === 'seer' && s.sequence === 9 && hasSeerDivinationSequence(s);
}

/** v23 旧闭环只用于确认历史结算；不会由此补发新结论或扮演证据。 */
const LEGACY_DIVINATION_CLUB_CHECKS: readonly CheckDef[] = [
  {
    id: 'club_commission_lost_keepsake', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'divination_club:lost_keepsake' }, difficulty: 36,
    requirements: [{ kind: 'clue', id: 'club_lost_keepsake_brief' }, { kind: 'location', id: 'divination_club' }],
    contributions: [
      { kind: 'stat', id: 'mnd', multiplier: 1, publicLabel: '陈述梳理' },
      { kind: 'skill', id: 'investigate', multiplier: 4, publicLabel: '调查经验' },
      { kind: 'clue', id: 'club_lost_keepsake_brief', value: 8, publicLabel: '来访记录' },
      { kind: 'clue', id: 'tingen_city_directory', value: 4, publicLabel: '城区公共目录' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'money', 'digestion', 'club_reputation', 'hours'] },
    },
  },
  {
    id: 'club_commission_journey_omen', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'divination_club:journey_omen' }, difficulty: 34,
    requirements: [{ kind: 'clue', id: 'club_journey_statement' }, { kind: 'ability', id: 'spirit_vision' }, { kind: 'location', id: 'divination_club' }],
    contributions: [
      { kind: 'stat', id: 'spi', multiplier: 1, publicLabel: '灵性直觉' },
      { kind: 'skill', id: 'occult', multiplier: 4, publicLabel: '神秘学经验' },
      { kind: 'clue', id: 'club_journey_statement', value: 8, publicLabel: '预约陈述' },
      { kind: 'ability', id: 'spirit_vision', value: 6, publicLabel: '占卜家训练' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'money', 'digestion', 'club_reputation', 'hours'] },
    },
  },
  ...DIVINATION_CLUB_COMMISSIONS.map(commission => {
    const current = EXPLORATION_CHECKS.find(check => check.id === commission.checkId)!;
    return {
      ...current,
      version: 2,
      contributions: current.contributions.filter(term => term.kind !== 'tool').map(term =>
        term.kind === 'ability' && term.id === 'seer_divination' ? { ...term, value: 4, publicLabel: '占卜家能力' } : term),
    } satisfies CheckDef;
  }),
  (() => {
    const current = EXPLORATION_CHECKS.find(check => check.id === 'elliot_locator_divination')!;
    return {
      ...current,
      version: 2,
      contributions: current.contributions.filter(term => term.kind !== 'tool'
        && !(term.kind === 'ability' && term.id === 'seer_divination')),
    } satisfies CheckDef;
  })(),
];

function nightwatchRoutineCycleKey(day: number, cooldown: 'daily' | 'weekly'): string {
  return cooldown === 'daily' ? `day:${day}` : `week:${Math.floor((day - 1) / 7)}`;
}

export function nightwatchRoutineIssue(s: GameState, actionId: NightwatchRoutineActionId): string | null {
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
  const action = NIGHTWATCH_ROUTINE_ACTIONS.find(candidate => candidate.id === actionId);
  if (!action) return '没有这项值夜者轮值安排。';
  if (s.atWork) return '工作期间不能参加值夜者轮值。';
  if (!isActiveNightwatchSequence9Member(s)) return '只有已完成途径承诺的序列9值夜者成员才能参加轮值。';
  if (s.currentLocation?.locationId !== 'blackthorn_security') return '需要先到黑荆棘安保公司报到。';
  if (!actionFitsWindow(s.hour, action.hours, action.openFrom, action.openTo)) return '当前时段无法完成整段轮值。';
  const cycleKey = nightwatchRoutineCycleKey(s.day, action.cooldown);
  if ((s.nightwatchEarlyLoop?.records ?? []).some(record => record.actionId === actionId && record.cycleKey === cycleKey)) {
    return action.cooldown === 'daily' ? '这项轮值今天已经完成。' : '这项外围轮值本周期已经完成。';
  }
  if (s.stats.energy < energyCost(s, action.energyCost)) return '你当前太过疲惫，无法完成整段轮值。';
  return null;
}

export function performNightwatchRoutine(s: GameState, actionId: NightwatchRoutineActionId): ActionResult {
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return { ok: false, msg: encounterIssue };
  const issue = nightwatchRoutineIssue(s, actionId);
  if (issue) return { ok: false, msg: issue };
  const action = NIGHTWATCH_ROUTINE_ACTIONS.find(candidate => candidate.id === actionId)!;
  const startedDay = s.day;
  const cycleKey = nightwatchRoutineCycleKey(startedDay, action.cooldown);
  const costs = applyEffects(s, [{ k: 'energy', v: -energyCost(s, action.energyCost) }, { k: 'money', v: action.pay }]);
  s.nightwatchEarlyLoop.reputation += action.reputationGain;
  s.nightwatchEarlyLoop.records.push({ actionId, day: startedDay, cycleKey });
  let trainingText = '';
  if (action.trainingSkill && action.trainingPoints) {
    const skill = action.trainingSkill;
    const prior = s.nightwatchEarlyLoop.trainingProgress[skill] ?? 0;
    const total = prior + action.trainingPoints;
    if (total >= 3 && s.skills[skill] < 10) {
      s.skills[skill] += 1;
      s.nightwatchEarlyLoop.trainingProgress[skill] = total - 3;
      trainingText = ` ${SKILL_NAMES[skill]}训练形成了可复核的进步。`;
    } else {
      s.nightwatchEarlyLoop.trainingProgress[skill] = total;
      trainingText = ` ${SKILL_NAMES[skill]}训练进度得到记录。`;
    }
  }
  addLog(s, `你完成了【${action.label}】。${action.pay > 0 ? `轮值报酬${fmtMoney(action.pay)}已入账。` : ''}${trainingText}`, 'good');
  void costs;
  advanceHours(s, action.hours);
  return { ok: true };
}

export function divinationClubJoinIssue(s: GameState): string | null {
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
  if (s.atWork) return '工作期间不能办理俱乐部会员手续。';
  if (s.divinationClub?.joined) return '你已经是占卜俱乐部会员。';
  if (!hasSequence9DivinationClubAccess(s)) return '当前阶段没有可核验的占卜家会员资格。';
  if (s.currentLocation?.locationId !== 'divination_club') return '需要亲自前往占卜俱乐部办理手续。';
  if (!actionFitsWindow(s.hour, 1, 10, 20)) return '俱乐部接待时间为10:00至20:00。';
  if (!s.knowledge.includes('public_divination_etiquette')) return '先向接待员了解会员制度与普通占卜礼仪。';
  if (s.pence < 60) return '会员登记费需要5苏勒。';
  if (s.stats.energy < energyCost(s, 3)) return '你当前太疲惫，无法认真完成会员登记。';
  return null;
}

export function joinDivinationClub(s: GameState): ActionResult {
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return { ok: false, msg: encounterIssue };
  const issue = divinationClubJoinIssue(s);
  if (issue) return { ok: false, msg: issue };
  applyEffects(s, [{ k: 'money', v: -60 }, { k: 'energy', v: -energyCost(s, 3) }]);
  s.divinationClub.joined = true;
  addLog(s, '你完成会员登记。接待员说明：每份咨询都必须先留下事实陈述，报酬和条件按登记表执行。', 'good');
  advanceHours(s, 1);
  return { ok: true };
}

export function getDivinationClubCommissions(s: GameState) {
  if (activeEncounterIssue(s) || !s.divinationClub?.joined || !hasSequence9DivinationClubAccess(s)) return [];
  if (s.divinationClub.activeCommissionId) {
    const active = DIVINATION_CLUB_COMMISSIONS.find(def => def.id === s.divinationClub.activeCommissionId);
    return active ? [active] : [];
  }
  const next = DIVINATION_CLUB_COMMISSIONS.find(def => !s.divinationClub.completedCommissionIds.includes(def.id));
  return next ? [next] : [];
}

export function acceptDivinationClubCommission(s: GameState, commissionId: DivinationClubCommissionId): ActionResult {
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return { ok: false, msg: encounterIssue };
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return { ok: false, msg: criticalIssue };
  const def = DIVINATION_CLUB_COMMISSIONS.find(candidate => candidate.id === commissionId);
  if (!def || !s.divinationClub?.joined || !hasSequence9DivinationClubAccess(s)) return { ok: false, msg: '当前没有这份可承接的俱乐部咨询。' };
  if (s.atWork || s.currentLocation?.locationId !== 'divination_club' || !actionFitsWindow(s.hour, def.acceptHours, 10, 20)) {
    return { ok: false, msg: '需要在俱乐部接待时段亲自承接咨询。' };
  }
  if (s.divinationClub.activeCommissionId) return { ok: false, msg: '请先完成当前咨询。' };
  if (s.divinationClub.completedCommissionIds.includes(def.id)) return { ok: false, msg: '这份固定咨询已经结清。' };
  if (getDivinationClubCommissions(s)[0]?.id !== def.id) return { ok: false, msg: '接待员请你先完成当前开放的那份咨询。' };
  const existingBriefing = s.clues.find(clue => clue.id === def.briefingClueId);
  if (existingBriefing) return { ok: false, msg: '这份来访记录需要先由接待员核对登记状态。' };
  if (s.stats.energy < energyCost(s, def.acceptEnergyCost)) return { ok: false, msg: '你当前太过疲惫，无法认真听取并核对事实陈述。' };
  const startedAt = { day: s.day, hour: s.hour };
  const request = explorationCheckRequest(s, def.acceptCheckId, startedAt);
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  if (!internal.eligible || internal.outcome !== 'passed') return { ok: false, msg: '当前会员资格或接待地点无法完成登记。' };
  const applied = applyEffects(s, [{ k: 'energy', v: -energyCost(s, def.acceptEnergyCost) }]);
  const acquired = acquireClue(s, def.briefingClueId, 'npc', def.clientId);
  const receipt: CheckReceipt = { hoursElapsed: def.acceptHours, effects: [
    receiptEntry('energy', applied[0]),
    { id: `clue:${def.briefingClueId}`, applied: acquired, before: false, after: acquired },
    hoursReceipt(def.acceptHours),
  ] };
  s.divinationClub.activeCommissionId = def.id;
  recordCheckAttempt(s, internal, request.context, receipt, startedAt);
  addLog(s, `${def.clientName}在登记表上签名后，你承接了【${def.label}】并取得事实陈述。`, 'event');
  advanceHours(s, def.acceptHours);
  return { ok: true };
}

function activeDivinationClubCommission(s: GameState) {
  return DIVINATION_CLUB_COMMISSIONS.find(candidate => candidate.id === s.divinationClub?.activeCommissionId);
}

function divinationClubFieldHours(locationId: string): [number, number] {
  return locationId === 'market' ? [8, 20] : [9, 18];
}

export function investigateActiveDivinationClubCommissionIssue(s: GameState): string | null {
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return encounterIssue;
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
  const def = activeDivinationClubCommission(s);
  if (!def || !s.divinationClub.joined || !hasSequence9DivinationClubAccess(s)) return '当前没有可外勤核对的俱乐部咨询。';
  if (s.atWork) return '工作期间不能处理俱乐部外勤。';
  const briefing = s.clues.find(clue => clue.id === def.briefingClueId);
  if (!briefing || briefing.sourceKind !== 'npc' || briefing.sourceId !== def.clientId) return '来访者签名确认的事实陈述尚不完整。';
  if (hasClue(s, def.fieldClueId)) return '这份咨询的外勤记录已经完成，可以返回俱乐部整理结论。';
  if (s.currentLocation?.locationId !== def.fieldLocationId) return `需要前往【${LOCATIONS.find(location => location.id === def.fieldLocationId)?.name ?? def.fieldLocationId}】核对事实。`;
  const startedAt = { day: s.day, hour: s.hour };
  const request = explorationCheckRequest(s, def.fieldCheckId, startedAt);
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  if (!internal.eligible) return '当前地点或来访记录不足以开始核对。';
  const repeated = repeatedBlockedExplorationIssue(s, internal);
  if (repeated) return repeated;
  const hours = internal.outcome === 'passed' ? def.fieldPassHours : def.fieldBlockedHours;
  const [openFrom, openTo] = divinationClubFieldHours(def.fieldLocationId);
  if (!actionFitsWindow(s.hour, hours, openFrom, openTo)) return '当前时段不足以完成这轮公开记录核对。';
  const baseEnergy = internal.outcome === 'passed' ? def.fieldPassEnergyCost : def.fieldBlockedEnergyCost;
  if (s.stats.energy < energyCost(s, baseEnergy)) return '你当前太过疲惫，无法仔细完成现场核对。';
  return null;
}

export function investigateActiveDivinationClubCommission(s: GameState): ActionResult {
  const issue = investigateActiveDivinationClubCommissionIssue(s);
  if (issue) return { ok: false, msg: issue };
  const def = activeDivinationClubCommission(s)!;
  const startedAt = { day: s.day, hour: s.hour };
  const request = explorationCheckRequest(s, def.fieldCheckId, startedAt);
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  const passed = internal.outcome === 'passed';
  const hours = passed ? def.fieldPassHours : def.fieldBlockedHours;
  const baseEnergy = passed ? def.fieldPassEnergyCost : def.fieldBlockedEnergyCost;
  const applied = applyEffects(s, [{ k: 'energy', v: -energyCost(s, baseEnergy) }]);
  const receipt: CheckReceipt = { hoursElapsed: hours, effects: [receiptEntry('energy', applied[0]), hoursReceipt(hours)] };
  if (passed) {
    acquireClue(s, def.fieldClueId, 'location', def.fieldLocationId);
    receipt.effects.push({ id: `clue:${def.fieldClueId}`, applied: true, before: false, after: true });
    addLog(s, `你完成了【${def.fieldActionLabel}】，只把能够复核的事实写入外勤记录。`, 'good');
  } else {
    addLog(s, `这轮外勤没有形成可靠记录。${def.fieldNextStepText}`, 'info');
  }
  recordCheckAttempt(s, internal, request.context, receipt, startedAt);
  advanceHours(s, hours);
  return { ok: true, outcome: passed ? 'passed' : 'blocked' };
}

function recordDivinationClubActingEvidence(s: GameState, commissionId: DivinationClubCommissionId): boolean {
  const def = DIVINATION_CLUB_COMMISSIONS.find(candidate => candidate.id === commissionId);
  if (!def || s.pathwayId !== 'seer' || s.sequence !== 9) return false;
  const progress = ensureSequence8Progress(s);
  if (!progress) return false;
  const contextKey = `divination_club:${def.id}`;
  for (const records of Object.values(progress.evidence)) {
    for (let index = records.length - 1; index >= 0; index -= 1) {
      if (records[index].contextKey === contextKey) records.splice(index, 1);
    }
  }
  progress.evidence[def.actingPrincipleId] ??= [];
  progress.evidence[def.actingPrincipleId].push({
    actionId: `club_commission:${def.id}`, principleId: def.actingPrincipleId, contextKey, day: s.day,
  });
  updateReviewReady(s, progress);
  return true;
}

export function resolveDivinationClubCommission(s: GameState): ActionResult {
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return { ok: false, msg: encounterIssue };
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return { ok: false, msg: criticalIssue };
  const def = activeDivinationClubCommission(s);
  if (!def || !s.divinationClub.joined || !hasSequence9DivinationClubAccess(s)) return { ok: false, msg: '当前没有可处理的俱乐部咨询。' };
  if (s.atWork || s.currentLocation?.locationId !== 'divination_club') return { ok: false, msg: '需要在占卜俱乐部处理这份咨询。' };
  if (!hasClue(s, def.fieldClueId)) return { ok: false, msg: `需要先完成【${def.fieldActionLabel}】，再带着外勤记录返回俱乐部。` };
  if (hasClue(s, def.outcomeClueId)) return { ok: false, msg: '这份咨询的结论记录需要先由俱乐部复核。' };
  if (!actionFitsWindow(s.hour, Math.max(def.passHours, def.blockedHours), 10, 20)) return { ok: false, msg: '当前时段不足以完成一轮俱乐部咨询。' };
  const startedAt = { day: s.day, hour: s.hour };
  const request = explorationCheckRequest(s, def.checkId, startedAt);
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  if (!internal.eligible) return { ok: false, msg: '来访记录或处理条件仍不完整。' };
  const repeated = repeatedBlockedExplorationIssue(s, internal);
  if (repeated) return { ok: false, msg: repeated };
  const baseEnergy = internal.outcome === 'passed' ? def.passEnergyCost : def.blockedEnergyCost;
  if (s.stats.energy < energyCost(s, baseEnergy)) return { ok: false, msg: '你当前太过疲惫，无法完成这轮咨询。' };
  if (internal.outcome === 'blocked') {
    const applied = applyEffects(s, [{ k: 'energy', v: -energyCost(s, def.blockedEnergyCost) }]);
    const receipt: CheckReceipt = { hoursElapsed: def.blockedHours, effects: [receiptEntry('energy', applied[0]), hoursReceipt(def.blockedHours)] };
    const usedFocus = request.context.abilityIds.includes('seer_meditation_focus') && s.seerTraining.focusPreparation;
    if (usedFocus) s.seerTraining.focusPreparation = false;
    receipt.effects.push({ id: 'seer_training:focus_preparation', applied: usedFocus, before: usedFocus, after: false });
    recordCheckAttempt(s, internal, request.context, receipt, startedAt);
    addLog(s, `这轮咨询没有形成可靠结论。${def.nextStepText}`, 'info');
    advanceHours(s, def.blockedHours);
    return { ok: true, outcome: 'blocked' };
  }
  const applied = applyEffects(s, [
    { k: 'energy', v: -energyCost(s, def.passEnergyCost) }, { k: 'money', v: def.reward }, { k: 'digestion', v: def.digestionGain },
  ]);
  const beforeReputation = s.divinationClub.reputation;
  s.divinationClub.reputation += def.reputationGain;
  acquireClue(s, def.outcomeClueId, 'npc', def.clientId);
  const actingRecorded = recordDivinationClubActingEvidence(s, def.id);
  s.divinationClub.completedCommissionIds.push(def.id);
  s.divinationClub.activeCommissionId = null;
  const usedFocus = request.context.abilityIds.includes('seer_meditation_focus') && s.seerTraining.focusPreparation;
  if (usedFocus) s.seerTraining.focusPreparation = false;
  const receipt: CheckReceipt = { hoursElapsed: def.passHours, effects: [
    receiptEntry('energy', applied[0]), receiptEntry('money', applied[1]), receiptEntry('digestion', applied[2]),
    { id: 'club_reputation', applied: true, before: beforeReputation, after: s.divinationClub.reputation, actualDelta: def.reputationGain },
    hoursReceipt(def.passHours),
    { id: `clue:${def.outcomeClueId}`, applied: true, before: false, after: true },
    { id: `acting:club:${def.id}`, applied: actingRecorded, before: false, after: actingRecorded },
    { id: 'seer_training:focus_preparation', applied: usedFocus, before: usedFocus, after: false },
  ] };
  recordCheckAttempt(s, internal, request.context, receipt, startedAt);
  addLog(s, `${def.narrationVariants[(s.divinationClub.completedCommissionIds.length - 1) % def.narrationVariants.length]} 委托按登记金额结清；这次克制而可核验的处理让魔药反馈变得更顺畅。`, 'good');
  advanceHours(s, def.passHours);
  return { ok: true, outcome: 'passed' };
}

function elliotCaseMemberIssue(s: GameState): string | null {
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
  if (!isActiveNightwatchSequence9Member(s)) return '这是一项正式外勤，只向已完成途径承诺的序列9值夜者成员开放。';
  if (s.atWork) return '工作期间不能处理值夜者外勤。';
  return null;
}

export function acceptElliotCommission(s: GameState): ActionResult {
  const memberIssue = elliotCaseMemberIssue(s);
  if (memberIssue) return { ok: false, msg: memberIssue };
  if (s.elliotCase.stage !== 'unknown') return { ok: false, msg: '艾略特案件已经登记，不能重复接案。' };
  if (s.currentLocation?.locationId !== 'blackthorn_security' || !actionFitsWindow(s.hour, 1, 9, 17)) {
    return { ok: false, msg: '需要在白天到黑荆棘安保公司与委托人当面登记。' };
  }
  const startedDay = s.day;
  acquaint(s, 'vickroyer', 0);
  acquaint(s, 'leonard', 0);
  acquireClue(s, 'elliot_commission_brief', 'npc', 'vickroyer');
  acquireClue(s, 'elliot_worn_coat', 'npc', 'vickroyer');
  acquireClue(s, 'elliot_partner_assignment', 'npc', 'leonard');
  s.elliotCase = { stage: 'commissioned', employerId: 'vickroyer', assignedPartnerId: 'leonard', locatorMode: null, rewardClaimed: false };
  addLog(s, '维克罗尔先生签署寻子委托，并当面交来艾略特穿过的旧外套。伦纳德被安排为同行队员；此时没有任何报酬入账。', 'event');
  advanceHours(s, 1);
  void startedDay;
  return { ok: true };
}

export function locateElliot(s: GameState, mode: ElliotLocatorMode): ActionResult {
  const memberIssue = elliotCaseMemberIssue(s);
  if (memberIssue) return { ok: false, msg: memberIssue };
  if (s.elliotCase.stage !== 'commissioned' || s.elliotCase.employerId !== 'vickroyer') return { ok: false, msg: '缺少由委托人登记的艾略特失踪案件。' };
  if (s.currentLocation?.locationId !== 'blackthorn_security') return { ok: false, msg: '需要先回黑荆棘安保公司使用委托材料。' };
  if (mode === 'divination' && !hasSeerDivinationSequence(s)) return { ok: false, msg: '你没有受过可核验的寻人占卜训练；可以改查公开记录。' };
  const checkId = mode === 'divination' ? 'elliot_locator_divination' : 'elliot_locator_records';
  const startedAt = { day: s.day, hour: s.hour };
  const request = explorationCheckRequest(s, checkId, startedAt);
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  if (!internal.eligible) return { ok: false, msg: '委托材料或处理条件仍不完整。' };
  const repeated = repeatedBlockedExplorationIssue(s, internal);
  if (repeated) return { ok: false, msg: repeated };
  const passed = internal.outcome === 'passed';
  const hours = passed ? 2 : 1;
  if (s.stats.energy < energyCost(s, passed ? 10 : 5)) return { ok: false, msg: '你当前太过疲惫，无法完成这轮寻人工作。' };
  const applied = applyEffects(s, [{ k: 'energy', v: -energyCost(s, passed ? 10 : 5) }]);
  const receipt: CheckReceipt = { hoursElapsed: hours, effects: [receiptEntry('energy', applied[0]), hoursReceipt(hours)] };
  if (passed) {
    acquireClue(s, 'elliot_hideout_address', 'event', `elliot_locator:${mode}`);
    if (!s.visitedLocations.includes('forston_hideout')) s.visitedLocations.push('forston_hideout');
    s.elliotCase.stage = 'location_known';
    s.elliotCase.locatorMode = mode;
    receipt.effects.push({ id: 'clue:elliot_hideout_address', applied: true });
    addLog(s, '两条街名和一处门牌能够相互核对：目标在弗尔斯顿路一栋旧宅。地址已经解锁，但屋内情况仍未知。', 'good');
  } else {
    addLog(s, mode === 'divination'
      ? '指向在街区边缘散开，尚不能据此出发。可以补强神秘学训练，或改用公开记录调查。'
      : '账目与车行记录还没有形成唯一地址。可以提升调查经验，或由受训占卜家使用失踪者旧外套。', 'info');
  }
  consumeSeerFocusPreparation(s, request, receipt);
  recordCheckAttempt(s, internal, request.context, receipt, startedAt);
  advanceHours(s, hours);
  return { ok: true, outcome: passed ? 'passed' : 'blocked' };
}

export function confirmElliotPresence(s: GameState, mode: 'spirit_vision' | 'investigation'): ActionResult {
  const memberIssue = elliotCaseMemberIssue(s);
  if (memberIssue) return { ok: false, msg: memberIssue };
  if (s.elliotCase.stage !== 'location_known') return { ok: false, msg: '还没有取得可核验的藏身处地址。' };
  if (s.currentLocation?.locationId !== 'forston_hideout') return { ok: false, msg: '需要先前往已经确认的弗尔斯顿路旧宅。' };
  if (mode === 'spirit_vision' && !hasSpiritVisionAbility(s)) return { ok: false, msg: '你没有可靠的灵视能力；可以改为观察门窗、脚印和送餐痕迹。' };
  const checkId = mode === 'spirit_vision' ? 'elliot_confirm_spirit_vision' : 'elliot_confirm_investigation';
  const startedAt = { day: s.day, hour: s.hour };
  const request = explorationCheckRequest(s, checkId, startedAt);
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  if (!internal.eligible) return { ok: false, msg: '现场确认条件不足。' };
  const repeated = repeatedBlockedExplorationIssue(s, internal);
  if (repeated) return { ok: false, msg: repeated };
  const passed = internal.outcome === 'passed';
  if (s.stats.energy < energyCost(s, passed ? 8 : 4)) return { ok: false, msg: '你当前太过疲惫，无法继续确认屋内情况。' };
  const applied = applyEffects(s, [{ k: 'energy', v: -energyCost(s, passed ? 8 : 4) }]);
  const receipt: CheckReceipt = { hoursElapsed: 1, effects: [receiptEntry('energy', applied[0]), hoursReceipt(1)] };
  if (passed) {
    acquireClue(s, 'elliot_presence_confirmed', 'location', 'forston_hideout');
    s.elliotCase.stage = 'presence_confirmed';
    receipt.effects.push({ id: 'clue:elliot_presence_confirmed', applied: true });
    addLog(s, '你确认艾略特仍在屋内，也确认了守门人的换位空档。现在可以按同行方案营救，或先撤退申请增援。', 'good');
  } else {
    addLog(s, '你只能确认屋内有人活动，无法排除诱饵。案件不会关闭；补充相关经验后可以再次确认。', 'info');
  }
  consumeSeerFocusPreparation(s, request, receipt);
  recordCheckAttempt(s, internal, request.context, receipt, startedAt);
  advanceHours(s, 1);
  return { ok: true, outcome: passed ? 'passed' : 'blocked' };
}

export function requestElliotBackup(s: GameState): ActionResult {
  const memberIssue = elliotCaseMemberIssue(s);
  if (memberIssue) return { ok: false, msg: memberIssue };
  if (s.elliotCase.stage !== 'presence_confirmed' || s.currentLocation?.locationId !== 'forston_hideout') {
    return { ok: false, msg: '只有确认人质仍在屋内后，才能按撤退口令申请增援。' };
  }
  if (s.stats.energy < energyCost(s, 6)) return { ok: false, msg: '你太疲惫，无法安全撤回并完成增援说明。' };
  const returnHours = s.currentLocation.returnHours;
  s.currentLocation = null;
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, 6) }]);
  acquireClue(s, 'elliot_backup_ready', 'npc', 'leonard');
  s.elliotCase.stage = 'backup_ready';
  addLog(s, '你没有贸然闯入，而是按口令撤回并向伦纳德复述门窗、人数和退路。增援方案已经就绪。', 'good');
  advanceHours(s, returnHours + 1);
  return { ok: true };
}

export function rescueElliotWithTeam(s: GameState): ActionResult {
  const memberIssue = elliotCaseMemberIssue(s);
  if (memberIssue) return { ok: false, msg: memberIssue };
  if (!['presence_confirmed', 'backup_ready'].includes(s.elliotCase.stage)) return { ok: false, msg: '必须先确认艾略特仍在屋内。' };
  if (s.elliotCase.assignedPartnerId !== 'leonard' || !hasClue(s, 'elliot_partner_assignment')) return { ok: false, msg: '没有经过登记的同行队员，不能单独发起营救。' };
  if (s.currentLocation?.locationId !== 'forston_hideout') return { ok: false, msg: '需要与队员一同回到目标旧宅。' };
  const startedAt = { day: s.day, hour: s.hour };
  const request = explorationCheckRequest(s, 'elliot_team_rescue', startedAt);
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  if (!internal.eligible) return { ok: false, msg: '营救所需的现场确认或同行安排不完整。' };
  const repeated = repeatedBlockedExplorationIssue(s, internal);
  if (repeated) return { ok: false, msg: repeated };
  const passed = internal.outcome === 'passed';
  const hours = passed ? 2 : 1;
  if (s.stats.energy < energyCost(s, passed ? 18 : 8)) return { ok: false, msg: '你当前太过疲惫，无法与队友执行完整营救方案。' };
  const applied = applyEffects(s, [{ k: 'energy', v: -energyCost(s, passed ? 18 : 8) }]);
  const receipt: CheckReceipt = { hoursElapsed: hours, effects: [receiptEntry('energy', applied[0]), hoursReceipt(hours)] };
  if (passed) {
    acquireClue(s, 'elliot_rescue_record', 'location', 'forston_hideout');
    s.elliotCase.stage = 'rescued';
    receipt.effects.push({ id: 'clue:elliot_rescue_record', applied: true });
    addLog(s, '你与伦纳德按分工控制门口并带出艾略特。报酬尚未领取，必须回到委托人与组织处结案。', 'good');
  } else {
    addLog(s, '守门人的位置迫使你们中止推进。艾略特尚未被转移；可以撤退申请增援，或在相关训练改善后重试。', 'info');
  }
  recordCheckAttempt(s, internal, request.context, receipt, startedAt);
  advanceHours(s, hours);
  return { ok: true, outcome: passed ? 'passed' : 'blocked' };
}

export function settleElliotCase(s: GameState): ActionResult {
  const memberIssue = elliotCaseMemberIssue(s);
  if (memberIssue) return { ok: false, msg: memberIssue };
  if (s.elliotCase.stage !== 'rescued' || !hasClue(s, 'elliot_rescue_record')) return { ok: false, msg: '案件尚未形成可结案的营救记录。' };
  if (s.elliotCase.rewardClaimed) return { ok: false, msg: '维克罗尔先生已经结清这份委托。' };
  if (s.elliotCase.employerId !== 'vickroyer' || !isMet(s, 'vickroyer')) return { ok: false, msg: '找不到这份委托的登记雇主。' };
  if (s.currentLocation?.locationId !== 'blackthorn_security' || !actionFitsWindow(s.hour, 1, 9, 17)) {
    return { ok: false, msg: '需要在白天回黑荆棘安保公司，由委托人与组织共同结案。' };
  }
  applyEffects(s, [{ k: 'money', v: 2400 }]);
  s.nightwatchEarlyLoop.reputation += 3;
  s.elliotCase.rewardClaimed = true;
  s.elliotCase.stage = 'closed';
  addLog(s, '维克罗尔先生确认儿子平安后，按签名委托书一次性支付10镑；黑荆棘同时记录了你的外勤表现。', 'good');
  advanceHours(s, 1);
  return { ok: true };
}

function trustedNpcIssue(s: GameState, npcId: string, minFavor = VISIT_FAVOR): string | null {
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
  const npc = findAnyNPC(s, npcId);
  if (!npc) return '找不到负责这条线索的人。';
  if (!isMet(s, npcId)) return `你还没有与${npc.name}正式结识。`;
  if ((s.relations[npcId] ?? -100) < minFavor) return `${npc.name}还没有信任你到愿意谈及敏感背景的程度。`;
  if (!npcAvailable(npc, s.day, s.hour)) return `${npc.name}此刻不在可交谈的地点；请按其作息另约时间。`;
  return null;
}

export function npcVisitSessionIssue(s: GameState, npcId: string): string | null {
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
  const npc = findAnyNPC(s, npcId);
  if (!npc) return '找不到负责这次会面的联系人。';
  if (!isMet(s, npcId)) return `你还没有与${npc.name}正式结识。`;
  if ((s.relations[npcId] ?? -100) < VISIT_FAVOR) return `${npc.name}还没有信任你到愿意受理这类请求。`;
  const session = s.npcVisitSession;
  if (!session || session.npcId !== npcId || session.day !== s.day || session.hour !== s.hour) {
    return '需要先与对方当面完成一次拜访交谈，再在这次会面中提出请求。';
  }
  const startedAbsoluteHour = (session.startedDay - 1) * 24 + session.startedHour;
  const completedAbsoluteHour = (session.day - 1) * 24 + session.hour;
  if (!Number.isInteger(session.startedDay) || session.startedDay < 1
    || !Number.isInteger(session.startedHour) || session.startedHour < 0 || session.startedHour > 23
    || startedAbsoluteHour + 1 !== completedAbsoluteHour
    || !npcAvailable(npc, session.startedDay, session.startedHour)) {
    return '这次会面没有可核验的当面拜访记录。';
  }
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
  acquireClue(s, 'abraham_door_map', 'location', 'manor');
  lead.notes.push(`在${def.place}完成实地调查后发现：${def.publicLabel}`);
  recordOrganizationRoute(s, orgId, `world_entry:${def.id}`, 'passed', locationId);
  if (orgId === 'abraham_branch' && !s.formulas.includes('apprentice9')) {
    s.formulas.push('apprentice9');
    pathwayLead(s, 'apprentice').formulaStatus = 'unverified';
    lead.notes.push('门框夹层中另有一份完整但未经鉴定的学徒配方抄本');
  }
  addLog(s, `✦ 实地调查记录：你发现了【${def.publicLabel}】。目前只能确认它值得辨认，尚不知道背后牵涉何方。`, 'event');
}

// ============ 初始状态（普通人开局，出身+天赋+开局事件+随机城市人口） ============
export function newGame(name: string, originId: string, talents: string[], requestedOpening: OpeningScenarioId = 'ordinary_morning'): GameState {
  const origin = ORIGINS.find(o => o.id === originId) ?? ORIGINS[0];
  const openingScenarioId = OPENING_SCENARIOS.some(opening => opening.id === requestedOpening)
    ? requestedOpening : 'ordinary_morning';
  const genNpcs: GenNPC[] = [];
  for (let i = 0; i < 8; i++) genNpcs.push(generateNPC());
  const s: GameState = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    started: true,
    playerName: name || '无名者',
    originId: origin.id,
    openingScenarioId,
    strangeNotebook: {
      status: openingScenarioId === 'strange_notebook' ? 'held' : 'absent',
      influenceStage: 0, acquiredAbsoluteHour: 7,
      nextManifestationAbsoluteHour: openingScenarioId === 'strange_notebook' ? 19 : Number.MAX_SAFE_INTEGER,
      odditiesRecorded: false,
    },
    talents,
    pathwayId: null,
    sequence: null,
    day: 1,
    hour: 7,
    stats: { phy: 20, spi: 10, mnd: 20, cha: 20, san: 85, cor: 0, energy: 90 },
    combatVitals: { hp: 1, spirit: 1 },
    combatLoadout: { weaponId: null, armorId: null, focusId: null },
    pence: origin.pence,
    digestion: 0,
    exposure: 0,
    formulas: [],
    canReadRoselleScript: true,
    leads: createStructuredLeads(),
    organizationRoutes: createOrganizationRoutes(),
    nightwatchEarlyLoop: createNightwatchEarlyLoopState(),
    divinationClub: createDivinationClubState(),
    elliotCase: createElliotCaseState(),
    seerTraining: createSeerTrainingState(),
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
    deepInvestigations: {},
    investigationWorkspaces: {},
    caseThreats: {},
    pendingEncounter: null,
    explorationAttempts: [],
    checkAttempts: [],
    divinationTraining: { cards: false, dream: false, media: [], teachers: [] },
    divinationCredentials: [],
    divinationInsights: [],
    divinationAttempts: [],
    books: createBooks(),
    languages: { ruen: 'fluent', old_feysac: 'none' },
    awareness: 'ordinary',
    pathwayLeads: createPathwayLeads(),
    items: { ...(origin.items ?? {}), ...(openingScenarioId === 'strange_notebook' ? { antigonus_notebook: 1 } : {}) },
    itemKnowledge: {},
    sequence9Preparations: [],
    tradeFair: createTradeFairState(),
    confirmedBeyonderDeaths: [],
    activeHunt: null,
    murderRecords: [],
    infamy: 0,
    lawAttention: 0,
    areaSuspicionRecords: [],
    identityTraceDiscoveries: [],
    identityTraceResolutions: [],
    identityCover: null,
    areaSuspicion: {},
    wantedAreas: [],
    intel: [...(origin.intel ?? [])],
    knowledge: [...(origin.knowledge ?? [])],
    studyProgress: 0,
    jobId: origin.initialJobId ?? null,
    atWork: false,
    skills: { investigate: 0, combat: 0, speech: 0, occult: 0, sneak: 0 },
    nemesis: null,
    relations: {},
    npcVisitSession: null,
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
  const initialCombat = getCombatProfile(s);
  s.combatVitals = { hp: initialCombat.maxHp, spirit: initialCombat.maxSpirit };

  addLog(s, `第1天清晨，你在东区的阁楼里睁开眼。【${origin.name}】——${origin.desc}`, 'system');
  if (openingScenarioId === 'strange_notebook') {
    addLog(s, '你面前的桌上放着一本奇怪的笔记。你不记得自己何时把它带回了家。', 'event');
  }
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
export interface ConditionValidationResult { valid: boolean; diagnostics: string[] }
type ParsedCondition = string[][]; // OR 分组，每组内部为 AND；即 & 优先于 |
const CONDITION_ID = /^[A-Za-z0-9_-]+$/;
const CONDITION_STATS = new Set(['phy', 'spi', 'mnd', 'cha', 'san', 'cor', 'energy']);
const ENGINE_FLAG_IDS = new Set(['audit_now', 'rent_due']);

function effectIds(kind: Effect['k']): Set<string> {
  const ids = new Set<string>();
  const collect = (effects: readonly Effect[]) => effects.forEach(effect => {
    if (effect.k === kind && effect.id) ids.add(effect.id);
    if (effect.timerEffect) collect(effect.timerEffect);
  });
  EVENTS.forEach(event => event.choices.forEach(choice => collect(choice.effects)));
  RANDOM_TEXT_EVENTS.forEach(event => event.choices.forEach(choice => collect(choice.effects)));
  return ids;
}

function knownConditionId(prefix: string, id: string, s?: GameState): boolean {
  if (!CONDITION_ID.test(id)) return false;
  switch (prefix) {
    case 'intel': return id in INTEL_NAMES;
    case 'clue': return CLUE_DEFS.some(def => def.id === id);
    case 'item': return !!findItem(id);
    case 'knowledge': return id in KNOWLEDGE_NAMES;
    case 'tag': return ORIGINS.some(origin => origin.tags?.includes(id)) || effectIds('tag').has(id);
    case 'flag': return ENGINE_FLAG_IDS.has(id) || effectIds('flag').has(id);
    case 'formula': return PATHWAYS.some(pathway => id === `${pathway.id}9` || id === `${pathway.id}8`);
    case 'favor': return NPCS.some(npc => npc.id === id)
      || TINGEN_LANDMARK_ENCOUNTERS.some(encounter => encounter.npc.id === id)
      || !!s?.genNpcs.some(npc => npc.id === id);
    case 'skill': return id in SKILL_NAMES;
    default: return false;
  }
}

function conditionAtomDiagnostic(atom: string, s?: GameState): string | null {
  if (!atom) return '存在空条件子句';
  if (atom === 'mortal' || atom === 'beyonder') return null;
  const prefixed = atom.match(/^(not-item|not-knowledge|intel|clue|item|knowledge|tag|flag|formula):(.+)$/);
  if (prefixed) {
    const [, rawPrefix, id] = prefixed;
    const prefix = rawPrefix.startsWith('not-') ? rawPrefix.slice(4) : rawPrefix;
    return knownConditionId(prefix, id, s) ? null : `未知或非法的 ${rawPrefix} 条件目标`;
  }
  const comparison = atom.match(/^([A-Za-z_][A-Za-z0-9_]*)(?::([A-Za-z0-9_-]+))?\s*(>=|<=|>|<|==)\s*(-?\d+)$/);
  if (!comparison) return '无法识别的条件原子';
  const [, key, sub] = comparison;
  if (key === 'money' || key === 'digestion' || key === 'exposure' || CONDITION_STATS.has(key)) {
    return sub ? `${key} 不接受子键` : null;
  }
  if (key === 'favor' || key === 'skill') {
    return sub && knownConditionId(key, sub, s) ? null : `${key} 缺少或使用了未知子键`;
  }
  return `未知比较键 ${key}`;
}

function parseConditionExpression(cond: string, s?: GameState): { parsed: ParsedCondition | null; diagnostics: string[] } {
  const diagnostics: string[] = [];
  if (!cond.trim()) return { parsed: null, diagnostics: ['条件表达式为空'] };
  if (/[()!]/.test(cond)) return { parsed: null, diagnostics: ['条件表达式含有不支持的符号'] };
  const orGroups = cond.split('|');
  const parsed = orGroups.map((group, groupIndex) => group.split('&').map((raw, atomIndex) => {
    const atom = raw.trim();
    const issue = conditionAtomDiagnostic(atom, s);
    if (issue) diagnostics.push(`第${groupIndex + 1}组第${atomIndex + 1}项：${issue}`);
    return atom;
  }));
  return { parsed: diagnostics.length ? null : parsed, diagnostics };
}

/** 开发侧语法审计；不会把内部表达式或诊断暴露给玩家。 */
export function validateConditionExpression(cond?: string): ConditionValidationResult {
  if (cond === undefined) return { valid: true, diagnostics: [] };
  try {
    const result = parseConditionExpression(cond);
    return { valid: result.parsed !== null, diagnostics: result.diagnostics };
  } catch {
    return { valid: false, diagnostics: ['条件解析失败'] };
  }
}

function evaluateConditionAtom(s: GameState, atom: string): boolean {
  if (atom === 'mortal') return !isBeyonder(s);
  if (atom === 'beyonder') return isBeyonder(s);
  const prefixed = atom.match(/^(not-item|not-knowledge|intel|clue|item|knowledge|tag|flag|formula):(.+)$/)!;
  if (prefixed) {
    const [, prefix, id] = prefixed;
    switch (prefix) {
      case 'intel': return s.intel.includes(id);
      case 'clue': return hasClue(s, id);
      case 'item': return (s.items[id] ?? 0) > 0;
      case 'not-item': return (s.items[id] ?? 0) <= 0;
      case 'knowledge': return s.knowledge.includes(id);
      case 'not-knowledge': return !s.knowledge.includes(id);
      case 'tag': return s.tags.includes(id);
      case 'flag': {
        const value = s.flags[id];
        return value === true || (typeof value === 'number' && value > 0);
      }
      case 'formula': return s.formulas.includes(id);
    }
  }
  const comparison = atom.match(/^([A-Za-z_][A-Za-z0-9_]*)(?::([A-Za-z0-9_-]+))?\s*(>=|<=|>|<|==)\s*(-?\d+)$/)!;
  const [, key, sub, op, raw] = comparison;
  const target = Number(raw);
  let value: number;
  if (key === 'money') value = s.pence;
  else if (key === 'digestion') value = s.digestion;
  else if (key === 'exposure') value = s.exposure;
  else if (key === 'favor') value = s.relations[sub] ?? 0;
  else if (key === 'skill') value = s.skills[sub as SkillKey] ?? 0;
  else value = s.stats[key as keyof typeof s.stats];
  switch (op) {
    case '>=': return value >= target;
    case '<=': return value <= target;
    case '>': return value > target;
    case '<': return value < target;
    case '==': return value === target;
    default: return false;
  }
}

export function checkCond(s: GameState, cond?: string): boolean {
  if (cond === undefined) return true;
  try {
    const { parsed } = parseConditionExpression(cond, s);
    return parsed ? parsed.some(andGroup => andGroup.every(atom => evaluateConditionAtom(s, atom))) : false;
  } catch {
    return false;
  }
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
        }
        break;
      case 'beyonder_death':
        if (e.id) receipt.applied = extractCharacteristicFromConfirmedDeath(s, e.id);
        break;
      case 'gameover': break;
    }
    receipts.push(receipt);
  }
  if (s.combatVitals) clampCombatVitals(s);
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
    return hasTradeFairInvitation(s) || (!!route && ['contacted', 'qualified', 'member', 'offer_pending', 'committed'].includes(route.status));
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
  return s.timers.filter(timer => isTimerVisible(s, timer.id)).map(timer => {
    if (timer.id !== 'market' || !hasTradeFairInvitation(s)) return timer;
    let hoursLeft = 0;
    const victor = NPCS.find(npc => npc.id === 'victor');
    if (victor && npcLocation(victor, s.day, s.hour) === '黑市后巷') return { ...timer, label: '秘密交易会正在营业', hoursLeft: 0 };
    while (hoursLeft <= 7 * 24) {
      const absolute = s.hour + hoursLeft;
      const day = s.day + Math.floor(absolute / 24);
      const hour = absolute % 24;
      if ([3, 6].includes(weekdayOf(day)) && hour === 22) break;
      hoursLeft++;
    }
    return { ...timer, label: '秘密交易会开场', hoursLeft };
  });
}

const STRANGE_NOTEBOOK_ITEM_ID = 'antigonus_notebook';

function progressStrangeNotebook(s: GameState) {
  const notebook = s.strangeNotebook;
  if (!notebook || s.openingScenarioId !== 'strange_notebook' || notebook.status === 'absent' || notebook.status === 'surrendered') return;
  const now = absoluteHour(s);
  if (notebook.status === 'missing') {
    if (notebook.returnAbsoluteHour === undefined || now < notebook.returnAbsoluteHour) return;
    notebook.status = 'held';
    delete notebook.returnAbsoluteHour;
    s.items[STRANGE_NOTEBOOK_ITEM_ID] = Math.max(1, s.items[STRANGE_NOTEBOOK_ITEM_ID] ?? 0);
    addLog(s, '你回到阁楼时，那本黑色笔记又端端正正地放在桌上。你无法回忆自己是否曾把门打开。', 'bad');
    notebook.nextManifestationAbsoluteHour = Math.min(notebook.nextManifestationAbsoluteHour, now + 8);
    return;
  }
  if ((s.items[STRANGE_NOTEBOOK_ITEM_ID] ?? 0) <= 0 || now < notebook.nextManifestationAbsoluteHour) return;

  if (notebook.influenceStage === 0) {
    notebook.influenceStage = 1;
    notebook.nextManifestationAbsoluteHour = now + 18;
    addLog(s, '你发现笔记有三页被自己折过角，可你完全不记得翻过它。昨夜记住的一段家族史，今天却从纸上消失了。', 'event');
    return;
  }
  if (notebook.influenceStage === 1) {
    notebook.influenceStage = 2;
    notebook.nextManifestationAbsoluteHour = now + 24;
    applyEffects(s, [{ k: 'san', v: -4 }, { k: 'cor', v: 1 }]);
    addLog(s, '你从雾中山峰的梦里惊醒，手边多了一张路线草图。墨迹是你的，起笔处却不是你熟悉的街道。', 'bad');
    return;
  }
  if (notebook.influenceStage === 2) {
    notebook.influenceStage = 3;
    notebook.nextManifestationAbsoluteHour = now + 24;
    applyEffects(s, [{ k: 'san', v: -6 }, { k: 'cor', v: 3 }]);
    addLog(s, '你在街口回过神，怀里抱着那本笔记，已经走完一段没有记忆的路。再拖下去，你可能连“这是自己的决定”都无法判断。', 'bad');
    return;
  }
  notebook.influenceStage = 4;
  s.gameOver = {
    title: '被改写的去向',
    text: '下一段记忆断裂后，你没有再回到阁楼。桌上的账单和未吃完的面包都还在，只有那本黑色笔记与你一同消失在廷根的雾里。',
  };
}

export function strangeNotebookActionIssue(s: GameState, action: 'examine' | 'record' | 'discard' | 'surrender'): string | null {
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
  const notebook = s.strangeNotebook;
  if (!notebook || notebook.status !== 'held' || (s.items[STRANGE_NOTEBOOK_ITEM_ID] ?? 0) <= 0) return '那本笔记现在不在你手中。';
  if (action === 'surrender') {
    const locationId = s.currentLocation?.locationId;
    if (locationId !== 'st_selena_church' && locationId !== 'blackthorn_security') return '需要亲自前往圣赛琳娜教堂或黑荆棘安保公司。';
    if (notebook.influenceStage < 1 && !hasClue(s, 'strange_notebook_inconsistency')) return '你还无法向接待人员说明哪里异常；先把能复核的矛盾记录下来。';
    return null;
  }
  if (!isAtHome(s)) return '需要先回到住处处理这本笔记。';
  if (action === 'record' && notebook.influenceStage < 1) return '目前还没有足以逐项记录的矛盾。';
  if (action === 'record' && notebook.odditiesRecorded) return '页码、墨迹和记忆缺口已经记录过了。';
  if (s.stats.energy < energyCost(s, action === 'examine' ? 8 : 5) + 2) return '你现在太疲惫，无法保持清醒地处理它。';
  return null;
}

export function examineStrangeNotebook(s: GameState): ActionResult {
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return { ok: false, msg: encounterIssue };
  const issue = strangeNotebookActionIssue(s, 'examine');
  if (issue) return { ok: false, msg: issue };
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, 8) }, { k: 'san', v: -2 }]);
  advanceHours(s, 1);
  if (!s.gameOver) {
    s.strangeNotebook.nextManifestationAbsoluteHour = Math.min(s.strangeNotebook.nextManifestationAbsoluteHour, absoluteHour(s));
    progressStrangeNotebook(s);
  }
  return { ok: true };
}

export function recordStrangeNotebookOddities(s: GameState): ActionResult {
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return { ok: false, msg: encounterIssue };
  const issue = strangeNotebookActionIssue(s, 'record');
  if (issue) return { ok: false, msg: issue };
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, 5) }]);
  advanceHours(s, 1);
  s.strangeNotebook.odditiesRecorded = true;
  acquireClue(s, 'strange_notebook_inconsistency', 'event', 'opening:strange_notebook');
  addLog(s, '你把页码、墨迹差异和记忆缺口分栏记录。至少现在，你有了一份能交给别人复核的事实，而不是一句“这书很怪”。', 'good');
  return { ok: true };
}

export function discardStrangeNotebook(s: GameState): ActionResult {
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return { ok: false, msg: encounterIssue };
  const issue = strangeNotebookActionIssue(s, 'discard');
  if (issue) return { ok: false, msg: issue };
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, 5) }]);
  advanceHours(s, 1);
  s.items[STRANGE_NOTEBOOK_ITEM_ID] = 0;
  s.strangeNotebook.status = 'missing';
  s.strangeNotebook.returnAbsoluteHour = absoluteHour(s) + 12;
  addLog(s, '你把笔记留在一处与自己无关的公共角落，确认没有人看见。离开时，你短暂地松了口气。', 'info');
  return { ok: true };
}

export function surrenderStrangeNotebook(s: GameState): ActionResult {
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return { ok: false, msg: encounterIssue };
  const issue = strangeNotebookActionIssue(s, 'surrender');
  if (issue) return { ok: false, msg: issue };
  const place = s.currentLocation?.locationId === 'blackthorn_security' ? '安保公司的接待室' : '教堂的事务窗口';
  s.items[STRANGE_NOTEBOOK_ITEM_ID] = 0;
  s.strangeNotebook.status = 'surrendered';
  s.strangeNotebook.handedOffLocationId = s.currentLocation!.locationId as 'st_selena_church' | 'blackthorn_security';
  s.strangeNotebook.handedOffDay = s.day;
  s.strangeNotebook.handedOffHour = s.hour;
  s.flags.strange_notebook_handed_off = true;
  acquireClue(s, 'strange_notebook_official_receipt', 'location', s.currentLocation!.locationId);
  if (s.awareness === 'ordinary') s.awareness = 'witness';
  addLog(s, `你在${place}逐项说明记忆缺口，并交出黑色笔记。接待人没有解释它是什么，只要求你停止誊抄、阅读和占卜；随后，两名戴黑手套的人把证物装进铅灰色匣子。`, 'good');
  return { ok: true };
}

export function advanceHours(s: GameState, hours: number) {
  for (let i = 0; i < hours; i++) {
    s.npcVisitSession = null;
    s.hour++;
    if (s.hour >= 24) {
      s.hour = 0;
      s.day++;
      dailySettlement(s);
    }
    tickTimers(s);
    progressStrangeNotebook(s);
    rebuildAreaSuspicion(s);
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
  if (!validateConditionExpression(blueprint.cond).valid) return false;
  return blueprint.choices.every(choice => validateConditionExpression(choice.cond).valid && choice.effects.every(effect => {
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

function normalizedEffect(effect: Effect): Record<string, unknown> {
  const optional = (value: unknown) => value === undefined ? null : value;
  return {
    k: effect.k,
    v: optional(effect.v),
    id: optional(effect.id),
    stat: optional(effect.stat),
    skill: optional(effect.skill),
    on: optional(effect.on),
    timerLabel: optional(effect.timerLabel),
    timerHours: optional(effect.timerHours),
    timerEffect: effect.timerEffect ? effect.timerEffect.map(normalizedEffect) : null,
  };
}

function sameEffects(left: unknown, right: readonly Effect[]): boolean {
  if (!Array.isArray(left) || left.length !== right.length) return false;
  try {
    return JSON.stringify(left.map(effect => normalizedEffect(effect as Effect)))
      === JSON.stringify(right.map(normalizedEffect));
  } catch {
    return false;
  }
}

function sameOptionalStrings(left: unknown, right?: readonly string[]): boolean {
  if (right === undefined) return left === undefined;
  return Array.isArray(left) && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

/** 随机文案可保留，但一切影响结算的字段必须与当前权威蓝图完全一致。 */
function validPersistedGeneratedEvent(pending: EventInstance, blueprint: EventBlueprint): boolean {
  if (!validGeneratedBlueprint(blueprint)
    || pending.source !== 'generated'
    || typeof pending.instanceId !== 'string' || !pending.instanceId
    || pending.id !== pending.instanceId
    || pending.blueprintId !== blueprint.id
    || pending.contentVersion !== blueprint.contentVersion
    || pending.slot !== blueprint.slot
    || pending.weight !== blueprint.weight
    || pending.cond !== blueprint.cond
    || pending.npc !== blueprint.npc
    || pending.once !== blueprint.once
    || !sameOptionalStrings(pending.locations, blueprint.locations)
    || !blueprint.titleVariants.includes(pending.title)
    || !blueprint.textVariants.includes(pending.text)
    || !Array.isArray(pending.choices) || pending.choices.length !== blueprint.choices.length
    || !Array.isArray(pending.effects) || pending.effects.length !== blueprint.choices.length
    || !pending.context || pending.context.slot !== blueprint.slot
    || !Number.isInteger(pending.context.day) || pending.context.day < 1
    || !Number.isInteger(pending.context.hour) || pending.context.hour < 0 || pending.context.hour > 23
    || pending.context.npcId !== blueprint.npc
    || (blueprint.locations
      ? !pending.context.locationId || !blueprint.locations.includes(pending.context.locationId)
      : pending.context.locationId !== undefined)) return false;
  return pending.choices.every((choice, index) => {
    const authoritative = blueprint.choices[index];
    return typeof choice.text === 'string' && authoritative.textVariants.includes(choice.text)
      && typeof choice.result === 'string' && authoritative.resultVariants.includes(choice.result)
      && choice.cond === authoritative.cond
      && sameEffects(choice.effects, authoritative.effects)
      && sameEffects(pending.effects[index], authoritative.effects)
      && sameEffects(pending.effects[index], choice.effects);
  });
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

function eventRuntimeEligible(s: GameState, eventId: string): boolean {
  // 这桩死亡只可能发生在担保交易会真实营业、玩家本人已经到场的时段。
  // 邀请或黑市地点本身都不能让它在普通夜晚进入抽取池。
  if (eventId !== 'adv_confirmed_beyonder_death') return true;
  return isTradeFairOpen(s)
    && !s.confirmedBeyonderDeaths.some(record => record.sourceId === 'fallen_seer_smuggler')
    && s.activeHunt?.targetId !== 'masked_fortune_smuggler';
}

function queueTradeFairDeathAfterMidnightSettlement(s: GameState, locationId: string): boolean {
  if (!s.pendingEvent || locationId !== 'black_market') return false;
  const event = findEvent('adv_confirmed_beyonder_death');
  if (!event || event.slot !== 'adventure' || !eventRuntimeEligible(s, event.id)
    || !checkCond(s, event.cond) || (event.once && s.firedOnce.includes(event.id))) return false;
  s.forcedEventQueue ??= [];
  if (!s.forcedEventQueue.includes(event.id)) s.forcedEventQueue.push(event.id);
  return true;
}

export function maybeTrigger(s: GameState, slot: string, npcId?: string, locationId?: string): boolean {
  if (s.pendingEvent) return false;
  const staticPool: EventCandidate[] = EVENTS.filter(e => {
    if (e.slot !== slot) return false;
    if (npcId && e.npc !== npcId) return false;
    if (!npcId && e.npc) return false;
    if (e.locations && locationId && !e.locations.includes(locationId)) return false;
    if (e.once && s.firedOnce.includes(e.id)) return false;
    return eventRuntimeEligible(s, e.id) && checkCond(s, e.cond);
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
  if (!ev || !eventRuntimeEligible(s, ev.id)) return;
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
    if (!ev || !eventRuntimeEligible(s, ev.id) || (ev.once && s.firedOnce.includes(ev.id))) continue;
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
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return { ok: false, msg: criticalIssue };
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return { ok: false, msg: encounterIssue };
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
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return { ok: false, msg: criticalIssue };
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
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return { ok: false, msg: encounterIssue };
  const woundIssue = woundActionIssue(s, 'work');
  if (woundIssue) return { ok: false, msg: woundIssue };
  if (s.currentLocation) return { ok: false, msg: '你还在外出的地点，需先返回住处。' };
  const job = currentJob(s);
  if (!job) return { ok: false, msg: '你目前失业，需要先选择一份工作。' };
  const identityStatus = getAreaSuspicionStatus(s, job.locationId);
  if (identityStatus.wanted) {
    return { ok: false, msg: `你在【${job.location}】所在区域已经被通缉，不能通过公开通勤重新进入。` };
  }
  if (identityStatus.value >= 70 && isPublicIdentityCheckpoint(job.locationId) && !getIdentityCoverStatus(s).active) {
    return { ok: false, msg: `【${job.location}】附近正在按外貌与工作记录核对身份；先准备能够经受普通盘问的身份掩饰。` };
  }
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
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return { ok: false, msg: encounterIssue };
  const woundIssue = woundActionIssue(s, 'work');
  if (woundIssue) return { ok: false, msg: woundIssue };
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
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return { ok: false, msg: criticalIssue };
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
    `歇手时，你和${npc.name}聊起「${npc.motive}」。对方比平时多说了几句。`,
    `${npc.name}帮你接过一件麻烦活，你也替对方遮掩了一次小疏漏。你们的配合自然了些。`,
    `你和${npc.name}交换了些工作诀窍。对方${npc.traits.join('、')}，对你倒不算设防。`,
  ];
  addLog(s, wasMet ? scenes[rnd(scenes.length)] : `✦ 结交：你在${job.location}正式认识了同事${npc.name}（${npc.identity}）。对方${npc.traits.join('、')}，心里惦记着「${npc.motive}」。`, wasMet ? 'info' : 'good');
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
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return { ok: false, msg: criticalIssue };
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

function sequence9CooldownDay(day: number, hour: number, def: Sequence9ExplorationAbilityDef): number {
  return def.nightOnly && hour < 6 ? Math.max(1, day - 1) : day;
}

export function getSequence9AbilityDefinition(s: GameState): Sequence9ExplorationAbilityDef | null {
  if (!hasInheritedSequence9Ability(s)) return null;
  return SEQUENCE9_EXPLORATION_ABILITIES.find(def => def.pathwayId === s.pathwayId) ?? null;
}

export function getSequence9LocationActions(s: GameState): Sequence9ExplorationAbilityDef[] {
  const def = getSequence9AbilityDefinition(s);
  const location = s.currentLocation && LOCATIONS.find(candidate => candidate.id === s.currentLocation!.locationId);
  return def?.mode === 'preparation' && location?.actions.includes('explore') ? [def] : [];
}

function activeSequence9Preparation(s: GameState, locationId: string, commission?: Commission | null): Sequence9PreparationRecord | null {
  const def = getSequence9AbilityDefinition(s);
  if (!def || def.mode !== 'preparation') return null;
  if (commission && !def.commissionKinds.includes(commission.kind)) return null;
  return [...(s.sequence9Preparations ?? [])].reverse().find(record => !record.consumed
    && record.pathwayId === def.pathwayId && record.abilityId === def.id && record.locationId === locationId) ?? null;
}

function consumeSequence9Preparation(s: GameState, record: Sequence9PreparationRecord | null) {
  if (!record || record.consumed) return;
  record.consumed = true;
  record.consumedDay = s.day;
  record.consumedHour = s.hour;
  addLog(s, '先前在此留下的准备记录派上了用场；这份记录已经完成核验，不会再次生效。', 'system');
}

export function sequence9LocationActionIssue(s: GameState, abilityId: Sequence9ExplorationAbilityId): string | null {
  const def = SEQUENCE9_EXPLORATION_ABILITIES.find(candidate => candidate.id === abilityId);
  if (!def || def.mode !== 'preparation') return '这项序列能力不存在。';
  if (!hasInheritedSequence9Ability(s, def.pathwayId)) return '这不是你当前途径能够使用的能力。';
  if (currentEvent(s)) return '先处理眼前正在发生的事情。';
  const woundIssue = woundActionIssue(s, 'explore');
  if (woundIssue) return woundIssue;
  if (s.atWork || !s.currentLocation) return '需要先抵达一个可调查的地点。';
  const accessIssue = locationAccessIssue(s, s.currentLocation.locationId);
  if (accessIssue) return accessIssue;
  const location = LOCATIONS.find(candidate => candidate.id === s.currentLocation!.locationId);
  if (!location?.actions.includes('explore')) return '这里没有适合展开这项准备的调查空间。';
  if (def.nightOnly && !isNight(s.hour)) return '这项守望只能在入夜后进行。';
  const cooldownDay = sequence9CooldownDay(s.day, s.hour, def);
  const records = s.sequence9Preparations ?? [];
  if (records.some(record => record.abilityId === def.id && !record.consumed)) {
    return '你已经为这里留下了一份尚未使用的准备记录。';
  }
  if (records.some(record => record.abilityId === def.id && record.cooldownDay === cooldownDay)) {
    return '这段时间里你已经完成过一次准备，先让观察沉淀下来。';
  }
  if (s.stats.energy < energyCost(s, def.energyCost) + 3) return '你现在太疲惫，无法可靠地完成这项准备。';
  return null;
}

export function sequence9PreparationStatus(s: GameState): string | null {
  const locationId = s.currentLocation?.locationId;
  if (!locationId) return null;
  const record = activeSequence9Preparation(s, locationId);
  return record ? '你已为下一次符合条件的本地调查做好准备。离开这里会让这份现场准备失效。' : null;
}

export function performSequence9LocationAction(s: GameState, abilityId: Sequence9ExplorationAbilityId): ActionResult {
  const issue = sequence9LocationActionIssue(s, abilityId);
  if (issue) return { ok: false, msg: issue };
  const def = SEQUENCE9_EXPLORATION_ABILITIES.find(candidate => candidate.id === abilityId)!;
  const locationId = s.currentLocation!.locationId;
  const preparedDay = s.day;
  const preparedHour = s.hour;
  const cooldownDay = sequence9CooldownDay(preparedDay, preparedHour, def);
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, def.energyCost) }]);
  s.sequence9Preparations ??= [];
  s.sequence9Preparations.push({
    abilityId: def.id, pathwayId: def.pathwayId, locationId,
    preparedDay, preparedHour, cooldownDay, consumed: false,
  });
  addLog(s, def.preparationText, 'good');
  advanceHours(s, def.hours);
  return { ok: true };
}

function performExploreAtLocation(s: GameState, locationId: string, actionHours: number, companionId?: string): ActionResult {
  const woundIssue = woundActionIssue(s, 'explore');
  if (woundIssue) return { ok: false, msg: woundIssue };
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
    if (!npcAvailable(n, s.day, s.hour)) return { ok: false, msg: `${n.name}此刻走不开——摸清对方的作息，挑空闲的时候来邀。` };
    comp = n;
  }
  const commissionForHere = s.activeCommission?.locationId === locationId ? s.activeCommission : null;
  const sequence9Preparation = activeSequence9Preparation(s, locationId, commissionForHere);
  const sequence9Ability = sequence9Preparation ? getSequence9AbilityDefinition(s) : null;
  let cost = 6 + loc.hours * 8 - (sequence9Ability?.exploreEnergyRelief ?? 0);
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
    total += pathBonus + (sequence9Ability?.commissionBonus ?? 0);
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
        addLog(s, `${comp.name}按约定分走了${fmtMoney(cut)}。共同出生入死一场，对方看你的眼神多了几分信任。`, 'info');
      }
      s.activeCommission = null;
      s.board = s.board.filter(commission => isLocationUnlocked(s, commission.locationId));
      // 碰了非凡事务，可能惹上隐秘组织
      if (c.occult && !s.nemesis && !s.activeHunt && rnd(100) < 30) {
        s.nemesis = spawnNemesis(s, 'occult');
        addLog(s, `⚠️ 回程路上你总觉得被什么视线黏着。有人盯上你了。`, 'bad');
      }
      consumeSequence9Preparation(s, sequence9Preparation);
    } else {
      applyEffects(s, [{ k: 'san', v: -3 }]);
      if (comp) applyEffects(s, [{ k: 'favor', id: comp.id, v: -3 }]);
      if (s.skills[skillKey] < 10 && rnd(100) < 50) { s.skills[skillKey]++; }
      addLog(s, `✖ 这次推进失败了——线索断在关键处，对方比预想中棘手。委托还剩${c.daysLeft}天。${comp ? ` ${comp.name}陪你白跑一趟，颇有些怨言。` : ''}`, 'bad');
    }
    return { ok: true };
  }

  // 地点专属事件；若无事件，则按危险度结算一次探索收获
  // 深夜调查跨过 00:00 时，日结事件会先占用 pendingEvent。交易会死亡现场仍应排在其后，
  // 但只有此刻确实处于营业夜且本人在场才可入队；普通黑市夜不会生成这条队列。
  const triggered = queueTradeFairDeathAfterMidnightSettlement(s, locationId)
    || maybeTrigger(s, 'adventure', undefined, locationId);
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
  consumeSequence9Preparation(s, sequence9Preparation);
  return { ok: true };
}

export function travelIssue(s: GameState, locationId: string, mode: TravelMode, companionId?: string): string | null {
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return encounterIssue;
  const accessIssue = locationAccessIssue(s, locationId);
  if (accessIssue) return accessIssue;
  if (!isAtHome(s)) return s.atWork ? '需先下班回家再出发。' : '你已经身处另一个地点，需先离开才能改道。';
  const location = LOCATIONS.find(candidate => candidate.id === locationId);
  if (!location) return accessIssue ?? '这个去向尚未查明。先从传闻、委托或可信路线中寻找入口。';
  const identityStatus = getAreaSuspicionStatus(s, locationId);
  const emergencyClinicTrip = getWoundStatus(s).level === 'critical' && locationId === 'north_clinic' && mode === 'rickshaw';
  if (identityStatus.wanted && !emergencyClinicTrip) return `你在【${location.name}】已经被通缉，不能再通过公开交通或街道重新进入。`;
  if (identityStatus.value >= 70 && isPublicIdentityCheckpoint(locationId)
    && !getIdentityCoverStatus(s).active && !emergencyClinicTrip) {
    return `【${location.name}】附近正在核对可疑者身份；先在住处准备普通伪装和一致的身份说辞。`;
  }
  if (location.nightOnly && !(s.hour >= 22 || s.hour < 2)) return `${location.name}只在深夜（22:00–2:00）张开。`;
  if (getWoundStatus(s).level === 'critical' && (locationId !== 'north_clinic' || mode !== 'rickshaw')) {
    return '濒危状态下只能乘人力车前往北区诊所。';
  }
  if (companionId) {
    const companion = findAnyNPC(s, companionId);
    if (!companion) return '找不到这个人。';
    if ((s.relations[companionId] ?? -999) < COMPANION_MIN_FAVOR) return `${companion.name}还没有信任你到愿意一起出门的程度。`;
    if (!npcAvailable(companion, s.day, s.hour)) return `${companion.name}此刻走不开。`;
  }
  const travelers = companionId ? 2 : 1;
  const travel = getTravelQuote(s, locationId, mode, travelers);
  if (!travel) return '这种交通方式不能缩短这趟行程。';
  if (s.pence < travel.fee) return '付不起这趟车费。';
  if (s.stats.energy < 5) return '你现在太疲惫，无法安全出门。';
  return null;
}

export function travelToLocation(s: GameState, locationId: string, mode: TravelMode, companionId?: string): ActionResult {
  const issue = travelIssue(s, locationId, mode, companionId);
  if (issue) return { ok: false, msg: issue };
  const location = LOCATIONS.find(candidate => candidate.id === locationId)!;
  const travelers = companionId ? 2 : 1;
  const travel = getTravelQuote(s, locationId, mode, travelers)!;
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
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return { ok: false, msg: encounterIssue };
  const stay = s.currentLocation;
  if (!stay) return { ok: false, msg: '你目前不在外出的地点。' };
  const location = LOCATIONS.find(candidate => candidate.id === stay.locationId);
  for (const preparation of s.sequence9Preparations ?? []) {
    if (!preparation.consumed && preparation.locationId === stay.locationId) {
      preparation.consumed = true;
      preparation.consumedDay = s.day;
      preparation.consumedHour = s.hour;
    }
  }
  s.currentLocation = null;
  if (stay.returnHours > 0) advanceHours(s, stay.returnHours);
  addLog(s, `你离开【${location?.name ?? '当前地点'}】并返回住处。返程已在出发时安排，不再收费。`, 'info');
  return { ok: true };
}

function salvageAtLocation(s: GameState, locationId: string): ActionResult {
  const woundIssue = woundActionIssue(s, 'salvage');
  if (woundIssue) return { ok: false, msg: woundIssue };
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
  if (getWoundStatus(s).level === 'critical') {
    return { ok: false, msg: woundActionIssue(s, 'explore')! };
  }
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
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return { ok: false, msg: encounterIssue };
  const woundIssue = actionId === 'salvage'
    ? woundActionIssue(s, 'salvage')
    : actionId === 'explore' || getWoundStatus(s).level === 'critical'
      ? woundActionIssue(s, 'explore') : null;
  if (woundIssue) return { ok: false, msg: woundIssue };
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
  const woundIssue = getWoundStatus(s).level === 'critical' ? woundActionIssue(s, 'explore') : null;
  if (woundIssue) return woundIssue;
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
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return { ok: false, msg: encounterIssue };
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
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
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
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return { ok: false, msg: encounterIssue };
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
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
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
  if (s.pendingEncounter) return false;
  const book = BOOK_DEFS.find(candidate => candidate.id === bookId);
  const state = s.books[bookId];
  if (!book || !state?.acquired || state.completed || state.readHours < book.totalHours) return false;
  state.completed = true;
  for (const reward of book.rewards) applyBookReward(s, reward);
  addLog(s, `你读完${book.title}并整理了索引，把其中能够相互印证的内容逐条抄进调查笔记。`, 'good');
  return true;
}

export function readBookSession(s: GameState, bookId: string): ActionResult {
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return { ok: false, msg: encounterIssue };
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
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return { ok: false, msg: criticalIssue };
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return { ok: false, msg: encounterIssue };
  if (s.atWork) return { ok: false, msg: '你还在工作地点，不能外出攀谈。' };
  const npc = findAnyNPC(s, npcId);
  if (!npc) return { ok: false, msg: '找不到这个人。' };
  const huntTarget = HUNT_TARGET_DEFS.find(target => target.npcId === npcId);
  if (huntTarget && s.currentLocation?.locationId !== huntTarget.locationId) return { ok: false, msg: '只有亲临对方所在的场所，才能与他搭话。' };
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
      addLog(s, `✦ 结交：你找机会和${gen.name}搭上了话（${gen.identity}）。对方${gen.traits.join('、')}——聊下来你隐约觉得，这个人心里装着「${gen.motive}」这回事。`, 'good');
    } else {
      addLog(s, `✦ 结交：你正式认识了${npc.name}（${npc.identity}）。${npc.desc}`, 'good');
      if (huntTarget?.id === 'masked_fortune_smuggler') {
        acquireClue(s, 'masked_smuggler_trade_tell', 'npc', npc.id);
        addLog(s, '交谈中，他三次避开同一组占卜象征，却能准确指出你从未说出口的牌位。你只把这处矛盾记了下来，尚不能据此判断他的真实身份。', 'event');
      }
    }
  } else {
    // —— 初识阶段的寒暄 ——
    applyEffects(s, [{ k: 'favor', id: npcId, v: 1 + rnd(3) }]);
    const smallTalk = gen
      ? [`你陪${gen.name}聊了几句${gen.motive}的进展。`, `${gen.name}对你熟络了些，顺嘴抱怨起今天的活计。`, `你给${gen.name}递了支烟，对方的话多了两句。`]
      : [`你和${npc.name}寒暄了一阵，对方对你多了几分印象。`, `${npc.name}抬眼认出是你，语气比上回缓和了些。`, `你陪${npc.name}聊了些街区见闻，关系近了一点。`];
    addLog(s, smallTalk[rnd(smallTalk.length)], 'info');
    const now = s.relations[npcId] ?? 0;
    if (now >= VISIT_FAVOR) addLog(s, `✦ ${npc.name}已经把你当自己人了——现在可以登门「拜访」了。`, 'system');
  }
  return { ok: true };
}

export function doSocial(s: GameState, npcId: string): ActionResult {
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return { ok: false, msg: criticalIssue };
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return { ok: false, msg: encounterIssue };
  if (s.atWork) return { ok: false, msg: '你还在工作地点，不能外出拜访。' };
  const npc = findAnyNPC(s, npcId);
  if (!npc) return { ok: false, msg: '找不到这个人。' };
  const huntTarget = HUNT_TARGET_DEFS.find(target => target.npcId === npcId);
  if (huntTarget && s.currentLocation?.locationId !== huntTarget.locationId) return { ok: false, msg: '只有亲临对方所在的场所，才能与他见面。' };
  if (!npcAvailable(npc, s.day, s.hour)) return { ok: false, msg: `${npc.name}现在不在方便见客的地方。` };
  const fav = s.relations[npcId];
  if (fav === undefined) return { ok: false, msg: '你们还不认识。先找机会攀谈结交（酒馆、街头、市集都是认识人的地方）。' };
  if (fav < VISIT_FAVOR) return { ok: false, msg: '你们还只是点头之交。先多攀谈几次，等对方真正信任你再登门。' };
  if (s.stats.energy < 8) return { ok: false, msg: '精力不足。' };
  const visitStartedAt = { day: s.day, hour: s.hour };
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, 8) }]);
  addLog(s, `你拜访了${npc.name}（${npc.identity}）。`, 'info');
  advanceHours(s, 1);
  if (s.gameOver) return { ok: true };
  s.npcVisitSession = { npcId, startedDay: visitStartedAt.day, startedHour: visitStartedAt.hour, day: s.day, hour: s.hour };

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
        ? `✦ 结交：你在酒馆结识了${npc.name}（${npc.identity}）。几杯下肚，${gen.traits.join('、')}的对方说漏了嘴——最近正为「${gen.motive}」发愁。`
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
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return { ok: false, msg: encounterIssue };
  if (s.currentLocation) return { ok: false, msg: '你还在外出的地点，需先返回住处。' };
  if (s.atWork) return { ok: false, msg: '工作地点不是睡觉的地方。' };
  applyEffects(s, [{ k: 'energy', v: 12 }]);
  const profile = getCombatProfile(s);
  s.combatVitals.spirit = Math.min(profile.maxSpirit, s.combatVitals.spirit + Math.floor(profile.maxSpirit * 0.25));
  addLog(s, '你小憩了一小时，醒来时手脚轻快了些。', 'info');
  advanceHours(s, 1);
  return { ok: true };
}

export function doMeal(s: GameState): ActionResult {
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return { ok: false, msg: criticalIssue };
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return { ok: false, msg: encounterIssue };
  if (s.atWork) return { ok: false, msg: '你还在工作地点，需先下班离开。' };
  if (s.pence < 4) return { ok: false, msg: '连顿饭钱都付不起了。' };
  applyEffects(s, [{ k: 'money', v: -4 }, { k: 'energy', v: 20 }, { k: 'san', v: 2 }]);
  addLog(s, '你花4便士吃了顿像样的热食，胃里终于暖和起来。', 'info');
  advanceHours(s, 1);
  return { ok: true };
}

export function doSleep(s: GameState): ActionResult {
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return { ok: false, msg: encounterIssue };
  if (s.currentLocation) return { ok: false, msg: '你还在外出的地点，需先返回住处。' };
  if (s.atWork) return { ok: false, msg: '你还在工作地点，需先下班离开。' };
  const hours = s.hour < 7 ? 7 - s.hour : 24 - s.hour + 7;
  if (s.pathwayId === 'sleepless') {
    applyEffects(s, [{ k: 'energy', v: 40 }, { k: 'san', v: 5 }]);
    const profile = getCombatProfile(s);
    s.combatVitals.spirit = Math.min(profile.maxSpirit, s.combatVitals.spirit + Math.floor(profile.maxSpirit * 0.5));
    addLog(s, '不眠者无需睡眠。你静夜冥想，让疲惫与杂念随着呼吸缓缓沉淀。', 'info');
    advanceHours(s, 2);
    return { ok: true };
  }
  const recover = s.tags.includes('homeless') ? 50 : 100;
  const profile = getCombatProfile(s);
  s.combatVitals.spirit = profile.maxSpirit;
  s.combatVitals.hp = Math.min(profile.maxHp, s.combatVitals.hp + Math.max(1, Math.floor(profile.maxHp * 0.1)));
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
      addLog(s, `你撞见了${npc.name}——这个时间对方果然在${spot}。你们站在街边聊了几句，告别时语气亲近了些。`, 'info');
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
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
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
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
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
  const qualificationTask = ORGANIZATION_QUALIFICATION_TASKS.find(task => task.organizationId === organizationId);
  if (qualificationTask && organizationId !== 'iron_and_blood') {
    acquireClue(s, qualificationTask.hardClueId, def.entryMode === 'npc_background' ? 'npc' : 'location',
      def.entryMode === 'npc_background' ? def.contactNpc : (def.locationId ?? qualificationTask.organizationId));
  }
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
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return { ok: false, msg: criticalIssue };
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
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return { ok: false, msg: criticalIssue };
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
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return { ok: false, msg: criticalIssue };
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

function organizationQualificationTask(organizationId: OrganizationId) {
  return ORGANIZATION_QUALIFICATION_TASKS.find(task => task.organizationId === organizationId) ?? null;
}

export function getOrganizationQualificationTaskView(s: GameState, organizationId: OrganizationId) {
  const task = organizationQualificationTask(organizationId);
  if (!task) return null;
  const internal = evaluateExplorationCheckInternal(s, task.checkId);
  const def = EXPLORATION_CHECKS.find(check => check.id === task.checkId);
  const activeIds = new Set(internal.contributions.map(contribution => contribution.id));
  const helpedBy = def?.contributions.filter(contribution => contribution.kind === 'clue'
    && activeIds.has(`clue:${contribution.id}`)).map(contribution => contribution.publicLabel) ?? [];
  return {
    label: task.label,
    narrative: task.narrative,
    inputLabels: [task.statLabel, task.skillLabel],
    helpedBy,
    hours: task.passHours,
    issue: organizationQualificationIssue(s, organizationId),
  };
}

export function organizationQualificationIssue(s: GameState, organizationId: OrganizationId): string | null {
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
  const task = organizationQualificationTask(organizationId);
  if (!task) return '该组织不使用这项外围资格任务。';
  if (s.atWork) return '工作期间不能完成组织资格任务。';
  if (isBeyonder(s)) return '该候选流程只面向凡人。';
  const route = s.organizationRoutes[task.organizationId];
  if (!route || route.status !== 'contacted' || route.routeStep !== 'contacted') return '尚未处于该组织的正式资格任务阶段。';
  const leadDef = leadDefForOrganization(task.organizationId);
  if (!leadDef || s.leads[leadDef.id]?.stage !== 'verified') return '对应原始线索尚未完成真实性核验。';
  if (!hasClue(s, task.hardClueId)) return '资格任务缺少经过来源审计的原始凭据。';
  const internal = evaluateExplorationCheckInternal(s, task.checkId);
  if (!internal.eligible) return internal.reason === 'missing_requirement'
    ? '资格任务缺少经过来源审计的原始凭据。' : '这项资格任务当前无法核验。';
  const repeatedIssue = repeatedBlockedExplorationIssue(s, internal);
  if (repeatedIssue) return repeatedIssue;
  if (s.stats.energy < energyCost(s, task.passEnergyCost)) return '你当前太过疲惫，无法完整完成这项资格任务。';
  return null;
}

export function completeOrganizationQualification(s: GameState, organizationId: OrganizationId): ActionResult {
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return { ok: false, msg: encounterIssue };
  const issue = organizationQualificationIssue(s, organizationId);
  if (issue) return { ok: false, msg: issue };
  const task = organizationQualificationTask(organizationId)!;
  const startedAt = { day: s.day, hour: s.hour };
  const request = explorationCheckRequest(s, task.checkId, startedAt);
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  if (!internal.eligible) return { ok: false, msg: '这项资格任务当前无法核验。' };
  if (internal.reason === 'insufficient') {
    const applied = applyEffects(s, [{ k: 'energy', v: -energyCost(s, 5) }]);
    addLog(s, '你完成了一轮演练，却没能把判断边界、来源依据与撤回条件整理成可复核的记录。', 'info');
    addLog(s, '现有材料仍可重新准备；只有与任务直接相关的能力或已取得旁证发生变化，下一次尝试才有意义。', 'system');
    const receipt: CheckReceipt = { hoursElapsed: 1, effects: [receiptEntry('energy', applied[0]), hoursReceipt(1)] };
    recordCheckAttempt(s, internal, request.context, receipt, startedAt);
    advanceHours(s, 1);
    return { ok: true, outcome: 'blocked' };
  }
  const route = s.organizationRoutes[task.organizationId];
  const beforeRoute = `${route.status}/${route.routeStep}`;
  const applied = applyEffects(s, [{ k: 'energy', v: -energyCost(s, task.passEnergyCost) }]);
  route.status = 'qualified';
  route.routeStep = 'qualified';
  recordOrganizationRoute(s, task.organizationId, `qualification_check:${task.checkId}`, 'passed');
  const receipt: CheckReceipt = { hoursElapsed: task.passHours, effects: [
    receiptEntry('energy', applied[0]), hoursReceipt(task.passHours),
    { id: `route:${task.organizationId}`, applied: true, before: beforeRoute, after: `${route.status}/${route.routeStep}` },
  ] };
  recordCheckAttempt(s, internal, request.context, receipt, startedAt);
  addLog(s, `你完成了${organizationDef(task.organizationId)?.name}安排的“${task.label}”。记录通过复核，但资格本身不会赠送配方、材料或能力。`, 'good');
  advanceHours(s, task.passHours);
  return { ok: true, outcome: 'passed' };
}

export function joinOrganization(s: GameState, organizationId: OrganizationId): ActionResult {
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return { ok: false, msg: criticalIssue };
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
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return { ok: false, msg: criticalIssue };
  const route = organizationRoute(s, organizationId);
  if (route.status !== 'member') return { ok: false, msg: '未加入组织，不能查看魔药报价。' };
  route.status = 'offer_pending';
  route.routeStep = 'offer_pending';
  recordOrganizationRoute(s, organizationId, 'offers_opened', 'passed');
  return { ok: true };
}

export function leaveOrganization(s: GameState, organizationId: OrganizationId): ActionResult {
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return { ok: false, msg: criticalIssue };
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
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return { ok: false, msg: criticalIssue };
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
    const auxiliaryId = findPathway(pathwayId)?.seq9.auxiliary;
    if (auxiliaryId) s.items[auxiliaryId] = (s.items[auxiliaryId] ?? 0) + 1;
  }
  recordOrganizationRoute(s, organizationId, `commit:${pathwayId}`, 'passed');
  recordRoute(s, pathwayId, 'organization_commitment', 'passed', organizationId);
  addLog(s, `第二次确认完成：你在${organizationDef(organizationId)?.name}内锁定【${findPathway(pathwayId)?.name}】。其他组织与途径资格不能串用。`, 'good');
  return { ok: true };
}

export function materialCollectionIssue(s: GameState, sourceId: string, locationId: string): string | null {
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
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
  const woundIssue = woundActionIssue(s, 'salvage');
  if (woundIssue) return { ok: false, msg: woundIssue };
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
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
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
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return { ok: false, msg: criticalIssue };
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
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
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
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
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
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return { ok: false, msg: criticalIssue };
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
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
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
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
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
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
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
  const check = evaluateExplorationCheckInternal(s, 'dock_manifest_trace');
  if (check.reason === 'missing_requirement') return '调查笔记里还缺少公开失踪登记。';
  if (!check.eligible && check.reason !== 'insufficient') return '这项码头调查暂时无法继续，请稍后再试。';
  const repeatedIssue = repeatedBlockedExplorationIssue(s, check);
  if (repeatedIssue) return repeatedIssue;
  return null;
}

export function traceDockMarkedManifest(s: GameState): ActionResult {
  const issue = traceDockMarkedManifestIssue(s);
  if (issue) return { ok: false, msg: issue };
  const startedAt = { day: s.day, hour: s.hour };
  const request = explorationCheckRequest(s, 'dock_manifest_trace', startedAt);
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  const check = evaluateExplorationCheck(s, 'dock_manifest_trace');
  if (!internal.eligible && internal.reason === 'missing_requirement') return { ok: false, msg: '调查笔记里还缺少公开失踪登记。' };
  if (!internal.eligible) return { ok: false, msg: '这项码头调查暂时无法继续，请稍后再试。' };
  if (internal.reason === 'insufficient') {
    const applied = applyEffects(s, [{ k: 'energy', v: -energyCost(s, 5) }]);
    addLog(s, '你在仓单房里来回翻找，却无法把失踪者姓名、货物流向和库位变更连成可靠的追查顺序。', 'info');
    addLog(s, '也许应该再查看货运记录的备份，或先积累更多整理档案的经验。', 'system');
    const receipt: CheckReceipt = { hoursElapsed: 1, effects: [receiptEntry('energy', applied[0]), hoursReceipt(1)] };
    recordExplorationAttempt(s, check, startedAt);
    recordCheckAttempt(s, internal, request.context, receipt, startedAt);
    advanceHours(s, 1);
    return { ok: true, outcome: 'blocked' };
  }
  const applied = applyEffects(s, [{ k: 'energy', v: -energyCost(s, 15) }]);
  const acquiredManifest = acquireClue(s, 'dock_marked_manifest');
  const lead = s.leads.iron_blood_token;
  const leadBefore = lead.stage;
  lead.stage = 'found';
  lead.notes.push('从货运缺口中追查到一份留有陌生印记的旧仓单');
  recordOrganizationRoute(s, 'iron_and_blood', 'world_entry:iron_blood_token', 'passed', 'dock_manifest_trace');
  addLog(s, '你按照人员名册与货物转运次序，终于从被错放的旧档里抽出一份仓单。纸面的油污下留着一枚无法从公开记录解释的印记。', 'event');
  addLog(s, '✦ 异常仓单已记入调查笔记。你只能确认它值得整理和请可信的码头熟人辨认，尚不知道它指向何方。', 'system');
  const receipt: CheckReceipt = { hoursElapsed: 2, effects: [
    receiptEntry('energy', applied[0]), hoursReceipt(2),
    { id: 'clue:dock_marked_manifest', applied: acquiredManifest, before: false, after: acquiredManifest },
    { id: 'lead:iron_blood_token', applied: leadBefore !== lead.stage, before: leadBefore, after: lead.stage },
    { id: 'route:iron_and_blood', applied: true },
  ] };
  recordExplorationAttempt(s, check, startedAt);
  recordCheckAttempt(s, internal, request.context, receipt, startedAt);
  advanceHours(s, 2);
  return { ok: true, outcome: 'passed' };
}

function legalDockSequence9Pathway(s: GameState): string | null {
  return s.sequence === 9 && s.pathwayId !== null && PATHWAYS.some(pathway => pathway.id === s.pathwayId)
    ? s.pathwayId : null;
}

function isWithinWindow(hour: number, openFrom: number, openTo: number): boolean {
  const normalized = openTo > 24 && hour < openFrom ? hour + 24 : hour;
  return normalized >= openFrom && normalized < openTo;
}

export function getDockSequence9Actions(s: GameState): DockSequence9ActionDef[] {
  const pathwayId = legalDockSequence9Pathway(s);
  if (!pathwayId || !s.intel.includes('dock_missing') || hasClue(s, 'dock_seq9_conclusion')) return [];
  return DOCK_SEQUENCE9_ACTIONS.filter(action => action.pathwayId === pathwayId
    && isLocationUnlocked(s, action.locationId)
    && (action.requiredClueIds ?? []).every(clueId => hasClue(s, clueId))
    && (!action.requiredNpcId || isMet(s, action.requiredNpcId)));
}

function dockSequence9BaseIssue(s: GameState): string | null {
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
  if (!legalDockSequence9Pathway(s)) return '只有五条已知途径的合法序列9能够开展这项调查。';
  if (!s.intel.includes('dock_missing')) return '你还不知道码头失踪案的可靠传闻，无法确定调查目标。';
  return null;
}

export function dockSequence9PathActionIssue(s: GameState, actionId: string): string | null {
  const base = dockSequence9BaseIssue(s);
  if (base) return base;
  const action = DOCK_SEQUENCE9_ACTIONS.find(candidate => candidate.id === actionId);
  if (!action || action.pathwayId !== s.pathwayId) return '这不是你当前途径能够使用的调查方式。';
  if (!isLocationUnlocked(s, action.locationId)) return '这项调查所需的去向尚未查明。';
  if (s.currentLocation?.locationId !== action.locationId) return '需要亲自抵达与这条记录对应的地点。';
  if (hasClue(s, action.clueId)) return '本途径的码头现场记录已经完成。';
  if (hasClue(s, 'dock_seq9_conclusion')) return '综合调查已经完成，请先决定如何处置记录。';
  if (!(action.requiredClueIds ?? []).every(clueId => hasClue(s, clueId))) return '请先完成本途径的前一项调查记录。';
  if (action.requiredNpcId && !isMet(s, action.requiredNpcId)) return '需要先与当地知情人正式结识。';
  if (action.nightOnly && !isNight(s.hour)) return '这项守望只能在夜间进行。';
  if (action.openFrom !== undefined && action.openTo !== undefined && !isWithinWindow(s.hour, action.openFrom, action.openTo)) {
    const end = action.openTo > 24 ? action.openTo - 24 : action.openTo;
    return `这项调查只能在${action.openFrom}:00–${end}:00进行。`;
  }
  if (s.stats.energy < energyCost(s, action.energyCost)) return '你当前太过疲惫，无法保持足够谨慎。';
  return null;
}

export function performDockSequence9PathAction(s: GameState, actionId: string): ActionResult {
  const issue = dockSequence9PathActionIssue(s, actionId);
  if (issue) return { ok: false, msg: issue };
  const action = DOCK_SEQUENCE9_ACTIONS.find(candidate => candidate.id === actionId)!;
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, action.energyCost) }]);
  acquireClue(s, action.clueId, 'location', action.id);
  addLog(s, action.result, 'info');
  addLog(s, '✦ 本途径的现场记录已收入案件簿。它只提供一条可核验路径，不会替代公开档案或直接揭示幕后身份。', 'system');
  advanceHours(s, action.hours);
  return { ok: true };
}

function dockSequence9ResolutionCheckId(s: GameState): string | null {
  const pathwayId = legalDockSequence9Pathway(s);
  return pathwayId ? `dock_seq9_synthesis_${pathwayId}` : null;
}

export function resolveDockSequence9CaseIssue(s: GameState): string | null {
  const base = dockSequence9BaseIssue(s);
  if (base) return base;
  if (s.currentLocation?.locationId !== 'docks') return '需要回到东区码头，才能完成最后的交叉核验。';
  if (hasClue(s, 'dock_seq9_conclusion')) return '综合调查已经完成，正在等待你的处置。';
  const actions = DOCK_SEQUENCE9_ACTIONS.filter(action => action.pathwayId === s.pathwayId);
  if (actions.length !== 2 || actions.some(action => !hasClue(s, action.clueId))) return '请先完成当前途径的两项调查记录。';
  if (s.stats.energy < energyCost(s, 12)) return '你当前太过疲惫，无法完成最后的交叉核验。';
  const checkId = dockSequence9ResolutionCheckId(s);
  if (!checkId) return '当前途径无法建立可靠的结案检定。';
  const internal = evaluateExplorationCheckInternal(s, checkId);
  if (!internal.eligible) return internal.reason === 'missing_requirement'
    ? '请先完成当前途径的两项调查记录。' : '这项综合调查暂时无法继续。';
  return repeatedBlockedExplorationIssue(s, internal);
}

const DOCK_SEQUENCE9_CONCLUSIONS: Record<string, string> = {
  seer: '象征与仓单日期互相印证：有人反复利用固定交接空档和同一条转运路线，但现有事实仍不能指认幕后身份。',
  spectator: '证词与账房回避互相印证：有人反复利用固定交接空档和同一条转运路线，但现有事实仍不能指认幕后身份。',
  hunter: '两处痕迹闭合成稳定回路：有人反复利用固定交接空档和同一条转运路线，但现有事实仍不能指认幕后身份。',
  sleepless: '夜班记录与麦克的回忆互相印证：有人反复利用固定交接空档和同一条转运路线，但现有事实仍不能指认幕后身份。',
  apprentice: '两处通路测绘互相吻合：有人反复利用固定交接空档和同一条转运路线，但现有事实仍不能指认幕后身份。',
};

export function resolveDockSequence9Case(s: GameState): ActionResult {
  const issue = resolveDockSequence9CaseIssue(s);
  if (issue) return { ok: false, msg: issue };
  const checkId = dockSequence9ResolutionCheckId(s)!;
  const startedAt = { day: s.day, hour: s.hour };
  const request = explorationCheckRequest(s, checkId, startedAt);
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  const legacy = evaluateExplorationCheck(s, checkId);
  if (!internal.eligible) return { ok: false, msg: '这项综合调查暂时无法继续。' };
  if (internal.reason === 'insufficient') {
    const applied = applyEffects(s, [{ k: 'energy', v: -energyCost(s, 5) }]);
    addLog(s, '你把本途径的现场记录与已有资料逐项对照，却仍有几处无法被独立证据支撑。现在写下结论只会把推测伪装成事实。', 'info');
    addLog(s, '下一步应补充公开登记、货运旁证，或磨练与当前路径直接相关的调查能力。', 'system');
    const receipt: CheckReceipt = { hoursElapsed: 1, effects: [receiptEntry('energy', applied[0]), hoursReceipt(1)] };
    recordExplorationAttempt(s, legacy, startedAt);
    recordCheckAttempt(s, internal, request.context, receipt, startedAt);
    advanceHours(s, 1);
    return { ok: true, outcome: 'blocked' };
  }
  const applied = applyEffects(s, [{ k: 'energy', v: -energyCost(s, 12) }]);
  const acquired = acquireClue(s, 'dock_seq9_conclusion', 'location', `dock_seq9_synthesis_${s.pathwayId}`);
  addLog(s, DOCK_SEQUENCE9_CONCLUSIONS[s.pathwayId!] ?? '你完成了最后的交叉核验，留下了一份可复核的调查结论。', 'event');
  addLog(s, '✦ 综合调查已经完成。记录只证明固定交接空档与转运路线曾被利用；请选择一个你实际能够抵达的渠道处置。', 'system');
  const receipt: CheckReceipt = { hoursElapsed: 2, effects: [
    receiptEntry('energy', applied[0]), hoursReceipt(2),
    { id: 'clue:dock_seq9_conclusion', applied: acquired, before: false, after: acquired },
  ] };
  recordExplorationAttempt(s, legacy, startedAt);
  recordCheckAttempt(s, internal, request.context, receipt, startedAt);
  advanceHours(s, 2);
  return { ok: true, outcome: 'passed' };
}

const DOCK_DISPOSITION_CLUE_IDS = DOCK_CASE_DISPOSITIONS.map(disposition => disposition.clueId);

export function dockCaseDispositionClue(s: GameState): string | null {
  return DOCK_DISPOSITION_CLUE_IDS.find(clueId => hasClue(s, clueId)) ?? null;
}

/** 只返回玩家当前地点真实可见的处置，避免以禁用按钮泄露隐藏渠道。 */
export function getDockCaseDispositions(s: GameState) {
  if (!hasClue(s, 'dock_seq9_conclusion') || dockCaseDispositionClue(s)
    || (dockWitnessCrisisReady(s) && !dockWitnessCrisisOutcomeClue(s))
    || (dockWitnessFollowupRoute(s) && !dockWitnessFollowupOutcomeClue(s))
    || (dockGrayHatOperationReady(s) && !dockGrayHatOperationOutcomeClue(s))
    || (dockEncounterAftermathSourceClue(s) && dockEncounterAftermathSourceClue(s) !== 'dock_gray_hat_scene_lost'
      && !dockEncounterAftermathOutcomeClue(s))
    || (hasClue(s, 'dock_gray_hat_retreat_route') && !dockOldYardResolved(s))
    || (hasClue(s, 'dock_old_yard_night_transfer') && !dockTransferFollowupOutcomeClue(s))) return [];
  return DOCK_CASE_DISPOSITIONS.filter(disposition => s.currentLocation?.locationId === disposition.locationId
    && isLocationUnlocked(s, disposition.locationId)
    && (!disposition.requiredNpcId || isMet(s, disposition.requiredNpcId))
    && (!disposition.requiresFormalLocationAccess || hasFormalNightwatchRoute(s)));
}

export function dockCaseDispositionIssue(s: GameState, dispositionId: string): string | null {
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return encounterIssue;
  if (!hasClue(s, 'dock_seq9_conclusion')) return '需要先完成码头失踪案的综合调查。';
  if (dockCaseDispositionClue(s)) return '这份调查记录已经完成处置，不能再选择另一个互斥渠道。';
  if (dockWitnessCrisisReady(s) && !dockWitnessCrisisOutcomeClue(s)) return '知情人可能正被盯上，需要先决定怎样处理这条口信。';
  if (dockWitnessFollowupRoute(s) && !dockWitnessFollowupOutcomeClue(s)) return '口信之后还有一处能够核验的事实，需要先把它查清。';
  if (dockGrayHatOperationReady(s) && !dockGrayHatOperationOutcomeClue(s)) return '灰帽接头人已经成为唯一活线，需要先决定怎样继续盯住他。';
  if (dockEncounterAftermathSourceClue(s) && dockEncounterAftermathSourceClue(s) !== 'dock_gray_hat_scene_lost'
    && !dockEncounterAftermathOutcomeClue(s)) return '遭遇已经结束，但现场所得仍需先追索、移交或封存。';
  if (hasClue(s, 'dock_gray_hat_retreat_route') && !dockOldYardResolved(s)) {
    return '撤退方向已经指向旧装卸区，需要先完成外围核对、询问和夜间守候。';
  }
  if (hasClue(s, 'dock_old_yard_night_transfer') && !dockTransferFollowupOutcomeClue(s)) {
    return '无编号篷车已经成为新的活线，需要先选择跟踪、检查遗留封箱或申请正式截查。';
  }
  const disposition = DOCK_CASE_DISPOSITIONS.find(candidate => candidate.id === dispositionId);
  if (!disposition) return '当前没有可执行的案件处置。';
  if (!isLocationUnlocked(s, disposition.locationId) || s.currentLocation?.locationId !== disposition.locationId) {
    return '当前没有可执行的案件处置。';
  }
  if (disposition.requiredNpcId && !isMet(s, disposition.requiredNpcId)) return '需要先与当地知情人正式结识。';
  if (disposition.requiresFormalLocationAccess && !hasFormalNightwatchRoute(s)) return '当前没有可执行的案件处置。';
  if (!isWithinWindow(s.hour, disposition.openFrom, disposition.openTo)) {
    const end = disposition.openTo > 24 ? disposition.openTo - 24 : disposition.openTo;
    return `这个渠道只在${disposition.openFrom}:00–${end}:00受理。`;
  }
  if (s.stats.energy < energyCost(s, 4)) return '你当前太过疲惫，无法妥善整理并说明记录。';
  return null;
}

export function performDockCaseDisposition(s: GameState, dispositionId: string): ActionResult {
  const issue = dockCaseDispositionIssue(s, dispositionId);
  if (issue) return { ok: false, msg: issue };
  const disposition = DOCK_CASE_DISPOSITIONS.find(candidate => candidate.id === dispositionId)!;
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, 4) }]);
  const acquired = acquireClue(s, disposition.clueId, disposition.id === 'workers_warning' ? 'npc' : 'location',
    disposition.id === 'workers_warning' ? 'mike' : disposition.locationId);
  if (!acquired) return { ok: false, msg: '这份调查记录已经完成处置。' };
  if (disposition.id === 'workers_warning') applyEffects(s, [{ k: 'favor', id: 'mike', v: 3 }]);
  const threat = s.caseThreats?.[DOCK_THREAT_ID];
  if (threat) threat.status = 'resolved';
  const result = disposition.id === 'public_report'
    ? '你向港务公开窗口递交了人员、班次与转运路线的可核验副本，原始证物仍留在自己手中。'
    : disposition.id === 'workers_warning'
      ? '麦克答应把具体的交接空档和避险路线转告夜班工人。他没有夸大威胁，也没有追问你无法回答的幕后身份。'
      : '正式接触的安保人员接收了调查副本并出具回条；你没有交出或失去任何原始证物。';
  addLog(s, result, 'event');
  addLog(s, '✦ 码头失踪案已完成阶段处置。廷根第一章·案件样板完成；幕后身份仍然未知。', 'system');
  advanceHours(s, 1);
  return { ok: true };
}

/** 主动调查一个固定异常，不依赖随机事件池；玩家也可以永远不触碰它。 */
export function traceClocktowerAnomaly(s: GameState): ActionResult {
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return { ok: false, msg: criticalIssue };
  if (s.atWork) return { ok: false, msg: '工作期间不能去追查钟楼异响。' };
  if (isBeyonder(s)) return { ok: false, msg: '这条记录只属于尚未接触非凡世界的普通人。' };
  if (s.awareness !== 'ordinary') return { ok: false, msg: '你已经确认过异常存在，无需重复调查。' };
  const route = organizationRoute(s, 'nightwatch');
  const lead = s.leads.nightwatch_clocktower;
  if (route.routeStep !== 'public_rumor' || lead.stage !== 'found') return { ok: false, msg: '请先查阅地方报纸和市政失修记录，确认值得追查的世俗线索。' };
  if (!isClocktowerTraceHours(s.hour)) return { ok: false, msg: '钟楼异常只在22:00至凌晨2:00之间可追查。' };
  if (s.stats.energy < 15) return { ok: false, msg: '你当前太过疲惫，贸然追查旧钟楼并不安全。' };
  const startedAt = { day: s.day, hour: s.hour };
  const request = explorationCheckRequest(s, 'clocktower_night_trace', startedAt);
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  const check = evaluateExplorationCheck(s, 'clocktower_night_trace');
  if (internal.reason === 'missing_requirement') {
    return { ok: false, msg: '调查笔记里缺少支撑夜间追查的基础记录，请先核对旧钟楼的公开投诉。' };
  }
  if (!internal.eligible) {
    return { ok: false, msg: '这项调查暂时无法继续，请稍后再试。' };
  }
  const repeatedIssue = repeatedBlockedExplorationIssue(s, internal);
  if (repeatedIssue) return { ok: false, msg: repeatedIssue };
  if (internal.reason === 'insufficient') {
    const applied = applyEffects(s, [{ k: 'energy', v: -energyCost(s, 5) }]);
    addLog(s, '你在旧钟楼外围守了很久，却始终无法把投诉中的时间、声音与现场痕迹连成一条可靠路线。继续贸然深入只会在雾里迷失。', 'info');
    addLog(s, '也许该去核对被分开归档的维修工单，或先从别的调查中磨练观察与推理。今晚你只能暂时退回街灯下。', 'system');
    const receipt: CheckReceipt = { hoursElapsed: 1, effects: [receiptEntry('energy', applied[0]), hoursReceipt(1)] };
    recordExplorationAttempt(s, check, startedAt);
    recordCheckAttempt(s, internal, request.context, receipt, startedAt);
    advanceHours(s, 1);
    return { ok: true, outcome: 'blocked' };
  }
  const awarenessBefore = s.awareness;
  const leadBefore = lead.stage;
  const applied = applyEffects(s, [{ k: 'energy', v: -energyCost(s, 15) }, { k: 'san', v: -3 }, { k: 'item', id: 'anomaly_evidence', v: 1 }, { k: 'flag', id: 'met_beyonder', v: 1 }]);
  s.awareness = 'witness';
  lead.stage = 'identified';
  lead.notes.push('取得染着冷灰的铜质铭牌');
  route.routeStep = 'evidence_ready';
  recordOrganizationRoute(s, 'nightwatch', 'clocktower_witness', 'started', '取得染着冷灰的铜质铭牌');
  addLog(s, '你循着停摆钟楼的午夜敲响追查到一名失去影子的伤者。黑风衣人封锁现场前，你捡到一枚染着冷灰的铜质铭牌。你无法解释所见，但证物真实存在。', 'event');
  addLog(s, '✦ 异常记录已建立。你可以把证物交给圣赛琳娜教堂的伊芙琳；也可以就此停下，继续普通生活。', 'system');
  const receipt: CheckReceipt = { hoursElapsed: 3, effects: [
    receiptEntry('energy', applied[0]), receiptEntry('san', applied[1]),
    receiptEntry('item:anomaly_evidence', applied[2]), receiptEntry('flag:met_beyonder', applied[3]), hoursReceipt(3),
    { id: 'state:awareness', applied: true, before: awarenessBefore, after: s.awareness },
    { id: 'lead:nightwatch_clocktower', applied: true, before: leadBefore, after: lead.stage },
    { id: 'route:nightwatch', applied: true },
  ] };
  recordExplorationAttempt(s, check, startedAt);
  recordCheckAttempt(s, internal, request.context, receipt, startedAt);
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
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
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
  if (s.stats.energy < energyCost(s, 20)) return { ok: false, msg: '你当前的状态撑不住四小时夜间观察。' };
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, 20) }, { k: 'san', v: -2 }]);
  lead.status = 'qualified';
  lead.routeStep = 'offer_pending';
  addLog(s, '你在封锁线外跟完整整一班，只记录、不触碰、不擅自追逐。天亮前，伊芙琳确认你能服从安全边界，并向你说明不眠者候选名额。', 'event');
  addLog(s, '✦ 审查通过。下一步是听取正式报价；在最终承诺前，你仍可退出。', 'system');
  recordOrganizationRoute(s, 'nightwatch', 'night_observation', 'passed', '完成封锁线外围观察勤务');
  advanceHours(s, 4);
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
const TRADE_FAIR_ROUTE_STATUSES = new Set(['contacted', 'qualified', 'member', 'offer_pending', 'committed']);
export const TRADE_FAIR_SCHEDULE_LABEL = '周三、周六 22:00–2:00';
export type TradeFairConfirmationMode = 'materials' | 'characteristic' | 'purchased_dose';

function validTradeFairInvitation(s: GameState): boolean {
  const invitation = s.tradeFair?.invitation;
  if (!invitation) return false;
  if (invitation.sourceKind === 'organization') {
    const organizationId = invitation.sourceId as OrganizationId;
    return organizationId !== 'nightwatch'
      && !!ORGANIZATIONS.find(org => org.id === organizationId)
      && TRADE_FAIR_ROUTE_STATUSES.has(organizationRoute(s, organizationId).status);
  }
  return invitation.sourceId === 'victor'
    && organizationRoute(s, 'iron_and_blood').history.some(record => record.step === 'trade_fair_invitation:victor'
      && record.outcome === 'passed' && record.evidenceId === 'trade_fair_invitation');
}

export function hasTradeFairInvitation(s: GameState): boolean {
  return validTradeFairInvitation(s) && s.intel.includes('trade_fair_invitation');
}

export function tradeFairInvitationIssue(s: GameState, sourceId: string): string | null {
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
  if (isBeyonder(s)) return '这条通用入门交易路线只面向尚未成为非凡者的人。';
  if (s.atWork) return '工作期间不能索取地下交易会邀请。';
  if (hasTradeFairInvitation(s)) return '你已经持有一份可核验的交易会担保邀请。';
  if (sourceId === 'victor') {
    if (s.currentLocation?.locationId !== 'black_market') return '需要在黑市后巷当面请维克多作保。';
    if (!s.intel.includes('black_market')) return '你还没有掌握黑市的开门暗号。';
    const trustIssue = trustedNpcIssue(s, 'victor', VISIT_FAVOR);
    if (trustIssue) return trustIssue;
    if (npcLocation(NPCS.find(npc => npc.id === 'victor')!, s.day, s.hour) !== '黑市后巷') return '维克多此刻不在黑市后巷办理担保。';
    return null;
  }
  const organizationId = sourceId as OrganizationId;
  if (organizationId === 'nightwatch') return '值夜者的官方渠道不为地下通用交易会作保。';
  if (!ORGANIZATIONS.find(org => org.id === organizationId)
    || !TRADE_FAIR_ROUTE_STATUSES.has(organizationRoute(s, organizationId).status)) {
    return '需要先与一个可信组织建立正式接触，才能取得交易会担保。';
  }
  return null;
}

export function requestTradeFairInvitation(s: GameState, sourceId: string): ActionResult {
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return { ok: false, msg: encounterIssue };
  const issue = tradeFairInvitationIssue(s, sourceId);
  if (issue) return { ok: false, msg: issue };
  const sourceKind = sourceId === 'victor' ? 'npc' : 'organization';
  s.tradeFair.invitation = { sourceKind, sourceId, acquiredDay: s.day, acquiredHour: s.hour };
  if (!s.intel.includes('trade_fair_invitation')) s.intel.push('trade_fair_invitation');
  if (!s.intel.includes('black_market')) s.intel.push('black_market');
  if (sourceId === 'victor') {
    recordOrganizationRoute(s, 'iron_and_blood', 'trade_fair_invitation:victor', 'passed', '维克多仅为通用交易会作保，不等同于组织接纳', 'trade_fair_invitation');
  }
  addLog(s, `你取得了一份有担保来源的秘密交易会邀请。地点与日程已核对为：黑市后巷，${TRADE_FAIR_SCHEDULE_LABEL}。购买不会锁定途径；真正调配或服食前还需做一次不可逆确认。`, 'good');
  return { ok: true };
}

export function isTradeFairOpen(s: GameState): boolean {
  if (!hasTradeFairInvitation(s) || s.currentLocation?.locationId !== 'black_market') return false;
  const victor = NPCS.find(npc => npc.id === 'victor');
  return !!victor && npcLocation(victor, s.day, s.hour) === '黑市后巷';
}

export function tradeFairAccessIssue(s: GameState): string | null {
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
  if (!hasTradeFairInvitation(s)) return '你没有可核验的交易会邀请与担保日程。';
  if (s.currentLocation?.locationId !== 'black_market') return '需要亲自抵达邀请指定的黑市后巷。';
  if (!isTradeFairOpen(s)) return `交易会只在${TRADE_FAIR_SCHEDULE_LABEL}营业。`;
  return null;
}

function committedPathwayId(s: GameState): string | null {
  return Object.entries(s.pathwayLeads).find(([, lead]) => lead.commitment)?.[0] ?? null;
}

function hasOfficialNightwatchCommitment(s: GameState): boolean {
  const route = organizationRoute(s, 'nightwatch');
  if (route.status !== 'committed' || !route.selectedPathway) return false;
  const lead = pathwayLead(s, route.selectedPathway);
  return lead.commitment && lead.organizationId === 'nightwatch';
}

export function getTradeFairCatalog(s: GameState): readonly TradeFairProductDef[] {
  if (tradeFairAccessIssue(s) || isBeyonder(s) || hasOfficialNightwatchCommitment(s)) return [];
  const locked = committedPathwayId(s);
  return TRADE_FAIR_PRODUCTS.filter(product => !locked || product.pathwayId === locked);
}

export function tradeFairProductIssue(s: GameState, productId: string): string | null {
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
  const access = tradeFairAccessIssue(s);
  if (access) return access;
  if (isBeyonder(s)) return '成为非凡者后不能再使用凡人序列9入门货单。';
  if (hasOfficialNightwatchCommitment(s)) return '值夜者的官方途径已进入监督流程，不能改用地下交易会商品。';
  const product = TRADE_FAIR_PRODUCTS.find(candidate => candidate.id === productId);
  if (!product || !getTradeFairCatalog(s).some(candidate => candidate.id === productId)) return '这件商品不在当前担保货单中。';
  if ((s.tradeFair.stock[product.id] ?? 0) <= 0) return '这件固定商品本期已经售罄。';
  if (product.kind === 'formula' && product.formulaId && s.formulas.includes(product.formulaId)) return '这份配方你已经持有。';
  if (s.pence < product.price) return '钱不够。';
  return null;
}

export function buyTradeFairProduct(s: GameState, productId: string): ActionResult {
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return { ok: false, msg: encounterIssue };
  const issue = tradeFairProductIssue(s, productId);
  if (issue) return { ok: false, msg: issue };
  const product = TRADE_FAIR_PRODUCTS.find(candidate => candidate.id === productId)!;
  s.pence -= product.price;
  s.tradeFair.stock[product.id]--;
  s.tradeFair.purchasedCounts[product.id] = (s.tradeFair.purchasedCounts[product.id] ?? 0) + 1;
  if (product.kind === 'formula' && product.formulaId) {
    if (!s.formulas.includes(product.formulaId)) s.formulas.push(product.formulaId);
    const lead = pathwayLead(s, product.pathwayId);
    if (!lead.commitment) lead.currentSource = 'trade_fair';
    lead.formulaStatus = 'verified';
    lead.history.push({ day: s.day, step: `trade_fair_formula:${product.formulaId}`, outcome: 'passed', note: '担保货单核验' });
    addLog(s, `你买下了经担保核验的【${formulaName(product.formulaId)}】。这笔购买仍未锁定途径。`, 'good');
  } else if (product.itemId) {
    s.items[product.itemId] = (s.items[product.itemId] ?? 0) + 1;
    addLog(s, `你按固定货单买下了【${findItem(product.itemId)?.name ?? product.itemId}】。主持方核验了封签与途径，但购买仍未锁定选择。`, 'info');
  }
  return { ok: true };
}

export function verifiedTradeFairItemQuantity(s: GameState, itemId: string): number {
  const guaranteed = TRADE_FAIR_PRODUCTS.filter(product => product.itemId === itemId).reduce((sum, product) => {
    const bought = s.tradeFair?.purchasedCounts?.[product.id] ?? 0;
    const consumed = s.tradeFair?.consumedPurchasedCounts?.[product.id] ?? 0;
    return sum + Math.max(0, bought - consumed);
  }, 0);
  return Math.min(Math.max(0, s.items?.[itemId] ?? 0), guaranteed);
}

export function isTradeFairCharacteristicIdentified(s: GameState, itemId: string): boolean {
  const item = findItem(itemId);
  return item?.seq9Product?.kind === 'characteristic'
    && (verifiedTradeFairItemQuantity(s, itemId) > 0 || s.tradeFair?.identifiedCharacteristicIds?.includes(itemId));
}

function consumeItemWithTradeCredential(s: GameState, itemId: string) {
  s.items[itemId] = Math.max(0, (s.items[itemId] ?? 0) - 1);
  const product = TRADE_FAIR_PRODUCTS.find(candidate => candidate.itemId === itemId
    && (s.tradeFair.purchasedCounts[candidate.id] ?? 0) > (s.tradeFair.consumedPurchasedCounts[candidate.id] ?? 0));
  if (product) s.tradeFair.consumedPurchasedCounts[product.id] = (s.tradeFair.consumedPurchasedCounts[product.id] ?? 0) + 1;
}

function characteristicVerifiedForPathway(s: GameState, pathwayId: string): boolean {
  const itemId = `${pathwayId}9_characteristic`;
  const knowledge = s.itemKnowledge?.[itemId];
  return (s.items[itemId] ?? 0) > 0 && (isTradeFairCharacteristicIdentified(s, itemId)
    || !!knowledge?.spiritVisionInspected && knowledge.identifiedAsOccult === true);
}

export function appraiseCharacteristicAtTradeFair(s: GameState, itemId: string): ActionResult {
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return { ok: false, msg: encounterIssue };
  const access = tradeFairAccessIssue(s);
  if (access) return { ok: false, msg: access };
  const item = findItem(itemId);
  if (!item?.seq9Product || item.seq9Product.kind !== 'characteristic' || (s.items[itemId] ?? 0) <= 0) {
    return { ok: false, msg: '你没有可交给担保人核验的完整序列9特性。' };
  }
  if (!s.confirmedBeyonderDeaths.some(record => record.characteristicItemId === itemId)) {
    return { ok: false, msg: '这份残留缺少可核验的死亡与封存记录，交易会拒绝为它背书。' };
  }
  if (isTradeFairCharacteristicIdentified(s, itemId)) return { ok: false, msg: '这份特性已经完成担保鉴定。' };
  if (s.pence < 24) return { ok: false, msg: '付不起这次封签与鉴定费用。' };
  s.pence -= 24;
  s.tradeFair.identifiedCharacteristicIds.push(itemId);
  addLog(s, `担保人核对死亡记录、封存时间与灵性结构后，确认这是【${findPathway(item.seq9Product.pathwayId)?.name}序列9】的完整特性。它不能生吞，只能连同对应辅助材料调配。`, 'good');
  return { ok: true };
}

export function tradeFairConfirmationIssue(s: GameState, pathwayId: string, mode: TradeFairConfirmationMode): string | null {
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
  if (!isAtHome(s)) return '请先回到住处，在安全环境中完成不可逆的途径确认。';
  if (isBeyonder(s)) return '你已经是非凡者。';
  if (!hasTradeFairInvitation(s)) return '缺少可核验的交易会担保来源。';
  const pathway = findPathway(pathwayId);
  if (!pathway) return '途径数据缺失。';
  if (hasOfficialNightwatchCommitment(s) || pathwayLead(s, pathwayId).organizationId === 'nightwatch') {
    return '值夜者的官方途径必须继续接受教会监督，不能改用地下交易会的成品或调配路线。';
  }
  const locked = committedPathwayId(s);
  if (locked && locked !== pathwayId) return `资格已经锁定到${findPathway(locked)?.name ?? locked}，不能改用另一途径。`;
  const lead = pathwayLead(s, pathwayId);
  if (locked === pathwayId && lead.preparationMode === (mode === 'purchased_dose' ? 'purchased_dose' : mode === 'characteristic' ? 'characteristic_brew' : 'trade_fair_brew')) {
    return '这条途径与准备方式已经完成确认。';
  }
  if (mode === 'purchased_dose') {
    if (verifiedTradeFairItemQuantity(s, `${pathwayId}9_potion`) <= 0) return '没有经该交易会担保的对应成品魔药。';
    return null;
  }
  if (!s.formulas.includes(`${pathwayId}9`) || lead.formulaStatus !== 'verified'
    || (!lead.organizationId && lead.currentSource !== 'trade_fair')) {
    return '需要先购买并留存该途径的担保序列9配方。';
  }
  if ((s.items[pathway.seq9.auxiliary] ?? 0) <= 0) return '缺少对应序列9辅助材料包。';
  if (mode === 'materials' && pathway.seq9.materials.some(itemId => (s.items[itemId] ?? 0) <= 0)) return '两件主材料必须完整备齐，不能与一份特性混搭。';
  if (mode === 'characteristic' && !characteristicVerifiedForPathway(s, pathwayId)) return '缺少已由可信方式鉴定的同途径序列9完整特性。';
  return null;
}

export function confirmTradeFairPathway(s: GameState, pathwayId: string, mode: TradeFairConfirmationMode): ActionResult {
  const issue = tradeFairConfirmationIssue(s, pathwayId, mode);
  if (issue) return { ok: false, msg: issue };
  const lead = pathwayLead(s, pathwayId);
  if (!lead.commitment) {
    lead.currentSource = 'trade_fair';
    lead.organizationId = undefined;
    lead.commitment = true;
  }
  lead.formulaStatus = mode === 'purchased_dose' ? lead.formulaStatus : 'verified';
  lead.preparationMode = mode === 'purchased_dose' ? 'purchased_dose' : mode === 'characteristic' ? 'characteristic_brew' : 'trade_fair_brew';
  lead.routeStep = 'trade_fair_confirmed';
  lead.history.push({ day: s.day, step: `trade_fair_commit:${mode}`, outcome: 'passed', note: '通用地下交易会途径确认' });
  addLog(s, `你确认以秘密交易会担保来源进入【${findPathway(pathwayId)?.name}】。从这一刻起，其他途径的入门魔药对你永久关闭。`, 'system');
  return { ok: true };
}

function recordConfirmedBeyonderDeath(s: GameState, sourceId: string, cause: 'event' | 'hunt', settlementAttemptId?: string): boolean {
  const source = BEYONDER_DEATH_SOURCES.find(candidate => candidate.id === sourceId);
  const activeEvent = currentEvent(s);
  if (!source || s.confirmedBeyonderDeaths.some(record => record.sourceId === sourceId || record.npcId === source.npcId)) return false;
  if (cause === 'event' && (!source.eventId || activeEvent?.id !== source.eventId || !isTradeFairOpen(s))) return false;
  if (cause === 'hunt') {
    const hunt = s.activeHunt;
    const target = source.huntTargetId ? huntTargetDef(source.huntTargetId) : undefined;
    const allPrepared = hunt && Object.values(hunt.preparations).every(Boolean);
    const authorizedPhase = hunt?.phase === 'ready'
      || (hunt?.phase === 'combat' && hunt.confrontationCause === 'failed_strike');
    const settlement = settlementAttemptId ? s.checkAttempts.find(attempt => attempt.attemptId === settlementAttemptId) : undefined;
    const validSettlement = settlement?.outcome === 'passed'
      && (settlement.checkId === 'hunt_masked_smuggler_strike' || settlement.checkId === 'hunt_masked_smuggler_combat');
    if (!hunt || !target || hunt.targetId !== target.id || !allPrepared || !authorizedPhase || !validSettlement) return false;
  }
  s.confirmedBeyonderDeaths.push({
    sourceId, npcId: source.npcId, pathwayId: source.pathwayId, sequence: 9,
    characteristicItemId: source.characteristicItemId, confirmedDay: s.day, confirmedHour: s.hour, cause,
    ...(cause === 'hunt' ? { settlementAttemptId } : {}),
  });
  s.items[source.characteristicItemId] = (s.items[source.characteristicItemId] ?? 0) + 1;
  return true;
}

function extractCharacteristicFromConfirmedDeath(s: GameState, sourceId: string): boolean {
  return recordConfirmedBeyonderDeath(s, sourceId, 'event');
}

export function buyItem(s: GameState, itemId: string, price: number, sellerId?: string): ActionResult {
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return { ok: false, msg: criticalIssue };
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return { ok: false, msg: encounterIssue };
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
  const woundIssue = woundActionIssue(s, 'shop');
  if (woundIssue) return { ok: false, msg: woundIssue };
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return { ok: false, msg: encounterIssue };
  const shop = SHOP_DEFS.find(candidate => candidate.id === shopId);
  if (!shop || s.currentLocation?.locationId !== shop.locationId) return { ok: false, msg: '需要亲自到对应店铺才能购买。' };
  if (!shopOpenAt(shopId, s.hour)) return { ok: false, msg: '店铺现在没有营业。' };
  const identityStatus = getAreaSuspicionStatus(s, shop.locationId);
  if (isPublicIdentityCheckpoint(shop.locationId) && identityStatus.value >= 70 && !getIdentityCoverStatus(s).active) {
    return { ok: false, msg: '店主正在按巡查告示核对可疑者特征，不愿在身份没有说明清楚时继续交易。' };
  }
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
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return { ok: false, msg: encounterIssue };
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
  const committed = committedPathwayId(s);
  if (committed && committed !== pathwayId) return { ok: false, missing: [`资格已锁定到${findPathway(committed)?.name ?? committed}途径`] };
  const lead = pathwayLead(s, pathwayId);
  if (!lead.commitment) return { ok: false, missing: ['尚未完成不可逆的途径确认'] };
  if (lead.organizationId === 'nightwatch' && lead.preparationMode !== 'official_dose') {
    return { ok: false, missing: ['值夜者官方途径不能改用地下交易会商品'] };
  }
  const tradeFairRoute = lead.currentSource === 'trade_fair' && !lead.organizationId && lead.routeStep === 'trade_fair_confirmed';
  let organizationRouteValid = false;
  let expectedPreparation: ReturnType<typeof organizationPreparation> | null = null;
  if (lead.organizationId) {
    const orgRoute = organizationRoute(s, lead.organizationId);
    organizationRouteValid = orgRoute.status === 'committed' && orgRoute.selectedPathway === pathwayId && joinedOrganization(s) === lead.organizationId;
    expectedPreparation = organizationPreparation(lead.organizationId);
  }
  if (!tradeFairRoute && !organizationRouteValid) return { ok: false, missing: ['组织记录或交易会担保与途径确认不匹配'] };

  if (lead.preparationMode === 'official_dose') {
    if (!expectedPreparation || lead.currentSource !== expectedPreparation.source || lead.preparationMode !== expectedPreparation.mode) {
      return { ok: false, missing: ['途径来源或准备方式与组织记录不匹配'] };
    }
    if (!lead.organizationId || !['nightwatch', 'psychology_alchemists'].includes(lead.organizationId) || lead.routeStep !== 'dose_ready') {
      return { ok: false, missing: ['官方成品魔药资格与当前途径不匹配'] };
    }
    return { ok: true, missing: [], mode: 'official_dose' };
  }
  if (lead.preparationMode === 'purchased_dose') {
    const itemId = `${pathwayId}9_potion`;
    return verifiedTradeFairItemQuantity(s, itemId) > 0
      ? { ok: true, missing: [], mode: 'purchased_dose' }
      : { ok: false, missing: ['缺少交易会担保的对应成品魔药'], mode: 'purchased_dose' };
  }
  if (!s.formulas.includes(pathwayId + '9')) return { ok: false, missing: ['没有配方'] };
  if (lead.formulaStatus !== 'verified') return { ok: false, missing: ['配方尚未由可信渠道验证'] };
  if (!['self_brew', 'supervised_brew', 'trade_fair_brew', 'characteristic_brew'].includes(lead.preparationMode ?? '')) {
    return { ok: false, missing: ['尚未解锁明确的调配准备方式'] };
  }
  if (lead.preparationMode === 'self_brew' && !s.knowledge.includes('potion_brew')) {
    return { ok: false, missing: ['自行调配需要可信训练与魔药调配知识'] };
  }
  if (lead.preparationMode === 'supervised_brew' && (!expectedPreparation
    || lead.currentSource !== expectedPreparation.source || expectedPreparation.mode !== 'supervised_brew')) {
    return { ok: false, missing: ['途径来源或准备方式与组织记录不匹配'] };
  }
  if ((s.items[pw.seq9.auxiliary] ?? 0) <= 0) return { ok: false, missing: [pw.seq9.auxiliary], mode: lead.preparationMode };
  if (lead.preparationMode === 'characteristic_brew') {
    return characteristicVerifiedForPathway(s, pathwayId)
      ? { ok: true, missing: [], mode: 'characteristic_brew' }
      : { ok: false, missing: ['缺少已鉴定的同途径序列9完整特性'], mode: 'characteristic_brew' };
  }
  const missing = pw.seq9.materials.filter(m => (s.items[m] ?? 0) <= 0);
  return { ok: missing.length === 0, missing, mode: lead.preparationMode };
}

export function drinkPotion(s: GameState, pathwayId: string): ActionResult {
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return { ok: false, msg: criticalIssue };
  if (s.currentLocation) return { ok: false, msg: '需要先回到住处或正式监督场所再服食魔药。' };
  if (s.atWork) return { ok: false, msg: '工作期间不能服食魔药。' };
  const check = canDrink(s, pathwayId);
  if (!check.ok) return { ok: false, msg: '条件不足：' + check.missing.join('、') };
  if (check.mode === 'official_dose') return drinkOfficialDose(s, pathwayId);
  const pw = findPathway(pathwayId)!;
  // 确定性检定：准备分 = 85 + 理智修正 + 知识加成 + 神秘学技能×2 − 污染×0.3，≥60 成功
  const rate = Math.round(85 + (s.stats.san - 50) * 0.1 + (s.knowledge.includes('potion_brew') ? 5 : 0)
    + (check.mode === 'purchased_dose' ? 5 : 0) + s.skills.occult * 2 - s.stats.cor * 0.3);
  addLog(s, `——服食魔药：${pw.name}·序列9——`, 'system');
  if (check.mode === 'purchased_dose') {
    addLog(s, '你复核交易会担保封签、批次与途径确认。成品已经调配完成，但服食本身仍是不可逆的风险。', 'system');
    consumeItemWithTradeCredential(s, `${pathwayId}9_potion`);
  } else if (check.mode === 'characteristic_brew') {
    addLog(s, '你把已鉴定的完整特性作为两件主材料的整组替代，并加入对应辅助材料。没有混入任何单件主材，也没有尝试生吞特性。', 'system');
    consumeItemWithTradeCredential(s, `${pathwayId}9_characteristic`);
    consumeItemWithTradeCredential(s, pw.seq9.auxiliary);
  } else {
    addLog(s, '你逐项复核两件主材料、辅助材料包与调配记录。瓶中的液体在煤气灯下泛着不祥的微光，任何遗漏都只能由身体承担。', 'system');
    for (const itemId of pw.seq9.materials) consumeItemWithTradeCredential(s, itemId);
    consumeItemWithTradeCredential(s, pw.seq9.auxiliary);
  }
  advanceHours(s, 1);
  if (rate >= 60) {
    s.pathwayId = pathwayId;
    s.sequence = 9;
    grantSequence9CoreAbilities(s);
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

export function drinkPurchasedPotion(s: GameState, pathwayId: string): ActionResult {
  const lead = pathwayLead(s, pathwayId);
  if (lead.preparationMode !== 'purchased_dose') return { ok: false, msg: '需要先明确确认这条途径，并选择交易会担保成品作为准备方式。' };
  return drinkPotion(s, pathwayId);
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
  grantSequence9CoreAbilities(s);
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
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return criticalIssue;
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
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return { ok: false, msg: criticalIssue };
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
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return { ok: false, msg: criticalIssue };
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
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return { ok: false, msg: criticalIssue };
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
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return { ok: false, msg: criticalIssue };
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
  if (s.sequence !== 9) return { ok: false, missing: ['目前只开放到序列8'] };
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
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return { ok: false, msg: criticalIssue };
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

// ============ 有准备的猎杀与后果 ============
type HuntActionId = 'identify' | HuntPreparationKey | 'strike';

const HUNT_PREPARATION_META: Record<HuntPreparationKey, { checkId: string; clueId: string; label: string }> = {
  routine: { checkId: 'hunt_masked_smuggler_routine', clueId: 'masked_smuggler_routine', label: '观察作息与离场习惯' },
  secludedMeeting: { checkId: 'hunt_masked_smuggler_isolation', clueId: 'masked_smuggler_secluded_meeting', label: '安排只有两人的会面' },
  escapeRoute: { checkId: 'hunt_masked_smuggler_escape_route', clueId: 'masked_smuggler_escape_route', label: '勘察避开巡夜人的退路' },
  ambush: { checkId: 'hunt_masked_smuggler_ambush', clueId: 'masked_smuggler_ambush_position', label: '选择能够取得先手的位置' },
};

const freshActiveHunt = (targetId: string): ActiveHunt => ({
  targetId, phase: 'investigating', identityConfirmed: false, suspicion: 0,
  preparations: { routine: false, secludedMeeting: false, escapeRoute: false, ambush: false },
});

function huntTargetAvailableIssue(s: GameState, target: HuntTargetDef): string | null {
  if (huntTargetIsDead(s, target)) return '这个目标已经死亡。';
  if (s.flags[`hunt_target_departed:${target.id}`]) return '目标已经离开廷根，原有计划失效。';
  if (!isMet(s, target.npcId)) return '你还没有与这个人正式接触，无法建立可靠计划。';
  if (s.currentLocation?.locationId !== target.locationId) return '必须亲临目标活动的地点。';
  const npc = findAnyNPC(s, target.npcId);
  if (!npc || !npcAvailable(npc, s.day, s.hour) || !isTradeFairOpen(s)) return '目标此刻不在能够接触的场合。';
  return null;
}

function huntCheckId(action: HuntActionId): string {
  if (action === 'identify') return 'hunt_masked_smuggler_identify';
  if (action === 'strike') return 'hunt_masked_smuggler_strike';
  return HUNT_PREPARATION_META[action].checkId;
}

export function huntActionIssue(s: GameState, targetId: string, action: HuntActionId): string | null {
  const encounterIssue = activeEncounterIssue(s);
  if (encounterIssue) return encounterIssue;
  const woundIssue = woundActionIssue(s, 'active_hunt');
  if (woundIssue) return woundIssue;
  if (s.atWork) return '工作期间不能跟踪或接触目标。';
  const target = huntTargetDef(targetId);
  if (!target) return '没有可核验的目标资料。';
  const availableIssue = huntTargetAvailableIssue(s, target);
  if (availableIssue) return availableIssue;
  const hunt = s.activeHunt;
  if (hunt && hunt.targetId !== targetId) return '你已经在调查另一个目标。';
  if (!hunt && action !== 'identify') return '先确认对方是否真的不是普通人。';
  if (!hunt && s.nemesis) return '已有敌人在暗中盯着你；此时再制造新的仇家，退路无法保证。';
  if (action === 'identify' && hunt?.identityConfirmed) return '对方的非凡者身份已经由多项迹象交叉确认。';
  if (action !== 'identify' && !hunt?.identityConfirmed) return '现有证据还不能确认对方是非凡者。';
  if (action !== 'identify' && action !== 'strike' && hunt!.preparations[action]) return '这一项准备已经完成。';
  if (action !== 'identify' && action !== 'routine' && action !== 'strike' && !hunt!.preparations.routine) return '先观察目标的作息与离场习惯。';
  if (action === 'strike' && (!Object.values(hunt!.preparations).every(Boolean) || hunt!.phase !== 'ready')) {
    return '必须先确认单独会面、撤离路线和偷袭先手，任何一项缺失都不能动手。';
  }
  const internal = evaluateExplorationCheckInternal(s, huntCheckId(action));
  if (!internal.eligible && internal.reason !== 'insufficient') return '当前线索或现场条件不足。';
  const repeatedIssue = repeatedBlockedExplorationIssue(s, internal);
  if (repeatedIssue) return repeatedIssue;
  const minimumEnergy = action === 'strike' ? 30 : 12;
  if (s.stats.energy <= energyCost(s, minimumEnergy)) return '你当前的状态不足以维持这一步行动。';
  return null;
}

function raiseHuntSuspicion(s: GameState, hunt: ActiveHunt): { before: number; after: number } {
  const before = hunt.suspicion;
  hunt.suspicion = Math.min(3, hunt.suspicion + 1);
  if (hunt.suspicion >= 2) {
    hunt.phase = 'confronted';
    hunt.confrontationCause = 'alerted';
    addLog(s, '目标突然停止离场，转身堵住你回到灯火下的方向。先前的观察已经引起警觉，现在只能设法脱身。', 'bad');
  }
  return { before, after: hunt.suspicion };
}

export function investigateHuntTarget(s: GameState, targetId: string): ActionResult {
  const issue = huntActionIssue(s, targetId, 'identify');
  if (issue) return { ok: false, msg: issue };
  const startedAt = { day: s.day, hour: s.hour };
  const request = explorationCheckRequest(s, 'hunt_masked_smuggler_identify', startedAt);
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  const passed = internal.outcome === 'passed';
  const hunt = s.activeHunt ??= freshActiveHunt(targetId);
  const effects = applyEffects(s, [{ k: 'energy', v: -energyCost(s, passed ? 10 : 6) }]);
  const receipt: CheckReceipt = { hoursElapsed: passed ? 2 : 1, effects: [receiptEntry('energy', effects[0]), hoursReceipt(passed ? 2 : 1)] };
  if (passed) {
    hunt.identityConfirmed = true;
    hunt.phase = 'preparing';
    receipt.effects.push({ id: 'hunt:identity', applied: true, before: false, after: true });
    addLog(s, '你把对方避开的象征、异常准确的判断和交易时残留的灵性反应逐项交叉：现有证据足以确认他不是普通人，但仍不能凭此知道具体途径。', 'good');
  } else {
    const suspicion = raiseHuntSuspicion(s, hunt);
    receipt.effects.push({ id: 'hunt:suspicion', applied: true, ...suspicion, actualDelta: suspicion.after - suspicion.before });
    addLog(s, '现有观察不足以排除精心训练的江湖手法。继续盯同一处细节只会暴露自己，需要先补充能力或调查经验。', 'info');
  }
  recordCheckAttempt(s, internal, request.context, receipt, startedAt);
  advanceHours(s, passed ? 2 : 1);
  return { ok: true, outcome: passed ? 'passed' : 'blocked' };
}

export function prepareHuntStep(s: GameState, targetId: string, step: HuntPreparationKey): ActionResult {
  const issue = huntActionIssue(s, targetId, step);
  if (issue) return { ok: false, msg: issue };
  const meta = HUNT_PREPARATION_META[step];
  const startedAt = { day: s.day, hour: s.hour };
  const request = explorationCheckRequest(s, meta.checkId, startedAt);
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  const passed = internal.outcome === 'passed';
  const hunt = s.activeHunt!;
  const effects = applyEffects(s, [{ k: 'energy', v: -energyCost(s, passed ? 10 : 6) }]);
  const receipt: CheckReceipt = { hoursElapsed: passed ? 2 : 1, effects: [receiptEntry('energy', effects[0]), hoursReceipt(passed ? 2 : 1)] };
  if (passed) {
    hunt.preparations[step] = true;
    acquireClue(s, meta.clueId, step === 'routine' || step === 'secludedMeeting' ? 'npc' : 'location', step === 'routine' || step === 'secludedMeeting' ? huntTargetDef(targetId)!.npcId : huntTargetDef(targetId)!.locationId);
    receipt.effects.push({ id: `clue:${meta.clueId}`, applied: true, before: false, after: true });
    if (Object.values(hunt.preparations).every(Boolean)) hunt.phase = 'ready';
    addLog(s, `${meta.label}：准备完成。${hunt.phase === 'ready' ? '目标、单独会面、退路与先手都已核对；现在才具备动手条件。' : '这只是计划的一部分，还不能据此动手。'}`, 'good');
  } else {
    const suspicion = raiseHuntSuspicion(s, hunt);
    receipt.effects.push({ id: 'hunt:suspicion', applied: true, ...suspicion, actualDelta: suspicion.after - suspicion.before });
    addLog(s, `${meta.label}没有形成可靠方案。你及时停手，没有把猜测写成“已经准备好”。`, 'info');
  }
  recordCheckAttempt(s, internal, request.context, receipt, startedAt);
  advanceHours(s, passed ? 2 : 1);
  return { ok: true, outcome: passed ? 'passed' : 'blocked' };
}

function completeHuntDeath(s: GameState, target: HuntTargetDef, settlementAttemptId: string, initiatingAttemptId?: string): boolean {
  if (!recordConfirmedBeyonderDeath(s, target.deathSourceId, 'hunt', settlementAttemptId)) return false;
  const settlementAttempt = s.checkAttempts.find(attempt => attempt.attemptId === settlementAttemptId);
  if (!settlementAttempt) return false;
  const infamyGain = 25;
  const lawAttentionGain = 8;
  s.infamy = Math.max(0, s.infamy + infamyGain);
  s.lawAttention = Math.max(0, s.lawAttention + lawAttentionGain);
  s.murderRecords.push({
    targetId: target.id, npcId: target.npcId, deathSourceId: target.deathSourceId,
    day: s.day, hour: s.hour, infamyGain, lawAttentionGain, avengerName: target.avenger.name,
    settlementAttemptId, ...(initiatingAttemptId ? { initiatingAttemptId } : {}),
  });
  recordAreaSuspicion(s, target.locationId, 'hunt_death', 20, settlementAttempt);
  s.relations[target.npcId] = -100;
  s.nemesis = structuredClone(target.avenger);
  addLog(s, '短促的冲突结束后，尸体旁缓慢析出一团异常残留。你只能确认它来自刚死去的非凡者；在可信鉴定前，不能判断途径，更不能直接服食。', 'bad');
  addLog(s, '现场没有目击者，预先记录的退路也避开了巡夜人，但一个熟人的失踪不会永远无人追问。地下圈子开始流传关于你的低语。', 'bad');
  addLog(s, '几天内，你反复看到同一双灰色手套出现在远处。死者的朋友已经沿交易记录追了上来。', 'bad');
  s.activeHunt = null;
  return true;
}

export function executeHunt(s: GameState, targetId: string): ActionResult {
  const issue = huntActionIssue(s, targetId, 'strike');
  if (issue) return { ok: false, msg: issue };
  const target = huntTargetDef(targetId)!;
  const startedAt = { day: s.day, hour: s.hour };
  const request = explorationCheckRequest(s, 'hunt_masked_smuggler_strike', startedAt);
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  consumeRevolverRound(s);
  const passed = internal.outcome === 'passed';
  const effects = applyEffects(s, [{ k: 'energy', v: -energyCost(s, 25) }, { k: 'san', v: passed ? -6 : -4 }]);
  const receipt: CheckReceipt = { hoursElapsed: 1, effects: [receiptEntry('energy', effects[0]), receiptEntry('san', effects[1]), hoursReceipt(1)] };
  advanceHours(s, 1);
  if (passed) {
    const beforeInfamy = s.infamy;
    const beforeLaw = s.lawAttention;
    receipt.effects.push(
      { id: 'hunt:death', applied: true, before: false, after: true },
      { id: 'infamy', applied: true, before: beforeInfamy, after: beforeInfamy + 25, actualDelta: 25 },
      { id: 'law_attention', applied: true, before: beforeLaw, after: beforeLaw + 8, actualDelta: 8 },
      { id: 'nemesis', applied: true, before: false, after: true },
    );
  } else {
    s.activeHunt!.phase = 'combat';
    s.activeHunt!.confrontationCause = 'failed_strike';
    s.activeHunt!.combatRound = freshCombatRound(true, s.activeHunt!.preparations.ambush ? 1 : 0);
    receipt.effects.push({ id: 'hunt:combat', applied: true, before: 'ready', after: 'combat' });
    addLog(s, '偷袭没有按计划结束冲突。目标避开要害并封住出口，先手已经失去，必须正面应战。', 'bad');
  }
  const attempt = recordCheckAttempt(s, internal, request.context, receipt, startedAt);
  if (passed) {
    if (!completeHuntDeath(s, target, attempt.attemptId)) return { ok: false, msg: '死亡来源无法完成权威结算。' };
  } else {
    s.activeHunt!.initiatingAttemptId = attempt.attemptId;
  }
  return { ok: true, outcome: passed ? 'passed' : 'blocked' };
}

export function getHuntPlanView(s: GameState) {
  const hunt = s.activeHunt;
  if (!hunt) {
    const target = HUNT_TARGET_DEFS.find(candidate => s.currentLocation?.locationId === candidate.locationId
      && isMet(s, candidate.npcId) && !huntTargetIsDead(s, candidate) && !s.flags[`hunt_target_departed:${candidate.id}`]);
    if (!target) return null;
    return { targetId: target.id, label: target.publicLabel, identityConfirmed: false, phase: 'investigating' as const, suspicionSignal: null, preparations: freshActiveHunt(target.id).preparations };
  }
  const target = huntTargetDef(hunt.targetId);
  if (!target) return null;
  return {
    targetId: target.id, label: target.publicLabel, identityConfirmed: hunt.identityConfirmed, phase: hunt.phase,
    suspicionSignal: hunt.suspicion === 0 ? null : hunt.suspicion === 1 ? '对方开始留意周围反复出现的面孔。' : '对方已经察觉你的调查。',
    preparations: { ...hunt.preparations },
  };
}

export function getHuntEncounterView(s: GameState) {
  const hunt = s.activeHunt;
  const target = hunt ? huntTargetDef(hunt.targetId) : undefined;
  if (!hunt || !target || (hunt.phase !== 'confronted' && hunt.phase !== 'combat')) return null;
  return hunt.phase === 'combat'
    ? { phase: 'combat' as const, title: '先手已经失去', text: '目标不再掩饰异常能力。你只能先挡住这次攻击，再决定能否活着离开。', actionLabel: '正面应战并寻找结束机会',
      combatRound: hunt.combatRound ? {
        round: hunt.combatRound.round, finisherReady: hunt.combatRound.finisherReady,
        signal: combatRoundSignal(hunt.combatRound),
        enemyIntent: enemyIntentSignal('seer_smuggler', hunt.combatRound.round),
      } : { round: 2, finisherReady: true, signal: '最危险的一轮已经过去，现在必须决定如何结束冲突。', enemyIntent: '对方正在寻找下一次预判的落点。' } }
    : { phase: 'escape_choice' as const, title: '调查引起了警觉', text: '目标堵住通向灯火的方向，却还没有直接动手。若能利用既有退路脱身，这场冲突仍可避免。', actionLabel: '设法脱身' };
}

function markHuntTargetDeparted(s: GameState, target: HuntTargetDef, text: string) {
  s.flags[`hunt_target_departed:${target.id}`] = true;
  s.relations[target.npcId] = -100;
  s.activeHunt = null;
  s.currentLocation = null;
  addLog(s, text, 'bad');
}

export function attemptHuntEscape(s: GameState): ActionResult {
  const hunt = s.activeHunt;
  const target = hunt ? huntTargetDef(hunt.targetId) : undefined;
  if (!hunt || !target || hunt.phase !== 'confronted') return { ok: false, msg: '目前没有需要处理的猎杀对峙。' };
  const startedAt = { day: s.day, hour: s.hour };
  const request = explorationCheckRequest(s, 'hunt_masked_smuggler_escape', startedAt);
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  const passed = internal.outcome === 'passed';
  const effects = applyEffects(s, passed ? [{ k: 'energy', v: -12 }] : [{ k: 'energy', v: -16 }, { k: 'san', v: -3 }]);
  const receipt: CheckReceipt = { hoursElapsed: 1, effects: effects.map((effect, index) => receiptEntry(index === 0 ? 'energy' : 'san', effect)).concat(hoursReceipt(1)) };
  if (passed) {
    receipt.effects.push({ id: 'hunt:escaped', applied: true, before: 'confronted', after: 'departed' });
    markHuntTargetDeparted(s, target, '你借人流和事先看过的巷口甩开了对方。天亮前，蒙面货商撤离廷根；这条猎杀路线已经断掉。');
  } else {
    receipt.effects.push({ id: 'hunt:combat', applied: true, before: 'confronted', after: 'combat' });
    const impact = applyCombatImpact(s, 22, 6, 38);
    if (rescueFromFatalInjury(s, '你的退路被封死，第一轮袭击便让你重伤倒地。')) {
      markHuntTargetDeparted(s, target, '附近搬运工的呼喊惊退了目标；等你醒来时，对方已经离开廷根。');
    } else {
      hunt.phase = 'combat';
      hunt.combatRound = freshCombatRound(false);
      addLog(s, `你的转向被提前看穿，损失了${impact.hpDamage}点生命、${impact.spiritDamage}点精神值。目标封住最后一条退路，冲突已经无法避免。`, 'bad');
    }
  }
  recordCheckAttempt(s, internal, request.context, receipt, startedAt);
  advanceHours(s, 1);
  return { ok: true, outcome: passed ? 'passed' : 'blocked' };
}

export function huntCombatExchangeIssue(s: GameState, action: CombatRoundAction): string | null {
  const hunt = s.activeHunt;
  if (!hunt || hunt.phase !== 'combat') return '当前没有正在进行的正面交锋。';
  return combatExchangeIssue(s, hunt.combatRound, action);
}

export function performHuntCombatExchange(s: GameState, action: CombatRoundAction): ActionResult {
  const hunt = s.activeHunt;
  const target = hunt ? huntTargetDef(hunt.targetId) : undefined;
  if (!hunt || !target || hunt.phase !== 'combat' || !hunt.combatRound) return { ok: false, msg: '当前没有正在进行的正面交锋。' };
  const result = performCombatExchange(s, hunt.combatRound, action, Math.floor(target.power / 3) + 2, [], undefined, 'seer_smuggler');
  if (!result.ok) return result;
  if (rescueFromFatalInjury(s, '正面交锋令你重伤失去意识。')) {
    markHuntTargetDeparted(s, target, '路过者的呼喊惊退了目标；等你恢复意识时，对方已经离开廷根。');
  }
  return { ok: true, outcome: hunt.combatRound?.finisherReady ? 'passed' : 'blocked' };
}

export function performHuntCombatTechnique(s: GameState, techniqueId: string): ActionResult {
  const hunt = s.activeHunt;
  const target = hunt ? huntTargetDef(hunt.targetId) : undefined;
  const technique = combatTechniqueById(s, techniqueId);
  if (!hunt || !target || hunt.phase !== 'combat' || !hunt.combatRound || !technique) return { ok: false, msg: '当前无法使用这项战术。' };
  const result = performCombatExchange(s, hunt.combatRound, technique.effect.baseAction, Math.floor(target.power / 3) + 2, [], technique, 'seer_smuggler');
  if (!result.ok) return result;
  if (rescueFromFatalInjury(s, '正面交锋令你重伤失去意识。')) markHuntTargetDeparted(s, target, '路过者的呼喊惊退了目标；等你恢复意识时，对方已经离开廷根。');
  return { ok: true, outcome: hunt.combatRound?.finisherReady ? 'passed' : 'blocked' };
}

export function resolveHuntCombat(s: GameState): ActionResult {
  const hunt = s.activeHunt;
  const target = hunt ? huntTargetDef(hunt.targetId) : undefined;
  if (!hunt || !target || hunt.phase !== 'combat') return { ok: false, msg: '目前没有需要结算的猎杀战斗。' };
  if (hunt.combatRound && !hunt.combatRound.finisherReady) return { ok: false, msg: '还没有形成结束冲突的机会；先完成眼前的交锋。' };
  const startedAt = { day: s.day, hour: s.hour };
  const request = explorationCheckRequest(s, 'hunt_masked_smuggler_combat', startedAt);
  const internal = evaluateCheck(EXPLORATION_CHECKS, request);
  consumeRevolverRound(s);
  const passed = internal.outcome === 'passed';
  const effects = applyEffects(s, passed
    ? [{ k: 'energy', v: -25 }, { k: 'san', v: -4 }]
    : [{ k: 'energy', v: -35 }, { k: 'san', v: -10 }]);
  const receipt: CheckReceipt = { hoursElapsed: 1, effects: [receiptEntry('energy', effects[0]), receiptEntry('san', effects[1]), hoursReceipt(1), { id: passed ? 'hunt:combat_resolved' : 'hunt:survived', applied: true }] };
  const impact = applyCombatImpact(s, passed ? 24 : 36, passed ? 8 : 14, passed ? 40 : 46);
  const rescued = rescueFromFatalInjury(s, '你在正面冲突中伤重失去意识，路过者把你送去救治。');
  advanceHours(s, 1);
  const initiatingAttemptId = hunt.initiatingAttemptId;
  const attempt = recordCheckAttempt(s, internal, request.context, receipt, startedAt);
  if (rescued) {
    markHuntTargetDeparted(s, target, `等你恢复意识时，目标早已离开廷根；这场战斗令你损失了${impact.hpDamage}点生命、${impact.spiritDamage}点精神值。`);
  } else if (passed && hunt.confrontationCause === 'failed_strike') {
    if (!initiatingAttemptId || !completeHuntDeath(s, target, attempt.attemptId, initiatingAttemptId)) {
      return { ok: false, msg: '战斗缺少可核验的起因，无法结算死亡与非凡特性。' };
    }
  } else if (passed) {
    markHuntTargetDeparted(s, target, '你挡开攻击后没有追击，冲进巡夜人的灯光范围。目标当夜离开廷根，没有死亡，也没有留下可取得的非凡特性。');
  } else {
    markHuntTargetDeparted(s, target, '你带伤撑到有人经过的街口。目标不愿惊动执法者，没有继续追击；他随后离开廷根，你也没有得到任何战利品。');
  }
  return { ok: true, outcome: passed ? 'passed' : 'blocked' };
}

export function infamyLabel(value: number): string {
  if (value < 20) return '没有成形的恶名';
  if (value < 50) return '地下圈子有危险传闻';
  return '恶名已经传开';
}

export function lawAttentionLabel(value: number): string {
  if (value < 10) return '尚无明确调查';
  if (value < 30) return '执法者开始留意';
  return '已经进入调查视线';
}

const attemptEndedAbsoluteHour = (attempt: CheckAttemptRecord) =>
  (attempt.startedDay - 1) * 24 + attempt.startedHour + attempt.receipt.hoursElapsed;

const murderAbsoluteHour = (record: MurderRecord) => (record.day - 1) * 24 + record.hour;

function appliedReceiptEffect(attempt: CheckAttemptRecord, effectId: string): boolean {
  return attempt.receipt.effects.some(effect => effect.id === effectId && effect.applied === true);
}

function receiptActualDelta(attempt: CheckAttemptRecord, effectId: string): number | null {
  const effect = attempt.receipt.effects.find(candidate => candidate.id === effectId && candidate.applied === true);
  return typeof effect?.actualDelta === 'number' ? effect.actualDelta : null;
}

function authoritativeDockPreparationAttempt(
  s: GameState,
  preparationId: DockCombatPreparationId,
  attempt: CheckAttemptRecord,
  requireCurrentPrerequisites = true,
): boolean {
  const def = DOCK_COMBAT_PREPARATIONS.find(candidate => candidate.id === preparationId);
  if (!def || attempt.checkId !== def.checkId || attempt.outcome !== 'passed'
    || (requireCurrentPrerequisites && !hasDockCombatPreparationPrerequisites(s, preparationId))) return false;
  const energy = attempt.receipt.effects.find(effect => effect.id === 'energy');
  const hours = attempt.receipt.effects.find(effect => effect.id === 'hours');
  const preparation = attempt.receipt.effects.find(effect => effect.id === `combat-prep:${preparationId}`);
  const expectedEnergyCost = energyCostAtHour(s, def.energyCost, attempt.startedHour);
  return energy?.applied === true && energy.actualDelta === -expectedEnergyCost
    && typeof energy.before === 'number' && typeof energy.after === 'number'
    && energy.before > expectedEnergyCost && energy.after >= 1
    && energy.after - energy.before === energy.actualDelta
    && hours?.applied === true && hours.actualDelta === 1 && hours.before === 0 && hours.after === 1
    && preparation?.applied === true && preparation.before === false && preparation.after === true;
}

function dockPreparationsBeforeAttempt(s: GameState, settlement: CheckAttemptRecord): DockCombatPreparationId[] {
  const settlementStart = (settlement.startedDay - 1) * 24 + settlement.startedHour;
  return DOCK_COMBAT_PREPARATIONS.flatMap(def => s.checkAttempts.some(attempt =>
    authoritativeDockPreparationAttempt(s, def.id, attempt, false)
    && attemptEndedAbsoluteHour(attempt) <= settlementStart) ? [def.id] : []);
}

function canonicalAreaSuspicionRecord(s: GameState, raw: unknown): AreaSuspicionRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<AreaSuspicionRecord>;
  if (typeof value.settlementAttemptId !== 'string' || typeof value.source !== 'string'
    || !validAreaId(value.areaId ?? '') || !Number.isInteger(value.amount)
    || !Number.isInteger(value.day) || !Number.isInteger(value.hour)) return null;
  const attempt = s.checkAttempts.find(candidate => candidate.attemptId === value.settlementAttemptId);
  if (!attempt || value.day !== attempt.startedDay || value.hour !== attempt.startedHour) return null;
  const dockSources: Record<Exclude<AreaSuspicionSource, 'hunt_death'>, string> = {
    dock_escape_failed: 'dock_manifest_cleaner_escape',
    dock_defensive_physical: 'dock_manifest_cleaner_combat',
    dock_active_physical: 'dock_manifest_cleaner_active_combat',
    dock_defensive_spiritual: 'dock_manifest_cleaner_spiritual_combat',
    dock_active_spiritual: 'dock_manifest_cleaner_active_spiritual_combat',
  };
  if (value.source !== 'hunt_death' && Object.hasOwn(dockSources, value.source)) {
    const source = value.source as Exclude<AreaSuspicionSource, 'hunt_death'>;
    const resolutionEffect = source === 'dock_escape_failed'
      ? attempt.outcome === 'blocked' && appliedReceiptEffect(attempt, 'encounter:combat')
      : appliedReceiptEffect(attempt, attempt.outcome === 'passed' ? 'threat:resolved' : 'encounter:survived');
    const expectedAmount = dockAreaSuspicionAmount(source, dockPreparationsBeforeAttempt(s, attempt));
    if (value.areaId !== 'docks' || attempt.checkId !== dockSources[source] || !resolutionEffect
      || value.amount !== expectedAmount) return null;
    return {
      id: `${source}:${attempt.attemptId}`, areaId: 'docks', source, amount: expectedAmount,
      day: attempt.startedDay, hour: attempt.startedHour, settlementAttemptId: attempt.attemptId,
    };
  }
  if (value.source !== 'hunt_death') return null;
  const murder = s.murderRecords.find(record => record.settlementAttemptId === attempt.attemptId);
  const target = murder ? huntTargetDef(murder.targetId) : undefined;
  if (!murder || !target || value.areaId !== target.locationId || value.amount !== 20) return null;
  return {
    id: `hunt_death:${attempt.attemptId}`, areaId: target.locationId, source: 'hunt_death', amount: 20,
    day: attempt.startedDay, hour: attempt.startedHour, settlementAttemptId: attempt.attemptId,
  };
}

function areaSuspicionSemanticKey(s: GameState, record: AreaSuspicionRecord): string | null {
  if (record.source === 'dock_escape_failed') return 'dock_manifest_cleaner:escape_failed';
  if (record.source.startsWith('dock_')) return 'dock_manifest_cleaner:combat_resolution';
  const murder = s.murderRecords.find(candidate => candidate.settlementAttemptId === record.settlementAttemptId);
  return murder ? `hunt_death:${murder.targetId}` : null;
}

function authoritativeIdentityResourceDelta(attempt: CheckAttemptRecord, effectId: string, expected: number) {
  const effect = attempt.receipt.effects.find(candidate => candidate.id === effectId);
  return effect?.applied === true && effect.actualDelta === expected
    && typeof effect.before === 'number' && typeof effect.after === 'number'
    && effect.after - effect.before === expected;
}

function canonicalIdentityTraceDiscovery(s: GameState, raw: unknown): IdentityTraceDiscovery | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<IdentityTraceDiscovery>;
  if (typeof value.sourceRecordId !== 'string' || typeof value.investigationAttemptId !== 'string') return null;
  const source = s.areaSuspicionRecords.find(record => record.id === value.sourceRecordId);
  const attempt = s.checkAttempts.find(record => record.attemptId === value.investigationAttemptId);
  if (!source || !attempt) return null;
  const kind = identityTraceKind(source.source);
  const rule = IDENTITY_TRACE_RULES[kind];
  const expectedEnergy = energyCostAtHour(s, 10, attempt.startedHour);
  if (value.kind !== kind || attempt.checkId !== rule.investigationCheckId || attempt.outcome !== 'passed'
    || attempt.receipt.hoursElapsed !== 2 || attemptEndedAbsoluteHour(attempt) > absoluteHour(s)
    || !authoritativeIdentityResourceDelta(attempt, 'energy', -expectedEnergy)
    || !appliedReceiptEffect(attempt, 'hours') || !appliedReceiptEffect(attempt, 'identity:trace')) return null;
  return { sourceRecordId: source.id, kind, investigationAttemptId: attempt.attemptId };
}

function canonicalIdentityTraceResolution(s: GameState, raw: unknown): IdentityTraceResolution | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<IdentityTraceResolution>;
  if (typeof value.sourceRecordId !== 'string' || typeof value.resolutionAttemptId !== 'string') return null;
  const source = s.areaSuspicionRecords.find(record => record.id === value.sourceRecordId);
  const discovery = s.identityTraceDiscoveries.find(record => record.sourceRecordId === value.sourceRecordId);
  const discoveryAttempt = discovery
    ? s.checkAttempts.find(record => record.attemptId === discovery.investigationAttemptId) : undefined;
  const attempt = s.checkAttempts.find(record => record.attemptId === value.resolutionAttemptId);
  if (!source || !discovery || !discoveryAttempt || !attempt) return null;
  const kind = identityTraceKind(source.source);
  const rule = IDENTITY_TRACE_RULES[kind];
  const expectedHours = kind === 'witness_description' ? 2 : kind === 'public_confrontation' ? 3 : 4;
  const expectedEnergy = energyCostAtHour(s, 12, attempt.startedHour);
  if (value.method !== rule.method || value.amount !== rule.reduction
    || attempt.checkId !== rule.resolutionCheckId || attempt.outcome !== 'passed'
    || attempt.receipt.hoursElapsed !== expectedHours || attemptEndedAbsoluteHour(attempt) > absoluteHour(s)
    || attemptEndedAbsoluteHour(discoveryAttempt) > (attempt.startedDay - 1) * 24 + attempt.startedHour
    || !authoritativeIdentityResourceDelta(attempt, 'energy', -expectedEnergy)
    || !authoritativeIdentityResourceDelta(attempt, 'money', -rule.fee)
    || !appliedReceiptEffect(attempt, 'hours') || !appliedReceiptEffect(attempt, 'identity:resolved')) return null;
  if (kind === 'public_confrontation'
    && !authoritativeIdentityResourceDelta(attempt, 'item:plain_disguise_kit', -1)) return null;
  return {
    sourceRecordId: source.id, method: rule.method, amount: rule.reduction, resolutionAttemptId: attempt.attemptId,
  };
}

function canonicalIdentityCover(s: GameState, raw: unknown): IdentityCover | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<IdentityCover>;
  if (typeof value.preparationAttemptId !== 'string' || !Number.isInteger(value.createdDay)
    || !Number.isInteger(value.createdHour) || !Number.isInteger(value.expiresAbsoluteHour)) return null;
  const attempt = s.checkAttempts.find(record => record.attemptId === value.preparationAttemptId);
  if (!attempt || attempt.checkId !== 'identity_prepare_cover' || attempt.outcome !== 'passed'
    || attempt.startedDay !== value.createdDay || attempt.startedHour !== value.createdHour
    || attempt.receipt.hoursElapsed !== 2 || attemptEndedAbsoluteHour(attempt) > absoluteHour(s)
    || value.expiresAbsoluteHour !== attemptEndedAbsoluteHour(attempt) + 24
    || !authoritativeIdentityResourceDelta(attempt, 'energy', -energyCostAtHour(s, 8, attempt.startedHour))
    || !authoritativeIdentityResourceDelta(attempt, 'item:plain_disguise_kit', -1)
    || !appliedReceiptEffect(attempt, 'hours') || !appliedReceiptEffect(attempt, 'identity:cover')) return null;
  return value.expiresAbsoluteHour > absoluteHour(s) ? {
    preparationAttemptId: attempt.attemptId, createdDay: attempt.startedDay, createdHour: attempt.startedHour,
    expiresAbsoluteHour: value.expiresAbsoluteHour,
  } : null;
}

function authoritativeDivinationClubAcceptAttempt(
  attempts: readonly CheckAttemptRecord[],
  commissionId: DivinationClubCommissionId,
): CheckAttemptRecord | null {
  const def = DIVINATION_CLUB_COMMISSIONS.find(candidate => candidate.id === commissionId);
  if (!def) return null;
  return [...attempts].reverse().find(attempt => attempt.checkId === def.acceptCheckId
    && attempt.outcome === 'passed' && appliedReceiptEffect(attempt, 'energy')
    && appliedReceiptEffect(attempt, `clue:${def.briefingClueId}`)
    && appliedReceiptEffect(attempt, 'hours')) ?? null;
}

function authoritativeDivinationClubCompletionAttempt(
  attempts: readonly CheckAttemptRecord[],
  commissionId: DivinationClubCommissionId,
): CheckAttemptRecord | null {
  const def = DIVINATION_CLUB_COMMISSIONS.find(candidate => candidate.id === commissionId);
  if (!def) return null;
  return [...attempts].reverse().find(attempt => attempt.checkId === def.checkId && attempt.outcome === 'passed'
    && receiptActualDelta(attempt, 'money') === def.reward
    && receiptActualDelta(attempt, 'digestion') === def.digestionGain
    && receiptActualDelta(attempt, 'club_reputation') === def.reputationGain
    && appliedReceiptEffect(attempt, `clue:${def.outcomeClueId}`)
    && appliedReceiptEffect(attempt, `acting:club:${def.id}`)) ?? null;
}

function auditedLegacyDivinationClubCompletions(rawClub: unknown, rawAttempts: unknown): Set<DivinationClubCommissionId> {
  const result = new Set<DivinationClubCommissionId>();
  if (!rawClub || typeof rawClub !== 'object' || !Array.isArray(rawAttempts)) return result;
  const completed = (rawClub as Partial<GameState['divinationClub']>).completedCommissionIds;
  if (!Array.isArray(completed)) return result;
  for (const commissionId of ['lost_keepsake', 'journey_omen'] as const) {
    if (!completed.includes(commissionId)) continue;
    const def = DIVINATION_CLUB_COMMISSIONS.find(candidate => candidate.id === commissionId)!;
    const legacyDef = LEGACY_DIVINATION_CLUB_CHECKS.find(candidate => candidate.id === def.checkId && candidate.version === 1)!;
    const attempt = rawAttempts.map(rawAttempt => sanitizeCheckAttemptRecord([legacyDef], rawAttempt))
      .find((candidate): candidate is CheckAttemptRecord => !!candidate && candidate.checkId === def.checkId
        && candidate.outcome === 'passed' && receiptActualDelta(candidate, 'money') === def.reward
        && receiptActualDelta(candidate, 'digestion') === def.digestionGain
        && receiptActualDelta(candidate, 'club_reputation') === def.reputationGain);
    if (attempt) result.add(commissionId);
  }
  return result;
}

/** 只接受能够由重算后的检定链解释的猎杀结算，避免死亡与掉落记录循环互证。 */
function authoritativeHuntSettlement(s: GameState, record: MurderRecord, target: HuntTargetDef): boolean {
  const settlement = s.checkAttempts.find(attempt => attempt.attemptId === record.settlementAttemptId);
  if (!settlement || settlement.outcome !== 'passed' || attemptEndedAbsoluteHour(settlement) !== murderAbsoluteHour(record)) return false;
  if (settlement.checkId === 'hunt_masked_smuggler_strike') {
    return !record.initiatingAttemptId
      && appliedReceiptEffect(settlement, 'hunt:death')
      && appliedReceiptEffect(settlement, 'infamy')
      && appliedReceiptEffect(settlement, 'law_attention')
      && appliedReceiptEffect(settlement, 'nemesis');
  }
  if (settlement.checkId !== 'hunt_masked_smuggler_combat' || !record.initiatingAttemptId
    || !appliedReceiptEffect(settlement, 'hunt:combat_resolved')) return false;
  const initiating = s.checkAttempts.find(attempt => attempt.attemptId === record.initiatingAttemptId);
  return !!initiating && initiating.checkId === 'hunt_masked_smuggler_strike' && initiating.outcome === 'blocked'
    && appliedReceiptEffect(initiating, 'hunt:combat')
    && attemptEndedAbsoluteHour(initiating) <= (settlement.startedDay - 1) * 24 + settlement.startedHour
    && initiating.context.target.kind === 'case' && initiating.context.target.id === `hunt:${target.id}:strike`;
}

function authoritativeRevengeResolution(record: MurderRecord, target: HuntTargetDef, currentDay: number): boolean {
  const resolution = record.revengeResolution;
  if (!resolution) return false;
  const context = resolution.context;
  const receipt = resolution.receipt;
  if (!context || !receipt
    || !Number.isInteger(resolution.startedDay) || resolution.startedDay < record.day || resolution.startedDay > currentDay
    || !Number.isInteger(resolution.startedHour) || resolution.startedHour < 0 || resolution.startedHour > 23
    || !Number.isInteger(resolution.completedDay) || resolution.completedDay < resolution.startedDay || resolution.completedDay > currentDay
    || !Number.isInteger(resolution.completedHour) || resolution.completedHour < 0 || resolution.completedHour > 23
    || (resolution.completedDay - 1) * 24 + resolution.completedHour !== (resolution.startedDay - 1) * 24 + resolution.startedHour + 4
    || !Number.isInteger(resolution.nemesisPower) || resolution.nemesisPower < target.avenger.power
    || !Number.isInteger(resolution.attackScore)
    || !Number.isInteger(context.phy) || context.phy < 0 || context.phy > 100
    || !Number.isInteger(context.combat) || context.combat < 0 || context.combat > 10
    || !Number.isInteger(context.spirit) || context.spirit < 0 || context.spirit > 100
    || typeof context.hadRevolver !== 'boolean' || typeof context.wasHunter !== 'boolean'
    || receipt.hoursElapsed !== 4 || receipt.energyCost !== 35 || receipt.moneyGain !== 80
    || receipt.corruptionGain !== 4 || receipt.sanityCost !== 4
    || (receipt.combatSkillGain !== 0 && receipt.combatSkillGain !== 1)
    || receipt.combatSkillGain !== (context.combat < 10 ? 1 : 0)) return false;
  if (context.injuryPenalty !== undefined && ![0, 4, 8].includes(context.injuryPenalty)) return false;
  const recomputedAttack = context.injuryPenalty === undefined
    ? context.phy + context.combat * 4 + (context.hadRevolver ? 15 : 0)
      + (context.wasHunter ? 8 : 0) + Math.round(context.spirit * 0.3)
    : 8 + Math.floor(context.phy / 2) + context.combat * 3 + (context.hadRevolver ? 18 : 0)
      + (context.wasHunter ? 10 : 0) - context.injuryPenalty + Math.round(context.spirit * 0.3);
  return resolution.attackScore === recomputedAttack && recomputedAttack >= resolution.nemesisPower + 10;
}

// ============ 宿敌系统 ============
function nemesisDaily(s: GameState) {
  const n = s.nemesis;
  if (!n || !n.alive) return;
  n.hostility = clamp(n.hostility + 2);
  n.power = Math.round(n.power + 0.5);
  const roll = rnd(100);
  if (roll < 30) {
    const profile = getCombatProfile(s);
    const def = profile.physicalDefense + profile.dodge + Math.floor(profile.physicalAttack / 2);
    addLog(s, '⚠️ 深夜传来异响——有人撬开了你的窗！', 'bad');
    if (def >= n.power) {
      const impact = applyCombatImpact(s, 10 + Math.floor(n.power / 6), 0, 38);
      rescueFromFatalInjury(s, '你虽然挡住刺杀，仍因失血倒下。');
      addLog(s, `你早有防备，掀翻台灯砸向破窗而入的黑影。短暂交锋损失了${impact.hpDamage}点生命；对方负伤逃走。`, 'good');
      n.hostility = clamp(n.hostility + 6);
    } else {
      const impact = applyCombatImpact(s, 24 + Math.floor(n.power / 4), 8, 46);
      rescueFromFatalInjury(s, '刺客离开后，邻居发现了重伤昏迷的你。');
      addLog(s, `冰冷的刀刃划过肋侧，你损失了${impact.hpDamage}点生命、${impact.spiritDamage}点精神值，拼死反抗才把人逼退。`, 'bad');
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
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return { ok: false, msg: criticalIssue };
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
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return { ok: false, msg: criticalIssue };
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
  const woundIssue = woundActionIssue(s, 'active_combat');
  if (woundIssue) return { ok: false, msg: woundIssue };
  if (s.atWork) return { ok: false, msg: '工作期间不能处理宿敌事务。' };
  const n = s.nemesis;
  if (!n || !n.alive) return { ok: false, msg: '没有宿敌。' };
  if (!n.known) return { ok: false, msg: '对方藏在暗处，先查清底细再动手。' };
  if (s.stats.energy < 40) return { ok: false, msg: '你现在的状态不适合主动寻仇，勉强出手等于送死。' };
  const startedAt = { day: s.day, hour: s.hour };
  const combatProfile = getCombatProfile(s);
  applyEffects(s, [{ k: 'energy', v: -35 }]);
  advanceHours(s, 4);
  const attackContext = {
    phy: s.stats.phy, combat: s.skills.combat, spirit: s.stats.spi,
    hadRevolver: (s.items.revolver ?? 0) > 0, wasHunter: hasInheritedSequence9Ability(s, 'hunter'),
    injuryPenalty: combatProfile.injuryPenalty,
  };
  const atk = combatProfile.physicalAttack + Math.round(s.stats.spi * 0.3);
  const diff = n.power + 10; // 对方有准备
  addLog(s, `你查清了${n.name}的落脚点，在雨夜里摸了过去。接下来只能看准备与临场反应。`, 'system');
  if (atk >= diff) {
    const impact = applyCombatImpact(s, 20 + Math.floor(n.power / 5), 4, 42);
    rescueFromFatalInjury(s, '对手倒下后，你也因伤势失去意识。');
    addLog(s, `✦ 短促而惨烈的搏杀后，一切结束了。${n.name}倒在积水中，你在尸体旁站了很久。`, 'good');
    addLog(s, `这场决战损失了${impact.hpDamage}点生命、${impact.spiritDamage}点精神值。`, 'info');
    applyEffects(s, [{ k: 'money', v: 80 }, { k: 'cor', v: 4 }, { k: 'san', v: -4 }]);
    const combatSkillGain: 0 | 1 = s.skills.combat < 10 ? 1 : 0;
    if (combatSkillGain) s.skills.combat += 1;
    if (n.archetype !== '黑帮清道夫') addLog(s, '你只找到几封无法验证来源的密信，没有可直接使用的魔药配方。', 'info');
    addLog(s, '一条人命。你告诉自己：在这座城市的规则里，这已经是仁慈的结局。', 'system');
    const avengedMurder = s.murderRecords.find(record => huntTargetDef(record.targetId)?.avenger.name === n.name);
    if (avengedMurder) {
      avengedMurder.revengeResolution = {
        startedDay: startedAt.day, startedHour: startedAt.hour, completedDay: s.day, completedHour: s.hour,
        nemesisPower: n.power, attackScore: atk, context: attackContext,
        receipt: { hoursElapsed: 4, energyCost: 35, moneyGain: 80, corruptionGain: 4, sanityCost: 4, combatSkillGain },
      };
    }
    s.nemesis = null;
  } else {
    const impact = applyCombatImpact(s, 34 + Math.floor(n.power / 4), 10, 48);
    rescueFromFatalInjury(s, '你在巷口倒下后被更夫发现，对手已经离开。');
    addLog(s, `✖ 对方比你想象的更强。你损失了${impact.hpDamage}点生命、${impact.spiritDamage}点精神值，拼死逃出那条巷子；对方不会把这次失败当作结束。`, 'bad');
    applyEffects(s, [{ k: 'energy', v: -40 }, { k: 'san', v: -10 }, { k: 'cor', v: 5 }]);
    n.hostility = clamp(n.hostility + 15);
  }
  return { ok: true };
}

/** 解除诅咒（找尼尔逊或艾拉） */
export function removeCurse(s: GameState): ActionResult {
  const criticalIssue = criticalActivityIssue(s);
  if (criticalIssue) return { ok: false, msg: criticalIssue };
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

function normalizedRecordedDivinationAttempt(s: GameState, value: unknown, loadedVersion = CURRENT_SCHEMA_VERSION): DivinationAttempt | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<DivinationAttempt>;
  if (!['location', 'item'].includes(raw.targetKind ?? '') || typeof raw.targetId !== 'string') return null;
  if (!['cards', 'dream'].includes(raw.method ?? '') || !['self', 'nelson', 'evelyn'].includes(raw.provider ?? '')) return null;
  if (!['inconclusive', 'omen', 'hint', 'obscured', 'backlash'].includes(raw.outcome ?? '')) return null;
  if (!Number.isInteger(raw.day) || (raw.day ?? 0) < 1 || !Number.isInteger(raw.hour) || (raw.hour ?? -1) < 0 || (raw.hour ?? 24) > 23) return null;
  const targetKind = raw.targetKind as DivinationTargetKind;
  const method = raw.method as DivinationMethod;
  const provider = raw.provider as DivinationProvider;
  const outcome = raw.outcome as DivinationOutcome;
  const target = divinationTargetDefinition(targetKind, raw.targetId);
  if (!target || (targetKind === 'location' && !isLocationUnlocked(s, raw.targetId))) return null;
  if (!recordedDivinationProviderAllowed(s, provider, method, target, raw.day!, raw.hour!)) return null;
  let scoreInput: DivinationScoreInput;
  if (raw.scoreInput && typeof raw.scoreInput === 'object') {
    scoreInput = raw.scoreInput as DivinationScoreInput;
    // The legacy marker is produced only by the v23 -> v24 migration below.
    // A schema-v23 payload cannot use it to bypass the original audit.
    if (loadedVersion < 24 && scoreInput.version === 23) return null;
  } else {
    if (loadedVersion >= 24 || !Number.isFinite(raw.score)) return null;
    const legacyScore = raw.score!;
    const legacySuccessOutcome = targetKind === 'location' ? 'omen' : 'hint';
    const legacyValid = (outcome === 'omen' || outcome === 'hint')
      ? outcome === legacySuccessOutcome && legacyScore >= target.difficulty
      : outcome === 'inconclusive'
        ? legacyScore < target.difficulty && method === 'cards' && target.pressure === 'low'
        : outcome === 'backlash'
          ? legacyScore < target.difficulty && (method === 'dream' || target.pressure === 'high')
          // v23 did not record whether the scene was jammed.  The obscured
          // outcome itself is the only surviving evidence, so it is retained
          // after the remaining provider/target/time audit has passed.
          : outcome === 'obscured';
    if (!legacyValid) return null;
    scoreInput = {
      version: 23,
      provenance: 'validated_v23_attempt',
      validatedScore: legacyScore,
      targetKind,
      targetId: raw.targetId,
      method,
      provider,
      outcome,
      day: raw.day!,
      hour: raw.hour!,
    };
  }
  if (scoreInput.version === 23 && (scoreInput.targetKind !== targetKind || scoreInput.targetId !== raw.targetId
    || scoreInput.method !== method || scoreInput.provider !== provider || scoreInput.outcome !== outcome
    || scoreInput.day !== raw.day || scoreInput.hour !== raw.hour)) return null;
  const score = scoreDivinationInput(target, method, provider, scoreInput);
  if (score === null) return null;
  if (scoreInput.version === 1) {
    const expectedOutcome: DivinationOutcome = scoreInput.jammed ? 'obscured'
      : score >= target.difficulty ? (targetKind === 'location' ? 'omen' : 'hint')
        : target.antiDivination && score >= target.difficulty - 6 ? 'obscured'
          : method === 'dream' || target.pressure === 'high' ? 'backlash' : 'inconclusive';
    if (outcome !== expectedOutcome) return null;
  }
  return {
    targetKind, targetId: raw.targetId, method, provider, outcome,
    day: raw.day!, hour: raw.hour!, score,
    scoreInput: scoreInput.version === 1 ? {
      ...scoreInput,
      toolIds: [...scoreInput.toolIds],
      clueIds: [...scoreInput.clueIds],
    } : { ...scoreInput },
  };
}

function rebuildPersistedDivinationAndItemKnowledge(
  s: GameState,
  rawAttempts: unknown[],
  rawInsights: unknown[],
  rawItemKnowledge: Record<string, unknown>,
  loadedVersion: number,
) {
  const usedInsights = new Set<number>();
  const attempts: DivinationAttempt[] = [];
  const insights: DivinationInsight[] = [];
  for (const candidate of rawAttempts) {
    const attempt = normalizedRecordedDivinationAttempt(s, candidate, loadedVersion);
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
      nightwatchEarlyLoop?: GameState['nightwatchEarlyLoop'];
      divinationClub?: GameState['divinationClub'];
      elliotCase?: GameState['elliotCase'];
      seerTraining?: GameState['seerTraining'];
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
      deepInvestigations?: GameState['deepInvestigations'];
      investigationWorkspaces?: GameState['investigationWorkspaces'];
      caseThreats?: GameState['caseThreats'];
      pendingEncounter?: GameState['pendingEncounter'];
      explorationAttempts?: GameState['explorationAttempts'];
      checkAttempts?: GameState['checkAttempts'];
      divinationTraining?: GameState['divinationTraining'];
      divinationCredentials?: GameState['divinationCredentials'];
      divinationInsights?: GameState['divinationInsights'];
      divinationAttempts?: GameState['divinationAttempts'];
      books?: GameState['books'];
      languages?: GameState['languages'];
      itemKnowledge?: GameState['itemKnowledge'];
      tradeFair?: GameState['tradeFair'];
      confirmedBeyonderDeaths?: GameState['confirmedBeyonderDeaths'];
      openingScenarioId?: GameState['openingScenarioId'];
      strangeNotebook?: GameState['strangeNotebook'];
      activeHunt?: GameState['activeHunt'];
      murderRecords?: GameState['murderRecords'];
      infamy?: number;
      lawAttention?: number;
      areaSuspicionRecords?: GameState['areaSuspicionRecords'];
      identityTraceDiscoveries?: GameState['identityTraceDiscoveries'];
      identityTraceResolutions?: GameState['identityTraceResolutions'];
      identityCover?: GameState['identityCover'];
      areaSuspicion?: GameState['areaSuspicion'];
      wantedAreas?: GameState['wantedAreas'];
      canReadRoselleScript?: boolean;
      jobId?: string | null;
      atWork?: boolean;
      eventCounter?: number;
      recentEventVariants?: Record<string, number[]>;
      forcedEventQueue?: string[];
      combatVitals?: GameState['combatVitals'];
      npcVisitSession?: GameState['npcVisitSession'];
    };
    const loadedVersion = Number.isInteger(s.schemaVersion) ? s.schemaVersion! : 6;
    const hadVisitedLocations = Array.isArray(s.visitedLocations);
    s.items = s.items && typeof s.items === 'object' ? s.items : {};
    s.flags = s.flags && typeof s.flags === 'object' ? s.flags : {};
    s.log = Array.isArray(s.log) ? s.log.map(entry => ({
      ...entry,
      text: typeof entry?.text === 'string'
        ? entry.text.replace('；没有任何内容凭空授予非凡能力。', '；能相互印证的段落已经逐条抄进调查笔记。')
        : '',
    })) : [];
    if (loadedVersion < 23) {
      s.openingScenarioId = 'ordinary_morning';
      s.strangeNotebook = {
        status: 'absent', influenceStage: 0, acquiredAbsoluteHour: 7,
        nextManifestationAbsoluteHour: Number.MAX_SAFE_INTEGER, odditiesRecorded: false,
      };
      s.items[STRANGE_NOTEBOOK_ITEM_ID] = 0;
    } else {
      const openingScenarioId = OPENING_SCENARIOS.some(opening => opening.id === s.openingScenarioId)
        ? s.openingScenarioId : 'ordinary_morning';
      s.openingScenarioId = openingScenarioId;
      const rawNotebook = s.strangeNotebook;
      const validStatus = rawNotebook && ['held', 'missing', 'surrendered'].includes(rawNotebook.status);
      const validStage = rawNotebook && Number.isInteger(rawNotebook.influenceStage)
        && rawNotebook.influenceStage >= 0 && rawNotebook.influenceStage <= 4;
      if (openingScenarioId !== 'strange_notebook' || !validStatus || !validStage) {
        s.openingScenarioId = openingScenarioId === 'strange_notebook' ? 'ordinary_morning' : openingScenarioId;
        s.strangeNotebook = {
          status: 'absent', influenceStage: 0, acquiredAbsoluteHour: 7,
          nextManifestationAbsoluteHour: Number.MAX_SAFE_INTEGER, odditiesRecorded: false,
        };
        s.items[STRANGE_NOTEBOOK_ITEM_ID] = 0;
      } else {
        const now = absoluteHour(s);
        const validMissingReturn = rawNotebook.status === 'missing'
          && Number.isFinite(rawNotebook.returnAbsoluteHour)
          && Number.isInteger(rawNotebook.returnAbsoluteHour)
          && rawNotebook.returnAbsoluteHour! > now
          && rawNotebook.returnAbsoluteHour! <= now + 12;
        const sanitizedStatus = rawNotebook.status === 'missing' && !validMissingReturn ? 'held' : rawNotebook.status;
        s.strangeNotebook = {
          status: sanitizedStatus,
          influenceStage: rawNotebook.influenceStage,
          acquiredAbsoluteHour: Number.isFinite(rawNotebook.acquiredAbsoluteHour) ? Math.max(0, Math.floor(rawNotebook.acquiredAbsoluteHour)) : 7,
          nextManifestationAbsoluteHour: Number.isFinite(rawNotebook.nextManifestationAbsoluteHour) ? Math.max(now, Math.floor(rawNotebook.nextManifestationAbsoluteHour)) : now + 12,
          odditiesRecorded: !!rawNotebook.odditiesRecorded,
          ...(validMissingReturn ? { returnAbsoluteHour: rawNotebook.returnAbsoluteHour } : {}),
          ...(rawNotebook.status === 'surrendered' && (rawNotebook.handedOffLocationId === 'st_selena_church' || rawNotebook.handedOffLocationId === 'blackthorn_security')
            ? { handedOffLocationId: rawNotebook.handedOffLocationId, handedOffDay: rawNotebook.handedOffDay, handedOffHour: rawNotebook.handedOffHour } : {}),
        };
        if (s.strangeNotebook.status === 'held') s.items[STRANGE_NOTEBOOK_ITEM_ID] = Math.max(1, Math.floor(s.items[STRANGE_NOTEBOOK_ITEM_ID] ?? 0));
        else s.items[STRANGE_NOTEBOOK_ITEM_ID] = 0;
      }
    }
    if (loadedVersion < 19) {
      const seq9ItemRenames: Record<string, string> = {
        deer_heart: 'blood_red_chestnut', iron_fern: 'activated_marsh_crystal',
        bat_eye: 'midnight_beauty_flower', deep_sleep_flower: 'six_legged_owl_eye',
        gecko_skin: 'treasure_eating_bug', mold_spore: 'phantom_crystal',
      };
      for (const [legacyId, currentId] of Object.entries(seq9ItemRenames)) {
        const amount = Number.isFinite(s.items[legacyId]) ? Math.max(0, Math.floor(s.items[legacyId])) : 0;
        if (amount > 0) s.items[currentId] = (s.items[currentId] ?? 0) + amount;
        s.items[legacyId] = 0;
      }
    }
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
    s.combatLoadout = sanitizedCombatLoadout(s, s.combatLoadout, loadedVersion < 31);
    const migratedMaxHp = 40 + s.stats.phy * 2;
    const migratedMaxSpirit = 20 + s.stats.spi * 2 + Math.floor(s.stats.mnd / 2);
    if (loadedVersion < 25) {
      s.combatVitals = { hp: migratedMaxHp, spirit: migratedMaxSpirit };
      s.npcVisitSession = null;
    } else {
      const rawVitals = s.combatVitals;
      s.combatVitals = {
        hp: Number.isInteger(rawVitals?.hp) ? Math.max(0, Math.min(migratedMaxHp, rawVitals.hp)) : migratedMaxHp,
        spirit: Number.isInteger(rawVitals?.spirit) ? Math.max(0, Math.min(migratedMaxSpirit, rawVitals.spirit)) : migratedMaxSpirit,
      };
      const rawSession = s.npcVisitSession;
      const sessionNpc = rawSession && typeof rawSession.npcId === 'string' ? findAnyNPC(s, rawSession.npcId) : undefined;
      const sessionStartAbsolute = rawSession ? (rawSession.startedDay - 1) * 24 + rawSession.startedHour : -1;
      const sessionEndAbsolute = rawSession ? (rawSession.day - 1) * 24 + rawSession.hour : -1;
      s.npcVisitSession = rawSession && sessionNpc && isMet(s, rawSession.npcId)
        && (s.relations[rawSession.npcId] ?? -100) >= VISIT_FAVOR
        && rawSession.day === s.day && rawSession.hour === s.hour
        && Number.isInteger(rawSession.startedDay) && rawSession.startedDay >= 1
        && Number.isInteger(rawSession.startedHour) && rawSession.startedHour >= 0 && rawSession.startedHour <= 23
        && sessionStartAbsolute + 1 === sessionEndAbsolute
        && npcAvailable(sessionNpc, rawSession.startedDay, rawSession.startedHour)
        ? {
          npcId: rawSession.npcId, startedDay: rawSession.startedDay, startedHour: rawSession.startedHour,
          day: rawSession.day, hour: rawSession.hour,
        } : null;
    }
    const seenClueIds = new Set<string>();
    s.clues = Array.isArray(s.clues) ? s.clues.filter(clue => {
      if (!clue || typeof clue.id !== 'string' || seenClueIds.has(clue.id) || !CLUE_DEFS.some(def => def.id === clue.id)) return false;
      seenClueIds.add(clue.id);
      return true;
    }) : [];
    if (s.openingScenarioId === 'strange_notebook' && s.strangeNotebook.status === 'surrendered') {
      const handoff = s.strangeNotebook;
      const receipt = s.clues.find(clue => clue.id === 'strange_notebook_official_receipt');
      const validHandoff = s.flags.strange_notebook_handed_off === true
        && (handoff.handedOffLocationId === 'st_selena_church' || handoff.handedOffLocationId === 'blackthorn_security')
        && Number.isInteger(handoff.handedOffDay) && handoff.handedOffDay! >= 1 && handoff.handedOffDay! <= s.day
        && Number.isInteger(handoff.handedOffHour) && handoff.handedOffHour! >= 0 && handoff.handedOffHour! <= 23
        && receipt?.sourceKind === 'location' && receipt.sourceId === handoff.handedOffLocationId
        && receipt.acquiredDay === handoff.handedOffDay && receipt.acquiredHour === handoff.handedOffHour;
      if (!validHandoff) {
        s.strangeNotebook.status = 'held';
        delete s.strangeNotebook.handedOffLocationId;
        delete s.strangeNotebook.handedOffDay;
        delete s.strangeNotebook.handedOffHour;
        s.strangeNotebook.nextManifestationAbsoluteHour = Math.min(s.strangeNotebook.nextManifestationAbsoluteHour, absoluteHour(s) + 8);
        s.items[STRANGE_NOTEBOOK_ITEM_ID] = Math.max(1, Math.floor(s.items[STRANGE_NOTEBOOK_ITEM_ID] ?? 0));
        delete s.flags.strange_notebook_handed_off;
        s.clues = s.clues.filter(clue => clue.id !== 'strange_notebook_official_receipt');
      }
    }
    s.explorationAttempts = Array.isArray(s.explorationAttempts)
      ? s.explorationAttempts.filter(attempt => attempt && typeof attempt.checkId === 'string'
        && ['passed', 'blocked'].includes(attempt.outcome))
      : [];
    const legacyClubCompletionIds = loadedVersion >= 23
      ? auditedLegacyDivinationClubCompletions(s.divinationClub, s.checkAttempts)
      : new Set<DivinationClubCommissionId>();
    const rawProtectedCheckAttemptIds = new Set<string>();
    if (loadedVersion >= 23 && Array.isArray(s.murderRecords)) {
      for (const record of s.murderRecords) {
        if (typeof record?.settlementAttemptId === 'string') rawProtectedCheckAttemptIds.add(record.settlementAttemptId);
        if (typeof record?.initiatingAttemptId === 'string') rawProtectedCheckAttemptIds.add(record.initiatingAttemptId);
      }
    }
    if (loadedVersion >= 23 && typeof s.activeHunt?.initiatingAttemptId === 'string') {
      rawProtectedCheckAttemptIds.add(s.activeHunt.initiatingAttemptId);
    }
    if (loadedVersion >= 27 && Array.isArray(s.areaSuspicionRecords)) {
      for (const record of s.areaSuspicionRecords) {
        if (typeof record?.settlementAttemptId === 'string') rawProtectedCheckAttemptIds.add(record.settlementAttemptId);
      }
    }
    if (loadedVersion >= 28 && Array.isArray(s.identityTraceDiscoveries)) {
      for (const record of s.identityTraceDiscoveries) {
        if (typeof record?.investigationAttemptId === 'string') rawProtectedCheckAttemptIds.add(record.investigationAttemptId);
      }
    }
    if (loadedVersion >= 28 && Array.isArray(s.identityTraceResolutions)) {
      for (const record of s.identityTraceResolutions) {
        if (typeof record?.resolutionAttemptId === 'string') rawProtectedCheckAttemptIds.add(record.resolutionAttemptId);
      }
    }
    if (loadedVersion >= 28 && typeof s.identityCover?.preparationAttemptId === 'string') {
      rawProtectedCheckAttemptIds.add(s.identityCover.preparationAttemptId);
    }
    if (loadedVersion >= 32 && s.investigationWorkspaces && typeof s.investigationWorkspaces === 'object') {
      for (const workspace of Object.values(s.investigationWorkspaces)) {
        if (!workspace || !Array.isArray(workspace.assessments)) continue;
        for (const assessment of workspace.assessments) {
          if (typeof assessment?.attemptId === 'string') rawProtectedCheckAttemptIds.add(assessment.attemptId);
        }
      }
    }
    if (Array.isArray(s.checkAttempts)) {
      for (const attempt of s.checkAttempts) {
        if (attempt && typeof attempt.attemptId === 'string' && attempt.outcome === 'passed'
          && DIVINATION_CLUB_COMMISSIONS.some(def => attempt.checkId === def.acceptCheckId
            || attempt.checkId === def.fieldCheckId || attempt.checkId === def.checkId)) {
          rawProtectedCheckAttemptIds.add(attempt.attemptId);
        }
        if (attempt && typeof attempt.attemptId === 'string'
          && [...Object.values(DOCK_WITNESS_CHECK_IDS), ...Object.values(DOCK_WITNESS_FOLLOWUP_CHECK_IDS),
            ...Object.values(DOCK_GRAY_HAT_CHECK_IDS), ...Object.values(DOCK_ENCOUNTER_AFTERMATH_CHECK_IDS),
            ...Object.values(DOCK_OLD_YARD_CHECK_IDS),
            ...Object.values(DOCK_TRANSFER_FOLLOWUP_CHECK_IDS),
            'dock_manifest_cleaner_escape', 'dock_manifest_cleaner_combat', 'dock_manifest_cleaner_active_combat',
            'dock_manifest_cleaner_spiritual_combat', 'dock_manifest_cleaner_active_spiritual_combat'].includes(attempt.checkId)) {
          rawProtectedCheckAttemptIds.add(attempt.attemptId);
        }
      }
    }
    const seenCheckAttemptIds = new Set<string>();
    const sanitizedCheckAttempts = (loadedVersion < 21 ? [] : (Array.isArray(s.checkAttempts) ? s.checkAttempts : []))
      .map(attempt => {
        const value = attempt as Partial<CheckAttemptRecord> | null;
        const legacyDef = value && LEGACY_DIVINATION_CLUB_CHECKS.find(def => def.id === value.checkId
          && def.version === value.definitionVersion);
        return sanitizeCheckAttemptRecord(legacyDef ? [legacyDef] : EXPLORATION_CHECKS, attempt);
      })
      .filter((attempt): attempt is CheckAttemptRecord => {
        if (!attempt || seenCheckAttemptIds.has(attempt.attemptId)) return false;
        seenCheckAttemptIds.add(attempt.attemptId);
        return true;
      });
    const recentCheckAttempts = sanitizedCheckAttempts.slice(-200);
    const recentCheckAttemptIds = new Set(recentCheckAttempts.map(attempt => attempt.attemptId));
    s.checkAttempts = [
      ...sanitizedCheckAttempts.filter(attempt => rawProtectedCheckAttemptIds.has(attempt.attemptId)
        && !recentCheckAttemptIds.has(attempt.attemptId)),
      ...recentCheckAttempts,
    ];
    const crisisClueAudit: Record<string, {
      checkId: string; outcome: 'passed' | 'blocked'; sourceKind: ClueSourceKind; sourceId: string;
    }> = {
      dock_witness_warned: {
        checkId: DOCK_WITNESS_CHECK_IDS.warn_worker, outcome: 'passed', sourceKind: 'npc', sourceId: 'mike',
      },
      dock_watcher_route: {
        checkId: DOCK_WITNESS_CHECK_IDS.shadow_watcher, outcome: 'passed', sourceKind: 'event', sourceId: 'dock_witness_crisis:shadow_watcher',
      },
      dock_witness_disappeared: {
        checkId: DOCK_WITNESS_CHECK_IDS.shadow_watcher, outcome: 'blocked', sourceKind: 'event', sourceId: 'dock_witness_crisis:shadow_watcher',
      },
      dock_witness_protected: {
        checkId: DOCK_WITNESS_CHECK_IDS.request_protection, outcome: 'passed', sourceKind: 'location', sourceId: 'blackthorn_security',
      },
      dock_witness_statement: {
        checkId: DOCK_WITNESS_FOLLOWUP_CHECK_IDS.warned_witness, outcome: 'passed', sourceKind: 'npc', sourceId: 'mike',
      },
      dock_witness_fragment: {
        checkId: DOCK_WITNESS_FOLLOWUP_CHECK_IDS.warned_witness, outcome: 'blocked', sourceKind: 'npc', sourceId: 'mike',
      },
      dock_transfer_watch_record: {
        checkId: DOCK_WITNESS_FOLLOWUP_CHECK_IDS.watched_transfer, outcome: 'passed', sourceKind: 'location', sourceId: 'canal',
      },
      dock_transfer_decoy: {
        checkId: DOCK_WITNESS_FOLLOWUP_CHECK_IDS.watched_transfer, outcome: 'blocked', sourceKind: 'location', sourceId: 'canal',
      },
      dock_witness_locker_token: {
        checkId: DOCK_WITNESS_FOLLOWUP_CHECK_IDS.missing_witness, outcome: 'passed', sourceKind: 'location', sourceId: 'docks',
      },
      dock_witness_last_errand: {
        checkId: DOCK_WITNESS_FOLLOWUP_CHECK_IDS.missing_witness, outcome: 'blocked', sourceKind: 'location', sourceId: 'docks',
      },
      dock_sealed_statement_excerpt: {
        checkId: DOCK_WITNESS_FOLLOWUP_CHECK_IDS.protected_witness, outcome: 'passed', sourceKind: 'location', sourceId: 'blackthorn_security',
      },
      dock_official_case_summary: {
        checkId: DOCK_WITNESS_FOLLOWUP_CHECK_IDS.protected_witness, outcome: 'blocked', sourceKind: 'location', sourceId: 'blackthorn_security',
      },
      dock_gray_hat_exchange_pattern: {
        checkId: DOCK_GRAY_HAT_CHECK_IDS.observe_exchange, outcome: 'passed', sourceKind: 'location', sourceId: 'canal',
      },
      dock_gray_hat_abandoned_route: {
        checkId: DOCK_GRAY_HAT_CHECK_IDS.observe_exchange, outcome: 'blocked', sourceKind: 'location', sourceId: 'canal',
      },
      dock_gray_hat_countermark: {
        checkId: DOCK_GRAY_HAT_CHECK_IDS.bait_manifest, outcome: 'passed', sourceKind: 'location', sourceId: 'docks',
      },
      dock_gray_hat_trap_exposed: {
        checkId: DOCK_GRAY_HAT_CHECK_IDS.bait_manifest, outcome: 'blocked', sourceKind: 'location', sourceId: 'docks',
      },
      dock_gray_hat_joint_watch: {
        checkId: DOCK_GRAY_HAT_CHECK_IDS.joint_watch, outcome: 'passed', sourceKind: 'location', sourceId: 'blackthorn_security',
      },
      dock_gray_hat_watch_delayed: {
        checkId: DOCK_GRAY_HAT_CHECK_IDS.joint_watch, outcome: 'blocked', sourceKind: 'location', sourceId: 'blackthorn_security',
      },
      dock_gray_hat_retreat_route: {
        checkId: DOCK_ENCOUNTER_AFTERMATH_CHECK_IDS.trace_retreat, outcome: 'passed', sourceKind: 'event', sourceId: 'dock_encounter_aftermath:trace_retreat',
      },
      dock_gray_hat_trail_lost: {
        checkId: DOCK_ENCOUNTER_AFTERMATH_CHECK_IDS.trace_retreat, outcome: 'blocked', sourceKind: 'event', sourceId: 'dock_encounter_aftermath:trace_retreat',
      },
      dock_gray_hat_token_handoff: {
        checkId: DOCK_ENCOUNTER_AFTERMATH_CHECK_IDS.handoff_token, outcome: 'passed', sourceKind: 'location', sourceId: 'blackthorn_security',
      },
      dock_gray_hat_evidence_preserved: {
        checkId: DOCK_ENCOUNTER_AFTERMATH_CHECK_IDS.preserve_evidence, outcome: 'passed', sourceKind: 'event', sourceId: 'dock_encounter_aftermath:preserve_evidence',
      },
      dock_old_yard_perimeter_map: {
        checkId: DOCK_OLD_YARD_CHECK_IDS.survey_perimeter, outcome: 'passed', sourceKind: 'location', sourceId: 'old_loading_yard',
      },
      dock_old_yard_public_boundary: {
        checkId: DOCK_OLD_YARD_CHECK_IDS.survey_perimeter, outcome: 'blocked', sourceKind: 'location', sourceId: 'old_loading_yard',
      },
      dock_old_yard_porter_schedule: {
        checkId: DOCK_OLD_YARD_CHECK_IDS.question_porters, outcome: 'passed', sourceKind: 'npc', sourceId: 'old_yard_porter',
      },
      dock_old_yard_workers_silent: {
        checkId: DOCK_OLD_YARD_CHECK_IDS.question_porters, outcome: 'blocked', sourceKind: 'npc', sourceId: 'old_yard_porter',
      },
      dock_old_yard_night_transfer: {
        checkId: DOCK_OLD_YARD_CHECK_IDS.watch_night_transfer, outcome: 'passed', sourceKind: 'location', sourceId: 'old_loading_yard',
      },
      dock_old_yard_watch_disturbed: {
        checkId: DOCK_OLD_YARD_CHECK_IDS.watch_night_transfer, outcome: 'blocked', sourceKind: 'location', sourceId: 'old_loading_yard',
      },
      dock_wagon_coal_yard_route: {
        checkId: DOCK_TRANSFER_FOLLOWUP_CHECK_IDS.tail_wagon, outcome: 'passed', sourceKind: 'location', sourceId: 'old_loading_yard',
      },
      dock_wagon_lost_at_bridge: {
        checkId: DOCK_TRANSFER_FOLLOWUP_CHECK_IDS.tail_wagon, outcome: 'blocked', sourceKind: 'location', sourceId: 'old_loading_yard',
      },
      dock_crate_tar_seal: {
        checkId: DOCK_TRANSFER_FOLLOWUP_CHECK_IDS.inspect_crate, outcome: 'passed', sourceKind: 'location', sourceId: 'old_loading_yard',
      },
      dock_crate_packing_trace: {
        checkId: DOCK_TRANSFER_FOLLOWUP_CHECK_IDS.inspect_crate, outcome: 'blocked', sourceKind: 'location', sourceId: 'old_loading_yard',
      },
      dock_official_interception_record: {
        checkId: DOCK_TRANSFER_FOLLOWUP_CHECK_IDS.request_interception, outcome: 'passed', sourceKind: 'location', sourceId: 'blackthorn_security',
      },
      dock_interception_declined: {
        checkId: DOCK_TRANSFER_FOLLOWUP_CHECK_IDS.request_interception, outcome: 'blocked', sourceKind: 'location', sourceId: 'blackthorn_security',
      },
    };
    s.clues = s.clues.filter(clue => {
      const audit = crisisClueAudit[clue.id];
      if (!audit) return true;
      if (clue.sourceKind !== audit.sourceKind || clue.sourceId !== audit.sourceId) return false;
      return s.checkAttempts.some(attempt => attempt.checkId === audit.checkId && attempt.outcome === audit.outcome
        && attempt.startedDay === clue.acquiredDay && attempt.startedHour === clue.acquiredHour
        && attempt.receipt.effects.some(effect => effect.id === `clue:${clue.id}` && effect.applied));
    });
    if (!hasClue(s, 'dock_gray_hat_retreat_route')) {
      const oldYardClues = new Set(Object.values(DOCK_OLD_YARD_RESULT_CLUES).flat());
      s.clues = s.clues.filter(clue => !oldYardClues.has(clue.id));
    }
    if (!hasClue(s, 'dock_old_yard_night_transfer')) {
      const transferClues = new Set(Object.values(DOCK_TRANSFER_FOLLOWUP_RESULT_CLUES).flat());
      s.clues = s.clues.filter(clue => !transferClues.has(clue.id));
    }
    if (!hasClue(s, 'dock_crate_tar_seal')) s.items.tarred_cargo_seal = 0;
    const encounterSettlementCheckIds = new Set([
      'dock_manifest_cleaner_combat', 'dock_manifest_cleaner_active_combat',
      'dock_manifest_cleaner_spiritual_combat', 'dock_manifest_cleaner_active_spiritual_combat',
    ]);
    s.clues = s.clues.filter(clue => {
      if (!['dock_gray_hat_escape_recollection', 'dock_gray_hat_dropped_token', 'dock_gray_hat_scene_lost'].includes(clue.id)) return true;
      if (clue.sourceKind !== 'event' || clue.sourceId !== 'encounter:dock_manifest_cleaner') return false;
      return s.checkAttempts.some(attempt => attempt.startedDay === clue.acquiredDay && attempt.startedHour === clue.acquiredHour
        && (clue.id === 'dock_gray_hat_escape_recollection'
          ? attempt.checkId === 'dock_manifest_cleaner_escape' && attempt.outcome === 'passed'
            && attempt.receipt.effects.some(effect => effect.id === 'encounter:escaped' && effect.applied)
          : clue.id === 'dock_gray_hat_dropped_token'
            ? encounterSettlementCheckIds.has(attempt.checkId) && attempt.outcome === 'passed'
              && attempt.receipt.effects.some(effect => effect.id === 'threat:resolved' && effect.applied)
            : attempt.checkId === 'dock_manifest_cleaner_escape' && attempt.outcome === 'blocked'
              || encounterSettlementCheckIds.has(attempt.checkId)));
    });
    const rawInvestigationWorkspaces = loadedVersion >= 32 && s.investigationWorkspaces
      && typeof s.investigationWorkspaces === 'object' ? s.investigationWorkspaces : {};
    s.investigationWorkspaces = {};
    const rawDockWorkspace = rawInvestigationWorkspaces.dock_manifest;
    if (rawDockWorkspace && rawDockWorkspace.caseId === 'dock_manifest') {
      const validEvidenceIds = new Set(INVESTIGATION_EVIDENCE_DEFS
        .filter(def => hasClue(s, def.clueId)).map(def => def.clueId));
      const selectedClueIds = Array.isArray(rawDockWorkspace.selectedClueIds)
        ? [...new Set(rawDockWorkspace.selectedClueIds.filter(id => validEvidenceIds.has(id)))].sort().slice(0, 3)
        : [];
      const assessments = [] as InvestigationWorkspace['assessments'];
      const usedAttemptIds = new Set<string>();
      for (const rawAssessment of Array.isArray(rawDockWorkspace.assessments) ? rawDockWorkspace.assessments : []) {
        const hypothesis = INVESTIGATION_HYPOTHESIS_DEFS.find(def => def.id === rawAssessment?.hypothesisId);
        const method = INVESTIGATION_METHOD_DEFS.find(def => def.id === rawAssessment?.methodId);
        if (!hypothesis || !method || !hypothesis.methodIds.includes(method.id)
          || !Array.isArray(rawAssessment.clueIds) || rawAssessment.clueIds.length < 2 || rawAssessment.clueIds.length > 3
          || rawAssessment.clueIds.some(id => !validEvidenceIds.has(id))
          || !hypothesis.requiredClueIds.every(id => rawAssessment.clueIds.includes(id))
          || typeof rawAssessment.attemptId !== 'string' || usedAttemptIds.has(rawAssessment.attemptId)) continue;
        const attempt = s.checkAttempts.find(candidate => candidate.attemptId === rawAssessment.attemptId
          && candidate.checkId === investigationHypothesisCheckId(hypothesis.id, method.id));
        if (!attempt || attempt.startedDay !== rawAssessment.day || attempt.startedHour !== rawAssessment.hour
          || attemptEndedAbsoluteHour(attempt) > absoluteHour(s)
          || JSON.stringify([...attempt.context.clueIds].sort()) !== JSON.stringify([...new Set(rawAssessment.clueIds)].sort())
          || !attempt.receipt.effects.some(effect => effect.id === `hypothesis:${hypothesis.id}:assessment` && effect.applied)) continue;
        const internal = evaluateCheck(EXPLORATION_CHECKS, {
          checkId: attempt.checkId, definitionVersion: attempt.definitionVersion, context: attempt.context,
          startedAt: { day: attempt.startedDay, hour: attempt.startedHour },
        });
        const outcome = investigationOutcome(internal);
        if (rawAssessment.outcome !== outcome) continue;
        usedAttemptIds.add(attempt.attemptId);
        assessments.push({
          hypothesisId: hypothesis.id, methodId: method.id,
          clueIds: [...new Set(rawAssessment.clueIds)].sort(), outcome,
          attemptId: attempt.attemptId, day: attempt.startedDay, hour: attempt.startedHour,
        });
      }
      s.investigationWorkspaces.dock_manifest = { caseId: 'dock_manifest', selectedClueIds, assessments: assessments.slice(-30) };
    }
    if (loadedVersion < 22) {
      s.deepInvestigations = {};
      s.caseThreats = {};
      s.pendingEncounter = null;
    } else {
      const rawDeepInvestigations = s.deepInvestigations && typeof s.deepInvestigations === 'object'
        ? s.deepInvestigations : {};
      s.deepInvestigations = {};
      for (const [id, record] of Object.entries(rawDeepInvestigations)) {
        const def = DEEP_INVESTIGATION_DEFS.find(candidate => candidate.id === id);
        if (!def || !record || record.investigationId !== id || record.clueId !== def.clueId
          || record.nextStepId !== def.nextStepId || !hasClue(s, def.clueId)
          || !Number.isInteger(record.confirmedDay) || record.confirmedDay < 1 || record.confirmedDay > s.day
          || !Number.isInteger(record.confirmedHour) || record.confirmedHour < 0 || record.confirmedHour > 23) continue;
        s.deepInvestigations[id] = {
          investigationId: id, clueId: def.clueId, nextStepId: def.nextStepId,
          confirmedDay: record.confirmedDay, confirmedHour: record.confirmedHour,
        };
      }

      const rawThreat = s.caseThreats && typeof s.caseThreats === 'object'
        ? s.caseThreats[DOCK_THREAT_ID] : undefined;
      s.caseThreats = {};
      if (rawThreat && rawThreat.threatId === DOCK_THREAT_ID && Number.isFinite(rawThreat.attention)
        && ['active', 'resolved'].includes(rawThreat.status) && Number.isInteger(rawThreat.encounterCount)
        && rawThreat.encounterCount >= 0 && rawThreat.encounterCount <= 1) {
        const validSources = new Set([
          ...DEEP_INVESTIGATION_DEFS.map(def => def.id),
          'divination:self:dock_scale_evidence',
          ...INVESTIGATION_HYPOTHESIS_DEFS.flatMap(hypothesis => hypothesis.methodIds
            .map(methodId => `hypothesis:${hypothesis.id}:${methodId}`)),
          ...Object.keys(DOCK_WITNESS_CHECK_IDS).map(choiceId => `witness_crisis:${choiceId}`),
          ...Object.keys(DOCK_WITNESS_FOLLOWUP_CHECK_IDS).map(routeId => `witness_followup:${routeId}`),
          ...Object.keys(DOCK_GRAY_HAT_CHECK_IDS).map(operationId => `gray_hat_operation:${operationId}`),
          ...Object.keys(DOCK_OLD_YARD_CHECK_IDS).filter(actionId => actionId !== 'survey_perimeter')
            .map(actionId => `old_loading_yard:${actionId}`),
          'dock_transfer_followup:tail_wagon',
        ]);
        s.caseThreats[DOCK_THREAT_ID] = {
          threatId: DOCK_THREAT_ID,
          attention: clamp(Math.floor(rawThreat.attention)),
          status: rawThreat.status,
          encounterCount: rawThreat.encounterCount,
          noticedSourceIds: Array.isArray(rawThreat.noticedSourceIds)
            ? [...new Set(rawThreat.noticedSourceIds.filter(id => validSources.has(id)))] : [],
          shownSignalStages: Array.isArray(rawThreat.shownSignalStages)
            ? [...new Set(rawThreat.shownSignalStages.filter(stage => [25, 50, 75].includes(stage)))] : [],
        };
      }
      const pending = s.pendingEncounter;
      const threat = s.caseThreats[DOCK_THREAT_ID];
      const validPendingSource = pending?.sourceKind === 'deep_investigation'
        ? DEEP_INVESTIGATION_DEFS.some(def => def.id === pending.sourceId)
        : pending?.sourceKind === 'divination' ? pending.sourceId === 'divination:self:dock_scale_evidence'
          : pending?.sourceKind === 'hypothesis' ? INVESTIGATION_HYPOTHESIS_DEFS.some(hypothesis => hypothesis.methodIds
            .some(methodId => pending.sourceId === `hypothesis:${hypothesis.id}:${methodId}`))
            : pending?.sourceKind === 'case_choice' && (
              Object.keys(DOCK_WITNESS_CHECK_IDS).some(choiceId => pending.sourceId === `witness_crisis:${choiceId}`)
              || Object.keys(DOCK_WITNESS_FOLLOWUP_CHECK_IDS).some(routeId => pending.sourceId === `witness_followup:${routeId}`)
              || Object.keys(DOCK_GRAY_HAT_CHECK_IDS).some(operationId => pending.sourceId === `gray_hat_operation:${operationId}`)
            );
      if (!pending || pending.encounterId !== DOCK_ENCOUNTER_ID || pending.threatId !== DOCK_THREAT_ID
        || !['escape_choice', 'combat'].includes(pending.phase) || !validPendingSource
        || !Number.isInteger(pending.startedDay) || pending.startedDay < 1 || pending.startedDay > s.day
        || !Number.isInteger(pending.startedHour) || pending.startedHour < 0 || pending.startedHour > 23
        || !Number.isInteger(pending.narrativeVariant) || pending.narrativeVariant < 0 || pending.narrativeVariant > 2
        || !threat || threat.status !== 'active' || threat.encounterCount !== 1
        || !threat.noticedSourceIds.includes(pending.sourceId) || dockCaseDispositionClue(s)) {
        s.pendingEncounter = null;
      } else {
        const pendingStarted = (pending.startedDay - 1) * 24 + pending.startedHour;
        const now = absoluteHour(s);
        const rawPreparations = loadedVersion >= 26 && Array.isArray(pending.preparations)
          ? pending.preparations : [];
        const uniquePreparations = [...new Set(rawPreparations)]
          .filter((id): id is DockCombatPreparationId => DOCK_COMBAT_PREPARATIONS.some(def => def.id === id));
        pending.preparations = uniquePreparations.filter(preparationId => {
          return s.checkAttempts.some(attempt => authoritativeDockPreparationAttempt(s, preparationId, attempt)
            && (attempt.startedDay - 1) * 24 + attempt.startedHour >= pendingStarted
            && attemptEndedAbsoluteHour(attempt) <= now);
        });
        if (pending.phase === 'combat') {
          const sanitizedRound = loadedVersion >= 29 ? sanitizeCombatRound(pending.combatRound, false) : null;
          if (loadedVersion >= 29) pending.combatRound = sanitizedRound ?? freshCombatRound(false);
          else delete pending.combatRound;
        } else {
          delete pending.combatRound;
        }
      }
    }
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
    const rawSequence9Preparations: unknown[] = Array.isArray(s.sequence9Preparations) ? [...s.sequence9Preparations] : [];
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
      const blueprint = RANDOM_TEXT_EVENTS.find(candidate => candidate.id === pending.blueprintId);
      if (removedShortcutEvents.has(pending.blueprintId)
        || !blueprint || !validPersistedGeneratedEvent(pending, blueprint)) {
        s.pendingEvent = null;
      }
    }
    if (typeof s.pendingEvent === 'string') {
      const pending = findEvent(s.pendingEvent);
      if (removedShortcutEvents.has(s.pendingEvent) || !pending || !validateConditionExpression(pending.cond).valid
        || pending.choices.some(choice => !validateConditionExpression(choice.cond).valid)) s.pendingEvent = null;
    }

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
    const rawNightwatchLoop = s.nightwatchEarlyLoop;
    s.nightwatchEarlyLoop = createNightwatchEarlyLoopState();
    if (rawNightwatchLoop && typeof rawNightwatchLoop === 'object') {
      const seenRoutineCycles = new Set<string>();
      s.nightwatchEarlyLoop.records = Array.isArray(rawNightwatchLoop.records) ? rawNightwatchLoop.records.flatMap(record => {
        const def = record && NIGHTWATCH_ROUTINE_ACTIONS.find(candidate => candidate.id === record.actionId);
        if (!def || !Number.isInteger(record.day) || record.day < 1 || record.day > s.day) return [];
        const cycleKey = nightwatchRoutineCycleKey(record.day, def.cooldown);
        const uniqueKey = `${record.actionId}:${cycleKey}`;
        if (record.cycleKey !== cycleKey || seenRoutineCycles.has(uniqueKey)) return [];
        seenRoutineCycles.add(uniqueKey);
        return [{ actionId: def.id, day: record.day, cycleKey }];
      }) : [];
      s.nightwatchEarlyLoop.reputation = Number.isInteger(rawNightwatchLoop.reputation)
        ? clamp(rawNightwatchLoop.reputation, 0, 100) : 0;
      for (const skill of Object.keys(SKILL_NAMES) as SkillKey[]) {
        const progress = rawNightwatchLoop.trainingProgress?.[skill];
        if (Number.isInteger(progress) && progress! >= 0 && progress! < 3) s.nightwatchEarlyLoop.trainingProgress[skill] = progress;
      }
    }
    const rawClub = s.divinationClub;
    s.divinationClub = createDivinationClubState();
    if (rawClub && typeof rawClub === 'object' && rawClub.joined === true && hasSequence9DivinationClubAccess(s)) {
      s.divinationClub.joined = true;
      for (const def of DIVINATION_CLUB_COMMISSIONS) {
        const acceptAttempt = authoritativeDivinationClubAcceptAttempt(s.checkAttempts, def.id);
        const briefing = s.clues.find(clue => clue.id === def.briefingClueId);
        const briefingAuthorized = !!briefing && briefing.sourceKind === 'npc' && briefing.sourceId === def.clientId
          && ((!!acceptAttempt && briefing.acquiredDay === acceptAttempt.startedDay
            && briefing.acquiredHour === acceptAttempt.startedHour) || legacyClubCompletionIds.has(def.id));
        if (briefing && !briefingAuthorized) {
          s.clues = s.clues.filter(clue => clue.id !== def.briefingClueId);
        }
        const fieldAttempt = [...s.checkAttempts].reverse().find(attempt => attempt.checkId === def.fieldCheckId
          && attempt.outcome === 'passed' && appliedReceiptEffect(attempt, `clue:${def.fieldClueId}`));
        const fieldClue = s.clues.find(clue => clue.id === def.fieldClueId);
        if (!acceptAttempt || !fieldAttempt || !fieldClue || fieldClue.sourceKind !== 'location' || fieldClue.sourceId !== def.fieldLocationId) {
          s.clues = s.clues.filter(clue => clue.id !== def.fieldClueId);
        }
      }
      const completed = new Set<DivinationClubCommissionId>();
      for (const def of DIVINATION_CLUB_COMMISSIONS) {
        const completionAttempt = authoritativeDivinationClubCompletionAttempt(s.checkAttempts, def.id);
        const acceptAttempt = authoritativeDivinationClubAcceptAttempt(s.checkAttempts, def.id);
        const outcomeClue = s.clues.find(clue => clue.id === def.outcomeClueId);
        const newCompletion = !!acceptAttempt && !!completionAttempt && !!outcomeClue
          && outcomeClue.sourceKind === 'npc' && outcomeClue.sourceId === def.clientId;
        if (newCompletion || legacyClubCompletionIds.has(def.id)) completed.add(def.id);
        if (!newCompletion) s.clues = s.clues.filter(clue => clue.id !== def.outcomeClueId);
      }
      s.divinationClub.completedCommissionIds = DIVINATION_CLUB_COMMISSIONS
        .map(def => def.id).filter(id => completed.has(id));
      s.divinationClub.reputation = clamp(s.divinationClub.completedCommissionIds.reduce((total, id) => {
        return total + (DIVINATION_CLUB_COMMISSIONS.find(def => def.id === id)?.reputationGain ?? 0);
      }, 0), 0, 100);
      const activeDef = DIVINATION_CLUB_COMMISSIONS.find(def => def.id === rawClub.activeCommissionId);
      const activeIndex = activeDef ? DIVINATION_CLUB_COMMISSIONS.findIndex(def => def.id === activeDef.id) : -1;
      const earlierComplete = activeIndex >= 0 && DIVINATION_CLUB_COMMISSIONS.slice(0, activeIndex)
        .every(def => s.divinationClub.completedCommissionIds.includes(def.id));
      const briefing = activeDef && s.clues.find(clue => clue.id === activeDef.briefingClueId);
      const acceptAttempt = activeDef && authoritativeDivinationClubAcceptAttempt(s.checkAttempts, activeDef.id);
      if (activeDef && earlierComplete && !s.divinationClub.completedCommissionIds.includes(activeDef.id)
        && !!acceptAttempt && briefing?.sourceKind === 'npc' && briefing.sourceId === activeDef.clientId
        && briefing.acquiredDay === acceptAttempt.startedDay && briefing.acquiredHour === acceptAttempt.startedHour) {
        s.divinationClub.activeCommissionId = activeDef.id;
      }
    }
    const rawElliot = s.elliotCase;
    s.elliotCase = createElliotCaseState();
    const elliotStageOrder = ['unknown', 'commissioned', 'location_known', 'presence_confirmed', 'backup_ready', 'rescued', 'closed'] as const;
    if (rawElliot && typeof rawElliot === 'object' && elliotStageOrder.includes(rawElliot.stage)
      && rawElliot.employerId === 'vickroyer' && rawElliot.assignedPartnerId === 'leonard'
      && hasClue(s, 'elliot_commission_brief') && hasClue(s, 'elliot_worn_coat') && hasClue(s, 'elliot_partner_assignment')) {
      let maxStage: GameState['elliotCase']['stage'] = 'commissioned';
      if (hasClue(s, 'elliot_hideout_address')) maxStage = 'location_known';
      if (hasClue(s, 'elliot_presence_confirmed')) maxStage = 'presence_confirmed';
      if (hasClue(s, 'elliot_backup_ready')) maxStage = 'backup_ready';
      if (hasClue(s, 'elliot_rescue_record')) maxStage = rawElliot.rewardClaimed === true ? 'closed' : 'rescued';
      const requestedIndex = elliotStageOrder.indexOf(rawElliot.stage);
      const maxIndex = elliotStageOrder.indexOf(maxStage);
      const stage = elliotStageOrder[Math.min(requestedIndex, maxIndex)];
      s.elliotCase = {
        stage, employerId: 'vickroyer', assignedPartnerId: 'leonard',
        locatorMode: rawElliot.locatorMode === 'divination' || rawElliot.locatorMode === 'records' ? rawElliot.locatorMode : null,
        rewardClaimed: stage === 'closed',
      };
    }
    if (!hasClue(s, 'elliot_hideout_address')) {
      s.visitedLocations = (s.visitedLocations ?? []).filter(locationId => locationId !== 'forston_hideout');
      if (s.currentLocation?.locationId === 'forston_hideout') s.currentLocation = null;
    }
    const rawSeerTraining = s.seerTraining;
    s.seerTraining = createSeerTrainingState();
    if (rawSeerTraining && typeof rawSeerTraining === 'object' && isFormalNightwatchSeerStudent(s)) {
      const validPassedAttempt = (checkId: string, receiptId: string) => s.checkAttempts.some(attempt => attempt.checkId === checkId
        && attempt.outcome === 'passed' && appliedReceiptEffect(attempt, receiptId));
      const ritualPracticeAuthority = rawSeerTraining.ritualPracticeComplete === true
        && validPassedAttempt('seer_ritual_safety_practice', 'seer_training:ritual_practice');
      const caseReviewAuthority = Array.isArray(rawSeerTraining.spiritChannelingCaseIds)
        && rawSeerTraining.spiritChannelingCaseIds.includes('elliot_kidnapping')
        && s.elliotCase.employerId === 'vickroyer' && hasClue(s, 'elliot_commission_brief')
        && validPassedAttempt('seer_spirit_channeling_review', 'seer_training:case_review');
      const blankCharmAuthority = rawSeerTraining.blankCharmPracticeComplete === true
        && validPassedAttempt('seer_blank_charm_structure', 'seer_training:blank_charm');
      s.seerTraining.meditationPracticeDays = Array.isArray(rawSeerTraining.meditationPracticeDays)
        ? [...new Set(rawSeerTraining.meditationPracticeDays.filter(day => Number.isInteger(day) && day >= 1 && day <= s.day))]
        : [];
      const rawLessonRecords = Array.isArray(rawSeerTraining.lessonRecords) ? rawSeerTraining.lessonRecords : [];
      let previousLessonEnd = -1;
      const currentAbsoluteHour = (s.day - 1) * 24 + s.hour;
      for (const node of SEER_TRAINING_NODES) {
        if (!Array.isArray(rawSeerTraining.learnedNodeIds) || !rawSeerTraining.learnedNodeIds.includes(node.id)) break;
        const record = rawLessonRecords.find(candidate => candidate?.nodeId === node.id);
        const lessonStart = record && Number.isInteger(record.day) && Number.isInteger(record.hour)
          ? (record.day - 1) * 24 + record.hour : -1;
        const lessonEnd = lessonStart + node.hours;
        if (!record || !Number.isInteger(record.day) || record.day < 1 || record.day > s.day
          || !Number.isInteger(record.hour) || record.hour < 0 || record.hour > 23
          || weekdayOf(record.day) === 0 || record.hour < 9 || record.hour + node.hours > 17
          || lessonStart < previousLessonEnd || lessonEnd > currentAbsoluteHour
          || node.prerequisites.some(id => !s.seerTraining.learnedNodeIds.includes(id))) break;
        if (node.requiredPractice === 'meditation' && s.seerTraining.meditationPracticeDays.length === 0) break;
        if (node.requiredPractice === 'ritual_safety' && !ritualPracticeAuthority) break;
        if (node.requiredPractice === 'spirit_channeling_review' && !caseReviewAuthority) break;
        s.seerTraining.learnedNodeIds.push(node.id);
        s.seerTraining.lessonRecords.push({ nodeId: node.id, day: record.day, hour: record.hour });
        previousLessonEnd = lessonEnd;
      }
      if (!s.seerTraining.learnedNodeIds.includes('meditation_control')) s.seerTraining.meditationPracticeDays = [];
      s.seerTraining.focusPreparation = rawSeerTraining.focusPreparation === true
        && s.seerTraining.learnedNodeIds.includes('meditation_control') && s.seerTraining.meditationPracticeDays.length > 0;
      s.seerTraining.ritualPracticeComplete = ritualPracticeAuthority
        && s.seerTraining.learnedNodeIds.includes('ritual_safety');
      s.seerTraining.spiritChannelingCaseIds = caseReviewAuthority
        && s.seerTraining.learnedNodeIds.includes('spirit_channeling') ? ['elliot_kidnapping'] : [];
      s.seerTraining.blankCharmPracticeComplete = blankCharmAuthority
        && s.seerTraining.learnedNodeIds.includes('charm_theory');
    }
    const rawTradeFair = s.tradeFair && typeof s.tradeFair === 'object' ? s.tradeFair : undefined;
    const cleanTradeFair = createTradeFairState();
    if (loadedVersion >= 19 && rawTradeFair) {
      const rawInvitation = rawTradeFair.invitation;
      if (rawInvitation && ['organization', 'npc'].includes(rawInvitation.sourceKind)
        && typeof rawInvitation.sourceId === 'string'
        && Number.isInteger(rawInvitation.acquiredDay) && rawInvitation.acquiredDay >= 1
        && Number.isInteger(rawInvitation.acquiredHour) && rawInvitation.acquiredHour >= 0 && rawInvitation.acquiredHour <= 23) {
        cleanTradeFair.invitation = { ...rawInvitation };
      }
      for (const product of TRADE_FAIR_PRODUCTS) {
        const stock = rawTradeFair.stock?.[product.id];
        const purchased = rawTradeFair.purchasedCounts?.[product.id];
        const consumed = rawTradeFair.consumedPurchasedCounts?.[product.id];
        const coherent = Number.isInteger(stock) && stock >= 0 && stock <= product.initialStock
          && Number.isInteger(purchased) && purchased === product.initialStock - stock
          && Number.isInteger(consumed) && consumed >= 0 && consumed <= purchased;
        if (!coherent) continue;
        cleanTradeFair.stock[product.id] = stock;
        cleanTradeFair.purchasedCounts[product.id] = purchased;
        cleanTradeFair.consumedPurchasedCounts[product.id] = consumed;
      }
    }
    s.tradeFair = cleanTradeFair;
    if (!validTradeFairInvitation(s)) {
      s.tradeFair.invitation = null;
      s.intel = Array.isArray(s.intel) ? s.intel.filter(id => id !== 'trade_fair_invitation') : [];
    } else {
      s.intel = Array.isArray(s.intel) ? s.intel : [];
      if (!s.intel.includes('trade_fair_invitation')) s.intel.push('trade_fair_invitation');
      if (!s.intel.includes('black_market')) s.intel.push('black_market');
    }

    const seenMurders = new Set<string>();
    s.murderRecords = loadedVersion >= 23 && Array.isArray(s.murderRecords)
      ? s.murderRecords.filter(record => {
        if (!record || seenMurders.has(record.targetId)) return false;
        const target = huntTargetDef(record.targetId);
        if (!target || record.npcId !== target.npcId || record.deathSourceId !== target.deathSourceId
          || record.infamyGain !== 25 || record.lawAttentionGain !== 8 || record.avengerName !== target.avenger.name
          || typeof record.settlementAttemptId !== 'string' || record.settlementAttemptId.length < 1
          || (record.initiatingAttemptId !== undefined && (typeof record.initiatingAttemptId !== 'string' || record.initiatingAttemptId.length < 1))
          || !Number.isInteger(record.day) || record.day < 1
          || record.day > s.day || !Number.isInteger(record.hour) || record.hour < 0 || record.hour > 23
          || !authoritativeHuntSettlement(s, record, target)) return false;
        seenMurders.add(record.targetId);
        return true;
      }) : [];
    s.infamy = s.murderRecords.reduce((sum, record) => sum + record.infamyGain, 0);
    s.lawAttention = s.murderRecords.reduce((sum, record) => sum + record.lawAttentionGain, 0);

    const rawHunt = loadedVersion >= 23 && s.activeHunt && typeof s.activeHunt === 'object' ? s.activeHunt : null;
    const target = rawHunt ? huntTargetDef(rawHunt.targetId) : undefined;
    const preparationClues: Record<HuntPreparationKey, string> = {
      routine: 'masked_smuggler_routine', secludedMeeting: 'masked_smuggler_secluded_meeting',
      escapeRoute: 'masked_smuggler_escape_route', ambush: 'masked_smuggler_ambush_position',
    };
    const preparations = rawHunt?.preparations && typeof rawHunt.preparations === 'object'
      ? Object.fromEntries((Object.keys(preparationClues) as HuntPreparationKey[]).map(key => [key, rawHunt.preparations[key] === true && hasClue(s, preparationClues[key])])) as ActiveHunt['preparations']
      : null;
    const validHuntPhase = rawHunt && ['investigating', 'preparing', 'ready', 'confronted', 'combat'].includes(rawHunt.phase);
    const validConfrontation = rawHunt?.phase !== 'confronted' && rawHunt?.phase !== 'combat'
      || rawHunt.confrontationCause === 'alerted' || rawHunt.confrontationCause === 'failed_strike';
    const identityConfirmed = !!rawHunt?.identityConfirmed && hasClue(s, 'masked_smuggler_trade_tell');
    const allPrepared = preparations ? Object.values(preparations).every(Boolean) : false;
    const initiatingAttempt = typeof rawHunt?.initiatingAttemptId === 'string'
      ? s.checkAttempts.find(attempt => attempt.attemptId === rawHunt.initiatingAttemptId) : undefined;
    const validInitiatingAttempt = !!initiatingAttempt && initiatingAttempt.checkId === 'hunt_masked_smuggler_strike'
      && initiatingAttempt.outcome === 'blocked' && appliedReceiptEffect(initiatingAttempt, 'hunt:combat');
    const needsInitiatingAttempt = rawHunt?.phase === 'combat' && rawHunt.confrontationCause === 'failed_strike';
    const huntCombatRound = rawHunt?.phase === 'combat' && loadedVersion >= 29
      ? sanitizeCombatRound(rawHunt.combatRound, rawHunt.confrontationCause === 'failed_strike') ?? freshCombatRound(rawHunt.confrontationCause === 'failed_strike')
      : null;
    s.activeHunt = target && preparations && validHuntPhase && validConfrontation
      && Number.isInteger(rawHunt!.suspicion) && rawHunt!.suspicion >= 0 && rawHunt!.suspicion <= 3
      && !(rawHunt!.phase === 'ready' && !allPrepared)
      && (!needsInitiatingAttempt || validInitiatingAttempt)
      ? {
        targetId: target.id, phase: identityConfirmed ? rawHunt!.phase : 'investigating', identityConfirmed,
        preparations: identityConfirmed ? preparations : freshActiveHunt(target.id).preparations,
        suspicion: rawHunt!.suspicion,
        ...((rawHunt!.phase === 'confronted' || rawHunt!.phase === 'combat') && rawHunt!.confrontationCause
          ? { confrontationCause: rawHunt!.confrontationCause } : {}),
        ...(needsInitiatingAttempt ? { initiatingAttemptId: initiatingAttempt!.attemptId } : {}),
        ...(huntCombatRound ? { combatRound: huntCombatRound } : {}),
      } : null;

    const seenDeaths = new Set<string>();
    s.confirmedBeyonderDeaths = loadedVersion >= 19 && Array.isArray(s.confirmedBeyonderDeaths)
      ? s.confirmedBeyonderDeaths.flatMap(rawRecord => {
        if (!rawRecord || seenDeaths.has(rawRecord.sourceId)) return [];
        const def = BEYONDER_DEATH_SOURCES.find(candidate => candidate.id === rawRecord.sourceId);
        const cause = loadedVersion >= 23 && (rawRecord.cause === 'event' || rawRecord.cause === 'hunt') ? rawRecord.cause : 'event';
        const validAuthority = cause === 'event'
          ? !!def?.eventId && s.firedOnce.includes(def.eventId)
          : !!def?.huntTargetId && typeof rawRecord.settlementAttemptId === 'string'
            && s.murderRecords.some(record => record.targetId === def.huntTargetId && record.deathSourceId === def.id
              && record.settlementAttemptId === rawRecord.settlementAttemptId
              && record.day === rawRecord.confirmedDay && record.hour === rawRecord.confirmedHour);
        if (!def || !validAuthority || rawRecord.npcId !== def.npcId
          || rawRecord.pathwayId !== def.pathwayId || rawRecord.sequence !== def.sequence
          || rawRecord.characteristicItemId !== def.characteristicItemId
          || !Number.isInteger(rawRecord.confirmedDay) || rawRecord.confirmedDay < 1
          || !Number.isInteger(rawRecord.confirmedHour) || rawRecord.confirmedHour < 0 || rawRecord.confirmedHour > 23) return [];
        seenDeaths.add(rawRecord.sourceId);
        return [{ ...rawRecord, cause }];
      }) : [];
    s.murderRecords = s.murderRecords.filter(record => s.confirmedBeyonderDeaths.some(death => death.sourceId === record.deathSourceId && death.cause === 'hunt'));
    s.infamy = s.murderRecords.reduce((sum, record) => sum + record.infamyGain, 0);
    s.lawAttention = s.murderRecords.reduce((sum, record) => sum + record.lawAttentionGain, 0);
    const seenAreaSettlementIds = new Set<string>();
    const seenAreaSemanticKeys = new Set<string>();
    s.areaSuspicionRecords = loadedVersion >= 27 && Array.isArray(s.areaSuspicionRecords)
      ? s.areaSuspicionRecords.flatMap(rawRecord => {
        const record = canonicalAreaSuspicionRecord(s, rawRecord);
        const semanticKey = record ? areaSuspicionSemanticKey(s, record) : null;
        if (!record || !semanticKey || seenAreaSettlementIds.has(record.settlementAttemptId)
          || seenAreaSemanticKeys.has(semanticKey)) return [];
        seenAreaSettlementIds.add(record.settlementAttemptId);
        seenAreaSemanticKeys.add(semanticKey);
        return [record];
      }) : [];
    const seenIdentityDiscoverySources = new Set<string>();
    const seenIdentityDiscoveryAttempts = new Set<string>();
    s.identityTraceDiscoveries = loadedVersion >= 28 && Array.isArray(s.identityTraceDiscoveries)
      ? s.identityTraceDiscoveries.flatMap(rawRecord => {
        const record = canonicalIdentityTraceDiscovery(s, rawRecord);
        if (!record || seenIdentityDiscoverySources.has(record.sourceRecordId)
          || seenIdentityDiscoveryAttempts.has(record.investigationAttemptId)) return [];
        seenIdentityDiscoverySources.add(record.sourceRecordId);
        seenIdentityDiscoveryAttempts.add(record.investigationAttemptId);
        return [record];
      }) : [];
    const seenIdentityResolutionSources = new Set<string>();
    const seenIdentityResolutionAttempts = new Set<string>();
    s.identityTraceResolutions = loadedVersion >= 28 && Array.isArray(s.identityTraceResolutions)
      ? s.identityTraceResolutions.flatMap(rawRecord => {
        const record = canonicalIdentityTraceResolution(s, rawRecord);
        if (!record || seenIdentityResolutionSources.has(record.sourceRecordId)
          || seenIdentityResolutionAttempts.has(record.resolutionAttemptId)) return [];
        seenIdentityResolutionSources.add(record.sourceRecordId);
        seenIdentityResolutionAttempts.add(record.resolutionAttemptId);
        return [record];
      }) : [];
    s.identityCover = loadedVersion >= 28 ? canonicalIdentityCover(s, s.identityCover) : null;
    rebuildAreaSuspicion(s);
    const unresolvedMurders = s.murderRecords.filter(record => {
      const target = huntTargetDef(record.targetId);
      return !target || !authoritativeRevengeResolution(record, target, s.day);
    });
    if (unresolvedMurders.length > 0) {
      const latestMurder = [...unresolvedMurders].sort((a, b) => murderAbsoluteHour(b) - murderAbsoluteHour(a))[0];
      const avenger = huntTargetDef(latestMurder.targetId)?.avenger;
      if (avenger) {
        const savedNemesis = s.nemesis;
        const validSavedProgress = savedNemesis?.name === avenger.name
          && savedNemesis.archetype === avenger.archetype && savedNemesis.motive === avenger.motive
          && savedNemesis.alive === true && typeof savedNemesis.known === 'boolean'
          && Number.isInteger(savedNemesis.power) && savedNemesis.power >= avenger.power && savedNemesis.power <= avenger.power + s.day
          && Number.isFinite(savedNemesis.hostility) && savedNemesis.hostility >= 0 && savedNemesis.hostility <= 100;
        s.nemesis = validSavedProgress
          ? { ...structuredClone(avenger), power: savedNemesis!.power, hostility: Math.floor(savedNemesis!.hostility), known: savedNemesis!.known }
          : structuredClone(avenger);
      }
    } else {
      const resolvedAvengerNames = new Set(s.murderRecords.flatMap(record => {
        const target = huntTargetDef(record.targetId);
        return target && authoritativeRevengeResolution(record, target, s.day) ? [target.avenger.name] : [];
      }));
      if (s.nemesis && resolvedAvengerNames.has(s.nemesis.name)) s.nemesis = null;
    }
    for (const item of ITEMS.filter(candidate => candidate.seq9Product?.kind === 'characteristic')) {
      const verifiedPurchases = verifiedTradeFairItemQuantity(s, item.id);
      const verifiedDeaths = s.confirmedBeyonderDeaths.filter(record => record.characteristicItemId === item.id).length;
      s.items[item.id] = Math.min(
        Math.max(0, Math.floor(s.items[item.id] ?? 0)),
        verifiedPurchases + verifiedDeaths,
      );
    }
    if (s.activeHunt && s.confirmedBeyonderDeaths.some(death => death.npcId === huntTargetDef(s.activeHunt!.targetId)?.npcId)) s.activeHunt = null;
    s.tradeFair.identifiedCharacteristicIds = loadedVersion >= 19 && Array.isArray(rawTradeFair?.identifiedCharacteristicIds)
      ? [...new Set(rawTradeFair.identifiedCharacteristicIds.filter(itemId => {
        const item = findItem(itemId);
        return item?.seq9Product?.kind === 'characteristic'
          && (s.confirmedBeyonderDeaths.some(record => record.characteristicItemId === itemId)
            || verifiedTradeFairItemQuantity(s, itemId) > 0);
      }))] : [];
    for (const product of TRADE_FAIR_PRODUCTS.filter(candidate => candidate.kind === 'formula' && candidate.formulaId)) {
      if ((s.tradeFair.purchasedCounts[product.id] ?? 0) <= 0) continue;
      if (!s.formulas.includes(product.formulaId!)) s.formulas.push(product.formulaId!);
      const lead = pathwayLead(s, product.pathwayId);
      if (!lead.organizationId) lead.currentSource = 'trade_fair';
      lead.formulaStatus = 'verified';
    }
    for (const pathway of PATHWAYS) {
      const lead = pathwayLead(s, pathway.id);
      if (lead.currentSource !== 'trade_fair') continue;
      const hasFormulaPurchase = (s.tradeFair.purchasedCounts[`trade:${pathway.id}:formula`] ?? 0) > 0;
      const confirmationMode = lead.preparationMode === 'purchased_dose' ? 'purchased_dose'
        : lead.preparationMode === 'characteristic_brew' ? 'characteristic'
          : lead.preparationMode === 'trade_fair_brew' ? 'materials' : null;
      const hasPreparationPurchase = confirmationMode === 'purchased_dose'
        ? (s.tradeFair.purchasedCounts[`trade:${pathway.id}:potion`] ?? 0) > 0
        : confirmationMode === 'characteristic'
          ? hasFormulaPurchase && ((s.tradeFair.purchasedCounts[`trade:${pathway.id}:characteristic`] ?? 0) > 0
            || s.confirmedBeyonderDeaths.some(record => record.pathwayId === pathway.id))
          : confirmationMode === 'materials' ? hasFormulaPurchase : false;
      const hasConfirmedTradeRoute = lead.commitment && lead.routeStep === 'trade_fair_confirmed' && hasTradeFairInvitation(s)
        && !!confirmationMode && hasPreparationPurchase
        && lead.history.some(record => record.step === `trade_fair_commit:${confirmationMode}` && record.outcome === 'passed');
      if (hasConfirmedTradeRoute) continue;
      if (hasFormulaPurchase) {
        const formulaHistory = lead.history.filter(record => record.step === `trade_fair_formula:${pathway.id}9` && record.outcome === 'passed');
        Object.assign(lead, blankPathwayLead(), { currentSource: 'trade_fair', formulaStatus: 'verified', history: formulaHistory });
      } else {
        Object.assign(lead, blankPathwayLead());
      }
    }
    if (loadedVersion < 19 && !isBeyonder(s)) {
      for (const pathway of PATHWAYS) {
        const lead = pathwayLead(s, pathway.id);
        if (lead.commitment && lead.preparationMode && lead.preparationMode !== 'official_dose'
          && (s.items[pathway.seq9.auxiliary] ?? 0) <= 0) s.items[pathway.seq9.auxiliary] = 1;
      }
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
    if (loadedVersion < 19) {
      const sourceRenames: Record<string, string> = {
        'hunter:deer_heart': 'hunter:blood_red_chestnut',
        'hunter:iron_fern': 'hunter:activated_marsh_crystal',
        'sleepless:bat_eye': 'sleepless:midnight_beauty_flower',
        'sleepless:deep_sleep_flower': 'sleepless:six_legged_owl_eye',
        'apprentice:gecko_skin': 'apprentice:treasure_eating_bug',
        'apprentice:mold_spore': 'apprentice:phantom_crystal',
      };
      for (const [legacyId, currentId] of Object.entries(sourceRenames)) {
        const legacy = oldMaterialSources[legacyId];
        const current = s.materialSources[currentId];
        if (!legacy || !current) continue;
        current.unlocked = legacy.unlocked === true;
        current.remaining = Number.isInteger(legacy.remaining) ? Math.max(0, Math.min(1, legacy.remaining)) : current.remaining;
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
    if (loadedVersion < 20) {
      s.sequence9Preparations = [];
    } else {
      const seenPreparationKeys = new Set<string>();
      s.sequence9Preparations = rawSequence9Preparations.flatMap(raw => {
        if (!raw || typeof raw !== 'object') return [];
        const record = raw as Partial<Sequence9PreparationRecord>;
        const def = SEQUENCE9_EXPLORATION_ABILITIES.find(candidate => candidate.id === record.abilityId && candidate.mode === 'preparation');
        if (!def || record.pathwayId !== def.pathwayId || !hasInheritedSequence9Ability(s, def.pathwayId)
          || !LOCATIONS.some(location => location.id === record.locationId && location.actions.includes('explore'))
          || !Number.isInteger(record.preparedDay) || (record.preparedDay ?? 0) < 1 || (record.preparedDay ?? 0) > s.day
          || !Number.isInteger(record.preparedHour) || (record.preparedHour ?? -1) < 0 || (record.preparedHour ?? 24) > 23) return [];
        const cooldownDay = sequence9CooldownDay(record.preparedDay!, record.preparedHour!, def);
        if (record.cooldownDay !== cooldownDay) return [];
        const key = `${record.abilityId}:${cooldownDay}`;
        if (seenPreparationKeys.has(key)) return [];
        const active = record.consumed === false && s.currentLocation?.locationId === record.locationId;
        if (!active && record.consumed !== true) return [];
        if (record.consumed === true && (record.consumedDay !== undefined || record.consumedHour !== undefined)
          && (!Number.isInteger(record.consumedDay) || (record.consumedDay ?? 0) < record.preparedDay!
            || !Number.isInteger(record.consumedHour) || (record.consumedHour ?? -1) < 0 || (record.consumedHour ?? 24) > 23)) return [];
        seenPreparationKeys.add(key);
        return [{
          abilityId: def.id, pathwayId: def.pathwayId, locationId: record.locationId!,
          preparedDay: record.preparedDay!, preparedHour: record.preparedHour!, cooldownDay,
          consumed: !active,
          ...(!active && record.consumedDay !== undefined ? { consumedDay: record.consumedDay } : {}),
          ...(!active && record.consumedHour !== undefined ? { consumedHour: record.consumedHour } : {}),
        } satisfies Sequence9PreparationRecord];
      });
    }
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
          lead.notes.push('旧记录整理：缺少可信的人脉记录，需要重新当面辨认');
        } else if (!verifiedTrusted && lead.stage === 'verified') {
          lead.stage = 'identified';
          lead.notes.push('旧记录整理：缺少完整旁证，需要重新确认来源');
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
    // 新资格硬线索不另建进度字段。旧真实档只有在现有来源审计已经保留路线，或同时具备
    // 世界入口与真实性核验历史时补录；直接伪造 contacted/verified 不能借迁移洗白。
    for (const task of ORGANIZATION_QUALIFICATION_TASKS) {
      if (hasClue(s, task.hardClueId)) continue;
      const def = leadDefForOrganization(task.organizationId);
      const route = organizationRoute(s, task.organizationId);
      const statusPreserved = ['contacted', 'qualified', 'member', 'offer_pending', 'committed'].includes(route.status);
      const strongHistory = !!def
        && route.history.some(record => record.step === `world_entry:${def.id}` && record.outcome === 'passed')
        && route.history.some(record => record.step === `lead_verified:${def.id}` && record.outcome === 'passed');
      const survivedLegacyAudit = loadedVersion === 8;
      if (def && statusPreserved && s.leads[def.id]?.stage === 'verified' && (strongHistory || survivedLegacyAudit)) {
        acquireClue(s, task.hardClueId, 'migration', `qualification-source-audit:${loadedVersion}`);
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
    if (s.sequence8Progress?.pathwayId === 'seer') {
      for (const [principleId, records] of Object.entries(s.sequence8Progress.evidence)) {
        s.sequence8Progress.evidence[principleId] = records.filter(record => {
          if (!record.actionId.startsWith('club_commission:') && !record.contextKey.startsWith('divination_club:')) return true;
          const commissionId = record.actionId.slice('club_commission:'.length) as DivinationClubCommissionId;
          const def = DIVINATION_CLUB_COMMISSIONS.find(candidate => candidate.id === commissionId);
          return !!def && def.actingPrincipleId === principleId && record.principleId === principleId
            && record.contextKey === `divination_club:${def.id}`
            && s.divinationClub.completedCommissionIds.includes(def.id)
            && !!authoritativeDivinationClubCompletionAttempt(s.checkAttempts, def.id);
        });
      }
      const actingDef = SEQUENCE8_ACTING_DEFS.seer;
      const actingComplete = actingDef.principles.every(principle =>
        (s.sequence8Progress!.evidence[principle.id]?.length ?? 0) >= s.sequence8Progress!.requiredEvidencePerPrinciple);
      if (s.sequence8Progress.stage === 'review_ready' && (!actingComplete || s.digestion < 100)) {
        s.sequence8Progress.stage = 'acting';
      }
      updateReviewReady(s, s.sequence8Progress);
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
    // 灵视由合法途径与序列决定；知识条目只是展示，不参与能力鉴权。
    if (!hasInheritedSequence9Ability(s)) s.knowledge = s.knowledge.filter(id => id !== 'spirit_vision');
    else grantSequence9CoreAbilities(s);
    // v19及更早只有占卜家可能合法完成灵视检视；其他角色在新规则生效前留下的
    // itemKnowledge 不能因为迁移后获得通用灵视而被追认。合法占卜结果仍由 attempt 独立重建。
    const trustedLegacyItemKnowledge = loadedVersion < 20 && !hasSeerDivinationSequence(s) ? {} : rawItemKnowledge;
    rebuildPersistedDivinationAndItemKnowledge(s, rawDivinationAttempts, rawDivinationInsights, trustedLegacyItemKnowledge, loadedVersion);
    // v13 开始委托板不得泄露尚未掌握的去向；已接委托作为有效入口保留。
    s.board = Array.isArray(s.board)
      ? s.board.filter(commission => commission && typeof commission.locationId === 'string'
        && isLocationUnlocked(s, commission.locationId)
        && !!LOCATIONS.find(location => location.id === commission.locationId)?.actions.includes('explore'))
      : [];
    if (!isFormalNightwatchSeerStudent(s)) s.seerTraining = createSeerTrainingState();
    if (s.seerTraining.lessonRecords.length === 0) delete s.relations.old_neil;
    if (!['ordinary', 'witness', 'informed'].includes(s.awareness)) s.awareness = isBeyonder(s) ? 'informed' : 'ordinary';
    s.schemaVersion = CURRENT_SCHEMA_VERSION;
    return s;
  } catch { return null; }
}
export function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }
