import { beforeEach, describe, expect, it, vi } from 'vitest';
import appSource from '../App.tsx?raw';
import {
  combatItemEquipStatus,
  engageDockEncounter,
  equipCombatItem,
  getCombatEquipmentView,
  getCombatProfile,
  getHuntEncounterView,
  getPendingEncounterView,
  loadGame,
  newGame,
  performDockCombatExchange,
  saveGame,
  unequipCombatSlot,
} from './engine';
import type { CombatRoundState, GameState } from './types';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
}

const round = (): CombatRoundState => ({
  version: 1, round: 0, advantage: 0, initiated: false, finisherReady: false,
  lastAction: null, criticalUsed: false, usedTechniqueIds: [],
});

function dockEncounter(state: GameState) {
  state.hour = 10;
  state.stats.energy = 100;
  state.currentLocation = { locationId: 'docks', arrivedDay: 1, arrivedHour: 9, travelMode: 'walk', returnHours: 1, returnPrepaid: true };
  state.caseThreats.dock_manifest_cleaner = {
    threatId: 'dock_manifest_cleaner', attention: 100, status: 'active', encounterCount: 1,
    noticedSourceIds: ['deep_dock_crate_trace'], shownSignalStages: [25, 50, 75],
  };
  state.pendingEncounter = {
    encounterId: 'encounter_dock_manifest_cleaner', threatId: 'dock_manifest_cleaner', phase: 'escape_choice',
    sourceKind: 'deep_investigation', sourceId: 'deep_dock_crate_trace', startedDay: 1, startedHour: 10,
    narrativeVariant: 0, preparations: [],
  };
}

beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()));

describe('v31 手动战斗装备与弹药', () => {
  it('在住处手动切换同槽武器，离家或进入冲突后不能瞬间换装', () => {
    const state = newGame('装备测试', 'clerk', []);
    state.items.reinforced_cane = 1;
    state.items.hunting_knife = 1;
    expect(equipCombatItem(state, 'reinforced_cane').ok).toBe(true);
    expect(combatItemEquipStatus(state, 'reinforced_cane')).toMatchObject({ equipped: true, slot: 'weapon' });
    expect(equipCombatItem(state, 'hunting_knife').ok).toBe(true);
    expect(state.combatLoadout).toMatchObject({ weaponId: 'hunting_knife' });
    dockEncounter(state);
    expect(equipCombatItem(state, 'reinforced_cane')).toMatchObject({ ok: false, msg: expect.stringContaining('冲突') });
    expect(unequipCombatSlot(state, 'weapon').ok).toBe(false);
  });

  it('左轮只有装备且存在弹药时提供加成，每次物理交锋消耗一发', () => {
    const state = newGame('弹药测试', 'clerk', []);
    const baseAttack = getCombatProfile(state).physicalAttack;
    state.items.revolver = 1;
    expect(equipCombatItem(state, 'revolver').ok).toBe(true);
    expect(getCombatProfile(state).physicalAttack).toBe(baseAttack);
    expect(getCombatEquipmentView(state)[0]).toMatchObject({ id: 'revolver', active: false, status: expect.stringContaining('没有弹药') });
    state.items.revolver_ammo = 2;
    expect(getCombatProfile(state).physicalAttack).toBe(baseAttack + 18);
    dockEncounter(state);
    expect(engageDockEncounter(state, 'physical').ok).toBe(true);
    expect(state.items.revolver_ammo).toBe(1);
    expect(performDockCombatExchange(state, 'physical').ok).toBe(true);
    expect(state.items.revolver_ammo).toBe(0);
    expect(getCombatProfile(state).physicalAttack).toBe(baseAttack);
  });

  it('v30旧档按原先规则选入最强装备，v31非法装备ID会被清理', () => {
    const legacy = newGame('旧装备', 'clerk', []);
    legacy.schemaVersion = 30;
    legacy.items.reinforced_cane = 1;
    legacy.items.hunting_knife = 1;
    legacy.items.leather_coat = 1;
    delete (legacy as Partial<GameState>).combatLoadout;
    saveGame(legacy);
    expect(loadGame()).toMatchObject({ schemaVersion: 32, combatLoadout: { weaponId: 'hunting_knife', armorId: 'leather_coat', focusId: null } });

    const forged = newGame('伪装备', 'clerk', []);
    forged.combatLoadout = { weaponId: 'antigonus_notebook', armorId: 'revolver', focusId: 'missing_item' };
    saveGame(forged);
    expect(loadGame()?.combatLoadout).toEqual({ weaponId: null, armorId: null, focusId: null });
  });
});

describe('v31 敌人战斗风格', () => {
  it('码头清场人与占卜货商显示不同的动作征兆，不泄露精确数值', () => {
    const dock = newGame('码头', 'clerk', []);
    dockEncounter(dock);
    dock.pendingEncounter!.phase = 'combat';
    dock.pendingEncounter!.combatRound = round();
    const dockIntent = getPendingEncounterView(dock)?.combatRound?.enemyIntent;

    const hunt = newGame('猎杀', 'clerk', []);
    hunt.activeHunt = {
      targetId: 'masked_fortune_smuggler', phase: 'combat', identityConfirmed: true,
      preparations: { routine: true, secludedMeeting: true, escapeRoute: true, ambush: true },
      suspicion: 2, confrontationCause: 'alerted', combatRound: round(),
    };
    const huntIntent = getHuntEncounterView(hunt)?.combatRound?.enemyIntent;
    expect(dockIntent).toBeTruthy();
    expect(huntIntent).toBeTruthy();
    expect(huntIntent).not.toBe(dockIntent);
    expect(`${dockIntent}${huntIntent}`).not.toMatch(/攻击\d|防御\d|难度\d|生命\d/);
  });

  it('同一敌人的第二轮会切换动作征兆，玩家可以据此调整行动', () => {
    const state = newGame('观察动作', 'clerk', []);
    dockEncounter(state);
    expect(engageDockEncounter(state, 'physical').ok).toBe(true);
    const secondIntent = getPendingEncounterView(state)?.combatRound?.enemyIntent;
    expect(secondIntent).toContain('声音');
    expect(appSource).toContain('data-enemy-intent');
    expect(appSource).toContain('动作征兆');
  });
});
