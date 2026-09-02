import { beforeEach, describe, expect, it, vi } from 'vitest';
import appSource from '../App.tsx?raw';
import type { GameState } from './types';
import {
  acquireClue,
  advanceHours,
  attemptEncounterEscape,
  engageDockEncounter,
  getAreaSuspicionStatus,
  getCombatProfile,
  getIdentityCoverStatus,
  getIdentityExposureEntries,
  identityCoverIssue,
  identityTraceInvestigationIssue,
  identityTraceResolutionIssue,
  investigateIdentityTrace,
  loadGame,
  newGame,
  performDeepInvestigation,
  performDockCombatExchange,
  prepareIdentityCover,
  resolveEncounterCombat,
  resolveIdentityTrace,
  saveGame,
  travelIssue,
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
  const state = newGame('身份记录测试者', 'docker', []);
  state.hour = 9;
  state.stats.mnd = 60;
  state.skills.investigate = 10;
  state.stats.energy = 100;
  fitVitals(state);
  stayAt(state, 'docks');
  acquireClue(state, 'dock_missing_reports');
  acquireClue(state, 'dock_manifest_discrepancy');
  acquireClue(state, 'dock_crate_trace');
  expect(performDeepInvestigation(state, 'deep_dock_missing_reports').outcome).toBe('passed');
  expect(performDeepInvestigation(state, 'deep_dock_manifest_discrepancy').outcome).toBe('passed');
  expect(performDeepInvestigation(state, 'deep_dock_crate_trace').outcome).toBe('passed');
  return state;
}

function escapeTrace() {
  const state = readyAtDocks();
  state.stats.phy = 0; state.skills.sneak = 0; fitVitals(state);
  expect(attemptEncounterEscape(state).outcome).toBe('blocked');
  return state;
}

function wantedDockState() {
  const state = escapeTrace();
  state.stats.phy = 100; state.skills.combat = 10; fitVitals(state);
  finishDockExchange(state);
  expect(resolveEncounterCombat(state, 'physical').ok).toBe(true);
  expect(getAreaSuspicionStatus(state, 'docks')).toMatchObject({ value: 100, wanted: true });
  expect(state.currentLocation).toBeNull();
  state.stats.mnd = state.stats.cha = 100;
  state.skills.investigate = state.skills.speech = state.skills.sneak = 10;
  state.stats.energy = 100;
  state.pence = 500;
  return state;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('v28身份痕迹调查与处理', () => {
  it('通缉状态不能自然消失，必须先查明并处理具体记录', () => {
    const state = wantedDockState();
    const waiting = structuredClone(state);
    advanceHours(waiting, 24 * 8);
    expect(getAreaSuspicionStatus(waiting, 'docks')).toMatchObject({ value: 100, wanted: true });
    expect(getIdentityExposureEntries(state)[0].traces.every(trace => !trace.discovered)).toBe(true);

    expect(identityTraceInvestigationIssue(state, 'docks')).toBeNull();
    expect(investigateIdentityTrace(state, 'docks').outcome).toBe('passed');
    expect(getIdentityExposureEntries(state)[0].traces[0]).toMatchObject({
      discovered: true, resolved: false, kind: 'witness_description',
    });
    expect(identityTraceResolutionIssue(state, 'docks')).toBeNull();
    const beforeInfamy = state.infamy;
    const beforeLawAttention = state.lawAttention;
    expect(resolveIdentityTrace(state, 'docks').outcome).toBe('passed');
    expect(getAreaSuspicionStatus(state, 'docks')).toMatchObject({ wanted: false });
    expect(state.infamy).toBe(beforeInfamy);
    expect(state.lawAttention).toBe(beforeLawAttention);
  });

  it('多条痕迹必须逐条调查；处理公开冲突需要伪装用品且不直接显示数值效果', () => {
    const state = wantedDockState();
    expect(investigateIdentityTrace(state, 'docks').outcome).toBe('passed');
    expect(resolveIdentityTrace(state, 'docks').outcome).toBe('passed');
    expect(investigateIdentityTrace(state, 'docks').outcome).toBe('passed');
    expect(getIdentityExposureEntries(state)[0].traces[1]).toMatchObject({
      discovered: true, resolved: false, kind: 'public_confrontation',
    });
    expect(identityTraceResolutionIssue(state, 'docks')).toContain('伪装用品');
    state.items.plain_disguise_kit = 1;
    expect(resolveIdentityTrace(state, 'docks').outcome).toBe('passed');
    expect(state.items.plain_disguise_kit).toBe(0);
    expect(getIdentityExposureEntries(state)[0].traces.every(trace => trace.resolved)).toBe(true);
    expect(state.log.at(-1)?.text).not.toMatch(/减少|降低\d|−\d|-\d/);
  });

  it('未通缉痕迹在72小时安静期后才按固定节奏淡化', () => {
    const state = readyAtDocks();
    state.stats.phy = 100; state.skills.combat = 10; fitVitals(state);
    expect(engageDockEncounter(state, 'physical').ok).toBe(true);
    finishDockExchange(state);
    expect(resolveEncounterCombat(state, 'physical').ok).toBe(true);
    expect(state.currentLocation).toBeNull();
    expect(getAreaSuspicionStatus(state, 'docks').value).toBe(75);
    advanceHours(state, 71);
    expect(getAreaSuspicionStatus(state, 'docks').value).toBe(75);
    advanceHours(state, 24);
    expect(getAreaSuspicionStatus(state, 'docks').value).toBe(70);
  });
});

describe('v28普通伪装与公共身份核对', () => {
  it('高怀疑地区要求普通伪装，伪装有24小时期限且不能绕过正式通缉', () => {
    const state = wantedDockState();
    expect(investigateIdentityTrace(state, 'docks').outcome).toBe('passed');
    expect(resolveIdentityTrace(state, 'docks').outcome).toBe('passed');
    expect(getAreaSuspicionStatus(state, 'docks')).toMatchObject({ value: 80, wanted: false });
    expect(travelIssue(state, 'docks', 'walk')).toContain('身份');

    state.items.plain_disguise_kit = 1;
    expect(identityCoverIssue(state)).toBeNull();
    expect(prepareIdentityCover(state).outcome).toBe('passed');
    expect(getIdentityCoverStatus(state)).toMatchObject({ active: true, remainingHours: 24 });
    expect(travelIssue(state, 'docks', 'walk')).toBeNull();
    advanceHours(state, 24);
    expect(getIdentityCoverStatus(state).active).toBe(false);
    expect(travelIssue(state, 'docks', 'walk')).toContain('身份');

    const wanted = wantedDockState();
    wanted.items.plain_disguise_kit = 1;
    expect(prepareIdentityCover(wanted).outcome).toBe('passed');
    expect(travelIssue(wanted, 'docks', 'walk')).toContain('通缉');
  });
});

describe('v28存档审计与UI边界', () => {
  it('v27迁移为空；伪造调查、处理和伪装记录会被清理', () => {
    const legacy = escapeTrace();
    legacy.schemaVersion = 27;
    delete (legacy as Partial<GameState>).identityTraceDiscoveries;
    delete (legacy as Partial<GameState>).identityTraceResolutions;
    delete (legacy as Partial<GameState>).identityCover;
    saveGame(legacy);
    expect(loadGame()).toMatchObject({
      schemaVersion: 32, identityTraceDiscoveries: [], identityTraceResolutions: [], identityCover: null,
    });

    const forged = escapeTrace();
    forged.identityTraceDiscoveries = [{
      sourceRecordId: forged.areaSuspicionRecords[0].id,
      kind: 'witness_description', investigationAttemptId: 'missing',
    }];
    forged.identityTraceResolutions = [{
      sourceRecordId: forged.areaSuspicionRecords[0].id,
      method: 'alibi_correction', amount: 100, resolutionAttemptId: 'missing',
    }];
    forged.identityCover = { preparationAttemptId: 'missing', createdDay: 1, createdHour: 1, expiresAbsoluteHour: 999 };
    saveGame(forged);
    expect(loadGame()).toMatchObject({ identityTraceDiscoveries: [], identityTraceResolutions: [], identityCover: null });
    expect(getAreaSuspicionStatus(loadGame()!, 'docks').value).toBe(40);
  });

  it('合法记录往返幂等，UI只显示已知痕迹、处理方向和玩家自身状态', () => {
    const state = wantedDockState();
    expect(investigateIdentityTrace(state, 'docks').outcome).toBe('passed');
    expect(resolveIdentityTrace(state, 'docks').outcome).toBe('passed');
    state.items.plain_disguise_kit = 1;
    expect(prepareIdentityCover(state).outcome).toBe('passed');
    saveGame(state);
    const first = loadGame()!;
    saveGame(first);
    const second = loadGame()!;
    expect(second.identityTraceDiscoveries).toEqual(first.identityTraceDiscoveries);
    expect(second.identityTraceResolutions).toEqual(first.identityTraceResolutions);
    expect(second.identityCover).toEqual(first.identityCover);
    expect(second.areaSuspicion).toEqual(first.areaSuspicion);
    expect(appSource).toContain('data-identity-exposure-panel');
    expect(appSource).toContain('具体来源必须通过调查确认');
    expect(appSource).not.toContain('敌人命中');
    expect(appSource).not.toContain('identity:resolved');
  });
});
