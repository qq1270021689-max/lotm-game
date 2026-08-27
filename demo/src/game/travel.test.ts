import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameState } from './types';
import { generateCommission } from './gen';
import {
  doAdventure,
  doTavern,
  doWander,
  getTravelQuote,
  loadGame,
  newGame,
  performLocationAction,
  saveGame,
} from './engine';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
}

const fresh = () => newGame('交通测试者', 'clerk', []);
const docker = () => newGame('码头交通测试者', 'docker', []);

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('地点交通报价与结算', () => {
  it('步行使用地点总耗时，人力车取折半向上并按区域与节省小时报价', () => {
    const s = docker();
    expect(getTravelQuote(s, 'docks', 'walk')).toEqual({ mode: 'walk', hours: 2, fee: 0, travelers: 1 });
    expect(getTravelQuote(s, 'docks', 'rickshaw')).toEqual({ mode: 'rickshaw', hours: 1, fee: 5, travelers: 1 });
    expect(getTravelQuote(s, 'docks', 'rickshaw', 2)).toEqual({ mode: 'rickshaw', hours: 1, fee: 10, travelers: 2 });
    expect(getTravelQuote(s, 'market', 'rickshaw')).toBeNull();

    s.visitedLocations.push('old_tower', 'ramd');
    expect(getTravelQuote(s, 'old_tower', 'rickshaw')).toMatchObject({ hours: 2, fee: 10 });
    expect(getTravelQuote(s, 'ramd', 'rickshaw')).toMatchObject({ hours: 3, fee: 17 });
  });

  it('人力车只减少探索时间，不降低探索精力，并扣除公开车费', () => {
    const walk = docker(); walk.stats.energy = 100; walk.pence = 500;
    const ride = structuredClone(walk);
    const walkStart = { hour: walk.hour, energy: walk.stats.energy, pence: walk.pence };
    const rideStart = { hour: ride.hour, energy: ride.stats.energy, pence: ride.pence };
    expect(performLocationAction(walk, 'docks', 'explore', 'walk').ok).toBe(true);
    expect(performLocationAction(ride, 'docks', 'explore', 'rickshaw').ok).toBe(true);
    expect(walk.hour - walkStart.hour).toBe(2);
    expect(ride.hour - rideStart.hour).toBe(1);
    expect(walkStart.energy - walk.stats.energy).toBe(rideStart.energy - ride.stats.energy);
    expect((walk.pence - walkStart.pence) - (ride.pence - rideStart.pence)).toBe(5);
  });

  it('锁定、无效地点、无效动作、钱不足与无节省交通均零状态', () => {
    const cases: Array<(s: GameState) => unknown> = [
      s => performLocationAction(s, 'manor', 'explore', 'walk'),
      s => performLocationAction(s, 'forged_place', 'explore', 'walk'),
      s => performLocationAction(s, 'market', 'tavern', 'walk'),
      s => performLocationAction(s, 'market', 'wander', 'rickshaw'),
      s => { s.hour = 16; s.pence = 10; return performLocationAction(s, 'tavern', 'tavern', 'rickshaw'); },
    ];
    for (const act of cases) {
      const s = fresh();
      if (act === cases.at(-1)) { s.hour = 16; s.pence = 10; }
      const before = structuredClone(s);
      act(s);
      expect(s).toEqual(before);
    }
  });

  it('同行探索按两人计费，所有同行权限检查通过后才扣款', () => {
    const walk = docker(); walk.day = 1; walk.hour = 8; walk.pence = 500; walk.stats.energy = 100; walk.relations.martha = 60;
    const ride = structuredClone(walk);
    expect(performLocationAction(walk, 'docks', 'explore', 'walk', 'martha').ok).toBe(true);
    expect(performLocationAction(ride, 'docks', 'explore', 'rickshaw', 'martha').ok).toBe(true);
    expect(walk.pence - ride.pence).toBe(10);

    const blocked = docker(); blocked.pence = 500; blocked.stats.energy = 100;
    const before = structuredClone(blocked);
    expect(performLocationAction(blocked, 'docks', 'explore', 'rickshaw', 'nelson').ok).toBe(false);
    expect(blocked).toEqual(before);
  });
});

describe('地点内日常活动与兼容入口', () => {
  it('市集闲逛从地点动作进入并保持一小时旧行为', () => {
    const s = fresh(); const hour = s.hour;
    expect(performLocationAction(s, 'market', 'wander', 'walk').ok).toBe(true);
    expect(s.hour).toBe(hour + 1);
    expect(s.visitedLocations).toContain('market');
  });

  it('酒馆遵守营业时间，首次到访认识麦克；人力车可缩短总时间', () => {
    const closed = fresh();
    const before = structuredClone(closed);
    expect(performLocationAction(closed, 'tavern', 'tavern', 'walk').ok).toBe(false);
    expect(closed).toEqual(before);

    const open = fresh(); open.hour = 16; open.pence = 100; open.stats.energy = 100;
    expect(performLocationAction(open, 'tavern', 'tavern', 'rickshaw').ok).toBe(true);
    expect(open.hour).toBe(17);
    expect(open.relations.mike).toBeDefined();
    expect(open.visitedLocations).toContain('tavern');
  });

  it('生成委托永远只选择支持调查的地点，酒馆不会成为目标', () => {
    const s = fresh();
    for (let i = 0; i < 200; i++) {
      const commission = generateCommission(s);
      expect(commission.locationId).not.toBe('tavern');
    }
  });

  it('旧函数保持步行兼容与原总耗时', () => {
    const adventure = docker(); adventure.stats.energy = 100;
    const adventureHour = adventure.hour;
    expect(doAdventure(adventure, 'docks').ok).toBe(true);
    expect(adventure.hour).toBe(adventureHour + 2);

    const wander = fresh(); const wanderHour = wander.hour;
    expect(doWander(wander).ok).toBe(true);
    expect(wander.hour).toBe(wanderHour + 1);

    const tavern = fresh(); tavern.hour = 16; const tavernHour = tavern.hour;
    expect(doTavern(tavern).ok).toBe(true);
    expect(tavern.hour).toBe(tavernHour + 2);
  });

  it('schema15旧档读写幂等，日志不暴露内部danger或风险档位', () => {
    const s = docker(); s.schemaVersion = 15; s.stats.energy = 100;
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(s));
    const loaded = loadGame()!;
    saveGame(loaded);
    expect(loadGame()).toEqual(loaded);
    performLocationAction(loaded, 'docks', 'explore', 'rickshaw');
    expect(loaded.log.map(entry => entry.text).join('\n')).not.toMatch(/danger|风险较低|风险可感|风险较高|极其凶险|危险度\s*\d/);
  });
});
