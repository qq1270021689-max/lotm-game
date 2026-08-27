import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameState } from './types';
import { SALVAGE_DEFS } from './data';
import {
  acquireBook,
  buyFromShop,
  commuteToWork,
  doAdventure,
  doNap,
  doSleep,
  doTavern,
  doWander,
  drinkPotion,
  getBookSourceOffers,
  getShopInventory,
  leaveCurrentLocation,
  loadGame,
  newGame,
  performAtLocationAction,
  performLocationAction,
  readBookSession,
  saveGame,
  travelToLocation,
} from './engine';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
}

const fresh = () => newGame('地点状态测试者', 'clerk', []);
const docker = () => newGame('码头地点测试者', 'docker', []);

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('两阶段出行与返程', () => {
  it('抵达只结算去程，离开才结算预付返程', () => {
    const s = docker(); s.stats.energy = 100;
    const startHour = s.hour;
    expect(travelToLocation(s, 'docks', 'walk')).toMatchObject({ ok: true });
    expect(s.hour).toBe(startHour + 1);
    expect(s.currentLocation).toMatchObject({ locationId: 'docks', returnHours: 1, returnPrepaid: true });
    expect(s.visitedLocations).not.toContain('docks');
    expect(leaveCurrentLocation(s)).toMatchObject({ ok: true });
    expect(s.hour).toBe(startHour + 2);
    expect(s.currentLocation).toBeNull();
  });

  it('人力车费只在出发时扣一次，同行者与返程安排会固化', () => {
    const s = docker(); s.day = 1; s.hour = 8; s.pence = 500; s.stats.energy = 100; s.relations.martha = 60;
    expect(travelToLocation(s, 'docks', 'rickshaw', 'martha')).toMatchObject({ ok: true });
    expect(s.pence).toBe(490);
    expect(s.currentLocation).toMatchObject({ locationId: 'docks', companionId: 'martha', returnHours: 0, travelMode: 'rickshaw' });
    expect(leaveCurrentLocation(s).ok).toBe(true);
    expect(s.pence).toBe(490);
  });

  it('已在A地不能瞬移B地，无效行动与兼容包装失败保持原子性', () => {
    const s = docker(); s.stats.energy = 100;
    expect(travelToLocation(s, 'docks', 'walk').ok).toBe(true);
    const arrived = structuredClone(s);
    expect(travelToLocation(s, 'market', 'walk').ok).toBe(false);
    expect(performLocationAction(s, 'market', 'wander', 'walk').ok).toBe(false);
    expect(performAtLocationAction(s, 'tavern').ok).toBe(false);
    expect(s).toEqual(arrived);

    const closed = fresh();
    const before = structuredClone(closed);
    expect(doTavern(closed).ok).toBe(false);
    expect(closed).toEqual(before);
  });
});

describe('地点行动、搜集与店铺', () => {
  it('同一地点可连续行动，不会重复付车费', () => {
    const s = docker(); s.hour = 8; s.pence = 500; s.stats.energy = 100;
    expect(travelToLocation(s, 'docks', 'rickshaw').ok).toBe(true);
    expect(s.pence).toBe(495);
    expect(performAtLocationAction(s, 'explore').ok).toBe(true);
    expect(performAtLocationAction(s, 'salvage').ok).toBe(true);
    expect(s.pence).toBe(495);
    expect(s.currentLocation?.locationId).toBe('docks');
  });

  it('搜集是一次性固定普通奖励，重复尝试零收益且不产出超凡内容', () => {
    const s = docker(); s.hour = 8; s.stats.energy = 100;
    travelToLocation(s, 'docks', 'walk');
    performAtLocationAction(s, 'explore');
    const beforeWhiskey = s.items.whiskey ?? 0;
    expect(performAtLocationAction(s, 'salvage').ok).toBe(true);
    expect(s.items.whiskey).toBe(beforeWhiskey + 1);
    expect(s.completedLocationActions).toContain('salvage_docks_crate');
    const after = structuredClone(s);
    expect(performAtLocationAction(s, 'salvage').ok).toBe(false);
    expect(s).toEqual(after);
    expect(s.formulas).toEqual([]);
    expect(s.pathwayId).toBeNull();
    expect(s.knowledge).not.toEqual(expect.arrayContaining(['spirit_vision', 'ritual_basic', 'potion_brew']));
  });

  it('市集店只使用固定货单价格，在A地无法购买B地商品或取得B地书源', () => {
    const s = fresh(); s.hour = 8; s.pence = 500; s.stats.energy = 100;
    travelToLocation(s, 'market', 'walk');
    expect(getShopInventory(s, 'market_general_store')).toContainEqual({ itemId: 'whiskey', price: 12 });
    const money = s.pence;
    expect(buyFromShop(s, 'market_general_store', 'whiskey').ok).toBe(true);
    expect(s.pence).toBe(money - 12);
    expect(buyFromShop(s, 'black_market_stall', 'whiskey').ok).toBe(false);
    expect(getBookSourceOffers(s).map(offer => offer.bookId)).toEqual([]);
    expect(acquireBook(s, 'dock_manifest_manual').ok).toBe(false);
  });

  it('普通人即使抵达黑市也看不见非凡货单', () => {
    const s = fresh(); s.hour = 22; s.intel.push('black_market'); s.pence = 500; s.stats.energy = 100;
    expect(travelToLocation(s, 'black_market', 'walk').ok).toBe(true);
    expect(getShopInventory(s, 'black_market_stall')).toEqual([]);
  });
});

describe('在外限制、兼容入口与迁移', () => {
  it('在外时通勤、睡眠、小憩、阅读与服食均零状态拒绝', () => {
    const s = fresh(); s.stats.energy = 100; s.books.municipal_archive_manual.acquired = true;
    travelToLocation(s, 'market', 'walk');
    for (const action of [
      (state: GameState) => commuteToWork(state),
      (state: GameState) => doSleep(state),
      (state: GameState) => doNap(state),
      (state: GameState) => readBookSession(state, 'municipal_archive_manual'),
      (state: GameState) => drinkPotion(state, 'seer'),
    ]) {
      const before = structuredClone(s);
      expect(action(s).ok).toBe(false);
      expect(s).toEqual(before);
    }
    expect(leaveCurrentLocation(s).ok).toBe(true);
  });

  it('旧兼容API保持原总耗时且行动后一定回家', () => {
    const adventure = docker(); adventure.stats.energy = 100; const adventureHour = adventure.hour;
    expect(doAdventure(adventure, 'docks').ok).toBe(true);
    expect(adventure.hour).toBe(adventureHour + 2);
    expect(adventure.currentLocation).toBeNull();

    const wander = fresh(); const wanderHour = wander.hour;
    expect(doWander(wander).ok).toBe(true);
    expect(wander.hour).toBe(wanderHour + 1);
    expect(wander.currentLocation).toBeNull();

    const tavern = fresh(); tavern.hour = 16; const tavernHour = tavern.hour;
    expect(doTavern(tavern).ok).toBe(true);
    expect(tavern.hour).toBe(tavernHour + 2);
    expect(tavern.currentLocation).toBeNull();
  });

  it('v15存档清空中途状态，v16过滤非法地点、同行者和 once key 并幂等', () => {
    const old = docker(); old.schemaVersion = 15;
    old.currentLocation = { locationId: 'docks', arrivedDay: 1, arrivedHour: 9, travelMode: 'walk', returnHours: 1, returnPrepaid: true };
    old.completedLocationActions = ['salvage_docks_crate'];
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(old));
    const migrated = loadGame()!;
    expect(migrated).toMatchObject({ schemaVersion: 20, currentLocation: null, completedLocationActions: [] });

    const current = docker(); current.schemaVersion = 16;
    current.currentLocation = { locationId: 'docks', arrivedDay: 1, arrivedHour: 99, travelMode: 'walk', returnHours: 1, returnPrepaid: true, companionId: 'forged_npc' };
    current.completedLocationActions = ['salvage_docks_crate', 'salvage_docks_crate', 'forged_once_key'];
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(current));
    const cleaned = loadGame()!;
    expect(cleaned.currentLocation).toBeNull();
    expect(cleaned.completedLocationActions).toEqual(['salvage_docks_crate']);
    saveGame(cleaned);
    expect(loadGame()).toEqual(cleaned);
    expect(SALVAGE_DEFS.some(def => def.id === cleaned.completedLocationActions[0])).toBe(true);
  });

  it('v16不信任形状合法但尚未解锁的地点驻留', () => {
    const s = fresh(); s.schemaVersion = 16;
    s.currentLocation = { locationId: 'manor', arrivedDay: 1, arrivedHour: 10, travelMode: 'walk', returnHours: 2, returnPrepaid: true };
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(s));
    expect(loadGame()!.currentLocation).toBeNull();
  });

  it('v16不信任解锁地点中被篡改的返程时长', () => {
    const s = docker(); s.schemaVersion = 16;
    s.currentLocation = { locationId: 'docks', arrivedDay: 1, arrivedHour: 9, travelMode: 'walk', returnHours: 999, returnPrepaid: true };
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(s));
    expect(loadGame()!.currentLocation).toBeNull();
  });

  it('v16保留交通报价可复核的合法驻留，二次读档幂等', () => {
    const s = docker(); s.schemaVersion = 16; s.stats.energy = 100;
    expect(travelToLocation(s, 'docks', 'walk').ok).toBe(true);
    saveGame(s);
    const first = loadGame()!;
    expect(first.currentLocation).toEqual(s.currentLocation);
    saveGame(first);
    expect(loadGame()).toEqual(first);
  });
});
