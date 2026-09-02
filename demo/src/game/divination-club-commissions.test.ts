import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DIVINATION_CLUB_COMMISSIONS } from './data';
import { evaluateCheck } from './checks';
import type { CheckAttemptRecord, CheckDef, DivinationClubCommissionId, GameState } from './types';
import {
  acceptDivinationClubCommission,
  acquireClue,
  getDivinationClubCommissions,
  hasClue,
  investigateActiveDivinationClubCommission,
  joinDivinationClub,
  leaveCurrentLocation,
  loadGame,
  newGame,
  performTingenLandmarkAction,
  resolveDivinationClubCommission,
  saveGame,
  travelToLocation,
} from './engine';

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

function joinedClub(): GameState {
  const state = newGame('俱乐部闭环测试者', 'clerk', []);
  state.pathwayId = 'seer';
  state.sequence = 9;
  state.stats.energy = 100;
  state.pence = 1000;
  acquireClue(state, 'tingen_honest_paper', 'archive', 'dewill_periodicals');
  acquireClue(state, 'tingen_city_directory', 'public_records', 'market_city_notice');
  acquireClue(state, 'tingen_church_directory', 'public_records', 'st_selena_notice');
  state.hour = 9;
  expect(travelToLocation(state, 'divination_club', 'walk')).toMatchObject({ ok: true });
  expect(performTingenLandmarkAction(state, 'divination_club_etiquette')).toMatchObject({ ok: true });
  expect(joinDivinationClub(state)).toMatchObject({ ok: true });
  return state;
}

function goFromCurrent(state: GameState, locationId: string, hour = 8) {
  expect(leaveCurrentLocation(state)).toMatchObject({ ok: true });
  state.hour = hour;
  state.stats.energy = 100;
  expect(travelToLocation(state, locationId, 'walk')).toMatchObject({ ok: true });
}

function passField(state: GameState, commissionId: DivinationClubCommissionId) {
  const def = DIVINATION_CLUB_COMMISSIONS.find(candidate => candidate.id === commissionId)!;
  goFromCurrent(state, def.fieldLocationId);
  Object.assign(state.stats, { mnd: 50, cha: 50, spi: 50, energy: 100 });
  Object.assign(state.skills, { investigate: 5, speech: 5, occult: 5 });
  expect(investigateActiveDivinationClubCommission(state)).toMatchObject({ ok: true, outcome: 'passed' });
  expect(hasClue(state, def.fieldClueId)).toBe(true);
}

function passFinal(state: GameState, commissionId: DivinationClubCommissionId) {
  goFromCurrent(state, 'divination_club', 9);
  Object.assign(state.stats, { mnd: 50, spi: 50, energy: 100 });
  Object.assign(state.skills, { investigate: 5, occult: 5 });
  expect(resolveDivinationClubCommission(state)).toMatchObject({ ok: true, outcome: 'passed' });
  expect(state.divinationClub.completedCommissionIds).toContain(commissionId);
}

function completeCommission(state: GameState, commissionId: DivinationClubCommissionId) {
  expect(getDivinationClubCommissions(state).map(def => def.id)).toEqual([commissionId]);
  expect(acceptDivinationClubCommission(state, commissionId)).toMatchObject({ ok: true });
  passField(state, commissionId);
  passFinal(state, commissionId);
}

describe('占卜家俱乐部三类委托闭环', () => {
  it('三条真实委托按顺序完成，固定报酬、声望、消化、结论与扮演证据各结算一次', () => {
    const state = joinedClub();
    const startMoney = state.pence;
    expect(state.seerTraining.learnedNodeIds).toEqual([]);

    for (const def of DIVINATION_CLUB_COMMISSIONS) completeCommission(state, def.id);

    expect(state.pence - startMoney).toBe(72 + 96 + 84);
    expect(state.divinationClub.reputation).toBe(7);
    expect(state.digestion).toBe(11);
    expect(state.divinationClub.activeCommissionId).toBeNull();
    expect(getDivinationClubCommissions(state)).toEqual([]);
    for (const def of DIVINATION_CLUB_COMMISSIONS) {
      expect(hasClue(state, def.outcomeClueId)).toBe(true);
      expect(state.sequence8Progress?.evidence[def.actingPrincipleId]).toContainEqual(expect.objectContaining({
        actionId: `club_commission:${def.id}`,
        contextKey: `divination_club:${def.id}`,
      }));
    }
    const settled = structuredClone(state);
    expect(resolveDivinationClubCommission(state)).toMatchObject({ ok: false });
    expect(state).toEqual(settled);
    expect(state.log.filter(entry => entry.text.includes('魔药反馈')).every(entry => !/\d/.test(entry.text))).toBe(true);
  });

  it.each(DIVINATION_CLUB_COMMISSIONS)('$label 外勤失败后同指纹不可刷，相关技能变化后才取得核验线索', target => {
    const state = joinedClub();
    for (const def of DIVINATION_CLUB_COMMISSIONS) {
      if (def.id === target.id) break;
      completeCommission(state, def.id);
    }
    expect(acceptDivinationClubCommission(state, target.id)).toMatchObject({ ok: true });
    goFromCurrent(state, target.fieldLocationId);
    state.stats.mnd = 1;
    state.stats.cha = 1;
    state.skills.investigate = 0;
    state.skills.speech = 0;
    const money = state.pence;
    const reputation = state.divinationClub.reputation;
    const digestion = state.digestion;
    expect(investigateActiveDivinationClubCommission(state)).toMatchObject({ ok: true, outcome: 'blocked' });
    const blocked = structuredClone(state);
    expect(investigateActiveDivinationClubCommission(state)).toMatchObject({ ok: false });
    expect(state).toEqual(blocked);
    state.stats.phy += 1;
    expect(investigateActiveDivinationClubCommission(state)).toMatchObject({ ok: false });
    state.skills.investigate = 8;
    state.skills.speech = 8;
    expect(investigateActiveDivinationClubCommission(state)).toMatchObject({ ok: true, outcome: 'passed' });
    expect(hasClue(state, target.fieldClueId)).toBe(true);
    expect(state.pence).toBe(money);
    expect(state.divinationClub.reputation).toBe(reputation);
    expect(state.digestion).toBe(digestion);
  });

  it('最终咨询失败不结算且防刷；固有占卜能力足以授权，课程只作为帮助', () => {
    const state = joinedClub();
    expect(acceptDivinationClubCommission(state, 'lost_keepsake')).toMatchObject({ ok: true });
    passField(state, 'lost_keepsake');
    goFromCurrent(state, 'divination_club', 9);
    state.stats.mnd = 1;
    state.skills.investigate = 0;
    const beforeReward = state.pence;
    expect(resolveDivinationClubCommission(state)).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(state.pence).toBe(beforeReward);
    expect(state.digestion).toBe(0);
    expect(state.divinationClub.reputation).toBe(0);
    expect(hasClue(state, 'club_lost_keepsake_outcome')).toBe(false);
    const blocked = structuredClone(state);
    expect(resolveDivinationClubCommission(state)).toMatchObject({ ok: false });
    expect(state).toEqual(blocked);
    state.skills.investigate = 6;
    expect(resolveDivinationClubCommission(state)).toMatchObject({ ok: true, outcome: 'passed' });
    expect(state.pence - beforeReward).toBe(72);
    expect(state.seerTraining.learnedNodeIds).toEqual([]);
  });

  it('凡人、其他途径、序列8、非会员及进行中的遭遇都被零状态拒绝', () => {
    const base = joinedClub();
    const variants = [
      Object.assign(structuredClone(base), { pathwayId: null, sequence: null }),
      Object.assign(structuredClone(base), { pathwayId: 'spectator', sequence: 9 }),
      Object.assign(structuredClone(base), { sequence: 8 }),
      Object.assign(structuredClone(base), { divinationClub: { joined: false, reputation: 0, activeCommissionId: null, completedCommissionIds: [] } }),
    ] as GameState[];
    for (const state of variants) {
      const before = structuredClone(state);
      expect(acceptDivinationClubCommission(state, 'lost_keepsake')).toMatchObject({ ok: false });
      expect(investigateActiveDivinationClubCommission(state)).toMatchObject({ ok: false });
      expect(resolveDivinationClubCommission(state)).toMatchObject({ ok: false });
      expect(state).toEqual(before);
    }

    expect(acceptDivinationClubCommission(base, 'lost_keepsake')).toMatchObject({ ok: true });
    base.pendingEncounter = {
      encounterId: 'test_encounter', threatId: 'test_threat', phase: 'escape_choice',
      sourceKind: 'deep_investigation', sourceId: 'test', startedDay: base.day, startedHour: base.hour, narrativeVariant: 0,
      preparations: [],
    };
    const blocked = structuredClone(base);
    expect(investigateActiveDivinationClubCommission(base)).toMatchObject({ ok: false });
    expect(resolveDivinationClubCommission(base)).toMatchObject({ ok: false });
    expect(base).toEqual(blocked);
  });

  it('伪造active、completed、field与outcome数组均在读档时清除', () => {
    const state = joinedClub();
    state.divinationClub.activeCommissionId = 'recurring_nightmare';
    state.divinationClub.completedCommissionIds = ['lost_keepsake'];
    state.divinationClub.reputation = 99;
    acquireClue(state, 'club_nightmare_statement', 'npc', 'club_client_adele');
    acquireClue(state, 'club_lost_keepsake_market_trace', 'location', 'market');
    acquireClue(state, 'club_lost_keepsake_outcome', 'npc', 'club_client_lena');
    saveGame(state);
    const loaded = loadGame()!;
    expect(loaded.divinationClub).toEqual({ joined: true, reputation: 0, activeCommissionId: null, completedCommissionIds: [] });
    expect(hasClue(loaded, 'club_lost_keepsake_market_trace')).toBe(false);
    expect(hasClue(loaded, 'club_lost_keepsake_outcome')).toBe(false);
  });

  it('伪造首份active与正确来源brief仍不能替代接案回执', () => {
    const state = joinedClub();
    state.divinationClub.activeCommissionId = 'lost_keepsake';
    acquireClue(state, 'club_lost_keepsake_brief', 'npc', 'club_client_lena');
    saveGame(state);
    const loaded = loadGame()!;
    expect(loaded.divinationClub.activeCommissionId).toBeNull();
    expect(hasClue(loaded, 'club_lost_keepsake_brief')).toBe(false);
    expect(loaded.checkAttempts.some(attempt => attempt.checkId === 'club_accept_lost_keepsake')).toBe(false);
  });

  it('真实接案保存重载后保留active与权威回执，重复读档幂等', () => {
    const state = joinedClub();
    const beforeEnergy = state.stats.energy;
    expect(acceptDivinationClubCommission(state, 'lost_keepsake')).toMatchObject({ ok: true });
    const acceptAttempt = state.checkAttempts.find(attempt => attempt.checkId === 'club_accept_lost_keepsake')!;
    expect(acceptAttempt).toMatchObject({ outcome: 'passed', receipt: { hoursElapsed: 1 } });
    expect(acceptAttempt.receipt.effects.map(effect => effect.id).sort()).toEqual([
      'clue:club_lost_keepsake_brief', 'energy', 'hours',
    ]);
    expect(state.stats.energy).toBeLessThan(beforeEnergy);
    saveGame(state);
    const once = loadGame()!;
    expect(once.divinationClub.activeCommissionId).toBe('lost_keepsake');
    expect(hasClue(once, 'club_lost_keepsake_brief')).toBe(true);
    expect(once.checkAttempts.some(attempt => attempt.checkId === 'club_accept_lost_keepsake')).toBe(true);
    saveGame(once);
    const twice = loadGame()!;
    expect(twice.divinationClub).toEqual(once.divinationClub);
    expect(twice.checkAttempts).toEqual(once.checkAttempts);
    expect(twice.clues).toEqual(once.clues);
  });

  it('可信v23旧结算只保留历史已结清状态，不补造新结论或扮演证据，重复迁移幂等', () => {
    const state = joinedClub();
    acquireClue(state, 'club_lost_keepsake_brief', 'npc', 'club_client_lena');
    const legacy: CheckDef = {
      id: 'club_commission_lost_keepsake', version: 1, domain: 'exploration',
      target: { kind: 'case', id: 'divination_club:lost_keepsake' }, difficulty: 36,
      requirements: [{ kind: 'clue', id: 'club_lost_keepsake_brief' }, { kind: 'location', id: 'divination_club' }],
      contributions: [
        { kind: 'stat', id: 'mnd', multiplier: 1, publicLabel: '陈述梳理' },
        { kind: 'skill', id: 'investigate', multiplier: 4, publicLabel: '调查经验' },
        { kind: 'clue', id: 'club_lost_keepsake_brief', value: 8, publicLabel: '来访记录' },
        { kind: 'clue', id: 'tingen_city_directory', value: 4, publicLabel: '城区公共目录' },
      ],
      receiptPolicy: {
        blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours'] },
        passed: { hoursElapsed: 2, effectIds: ['energy', 'money', 'digestion', 'club_reputation', 'hours'] },
      },
    };
    const context = {
      target: legacy.target, locationId: 'divination_club', stats: { mnd: 40 }, skills: { investigate: 0 },
      clueIds: ['club_lost_keepsake_brief', 'tingen_city_directory'], toolIds: [], abilityIds: [], preparationIds: [],
    };
    const result = evaluateCheck([legacy], { checkId: legacy.id, definitionVersion: 1, context, startedAt: { day: 1, hour: 12 } });
    const attempt: CheckAttemptRecord = {
      attemptId: 'legacy-club-lost', checkId: legacy.id, definitionVersion: 1, context,
      fingerprint: result.fingerprint, startedDay: 1, startedHour: 12, outcome: 'passed', reason: 'passed',
      publicContributionIds: result.contributions.map(term => term.id).sort(),
      receipt: { hoursElapsed: 2, effects: [
        { id: 'energy', applied: true, before: 100, after: 92, actualDelta: -8 },
        { id: 'money', applied: true, before: 440, after: 512, actualDelta: 72 },
        { id: 'digestion', applied: true, before: 0, after: 3, actualDelta: 3 },
        { id: 'club_reputation', applied: true, before: 0, after: 2, actualDelta: 2 },
        { id: 'hours', applied: true, before: 0, after: 2, actualDelta: 2 },
      ] },
    };
    state.checkAttempts = [attempt];
    state.schemaVersion = 23;
    state.divinationClub.completedCommissionIds = ['lost_keepsake'];
    state.divinationClub.reputation = 2;
    saveGame(state);
    const once = loadGame()!;
    expect(once.divinationClub.completedCommissionIds).toEqual(['lost_keepsake']);
    expect(hasClue(once, 'club_lost_keepsake_outcome')).toBe(false);
    expect(once.sequence8Progress?.evidence.observe ?? []).toEqual([]);
    expect(getDivinationClubCommissions(once).map(def => def.id)).toEqual(['journey_omen']);
    saveGame(once);
    const twice = loadGame()!;
    expect(twice.divinationClub).toEqual(once.divinationClub);
    expect(twice.checkAttempts).toEqual(once.checkAttempts);
    expect(hasClue(twice, 'club_lost_keepsake_outcome')).toBe(false);
  });
});
