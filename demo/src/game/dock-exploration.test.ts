import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameState } from './types';
import {
  applyEffects,
  compareDockCargoRecords,
  decodeOrganizationEvidence,
  discoverOrganizationEvidence,
  doAdventure,
  evaluateExplorationCheck,
  hasClue,
  identifyOrganizationEvidence,
  inspectDockMissingReports,
  loadGame,
  newGame,
  saveGame,
  traceDockMarkedManifest,
} from './engine';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
}

const fresh = () => newGame('码头调查者', 'clerk', []);

function visitDocks() {
  const s = fresh();
  s.stats.energy = 100;
  s.hour = 9;
  expect(inspectDockMissingReports(s).ok).toBe(true);
  expect(doAdventure(s, 'docks').ok).toBe(true);
  expect(s.hour).toBe(13);
  return s;
}

function withReports() {
  return visitDocks();
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('码头线索来源与入口隔离', () => {
  it('普通访问只记录 visited，不发组织线索或配方', () => {
    const s = fresh();
    s.activeCommission = {
      id: 'legacy_dock_job', kind: 'investigate', stat: 'mnd', difficulty: 100,
      title: '旧委托', text: '去向由委托人提供', client: 'martha', locationId: 'docks', reward: 12, daysLeft: 2, occult: false,
    };
    s.stats.energy = 100;
    expect(doAdventure(s, 'docks').ok).toBe(true);
    expect(s.visitedLocations).toContain('docks');
    expect(s.leads.iron_blood_token.stage).toBe('unknown');
    expect(s.organizationRoutes.iron_and_blood.history).toEqual([]);
    expect(s.formulas).not.toContain('hunter9');
    expect(s.clues.filter(clue => clue.caseId === 'dock_manifest')).toEqual([]);
  });

  it('discoverOrganizationEvidence 不能凭 visited 绕过调查链', () => {
    const s = visitDocks();
    s.clues = s.clues.filter(clue => clue.id !== 'dock_missing_reports');
    expect(discoverOrganizationEvidence(s, 'iron_and_blood').ok).toBe(false);
    expect(s.leads.iron_blood_token.stage).toBe('unknown');
    expect(s.organizationRoutes.iron_and_blood.history).toEqual([]);

    s.leads.iron_blood_token.stage = 'found';
    expect(decodeOrganizationEvidence(s, 'iron_and_blood').ok).toBe(false);
    s.leads.iron_blood_token.stage = 'decoded';
    s.day = 2; s.hour = 10; s.relations.victor = 20;
    expect(identifyOrganizationEvidence(s, 'iron_and_blood', 'victor').ok).toBe(false);
    expect(s.formulas).not.toContain('hunter9');
  });

  it('docker 出身与事件情报会生成可追溯的公开失踪线索，但不绕过码头到访', () => {
    const docker = newGame('码头之子', 'docker', []);
    expect(docker.clues).toContainEqual(expect.objectContaining({
      id: 'dock_missing_reports', sourceKind: 'public_records', sourceId: 'origin:docker',
    }));
    expect(traceDockMarkedManifest(docker).ok).toBe(false);

    const eventState = fresh();
    applyEffects(eventState, [{ k: 'intel', id: 'dock_missing' }]);
    expect(eventState.clues).toContainEqual(expect.objectContaining({
      id: 'dock_missing_reports', sourceKind: 'event', sourceId: 'intel:dock_missing',
    }));
  });

  it('硬前置失败不消耗；缺必需线索时高属性高技能也不能追查', () => {
    const unvisited = fresh();
    const unvisitedBefore = { day: unvisited.day, hour: unvisited.hour, energy: unvisited.stats.energy };
    expect(inspectDockMissingReports(unvisited).ok).toBe(false);
    expect({ day: unvisited.day, hour: unvisited.hour, energy: unvisited.stats.energy }).toEqual(unvisitedBefore);

    const s = visitDocks();
    s.clues = s.clues.filter(clue => clue.id !== 'dock_missing_reports');
    s.stats.mnd = 100;
    s.skills.investigate = 10;
    const before = structuredClone({
      day: s.day, hour: s.hour, energy: s.stats.energy, attempts: s.explorationAttempts,
      awareness: s.awareness, lead: s.leads.iron_blood_token,
      route: s.organizationRoutes.iron_and_blood, evidence: s.clues,
    });
    expect(traceDockMarkedManifest(s).ok).toBe(false);
    expect({
      day: s.day, hour: s.hour, energy: s.stats.energy, attempts: s.explorationAttempts,
      awareness: s.awareness, lead: s.leads.iron_blood_token,
      route: s.organizationRoutes.iron_and_blood, evidence: s.clues,
    }).toEqual(before);
  });
});

describe('码头确定性检定', () => {
  it('相同状态重复100次结果一致', () => {
    const s = withReports();
    const expected = evaluateExplorationCheck(s, 'dock_manifest_trace');
    expect(expected.outcome).toBe('blocked');
    for (let i = 0; i < 100; i++) expect(evaluateExplorationCheck(s, 'dock_manifest_trace')).toEqual(expected);
  });

  it('属性、对应技能和货运旁证可分别从 blocked 推进为 passed', () => {
    const byStat = withReports();
    byStat.stats.mnd = 30;
    expect(evaluateExplorationCheck(byStat, 'dock_manifest_trace').outcome).toBe('passed');

    const bySkill = withReports();
    bySkill.skills.investigate = 3;
    expect(evaluateExplorationCheck(bySkill, 'dock_manifest_trace').outcome).toBe('passed');

    const byClue = withReports();
    expect(compareDockCargoRecords(byClue).ok).toBe(true);
    expect(evaluateExplorationCheck(byClue, 'dock_manifest_trace').outcome).toBe('passed');
  });

  it('无关属性、技能和线索不会贡献', () => {
    const s = withReports();
    s.stats.phy = 100; s.stats.spi = 100; s.stats.cha = 100;
    s.skills.combat = 10; s.skills.speech = 10; s.skills.occult = 10; s.skills.sneak = 10;
    s.clues.push({
      id: 'unrelated', caseId: 'other', sourceKind: 'event', sourceId: 'other',
      acquiredDay: s.day, acquiredHour: s.hour,
    });
    expect(evaluateExplorationCheck(s, 'dock_manifest_trace').outcome).toBe('blocked');
  });
});

describe('异常仓单动作与原有组织链', () => {
  it('能力不足会付出少量代价并留档，但不推进线索或发放证物', () => {
    const s = withReports();
    const before = { hour: s.hour, energy: s.stats.energy };
    expect(traceDockMarkedManifest(s)).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(s.hour).toBe(before.hour + 1);
    expect(s.stats.energy).toBeLessThan(before.energy);
    expect(s.explorationAttempts).toHaveLength(1);
    expect(s.leads.iron_blood_token.stage).toBe('unknown');
    expect(s.organizationRoutes.iron_and_blood.history).toEqual([]);
    expect(hasClue(s, 'dock_marked_manifest')).toBe(false);
    expect(s.formulas).not.toContain('hunter9');
  });

  it('补齐旁证后重试成功且证物唯一，成功本身不发猎人配方', () => {
    const s = withReports();
    expect(traceDockMarkedManifest(s).outcome).toBe('blocked');
    expect(compareDockCargoRecords(s).ok).toBe(true);
    expect(traceDockMarkedManifest(s)).toMatchObject({ ok: true, outcome: 'passed' });
    expect(s.leads.iron_blood_token.stage).toBe('found');
    expect(s.clues.filter(clue => clue.id === 'dock_marked_manifest')).toHaveLength(1);
    expect(s.organizationRoutes.iron_and_blood.history.filter(record => record.step === 'world_entry:iron_blood_token')).toHaveLength(1);
    expect(s.formulas).not.toContain('hunter9');

    const beforeAttempts = s.explorationAttempts.length;
    expect(traceDockMarkedManifest(s).ok).toBe(false);
    expect(s.clues.filter(clue => clue.id === 'dock_marked_manifest')).toHaveLength(1);
    expect(s.explorationAttempts).toHaveLength(beforeAttempts);
  });

  it('只有整理后由可信且在场的维克多辨认，才获得 hunter9 unverified', () => {
    const s = withReports();
    expect(compareDockCargoRecords(s).ok).toBe(true);
    expect(traceDockMarkedManifest(s).outcome).toBe('passed');
    expect(decodeOrganizationEvidence(s, 'iron_and_blood').ok).toBe(true);
    expect(s.formulas).not.toContain('hunter9');

    s.day = 2; s.hour = 10;
    expect(identifyOrganizationEvidence(s, 'iron_and_blood', 'victor').ok).toBe(false);
    s.relations.victor = 20;
    expect(identifyOrganizationEvidence(s, 'iron_and_blood', 'victor').ok).toBe(true);
    expect(s.formulas).toContain('hunter9');
    expect(s.pathwayLeads.hunter.formulaStatus).toBe('unverified');
  });

  it('玩家可见日志不暴露公式、得分或成功率', () => {
    const s = withReports();
    traceDockMarkedManifest(s);
    const text = s.log.map(entry => entry.text).join('\n');
    expect(text).not.toMatch(/难度|总分|得分|加成|成功率|检定.*\d|\d+\s*vs\s*\d+|心智\s*\d+|调查\s*\d+/i);
  });
});

describe('v11 码头调查迁移', () => {
  function loadV11(configure: (s: GameState) => void) {
    const s = fresh();
    s.schemaVersion = 11;
    configure(s);
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(s));
    return loadGame()!;
  }

  it('visited-only 不补关键线索，情报则只补公开登记', () => {
    const visited = loadV11(s => { s.visitedLocations = ['docks']; });
    expect(visited.schemaVersion).toBe(17);
    expect(visited.clues.filter(clue => clue.caseId === 'dock_manifest')).toEqual([]);

    const intel = loadV11(s => { s.intel.push('dock_missing'); });
    expect(intel.clues.filter(clue => clue.caseId === 'dock_manifest')).toEqual([
      expect.objectContaining({ id: 'dock_missing_reports', sourceKind: 'migration' }),
    ]);
  });

  it('可信 found 及以后进度补足三条线索，存取幂等', () => {
    const loaded = loadV11(s => {
      s.visitedLocations = ['docks'];
      s.leads.iron_blood_token.stage = 'found';
      s.leads.iron_blood_token.notes.push('旧版码头实地调查记录');
    });
    expect(loaded.clues.filter(clue => clue.caseId === 'dock_manifest').map(clue => clue.id).sort()).toEqual([
      'dock_manifest_discrepancy', 'dock_marked_manifest', 'dock_missing_reports',
    ]);
    expect(loaded.clues.filter(clue => clue.caseId === 'dock_manifest').every(clue => clue.sourceKind === 'migration')).toBe(true);
    const before = structuredClone(loaded);
    saveGame(loaded);
    expect(loadGame()).toEqual(before);
  });
});
