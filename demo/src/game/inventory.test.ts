import { beforeEach, describe, expect, it, vi } from 'vitest';
import appSource from '../App.tsx?raw';
import { findItem } from './data';
import type { GameState } from './types';
import {
  getInventoryEntries,
  hasSpiritVisionAbility,
  inspectItemWithSpiritVision,
  itemPresentation,
  learnCardDivination,
  divinationIssue,
  loadGame,
  newGame,
  performDivination,
  saveGame,
  spiritVisionInspectionIssue,
} from './engine';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
}

const fresh = () => newGame('物品栏测试者', 'clerk', []);

function trainedSeer() {
  const state = fresh();
  state.pathwayId = 'seer';
  state.sequence = 9;
  state.awareness = 'informed';
  state.knowledge.push('spirit_vision');
  state.divinationTraining = { cards: true, dream: true, media: ['symbol_cards'], teachers: ['formal_seer_training'] };
  state.divinationCredentials = [
    { kind: 'training', source: 'formal_seer_training', method: 'cards', day: 1, hour: 7 },
    { kind: 'training', source: 'formal_seer_training', method: 'dream', day: 1, hour: 7 },
  ];
  state.items.symbol_cards = 1;
  state.stats.spi = 60;
  state.stats.energy = 100;
  return state;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('权威分类与玩家可见分类', () => {
  it('普通人只看到表面分类，书籍进入统一物品栏且沿用阅读动作', () => {
    const state = fresh();
    state.items.revolver = 1;
    state.items.whiskey = 2;
    state.items.cryptic_note = 1;
    state.items.anomaly_evidence = 1;
    state.books.municipal_archive_manual.acquired = true;
    const entries = getInventoryEntries(state);

    expect(findItem('cryptic_note')?.category).toBe('occult');
    expect(entries.find(entry => entry.id === 'revolver')?.category).toBe('tool');
    expect(entries.find(entry => entry.id === 'municipal_archive_manual')).toMatchObject({ category: 'book', actions: { read: true } });
    expect(entries.find(entry => entry.id === 'whiskey')).toMatchObject({ category: 'misc', quantity: 2 });
    expect(entries.find(entry => entry.id === 'cryptic_note')).toMatchObject({ category: 'misc', name: '泛黄的手抄纸' });
    expect(entries.find(entry => entry.id === 'anomaly_evidence')?.category).toBe('misc');
    expect(entries.some(entry => entry.category === 'occult')).toBe(false);
    expect(entries.map(entry => `${entry.name} ${entry.description}`).join(' ')).not.toMatch(/字迹仿佛在缓慢蠕动|教会编号|超凡物品/);
  });

  it('普通酒与左轮没有神秘操作，未受训普通人也不会看见异常物占卜入口', () => {
    const state = fresh();
    state.items.whiskey = 1;
    state.items.revolver = 1;
    state.items.cryptic_note = 1;
    for (const id of ['whiskey', 'revolver', 'cryptic_note']) {
      expect(getInventoryEntries(state).find(entry => entry.id === id)?.actions)
        .toMatchObject({ spiritVision: false, divination: false });
    }
  });
});

describe('灵视检视与持久化信息', () => {
  it('高灵性、理论知识或伪造知识都不能冒充真正灵视能力', () => {
    const ordinary = fresh();
    ordinary.items.anomaly_evidence = 1;
    ordinary.stats.spi = 100;
    ordinary.skills.occult = 10;
    ordinary.knowledge.push('occult_theory', 'spirit_vision');
    const before = structuredClone(ordinary);

    expect(hasSpiritVisionAbility(ordinary)).toBe(false);
    expect(inspectItemWithSpiritVision(ordinary, 'anomaly_evidence')).toMatchObject({ ok: false });
    expect(ordinary).toEqual(before);

    const untrainedBeyonder = structuredClone(ordinary);
    untrainedBeyonder.pathwayId = 'hunter';
    untrainedBeyonder.sequence = 9;
    untrainedBeyonder.knowledge = untrainedBeyonder.knowledge.filter(id => id !== 'spirit_vision');
    expect(spiritVisionInspectionIssue(untrainedBeyonder, 'anomaly_evidence')).toMatch(/尚未真正掌握灵视/);
  });

  it('灵视对铜牌、残页与纸牌给出不同固定记录，普通物品没有结果', () => {
    const base = trainedSeer();
    base.items.anomaly_evidence = 1;
    base.items.cryptic_note = 1;
    base.items.whiskey = 1;

    const evidence = structuredClone(base);
    expect(inspectItemWithSpiritVision(evidence, 'anomaly_evidence')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(evidence.itemKnowledge.anomaly_evidence.knownInfo.join(' ')).toMatch(/黑夜气息|教会编号/);
    expect(getInventoryEntries(evidence).find(entry => entry.id === 'anomaly_evidence')?.category).toBe('occult');

    const note = structuredClone(base);
    const sanity = note.stats.san;
    expect(inspectItemWithSpiritVision(note, 'cryptic_note').ok).toBe(true);
    expect(note.itemKnowledge.cryptic_note.knownInfo.join(' ')).toMatch(/反过来辨认你|不要独自朗读/);
    expect(note.stats.san).toBeLessThan(sanity);

    const cards = structuredClone(base);
    expect(inspectItemWithSpiritVision(cards, 'symbol_cards').ok).toBe(true);
    expect(cards.itemKnowledge.symbol_cards).toMatchObject({ spiritVisionInspected: true, identifiedAsOccult: false });
    expect(cards.itemKnowledge.symbol_cards.knownInfo.join(' ')).toMatch(/媒介，不是力量来源/);

    const whiskey = structuredClone(base);
    expect(inspectItemWithSpiritVision(whiskey, 'whiskey')).toMatchObject({ ok: false });
    expect(whiskey.itemKnowledge.whiskey).toBeUndefined();
  });
});

describe('物品专属占卜与失败边界', () => {
  it('码头硬质薄片未鉴定时只呈现普通外观，灵视与两种占卜分别给出有限方向', () => {
    const ordinary = fresh();
    ordinary.items.dock_scale_evidence = 1;
    expect(getInventoryEntries(ordinary).find(entry => entry.id === 'dock_scale_evidence')).toMatchObject({
      category: 'misc', name: '沾水的硬质薄片',
    });
    expect(itemPresentation(ordinary, 'dock_scale_evidence')?.description).not.toMatch(/超凡|途径|组织|具体生物|危险等级/);

    const inspected = trainedSeer();
    inspected.items.dock_scale_evidence = 1;
    expect(inspectItemWithSpiritVision(inspected, 'dock_scale_evidence')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(inspected.itemKnowledge.dock_scale_evidence.knownInfo.join(' ')).toMatch(/旧仓区.*无法据此辨认来源/);
    expect(getInventoryEntries(inspected).find(entry => entry.id === 'dock_scale_evidence')?.category).toBe('occult');

    const cards = trainedSeer(); cards.items.dock_scale_evidence = 1;
    const dream = trainedSeer(); dream.items.dock_scale_evidence = 1;
    expect(performDivination(cards, 'item', 'dock_scale_evidence', 'cards', 'self')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(performDivination(dream, 'item', 'dock_scale_evidence', 'dream', 'self')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(cards.divinationInsights.at(-1)?.text).toMatch(/货箱.*旧仓区|货运备份/);
    expect(dream.divinationInsights.at(-1)?.text).toMatch(/旧仓门.*方向|撤离路线/);
    expect(cards.divinationInsights.at(-1)?.text).not.toBe(dream.divinationInsights.at(-1)?.text);
  });

  it('同一物品按纸牌与梦境方法取得可审计的不同专属结果', () => {
    const cards = trainedSeer();
    cards.items.anomaly_evidence = 1;
    expect(performDivination(cards, 'item', 'anomaly_evidence', 'cards', 'self')).toMatchObject({ ok: true, outcome: 'passed' });
    const cardsText = cards.divinationInsights.at(-1)!.text;

    const dream = trainedSeer();
    dream.items.anomaly_evidence = 1;
    expect(performDivination(dream, 'item', 'anomaly_evidence', 'dream', 'self')).toMatchObject({ ok: true, outcome: 'passed' });
    const dreamText = dream.divinationInsights.at(-1)!.text;

    expect(cardsText).toMatch(/门槛|守夜/);
    expect(dreamText).toMatch(/黑手套|编号柜/);
    expect(cardsText).not.toBe(dreamText);
    expect(getInventoryEntries(cards).find(entry => entry.id === 'anomaly_evidence')?.category).toBe('occult');

    const symbol = trainedSeer();
    expect(performDivination(symbol, 'item', 'symbol_cards', 'cards', 'self')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(symbol.divinationInsights.at(-1)?.text).toMatch(/答案来自方法、问题与已有信息/);
  });

  it('无结果、遮蔽或反噬不会伪造成功知识或揭露真实分类', () => {
    const state = trainedSeer();
    state.items.cryptic_note = 1;
    state.stats.spi = 1;

    expect(performDivination(state, 'item', 'cryptic_note', 'cards', 'self')).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(state.divinationAttempts.at(-1)?.outcome).toBe('backlash');
    expect(state.itemKnowledge.cryptic_note?.identifiedAsOccult).not.toBe(true);
    expect(getInventoryEntries(state).find(entry => entry.id === 'cryptic_note')?.category).toBe('misc');
    expect(itemPresentation(state, 'cryptic_note')?.description).not.toMatch(/不要独自朗读|反过来辨认/);

    const obscured = trainedSeer();
    obscured.items.anomaly_evidence = 1;
    obscured.flags.jammed = 1;
    expect(performDivination(obscured, 'item', 'anomaly_evidence', 'cards', 'self')).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(obscured.divinationAttempts.at(-1)?.outcome).toBe('obscured');
    expect(obscured.itemKnowledge.anomaly_evidence?.identifiedAsOccult).not.toBe(true);

    const inconclusive = trainedSeer();
    inconclusive.stats.spi = 1;
    expect(performDivination(inconclusive, 'item', 'symbol_cards', 'cards', 'self')).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(inconclusive.divinationAttempts.at(-1)?.outcome).toBe('inconclusive');
    expect(inconclusive.itemKnowledge.symbol_cards).toBeUndefined();
  });
});

describe('v17迁移、往返与UI规则入口', () => {
  it('旧占卜家补真实灵视能力，普通人和其他途径不获得；识别记录往返幂等', () => {
    const ordinary = fresh();
    ordinary.schemaVersion = 16;
    ordinary.knowledge.push('spirit_vision');
    delete (ordinary as Partial<GameState>).itemKnowledge;
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(ordinary));
    const loadedOrdinary = loadGame()!;
    expect(loadedOrdinary.schemaVersion).toBe(19);
    expect(loadedOrdinary.knowledge).not.toContain('spirit_vision');
    expect(loadedOrdinary.itemKnowledge).toEqual({});

    const beyonder = trainedSeer();
    beyonder.schemaVersion = 16;
    beyonder.knowledge = beyonder.knowledge.filter(id => id !== 'spirit_vision');
    beyonder.items.anomaly_evidence = 1;
    delete (beyonder as Partial<GameState>).itemKnowledge;
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(beyonder));
    const migrated = loadGame()!;
    expect(hasSpiritVisionAbility(migrated)).toBe(true);
    expect(inspectItemWithSpiritVision(migrated, 'anomaly_evidence').ok).toBe(true);
    saveGame(migrated);
    const restored = loadGame()!;
    expect(restored).toEqual(migrated);
    expect(restored.itemKnowledge.anomaly_evidence.knownInfo).toHaveLength(1);

    const hunter = fresh();
    hunter.schemaVersion = 16;
    hunter.pathwayId = 'hunter';
    hunter.sequence = 9;
    hunter.knowledge.push('spirit_vision');
    hunter.divinationTraining.teachers.push('formal_seer_training');
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(hunter));
    const migratedHunter = loadGame()!;
    expect(migratedHunter.knowledge).not.toContain('spirit_vision');
    expect(hasSpiritVisionAbility(migratedHunter)).toBe(false);
  });

  it('丢弃伪造识别文本、未知物品和没有合法尝试支撑的成功占卜', () => {
    const forged = trainedSeer();
    forged.items.cryptic_note = 1;
    forged.itemKnowledge = {
      cryptic_note: {
        itemId: 'cryptic_note', spiritVisionInspected: true, identifiedAsOccult: true,
        knownInfo: ['伪造：这是一份完整魔药配方，且绝对安全。'], inspectedDay: 1, inspectedHour: 9,
      },
      imaginary_formula: {
        itemId: 'imaginary_formula', spiritVisionInspected: true, identifiedAsOccult: true,
        knownInfo: ['伪造物品'],
      },
    };
    forged.divinationInsights.push({
      id: 'forged', targetKind: 'item', targetId: 'cryptic_note', method: 'cards', provider: 'self',
      outcome: 'hint', text: '伪造提示：已确认安全。', day: 1, hour: 9,
    });
    forged.divinationAttempts.push({
      targetKind: 'item', targetId: 'cryptic_note', method: 'cards', provider: 'self',
      outcome: 'hint', day: 1, hour: 9, score: 1,
    });
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(forged));

    const loaded = loadGame()!;
    expect(loaded.itemKnowledge).toEqual({});
    expect(loaded.divinationAttempts).toEqual([]);
    expect(loaded.divinationInsights).toEqual([]);
    expect(getInventoryEntries(loaded).find(entry => entry.id === 'cryptic_note')).toMatchObject({ category: 'misc', name: '泛黄的手抄纸' });
    expect(itemPresentation(loaded, 'cryptic_note')?.description).not.toMatch(/伪造|配方|绝对安全/);
  });

  it('未结识尼尔逊或伊芙琳时，即使伪造完整高分NPC记录也不能解锁物品', () => {
    for (const provider of ['nelson', 'evelyn'] as const) {
      const forged = fresh();
      forged.items.anomaly_evidence = 1;
      // 即便伪造官方知情状态，缺少真实联系人关系仍不是可信服务来源。
      forged.awareness = 'informed';
      forged.divinationAttempts = [{
        targetKind: 'item', targetId: 'anomaly_evidence', method: 'cards', provider,
        outcome: 'hint', day: 1, hour: 12, score: 99,
      }];
      forged.divinationInsights = [{
        id: `forged:${provider}`, targetKind: 'item', targetId: 'anomaly_evidence', method: 'cards', provider,
        outcome: 'hint', text: '伪造的NPC成功结论', day: 1, hour: 12,
      }];
      localStorage.setItem('lotm-demo-save-v6', JSON.stringify(forged));
      const loaded = loadGame()!;
      expect(loaded.divinationAttempts, provider).toEqual([]);
      expect(loaded.divinationInsights, provider).toEqual([]);
      expect(loaded.itemKnowledge.anomaly_evidence, provider).toBeUndefined();
      expect(getInventoryEntries(loaded).find(entry => entry.id === 'anomaly_evidence')?.category, provider).toBe('misc');
    }
  });

  it('自行纸牌记录必须有可信导师；合法NPC代占记录仍可读档恢复', () => {
    const forgedSelf = fresh();
    forgedSelf.items.anomaly_evidence = 1;
    forgedSelf.divinationTraining = { cards: true, dream: false, media: ['symbol_cards'], teachers: [] };
    forgedSelf.divinationAttempts = [{
      targetKind: 'item', targetId: 'anomaly_evidence', method: 'cards', provider: 'self',
      outcome: 'hint', day: 1, hour: 12, score: 99,
    }];
    forgedSelf.divinationInsights = [{
      id: 'forged:self', targetKind: 'item', targetId: 'anomaly_evidence', method: 'cards', provider: 'self',
      outcome: 'hint', text: '伪造的自行占卜结论', day: 1, hour: 12,
    }];
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(forgedSelf));
    expect(loadGame()!.divinationInsights).toEqual([]);

    const legitimate = fresh();
    legitimate.items.anomaly_evidence = 1;
    legitimate.relations.nelson = 40;
    legitimate.day = 2;
    legitimate.hour = 10;
    legitimate.pence = 100;
    legitimate.stats.energy = 100;
    expect(performDivination(legitimate, 'item', 'anomaly_evidence', 'cards', 'nelson')).toMatchObject({ ok: true, outcome: 'passed' });
    legitimate.relations.nelson = 0;
    saveGame(legitimate);
    const restored = loadGame()!;
    expect(restored.divinationAttempts).toHaveLength(1);
    expect(restored.divinationInsights).toHaveLength(1);
    expect(restored.divinationInsights[0].text).toBe(findItem('anomaly_evidence')!.divination!.successText.cards);
    expect(getInventoryEntries(restored).find(entry => entry.id === 'anomaly_evidence')?.category).toBe('occult');
  });

  it('合法完成尼尔逊教学后，关系下降不会撤销已经掌握的自行纸牌方法', () => {
    const state = fresh();
    state.day = 2;
    state.hour = 10;
    state.relations.nelson = 40;
    state.stats.energy = 100;
    expect(learnCardDivination(state)).toMatchObject({ ok: true });
    expect(state.divinationCredentials).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'training', source: 'nelson', method: 'cards' }),
    ]));

    state.relations.nelson = 0;
    state.items.anomaly_evidence = 1;
    expect(divinationIssue(state, 'item', 'anomaly_evidence', 'cards', 'self')).toBeNull();
    saveGame(state);
    const restored = loadGame()!;
    expect(restored.relations.nelson).toBe(0);
    expect(divinationIssue(restored, 'item', 'anomaly_evidence', 'cards', 'self')).toBeNull();
  });

  it('从权威定义重建合法记录，物品暂不持有时保留但不展示，重新取得后恢复', () => {
    const state = trainedSeer();
    state.items.cryptic_note = 1;
    expect(performDivination(state, 'item', 'cryptic_note', 'cards', 'self')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(inspectItemWithSpiritVision(state, 'cryptic_note')).toMatchObject({ ok: true });
    state.divinationInsights.at(-1)!.text = '伪造为无害物品';
    state.itemKnowledge.cryptic_note.knownInfo.push('伪造的第二条结论');
    state.items.cryptic_note = 0;
    saveGame(state);

    const restoredWithoutItem = loadGame()!;
    expect(restoredWithoutItem.itemKnowledge.cryptic_note).toMatchObject({ spiritVisionInspected: true, identifiedAsOccult: true });
    expect(restoredWithoutItem.itemKnowledge.cryptic_note.knownInfo).toEqual([findItem('cryptic_note')!.spiritVision!.result]);
    expect(restoredWithoutItem.divinationInsights.at(-1)?.text).toBe(findItem('cryptic_note')!.divination!.successText.cards);
    expect(getInventoryEntries(restoredWithoutItem).some(entry => entry.id === 'cryptic_note')).toBe(false);

    restoredWithoutItem.items.cryptic_note = 1;
    expect(getInventoryEntries(restoredWithoutItem).find(entry => entry.id === 'cryptic_note')).toMatchObject({ category: 'occult' });
    saveGame(restoredWithoutItem);
    expect(loadGame()).toEqual(restoredWithoutItem);
  });

  it('规则层为UI一次性提供分类、表面信息、数量与可用动作', () => {
    const state = fresh();
    state.items.cryptic_note = 1;
    state.books.municipal_archive_manual.acquired = true;
    const entries = getInventoryEntries(state);
    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'item', id: 'cryptic_note', category: 'misc', name: '泛黄的手抄纸', quantity: 1,
        actions: { spiritVision: false, divination: false, read: false },
      }),
      expect.objectContaining({
        kind: 'book', id: 'municipal_archive_manual', category: 'book', quantity: 1,
        actions: { spiritVision: false, divination: false, read: true },
      }),
    ]));
  });

  it('物品栏渲染位于工作、地点与居家分支之外，外出时只关闭交互', () => {
    const commonInventory = appSource.indexOf('{inventoryOpen && <InventoryPanel');
    const sceneBranches = appSource.indexOf('{ev ? (');
    expect(commonInventory).toBeGreaterThan(0);
    expect(commonInventory).toBeLessThan(sceneBranches);
    expect(appSource).toContain('interactive={E.isAtHome(state) && !ev}');
    expect(appSource).toContain('你可以随时查看随身记录');
  });

  it('码头地点页提供失踪案三阶段行动入口，并复用引擎 issue 作为阻断说明', () => {
    expect(appSource).toContain('码头失踪案');
    expect(appSource).toContain('E.inspectDockMissingReportsIssue(state)');
    expect(appSource).toContain('E.compareDockCargoRecordsIssue(state)');
    expect(appSource).toContain('E.traceDockMarkedManifestIssue(state)');
    expect(appSource).toContain('onClick={() => runAction(step.action)}');
    expect(appSource).not.toContain('核对近期失踪公告');
  });
});
