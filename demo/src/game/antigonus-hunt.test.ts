import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameState } from './types';
import {
  advanceHours,
  attemptHuntEscape,
  discardStrangeNotebook,
  doChat,
  executeHunt,
  getCombatProfile,
  getHuntEncounterView,
  getInventoryEntries,
  huntActionIssue,
  investigateHuntTarget,
  loadGame,
  nemesisFight,
  newGame,
  prepareHuntStep,
  performHuntCombatExchange,
  recordStrangeNotebookOddities,
  resolveHuntCombat,
  saveGame,
  strangeNotebookActionIssue,
  surrenderStrangeNotebook,
} from './engine';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
}

vi.stubGlobal('localStorage', new MemoryStorage());

const stayAt = (state: GameState, locationId: string) => {
  state.currentLocation = {
    locationId, arrivedDay: state.day, arrivedHour: state.hour,
    travelMode: 'walk', returnHours: 1, returnPrepaid: true,
  };
};

const openTradeFair = (state: GameState, day = 4) => {
  state.day = day;
  state.hour = 22;
  stayAt(state, 'black_market');
  state.tradeFair.invitation = { sourceKind: 'npc', sourceId: 'victor', acquiredDay: 1, acquiredHour: 22 };
  if (!state.organizationRoutes.iron_and_blood.history.some(record => record.step === 'trade_fair_invitation:victor')) {
    state.organizationRoutes.iron_and_blood.history.push({
      day: 1, step: 'trade_fair_invitation:victor', outcome: 'passed', evidenceId: 'trade_fair_invitation',
    });
  }
  if (!state.intel.includes('trade_fair_invitation')) state.intel.push('trade_fair_invitation');
  if (!state.intel.includes('black_market')) state.intel.push('black_market');
};

const meetTarget = (state: GameState) => {
  openTradeFair(state);
  expect(doChat(state, 'masked_fortune_smuggler').ok).toBe(true);
  expect(state.clues.some(clue => clue.id === 'masked_smuggler_trade_tell')).toBe(true);
};

const giveLoadedRevolver = (state: GameState) => {
  state.items.revolver = 1;
  state.items.revolver_ammo = 18;
  state.combatLoadout.weaponId = 'revolver';
};

describe('陌生黑色笔记开局', () => {
  beforeEach(() => localStorage.clear());

  it('只展示角色可见的表层，不在开局泄露家族名、途径或封印等级', () => {
    const state = newGame('笔记持有者', 'clerk', [], 'strange_notebook');
    const item = getInventoryEntries(state).find(entry => entry.id === 'antigonus_notebook');
    const visible = `${item?.name} ${item?.description} ${state.log.map(entry => entry.text).join(' ')}`;

    expect(state.openingScenarioId).toBe('strange_notebook');
    expect(state.items.antigonus_notebook).toBe(1);
    expect(item).toMatchObject({ name: '奇怪的旧笔记', category: 'misc' });
    expect(visible).not.toMatch(/安提哥努斯|占卜家途径|1级封印物|一级封印物/);
  });

  it('以内容矛盾和记忆缺口推进，并允许凭记录交给正式机构', () => {
    const state = newGame('谨慎持有者', 'clerk', [], 'strange_notebook');
    advanceHours(state, 12);
    expect(state.strangeNotebook.influenceStage).toBe(1);
    expect(recordStrangeNotebookOddities(state).ok).toBe(true);
    expect(state.clues.some(clue => clue.id === 'strange_notebook_inconsistency')).toBe(true);

    stayAt(state, 'st_selena_church');
    expect(strangeNotebookActionIssue(state, 'surrender')).toBeNull();
    expect(surrenderStrangeNotebook(state).ok).toBe(true);
    expect(state.strangeNotebook.status).toBe('surrendered');
    expect(state.items.antigonus_notebook).toBe(0);
    expect(state.clues.some(clue => clue.id === 'strange_notebook_official_receipt')).toBe(true);
    saveGame(state);
    expect(loadGame()).toMatchObject({ strangeNotebook: { status: 'surrendered', handedOffLocationId: 'st_selena_church' } });
  });

  it('伪造或不完整的安全状态会恢复为仍在持有', () => {
    const missing = newGame('丢弃伪档', 'clerk', [], 'strange_notebook');
    missing.strangeNotebook.status = 'missing';
    delete missing.strangeNotebook.returnAbsoluteHour;
    missing.items.antigonus_notebook = 0;
    saveGame(missing);
    expect(loadGame()).toMatchObject({ strangeNotebook: { status: 'held' }, items: { antigonus_notebook: 1 } });

    const surrendered = newGame('移交伪档', 'clerk', [], 'strange_notebook');
    surrendered.strangeNotebook.status = 'surrendered';
    surrendered.items.antigonus_notebook = 0;
    surrendered.flags.strange_notebook_handed_off = true;
    saveGame(surrendered);
    expect(loadGame()).toMatchObject({ strangeNotebook: { status: 'held' }, items: { antigonus_notebook: 1 } });

    const discarded = newGame('正常丢弃', 'clerk', [], 'strange_notebook');
    expect(discardStrangeNotebook(discarded).ok).toBe(true);
    saveGame(discarded);
    expect(loadGame()?.strangeNotebook.status).toBe('missing');
  });

  it('旧存档不会被追赠笔记，特殊开局可以完整读档', () => {
    const legacy = newGame('旧档', 'clerk', []);
    legacy.schemaVersion = 22;
    delete (legacy as Partial<GameState>).openingScenarioId;
    delete (legacy as Partial<GameState>).strangeNotebook;
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(legacy));
    expect(loadGame()).toMatchObject({ schemaVersion: 32, openingScenarioId: 'ordinary_morning', strangeNotebook: { status: 'absent' } });
    expect(loadGame()!.items.antigonus_notebook ?? 0).toBe(0);

    const special = newGame('新档', 'clerk', [], 'strange_notebook');
    advanceHours(special, 12);
    saveGame(special);
    expect(loadGame()).toMatchObject({ schemaVersion: 32, openingScenarioId: 'strange_notebook', strangeNotebook: { status: 'held', influenceStage: 1 } });
  });
});

describe('有准备的非凡者猎杀', () => {
  beforeEach(() => localStorage.clear());

  it('必须完成身份、作息、单独会面、退路和先手，死亡才会析出一次待鉴定特性', () => {
    const state = newGame('猎杀准备者', 'clerk', []);
    state.stats.mnd = state.stats.cha = state.stats.phy = 100;
    state.skills.investigate = state.skills.occult = state.skills.speech = state.skills.sneak = state.skills.combat = 10;
    giveLoadedRevolver(state);
    state.combatVitals.hp = getCombatProfile(state).maxHp;
    meetTarget(state);

    const identified = investigateHuntTarget(state, 'masked_fortune_smuggler');
    expect(identified, identified.msg).toMatchObject({ ok: true, outcome: 'passed' });
    expect(huntActionIssue(state, 'masked_fortune_smuggler', 'strike')).toMatch(/必须先确认/);
    for (const [index, step] of (['routine', 'secludedMeeting', 'escapeRoute', 'ambush'] as const).entries()) {
      openTradeFair(state, 7 + index * 7);
      expect(prepareHuntStep(state, 'masked_fortune_smuggler', step).outcome).toBe('passed');
    }
    openTradeFair(state, 35);
    expect(huntActionIssue(state, 'masked_fortune_smuggler', 'strike')).toBeNull();
    expect(executeHunt(state, 'masked_fortune_smuggler').outcome).toBe('passed');

    expect(state.confirmedBeyonderDeaths).toEqual([expect.objectContaining({ sourceId: 'fallen_seer_smuggler', cause: 'hunt' })]);
    expect(state.items.seer9_characteristic).toBe(1);
    expect(state.infamy).toBe(25);
    expect(state.lawAttention).toBe(8);
    expect(state.nemesis).toMatchObject({ name: '「灰手套」莱辛', archetype: '复仇者', known: false });
    expect(getInventoryEntries(state).find(entry => entry.id === 'seer9_characteristic')?.name).toBe('凝结的异常残留');

    state.nemesis = null;
    saveGame(state);
    const loaded = loadGame()!;
    expect(loaded.confirmedBeyonderDeaths).toHaveLength(1);
    expect(loaded.murderRecords).toHaveLength(1);
    expect(loaded.items.seer9_characteristic).toBe(1);
    expect(loaded.nemesis).toMatchObject({ name: '「灰手套」莱辛', archetype: '复仇者' });

    loaded.nemesis!.known = true;
    loaded.nemesis!.hostility = 21;
    loaded.nemesis!.power += 2;
    saveGame(loaded);
    const progressed = loadGame()!;
    expect(progressed.nemesis).toMatchObject({ name: '「灰手套」莱辛', known: true, hostility: 21, power: loaded.nemesis!.power });

    progressed.stats.energy = progressed.stats.phy = progressed.stats.spi = 100;
    progressed.skills.combat = 10;
    giveLoadedRevolver(progressed);
    expect(nemesisFight(progressed).ok).toBe(true);
    expect(progressed.nemesis).toBeNull();
    expect(progressed.murderRecords[0].revengeResolution).toBeDefined();
    saveGame(progressed);
    expect(loadGame()?.nemesis).toBeNull();
  });

  it('死亡与谋杀记录不能在缺少权威检定回执时互相自证', () => {
    const state = newGame('伪档', 'clerk', []);
    for (const itemId of ['seer9_characteristic', 'spectator9_characteristic', 'hunter9_characteristic', 'sleepless9_characteristic', 'apprentice9_characteristic']) {
      state.items[itemId] = 1;
    }
    state.murderRecords = [{
      targetId: 'masked_fortune_smuggler', npcId: 'masked_fortune_smuggler', deathSourceId: 'fallen_seer_smuggler',
      day: 1, hour: 22, infamyGain: 25, lawAttentionGain: 8, avengerName: '「灰手套」莱辛',
      settlementAttemptId: 'forged:settlement',
    }];
    state.confirmedBeyonderDeaths = [{
      sourceId: 'fallen_seer_smuggler', npcId: 'masked_fortune_smuggler', pathwayId: 'seer', sequence: 9,
      characteristicItemId: 'seer9_characteristic', confirmedDay: 1, confirmedHour: 22, cause: 'hunt',
      settlementAttemptId: 'forged:settlement',
    }];
    state.infamy = 25;
    state.lawAttention = 8;
    saveGame(state);

    const loaded = loadGame()!;
    expect(loaded.murderRecords).toEqual([]);
    expect(loaded.confirmedBeyonderDeaths).toEqual([]);
    expect(loaded.items.seer9_characteristic).toBe(0);
    expect(loaded.items.spectator9_characteristic).toBe(0);
    expect(loaded.items.hunter9_characteristic).toBe(0);
    expect(loaded.items.sleepless9_characteristic).toBe(0);
    expect(loaded.items.apprentice9_characteristic).toBe(0);
    expect(loaded.infamy).toBe(0);
    expect(loaded.lawAttention).toBe(0);
  });

  it('单独伪造复仇已解决标记不能跳过好友追索', () => {
    const state = newGame('复仇伪档', 'clerk', []);
    state.stats.mnd = state.stats.cha = state.stats.phy = 100;
    state.skills.investigate = state.skills.occult = state.skills.speech = state.skills.sneak = state.skills.combat = 10;
    giveLoadedRevolver(state);
    state.combatVitals.hp = getCombatProfile(state).maxHp;
    meetTarget(state);
    expect(investigateHuntTarget(state, 'masked_fortune_smuggler').outcome).toBe('passed');
    for (const [index, step] of (['routine', 'secludedMeeting', 'escapeRoute', 'ambush'] as const).entries()) {
      openTradeFair(state, 7 + index * 7);
      expect(prepareHuntStep(state, 'masked_fortune_smuggler', step).outcome).toBe('passed');
    }
    openTradeFair(state, 35);
    expect(executeHunt(state, 'masked_fortune_smuggler').outcome).toBe('passed');
    state.murderRecords[0].revengeResolution = {
      startedDay: state.day, startedHour: state.hour, completedDay: state.day, completedHour: state.hour,
      nemesisPower: 1, attackScore: 999,
      context: { phy: 100, combat: 10, spirit: 100, hadRevolver: true, wasHunter: true },
      receipt: { hoursElapsed: 4, energyCost: 35, moneyGain: 80, corruptionGain: 4, sanityCost: 4, combatSkillGain: 0 },
    };
    state.nemesis = null;
    saveGame(state);
    expect(loadGame()?.nemesis).toMatchObject({ name: '「灰手套」莱辛' });
  });

  it('调查连续失手会引发对峙；逃脱与交战失败不会凭空产生特性', () => {
    const state = newGame('失手调查者', 'clerk', []);
    meetTarget(state);
    state.stats.mnd = 1;
    state.skills.investigate = state.skills.occult = 0;
    const firstAttempt = investigateHuntTarget(state, 'masked_fortune_smuggler');
    expect(firstAttempt, firstAttempt.msg).toMatchObject({ ok: true, outcome: 'blocked' });

    openTradeFair(state, 7);
    state.stats.mnd = 100;
    state.skills.investigate = state.skills.occult = 10;
    expect(investigateHuntTarget(state, 'masked_fortune_smuggler').outcome).toBe('passed');
    openTradeFair(state, 14);
    state.stats.mnd = state.stats.phy = 1;
    state.skills.investigate = state.skills.sneak = state.skills.combat = 0;
    expect(prepareHuntStep(state, 'masked_fortune_smuggler', 'routine').outcome).toBe('blocked');
    expect(getHuntEncounterView(state)?.phase).toBe('escape_choice');
    expect(attemptHuntEscape(state).outcome).toBe('blocked');
    expect(getHuntEncounterView(state)?.phase).toBe('combat');
    expect(performHuntCombatExchange(state, 'guard').ok).toBe(true);
    expect(performHuntCombatExchange(state, 'guard').ok).toBe(true);
    expect(resolveHuntCombat(state).outcome).toBe('blocked');

    expect(state.confirmedBeyonderDeaths).toEqual([]);
    expect(state.items.seer9_characteristic ?? 0).toBe(0);
    expect(state.activeHunt).toBeNull();
    expect(state.flags['hunt_target_departed:masked_fortune_smuggler']).toBe(true);
  });
});
