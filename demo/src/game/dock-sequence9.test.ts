import { beforeEach, describe, expect, it, vi } from 'vitest';
import appSource from '../App.tsx?raw';
import { DOCK_SEQUENCE9_ACTIONS, PATHWAYS } from './data';
import type { GameState, Pathway } from './types';
import {
  CURRENT_SCHEMA_VERSION,
  acquireClue,
  dockSequence9PathActionIssue,
  getDockSequence9Actions,
  hasClue,
  loadGame,
  newGame,
  performDockSequence9PathAction,
  resolveDockSequence9Case,
  resolveDockSequence9CaseIssue,
  saveGame,
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

function dockSequence9(pathwayId: string, hour = 12): GameState {
  const state = newGame('码头序列9测试者', 'clerk', []);
  state.pathwayId = pathwayId;
  state.sequence = 9;
  state.intel.push('dock_missing');
  state.visitedLocations.push('docks');
  state.currentLocation = {
    locationId: 'docks', arrivedDay: state.day, arrivedHour: hour,
    travelMode: 'walk', returnHours: 1, returnPrepaid: true,
  };
  state.hour = hour;
  state.stats.energy = 100;
  return state;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('码头序列9路径调查', () => {
  it('五途径只能执行自己的差异化行动，且行动不可重复刷取', () => {
    const results = new Set<string>();
    for (const pathway of PATHWAYS as readonly Pathway[]) {
      const state = dockSequence9(pathway.id, pathway.id === 'sleepless' ? 22 : 12);
      const action = DOCK_SEQUENCE9_ACTIONS.find(candidate => candidate.pathwayId === pathway.id)!;
      expect(getDockSequence9Actions(state).map(candidate => candidate.id)).toEqual([action.id]);
      const before = {
        hour: state.hour, energy: state.stats.energy, pence: state.pence,
        formulas: [...state.formulas], items: structuredClone(state.items), knowledge: [...state.knowledge],
      };
      expect(performDockSequence9PathAction(state, action.id)).toMatchObject({ ok: true });
      expect(hasClue(state, action.clueId)).toBe(true);
      expect(state.hour).toBe((before.hour + 2) % 24);
      expect(state.stats.energy).toBeLessThan(before.energy);
      expect(state.pence).toBeLessThanOrEqual(before.pence);
      expect(state.formulas).toEqual(before.formulas);
      expect(state.items).toEqual(before.items);
      expect(state.knowledge).toEqual(before.knowledge);
      results.add(action.result);

      const after = structuredClone(state);
      expect(performDockSequence9PathAction(state, action.id)).toMatchObject({ ok: false });
      expect(state).toEqual(after);
    }
    expect(results.size).toBe(PATHWAYS.length);
  });

  it('不眠者严格夜间守望，白天失败零状态', () => {
    const state = dockSequence9('sleepless', 12);
    const before = structuredClone(state);
    expect(dockSequence9PathActionIssue(state, 'dock_seq9_sleepless')).toMatch(/夜间/);
    expect(performDockSequence9PathAction(state, 'dock_seq9_sleepless')).toMatchObject({ ok: false });
    expect(state).toEqual(before);
    state.hour = 22;
    expect(performDockSequence9PathAction(state, 'dock_seq9_sleepless')).toMatchObject({ ok: true });
  });

  it('夜行天赋的精力门槛与实际扣除一致，路径行动和结案均接受折扣后的最低精力', () => {
    const state = dockSequence9('hunter', 20);
    state.talents.push('night_owl');
    state.stats.energy = 7;
    expect(dockSequence9PathActionIssue(state, 'dock_seq9_hunter')).toBeNull();
    state.stats.energy = 8;
    expect(performDockSequence9PathAction(state, 'dock_seq9_hunter')).toMatchObject({ ok: true });
    expect(state.stats.energy).toBe(1);

    state.stats.energy = 8;
    state.stats.phy = 30;
    state.skills.investigate = 10;
    expect(resolveDockSequence9CaseIssue(state)).toBeNull();
    state.stats.energy = 9;
    expect(resolveDockSequence9Case(state)).toMatchObject({ ok: true, outcome: 'passed' });
    expect(state.stats.energy).toBe(1);
  });

  it('凡人、序列8、未知途径、缺情报与错误地点都 fail-closed', () => {
    const cases = [
      (() => { const state = dockSequence9('seer'); state.sequence = null; state.pathwayId = null; return state; })(),
      (() => { const state = dockSequence9('seer'); state.sequence = 8; return state; })(),
      dockSequence9('unknown'),
      (() => { const state = dockSequence9('seer'); state.intel = state.intel.filter(id => id !== 'dock_missing'); return state; })(),
      (() => { const state = dockSequence9('seer'); state.currentLocation = null; return state; })(),
    ];
    for (const state of cases) {
      const before = structuredClone(state);
      expect(performDockSequence9PathAction(state, 'dock_seq9_seer')).toMatchObject({ ok: false });
      expect(state).toEqual(before);
    }
  });

  it('其他途径线索与极高能力都不能绕过本途径硬门槛', () => {
    const state = dockSequence9('hunter');
    state.stats.phy = 100;
    state.skills.investigate = 10;
    acquireClue(state, 'dock_seq9_seer_omen', 'location', 'dock_seq9_seer');
    const before = structuredClone(state);
    expect(resolveDockSequence9CaseIssue(state)).toMatch(/先完成当前途径/);
    expect(resolveDockSequence9Case(state)).toMatchObject({ ok: false });
    expect(state).toEqual(before);
  });
});

describe('码头序列9统一结案检定', () => {
  it('blocked 有固定代价与attempt；相同指纹重试零成本，相关输入变化后才可重试', () => {
    const state = dockSequence9('hunter');
    expect(performDockSequence9PathAction(state, 'dock_seq9_hunter')).toMatchObject({ ok: true });
    state.stats.phy = 1;
    state.skills.investigate = 0;
    const before = { hour: state.hour, energy: state.stats.energy, attempts: state.checkAttempts.length };
    expect(resolveDockSequence9Case(state)).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(state.hour).toBe((before.hour + 1) % 24);
    expect(state.stats.energy).toBeLessThan(before.energy);
    expect(state.checkAttempts).toHaveLength(before.attempts + 1);
    expect(hasClue(state, 'dock_seq9_conclusion')).toBe(false);

    const blocked = structuredClone(state);
    expect(resolveDockSequence9Case(state)).toMatchObject({ ok: false });
    expect(state).toEqual(blocked);

    acquireClue(state, 'dock_missing_reports');
    expect(resolveDockSequence9Case(state)).toMatchObject({ ok: true, outcome: 'blocked' });
    state.skills.investigate = 10;
    expect(resolveDockSequence9Case(state)).toMatchObject({ ok: true, outcome: 'passed' });
    expect(hasClue(state, 'dock_seq9_conclusion')).toBe(true);
  });

  it('五途径均可凭相关能力结案且只结算一次，不发钱、物品、配方或组织资格', () => {
    const conclusionTexts = new Set<string>();
    for (const pathway of PATHWAYS as readonly Pathway[]) {
      const state = dockSequence9(pathway.id, pathway.id === 'sleepless' ? 22 : 12);
      const action = getDockSequence9Actions(state)[0];
      expect(performDockSequence9PathAction(state, action.id)).toMatchObject({ ok: true });
      const input = abilityInput[pathway.id];
      state.stats[input.stat] = 20;
      state.skills[input.skill] = 10;
      const before = {
        pence: state.pence, items: structuredClone(state.items), formulas: [...state.formulas],
        routes: structuredClone(state.organizationRoutes), gameOver: state.gameOver,
      };
      expect(resolveDockSequence9Case(state)).toMatchObject({ ok: true, outcome: 'passed' });
      expect(state.clues.filter(clue => clue.id === 'dock_seq9_conclusion')).toHaveLength(1);
      expect(state.pence).toBeLessThanOrEqual(before.pence);
      expect(state.items).toEqual(before.items);
      expect(state.formulas).toEqual(before.formulas);
      expect(state.organizationRoutes).toEqual(before.routes);
      expect(state.gameOver).toBe(before.gameOver);
      conclusionTexts.add(state.log.at(-2)?.text ?? '');

      const after = structuredClone(state);
      expect(resolveDockSequence9Case(state)).toMatchObject({ ok: false });
      expect(state).toEqual(after);
    }
    expect(conclusionTexts.size).toBe(PATHWAYS.length);
  });

  it('v21存档保留路径与结案线索且二次读档幂等', () => {
    const state = dockSequence9('seer');
    expect(performDockSequence9PathAction(state, 'dock_seq9_seer')).toMatchObject({ ok: true });
    state.stats.spi = 30;
    state.skills.occult = 10;
    expect(resolveDockSequence9Case(state)).toMatchObject({ ok: true, outcome: 'passed' });
    saveGame(state);
    const loaded = loadGame()!;
    expect(loaded.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(hasClue(loaded, 'dock_seq9_seer_omen')).toBe(true);
    expect(hasClue(loaded, 'dock_seq9_conclusion')).toBe(true);
    expect(loaded.clues.filter(clue => clue.id === 'dock_seq9_conclusion')).toHaveLength(1);
    saveGame(loaded);
    expect(loadGame()).toEqual(loaded);
  });

  it('App只通过规则层显示码头序列9行动，不包含内部检定提示', () => {
    expect(appSource).toContain('data-dock-sequence9-case');
    expect(appSource).toContain('dockSequence9PathActionIssue(state');
    expect(appSource).toContain('resolveDockSequence9CaseIssue(state)');
    expect(appSource).toContain("loc.id === 'docks' && dockCaseKnown && state.sequence === 9");
    const section = appSource.split('data-dock-sequence9-case')[1]?.split('</section>')[0] ?? '';
    expect(section).not.toMatch(/difficulty|score|bonus|成功率|加成|属性\s*\d/i);
  });
});
