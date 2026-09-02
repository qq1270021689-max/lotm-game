import { beforeEach, describe, expect, it, vi } from 'vitest';
import appSource from '../App.tsx?raw';
import { getCaseJournalEntries } from './case-journal';
import { acquireClue, newGame, researchClocktowerRumors } from './engine';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
});

describe('派生案件簿', () => {
  it('新档不泄露未发现案件、线索或隐藏地点', () => {
    const state = newGame('案件簿测试者', 'clerk', []);
    const before = structuredClone(state);
    expect(getCaseJournalEntries(state)).toEqual([]);
    expect(state).toEqual(before);
  });

  it('码头案件只展示已经取得的事实与已经解锁的地点', () => {
    const state = newGame('码头记录者', 'clerk', []);
    state.intel.push('dock_missing');
    let entry = getCaseJournalEntries(state).find(candidate => candidate.id === 'dock_manifest')!;
    expect(entry.stage).toBe('rumor');
    expect(entry.facts).toEqual([]);
    expect(entry.unlockedLocations.map(location => location.locationId)).toEqual(['docks']);
    expect(JSON.stringify(entry)).not.toMatch(/运河仓库|内部难度|score|difficulty|bonus|成功率/i);

    acquireClue(state, 'dock_missing_reports');
    entry = getCaseJournalEntries(state).find(candidate => candidate.id === 'dock_manifest')!;
    expect(entry.stage).toBe('investigating');
    expect(entry.facts.map(fact => fact.clueId)).toEqual(['dock_missing_reports']);
    expect(JSON.stringify(entry)).not.toMatch(/dock_manifest_discrepancy|dock_seq9_conclusion/);

    acquireClue(state, 'dock_manifest_discrepancy');
    entry = getCaseJournalEntries(state).find(candidate => candidate.id === 'dock_manifest')!;
    expect(entry.unlockedLocations.map(location => location.locationId)).toEqual(['docks', 'canal']);
  });

  it('仅有交易会邀请历史不会凭空发现码头案件', () => {
    const state = newGame('交易会访客', 'clerk', []);
    state.organizationRoutes.iron_and_blood.history.push({
      day: state.day, step: 'trade_fair_invitation:victor', outcome: 'passed', evidenceId: 'trade_fair_invitation',
    });
    expect(getCaseJournalEntries(state).find(candidate => candidate.id === 'dock_manifest')).toBeUndefined();
  });

  it('序列9只有失踪传闻时只提示当前真实可执行的途径调查', () => {
    const state = newGame('序列9记录者', 'clerk', []);
    state.pathwayId = 'seer';
    state.sequence = 9;
    state.intel.push('dock_missing');
    state.visitedLocations.push('docks');
    state.currentLocation = {
      locationId: 'docks', arrivedDay: state.day, arrivedHour: state.hour,
      travelMode: 'walk', returnHours: 1, returnPrepaid: true,
    };
    const entry = getCaseJournalEntries(state).find(candidate => candidate.id === 'dock_manifest')!;
    expect(entry.directions.join('\n')).toMatch(/本途径.*调查|本途径现场记录/);
    expect(entry.directions.join('\n')).not.toMatch(/核对失踪登记|货运备份/);
  });

  it('钟楼从公开投诉派生事实，不展示尚未取得的维修工单', () => {
    const state = newGame('钟楼记录者', 'clerk', []);
    expect(researchClocktowerRumors(state)).toMatchObject({ ok: true });
    const entry = getCaseJournalEntries(state).find(candidate => candidate.id === 'clocktower')!;
    expect(entry.stage).toBe('rumor');
    expect(entry.facts.map(fact => fact.clueId)).toEqual(['clocktower_public_complaints']);
    expect(entry.unlockedLocations.map(location => location.locationId)).toEqual(['old_tower']);
    expect(JSON.stringify(entry)).not.toMatch(/clocktower_repair_orders|分数|加成|成功率/);
  });

  it('码头路径记录、待处置与处置完成严格分阶段', () => {
    const state = newGame('结案记录者', 'clerk', []);
    state.intel.push('dock_missing');
    acquireClue(state, 'dock_seq9_hunter_tracks', 'location', 'dock_seq9_hunter');
    let entry = getCaseJournalEntries(state).find(candidate => candidate.id === 'dock_manifest')!;
    expect(entry.stage).toBe('pathway_inquiry');
    expect(entry.milestone).toBeUndefined();

    acquireClue(state, 'dock_seq9_conclusion', 'location', 'dock_seq9_resolution_hunter');
    entry = getCaseJournalEntries(state).find(candidate => candidate.id === 'dock_manifest')!;
    expect(entry.stage).toBe('resolution_ready');
    expect(entry.milestone).toBeUndefined();
    expect(entry.statusLabel).toMatch(/等待/);

    acquireClue(state, 'dock_disposition_public_report', 'location', 'docks');
    entry = getCaseJournalEntries(state).find(candidate => candidate.id === 'dock_manifest')!;
    expect(entry.stage).toBe('concluded');
    expect(entry.milestone).toBe('廷根第一章·案件样板完成');
    expect(entry.chapterReport).toMatchObject({ dispositionLabel: '递交公开港务报告', unknowns: expect.stringMatching(/仍未查明/) });
    expect(entry.chapterReport?.evidenceCount).toBeGreaterThan(0);
    expect(JSON.stringify(entry.chapterReport)).not.toMatch(/secret|difficulty|score|bonus|组织成员|幕后者是/i);
  });

  it('仅有猎犬转介不提示官方移交，正式值夜者接触后才显示方向', () => {
    const state = newGame('转介边界测试者', 'clerk', []);
    state.intel.push('dock_missing');
    acquireClue(state, 'dock_seq9_conclusion', 'location', 'dock_seq9_synthesis_seer');
    acquireClue(state, 'blackthorn_referral');
    state.organizationRoutes.nightwatch.history.push({
      day: state.day, step: 'hound_security_referral', outcome: 'passed', evidenceId: 'blackthorn_referral',
    });
    let entry = getCaseJournalEntries(state).find(candidate => candidate.id === 'dock_manifest')!;
    expect(entry.stage).toBe('resolution_ready');
    expect(entry.directions.join('\n')).not.toMatch(/安保|官方移交|黑荆棘/);

    state.organizationRoutes.nightwatch.status = 'contacted';
    entry = getCaseJournalEntries(state).find(candidate => candidate.id === 'dock_manifest')!;
    expect(entry.directions.join('\n')).toMatch(/正式接触.*安保人员/);
  });

  it('俱乐部委托只展示当前咨询的真实事实，并按外勤和结论分阶段', () => {
    const state = newGame('俱乐部记录者', 'clerk', []);
    state.pathwayId = 'seer';
    state.sequence = 9;
    state.divinationClub.joined = true;
    state.divinationClub.activeCommissionId = 'journey_omen';
    acquireClue(state, 'club_journey_statement', 'npc', 'club_client_owen');
    acquireClue(state, 'club_lost_keepsake_brief', 'npc', 'club_client_lena');

    let entry = getCaseJournalEntries(state).find(candidate => candidate.id === 'divination_club')!;
    expect(entry.stage).toBe('commissioned');
    expect(entry.facts.map(fact => fact.clueId)).toEqual(['club_journey_statement']);
    expect(entry.unlockedLocations.map(location => location.locationId)).toContain('river_sea_church');
    expect(entry.directions.join('\n')).toMatch(/河与海教堂|核对河运公告/);
    expect(JSON.stringify(entry)).not.toMatch(/反复出现的噩梦|幕后者是|地址是/);

    acquireClue(state, 'club_journey_public_notice', 'location', 'river_sea_church');
    entry = getCaseJournalEntries(state).find(candidate => candidate.id === 'divination_club')!;
    expect(entry.stage).toBe('resolution_ready');
    expect(entry.directions.join('\n')).toMatch(/返回占卜家俱乐部|有限结论/);

    acquireClue(state, 'club_journey_omen_outcome', 'npc', 'club_client_owen');
    state.divinationClub.completedCommissionIds.push('journey_omen');
    state.divinationClub.activeCommissionId = null;
    entry = getCaseJournalEntries(state).find(candidate => candidate.id === 'divination_club')!;
    expect(entry.stage).toBe('concluded');
    expect(entry.statusLabel).toMatch(/欧文先生.*签收.*结清/);
  });

  it('App 使用稳定案件簿入口和纯 selector', () => {
    expect(appSource).toContain('getCaseJournalEntries(state)');
    expect(appSource).toContain('data-case-journal');
    expect(appSource).toContain('案件簿');
  });
});
