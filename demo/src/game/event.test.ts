import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENTS, RANDOM_TEXT_EVENTS } from './data';
import type { Commission, EventInstance, GameState } from './types';
import {
  acceptCommission,
  advanceHours,
  applyEffects,
  currentEvent,
  doAdventure,
  doSleep,
  forceEvent,
  instantiateEventBlueprint,
  loadGame,
  maybeTrigger,
  newGame,
  resolveChoice,
  saveGame,
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
