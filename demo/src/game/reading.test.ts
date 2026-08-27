import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameState } from './types';
import { BOOK_DEFS } from './data';
import {
  acquireBook,
  acquireBookIssue,
  acquireClue,
  canReadLanguage,
  completeBook,
  doAdventure,
  doStudy,
  evaluateBookCheck,
  evaluateExplorationCheck,
  getBookSourceOffers,
  leaveCurrentLocation,
  loadGame,
  newGame,
  performTingenLandmarkAction,
  readBookSession,
  readingIssue,
  saveGame,
  travelToLocation,
} from './engine';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
}

const fresh = (origin = 'clerk', talents: string[] = []) => newGame('阅读测试者', origin, talents);
const nelsonReady = () => {
  const s = fresh(); s.day = 2; s.hour = 10; s.relations.nelson = 45; s.pence = 500; s.stats.energy = 100;
  return s;
};

function finish(s: GameState, bookId: string) {
  const def = BOOK_DEFS.find(book => book.id === bookId)!;
  s.books[bookId].acquired = true;
  s.books[bookId].readHours = def.totalHours;
  return completeBook(s, bookId);
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('固定书源与独立阅读', () => {
  it('无书的无目标学习零状态拒绝且不触发随机学习事件', () => {
    const s = fresh();
    const before = structuredClone(s);
    expect(doStudy(s)).toMatchObject({ ok: false });
    expect(s).toEqual(before);
    expect(s.pendingEvent).toBeNull();
  });

  it('新档在家和市集不泄露书源，取得城市目录并抵达市政图书馆后才看见市政手册', () => {
    const s = fresh();
    expect(getBookSourceOffers(s).map(offer => offer.bookId)).toEqual([]);
    const before = structuredClone(s);
    expect(acquireBook(s, 'manor_guest_registry_book')).toEqual(acquireBook(s, 'not_a_book'));
    expect(s).toEqual(before);
    expect(travelToLocation(s, 'market', 'walk').ok).toBe(true);
    expect(getBookSourceOffers(s).map(offer => offer.bookId)).toEqual([]);
    expect(performTingenLandmarkAction(s, 'market_city_directory').ok).toBe(true);
    expect(leaveCurrentLocation(s).ok).toBe(true);
    expect(travelToLocation(s, 'municipal_library', 'walk').ok).toBe(true);
    expect(getBookSourceOffers(s).map(offer => offer.bookId)).toEqual(['municipal_archive_manual']);
    expect(leaveCurrentLocation(s).ok).toBe(true);

    const docker = fresh('docker'); docker.hour = 10; docker.stats.energy = 100;
    expect(getBookSourceOffers(docker).map(offer => offer.bookId)).not.toContain('dock_manifest_manual');
    expect(doAdventure(docker, 'docks').ok).toBe(true);
    expect(travelToLocation(docker, 'docks', 'walk').ok).toBe(true);
    expect(getBookSourceOffers(docker).map(offer => offer.bookId)).toContain('dock_manifest_manual');
  });

  it('删节札记在异常准入前不向可信且在场的尼尔逊熟人泄露', () => {
    const s = nelsonReady();
    expect(getBookSourceOffers(s).map(offer => offer.bookId)).not.toContain('abridged_occult_notes');
    expect(acquireBook(s, 'abridged_occult_notes')).toMatchObject({ ok: false });

    s.flags.met_beyonder = 1;
    expect(getBookSourceOffers(s).map(offer => offer.bookId)).toContain('abridged_occult_notes');
    expect(acquireBook(s, 'abridged_occult_notes')).toMatchObject({ ok: true });
  });

  it('每本书保持独立进度，quick_wit只对成功阅读多计一小时且不溢出', () => {
    const s = fresh('clerk', ['quick_wit']); s.stats.energy = 100;
    acquireClue(s, 'tingen_city_directory');
    expect(travelToLocation(s, 'municipal_library', 'walk').ok).toBe(true);
    expect(acquireBook(s, 'municipal_archive_manual').ok).toBe(true);
    expect(leaveCurrentLocation(s).ok).toBe(true);
    expect(readBookSession(s, 'municipal_archive_manual').ok).toBe(true);
    expect(s.books.municipal_archive_manual.readHours).toBe(3);
    expect(s.books.church_festivals_excerpt.readHours).toBe(0);
    s.stats.energy = 100;
    expect(readBookSession(s, 'municipal_archive_manual').ok).toBe(true);
    expect(s.books.municipal_archive_manual).toMatchObject({ readHours: 4, completed: true });
    expect(s.knowledge).toContain('archive_method');
    expect(s.skills.investigate).toBe(1);
    expect(readBookSession(s, 'municipal_archive_manual').ok).toBe(false);
    expect(s.skills.investigate).toBe(1);
  });

  it('语言与硬技能不足零消耗；合法复杂章节失败耗时但不推进', () => {
    const language = fresh(); language.books.manor_guest_registry_book.acquired = true;
    const beforeLanguage = structuredClone(language);
    expect(readBookSession(language, 'manor_guest_registry_book').ok).toBe(false);
    expect(language).toEqual(beforeLanguage);

    const dock = fresh(); dock.books.dock_manifest_manual.acquired = true;
    const beforeSkill = structuredClone(dock);
    expect(readBookSession(dock, 'dock_manifest_manual').ok).toBe(false);
    expect(dock).toEqual(beforeSkill);

    dock.skills.investigate = 1; dock.stats.energy = 100;
    const hour = dock.hour; const energy = dock.stats.energy;
    expect(readBookSession(dock, 'dock_manifest_manual')).toMatchObject({ ok: true, outcome: 'blocked' });
    expect(dock.hour).toBe(hour + 1);
    expect(dock.stats.energy).toBeLessThan(energy);
    expect(dock.books.dock_manifest_manual).toMatchObject({ readHours: 0, failedAttempts: 1 });
  });

  it('复杂章节检定100次确定一致，相关线索能够帮助理解', () => {
    const s = fresh(); s.books.dock_manifest_manual.acquired = true; s.skills.investigate = 1;
    const base = evaluateBookCheck(s, 'dock_manifest_manual');
    for (let i = 0; i < 100; i++) expect(evaluateBookCheck(s, 'dock_manifest_manual')).toEqual(base);
    acquireClue(s, 'dock_missing_reports', 'public_records', 'test');
    expect(evaluateBookCheck(s, 'dock_manifest_manual').score).toBeGreaterThan(base.score);
  });
});

describe('六本书的奖励边界', () => {
  it('旧弗萨克语入门开启庄园名册链，名册完成产出线索并排入一次性旧事事件', () => {
    const s = nelsonReady(); s.stats.mnd = 25;
    expect(acquireBook(s, 'old_feysac_primer').ok).toBe(true);
    expect(finish(s, 'old_feysac_primer')).toBe(true);
    expect(canReadLanguage(s, 'old_feysac')).toBe(true);

    acquireClue(s, 'manor_address', 'npc', 'nelson');
    s.visitedLocations.push('manor'); s.skills.investigate = 2; s.stats.energy = 100;
    expect(travelToLocation(s, 'manor', 'walk').ok).toBe(true);
    expect(getBookSourceOffers(s).map(offer => offer.bookId)).toContain('manor_guest_registry_book');
    expect(acquireBook(s, 'manor_guest_registry_book').ok).toBe(true);
    expect(leaveCurrentLocation(s).ok).toBe(true);
    expect(readingIssue(s, 'manor_guest_registry_book')).toBeNull();
    expect(finish(s, 'manor_guest_registry_book')).toBe(true);
    expect(s.clues.map(clue => clue.id)).toContain('manor_guest_registry');
    expect(s.pendingEvent).toBe('manor_registry_memory');
    expect(s.formulas).toEqual([]);
  });

  it('港务书只给编号知识与旁证线索，线索会小幅帮助仓单检定但不直接给异常仓单', () => {
    const s = fresh('docker'); s.books.dock_manifest_manual.acquired = true; s.skills.investigate = 1; s.stats.mnd = 30;
    const before = evaluateExplorationCheck(s, 'dock_manifest_trace').score;
    expect(finish(s, 'dock_manifest_manual')).toBe(true);
    expect(s.knowledge).toContain('cargo_notation');
    expect(s.clues.map(clue => clue.id)).toContain('dock_ledger_notation');
    expect(evaluateExplorationCheck(s, 'dock_manifest_trace').score).toBeGreaterThan(before);
    expect(s.clues.map(clue => clue.id)).not.toContain('dock_marked_manifest');
    expect(s.leads.iron_blood_token.stage).toBe('unknown');
  });

  it('删节札记要求异常经历，完成只给理论与一次技能成长', () => {
    const blocked = nelsonReady();
    expect(acquireBookIssue(blocked, 'abridged_occult_notes')).toMatch(/尚未进入你的视野/);
    blocked.flags.met_beyonder = 1;
    expect(acquireBook(blocked, 'abridged_occult_notes').ok).toBe(true);
    const before = blocked.skills.occult;
    expect(finish(blocked, 'abridged_occult_notes')).toBe(true);
    expect(blocked.knowledge).toContain('occult_theory');
    expect(blocked.skills.occult).toBe(before + 1);
    expect(blocked.knowledge).not.toEqual(expect.arrayContaining(['spirit_vision', 'ritual_basic', 'potion_brew']));
    expect(blocked.divinationTraining).toMatchObject({ cards: false, dream: false });
  });

  it('读完全部固定书仍不会获得配方、材料、组织身份、灵视或占卜训练', () => {
    const s = fresh(); s.languages.old_feysac = 'reading'; s.skills.investigate = 2;
    for (const book of BOOK_DEFS) finish(s, book.id);
    expect(s.formulas).toEqual([]);
    expect(s.pathwayId).toBeNull();
    expect(s.knowledge).not.toEqual(expect.arrayContaining(['spirit_vision', 'ritual_basic', 'potion_brew']));
    expect(s.divinationTraining).toMatchObject({ cards: false, dream: false });
    expect(Object.values(s.organizationRoutes).every(route => route.status === 'unknown')).toBe(true);
  });

  it('鲁恩语与普通语言能力不会替代罗塞尔文字开关', () => {
    const s = fresh(); s.canReadRoselleScript = false; s.languages.ruen = 'fluent';
    expect(canReadLanguage(s, 'ruen')).toBe(true);
    expect(canReadLanguage(s, 'roselle')).toBe(false);
    s.canReadRoselleScript = true;
    expect(canReadLanguage(s, 'roselle')).toBe(true);
  });
});

describe('v14到v15迁移', () => {
  function saveV14(mutator: (s: GameState) => void) {
    const s = fresh() as GameState & { books?: GameState['books']; languages?: GameState['languages'] };
    s.schemaVersion = 14; mutator(s);
    delete (s as Partial<GameState>).books; delete (s as Partial<GameState>).languages;
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(s));
  }

  it('旧札记与进度迁入删节本，物品清零且距完成至少一小时，二次读档幂等', () => {
    saveV14(s => {
      s.items.occult_notes = 2; s.studyProgress = 99;
      s.pendingEvent = 'study_insight';
      s.forcedEventQueue = ['study_forbidden'];
    });
    const first = loadGame()!;
    expect(first.schemaVersion).toBe(21);
    expect(first.items.occult_notes).toBe(0);
    expect(first.books.abridged_occult_notes).toMatchObject({ acquired: true, readHours: 9, completed: false });
    expect(first.pendingEvent).toBeNull();
    expect(first.forcedEventQueue).toEqual([]);
    saveGame(first);
    expect(loadGame()).toEqual(first);
  });

  it('只有旧全局进度而没有札记时不赠书、不赠奖励', () => {
    saveV14(s => { s.studyProgress = 8; });
    const loaded = loadGame()!;
    expect(loaded.books.abridged_occult_notes).toMatchObject({ acquired: false, readHours: 0, completed: false });
    expect(loaded.knowledge).not.toContain('occult_theory');
  });

  it('旧孤儿或已有礼仪知识会标记教会摘录完成，不重复增加其它奖励', () => {
    const s = newGame('孤儿', 'orphan', []) as GameState & { books?: GameState['books']; languages?: GameState['languages'] };
    s.schemaVersion = 14; delete (s as Partial<GameState>).books; delete (s as Partial<GameState>).languages;
    localStorage.setItem('lotm-demo-save-v6', JSON.stringify(s));
    const loaded = loadGame()!;
    expect(loaded.books.church_festivals_excerpt).toMatchObject({ acquired: true, readHours: 4, completed: true });
    expect(loaded.knowledge.filter(id => id === 'church_liturgy')).toHaveLength(1);
  });
});
