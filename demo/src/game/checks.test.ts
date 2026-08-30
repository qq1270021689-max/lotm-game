import { beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluateCheck, toPublicCheckResult } from './checks';
import { EXPLORATION_CHECKS } from './data';
import {
  acquireClue,
  evaluateExplorationCheck,
  evaluateExplorationCheckInternal,
  getExplorationCheckPublicResult,
  loadGame,
  newGame,
  saveGame,
  traceClocktowerAnomaly,
} from './engine';
import type { CheckDef, CheckRequest, GameState } from './types';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
}

const fresh = () => newGame('统一检定测试者', 'clerk', []);
const clockReady = () => {
  const s = fresh();
  acquireClue(s, 'clocktower_public_complaints');
  s.organizationRoutes.nightwatch.routeStep = 'public_rumor';
  s.leads.nightwatch_clocktower.stage = 'found';
  s.hour = 22;
  s.stats.energy = 100;
  return s;
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('纯检定内核', () => {
  it('未知检定、目标和 requirement 均 fail-closed', () => {
    const s = clockReady();
    const request: CheckRequest = {
      checkId: 'missing',
      context: { target: { kind: 'case', id: 'missing' }, stats: {}, skills: {}, clueIds: [], toolIds: [], abilityIds: [], preparationIds: [] },
      startedAt: { day: 1, hour: 22 },
    };
    expect(evaluateCheck(EXPLORATION_CHECKS, request)).toMatchObject({ eligible: false, reason: 'unknown_check' });

    const valid = EXPLORATION_CHECKS[0];
    expect(evaluateCheck(EXPLORATION_CHECKS, {
      ...request, checkId: valid.id, definitionVersion: valid.version,
    })).toMatchObject({ eligible: false, reason: 'unknown_target' });

    const malformed = { ...valid, requirements: [{ kind: 'mystery', id: 'x' }] } as unknown as CheckDef;
    const internal = evaluateExplorationCheckInternal(s, valid.id);
    expect(evaluateCheck([malformed], {
      checkId: malformed.id, definitionVersion: malformed.version,
      context: { ...structuredClone((s.checkAttempts[0]?.context ?? request.context)), target: valid.target },
      startedAt: { day: 1, hour: 22 },
    })).toMatchObject({ eligible: false, reason: 'unknown_requirement' });
    expect(internal.reason).toBe('insufficient');
  });

  it('required clue 是硬门槛，极高属性也无法绕过', () => {
    const s = fresh();
    s.stats.mnd = 100;
    s.skills.investigate = 10;
    expect(evaluateExplorationCheckInternal(s, 'clocktower_night_trace')).toMatchObject({
      eligible: false, outcome: 'blocked', reason: 'missing_requirement',
    });
  });

  it('阈值 -1、等于、+1 的边界稳定且兼容旧 API', () => {
    const s = clockReady();
    s.stats.mnd = 29;
    expect(evaluateExplorationCheckInternal(s, 'clocktower_night_trace')).toMatchObject({ score: 33, outcome: 'blocked' });
    s.stats.mnd = 30;
    expect(evaluateExplorationCheckInternal(s, 'clocktower_night_trace')).toMatchObject({ score: 34, outcome: 'passed' });
    s.stats.mnd = 31;
    const internal = evaluateExplorationCheckInternal(s, 'clocktower_night_trace');
    const legacy = evaluateExplorationCheck(s, 'clocktower_night_trace');
    expect(internal).toMatchObject({ score: 35, outcome: 'passed' });
    expect(legacy).toMatchObject({ score: internal.score, difficulty: internal.difficulty, outcome: internal.outcome });
  });

  it('只读取白名单输入，纯函数不修改状态且100次一致', () => {
    const s = clockReady();
    s.stats.phy = 100; s.stats.spi = 100; s.stats.cha = 100;
    s.skills.combat = 10; s.skills.occult = 10; s.skills.speech = 10; s.skills.sneak = 10;
    s.clues.push({ id: 'unrelated', caseId: 'other', sourceKind: 'event', sourceId: 'other', acquiredDay: 1, acquiredHour: 22 });
    const before = structuredClone(s);
    const expected = evaluateExplorationCheckInternal(s, 'clocktower_night_trace');
    for (let i = 0; i < 100; i++) expect(evaluateExplorationCheckInternal(s, 'clocktower_night_trace')).toEqual(expected);
    expect(s).toEqual(before);
    expect(expected.outcome).toBe('blocked');
  });

  it('公开结果只有定性帮助来源，不含任何内部数值字段', () => {
    const s = clockReady();
    const direct = toPublicCheckResult(evaluateExplorationCheckInternal(s, 'clocktower_night_trace'));
    expect(getExplorationCheckPublicResult(s, 'clocktower_night_trace')).toEqual(direct);
    expect(direct.helpedBy).toEqual(expect.arrayContaining(['现场推理', '公开投诉记录']));
    expect(JSON.stringify(direct)).not.toMatch(/score|difficulty|bonus|probability|成功率|\b34\b/i);
  });
});

describe('探索动作事务与重复失败指纹', () => {
  it('blocked 仅结算固定代价并记录与实际差异一致的 receipt', () => {
    const s = clockReady();
    const before = { energy: s.stats.energy, hour: s.hour, awareness: s.awareness, evidence: s.items.anomaly_evidence ?? 0 };
    expect(traceClocktowerAnomaly(s)).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(s.checkAttempts).toHaveLength(1);
    const attempt = s.checkAttempts[0];
    expect(attempt).toMatchObject({ checkId: 'clocktower_night_trace', outcome: 'blocked', reason: 'insufficient', startedHour: 22 });
    expect(attempt.receipt.hoursElapsed).toBe(1);
    expect(attempt.receipt.effects.find(entry => entry.id === 'energy')?.actualDelta).toBe(s.stats.energy - before.energy);
    expect(s.hour).toBe(before.hour + 1);
    expect(s.awareness).toBe(before.awareness);
    expect(s.items.anomaly_evidence ?? 0).toBe(before.evidence);
  });

  it('同 fingerprint 重试零变化；技能或线索改变后才允许再次尝试', () => {
    const s = clockReady();
    expect(traceClocktowerAnomaly(s).outcome).toBe('blocked');
    const unchanged = structuredClone(s);
    expect(traceClocktowerAnomaly(s)).toMatchObject({ ok: false });
    expect(s).toEqual(unchanged);

    s.skills.investigate += 1;
    expect(traceClocktowerAnomaly(s)).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(s.checkAttempts).toHaveLength(2);
    expect(s.checkAttempts[0].fingerprint).not.toBe(s.checkAttempts[1].fingerprint);

    acquireClue(s, 'clocktower_repair_orders');
    s.hour = 22;
    s.stats.energy = 100;
    expect(traceClocktowerAnomaly(s)).toMatchObject({ ok: true, outcome: 'passed' });
    expect(s.items.anomaly_evidence).toBe(1);
    expect(s.checkAttempts).toHaveLength(3);
    const completed = structuredClone(s);
    expect(traceClocktowerAnomaly(s).ok).toBe(false);
    expect(s).toEqual(completed);
  });
});

describe('v21 检定审计存档', () => {
  it('v20 初始化为空，v21 合法记录往返幂等', () => {
    const legacy = clockReady() as GameState & { checkAttempts?: GameState['checkAttempts'] };
    legacy.schemaVersion = 20;
    legacy.checkAttempts = [{ attemptId: 'forged' } as GameState['checkAttempts'][number]];
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(legacy));
    expect(loadGame()).toMatchObject({ schemaVersion: 22, checkAttempts: [] });

    const s = clockReady();
    traceClocktowerAnomaly(s);
    saveGame(s);
    const first = loadGame()!;
    expect(first.checkAttempts).toHaveLength(1);
    saveGame(first);
    expect(loadGame()).toEqual(first);
  });

  it('伪造或复制 attempt 不能授权线索、路线与奖励，记录限长200条', () => {
    const source = clockReady();
    traceClocktowerAnomaly(source);
    const valid = source.checkAttempts[0];

    const target = fresh();
    target.schemaVersion = 21;
    target.checkAttempts = Array.from({ length: 205 }, (_, index) => ({ ...structuredClone(valid), attemptId: `copied:${index}` }));
    saveGame(target);
    const loaded = loadGame()!;
    expect(loaded.checkAttempts).toHaveLength(200);
    expect(loaded.awareness).toBe('ordinary');
    expect(loaded.clues).toEqual([]);
    expect(loaded.items.anomaly_evidence ?? 0).toBe(0);
    expect(loaded.organizationRoutes.nightwatch.routeStep).toBe('none');

    loaded.checkAttempts.push({ ...structuredClone(valid), attemptId: 'bad', fingerprint: 'forged' });
    saveGame(loaded);
    expect(loadGame()?.checkAttempts.some(attempt => attempt.attemptId === 'bad')).toBe(false);
  });
});
