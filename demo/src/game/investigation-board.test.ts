import { beforeEach, describe, expect, it, vi } from 'vitest';
import appSource from '../App.tsx?raw';
import {
  acquireClue,
  getExplorationCheckPublicResult,
  getInvestigationBoardView,
  investigationHypothesisMethodIssue,
  loadGame,
  newGame,
  saveGame,
  testInvestigationHypothesis,
  toggleInvestigationEvidence,
} from './engine';
import type { GameState } from './types';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
}

const fresh = () => {
  const state = newGame('调查板测试者', 'clerk', []);
  state.stats.energy = 100;
  return state;
};

const addTransferEvidence = (state: GameState) => {
  acquireClue(state, 'dock_missing_reports');
  acquireClue(state, 'dock_manifest_discrepancy');
  toggleInvestigationEvidence(state, 'dock_manifest', 'dock_missing_reports');
  toggleInvestigationEvidence(state, 'dock_manifest', 'dock_manifest_discrepancy');
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('v32 码头调查板', () => {
  it('只允许选择已取得的案件证据，一次最多三项', () => {
    const state = fresh();
    expect(toggleInvestigationEvidence(state, 'dock_manifest', 'dock_missing_reports')).toMatchObject({ ok: false });
    for (const id of ['dock_missing_reports', 'dock_manifest_discrepancy', 'dock_crate_trace', 'dock_marked_manifest']) {
      acquireClue(state, id);
    }
    for (const id of ['dock_missing_reports', 'dock_manifest_discrepancy', 'dock_crate_trace']) {
      expect(toggleInvestigationEvidence(state, 'dock_manifest', id)).toMatchObject({ ok: true });
    }
    expect(toggleInvestigationEvidence(state, 'dock_manifest', 'dock_marked_manifest')).toMatchObject({ ok: false });
    expect(getInvestigationBoardView(state)?.selectedCount).toBe(3);
    expect(toggleInvestigationEvidence(state, 'dock_manifest', 'dock_crate_trace')).toMatchObject({ ok: true });
    expect(toggleInvestigationEvidence(state, 'dock_manifest', 'dock_marked_manifest')).toMatchObject({ ok: true });
  });

  it('不会提前展示尚无证据基础的假设，所选证据决定哪项假设可验证', () => {
    const state = fresh();
    acquireClue(state, 'dock_missing_reports');
    expect(getInvestigationBoardView(state)?.hypotheses).toEqual([]);
    acquireClue(state, 'dock_manifest_discrepancy');
    expect(getInvestigationBoardView(state)?.hypotheses[0]).toMatchObject({ id: 'dock_transfer_window', ready: false });
    toggleInvestigationEvidence(state, 'dock_manifest', 'dock_missing_reports');
    expect(getInvestigationBoardView(state)?.hypotheses[0].ready).toBe(false);
    toggleInvestigationEvidence(state, 'dock_manifest', 'dock_manifest_discrepancy');
    expect(getInvestigationBoardView(state)?.hypotheses[0].ready).toBe(true);
  });

  it('相同属性、技能、证据与方法产生确定结果，并提供四档而不暴露数值', () => {
    const cases = [
      { mind: 10, expected: '没理出头绪' },
      { mind: 20, expected: '有些说得通' },
      { mind: 24, expected: '几处能够对上' },
      { mind: 34, expected: '多处彼此印证' },
    ];
    for (const sample of cases) {
      const state = fresh();
      state.stats.mnd = sample.mind;
      addTransferEvidence(state);
      expect(testInvestigationHypothesis(state, 'dock_transfer_window', 'compare_records')).toMatchObject({ ok: true });
      const latest = getInvestigationBoardView(state)?.hypotheses[0].methods
        .find(method => method.id === 'compare_records')?.latest;
      expect(latest?.label).toBe(sample.expected);
      expect(JSON.stringify(latest)).not.toMatch(/score|difficulty|\b38\b/);
    }
  });

  it('验证方法受地点、人脉和能力约束，相同条件不能反复刷结果', () => {
    const state = fresh();
    addTransferEvidence(state);
    expect(investigationHypothesisMethodIssue(state, 'dock_transfer_window', 'interview_witness')).toContain('醉水手');
    expect(testInvestigationHypothesis(state, 'dock_transfer_window', 'compare_records')).toMatchObject({ ok: true });
    expect(investigationHypothesisMethodIssue(state, 'dock_transfer_window', 'compare_records')).toContain('已经这样查过一次');

    const occult = fresh();
    acquireClue(occult, 'dock_crate_trace');
    acquireClue(occult, 'dock_scale_transfer_omen');
    toggleInvestigationEvidence(occult, 'dock_manifest', 'dock_crate_trace');
    toggleInvestigationEvidence(occult, 'dock_manifest', 'dock_scale_transfer_omen');
    expect(investigationHypothesisMethodIssue(occult, 'dock_occult_interference', 'occult_verify')).toContain('灵视能力');
  });

  it('可靠假设成为后续检定准备，不会直接授予新线索或幕后答案', () => {
    const state = fresh();
    state.stats.mnd = 24;
    addTransferEvidence(state);
    const clueCount = state.clues.length;
    testInvestigationHypothesis(state, 'dock_transfer_window', 'compare_records');
    expect(state.clues).toHaveLength(clueCount);
    state.currentLocation = {
      locationId: 'docks', arrivedDay: state.day, arrivedHour: state.hour,
      travelMode: 'walk', returnHours: 1, returnPrepaid: true,
    };
    const publicResult = getExplorationCheckPublicResult(state, 'deep_check_dock_missing_reports');
    expect(publicResult).toMatchObject({ outcome: 'passed' });
    expect(publicResult.helpedBy).toContain('已经对上的交接时间');
    expect(JSON.stringify(getInvestigationBoardView(state))).not.toContain('dock_manifest_cleaner');
  });

  it('v31旧档初始化空调查板；v32只保留有权威检定回执的结论并保持幂等', () => {
    const legacy = fresh();
    legacy.schemaVersion = 31;
    delete (legacy as Partial<GameState>).investigationWorkspaces;
    saveGame(legacy);
    expect(loadGame()).toMatchObject({ schemaVersion: 32, investigationWorkspaces: {} });

    const forged = fresh();
    addTransferEvidence(forged);
    forged.investigationWorkspaces.dock_manifest.assessments.push({
      hypothesisId: 'dock_transfer_window', methodId: 'compare_records',
      clueIds: ['dock_manifest_discrepancy', 'dock_missing_reports'], outcome: 'strong',
      attemptId: 'forged', day: 1, hour: 7,
    });
    saveGame(forged);
    expect(loadGame()!.investigationWorkspaces.dock_manifest.assessments).toEqual([]);

    const valid = fresh();
    valid.stats.mnd = 24;
    addTransferEvidence(valid);
    testInvestigationHypothesis(valid, 'dock_transfer_window', 'compare_records');
    saveGame(valid);
    const first = loadGame()!;
    expect(first.investigationWorkspaces.dock_manifest.assessments[0]).toMatchObject({ outcome: 'reliable' });
    saveGame(first);
    expect(loadGame()).toEqual(first);
  });

  it('界面以证据、假设和验证方法组织调查，不显示内部难度与分数', () => {
    expect(appSource).toContain('data-investigation-board');
    expect(appSource).toContain('摊开的材料');
    expect(appSource).toContain('眼下的推测');
    expect(appSource).toContain('梳理所得：');
    expect(appSource).not.toContain('method.score');
    expect(appSource).not.toContain('method.difficulty');
  });
});
