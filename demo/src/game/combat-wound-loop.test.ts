import { beforeEach, describe, expect, it, vi } from 'vitest';
import appSource from '../App.tsx?raw';
import type { GameState } from './types';
import {
  acquireClue,
  applyCombatImpact,
  attemptEncounterEscape,
  dockCombatApproachIssue,
  dockCombatPreparationIssue,
  engageDockEncounter,
  getCombatProfile,
  getDockCombatPreparations,
  getPendingEncounterView,
  getWoundStatus,
  loadGame,
  newGame,
  performDeepInvestigation,
  performDockCombatExchange,
  prepareDockEncounter,
  resolveEncounterCombat,
  saveGame,
} from './engine';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
}

function readyAtDocks() {
  const state = newGame('伤势闭环测试者', 'clerk', []);
  state.hour = 10;
  state.stats.mnd = 50;
  state.stats.energy = 100;
  state.currentLocation = {
    locationId: 'docks', arrivedDay: 1, arrivedHour: 10,
    travelMode: 'walk', returnHours: 1, returnPrepaid: true,
  };
  acquireClue(state, 'dock_missing_reports');
  acquireClue(state, 'dock_manifest_discrepancy');
  acquireClue(state, 'dock_crate_trace');
  return state;
}

function triggerDockEncounter(state = readyAtDocks()) {
  expect(performDeepInvestigation(state, 'deep_dock_missing_reports')).toMatchObject({ ok: true, outcome: 'passed' });
  expect(performDeepInvestigation(state, 'deep_dock_manifest_discrepancy')).toMatchObject({ ok: true, outcome: 'passed' });
  expect(performDeepInvestigation(state, 'deep_dock_crate_trace')).toMatchObject({ ok: true, outcome: 'passed' });
  expect(state.pendingEncounter).toMatchObject({
    encounterId: 'encounter_dock_manifest_cleaner', phase: 'escape_choice', preparations: [],
  });
  return state;
}

function fitVitals(state: GameState) {
  const profile = getCombatProfile(state);
  state.combatVitals = { hp: profile.maxHp, spirit: profile.maxSpirit };
}

function giveLoadedRevolver(state: GameState) {
  state.items.revolver = 1;
  state.items.revolver_ammo = 12;
  state.combatLoadout.weaponId = 'revolver';
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('v26伤势派生与固定伤害', () => {
  it('生命比例派生无伤、轻伤、重伤、濒危，且仅重伤与濒危施加固定惩罚', () => {
    const state = newGame('伤势', 'clerk', []);
    const max = getCombatProfile(state).maxHp;
    state.combatVitals.hp = max;
    const healthy = getCombatProfile(state);
    expect(getWoundStatus(state).level).toBe('unhurt');
    state.combatVitals.hp = Math.floor(max * 0.75);
    expect(getWoundStatus(state).level).toBe('light');
    expect(getCombatProfile(state).injuryPenalty).toBe(0);
    state.combatVitals.hp = Math.floor(max * 0.5);
    expect(getWoundStatus(state).level).toBe('severe');
    expect(getCombatProfile(state)).toMatchObject({
      injuryPenalty: 4,
      physicalAttack: healthy.physicalAttack - 4,
      physicalDefense: healthy.physicalDefense - 4,
      dodge: healthy.dodge - 4,
    });
    state.combatVitals.hp = Math.floor(max * 0.25);
    expect(getWoundStatus(state).level).toBe('critical');
    expect(getCombatProfile(state).injuryPenalty).toBe(8);
  });

  it('物防、精防和闪避档位共同改变确定性伤害，同一状态结果一致', () => {
    const base = newGame('结算', 'clerk', []);
    base.stats = { ...base.stats, phy: 20, spi: 10, mnd: 20 };
    base.skills = { investigate: 0, combat: 0, speech: 0, occult: 0, sneak: 0 };
    base.combatVitals = { hp: 80, spirit: 50 };
    const repeatedA = structuredClone(base);
    const repeatedB = structuredClone(base);
    expect(applyCombatImpact(repeatedA, 32, 18, 24)).toEqual(applyCombatImpact(repeatedB, 32, 18, 24));
    expect(repeatedA.combatVitals).toEqual(repeatedB.combatVitals);

    const defended = structuredClone(base);
    defended.pathwayId = 'hunter'; defended.sequence = 9; defended.skills.combat = 3;
    const evasive = structuredClone(base);
    evasive.skills.sneak = 8;
    const baseImpact = applyCombatImpact(base, 32, 18, 24);
    const defenseImpact = applyCombatImpact(defended, 32, 18, 24);
    const dodgeImpact = applyCombatImpact(evasive, 32, 18, 24);
    expect(defenseImpact.hpDamage).toBeLessThan(baseImpact.hpDamage);
    expect(dodgeImpact.dodgeReduction).toBeGreaterThan(baseImpact.dodgeReduction);
    expect(dodgeImpact.hpDamage).toBeLessThan(baseImpact.hpDamage);

    const spiritualDefense = newGame('精防', 'clerk', []);
    spiritualDefense.pathwayId = 'spectator'; spiritualDefense.sequence = 9;
    spiritualDefense.stats.mnd = 40; spiritualDefense.stats.spi = 20; spiritualDefense.skills.occult = 4;
    fitVitals(spiritualDefense);
    const lowSpiritDefense = structuredClone(spiritualDefense);
    lowSpiritDefense.pathwayId = null; lowSpiritDefense.sequence = null;
    lowSpiritDefense.stats.mnd = 0; lowSpiritDefense.stats.spi = 0; lowSpiritDefense.skills.occult = 0;
    fitVitals(lowSpiritDefense);
    expect(applyCombatImpact(spiritualDefense, 0, 24).spiritDamage)
      .toBeLessThan(applyCombatImpact(lowSpiritDefense, 0, 24).spiritDamage);
  });
});

describe('码头战前准备与两条战斗路线', () => {
  it('三种准备逐项校验真实线索、工具与能力，成功只消耗固定资源并留下回执', () => {
    const state = triggerDockEncounter();
    state.clues = state.clues.filter(clue => clue.id !== 'dock_crate_trace');
    const beforeBlocked = structuredClone(state);
    expect(dockCombatPreparationIssue(state, 'mapped_retreat')).toContain('货箱');
    expect(prepareDockEncounter(state, 'mapped_retreat')).toMatchObject({ ok: false });
    expect(state).toEqual(beforeBlocked);

    acquireClue(state, 'dock_crate_trace');
    const assets = {
      pence: state.pence, items: structuredClone(state.items), clues: state.clues.map(clue => clue.id),
      formulas: [...state.formulas], pathwayId: state.pathwayId, sequence: state.sequence,
    };
    const energy = state.stats.energy;
    const hour = state.hour;
    expect(prepareDockEncounter(state, 'mapped_retreat')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(state.pendingEncounter?.preparations).toEqual(['mapped_retreat']);
    expect(state.stats.energy).toBe(energy - 4);
    expect(state.hour).toBe((hour + 1) % 24);
    expect(state.checkAttempts.at(-1)?.receipt.effects.some(effect => effect.id === 'combat-prep:mapped_retreat')).toBe(true);
    expect({
      pence: state.pence, items: state.items, clues: state.clues.map(clue => clue.id),
      formulas: state.formulas, pathwayId: state.pathwayId, sequence: state.sequence,
    }).toEqual(assets);
    const after = structuredClone(state);
    expect(prepareDockEncounter(state, 'mapped_retreat')).toMatchObject({ ok: false });
    expect(state).toEqual(after);

    expect(dockCombatPreparationIssue(state, 'prepared_ambush')).toContain('武器');
    giveLoadedRevolver(state);
    expect(prepareDockEncounter(state, 'prepared_ambush').ok).toBe(true);
    acquireClue(state, 'dock_scale_transfer_omen', 'event', 'divination:dock_scale_evidence');
    state.items.ritual_chalk = 1;
    expect(dockCombatPreparationIssue(state, 'spiritual_guard')).toContain('灵视');
    state.pathwayId = 'seer'; state.sequence = 9;
    expect(prepareDockEncounter(state, 'spiritual_guard').ok).toBe(true);
    expect(getDockCombatPreparations(state).filter(item => item.completed)).toHaveLength(3);
  });

  it('准备必须保留最低行动能力，精力恰好等于成本时完整零状态拒绝', () => {
    const state = triggerDockEncounter();
    state.stats.energy = 4;
    const before = structuredClone(state);
    expect(dockCombatPreparationIssue(state, 'mapped_retreat')).toContain('最低行动能力');
    expect(prepareDockEncounter(state, 'mapped_retreat')).toMatchObject({ ok: false });
    expect(state).toEqual(before);
  });

  it('已核对退路固定减轻逃脱失败的首轮伤害，灵性防护固定减轻精神值损失', () => {
    const retreat = triggerDockEncounter();
    expect(prepareDockEncounter(retreat, 'mapped_retreat').ok).toBe(true);
    retreat.stats.phy = 0; retreat.skills.sneak = 0; fitVitals(retreat);
    const noRetreat = structuredClone(retreat);
    noRetreat.pendingEncounter!.preparations = [];
    expect(attemptEncounterEscape(retreat)).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(attemptEncounterEscape(noRetreat)).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(retreat.combatVitals.hp).toBeGreaterThan(noRetreat.combatVitals.hp);

    const guarded = triggerDockEncounter();
    guarded.pathwayId = 'seer'; guarded.sequence = 9;
    guarded.stats.spi = 0; guarded.stats.mnd = 0; guarded.skills.occult = 0;
    acquireClue(guarded, 'dock_scale_transfer_omen', 'event', 'divination:dock_scale_evidence');
    guarded.items.ritual_chalk = 1; fitVitals(guarded);
    expect(prepareDockEncounter(guarded, 'spiritual_guard').ok).toBe(true);
    guarded.pendingEncounter!.phase = 'combat';
    const unguarded = structuredClone(guarded);
    unguarded.pendingEncounter!.preparations = [];
    const guardedSpirit = guarded.combatVitals.spirit;
    expect(resolveEncounterCombat(guarded, 'spiritual').ok).toBe(true);
    expect(resolveEncounterCombat(unguarded, 'spiritual').ok).toBe(true);
    expect(guarded.combatVitals.spirit).toBeGreaterThan(unguarded.combatVitals.spirit);
    expect(guarded.combatVitals.spirit).toBeLessThan(guardedSpirit - 7);
  });

  it('物理攻击与精神攻击分别进入真实结算，精神路线仅限合法能力且消耗8点精神值', () => {
    const lowPhysical = triggerDockEncounter();
    lowPhysical.stats.phy = 60; lowPhysical.skills.combat = 0; fitVitals(lowPhysical);
    const highPhysical = structuredClone(lowPhysical);
    giveLoadedRevolver(highPhysical);
    lowPhysical.pendingEncounter!.phase = 'combat'; highPhysical.pendingEncounter!.phase = 'combat';
    expect(resolveEncounterCombat(lowPhysical, 'physical')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(resolveEncounterCombat(highPhysical, 'physical')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(highPhysical.combatVitals.hp).toBeGreaterThan(lowPhysical.combatVitals.hp);

    for (const pathwayId of [null, 'hunter'] as const) {
      const base = triggerDockEncounter();
      if (pathwayId) { base.pathwayId = pathwayId; base.sequence = 9; }
      const before = structuredClone(base);
      expect(dockCombatApproachIssue(base, 'spiritual', true)).toBeTruthy();
      expect(engageDockEncounter(base, 'spiritual')).toMatchObject({ ok: false });
      expect(base).toEqual(before);
    }

    const lowSpiritual = triggerDockEncounter();
    lowSpiritual.pathwayId = 'seer'; lowSpiritual.sequence = 9;
    lowSpiritual.stats.spi = 0; lowSpiritual.stats.mnd = 0; lowSpiritual.skills.occult = 0; fitVitals(lowSpiritual);
    const highSpiritual = structuredClone(lowSpiritual);
    highSpiritual.stats.spi = 50; highSpiritual.stats.mnd = 50; highSpiritual.skills.occult = 5; fitVitals(highSpiritual);
    lowSpiritual.pendingEncounter!.phase = 'combat'; highSpiritual.pendingEncounter!.phase = 'combat';
    const lowBefore = lowSpiritual.combatVitals.spirit;
    const highBefore = highSpiritual.combatVitals.spirit;
    expect(resolveEncounterCombat(lowSpiritual, 'spiritual')).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(resolveEncounterCombat(highSpiritual, 'spiritual')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(highSpiritual.checkAttempts.at(-1)?.receipt.effects)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: 'spirit', actualDelta: -8 })]));
    expect(lowBefore - lowSpiritual.combatVitals.spirit).toBeGreaterThanOrEqual(8);
    expect(highBefore - highSpiritual.combatVitals.spirit).toBeGreaterThanOrEqual(8);
    expect(highSpiritual.combatVitals.hp).toBeGreaterThan(lowSpiritual.combatVitals.hp);
  });

  it('准备好的破绽只在主动应战且暴击达到阈值时确定性触发，濒危者不能主动应战', () => {
    const prepared = triggerDockEncounter();
    giveLoadedRevolver(prepared); prepared.skills.combat = 3; prepared.stats.phy = 0; prepared.stats.mnd = 50;
    fitVitals(prepared);
    expect(prepareDockEncounter(prepared, 'prepared_ambush').ok).toBe(true);
    const noAmbush = structuredClone(prepared);
    noAmbush.pendingEncounter!.preparations = [];
    expect(getCombatProfile(prepared).critical).toBeGreaterThanOrEqual(18);
    expect(engageDockEncounter(prepared, 'physical')).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(engageDockEncounter(noAmbush, 'physical')).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(prepared.combatVitals.hp).toBeGreaterThan(noAmbush.combatVitals.hp);
    expect(prepared.log.some(entry => entry.text.includes('固定完成了一次先手反击'))).toBe(true);

    const critical = triggerDockEncounter();
    critical.combatVitals.hp = Math.floor(getCombatProfile(critical).maxHp * 0.25);
    const before = structuredClone(critical);
    expect(engageDockEncounter(critical, 'physical')).toMatchObject({ ok: false, msg: expect.stringContaining('濒危') });
    expect(critical).toEqual(before);
  });

  it('逃脱失败后的公开防御战入口不能伪造主动应战或触发破绽暴击', () => {
    const state = triggerDockEncounter();
    giveLoadedRevolver(state); state.skills.combat = 3; state.stats.phy = 0; state.stats.mnd = 50;
    fitVitals(state);
    expect(prepareDockEncounter(state, 'prepared_ambush').ok).toBe(true);
    expect(getCombatProfile(state).critical).toBeGreaterThanOrEqual(18);
    expect(attemptEncounterEscape(state)).toMatchObject({ ok: true, outcome: 'blocked' });
    const withoutPreparation = structuredClone(state);
    withoutPreparation.pendingEncounter!.preparations = [];
    for (let round = 0; round < 2; round += 1) {
      expect(performDockCombatExchange(state, 'guard').ok).toBe(true);
      expect(performDockCombatExchange(withoutPreparation, 'guard').ok).toBe(true);
    }
    expect(resolveEncounterCombat(state, 'physical')).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(resolveEncounterCombat(withoutPreparation, 'physical')).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(state.combatVitals.hp).toBe(withoutPreparation.combatVitals.hp);
    expect(state.log.some(entry => entry.text.includes('固定完成了一次先手反击'))).toBe(false);
  });
});

describe('信息边界与v26迁移', () => {
  it('没有核验信息时不标危险；已有调查或防护时只给定性建议且不含敌人数值', () => {
    const state = newGame('边界', 'clerk', []);
    state.pendingEncounter = {
      encounterId: 'encounter_dock_manifest_cleaner', threatId: 'dock_manifest_cleaner', phase: 'escape_choice',
      sourceKind: 'deep_investigation', sourceId: 'deep_dock_crate_trace', startedDay: 1, startedHour: 7,
      narrativeVariant: 0, preparations: [],
    };
    expect(getPendingEncounterView(state)?.assessment).toBeNull();
    acquireClue(state, 'dock_crate_trace');
    const assessment = getPendingEncounterView(state)?.assessment ?? '';
    expect(assessment).toContain('路线');
    expect(assessment).not.toMatch(/生命|精神值|物攻|物防|精攻|精防|\d/);
    expect(appSource).toContain('data-dock-danger-assessment');
    expect(appSource).toContain('dockEncounter?.assessment &&');
    expect(appSource).not.toMatch(/敌人生命|敌人精神值|敌人物攻|敌人物防|敌人精攻|敌人精防/);
  });

  it('未知转运预兆时准备列表与UI不泄露灵性防护，取得预兆后才显示', () => {
    const state = triggerDockEncounter();
    expect(getDockCombatPreparations(state).map(item => item.id)).not.toContain('spiritual_guard');
    expect(appSource).not.toContain('灵性防护');
    acquireClue(state, 'dock_scale_transfer_omen', 'event', 'divination:dock_scale_evidence');
    expect(getDockCombatPreparations(state).map(item => item.id)).toContain('spiritual_guard');
  });

  it('v25遭遇迁移为空准备；v26伪造准备被清，真实回执准备往返且二次读取幂等', () => {
    const legacy = triggerDockEncounter();
    legacy.schemaVersion = 25;
    legacy.pendingEncounter!.preparations = ['mapped_retreat'];
    saveGame(legacy);
    const migrated = loadGame()!;
    expect(migrated.schemaVersion).toBe(32);
    expect(migrated.pendingEncounter?.preparations).toEqual([]);

    const forged = triggerDockEncounter();
    forged.pendingEncounter!.preparations = ['mapped_retreat'];
    saveGame(forged);
    expect(loadGame()!.pendingEncounter?.preparations).toEqual([]);

    const genuine = triggerDockEncounter();
    expect(prepareDockEncounter(genuine, 'mapped_retreat').ok).toBe(true);
    saveGame(genuine);
    const first = loadGame()!;
    expect(first.pendingEncounter?.preparations).toEqual(['mapped_retreat']);
    saveGame(first);
    const second = loadGame()!;
    expect(second.pendingEncounter?.preparations).toEqual(['mapped_retreat']);
    expect(second.checkAttempts).toEqual(first.checkAttempts);
  });

  it.each([
    ['黄昏跨入夜间', 1, 17, 18, -4],
    ['清晨离开夜间', 2, 5, 6, -3],
  ] as const)('night_owl准备在%s后按开始时刻核验成本并可幂等读档', (_label, day, startedHour, endedHour, expectedDelta) => {
    const state = triggerDockEncounter();
    state.talents.push('night_owl');
    state.day = day; state.hour = startedHour;
    expect(prepareDockEncounter(state, 'mapped_retreat')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(state.day).toBe(day);
    expect(state.hour).toBe(endedHour);
    expect(state.checkAttempts.at(-1)?.receipt.effects)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: 'energy', actualDelta: expectedDelta })]));
    saveGame(state);
    const first = loadGame()!;
    expect(first.pendingEncounter?.preparations).toEqual(['mapped_retreat']);
    saveGame(first);
    const second = loadGame()!;
    expect(second.pendingEncounter?.preparations).toEqual(['mapped_retreat']);
    expect(second.checkAttempts).toEqual(first.checkAttempts);
  });

  it('看似完整的准备attempt与receipt不能替代当前缺失的线索、武器、能力或精确能量回执', () => {
    const missingClue = triggerDockEncounter();
    expect(prepareDockEncounter(missingClue, 'mapped_retreat').ok).toBe(true);
    missingClue.clues = missingClue.clues.filter(clue => clue.id !== 'dock_crate_trace');
    saveGame(missingClue);
    expect(loadGame()!.pendingEncounter?.preparations).toEqual([]);

    const missingWeapon = triggerDockEncounter();
    giveLoadedRevolver(missingWeapon);
    expect(prepareDockEncounter(missingWeapon, 'prepared_ambush').ok).toBe(true);
    missingWeapon.items.revolver = 0;
    saveGame(missingWeapon);
    expect(loadGame()!.pendingEncounter?.preparations).toEqual([]);

    const missingAbility = triggerDockEncounter();
    missingAbility.pathwayId = 'seer'; missingAbility.sequence = 9;
    missingAbility.items.ritual_chalk = 1;
    acquireClue(missingAbility, 'dock_scale_transfer_omen', 'event', 'divination:dock_scale_evidence');
    expect(prepareDockEncounter(missingAbility, 'spiritual_guard').ok).toBe(true);
    missingAbility.pathwayId = null; missingAbility.sequence = null;
    saveGame(missingAbility);
    expect(loadGame()!.pendingEncounter?.preparations).toEqual([]);

    const forgedEnergyReceipt = triggerDockEncounter();
    expect(prepareDockEncounter(forgedEnergyReceipt, 'mapped_retreat').ok).toBe(true);
    const energy = forgedEnergyReceipt.checkAttempts.at(-1)!.receipt.effects.find(effect => effect.id === 'energy')!;
    energy.actualDelta = -99;
    energy.after = Number(energy.before) - 99;
    saveGame(forgedEnergyReceipt);
    expect(loadGame()!.pendingEncounter?.preparations).toEqual([]);
  });
});
