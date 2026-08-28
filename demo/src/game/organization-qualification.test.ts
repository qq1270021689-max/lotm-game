import { beforeEach, describe, expect, it, vi } from 'vitest';
import appSource from '../App.tsx?raw';
import { EXPLORATION_CHECKS, ORGANIZATION_LEAD_DEFS, ORGANIZATION_QUALIFICATION_TASKS } from './data';
import type { GameState, OrganizationId } from './types';
import {
  acquireClue,
  compareDockCargoRecords,
  completeOfficialNightWatch,
  completeOrganizationQualification,
  discoverOrganizationEvidence,
  doAdventure,
  getOrganizationQualificationTaskView,
  hasClue,
  inspectDockMissingReports,
  joinOrganization,
  leaveCurrentLocation,
  loadGame,
  newGame,
  organizationQualificationIssue,
  requestManorAddress,
  saveGame,
  traceDockMarkedManifest,
  travelToLocation,
} from './engine';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
}

const NON_NIGHTWATCH = ['secret_order', 'psychology_alchemists', 'iron_and_blood', 'abraham_branch'] as const;
const fresh = () => newGame('资格任务测试者', 'clerk', []);

function taskFor(organizationId: typeof NON_NIGHTWATCH[number]) {
  return ORGANIZATION_QUALIFICATION_TASKS.find(task => task.organizationId === organizationId)!;
}

function eligible(organizationId: typeof NON_NIGHTWATCH[number], hour = 10) {
  const state = fresh();
  const task = taskFor(organizationId);
  const leadDef = ORGANIZATION_LEAD_DEFS.find(def => def.organizationId === organizationId)!;
  state.hour = hour;
  state.stats.energy = 100;
  state.leads[leadDef.id].stage = 'verified';
  Object.assign(state.organizationRoutes[organizationId], { status: 'contacted', routeStep: 'contacted' });
  acquireClue(state, task.hardClueId, organizationId === 'abraham_branch' ? 'location' : 'npc', leadDef.id);
  return state;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('四组织资格任务定义与真实来源', () => {
  it('定义矩阵固定，值夜者不进入通用任务', () => {
    expect(ORGANIZATION_QUALIFICATION_TASKS.map(task => ({
      organizationId: task.organizationId, checkId: task.checkId, stat: task.stat, skill: task.skill,
      hardClueId: task.hardClueId, passEnergyCost: task.passEnergyCost, passHours: task.passHours,
    }))).toEqual([
      { organizationId: 'secret_order', checkId: 'org_qualification_secret_order_provenance', stat: 'mnd', skill: 'occult', hardClueId: 'secret_order_cipher', passEnergyCost: 14, passHours: 3 },
      { organizationId: 'psychology_alchemists', checkId: 'org_qualification_psychology_ethics', stat: 'cha', skill: 'speech', hardClueId: 'psychology_case_notes', passEnergyCost: 12, passHours: 3 },
      { organizationId: 'iron_and_blood', checkId: 'org_qualification_iron_and_blood_field', stat: 'phy', skill: 'investigate', hardClueId: 'dock_marked_manifest', passEnergyCost: 20, passHours: 4 },
      { organizationId: 'abraham_branch', checkId: 'org_qualification_abraham_provenance', stat: 'spi', skill: 'occult', hardClueId: 'abraham_door_map', passEnergyCost: 16, passHours: 3 },
    ]);
    for (const task of ORGANIZATION_QUALIFICATION_TASKS) {
      const check = EXPLORATION_CHECKS.find(def => def.id === task.checkId)!;
      expect(check.requirements).toEqual([{ kind: 'clue', id: task.hardClueId }]);
      expect(check.contributions.filter(term => term.kind === 'stat')).toEqual([{ kind: 'stat', id: task.stat, multiplier: 1, publicLabel: task.statLabel }]);
      expect(check.contributions.filter(term => term.kind === 'skill')).toEqual([{ kind: 'skill', id: task.skill, multiplier: 4, publicLabel: task.skillLabel }]);
    }
    expect(organizationQualificationIssue(fresh(), 'nightwatch')).toMatch(/不使用/);
  });

  it('真实discover/地点调查才取得三条新硬线索，contact或资格状态不会凭空授予', () => {
    const secret = fresh(); secret.day = 2; secret.hour = 10; secret.relations.nelson = 20;
    expect(discoverOrganizationEvidence(secret, 'secret_order')).toMatchObject({ ok: true });
    expect(hasClue(secret, 'secret_order_cipher')).toBe(true);
    expect(secret.clues.find(clue => clue.id === 'secret_order_cipher')).toMatchObject({ sourceKind: 'npc', sourceId: 'nelson' });

    const psychology = fresh(); psychology.day = 2; psychology.hour = 10; psychology.relations.ella = 20;
    expect(discoverOrganizationEvidence(psychology, 'psychology_alchemists')).toMatchObject({ ok: true });
    expect(hasClue(psychology, 'psychology_case_notes')).toBe(true);
    expect(psychology.clues.find(clue => clue.id === 'psychology_case_notes')).toMatchObject({ sourceKind: 'npc', sourceId: 'ella' });

    const abraham = fresh(); abraham.day = 2; abraham.hour = 10; abraham.relations.nelson = 20;
    expect(requestManorAddress(abraham)).toMatchObject({ ok: true });
    abraham.stats.energy = 100;
    expect(doAdventure(abraham, 'manor')).toMatchObject({ ok: true });
    expect(hasClue(abraham, 'abraham_door_map')).toBe(true);

    const iron = fresh(); iron.intel.push('dock_missing'); iron.hour = 8; iron.stats.energy = 100;
    iron.stats.mnd = 100; iron.skills.investigate = 10;
    expect(travelToLocation(iron, 'docks', 'walk')).toMatchObject({ ok: true });
    expect(inspectDockMissingReports(iron)).toMatchObject({ ok: true });
    expect(compareDockCargoRecords(iron)).toMatchObject({ ok: true });
    expect(traceDockMarkedManifest(iron)).toMatchObject({ ok: true, outcome: 'passed' });
    expect(hasClue(iron, 'dock_marked_manifest')).toBe(true);
    expect(leaveCurrentLocation(iron)).toMatchObject({ ok: true });

    const forged = fresh();
    for (const task of ORGANIZATION_QUALIFICATION_TASKS) {
      const leadDef = ORGANIZATION_LEAD_DEFS.find(def => def.organizationId === task.organizationId)!;
      forged.leads[leadDef.id].stage = 'verified';
      Object.assign(forged.organizationRoutes[task.organizationId], { status: 'contacted', routeStep: 'contacted' });
      expect(hasClue(forged, task.hardClueId)).toBe(false);
    }
  });
});

describe('资格检定边界、重试与精确结算', () => {
  it('非法组织、工作中、非凡者、错误route/lead均fail-closed且零状态', () => {
    const cases: { state: GameState; organizationId: OrganizationId }[] = [
      { state: eligible('secret_order'), organizationId: 'nightwatch' },
      { state: Object.assign(eligible('secret_order'), { atWork: true }), organizationId: 'secret_order' },
      { state: Object.assign(eligible('secret_order'), { pathwayId: 'seer', sequence: 9 }), organizationId: 'secret_order' },
      { state: (() => { const state = eligible('secret_order'); state.organizationRoutes.secret_order.status = 'unknown'; return state; })(), organizationId: 'secret_order' },
      { state: (() => { const state = eligible('secret_order'); state.organizationRoutes.secret_order.routeStep = 'qualified'; return state; })(), organizationId: 'secret_order' },
      { state: (() => { const state = eligible('secret_order'); state.leads.secret_order_cipher.stage = 'identified'; return state; })(), organizationId: 'secret_order' },
      { state: eligible('secret_order'), organizationId: 'invalid' as OrganizationId },
    ];
    for (const { state, organizationId } of cases) {
      const before = structuredClone(state);
      expect(completeOrganizationQualification(state, organizationId)).toMatchObject({ ok: false });
      expect(state).toEqual(before);
    }
  });

  it('缺硬线索零成本，首次insufficient可点击并按夜行折扣结算1小时attempt', () => {
    const missing = eligible('secret_order');
    missing.clues = missing.clues.filter(clue => clue.id !== 'secret_order_cipher');
    const missingBefore = structuredClone(missing);
    expect(organizationQualificationIssue(missing, 'secret_order')).toMatch(/原始凭据/);
    expect(completeOrganizationQualification(missing, 'secret_order')).toMatchObject({ ok: false });
    expect(missing).toEqual(missingBefore);

    const blocked = eligible('secret_order', 23);
    blocked.talents.push('night_owl');
    blocked.stats.mnd = 1;
    blocked.skills.occult = 0;
    expect(getOrganizationQualificationTaskView(blocked, 'secret_order')?.issue).toBeNull();
    const beforeHistory = structuredClone(blocked.organizationRoutes.secret_order.history);
    expect(completeOrganizationQualification(blocked, 'secret_order')).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(blocked.stats.energy).toBe(96);
    expect(blocked).toMatchObject({ day: 2, hour: 0 });
    expect(blocked.organizationRoutes.secret_order).toMatchObject({ status: 'contacted', routeStep: 'contacted', history: beforeHistory });
    expect(blocked.checkAttempts.at(-1)).toMatchObject({
      checkId: 'org_qualification_secret_order_provenance', startedDay: 1, startedHour: 23,
      outcome: 'blocked', receipt: { hoursElapsed: 1 },
    });
    blocked.stats.energy = 4;
    expect(organizationQualificationIssue(blocked, 'secret_order')).toMatch(/没有实质变化/);
  });

  it('同指纹与无关变化不能绕过，定义内旁证可重试，相关技能变化后通过', () => {
    const state = eligible('secret_order');
    state.stats.mnd = 1;
    state.skills.occult = 0;
    expect(completeOrganizationQualification(state, 'secret_order')).toMatchObject({ ok: true, outcome: 'blocked' });
    state.stats.energy = 100;
    state.pence += 100;
    state.relations.martha += 5;
    expect(organizationQualificationIssue(state, 'secret_order')).toMatch(/没有实质变化/);
    const repeated = structuredClone(state);
    expect(completeOrganizationQualification(state, 'secret_order')).toMatchObject({ ok: false });
    expect(state).toEqual(repeated);

    acquireClue(state, 'clocktower_divination_omen');
    expect(organizationQualificationIssue(state, 'secret_order')).toBeNull();
    expect(completeOrganizationQualification(state, 'secret_order')).toMatchObject({ ok: true, outcome: 'blocked' });
    state.stats.energy = 100;
    state.skills.occult = 10;
    expect(organizationQualificationIssue(state, 'secret_order')).toBeNull();
    expect(completeOrganizationQualification(state, 'secret_order')).toMatchObject({ ok: true, outcome: 'passed' });
  });

  it('四任务通过时使用精确成本与时长，且只有目标route和attempt发生资格变化', () => {
    for (const organizationId of NON_NIGHTWATCH) {
      const task = taskFor(organizationId);
      const state = eligible(organizationId);
      state.stats[task.stat] = 100;
      const before = {
        energy: state.stats.energy, hour: state.hour, pence: state.pence,
        stats: structuredClone(state.stats), skills: structuredClone(state.skills), items: structuredClone(state.items),
        formulas: [...state.formulas], relations: structuredClone(state.relations), leads: structuredClone(state.leads),
        otherRoutes: Object.fromEntries(Object.entries(state.organizationRoutes).filter(([id]) => id !== organizationId)),
        materials: structuredClone(state.materialSources), sequence8Progress: structuredClone(state.sequence8Progress),
      };
      expect(completeOrganizationQualification(state, organizationId)).toMatchObject({ ok: true, outcome: 'passed' });
      expect(state.stats.energy).toBe(before.energy - task.passEnergyCost);
      expect(state.hour).toBe((before.hour + task.passHours) % 24);
      expect(state.organizationRoutes[organizationId]).toMatchObject({ status: 'qualified', routeStep: 'qualified' });
      expect(state.organizationRoutes[organizationId].history.at(-1)).toMatchObject({ step: `qualification_check:${task.checkId}`, outcome: 'passed', day: 1 });
      expect(state.checkAttempts.at(-1)).toMatchObject({ checkId: task.checkId, outcome: 'passed', receipt: { hoursElapsed: task.passHours } });
      expect({ ...state.stats, energy: before.stats.energy }).toEqual(before.stats);
      expect(state.skills).toEqual(before.skills);
      expect(state.pence).toBe(before.pence);
      expect(state.items).toEqual(before.items);
      expect(state.formulas).toEqual(before.formulas);
      expect(state.relations).toEqual(before.relations);
      expect(state.leads).toEqual(before.leads);
      expect(Object.fromEntries(Object.entries(state.organizationRoutes).filter(([id]) => id !== organizationId))).toEqual(before.otherRoutes);
      expect(state.materialSources).toEqual(before.materials);
      expect(state.sequence8Progress).toEqual(before.sequence8Progress);

      const after = structuredClone(state);
      expect(completeOrganizationQualification(state, organizationId)).toMatchObject({ ok: false });
      expect(state).toEqual(after);
    }
  });

  it.each(NON_NIGHTWATCH)('%s 状态链 contacted→blocked→prepare→pass→join', organizationId => {
    const task = taskFor(organizationId);
    const state = eligible(organizationId);
    state.stats[task.stat] = 1;
    state.skills[task.skill] = 0;
    expect(completeOrganizationQualification(state, organizationId)).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(state.organizationRoutes[organizationId].status).toBe('contacted');
    state.stats.energy = 100;
    state.skills[task.skill] = 10;
    expect(completeOrganizationQualification(state, organizationId)).toMatchObject({ ok: true, outcome: 'passed' });
    expect(state.organizationRoutes[organizationId].status).toBe('qualified');
    expect(joinOrganization(state, organizationId)).toMatchObject({ ok: true });
    expect(state.organizationRoutes[organizationId].status).toBe('member');
  });
});

describe('资格attempt存档、旧档补录、UI与值夜者一致性', () => {
  it('合法attempt读档幂等，伪造指纹被丢弃', () => {
    const state = eligible('secret_order');
    state.stats.mnd = 1;
    expect(completeOrganizationQualification(state, 'secret_order')).toMatchObject({ ok: true, outcome: 'blocked' });
    saveGame(state);
    const loaded = loadGame()!;
    expect(loaded.checkAttempts.at(-1)?.checkId).toBe('org_qualification_secret_order_provenance');
    saveGame(loaded);
    expect(loadGame()).toEqual(loaded);

    const raw = JSON.parse(localStorage.getItem('lotm-demo-save-v6')!);
    raw.checkAttempts[raw.checkAttempts.length - 1].fingerprint = 'forged';
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(raw));
    expect(loadGame()?.checkAttempts).toHaveLength(0);
  });

  it('旧真实contacted路线补录硬线索，缺可信历史的伪造路线不能洗白', () => {
    const trusted = fresh();
    trusted.leads.secret_order_cipher.stage = 'verified';
    Object.assign(trusted.organizationRoutes.secret_order, { status: 'contacted', routeStep: 'contacted', history: [
      { day: 1, step: 'world_entry:secret_order_cipher', outcome: 'passed' as const },
      { day: 1, step: 'lead_verified:secret_order_cipher', outcome: 'passed' as const },
    ] });
    expect(hasClue(trusted, 'secret_order_cipher')).toBe(false);
    saveGame(trusted);
    expect(hasClue(loadGame()!, 'secret_order_cipher')).toBe(true);

    const forged = fresh();
    forged.leads.secret_order_cipher.stage = 'verified';
    Object.assign(forged.organizationRoutes.secret_order, { status: 'contacted', routeStep: 'contacted' });
    saveGame(forged);
    const loaded = loadGame()!;
    expect(hasClue(loaded, 'secret_order_cipher')).toBe(false);
    expect(organizationQualificationIssue(loaded, 'secret_order')).toMatch(/原始凭据/);
  });

  it('UI只展示公开任务叙事、输入与已拥有旁证，不含内部值或未获得线索', () => {
    const state = eligible('secret_order');
    let view = getOrganizationQualificationTaskView(state, 'secret_order')!;
    expect(view).toMatchObject({ label: '来源分级与保密删节', inputLabels: ['来源推理', '神秘学整理'], helpedBy: [] });
    acquireClue(state, 'manor_guest_registry');
    view = getOrganizationQualificationTaskView(state, 'secret_order')!;
    expect(view.helpedBy).toEqual(['庄园名册旁证']);
    expect(JSON.stringify(view)).not.toMatch(/difficulty|score|multiplier|cryptic_note_warning|clocktower_divination_omen|org_qualification_/i);

    const section = appSource.split('data-organization-qualification')[1]?.split("route.status === 'qualified'")[0] ?? '';
    expect(section).toContain('qualificationView.issue');
    expect(section).not.toMatch(/difficulty|score|multiplier|org_qualification_|cryptic_note_warning|manor_guest_registry|clocktower_divination_omen/i);
  });

  it('值夜者仍走独立流程，夜行折扣门槛与跨午夜开始日期一致', () => {
    const state = fresh();
    state.day = 3;
    state.hour = 22;
    state.talents.push('night_owl');
    state.stats.energy = 13;
    Object.assign(state.organizationRoutes.nightwatch, {
      status: 'contacted', routeStep: 'interview_passed',
      history: [{ day: 2, step: 'confidential_interview', outcome: 'passed' as const }],
    });
    const tooTired = structuredClone(state);
    expect(completeOfficialNightWatch(state)).toMatchObject({ ok: false });
    expect(state).toEqual(tooTired);

    state.stats.energy = 14;
    expect(completeOfficialNightWatch(state)).toMatchObject({ ok: true });
    expect(state.day).toBe(4);
    expect(state.organizationRoutes.nightwatch.history.at(-1)).toMatchObject({ day: 3, step: 'night_observation', outcome: 'passed' });
    expect(state.checkAttempts).toHaveLength(0);
    expect(organizationQualificationIssue(state, 'nightwatch')).toMatch(/不使用/);
  });
});
