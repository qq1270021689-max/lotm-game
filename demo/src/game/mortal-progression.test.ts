import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameState } from './types';
import { EVENTS, PATHWAYS, SPECIAL_BEINGS } from './data';
import {
  CURRENT_SCHEMA_VERSION,
  acceptOfficialOffer,
  applyEffects,
  attendOfficialInterview,
  buyItem,
  canDrink,
  compareClocktowerRepairRecords,
  completeOfficialNightWatch,
  confirmOfficialCommitment,
  declineOfficialOffer,
  doStudy,
  drinkOfficialDose,
  loadGame,
  newGame,
  reportAnomalyToEvelyn,
  researchClocktowerRumors,
  requestOfficialScreening,
  saveGame,
  traceClocktowerAnomaly,
  undergoOfficialStabilization,
} from './engine';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
}

const fresh = () => newGame('凡人测试者', 'clerk', []);

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('凡人知识边界', () => {
  it('无目标学习100次保持零状态且不会产生知识、配方或非凡能力', () => {
    const s = fresh();
    s.items.occult_notes = 1;
    const before = structuredClone(s);
    for (let i = 0; i < 100; i++) {
      s.stats.energy = 100;
      expect(doStudy(s).ok).toBe(false);
    }

    expect(s.pathwayId).toBeNull();
    expect(s.sequence).toBeNull();
    expect(s.formulas).toEqual([]);
    expect(s.knowledge).not.toContain('spirit_vision');
    expect(s.knowledge).not.toContain('ritual_basic');
    expect(s.knowledge).not.toContain('potion_brew');
    expect(s.knowledge).not.toContain('occult_theory');
    expect(s.hour).toBe(before.hour);
    expect(s.studyProgress).toBe(before.studyProgress);
  });

  it('random9 与密文残页学习不再生成随机配方', () => {
    const s = fresh();
    const receipt = applyEffects(s, [{ k: 'formula', id: 'random9' }])[0];
    expect(receipt.applied).toBe(false);
    s.items.cryptic_note = 1;
    s.studyProgress = 5;
    s.stats.energy = 100;
    doStudy(s);
    expect(s.formulas).toEqual([]);
    expect(s.items.cryptic_note).toBe(1);
  });

  it('旧的无目标学习事件已从事件池移除', () => {
    expect(EVENTS.find(event => event.id === 'study_forbidden')).toBeUndefined();
    expect(EVENTS.find(event => event.id === 'study_insight')).toBeUndefined();
    const grayFog = SPECIAL_BEINGS.find(being => being.id === 'gray_fog')!;
    expect(grayFog.desc).not.toContain('宫殿');
    expect(grayFog.desc).toContain('没有可靠证据');
  });

  it('配方和材料齐全但 lead 未验证或准备方式未解锁时默认拒绝自酿', () => {
    const s = fresh();
    s.formulas.push('seer9');
    s.items.star_crystal = 1;
    s.items.octopus_blood = 1;
    Object.assign(s.organizationRoutes.secret_order, { status: 'committed', routeStep: 'committed', selectedPathway: 'seer' });
    Object.assign(s.pathwayLeads.seer, { organizationId: 'secret_order', commitment: true });

    expect(canDrink(s, 'seer')).toMatchObject({ ok: false });
    expect(canDrink(s, 'seer').missing.join('')).toContain('验证');
    s.pathwayLeads.seer.formulaStatus = 'verified';
    expect(canDrink(s, 'seer').missing.join('')).toContain('准备方式');
    s.pathwayLeads.seer.preparationMode = 'self_brew';
    expect(canDrink(s, 'seer').missing.join('')).toContain('可信训练');
  });

  it('公式效果不会创建已验证状态，普通人也无法购买黑市神秘货架', () => {
    const s = fresh();
    s.pence = 1000;
    applyEffects(s, [{ k: 'formula', id: 'seer9' }]);
    expect(s.formulas).toContain('seer9');
    expect(s.pathwayLeads.seer.formulaStatus).toBe('unverified');
    expect(canDrink(s, 'seer').ok).toBe(false);

    const beforeMoney = s.pence;
    for (const itemId of new Set(PATHWAYS.flatMap(pathway => [...pathway.seq9.materials, ...pathway.seq8.materials]))) {
      expect(buyItem(s, itemId, 1, 'victor'), itemId).toMatchObject({ ok: false });
    }
    expect(buyItem(s, 'occult_notes', 60, 'victor')).toMatchObject({ ok: false });
    expect(s.pence).toBe(beforeMoney);
    expect(s.items.star_crystal ?? 0).toBe(0);
    expect(s.items.occult_notes ?? 0).toBe(0);
  });
});

describe('官方不眠者纵向路线', () => {
  it('可从普通人确定性完成目击、审查、二次确认与监督服药', () => {
    const s = fresh();

    expect(traceClocktowerAnomaly(s).ok).toBe(false);
    expect(researchClocktowerRumors(s).ok).toBe(true);
    expect(s.awareness).toBe('ordinary');
    expect(s.organizationRoutes.nightwatch.routeStep).toBe('public_rumor');
    expect(traceClocktowerAnomaly(s).ok).toBe(false);
    expect(compareClocktowerRepairRecords(s).ok).toBe(true);
    s.hour = 22;
    expect(traceClocktowerAnomaly(s).ok).toBe(true);
    expect(s.awareness).toBe('witness');
    expect(s.items.anomaly_evidence).toBe(1);

    expect(reportAnomalyToEvelyn(s).ok).toBe(false);
    s.hour = 9;
    expect(reportAnomalyToEvelyn(s).ok).toBe(true);
    expect(s.awareness).toBe('informed');
    expect(s.organizationRoutes.nightwatch.routeStep).toBe('reported');

    expect(requestOfficialScreening(s).ok).toBe(true);
    expect(attendOfficialInterview(s).ok).toBe(false);
    s.day += 1;
    s.hour = 9;
    expect(attendOfficialInterview(s).ok).toBe(true);
    s.hour = 18;
    s.stats.energy = 100;
    expect(completeOfficialNightWatch(s).ok).toBe(false);
    s.day += 1;
    s.hour = 18;
    s.stats.energy = 100;
    expect(completeOfficialNightWatch(s).ok).toBe(true);

    expect(acceptOfficialOffer(s).ok).toBe(false);
    s.day += 1;
    s.hour = 9;
    expect(acceptOfficialOffer(s).ok).toBe(true);
    expect(s.pathwayLeads.sleepless.commitment).toBe(false);
    expect(s.organizationRoutes.nightwatch.status).toBe('member');

    expect(confirmOfficialCommitment(s).ok).toBe(true);
    expect(s.pathwayLeads.sleepless).toMatchObject({
      currentSource: 'official', commitment: true, preparationMode: 'official_dose', routeStep: 'dose_ready',
    });
    expect(s.formulas).toEqual([]);
    expect(canDrink(s, 'sleepless')).toMatchObject({ ok: true, mode: 'official_dose' });

    expect(drinkOfficialDose(s).ok).toBe(true);
    expect(s.pathwayId).toBe('sleepless');
    expect(s.sequence).toBe(9);
    expect(s.pathwayLeads.sleepless.routeStep).toBe('completed');
    expect(s.tags).toContain('night_watcher');
    expect(s.formulas).toEqual([]);
  });

  it('不眠者官方资格不能串用到另一途径', () => {
    const s = fresh();
    s.awareness = 'informed';
    Object.assign(s.pathwayLeads.sleepless, {
      currentSource: 'official', organizationId: 'nightwatch', routeStep: 'dose_ready', commitment: true, preparationMode: 'official_dose',
    });
    Object.assign(s.organizationRoutes.nightwatch, { status: 'committed', routeStep: 'committed', selectedPathway: 'sleepless' });
    s.formulas.push('seer9');
    s.items.star_crystal = 1;
    s.items.octopus_blood = 1;

    expect(canDrink(s, 'sleepless')).toMatchObject({ ok: true, mode: 'official_dose' });
    expect(canDrink(s, 'seer')).toMatchObject({ ok: false });
    expect(canDrink(s, 'seer').missing.join('')).toContain('不眠者');
  });

  it('官方成品魔药必须在观察勤务完成后的下一办理日服用', () => {
    const s = fresh();
    s.awareness = 'informed';
    s.day = 4;
    s.hour = 9;
    Object.assign(s.pathwayLeads.sleepless, {
      currentSource: 'official', organizationId: 'nightwatch', routeStep: 'dose_ready', commitment: true, preparationMode: 'official_dose',
    });
    Object.assign(s.organizationRoutes.nightwatch, {
      status: 'committed', routeStep: 'committed', selectedPathway: 'sleepless',
      history: [{ day: 4, step: 'night_observation', outcome: 'passed' as const }],
    });

    expect(drinkOfficialDose(s).ok).toBe(false);
    expect(s.pathwayId).toBeNull();
    s.day = 5;
    expect(drinkOfficialDose(s).ok).toBe(true);
    expect(s.pathwayId).toBe('sleepless');
  });

  it('污染超标可跨日逐档稳定，并继续完整路线及真实跨午夜勤', () => {
    const s = fresh();
    expect(researchClocktowerRumors(s).ok).toBe(true);
    expect(compareClocktowerRepairRecords(s).ok).toBe(true);
    s.hour = 22;
    expect(traceClocktowerAnomaly(s).ok).toBe(true);
    expect(s.day).toBe(2);
    expect(s.hour).toBe(1);
    s.hour = 9;
    expect(reportAnomalyToEvelyn(s).ok).toBe(true);

    s.stats.cor = 40;
    expect(requestOfficialScreening(s).ok).toBe(false);
    expect(undergoOfficialStabilization(s).ok).toBe(true);
    expect(s.stats.cor).toBe(28);
    expect(undergoOfficialStabilization(s).ok).toBe(false);

    s.day += 1;
    s.hour = 9;
    s.stats.energy = 100;
    expect(undergoOfficialStabilization(s).ok).toBe(true);
    expect(s.stats.cor).toBe(16);
    s.day += 1;
    s.hour = 9;
    s.stats.energy = 100;
    expect(undergoOfficialStabilization(s).ok).toBe(true);
    expect(s.stats.cor).toBe(4);
    expect(requestOfficialScreening(s).ok).toBe(true);

    s.day += 1;
    s.hour = 9;
    s.stats.energy = 100;
    expect(attendOfficialInterview(s).ok).toBe(true);
    s.day += 1;
    s.hour = 22;
    s.stats.energy = 100;
    expect(completeOfficialNightWatch(s).ok).toBe(true);
    expect(s.hour).toBe(2);
    const completionDay = s.day;
    expect(s.organizationRoutes.nightwatch.history.at(-1)).toMatchObject({ step: 'night_observation', day: completionDay });

    expect(acceptOfficialOffer(s).ok).toBe(false);
    s.hour = 9;
    expect(acceptOfficialOffer(s).ok).toBe(true);
    expect(confirmOfficialCommitment(s).ok).toBe(true);
    expect(drinkOfficialDose(s).ok).toBe(false);
    s.day += 1;
    s.hour = 9;
    expect(drinkOfficialDose(s).ok).toBe(true);
    expect(s).toMatchObject({ pathwayId: 'sleepless', sequence: 9 });
  });

  it('拒绝官方报价同样只能在9:00至17:00办理', () => {
    const s = fresh();
    s.awareness = 'informed';
    s.hour = 2;
    Object.assign(s.organizationRoutes.nightwatch, { status: 'qualified', routeStep: 'offer_pending' });
    expect(declineOfficialOffer(s).ok).toBe(false);
    expect(s.organizationRoutes.nightwatch.routeStep).toBe('offer_pending');
    s.hour = 9;
    expect(declineOfficialOffer(s).ok).toBe(true);
    expect(s.organizationRoutes.nightwatch.routeStep).toBe('declined');
  });
});

describe('v7 存档迁移', () => {
  it('旧凡人能力与配方降级，删除捷径待决事件', () => {
    const old = fresh();
    old.knowledge.push('spirit_vision', 'ritual_basic', 'potion_brew');
    old.formulas.push('seer9');
    old.items.star_crystal = 1;
    old.items.octopus_blood = 1;
    old.pendingEvent = 'ambient_item_occult_notes';
    const legacy = { ...old } as Partial<GameState>;
    delete legacy.schemaVersion;
    delete legacy.awareness;
    delete legacy.pathwayLeads;
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(legacy));

    const loaded = loadGame();

    expect(loaded?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(loaded?.awareness).toBe('ordinary');
    expect(loaded?.knowledge).not.toContain('spirit_vision');
    expect(loaded?.knowledge).not.toContain('ritual_basic');
    expect(loaded?.knowledge).not.toContain('potion_brew');
    expect(loaded?.knowledge).toEqual(expect.arrayContaining(['occult_theory', 'spirit_vision_theory']));
    expect(loaded?.pathwayLeads.seer).toMatchObject({ currentSource: 'legacy', formulaStatus: 'unverified', routeStep: 'legacy_formula' });
    expect(loaded?.pendingEvent).toBeNull();
    expect(loaded && canDrink(loaded, 'seer')).toMatchObject({ ok: false });
  });

  it('旧非凡者保持途径与序列，迁移后保存读取幂等', () => {
    const old = fresh();
    old.pathwayId = 'seer';
    old.sequence = 9;
    old.formulas.push('seer9');
    const legacy = { ...old } as Partial<GameState>;
    delete legacy.schemaVersion;
    delete legacy.awareness;
    delete legacy.pathwayLeads;
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(legacy));

    const first = loadGame();
    expect(first).toMatchObject({ pathwayId: 'seer', sequence: 9, awareness: 'informed', schemaVersion: CURRENT_SCHEMA_VERSION });
    saveGame(first!);
    const second = loadGame();
    expect(second).toEqual(first);
  });
});
