import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROSELLE_DIARY_PAGE_DEFS } from './data';
import type { GameState } from './types';
import {
  authenticateDiaryPage, compareClocktowerRepairRecords, decodeDiaryPage, decodeOrganizationEvidence, discoverDiaryPage,
  doAdventure, doChat, identifyOrganizationEvidence, loadGame, newGame,
  reportAnomalyToEvelyn, requestManorAddress, researchClocktowerRumors, saveGame, traceClocktowerAnomaly,
  verifyDiaryPageOperationally,
} from './engine';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  vi.stubGlobal('localStorage', new MemoryStorage());
});

function trustNpc(s: GameState, npcId: 'nelson' | 'victor') {
  s.day = 2; s.hour = 10; s.stats.energy = 100;
  expect(doChat(s, npcId).ok).toBe(true);
  s.relations[npcId] = 20;
}

function acquireFalsePage(s: GameState) {
  trustNpc(s, 'victor');
  s.intel.push('black_market');
  s.day = 4; s.hour = 22; s.stats.energy = 100;
  expect(doAdventure(s, 'black_market').ok).toBe(true);
  expect(s.visitedLocations).toContain('black_market');
  s.day = 11; s.hour = 22;
  expect(discoverDiaryPage(s, 'diary_false_formula').ok).toBe(true);
}

describe('罗塞尔日记真实来源与三层边界', () => {
  it('无真实来源时三页全部不可取得，未知前不靠标题泄题', () => {
    const s = newGame('日记测试者', 'clerk', []);
    expect(ROSELLE_DIARY_PAGE_DEFS).toHaveLength(3);
    expect(ROSELLE_DIARY_PAGE_DEFS.find(page => page.id === 'diary_false_formula')?.title).not.toMatch(/伪|万能配方/);
    for (const def of ROSELLE_DIARY_PAGE_DEFS) expect(discoverDiaryPage(s, def.id).ok).toBe(false);
    expect(Object.values(s.diaryPages).every(page => !page.acquired)).toBe(true);
  });

  it('三页分别绑定公开档案、庄园冒险和维克多黑市入口，译读不授予能力或资格', () => {
    const s = newGame('日记测试者', 'clerk', []);
    const beforeKnowledge = [...s.knowledge];

    expect(researchClocktowerRumors(s).ok).toBe(true);
    expect(discoverDiaryPage(s, 'diary_org_rules').ok).toBe(true);
    expect(decodeDiaryPage(s, 'diary_org_rules').ok).toBe(true);

    trustNpc(s, 'nelson');
    expect(requestManorAddress(s).ok).toBe(true);
    s.stats.energy = 100;
    expect(doAdventure(s, 'manor').ok).toBe(true);
    expect(discoverDiaryPage(s, 'diary_door_fragment').ok).toBe(true);
    expect(decodeDiaryPage(s, 'diary_door_fragment').ok).toBe(true);

    acquireFalsePage(s);
    expect(decodeDiaryPage(s, 'diary_false_formula').ok).toBe(true);

    expect(s.knowledge).toEqual(beforeKnowledge);
    expect(s.pathwayId).toBeNull();
    expect(Object.values(s.organizationRoutes).every(route => route.status === 'unknown')).toBe(true);
    expect(Object.values(s.pathwayLeads).every(lead => lead.formulaStatus !== 'verified' && !lead.commitment)).toBe(true);
  });

  it('authenticate 要求Nelson已结识、好感≥20且开店', () => {
    const s = newGame('日记测试者', 'clerk', []);
    researchClocktowerRumors(s); discoverDiaryPage(s, 'diary_org_rules'); decodeDiaryPage(s, 'diary_org_rules');
    expect(authenticateDiaryPage(s, 'diary_org_rules', 'ella').ok).toBe(false);
    expect(authenticateDiaryPage(s, 'diary_org_rules', 'nelson').ok).toBe(false);
    s.relations.nelson = 19; s.day = 2; s.hour = 10;
    expect(authenticateDiaryPage(s, 'diary_org_rules', 'nelson').ok).toBe(false);
    s.relations.nelson = 20; s.day = 8; s.hour = 10;
    expect(authenticateDiaryPage(s, 'diary_org_rules', 'nelson').ok).toBe(false);
    s.day = 9; s.hour = 10;
    expect(authenticateDiaryPage(s, 'diary_org_rules', 'nelson').ok).toBe(true);
  });

  it('组织制度真页需值夜者接触交叉核验，仍不授予配方或资格', () => {
    const s = newGame('日记测试者', 'clerk', []);
    researchClocktowerRumors(s);
    compareClocktowerRepairRecords(s);
    discoverDiaryPage(s, 'diary_org_rules'); decodeDiaryPage(s, 'diary_org_rules');
    s.hour = 22; traceClocktowerAnomaly(s);
    s.hour = 9; expect(reportAnomalyToEvelyn(s).ok).toBe(true);
    trustNpc(s, 'nelson');
    expect(authenticateDiaryPage(s, 'diary_org_rules', 'nelson').ok).toBe(true);
    s.relations.evelyn = 20; s.hour = 14;
    expect(verifyDiaryPageOperationally(s, 'diary_org_rules', 'evelyn').ok).toBe(true);
    expect(s.diaryPages.diary_org_rules.operationalVerified).toBe(true);
    expect(s.formulas).toEqual([]);
    expect(s.organizationRoutes.nightwatch.status).toBe('contacted');
  });

  it('门扉真页需庄园线索已辨认后交叉核验，并成为亚伯拉罕核验前置', () => {
    const s = newGame('日记测试者', 'clerk', []);
    trustNpc(s, 'nelson');
    expect(requestManorAddress(s).ok).toBe(true);
    s.stats.energy = 100; doAdventure(s, 'manor');
    discoverDiaryPage(s, 'diary_door_fragment'); decodeDiaryPage(s, 'diary_door_fragment');
    expect(authenticateDiaryPage(s, 'diary_door_fragment', 'nelson').ok).toBe(true);
    expect(verifyDiaryPageOperationally(s, 'diary_door_fragment', 'nelson').ok).toBe(false);
    expect(decodeOrganizationEvidence(s, 'abraham_branch').ok).toBe(true);
    s.day += 1; s.hour = 10;
    expect(identifyOrganizationEvidence(s, 'abraham_branch', 'nelson').ok).toBe(true);
    expect(verifyDiaryPageOperationally(s, 'diary_door_fragment', 'nelson').ok).toBe(true);
    expect(s.pathwayLeads.apprentice.formulaStatus).toBe('unverified');
  });

  it('中性标题页面鉴定为伪作后永久不能操作核验，状态保存不刷新', () => {
    const s = newGame('日记测试者', 'clerk', []);
    acquireFalsePage(s); decodeDiaryPage(s, 'diary_false_formula');
    trustNpc(s, 'nelson');
    expect(authenticateDiaryPage(s, 'diary_false_formula', 'nelson').ok).toBe(true);
    expect(verifyDiaryPageOperationally(s, 'diary_false_formula', 'nelson').ok).toBe(false);
    expect(s.diaryPages.diary_false_formula).toMatchObject({ authenticity: 'forged', operationalVerified: false });
    saveGame(s);
    const loaded = loadGame()!;
    expect(discoverDiaryPage(loaded, 'diary_false_formula').ok).toBe(false);
    saveGame(loaded); expect(loadGame()).toEqual(loaded);
  });
});
