import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClueRecord, GameState } from './types';
import {
  acquireClue,
  compareClocktowerRepairRecords,
  evaluateExplorationCheck,
  hasClue,
  loadGame,
  newGame,
  researchClocktowerRumors,
  saveGame,
  traceClocktowerAnomaly,
} from './engine';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
}

const fresh = () => newGame('探索检定者', 'clerk', []);

function withPublicComplaints() {
  const s = fresh();
  expect(researchClocktowerRumors(s).ok).toBe(true);
  return s;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('确定性探索检定', () => {
  it('相同状态重复100次结果完全一致', () => {
    const s = withPublicComplaints();
    const expected = evaluateExplorationCheck(s, 'clocktower_night_trace');
    expect(expected.outcome).toBe('blocked');
    for (let i = 0; i < 100; i++) expect(evaluateExplorationCheck(s, 'clocktower_night_trace')).toEqual(expected);
  });

  it('属性、对应技能和额外线索分别能把 blocked 推进为 passed', () => {
    const byStat = withPublicComplaints();
    byStat.stats.mnd = 30;
    expect(evaluateExplorationCheck(byStat, 'clocktower_night_trace').outcome).toBe('passed');

    const bySkill = withPublicComplaints();
    bySkill.skills.investigate = 3;
    expect(evaluateExplorationCheck(bySkill, 'clocktower_night_trace').outcome).toBe('passed');

    const byClue = withPublicComplaints();
    expect(compareClocktowerRepairRecords(byClue).ok).toBe(true);
    expect(evaluateExplorationCheck(byClue, 'clocktower_night_trace').outcome).toBe('passed');
  });

  it('无关属性、技能和线索不贡献，未知检定也 fail-closed', () => {
    const s = withPublicComplaints();
    s.stats.phy = 100; s.stats.spi = 100; s.stats.cha = 100;
    s.skills.combat = 10; s.skills.speech = 10; s.skills.occult = 10; s.skills.sneak = 10;
    s.clues.push({
      id: 'unrelated_clue', caseId: 'other_case', sourceKind: 'event', sourceId: 'other',
      acquiredDay: s.day, acquiredHour: s.hour,
    });
    expect(evaluateExplorationCheck(s, 'clocktower_night_trace').outcome).toBe('blocked');
    expect(evaluateExplorationCheck(s, 'missing_check')).toMatchObject({ outcome: 'blocked', reason: 'unknown_check' });
  });

  it('缺少 required clue 时即使属性和技能极高也不能通过', () => {
    const s = fresh();
    s.stats.mnd = 100;
    s.skills.investigate = 10;
    expect(evaluateExplorationCheck(s, 'clocktower_night_trace')).toMatchObject({
      outcome: 'blocked', reason: 'missing_required_clue',
    });
  });
});

describe('旧钟楼调查动作', () => {
  it('能力不足的真实尝试消耗时间精力并留档，但不推进认知或发证物', () => {
    const s = withPublicComplaints();
    s.hour = 22; s.stats.energy = 100;
    const result = traceClocktowerAnomaly(s);

    expect(result).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(s.hour).toBe(23);
    expect(s.stats.energy).toBeLessThan(100);
    expect(s.awareness).toBe('ordinary');
    expect(s.organizationRoutes.nightwatch.routeStep).toBe('public_rumor');
    expect(s.leads.nightwatch_clocktower.stage).toBe('found');
    expect(s.items.anomaly_evidence ?? 0).toBe(0);
    expect(s.explorationAttempts).toHaveLength(1);
    expect(s.explorationAttempts[0]).toMatchObject({ checkId: 'clocktower_night_trace', outcome: 'blocked' });
  });

  it('补齐维修工单后可重试通过，重复成功不会复制证物', () => {
    const s = withPublicComplaints();
    s.hour = 22; s.stats.energy = 100;
    expect(traceClocktowerAnomaly(s).outcome).toBe('blocked');

    s.day += 1; s.hour = 9; s.stats.energy = 100;
    expect(compareClocktowerRepairRecords(s).ok).toBe(true);
    expect(hasClue(s, 'clocktower_repair_orders')).toBe(true);
    s.hour = 22;
    expect(traceClocktowerAnomaly(s)).toMatchObject({ ok: true, outcome: 'passed' });
    expect(s.items.anomaly_evidence).toBe(1);
    expect(s.explorationAttempts.map(attempt => attempt.outcome)).toEqual(['blocked', 'passed']);

    const attempts = s.explorationAttempts.length;
    expect(traceClocktowerAnomaly(s).ok).toBe(false);
    expect(s.items.anomaly_evidence).toBe(1);
    expect(s.explorationAttempts).toHaveLength(attempts);
  });

  it('硬前置失败不消耗时间精力，也不记录尝试', () => {
    const s = fresh();
    s.hour = 22; s.stats.energy = 100;
    const before = { day: s.day, hour: s.hour, energy: s.stats.energy };
    expect(traceClocktowerAnomaly(s).ok).toBe(false);
    expect({ day: s.day, hour: s.hour, energy: s.stats.energy }).toEqual(before);
    expect(s.explorationAttempts).toEqual([]);
  });

  it('路线已开启但缺少必需线索时为无代价的硬前置失败', () => {
    const s = withPublicComplaints();
    s.clues = s.clues.filter(clue => clue.id !== 'clocktower_public_complaints');
    s.stats.mnd = 100;
    s.skills.investigate = 10;
    s.hour = 22;
    s.stats.energy = 100;
    const before = {
      day: s.day,
      hour: s.hour,
      energy: s.stats.energy,
      attempts: [...s.explorationAttempts],
      awareness: s.awareness,
      routeStep: s.organizationRoutes.nightwatch.routeStep,
      leadStage: s.leads.nightwatch_clocktower.stage,
      evidence: s.items.anomaly_evidence ?? 0,
    };

    const result = traceClocktowerAnomaly(s);

    expect(result).toMatchObject({ ok: false });
    expect(result.msg).toMatch(/调查笔记|公开投诉/);
    expect({
      day: s.day,
      hour: s.hour,
      energy: s.stats.energy,
      attempts: s.explorationAttempts,
      awareness: s.awareness,
      routeStep: s.organizationRoutes.nightwatch.routeStep,
      leadStage: s.leads.nightwatch_clocktower.stage,
      evidence: s.items.anomaly_evidence ?? 0,
    }).toEqual(before);
  });

  it('维修工单只可取得一次，失败前置不消耗', () => {
    const s = withPublicComplaints();
    s.hour = 22;
    const before = { hour: s.hour, energy: s.stats.energy };
    expect(compareClocktowerRepairRecords(s).ok).toBe(false);
    expect({ hour: s.hour, energy: s.stats.energy }).toEqual(before);
    s.hour = 9;
    expect(compareClocktowerRepairRecords(s).ok).toBe(true);
    expect(compareClocktowerRepairRecords(s).ok).toBe(false);
    expect(s.clues.filter(clue => clue.id === 'clocktower_repair_orders')).toHaveLength(1);
  });

  it('玩家叙事不暴露公式、得分、难度或成功率', () => {
    const s = withPublicComplaints();
    s.hour = 22; s.stats.energy = 100;
    traceClocktowerAnomaly(s);
    const text = s.log.map(entry => entry.text).join('\n');
    expect(text).not.toMatch(/难度|总分|得分|加成|成功率|检定.*\d|\d+\s*vs\s*\d+|心智\s*\d+|调查\s*\d+/i);
  });
});

describe('v10探索字段迁移', () => {
  function loadLegacy(step: string) {
    const base = fresh();
    base.schemaVersion = 10;
    base.organizationRoutes.nightwatch.routeStep = step;
    base.leads.nightwatch_clocktower.stage = step === 'public_rumor' ? 'found' : 'identified';
    const legacy = base as Partial<GameState>;
    delete legacy.clues;
    delete legacy.explorationAttempts;
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(legacy));
    return loadGame()!;
  }

  it('public_rumor 补公开投诉，完成节点补足两条线索并保持读档幂等', () => {
    const publicRumor = loadLegacy('public_rumor');
    expect(publicRumor.schemaVersion).toBe(21);
    expect(publicRumor.clues.map(clue => clue.id)).toEqual(['clocktower_public_complaints']);
    expect(publicRumor.explorationAttempts).toEqual([]);

    const evidenceReady = loadLegacy('evidence_ready');
    expect(evidenceReady.clues.map(clue => clue.id).sort()).toEqual([
      'clocktower_public_complaints', 'clocktower_repair_orders',
    ]);
    expect(evidenceReady.clues.every(clue => clue.sourceKind === 'migration')).toBe(true);
    const before = structuredClone(evidenceReady.clues);
    saveGame(evidenceReady);
    expect(loadGame()?.clues).toEqual(before);
  });

  it('线索取得按id去重且未知线索 fail-closed', () => {
    const s = fresh();
    expect(acquireClue(s, 'clocktower_public_complaints')).toBe(true);
    expect(acquireClue(s, 'clocktower_public_complaints')).toBe(false);
    expect(acquireClue(s, 'unknown_clue')).toBe(false);
    expect(s.clues).toHaveLength(1);
    expect(s.clues[0] satisfies ClueRecord).toBeTruthy();
  });
});
