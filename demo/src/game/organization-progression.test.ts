import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ORGANIZATIONS, ORGANIZATION_LEAD_DEFS, PATHWAYS } from './data';
import type { GameState, OrganizationId } from './types';
import {
  acceptOfficialOffer, attendOfficialInterview, authenticateDiaryPage, collectMaterialSource,
  compareClocktowerRepairRecords, compareDockCargoRecords,
  commitOrganizationPathway, completeOfficialNightWatch, completeOrganizationQualification,
  contactOrganization, decodeDiaryPage, decodeOrganizationEvidence, discoverDiaryPage,
  discoverOrganizationEvidence, doAdventure, doChat, drinkOfficialDose, drinkPotion,
  getOrganizationOffers, identifyOrganizationEvidence, joinOrganization, leaveOrganization,
  inspectDockMissingReports, loadGame, newGame, openOrganizationOffers, reportAnomalyToEvelyn, requestManorAddress, requestOfficialScreening,
  researchClocktowerRumors, saveGame, traceClocktowerAnomaly, traceDockMarkedManifest, verifyDiaryPageOperationally,
  verifyOrganizationEvidence,
} from './engine';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
}

const fresh = () => newGame('组织测试者', 'clerk', []);

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  vi.stubGlobal('localStorage', new MemoryStorage());
});

/** 先用真实 doChat 建立关系，再固定到门槛值以控制测试体量。 */
function establishTrust(s: GameState, npcId: 'nelson' | 'ella' | 'victor') {
  s.day = 2; s.hour = 10; s.stats.energy = 100;
  expect(doChat(s, npcId).ok).toBe(true);
  expect(s.relations[npcId]).toBeGreaterThan(0);
  expect(s.relations[npcId]).toBeLessThan(20);
  s.relations[npcId] = 20;
}

function qualifyWorldRoute(s: GameState, orgId: Exclude<OrganizationId, 'nightwatch'>) {
  const def = ORGANIZATION_LEAD_DEFS.find(item => item.organizationId === orgId)!;
  if (orgId === 'iron_and_blood') {
    s.stats.energy = 100;
    s.hour = 9;
    expect(inspectDockMissingReports(s).ok).toBe(true);
    expect(doAdventure(s, 'docks').ok).toBe(true);
    expect(s.leads[def.id].stage).toBe('unknown');
    expect(compareDockCargoRecords(s).ok).toBe(true);
    expect(traceDockMarkedManifest(s)).toMatchObject({ ok: true, outcome: 'passed' });
    expect(s.leads[def.id].stage).toBe('found');
    establishTrust(s, 'victor');
  } else if (orgId === 'abraham_branch') {
    establishTrust(s, 'nelson');
    expect(requestManorAddress(s).ok).toBe(true);
    s.stats.energy = 100;
    expect(doAdventure(s, 'manor').ok).toBe(true);
    expect(s.leads[def.id].stage).toBe('found');
  } else {
    establishTrust(s, orgId === 'secret_order' ? 'nelson' : 'ella');
    expect(discoverOrganizationEvidence(s, orgId).ok).toBe(true);
  }
  expect(decodeOrganizationEvidence(s, orgId).ok).toBe(true);
  expect(identifyOrganizationEvidence(s, orgId, def.contactNpc).ok).toBe(true);
  if (orgId === 'abraham_branch') {
    expect(discoverDiaryPage(s, 'diary_door_fragment').ok).toBe(true);
    expect(decodeDiaryPage(s, 'diary_door_fragment').ok).toBe(true);
    s.day += 1; s.hour = 10;
    expect(authenticateDiaryPage(s, 'diary_door_fragment', 'nelson').ok).toBe(true);
    expect(verifyDiaryPageOperationally(s, 'diary_door_fragment', 'nelson').ok).toBe(true);
  }
  expect(verifyOrganizationEvidence(s, orgId).ok).toBe(true);
  expect(contactOrganization(s, orgId).ok).toBe(true);
  s.stats.energy = 100;
  expect(completeOrganizationQualification(s, orgId).ok).toBe(true);
}

function joinAndCommit(s: GameState, orgId: OrganizationId, pathwayId: string) {
  expect(joinOrganization(s, orgId).ok).toBe(true);
  expect(openOrganizationOffers(s, orgId).ok).toBe(true);
  expect(commitOrganizationPathway(s, orgId, pathwayId).ok).toBe(true);
}

describe('组织库存、入口与隔离', () => {
  it('组织库存严格符合矩阵且世界观名称明确为外围关系', () => {
    expect(Object.fromEntries(ORGANIZATIONS.map(org => [org.id, [...org.heldPathways]]))).toEqual({
      nightwatch: ['sleepless', 'seer'], secret_order: ['seer'], psychology_alchemists: ['spectator'],
      iron_and_blood: ['hunter'], abraham_branch: ['apprentice'],
    });
    expect(ORGANIZATIONS.every(org => org.heldPathways.length < PATHWAYS.length)).toBe(true);
    expect(ORGANIZATIONS.find(org => org.id === 'secret_order')?.name).toContain('外围');
    expect(ORGANIZATIONS.find(org => org.id === 'abraham_branch')?.membership).toContain('担保');
  });

  it('新档不能全局一键发现四组织，NPC背景入口要求结识、好感与作息', () => {
    const s = fresh();
    for (const orgId of ['secret_order', 'psychology_alchemists', 'iron_and_blood', 'abraham_branch'] as const) {
      expect(discoverOrganizationEvidence(s, orgId).ok).toBe(false);
    }
    s.day = 1; s.hour = 10;
    expect(doChat(s, 'nelson').ok).toBe(false);
    s.day = 2; s.hour = 10;
    expect(doChat(s, 'nelson').ok).toBe(true);
    const lowTrust = discoverOrganizationEvidence(s, 'secret_order');
    expect(lowTrust.ok).toBe(false);
    expect(lowTrust.msg).not.toMatch(/好感.*[≥≤]\d+/);
    s.relations.nelson = 20; s.day = 8; s.hour = 10;
    expect(discoverOrganizationEvidence(s, 'secret_order').ok).toBe(false);
    s.day = 9; s.hour = 10;
    expect(discoverOrganizationEvidence(s, 'secret_order').ok).toBe(true);
  });

  it('identify 对错误NPC、陌生人、低好感和闭店均 fail-closed', () => {
    const s = fresh();
    establishTrust(s, 'ella');
    expect(discoverOrganizationEvidence(s, 'psychology_alchemists').ok).toBe(true);
    expect(decodeOrganizationEvidence(s, 'psychology_alchemists').ok).toBe(true);
    expect(identifyOrganizationEvidence(s, 'psychology_alchemists', 'victor').ok).toBe(false);
    delete s.relations.ella;
    expect(identifyOrganizationEvidence(s, 'psychology_alchemists', 'ella').ok).toBe(false);
    s.relations.ella = 19;
    expect(identifyOrganizationEvidence(s, 'psychology_alchemists', 'ella').ok).toBe(false);
    s.relations.ella = 20; s.day = 8; s.hour = 10;
    expect(identifyOrganizationEvidence(s, 'psychology_alchemists', 'ella').ok).toBe(false);
    s.day = 9; s.hour = 10;
    expect(identifyOrganizationEvidence(s, 'psychology_alchemists', 'ella').ok).toBe(true);
  });

  it('未加入无报价且不能伪造组织库存外途径', () => {
    const s = fresh();
    qualifyWorldRoute(s, 'secret_order');
    expect(getOrganizationOffers(s, 'secret_order')).toEqual([]);
    expect(commitOrganizationPathway(s, 'secret_order', 'hunter').ok).toBe(false);
    expect(joinOrganization(s, 'secret_order').ok).toBe(true);
    expect(getOrganizationOffers(s, 'secret_order')).toEqual(['seer']);
    expect(openOrganizationOffers(s, 'secret_order').ok).toBe(true);
    expect(commitOrganizationPathway(s, 'secret_order', 'hunter').ok).toBe(false);
    expect(commitOrganizationPathway(s, 'secret_order', 'seer').ok).toBe(true);
  });

  it('可以核验多个组织，但加入一个后不能加入第二个或串用资格', () => {
    const s = fresh();
    qualifyWorldRoute(s, 'secret_order');
    s.stats.energy = 100;
    qualifyWorldRoute(s, 'psychology_alchemists');
    expect(joinOrganization(s, 'secret_order').ok).toBe(true);
    expect(joinOrganization(s, 'psychology_alchemists').ok).toBe(false);
    expect(openOrganizationOffers(s, 'secret_order').ok).toBe(true);
    expect(commitOrganizationPathway(s, 'psychology_alchemists', 'spectator').ok).toBe(false);
  });

  it('承诺前退出组织不会赠送或带走配方材料', () => {
    const s = fresh();
    qualifyWorldRoute(s, 'secret_order');
    joinOrganization(s, 'secret_order');
    openOrganizationOffers(s, 'secret_order');
    const before = { formulas: [...s.formulas], items: { ...s.items } };
    expect(leaveOrganization(s, 'secret_order').ok).toBe(true);
    expect({ formulas: s.formulas, items: s.items }).toEqual(before);
  });
});

describe('五途径确定性闭环', () => {
  it('值夜者不预锁途径，加入后从实际库存选择并服药', () => {
    const s = fresh();
    researchClocktowerRumors(s); compareClocktowerRepairRecords(s); s.hour = 22; traceClocktowerAnomaly(s);
    s.hour = 9; reportAnomalyToEvelyn(s); requestOfficialScreening(s);
    s.day += 1; s.hour = 9; attendOfficialInterview(s);
    s.day += 1; s.hour = 18; s.stats.energy = 100; completeOfficialNightWatch(s);
    s.day += 1; s.hour = 9;
    expect(acceptOfficialOffer(s).ok).toBe(true);
    expect(s.pathwayLeads.sleepless.commitment).toBe(false);
    expect(getOrganizationOffers(s, 'nightwatch')).toEqual(['sleepless', 'seer']);
    openOrganizationOffers(s, 'nightwatch');
    expect(commitOrganizationPathway(s, 'nightwatch', 'sleepless').ok).toBe(true);
    expect(drinkOfficialDose(s, 'sleepless').ok).toBe(true);
    expect(s).toMatchObject({ pathwayId: 'sleepless', sequence: 9 });
  });

  it.each([
    ['secret_order', 'seer'], ['psychology_alchemists', 'spectator'],
    ['iron_and_blood', 'hunter'], ['abraham_branch', 'apprentice'],
  ] as const)('%s 通过真实NPC/地点入口提供 %s 完整闭环', (orgId, pathwayId) => {
    const s = fresh();
    qualifyWorldRoute(s, orgId);
    joinAndCommit(s, orgId, pathwayId);
    const lead = s.pathwayLeads[pathwayId];
    expect(lead.organizationId).toBe(orgId);
    if (lead.preparationMode === 'official_dose') {
      expect(drinkOfficialDose(s, pathwayId).ok).toBe(true);
    } else {
      const sources = Object.values(s.materialSources).filter(source => source.pathwayId === pathwayId && source.targetSequence === 9);
      expect(sources).toHaveLength(2);
      for (const source of sources) {
        s.stats.energy = 100;
        expect(collectMaterialSource(s, source.sourceId, source.locationId).ok).toBe(true);
      }
      expect(drinkPotion(s, pathwayId).ok).toBe(true);
    }
    expect(s).toMatchObject({ pathwayId, sequence: 9 });
    expect(s.log.map(item => item.text).join('\n')).not.toMatch(/准备分\d+|vs 难度|污染[+−]\d+|理智[+−]\d+/);
  });
});

describe('地点、配方与定向材料', () => {
  it('docks 只记录到访，manor 仍写入唯一线索且配方保持 unverified', () => {
    const docks = fresh();
    expect(discoverOrganizationEvidence(docks, 'iron_and_blood').ok).toBe(false);
    docks.stats.energy = 100;
    docks.hour = 9;
    expect(inspectDockMissingReports(docks).ok).toBe(true);
    expect(doAdventure(docks, 'docks').ok).toBe(true);
    expect(docks.visitedLocations).toContain('docks');
    expect(docks.leads.iron_blood_token.stage).toBe('unknown');
    expect(docks.formulas).not.toContain('hunter9');
    expect(doAdventure(docks, 'docks').ok).toBe(true);
    expect(docks.leads.iron_blood_token.notes).toEqual([]);

    const manor = fresh(); establishTrust(manor, 'nelson'); expect(requestManorAddress(manor).ok).toBe(true); manor.stats.energy = 100;
    expect(doAdventure(manor, 'manor').ok).toBe(true);
    expect(manor.visitedLocations).toContain('manor');
    expect(manor.formulas.filter(id => id === 'apprentice9')).toHaveLength(1);
    expect(manor.pathwayLeads.apprentice.formulaStatus).toBe('unverified');
    expect(discoverOrganizationEvidence(manor, 'abraham_branch').ok).toBe(false);
  });

  it('材料错误地点与未解锁失败，正确地点成功且耗尽持久化', () => {
    const s = fresh(); const sourceId = 'seer:octopus_blood';
    expect(collectMaterialSource(s, sourceId, 'docks').ok).toBe(false);
    qualifyWorldRoute(s, 'secret_order'); joinAndCommit(s, 'secret_order', 'seer');
    expect(collectMaterialSource(s, sourceId, 'docks').ok).toBe(false);
    s.stats.energy = 100;
    expect(collectMaterialSource(s, sourceId, 'canal').ok).toBe(true);
    expect(collectMaterialSource(s, sourceId, 'canal').ok).toBe(false);
    saveGame(s);
    expect(loadGame()?.materialSources[sourceId]).toMatchObject({ remaining: 0, locationId: 'canal' });
  });
});

describe('v7 到 v8 迁移', () => {
  function asV7(old: GameState) {
    old.schemaVersion = 7;
    const legacy = { ...old } as Partial<GameState>;
    delete legacy.leads; delete legacy.organizationRoutes; delete legacy.diaryPages;
    delete legacy.materialSources; delete legacy.canReadRoselleScript; delete legacy.visitedLocations;
    return legacy;
  }

  it('未承诺值夜者进度迁入组织路线且幂等', () => {
    const old = fresh();
    old.pathwayLeads.sleepless.routeStep = 'offer_pending';
    old.pathwayLeads.sleepless.currentSource = 'official';
    old.pathwayLeads.sleepless.history = [{ day: 3, step: 'night_observation', outcome: 'passed' }];
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(asV7(old)));
    const first = loadGame()!;
    expect(first.schemaVersion).toBe(16);
    expect(first.organizationRoutes.nightwatch).toMatchObject({ status: 'qualified', routeStep: 'offer_pending' });
    expect(first.pathwayLeads.sleepless).toMatchObject({ routeStep: 'none', commitment: false });
    expect(first.visitedLocations).toEqual([]);
    saveGame(first); expect(loadGame()).toEqual(first);
  });

  it('已承诺与已完成不眠者保持组织、途径和准备状态', () => {
    const committed = fresh();
    Object.assign(committed.pathwayLeads.sleepless, { currentSource: 'official', routeStep: 'dose_ready', commitment: true, preparationMode: 'official_dose' });
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(asV7(committed)));
    expect(loadGame()!.organizationRoutes.nightwatch).toMatchObject({ status: 'committed', selectedPathway: 'sleepless' });

    const completed = fresh(); completed.pathwayId = 'sleepless'; completed.sequence = 9;
    Object.assign(completed.pathwayLeads.sleepless, { currentSource: 'official', routeStep: 'completed', commitment: true, preparationMode: 'official_dose' });
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(asV7(completed)));
    const loaded = loadGame()!;
    expect(loaded).toMatchObject({ pathwayId: 'sleepless', sequence: 9, canReadRoselleScript: true });
    expect(loaded.pathwayLeads.sleepless.routeStep).toBe('completed');
  });
});

describe('v8 到 v9 来源一致性迁移', () => {
  function saveAsV8(state: GameState, keepVisited = false) {
    state.schemaVersion = 8;
    const legacy = { ...state } as Partial<GameState>;
    if (!keepVisited) delete legacy.visitedLocations;
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(legacy));
  }

  it('缺少地点与NPC来源证明的旧v8普通人会回退组织、地点日记与材料状态', () => {
    const old = fresh();
    old.leads.iron_blood_token.stage = 'verified';
    old.leads.abraham_door_map.stage = 'verified';
    old.leads.secret_order_cipher.stage = 'verified';
    Object.assign(old.organizationRoutes.iron_and_blood, {
      status: 'committed', routeStep: 'committed', selectedPathway: 'hunter',
      history: [{ day: 1, step: 'qualification', outcome: 'passed' }],
    });
    Object.assign(old.organizationRoutes.abraham_branch, { status: 'qualified', routeStep: 'qualified' });
    Object.assign(old.organizationRoutes.secret_order, { status: 'member', routeStep: 'member' });
    Object.assign(old.pathwayLeads.hunter, {
      organizationId: 'iron_and_blood', currentSource: 'black_market', commitment: true,
      routeStep: 'dose_ready', preparationMode: 'supervised_brew', formulaStatus: 'verified',
    });
    old.formulas.push('hunter9', 'apprentice9', 'seer9');
    old.materialSources['hunter:deer_heart'].unlocked = true;
    old.materialSources['hunter:deer_heart'].remaining = 0;
    old.items.deer_heart = 1;
    Object.assign(old.diaryPages.diary_org_rules, { acquired: true, decoded: true, authenticity: 'authentic' });
    Object.assign(old.diaryPages.diary_door_fragment, { acquired: true, decoded: true, authenticity: 'authentic', operationalVerified: true });
    Object.assign(old.diaryPages.diary_false_formula, { acquired: true, decoded: true, authenticity: 'forged' });
    saveAsV8(old);

    const loaded = loadGame()!;
    expect(loaded.schemaVersion).toBe(16);
    expect(loaded.visitedLocations).toEqual([]);
    expect(loaded.leads.iron_blood_token.stage).toBe('unknown');
    expect(loaded.leads.abraham_door_map.stage).toBe('unknown');
    expect(loaded.leads.secret_order_cipher.stage).toBe('unknown');
    expect(loaded.organizationRoutes.iron_and_blood.status).toBe('unknown');
    expect(loaded.organizationRoutes.abraham_branch.status).toBe('unknown');
    expect(loaded.organizationRoutes.secret_order.status).toBe('unknown');
    expect(loaded.pathwayLeads.hunter.commitment).toBe(false);
    expect(loaded.formulas).not.toEqual(expect.arrayContaining(['hunter9', 'apprentice9', 'seer9']));
    expect(loaded.materialSources['hunter:deer_heart']).toMatchObject({ unlocked: false, remaining: 1 });
    expect(loaded.items.deer_heart ?? 0).toBe(0);
    expect(Object.values(loaded.diaryPages).every(page => !page.acquired && !page.operationalVerified)).toBe(true);
    saveGame(loaded);
    expect(loadGame()).toEqual(loaded);
  });

  it.each(['contacted', 'qualified', 'member', 'offer_pending', 'committed'] as const)(
    '旧v8无Nelson信任证明的 secret_order %s 状态统一回退', status => {
      const old = fresh();
      old.leads.secret_order_cipher.stage = 'verified';
      Object.assign(old.organizationRoutes.secret_order, {
        status, routeStep: status, selectedPathway: status === 'committed' ? 'seer' : undefined,
      });
      if (status === 'committed') {
        Object.assign(old.pathwayLeads.seer, {
          organizationId: 'secret_order', currentSource: 'mentor', commitment: true,
          routeStep: 'dose_ready', preparationMode: 'supervised_brew', formulaStatus: 'verified',
        });
      }
      saveAsV8(old);
      const loaded = loadGame()!;
      expect(loaded.organizationRoutes.secret_order).toMatchObject({ status: 'unknown', routeStep: 'none' });
      expect(loaded.pathwayLeads.seer.commitment).toBe(false);
    },
  );

  it('有visitedLocations与可信NPC关系的v8真实世界进度尽量保留', () => {
    const old = fresh();
    old.visitedLocations = ['docks', 'manor'];
    old.relations.victor = 20;
    old.leads.iron_blood_token.stage = 'verified';
    Object.assign(old.organizationRoutes.iron_and_blood, { status: 'committed', routeStep: 'committed', selectedPathway: 'hunter' });
    Object.assign(old.pathwayLeads.hunter, {
      organizationId: 'iron_and_blood', currentSource: 'black_market', commitment: true,
      routeStep: 'dose_ready', preparationMode: 'supervised_brew', formulaStatus: 'verified',
    });
    old.formulas.push('hunter9');
    old.materialSources['hunter:deer_heart'].unlocked = true;
    old.materialSources['hunter:deer_heart'].remaining = 0;
    old.items.deer_heart = 1;
    old.materialSources['hunter:iron_fern'].unlocked = true;
    old.materialSources['hunter:iron_fern'].remaining = 0;
    old.items.iron_fern = 1;
    saveAsV8(old, true);

    const loaded = loadGame()!;
    expect(loaded.organizationRoutes.iron_and_blood).toMatchObject({ status: 'committed', selectedPathway: 'hunter' });
    expect(loaded.pathwayLeads.hunter).toMatchObject({ organizationId: 'iron_and_blood', commitment: true });
    expect(loaded.materialSources['hunter:deer_heart']).toMatchObject({ unlocked: true, remaining: 0, locationId: 'manor' });
    expect(loaded.items.deer_heart).toBe(1);
    expect(loaded.materialSources['hunter:iron_fern']).toMatchObject({ unlocked: true, remaining: 1, locationId: 'honakisu' });
    expect(loaded.items.iron_fern ?? 0).toBe(0);
  });

  it('旧v8已成为非凡者的完成态不被来源重锁且读取幂等', () => {
    const old = fresh();
    old.pathwayId = 'hunter'; old.sequence = 9; old.awareness = 'informed';
    old.leads.iron_blood_token.stage = 'verified';
    Object.assign(old.organizationRoutes.iron_and_blood, { status: 'committed', routeStep: 'committed', selectedPathway: 'hunter' });
    Object.assign(old.pathwayLeads.hunter, {
      organizationId: 'iron_and_blood', currentSource: 'black_market', commitment: true,
      routeStep: 'completed', preparationMode: 'supervised_brew', formulaStatus: 'verified',
    });
    old.formulas.push('hunter9');
    old.materialSources['hunter:deer_heart'].unlocked = true;
    old.materialSources['hunter:deer_heart'].remaining = 0;
    Object.assign(old.diaryPages.diary_door_fragment, { acquired: true, decoded: true, authenticity: 'authentic', operationalVerified: true });
    saveAsV8(old);

    const loaded = loadGame()!;
    expect(loaded).toMatchObject({ schemaVersion: 16, pathwayId: 'hunter', sequence: 9 });
    expect(loaded.organizationRoutes.iron_and_blood.status).toBe('committed');
    expect(loaded.pathwayLeads.hunter).toMatchObject({ commitment: true, routeStep: 'completed' });
    expect(loaded.materialSources['hunter:deer_heart']).toMatchObject({ unlocked: true, remaining: 0 });
    expect(loaded.diaryPages.diary_door_fragment).toMatchObject({ acquired: true, operationalVerified: true });
    saveGame(loaded);
    expect(loadGame()).toEqual(loaded);
  });
});
