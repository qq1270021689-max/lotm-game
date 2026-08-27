import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Commission, GameState } from './types';
import { generateCommission } from './gen';
import { NPCS, npcLocation, scheduleHint } from './data';
import {
  acquireClue,
  doAdventure,
  getVisibleLocations,
  isLocationUnlocked,
  loadGame,
  locationAccessIssue,
  newGame,
  redactLockedLocationText,
  requestManorAddress,
  saveGame,
} from './engine';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
}

const fresh = () => newGame('地点测试者', 'clerk', []);
const ids = (state: GameState) => getVisibleLocations(state).map(location => location.id);
const commission = (id: string, locationId: string): Commission => ({
  id, kind: 'investigate', stat: 'mnd', difficulty: 20, title: '去向测试', text: '去向由委托人提供',
  client: 'martha', locationId, reward: 24, daysLeft: 3, occult: false,
});

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('地点解锁与可见列表', () => {
  it('普通新档开放公共市集与酒馆，docker 因失踪情报额外开放码头', () => {
    expect(ids(fresh())).toEqual(['market', 'tavern']);
    expect(ids(newGame('码头之子', 'docker', []))).toEqual(['market', 'tavern', 'docks']);
  });

  it('锁定地点与无效 id 返回同一泛化信息且完全不改状态', () => {
    const s = fresh();
    const before = structuredClone(s);
    const locked = doAdventure(s, 'manor');
    const invalid = doAdventure(s, 'definitely_not_a_location');
    expect(locked).toEqual(invalid);
    expect(locked).toEqual({ ok: false, msg: locationAccessIssue(s, 'manor')! });
    expect(s).toEqual(before);
  });

  it('明确情报和线索只开放对应去向，货运旁证进一步开放运河路线', () => {
    const reports = fresh();
    acquireClue(reports, 'dock_missing_reports');
    expect(ids(reports)).toEqual(['market', 'tavern', 'docks']);

    acquireClue(reports, 'dock_manifest_discrepancy');
    expect(ids(reports)).toEqual(['market', 'tavern', 'docks', 'canal']);

    const tower = fresh();
    acquireClue(tower, 'clocktower_public_complaints');
    expect(ids(tower)).toEqual(['market', 'tavern', 'old_tower']);

    const market = fresh();
    market.intel.push('black_market');
    expect(ids(market)).toEqual(['market', 'tavern', 'black_market']);
  });

  it('黑市的时段信息只在已解锁后返回', () => {
    const s = fresh();
    s.hour = 12;
    const hidden = doAdventure(s, 'black_market');
    expect(hidden.msg).toBe(locationAccessIssue(s, 'black_market'));
    expect(hidden.msg).not.toMatch(/22:00|深夜|黑市/);

    s.intel.push('black_market');
    const revealed = doAdventure(s, 'black_market');
    expect(revealed.ok).toBe(false);
    expect(revealed.msg).toMatch(/22:00|深夜/);
  });

  it('单纯 NPC 信任不开地点，尼尔逊在场交付旧宅路线后才开放', () => {
    const s = fresh();
    s.relations.nelson = 20;
    s.day = 2; s.hour = 10;
    expect(isLocationUnlocked(s, 'manor')).toBe(false);
    expect(requestManorAddress(s).ok).toBe(true);
    expect(isLocationUnlocked(s, 'manor')).toBe(true);
    expect(ids(s)).toEqual(['market', 'tavern', 'manor']);
  });

  it('旧 visited 永久保留，当前已接委托目标也继续可达', () => {
    const s = fresh();
    s.visitedLocations.push('sewer');
    s.activeCommission = commission('active_factory', 'factory');
    expect(isLocationUnlocked(s, 'sewer')).toBe(true);
    expect(isLocationUnlocked(s, 'factory')).toBe(true);
    expect(ids(s)).toEqual(['market', 'tavern', 'sewer', 'factory']);
  });

  it('NPC 当前地点与作息共用脱敏，地点解锁后恢复精确名称', () => {
    const s = fresh();
    const victor = NPCS.find(npc => npc.id === 'victor')!;
    s.day = 2; s.hour = 10;
    const hidden = [
      redactLockedLocationText(s, npcLocation(victor, s.day, s.hour) ?? ''),
      redactLockedLocationText(s, scheduleHint(victor)),
    ].join('\n');
    expect(hidden).not.toContain('码头账房');
    expect(hidden).not.toContain('东区码头');
    expect(hidden).not.toContain('黑市后巷');
    expect(hidden).toContain('「醉水手」酒馆');

    s.intel.push('dock_missing', 'black_market');
    const revealed = [
      redactLockedLocationText(s, npcLocation(victor, s.day, s.hour) ?? ''),
      redactLockedLocationText(s, scheduleHint(victor)),
    ].join('\n');
    expect(revealed).toContain('码头账房');
    expect(revealed).toContain('黑市后巷');
  });

  it('source.unlocked 单独不开地点，材料路线必须与组织身份和途径承诺一致', () => {
    const s = fresh();
    const source = s.materialSources['seer:octopus_blood'];
    source.unlocked = true;
    expect(isLocationUnlocked(s, 'canal')).toBe(false);

    Object.assign(s.pathwayLeads.seer, { organizationId: 'secret_order', commitment: true });
    expect(isLocationUnlocked(s, 'canal')).toBe(false);
    Object.assign(s.organizationRoutes.secret_order, { status: 'committed', selectedPathway: 'seer' });
    expect(isLocationUnlocked(s, 'canal')).toBe(true);

    s.organizationRoutes.secret_order.selectedPathway = 'hunter';
    expect(isLocationUnlocked(s, 'canal')).toBe(false);
  });
});

describe('委托范围与 v13 迁移', () => {
  it('新委托只会选择当前已解锁地点', () => {
    const ordinary = fresh();
    for (let i = 0; i < 100; i++) expect(generateCommission(ordinary).locationId).toBe('market');

    const docker = newGame('码头之子', 'docker', []);
    for (let i = 0; i < 100; i++) expect(['market', 'docks']).toContain(generateCommission(docker).locationId);
  });

  it('读档过滤锁定委托板项，保留 visited 与已接委托目标并且幂等', () => {
    const old = fresh();
    old.schemaVersion = 12;
    old.visitedLocations = ['sewer'];
    old.activeCommission = commission('active_factory', 'factory');
    old.board = [
      commission('locked_manor', 'manor'),
      commission('visited_sewer', 'sewer'),
      commission('active_target', 'factory'),
    ];
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(old));

    const loaded = loadGame()!;
    expect(loaded.schemaVersion).toBe(20);
    expect(loaded.visitedLocations).toEqual(['sewer']);
    expect(loaded.activeCommission?.locationId).toBe('factory');
    expect(loaded.board.map(item => item.id)).toEqual(['visited_sewer', 'active_target']);
    expect(isLocationUnlocked(loaded, 'factory')).toBe(true);
    saveGame(loaded);
    expect(loadGame()).toEqual(loaded);
  });
});
