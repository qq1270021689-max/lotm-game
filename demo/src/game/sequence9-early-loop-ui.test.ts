import { beforeEach, describe, expect, it, vi } from 'vitest';
import appSource from '../App.tsx?raw';
import { getCaseJournalEntries } from './case-journal';
import type { GameState } from './types';
import {
  acceptElliotCommission,
  isLocationUnlocked,
  leaveCurrentLocation,
  locateElliot,
  newGame,
  travelToLocation,
} from './engine';

function nightwatchSeer(): GameState {
  const state = newGame('界面流程测试者', 'clerk', []);
  state.pathwayId = 'seer';
  state.sequence = 9;
  state.stats.mnd = 60;
  state.stats.energy = 100;
  Object.assign(state.organizationRoutes.nightwatch, {
    status: 'committed', routeStep: 'committed', selectedPathway: 'seer',
  });
  Object.assign(state.pathwayLeads.seer, {
    organizationId: 'nightwatch', commitment: true, currentSource: 'official', routeStep: 'completed',
  });
  return state;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
});

describe('序列9早期循环界面接入', () => {
  it('复用地点面板接入轮值、俱乐部与艾略特案的完整行动入口', () => {
    expect(appSource).toContain('data-nightwatch-routine');
    expect(appSource).toContain('data-divination-club-loop');
    expect(appSource).toContain('data-divination-club-fieldwork');
    expect(appSource).toContain('data-elliot-case-office');
    expect(appSource).toContain('data-elliot-case-field');
    expect(appSource).toContain('performNightwatchRoutine');
    expect(appSource).toContain('resolveDivinationClubCommission');
    expect(appSource).toContain('investigateActiveDivinationClubCommissionIssue');
    expect(appSource).toContain('investigateActiveDivinationClubCommission');
    expect(appSource).toContain('fieldComplete');
    expect(appSource).toContain('settleElliotCase');
  });

  it('案件簿只在实名接案后出现，并随已取得的地址更新下一步', () => {
    const state = nightwatchSeer();
    state.hour = 8;
    expect(getCaseJournalEntries(state).some(entry => entry.id === 'elliot_kidnapping')).toBe(false);
    expect(isLocationUnlocked(state, 'forston_hideout')).toBe(false);

    expect(travelToLocation(state, 'blackthorn_security', 'walk')).toMatchObject({ ok: true });
    expect(acceptElliotCommission(state)).toMatchObject({ ok: true });
    const commissioned = getCaseJournalEntries(state).find(entry => entry.id === 'elliot_kidnapping')!;
    expect(commissioned.stage).toBe('commissioned');
    expect(commissioned.facts.map(fact => fact.clueId)).toEqual(expect.arrayContaining([
      'elliot_commission_brief', 'elliot_worn_coat', 'elliot_partner_assignment',
    ]));
    expect(commissioned.directions.join('')).toMatch(/旧外套|公开记录/);

    expect(locateElliot(state, 'records')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(isLocationUnlocked(state, 'forston_hideout')).toBe(true);
    const located = getCaseJournalEntries(state).find(entry => entry.id === 'elliot_kidnapping')!;
    expect(located.stage).toBe('location_known');
    expect(located.unlockedLocations.map(location => location.locationId)).toContain('forston_hideout');
    expect(located.directions.join('')).toMatch(/现场|弗尔斯顿路/);
    expect(leaveCurrentLocation(state)).toMatchObject({ ok: true });
  });
});
