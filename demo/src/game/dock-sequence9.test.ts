import { beforeEach, describe, expect, it, vi } from 'vitest';
import appSource from '../App.tsx?raw';
import { DOCK_CASE_DISPOSITIONS, DOCK_SEQUENCE9_ACTIONS, PATHWAYS } from './data';
import type { GameState, Pathway } from './types';
import {
  CURRENT_SCHEMA_VERSION,
  acquireClue,
  divinationIssue,
  dockCaseDispositionClue,
  dockCaseDispositionIssue,
  dockSequence9PathActionIssue,
  doMeal,
  doSleep,
  evaluateExplorationCheckInternal,
  getDockCaseDispositions,
  getDockSequence9Actions,
  hasFormalNightwatchRoute,
  hasClue,
  inspectItemWithSpiritVision,
  isLocationUnlocked,
  leaveCurrentLocation,
  loadGame,
  newGame,
  performDivination,
  performDockCaseDisposition,
  performDockSequence9PathAction,
  resolveDockSequence9Case,
  resolveDockSequence9CaseIssue,
  saveGame,
  travelToLocation,
} from './engine';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
}

const abilityInput: Record<string, { stat: 'phy' | 'spi' | 'mnd' | 'cha'; skill: 'investigate' | 'combat' | 'speech' | 'occult' | 'sneak' }> = {
  seer: { stat: 'spi', skill: 'occult' },
  spectator: { stat: 'mnd', skill: 'speech' },
  hunter: { stat: 'phy', skill: 'investigate' },
  sleepless: { stat: 'mnd', skill: 'investigate' },
  apprentice: { stat: 'spi', skill: 'sneak' },
};

const firstActionId: Record<string, string> = {
  seer: 'dock_seq9_seer', spectator: 'dock_seq9_spectator', hunter: 'dock_seq9_hunter',
  sleepless: 'dock_seq9_sleepless', apprentice: 'dock_seq9_apprentice',
};

function atLocation(state: GameState, locationId: string, hour = state.hour) {
  state.hour = hour;
  state.visitedLocations.push(locationId);
  state.currentLocation = {
    locationId, arrivedDay: state.day, arrivedHour: hour,
    travelMode: 'walk', returnHours: 1, returnPrepaid: true,
  };
}

function dockSequence9(pathwayId: string, hour = 12): GameState {
  const state = newGame('码头序列9测试者', 'clerk', []);
  state.pathwayId = pathwayId;
  state.sequence = 9;
  state.intel.push('dock_missing');
  state.stats.energy = 100;
  atLocation(state, 'docks', hour);
  return state;
}

function acquirePathPair(state: GameState) {
  const actions = DOCK_SEQUENCE9_ACTIONS.filter(action => action.pathwayId === state.pathwayId);
  for (const action of actions) acquireClue(state, action.clueId, action.requiredNpcId ? 'npc' : 'location', action.id);
  return actions;
}

function resolutionReady(pathwayId = 'seer') {
  const state = dockSequence9(pathwayId, 12);
  acquirePathPair(state);
  acquireClue(state, 'dock_seq9_conclusion', 'location', `dock_seq9_synthesis_${pathwayId}`);
  return state;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('码头序列9两阶段路径调查', () => {
  it('五途径各有两项差异化行动，未满足前置或未解锁地点不进入selector', () => {
    for (const pathway of PATHWAYS as readonly Pathway[]) {
      const state = dockSequence9(pathway.id, pathway.id === 'sleepless' ? 22 : 12);
      const definitions = DOCK_SEQUENCE9_ACTIONS.filter(action => action.pathwayId === pathway.id);
      expect(definitions).toHaveLength(2);
      expect(getDockSequence9Actions(state).map(action => action.id)).toEqual([firstActionId[pathway.id]]);

      const first = definitions.find(action => action.id === firstActionId[pathway.id])!;
      expect(performDockSequence9PathAction(state, first.id)).toMatchObject({ ok: true });
      expect(hasClue(state, first.clueId)).toBe(true);

      const second = definitions.find(action => action.id !== first.id)!;
      if (second.requiredNpcId) {
        expect(getDockSequence9Actions(state).map(action => action.id)).not.toContain(second.id);
        state.relations[second.requiredNpcId] = 0;
      }
      expect(isLocationUnlocked(state, second.locationId)).toBe(true);
      expect(getDockSequence9Actions(state).map(action => action.id)).toContain(second.id);
      state.currentLocation = null;
      atLocation(state, second.locationId, second.openFrom ?? 12);
      expect(performDockSequence9PathAction(state, second.id)).toMatchObject({ ok: true });
      expect(hasClue(state, second.clueId)).toBe(true);

      const after = structuredClone(state);
      expect(performDockSequence9PathAction(state, second.id)).toMatchObject({ ok: false });
      expect(state).toEqual(after);
    }
  });

  it('猎人和学徒首记录分别合法解锁运河，其他途径首记录不会', () => {
    for (const pathwayId of ['hunter', 'apprentice']) {
      const state = dockSequence9(pathwayId);
      expect(isLocationUnlocked(state, 'canal')).toBe(false);
      expect(performDockSequence9PathAction(state, firstActionId[pathwayId])).toMatchObject({ ok: true });
      expect(isLocationUnlocked(state, 'canal')).toBe(true);
    }
    const seer = dockSequence9('seer');
    performDockSequence9PathAction(seer, firstActionId.seer);
    expect(isLocationUnlocked(seer, 'canal')).toBe(false);
  });

  it('地点、时段、NPC与非法身份全部fail-closed且失败零状态', () => {
    const lockedCanal = dockSequence9('hunter');
    const lockedBefore = structuredClone(lockedCanal);
    expect(performDockSequence9PathAction(lockedCanal, 'dock_seq9_hunter_transfer')).toMatchObject({ ok: false });
    expect(lockedCanal).toEqual(lockedBefore);

    const daytimeLedger = dockSequence9('seer', 18);
    acquireClue(daytimeLedger, 'dock_seq9_seer_omen', 'location', 'dock_seq9_seer');
    const daytimeBefore = structuredClone(daytimeLedger);
    expect(dockSequence9PathActionIssue(daytimeLedger, 'dock_seq9_seer_manifest')).toMatch(/9:00–17:00/);
    expect(performDockSequence9PathAction(daytimeLedger, 'dock_seq9_seer_manifest')).toMatchObject({ ok: false });
    expect(daytimeLedger).toEqual(daytimeBefore);

    const unknownMike = dockSequence9('sleepless', 20);
    acquireClue(unknownMike, 'dock_seq9_sleepless_watch', 'location', 'dock_seq9_sleepless');
    unknownMike.currentLocation = null;
    atLocation(unknownMike, 'tavern', 20);
    const mikeBefore = structuredClone(unknownMike);
    expect(getDockSequence9Actions(unknownMike).map(action => action.id)).not.toContain('dock_seq9_sleepless_tavern');
    expect(performDockSequence9PathAction(unknownMike, 'dock_seq9_sleepless_tavern')).toMatchObject({ ok: false });
    expect(unknownMike).toEqual(mikeBefore);

    for (const state of [
      (() => { const candidate = dockSequence9('seer'); candidate.sequence = null; candidate.pathwayId = null; return candidate; })(),
      (() => { const candidate = dockSequence9('seer'); candidate.sequence = 8; return candidate; })(),
      dockSequence9('unknown'),
      (() => { const candidate = dockSequence9('seer'); candidate.intel = []; return candidate; })(),
    ]) {
      const before = structuredClone(state);
      expect(performDockSequence9PathAction(state, 'dock_seq9_seer')).toMatchObject({ ok: false });
      expect(state).toEqual(before);
    }
  });
});

describe('码头序列9综合检定与占卜旁证', () => {
  it('五个synthesis定义都把本途径两条记录作为硬门槛', () => {
    for (const pathway of PATHWAYS as readonly Pathway[]) {
      const state = dockSequence9(pathway.id);
      const actions = DOCK_SEQUENCE9_ACTIONS.filter(action => action.pathwayId === pathway.id);
      state.stats[abilityInput[pathway.id].stat] = 100;
      state.skills[abilityInput[pathway.id].skill] = 10;
      acquireClue(state, actions[0].clueId, 'location', actions[0].id);
      acquireClue(state, 'dock_missing_reports');
      expect(evaluateExplorationCheckInternal(state, `dock_seq9_synthesis_${pathway.id}`)).toMatchObject({ eligible: false, reason: 'missing_requirement' });
      expect(resolveDockSequence9CaseIssue(state)).toMatch(/两项/);
      acquireClue(state, actions[1].clueId, 'location', actions[1].id);
      expect(evaluateExplorationCheckInternal(state, `dock_seq9_synthesis_${pathway.id}`).eligible).toBe(true);
    }
  });

  it('五途径都能通过各自synthesis，结论只进入待处置且不发放非凡奖励', () => {
    for (const pathway of PATHWAYS as readonly Pathway[]) {
      const state = dockSequence9(pathway.id);
      acquirePathPair(state);
      const input = abilityInput[pathway.id];
      state.stats[input.stat] = 30;
      state.skills[input.skill] = 10;
      const before = {
        pence: state.pence, items: structuredClone(state.items), formulas: [...state.formulas],
        routes: structuredClone(state.organizationRoutes), sequence: state.sequence,
        sequence8Progress: structuredClone(state.sequence8Progress), gameOver: structuredClone(state.gameOver),
      };
      expect(resolveDockSequence9Case(state)).toMatchObject({ ok: true, outcome: 'passed' });
      expect(hasClue(state, 'dock_seq9_conclusion')).toBe(true);
      expect(dockCaseDispositionClue(state)).toBeNull();
      expect(state.pence).toBe(before.pence);
      expect(state.items).toEqual(before.items);
      expect(state.formulas).toEqual(before.formulas);
      expect(state.organizationRoutes).toEqual(before.routes);
      expect(state.sequence).toBe(before.sequence);
      expect(state.sequence8Progress).toEqual(before.sequence8Progress);
      expect(state.gameOver).toEqual(before.gameOver);
      expect(state.log.at(-1)?.text).toMatch(/处置/);
      expect(state.log.at(-2)?.text).not.toMatch(/组织|途径|幕后者是|怪物/);
    }
  });

  it('硬质薄片占卜成功只提供转运旁证；灵视不授予；旁证加成但不是硬门槛', () => {
    const inspected = newGame('灵视检视者', 'clerk', []);
    inspected.pathwayId = 'seer';
    inspected.sequence = 9;
    inspected.knowledge.push('spirit_vision');
    inspected.items.dock_scale_evidence = 1;
    expect(inspectItemWithSpiritVision(inspected, 'dock_scale_evidence')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(hasClue(inspected, 'dock_scale_transfer_omen')).toBe(false);

    const diviner = dockSequence9('seer');
    diviner.items.dock_scale_evidence = 1;
    diviner.divinationTraining = { cards: true, dream: true, media: ['symbol_cards'], teachers: ['formal_seer_training'] };
    diviner.divinationCredentials = [
      { kind: 'training', source: 'formal_seer_training', method: 'cards', day: 1, hour: 7 },
      { kind: 'training', source: 'formal_seer_training', method: 'dream', day: 1, hour: 7 },
    ];
    diviner.items.symbol_cards = 1;
    diviner.stats.spi = 50;
    expect(divinationIssue(diviner, 'item', 'dock_scale_evidence', 'cards', 'self')).toBeNull();
    expect(performDivination(diviner, 'item', 'dock_scale_evidence', 'cards', 'self')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(hasClue(diviner, 'dock_scale_transfer_omen')).toBe(true);
    expect(diviner.divinationInsights.at(-1)?.text).toMatch(/旧仓区.*转运|退路/);
    expect(diviner.divinationInsights.at(-1)?.text).not.toMatch(/怪物|组织|途径|来源是/);

    const baseline = dockSequence9('seer');
    acquirePathPair(baseline);
    baseline.stats.spi = 27;
    baseline.skills.occult = 0;
    expect(evaluateExplorationCheckInternal(baseline, 'dock_seq9_synthesis_seer')).toMatchObject({ eligible: true, outcome: 'blocked' });
    acquireClue(baseline, 'dock_scale_transfer_omen', 'event', 'divination:self');
    expect(evaluateExplorationCheckInternal(baseline, 'dock_seq9_synthesis_seer')).toMatchObject({ eligible: true, outcome: 'passed' });

    const noOmen = dockSequence9('seer');
    acquirePathPair(noOmen);
    noOmen.stats.spi = 30;
    noOmen.skills.occult = 10;
    expect(resolveDockSequence9Case(noOmen)).toMatchObject({ ok: true, outcome: 'passed' });
  });

  it('blocked有固定代价与attempt，同指纹防刷，相关输入变化后可重试', () => {
    const state = dockSequence9('hunter');
    acquirePathPair(state);
    state.stats.phy = 1;
    state.skills.investigate = 0;
    state.hour = 23;
    const before = { hour: state.hour, energy: state.stats.energy, attempts: state.checkAttempts.length };
    expect(resolveDockSequence9Case(state)).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(state.hour).toBe((before.hour + 1) % 24);
    expect(state.stats.energy).toBeLessThan(before.energy);
    expect(state.checkAttempts).toHaveLength(before.attempts + 1);
    expect(state.checkAttempts.at(-1)).toMatchObject({ startedDay: 1, startedHour: 23, receipt: { hoursElapsed: 1 } });
    expect(state.day).toBe(2);
    expect(hasClue(state, 'dock_seq9_conclusion')).toBe(false);

    const blocked = structuredClone(state);
    expect(resolveDockSequence9Case(state)).toMatchObject({ ok: false });
    expect(state).toEqual(blocked);

    acquireClue(state, 'dock_missing_reports');
    expect(resolveDockSequence9Case(state)).toMatchObject({ ok: true, outcome: 'blocked' });
    state.skills.investigate = 10;
    expect(resolveDockSequence9Case(state)).toMatchObject({ ok: true, outcome: 'passed' });
    expect(hasClue(state, 'dock_seq9_conclusion')).toBe(true);
    expect(dockCaseDispositionClue(state)).toBeNull();
  });
});

describe('三种互斥处置与兼容', () => {
  it('三处置分别受地点、时段和联系约束，成功后关闭其余且副作用守边界', () => {
    for (const disposition of DOCK_CASE_DISPOSITIONS) {
      const state = resolutionReady('seer');
      if (disposition.id === 'workers_warning') state.relations.mike = 0;
      if (disposition.id === 'official_handoff') state.organizationRoutes.nightwatch.status = 'contacted';
      state.currentLocation = null;
      atLocation(state, disposition.locationId, disposition.openFrom);
      expect(getDockCaseDispositions(state).map(candidate => candidate.id)).toEqual([disposition.id]);
      expect(dockCaseDispositionIssue(state, disposition.id)).toBeNull();
      const before = {
        sequence: state.sequence, sequence8Progress: structuredClone(state.sequence8Progress), gameOver: structuredClone(state.gameOver),
        formulas: [...state.formulas], items: structuredClone(state.items), routes: structuredClone(state.organizationRoutes),
        pence: state.pence, mike: state.relations.mike,
      };
      expect(performDockCaseDisposition(state, disposition.id)).toMatchObject({ ok: true });
      expect(dockCaseDispositionClue(state)).toBe(disposition.clueId);
      expect(getDockCaseDispositions(state)).toEqual([]);
      expect(state.sequence).toBe(before.sequence);
      expect(state.sequence8Progress).toEqual(before.sequence8Progress);
      expect(state.gameOver).toEqual(before.gameOver);
      expect(state.formulas).toEqual(before.formulas);
      expect(state.items).toEqual(before.items);
      expect(state.pence).toBe(before.pence);
      expect(state.organizationRoutes).toEqual(before.routes);
      expect(state.relations.mike).toBe(disposition.id === 'workers_warning' ? (before.mike ?? 0) + 3 : before.mike);

      const after = structuredClone(state);
      const other = DOCK_CASE_DISPOSITIONS.find(candidate => candidate.id !== disposition.id)!;
      expect(performDockCaseDisposition(state, other.id)).toMatchObject({ ok: false });
      expect(state).toEqual(after);
    }
  });

  it('未结识Mike、未解锁黑荆棘与错误时段不会泄露selector且直接调用零状态', () => {
    const unknownMike = resolutionReady();
    unknownMike.currentLocation = null;
    atLocation(unknownMike, 'tavern', 18);
    expect(getDockCaseDispositions(unknownMike)).toEqual([]);
    const mikeBefore = structuredClone(unknownMike);
    expect(performDockCaseDisposition(unknownMike, 'workers_warning')).toMatchObject({ ok: false });
    expect(unknownMike).toEqual(mikeBefore);

    const hiddenOfficial = resolutionReady();
    hiddenOfficial.currentLocation = null;
    atLocation(hiddenOfficial, 'blackthorn_security', 10);
    hiddenOfficial.visitedLocations = hiddenOfficial.visitedLocations.filter(id => id !== 'blackthorn_security');
    expect(isLocationUnlocked(hiddenOfficial, 'blackthorn_security')).toBe(false);
    expect(getDockCaseDispositions(hiddenOfficial)).toEqual([]);
    const officialBefore = structuredClone(hiddenOfficial);
    expect(performDockCaseDisposition(hiddenOfficial, 'official_handoff')).toMatchObject({ ok: false });
    expect(hiddenOfficial).toEqual(officialBefore);

    const referralOnly = resolutionReady();
    acquireClue(referralOnly, 'blackthorn_referral');
    referralOnly.organizationRoutes.nightwatch.history.push({
      day: referralOnly.day, step: 'hound_security_referral', outcome: 'passed', evidenceId: 'blackthorn_referral',
    });
    expect(isLocationUnlocked(referralOnly, 'blackthorn_security')).toBe(true);
    expect(hasFormalNightwatchRoute(referralOnly)).toBe(false);
    referralOnly.currentLocation = null;
    atLocation(referralOnly, 'blackthorn_security', 10);
    expect(getDockCaseDispositions(referralOnly)).toEqual([]);
    expect(dockCaseDispositionIssue(referralOnly, 'official_handoff')).toBe('当前没有可执行的案件处置。');
    const referralBefore = structuredClone(referralOnly);
    expect(performDockCaseDisposition(referralOnly, 'official_handoff')).toMatchObject({ ok: false });
    expect(referralOnly).toEqual(referralBefore);

    referralOnly.organizationRoutes.nightwatch.status = 'contacted';
    expect(hasFormalNightwatchRoute(referralOnly)).toBe(true);
    expect(getDockCaseDispositions(referralOnly).map(disposition => disposition.id)).toEqual(['official_handoff']);
    expect(dockCaseDispositionIssue(referralOnly, 'official_handoff')).toBeNull();

    const closed = resolutionReady();
    closed.hour = 20;
    const closedBefore = structuredClone(closed);
    expect(performDockCaseDisposition(closed, 'public_report')).toMatchObject({ ok: false });
    expect(closed).toEqual(closedBefore);
  });

  it('旧档已有结论直接进入待处置；新旧checkAttempts均可读档且幂等', () => {
    const state = resolutionReady('seer');
    expect(resolveDockSequence9CaseIssue(state)).toMatch(/等待.*处置|等待你的处置/);
    expect(getDockCaseDispositions(state).map(disposition => disposition.id)).toEqual(['public_report']);
    saveGame(state);
    const loaded = loadGame()!;
    expect(loaded.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(hasClue(loaded, 'dock_seq9_conclusion')).toBe(true);
    expect(dockCaseDispositionClue(loaded)).toBeNull();
    saveGame(loaded);
    expect(loadGame()).toEqual(loaded);

    const withAttempt = dockSequence9('seer');
    acquirePathPair(withAttempt);
    withAttempt.stats.spi = 30;
    withAttempt.skills.occult = 10;
    expect(resolveDockSequence9Case(withAttempt)).toMatchObject({ ok: true, outcome: 'passed' });
    expect(withAttempt.checkAttempts.at(-1)?.checkId).toBe('dock_seq9_synthesis_seer');
    saveGame(withAttempt);
    expect(loadGame()?.checkAttempts.at(-1)?.checkId).toBe('dock_seq9_synthesis_seer');
  });
});

describe('信息边界与长链烟测', () => {
  it('未知码头案不显示面板，未解锁运河与官方处置不以disabled按钮泄露', () => {
    expect(appSource).toContain("loc.id === 'docks' && dockCaseKnown && !beyonder");
    expect(appSource).toContain("E.getDockSequence9Actions(state).some(action => action.locationId === loc.id)");
    expect(appSource).toContain('E.getDockCaseDispositions(state)');
    expect(appSource).toContain('data-dock-chapter-report');
    const section = appSource.split('data-dock-sequence9-case')[1]?.split('data-dock-case-dispositions')[0] ?? '';
    expect(section).not.toMatch(/difficulty|score|bonus|成功率|加成|属性\s*\d/i);
  });

  it('传闻→真实旅行→两行动→综合→公开处置完整闭环', () => {
    const state = newGame('长链调查者', 'clerk', []);
    state.pathwayId = 'hunter';
    state.sequence = 9;
    state.intel.push('dock_missing');
    state.stats.phy = 30;
    state.skills.investigate = 10;
    state.stats.energy = 100;
    state.hour = 10;

    expect(travelToLocation(state, 'docks', 'walk')).toMatchObject({ ok: true });
    expect(state.currentLocation?.locationId).toBe('docks');
    expect(performDockSequence9PathAction(state, 'dock_seq9_hunter')).toMatchObject({ ok: true });
    expect(leaveCurrentLocation(state)).toMatchObject({ ok: true });
    expect(isLocationUnlocked(state, 'canal')).toBe(true);

    expect(travelToLocation(state, 'canal', 'walk')).toMatchObject({ ok: true });
    expect(performDockSequence9PathAction(state, 'dock_seq9_hunter_transfer')).toMatchObject({ ok: true });
    expect(leaveCurrentLocation(state)).toMatchObject({ ok: true });
    expect(travelToLocation(state, 'docks', 'walk')).toMatchObject({ ok: true });
    expect(resolveDockSequence9Case(state)).toMatchObject({ ok: true, outcome: 'passed' });
    expect(hasClue(state, 'dock_seq9_conclusion')).toBe(true);
    expect(dockCaseDispositionClue(state)).toBeNull();

    expect(leaveCurrentLocation(state)).toMatchObject({ ok: true });
    expect(doSleep(state)).toMatchObject({ ok: true });
    expect(doMeal(state)).toMatchObject({ ok: true });
    expect(travelToLocation(state, 'docks', 'walk')).toMatchObject({ ok: true });
    expect(performDockCaseDisposition(state, 'public_report')).toMatchObject({ ok: true });
    expect(dockCaseDispositionClue(state)).toBe('dock_disposition_public_report');
  });
});
