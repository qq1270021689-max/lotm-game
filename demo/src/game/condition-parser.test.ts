import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENTS, RANDOM_TEXT_EVENTS } from './data';
import {
  checkCond,
  instantiateEventBlueprint,
  loadGame,
  newGame,
  resolveChoice,
  saveGame,
  validateConditionExpression,
} from './engine';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
});

describe('事件条件严格解析', () => {
  it('所有当前静态事件、随机文本蓝图和选项条件均通过审计', () => {
    const conditions = [
      ...EVENTS.flatMap(event => [event.cond, ...event.choices.map(choice => choice.cond)]),
      ...RANDOM_TEXT_EVENTS.flatMap(event => [event.cond, ...event.choices.map(choice => choice.cond)]),
    ];
    const invalid = conditions.map((cond, index) => ({ index, cond, result: validateConditionExpression(cond) }))
      .filter(entry => !entry.result.valid);
    expect(invalid).toEqual([]);
  });

  it('& 优先于 |，并容忍原子周围空白', () => {
    const mortal = newGame('条件测试者', 'clerk', []);
    expect(checkCond(mortal, ' mortal | beyonder & money >= 99999 ')).toBe(true);
    expect(checkCond(mortal, ' beyonder | mortal & money >= 99999 ')).toBe(false);
  });

  it.each([
    'unknown_token', 'mystery>=1', 'money=1', 'money:extra>=1',
    'favor>=1', 'favor:unknown_person>=1', 'skill:unknown>=1',
    'intel:', 'not-item:not_real', 'not-knowledge:not_real', 'flag:not_real',
    'mortal&&money>0', 'mortal|', '|mortal', '(mortal)', '!mortal', '   ',
  ])('未知、畸形或空条件 fail-closed 且不抛异常：%s', cond => {
    const s = newGame('条件测试者', 'clerk', []);
    expect(() => checkCond(s, cond)).not.toThrow();
    expect(checkCond(s, cond)).toBe(false);
    expect(validateConditionExpression(cond).valid).toBe(false);
  });

  it('flag 只接受 true 或正数，字符串 truthy 不再通过', () => {
    const s = newGame('条件测试者', 'clerk', []);
    s.flags.met_beyonder = 'yes';
    expect(checkCond(s, 'flag:met_beyonder')).toBe(false);
    s.flags.met_beyonder = 1;
    expect(checkCond(s, 'flag:met_beyonder')).toBe(true);
  });

  it('持久化随机事件不得用篡改 cond 降级为无条件事件', () => {
    const s = newGame('条件测试者', 'clerk', []);
    const blueprint = RANDOM_TEXT_EVENTS[0];
    const instance = instantiateEventBlueprint(s, blueprint, { slot: blueprint.slot, day: s.day, hour: s.hour }, () => 0);
    instance.cond = 'unknown_token';
    s.pendingEvent = instance;
    saveGame(s);
    expect(loadGame()?.pendingEvent).toBeNull();
  });

  it('合法实例的随机文案与 undefined 字段可稳定往返，结算仍使用权威效果', () => {
    const s = newGame('条件测试者', 'clerk', []);
    const blueprint = RANDOM_TEXT_EVENTS[0];
    s.pendingEvent = instantiateEventBlueprint(s, blueprint, { slot: blueprint.slot, day: s.day, hour: s.hour }, () => 0);
    const beforeSkill = s.skills.investigate;
    saveGame(s);
    const loaded = loadGame()!;
    expect(loaded.pendingEvent).not.toBeNull();
    resolveChoice(loaded, 0);
    expect(loaded.skills.investigate).toBe(beforeSkill + 1);
  });

  it.each([
    ['money', (instance: ReturnType<typeof instantiateEventBlueprint>) => {
      instance.choices[0].effects = [{ k: 'money', v: 9999 }];
    }],
    ['item', (instance: ReturnType<typeof instantiateEventBlueprint>) => {
      instance.choices[0].effects = [{ k: 'item', id: 'whiskey', v: 9 }];
    }],
    ['formula', (instance: ReturnType<typeof instantiateEventBlueprint>) => {
      instance.choices[0].effects = [{ k: 'formula', id: 'seer9' }];
    }],
    ['contentVersion', (instance: ReturnType<typeof instantiateEventBlueprint>) => {
      instance.contentVersion += 1;
    }],
    ['top-level effects mirror', (instance: ReturnType<typeof instantiateEventBlueprint>) => {
      instance.effects[0] = [{ k: 'money', v: 9999 }];
    }],
  ] as const)('篡改 generated pendingEvent 的 %s 后读档拒绝且不能结算注入效果', (_label, tamper) => {
    const s = newGame('机械防伪测试者', 'clerk', []);
    const blueprint = RANDOM_TEXT_EVENTS[0];
    const instance = instantiateEventBlueprint(s, blueprint, { slot: blueprint.slot, day: s.day, hour: s.hour }, () => 0);
    tamper(instance);
    s.pendingEvent = instance;
    const before = { pence: s.pence, whiskey: s.items.whiskey ?? 0, formulas: [...s.formulas], skill: s.skills.investigate };
    saveGame(s);
    const loaded = loadGame()!;
    expect(loaded.pendingEvent).toBeNull();
    resolveChoice(loaded, 0);
    expect({
      pence: loaded.pence,
      whiskey: loaded.items.whiskey ?? 0,
      formulas: loaded.formulas,
      skill: loaded.skills.investigate,
    }).toEqual(before);
  });
});
