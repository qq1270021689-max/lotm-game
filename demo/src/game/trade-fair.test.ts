import { beforeEach, describe, expect, it, vi } from 'vitest';
import appSource from '../App.tsx?raw';
import { BEYONDER_DEATH_SOURCES, PATHWAYS, TRADE_FAIR_PRODUCTS } from './data';
import type { GameState } from './types';
import {
  CURRENT_SCHEMA_VERSION,
  TRADE_FAIR_SCHEDULE_LABEL,
  appraiseCharacteristicAtTradeFair,
  applyEffects,
  buyTradeFairProduct,
  canDrink,
  confirmTradeFairPathway,
  currentEvent,
  drinkPotion,
  drinkPurchasedPotion,
  forceEvent,
  getInventoryEntries,
  getTradeFairCatalog,
  hasTradeFairInvitation,
  isTradeFairCharacteristicIdentified,
  leaveCurrentLocation,
  loadGame,
  newGame,
  performAtLocationAction,
  requestTradeFairInvitation,
  resolveChoice,
  saveGame,
  tradeFairAccessIssue,
  tradeFairInvitationIssue,
  tradeFairProductIssue,
  travelToLocation,
} from './engine';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
}

const fresh = () => newGame('交易会测试者', 'clerk', []);

function organizationInvitation(state: GameState, organizationId: 'secret_order' | 'iron_and_blood' = 'secret_order') {
  state.organizationRoutes[organizationId].status = 'contacted';
  expect(requestTradeFairInvitation(state, organizationId)).toMatchObject({ ok: true });
  expect(hasTradeFairInvitation(state)).toBe(true);
}

function arriveAtFair(state: GameState) {
  state.day = 4; // 周三
  state.hour = 22;
  state.stats.energy = 100;
  expect(travelToLocation(state, 'black_market', 'walk')).toMatchObject({ ok: true });
  expect(state.currentLocation?.locationId).toBe('black_market');
  expect(tradeFairAccessIssue(state)).toBeNull();
}

function buyPathwaySet(state: GameState, pathwayId: string, kinds: readonly string[]) {
  const usedByKind: Record<string, number> = {};
  for (const kind of kinds) {
    const candidates = TRADE_FAIR_PRODUCTS.filter(candidate => candidate.pathwayId === pathwayId && candidate.kind === kind);
    const index = usedByKind[kind] ?? 0;
    const product = candidates[index % candidates.length]!;
    usedByKind[kind] = index + 1;
    expect(buyTradeFairProduct(state, product.id), `${pathwayId}:${kind}`).toMatchObject({ ok: true });
  }
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('序列9秘密交易会目录与准入', () => {
  it('五途径都有固定配方、成品、两主材、辅助包与特性，且绝不包含序列8', () => {
    expect(PATHWAYS).toHaveLength(5);
    for (const pathway of PATHWAYS) {
      const products = TRADE_FAIR_PRODUCTS.filter(product => product.pathwayId === pathway.id);
      expect(products.filter(product => product.kind === 'formula')).toHaveLength(1);
      expect(products.filter(product => product.kind === 'potion')).toHaveLength(1);
      expect(products.filter(product => product.kind === 'material')).toHaveLength(2);
      expect(products.filter(product => product.kind === 'auxiliary')).toHaveLength(1);
      expect(products.filter(product => product.kind === 'characteristic')).toHaveLength(1);
      expect(products.every(product => product.sequence === 9 && product.initialStock > 0 && product.price > 0)).toBe(true);
      expect(products.flatMap(product => [product.formulaId, product.itemId]).filter(Boolean).some(id => String(id).endsWith('8'))).toBe(false);
    }
    expect(PATHWAYS.find(pathway => pathway.id === 'hunter')?.seq9.materials).toEqual(['blood_red_chestnut', 'activated_marsh_crystal']);
    expect(PATHWAYS.find(pathway => pathway.id === 'sleepless')?.seq9.materials).toEqual(['midnight_beauty_flower', 'six_legged_owl_eye']);
    expect(PATHWAYS.find(pathway => pathway.id === 'apprentice')?.seq9.materials).toEqual(['treasure_eating_bug', 'phantom_crystal']);
  });

  it('新档看不到货单；正式组织接触或可信维克多可提供邀请，暗号本身不够', () => {
    const hidden = fresh();
    hidden.intel.push('black_market');
    expect(getTradeFairCatalog(hidden)).toEqual([]);
    expect(tradeFairInvitationIssue(hidden, 'secret_order')).toMatch(/正式接触/);
    expect(hasTradeFairInvitation(hidden)).toBe(false);

    organizationInvitation(hidden);
    expect(hidden.intel).toEqual(expect.arrayContaining(['trade_fair_invitation', 'black_market']));
    expect(hidden.log.at(-1)?.text).toContain(TRADE_FAIR_SCHEDULE_LABEL);

    const victor = fresh();
    victor.intel.push('black_market');
    victor.relations.victor = 20;
    victor.day = 4; victor.hour = 22; victor.stats.energy = 100;
    expect(travelToLocation(victor, 'black_market', 'walk')).toMatchObject({ ok: true });
    expect(requestTradeFairInvitation(victor, 'victor')).toMatchObject({ ok: true });
    expect(victor.organizationRoutes.iron_and_blood.history).toContainEqual(expect.objectContaining({
      step: 'trade_fair_invitation:victor', outcome: 'passed', evidenceId: 'trade_fair_invitation',
    }));
  });

  it('必须在正确地点和周三/周六深夜交易，失败零状态；库存有限且购买不锁途径', () => {
    const state = fresh();
    state.pence = 10_000;
    organizationInvitation(state);
    const product = TRADE_FAIR_PRODUCTS.find(candidate => candidate.id === 'trade:seer:formula')!;
    const before = structuredClone(state);
    expect(buyTradeFairProduct(state, product.id)).toMatchObject({ ok: false });
    expect(state).toEqual(before);

    state.day = 2; state.hour = 22; state.stats.energy = 100;
    expect(travelToLocation(state, 'black_market', 'walk')).toMatchObject({ ok: true });
    expect(tradeFairProductIssue(state, product.id)).toContain('周三、周六');
    expect(getTradeFairCatalog(state)).toEqual([]);
    expect(leaveCurrentLocation(state)).toMatchObject({ ok: true });

    arriveAtFair(state);
    expect(getTradeFairCatalog(state)).toHaveLength(30);
    expect(buyTradeFairProduct(state, product.id)).toMatchObject({ ok: true });
    expect(state.formulas).toContain('seer9');
    expect(state.pathwayLeads.seer).toMatchObject({ commitment: false, currentSource: 'trade_fair', formulaStatus: 'verified' });
    expect(state.tradeFair.stock[product.id]).toBe(0);
    expect(buyTradeFairProduct(state, product.id)).toMatchObject({ ok: false });
  });

  it('值夜者既不提供地下交易会邀请，也不能把官方承诺改写为交易会准备', () => {
    const rejected = fresh();
    rejected.organizationRoutes.nightwatch.status = 'contacted';
    const rejectedBefore = structuredClone(rejected);
    expect(tradeFairInvitationIssue(rejected, 'nightwatch')).toMatch(/不为地下通用交易会作保/);
    expect(requestTradeFairInvitation(rejected, 'nightwatch')).toMatchObject({ ok: false });
    expect(rejected).toEqual(rejectedBefore);

    const official = fresh(); official.pence = 10_000;
    organizationInvitation(official, 'secret_order');
    Object.assign(official.organizationRoutes.nightwatch, { status: 'committed', routeStep: 'committed', selectedPathway: 'sleepless' });
    Object.assign(official.pathwayLeads.sleepless, {
      organizationId: 'nightwatch', currentSource: 'official', commitment: true,
      routeStep: 'dose_ready', preparationMode: 'official_dose', formulaStatus: 'verified',
    });
    arriveAtFair(official);
    expect(getTradeFairCatalog(official)).toEqual([]);
    const beforePurchase = structuredClone(official);
    expect(buyTradeFairProduct(official, 'trade:sleepless:potion')).toMatchObject({ ok: false });
    expect(official).toEqual(beforePurchase);
    expect(leaveCurrentLocation(official)).toMatchObject({ ok: true });
    expect(confirmTradeFairPathway(official, 'sleepless', 'purchased_dose')).toMatchObject({ ok: false });
    expect(official.pathwayLeads.sleepless).toMatchObject({ organizationId: 'nightwatch', preparationMode: 'official_dose', routeStep: 'dose_ready' });
  });

  it('已有组织承诺时货单只保留同途径，仍可改用同途径交易会成品', () => {
    const state = fresh(); state.pence = 10_000;
    Object.assign(state.organizationRoutes.secret_order, { status: 'committed', routeStep: 'committed', selectedPathway: 'seer' });
    Object.assign(state.pathwayLeads.seer, {
      organizationId: 'secret_order', currentSource: 'mentor', commitment: true,
      routeStep: 'dose_ready', preparationMode: 'supervised_brew', formulaStatus: 'verified',
    });
    expect(requestTradeFairInvitation(state, 'secret_order')).toMatchObject({ ok: true });
    arriveAtFair(state);
    expect(new Set(getTradeFairCatalog(state).map(product => product.pathwayId))).toEqual(new Set(['seer']));
    expect(tradeFairProductIssue(state, 'trade:hunter:potion')).toMatch(/不在当前担保货单/);
    expect(buyTradeFairProduct(state, 'trade:seer:potion')).toMatchObject({ ok: true });
    expect(leaveCurrentLocation(state)).toMatchObject({ ok: true });
    expect(confirmTradeFairPathway(state, 'seer', 'purchased_dose')).toMatchObject({ ok: true });
    expect(state.pathwayLeads.seer).toMatchObject({ organizationId: 'secret_order', currentSource: 'mentor', commitment: true, preparationMode: 'purchased_dose' });
    expect(drinkPurchasedPotion(state, 'seer')).toMatchObject({ ok: true });
    expect(state).toMatchObject({ pathwayId: 'seer', sequence: 9 });
  });
});

describe('途径确认、成品与特性替代', () => {
  it('双主材路线还必须消耗辅助包，确认后锁途径并完整消耗', () => {
    const state = fresh(); state.pence = 10_000;
    organizationInvitation(state); arriveAtFair(state);
    buyPathwaySet(state, 'seer', ['formula', 'material', 'material']);
    expect(leaveCurrentLocation(state)).toMatchObject({ ok: true });
    expect(confirmTradeFairPathway(state, 'seer', 'materials')).toMatchObject({ ok: false });

    state.day = 7; state.hour = 22; state.stats.energy = 100;
    expect(travelToLocation(state, 'black_market', 'walk')).toMatchObject({ ok: true });
    buyPathwaySet(state, 'seer', ['auxiliary']);
    expect(leaveCurrentLocation(state)).toMatchObject({ ok: true });
    expect(confirmTradeFairPathway(state, 'seer', 'materials')).toMatchObject({ ok: true });
    expect(state.pathwayLeads.seer).toMatchObject({ commitment: true, currentSource: 'trade_fair', preparationMode: 'trade_fair_brew' });
    expect(confirmTradeFairPathway(state, 'hunter', 'materials')).toMatchObject({ ok: false });
    expect(canDrink(state, 'seer')).toMatchObject({ ok: true, mode: 'trade_fair_brew' });
    expect(drinkPotion(state, 'seer')).toMatchObject({ ok: true });
    expect(state).toMatchObject({ pathwayId: 'seer', sequence: 9 });
    expect([...PATHWAYS.find(pathway => pathway.id === 'seer')!.seq9.materials, 'seer9_auxiliary'].map(id => state.items[id] ?? 0)).toEqual([0, 0, 0]);
  });

  it('担保成品无需辅助包，但服食前仍需显式确认并锁定', () => {
    const state = fresh(); state.pence = 10_000;
    organizationInvitation(state); arriveAtFair(state);
    buyPathwaySet(state, 'spectator', ['potion']);
    expect(state.pathwayLeads.spectator.commitment).toBe(false);
    expect(leaveCurrentLocation(state)).toMatchObject({ ok: true });
    expect(drinkPurchasedPotion(state, 'spectator')).toMatchObject({ ok: false });
    expect(confirmTradeFairPathway(state, 'spectator', 'purchased_dose')).toMatchObject({ ok: true });
    expect(canDrink(state, 'spectator')).toMatchObject({ ok: true, mode: 'purchased_dose' });
    expect(drinkPurchasedPotion(state, 'spectator')).toMatchObject({ ok: true });
    expect(state).toMatchObject({ pathwayId: 'spectator', sequence: 9 });
    expect(state.items.spectator9_potion ?? 0).toBe(0);
  });

  it('完整特性整组替代两件主材但仍耗辅助包；错误途径与生吞均拒绝，一件主材不会被混耗', () => {
    const state = fresh(); state.pence = 10_000;
    organizationInvitation(state); arriveAtFair(state);
    buyPathwaySet(state, 'seer', ['formula', 'characteristic', 'auxiliary']);
    const oneMaterial = PATHWAYS.find(pathway => pathway.id === 'seer')!.seq9.materials[0];
    state.items[oneMaterial] = 1;
    expect(leaveCurrentLocation(state)).toMatchObject({ ok: true });
    expect(drinkPotion(state, 'seer')).toMatchObject({ ok: false });
    expect(confirmTradeFairPathway(state, 'hunter', 'characteristic')).toMatchObject({ ok: false });
    expect(confirmTradeFairPathway(state, 'seer', 'characteristic')).toMatchObject({ ok: true });
    expect(drinkPotion(state, 'seer')).toMatchObject({ ok: true });
    expect(state.items.seer9_characteristic ?? 0).toBe(0);
    expect(state.items.seer9_auxiliary ?? 0).toBe(0);
    expect(state.items[oneMaterial]).toBe(1);
  });
});

describe('死亡析出、鉴定与存档清洗', () => {
  it('固定死亡事件只在真实交易会营业夜通过旅行与探索进入抽取池', () => {
    const ordinaryNight = fresh();
    organizationInvitation(ordinaryNight);
    ordinaryNight.day = 2; ordinaryNight.hour = 22; ordinaryNight.stats.energy = 100;
    expect(travelToLocation(ordinaryNight, 'black_market', 'walk')).toMatchObject({ ok: true });
    expect(performAtLocationAction(ordinaryNight, 'explore')).toMatchObject({ ok: true });
    expect(currentEvent(ordinaryNight)?.id).not.toBe('adv_confirmed_beyonder_death');
    expect(ordinaryNight.forcedEventQueue).not.toContain('adv_confirmed_beyonder_death');
    expect(ordinaryNight.firedOnce).not.toContain('adv_confirmed_beyonder_death');
    expect(ordinaryNight.confirmedBeyonderDeaths).toEqual([]);

    const fairNight = fresh();
    organizationInvitation(fairNight);
    arriveAtFair(fairNight);
    expect(performAtLocationAction(fairNight, 'explore')).toMatchObject({ ok: true });
    if (currentEvent(fairNight)?.id !== 'adv_confirmed_beyonder_death') resolveChoice(fairNight, 0);
    expect(currentEvent(fairNight)?.id).toBe('adv_confirmed_beyonder_death');
    expect(fairNight.currentLocation?.locationId).toBe('black_market');
    expect(fairNight.firedOnce).toContain('adv_confirmed_beyonder_death');
  });

  it('只有固定事件确认的序列9非凡者死亡析出一次；普通尸体与脱离事件的效果都不产出', () => {
    const state = fresh();
    applyEffects(state, [{ k: 'beyonder_death', id: 'fallen_seer_smuggler' }]);
    expect(state.confirmedBeyonderDeaths).toEqual([]);
    expect(state.items.seer9_characteristic ?? 0).toBe(0);

    organizationInvitation(state);
    arriveAtFair(state);
    forceEvent(state, 'adv_confirmed_beyonder_death');
    expect(currentEvent(state)?.id).toBe('adv_confirmed_beyonder_death');
    resolveChoice(state, 0);
    expect(state.confirmedBeyonderDeaths).toContainEqual(expect.objectContaining({
      sourceId: 'fallen_seer_smuggler', npcId: 'masked_fortune_smuggler', pathwayId: 'seer', sequence: 9,
    }));
    expect(state.items.seer9_characteristic).toBe(1);
    forceEvent(state, 'adv_confirmed_beyonder_death');
    expect(currentEvent(state)).toBeNull();
    expect(state.items.seer9_characteristic).toBe(1);
    expect(BEYONDER_DEATH_SOURCES.every(source => source.sequence === 9 && !!source.npcId && !!source.eventId)).toBe(true);
  });

  it('掉落特性初见只显示表面并归杂物；有死亡记录且交易会鉴定后才揭示途径', () => {
    const state = fresh(); state.pence = 10_000;
    organizationInvitation(state);
    arriveAtFair(state);
    forceEvent(state, 'adv_confirmed_beyonder_death'); resolveChoice(state, 0);
    const concealed = getInventoryEntries(state).find(entry => entry.id === 'seer9_characteristic')!;
    expect(concealed).toMatchObject({ category: 'misc', name: '凝结的异常残留' });
    expect(concealed.description).not.toMatch(/占卜家|序列9|替代/);

    expect(appraiseCharacteristicAtTradeFair(state, 'seer9_characteristic')).toMatchObject({ ok: true });
    expect(isTradeFairCharacteristicIdentified(state, 'seer9_characteristic')).toBe(true);
    const known = getInventoryEntries(state).find(entry => entry.id === 'seer9_characteristic')!;
    expect(known.category).toBe('occult');
    expect(known.name).toContain('占卜家');
    expect(known.description).toMatch(/辅助材料|不能生吞/);
  });

  it('v18迁移旧主材数量；v19清除伪造邀请、库存与死亡记录，合法库存往返幂等', () => {
    const legacy = fresh();
    legacy.schemaVersion = 18;
    legacy.items.deer_heart = 2;
    legacy.items.bat_eye = 1;
    delete (legacy as Partial<GameState>).tradeFair;
    delete (legacy as Partial<GameState>).confirmedBeyonderDeaths;
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(legacy));
    const migrated = loadGame()!;
    expect(migrated).toMatchObject({ schemaVersion: CURRENT_SCHEMA_VERSION });
    expect(migrated.items).toMatchObject({ deer_heart: 0, blood_red_chestnut: 2, bat_eye: 0, midnight_beauty_flower: 1 });
    expect(migrated.tradeFair).toMatchObject({ invitation: null });

    const forged = fresh();
    forged.tradeFair.invitation = { sourceKind: 'npc', sourceId: 'victor', acquiredDay: 1, acquiredHour: 22 };
    forged.intel.push('trade_fair_invitation');
    forged.tradeFair.stock['trade:seer:potion'] = 0;
    forged.tradeFair.purchasedCounts['trade:seer:potion'] = 0;
    forged.confirmedBeyonderDeaths.push({
      sourceId: 'fallen_seer_smuggler', npcId: 'masked_fortune_smuggler', pathwayId: 'seer', sequence: 9,
      characteristicItemId: 'seer9_characteristic', confirmedDay: 1, confirmedHour: 22,
    });
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(forged));
    const cleaned = loadGame()!;
    expect(cleaned.tradeFair.invitation).toBeNull();
    expect(cleaned.intel).not.toContain('trade_fair_invitation');
    expect(cleaned.tradeFair.stock['trade:seer:potion']).toBe(1);
    expect(cleaned.confirmedBeyonderDeaths).toEqual([]);

    const valid = fresh(); valid.pence = 10_000;
    organizationInvitation(valid); arriveAtFair(valid);
    buyPathwaySet(valid, 'apprentice', ['formula', 'potion']);
    saveGame(valid);
    const restored = loadGame()!;
    expect(restored.tradeFair).toEqual(valid.tradeFair);
    expect(restored.formulas).toContain('apprentice9');
    saveGame(restored);
    expect(loadGame()?.tradeFair).toEqual(restored.tradeFair);
  });

  it('UI只通过规则层读取交易会，并明确最终确认不可逆', () => {
    expect(appSource).toContain('E.getTradeFairCatalog(state)');
    expect(appSource).toContain('E.tradeFairProductIssue(state, product.id)');
    expect(appSource).toContain('!E.tradeFairAccessIssue(state) && (');
    expect(appSource).toContain("org.id !== 'nightwatch'");
    expect(appSource).toContain('E.confirmTradeFairPathway');
    expect(appSource).toMatch(/购买不会锁定途径.*不可逆/);
    expect(appSource).not.toMatch(/TRADE_FAIR_PRODUCTS\.map/);
  });
});
