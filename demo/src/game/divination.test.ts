import { beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('尼尔逊受信任、作息和费用约束；伊芙琳只受理已登记的官方范围', () => {
    const s = fresh(); unlockTower(s); s.day = 2; s.hour = 10; s.relations.nelson = 45; s.pence = 0;
    expect(divinationIssue(s, 'location', 'old_tower', 'cards', 'nelson')).toMatch(/付不起/);
    s.pence = 100;
    expect(divinationIssue(s, 'location', 'old_tower', 'cards', 'nelson')).toBeNull();
    s.hour = 21;
    expect(divinationIssue(s, 'location', 'old_tower', 'cards', 'nelson')).toMatch(/作息/);

    s.hour = 10; s.relations.evelyn = 20;
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
    expect(loadGame()).toMatchObject({ schemaVersion: 20, divinationTraining: { cards: false, dream: false }, divinationAttempts: [], divinationInsights: [] });

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
