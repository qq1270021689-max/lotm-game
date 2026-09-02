import { describe, expect, it } from 'vitest';
import appSource from '../App.tsx?raw';
import {
  dockCombatExchangeIssue,
  engageDockEncounter,
  getPendingEncounterView,
  newGame,
  performDockCombatExchange,
  resolveEncounterCombat,
} from './engine';

function dockEncounter() {
  const state = newGame('多回合测试者', 'clerk', []);
  state.hour = 10;
  state.stats.energy = 100;
  state.stats.phy = 20;
  state.skills.combat = 2;
  state.currentLocation = {
    locationId: 'docks', arrivedDay: 1, arrivedHour: 9,
    travelMode: 'walk', returnHours: 1, returnPrepaid: true,
  };
  state.caseThreats.dock_manifest_cleaner = {
    threatId: 'dock_manifest_cleaner', attention: 100, status: 'active', encounterCount: 1,
    noticedSourceIds: ['deep_dock_crate_trace'], shownSignalStages: [25, 50, 75],
  };
  state.pendingEncounter = {
    encounterId: 'encounter_dock_manifest_cleaner', threatId: 'dock_manifest_cleaner', phase: 'escape_choice',
    sourceKind: 'deep_investigation', sourceId: 'deep_dock_crate_trace', startedDay: 1, startedHour: 10,
    narrativeVariant: 0, preparations: [],
  };
  return state;
}

describe('v29 确定性多回合遭遇', () => {
  it('主动应战进入第一轮，不会一次点击直接清除遭遇', () => {
    const state = dockEncounter();
    const result = engageDockEncounter(state, 'physical');
    expect(result).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(state.pendingEncounter).toMatchObject({ phase: 'combat', combatRound: { round: 1, finisherReady: false, initiated: true } });
    expect(state.caseThreats.dock_manifest_cleaner.status).toBe('active');
    expect(getPendingEncounterView(state)?.combatRound).toMatchObject({ round: 1, finisherReady: false });
  });

  it('两轮交锋前禁止最终结算，完成后才开放处置', () => {
    const state = dockEncounter();
    engageDockEncounter(state, 'physical');
    expect(resolveEncounterCombat(state, 'physical')).toMatchObject({ ok: false, msg: expect.stringContaining('先完成') });
    expect(performDockCombatExchange(state, 'guard')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(state.pendingEncounter?.combatRound).toMatchObject({ round: 2, finisherReady: true, lastAction: 'guard' });
    expect(dockCombatExchangeIssue(state, 'physical')).toContain('最终处置');
    expect(resolveEncounterCombat(state, 'physical').ok).toBe(true);
  });

  it('防守行动使用防御与闪避降低当前轮伤害', () => {
    const guarded = dockEncounter();
    engageDockEncounter(guarded, 'physical');
    const attacking = structuredClone(guarded);
    const guardedBefore = guarded.combatVitals.hp;
    const attackingBefore = attacking.combatVitals.hp;
    performDockCombatExchange(guarded, 'guard');
    performDockCombatExchange(attacking, 'physical');
    expect(guardedBefore - guarded.combatVitals.hp).toBeLessThanOrEqual(attackingBefore - attacking.combatVitals.hp);
  });

  it('界面只显示交锋轮次与定性信号，不公开敌方生命和防御数值', () => {
    expect(appSource).toContain('data-combat-round-status');
    expect(appSource).toContain('交锋进度');
    expect(appSource).not.toContain('敌人生命');
    expect(appSource).not.toContain('敌方防御');
  });
});
