import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENTS } from './data';
import { checkCond, currentEvent, forceEvent, leaveCurrentLocation, newGame, performAtLocationAction, resolveChoice, travelToLocation } from './engine';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
});

describe('静态事件进度止血', () => {
  it('所有可重复静态事件都不能直接永久增加基础属性', () => {
    const offenders = EVENTS.filter(event => event.once !== true)
      .flatMap(event => event.choices.flatMap((choice, choiceIndex) => choice.effects
        .filter(effect => effect.k === 'stat')
        .map(effect => `${event.id}:${choiceIndex}:${effect.stat}`)));
    expect(offenders).toEqual([]);
  });

  it('除可恢复的市集消息入口外，固定 adventure 事件都是叙事唯一事件', () => {
    const adventures = EVENTS.filter(event => event.slot === 'adventure');
    expect(adventures.length).toBeGreaterThan(0);
    expect(adventures.filter(event => event.id !== 'adv_market_ears').every(event => event.once === true)).toBe(true);
    const market = adventures.find(event => event.id === 'adv_market_ears')!;
    expect(market.once).not.toBe(true);
    expect(market.choices.flatMap(choice => choice.effects).filter(effect => effect.k === 'stat')).toEqual([]);
    expect(market.choices.flatMap(choice => choice.effects)
      .filter(effect => effect.k === 'money' && (effect.v ?? 0) > 0)).toEqual([]);
  });

  it('真实市集路径先随便逛逛，日后仍能重新遇见掮客并购买暗号', () => {
    vi.mocked(Math.random).mockReturnValue(0);
    const s = newGame('市集消息测试者', 'clerk', []);
    s.stats.energy = 100;
    s.hour = 9;

    expect(travelToLocation(s, 'market', 'walk')).toMatchObject({ ok: true });
    expect(performAtLocationAction(s, 'explore')).toMatchObject({ ok: true });
    expect(currentEvent(s)?.id).toBe('adv_market_ears');
    resolveChoice(s, 2);
    expect(s.intel).not.toContain('black_market');
    expect(leaveCurrentLocation(s)).toMatchObject({ ok: true });

    expect(travelToLocation(s, 'market', 'walk')).toMatchObject({ ok: true });
    expect(performAtLocationAction(s, 'explore')).toMatchObject({ ok: true });
    expect(currentEvent(s)?.id).toBe('adv_market_ears');
    const before = s.pence;
    resolveChoice(s, 0);
    expect(s.intel).toContain('black_market');
    expect(s.pence).toBe(before - 6);
  });

  it('布兰登借款事件只可能触发和结算一次', () => {
    const s = newGame('借款测试者', 'clerk', []);
    const before = s.pence;
    forceEvent(s, 'npc_brandon_loan');
    expect(currentEvent(s)?.id).toBe('npc_brandon_loan');
    resolveChoice(s, 0);
    expect(s.pence).toBe(before + 240);
    expect(s.timers.filter(timer => timer.id === 'debt')).toHaveLength(1);

    forceEvent(s, 'npc_brandon_loan');
    expect(currentEvent(s)).toBeNull();
    expect(s.pence).toBe(before + 240);
    expect(s.timers.filter(timer => timer.id === 'debt')).toHaveLength(1);
  });

  it('普通人看不到也不会产出“非凡者应远离教会”的自我认知文案', () => {
    const s = newGame('普通路人', 'clerk', []);
    forceEvent(s, 'street_preacher');
    const event = currentEvent(s)!;
    const visible = event.choices.filter(choice => checkCond(s, choice.cond));
    expect(visible.map(choice => `${choice.text}\n${choice.result}`).join('\n')).not.toMatch(/非凡者/);
    const leaveIndex = visible.findIndex(choice => choice.text.includes('继续赶路'));
    expect(leaveIndex).toBeGreaterThanOrEqual(0);
    resolveChoice(s, leaveIndex);
    expect(s.log.map(entry => entry.text).join('\n')).not.toMatch(/非凡者最好离教会远一点/);
  });
});
