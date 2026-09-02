import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENTS, NPCS, SEER_TRAINING_NODES, SHOP_DEFS } from './data';
import type { GameState, SeerTrainingNodeId } from './types';
import {
  acceptElliotCommission,
  allNPCs,
  getExplorationCheckPublicResult,
  getSeerTrainingNodes,
  hasSeerTrainingNode,
  isFormalNightwatchSeerStudent,
  learnSeerTrainingNode,
  loadGame,
  locateElliot,
  newGame,
  performBlankCharmTheoryPractice,
  performSeerRitualSafetyPractice,
  performSeerSpiritChannelingReview,
  practiceSeerMeditation,
  saveGame,
  travelToLocation,
} from './engine';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
}

const fresh = () => newGame('占卜家课程测试者', 'clerk', []);

function formalSeer(atBlackthorn = false): GameState {
  const state = fresh();
  state.pathwayId = 'seer';
  state.sequence = 9;
  state.day = 2;
  state.stats.energy = 100;
  state.pence = 500;
  state.items.symbol_cards = 1;
  state.items.plain_pendulum = 1;
  Object.assign(state.organizationRoutes.nightwatch, {
    status: 'committed', routeStep: 'committed', selectedPathway: 'seer',
  });
  Object.assign(state.pathwayLeads.seer, {
    organizationId: 'nightwatch', commitment: true, currentSource: 'official', routeStep: 'completed',
  });
  if (atBlackthorn) {
    state.hour = 8;
    expect(travelToLocation(state, 'blackthorn_security', 'walk')).toMatchObject({ ok: true });
  }
  return state;
}

function setLearned(state: GameState, through: SeerTrainingNodeId) {
  const index = SEER_TRAINING_NODES.findIndex(node => node.id === through);
  state.seerTraining.learnedNodeIds = SEER_TRAINING_NODES.slice(0, index + 1).map(node => node.id);
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('正式导师身份和课程定义', () => {
  it('老尼尔与老尼尔逊是严格分离的NPC，只有合格学员在黑荆棘工作时段能看见导师', () => {
    expect(NPCS.find(npc => npc.id === 'old_neil')).toMatchObject({ name: '老尼尔', identity: '黑荆棘安保公司资深文职人员' });
    expect(NPCS.find(npc => npc.id === 'nelson')).toMatchObject({ name: '老尼尔逊' });
    const state = formalSeer();
    expect(isFormalNightwatchSeerStudent(state)).toBe(true);
    expect(allNPCs(state).some(npc => npc.id === 'old_neil')).toBe(false);
    state.hour = 8;
    expect(travelToLocation(state, 'blackthorn_security', 'walk')).toMatchObject({ ok: true });
    expect(allNPCs(state).some(npc => npc.id === 'old_neil')).toBe(true);
    expect(getSeerTrainingNodes(state)).toHaveLength(7);
    state.hour = 18;
    expect(allNPCs(state).some(npc => npc.id === 'old_neil')).toBe(false);
    expect(getSeerTrainingNodes(state)).toEqual([]);
  });

  it('七节点前置、耗时和精力完全数据化，普通工具可从普通商店取得', () => {
    expect(SEER_TRAINING_NODES.map(node => node.id)).toEqual([
      'meditation_control', 'spirit_vision_focus', 'dowsing', 'spirituality_wall',
      'ritual_safety', 'spirit_channeling', 'charm_theory',
    ]);
    for (let index = 1; index < SEER_TRAINING_NODES.length; index++) {
      expect(SEER_TRAINING_NODES[index].prerequisites).toContain(SEER_TRAINING_NODES[index - 1].id);
      expect(SEER_TRAINING_NODES[index].hours).toBeGreaterThan(0);
      expect(SEER_TRAINING_NODES[index].energyCost).toBeGreaterThan(0);
    }
    const market = SHOP_DEFS.find(shop => shop.id === 'market_general_store')!;
    expect(market.inventory).toEqual(expect.arrayContaining([
      { itemId: 'ritual_chalk', price: 6 }, { itemId: 'plain_pendulum', price: 8 }, { itemId: 'blank_charm_paper', price: 3 },
    ]));
    expect(SEER_TRAINING_NODES.find(node => node.id === 'dowsing')?.requiredItemId).toBe('plain_pendulum');
  });

  it('普通人、其他组织占卜家、其他途径、序列8及错误地点均拒绝且零状态', () => {
    const ordinary = fresh();
    const otherOrganization = formalSeer();
    otherOrganization.organizationRoutes.nightwatch.status = 'unknown';
    otherOrganization.organizationRoutes.secret_order.status = 'committed';
    otherOrganization.organizationRoutes.secret_order.selectedPathway = 'seer';
    otherOrganization.pathwayLeads.seer.organizationId = 'secret_order';
    const otherPath = formalSeer();
    otherPath.pathwayId = 'sleepless';
    otherPath.organizationRoutes.nightwatch.selectedPathway = 'sleepless';
    const sequence8 = formalSeer();
    sequence8.sequence = 8;
    const wrongPlace = formalSeer();
    for (const state of [ordinary, otherOrganization, otherPath, sequence8, wrongPlace]) {
      const before = structuredClone(state);
      expect(learnSeerTrainingNode(state, 'meditation_control')).toMatchObject({ ok: false });
      expect(state).toEqual(before);
    }
  });
});

describe('课程前置、冥想与案件贡献', () => {
  it('课程严格按前置推进，冥想每日一次并形成单次可消费专注，不改变禁区状态', () => {
    const state = formalSeer(true);
    const forbidden = {
      formulas: [...state.formulas], sequence8: structuredClone(state.sequence8Progress),
      materials: Object.fromEntries(Object.entries(state.items).filter(([id]) => id.includes('characteristic'))),
    };
    const energy = state.stats.energy;
    expect(learnSeerTrainingNode(state, 'spirit_vision_focus')).toMatchObject({ ok: false });
    expect(learnSeerTrainingNode(state, 'meditation_control')).toMatchObject({ ok: true });
    expect(state.stats.energy).toBe(energy - 8);
    expect(state.hour).toBe(11);
    expect(practiceSeerMeditation(state)).toMatchObject({ ok: true });
    expect(state.seerTraining.focusPreparation).toBe(true);
    const afterPractice = structuredClone(state);
    expect(practiceSeerMeditation(state)).toMatchObject({ ok: false });
    expect(state).toEqual(afterPractice);
    expect(learnSeerTrainingNode(state, 'spirit_vision_focus')).toMatchObject({ ok: true });
    expect(learnSeerTrainingNode(state, 'dowsing')).toMatchObject({ ok: true });
    expect(state.formulas).toEqual(forbidden.formulas);
    expect(state.sequence8Progress).toEqual(forbidden.sequence8);
    expect(Object.fromEntries(Object.entries(state.items).filter(([id]) => id.includes('characteristic')))).toEqual(forbidden.materials);
  });

  it('灵摆寻人和灵视收束进入公开帮助说明但不显示内部数值，案件尝试会消费冥想专注', () => {
    const state = formalSeer(true);
    setLearned(state, 'dowsing');
    state.seerTraining.meditationPracticeDays = [state.day];
    state.seerTraining.focusPreparation = true;
    expect(acceptElliotCommission(state)).toMatchObject({ ok: true });
    const locator = getExplorationCheckPublicResult(state, 'elliot_locator_divination');
    expect(locator.helpedBy).toEqual(expect.arrayContaining(['灵摆寻人训练', '本次冥想专注']));
    expect(locator).not.toHaveProperty('score');
    expect(locator).not.toHaveProperty('difficulty');
    expect(locateElliot(state, 'divination')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(state.seerTraining.focusPreparation).toBe(false);
    expect(state.checkAttempts.at(-1)?.receipt.effects.some(effect => effect.id === 'seer_training:focus_preparation')).toBe(true);
  });
});

describe('仪式、通灵记录和空白符咒练习', () => {
  it('结构化安全练习失败有边界反馈，同指纹不能刷，相关技能变化后可完成一次', () => {
    const state = formalSeer(true);
    setLearned(state, 'ritual_safety');
    state.items.ritual_chalk = 1;
    state.stats.spi = 1;
    state.skills.occult = 0;
    const items = structuredClone(state.items);
    expect(performSeerRitualSafetyPractice(state)).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(state.log.at(-1)?.text).toMatch(/叫停|边界/);
    const blocked = structuredClone(state);
    expect(performSeerRitualSafetyPractice(state)).toMatchObject({ ok: false });
    expect(state).toEqual(blocked);
    state.stats.phy += 20;
    const unrelated = structuredClone(state);
    expect(performSeerRitualSafetyPractice(state)).toMatchObject({ ok: false });
    expect(state).toEqual(unrelated);
    state.skills.occult = 4;
    expect(performSeerRitualSafetyPractice(state)).toMatchObject({ ok: true, outcome: 'passed' });
    expect(state.seerTraining.ritualPracticeComplete).toBe(true);
    expect(state.items).toEqual(items);
    const completed = structuredClone(state);
    expect(performSeerRitualSafetyPractice(state)).toMatchObject({ ok: false });
    expect(state).toEqual(completed);
  });

  it('通灵只回溯正式案件记录，符咒只消耗普通空白纸且不制造有效物品', () => {
    const state = formalSeer(true);
    setLearned(state, 'spirit_channeling');
    state.seerTraining.ritualPracticeComplete = true;
    const noCase = structuredClone(state);
    expect(performSeerSpiritChannelingReview(state)).toMatchObject({ ok: false });
    expect(state).toEqual(noCase);
    expect(acceptElliotCommission(state)).toMatchObject({ ok: true });
    const cluesBefore = state.clues.map(clue => clue.id).sort();
    expect(performSeerSpiritChannelingReview(state)).toMatchObject({ ok: true, outcome: 'passed' });
    expect(state.seerTraining.spiritChannelingCaseIds).toEqual(['elliot_kidnapping']);
    expect(state.clues.map(clue => clue.id).sort()).toEqual(cluesBefore);
    expect(state.log.at(-1)?.text).toMatch(/委托书|记录边界/);

    state.items.blank_charm_paper = 1;
    expect(learnSeerTrainingNode(state, 'charm_theory')).toMatchObject({ ok: true });
    const formulas = [...state.formulas];
    expect(performBlankCharmTheoryPractice(state)).toMatchObject({ ok: true, outcome: 'passed' });
    expect(state.items.blank_charm_paper).toBe(0);
    expect(state.seerTraining.blankCharmPracticeComplete).toBe(true);
    expect(state.formulas).toEqual(formulas);
    expect(Object.keys(state.items).some(id => /charm/.test(id) && id !== 'blank_charm_paper')).toBe(false);
  });
});

describe('旧捷径和存档清洗', () => {
  it('sage_lesson只给来源线索，不直接写入知识或仪式标记', () => {
    const choice = EVENTS.find(event => event.id === 'secret_gathering')!.choices[0];
    expect(choice.effects).toEqual([{ k: 'money', v: -100 }, { k: 'clue', id: 'sage_lesson_boundary_note' }]);
    expect(choice.result).toMatch(/担保人.*没有到场|另行核验/);
    expect(choice.effects.some(effect => effect.k === 'knowledge' || effect.id === 'sage_lesson')).toBe(false);
  });

  it('旧档缺字段不从knowledge反推；非法节点和跳级节点按白名单清洗', () => {
    const old: Partial<GameState> = fresh();
    old.knowledge!.push('spirit_vision', 'ritual_basic');
    delete old.seerTraining;
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(old));
    expect(loadGame()!.seerTraining).toEqual({
      learnedNodeIds: [], lessonRecords: [], meditationPracticeDays: [], focusPreparation: false,
      ritualPracticeComplete: false, spiritChannelingCaseIds: [], blankCharmPracticeComplete: false,
    });

    const forged = fresh();
    forged.seerTraining.learnedNodeIds = SEER_TRAINING_NODES.map(node => node.id);
    forged.seerTraining.lessonRecords = SEER_TRAINING_NODES.map(node => ({ nodeId: node.id, day: 1, hour: 9 }));
    saveGame(forged);
    expect(loadGame()!.seerTraining.learnedNodeIds).toEqual([]);

    const skipped = formalSeer();
    skipped.day = 3;
    skipped.hour = 17;
    skipped.seerTraining.learnedNodeIds = ['meditation_control', 'dowsing'];
    skipped.seerTraining.lessonRecords = [
      { nodeId: 'meditation_control', day: 2, hour: 9 }, { nodeId: 'dowsing', day: 2, hour: 11 },
    ];
    saveGame(skipped);
    const cleaned = loadGame()!;
    expect(cleaned.seerTraining.learnedNodeIds).toEqual(['meditation_control']);
    expect(hasSeerTrainingNode(cleaned, 'dowsing')).toBe(false);
  });

  it('正式身份也不能从午夜、周日或重叠课时的伪造记录恢复课程', () => {
    const saveForged = (records: GameState['seerTraining']['lessonRecords']) => {
      const state = formalSeer();
      state.day = 9;
      state.hour = 17;
      state.seerTraining.learnedNodeIds = ['meditation_control', 'spirit_vision_focus', 'dowsing'];
      state.seerTraining.lessonRecords = records;
      state.seerTraining.meditationPracticeDays = [2];
      saveGame(state);
      return loadGame()!;
    };

    const midnight = saveForged([
      { nodeId: 'meditation_control', day: 2, hour: 0 },
      { nodeId: 'spirit_vision_focus', day: 2, hour: 2 },
      { nodeId: 'dowsing', day: 2, hour: 4 },
    ]);
    expect(midnight.seerTraining.learnedNodeIds).toEqual([]);

    const sunday = saveForged([
      { nodeId: 'meditation_control', day: 8, hour: 9 },
      { nodeId: 'spirit_vision_focus', day: 8, hour: 11 },
      { nodeId: 'dowsing', day: 8, hour: 13 },
    ]);
    expect(sunday.seerTraining.learnedNodeIds).toEqual([]);

    const overlapping = saveForged([
      { nodeId: 'meditation_control', day: 2, hour: 9 },
      { nodeId: 'spirit_vision_focus', day: 2, hour: 9 },
      { nodeId: 'dowsing', day: 2, hour: 9 },
    ]);
    expect(overlapping.seerTraining.learnedNodeIds).toEqual(['meditation_control']);
  });
});
