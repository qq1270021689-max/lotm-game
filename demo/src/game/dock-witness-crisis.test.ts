import { beforeEach, describe, expect, it, vi } from 'vitest';
import appSource from '../App.tsx?raw';
import { getCaseJournalEntries } from './case-journal';
import {
  acquaint,
  acquireClue,
  attemptEncounterEscape,
  engageDockEncounter,
  getDockEncounterAftermathView,
  getDockOldYardView,
  getDockTransferFollowupView,
  getDockWitnessCrisisView,
  getDockWitnessFollowupView,
  getDockGrayHatOperationView,
  getDockCaseDispositions,
  getExplorationCheckPublicResult,
  getInventoryEntries,
  inspectItemWithSpiritVision,
  isLocationUnlocked,
  itemPresentation,
  loadGame,
  newGame,
  performDockCombatExchange,
  performDivination,
  resolveDockEncounterAftermath,
  resolveDockOldYardAction,
  resolveDockTransferFollowup,
  resolveEncounterCombat,
  resolveDockWitnessCrisis,
  resolveDockWitnessFollowup,
  resolveDockGrayHatOperation,
  saveGame,
  testInvestigationHypothesis,
  toggleInvestigationEvidence,
} from './engine';
import type { GameState } from './types';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  vi.stubGlobal('localStorage', new MemoryStorage());
});

function crisisReady(): GameState {
  const state = newGame('夜班口信测试者', 'clerk', []);
  state.stats.energy = 100;
  state.stats.mnd = 24;
  acquaint(state, 'mike', 10);
  acquireClue(state, 'dock_missing_reports');
  acquireClue(state, 'dock_manifest_discrepancy');
  toggleInvestigationEvidence(state, 'dock_manifest', 'dock_missing_reports');
  toggleInvestigationEvidence(state, 'dock_manifest', 'dock_manifest_discrepancy');
  expect(testInvestigationHypothesis(state, 'dock_transfer_window', 'compare_records')).toMatchObject({ ok: true });
  return state;
}

const stayAt = (state: GameState, locationId: string, hour: number) => {
  state.hour = hour;
  state.currentLocation = {
    locationId, arrivedDay: state.day, arrivedHour: hour,
    travelMode: 'walk', returnHours: 1, returnPrepaid: true,
  };
};

describe('码头案夜班知情人危机', () => {
  it('可靠判断后才出现三种处理路线，并把当前地点条件写清楚', () => {
    const state = crisisReady();
    const view = getDockWitnessCrisisView(state);
    expect(view).toMatchObject({ phase: 'choice', title: '夜班口信' });
    expect(view?.choices.map(choice => choice.id)).toEqual(['warn_worker', 'shadow_watcher', 'request_protection']);
    expect(view?.choices.find(choice => choice.id === 'warn_worker')?.issue).toMatch(/醉水手/);
    expect(view?.choices.find(choice => choice.id === 'shadow_watcher')?.issue).toMatch(/东区码头/);
    expect(view?.choices.find(choice => choice.id === 'request_protection')?.issue).toMatch(/正式门路/);
    expect(getCaseJournalEntries(state).find(entry => entry.id === 'dock_manifest')).toMatchObject({
      statusLabel: '知情人可能正被盯上',
      currentQuestion: expect.stringMatching(/保住知情人|跟住/),
    });
  });

  it('托麦克提醒会保住证词，但提高案件威胁并锁定选择', () => {
    const state = crisisReady();
    stayAt(state, 'tavern', 18);
    expect(resolveDockWitnessCrisis(state, 'warn_worker')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(state.clues.map(clue => clue.id)).toContain('dock_witness_warned');
    expect(state.caseThreats.dock_manifest_cleaner.attention).toBeGreaterThan(0);
    expect(getDockWitnessCrisisView(state)).toMatchObject({ phase: 'resolved', narrative: expect.stringMatching(/口信|藏/) });
    expect(resolveDockWitnessCrisis(state, 'shadow_watcher')).toMatchObject({ ok: false });
  });

  it('暗中守候由属性、技能、线索和梳理所得共同决定，失败也推进案件', () => {
    const failed = crisisReady();
    stayAt(failed, 'docks', 22);
    const publicResult = getExplorationCheckPublicResult(failed, 'dock_witness_crisis_shadow');
    expect(publicResult).toMatchObject({ eligible: true, outcome: 'blocked' });
    expect(publicResult.helpedBy).toEqual(expect.arrayContaining(['临场判断', '交接空档记录', '已经对上的交接时间']));
    expect(resolveDockWitnessCrisis(failed, 'shadow_watcher')).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(failed.clues.map(clue => clue.id)).toContain('dock_witness_disappeared');
    expect(getCaseJournalEntries(failed).find(entry => entry.id === 'dock_manifest')?.currentQuestion).toMatch(/失踪前/);

    const passed = crisisReady();
    passed.skills.sneak = 1;
    stayAt(passed, 'docks', 22);
    expect(resolveDockWitnessCrisis(passed, 'shadow_watcher')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(passed.clues.map(clue => clue.id)).toContain('dock_watcher_route');
  });

  it('正式保护只接受已建立的正式路线，并留下可追溯回条', () => {
    const state = crisisReady();
    state.organizationRoutes.nightwatch.status = 'contacted';
    stayAt(state, 'blackthorn_security', 11);
    expect(resolveDockWitnessCrisis(state, 'request_protection')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(state.clues).toContainEqual(expect.objectContaining({
      id: 'dock_witness_protected', sourceKind: 'location', sourceId: 'blackthorn_security',
    }));
  });

  it('重载只保留带统一检定回执的危机结果，界面不暴露内部数值', () => {
    const valid = crisisReady();
    stayAt(valid, 'tavern', 18);
    resolveDockWitnessCrisis(valid, 'warn_worker');
    saveGame(valid);
    expect(loadGame()!.clues.map(clue => clue.id)).toContain('dock_witness_warned');

    const forged = crisisReady();
    acquireClue(forged, 'dock_witness_warned', 'npc', 'mike');
    saveGame(forged);
    expect(loadGame()!.clues.map(clue => clue.id)).not.toContain('dock_witness_warned');

    expect(appSource).toContain('data-dock-witness-crisis');
    expect(appSource).toContain('已有助力：');
    expect(appSource).not.toContain('shadowResult.score');
    expect(appSource).not.toContain('shadowResult.difficulty');
  });
});

describe('码头案口信之后', () => {
  it('提醒知情人后必须通过麦克安排会面，成功与受挫留下不同记录', () => {
    const blocked = crisisReady();
    stayAt(blocked, 'tavern', 18);
    resolveDockWitnessCrisis(blocked, 'warn_worker');
    expect(getDockWitnessFollowupView(blocked)).toMatchObject({
      phase: 'action', title: '藏起来的知情人', action: { route: 'warned_witness' },
    });
    expect(resolveDockWitnessFollowup(blocked)).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(blocked.clues.map(clue => clue.id)).toContain('dock_witness_fragment');

    const passed = crisisReady();
    passed.stats.cha = 40;
    stayAt(passed, 'tavern', 18);
    resolveDockWitnessCrisis(passed, 'warn_worker');
    expect(resolveDockWitnessFollowup(passed)).toMatchObject({ ok: true, outcome: 'passed' });
    expect(passed.clues.map(clue => clue.id)).toContain('dock_witness_statement');
  });

  it('跟踪成功会解锁运河仓区，第二幕检定仍可识破或只发现诱饵', () => {
    const state = crisisReady();
    state.skills.sneak = 1;
    stayAt(state, 'docks', 22);
    resolveDockWitnessCrisis(state, 'shadow_watcher');
    expect(getDockWitnessFollowupView(state)).toMatchObject({
      phase: 'action', title: '通向运河仓区的路线',
      action: { issue: expect.stringMatching(/运河仓库/) },
    });
    stayAt(state, 'canal', 22);
    expect(resolveDockWitnessFollowup(state)).toMatchObject({ ok: true, outcome: 'passed' });
    expect(state.clues.map(clue => clue.id)).toContain('dock_transfer_watch_record');

    const decoy = crisisReady();
    decoy.skills.sneak = 1;
    stayAt(decoy, 'docks', 22);
    resolveDockWitnessCrisis(decoy, 'shadow_watcher');
    decoy.stats.mnd = 5;
    stayAt(decoy, 'canal', 22);
    expect(resolveDockWitnessFollowup(decoy)).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(decoy.clues.map(clue => clue.id)).toContain('dock_transfer_decoy');
  });

  it('知情人失踪后从普通工棚记录继续追查，受挫仍能形成下一步事实', () => {
    const state = crisisReady();
    stayAt(state, 'docks', 22);
    resolveDockWitnessCrisis(state, 'shadow_watcher');
    state.stats.mnd = 5;
    stayAt(state, 'docks', 10);
    expect(getDockWitnessFollowupView(state)).toMatchObject({
      phase: 'action', title: '空铺留下的东西', action: { issue: null },
    });
    expect(resolveDockWitnessFollowup(state)).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(state.clues.map(clue => clue.id)).toContain('dock_witness_last_errand');
    expect(getDockWitnessFollowupView(state)).toMatchObject({ phase: 'resolved' });

    acquireClue(state, 'dock_seq9_conclusion', 'location', 'dock_seq9_synthesis_seer');
    expect(getDockCaseDispositions(state)).toEqual([]);
    expect(getDockGrayHatOperationView(state)).toMatchObject({ phase: 'choice' });
  });

  it('正式保护路线只能申请有限核验，不会把完整封存档案直接交给玩家', () => {
    const state = crisisReady();
    state.organizationRoutes.nightwatch.status = 'contacted';
    stayAt(state, 'blackthorn_security', 11);
    resolveDockWitnessCrisis(state, 'request_protection');
    expect(getDockWitnessFollowupView(state)).toMatchObject({
      phase: 'action', title: '被封存的陈述', action: { route: 'protected_witness' },
    });
    expect(resolveDockWitnessFollowup(state)).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(state.clues.map(clue => clue.id)).toContain('dock_official_case_summary');
    expect(state.clues.map(clue => clue.id)).not.toContain('dock_sealed_statement_excerpt');
  });

  it('重载拒绝没有对应检定回执的第二幕事实，界面只展示定性助力', () => {
    const valid = crisisReady();
    valid.stats.cha = 40;
    stayAt(valid, 'tavern', 18);
    resolveDockWitnessCrisis(valid, 'warn_worker');
    resolveDockWitnessFollowup(valid);
    saveGame(valid);
    expect(loadGame()!.clues.map(clue => clue.id)).toContain('dock_witness_statement');

    const forged = crisisReady();
    stayAt(forged, 'tavern', 18);
    resolveDockWitnessCrisis(forged, 'warn_worker');
    acquireClue(forged, 'dock_witness_statement', 'npc', 'mike');
    saveGame(forged);
    expect(loadGame()!.clues.map(clue => clue.id)).not.toContain('dock_witness_statement');

    expect(appSource).toContain('data-dock-witness-followup');
    expect(appSource).toContain('followup.action.helpedBy');
    expect(appSource).not.toContain('followup.action.score');
    expect(appSource).not.toContain('followup.action.difficulty');
  });
});

function grayHatReady(): GameState {
  const state = crisisReady();
  state.stats.cha = 40;
  stayAt(state, 'tavern', 18);
  resolveDockWitnessCrisis(state, 'warn_worker');
  resolveDockWitnessFollowup(state);
  return state;
}

describe('码头案灰帽接头人行动', () => {
  it('第二幕事实汇入三种互斥方案，但仍不提前揭露真实身份', () => {
    const state = grayHatReady();
    const view = getDockGrayHatOperationView(state);
    expect(view).toMatchObject({ phase: 'choice', title: '灰帽人的位置' });
    expect(view?.choices.map(choice => choice.id)).toEqual(['observe_exchange', 'bait_manifest', 'joint_watch']);
    expect(view?.choices.find(choice => choice.id === 'observe_exchange')?.issue).toMatch(/运河仓区/);
    expect(view?.choices.find(choice => choice.id === 'bait_manifest')?.issue).toMatch(/旧仓单/);
    expect(view?.choices.find(choice => choice.id === 'joint_watch')?.issue).toMatch(/正式门路/);
    expect(JSON.stringify(view)).not.toMatch(/真实姓名是|所属组织是|幕后主使是/);
    expect(getCaseJournalEntries(state).find(entry => entry.id === 'dock_manifest')).toMatchObject({
      statusLabel: '灰帽接头人已经成为唯一活线',
    });
  });

  it('继续监视会按属性、技能和既有事实形成完整规律或废弃路线', () => {
    const passed = grayHatReady();
    passed.stats.mnd = 50;
    stayAt(passed, 'canal', 22);
    expect(resolveDockGrayHatOperation(passed, 'observe_exchange')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(passed.clues.map(clue => clue.id)).toContain('dock_gray_hat_exchange_pattern');
    expect(getDockGrayHatOperationView(passed)).toMatchObject({ phase: 'resolved' });

    const blocked = grayHatReady();
    blocked.stats.mnd = 5;
    stayAt(blocked, 'canal', 22);
    expect(resolveDockGrayHatOperation(blocked, 'observe_exchange')).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(blocked.clues.map(clue => clue.id)).toContain('dock_gray_hat_abandoned_route');
  });

  it('假仓单设局失败会暴露调查，并通过现有威胁系统立即引发遭遇', () => {
    const state = grayHatReady();
    acquireClue(state, 'dock_marked_manifest');
    state.stats.mnd = 5;
    stayAt(state, 'docks', 22);
    expect(resolveDockGrayHatOperation(state, 'bait_manifest')).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(state.clues.map(clue => clue.id)).toContain('dock_gray_hat_trap_exposed');
    expect(state.pendingEncounter).toMatchObject({
      sourceKind: 'case_choice', sourceId: 'gray_hat_operation:bait_manifest', phase: 'escape_choice',
    });
  });

  it('正式联合盯守只确认灰帽人的职责，完成后才重新开放案件处置', () => {
    const state = grayHatReady();
    state.organizationRoutes.nightwatch.status = 'contacted';
    state.stats.cha = 50;
    stayAt(state, 'blackthorn_security', 11);
    expect(resolveDockGrayHatOperation(state, 'joint_watch')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(state.clues.map(clue => clue.id)).toContain('dock_gray_hat_joint_watch');
    expect(getDockGrayHatOperationView(state)?.narrative).toMatch(/中间人|真实姓名/);

    acquireClue(state, 'dock_seq9_conclusion', 'location', 'dock_seq9_synthesis_seer');
    stayAt(state, 'docks', 10);
    expect(getDockCaseDispositions(state).map(disposition => disposition.id)).toContain('public_report');
  });

  it('第三幕结果必须有统一检定回执，界面不显示内部数值', () => {
    const valid = grayHatReady();
    valid.stats.mnd = 50;
    stayAt(valid, 'canal', 22);
    resolveDockGrayHatOperation(valid, 'observe_exchange');
    saveGame(valid);
    expect(loadGame()!.clues.map(clue => clue.id)).toContain('dock_gray_hat_exchange_pattern');

    const forged = grayHatReady();
    acquireClue(forged, 'dock_gray_hat_exchange_pattern', 'location', 'canal');
    saveGame(forged);
    expect(loadGame()!.clues.map(clue => clue.id)).not.toContain('dock_gray_hat_exchange_pattern');

    expect(appSource).toContain('data-dock-gray-hat-operation');
    expect(appSource).toContain('choice.helpedBy');
    expect(appSource).not.toContain('choice.score');
    expect(appSource).not.toContain('choice.difficulty');
  });
});

function grayHatEncounterReady(): GameState {
  const state = grayHatReady();
  acquireClue(state, 'dock_marked_manifest');
  state.stats.mnd = 5;
  stayAt(state, 'docks', 22);
  expect(resolveDockGrayHatOperation(state, 'bait_manifest')).toMatchObject({ ok: true, outcome: 'blocked' });
  expect(state.pendingEncounter).toMatchObject({ phase: 'escape_choice' });
  return state;
}

describe('码头案灰帽人遭遇之后', () => {
  it('成功脱身会留下即时路线回忆，并可复盘出下一处方向', () => {
    const state = grayHatEncounterReady();
    state.stats.phy = 80;
    state.skills.sneak = 8;
    expect(attemptEncounterEscape(state)).toMatchObject({ ok: true, outcome: 'passed' });
    expect(state.clues.map(clue => clue.id)).toContain('dock_gray_hat_escape_recollection');
    expect(getDockEncounterAftermathView(state)).toMatchObject({
      phase: 'choice',
      choices: expect.arrayContaining([expect.objectContaining({ id: 'trace_retreat', issue: null })]),
    });

    state.stats.mnd = 80;
    state.skills.investigate = 8;
    expect(resolveDockEncounterAftermath(state, 'trace_retreat')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(state.clues.map(clue => clue.id)).toContain('dock_gray_hat_retreat_route');
    expect(getDockEncounterAftermathView(state)).toMatchObject({ phase: 'resolved' });
  });

  it('复盘能力不足不会捏造地址，而是留下追索中断的边界', () => {
    const state = grayHatEncounterReady();
    state.stats.phy = 80;
    state.skills.sneak = 8;
    expect(attemptEncounterEscape(state).ok).toBe(true);
    state.stats.mnd = 0;
    state.skills.investigate = 0;
    state.skills.sneak = 0;
    expect(resolveDockEncounterAftermath(state, 'trace_retreat')).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(state.clues.map(clue => clue.id)).toContain('dock_gray_hat_trail_lost');
    expect(getDockEncounterAftermathView(state)?.narrative).toMatch(/无法继续确认|猜测/);
  });

  it('正面取胜只取得遗落凭证，正式移交必须亲自前往黑荆棘安保公司', () => {
    const state = grayHatEncounterReady();
    state.stats.phy = 100;
    state.skills.combat = 10;
    state.items.revolver = 1;
    state.items.revolver_ammo = 12;
    state.combatLoadout.weaponId = 'revolver';
    state.combatVitals.hp = 999;
    state.combatVitals.spirit = 999;
    expect(engageDockEncounter(state, 'physical').ok).toBe(true);
    expect(performDockCombatExchange(state, 'physical')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(resolveEncounterCombat(state, 'physical')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(state.clues.map(clue => clue.id)).toContain('dock_gray_hat_dropped_token');
    expect(getDockEncounterAftermathView(state)?.choices.find(choice => choice.id === 'handoff_token')?.issue).toMatch(/可靠门路/);

    state.organizationRoutes.nightwatch.status = 'contacted';
    stayAt(state, 'blackthorn_security', 11);
    expect(resolveDockEncounterAftermath(state, 'handoff_token')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(state.clues).toContainEqual(expect.objectContaining({
      id: 'dock_gray_hat_token_handoff', sourceKind: 'location', sourceId: 'blackthorn_security',
    }));
  });

  it('遭遇所得未处理时不能草率结案，主动封存证物后才解除阻挡', () => {
    const state = grayHatEncounterReady();
    state.stats.phy = 80;
    state.skills.sneak = 8;
    expect(attemptEncounterEscape(state).ok).toBe(true);
    acquireClue(state, 'dock_seq9_conclusion', 'location', 'dock_seq9_synthesis_seer');
    expect(getDockCaseDispositions(state)).toEqual([]);
    expect(resolveDockEncounterAftermath(state, 'preserve_evidence')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(state.clues.map(clue => clue.id)).toContain('dock_gray_hat_evidence_preserved');
    stayAt(state, 'docks', 10);
    expect(getDockCaseDispositions(state).length).toBeGreaterThan(0);
  });

  it('重载拒绝没有遭遇或检定回执支撑的战后事实，界面不暴露内部数值', () => {
    const valid = grayHatEncounterReady();
    valid.stats.phy = 80;
    valid.skills.sneak = 8;
    attemptEncounterEscape(valid);
    resolveDockEncounterAftermath(valid, 'preserve_evidence');
    saveGame(valid);
    expect(loadGame()!.clues.map(clue => clue.id)).toEqual(expect.arrayContaining([
      'dock_gray_hat_escape_recollection', 'dock_gray_hat_evidence_preserved',
    ]));

    const forged = grayHatReady();
    acquireClue(forged, 'dock_gray_hat_dropped_token', 'event', 'encounter:dock_manifest_cleaner');
    acquireClue(forged, 'dock_gray_hat_token_handoff', 'location', 'blackthorn_security');
    saveGame(forged);
    expect(loadGame()!.clues.map(clue => clue.id)).not.toEqual(expect.arrayContaining([
      'dock_gray_hat_dropped_token', 'dock_gray_hat_token_handoff',
    ]));

    expect(appSource).toContain('data-dock-encounter-aftermath');
    expect(appSource).toContain('data-dock-aftermath-choice');
    expect(appSource).not.toContain('aftermath.score');
    expect(appSource).not.toContain('aftermath.difficulty');
  });
});

function oldYardReady(): GameState {
  const state = grayHatEncounterReady();
  state.stats.phy = 80;
  state.skills.sneak = 8;
  expect(attemptEncounterEscape(state)).toMatchObject({ ok: true, outcome: 'passed' });
  state.stats.mnd = 80;
  state.skills.investigate = 8;
  expect(resolveDockEncounterAftermath(state, 'trace_retreat')).toMatchObject({ ok: true, outcome: 'passed' });
  return state;
}

describe('码头案运河下游旧装卸区', () => {
  it('地点不会提前出现，只有可靠撤退路线才能解锁', () => {
    const hidden = grayHatReady();
    expect(isLocationUnlocked(hidden, 'old_loading_yard')).toBe(false);
    expect(getCaseJournalEntries(hidden).find(entry => entry.id === 'dock_manifest')?.unlockedLocations
      .map(location => location.locationId)).not.toContain('old_loading_yard');

    const state = oldYardReady();
    expect(isLocationUnlocked(state, 'old_loading_yard')).toBe(true);
    expect(getCaseJournalEntries(state).find(entry => entry.id === 'dock_manifest')).toMatchObject({
      statusLabel: expect.stringMatching(/旧装卸区/),
      currentQuestion: expect.stringMatching(/夜间转运|废弃场地/),
    });
    expect(getCaseJournalEntries(state).find(entry => entry.id === 'dock_manifest')?.unlockedLocations
      .map(location => location.locationId)).toContain('old_loading_yard');
  });

  it('必须先完成外围踩点与熟人引见，才能进行夜间守候', () => {
    const state = oldYardReady();
    stayAt(state, 'old_loading_yard', 10);
    expect(getDockOldYardView(state)?.actions.find(action => action.id === 'watch_night_transfer')?.issue).toMatch(/观察位置/);

    expect(resolveDockOldYardAction(state, 'survey_perimeter')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(state.clues.map(clue => clue.id)).toContain('dock_old_yard_perimeter_map');
    expect(resolveDockOldYardAction(state, 'question_porters')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(state.clues).toContainEqual(expect.objectContaining({
      id: 'dock_old_yard_porter_schedule', sourceKind: 'npc', sourceId: 'old_yard_porter',
    }));

    stayAt(state, 'old_loading_yard', 22);
    expect(getDockOldYardView(state)?.actions.find(action => action.id === 'watch_night_transfer')?.issue).toBeNull();
    expect(resolveDockOldYardAction(state, 'watch_night_transfer')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(state.clues.map(clue => clue.id)).toContain('dock_old_yard_night_transfer');
    expect(getDockOldYardView(state)).toMatchObject({ phase: 'resolved', narrative: expect.stringMatching(/没有编号|固定据点/) });
  });

  it('能力不足时只确认灯号提前熄灭，不会凭空写出货车和幕后组织', () => {
    const state = oldYardReady();
    stayAt(state, 'old_loading_yard', 10);
    expect(resolveDockOldYardAction(state, 'survey_perimeter').ok).toBe(true);
    state.stats.cha = 80;
    state.skills.speech = 8;
    expect(resolveDockOldYardAction(state, 'question_porters').ok).toBe(true);
    state.stats.mnd = 0;
    state.skills.investigate = 0;
    state.skills.sneak = 0;
    stayAt(state, 'old_loading_yard', 22);
    expect(resolveDockOldYardAction(state, 'watch_night_transfer')).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(state.clues.map(clue => clue.id)).toContain('dock_old_yard_watch_disturbed');
    expect(getDockOldYardView(state)?.narrative).toMatch(/无法把未出现的货车写进结论/);
    expect(JSON.stringify(getDockOldYardView(state))).not.toMatch(/真实身份|所属组织|幕后组织/);
  });

  it('选择追查旧装卸区后，完成夜间守候仍需处理出现的篷车', () => {
    const state = oldYardReady();
    acquireClue(state, 'dock_seq9_conclusion', 'location', 'dock_seq9_synthesis_seer');
    stayAt(state, 'docks', 10);
    expect(getDockCaseDispositions(state)).toEqual([]);

    stayAt(state, 'old_loading_yard', 10);
    resolveDockOldYardAction(state, 'survey_perimeter');
    resolveDockOldYardAction(state, 'question_porters');
    stayAt(state, 'old_loading_yard', 22);
    resolveDockOldYardAction(state, 'watch_night_transfer');
    stayAt(state, 'docks', 10);
    expect(getDockCaseDispositions(state)).toEqual([]);
    expect(getDockTransferFollowupView(state)).toMatchObject({ phase: 'choice' });
  });

  it('重载只保留带检定回执和合法入口的地点事实，界面不显示内部数值', () => {
    const valid = oldYardReady();
    stayAt(valid, 'old_loading_yard', 10);
    resolveDockOldYardAction(valid, 'survey_perimeter');
    resolveDockOldYardAction(valid, 'question_porters');
    stayAt(valid, 'old_loading_yard', 22);
    resolveDockOldYardAction(valid, 'watch_night_transfer');
    saveGame(valid);
    expect(loadGame()!.clues.map(clue => clue.id)).toEqual(expect.arrayContaining([
      'dock_gray_hat_retreat_route', 'dock_old_yard_perimeter_map',
      'dock_old_yard_porter_schedule', 'dock_old_yard_night_transfer',
    ]));

    const forged = grayHatReady();
    acquireClue(forged, 'dock_gray_hat_retreat_route', 'event', 'dock_encounter_aftermath:trace_retreat');
    acquireClue(forged, 'dock_old_yard_night_transfer', 'location', 'old_loading_yard');
    saveGame(forged);
    expect(loadGame()!.clues.map(clue => clue.id)).not.toEqual(expect.arrayContaining([
      'dock_gray_hat_retreat_route', 'dock_old_yard_night_transfer',
    ]));

    expect(appSource).toContain('data-dock-old-yard');
    expect(appSource).toContain('data-dock-old-yard-action');
    expect(appSource).not.toContain('oldYard.score');
    expect(appSource).not.toContain('oldYard.difficulty');
  });
});

function nightTransferReady(): GameState {
  const state = oldYardReady();
  stayAt(state, 'old_loading_yard', 10);
  expect(resolveDockOldYardAction(state, 'survey_perimeter').ok).toBe(true);
  state.stats.cha = 80;
  state.skills.speech = 8;
  expect(resolveDockOldYardAction(state, 'question_porters').ok).toBe(true);
  stayAt(state, 'old_loading_yard', 22);
  expect(resolveDockOldYardAction(state, 'watch_night_transfer')).toMatchObject({ ok: true, outcome: 'passed' });
  return state;
}

describe('码头案无编号篷车后续', () => {
  it('三条路线分别要求真实地点与正式门路，选择后互相关闭', () => {
    const state = nightTransferReady();
    const view = getDockTransferFollowupView(state);
    expect(view).toMatchObject({ phase: 'choice', title: '无编号篷车' });
    expect(view?.choices.map(choice => choice.id)).toEqual(['tail_wagon', 'inspect_crate', 'request_interception']);
    expect(view?.choices.find(choice => choice.id === 'tail_wagon')?.issue).toBeNull();
    expect(view?.choices.find(choice => choice.id === 'request_interception')?.issue).toMatch(/正式门路/);

    state.stats.mnd = 100;
    state.skills.sneak = 10;
    expect(resolveDockTransferFollowup(state, 'tail_wagon')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(resolveDockTransferFollowup(state, 'inspect_crate')).toMatchObject({ ok: false });
    expect(getDockTransferFollowupView(state)).toMatchObject({ phase: 'resolved' });
  });

  it('跟车成功解锁河湾煤栈，失败只保留桥区最后位置', () => {
    const passed = nightTransferReady();
    passed.stats.mnd = 100;
    passed.skills.sneak = 10;
    expect(resolveDockTransferFollowup(passed, 'tail_wagon')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(passed.clues.map(clue => clue.id)).toContain('dock_wagon_coal_yard_route');
    expect(isLocationUnlocked(passed, 'riverside_coal_yard')).toBe(true);

    const blocked = nightTransferReady();
    blocked.stats.mnd = 0;
    blocked.skills.investigate = 0;
    blocked.skills.sneak = 0;
    expect(resolveDockTransferFollowup(blocked, 'tail_wagon')).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(blocked.clues.map(clue => clue.id)).toContain('dock_wagon_lost_at_bridge');
    expect(isLocationUnlocked(blocked, 'riverside_coal_yard')).toBe(false);
  });

  it('检查封箱取得固定铅封物品，并支持灵视与专属占卜线索', () => {
    const state = nightTransferReady();
    state.stats.mnd = 100;
    state.skills.investigate = 10;
    expect(resolveDockTransferFollowup(state, 'inspect_crate')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(state.clues.map(clue => clue.id)).toContain('dock_crate_tar_seal');
    expect(state.items.tarred_cargo_seal).toBe(1);

    state.currentLocation = null;
    state.pathwayId = 'seer';
    state.sequence = 9;
    state.stats.energy = 100;
    state.stats.spi = 100;
    state.skills.occult = 10;
    state.divinationTraining = { cards: true, dream: true, media: ['symbol_cards'], teachers: ['formal_seer_training'] };
    state.divinationCredentials = [
      { kind: 'training', source: 'formal_seer_training', method: 'cards', day: state.day, hour: state.hour },
      { kind: 'training', source: 'formal_seer_training', method: 'dream', day: state.day, hour: state.hour },
    ];
    state.items.symbol_cards = 1;
    expect(getInventoryEntries(state).find(entry => entry.id === 'tarred_cargo_seal')?.actions).toMatchObject({
      spiritVision: true, divination: true,
    });
    expect(inspectItemWithSpiritVision(state, 'tarred_cargo_seal')).toMatchObject({ ok: true });
    expect(itemPresentation(state, 'tarred_cargo_seal')?.description).toMatch(/没有稳定的非凡残留/);
    expect(performDivination(state, 'item', 'tarred_cargo_seal', 'cards', 'self')).toMatchObject({ ok: true });
    expect(state.clues.map(clue => clue.id)).toContain('dock_tar_seal_coal_omen');
    expect(isLocationUnlocked(state, 'riverside_coal_yard')).toBe(true);
  });

  it('正式截查只产生有边界的机构记录，不自动获得地点或实物', () => {
    const state = nightTransferReady();
    state.organizationRoutes.nightwatch.status = 'contacted';
    state.stats.cha = 100;
    state.skills.speech = 10;
    stayAt(state, 'blackthorn_security', 11);
    expect(resolveDockTransferFollowup(state, 'request_interception')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(state.clues.map(clue => clue.id)).toContain('dock_official_interception_record');
    expect(state.items.tarred_cargo_seal ?? 0).toBe(0);
    expect(isLocationUnlocked(state, 'riverside_coal_yard')).toBe(false);
    expect(getDockTransferFollowupView(state)?.narrative).toMatch(/没有公开港务编号|幕后身份/);
  });

  it('篷车路线未处理时阻止结案，存档拒绝无回执的地点和实物', () => {
    const state = nightTransferReady();
    acquireClue(state, 'dock_seq9_conclusion', 'location', 'dock_seq9_synthesis_seer');
    stayAt(state, 'docks', 10);
    expect(getDockCaseDispositions(state)).toEqual([]);
    stayAt(state, 'old_loading_yard', 1);
    state.stats.mnd = 100;
    state.skills.sneak = 10;
    resolveDockTransferFollowup(state, 'tail_wagon');
    stayAt(state, 'docks', 10);
    expect(getDockCaseDispositions(state).map(disposition => disposition.id)).toContain('public_report');

    saveGame(state);
    expect(loadGame()!.clues.map(clue => clue.id)).toContain('dock_wagon_coal_yard_route');

    const forged = nightTransferReady();
    acquireClue(forged, 'dock_crate_tar_seal', 'location', 'old_loading_yard');
    forged.items.tarred_cargo_seal = 1;
    saveGame(forged);
    const cleaned = loadGame()!;
    expect(cleaned.clues.map(clue => clue.id)).not.toContain('dock_crate_tar_seal');
    expect(cleaned.items.tarred_cargo_seal).toBe(0);

    expect(appSource).toContain('data-dock-transfer-followup');
    expect(appSource).toContain('data-dock-transfer-choice');
    expect(appSource).not.toContain('transfer.score');
    expect(appSource).not.toContain('transfer.difficulty');
  });
});
