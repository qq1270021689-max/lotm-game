import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENTS, RANDOM_TEXT_EVENTS } from './data';
import type { Commission, EventInstance, GameState } from './types';
import {
  acceptCommission,
  advanceHours,
  applyEffects,
  compareDockCargoRecords,
  compareDockCargoRecordsIssue,
  currentEvent,
  doAdventure,
  doSleep,
  forceEvent,
  inspectDockMissingReports,
  instantiateEventBlueprint,
  loadGame,
  maybeTrigger,
  newGame,
  performAtLocationAction,
  resolveChoice,
  saveGame,
  travelToLocation,
} from './engine';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
}

const fresh = () => newGame('事件测试者', 'clerk', []);
const blueprint = (id: string) => RANDOM_TEXT_EVENTS.find(event => event.id === id)!;

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('随机叙事事件实例', () => {
  it('示范蓝图进入真实触发池并固化 blueprintId', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const s = fresh();

    expect(maybeTrigger(s, 'work')).toBe(true);
    expect(typeof s.pendingEvent).toBe('object');
    expect((s.pendingEvent as EventInstance).blueprintId).toBe('ambient_skill_work_observation');
  });

  it('同一蓝图可生成不同文本，但选择顺序和效果深度一致', () => {
    const s = fresh();
    const def = blueprint('ambient_skill_work_observation');
    const context = { slot: def.slot, day: s.day, hour: s.hour };

    const first = instantiateEventBlueprint(s, def, context, () => 0);
    const second = instantiateEventBlueprint(s, def, context, () => 0);

    expect([first.title, first.text, first.choices[0].text, first.choices[0].result])
      .not.toEqual([second.title, second.text, second.choices[0].text, second.choices[0].result]);
    expect(first.effects).toEqual(second.effects);
    expect(first.choices.map(choice => choice.effects)).toEqual(second.choices.map(choice => choice.effects));
    expect(first.blueprintId).toBe(second.blueprintId);
    expect(first.instanceId).not.toBe(second.instanceId);
  });

  it('实例经过真实保存和读档后，文本、选项和效果保持稳定', () => {
    const s = fresh();
    const def = blueprint('ambient_skill_work_observation');
    const instance = instantiateEventBlueprint(s, def, { slot: def.slot, day: s.day, hour: s.hour }, () => 0.75);
    s.pendingEvent = instance;

    saveGame(s);
    const restored = loadGame();

    expect(restored && currentEvent(restored)).toEqual(instance);
    expect((restored?.pendingEvent as EventInstance).effects).toEqual(instance.effects);
  });

  it('已有待决事件时普通触发不会覆盖', () => {
    const s = fresh();
    s.pendingEvent = 'fog_dream';
    const before = structuredClone(s.pendingEvent);

    expect(maybeTrigger(s, 'street')).toBe(false);
    expect(s.pendingEvent).toEqual(before);
  });

  it('关键事件遇到待决事件会排队，并在当前事件解决后继续', () => {
    const s = fresh();
    s.pendingEvent = 'fog_dream';

    forceEvent(s, 'secret_gathering');

    expect(s.pendingEvent).toBe('fog_dream');
    expect(s.forcedEventQueue).toEqual(['secret_gathering']);
    resolveChoice(s, 0);
    expect(currentEvent(s)?.id).toBe('secret_gathering');
  });

  it('跨午夜的高污染关键事件会在待决事件后排队并继续激活', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const s = fresh();
    s.hour = 23;
    s.stats.cor = 80;
    s.pendingEvent = 'fog_dream';

    advanceHours(s, 1);

    expect(s.day).toBe(2);
    expect(s.hour).toBe(0);
    expect(s.pendingEvent).toBe('fog_dream');
    expect(s.forcedEventQueue).toContain('true_creator_whispers');

    resolveChoice(s, 0);
    expect(currentEvent(s)?.id).toBe('true_creator_whispers');
  });
});

describe('固定奖励与权威回执', () => {
  it('无家可归的睡眠仍受惩罚，但日志不泄露恢复比例', () => {
    const s = fresh();
    s.tags.push('homeless');
    s.stats.energy = 0;

    expect(doSleep(s).ok).toBe(true);

    expect(s.stats.energy).toBe(50);
    expect(s.log.at(-1)?.text).not.toMatch(/减半|百分之|\d+%/);
  });

  it('事件仍完整应用 effects，但叙事日志不追加机械奖励摘要', () => {
    const s = fresh();
    const before = { spi: s.stats.spi, san: s.stats.san };
    forceEvent(s, 'street_stranger');
    const resultText = currentEvent(s)!.choices[0].result;

    resolveChoice(s, 0);

    expect(s.stats.spi).toBe(before.spi + 2);
    expect(s.stats.san).toBe(before.san - 3);
    expect(s.log.at(-1)?.text).toBe(`  → ${resultText}`);
    expect(s.log.at(-1)?.text).not.toMatch(/灵性[+−]|理智[+−]|Lv\.|获得情报/);
  });

  it('物品、知识和技能效果都结算明确回执', () => {
    const s = fresh();
    const itemReceipt = applyEffects(s, [{ k: 'item', id: 'anomaly_evidence', v: 1 }])[0];
    const knowledgeReceipt = applyEffects(s, [{ k: 'knowledge', id: 'occult_theory' }])[0];
    const skillReceipt = applyEffects(s, blueprint('ambient_skill_work_observation').choices[0].effects)[0];

    expect(s.items.anomaly_evidence).toBe(1);
    expect(itemReceipt).toMatchObject({ applied: true, actualDelta: 1 });
    expect(s.knowledge).toContain('occult_theory');
    expect(knowledgeReceipt).toMatchObject({ applied: true, before: false, after: true });
    expect(s.skills.investigate).toBe(1);
    expect(skillReceipt).toMatchObject({ applied: true, before: 0, after: 1, actualDelta: 1 });
  });

  it('技能严格限制在 0..10，满级后不虚报变化', () => {
    const s = fresh();
    s.skills.investigate = 9;

    const raised = applyEffects(s, [{ k: 'skill', skill: 'investigate', v: 5 }])[0];
    const capped = applyEffects(s, [{ k: 'skill', skill: 'investigate', v: 1 }])[0];

    expect(s.skills.investigate).toBe(10);
    expect(raised).toMatchObject({ applied: true, actualDelta: 1, before: 9, after: 10 });
    expect(capped).toMatchObject({ applied: false, actualDelta: 0, before: 10, after: 10 });
    expect(capped.summary).toBeUndefined();
  });

  it('重复知识返回未应用回执，事件结果日志不会宣称再次获得奖励', () => {
    const s = fresh();
    s.knowledge.push('occult_theory');
    const duplicate = applyEffects(s, [{ k: 'knowledge', id: 'occult_theory' }])[0];
    expect(duplicate).toMatchObject({ applied: false, before: true, after: true });
    expect(duplicate.summary).toBeUndefined();
  });

  it('码头传闻及同类地点见闻不会凭空生成委托报酬', () => {
    for (const eventId of ['adv_dock', 'adv_rat', 'adv_grave', 'adv_corpse']) {
      const event = EVENTS.find(candidate => candidate.id === eventId)!;
      expect(event).toBeDefined();
      expect(event.choices.flatMap(choice => choice.effects)
        .filter(effect => effect.k === 'money' && (effect.v ?? 0) > 0)).toEqual([]);
      expect([event.title, event.text, ...event.choices.map(choice => choice.result)].join(' '))
        .not.toMatch(/雇主|报酬|悬赏|出价|领了赏|赏金/);
    }

    for (const choiceIndex of [0, 1]) {
      const s = fresh();
      applyEffects(s, [{ k: 'intel', id: 'dock_missing' }]);
      s.pendingEvent = 'adv_dock';
      const money = s.pence;

      resolveChoice(s, choiceIndex);

      expect(s.pence).toBe(money);
      expect(s.log.at(-1)?.text).not.toMatch(/雇主|委托|报酬|赏金/);
    }
  });

  it('码头现场事件只在凡人东区码头触发一次，两种调查选择留下不同证据', () => {
    const event = EVENTS.find(candidate => candidate.id === 'adv_dock')!;
    expect(event).toMatchObject({ cond: 'mortal&intel:dock_missing', locations: ['docks'], once: true });
    expect(event.text).not.toMatch(/午夜|深夜|夜间|等到夜里/);
    expect(event.choices.slice(0, 2).every(choice => choice.effects.some(effect => effect.k === 'clue' && effect.id === 'dock_crate_trace'))).toBe(true);

    const close = fresh();
    close.activeCommission = null;
    const closeMoney = close.pence;
    forceEvent(close, 'adv_dock');
    resolveChoice(close, 0);
    expect(close.clues).toContainEqual(expect.objectContaining({ id: 'dock_crate_trace', sourceKind: 'event', sourceId: 'adv_dock' }));
    expect(close.items.dock_scale_evidence).toBe(1);
    expect(close.pence).toBe(closeMoney);
    expect(close.activeCommission).toBeNull();
    expect(close.firedOnce.filter(id => id === 'adv_dock')).toHaveLength(1);
    forceEvent(close, 'adv_dock');
    expect(close.pendingEvent).toBeNull();

    const distant = fresh();
    const distantMoney = distant.pence;
    forceEvent(distant, 'adv_dock');
    resolveChoice(distant, 1);
    expect(distant.clues).toContainEqual(expect.objectContaining({ id: 'dock_crate_trace' }));
    expect(distant.items.dock_scale_evidence ?? 0).toBe(0);
    expect(distant.pence).toBe(distantMoney);
    expect(distant.activeCommission).toBeNull();
    expect([close, distant].flatMap(state => state.formulas)).toEqual([]);
  });

  it('码头现场反馈按普通人已有的调查基础分层，但始终只给调查方向与下一步', () => {
    const ordinary = fresh();
    forceEvent(ordinary, 'adv_dock');
    resolveChoice(ordinary, 1);
    const ordinaryText = ordinary.log.map(entry => entry.text).join('\n');
    expect(ordinaryText).toMatch(/没有可靠手段判断.*空气像被看不见的东西挤动/);
    expect(ordinaryText).toMatch(/白天.*公开失踪登记.*货运备份.*旧仓单/);

    const trained = fresh();
    trained.skills.investigate = 1;
    forceEvent(trained, 'adv_dock');
    resolveChoice(trained, 1);
    expect(trained.log.map(entry => entry.text).join('\n')).toMatch(/常见动物.*解释不完整/);

    const occultReader = fresh();
    occultReader.knowledge.push('occult_theory');
    forceEvent(occultReader, 'adv_dock');
    resolveChoice(occultReader, 0);
    const occultText = occultReader.log.map(entry => entry.text).join('\n');
    expect(occultText).toMatch(/调查与神秘学常识.*现有记录仍不足/);
    expect(occultText).not.toMatch(/途径|组织|难度|成功率|危险等级|\d+\s*vs\s*\d+/);
  });

  it('普通人沿真实码头行动链可在白天遇到事件，结束后仍可继续核对货运记录', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const s = newGame('真实码头行动测试者', 'docker', []);
    s.stats.energy = 100;

    expect(s.hour).toBe(7);
    expect(travelToLocation(s, 'docks', 'walk')).toMatchObject({ ok: true });
    expect(s.currentLocation?.locationId).toBe('docks');
    expect(performAtLocationAction(s, 'explore')).toMatchObject({ ok: true });
    expect(currentEvent(s)?.id).toBe('adv_dock');
    expect(s.day).toBe(1);
    expect(s.hour).toBe(9);
    expect(s.log.map(entry => entry.text).join('\n')).not.toMatch(/午夜|深夜|等到夜里|等待至/);

    resolveChoice(s, 1);
    expect(s.currentLocation?.locationId).toBe('docks');
    expect(s.clues).toContainEqual(expect.objectContaining({ id: 'dock_crate_trace', sourceKind: 'event' }));
    expect(compareDockCargoRecordsIssue(s)).toMatch(/公开失踪登记/);
    expect(inspectDockMissingReports(s)).toMatchObject({ ok: true });
    expect(compareDockCargoRecordsIssue(s)).toBeNull();
    expect(compareDockCargoRecords(s)).toMatchObject({ ok: true });
    expect(s.clues).toContainEqual(expect.objectContaining({ id: 'dock_manifest_discrepancy' }));

    const noIntel = fresh();
    noIntel.stats.energy = 100;
    noIntel.visitedLocations.push('docks');
    expect(travelToLocation(noIntel, 'docks', 'walk').ok).toBe(true);
    expect(performAtLocationAction(noIntel, 'explore').ok).toBe(true);
    expect(currentEvent(noIntel)).toBeNull();

    const beyonder = newGame('非凡者约束测试者', 'docker', []);
    beyonder.pathwayId = 'hunter';
    beyonder.sequence = 9;
    beyonder.stats.energy = 100;
    expect(travelToLocation(beyonder, 'docks', 'walk').ok).toBe(true);
    expect(performAtLocationAction(beyonder, 'explore').ok).toBe(true);
    expect(currentEvent(beyonder)).toBeNull();

    const elsewhere = newGame('地点约束测试者', 'docker', []);
    elsewhere.stats.energy = 100;
    expect(travelToLocation(elsewhere, 'market', 'walk').ok).toBe(true);
    expect(performAtLocationAction(elsewhere, 'explore').ok).toBe(true);
    expect(currentEvent(elsewhere)?.id).not.toBe('adv_dock');
  });

  it('只有可核实委托人且已接取的正式委托能够结算报酬', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const commission: Commission = {
      id: 'formal_dock_case', kind: 'investigate', stat: 'mnd', difficulty: 1,
      title: '核对码头失踪登记', text: '由委托人面谈后交付', client: 'martha',
      locationId: 'docks', reward: 36, daysLeft: 3, occult: false,
    };
    const formal = newGame('正式委托测试者', 'docker', []);
    formal.board = [commission];
    formal.stats.energy = 100;
    const beforeReward = formal.pence;

    expect(acceptCommission(formal, commission.id)).toMatchObject({ ok: true });
    expect(doAdventure(formal, 'docks')).toMatchObject({ ok: true });
    expect(formal.pence).toBe(beforeReward + commission.reward);
    expect(formal.activeCommission).toBeNull();
    expect(formal.log.some(entry => entry.text.includes('玛尔塔') && entry.text.includes('付了'))).toBe(true);

    const forged = newGame('伪造委托测试者', 'docker', []);
    forged.board = [{ ...commission, id: 'forged_board_case', client: 'missing_client' }];
    const beforeAccept = structuredClone(forged);
    expect(acceptCommission(forged, 'forged_board_case')).toMatchObject({ ok: false });
    expect(forged).toEqual(beforeAccept);

    forged.activeCommission = { ...commission, id: 'forged_active_case', client: 'missing_client' };
    forged.stats.energy = 100;
    forged.pendingEvent = 'fog_dream';
    const forgedMoney = forged.pence;
    expect(doAdventure(forged, 'docks')).toMatchObject({ ok: true });
    expect(forged.pence).toBe(forgedMoney);
    expect(forged.activeCommission).toBeNull();
    expect(forged.log.some(entry => entry.text.includes('正式结算依据'))).toBe(true);
  });
});

describe('旧存档迁移', () => {
  it('旧 pendingEvent 字符串继续解析，并补齐事件计数、冷却和队列', () => {
    const old = fresh();
    old.pendingEvent = 'fog_dream';
    const legacy = { ...old } as Partial<GameState>;
    delete legacy.eventCounter;
    delete legacy.recentEventVariants;
    delete legacy.forcedEventQueue;
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(legacy));

    const loaded = loadGame();

    expect(loaded?.pendingEvent).toBe('fog_dream');
    expect(loaded && currentEvent(loaded)?.id).toBe('fog_dream');
    expect(loaded?.eventCounter).toBe(0);
    expect(loaded?.recentEventVariants).toEqual({});
    expect(loaded?.forcedEventQueue).toEqual([]);
  });
});
