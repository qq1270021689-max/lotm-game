import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JOBS, ORIGINS, findJob } from './data';
import type { Commission, GameState } from './types';
import {
  acceptCommission,
  abandonCommission,
  buyFormula,
  buyItem,
  commuteToWork,
  doPromote,
  doWork,
  drinkPotion,
  interactWithWorkmate,
  leaveWork,
  loadGame,
  nemesisFight,
  nemesisIntel,
  nemesisShelter,
  newGame,
  removeCurse,
  resignJob,
  takeJob,
  workmatesFor,
} from './engine';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
}

const commission = (): Commission => ({
  id: 'test_commission', kind: 'investigate', stat: 'mnd', difficulty: 20,
  title: '测试委托', text: '测试', client: 'martha', locationId: 'docks',
  reward: 24, daysLeft: 3, occult: false,
});

const clone = (s: GameState) => structuredClone(s);

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('职业初始映射与通勤', () => {
  it('五种出身都有预期的初始职业', () => {
    const expected: Record<string, string> = {
      clerk: 'telegraph_clerk',
      docker: 'dock_loader',
      orphan: 'church_copyist',
      merchant: 'shop_assistant',
      fallen_noble: 'private_tutor',
    };
    expect(ORIGINS).toHaveLength(5);
    for (const origin of ORIGINS) {
      expect(newGame('测试者', origin.id, []).jobId).toBe(expected[origin.id]);
    }
  });

  it.each(JOBS)('$name 晚到时拒绝通勤且状态完全不变', job => {
    const s = newGame('测试者', 'clerk', []);
    s.jobId = job.id;
    s.atWork = false;
    s.hour = job.shiftEnd - job.commuteHours - job.workHours + 1;
    const before = clone(s);

    const result = commuteToWork(s);

    expect(result.ok).toBe(false);
    expect(result.msg).toContain('今天已来不及完成一轮');
    expect(s).toEqual(before);
  });

  it('合法通勤消耗时间精力、进入在岗场景并补足两名同事', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const s = newGame('测试者', 'clerk', []);
    s.hour = 7;
    s.stats.energy = 90;

    expect(commuteToWork(s)).toEqual({ ok: true });
    expect(s.atWork).toBe(true);
    expect(s.hour).toBe(8);
    expect(s.stats.energy).toBe(87);
    expect(workmatesFor(s)).toHaveLength(2);
    expect(workmatesFor(s).every(n => n.identity === findJob(s.jobId)?.coworkerIdentity)).toBe(true);
  });
});

describe('在岗工作状态机', () => {
  it('每个工作时段按职业工资、出身倍率和金钱天赋结算，并允许班次内重复工作', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const s = newGame('测试者', 'docker', ['money_grubber']);
    s.atWork = true;
    s.hour = 6;
    s.stats.energy = 100;
    const beforeMoney = s.pence;

    expect(doWork(s).ok).toBe(true);
    expect(doWork(s).ok).toBe(true);

    expect(s.pence - beforeMoney).toBe(2 * Math.round(42 * 1.25 * 1.2));
    expect(s.hour).toBe(14);
    expect(s.stats.energy).toBe(32);
  });

  it('选择真实同事互动会建立关系并推进时间', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const s = newGame('测试者', 'clerk', []);
    s.hour = 7;
    commuteToWork(s);
    const mate = workmatesFor(s)[0];
    const beforeHour = s.hour;

    expect(interactWithWorkmate(s, mate.id).ok).toBe(true);
    expect(s.relations[mate.id]).toBeGreaterThan(0);
    expect(s.hour).toBe(beforeHour + 1);
    expect(s.log.at(-1)?.text).toContain(mate.name);
  });

  it('下班执行返程通勤并离开工作场景', () => {
    const s = newGame('测试者', 'clerk', []);
    s.hour = 7;
    s.stats.energy = 90;
    commuteToWork(s);

    expect(leaveWork(s)).toEqual({ ok: true });
    expect(s.atWork).toBe(false);
    expect(s.hour).toBe(9);
    expect(s.stats.energy).toBe(84);
  });

  it('离职会离开工作场景，之后可以重新就业', () => {
    const s = newGame('测试者', 'clerk', []);
    s.hour = 7;
    commuteToWork(s);

    expect(resignJob(s).ok).toBe(true);
    expect(s.atWork).toBe(false);
    expect(s.jobId).toBeNull();
    expect(takeJob(s, 'tavern_hand')).toEqual({ ok: true });
    expect(s.jobId).toBe('tavern_hand');
  });
});

describe('存档迁移与在岗防线', () => {
  it('旧 v6 存档缺少职业字段时按出身补职业并安全置为非在岗', () => {
    const old = newGame('旧存档', 'merchant', []);
    const legacy = { ...old } as Partial<GameState>;
    delete legacy.jobId;
    delete legacy.atWork;
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(legacy));

    const loaded = loadGame();

    expect(loaded?.jobId).toBe('shop_assistant');
    expect(loaded?.atWork).toBe(false);
  });

  it('在岗时所有公开外部动作均不能改变状态', () => {
    const makeState = () => {
      const s = newGame('测试者', 'clerk', []);
      s.atWork = true;
      s.hour = 8;
      s.board = [commission()];
      s.activeCommission = commission();
      s.items.star_crystal = 1;
      s.items.octopus_blood = 1;
      s.formulas.push('seer9');
      s.pathwayId = 'seer';
      s.sequence = 9;
      s.digestion = 100;
      s.formulas.push('seer8');
      s.items.goat_horn = 1;
      s.items.face_rose = 1;
      s.tags.push('cursed', 'registered');
      s.nemesis = { name: '测试宿敌', archetype: '复仇者', motive: '测试', power: 10, hostility: 20, known: true, alive: true };
      s.relations.evelyn = 50;
      s.pence = 1000;
      return s;
    };
    const guarded: Array<[string, (s: GameState) => void, (s: GameState) => unknown]> = [
      ['acceptCommission', s => { s.activeCommission = null; }, s => acceptCommission(s, 'test_commission')],
      ['abandonCommission', () => {}, s => abandonCommission(s)],
      ['buyItem', () => {}, s => buyItem(s, 'whiskey', 12)],
      ['buyFormula', () => {}, s => buyFormula(s, 'hunter9', 30)],
      ['drinkPotion', s => { s.pathwayId = null; s.sequence = null; }, s => drinkPotion(s, 'seer')],
      ['doPromote', () => {}, s => doPromote(s)],
      ['nemesisIntel', s => { s.nemesis!.known = false; }, s => nemesisIntel(s)],
      ['nemesisShelter', () => {}, s => nemesisShelter(s)],
      ['nemesisFight', () => {}, s => nemesisFight(s)],
      ['removeCurse', () => {}, s => removeCurse(s)],
    ];

    for (const [name, prepare, action] of guarded) {
      const s = makeState();
      prepare(s);
      const before = clone(s);
      const result = action(s);
      expect(s, name).toEqual(before);
      if (result && typeof result === 'object' && 'ok' in result) {
        expect(result, name).toMatchObject({ ok: false });
      }
    }
  });
});
