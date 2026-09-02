import { beforeEach, describe, expect, it, vi } from 'vitest';
import appSource from '../App.tsx?raw';
import { ITEMS, SEQUENCE9_COMBAT_SKILLS, SHOP_DEFS } from './data';
import {
  engageDockEncounter,
  equipCombatItem,
  getCombatEquipmentView,
  getCombatProfile,
  getCombatTechniqueViews,
  loadGame,
  newGame,
  performDockCombatTechnique,
  saveGame,
} from './engine';
import type { GameState } from './types';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
}

function asSequence9(pathwayId: string) {
  const state = newGame(pathwayId, 'clerk', []);
  state.pathwayId = pathwayId;
  state.sequence = 9;
  const profile = getCombatProfile(state);
  state.combatVitals = { hp: profile.maxHp, spirit: profile.maxSpirit };
  return state;
}

function addDockEncounter(state: GameState) {
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

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('v30 五途径序列9战斗差异', () => {
  it('五条途径各有一项不同的专属战技', () => {
    expect(SEQUENCE9_COMBAT_SKILLS.map(skill => skill.pathwayId).sort())
      .toEqual(['apprentice', 'hunter', 'seer', 'sleepless', 'spectator']);
    for (const skill of SEQUENCE9_COMBAT_SKILLS) {
      const state = asSequence9(skill.pathwayId);
      const techniques = getCombatTechniqueViews(state);
      expect(techniques.map(entry => entry.id)).toContain(`pathway:${skill.id}`);
      expect(techniques.filter(entry => entry.id.startsWith('pathway:'))).toHaveLength(1);
    }
  });

  it('途径分别强化生命、精神、攻防、暴击或闪避，而不是统一加成', () => {
    const mortal = getCombatProfile(newGame('凡人', 'clerk', []));
    const seer = getCombatProfile(asSequence9('seer'));
    const spectator = getCombatProfile(asSequence9('spectator'));
    const hunter = getCombatProfile(asSequence9('hunter'));
    const apprentice = getCombatProfile(asSequence9('apprentice'));
    expect(seer.maxSpirit).toBeGreaterThan(mortal.maxSpirit);
    expect(spectator.spiritualAttack).toBeGreaterThan(seer.spiritualAttack);
    expect(hunter.maxHp).toBeGreaterThan(mortal.maxHp);
    expect(hunter.physicalAttack).toBeGreaterThan(mortal.physicalAttack);
    expect(apprentice.dodge).toBeGreaterThan(mortal.dodge);
  });

  it('专属战技占用一轮、消耗精神并在本场冲突中标记为已使用', () => {
    const state = asSequence9('seer');
    addDockEncounter(state);
    expect(engageDockEncounter(state, 'physical').ok).toBe(true);
    const beforeSpirit = state.combatVitals.spirit;
    expect(performDockCombatTechnique(state, 'pathway:seer_danger_premonition')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(state.combatVitals.spirit).toBeLessThanOrEqual(beforeSpirit - 5);
    expect(state.pendingEncounter?.combatRound?.usedTechniqueIds).toContain('pathway:seer_danger_premonition');
    expect(getCombatTechniqueViews(state).find(entry => entry.id === 'pathway:seer_danger_premonition')).toMatchObject({ used: true });
  });
});

describe('v30 战斗物品', () => {
  it('同一武器槽只采用手动选择的一件武器，护具和灵性媒介可分别生效', () => {
    const state = asSequence9('seer');
    const base = getCombatProfile(state);
    state.items.reinforced_cane = 1;
    state.items.hunting_knife = 1;
    state.items.revolver = 1;
    state.items.revolver_ammo = 6;
    state.items.leather_coat = 1;
    state.items.silver_focus_mirror = 1;
    expect(equipCombatItem(state, 'reinforced_cane').ok).toBe(true);
    expect(equipCombatItem(state, 'hunting_knife').ok).toBe(true);
    expect(equipCombatItem(state, 'revolver').ok).toBe(true);
    expect(equipCombatItem(state, 'leather_coat').ok).toBe(true);
    expect(equipCombatItem(state, 'silver_focus_mirror').ok).toBe(true);
    const equipped = getCombatEquipmentView(state);
    expect(equipped.map(item => item.id)).toEqual(expect.arrayContaining(['revolver', 'leather_coat', 'silver_focus_mirror']));
    expect(equipped.map(item => item.id)).not.toEqual(expect.arrayContaining(['reinforced_cane', 'hunting_knife']));
    const profile = getCombatProfile(state);
    expect(profile.physicalAttack - base.physicalAttack).toBe(18);
    expect(profile.physicalDefense - base.physicalDefense).toBe(6);
    expect(profile.spiritualDefense - base.spiritualDefense).toBe(5);
  });

  it('一次性战术物品会进入交锋选项并在使用后消耗', () => {
    const state = newGame('物品战术', 'clerk', []);
    state.items.flash_powder = 1;
    addDockEncounter(state);
    expect(engageDockEncounter(state, 'physical').ok).toBe(true);
    expect(getCombatTechniqueViews(state).map(entry => entry.id)).toContain('item:flash_powder');
    expect(performDockCombatTechnique(state, 'item:flash_powder').ok).toBe(true);
    expect(state.items.flash_powder).toBe(0);
  });

  it('新增装备都有固定物品定义并进入普通商店，不会随机生成规则效果', () => {
    const ids = ['reinforced_cane', 'hunting_knife', 'leather_coat', 'silver_focus_mirror', 'flash_powder', 'warding_sachet'];
    expect(ids.every(id => ITEMS.some(item => item.id === id && item.combat))).toBe(true);
    const shop = SHOP_DEFS.find(def => def.id === 'market_general_store')!;
    expect(ids.every(id => shop.inventory.some(entry => entry.itemId === id))).toBe(true);
    expect(appSource).toContain('data-combat-technique');
    expect(appSource).toContain('data-combat-equipment');
  });

  it('v29战斗存档补空的已用战术列表并升级到v31', () => {
    const state = asSequence9('hunter');
    addDockEncounter(state);
    state.schemaVersion = 29;
    state.pendingEncounter!.phase = 'combat';
    state.pendingEncounter!.combatRound = {
      version: 1, round: 1, advantage: 0, initiated: false,
      finisherReady: false, lastAction: 'guard', criticalUsed: false,
      usedTechniqueIds: [],
    };
    delete (state.pendingEncounter!.combatRound as unknown as { usedTechniqueIds?: string[] }).usedTechniqueIds;
    saveGame(state);
    const loaded = loadGame()!;
    expect(loaded.schemaVersion).toBe(32);
    expect(loaded.pendingEncounter?.combatRound?.usedTechniqueIds).toEqual([]);
    saveGame(loaded);
    expect(loadGame()).toEqual(loaded);
  });
});
