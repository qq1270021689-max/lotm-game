import { beforeEach, describe, expect, it, vi } from 'vitest';
import appSource from '../App.tsx?raw';
import engineSource from './engine.ts?raw';
import type { GameState } from './types';
import {
  acquireClue,
  advanceHours,
  applyCombatImpact,
  divinationIssue,
  doNap,
  doSleep,
  doSocial,
  getCombatProfile,
  getNpcDivinationRequests,
  inspectItemWithSpiritVision,
  loadGame,
  nemesisFight,
  newGame,
  performDivination,
  saveGame,
} from './engine';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
}

const fresh = () => newGame('战斗与会面测试者', 'clerk', []);
const unlockTower = (state: GameState) => acquireClue(state, 'clocktower_public_complaints', 'public_records', 'test');
function formalSeer() {
  const state = fresh();
  state.pathwayId = 'seer';
  state.sequence = 9;
  state.divinationTraining = { cards: true, dream: true, media: ['symbol_cards'], teachers: ['formal_seer_training'] };
  state.divinationCredentials = [
    { kind: 'training', source: 'formal_seer_training', method: 'cards', day: 1, hour: 7 },
    { kind: 'training', source: 'formal_seer_training', method: 'dream', day: 1, hour: 7 },
  ];
  state.items.symbol_cards = 1;
  state.stats.energy = 100;
  return state;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('当面会见后的NPC代占', () => {
  it('陌生、仅认识、达到好感但未拜访都不能直接代占且零状态', () => {
    const state = fresh(); unlockTower(state); state.day = 2; state.hour = 10; state.pence = 100;
    for (const favor of [undefined, 10, 45] as const) {
      if (favor === undefined) delete state.relations.nelson;
      else state.relations.nelson = favor;
      const before = structuredClone(state);
      expect(performDivination(state, 'location', 'old_tower', 'cards', 'nelson')).toMatchObject({ ok: false });
      expect(state).toEqual(before);
    }
  });

  it('拜访后可请求一次；时间推进失效，同一时刻重载保留且NPC彼此隔离', () => {
    const state = fresh(); unlockTower(state); state.day = 2; state.hour = 10;
    state.relations.nelson = 45; state.relations.evelyn = 45; state.pence = 100; state.stats.energy = 100;
    expect(doSocial(state, 'nelson').ok).toBe(true);
    expect(state.npcVisitSession).toEqual({ npcId: 'nelson', startedDay: 2, startedHour: 10, day: 2, hour: 11 });
    expect(getNpcDivinationRequests(state, 'nelson').some(target => target.id === 'old_tower')).toBe(true);
    expect(getNpcDivinationRequests(state, 'evelyn')).toEqual([]);
    saveGame(state);
    const loaded = loadGame()!;
    expect(loaded.npcVisitSession).toEqual(state.npcVisitSession);
    expect(performDivination(loaded, 'location', 'old_tower', 'cards', 'nelson').ok).toBe(true);
    expect(loaded.npcVisitSession).toBeNull();
    const afterFirst = structuredClone(loaded);
    expect(performDivination(loaded, 'location', 'old_tower', 'cards', 'nelson')).toMatchObject({ ok: false });
    expect(loaded).toEqual(afterFirst);

    const expired = fresh(); unlockTower(expired); expired.day = 2; expired.hour = 10; expired.relations.nelson = 45;
    expect(doSocial(expired, 'nelson').ok).toBe(true);
    advanceHours(expired, 1);
    expect(expired.npcVisitSession).toBeNull();
  });

  it('拜访横跨作息结束时刻仍可在本次会面请求代占', () => {
    const state = fresh(); unlockTower(state); state.day = 2; state.hour = 19;
    state.relations.nelson = 45; state.pence = 100; state.stats.energy = 100;
    expect(doSocial(state, 'nelson').ok).toBe(true);
    expect(state.hour).toBe(20);
    expect(divinationIssue(state, 'location', 'old_tower', 'cards', 'nelson')).toBeNull();
  });

  it('NPC代占不消耗玩家精神值，自行占卜仍按方式消耗', () => {
    const npc = fresh(); unlockTower(npc); npc.day = 2; npc.hour = 10; npc.relations.nelson = 45;
    npc.pence = 100; npc.stats.energy = 100; npc.combatVitals.spirit = 0;
    expect(doSocial(npc, 'nelson').ok).toBe(true);
    expect(performDivination(npc, 'location', 'old_tower', 'cards', 'nelson').ok).toBe(true);
    expect(npc.combatVitals.spirit).toBe(0);

    const cards = formalSeer(); cards.items.anomaly_evidence = 1; cards.combatVitals.spirit = 6;
    expect(performDivination(cards, 'item', 'anomaly_evidence', 'cards', 'self').ok).toBe(true);
    expect(cards.combatVitals.spirit).toBe(0);
    const dream = formalSeer(); dream.items.anomaly_evidence = 1; dream.combatVitals.spirit = 12;
    expect(performDivination(dream, 'item', 'anomaly_evidence', 'dream', 'self').ok).toBe(true);
    expect(dream.combatVitals.spirit).toBe(0);
  });
});

describe('v25战斗数值与资源', () => {
  it('基础公式、左轮与无关神秘工具精确派生', () => {
    const state = fresh();
    state.stats.phy = 20; state.stats.spi = 10; state.stats.mnd = 20;
    state.skills = { investigate: 0, combat: 2, speech: 0, occult: 3, sneak: 1 };
    state.items = {};
    state.combatVitals = { hp: 80, spirit: 50 };
    expect(getCombatProfile(state)).toEqual({
      maxHp: 80, maxSpirit: 50, physicalAttack: 24, spiritualAttack: 23,
      physicalDefense: 13, spiritualDefense: 16, critical: 13, dodge: 13, injuryPenalty: 0,
    });
    state.items.revolver = 1;
    state.items.revolver_ammo = 6;
    state.combatLoadout.weaponId = 'revolver';
    expect(getCombatProfile(state)).toMatchObject({ physicalAttack: 42, critical: 17 });
    state.items.symbol_cards = 1; state.items.plain_pendulum = 1; state.items.ritual_chalk = 1;
    expect(getCombatProfile(state)).toMatchObject({ physicalAttack: 42, critical: 17 });
  });

  it('五途径只给合法序列9继承者对应加成，不眠者夜间闪避单独生效', () => {
    const base = fresh(); base.stats.phy = 20; base.stats.spi = 10; base.stats.mnd = 20;
    base.skills = { investigate: 0, combat: 0, speech: 0, occult: 0, sneak: 0 };
    base.items = {}; base.combatVitals = { hp: 80, spirit: 50 }; base.hour = 12;
    const plain = getCombatProfile(base);
    const expected: Record<string, Partial<ReturnType<typeof getCombatProfile>>> = {
      seer: { spiritualAttack: plain.spiritualAttack + 4, spiritualDefense: plain.spiritualDefense + 4, critical: plain.critical + 6, dodge: plain.dodge + 6 },
      spectator: { spiritualAttack: plain.spiritualAttack + 10, spiritualDefense: plain.spiritualDefense + 8, dodge: plain.dodge + 2 },
      hunter: { physicalAttack: plain.physicalAttack + 10, physicalDefense: plain.physicalDefense + 5, critical: plain.critical + 10 },
      sleepless: { physicalDefense: plain.physicalDefense + 4, spiritualDefense: plain.spiritualDefense + 6, dodge: plain.dodge },
      apprentice: { spiritualAttack: plain.spiritualAttack + 4, spiritualDefense: plain.spiritualDefense + 4, dodge: plain.dodge + 10, critical: plain.critical + 4 },
    };
    for (const [pathwayId, shape] of Object.entries(expected)) {
      const state = structuredClone(base); state.pathwayId = pathwayId; state.sequence = 9;
      expect(getCombatProfile(state)).toMatchObject(shape);
    }
    const night = structuredClone(base); night.pathwayId = 'sleepless'; night.sequence = 9; night.hour = 22;
    expect(getCombatProfile(night).dodge).toBe(plain.dodge + 6);
    night.sequence = null;
    expect(getCombatProfile(night).dodge).toBe(plain.dodge);
  });

  it('伤势施加-4/-8且确定性伤害使用防御与闪避档位', () => {
    const state = fresh(); state.stats.phy = 20; state.stats.spi = 10; state.stats.mnd = 20;
    state.skills = { investigate: 0, combat: 2, speech: 0, occult: 3, sneak: 1 };
    state.items = {}; state.combatVitals = { hp: 80, spirit: 50 };
    const healthy = getCombatProfile(state);
    state.combatVitals.hp = 40;
    expect(getCombatProfile(state)).toMatchObject({ physicalAttack: healthy.physicalAttack - 4, physicalDefense: healthy.physicalDefense - 4, dodge: healthy.dodge - 4, injuryPenalty: 4 });
    state.combatVitals.hp = 20;
    expect(getCombatProfile(state)).toMatchObject({ physicalAttack: healthy.physicalAttack - 8, physicalDefense: healthy.physicalDefense - 8, dodge: healthy.dodge - 8, injuryPenalty: 8 });

    const first = structuredClone(state); first.combatVitals = { hp: 80, spirit: 50 };
    const second = structuredClone(first);
    expect(applyCombatImpact(first, 30, 20, 20)).toEqual(applyCombatImpact(second, 30, 20, 20));
    expect(first.combatVitals).toEqual(second.combatVitals);
    expect(first.combatVitals.hp).toBeLessThan(80);
    expect(first.combatVitals.spirit).toBeLessThan(50);
  });

  it('小憩、正常睡眠和不眠者冥想按规则恢复，灵视精神不足时零状态', () => {
    const nap = fresh(); nap.combatVitals = { hp: 40, spirit: 0 };
    expect(doNap(nap).ok).toBe(true);
    expect(nap.combatVitals).toEqual({ hp: 40, spirit: Math.floor(getCombatProfile(nap).maxSpirit * 0.25) });

    const sleep = fresh(); const sleepProfile = getCombatProfile(sleep); sleep.combatVitals = { hp: 40, spirit: 0 };
    expect(doSleep(sleep).ok).toBe(true);
    expect(sleep.combatVitals).toEqual({ hp: 40 + Math.floor(sleepProfile.maxHp * 0.1), spirit: sleepProfile.maxSpirit });

    const sleepless = fresh(); sleepless.pathwayId = 'sleepless'; sleepless.sequence = 9; sleepless.combatVitals = { hp: 40, spirit: 0 };
    expect(doSleep(sleepless).ok).toBe(true);
    expect(sleepless.combatVitals.hp).toBe(40);
    expect(sleepless.combatVitals.spirit).toBe(Math.floor(getCombatProfile(sleepless).maxSpirit * 0.5));

    const vision = formalSeer(); vision.items.anomaly_evidence = 1; vision.combatVitals.spirit = 5;
    const before = structuredClone(vision);
    expect(inspectItemWithSpiritVision(vision, 'anomaly_evidence')).toMatchObject({ ok: false });
    expect(vision).toEqual(before);
    vision.combatVitals.spirit = 6;
    expect(inspectItemWithSpiritVision(vision, 'anomaly_evidence').ok).toBe(true);
    expect(vision.combatVitals.spirit).toBe(0);
  });

  it('宿敌决战使用派生物攻并在归零时确定性重伤救援', () => {
    const state = fresh(); state.stats.energy = 100; state.pence = 100;
    state.combatVitals.hp = getCombatProfile(state).maxHp - 1;
    state.nemesis = { name: '测试宿敌', archetype: '黑帮清道夫', motive: '复仇', power: 200, hostility: 80, known: true, alive: true };
    expect(nemesisFight(state).ok).toBe(true);
    expect(state.combatVitals.hp).toBe(1);
    expect(state.gameOver).toBeNull();
    expect(state.pence).toBe(64);
  });

  it('v24及更旧迁移满值，v25只夹取合法整数并清理过时会面', () => {
    const legacy = fresh(); legacy.schemaVersion = 24;
    legacy.combatVitals = { hp: 1, spirit: 1 }; legacy.npcVisitSession = { npcId: 'nelson', startedDay: 1, startedHour: 6, day: legacy.day, hour: legacy.hour };
    saveGame(legacy);
    const migrated = loadGame()!; const migratedProfile = getCombatProfile(migrated);
    expect(migrated.schemaVersion).toBe(32);
    expect(migrated.combatVitals).toEqual({ hp: migratedProfile.maxHp, spirit: migratedProfile.maxSpirit });
    expect(migrated.npcVisitSession).toBeNull();

    const current = fresh(); current.combatVitals = { hp: 999, spirit: -3 }; current.relations.nelson = 45;
    current.npcVisitSession = { npcId: 'nelson', startedDay: 1, startedHour: 6, day: 1, hour: 7 };
    saveGame(current);
    const cleaned = loadGame()!; const cleanedProfile = getCombatProfile(cleaned);
    expect(cleaned.combatVitals).toEqual({ hp: cleanedProfile.maxHp, spirit: 0 });
    expect(cleaned.npcVisitSession).toBeNull();

    const stale = fresh(); stale.relations.nelson = 45;
    stale.npcVisitSession = { npcId: 'nelson', startedDay: 1, startedHour: 10, day: 1, hour: 11 };
    saveGame(stale);
    expect(loadGame()!.npcVisitSession).toBeNull();
  });
});

describe('界面入口边界', () => {
  it('物品与地点只保留自行占卜，NPC卡片承载请求；遭遇不展示敌人数值', () => {
    expect(appSource).toContain('data-npc-divination-requests');
    expect(appSource).toContain('data-player-combat-vitals');
    expect(appSource).toContain('data-combat-profile');
    expect(appSource).toContain('ok || activeMeeting');
    expect(appSource).toContain('精神值 {state.combatVitals.spirit}/{combatProfile.maxSpirit}');
    expect(appSource).not.toMatch(/请尼尔逊代占|伊芙琳代占|伊芙琳核验/);
    expect(appSource).not.toMatch(/敌人生命|敌人精神|敌人物攻|敌人防御/);
    expect(appSource).not.toContain('精神力');
    expect(engineSource).not.toContain('精神力');
  });
});
