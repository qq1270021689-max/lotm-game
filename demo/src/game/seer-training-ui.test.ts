import { describe, expect, it } from 'vitest';
import appSource from '../App.tsx?raw';

describe('占卜家正式课程界面', () => {
  it('只在黑荆棘展示下一课，并接通课程与四类记录练习', () => {
    expect(appSource).toContain('data-seer-training-tree');
    expect(appSource).toContain('data-seer-next-lesson');
    expect(appSource).toContain("SEER_TRAINING_NODES.find(node => !state.seerTraining.learnedNodeIds.includes(node.id))");
    expect(appSource).toContain('E.learnSeerTrainingNode');
    expect(appSource).toContain('E.practiceSeerMeditation');
    expect(appSource).toContain('E.performSeerRitualSafetyPractice');
    expect(appSource).toContain('E.performSeerSpiritChannelingReview');
    expect(appSource).toContain('E.performBlankCharmTheoryPractice');
    expect(appSource).toContain('E.seerRitualSafetyPracticeIssue');
    expect(appSource).toContain('E.seerSpiritChannelingReviewIssue');
    expect(appSource).toContain('E.blankCharmTheoryPracticeIssue');
  });

  it('人物面板只列已学课程，家中提供受控冥想入口', () => {
    expect(appSource).toContain('data-seer-training-record');
    expect(appSource).toContain('data-seer-home-practice');
    expect(appSource).toContain("SEER_TRAINING_NODES.filter(node => state.seerTraining.learnedNodeIds.includes(node.id))");
  });

  it('新增课程叙事不展示规则层免责声明', () => {
    expect(appSource).not.toMatch(/课程没有发放|没有制成符咒|没有获得战斗效果/);
  });
});
