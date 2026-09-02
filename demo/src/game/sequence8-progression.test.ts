import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PATHWAYS, SEQUENCE8_ACTING_DEFS, SEQUENCE8_RITUAL_DEFS, sequenceEvidenceLabel } from './data';
import type { GameState, OrganizationId } from './types';
import {
  buyFormula, buyItem, canPromote, collectMaterialSource, completeSeq8Review, decodeDiaryPage,
  discoverDiaryPage, doAct, doAdventure, doPromote, doStudy, ensureSequence8Progress,
  loadGame, newGame, performActingAction, performSeq8RitualStep, planSeq8Ritual,
  requestSeq8Review, researchClocktowerRumors, saveGame, sequence8ReviewMissing,
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

const ORG_BY_PATHWAY: Record<string, OrganizationId> = {
  seer: 'nightwatch', spectator: 'psychology_alchemists', hunter: 'iron_and_blood',
  sleepless: 'nightwatch', apprentice: 'abraham_branch',
};

function seq9(pathwayId: keyof typeof SEQUENCE8_ACTING_DEFS): GameState {
  const s = newGame('序列8测试者', 'clerk', []);
  const orgId = ORG_BY_PATHWAY[pathwayId];
  s.pathwayId = pathwayId;
  s.sequence = 9;
  s.awareness = 'informed';
  s.digestion = 5;
  s.stats.energy = 100;
  s.stats.san = 100;
  s.stats.cor = 0;
  s.knowledge.push('occult_theory');
  s.visitedLocations = ['market', 'canal', 'manor', 'docks', 'honakisu', 'graveyard', 'old_tower'];
  s.relations.nelson = 30; s.relations.ella = 30; s.relations.evelyn = 30;
  Object.assign(s.organizationRoutes[orgId], { status: 'committed', routeStep: 'committed', selectedPathway: pathwayId });
  Object.assign(s.pathwayLeads[pathwayId], { organizationId: orgId, commitment: true, routeStep: 'completed' });
  s.sequence8Progress = null;
  ensureSequence8Progress(s, 2);
  return s;
}

function setRequirementTime(s: GameState, requirement: { kind: string; id: string }, day: number) {
  s.day = day;
  s.hour = requirement.kind === 'night' ? 22 : 10;
  s.stats.energy = 100;
}

function completeEvidence(s: GameState) {
  const def = SEQUENCE8_ACTING_DEFS[s.pathwayId as keyof typeof SEQUENCE8_ACTING_DEFS];
  const valid = def.actions.filter(action => !('wrong' in action));
  for (let round = 0; round < 2; round++) {
    valid.forEach((action, index) => {
      const day = 2 + round * 2 + (index === 2 ? 1 : 0);
      setRequirementTime(s, action.requirement, day);
      expect(performActingAction(s, action.id).ok).toBe(true);
    });
  }
  // 错误示范会扣除消化度；用新的真实对象/日期补做一次，而不是绕过证据系统。
  if (s.digestion < 100) {
    setRequirementTime(s, valid[0].requirement, 10);
    expect(performActingAction(s, valid[0].id).ok).toBe(true);
  }
  expect(s.digestion).toBe(100);
}

function reviewAndCollect(s: GameState) {
  expect(requestSeq8Review(s).ok).toBe(true);
  expect(s.sequence8Progress?.formulaStatus).toBe('review_pending');
  expect(completeSeq8Review(s).ok).toBe(true);
  const own = Object.values(s.materialSources).filter(source => source.targetSequence === 8 && source.pathwayId === s.pathwayId);
  expect(own).toHaveLength(2);
  for (const source of own) {
    s.stats.energy = 100;
    expect(collectMaterialSource(s, source.sourceId, source.locationId).ok).toBe(true);
  }
  return own;
}

function completeRitual(s: GameState) {
  expect(planSeq8Ritual(s).ok).toBe(true);
  const def = SEQUENCE8_RITUAL_DEFS[s.pathwayId as keyof typeof SEQUENCE8_RITUAL_DEFS];
  def.steps.forEach((step, index) => {
    setRequirementTime(s, step.requirement, 20 + index);
    expect(performSeq8RitualStep(s, step.id).ok).toBe(true);
  });
  expect(s.sequence8Progress?.ritual.ready).toBe(true);
}

describe('扮演证据', () => {
  it('generic doAct 重复100次不产生任何消化或证据', () => {
    const s = seq9('seer');
    const before = s.digestion;
    for (let i = 0; i < 100; i++) expect(doAct(s).ok).toBe(false);
    expect(s.digestion).toBe(before);
    expect(Object.values(s.sequence8Progress!.evidence).flat()).toHaveLength(0);
  });

  it('同context永久一次且每天最多2次有效证据', () => {
    const s = seq9('hunter');
    const actions = SEQUENCE8_ACTING_DEFS.hunter.actions.filter(action => !('wrong' in action));
    setRequirementTime(s, actions[0].requirement, 2);
    expect(performActingAction(s, actions[0].id).ok).toBe(true);
    expect(performActingAction(s, actions[0].id).ok).toBe(false);
    setRequirementTime(s, actions[1].requirement, 2);
    expect(performActingAction(s, actions[1].id).ok).toBe(true);
    setRequirementTime(s, actions[2].requirement, 2);
    const denseDay = performActingAction(s, actions[2].id);
    expect(denseDay.ok).toBe(false);
    expect(denseDay.msg).not.toMatch(/每天最多\d+次|证据\s*\d+\/\d+/);
  });

  it('三原则不足不能申请审核，错误行动只记录mistake并施加代价', () => {
    const s = seq9('spectator');
    const wrong = SEQUENCE8_ACTING_DEFS.spectator.actions.find(action => 'wrong' in action)!;
    const beforeSan = s.stats.san;
    expect(performActingAction(s, wrong.id).ok).toBe(true);
    expect(s.sequence8Progress?.mistakes).toHaveLength(1);
    expect(s.stats.san).toBeLessThan(beforeSan);
    s.digestion = 100;
    expect(sequence8ReviewMissing(s).some(item => item.includes('证据不足'))).toBe(true);
    expect(requestSeq8Review(s).ok).toBe(false);
  });

  it('扮演结果保留真实代价，但日志只给叙事反馈', () => {
    const s = seq9('spectator');
    const valid = SEQUENCE8_ACTING_DEFS.spectator.actions.find(action => !('wrong' in action))!;
    const before = s.digestion;
    setRequirementTime(s, valid.requirement, 2);

    expect(performActingAction(s, valid.id).ok).toBe(true);

    expect(s.digestion).toBe(before + 16);
    expect(s.log.at(-1)?.text).not.toMatch(/消化[+−]\d+|有效扮演证据|精力[+−]\d+/);
  });
});

describe('探索优先叙事', () => {
  it('扮演界面不显示证据计数或每日机械上限', () => {
    expect(sequenceEvidenceLabel(0, 2)).toBe('尚未留下可信记录');
    expect(sequenceEvidenceLabel(1, 2)).not.toMatch(/\d+\/\d+|证据\d+/);
    expect(sequenceEvidenceLabel(2, 2)).toBe('记录已足以交叉核验');
  });

  it('冒险日志使用定性风险，不暴露危险值或属性结算', () => {
    const s = seq9('seer');
    s.stats.energy = 100;

    expect(doAdventure(s, 'market').ok).toBe(true);

    const text = s.log.map(item => item.text).join('\n');
    expect(text).not.toMatch(/风险较低|风险可感|风险较高|极其凶险/);
    expect(text).not.toMatch(/危险度\d+|污染[+−]\d+|理智[+−]\d+|检定.+vs/);
  });
});

describe('五途径序列9到序列8闭环', () => {
  it.each(PATHWAYS.map(pathway => pathway.id as keyof typeof SEQUENCE8_ACTING_DEFS))('%s 可确定性完成三原则、审核、材料、情境与晋升', pathwayId => {
    const s = seq9(pathwayId);
    const wrong = SEQUENCE8_ACTING_DEFS[pathwayId].actions.find(action => 'wrong' in action)!;
    expect(performActingAction(s, wrong.id).ok).toBe(true);
    completeEvidence(s);
    const sources = reviewAndCollect(s);
    completeRitual(s);
    expect(canPromote(s).ok).toBe(true);
    const before = Object.fromEntries(sources.map(source => [source.itemId, s.items[source.itemId]]));
    expect(doPromote(s).ok).toBe(true);
    expect(s.sequence).toBe(8);
    expect(s.sequence8Progress).toMatchObject({ stage: 'completed', ritual: { consumed: true } });
    for (const source of sources) expect(s.items[source.itemId]).toBe(before[source.itemId] - 1);
    expect(doPromote(s).ok).toBe(false);
    expect(s.sequence).toBe(8);
  });
});

describe('审核、商店与材料边界', () => {
  it('跨组织或承诺途径不一致时不能提交序列8审核', () => {
    const s = seq9('seer');
    completeEvidence(s);
    s.sequence8Progress!.organizationId = 'secret_order';
    expect(requestSeq8Review(s).ok).toBe(false);
    expect(sequence8ReviewMissing(s).some(item => item.includes('所属组织'))).toBe(true);
    s.sequence8Progress!.organizationId = 'nightwatch';
    s.organizationRoutes.nightwatch.selectedPathway = 'sleepless';
    expect(requestSeq8Review(s).ok).toBe(false);
  });

  it('通用商店不能出售序列8配方或材料，审核后只解锁当前途径两项', () => {
    const s = seq9('seer');
    s.pence = 9999;
    expect(buyFormula(s, 'seer8', 1, 'nelson').ok).toBe(false);
    expect(buyItem(s, 'goat_horn', 1, 'victor').ok).toBe(false);
    expect(Object.values(s.materialSources).filter(source => source.targetSequence === 8).every(source => !source.unlocked)).toBe(true);
    completeEvidence(s);
    requestSeq8Review(s); completeSeq8Review(s);
    const unlocked = Object.values(s.materialSources).filter(source => source.targetSequence === 8 && source.unlocked);
    expect(unlocked).toHaveLength(2);
    expect(unlocked.every(source => source.pathwayId === 'seer')).toBe(true);
  });

  it('序列8材料错误地点、耗尽与读档均fail-closed', () => {
    const s = seq9('hunter'); completeEvidence(s); requestSeq8Review(s); completeSeq8Review(s);
    const source = s.materialSources['seq8:hunter:ape_brain'];
    expect(collectMaterialSource(s, source.sourceId, 'manor').ok).toBe(false);
    s.stats.energy = 100;
    expect(collectMaterialSource(s, source.sourceId, source.locationId).ok).toBe(true);
    expect(collectMaterialSource(s, source.sourceId, source.locationId).ok).toBe(false);
    saveGame(s);
    expect(loadGame()?.materialSources[source.sourceId].remaining).toBe(0);
  });
});

describe('稳定化情境与消费时机', () => {
  it('工作期间不能制定稳定化情境计划', () => {
    const s = seq9('seer');
    s.sequence8Progress!.formulaStatus = 'verified';
    s.formulas.push('seer8');
    s.atWork = true;
    expect(planSeq8Ritual(s).ok).toBe(false);
    expect(s.sequence8Progress?.ritual.planned).toBe(false);
  });

  it('未计划、步骤不足或窗口超时都不能晋升且不消耗材料', () => {
    const s = seq9('apprentice'); completeEvidence(s); const sources = reviewAndCollect(s);
    const before = Object.fromEntries(sources.map(source => [source.itemId, s.items[source.itemId]]));
    expect(performSeq8RitualStep(s, 'stage').ok).toBe(false);
    expect(doPromote(s).ok).toBe(false);
    planSeq8Ritual(s);
    setRequirementTime(s, SEQUENCE8_RITUAL_DEFS.apprentice.steps[0].requirement, 20);
    performSeq8RitualStep(s, 'stage');
    expect(doPromote(s).ok).toBe(false);
    completeRitual(s);
    s.hour = ((s.sequence8Progress!.ritual.readyUntilHour ?? 0) + 1) % 24;
    s.day = Math.floor(((s.sequence8Progress!.ritual.readyUntilHour ?? 0) + 1) / 24) + 1;
    expect(doPromote(s).ok).toBe(false);
    for (const source of sources) expect(s.items[source.itemId]).toBe(before[source.itemId]);
  });
});

describe('v9到v10迁移与资源旁路', () => {
  function saveV9(s: GameState) {
    s.schemaVersion = 9;
    const legacy = { ...s } as Partial<GameState>;
    delete legacy.sequence8Progress;
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(legacy));
  }

  function clearRoute(s: GameState, organizationId: OrganizationId) {
    Object.assign(s.organizationRoutes[organizationId], {
      status: 'unknown', routeStep: 'none', selectedPathway: undefined, history: [],
    });
  }

  function finishLegacyAuditAndCollectBoth(old: GameState) {
    saveV9(old);
    const loaded = loadGame()!;
    expect(loaded.sequence8Progress?.legacyIdentityAudit).toBe(true);
    expect(loaded.sequence8Progress?.legacyIdentityAuditFromSchema).toBe(9);
    completeEvidence(loaded);
    expect(requestSeq8Review(loaded).ok).toBe(true);
    expect(completeSeq8Review(loaded).ok).toBe(true);
    const sources = Object.values(loaded.materialSources).filter(source => source.targetSequence === 8 && source.pathwayId === 'seer');
    expect(sources).toHaveLength(2);
    for (const source of sources) {
      loaded.stats.energy = 100;
      expect(collectMaterialSource(loaded, source.sourceId, source.locationId).ok).toBe(true);
      expect(source.remaining).toBe(0);
    }
    saveGame(loaded);
    expect(loadGame()).toEqual(loaded);
  }

  it('v9凡人保持null；序列9旧配方变legacy_unverified且required=1并幂等', () => {
    const mortal = newGame('凡人', 'clerk', []); saveV9(mortal);
    expect(loadGame()).toMatchObject({ schemaVersion: 32, sequence8Progress: null });

    const old = seq9('seer'); old.digestion = 73; old.items.goat_horn = 1; old.formulas.push('seer8'); saveV9(old);
    const loaded = loadGame()!;
    expect(loaded.digestion).toBe(73);
    expect(loaded.items.goat_horn).toBe(1);
    expect(loaded.sequence8Progress).toMatchObject({ pathwayId: 'seer', organizationId: 'nightwatch', requiredEvidencePerPrinciple: 1, formulaStatus: 'legacy_unverified' });
    expect(canPromote(loaded).ok).toBe(false);
    saveGame(loaded); expect(loadGame()).toEqual(loaded);
  });

  it('v9已序列8迁移completed且不降级', () => {
    const old = seq9('sleepless'); old.sequence = 8; old.formulas.push('sleepless8'); saveV9(old);
    const loaded = loadGame()!;
    expect(loaded).toMatchObject({ schemaVersion: 32, sequence: 8, sequence8Progress: { stage: 'completed' } });
  });

  it('v9无组织记录的序列9通过一次旧身份审计恢复完整可达性并保持幂等', () => {
    const old = seq9('seer');
    old.pathwayLeads.seer = { history: [], routeStep: 'completed', commitment: false };
    for (const route of Object.values(old.organizationRoutes)) {
      route.status = 'unknown'; route.routeStep = 'none'; route.selectedPathway = undefined; route.history = [];
    }
    saveV9(old);
    const loaded = loadGame()!;
    expect(loaded.organizationRoutes.secret_order.status).toBe('unknown');
    expect(loaded.sequence8Progress).toMatchObject({
      organizationId: 'secret_order', legacyIdentityAudit: true, legacyIdentityAuditFromSchema: 9,
    });
    completeEvidence(loaded);
    expect(requestSeq8Review(loaded).ok).toBe(true);
    expect(completeSeq8Review(loaded).ok).toBe(true);
    expect(loaded.sequence8Progress).toMatchObject({ legacyIdentityAudit: false, formulaStatus: 'verified' });
    expect(loaded.organizationRoutes.secret_order.status).toBe('unknown');
    const source = loaded.materialSources['seq8:seer:goat_horn'];
    loaded.stats.energy = 100;
    expect(collectMaterialSource(loaded, source.sourceId, source.locationId).ok).toBe(true);
    saveGame(loaded);
    expect(loadGame()).toEqual(loaded);
  });

  it.each([
    ['route-only', (old: GameState) => {
      old.pathwayLeads.seer = { history: [], routeStep: 'completed', commitment: false };
    }],
    ['lead-only', (old: GameState) => {
      clearRoute(old, 'nightwatch');
    }],
    ['route与lead不同组织', (old: GameState) => {
      old.pathwayLeads.seer.organizationId = 'secret_order';
      old.pathwayLeads.seer.commitment = true;
    }],
    ['selectedPathway冲突', (old: GameState) => {
      old.organizationRoutes.nightwatch.selectedPathway = 'sleepless';
    }],
  ] as Array<[string, (old: GameState) => void]>)('v9组织矩阵：%s必须审计且审计后两材料均可领取', (_name, mutate) => {
    const old = seq9('seer');
    mutate(old);
    finishLegacyAuditAndCollectBoth(old);
  });

  it('v9 route与lead双向一致时不生成审计且审核后材料正常领取', () => {
    const old = seq9('seer');
    saveV9(old);
    const loaded = loadGame()!;
    expect(loaded.sequence8Progress).toMatchObject({ organizationId: 'nightwatch', legacyIdentityAudit: false });
    completeEvidence(loaded);
    expect(requestSeq8Review(loaded).ok).toBe(true);
    expect(completeSeq8Review(loaded).ok).toBe(true);
    const sources = Object.values(loaded.materialSources).filter(source => source.targetSequence === 8 && source.pathwayId === 'seer');
    expect(sources).toHaveLength(2);
    for (const source of sources) {
      loaded.stats.energy = 100;
      expect(collectMaterialSource(loaded, source.sourceId, source.locationId).ok).toBe(true);
    }
  });

  it.each([
    ['sleepless', 'nightwatch'], ['spectator', 'psychology_alchemists'], ['hunter', 'iron_and_blood'],
    ['apprentice', 'abraham_branch'], ['seer', 'secret_order'],
  ] as const)('v9无可信组织的%s采用默认审计组织%s', (pathwayId, organizationId) => {
    const old = seq9(pathwayId);
    old.pathwayLeads[pathwayId] = { history: [], routeStep: 'completed', commitment: false };
    for (const route of Object.values(old.organizationRoutes)) {
      route.status = 'unknown'; route.routeStep = 'none'; route.selectedPathway = undefined; route.history = [];
    }
    saveV9(old);
    expect(loadGame()?.sequence8Progress).toMatchObject({ organizationId, legacyIdentityAudit: true });
  });

  it('旧先知存在值夜者标签时优先交由nightwatch审计', () => {
    const old = seq9('seer');
    old.pathwayLeads.seer = { history: [], routeStep: 'completed', commitment: false };
    for (const route of Object.values(old.organizationRoutes)) {
      route.status = 'unknown'; route.routeStep = 'none'; route.selectedPathway = undefined; route.history = [];
    }
    old.tags.push('night_watcher');
    saveV9(old);
    expect(loadGame()?.sequence8Progress).toMatchObject({ organizationId: 'nightwatch', legacyIdentityAudit: true });
  });

  it('v10新角色不能靠伪造单一legacyIdentityAudit布尔值绕过组织承诺', () => {
    const s = seq9('seer');
    s.pathwayLeads.seer = { history: [], routeStep: 'completed', commitment: false };
    s.organizationRoutes.nightwatch.status = 'unknown';
    s.organizationRoutes.nightwatch.selectedPathway = undefined;
    s.sequence8Progress!.organizationId = 'secret_order';
    s.sequence8Progress!.legacyIdentityAudit = true;
    completeEvidence(s);
    expect(requestSeq8Review(s).ok).toBe(false);
    saveGame(s);
    const loaded = loadGame()!;
    expect(loaded.sequence8Progress?.legacyIdentityAudit).toBe(false);
    expect(requestSeq8Review(loaded).ok).toBe(false);
  });

  it('普通学习、日记译读与普通冒险不赠序列8配方或解锁资源', () => {
    const s = newGame('普通人', 'clerk', []);
    for (let i = 0; i < 20; i++) { s.stats.energy = 100; doStudy(s); }
    researchClocktowerRumors(s); discoverDiaryPage(s, 'diary_org_rules'); decodeDiaryPage(s, 'diary_org_rules');
    s.visitedLocations.push('manor');
    s.stats.energy = 100; doAdventure(s, 'manor');
    expect(s.formulas.some(formula => formula.endsWith('8'))).toBe(false);
    expect(Object.values(s.materialSources).filter(source => source.targetSequence === 8).every(source => !source.unlocked && source.remaining === 1)).toBe(true);
  });
});
