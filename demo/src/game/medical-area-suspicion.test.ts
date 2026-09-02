import { beforeEach, describe, expect, it, vi } from 'vitest';
import appSource from '../App.tsx?raw';
import type { GameState } from './types';
import {
  acquireClue,
  applyHomeBandage,
  attemptEncounterEscape,
  buyFromShop,
  clinicTreatmentIssue,
  commuteToWork,
  criticalActivityIssue,
  doChat,
  doNap,
  doSleep,
  doSocial,
  engageDockEncounter,
  executeHunt,
  getAreaSuspicionStatus,
  getClinicTreatmentPlan,
  getCombatProfile,
  getShopInventory,
  homeBandageIssue,
  huntActionIssue,
  investigateHuntTarget,
  leaveCurrentLocation,
  loadGame,
  newGame,
  performAtLocationAction,
  performActingAction,
  performDeepInvestigation,
  performDockCombatExchange,
  practiceSeerMeditation,
  prepareDockEncounter,
  prepareHuntStep,
  receiveClinicTreatment,
  readBookSession,
  requestEmergencyAid,
  resolveEncounterCombat,
  saveGame,
  travelIssue,
  travelToLocation,
} from './engine';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
}

const stayAt = (state: GameState, locationId: string) => {
  state.currentLocation = {
    locationId, arrivedDay: state.day, arrivedHour: state.hour,
    travelMode: 'walk', returnHours: 1, returnPrepaid: true,
  };
};

const fitVitals = (state: GameState) => {
  const profile = getCombatProfile(state);
  state.combatVitals = { hp: profile.maxHp, spirit: profile.maxSpirit };
};

function finishDockExchange(state: GameState) {
  while (state.pendingEncounter?.combatRound && !state.pendingEncounter.combatRound.finisherReady) {
    expect(performDockCombatExchange(state, 'guard').ok).toBe(true);
  }
}

function readyAtDocks() {
  const state = newGame('地区后果测试者', 'docker', []);
  state.hour = 9;
  state.stats.mnd = 60;
  state.skills.investigate = 10;
  state.stats.energy = 100;
  fitVitals(state);
  stayAt(state, 'docks');
  acquireClue(state, 'dock_missing_reports');
  acquireClue(state, 'dock_manifest_discrepancy');
  acquireClue(state, 'dock_crate_trace');
  return state;
}

function triggerDockEncounter(state = readyAtDocks()) {
  expect(performDeepInvestigation(state, 'deep_dock_missing_reports').outcome).toBe('passed');
  expect(performDeepInvestigation(state, 'deep_dock_manifest_discrepancy').outcome).toBe('passed');
  expect(performDeepInvestigation(state, 'deep_dock_crate_trace').outcome).toBe('passed');
  expect(state.pendingEncounter?.phase).toBe('escape_choice');
  return state;
}

function openTradeFair(state: GameState, day: number) {
  state.day = day; state.hour = 22; stayAt(state, 'black_market');
  state.tradeFair.invitation = { sourceKind: 'npc', sourceId: 'victor', acquiredDay: 1, acquiredHour: 22 };
  if (!state.organizationRoutes.iron_and_blood.history.some(record => record.step === 'trade_fair_invitation:victor')) {
    state.organizationRoutes.iron_and_blood.history.push({
      day: 1, step: 'trade_fair_invitation:victor', outcome: 'passed', evidenceId: 'trade_fair_invitation',
    });
  }
  if (!state.intel.includes('trade_fair_invitation')) state.intel.push('trade_fair_invitation');
  if (!state.intel.includes('black_market')) state.intel.push('black_market');
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('v27普通治疗与伤势门禁', () => {
  it('家庭包扎只处理轻伤，固定消耗一份敷料和一小时且不恢复其它资源', () => {
    const state = newGame('家庭包扎', 'clerk', []);
    state.hour = 10;
    const max = getCombatProfile(state).maxHp;
    state.combatVitals.hp = max - 10;
    state.items.medical_dressing = 1;
    const before = {
      pence: state.pence, energy: state.stats.energy, san: state.stats.san,
      spirit: state.combatVitals.spirit, hour: state.hour,
    };
    expect(homeBandageIssue(state)).toBeNull();
    expect(applyHomeBandage(state).ok).toBe(true);
    expect(state.items.medical_dressing).toBe(0);
    expect(state.combatVitals.hp).toBe(max - 2);
    expect(state.hour).toBe(before.hour + 1);
    expect({ pence: state.pence, energy: state.stats.energy, san: state.stats.san, spirit: state.combatVitals.spirit })
      .toEqual({ pence: before.pence, energy: before.energy, san: before.san, spirit: before.spirit });

    const after = structuredClone(state);
    expect(applyHomeBandage(state).ok).toBe(false);
    expect(state).toEqual(after);
    state.items.medical_dressing = 1;
    state.combatVitals.hp = Math.floor(max * 0.5);
    expect(homeBandageIssue(state)).toContain('诊所');
  });

  it.each([
    ['light', 0.75, 20, 2, 18],
    ['severe', 0.5, 45, 4, 30],
    ['critical', 0.25, 80, 6, 40],
  ] as const)('诊所对%s伤势按固定费用、时间和恢复量处置', (level, ratio, fee, hours, healing) => {
    const state = newGame(`诊所-${level}`, 'clerk', []);
    state.hour = 9; state.pence = 500; stayAt(state, 'north_clinic');
    const profile = getCombatProfile(state);
    state.combatVitals.hp = Math.floor(profile.maxHp * ratio);
    const before = {
      hp: state.combatVitals.hp, spirit: state.combatVitals.spirit, energy: state.stats.energy,
      san: state.stats.san, pence: state.pence, hour: state.hour,
    };
    expect(getClinicTreatmentPlan(state)).toMatchObject({ level, fee, hours, healing });
    expect(clinicTreatmentIssue(state)).toBeNull();
    expect(receiveClinicTreatment(state).ok).toBe(true);
    expect(state.pence).toBe(before.pence - fee);
    expect(state.hour).toBe(before.hour + hours);
    expect(state.combatVitals.hp).toBe(Math.min(profile.maxHp, before.hp + healing));
    expect({ spirit: state.combatVitals.spirit, energy: state.stats.energy, san: state.stats.san })
      .toEqual({ spirit: before.spirit, energy: before.energy, san: before.san });
  });

  it('无伤、缺钱、缺物、错地点或遭遇中治疗均完整零状态失败，公开商店提供固定敷料', () => {
    const cases: GameState[] = [];
    const unhurt = newGame('无伤', 'clerk', []); stayAt(unhurt, 'north_clinic'); cases.push(unhurt);
    const poor = newGame('缺钱', 'clerk', []); poor.pence = 0; poor.combatVitals.hp -= 10; stayAt(poor, 'north_clinic'); cases.push(poor);
    const wrong = newGame('错地', 'clerk', []); wrong.combatVitals.hp -= 10; stayAt(wrong, 'market'); cases.push(wrong);
    const encounter = triggerDockEncounter(); cases.push(encounter);
    for (const state of cases) {
      const before = structuredClone(state);
      expect(receiveClinicTreatment(state).ok).toBe(false);
      expect(state).toEqual(before);
    }
    const noDressing = newGame('缺物', 'clerk', []); noDressing.combatVitals.hp -= 10;
    const before = structuredClone(noDressing);
    expect(applyHomeBandage(noDressing).ok).toBe(false);
    expect(noDressing).toEqual(before);

    const shopper = newGame('买敷料', 'clerk', []); shopper.hour = 10; shopper.pence = 100; stayAt(shopper, 'market');
    expect(getShopInventory(shopper, 'market_general_store')).toContainEqual({ itemId: 'medical_dressing', price: 10 });
    expect(buyFromShop(shopper, 'market_general_store', 'medical_dressing').ok).toBe(true);
    expect(shopper.items.medical_dressing).toBe(1);
  });

  it('重伤阻止剧烈调查和猎杀；濒危者只能撤离并乘车去诊所', () => {
    const severe = readyAtDocks();
    severe.combatVitals.hp = Math.floor(getCombatProfile(severe).maxHp * 0.5);
    const beforeExplore = structuredClone(severe);
    expect(performAtLocationAction(severe, 'explore')).toMatchObject({ ok: false, msg: expect.stringContaining('重伤') });
    expect(severe).toEqual(beforeExplore);
    expect(huntActionIssue(severe, 'masked_fortune_smuggler', 'identify')).toContain('重伤');

    const criticalAway = readyAtDocks();
    criticalAway.combatVitals.hp = Math.floor(getCombatProfile(criticalAway).maxHp * 0.25);
    expect(leaveCurrentLocation(criticalAway).ok).toBe(true);
    criticalAway.pence = 500;
    const beforeBlocked = structuredClone(criticalAway);
    expect(travelToLocation(criticalAway, 'market', 'walk')).toMatchObject({ ok: false, msg: expect.stringContaining('北区诊所') });
    expect(criticalAway).toEqual(beforeBlocked);
    expect(travelIssue(criticalAway, 'north_clinic', 'walk')).toContain('人力车');
    expect(travelToLocation(criticalAway, 'north_clinic', 'rickshaw').ok).toBe(true);
    expect(receiveClinicTreatment(criticalAway).ok).toBe(true);
  });

  it('濒危且身无分文时可从住处请求一次慈善救护稳定到重伤，避免永久锁死', () => {
    const state = newGame('无钱求助', 'clerk', []);
    state.pence = 0;
    state.combatVitals.hp = 1;
    const before = { spirit: state.combatVitals.spirit, energy: state.stats.energy, san: state.stats.san, hour: state.hour };
    expect(requestEmergencyAid(state).ok).toBe(true);
    expect(state.combatVitals.hp).toBe(Math.floor(getCombatProfile(state).maxHp * 0.25) + 1);
    expect(huntActionIssue(state, 'masked_fortune_smuggler', 'identify')).toContain('重伤');
    expect({ spirit: state.combatVitals.spirit, energy: state.stats.energy, san: state.stats.san })
      .toEqual({ spirit: before.spirit, energy: before.energy, san: before.san });
    expect(state.hour).toBe(before.hour + 6);
    const after = structuredClone(state);
    expect(requestEmergencyAid(state).ok).toBe(false);
    expect(state).toEqual(after);
  });

  it('濒危白名单在规则层阻止阅读、拜访、训练、扮演、上班与购物且全部零状态', () => {
    const assertBlockedWithoutMutation = (state: GameState, action: (candidate: GameState) => unknown) => {
      state.combatVitals.hp = 1;
      const before = structuredClone(state);
      action(state);
      expect(state).toEqual(before);
    };

    const reading = newGame('濒危阅读', 'clerk', []);
    reading.books.church_festivals_excerpt.acquired = true;
    assertBlockedWithoutMutation(reading, state => {
      expect(readBookSession(state, 'church_festivals_excerpt')).toMatchObject({ ok: false, msg: expect.stringContaining('濒危') });
    });

    assertBlockedWithoutMutation(newGame('濒危拜访', 'clerk', []), state => {
      expect(doSocial(state, 'ella')).toMatchObject({ ok: false, msg: expect.stringContaining('濒危') });
    });
    assertBlockedWithoutMutation(newGame('濒危训练', 'clerk', []), state => {
      expect(practiceSeerMeditation(state)).toMatchObject({ ok: false, msg: expect.stringContaining('濒危') });
    });
    assertBlockedWithoutMutation(newGame('濒危扮演', 'clerk', []), state => {
      expect(performActingAction(state, 'seer_observe_consultation')).toMatchObject({ ok: false, msg: expect.stringContaining('濒危') });
    });
    assertBlockedWithoutMutation(newGame('濒危上班', 'docker', []), state => {
      expect(commuteToWork(state)).toMatchObject({ ok: false, msg: expect.stringContaining('濒危') });
    });

    const shopper = newGame('濒危购物', 'clerk', []);
    shopper.hour = 10; shopper.pence = 100; stayAt(shopper, 'market');
    assertBlockedWithoutMutation(shopper, state => {
      expect(buyFromShop(state, 'market_general_store', 'medical_dressing')).toMatchObject({ ok: false, msg: expect.stringContaining('濒危') });
    });
    expect(criticalActivityIssue(shopper)).toContain('濒危');
  });

  it('濒危仍可休息、求助、诊所治疗、离开地点并处理当前遭遇的逃离或被迫防御', () => {
    const napper = newGame('濒危小憩', 'clerk', []);
    napper.combatVitals.hp = 1;
    expect(doNap(napper).ok).toBe(true);

    const sleeper = newGame('濒危睡眠', 'clerk', []);
    sleeper.combatVitals.hp = 1;
    expect(doSleep(sleeper).ok).toBe(true);

    const aid = newGame('濒危求助', 'clerk', []);
    aid.combatVitals.hp = 1;
    expect(requestEmergencyAid(aid).ok).toBe(true);

    const clinic = newGame('濒危诊所', 'clerk', []);
    clinic.hour = 9; clinic.pence = 500; clinic.combatVitals.hp = 1; stayAt(clinic, 'north_clinic');
    expect(receiveClinicTreatment(clinic).ok).toBe(true);

    const leaving = readyAtDocks();
    leaving.combatVitals.hp = 1;
    expect(leaveCurrentLocation(leaving).ok).toBe(true);

    const escaping = triggerDockEncounter();
    escaping.stats.phy = 0; escaping.skills.sneak = 0; fitVitals(escaping); escaping.combatVitals.hp = 1;
    expect(attemptEncounterEscape(escaping).outcome).toBe('blocked');

    const defending = triggerDockEncounter();
    defending.stats.phy = 0; defending.skills.sneak = 0; fitVitals(defending);
    expect(attemptEncounterEscape(defending).outcome).toBe('blocked');
    defending.combatVitals.hp = 1;
    expect(performDockCombatExchange(defending, 'guard').ok).toBe(true);
  });
});

describe('v27当前地点身份怀疑度与通缉', () => {
  it('工作地点使用稳定区域映射：码头装卸工被码头通缉后通勤零状态拒绝，在岗查询仍归入码头', () => {
    const blocked = newGame('通缉装卸工', 'docker', []);
    blocked.hour = 7;
    blocked.areaSuspicion = { docks: 100 };
    blocked.wantedAreas = ['docks'];
    const before = structuredClone(blocked);
    expect(commuteToWork(blocked)).toMatchObject({ ok: false, msg: expect.stringContaining('通缉') });
    expect(blocked).toEqual(before);

    const atWork = structuredClone(blocked);
    atWork.atWork = true;
    expect(getAreaSuspicionStatus(atWork)).toMatchObject({ areaId: 'docks', value: 100, wanted: true });
    expect(getAreaSuspicionStatus(atWork, 'market')).toMatchObject({ areaId: 'market', value: 0, wanted: false });
  });

  it('码头逃脱失败与公开冲突各只记录一次，达到100后仍可离开但不能公开重入', () => {
    const state = triggerDockEncounter();
    state.stats.phy = 0; state.skills.sneak = 0; fitVitals(state);
    expect(attemptEncounterEscape(state).outcome).toBe('blocked');
    expect(getAreaSuspicionStatus(state, 'docks')).toMatchObject({ value: 40, wanted: false });
    finishDockExchange(state);
    expect(resolveEncounterCombat(state, 'physical').ok).toBe(true);
    expect(getAreaSuspicionStatus(state, 'docks')).toMatchObject({ value: 100, wanted: true, label: '已被通缉' });
    expect(state.areaSuspicionRecords).toHaveLength(2);
    expect(getAreaSuspicionStatus(state, 'market').value).toBe(0);
    expect(travelToLocation(state, 'docks', 'walk')).toMatchObject({ ok: false, msg: expect.stringContaining('通缉') });
  });

  it('已核对退路与伏击准备固定减轻码头物理冲突痕迹，但公开异常不会归零', () => {
    const exposed = triggerDockEncounter();
    exposed.stats.phy = 100; exposed.skills.combat = 10; fitVitals(exposed);
    expect(engageDockEncounter(exposed, 'physical').ok).toBe(true);
    finishDockExchange(exposed);
    expect(resolveEncounterCombat(exposed, 'physical').ok).toBe(true);
    expect(getAreaSuspicionStatus(exposed, 'docks').value).toBe(75);

    const prepared = triggerDockEncounter();
    prepared.stats.phy = 100; prepared.skills.combat = 10; prepared.items.revolver = 1; prepared.items.revolver_ammo = 12; prepared.combatLoadout.weaponId = 'revolver'; fitVitals(prepared);
    expect(prepareDockEncounter(prepared, 'mapped_retreat').ok).toBe(true);
    expect(prepareDockEncounter(prepared, 'prepared_ambush').ok).toBe(true);
    expect(engageDockEncounter(prepared, 'physical').ok).toBe(true);
    finishDockExchange(prepared);
    expect(resolveEncounterCombat(prepared, 'physical').ok).toBe(true);
    expect(getAreaSuspicionStatus(prepared, 'docks').value).toBe(55);
  });

  it('精神手段产生独立且更高的固定可见异常记录', () => {
    const state = triggerDockEncounter();
    state.pathwayId = 'seer'; state.sequence = 9; state.stats.spi = 100; state.skills.occult = 10; fitVitals(state);
    expect(engageDockEncounter(state, 'spiritual').ok).toBe(true);
    finishDockExchange(state);
    expect(resolveEncounterCombat(state, 'spiritual').ok).toBe(true);
    expect(state.areaSuspicionRecords).toEqual([
      expect.objectContaining({ areaId: 'docks', source: 'dock_active_spiritual', amount: 100 }),
    ]);
    expect(getAreaSuspicionStatus(state, 'docks')).toMatchObject({ value: 100, wanted: true });
  });

  it('有准备猎杀留下独立地点痕迹，不会混入非凡暴露或全局执法关注', () => {
    const state = newGame('猎杀地区记录', 'clerk', []);
    state.stats.mnd = state.stats.cha = state.stats.phy = 100;
    state.skills.investigate = state.skills.occult = state.skills.speech = state.skills.sneak = state.skills.combat = 10;
    state.stats.energy = 100; state.items.revolver = 1; fitVitals(state);
    openTradeFair(state, 4);
    expect(doChat(state, 'masked_fortune_smuggler').ok).toBe(true);
    expect(investigateHuntTarget(state, 'masked_fortune_smuggler').outcome).toBe('passed');
    for (const [index, step] of (['routine', 'secludedMeeting', 'escapeRoute', 'ambush'] as const).entries()) {
      openTradeFair(state, 7 + index * 7);
      expect(prepareHuntStep(state, 'masked_fortune_smuggler', step).outcome).toBe('passed');
    }
    openTradeFair(state, 35);
    const beforeExposure = state.exposure;
    expect(executeHunt(state, 'masked_fortune_smuggler').outcome).toBe('passed');
    expect(getAreaSuspicionStatus(state, 'black_market').value).toBe(20);
    expect(state.lawAttention).toBe(8);
    expect(state.exposure).toBe(beforeExposure);
    expect(getAreaSuspicionStatus(state, 'docks').value).toBe(0);

    const originalArea = state.areaSuspicionRecords[0];
    const originalMurder = state.murderRecords[0];
    const originalDeath = state.confirmedBeyonderDeaths.find(record => record.sourceId === originalMurder.deathSourceId)!;
    const originalAttempt = state.checkAttempts.find(attempt => attempt.attemptId === originalArea.settlementAttemptId)!;
    const cloneAttemptId = `${originalAttempt.attemptId}:cloned`;
    state.checkAttempts.push({ ...structuredClone(originalAttempt), attemptId: cloneAttemptId });
    state.murderRecords.push({ ...structuredClone(originalMurder), settlementAttemptId: cloneAttemptId });
    state.confirmedBeyonderDeaths.push({ ...structuredClone(originalDeath), settlementAttemptId: cloneAttemptId });
    state.areaSuspicionRecords.push({
      ...structuredClone(originalArea), id: `hunt_death:${cloneAttemptId}`, settlementAttemptId: cloneAttemptId,
    });
    saveGame(state);
    const loaded = loadGame()!;
    expect(loaded.murderRecords).toHaveLength(1);
    expect(loaded.areaSuspicionRecords).toHaveLength(1);
    expect(getAreaSuspicionStatus(loaded, 'black_market')).toMatchObject({ value: 20, wanted: false });
    saveGame(loaded);
    const reloaded = loadGame()!;
    expect(reloaded.areaSuspicionRecords).toEqual(loaded.areaSuspicionRecords);
    expect(reloaded.areaSuspicion).toEqual(loaded.areaSuspicion);
    expect(reloaded.wantedAreas).toEqual(loaded.wantedAreas);
  });

  it('v26不追溯地区记录；v27只保留权威记录，伪造聚合与通缉被清理且合法读档幂等', () => {
    const legacy = newGame('旧档', 'clerk', []);
    legacy.schemaVersion = 26;
    legacy.areaSuspicionRecords = [{
      id: 'forged', areaId: 'docks', source: 'dock_escape_failed', amount: 100,
      day: 1, hour: 7, settlementAttemptId: 'missing',
    }];
    legacy.areaSuspicion = { docks: 100 }; legacy.wantedAreas = ['docks'];
    saveGame(legacy);
    expect(loadGame()).toMatchObject({ schemaVersion: 32, areaSuspicionRecords: [], areaSuspicion: {}, wantedAreas: [] });

    const forged = newGame('伪档', 'clerk', []);
    forged.areaSuspicion = { docks: 100, forged_place: 100 };
    forged.wantedAreas = ['docks', 'forged_place'];
    saveGame(forged);
    expect(loadGame()).toMatchObject({ areaSuspicionRecords: [], areaSuspicion: {}, wantedAreas: [] });

    const genuine = triggerDockEncounter();
    genuine.stats.phy = 0; genuine.skills.sneak = 0; fitVitals(genuine);
    expect(attemptEncounterEscape(genuine).outcome).toBe('blocked');
    saveGame(genuine);
    const first = loadGame()!;
    expect(first.areaSuspicionRecords).toHaveLength(1);
    expect(getAreaSuspicionStatus(first, 'docks').value).toBe(40);
    saveGame(first);
    const second = loadGame()!;
    expect(second.areaSuspicionRecords).toEqual(first.areaSuspicionRecords);
    expect(second.areaSuspicion).toEqual(first.areaSuspicion);
    expect(second.wantedAreas).toEqual(first.wantedAreas);
  });

  it('v27按案件语义去重克隆ID：同一码头逃脱或战斗记录不能重复累计并保持二次读档幂等', () => {
    const cloneAuthority = (state: GameState) => {
      const originalRecord = state.areaSuspicionRecords[0];
      const originalAttempt = state.checkAttempts.find(attempt => attempt.attemptId === originalRecord.settlementAttemptId)!;
      const cloneAttemptId = `${originalAttempt.attemptId}:cloned`;
      state.checkAttempts.push({ ...structuredClone(originalAttempt), attemptId: cloneAttemptId });
      state.areaSuspicionRecords.push({
        ...structuredClone(originalRecord),
        id: `${originalRecord.source}:${cloneAttemptId}`,
        settlementAttemptId: cloneAttemptId,
      });
    };

    const escaped = triggerDockEncounter();
    escaped.stats.phy = 0; escaped.skills.sneak = 0; fitVitals(escaped);
    expect(attemptEncounterEscape(escaped).outcome).toBe('blocked');
    cloneAuthority(escaped);
    saveGame(escaped);
    const escapedFirst = loadGame()!;
    expect(escapedFirst.areaSuspicionRecords).toHaveLength(1);
    expect(getAreaSuspicionStatus(escapedFirst, 'docks')).toMatchObject({ value: 40, wanted: false });
    saveGame(escapedFirst);
    const escapedSecond = loadGame()!;
    expect(escapedSecond.areaSuspicionRecords).toEqual(escapedFirst.areaSuspicionRecords);
    expect(escapedSecond.areaSuspicion).toEqual(escapedFirst.areaSuspicion);
    expect(escapedSecond.wantedAreas).toEqual(escapedFirst.wantedAreas);

    const combat = triggerDockEncounter();
    combat.stats.phy = 100; combat.skills.combat = 10; fitVitals(combat);
    expect(engageDockEncounter(combat, 'physical').ok).toBe(true);
    finishDockExchange(combat);
    expect(resolveEncounterCombat(combat, 'physical').ok).toBe(true);
    cloneAuthority(combat);
    saveGame(combat);
    const combatFirst = loadGame()!;
    expect(combatFirst.areaSuspicionRecords).toHaveLength(1);
    expect(getAreaSuspicionStatus(combatFirst, 'docks')).toMatchObject({ value: 75, wanted: false });
    saveGame(combatFirst);
    const combatSecond = loadGame()!;
    expect(combatSecond.areaSuspicionRecords).toEqual(combatFirst.areaSuspicionRecords);
    expect(combatSecond.areaSuspicion).toEqual(combatFirst.areaSuspicion);
    expect(combatSecond.wantedAreas).toEqual(combatFirst.wantedAreas);
  });

  it('UI显示生命治疗与当前区域怀疑度，不显示敌方精确数值或隐藏危险', () => {
    expect(appSource).toContain('data-area-suspicion');
    expect(appSource).toContain('当前区域身份怀疑度');
    expect(appSource).toContain('data-clinic-treatment');
    expect(appSource).toContain('data-home-bandage');
    expect(appSource).toContain('allowDuringCritical');
    expect(appSource).not.toMatch(/敌人生命|敌人精神值|敌人物理攻击|敌人精神攻击|敌人物理防御|敌人精神防御/);
  });
});
