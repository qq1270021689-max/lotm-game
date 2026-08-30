import { beforeEach, describe, expect, it, vi } from 'vitest';
import appSource from '../App.tsx?raw';
import type { GameState } from './types';
import {
  acquireClue,
  acceptCommission,
  acquireBook,
  activeEncounterIssue,
  buyFromShop,
  buyTradeFairProduct,
  completeOrganizationQualification,
  doChat,
  doSocial,
  attemptEncounterEscape,
  deepInvestigationIssue,
  dockThreatSignal,
  doSleep,
  getDeepInvestigationView,
  getPendingEncounterView,
  inspectItemWithSpiritVision,
  loadGame,
  newGame,
  performDeepInvestigation,
  performDivination,
  performTingenLandmarkAction,
  readBookSession,
  resolveEncounterCombat,
  saveGame,
  travelToLocation,
} from './engine';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
}

const storage = new MemoryStorage();

function atDocks(): GameState {
  const s = newGame('调查者', 'clerk', []);
  s.hour = 10;
  s.currentLocation = {
    locationId: 'docks', arrivedDay: 1, arrivedHour: 10,
    travelMode: 'walk', returnHours: 1, returnPrepaid: true,
  };
  return s;
}

function readyForAllDeepInvestigations(): GameState {
  const s = atDocks();
  s.stats.mnd = 50;
  acquireClue(s, 'dock_missing_reports');
  acquireClue(s, 'dock_manifest_discrepancy');
  acquireClue(s, 'dock_crate_trace');
  return s;
}

function triggerEncounter(s = readyForAllDeepInvestigations()) {
  expect(performDeepInvestigation(s, 'deep_dock_missing_reports')).toMatchObject({ ok: true, outcome: 'passed' });
  expect(performDeepInvestigation(s, 'deep_dock_manifest_discrepancy')).toMatchObject({ ok: true, outcome: 'passed' });
  expect(performDeepInvestigation(s, 'deep_dock_crate_trace')).toMatchObject({ ok: true, outcome: 'passed' });
  expect(s.pendingEncounter).toMatchObject({
    encounterId: 'encounter_dock_manifest_cleaner', phase: 'escape_choice',
  });
  return s;
}

beforeEach(() => {
  storage.clear();
  vi.stubGlobal('localStorage', storage);
});

describe('线索深入调查', () => {
  it('只为真实持有的线索显示调查入口，硬前置失败零成本零警觉', () => {
    const s = atDocks();
    const before = structuredClone(s);
    expect(getDeepInvestigationView(s, 'dock_missing_reports')).toBeNull();
    expect(deepInvestigationIssue(s, 'deep_dock_missing_reports')).toContain('没有这条');
    expect(performDeepInvestigation(s, 'deep_dock_missing_reports').ok).toBe(false);
    expect(s.stats.energy).toBe(before.stats.energy);
    expect(s.hour).toBe(before.hour);
    expect(s.caseThreats).toEqual({});
  });

  it('检定通过只确认下一步，不发钱、物品、能力或新线索', () => {
    const s = atDocks();
    s.stats.mnd = 40;
    acquireClue(s, 'dock_missing_reports');
    const before = {
      pence: s.pence, items: structuredClone(s.items), skills: structuredClone(s.skills),
      formulas: [...s.formulas], clues: s.clues.map(clue => clue.id),
    };

    expect(performDeepInvestigation(s, 'deep_dock_missing_reports')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(s.deepInvestigations.deep_dock_missing_reports).toMatchObject({
      clueId: 'dock_missing_reports', nextStepId: 'dock_next_compare_cargo_records',
    });
    expect(getDeepInvestigationView(s, 'dock_missing_reports')).toMatchObject({
      completed: true,
      nextStepText: expect.stringContaining('货运备份'),
    });
    expect(s.pence).toBe(before.pence);
    expect(s.items).toEqual(before.items);
    expect(s.skills).toEqual(before.skills);
    expect(s.formulas).toEqual(before.formulas);
    expect(s.clues.map(clue => clue.id)).toEqual(before.clues);
    expect(s.caseThreats.dock_manifest_cleaner.attention).toBe(10);
  });

  it('相同条件下的失败不能重复消耗或反复增加警觉', () => {
    const s = atDocks();
    s.stats.mnd = 0;
    acquireClue(s, 'dock_missing_reports');
    expect(performDeepInvestigation(s, 'deep_dock_missing_reports')).toMatchObject({ ok: true, outcome: 'blocked' });
    const snapshot = { energy: s.stats.energy, hour: s.hour, attention: s.caseThreats.dock_manifest_cleaner.attention };
    expect(deepInvestigationIssue(s, 'deep_dock_missing_reports')).toContain('没有实质变化');
    expect(performDeepInvestigation(s, 'deep_dock_missing_reports').ok).toBe(false);
    expect({ energy: s.stats.energy, hour: s.hour, attention: s.caseThreats.dock_manifest_cleaner.attention }).toEqual(snapshot);
  });

  it('深入调查不会把精力恰好扣到零并在遭遇前插入昏倒结算', () => {
    const s = readyForAllDeepInvestigations();
    expect(performDeepInvestigation(s, 'deep_dock_missing_reports').ok).toBe(true);
    expect(performDeepInvestigation(s, 'deep_dock_manifest_discrepancy').ok).toBe(true);
    s.stats.energy = 12;
    const before = JSON.stringify(s);
    expect(performDeepInvestigation(s, 'deep_dock_crate_trace')).toMatchObject({ ok: false, msg: expect.stringContaining('疲惫') });
    expect(JSON.stringify(s)).toBe(before);
    expect(s.pendingEncounter).toBeNull();
  });
});

describe('案件警觉与遭遇', () => {
  it('自行占卜受保护的薄片会留下痕迹，同一目标不能重复叠加警觉', () => {
    const s = newGame('占卜家', 'clerk', []);
    s.pathwayId = 'seer';
    s.sequence = 9;
    s.stats.spi = 50;
    s.items.dock_scale_evidence = 1;
    s.items.symbol_cards = 1;
    s.divinationTraining = { cards: true, dream: true, media: ['symbol_cards'], teachers: ['formal_seer_training'] };
    s.divinationCredentials = [
      { kind: 'training', source: 'formal_seer_training', method: 'cards', day: 1, hour: 7 },
      { kind: 'training', source: 'formal_seer_training', method: 'dream', day: 1, hour: 7 },
    ];
    expect(performDivination(s, 'item', 'dock_scale_evidence', 'cards', 'self')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(s.caseThreats.dock_manifest_cleaner.attention).toBe(15);
    expect(performDivination(s, 'item', 'dock_scale_evidence', 'cards', 'self')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(s.caseThreats.dock_manifest_cleaner.attention).toBe(15);
  });

  it('固定来源累计到阈值后只生成一次遭遇，UI只得到定性征兆', () => {
    const s = triggerEncounter();
    expect(s.caseThreats.dock_manifest_cleaner).toMatchObject({ attention: 75, encounterCount: 1 });
    expect(dockThreatSignal(s)).toContain('清理');
    expect(getPendingEncounterView(s)).toMatchObject({ phase: 'escape_choice', title: '有人跟了上来' });
    expect(performDeepInvestigation(s, 'deep_dock_crate_trace').ok).toBe(false);
    expect(s.caseThreats.dock_manifest_cleaner.encounterCount).toBe(1);
    expect(appSource).not.toContain('警觉值');
    expect(appSource).not.toContain('attention}');
  });

  it('逃脱通过会清除遭遇并保留案件；普通行动在待决期间被阻断', () => {
    const s = readyForAllDeepInvestigations();
    s.stats.phy = 50;
    triggerEncounter(s);
    expect(activeEncounterIssue(s)).toBeTruthy();
    expect(doSleep(s).ok).toBe(false);
    expect(travelToLocation(s, 'market', 'walk').ok).toBe(false);

    expect(attemptEncounterEscape(s)).toMatchObject({ ok: true, outcome: 'passed' });
    expect(s.pendingEncounter).toBeNull();
    expect(s.gameOver).toBeNull();
    expect(s.clues.map(clue => clue.id)).toEqual(expect.arrayContaining([
      'dock_missing_reports', 'dock_manifest_discrepancy', 'dock_crate_trace',
    ]));
  });

  it('待决遭遇冻结委托、人脉、组织、交易、阅读与检视入口', () => {
    const actions: readonly [string, (state: GameState) => { ok: boolean; msg?: string }][] = [
      ['接取委托', state => acceptCommission(state, 'missing')],
      ['攀谈', state => doChat(state, 'martha')],
      ['拜访', state => doSocial(state, 'martha')],
      ['组织资格', state => completeOrganizationQualification(state, 'secret_order')],
      ['交易会购买', state => buyTradeFairProduct(state, 'missing')],
      ['店铺购买', state => buyFromShop(state, 'missing', 'missing')],
      ['取得书籍', state => acquireBook(state, 'missing')],
      ['阅读', state => readBookSession(state, 'missing')],
      ['灵视检视', state => inspectItemWithSpiritVision(state, 'missing')],
      ['地点人脉行动', state => performTingenLandmarkAction(state, 'missing')],
    ];
    for (const [label, action] of actions) {
      const s = triggerEncounter();
      const before = JSON.stringify(s);
      expect(action(s), label).toMatchObject({ ok: false, msg: expect.stringContaining('必须先处理') });
      expect(JSON.stringify(s), label).toBe(before);
    }
    expect(appSource).toContain('if (s.pendingEncounter && !allowDuringEncounter)');
    expect(appSource).toContain('委托、人脉、交易和组织事务暂时无法进行。');
  });

  it('逃脱失败立即进入防御战，不能再次逃跑；战斗失败仍存活且没有战利品', () => {
    const s = triggerEncounter();
    s.stats.phy = 0;
    s.skills.sneak = 0;
    expect(attemptEncounterEscape(s)).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(s.pendingEncounter?.phase).toBe('combat');
    expect(attemptEncounterEscape(s).ok).toBe(false);

    const before = { pence: s.pence, items: structuredClone(s.items), skills: structuredClone(s.skills) };
    s.skills.combat = 0;
    expect(resolveEncounterCombat(s)).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(s.pendingEncounter).toBeNull();
    expect(s.gameOver).toBeNull();
    expect(s.pence).toBe(before.pence);
    expect(s.items).toEqual(before.items);
    expect(s.skills).toEqual(before.skills);
    expect(s.flags.dock_encounter_wounded).toBe(true);
    expect(s.clues).toHaveLength(3);
  });

  it('低精力逃脱失败仍直接进入战斗，不会在两阶段之间昏倒跳时', () => {
    const s = triggerEncounter();
    s.stats.phy = 0;
    s.stats.energy = 2;
    const absoluteHour = (s.day - 1) * 24 + s.hour;
    expect(attemptEncounterEscape(s)).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(s.pendingEncounter?.phase).toBe('combat');
    expect(s.stats.energy).toBe(1);
    expect((s.day - 1) * 24 + s.hour).toBe(absoluteHour + 1);
  });

  it('防御战通过只解除案件威胁，不调用宿敌奖励', () => {
    const s = triggerEncounter();
    s.stats.phy = 0;
    expect(attemptEncounterEscape(s).outcome).toBe('blocked');
    s.stats.phy = 50;
    const beforePence = s.pence;
    expect(resolveEncounterCombat(s)).toMatchObject({ ok: true, outcome: 'passed' });
    expect(s.caseThreats.dock_manifest_cleaner.status).toBe('resolved');
    expect(s.nemesis).toBeNull();
    expect(s.pence).toBe(beforePence);
  });

  it.each([
    ['通过', 50, 'passed'],
    ['失败', 0, 'blocked'],
  ] as const)('低理智防御战%s仍保留生存边界', (_label, phy, outcome) => {
    const s = triggerEncounter();
    s.stats.phy = 0;
    s.stats.san = 1;
    expect(attemptEncounterEscape(s).outcome).toBe('blocked');
    s.stats.phy = phy;
    expect(resolveEncounterCombat(s)).toMatchObject({ ok: true, outcome });
    expect(s.stats.san).toBe(1);
    expect(s.gameOver).toBeNull();
    expect(s.pendingEncounter).toBeNull();
  });
});

describe('v22存档边界', () => {
  it('v21旧档不追溯生成调查、警觉或遭遇', () => {
    const old = readyForAllDeepInvestigations();
    old.schemaVersion = 21;
    old.deepInvestigations = {
      forged: { investigationId: 'forged', clueId: 'dock_crate_trace', confirmedDay: 1, confirmedHour: 10, nextStepId: 'forged' },
    };
    old.caseThreats = {
      dock_manifest_cleaner: {
        threatId: 'dock_manifest_cleaner', attention: 100, status: 'active', encounterCount: 1,
        noticedSourceIds: ['deep_dock_crate_trace'], shownSignalStages: [25, 50, 75],
      },
    };
    old.pendingEncounter = {
      encounterId: 'encounter_dock_manifest_cleaner', threatId: 'dock_manifest_cleaner', phase: 'combat',
      sourceKind: 'deep_investigation', sourceId: 'deep_dock_crate_trace',
      startedDay: 1, startedHour: 10, narrativeVariant: 0,
    };
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(old));
    expect(loadGame()).toMatchObject({ schemaVersion: 22, deepInvestigations: {}, caseThreats: {}, pendingEncounter: null });
  });

  it('合法遭遇可往返，伪造来源会在读取时清除', () => {
    const s = triggerEncounter();
    saveGame(s);
    const loaded = loadGame()!;
    expect(loaded.pendingEncounter).toMatchObject({ encounterId: 'encounter_dock_manifest_cleaner', phase: 'escape_choice' });
    expect(loaded.deepInvestigations).toEqual(s.deepInvestigations);

    loaded.pendingEncounter!.sourceId = 'forged_source';
    saveGame(loaded);
    expect(loadGame()!.pendingEncounter).toBeNull();
  });
});
