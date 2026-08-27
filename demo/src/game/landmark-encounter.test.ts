import { beforeEach, describe, expect, it, vi } from 'vitest';
import appSource from '../App.tsx?raw';
import { NPCS, TINGEN_LANDMARK_ACTIONS, TINGEN_LANDMARK_ENCOUNTERS, npcAvailable, npcLocation, npcScheduleOwnerDay } from './data';
import type { GameState } from './types';
import {
  acquireClue,
  allNPCs,
  loadGame,
  newGame,
  performAtLocationAction,
  performTingenLandmarkAction,
  saveGame,
  travelToLocation,
  tryTingenLandmarkEncounter,
} from './engine';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
}

const fresh = () => newGame('地标邂逅测试者', 'clerk', []);

function arriveAt(state: GameState, locationId: 'hoy_university' | 'dragon_bar', hour: number) {
  acquireClue(state, 'tingen_honest_paper', 'public_records', 'test:public-paper');
  state.stats.energy = 100;
  state.hour = hour;
  expect(travelToLocation(state, locationId, 'walk')).toMatchObject({ ok: true });
  expect(state.currentLocation?.locationId).toBe(locationId);
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('廷根高级人物的数据边界', () => {
  it('配置覆盖多个地标，公开身份与真实背景分离，普通引见来源可核验', () => {
    expect(TINGEN_LANDMARK_ENCOUNTERS.map(def => def.locationId).sort()).toEqual([
      'blackthorn_security', 'divination_club', 'dragon_bar', 'hoy_university',
    ]);
    expect(TINGEN_LANDMARK_ENCOUNTERS.every(def => !!def.npc.identity && !!def.npc.secret && def.chance > 0 && def.chance < 1)).toBe(true);
    expect(TINGEN_LANDMARK_ENCOUNTERS.every(def => def.minLocationRelation >= 8)).toBe(true);
    expect(TINGEN_LANDMARK_ENCOUNTERS.find(def => def.id === 'club_hanass')?.npc.secret).toBe('极光会成员');
    expect(TINGEN_LANDMARK_ENCOUNTERS.find(def => def.id === 'dragon_swain')?.npc.secret).toBe('前廷根代罚者队长，暴怒之民序列8');
    expect(TINGEN_LANDMARK_ENCOUNTERS.find(def => def.id === 'club_hanass')?.npc.secret).not.toMatch(/密修会|序列/);
    expect(TINGEN_LANDMARK_ENCOUNTERS.find(def => def.id === 'dragon_swain')?.npc.secret).not.toMatch(/序列7|航海家/);
    for (const encounter of TINGEN_LANDMARK_ENCOUNTERS) {
      const introducingAction = TINGEN_LANDMARK_ACTIONS.find(action => action.introductions?.some(grant => grant.encounterId === encounter.id));
      expect(introducingAction).toBeDefined();
      expect(introducingAction?.introductions?.find(grant => grant.encounterId === encounter.id)?.introducerName).toBeTruthy();
      expect(`${encounter.meetText}\n${encounter.missText}\n${encounter.npc.desc}`).not.toMatch(/非凡者|序列\d|途径|值夜者|代罚者|密修会|死神/);
    }
  });

  it('首遇前高级人物不进入玩家 NPC 池，App 也不渲染 secret 字段', () => {
    const state = fresh();
    const hiddenIds = TINGEN_LANDMARK_ENCOUNTERS.map(def => def.npc.id);
    expect(allNPCs(state).map(npc => npc.id)).not.toEqual(expect.arrayContaining(hiddenIds));
    expect(appSource).not.toMatch(/\.secret\b/);
    expect(appSource).toContain('E.locationRelationshipLabel(state, loc.id)');
  });
});

describe('引见、地点关系、概率与冷却', () => {
  it('没有引见且地点关系不足时概率严格为零，错误行动也不能抽取', () => {
    const state = fresh();
    arriveAt(state, 'hoy_university', 8);
    let calls = 0;
    const before = structuredClone(state);
    expect(tryTingenLandmarkEncounter(state, 'hoy_university', 'explore', () => { calls += 1; return 0; })).toEqual({ status: 'ineligible' });
    expect(calls).toBe(0);
    expect(state).toEqual(before);

    state.locationRelations.hoy_university = 100;
    expect(tryTingenLandmarkEncounter(state, 'hoy_university', 'shop', () => { calls += 1; return 0; })).toEqual({ status: 'ineligible' });
    expect(calls).toBe(0);
  });

  it('公开行动留下普通人物引见；失败有反馈，同日冷却，多次正式尝试后保底会面', () => {
    const state = fresh();
    state.day = 2;
    arriveAt(state, 'hoy_university', 8);
    const logStart = state.log.length;
    let randomCalls = 0;
    const highRoll = () => { randomCalls += 1; return 0.99; };

    expect(performTingenLandmarkAction(state, 'hoy_public_history_lecture', highRoll)).toMatchObject({ ok: true });
    expect(state.landmarkIntroductions).toContainEqual(expect.objectContaining({
      encounterId: 'hoy_azik', sourceActionId: 'hoy_public_history_lecture', introducerId: 'quentin_cohen',
    }));
    expect(state.landmarkEncounters).toContainEqual(expect.objectContaining({ encounterId: 'hoy_azik', attempts: 1, met: false }));
    expect(randomCalls).toBe(1);
    expect(allNPCs(state).some(npc => npc.id === 'azik')).toBe(false);
    expect(state.log.slice(logStart).map(entry => entry.text).join('\n')).toMatch(/昆汀·科恩教授.*引见|教员今天正忙/);

    const attempts = state.landmarkEncounters[0].attempts;
    expect(tryTingenLandmarkEncounter(state, 'hoy_university', 'explore', () => 0)).toMatchObject({ status: 'cooldown' });
    expect(state.landmarkEncounters[0].attempts).toBe(attempts);

    state.day += 1;
    state.hour = 10;
    expect(tryTingenLandmarkEncounter(state, 'hoy_university', 'explore', highRoll)).toMatchObject({ status: 'missed' });
    expect(randomCalls).toBe(2);
    state.day += 1;
    state.hour = 10;
    expect(tryTingenLandmarkEncounter(state, 'hoy_university', 'explore', highRoll)).toMatchObject({ status: 'met' });
    expect(randomCalls).toBe(2);
    const azik = allNPCs(state).find(npc => npc.id === 'azik');
    expect(azik).toMatchObject({ name: '阿兹克·艾格斯', identity: '霍伊大学历史教员' });
    const playerText = state.log.slice(logStart).map(entry => entry.text).join('\n');
    expect(playerText).toMatch(/正式结识.*阿兹克·艾格斯.*历史教员/);
    expect(playerText).not.toMatch(/非凡者|序列\d|死神途径|高序列/);

    const metAttempts = state.landmarkEncounters[0].attempts;
    expect(tryTingenLandmarkEncounter(state, 'hoy_university', 'explore', () => 0)).toMatchObject({ status: 'already_met' });
    expect(state.landmarkEncounters[0].attempts).toBe(metAttempts);
  });

  it('休息日和错误时段只给普通反馈，不累计尝试、冷却或调用 RNG', () => {
    const state = fresh();
    arriveAt(state, 'hoy_university', 8);
    let randomCalls = 0;
    const source = () => { randomCalls += 1; return 0; };

    expect(performTingenLandmarkAction(state, 'hoy_public_history_lecture', source)).toMatchObject({ ok: true });
    expect(state.landmarkIntroductions).toContainEqual(expect.objectContaining({ encounterId: 'hoy_azik' }));
    expect(state.landmarkEncounters).toEqual([]);
    expect(randomCalls).toBe(0);

    state.day = 2;
    state.hour = 18;
    expect(tryTingenLandmarkEncounter(state, 'hoy_university', 'explore', source)).toMatchObject({ status: 'unavailable' });
    expect(state.landmarkEncounters).toEqual([]);
    expect(randomCalls).toBe(0);

    state.hour = 10;
    expect(tryTingenLandmarkEncounter(state, 'hoy_university', 'explore', () => 0.99)).toMatchObject({ status: 'missed' });
    expect(state.landmarkEncounters).toContainEqual(expect.objectContaining({ attempts: 1, lastAttemptDay: 2, met: false }));
  });

  it('不走引见时，重复合适行动积累地点关系，达到门槛后才开始抽取', () => {
    const state = fresh();
    arriveAt(state, 'dragon_bar', 8);
    expect(state.landmarkIntroductions).toEqual([]);

    for (let attempt = 1; attempt <= 8; attempt += 1) {
      state.stats.energy = 100;
      expect(performAtLocationAction(state, 'explore', () => 0)).toMatchObject({ ok: true });
      expect(state.locationRelations.dragon_bar).toBe(attempt);
      if (attempt < 8) expect(allNPCs(state).some(npc => npc.id === 'swain')).toBe(false);
    }

    expect(state.landmarkIntroductions).toEqual([]);
    expect(allNPCs(state).find(npc => npc.id === 'swain')).toMatchObject({ identity: '恶龙酒吧老板' });
    expect(state.landmarkEncounters).toContainEqual(expect.objectContaining({ encounterId: 'dragon_swain', attempts: 1, met: true }));
    expect(state.log.map(entry => entry.text).join('\n')).not.toMatch(/前代罚者|序列7|航海家/);
  });

  it('跨午夜作息按前一晚归属，凌晨一点仍可遇到斯维因且核心NPC不回归', () => {
    const swain = TINGEN_LANDMARK_ENCOUNTERS.find(def => def.id === 'dragon_swain')!.npc;
    expect(npcAvailable(swain, 2, 1)).toBe(true);
    expect(npcLocation(swain, 2, 1)).toBe('恶龙酒吧');
    expect(npcScheduleOwnerDay(swain, 1, 23)).toBe(1);
    expect(npcScheduleOwnerDay(swain, 2, 1)).toBe(1);
    expect(npcScheduleOwnerDay(swain, 2, 17)).toBe(2);

    const victor = NPCS.find(npc => npc.id === 'victor')!;
    expect(npcAvailable(victor, 5, 1)).toBe(true);
    expect(npcLocation(victor, 5, 1)).toBe('黑市后巷');
    expect(npcAvailable(victor, 4, 1)).toBe(false);

    const state = fresh();
    acquireClue(state, 'tingen_honest_paper', 'public_records', 'test:public-paper');
    state.day = 1;
    state.hour = 23;
    state.stats.energy = 100;
    state.locationRelations.dragon_bar = 7;
    expect(travelToLocation(state, 'dragon_bar', 'walk')).toMatchObject({ ok: true });
    expect(state).toMatchObject({ day: 2, hour: 0 });
    state.stats.energy = 100;
    expect(performAtLocationAction(state, 'explore', () => 0)).toMatchObject({ ok: true });
    expect(state).toMatchObject({ day: 2, hour: 1 });
    expect(state.landmarkEncounters).toContainEqual(expect.objectContaining({
      encounterId: 'dragon_swain', attempts: 1, lastAttemptDay: 1, met: true, metDay: 2, metHour: 0,
    }));
    expect(state.log).toContainEqual(expect.objectContaining({ day: 2, hour: 0, text: expect.stringContaining('正式结识') }));
  });

  it('斯维因冷却按营业夜归属：同一跨午夜班次不可二抽，下一营业夜可抽', () => {
    const sameNight = fresh();
    arriveAt(sameNight, 'dragon_bar', 8);
    sameNight.locationRelations.dragon_bar = 8;
    let sameNightCalls = 0;
    const missSameNight = () => { sameNightCalls += 1; return 0.99; };
    sameNight.day = 1;
    sameNight.hour = 23;
    expect(tryTingenLandmarkEncounter(sameNight, 'dragon_bar', 'explore', missSameNight)).toMatchObject({ status: 'missed' });
    expect(sameNight.landmarkEncounters).toContainEqual(expect.objectContaining({ attempts: 1, lastAttemptDay: 1 }));
    sameNight.day = 2;
    sameNight.hour = 1;
    expect(tryTingenLandmarkEncounter(sameNight, 'dragon_bar', 'explore', missSameNight)).toMatchObject({ status: 'cooldown' });
    expect(sameNightCalls).toBe(1);
    expect(sameNight.landmarkEncounters).toContainEqual(expect.objectContaining({ attempts: 1, lastAttemptDay: 1 }));

    const nextNight = fresh();
    arriveAt(nextNight, 'dragon_bar', 8);
    nextNight.locationRelations.dragon_bar = 8;
    let nextNightCalls = 0;
    const missNextNight = () => { nextNightCalls += 1; return 0.99; };
    nextNight.day = 2;
    nextNight.hour = 1;
    expect(tryTingenLandmarkEncounter(nextNight, 'dragon_bar', 'explore', missNextNight)).toMatchObject({ status: 'missed' });
    expect(nextNight.landmarkEncounters).toContainEqual(expect.objectContaining({ attempts: 1, lastAttemptDay: 1 }));
    nextNight.hour = 17;
    expect(tryTingenLandmarkEncounter(nextNight, 'dragon_bar', 'explore', missNextNight)).toMatchObject({ status: 'missed' });
    expect(nextNightCalls).toBe(2);
    expect(nextNight.landmarkEncounters).toContainEqual(expect.objectContaining({ attempts: 2, lastAttemptDay: 2 }));
  });

  it('普通探索与公开行动都以行动开始时刻判定，失败行动不预先抽取', () => {
    const exploreAtSixteen = fresh();
    exploreAtSixteen.day = 2;
    arriveAt(exploreAtSixteen, 'hoy_university', 15);
    exploreAtSixteen.locationRelations.hoy_university = 9;
    expect(exploreAtSixteen.hour).toBe(16);
    expect(performAtLocationAction(exploreAtSixteen, 'explore', () => 0)).toMatchObject({ ok: true });
    expect(exploreAtSixteen.hour).toBe(17);
    expect(exploreAtSixteen.landmarkEncounters).toContainEqual(expect.objectContaining({
      encounterId: 'hoy_azik', met: true, metDay: 2, metHour: 16,
    }));

    const exploreAtSeventeen = fresh();
    exploreAtSeventeen.day = 2;
    arriveAt(exploreAtSeventeen, 'hoy_university', 16);
    exploreAtSeventeen.locationRelations.hoy_university = 9;
    let exploreLateCalls = 0;
    expect(performAtLocationAction(exploreAtSeventeen, 'explore', () => { exploreLateCalls += 1; return 0; })).toMatchObject({ ok: true });
    expect(exploreAtSeventeen.landmarkEncounters).toEqual([]);
    expect(exploreLateCalls).toBe(0);
    expect(exploreAtSeventeen.log).toContainEqual(expect.objectContaining({ day: 2, hour: 17 }));

    const publicAtSixteen = fresh();
    publicAtSixteen.day = 2;
    arriveAt(publicAtSixteen, 'hoy_university', 15);
    expect(performTingenLandmarkAction(publicAtSixteen, 'hoy_public_history_lecture', () => 0)).toMatchObject({ ok: true });
    expect(publicAtSixteen.hour).toBe(17);
    expect(publicAtSixteen.landmarkEncounters).toContainEqual(expect.objectContaining({
      encounterId: 'hoy_azik', met: true, metDay: 2, metHour: 16,
    }));

    const publicAtSeventeen = fresh();
    publicAtSeventeen.day = 2;
    arriveAt(publicAtSeventeen, 'hoy_university', 16);
    const before = structuredClone(publicAtSeventeen);
    let failedCalls = 0;
    expect(performTingenLandmarkAction(publicAtSeventeen, 'hoy_public_history_lecture', () => { failedCalls += 1; return 0; })).toMatchObject({ ok: false });
    expect(publicAtSeventeen).toEqual(before);
    expect(failedCalls).toBe(0);
  });
});

describe('v18 存档迁移与清洗', () => {
  it('v17 旧档初始化空字段，不接受提前注入的会面记录', () => {
    const old = fresh();
    old.schemaVersion = 17;
    old.locationRelations = { hoy_university: 100 };
    old.landmarkIntroductions = [{ encounterId: 'hoy_azik', sourceActionId: 'hoy_public_history_lecture', introducerId: 'quentin_cohen', acquiredDay: 1, acquiredHour: 10 }];
    old.landmarkEncounters = [{ encounterId: 'hoy_azik', attempts: 1, lastAttemptDay: 1, met: true, metDay: 1, metHour: 10 }];
    old.relations.azik = 99;
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(old));

    const loaded = loadGame()!;
    expect(loaded).toMatchObject({ schemaVersion: 21, locationRelations: {}, landmarkIntroductions: [], landmarkEncounters: [] });
    expect(loaded.relations.azik).toBeUndefined();
    expect(allNPCs(loaded).some(npc => npc.id === 'azik')).toBe(false);
  });

  it('合法公开引见与首遇可保存重载，伪造来源则会被清除', () => {
    const valid = fresh();
    valid.day = 2;
    arriveAt(valid, 'hoy_university', 8);
    expect(performTingenLandmarkAction(valid, 'hoy_public_history_lecture', () => 0)).toMatchObject({ ok: true });
    expect(valid.landmarkEncounters).toContainEqual(expect.objectContaining({ encounterId: 'hoy_azik', met: true }));
    saveGame(valid);
    const restored = loadGame()!;
    expect(restored.landmarkIntroductions).toEqual(valid.landmarkIntroductions);
    expect(restored.landmarkEncounters).toEqual(valid.landmarkEncounters);
    expect(allNPCs(restored).some(npc => npc.id === 'azik')).toBe(true);
    saveGame(restored);
    expect(loadGame()?.landmarkEncounters).toEqual(restored.landmarkEncounters);

    const forged = fresh();
    forged.landmarkIntroductions = [{ encounterId: 'hoy_azik', sourceActionId: 'forged_action', introducerId: 'forged_person', acquiredDay: 1, acquiredHour: 10 }];
    forged.landmarkEncounters = [{ encounterId: 'hoy_azik', attempts: 1, lastAttemptDay: 1, met: true, metDay: 1, metHour: 10 }];
    forged.relations.azik = 99;
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(forged));
    const cleaned = loadGame()!;
    expect(cleaned.landmarkIntroductions).toEqual([]);
    expect(cleaned.landmarkEncounters).toEqual([]);
    expect(cleaned.relations.azik).toBeUndefined();
  });
});
