import { beforeEach, describe, expect, it, vi } from 'vitest';
import appSource from '../App.tsx?raw';
import { PATHWAYS, findItem } from './data';
import type { Sequence9ExplorationAbilityId } from './types';
import {
  CURRENT_SCHEMA_VERSION,
  divinationIssue,
  drinkOfficialDose,
  evaluateExplorationCheck,
  getSequence9AbilityDefinition,
  getSequence9LocationActions,
  hasInheritedSequence9Ability,
  hasSpiritVisionAbility,
  isLocationUnlocked,
  leaveCurrentLocation,
  loadGame,
  newGame,
  performAtLocationAction,
  performDivination,
  performSequence9LocationAction,
  saveGame,
  sequence9LocationActionIssue,
  sequence9PreparationStatus,
  travelToLocation,
} from './engine';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
}

const fresh = () => newGame('序列能力测试者', 'clerk', []);

function atMarket(pathwayId: string, hour = 8) {
  const state = fresh();
  state.pathwayId = pathwayId;
  state.sequence = 9;
  state.hour = hour;
  state.stats.energy = 100;
  expect(travelToLocation(state, 'market', 'walk')).toMatchObject({ ok: true });
  return state;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('通用灵视与占卜家自占', () => {
  it('五途径序列9及更高序列继承基础灵视，凡人与非法途径序列均拒绝', () => {
    for (const pathway of PATHWAYS) {
      for (const sequence of [9, 8, 1]) {
        const state = fresh();
        state.pathwayId = pathway.id;
        state.sequence = sequence;
        state.knowledge = [];
        expect(hasInheritedSequence9Ability(state), `${pathway.id} sequence ${sequence}`).toBe(true);
        expect(hasSpiritVisionAbility(state), `${pathway.id} sequence ${sequence}`).toBe(true);
      }
    }

    const ordinary = fresh();
    ordinary.stats.spi = 100;
    ordinary.skills.occult = 10;
    ordinary.knowledge.push('spirit_vision', 'occult_theory');
    expect(hasSpiritVisionAbility(ordinary)).toBe(false);
    for (const invalid of [
      { pathwayId: 'seer', sequence: 0 },
      { pathwayId: 'seer', sequence: 10 },
      { pathwayId: 'forged_path', sequence: 9 },
    ]) {
      const state = fresh();
      state.pathwayId = invalid.pathwayId;
      state.sequence = invalid.sequence;
      state.knowledge.push('spirit_vision');
      expect(hasSpiritVisionAbility(state), JSON.stringify(invalid)).toBe(false);
    }
  });

  it('小数、字符串与空序列不能在运行时冒充占卜家正式训练', () => {
    for (const sequence of [8.5, '9', null] as const) {
      const state = fresh();
      state.pathwayId = 'seer';
      (state as unknown as { sequence: unknown }).sequence = sequence;
      state.divinationTraining = { cards: true, dream: true, media: ['symbol_cards'], teachers: ['formal_seer_training'] };
      state.divinationCredentials = [
        { kind: 'training', source: 'formal_seer_training', method: 'cards', day: 1, hour: 7 },
        { kind: 'training', source: 'formal_seer_training', method: 'dream', day: 1, hour: 7 },
      ];
      state.items.symbol_cards = 1;
      expect(hasInheritedSequence9Ability(state), String(sequence)).toBe(false);
      expect(divinationIssue(state, 'item', 'symbol_cards', 'dream', 'self'), String(sequence)).toMatch(/正式训练|占卜家/);
    }
  });

  it('伪造v20正式训练存档不能恢复梦境自占，清洗后重复读档幂等', () => {
    const forged = fresh();
    forged.schemaVersion = 20;
    forged.pathwayId = 'seer';
    forged.sequence = 8.5;
    forged.knowledge.push('spirit_vision');
    forged.divinationTraining = { cards: true, dream: true, media: ['symbol_cards'], teachers: ['formal_seer_training'] };
    forged.divinationCredentials = [
      { kind: 'training', source: 'formal_seer_training', method: 'cards', day: 1, hour: 7 },
      { kind: 'training', source: 'formal_seer_training', method: 'dream', day: 1, hour: 7 },
    ];
    forged.items.symbol_cards = 1;
    forged.divinationAttempts = [{
      targetKind: 'item', targetId: 'symbol_cards', method: 'dream', provider: 'self',
      outcome: 'hint', day: 1, hour: 7, score: 99,
    }];
    forged.divinationInsights = [{
      id: 'forged:dream', targetKind: 'item', targetId: 'symbol_cards', method: 'dream', provider: 'self',
      outcome: 'hint', text: findItem('symbol_cards')!.divination!.successText.dream, day: 1, hour: 7,
    }];
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(forged));

    const first = loadGame()!;
    expect(hasInheritedSequence9Ability(first)).toBe(false);
    expect(first.knowledge).not.toContain('spirit_vision');
    expect(first.divinationCredentials).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'training', source: 'formal_seer_training', method: 'dream' }),
    ]));
    expect(first.divinationAttempts).toEqual([]);
    expect(first.divinationInsights).toEqual([]);
    expect(divinationIssue(first, 'item', 'symbol_cards', 'dream', 'self')).toMatch(/正式训练|占卜家/);
    saveGame(first);
    expect(loadGame()).toEqual(first);
  });

  it('合法值夜者官方服药会授予通用灵视，但不会误授占卜家梦境能力', () => {
    const state = fresh();
    state.day = 2;
    state.hour = 9;
    state.stats.energy = 100;
    state.items.symbol_cards = 1;
    state.organizationRoutes.nightwatch = {
      organizationId: 'nightwatch', status: 'committed', routeStep: 'committed',
      selectedPathway: 'sleepless', history: [{ day: 1, step: 'night_observation', outcome: 'passed' }],
    };
    Object.assign(state.pathwayLeads.sleepless, {
      currentSource: 'official', organizationId: 'nightwatch', routeStep: 'dose_ready',
      commitment: true, preparationMode: 'official_dose',
    });

    expect(drinkOfficialDose(state, 'sleepless')).toMatchObject({ ok: true });
    expect(hasSpiritVisionAbility(state)).toBe(true);
    expect(state.knowledge).toContain('spirit_vision');
    expect(state.divinationTraining).toMatchObject({ cards: false, dream: false });
    expect(state.divinationCredentials).toEqual([]);
    expect(state.relations.nelson).toBeUndefined();
    expect(divinationIssue(state, 'item', 'symbol_cards', 'dream', 'self')).toMatch(/占卜家/);
  });

  it('合法值夜者占卜家服药后无需NPC立即获得纸牌与梦境自占', () => {
    const state = fresh();
    state.day = 2;
    state.hour = 9;
    state.stats.spi = 80;
    state.stats.energy = 100;
    state.organizationRoutes.nightwatch = {
      organizationId: 'nightwatch', status: 'committed', routeStep: 'committed',
      selectedPathway: 'seer', history: [{ day: 1, step: 'night_observation', outcome: 'passed' }],
    };
    Object.assign(state.pathwayLeads.seer, {
      currentSource: 'official', organizationId: 'nightwatch', routeStep: 'dose_ready',
      commitment: true, preparationMode: 'official_dose',
    });

    expect(state.relations.nelson).toBeUndefined();
    expect(state.relations.evelyn).toBeUndefined();
    expect(drinkOfficialDose(state, 'seer')).toMatchObject({ ok: true });
    expect(hasSpiritVisionAbility(state)).toBe(true);
    expect(state.divinationTraining).toMatchObject({ cards: true, dream: true });
    expect(state.divinationTraining.media).toContain('symbol_cards');
    expect(state.items.symbol_cards).toBeGreaterThanOrEqual(1);
    expect(state.divinationCredentials).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'training', source: 'formal_seer_training', method: 'cards' }),
      expect.objectContaining({ kind: 'training', source: 'formal_seer_training', method: 'dream' }),
    ]));
    expect(divinationIssue(state, 'item', 'symbol_cards', 'cards', 'self')).toBeNull();
    expect(divinationIssue(state, 'item', 'symbol_cards', 'dream', 'self')).toBeNull();
    expect(performDivination(state, 'item', 'symbol_cards', 'dream', 'self')).toMatchObject({ ok: true, outcome: 'passed' });
  });

  it('v19占卜家迁移后无需NPC即可纸牌与梦境自占，其他途径不会自动获得梦境资格', () => {
    const legacy = fresh();
    legacy.schemaVersion = 19;
    legacy.pathwayId = 'seer';
    legacy.sequence = 9;
    legacy.stats.spi = 80;
    legacy.divinationTraining = { cards: false, dream: false, media: [], teachers: [] };
    legacy.divinationCredentials = [];
    legacy.items.symbol_cards = 0;
    legacy.sequence9Preparations = [{
      abilityId: 'hunter_tracking', pathwayId: 'hunter', locationId: 'market',
      preparedDay: 1, preparedHour: 7, cooldownDay: 1, consumed: false,
    }];
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(legacy));

    const seer = loadGame()!;
    expect(seer).toMatchObject({ schemaVersion: 32, sequence9Preparations: [] });
    expect(seer.divinationTraining).toMatchObject({ cards: true, dream: true });
    expect(seer.divinationTraining.media).toContain('symbol_cards');
    expect(seer.divinationTraining.teachers).toContain('formal_seer_training');
    expect(seer.items.symbol_cards).toBeGreaterThanOrEqual(1);
    expect(seer.relations.nelson).toBeUndefined();
    expect(divinationIssue(seer, 'item', 'symbol_cards', 'cards', 'self')).toBeNull();
    expect(performDivination(seer, 'item', 'symbol_cards', 'dream', 'self')).toMatchObject({ ok: true, outcome: 'passed' });

    const hunter = fresh();
    hunter.pathwayId = 'hunter';
    hunter.sequence = 9;
    hunter.items.symbol_cards = 1;
    expect(hasSpiritVisionAbility(hunter)).toBe(true);
    expect(divinationIssue(hunter, 'item', 'symbol_cards', 'dream', 'self')).toMatch(/占卜家/);
  });
});

describe('四途径地点准备动作', () => {
  const cases: [string, Sequence9ExplorationAbilityId][] = [
    ['spectator', 'spectator_observation'],
    ['hunter', 'hunter_tracking'],
    ['sleepless', 'sleepless_night_watch'],
    ['apprentice', 'apprentice_passage_probe'],
  ];

  it.each(cases)('%s只能使用自己的能力，准备不会直接发放线索、物品或地点入口', (pathwayId, abilityId) => {
    const state = atMarket(pathwayId, pathwayId === 'sleepless' ? 20 : 8);
    const protectedBefore = {
      clues: structuredClone(state.clues), items: structuredClone(state.items), formulas: [...state.formulas],
      visited: [...state.visitedLocations], tower: isLocationUnlocked(state, 'old_tower'),
      dockCheck: evaluateExplorationCheck(state, 'dock_manifest_trace').reason,
    };
    const wrongAbility: Sequence9ExplorationAbilityId = abilityId === 'hunter_tracking' ? 'spectator_observation' : 'hunter_tracking';
    const beforeWrong = structuredClone(state);
    expect(performSequence9LocationAction(state, wrongAbility)).toMatchObject({ ok: false });
    expect(state).toEqual(beforeWrong);

    expect(getSequence9AbilityDefinition(state)?.id).toBe(abilityId);
    expect(getSequence9LocationActions(state).map(action => action.id)).toEqual([abilityId]);
    expect(performSequence9LocationAction(state, abilityId)).toMatchObject({ ok: true });
    expect(state.sequence9Preparations.at(-1)).toMatchObject({ abilityId, pathwayId, locationId: 'market', consumed: false });
    expect(sequence9PreparationStatus(state)).toMatch(/做好准备/);
    expect({
      clues: state.clues, items: state.items, formulas: state.formulas,
      visited: state.visitedLocations, tower: isLocationUnlocked(state, 'old_tower'),
      dockCheck: evaluateExplorationCheck(state, 'dock_manifest_trace').reason,
    }).toEqual(protectedBefore);
  });

  it('不眠者只能夜间守望，精力与地点前置失败都保持原子性', () => {
    const home = fresh();
    home.pathwayId = 'sleepless';
    home.sequence = 9;
    const homeBefore = structuredClone(home);
    expect(performSequence9LocationAction(home, 'sleepless_night_watch')).toMatchObject({ ok: false });
    expect(home).toEqual(homeBefore);

    const daytime = atMarket('sleepless', 8);
    const dayBefore = structuredClone(daytime);
    expect(sequence9LocationActionIssue(daytime, 'sleepless_night_watch')).toMatch(/入夜/);
    expect(performSequence9LocationAction(daytime, 'sleepless_night_watch')).toMatchObject({ ok: false });
    expect(daytime).toEqual(dayBefore);

    daytime.hour = 22;
    daytime.stats.energy = 1;
    const tiredBefore = structuredClone(daytime);
    expect(performSequence9LocationAction(daytime, 'sleepless_night_watch')).toMatchObject({ ok: false });
    expect(daytime).toEqual(tiredBefore);
  });

  it('准备只降低下一次本地探索消耗，成功后消耗；离开后同日同地不能重复准备', () => {
    const prepared = atMarket('hunter');
    expect(performSequence9LocationAction(prepared, 'hunter_tracking').ok).toBe(true);
    const beforePreparedExplore = prepared.stats.energy;
    expect(performAtLocationAction(prepared, 'explore', () => 0.99).ok).toBe(true);
    const preparedExploreCost = beforePreparedExplore - prepared.stats.energy;
    expect(prepared.sequence9Preparations.at(-1)?.consumed).toBe(true);

    const control = atMarket('hunter');
    const beforeControlExplore = control.stats.energy;
    expect(performAtLocationAction(control, 'explore', () => 0.99).ok).toBe(true);
    expect(beforeControlExplore - control.stats.energy).toBeGreaterThan(preparedExploreCost);

    prepared.pendingEvent = null;
    prepared.forcedEventQueue = [];
    expect(leaveCurrentLocation(prepared).ok).toBe(true);
    expect(travelToLocation(prepared, 'market', 'walk').ok).toBe(true);
    expect(sequence9LocationActionIssue(prepared, 'hunter_tracking')).toMatch(/已经完成过一次准备/);
  });

  it('匹配委托失败不消耗准备，成功结算才消耗且不会替代正式委托来源', () => {
    const state = atMarket('spectator');
    expect(performSequence9LocationAction(state, 'spectator_observation').ok).toBe(true);
    state.activeCommission = {
      id: 'formal_sequence9_case', kind: 'investigate', stat: 'mnd', difficulty: 999,
      title: '正式调查', text: '由房东委托核对公开记录', client: 'martha', locationId: 'market',
      reward: 12, daysLeft: 2, occult: false,
    };
    const pence = state.pence;
    expect(performAtLocationAction(state, 'explore', () => 0.99).ok).toBe(true);
    expect(state.sequence9Preparations.at(-1)?.consumed).toBe(false);
    expect(state.pence).toBe(pence);
    expect(state.activeCommission).not.toBeNull();

    state.activeCommission!.difficulty = 1;
    expect(performAtLocationAction(state, 'explore', () => 0.99).ok).toBe(true);
    expect(state.sequence9Preparations.at(-1)?.consumed).toBe(true);
    expect(state.activeCommission).toBeNull();
    expect(state.pence).toBeGreaterThan(pence);
  });
});

describe('v20迁移与UI规则入口', () => {
  it('迁移清理伪造准备，为合法非凡者补灵视展示且不改序列8进度，并保持幂等', () => {
    const state = fresh();
    state.schemaVersion = 19;
    state.pathwayId = 'apprentice';
    state.sequence = 8;
    state.knowledge = state.knowledge.filter(id => id !== 'spirit_vision');
    const sequence8Progress = structuredClone(state.sequence8Progress);
    state.sequence9Preparations = [{
      abilityId: 'spectator_observation', pathwayId: 'spectator', locationId: 'old_tower',
      preparedDay: 99, preparedHour: 99, cooldownDay: 99, consumed: false,
    }];
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(state));
    const first = loadGame()!;
    expect(first.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(first.knowledge).toContain('spirit_vision');
    expect(first.sequence9Preparations).toEqual([]);
    expect(first.sequence8Progress).toEqual(sequence8Progress);
    saveGame(first);
    expect(loadGame()).toEqual(first);

    const ordinary = fresh();
    ordinary.schemaVersion = 19;
    ordinary.knowledge.push('spirit_vision');
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(ordinary));
    expect(loadGame()?.knowledge).not.toContain('spirit_vision');

    const legacyHunter = fresh();
    legacyHunter.schemaVersion = 19;
    legacyHunter.pathwayId = 'hunter';
    legacyHunter.sequence = 9;
    legacyHunter.items.anomaly_evidence = 1;
    legacyHunter.itemKnowledge.anomaly_evidence = {
      itemId: 'anomaly_evidence', spiritVisionInspected: true, identifiedAsOccult: true,
      knownInfo: [findItem('anomaly_evidence')!.spiritVision!.result], inspectedDay: 1, inspectedHour: 9,
    };
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(legacyHunter));
    const cleanedHunter = loadGame()!;
    expect(hasSpiritVisionAbility(cleanedHunter)).toBe(true);
    expect(cleanedHunter.itemKnowledge.anomaly_evidence).toBeUndefined();
  });

  it('人物与当前位置能力区只调用规则层，不复制能力表或内部数值', () => {
    expect(appSource).toContain('data-sequence9-ability');
    expect(appSource).toContain('data-sequence9-location-actions');
    expect(appSource).toContain('E.getSequence9AbilityDefinition(state)');
    expect(appSource).toContain('E.getSequence9LocationActions(state)');
    expect(appSource).toContain('E.sequence9LocationActionIssue(state, action.id)');
    expect(appSource).toContain('E.performSequence9LocationAction(s, action.id)');
    expect(appSource).not.toContain('SEQUENCE9_EXPLORATION_ABILITIES');
    expect(appSource).not.toMatch(/commissionBonus|exploreEnergyRelief/);
  });
});
