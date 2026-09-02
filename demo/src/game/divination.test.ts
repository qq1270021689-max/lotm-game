import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DIVINATION_METHOD_DEFS, EXPLORATION_CHECKS } from './data';
import type { GameState } from './types';
import {
  acquireClue,
  checkCond,
  divinationIssue,
  evaluateDivination,
  evaluateExplorationCheck,
  itemPresentation,
  learnCardDivination,
  loadGame,
  newGame,
  performDivination,
  saveGame,
} from './engine';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
}

const fresh = () => newGame('占卜测试者', 'clerk', []);
const unlockTower = (s: GameState) => acquireClue(s, 'clocktower_public_complaints', 'public_records', 'test');

function teachable() {
  const s = fresh();
  s.day = 2;
  s.hour = 10;
  s.relations.nelson = 45;
  s.stats.energy = 100;
  return s;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('占卜资格、目标与确定性', () => {
  it('普通人的神秘学知识、技能和罗塞尔文字阅读能力都不自动授予占卜资格', () => {
    const s = fresh();
    s.knowledge.push('occult_theory');
    s.skills.occult = 10;
    s.stats.spi = 100;
    unlockTower(s);
    expect(s.canReadRoselleScript).toBe(true);
    expect(divinationIssue(s, 'location', 'old_tower', 'cards', 'self')).toMatch(/可信教学/);
    expect(divinationIssue(s, 'location', 'old_tower', 'dream', 'self')).toMatch(/正式训练/);
  });

  it('可信且在场的尼尔逊能教授安全纸牌并给出固定媒介', () => {
    const s = teachable();
    expect(learnCardDivination(s).ok).toBe(true);
    expect(s.divinationTraining).toMatchObject({ cards: true, dream: false });
    expect(s.divinationTraining.teachers).toContain('nelson');
    expect(s.items.symbol_cards).toBe(1);
  });

  it('序列9与序列8占卜家均可保留梦境占卜，其他途径不会自动获得资格', () => {
    const seer = fresh(); unlockTower(seer);
    seer.pathwayId = 'seer'; seer.sequence = 9;
    seer.divinationTraining = { cards: true, dream: true, media: ['symbol_cards'], teachers: ['formal_seer_training'] };
    seer.divinationCredentials = [
      { kind: 'training', source: 'formal_seer_training', method: 'cards', day: 1, hour: 7 },
      { kind: 'training', source: 'formal_seer_training', method: 'dream', day: 1, hour: 7 },
    ];
    seer.items.symbol_cards = 1;
    expect(divinationIssue(seer, 'location', 'old_tower', 'dream', 'self')).toBeNull();

    seer.sequence = 8;
    expect(divinationIssue(seer, 'location', 'old_tower', 'dream', 'self')).toBeNull();

    const hunter = structuredClone(seer);
    hunter.pathwayId = 'hunter';
    hunter.divinationTraining.dream = false;
    hunter.divinationTraining.teachers = ['nelson'];
    hunter.divinationCredentials = [{ kind: 'training', source: 'nelson', method: 'cards', day: 1, hour: 7 }];
    hunter.relations.nelson = 45;
    expect(divinationIssue(hunter, 'location', 'old_tower', 'cards', 'self')).toBeNull();
    expect(divinationIssue(hunter, 'location', 'old_tower', 'dream', 'self')).toMatch(/占卜家/);
  });

  it('锁定与伪造目标返回同一泛化错误且零状态变化', () => {
    const s = teachable();
    learnCardDivination(s);
    const before = structuredClone(s);
    const locked = performDivination(s, 'location', 'old_tower', 'cards', 'self');
    const forged = performDivination(s, 'item', 'forged_relic', 'cards', 'self');
    expect(locked).toEqual(forged);
    expect(locked.ok).toBe(false);
    expect(s).toEqual(before);
  });

  it('相同状态重复一百次结果一致；属性、技能、线索与干扰均参与但不随机', () => {
    const s = teachable();
    learnCardDivination(s);
    unlockTower(s);
    const baseline = evaluateDivination(s, 'location', 'old_tower', 'cards', 'self')!;
    for (let i = 0; i < 100; i++) expect(evaluateDivination(s, 'location', 'old_tower', 'cards', 'self')).toEqual(baseline);

    const bySpirit = structuredClone(s); bySpirit.stats.spi = 30;
    const bySkill = structuredClone(s); bySkill.skills.occult = 4;
    const byClue = structuredClone(s); acquireClue(byClue, 'clocktower_repair_orders', 'archive', 'test');
    expect(evaluateDivination(bySpirit, 'location', 'old_tower', 'cards', 'self')!.score).toBeGreaterThan(baseline.score);
    expect(evaluateDivination(bySkill, 'location', 'old_tower', 'cards', 'self')!.score).toBeGreaterThan(baseline.score);
    expect(evaluateDivination(byClue, 'location', 'old_tower', 'cards', 'self')!.score).toBeGreaterThan(baseline.score);
    bySpirit.flags.jammed = 1;
    expect(evaluateDivination(bySpirit, 'location', 'old_tower', 'cards', 'self')!.outcome).toBe('obscured');
  });

  it('自行占卜精确组合灵性、神秘学、方法、相关道具与占卜家固定职业值', () => {
    const folk = teachable();
    learnCardDivination(folk);
    unlockTower(folk);
    folk.stats.spi = 20;
    folk.skills.occult = 2;
    const cards = DIVINATION_METHOD_DEFS.find(def => def.id === 'cards')!;
    const baseline = evaluateDivination(folk, 'location', 'old_tower', 'cards', 'self')!.score;
    expect(baseline).toBe(20 + 2 * 4 + cards.baseValue + 4 + 4);

    const bySpirit = structuredClone(folk); bySpirit.stats.spi += 1;
    const bySkill = structuredClone(folk); bySkill.skills.occult += 1;
    const byTool = structuredClone(folk); byTool.items.ritual_chalk = 1;
    const unrelated = structuredClone(folk); unrelated.items.blank_charm_paper = 1;
    expect(evaluateDivination(bySpirit, 'location', 'old_tower', 'cards', 'self')!.score - baseline).toBe(1);
    expect(evaluateDivination(bySkill, 'location', 'old_tower', 'cards', 'self')!.score - baseline).toBe(4);
    expect(evaluateDivination(byTool, 'location', 'old_tower', 'cards', 'self')!.score - baseline).toBe(2);
    expect(evaluateDivination(unrelated, 'location', 'old_tower', 'cards', 'self')!.score).toBe(baseline);

    const sequence9 = structuredClone(folk); sequence9.pathwayId = 'seer'; sequence9.sequence = 9;
    const sequence8 = structuredClone(sequence9); sequence8.sequence = 8;
    expect(evaluateDivination(sequence9, 'location', 'old_tower', 'cards', 'self')!.score - baseline).toBe(2);
    expect(evaluateDivination(sequence8, 'location', 'old_tower', 'cards', 'self')!.score - baseline).toBe(2);
  });

  it('NPC代占不读取玩家属性、技能、物品或占卜家职业值', () => {
    const state = fresh();
    unlockTower(state);
    state.day = 2; state.hour = 11; state.relations.nelson = 45; state.pence = 100;
    state.npcVisitSession = { npcId: 'nelson', startedDay: 2, startedHour: 10, day: 2, hour: 11 };
    const baseline = evaluateDivination(state, 'location', 'old_tower', 'cards', 'nelson')!.score;
    const changed = structuredClone(state);
    changed.stats.spi = 100;
    changed.skills.occult = 10;
    changed.items.symbol_cards = 1;
    changed.items.ritual_chalk = 1;
    changed.pathwayId = 'seer';
    changed.sequence = 9;
    expect(evaluateDivination(changed, 'location', 'old_tower', 'cards', 'nelson')!.score).toBe(baseline);
  });

  it('真正占卜的统一CheckDef均含属性、技能、媒介与恰好+2的占卜家贡献', () => {
    for (const checkId of [
      'club_commission_lost_keepsake', 'club_commission_journey_omen',
      'club_commission_recurring_nightmare', 'elliot_locator_divination',
    ]) {
      const check = EXPLORATION_CHECKS.find(def => def.id === checkId)!;
      expect(check.contributions.some(term => term.kind === 'stat')).toBe(true);
      expect(check.contributions.some(term => term.kind === 'skill')).toBe(true);
      expect(check.contributions.some(term => term.kind === 'tool')).toBe(true);
      expect(check.contributions).toContainEqual(expect.objectContaining({ kind: 'ability', id: 'seer_divination', value: 2 }));
    }
    const accept = EXPLORATION_CHECKS.find(def => def.id === 'club_accept_lost_keepsake')!;
    expect(accept.contributions).not.toContainEqual(expect.objectContaining({ kind: 'ability', id: 'seer_divination', value: 2 }));
  });

  it('读档按保存的公式输入重算历史占卜，伪造score不能成为权威', () => {
    const state = teachable();
    learnCardDivination(state);
    state.items.anomaly_evidence = 1;
    state.stats.spi = 50;
    expect(performDivination(state, 'item', 'anomaly_evidence', 'cards', 'self')).toMatchObject({ ok: true, outcome: 'passed' });
    const canonicalScore = state.divinationAttempts.at(-1)!.score;
    state.divinationAttempts.at(-1)!.score = 999;
    saveGame(state);
    const loaded = loadGame()!;
    expect(loaded.divinationAttempts).toHaveLength(1);
    expect(loaded.divinationAttempts[0].score).toBe(canonicalScore);
    expect(loaded.divinationAttempts[0].score).not.toBe(999);
    expect(loaded.divinationInsights).toHaveLength(1);
    expect(loaded.log.some(entry => /score|分数|检定值|999/.test(entry.text))).toBe(false);
    saveGame(loaded);
    expect(loadGame()).toEqual(loaded);
  });

  it('合法v23成功占卜在当前状态变化后仍保留历史记录、线索与物品辨认，二次读档幂等', () => {
    const state = teachable();
    learnCardDivination(state);
    state.items.cryptic_note = 1;
    state.stats.spi = 50;
    expect(performDivination(state, 'item', 'cryptic_note', 'cards', 'self')).toMatchObject({ ok: true, outcome: 'passed' });
    const historicalScore = state.divinationAttempts[0].score;
    const historicalDay = state.divinationAttempts[0].day;
    const historicalHour = state.divinationAttempts[0].hour;
    state.schemaVersion = 23;
    delete state.divinationAttempts[0].scoreInput;
    // These are all legal changes after the historical attempt.  None of them
    // may be treated as inputs that existed when the attempt was made.
    state.stats.spi = 1;
    state.skills.occult = 0;
    state.items.symbol_cards = 0;
    state.stats.san = 10;
    state.stats.cor = 80;
    state.flags.jammed = 1;
    acquireClue(state, 'clocktower_repair_orders', 'archive', 'later evidence');
    saveGame(state);
    const migrated = loadGame()!;
    expect(migrated.schemaVersion).toBe(32);
    expect(migrated.divinationAttempts).toHaveLength(1);
    expect(migrated.divinationAttempts[0].score).toBe(historicalScore);
    expect(migrated.divinationAttempts[0].scoreInput).toEqual({
      version: 23,
      provenance: 'validated_v23_attempt',
      validatedScore: historicalScore,
      targetKind: 'item',
      targetId: 'cryptic_note',
      method: 'cards',
      provider: 'self',
      outcome: 'hint',
      day: historicalDay,
      hour: historicalHour,
    });
    expect(migrated.divinationInsights).toHaveLength(1);
    expect(checkCond(migrated, 'clue:cryptic_note_warning')).toBe(true);
    expect(migrated.itemKnowledge.cryptic_note).toMatchObject({ identifiedAsOccult: true });
    saveGame(migrated);
    expect(loadGame()).toEqual(migrated);
  });

  it('v23结果与旧分数阈值矛盾时不会因迁移标记而被保留', () => {
    const state = teachable();
    learnCardDivination(state);
    state.items.cryptic_note = 1;
    state.stats.spi = 50;
    expect(performDivination(state, 'item', 'cryptic_note', 'cards', 'self')).toMatchObject({ ok: true, outcome: 'passed' });
    state.schemaVersion = 23;
    delete state.divinationAttempts[0].scoreInput;
    state.divinationAttempts[0].outcome = 'backlash';
    state.divinationInsights[0].outcome = 'backlash';
    saveGame(state);
    const loaded = loadGame()!;
    expect(loaded.divinationAttempts).toEqual([]);
    expect(loaded.divinationInsights).toEqual([]);
  });

  it('迁移凭据绑定原始结果，v24中篡改outcome会清除整组历史记录', () => {
    const state = teachable();
    learnCardDivination(state);
    state.items.cryptic_note = 1;
    state.stats.spi = 50;
    expect(performDivination(state, 'item', 'cryptic_note', 'cards', 'self')).toMatchObject({ ok: true, outcome: 'passed' });
    state.schemaVersion = 23;
    delete state.divinationAttempts[0].scoreInput;
    saveGame(state);
    const migrated = loadGame()!;
    migrated.divinationAttempts[0].outcome = 'backlash';
    migrated.divinationInsights[0].outcome = 'backlash';
    saveGame(migrated);
    const reloaded = loadGame()!;
    expect(reloaded.divinationAttempts).toEqual([]);
    expect(reloaded.divinationInsights).toEqual([]);
  });

  it('v24缺少公式快照的占卜记录按fail-closed清除', () => {
    const state = teachable();
    learnCardDivination(state);
    state.items.anomaly_evidence = 1;
    state.stats.spi = 50;
    expect(performDivination(state, 'item', 'anomaly_evidence', 'cards', 'self')).toMatchObject({ ok: true });
    state.schemaVersion = 24;
    delete state.divinationAttempts[0].scoreInput;
    saveGame(state);
    const loaded = loadGame()!;
    expect(loaded.divinationAttempts).toEqual([]);
    expect(loaded.divinationInsights).toEqual([]);
  });

  it('低风险纸牌失败无结果，高压残页失败反噬且合法尝试才付出代价', () => {
    const low = teachable(); learnCardDivination(low); unlockTower(low);
    const lowSan = low.stats.san;
    expect(performDivination(low, 'location', 'old_tower', 'cards', 'self')).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(low.divinationAttempts.at(-1)?.outcome).toBe('inconclusive');
    expect(low.stats.san).toBe(lowSan);

    const high = teachable(); learnCardDivination(high); high.items.cryptic_note = 1; high.stats.spi = 1;
    const beforeSan = high.stats.san;
    expect(performDivination(high, 'item', 'cryptic_note', 'cards', 'self').ok).toBe(true);
    expect(high.divinationAttempts.at(-1)?.outcome).toBe('backlash');
    expect(high.stats.san).toBeLessThan(beforeSan);
  });
});

describe('线索、NPC代占与表面信息', () => {
  it('成功的钟楼预兆成为检定线索并能改变后续探索结果', () => {
    const s = teachable(); learnCardDivination(s); unlockTower(s);
    s.stats.spi = 35;
    s.stats.mnd = 22;
    expect(evaluateExplorationCheck(s, 'clocktower_night_trace').outcome).toBe('blocked');
    expect(performDivination(s, 'location', 'old_tower', 'cards', 'self')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(checkCond(s, 'clue:clocktower_divination_omen')).toBe(true);
    expect(evaluateExplorationCheck(s, 'clocktower_night_trace').outcome).toBe('passed');
  });

  it('残页成功产生警告线索并排入一次性事件，不产生配方或能力', () => {
    const s = teachable(); learnCardDivination(s); s.items.cryptic_note = 1; s.stats.spi = 50;
    const formulas = [...s.formulas];
    expect(performDivination(s, 'item', 'cryptic_note', 'cards', 'self').outcome).toBe('passed');
    expect(checkCond(s, 'clue:cryptic_note_warning')).toBe(true);
    expect(s.pendingEvent).toBe('divination_note_echo');
    expect(s.formulas).toEqual(formulas);
    expect(s.pathwayId).toBeNull();
  });

  it('尼尔逊受会面和费用约束；伊芙琳只受理已登记的官方范围', () => {
    const s = fresh(); unlockTower(s); s.day = 2; s.hour = 10; s.relations.nelson = 45; s.pence = 0;
    expect(divinationIssue(s, 'location', 'old_tower', 'cards', 'nelson')).toMatch(/拜访交谈/);
    s.hour = 11;
    s.npcVisitSession = { npcId: 'nelson', startedDay: 2, startedHour: 10, day: 2, hour: 11 };
    expect(divinationIssue(s, 'location', 'old_tower', 'cards', 'nelson')).toMatch(/付不起/);
    s.pence = 100;
    expect(divinationIssue(s, 'location', 'old_tower', 'cards', 'nelson')).toBeNull();
    s.hour = 21;
    expect(divinationIssue(s, 'location', 'old_tower', 'cards', 'nelson')).toMatch(/拜访交谈/);

    s.hour = 10; s.relations.evelyn = 20;
    s.npcVisitSession = { npcId: 'evelyn', startedDay: 2, startedHour: 9, day: 2, hour: 10 };
    expect(divinationIssue(s, 'location', 'old_tower', 'cards', 'evelyn')).toMatch(/正式异常记录/);
    s.awareness = 'informed';
    expect(divinationIssue(s, 'location', 'old_tower', 'cards', 'evelyn')).toBeNull();
    s.items.cryptic_note = 1;
    expect(divinationIssue(s, 'item', 'cryptic_note', 'cards', 'evelyn')).toMatch(/官方异常或证物范围/);
  });

  it('物品表面文案在辨认前不泄露危害，成功后只追加象征提示', () => {
    const s = teachable(); learnCardDivination(s); s.items.cryptic_note = 1; s.items.scorpion_sting = 1;
    expect(itemPresentation(s, 'cryptic_note')?.description).not.toMatch(/蠕动|配方|危害/);
    expect(itemPresentation(s, 'scorpion_sting')?.description).not.toMatch(/死于|怒火/);
    s.stats.spi = 50;
    performDivination(s, 'item', 'cryptic_note', 'cards', 'self');
    expect(itemPresentation(s, 'cryptic_note')?.description).toMatch(/占卜记录/);
  });
});

describe('v14迁移', () => {
  it('普通人不获资格，占卜家补正式训练与媒介，重复读档幂等', () => {
    const ordinary = fresh() as GameState & { divinationTraining?: GameState['divinationTraining']; divinationInsights?: GameState['divinationInsights']; divinationAttempts?: GameState['divinationAttempts'] };
    ordinary.schemaVersion = 13;
    ordinary.skills.occult = 10;
    ordinary.knowledge.push('occult_theory');
    delete (ordinary as Partial<GameState>).divinationTraining;
    delete (ordinary as Partial<GameState>).divinationInsights;
    delete (ordinary as Partial<GameState>).divinationAttempts;
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(ordinary));
    expect(loadGame()).toMatchObject({ schemaVersion: 32, divinationTraining: { cards: false, dream: false }, divinationAttempts: [], divinationInsights: [] });

    const seer = fresh() as typeof ordinary;
    seer.schemaVersion = 13; seer.pathwayId = 'seer'; seer.sequence = 8;
    delete (seer as Partial<GameState>).divinationTraining;
    delete (seer as Partial<GameState>).divinationInsights;
    delete (seer as Partial<GameState>).divinationAttempts;
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(seer));
    const first = loadGame()!;
    expect(first.divinationTraining).toMatchObject({ cards: true, dream: true });
    expect(first.items.symbol_cards).toBe(1);
    saveGame(first);
    expect(loadGame()).toEqual(first);

    const hunter = fresh() as typeof ordinary;
    hunter.schemaVersion = 13; hunter.pathwayId = 'hunter'; hunter.sequence = 8;
    delete (hunter as Partial<GameState>).divinationTraining;
    delete (hunter as Partial<GameState>).divinationInsights;
    delete (hunter as Partial<GameState>).divinationAttempts;
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(hunter));
    expect(loadGame()?.divinationTraining).toMatchObject({ cards: false, dream: false, media: [], teachers: [] });
  });
});
