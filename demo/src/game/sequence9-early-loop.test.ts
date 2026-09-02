import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DIVINATION_CLUB_COMMISSIONS, EXPLORATION_CHECKS, NIGHTWATCH_ROUTINE_ACTIONS } from './data';
import type { GameState } from './types';
import {
  acceptDivinationClubCommission,
  acceptElliotCommission,
  acquireClue,
  allNPCs,
  confirmElliotPresence,
  getDivinationClubCommissions,
  hasClue,
  investigateActiveDivinationClubCommission,
  investigateActiveDivinationClubCommissionIssue,
  isActiveNightwatchSequence9Member,
  isLocationUnlocked,
  joinDivinationClub,
  leaveCurrentLocation,
  loadGame,
  locateElliot,
  newGame,
  performNightwatchRoutine,
  performTingenLandmarkAction,
  requestElliotBackup,
  rescueElliotWithTeam,
  resolveDivinationClubCommission,
  saveGame,
  settleElliotCase,
  travelToLocation,
} from './engine';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
}

const fresh = () => newGame('早期循环测试者', 'clerk', []);

function nightwatchSequence9(pathwayId: 'seer' | 'sleepless' = 'sleepless'): GameState {
  const state = fresh();
  state.pathwayId = pathwayId;
  state.sequence = 9;
  state.stats.energy = 100;
  Object.assign(state.organizationRoutes.nightwatch, {
    status: 'committed', routeStep: 'committed', selectedPathway: pathwayId,
  });
  Object.assign(state.pathwayLeads[pathwayId], {
    organizationId: 'nightwatch', commitment: true, currentSource: 'official', routeStep: 'completed',
  });
  return state;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('值夜者序列9轮值与训练', () => {
  it('三类定义分别提供轮值收入、组织声望或技能训练，且不授予超凡奖励', () => {
    expect(NIGHTWATCH_ROUTINE_ACTIONS.map(action => action.id)).toEqual(['archive_rotation', 'combat_drill', 'night_patrol']);
    expect(NIGHTWATCH_ROUTINE_ACTIONS.some(action => action.pay > 0)).toBe(true);
    expect(NIGHTWATCH_ROUTINE_ACTIONS.every(action => action.reputationGain > 0)).toBe(true);
    expect(NIGHTWATCH_ROUTINE_ACTIONS.some(action => action.trainingSkill)).toBe(true);

    const state = nightwatchSequence9();
    state.hour = 8;
    expect(travelToLocation(state, 'blackthorn_security', 'walk')).toMatchObject({ ok: true });
    const formulas = [...state.formulas];
    const knowledge = [...state.knowledge];
    const sequence8 = structuredClone(state.sequence8Progress);
    const startMoney = state.pence;

    expect(performNightwatchRoutine(state, 'archive_rotation')).toMatchObject({ ok: true });
    expect(state.pence - startMoney).toBe(36);
    expect(state.nightwatchEarlyLoop.reputation).toBe(1);
    const afterFirst = structuredClone(state);
    expect(performNightwatchRoutine(state, 'archive_rotation')).toMatchObject({ ok: false });
    expect(state).toEqual(afterFirst);

    for (const day of [2, 3, 4]) {
      state.day = day;
      state.hour = 10;
      state.stats.energy = 100;
      expect(performNightwatchRoutine(state, 'combat_drill')).toMatchObject({ ok: true });
    }
    expect(state.skills.combat).toBe(1);
    expect(state.formulas).toEqual(formulas);
    expect(state.knowledge).toEqual(knowledge);
    expect(state.sequence8Progress).toEqual(sequence8);
  });

  it('凡人、仅接触者和错误地点全部零状态；周轮值同周期不能重复', () => {
    const invalidStates = [fresh(), nightwatchSequence9()];
    invalidStates[1].organizationRoutes.nightwatch.status = 'contacted';
    for (const state of invalidStates) {
      const before = structuredClone(state);
      expect(performNightwatchRoutine(state, 'archive_rotation')).toMatchObject({ ok: false });
      expect(state).toEqual(before);
    }

    const member = nightwatchSequence9();
    expect(isActiveNightwatchSequence9Member(member)).toBe(true);
    member.day = 2;
    member.hour = 17;
    expect(travelToLocation(member, 'blackthorn_security', 'walk')).toMatchObject({ ok: true });
    expect(performNightwatchRoutine(member, 'night_patrol')).toMatchObject({ ok: true });
    member.day = 3;
    member.hour = 18;
    member.stats.energy = 100;
    const before = structuredClone(member);
    expect(performNightwatchRoutine(member, 'night_patrol')).toMatchObject({ ok: false });
    expect(member).toEqual(before);
  });

  it('伪造为值夜者承诺的非库存途径不能参加轮值或接正式外勤', () => {
    const forged = nightwatchSequence9();
    forged.pathwayId = 'hunter';
    forged.organizationRoutes.nightwatch.selectedPathway = 'hunter';
    Object.assign(forged.pathwayLeads.hunter, {
      organizationId: 'nightwatch', commitment: true, currentSource: 'official', routeStep: 'completed',
    });
    forged.hour = 8;
    forged.currentLocation = {
      locationId: 'blackthorn_security', arrivedDay: 1, arrivedHour: 8,
      travelMode: 'walk', returnHours: 1, returnPrepaid: true,
    };
    expect(isActiveNightwatchSequence9Member(forged)).toBe(false);
    const before = structuredClone(forged);
    expect(performNightwatchRoutine(forged, 'archive_rotation')).toMatchObject({ ok: false });
    expect(acceptElliotCommission(forged)).toMatchObject({ ok: false });
    expect(forged).toEqual(before);
  });
});

describe('占卜俱乐部固定委托', () => {
  function joinedClub() {
    const state = fresh();
    state.pathwayId = 'seer';
    state.sequence = 9;
    state.stats.energy = 100;
    state.pence = 500;
    acquireClue(state, 'tingen_honest_paper', 'archive', 'dewill_periodicals');
    acquireClue(state, 'tingen_city_directory', 'public_records', 'market_city_notice');
    acquireClue(state, 'tingen_church_directory', 'public_records', 'st_selena_notice');
    state.hour = 9;
    expect(travelToLocation(state, 'divination_club', 'walk')).toMatchObject({ ok: true });
    expect(performTingenLandmarkAction(state, 'divination_club_etiquette')).toMatchObject({ ok: true });
    expect(joinDivinationClub(state)).toMatchObject({ ok: true });
    return state;
  }

  function travelFromCurrent(state: GameState, locationId: string, hour = 8) {
    expect(leaveCurrentLocation(state)).toMatchObject({ ok: true });
    state.hour = hour;
    state.stats.energy = 100;
    expect(travelToLocation(state, locationId, 'walk')).toMatchObject({ ok: true });
  }

  function completeField(state: GameState, commissionId: 'lost_keepsake' | 'journey_omen' | 'recurring_nightmare') {
    const def = DIVINATION_CLUB_COMMISSIONS.find(candidate => candidate.id === commissionId)!;
    travelFromCurrent(state, def.fieldLocationId);
    state.stats.mnd = 50;
    state.stats.cha = 50;
    state.skills.investigate = 5;
    state.skills.speech = 5;
    expect(investigateActiveDivinationClubCommission(state)).toMatchObject({ ok: true, outcome: 'passed' });
    expect(hasClue(state, def.fieldClueId)).toBe(true);
    travelFromCurrent(state, 'divination_club', 9);
    state.stats.spi = 50;
    state.skills.occult = 5;
    expect(resolveDivinationClubCommission(state)).toMatchObject({ ok: true, outcome: 'passed' });
  }

  it('三份定义客户唯一、字段完整，并按前一份结清情况分层开放', () => {
    expect(DIVINATION_CLUB_COMMISSIONS).toHaveLength(3);
    expect(new Set(DIVINATION_CLUB_COMMISSIONS.map(commission => commission.clientId)).size).toBe(3);
    expect(DIVINATION_CLUB_COMMISSIONS.every(commission => commission.clientName.length > 0)).toBe(true);
    for (const commission of DIVINATION_CLUB_COMMISSIONS) {
      const field = EXPLORATION_CHECKS.find(def => def.id === commission.fieldCheckId)!;
      const check = EXPLORATION_CHECKS.find(def => def.id === commission.checkId)!;
      expect(field.requirements).toContainEqual({ kind: 'clue', id: commission.briefingClueId });
      expect(check.requirements).toContainEqual({ kind: 'clue', id: commission.briefingClueId });
      expect(check.requirements).toContainEqual({ kind: 'clue', id: commission.fieldClueId });
      expect(check.requirements).toContainEqual({ kind: 'ability', id: 'seer_divination' });
      expect(check.contributions.some(term => term.kind === 'stat')).toBe(true);
      expect(check.contributions.some(term => term.kind === 'skill')).toBe(true);
    }

    const state = joinedClub();
    expect(getDivinationClubCommissions(state).map(def => def.id)).toEqual(['lost_keepsake']);
    expect(acceptDivinationClubCommission(state, 'journey_omen')).toMatchObject({ ok: false });
    const startHour = state.hour;
    const startMoney = state.pence;
    expect(acceptDivinationClubCommission(state, 'lost_keepsake')).toMatchObject({ ok: true });
    expect(state.hour).toBe(startHour + 1);
    expect(hasClue(state, 'club_lost_keepsake_brief')).toBe(true);
    expect(state.clues.find(clue => clue.id === 'club_lost_keepsake_brief')?.sourceId).toBe('club_client_lena');
    expect(resolveDivinationClubCommission(state)).toMatchObject({ ok: false });
    expect(state.pence).toBe(startMoney);
    completeField(state, 'lost_keepsake');
    expect(state.pence - startMoney).toBe(72);
    expect(state.divinationClub.reputation).toBe(2);
    expect(state.digestion).toBe(3);
    expect(hasClue(state, 'club_lost_keepsake_outcome')).toBe(true);
    expect(state.sequence8Progress?.evidence.observe).toContainEqual(expect.objectContaining({
      actionId: 'club_commission:lost_keepsake', contextKey: 'divination_club:lost_keepsake',
    }));
    expect(getDivinationClubCommissions(state).map(def => def.id)).toEqual(['journey_omen']);
    const settled = structuredClone(state);
    expect(acceptDivinationClubCommission(state, 'lost_keepsake')).toMatchObject({ ok: false });
    expect(state).toEqual(settled);
  });

  it('外勤错误地点零状态；失败耗费并防刷，相关技能变化后只取得核验线索', () => {
    const state = joinedClub();
    expect(acceptDivinationClubCommission(state, 'lost_keepsake')).toMatchObject({ ok: true });
    const wrongLocation = structuredClone(state);
    expect(investigateActiveDivinationClubCommission(state)).toMatchObject({ ok: false });
    expect(state).toEqual(wrongLocation);
    travelFromCurrent(state, 'market');
    state.stats.mnd = 10;
    state.skills.investigate = 0;
    expect(investigateActiveDivinationClubCommission(state)).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(state.log.at(-1)?.text).toMatch(/城区目录|调查经验/);
    const blocked = structuredClone(state);
    expect(investigateActiveDivinationClubCommission(state)).toMatchObject({ ok: false });
    expect(state).toEqual(blocked);
    state.skills.investigate = 6;
    expect(investigateActiveDivinationClubCommissionIssue(state)).toBeNull();
    expect(investigateActiveDivinationClubCommission(state)).toMatchObject({ ok: true, outcome: 'passed' });
    expect(hasClue(state, 'club_lost_keepsake_market_trace')).toBe(true);
    expect(state.pence).toBe(440);
    expect(state.divinationClub.reputation).toBe(0);
    expect(state.digestion).toBe(0);
  });

  it('序列8占卜家不能通过内部调用进入本轮限定的序列9俱乐部循环', () => {
    const state = fresh();
    state.pathwayId = 'seer';
    state.sequence = 8;
    state.pence = 500;
    state.stats.energy = 100;
    state.knowledge.push('public_divination_etiquette');
    state.currentLocation = {
      locationId: 'divination_club', arrivedDay: 1, arrivedHour: 10,
      travelMode: 'walk', returnHours: 1, returnPrepaid: true,
    };
    const before = structuredClone(state);
    expect(joinDivinationClub(state)).toMatchObject({ ok: false });
    expect(getDivinationClubCommissions(state)).toEqual([]);
    expect(state).toEqual(before);
  });
});

describe('艾略特绑架案状态机', () => {
  it('真实委托来源到地址、现场确认、撤退增援、队友营救与一次结案形成完整长链', () => {
    const state = nightwatchSequence9('seer');
    state.stats.spi = 50;
    state.stats.mnd = 50;
    state.stats.energy = 100;
    state.pence = 300;
    state.hour = 8;
    expect(state.elliotCase).toMatchObject({ stage: 'unknown', employerId: null, rewardClaimed: false });
    expect(allNPCs(state).some(npc => npc.id === 'vickroyer' || npc.id === 'leonard')).toBe(false);
    expect(isLocationUnlocked(state, 'forston_hideout')).toBe(false);
    expect(travelToLocation(state, 'blackthorn_security', 'walk')).toMatchObject({ ok: true });
    expect(acceptElliotCommission(state)).toMatchObject({ ok: true });
    expect(state.elliotCase).toMatchObject({ stage: 'commissioned', employerId: 'vickroyer', assignedPartnerId: 'leonard' });
    expect(allNPCs(state).some(npc => npc.id === 'vickroyer')).toBe(true);
    expect(hasClue(state, 'elliot_worn_coat')).toBe(true);
    expect(locateElliot(state, 'divination')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(state.elliotCase.stage).toBe('location_known');
    expect(isLocationUnlocked(state, 'forston_hideout')).toBe(true);

    expect(leaveCurrentLocation(state)).toMatchObject({ ok: true });
    expect(travelToLocation(state, 'forston_hideout', 'walk')).toMatchObject({ ok: true });
    expect(confirmElliotPresence(state, 'investigation')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(requestElliotBackup(state)).toMatchObject({ ok: true });
    expect(state.elliotCase.stage).toBe('backup_ready');
    expect(state.currentLocation).toBeNull();

    state.day += 1;
    state.hour = 8;
    state.stats.energy = 100;
    expect(travelToLocation(state, 'forston_hideout', 'walk')).toMatchObject({ ok: true });
    expect(rescueElliotWithTeam(state)).toMatchObject({ ok: true, outcome: 'passed' });
    expect(state.elliotCase.stage).toBe('rescued');
    const beforeSettlement = state.pence;
    expect(leaveCurrentLocation(state)).toMatchObject({ ok: true });
    expect(travelToLocation(state, 'blackthorn_security', 'walk')).toMatchObject({ ok: true });
    expect(settleElliotCase(state)).toMatchObject({ ok: true });
    expect(state.pence - beforeSettlement).toBe(2400);
    expect(state.elliotCase).toMatchObject({ stage: 'closed', rewardClaimed: true, employerId: 'vickroyer' });
    const closed = structuredClone(state);
    expect(settleElliotCase(state)).toMatchObject({ ok: false });
    expect(state).toEqual(closed);
  });

  it('无委托不产生雇主或报酬；占卜不可用时可用记录路线，失败可恢复', () => {
    const state = nightwatchSequence9('sleepless');
    state.hour = 8;
    const initialMoney = state.pence;
    expect(locateElliot(state, 'records')).toMatchObject({ ok: false });
    expect(state.elliotCase.employerId).toBeNull();
    expect(state.pence).toBe(initialMoney);
    expect(travelToLocation(state, 'blackthorn_security', 'walk')).toMatchObject({ ok: true });
    expect(acceptElliotCommission(state)).toMatchObject({ ok: true });
    expect(locateElliot(state, 'divination')).toMatchObject({ ok: false });
    state.stats.mnd = 10;
    state.skills.investigate = 0;
    expect(locateElliot(state, 'records')).toMatchObject({ ok: true, outcome: 'blocked' });
    const blocked = structuredClone(state);
    expect(locateElliot(state, 'records')).toMatchObject({ ok: false });
    expect(state).toEqual(blocked);
    state.skills.investigate = 5;
    expect(locateElliot(state, 'records')).toMatchObject({ ok: true, outcome: 'passed' });
  });

  it('旧档默认无案件，新状态与检定尝试读档幂等且不触碰序列8', () => {
    const old: Partial<GameState> = fresh();
    delete old.nightwatchEarlyLoop;
    delete old.divinationClub;
    delete old.elliotCase;
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(old));
    const migrated = loadGame()!;
    expect(migrated.nightwatchEarlyLoop).toEqual({ reputation: 0, trainingProgress: {}, records: [] });
    expect(migrated.divinationClub).toEqual({ joined: false, reputation: 0, activeCommissionId: null, completedCommissionIds: [] });
    expect(migrated.elliotCase).toEqual({ stage: 'unknown', employerId: null, assignedPartnerId: null, locatorMode: null, rewardClaimed: false });

    const state = nightwatchSequence9('sleepless');
    state.sequence8Progress = null;
    saveGame(state);
    const once = loadGame()!;
    saveGame(once);
    const twice = loadGame()!;
    expect(twice.nightwatchEarlyLoop).toEqual(once.nightwatchEarlyLoop);
    expect(twice.divinationClub).toEqual(once.divinationClub);
    expect(twice.elliotCase).toEqual(once.elliotCase);
    expect(twice.sequence8Progress).toBeNull();
  });
});
