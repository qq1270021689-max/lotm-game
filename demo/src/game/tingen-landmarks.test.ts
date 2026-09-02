import { beforeEach, describe, expect, it, vi } from 'vitest';
import appSource from '../App.tsx?raw';
import dataSource from './data.ts?raw';
import engineSource from './engine.ts?raw';
import { LOCATIONS, TINGEN_LANDMARK_ACTIONS } from './data';
import type { Commission, GameState } from './types';
import {
  acquireClue,
  compareDockCargoRecordsIssue,
  evaluateExplorationCheck,
  getBookSourceOffers,
  getTingenLandmarkActions,
  getVisibleLocations,
  hasClue,
  hasVerifiedBlackthornReferral,
  inspectDockMissingReports,
  inspectDockMissingReportsIssue,
  isLocationUnlocked,
  landmarkActionIssue,
  leaveCurrentLocation,
  loadGame,
  locationAccessIssue,
  newGame,
  performTingenLandmarkAction,
  redactLockedLocationText,
  saveGame,
  traceDockMarkedManifestIssue,
  travelToLocation,
} from './engine';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
}

const LANDMARK_IDS = [
  'st_selena_church', 'st_number_church', 'river_sea_church', 'divination_club', 'blackthorn_security',
  'hoy_university', 'dewill_library', 'municipal_library', 'hound_tavern', 'dragon_bar',
] as const;
const ids = (state: GameState) => getVisibleLocations(state).map(location => location.id);
const fresh = () => newGame('廷根地标测试者', 'clerk', []);
const forgedBlackthornCommission = (): Commission => ({
  id: 'forged_blackthorn', kind: 'investigate', stat: 'mnd', difficulty: 20,
  title: '未经转介的安保差事', text: '没有可信来源', client: 'martha',
  locationId: 'blackthorn_security', reward: 24, daysLeft: 3, occult: false,
});

function performAt(state: GameState, locationId: string, actionId: string) {
  state.stats.energy = 100;
  expect(travelToLocation(state, locationId, 'walk')).toMatchObject({ ok: true });
  expect(performTingenLandmarkAction(state, actionId)).toMatchObject({ ok: true });
  expect(leaveCurrentLocation(state)).toMatchObject({ ok: true });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('廷根地标目录解锁', () => {
  it('普通新档只开放基础公共去处，不会一次泄露全部地标', () => {
    const state = fresh();
    expect(ids(state)).toEqual(['market', 'north_clinic', 'tavern']);
    expect(ids(state)).not.toEqual(expect.arrayContaining([...LANDMARK_IDS]));
    expect(getVisibleLocations(state)).toHaveLength(3);
  });

  it('城市目录、公共报刊和教会公告严格逐层解锁对应地点', () => {
    const state = fresh();
    performAt(state, 'market', 'market_city_directory');
    expect(ids(state)).toEqual(expect.arrayContaining(['st_selena_church', 'dewill_library', 'municipal_library']));
    expect(isLocationUnlocked(state, 'hoy_university')).toBe(false);
    expect(isLocationUnlocked(state, 'river_sea_church')).toBe(false);

    performAt(state, 'dewill_library', 'dewill_public_periodicals');
    expect(ids(state)).toEqual(expect.arrayContaining(['hoy_university', 'divination_club', 'hound_tavern', 'dragon_bar']));
    expect(isLocationUnlocked(state, 'blackthorn_security')).toBe(false);
    expect(isLocationUnlocked(state, 'black_market')).toBe(false);

    performAt(state, 'st_selena_church', 'st_selena_public_notices');
    expect(ids(state)).toEqual(expect.arrayContaining(['st_number_church', 'river_sea_church']));
  });

  it('恶龙酒吧公开地址不会开放黑市，黑荆棘只认转介或正式夜线记录', () => {
    const publicReader = fresh();
    acquireClue(publicReader, 'tingen_city_directory');
    acquireClue(publicReader, 'tingen_honest_paper');
    expect(isLocationUnlocked(publicReader, 'dragon_bar')).toBe(true);
    expect(isLocationUnlocked(publicReader, 'black_market')).toBe(false);
    expect(isLocationUnlocked(publicReader, 'blackthorn_security')).toBe(false);

    publicReader.organizationRoutes.nightwatch.history.push({ day: 1, step: 'clocktower_witness', outcome: 'started' });
    expect(isLocationUnlocked(publicReader, 'blackthorn_security')).toBe(false);
    publicReader.organizationRoutes.nightwatch.history.push({ day: 1, step: 'report_to_evelyn', outcome: 'passed' });
    expect(isLocationUnlocked(publicReader, 'blackthorn_security')).toBe(true);

    const formallyContacted = fresh();
    formallyContacted.organizationRoutes.nightwatch.status = 'contacted';
    expect(isLocationUnlocked(formallyContacted, 'blackthorn_security')).toBe(true);
  });

  it('黑荆棘拒绝单独伪造的线索、到访记录和委托目标', () => {
    const clueOnly = fresh();
    acquireClue(clueOnly, 'blackthorn_referral');
    expect(isLocationUnlocked(clueOnly, 'blackthorn_security')).toBe(false);

    const visitedOnly = fresh();
    visitedOnly.visitedLocations.push('blackthorn_security');
    expect(isLocationUnlocked(visitedOnly, 'blackthorn_security')).toBe(false);

    const commissionOnly = fresh();
    commissionOnly.activeCommission = forgedBlackthornCommission();
    expect(isLocationUnlocked(commissionOnly, 'blackthorn_security')).toBe(false);

    const wrongSource = fresh();
    wrongSource.clues.push({
      id: 'blackthorn_referral', caseId: 'blackthorn_contact', sourceKind: 'event', sourceId: 'forged',
      acquiredDay: 1, acquiredHour: 7,
    });
    wrongSource.organizationRoutes.nightwatch.history.push({
      day: 1, step: 'hound_security_referral', outcome: 'passed', evidenceId: 'blackthorn_referral',
    });
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(wrongSource));
    const cleaned = loadGame()!;
    expect(hasClue(cleaned, 'blackthorn_referral')).toBe(false);
    expect(isLocationUnlocked(cleaned, 'blackthorn_security')).toBe(false);
  });

  it('公开地点描述不含普通人不应知道的组织与隐藏入口', () => {
    const descriptions = LOCATIONS.filter(location => LANDMARK_IDS.includes(location.id as typeof LANDMARK_IDS[number]))
      .map(location => `${location.name} ${location.desc}`).join('\n');
    expect(descriptions).not.toMatch(/值夜者|代罚者|机械之心|地下市场|查尼斯门|途径|封印物|地下通道/);
    expect(LOCATIONS.find(location => location.id === 'blackthorn_security')?.desc).toMatch(/安保公司/);
    expect(LOCATIONS.find(location => location.id === 'dragon_bar')?.desc).toMatch(/公开区域/);
  });
});

describe('廷根地标固定行动', () => {
  it('十个新地点各有公开行动，奖励严格限制在世俗白名单', () => {
    for (const locationId of LANDMARK_IDS) {
      expect(TINGEN_LANDMARK_ACTIONS.some(action => action.locationId === locationId)).toBe(true);
    }
    for (const action of TINGEN_LANDMARK_ACTIONS) {
      expect(action.effects.every(effect => ['clue', 'intel', 'knowledge', 'flag'].includes(effect.k))).toBe(true);
      expect(action.effects.map(effect => effect.k)).not.toEqual(expect.arrayContaining(['money', 'formula', 'item', 'skill']));
      expect(action.effects.map(effect => effect.id)).not.toEqual(expect.arrayContaining(['spirit_vision', 'ritual_basic', 'potion_brew']));
    }
  });

  it('行动必须身处对应地点，重复完成保持零状态且原因清楚', () => {
    const state = fresh();
    state.stats.energy = 100;
    expect(travelToLocation(state, 'market', 'walk').ok).toBe(true);
    const wrongPlace = structuredClone(state);
    expect(performTingenLandmarkAction(state, 'dewill_public_periodicals')).toMatchObject({ ok: false });
    expect(state).toEqual(wrongPlace);

    expect(performTingenLandmarkAction(state, 'market_city_directory')).toMatchObject({ ok: true });
    const completed = structuredClone(state);
    expect(landmarkActionIssue(state, 'market_city_directory')).toMatch(/已经记入笔记/);
    expect(performTingenLandmarkAction(state, 'market_city_directory')).toMatchObject({ ok: false });
    expect(state).toEqual(completed);

    const closed = fresh();
    acquireClue(closed, 'tingen_city_directory');
    closed.hour = 5;
    closed.stats.energy = 100;
    expect(travelToLocation(closed, 'dewill_library', 'walk')).toMatchObject({ ok: true });
    expect(landmarkActionIssue(closed, 'dewill_public_periodicals')).toMatch(/9:00–18:00/);
  });

  it('占卜俱乐部只授予普通礼仪常识，不会授予灵视或正式占卜资格', () => {
    const state = fresh();
    acquireClue(state, 'tingen_city_directory');
    acquireClue(state, 'tingen_honest_paper');
    state.hour = 10;
    const training = structuredClone(state.divinationTraining);
    performAt(state, 'divination_club', 'divination_club_etiquette');
    expect(state.knowledge).toContain('public_divination_etiquette');
    expect(state.knowledge).not.toContain('spirit_vision');
    expect(state.divinationTraining).toEqual(training);
    expect(state.divinationCredentials).toEqual([]);
    expect(state.formulas).toEqual([]);
  });

  it('河与海教堂告示只发现码头，抵达后仍须亲自核对正式失踪登记', () => {
    const state = fresh();
    acquireClue(state, 'tingen_city_directory');
    acquireClue(state, 'tingen_church_directory');
    state.hour = 9;
    performAt(state, 'river_sea_church', 'river_sea_shipping_notices');
    expect(isLocationUnlocked(state, 'docks')).toBe(true);
    expect(state.intel).not.toContain('dock_missing');
    expect(hasClue(state, 'river_sea_missing_notices')).toBe(true);
    expect(hasClue(state, 'dock_missing_reports')).toBe(false);
    expect(evaluateExplorationCheck(state, 'dock_manifest_trace')).toMatchObject({ reason: 'missing_required_clue' });
    expect(state.formulas).toEqual([]);
    expect(Object.values(state.organizationRoutes).every(route => route.status === 'unknown')).toBe(true);

    state.stats.energy = 100;
    expect(travelToLocation(state, 'docks', 'walk')).toMatchObject({ ok: true });
    expect(inspectDockMissingReportsIssue(state)).toBeNull();
    expect(compareDockCargoRecordsIssue(state)).toMatch(/公开失踪登记/);
    expect(traceDockMarkedManifestIssue(state)).toMatch(/公开失踪登记/);
    expect(inspectDockMissingReports(state)).toMatchObject({ ok: true });
    expect(hasClue(state, 'dock_missing_reports')).toBe(true);
    expect(appSource).toContain("E.hasClue(state, 'dock_missing_reports') ? '失踪登记已核对' : '核对失踪登记'");
  });

  it('圣数教堂只提供机械事故与修理公告，并以世俗线索开放工厂方向', () => {
    const state = fresh();
    acquireClue(state, 'tingen_city_directory');
    acquireClue(state, 'tingen_church_directory');
    state.hour = 9;
    performAt(state, 'st_number_church', 'st_number_repair_notices');
    expect(state.clues).toContainEqual(expect.objectContaining({ id: 'tingen_factory_repairs' }));
    expect(isLocationUnlocked(state, 'factory')).toBe(true);
    expect(state.log.map(entry => entry.text).join('\n')).not.toMatch(/机械之心|途径|配方|封印物/);
    expect(state.formulas).toEqual([]);
  });

  it('猎犬酒馆只有在异常经历后才显示安保口信，转介仍不开放黑市', () => {
    const state = fresh();
    acquireClue(state, 'tingen_city_directory');
    acquireClue(state, 'tingen_honest_paper');
    state.hour = 16;
    state.stats.energy = 100;
    expect(travelToLocation(state, 'hound_tavern', 'walk').ok).toBe(true);
    expect(getTingenLandmarkActions(state).map(action => action.id)).not.toContain('hound_leave_security_message');

    state.items.anomaly_evidence = 1;
    expect(getTingenLandmarkActions(state).map(action => action.id)).toContain('hound_leave_security_message');
    expect(performTingenLandmarkAction(state, 'hound_leave_security_message')).toMatchObject({ ok: true });
    expect(hasVerifiedBlackthornReferral(state)).toBe(true);
    expect(state.organizationRoutes.nightwatch.history).toContainEqual(expect.objectContaining({
      step: 'hound_security_referral', outcome: 'passed', evidenceId: 'blackthorn_referral',
    }));
    expect(isLocationUnlocked(state, 'blackthorn_security')).toBe(true);
    expect(isLocationUnlocked(state, 'black_market')).toBe(false);

    saveGame(state);
    const restored = loadGame()!;
    expect(hasVerifiedBlackthornReferral(restored)).toBe(true);
    expect(isLocationUnlocked(restored, 'blackthorn_security')).toBe(true);
    const beforeRepeat = structuredClone(restored);
    expect(performTingenLandmarkAction(restored, 'hound_leave_security_message')).toMatchObject({ ok: false });
    expect(restored).toEqual(beforeRepeat);
  });

  it('市政图书馆承接市政手册书源，真实旅行、行动和返程闭环可用', () => {
    const state = fresh();
    acquireClue(state, 'tingen_city_directory');
    state.hour = 9;
    state.stats.energy = 100;
    expect(travelToLocation(state, 'municipal_library', 'walk')).toMatchObject({ ok: true });
    expect(getBookSourceOffers(state).map(offer => offer.bookId)).toContain('municipal_archive_manual');
    expect(performTingenLandmarkAction(state, 'municipal_old_news_index')).toMatchObject({ ok: true });
    expect(state.knowledge).toContain('tingen_public_records');
    expect(leaveCurrentLocation(state)).toMatchObject({ ok: true });
    expect(state.currentLocation).toBeNull();
  });
});

describe('旧档、脱敏与玩家文案', () => {
  it('旧档中的合法目录线索可继续解锁，锁定驻留与文本仍 fail closed', () => {
    const old = fresh();
    old.schemaVersion = 16;
    acquireClue(old, 'tingen_city_directory');
    old.visitedLocations.push('blackthorn_security');
    old.activeCommission = forgedBlackthornCommission();
    old.currentLocation = {
      locationId: 'blackthorn_security', arrivedDay: 1, arrivedHour: 8,
      travelMode: 'walk', returnHours: 1, returnPrepaid: true,
    };
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(old));
    const loaded = loadGame()!;
    expect(isLocationUnlocked(loaded, 'municipal_library')).toBe(true);
    expect(isLocationUnlocked(loaded, 'blackthorn_security')).toBe(false);
    expect(loaded.visitedLocations).not.toContain('blackthorn_security');
    expect(loaded.activeCommission).toBeNull();
    expect(loaded.currentLocation).toBeNull();
    expect(locationAccessIssue(loaded, 'blackthorn_security')).toBe(locationAccessIssue(loaded, 'not_a_place'));
    expect(redactLockedLocationText(loaded, '前往黑荆棘安保公司递交文件')).not.toContain('黑荆棘安保公司');
    saveGame(loaded);
    expect(loadGame()).toEqual(loaded);
  });

  it('玩家可见源码清除错误旧地名，并由 App 统一调用规则层行动', () => {
    const playerSource = [appSource, dataSource, engineSource].join('\n');
    expect(playerSource).not.toMatch(/圣塞缪尔教堂|贝克兰德晨报/);
    expect(playerSource).toContain('圣赛琳娜教堂');
    expect(playerSource).toContain('《廷根市诚实报》');
    expect(appSource).toContain('E.getTingenLandmarkActions(state)');
    expect(appSource).toContain('E.landmarkActionIssue(state, action.id)');
    expect(appSource).toContain('E.performTingenLandmarkAction(s, action.id)');
    expect(appSource).toContain("disabled={!!issue} title={issue ?? ''}");
  });
});
