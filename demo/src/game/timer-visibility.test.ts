import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameState } from './types';
import { advanceHours, contactOrganization, getVisibleTimers, loadGame, newGame, saveGame } from './engine';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
}

const visibleIds = (state: GameState) => getVisibleTimers(state).map(timer => timer.id);

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('隐秘日程的权威可见性', () => {
  it('普通人新档只看见生活义务，不知道教会审查与黑市集会时间', () => {
    const state = newGame('普通市民', 'clerk', []);

    expect(state.timers.map(timer => timer.id)).toEqual(expect.arrayContaining(['rent', 'audit', 'market']));
    expect(visibleIds(state)).toEqual(['rent']);
    expect(getVisibleTimers(state).map(timer => timer.label).join(' '))
      .not.toMatch(/教会季度审查|黑市集会日/);
  });

  it('教会身份、可靠教会关系或明确线索分别开放审查日程', () => {
    const orphan = newGame('教会文书', 'orphan', []);
    expect(visibleIds(orphan)).toContain('audit');

    const trusted = newGame('伊芙琳的熟人', 'clerk', []);
    trusted.relations.evelyn = 20;
    expect(visibleIds(trusted)).toContain('audit');

    const informed = newGame('得到通知的人', 'clerk', []);
    informed.intel.push('church_audit');
    expect(visibleIds(informed)).toContain('audit');
    expect(visibleIds(informed)).not.toContain('market');
  });

  it('地点暗号、到访、委托与原始调查历史都不能推断秘密集会时间', () => {
    const pass = newGame('只知道暗号的人', 'clerk', []);
    pass.intel.push('black_market');
    expect(visibleIds(pass)).not.toContain('market');

    const visited = newGame('只去过黑市的人', 'clerk', []);
    visited.visitedLocations.push('black_market');
    expect(visibleIds(visited)).not.toContain('market');

    const commissioned = newGame('只持有委托的人', 'clerk', []);
    commissioned.activeCommission = {
      id: 'black_market_delivery', kind: 'escort', stat: 'cha', difficulty: 20,
      title: '后巷送信', text: '只给了碰面地点', client: 'martha', locationId: 'black_market',
      reward: 12, daysLeft: 2, occult: false,
    };
    expect(visibleIds(commissioned)).not.toContain('market');

    const worldEntry = newGame('只查到异常仓单的人', 'clerk', []);
    worldEntry.organizationRoutes.iron_and_blood.history.push({
      day: 1, step: 'world_entry:iron_blood_token', outcome: 'passed', note: '异常仓单',
    });
    expect(worldEntry.organizationRoutes.iron_and_blood.status).toBe('unknown');
    expect(visibleIds(worldEntry)).not.toContain('market');
  });

  it('正式接触时联系人明确告知日程，倒计时随后按世界时间推进', () => {
    const routed = newGame('组织联系人', 'clerk', []);
    routed.leads.iron_blood_token.stage = 'verified';

    expect(contactOrganization(routed, 'iron_and_blood')).toMatchObject({ ok: true });

    expect(routed.organizationRoutes.iron_and_blood.status).toBe('contacted');
    expect(visibleIds(routed)).toContain('market');
    expect(routed.log.some(entry => entry.text.includes('明确告知了下一次秘密集会的日期'))).toBe(true);
    const before = getVisibleTimers(routed).find(timer => timer.id === 'market')!.hoursLeft;
    advanceHours(routed, 1);
    expect(getVisibleTimers(routed).find(timer => timer.id === 'market')?.hoursLeft).toBe(before - 1);
  });

  it('已正式接触的非凡者在日程到期时进入秘密集会事件', () => {
    const routed = newGame('知晓集会的非凡者', 'clerk', []);
    routed.organizationRoutes.iron_and_blood.status = 'contacted';
    routed.pathwayId = 'hunter';
    routed.sequence = 9;
    routed.timers.find(timer => timer.id === 'market')!.hoursLeft = 1;

    advanceHours(routed, 1);

    expect(routed.pendingEvent).toBe('secret_gathering');
    expect(routed.log.some(entry => entry.text.includes('黑市集会日'))).toBe(true);
  });

  it('未知隐秘日程到期不会泄露名称，也不会把非凡者凭空送进黑市集会', () => {
    const market = newGame('不知暗号的非凡者', 'clerk', []);
    market.pathwayId = 'seer';
    market.sequence = 9;
    market.timers.find(timer => timer.id === 'market')!.hoursLeft = 1;

    advanceHours(market, 1);

    expect(market.pendingEvent).toBeNull();
    expect(market.forcedEventQueue).not.toContain('secret_gathering');
    expect(market.log.map(entry => entry.text).join(' ')).not.toMatch(/黑市集会日|隐匿贤者/);

    const audit = newGame('不知教会日程的人', 'clerk', []);
    audit.timers.find(timer => timer.id === 'audit')!.hoursLeft = 1;
    advanceHours(audit, 1);
    expect(audit.log.map(entry => entry.text).join(' ')).not.toMatch(/教会季度审查|教会审查季/);
    expect(visibleIds(audit)).toEqual(['rent']);
  });

  it('旧档迁移不补发隐秘日程知识，显式已有情报则原样保留', () => {
    const hidden = newGame('旧档普通人', 'clerk', []);
    hidden.schemaVersion = 15;
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(hidden));
    const loadedHidden = loadGame()!;

    expect(loadedHidden.intel).not.toEqual(expect.arrayContaining(['church_audit', 'black_market']));
    expect(visibleIds(loadedHidden)).toEqual(['rent']);
    saveGame(loadedHidden);
    expect(visibleIds(loadGame()!)).toEqual(['rent']);

    const known = newGame('旧档持有地点暗号者', 'clerk', []);
    known.schemaVersion = 15;
    known.intel.push('church_audit', 'black_market');
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(known));
    const loadedKnown = loadGame()!;
    expect(loadedKnown.intel).toEqual(expect.arrayContaining(['church_audit', 'black_market']));
    expect(visibleIds(loadedKnown)).toEqual(expect.arrayContaining(['rent', 'audit']));
    expect(visibleIds(loadedKnown)).not.toContain('market');
  });
});
