import { useMemo, useRef, useState, useEffect } from 'react';
import './App.css';
import type { GameState, SkillKey, OrganizationId } from './game/types';
import { BOOK_DEFS, CLUE_DEFS, NPCS, ORIGINS, JOBS, TALENTS, SKILL_NAMES, LOCATIONS, LOCATION_REGIONS, ORGANIZATIONS, ORGANIZATION_LEAD_DEFS, ROSELLE_DIARY_PAGE_DEFS, SEQUENCE8_ACTING_DEFS, SEQUENCE8_RITUAL_DEFS, INVENTORY_CATEGORY_LABELS, findPathway, findItem, findJob, npcAvailable, npcLocation, scheduleHint, weekdayOf, WEEKDAY_NAMES, INTEL_NAMES, KNOWLEDGE_NAMES, formulaName, companionSpec, COMPANION_MIN_FAVOR, STAT_NAMES, sequenceEvidenceLabel } from './game/data';
import * as E from './game/engine';

const HOURS = ['0','1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20','21','22','23'];

const TALENT_TENDENCIES: Record<string, string> = {
  spirit_affinity: '更容易察觉细微异常，也更适合整理神秘学线索',
  iron_nerves: '面对冲击时更容易保持镇定',
  quick_wit: '阅读与整理知识时更容易抓住重点',
  silver_tongue: '更容易在交谈中留下好印象',
  night_owl: '夜间行动时更从容',
  money_grubber: '更擅长从日常工作中攒下钱',
  sixth_sense: '接近危险时偶尔会收到模糊预兆',
  strong_body: '体力更充沛，适合长途与艰苦行动',
};

const ORIGIN_TENDENCIES: Record<string, string> = {
  clerk: '生活均衡 · 有一份稳定工作 · 线索来自日常见闻',
  docker: '身体强健 · 熟悉码头 · 容易接触底层传闻',
  orphan: '熟悉教会 · 精神坚韧 · 更受官方关注',
  merchant: '擅长交际 · 家境宽裕 · 熟悉市井交易',
  fallen_noble: '受过教育 · 举止得体 · 维持体面负担较重',
};

function threatLabel(value: number): string {
  if (value < 35) return '尚可应付';
  if (value < 60) return '危险';
  return '致命威胁';
}

function hostilityLabel(value: number): string {
  if (value < 30) return '暗中观察';
  if (value < 60) return '明显敌对';
  return '不死不休';
}

function Bar({ label, value, color, max = 100 }: { label: string; value: number; color: string; max?: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-10 text-stone-400">{label}</span>
      <div className="h-2 flex-1 rounded bg-stone-800 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="w-8 text-right text-stone-300">{Math.round(value)}</span>
    </div>
  );
}

function relationLevel(f: number | undefined): { label: string; cls: string } {
  if (f === undefined) return { label: '未结识', cls: 'text-stone-600' };
  if (f < 0) return { label: '敌视', cls: 'text-red-300/90' };
  if (f < E.VISIT_FAVOR) return { label: '初识', cls: 'text-stone-400' };
  if (f < 45) return { label: '相识', cls: 'text-stone-300' };
  if (f < 75) return { label: '信任', cls: 'text-emerald-300/80' };
  return { label: '信赖', cls: 'text-amber-200/90' };
}

/** 个人面板（弹层） */
function CharacterSheet({ state, onClose }: { state: GameState; onClose: () => void }) {
  const origin = E.originOf(state);
  const pw = findPathway(state.pathwayId);
  const beyonder = E.isBeyonder(state);
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="max-w-2xl w-full max-h-[85vh] overflow-y-auto rounded border border-amber-200/30 bg-[#101311] p-6 space-y-5" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl text-amber-100/90 tracking-widest">{state.playerName}</h2>
            <p className="text-sm text-stone-400 mt-1">
              {origin.name} · 第{state.day}天 · {pw ? `${pw.name} · 序列${state.sequence}「${pw.seqNames[9 - (state.sequence ?? 9)]}」` : '普通人'}
            </p>
          </div>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-200 text-xl px-2">✕</button>
        </div>

        <section>
          <h3 className="sheet-title">背景</h3>
          <p className="text-sm leading-6 text-stone-300">{E.biography(state)}</p>
          {state.tags.length > 0 && (
            <p className="text-xs text-stone-500 mt-1">处境：{state.tags.join('、')}</p>
          )}
        </section>

        <section>
          <h3 className="sheet-title">天赋</h3>
          <ul className="grid md:grid-cols-2 gap-2">
            {state.talents.map(tid => {
              const t = TALENTS.find(x => x.id === tid);
              return t ? (
                <li key={tid} className="rounded border border-stone-800 p-2">
                  <span className="text-amber-100/90 text-sm">{t.name}</span>
                  <p className="text-xs text-stone-500">{t.desc}</p>
                  <p className="text-xs text-emerald-300/70 mt-0.5">{TALENT_TENDENCIES[t.id] ?? t.effect}</p>
                </li>
              ) : null;
            })}
          </ul>
        </section>

        <section>
          <h3 className="sheet-title">数值</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            <Bar label="体质" value={state.stats.phy} color="bg-orange-400/70" />
            <Bar label="灵性" value={state.stats.spi} color="bg-violet-400/70" />
            <Bar label="心智" value={state.stats.mnd} color="bg-cyan-400/70" />
            <Bar label="魅力" value={state.stats.cha} color="bg-rose-400/70" />
            <Bar label="精力" value={state.stats.energy} color="bg-emerald-400/70" />
            <Bar label="理智" value={state.stats.san} color="bg-sky-400/70" />
            <Bar label="污染" value={state.stats.cor} color="bg-purple-500/80" />
            {beyonder && <Bar label="消化" value={state.digestion} color="bg-amber-300/80" />}
            {beyonder && <Bar label="暴露" value={state.exposure} color="bg-red-400/80" />}
          </div>
        </section>

        <section>
          <h3 className="sheet-title">技能</h3>
          <div className="grid grid-cols-5 gap-2 text-center text-xs">
            {(Object.keys(SKILL_NAMES) as SkillKey[]).map(k => (
              <div key={k} className="rounded border border-stone-800 p-2">
                <div className="text-stone-400">{SKILL_NAMES[k]}</div>
                <div className="text-amber-100/90 text-base mt-0.5">Lv.{state.skills[k]}</div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="sheet-title">人脉</h3>
          <ul className="space-y-1.5">
            {E.allNPCs(state).map(n => {
              const fav = state.relations[n.id];
              const lv = relationLevel(fav);
              return (
                <li key={n.id} className="flex items-center justify-between text-sm">
                  <span className={fav === undefined ? 'text-stone-600' : 'text-stone-300'}>
                    {fav === undefined ? `眼熟的${n.identity}` : n.name} <span className="text-xs text-stone-600">{fav === undefined ? '' : n.identity}</span>
                  </span>
                  <span className={`text-xs ${lv.cls}`}>{lv.label}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h3 className="sheet-title">履历与持有</h3>
          <div className="text-xs text-stone-400 space-y-1 leading-5">
            <p>职业：{findJob(state.jobId)?.name ?? '失业'}{state.atWork ? '（当前在岗）' : ''}</p>
            <p>资金：{E.fmtMoney(state.pence)}（出身家境：{E.fmtMoney(origin.pence)}）</p>
            <p>{E.isBeyonder(state) ? '配方' : '未验证配方线索'}：{state.formulas.length ? state.formulas.map(formulaName).join('、') : '无'}</p>
            <p>情报：{state.intel.length ? state.intel.map(i => INTEL_NAMES[i] ?? i).join('、') : '无'}</p>
            <p>知识：{state.knowledge.length ? state.knowledge.map(k => KNOWLEDGE_NAMES[k] ?? k).join('、') : '无'}</p>
            <p>物品：{E.getInventoryEntries(state).map(entry => `${entry.name}×${entry.quantity}`).join('、') || '无'}</p>
          </div>
        </section>
      </div>
    </div>
  );
}

function InventoryPanel({ state, interactive, onAction, onClose }: {
  state: GameState;
  interactive: boolean;
  onAction: (fn: (s: GameState) => E.ActionResult) => void;
  onClose: () => void;
}) {
  const entries = E.getInventoryEntries(state);
  return <div data-inventory-panel className="panel border-violet-300/30 text-xs space-y-3">
    <div className="flex items-center justify-between gap-2">
      <h3 className="panel-title">物品栏</h3>
      <button className="text-stone-500 hover:text-stone-200" onClick={onClose}>收起</button>
    </div>
    <p className="text-stone-500 leading-5">这里只展示你目前能够确认的外观与记录。未经检视的异常物不会提前暴露真实分类或危险。</p>
    {!interactive && <p className="rounded border border-stone-800 p-2 text-stone-600">你可以随时查看随身记录；使用、阅读和检视需回到住处后进行。</p>}
    {entries.length === 0
      ? <p className="text-stone-600">物品栏还是空的。</p>
      : (['tool', 'book', 'misc', 'occult'] as const).map(category => {
        const categoryEntries = entries.filter(entry => entry.category === category);
        if (!categoryEntries.length) return null;
        return <section key={category} className="space-y-2">
          <h4 className="text-stone-300 border-b border-stone-800 pb-1">{INVENTORY_CATEGORY_LABELS[category]}</h4>
          {categoryEntries.map(entry => {
            const reading = entry.kind === 'book' ? E.readingIssue(state, entry.id) : null;
            return <div key={`${entry.kind}:${entry.id}`} className="rounded border border-stone-700 p-2">
              <div className="flex justify-between gap-2"><span className={category === 'occult' ? 'text-purple-200/90' : category === 'book' ? 'text-violet-100/90' : 'text-stone-200'}>{entry.name}</span><span className="text-stone-500">×{entry.quantity}</span></div>
              <p className="text-stone-500 mt-1 leading-5">{entry.description}</p>
              {entry.knownInfo.length > 0 && <p className="text-sky-200/60 mt-1">已知：{entry.knownInfo.join('；')}</p>}
              {interactive && <div className="flex flex-wrap gap-2 mt-2">
                {entry.actions.read && <button disabled={!!reading} title={reading ?? ''} className="text-violet-200/80 disabled:opacity-40"
                  onClick={() => onAction(s => E.readBookSession(s, entry.id))}>阅读一节 <small className="text-stone-600">2h</small></button>}
                {entry.actions.spiritVision && (() => {
                  const issue = E.spiritVisionInspectionIssue(state, entry.id);
                  return <button disabled={!!issue} title={issue ?? ''} className="text-sky-200/80 disabled:opacity-40"
                    onClick={() => onAction(s => E.inspectItemWithSpiritVision(s, entry.id))}>用灵视检视</button>;
                })()}
                {entry.actions.divination && (['cards', 'dream'] as const).map(method => {
                  const issue = E.divinationIssue(state, 'item', entry.id, method, 'self');
                  return <button key={method} disabled={!!issue} title={issue ?? ''} className="text-violet-200/80 disabled:opacity-35"
                    onClick={() => onAction(s => E.performDivination(s, 'item', entry.id, method, 'self'))}>
                    {method === 'cards' ? '纸牌占卜' : '梦境占卜'}
                  </button>;
                })}
                {entry.actions.divination && (['nelson', 'evelyn'] as const).map(provider => {
                  const issue = E.divinationIssue(state, 'item', entry.id, 'cards', provider);
                  return <button key={provider} disabled={!!issue} title={issue ?? ''} className="text-sky-200/80 disabled:opacity-35"
                    onClick={() => onAction(s => E.performDivination(s, 'item', entry.id, 'cards', provider))}>
                    请{provider === 'nelson' ? '尼尔逊代占' : '伊芙琳核验'}
                  </button>;
                })}
              </div>}
            </div>;
          })}
        </section>;
      })}
    {interactive && E.getBookSourceOffers(state).length > 0 && <div className="border-t border-stone-800 pt-2 space-y-1">
      <p className="text-stone-400">当前可核验的固定书源</p>
      {E.getBookSourceOffers(state).map(offer => {
        const def = BOOK_DEFS.find(candidate => candidate.id === offer.bookId)!;
        const issue = E.acquireBookIssue(state, offer.bookId);
        return <button key={offer.bookId} disabled={!!issue} title={issue ?? ''}
          className="block w-full text-left text-sky-200/80 disabled:opacity-40"
          onClick={() => onAction(s => E.acquireBook(s, offer.bookId))}>
          取得{def.title} <small className="text-stone-600">1h{offer.price ? ` · ${E.fmtMoney(offer.price)}` : ' · 借阅'}</small>
        </button>;
      })}
    </div>}
  </div>;
}

export default function App() {
  const [state, setState] = useState<GameState | null>(() => E.loadGame());
  const [shopOpen, setShopOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [advOpen, setAdvOpen] = useState(false);
  const [actingOpen, setActingOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [companionId, setCompanionId] = useState(''); // 冒险同行者（空=独自）
  const [nameInput, setNameInput] = useState('');
  const [originChoice, setOriginChoice] = useState('clerk');
  const [talentPicks, setTalentPicks] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [state?.log.length]);

  const update = (fn: (s: GameState) => void) => {
    setState(prev => {
      if (!prev) return prev;
      const s = structuredClone(prev);
      fn(s);
      E.saveGame(s);
      return s;
    });
  };

  const runAction = (fn: (s: GameState) => E.ActionResult) => {
    update(s => {
      const result = fn(s);
      if (!result.ok && result.msg) E.addLog(s, `无法行动：${result.msg}`, 'bad');
    });
  };

  const pw = useMemo(() => (state ? findPathway(state.pathwayId) : undefined), [state?.pathwayId]);

  // ========== 开局界面（出身 + 天赋） ==========
  if (!state) {
    const toggleTalent = (id: string) => {
      setTalentPicks(prev => prev.includes(id) ? prev.filter(t => t !== id) : prev.length >= 2 ? prev : [...prev, id]);
    };
    const chosenOrigin = ORIGINS.find(o => o.id === originChoice)!;
    return (
      <div className="min-h-screen bg-[#0c0f0e] text-stone-200 p-6 font-serif">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl text-amber-200/90 tracking-widest text-center mb-2">诡秘之主 · 灰雾人生</h1>
          <p className="text-center text-stone-400 mb-6">文字模拟 Demo · 你不是非凡者——至少现在还不是。</p>

          <div className="mb-5">
            <label className="block text-sm text-stone-400 mb-1">你的名字</label>
            <input value={nameInput} onChange={e => setNameInput(e.target.value)} placeholder="例如：周明瑞"
              className="w-full bg-stone-900 border border-stone-700 rounded px-3 py-2 focus:outline-none focus:border-amber-200/60" />
          </div>

          <p className="text-sm text-stone-400 mb-2">你的出身（决定家境、初始属性与人脉）：</p>
          <div className="grid md:grid-cols-2 gap-3 mb-6">
            {ORIGINS.map(o => (
              <button key={o.id} onClick={() => setOriginChoice(o.id)}
                className={`text-left p-3 rounded border transition ${originChoice === o.id ? 'border-amber-200/80 bg-amber-100/5' : 'border-stone-700 bg-stone-900/60 hover:border-stone-500'}`}>
                <div className="text-amber-100/90">{o.name} <span className="text-xs text-stone-500">开局 {E.fmtMoney(o.pence)}</span></div>
                <div className="text-xs text-stone-400 mt-1 leading-5">{o.desc}</div>
                <div className="text-xs text-emerald-200/60 mt-1">{ORIGIN_TENDENCIES[o.id] ?? '均衡的生活背景'}</div>
              </button>
            ))}
          </div>

          <p className="text-sm text-stone-400 mb-2">选择两项天赋（{talentPicks.length}/2）：</p>
          <div className="grid md:grid-cols-2 gap-2 mb-6">
            {TALENTS.map(t => {
              const picked = talentPicks.includes(t.id);
              return (
                <button key={t.id} onClick={() => toggleTalent(t.id)}
                  disabled={!picked && talentPicks.length >= 2}
                  className={`text-left p-2.5 rounded border transition disabled:opacity-40 ${picked ? 'border-amber-200/80 bg-amber-100/5' : 'border-stone-700 bg-stone-900/60 hover:border-stone-500'}`}>
                  <span className="text-amber-100/90 text-sm">{picked ? '◆ ' : '◇ '}{t.name}</span>
                  <span className="text-xs text-stone-500 ml-2">{TALENT_TENDENCIES[t.id] ?? t.effect}</span>
                  <p className="text-xs text-stone-400 mt-0.5">{t.desc}</p>
                </button>
              );
            })}
          </div>

          <div className="panel text-xs text-stone-400 leading-5 mb-6">
            <span className="text-stone-500">开局预览：</span>
            {nameInput || '无名者'}，{chosenOrigin.name}，{E.fmtMoney(chosenOrigin.pence)}，
            天赋：{talentPicks.map(t => TALENTS.find(x => x.id === t)?.name).join('、') || '（未选择，可选0-2项）'}
          </div>

          <div className="text-center">
            <button onClick={() => setState(E.newGame(nameInput, originChoice, talentPicks))}
              className="px-10 py-3 rounded bg-amber-200/90 text-stone-900 text-lg tracking-widest hover:bg-amber-100">
              睁开眼睛
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ========== 结局界面 ==========
  if (state.gameOver) {
    return (
      <div className="min-h-screen bg-[#0c0f0e] text-stone-200 flex items-center justify-center p-6 font-serif">
        <div className="max-w-xl w-full text-center">
          <h1 className="text-3xl text-red-300/90 tracking-widest mb-6">—— {state.gameOver.title} ——</h1>
          <p className="text-stone-300 leading-8 mb-8">{state.gameOver.text}</p>
          <div className="text-sm text-stone-500 mb-8 space-y-1">
            <p>生平报告：{state.playerName}（{E.originOf(state).name}）</p>
            <p>{pw ? `${pw.name} · 序列${state.sequence}` : '终身为凡人'} · 存活 {state.day} 天 · 遗产 {E.fmtMoney(state.pence)}</p>
            {pw && <p className="text-stone-600">你析出的非凡特性已计入世界总账。下个周目，也许会在黑市与它重逢。</p>}
          </div>
          <button onClick={() => { E.clearSave(); setState(null); }}
            className="px-8 py-3 rounded border border-amber-200/60 text-amber-100 hover:bg-amber-100/10">
            开始新的人生
          </button>
        </div>
      </div>
    );
  }

  const ev = E.currentEvent(state);
  const beyonder = E.isBeyonder(state);
  const promote = E.canPromote(state);
  const job = E.currentJob(state);
  const victorHere = npcAvailable(NPCS[0], state.day, state.hour);
  const shopAvailable = victorHere && state.currentLocation?.locationId === 'black_market';
  const nightwatchRoute = state.organizationRoutes.nightwatch;
  const clocktowerClues = state.clues.filter(clue => clue.caseId === 'clocktower');
  const visibleLocations = E.getVisibleLocations(state);
  const visibleBoard = state.board.filter(commission => E.isLocationUnlocked(state, commission.locationId));
  const inventoryEntries = E.getInventoryEntries(state);
  const locationDivinationTargets = E.getDivinationTargets(state).filter(target => target.kind === 'location');

  return (
    <div className="min-h-screen bg-[#0c0f0e] text-stone-200 font-serif">
      {sheetOpen && <CharacterSheet state={state} onClose={() => setSheetOpen(false)} />}

      {/* 顶栏 */}
      <header className="border-b border-stone-800 px-4 py-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <span className="text-amber-100/90">第{state.day}天 {WEEKDAY_NAMES[weekdayOf(state.day)]} {HOURS[state.hour]}:00</span>
        <button onClick={() => setSheetOpen(true)} className="text-amber-200/80 hover:text-amber-100 underline underline-offset-4 decoration-stone-600">
          {state.playerName} ▸ 个人面板
        </button>
        <span>{pw ? `${pw.name} · 序列${state.sequence} ${pw.seqNames[9 - (state.sequence ?? 9)]}` : '普通人'}</span>
        <span className="text-amber-200/80">{E.fmtMoney(state.pence)}</span>
        <span className="text-xs text-stone-400">{job ? `${job.name}${state.atWork ? ' · 在岗' : ''}` : '失业'}</span>
        {state.tags.includes('registered') && <span className="text-xs text-sky-300/70">【教会备案】</span>}
        {state.tags.includes('fugitive') && <span className="text-xs text-red-300/70">【在逃】</span>}
        {state.tags.includes('homeless') && <span className="text-xs text-red-300/70">【无家可归】</span>}
        <button className="ml-auto text-xs text-stone-500 hover:text-red-300"
          onClick={() => { if (confirm('放弃当前人生，重新开始？')) { E.clearSave(); setState(null); } }}>
          放弃此生
        </button>
      </header>

      <div className="grid lg:grid-cols-[260px_1fr_280px] gap-4 p-4 max-w-7xl mx-auto">
        {/* 左栏：状态 */}
        <aside className="space-y-3">
          <section className="panel">
            <h3 className="panel-title">状态</h3>
            <Bar label="精力" value={state.stats.energy} color="bg-emerald-400/70" />
            <Bar label="理智" value={state.stats.san} color="bg-sky-400/70" />
            <Bar label="污染" value={state.stats.cor} color="bg-purple-500/80" />
            {beyonder && <Bar label="消化" value={state.digestion} color="bg-amber-300/80" />}
            {beyonder && <Bar label="暴露" value={state.exposure} color="bg-red-400/80" />}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-xs text-stone-400">
              <span>体质 {state.stats.phy}</span><span>灵性 {state.stats.spi}</span>
              <span>心智 {state.stats.mnd}</span><span>魅力 {state.stats.cha}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 pt-2 border-t border-stone-800 text-xs text-stone-500">
              {(Object.keys(SKILL_NAMES) as SkillKey[]).map(k => (
                <span key={k}>{SKILL_NAMES[k]} Lv.{state.skills[k]}</span>
              ))}
            </div>
          </section>
          <section className="panel">
            <h3 className="panel-title">倒计时</h3>
            <ul className="text-xs space-y-1 text-stone-300">
              {E.getVisibleTimers(state).map(t => (
                <li key={t.id} className="flex justify-between">
                  <span>{t.label}</span>
                  <span className="text-amber-200/70">{Math.floor(t.hoursLeft / 24)}天{t.hoursLeft % 24}时</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="panel">
            <div className="flex items-center justify-between gap-2">
              <h3 className="panel-title">物品栏</h3>
              <button className="text-xs text-violet-200/80" onClick={() => setInventoryOpen(value => !value)}>
                {inventoryOpen ? '收起' : '查看'}
              </button>
            </div>
            <ul className="text-xs space-y-1 text-stone-300">
              {beyonder
                ? state.formulas.map(f => <li key={f} className="text-purple-200/80">🧪 {formulaName(f)}</li>)
                : state.formulas.length > 0 && <li className="text-amber-200/70">📄 未验证配方线索 ×{state.formulas.length}</li>}
              {(['tool', 'book', 'misc', 'occult'] as const).map(category => {
                const count = inventoryEntries.filter(entry => entry.category === category).reduce((sum, entry) => sum + entry.quantity, 0);
                return count > 0 ? <li key={category} className="flex justify-between"><span>{INVENTORY_CATEGORY_LABELS[category]}</span><span>×{count}</span></li> : null;
              })}
              {state.intel.map(i => <li key={i} className="text-sky-300/80">🕵 {INTEL_NAMES[i] ?? i}</li>)}
              {state.knowledge.map(k => <li key={k} className="text-emerald-300/80">📖 {KNOWLEDGE_NAMES[k] ?? k}</li>)}
              {!state.formulas.length && !inventoryEntries.length && !state.intel.length && !state.knowledge.length &&
                <li className="text-stone-600">两袖清风。</li>}
            </ul>
          </section>
        </aside>

        {/* 中栏：叙事 + 行动 */}
        <main className="space-y-3">
          <div ref={logRef} className="panel h-[46vh] overflow-y-auto leading-7 text-[15px]">
            {state.log.map((l, i) => (
              <p key={i} className={`log-${l.kind}`}>
                <span className="text-stone-600 text-xs mr-2">{l.day}日{HOURS[l.hour]}:00</span>{l.text}
              </p>
            ))}
          </div>

          {inventoryOpen && <InventoryPanel
            state={state}
            interactive={E.isAtHome(state) && !ev}
            onAction={runAction}
            onClose={() => setInventoryOpen(false)}
          />}

          {ev ? (
            <div className="panel border-amber-200/40">
              <h3 className="text-amber-100/90 mb-2">▶ {ev.title}</h3>
              <div className="space-y-2">
                {ev.choices.filter(c => E.checkCond(state, c.cond)).map((c, i) => (
                  <button key={i} onClick={() => update(s => E.resolveChoice(s, i))}
                    className="block w-full text-left px-3 py-2 rounded border border-stone-700 hover:border-amber-200/60 hover:bg-amber-100/5 text-sm">
                    {c.text}
                  </button>
                ))}
              </div>
            </div>
          ) : state.atWork && job ? (
            <div className="panel border-sky-300/30">
              <div className="flex flex-wrap justify-between gap-2 mb-3">
                <div>
                  <h3 className="text-sky-200/90">你正在工作 · {job.name}</h3>
                  <p className="text-xs text-stone-500 mt-1">{job.location} · 班次 {job.shiftStart}:00–{job.shiftEnd}:00</p>
                </div>
                <span className="text-xs text-stone-500">普通行动暂停，需先下班离开</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                <button className="act-btn" onClick={() => runAction(s => E.doWork(s))}>
                  干活<small>每时段 {job.workHours}h · {E.fmtMoney(Math.round(job.pay * (E.originOf(state).workPayMult ?? 1) * (E.hasTalent(state, 'money_grubber') ? 1.2 : 1)))}</small>
                </button>
                <button className="act-btn" onClick={() => runAction(s => E.leaveWork(s))}>
                  下班<small>{job.commuteHours}h · 通勤回家</small>
                </button>
                <button className="act-btn border-red-300/30" onClick={() => runAction(s => E.resignJob(s))}>
                  离职<small>离开岗位并清空职业</small>
                </button>
              </div>
              <div className="mt-4 border-t border-stone-800 pt-3">
                <h4 className="panel-title">和同事互动 · 1h</h4>
                <div className="grid md:grid-cols-2 gap-2">
                  {E.workmatesFor(state).map(n => {
                    const fav = state.relations[n.id];
                    return (
                      <button key={n.id} className="text-left rounded border border-stone-700 p-2 hover:border-sky-300/50"
                        onClick={() => runAction(s => E.interactWithWorkmate(s, n.id))}>
                        <span className="text-sm text-stone-200">{n.name}</span>
                        <span className="text-xs text-stone-500 ml-2">{n.identity} · {relationLevel(fav).label}</span>
                        <p className="text-[11px] text-stone-500 mt-1">{n.traits.join('、')} · {n.motive}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : state.currentLocation ? (() => {
            const stay = state.currentLocation;
            const loc = LOCATIONS.find(location => location.id === stay.locationId)!;
            const localSources = Object.values(state.materialSources).filter(source => source.locationId === loc.id && E.isMaterialRouteValid(state, source.sourceId));
            const localShopId = loc.id === 'market' ? 'market_general_store' : loc.id === 'black_market' ? 'black_market_stall' : null;
            return <div className="panel border-amber-200/35 space-y-3">
              <div className="flex justify-between gap-3">
                <div>
                  <h3 className="text-amber-100/90">当前位于：{loc.name}</h3>
                  <p className="text-xs text-stone-500 mt-1">{loc.desc}</p>
                  <p className="text-[11px] text-stone-600 mt-1">返程已预付 · 预计{stay.returnHours}h</p>
                </div>
                <button className="text-sky-200/80" onClick={() => runAction(s => E.leaveCurrentLocation(s))}>离开此地</button>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                {loc.actions.filter(action => action !== 'shop').map(action => {
                  const label = action === 'explore' ? '调查周边' : action === 'wander' ? '在此闲逛' : action === 'tavern' ? '进酒馆坐坐' : '搜集普通物资';
                  return <button key={action} className="act-btn" onClick={() => runAction(s => E.performAtLocationAction(s, action))}>{label}<small>地点行动 · 1h</small></button>;
                })}
              </div>
              {loc.id === 'docks' && !beyonder && state.leads.iron_blood_token.stage === 'unknown' && <div className="rounded border border-sky-300/25 p-3 text-xs space-y-2">
                <div>
                  <p className="text-sky-100/90">码头失踪案</p>
                  <p className="text-stone-500 mt-1">现场见闻只能提供方向。公开登记、货运备份与旧仓单必须逐层核对，办公窗口仅在白天开放。</p>
                </div>
                {([
                  {
                    id: 'reports', label: E.hasClue(state, 'dock_missing_reports') ? '失踪登记已核对' : '核对失踪登记',
                    issue: E.inspectDockMissingReportsIssue(state), action: (s: GameState) => E.inspectDockMissingReports(s),
                  },
                  {
                    id: 'cargo', label: E.hasClue(state, 'dock_manifest_discrepancy') ? '货运备份已比对' : '比对货运备份',
                    issue: E.compareDockCargoRecordsIssue(state), action: (s: GameState) => E.compareDockCargoRecords(s),
                  },
                  {
                    id: 'manifest', label: '追查异常仓单',
                    issue: E.traceDockMarkedManifestIssue(state), action: (s: GameState) => E.traceDockMarkedManifest(s),
                  },
                ]).map(step => <button key={step.id} disabled={!!step.issue} title={step.issue ?? ''}
                  className="block w-full rounded border border-sky-300/25 p-2 text-left text-sky-100/85 disabled:opacity-45"
                  onClick={() => runAction(step.action)}>
                  {step.label}<small className="block text-stone-500 mt-0.5">{step.issue ?? '在当前地点继续核对'}</small>
                </button>)}
              </div>}
              {localShopId && <div className="rounded border border-stone-700 p-2 text-xs">
                <p className="text-stone-300 mb-1">店铺货单</p>
                {E.getShopInventory(state, localShopId).map(item => <button key={item.itemId} className="block text-amber-200/80"
                  onClick={() => runAction(s => E.buyFromShop(s, localShopId, item.itemId))}>
                  {findItem(item.itemId)?.name ?? item.itemId} · {E.fmtMoney(item.price)}
                </button>)}
                {!E.getShopInventory(state, localShopId).length && <p className="text-stone-600">当前没有对你开放的货单，或店铺尚未营业。</p>}
              </div>}
              {E.getBookSourceOffers(state).length > 0 && <div className="rounded border border-violet-300/20 p-2 text-xs">
                <p className="text-stone-300 mb-1">此地可取得的固定书目</p>
                {E.getBookSourceOffers(state).map(offer => {
                  const def = BOOK_DEFS.find(book => book.id === offer.bookId)!;
                  return <button key={offer.bookId} className="block text-violet-200/80" onClick={() => runAction(s => E.acquireBook(s, offer.bookId))}>
                    {def.title} · {offer.price ? E.fmtMoney(offer.price) : '借阅'}
                  </button>;
                })}
              </div>}
              {localSources.map(source => <button key={source.sourceId} className="block text-emerald-200/80" onClick={() => runAction(s => E.collectMaterialSource(s, source.sourceId, loc.id))}>
                定向采集/领取：{findItem(source.itemId)?.name}
              </button>)}
              {loc.id === 'manor' && !state.diaryPages.diary_door_fragment.acquired && <button className="text-sky-200/80" onClick={() => runAction(s => E.discoverDiaryPage(s, 'diary_door_fragment'))}>检查书房暗格中的可疑纸页</button>}
              {loc.id === 'black_market' && !state.diaryPages.diary_false_formula.acquired && E.isMet(state, 'victor') && <button className="text-sky-200/80" onClick={() => runAction(s => E.discoverDiaryPage(s, 'diary_false_formula'))}>询问纸摊流出的可疑纸页</button>}
            </div>;
          })() : (
            <div className="panel">
              <h3 className="panel-title">下一步行动</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <button className="act-btn" disabled={!job} onClick={() => runAction(s => E.commuteToWork(s))}>
                  {job ? '前往上班' : '当前失业'}<small>{job ? `${job.commuteHours}h 通勤 · ${job.name}` : '请在下方选择工作'}</small>
                </button>
                <button className={`act-btn ${advOpen ? 'border-amber-200/80 bg-amber-100/5' : ''}`} onClick={() => setAdvOpen(v => !v)}>前往地点<small>选择去向与交通</small></button>
                <button className={`act-btn ${actingOpen ? 'border-purple-300/70' : ''}`} disabled={state.sequence !== 9} title={state.sequence === 9 ? '' : '仅序列9需要本阶段扮演证据'}
                  onClick={() => setActingOpen(value => !value)}>扮演场景<small>{state.sequence === 9 ? '选择具体原则行动' : '当前阶段不可用'}</small></button>
                <button className={`act-btn ${inventoryOpen ? 'border-violet-300/70' : ''}`} onClick={() => setInventoryOpen(value => !value)}>物品栏<small>分类、检视与使用</small></button>
                <button className="act-btn" onClick={() => update(s => E.doMeal(s))}>正餐<small>1h · 花费4便士</small></button>
                <button className="act-btn" onClick={() => update(s => E.doNap(s))}>小睡<small>1h · 稍作休息</small></button>
                <button className="act-btn border-sky-300/40" onClick={() => update(s => E.doSleep(s))}>
                  {state.pathwayId === 'sleepless' ? '静夜冥想' : '睡觉'}<small>{state.pathwayId === 'sleepless' ? '2h · 不眠者' : '至次日7:00'}</small>
                </button>
              </div>

              {actingOpen && state.sequence === 9 && state.pathwayId && (() => {
                const def = SEQUENCE8_ACTING_DEFS[state.pathwayId as keyof typeof SEQUENCE8_ACTING_DEFS];
                const progress = state.sequence8Progress;
                return <div className="mt-3 rounded border border-purple-300/30 p-3 text-xs space-y-2">
                  <h3 className="panel-title">扮演原则与真实场景</h3>
                  <div className="grid md:grid-cols-3 gap-2">
                    {def.principles.map(principle => <div key={principle.id} className="rounded border border-stone-700 p-2">
                      <p className="text-purple-100/90">{principle.name}</p>
                      <p className="text-stone-500">{sequenceEvidenceLabel(progress?.evidence[principle.id]?.length ?? 0, progress?.requiredEvidencePerPrinciple ?? 2)}</p>
                    </div>)}
                  </div>
                  <p className="text-stone-500">扮演不是背诵守则。换一个日期、对象或处境亲身实践，留意魔药给你的真实反馈。</p>
                  {def.actions.map(action => {
                    const issue = E.actingActionIssue(state, action.id);
                    return <button key={action.id} disabled={!!issue} title={issue ?? ''}
                      className="block w-full text-left rounded border border-purple-300/30 p-2 text-purple-100/90 disabled:opacity-40"
                      onClick={() => runAction(s => E.performActingAction(s, action.id))}>
                      {action.name}<small className="block text-stone-500">1h{issue ? ` · ${issue}` : ''}</small>
                    </button>;
                  })}
                </div>;
              })()}

              {job ? (
                <div className="mt-3 rounded border border-stone-800 p-3 text-xs text-stone-400">
                  <div className="flex flex-wrap justify-between gap-2">
                    <div>
                      <span className="text-stone-200">当前职业：{job.name}</span>
                      <span className="ml-2">{job.location} · {job.shiftStart}:00–{job.shiftEnd}:00</span>
                    </div>
                    <button className="text-red-300/70 hover:text-red-200" onClick={() => runAction(s => E.resignJob(s))}>辞去工作</button>
                  </div>
                  <p className="mt-1">{job.desc}（{job.tendency}）</p>
                </div>
              ) : (
                <div className="mt-3 border-t border-stone-800 pt-3">
                  <h3 className="panel-title">失业 · 选择一份工作</h3>
                  <div className="grid md:grid-cols-2 gap-2">
                    {JOBS.map(j => (
                      <button key={j.id} className="text-left rounded border border-stone-700 p-2 hover:border-amber-200/60"
                        onClick={() => runAction(s => E.takeJob(s, j.id))}>
                        <div className="flex justify-between gap-2 text-sm">
                          <span className="text-amber-100/90">{j.name}</span>
                          <span className="text-emerald-300/70">每时段 {E.fmtMoney(j.pay)} / {j.workHours}h</span>
                        </div>
                        <p className="text-[11px] text-stone-500 mt-1">{j.location} · {j.shiftStart}:00–{j.shiftEnd}:00 · 通勤{j.commuteHours}h</p>
                        <p className="text-xs text-stone-400 mt-1">{j.desc}</p>
                        <p className="text-[11px] text-sky-300/60 mt-1">{j.tendency}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 冒险地点选择器（按区域分组） */}
              {advOpen && (
                <div className="mt-3 border-t border-stone-800 pt-3">
                  <h3 className="panel-title">前往何处？</h3>
                  {/* 同行者选择 */}
                  {(() => {
                    const candidates = E.allNPCs(state).filter(n => (state.relations[n.id] ?? -999) >= COMPANION_MIN_FAVOR);
                    if (!candidates.length) return <p className="text-[11px] text-stone-600 mb-3 leading-4">独自前往。只有真正信任你的熟人才会愿意同行；同行者会按约定分取报酬。</p>;
                    return (
                      <div className="mb-3">
                        <h4 className="text-[11px] text-stone-500 tracking-widest mb-1.5">—— 同行者（会在擅长领域协助，报酬按约定分配）——</h4>
                        <div className="flex flex-wrap gap-1.5">
                          <button onClick={() => setCompanionId('')}
                            className={`px-2 py-1 rounded border text-xs ${!companionId ? 'border-amber-200/70 text-amber-100' : 'border-stone-700 text-stone-400 hover:text-stone-200'}`}>
                            独自前往
                          </button>
                          {candidates.map(n => {
                            const spec = companionSpec(n);
                            const free = npcAvailable(n, state.day, state.hour);
                            return (
                              <button key={n.id} disabled={!free} title={free ? '' : 'ta此刻走不开——看作息挑时间'}
                                onClick={() => setCompanionId(n.id)}
                                className={`px-2 py-1 rounded border text-xs disabled:opacity-40 ${companionId === n.id ? 'border-amber-200/70 text-amber-100' : 'border-stone-700 text-stone-400 hover:text-stone-200'}`}>
                                {n.name} · 擅长{STAT_NAMES[spec.stat]} · {relationLevel(state.relations[n.id]).label}{free ? '' : '（不得空）'}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                  {!beyonder && !E.hasClue(state, 'dock_missing_reports') && (() => {
                    const issue = E.inspectDockMissingReportsIssue(state);
                    return <button disabled={!!issue} title={issue ?? ''}
                      className="w-full mb-3 py-2 rounded border border-sky-300/30 text-sky-100/80 hover:bg-sky-100/5 text-sm disabled:opacity-40"
                      onClick={() => runAction(s => E.inspectDockMissingReports(s))}>
                      核对近期失踪公告 <small className="block text-stone-500">9:00–17:00 · 2h · 只核对公开记录</small>
                    </button>;
                  })()}
                  {visibleLocations.length < LOCATIONS.length && <p className="text-[11px] text-stone-600 mb-3">地图边缘仍有未查明的方向，需要从传闻、委托或可信路线中寻找入口。</p>}
                  {LOCATION_REGIONS.filter(region => visibleLocations.some(location => location.region === region)).map(region => (
                    <div key={region} className="mb-3">
                      <h4 className="text-[11px] text-stone-500 tracking-widest mb-1.5">—— {region} ——</h4>
                      <ul className="grid md:grid-cols-2 gap-2 text-xs">
                        {visibleLocations.filter(l => l.region === region).map(l => {
                          const nightBlocked = l.nightOnly && !(state.hour >= 22 || state.hour < 2);
                          const isTarget = state.activeCommission?.locationId === l.id;
                          const locationClue = l.id === 'docks' ? '雾里偶尔有人提到搬运工失踪，却没人能说清名单是否对得上。' : l.id === 'manor' ? '门框与书房暗格可能留有旧主人未清走的纸张。' : null;
                          return (
                            <li key={l.id} className={`rounded border p-2 ${nightBlocked ? 'border-stone-800 opacity-50' : isTarget ? 'border-amber-200/60' : 'border-stone-700'}`}>
                              <div className="flex justify-between items-center">
                                <span className="text-stone-200">{isTarget ? '🎯 ' : ''}{l.name}</span>
                                <span className="text-stone-500">{l.hours}h</span>
                              </div>
                              <p className="text-stone-500 leading-4 mt-0.5">{l.desc}</p>
                              <p className="text-[11px] text-violet-200/60 mt-1">{E.locationRiskPresentation(state, l.id)}</p>
                              {locationClue && <p className="text-[11px] text-amber-100/55 mt-1">模糊调查提示：{E.hasVisitedLocation(state, l.id) ? (l.id === 'docks' ? '你已记住码头名册与账房所在，可以从公开记录开始核对。' : '已完成一次实地调查，相关痕迹已记入线索档案。') : locationClue}</p>}
                              <div className="mt-2 space-y-1">
                                <span className="block text-stone-600">{l.nightOnly ? '仅22:00–2:00' : '抵达后选择地点行动'} · 可进行：{l.actions.map(action => ({ explore: '调查', wander: '闲逛', tavern: '酒馆', shop: '店铺', salvage: '搜集' } as const)[action]).join('、')}</span>
                                {(() => {
                                  const tripCompanion = l.actions.includes('explore') ? companionId || undefined : undefined;
                                  const travelers = tripCompanion ? 2 : 1;
                                  const walk = E.getTravelQuote(state, l.id, 'walk', travelers)!;
                                  const rickshaw = E.getTravelQuote(state, l.id, 'rickshaw', travelers);
                                  const go = (mode: 'walk' | 'rickshaw') => { setAdvOpen(false); update(s => E.travelToLocation(s, l.id, mode, tripCompanion)); };
                                  return <div className="flex flex-wrap gap-2">
                                    <button disabled={nightBlocked} onClick={() => go('walk')} className="text-amber-200/80 hover:text-amber-100 disabled:opacity-40">步行前往 · 总行程{walk.hours}h</button>
                                    {rickshaw && <button disabled={nightBlocked} onClick={() => go('rickshaw')} className="text-sky-200/80 hover:text-sky-100 disabled:opacity-40">
                                      {l.region === '远方' ? '接驳/驿车' : '人力车'} · 总行程{rickshaw.hours}h · {E.fmtMoney(rickshaw.fee)}
                                    </button>}
                                  </div>;
                                })()}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {locationDivinationTargets.length > 0 && (
                <div className="mt-3 border-t border-stone-800 pt-3">
                  <h3 className="panel-title">占卜与预兆</h3>
                  <p className="text-xs text-stone-500 leading-5 mb-2">占卜需要一个足够明确的问题。象征只会留下模糊启示，真正的含义仍要结合已有调查判断。</p>
                  <div className="space-y-2">
                    {locationDivinationTargets.map(target => (
                      <div key={`${target.kind}:${target.id}`} className="rounded border border-violet-300/20 p-2 text-xs">
                        <p className="text-stone-200 mb-1">{target.title}</p>
                        <div className="flex flex-wrap gap-2">
                          {(['cards', 'dream'] as const).map(method => {
                            const issue = E.divinationIssue(state, target.kind, target.id, method, 'self');
                            return <button key={method} disabled={!!issue} title={issue ?? ''}
                              className="text-violet-200/80 disabled:opacity-35"
                              onClick={() => runAction(s => E.performDivination(s, target.kind, target.id, method, 'self'))}>
                              自行{method === 'cards' ? '纸牌' : '梦境'}占卜
                            </button>;
                          })}
                          {(['nelson', 'evelyn'] as const).map(provider => {
                            const issue = E.divinationIssue(state, target.kind, target.id, 'cards', provider);
                            return <button key={provider} disabled={!!issue} title={issue ?? ''}
                              className="text-sky-200/80 disabled:opacity-35"
                              onClick={() => runAction(s => E.performDivination(s, target.kind, target.id, 'cards', provider))}>
                              请{provider === 'nelson' ? '尼尔逊代占（2苏勒）' : '伊芙琳代占'}
                            </button>;
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  {state.divinationInsights.length > 0 && <div className="mt-2 rounded border border-stone-800 p-2 text-[11px] text-stone-500">
                    <p className="text-stone-300 mb-1">占卜记录</p>
                    {state.divinationInsights.slice(-5).reverse().map(insight => <p key={insight.id}>· {insight.text}</p>)}
                  </div>}
                </div>
              )}

              {/* 凡人认知与官方不眠者路线 */}
              {!beyonder && state.awareness === 'ordinary' && (
                <div className="mt-3 border-t border-stone-800 pt-3">
                  <h3 className="panel-title">地方见闻</h3>
                  {nightwatchRoute.routeStep !== 'public_rumor' ? (
                    <>
                      <p className="text-xs text-stone-500 leading-5 mb-2">
                        你尚不知道任何确定的超自然入口。若对城中怪谈好奇，可以先从地方报纸与市政失修记录查起；这只会得到世俗线索。
                      </p>
                      <button className="w-full py-2 rounded border border-stone-500/50 text-stone-200 hover:bg-stone-100/5 text-sm"
                        onClick={() => runAction(s => E.researchClocktowerRumors(s))}>
                        查阅地方报纸与市政记录 <small className="block text-stone-500">2h · 只核对公开资料</small>
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-stone-500 leading-5 mb-2">
                        公开记录只显示旧钟楼附近有多起夜间扰民与失踪传闻。它们不能证明超自然现象；你可以继续比对档案，也可以在深夜尝试实地追踪。
                      </p>
                      {clocktowerClues.length > 0 && <div className="mb-2 rounded border border-stone-800 p-2 text-[11px] text-stone-500">
                        <p className="text-stone-300 mb-1">调查笔记</p>
                        {clocktowerClues.map(record => {
                          const clue = CLUE_DEFS.find(def => def.id === record.id);
                          return <p key={record.id}>· {clue?.title ?? record.id} <span className="text-stone-600">— {clue?.sourceLabel ?? record.sourceId}</span></p>;
                        })}
                      </div>}
                      {!E.hasClue(state, 'clocktower_repair_orders') && (() => {
                        const issue = E.compareClocktowerRepairRecordsIssue(state);
                        return <button disabled={!!issue} title={issue ?? ''}
                          className="w-full mb-2 py-2 rounded border border-sky-300/30 text-sky-100/80 hover:bg-sky-100/5 text-sm disabled:opacity-40"
                          onClick={() => runAction(s => E.compareClocktowerRepairRecords(s))}>
                          比对市政维修工单 <small className="block text-stone-500">9:00–17:00 · 2h · 工程档案室</small>
                        </button>;
                      })()}
                      <button disabled={!E.isClocktowerTraceHours(state.hour)}
                        title={E.isClocktowerTraceHours(state.hour) ? '' : '开放时间：22:00至凌晨2:00'}
                        className="w-full py-2 rounded border border-amber-200/40 text-amber-100/90 hover:bg-amber-100/5 text-sm disabled:opacity-40"
                        onClick={() => runAction(s => E.traceClocktowerAnomaly(s))}>
                        追查旧钟楼异响 <small className="block text-stone-500">仅22:00–2:00 · 所需时间视调查进展</small>
                      </button>
                    </>
                  )}
                </div>
              )}

              {!beyonder && state.awareness === 'witness' && (
                <div className="mt-3 border-t border-stone-800 pt-3">
                  <h3 className="panel-title">异常记录 · 亲历者</h3>
                  <p className="text-xs text-stone-400 leading-5 mb-2">
                    你持有一枚染着冷灰的铜质铭牌。它只能证明事情不正常，不能让你获得灵视、配方或能力。
                  </p>
                  <button disabled={!!E.officialTimingIssue(state, 'report')}
                    title={E.officialTimingIssue(state, 'report') ?? ''}
                    className="w-full py-2 rounded border border-sky-300/40 text-sky-100/90 hover:bg-sky-100/5 text-sm disabled:opacity-40"
                    onClick={() => runAction(s => E.reportAnomalyToEvelyn(s))}>
                    携证物向伊芙琳上报 <small className="block text-stone-500">办理时段9:00–17:00 · 2h</small>
                  </button>
                </div>
              )}

              {!beyonder && state.awareness === 'informed' && (
                <div className="mt-3 border-t border-stone-800 pt-3">
                  <h3 className="panel-title">官方接触记录 · 不眠者</h3>
                  <p className="text-xs text-stone-500 leading-5 mb-2">
                    来源：圣塞缪尔教堂值夜者 · 当前节点：{
                      ({ reported: '可申请候选审查', screening_scheduled: '等待保密面谈', interview_passed: '等待夜间观察勤务', offer_pending: '审查通过，待确认加入', member: '已加入，待查看组织库存', committed: '途径已锁定', declined: '已拒绝，可重新申请' } as Record<string, string>)[nightwatchRoute.routeStep] ?? nightwatchRoute.routeStep
                    }
                  </p>

                  {['reported', 'declined'].includes(nightwatchRoute.routeStep) && (() => {
                    const missing = E.officialScreeningMissing(state);
                    const timing = E.officialTimingIssue(state, 'screening');
                    return <>
                      <p className="text-[11px] text-stone-500 mb-1">审查条件：精神稳定、未受明显侵蚀、非在逃身份；9:00–17:00办理。</p>
                      <button className="w-full py-2 rounded border border-sky-300/40 text-sm disabled:opacity-40"
                        disabled={missing.length > 0 || !!timing} title={[...missing, timing].filter(Boolean).join('、')}
                        onClick={() => runAction(s => E.requestOfficialScreening(s))}>
                        申请候选审查{missing.length ? `（缺：${missing.join('、')}）` : timing ? `（等待：${timing}）` : ''}
                      </button>
                      {state.stats.cor > 15 && (() => {
                        const stabilizationIssue = E.officialStabilizationIssue(state);
                        return <div className="mt-2 rounded border border-emerald-300/25 p-2">
                          <p className="text-[11px] text-stone-500 mb-1">状态不稳不会永久锁死：官方会分阶段观察，每日最多一次，直到确认你恢复到安全范围。</p>
                          <button disabled={!!stabilizationIssue} title={stabilizationIssue ?? ''}
                            className="w-full py-2 rounded border border-emerald-300/40 text-emerald-100/90 text-sm disabled:opacity-40"
                            onClick={() => runAction(s => E.undergoOfficialStabilization(s))}>
                            接受官方稳定观察 <small className="block text-stone-500">9:00–17:00 · 2h{stabilizationIssue ? ` · ${stabilizationIssue}` : ''}</small>
                          </button>
                        </div>;
                      })()}
                    </>;
                  })()}

                  {nightwatchRoute.routeStep === 'screening_scheduled' && (() => {
                    const timing = E.officialTimingIssue(state, 'interview');
                    return <button disabled={!!timing} title={timing ?? ''}
                      className="w-full py-2 rounded border border-sky-300/40 text-sm disabled:opacity-40"
                      onClick={() => runAction(s => E.attendOfficialInterview(s))}>
                      参加保密面谈 <small className="block text-stone-500">申请次日起 · 9:00–17:00 · 2h{timing ? ` · ${timing}` : ''}</small>
                    </button>;
                  })()}

                  {nightwatchRoute.routeStep === 'interview_passed' && (() => {
                    const timing = E.officialTimingIssue(state, 'night_watch');
                    return <button disabled={!!timing} title={timing ?? ''}
                      className="w-full py-2 rounded border border-sky-300/40 text-sm disabled:opacity-40"
                      onClick={() => runAction(s => E.completeOfficialNightWatch(s))}>
                      完成封锁线观察勤务 <small className="block text-stone-500">面谈次日起 · 18:00–2:00 · 4h{timing ? ` · ${timing}` : ''}</small>
                    </button>;
                  })()}

                  {nightwatchRoute.status === 'qualified' && nightwatchRoute.routeStep === 'offer_pending' && (
                    <div className="space-y-2">
                      <p className="text-xs text-amber-100/80 leading-5">第一次确认：阅读不眠者途径、保密、夜间调遣与定期评估义务。此步不会锁定途径。</p>
                      <button disabled={!!E.officialTimingIssue(state, 'offer')}
                        title={E.officialTimingIssue(state, 'offer') ?? ''}
                        className="w-full py-2 rounded border border-amber-200/50 text-sm disabled:opacity-40"
                        onClick={() => runAction(s => E.acceptOfficialOffer(s))}>我已理解报价，进入最终确认</button>
                      <button disabled={!!E.officialTimingIssue(state, 'offer')}
                        title={E.officialTimingIssue(state, 'offer') ?? ''}
                        className="w-full py-1 text-xs text-stone-500 hover:text-stone-300 disabled:opacity-40"
                        onClick={() => runAction(s => E.declineOfficialOffer(s))}>拒绝报价，继续普通生活</button>
                    </div>
                  )}

                  {nightwatchRoute.status === 'member' && (
                    <div className="space-y-2 rounded border border-purple-400/40 p-3">
                      <p className="text-xs text-purple-100/90 leading-5">你已加入值夜者，但尚未选择途径。只有此时才能查看组织实际库存。</p>
                      <p className="text-xs text-stone-400">可提供：{E.getOrganizationOffers(state, 'nightwatch').map(id => findPathway(id)?.name).join('、')}</p>
                      <button className="w-full py-2 rounded border border-purple-300/40 text-sm"
                        onClick={() => runAction(s => E.openOrganizationOffers(s, 'nightwatch'))}>查看正式途径报价</button>
                      <button disabled={!!E.officialTimingIssue(state, 'offer')}
                        title={E.officialTimingIssue(state, 'offer') ?? ''}
                        className="w-full py-1 text-xs text-stone-500 hover:text-stone-300 disabled:opacity-40"
                        onClick={() => runAction(s => E.declineOfficialOffer(s))}>尚未签署，退出候选流程</button>
                    </div>
                  )}

                  {nightwatchRoute.status === 'offer_pending' && (
                    <div className="space-y-2 rounded border border-purple-400/40 p-3">
                      <p className="text-xs text-purple-100/90">第二次确认：从值夜者掌握的途径中锁定一条。选择不可跨组织串用。</p>
                      {E.getOrganizationOffers(state, 'nightwatch').map(pathwayId => (
                        <button key={pathwayId} className="w-full py-2 rounded bg-purple-600/80 hover:bg-purple-500/80 text-sm"
                          onClick={() => runAction(s => E.commitOrganizationPathway(s, 'nightwatch', pathwayId))}>
                          锁定 {findPathway(pathwayId)?.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {nightwatchRoute.status === 'committed' && (
                    <div className="space-y-2">
                      <p className="text-xs text-emerald-200/70 leading-5">已锁定{findPathway(nightwatchRoute.selectedPathway ?? '')?.name}。教会提供经过检验的成品魔药；不发放完整配方，也不需要自行购买材料。</p>
                      <button disabled={!!E.officialTimingIssue(state, 'dose')}
                        title={E.officialTimingIssue(state, 'dose') ?? ''}
                        className="w-full py-2 rounded bg-purple-600/80 hover:bg-purple-500/80 text-sm disabled:opacity-40"
                        onClick={() => runAction(s => E.drinkOfficialDose(s, nightwatchRoute.selectedPathway))}>在伊芙琳监督下服食组织成品魔药</button>
                    </div>
                  )}
                </div>
              )}

              {!beyonder && nightwatchRoute.history.some(record => record.step === 'public_records') && !state.diaryPages.diary_org_rules.acquired && (
                <div className="mt-3 border-t border-stone-800 pt-3">
                  <button className="w-full py-1.5 rounded border border-sky-300/30 text-sky-100/80 text-xs"
                    onClick={() => runAction(s => E.discoverDiaryPage(s, 'diary_org_rules'))}>
                    回到教区公开档案，检查夹着的可疑纸页
                  </button>
                </div>
              )}

              {!beyonder && (
                <div className="mt-3 border-t border-stone-800 pt-3 space-y-3">
                  <h3 className="panel-title">线索档案 / 组织关系</h3>
                  <p className="text-xs text-stone-500">可以在加入前核验多个组织；全局只能加入一个组织，并最终承诺一条该组织实际掌握的途径。</p>
                  {ORGANIZATIONS.filter(org => {
                    if (org.id === 'nightwatch') return false;
                    const def = ORGANIZATION_LEAD_DEFS.find(item => item.organizationId === org.id)!;
                    return state.leads[def.id].stage !== 'unknown' || state.organizationRoutes[org.id].status !== 'unknown';
                  }).map(org => {
                    const orgId = org.id as OrganizationId;
                    const def = ORGANIZATION_LEAD_DEFS.find(item => item.organizationId === org.id)!;
                    const lead = state.leads[def.id];
                    const route = state.organizationRoutes[orgId];
                    const contactName = NPCS.find(npc => npc.id === def.contactNpc)?.name ?? def.contactNpc;
                    const identified = ['identified', 'verified'].includes(lead.stage) || route.status !== 'unknown';
                    const pathLead = route.selectedPathway ? state.pathwayLeads[route.selectedPathway] : undefined;
                    const sources = route.selectedPathway ? Object.values(state.materialSources).filter(source => source.pathwayId === route.selectedPathway && source.unlocked) : [];
                    return (
                      <div key={org.id} className="rounded border border-stone-700 p-3 text-xs space-y-2">
                        <div className="flex justify-between gap-2"><span className="text-stone-200">{identified ? org.name : '来源不明的隐秘线索'}</span><span className="text-stone-500">{route.status === 'unknown' ? '尚未建立组织接触' : route.status}</span></div>
                        <p className="text-stone-500">{identified ? `来源：${def.source} · 地点：${def.place} · 鉴定/引荐：${contactName}` : `当前只知道：${def.publicLabel}。整理前无法判断组织、联系人或途径。`}</p>
                        <p className="text-stone-500">线索阶段：{lead.stage}{identified && lead.notes.length ? ` · ${lead.notes.at(-1)}` : ''}</p>
                        {lead.stage === 'found' && <button className="text-sky-200/80" onClick={() => runAction(s => E.decodeOrganizationEvidence(s, orgId))}>整理/译读原始线索</button>}
                        {lead.stage === 'decoded' && <p className="text-sky-200/70">下一步：在相关人物按作息在场且与你建立足够信任时，请其当面辨认。</p>}
                        {lead.stage === 'identified' && <button className="text-emerald-200/80" onClick={() => runAction(s => E.verifyOrganizationEvidence(s, orgId))}>完成外围真实性核验</button>}
                        {lead.stage === 'verified' && route.status === 'unknown' && <button className="text-emerald-200/80" onClick={() => runAction(s => E.contactOrganization(s, orgId))}>建立正式组织接触</button>}
                        {route.status === 'contacted' && <button className="text-amber-200/80" onClick={() => runAction(s => E.completeOrganizationQualification(s, orgId))}>完成资格任务：{org.qualification}（3h）</button>}
                        {route.status === 'qualified' && <><p className="text-stone-400">成员义务：{org.membership}</p><button className="text-purple-200/80" onClick={() => runAction(s => E.joinOrganization(s, orgId))}>第一次确认：接受义务并加入</button></>}
                        {route.status === 'member' && <>
                          <p className="text-stone-400">成员可见库存：{E.getOrganizationOffers(state, orgId).map(id => findPathway(id)?.name).join('、')}</p>
                          <button className="text-purple-200/80" onClick={() => runAction(s => E.openOrganizationOffers(s, orgId))}>查看正式报价</button>
                          <button className="ml-3 text-stone-500" onClick={() => runAction(s => E.leaveOrganization(s, orgId))}>退出组织（不带走资源）</button>
                        </>}
                        {route.status === 'offer_pending' && <div className="space-y-1">
                          <p className="text-purple-100/80">第二次确认：选择该组织库存内的一条途径</p>
                          {E.getOrganizationOffers(state, orgId).map(pathwayId => <button key={pathwayId} className="block text-purple-200/80" onClick={() => runAction(s => E.commitOrganizationPathway(s, orgId, pathwayId))}>锁定 {findPathway(pathwayId)?.name}</button>)}
                          <button className="text-stone-500" onClick={() => runAction(s => E.leaveOrganization(s, orgId))}>拒绝报价并退出（不带走资源）</button>
                        </div>}
                        {route.status === 'committed' && route.selectedPathway && <div className="space-y-1 border-t border-stone-800 pt-2">
                          <p className="text-emerald-200/70">已锁定：{findPathway(route.selectedPathway)?.name} · 准备：{pathLead?.preparationMode}</p>
                          {pathLead?.preparationMode === 'official_dose' ? (
                            <button className="text-purple-200/80" onClick={() => runAction(s => E.drinkOfficialDose(s, route.selectedPathway!))}>接受组织监督的成品魔药</button>
                          ) : <>
                            {sources.map(source => <p key={source.sourceId} className="text-amber-200/70">{findItem(source.itemId)?.name}：前往【{LOCATIONS.find(location => location.id === source.locationId)?.name}】的定向来源（剩余{source.remaining}）</p>)}
                            <button disabled={!E.canDrink(state, route.selectedPathway).ok} className="text-purple-200/80 disabled:opacity-40" onClick={() => runAction(s => E.drinkPotion(s, route.selectedPathway!))}>
                              在组织监督下调配并服食{E.canDrink(state, route.selectedPathway).ok ? '' : `（${E.canDrink(state, route.selectedPathway).missing.join('、')}）`}
                            </button>
                          </>}
                        </div>}
                      </div>
                    );
                  })}
                  {!ORGANIZATIONS.some(org => org.id !== 'nightwatch' && (() => {
                    const def = ORGANIZATION_LEAD_DEFS.find(item => item.organizationId === org.id)!;
                    return state.leads[def.id].stage !== 'unknown' || state.organizationRoutes[org.id].status !== 'unknown';
                  })()) && <p className="text-xs text-stone-600">尚未发现可归档的隐秘组织线索。可信的人脉与实际地点调查可能带来新记录。</p>}
                </div>
              )}

              {!beyonder && (
                <div className="mt-3 border-t border-stone-800 pt-3 space-y-2">
                  <h3 className="panel-title">罗塞尔日记</h3>
                  <p className="text-xs text-stone-500">你能直接读懂页面文字；字面译读、真伪鉴定与可操作核验是三件不同的事。</p>
                  {ROSELLE_DIARY_PAGE_DEFS.filter(def => state.diaryPages[def.id].acquired).map(def => {
                    const page = state.diaryPages[def.id];
                    return <div key={def.id} className="rounded border border-stone-700 p-2 text-xs">
                      <div className="flex justify-between"><span className="text-stone-200">{def.title}</span><span className="text-stone-500">{page.decoded ? page.authenticity : '未译读'}</span></div>
                      <p className="text-stone-500">来源：{def.source} · 操作核验：{page.operationalVerified ? '已完成' : '未完成'}</p>
                      {page.acquired && !page.decoded && <button className="text-sky-200/80" onClick={() => runAction(s => E.decodeDiaryPage(s, def.id))}>译读中文内容</button>}
                      {page.decoded && page.authenticity === 'unknown' && (() => {
                        const issue = E.diaryAuthenticationIssue(state, def.id, 'nelson');
                        return <button disabled={!!issue} title={issue ?? ''} className="text-emerald-200/80 disabled:opacity-40" onClick={() => runAction(s => E.authenticateDiaryPage(s, def.id, 'nelson'))}>请老尼尔逊鉴定纸张与笔迹{issue ? ` · ${issue}` : ''}</button>;
                      })()}
                      {page.authenticity === 'authentic' && !page.operationalVerified && (
                        <button className="block text-purple-200/80" onClick={() => runAction(s => E.verifyDiaryPageOperationally(s, def.id, def.id === 'diary_org_rules' ? 'evelyn' : 'nelson'))}>用独立来源完成操作交叉核验</button>
                      )}
                      {page.authenticity === 'forged' && <p className="text-red-300/70">已确认伪作：永久不能通过操作核验。</p>}
                    </div>;
                  })}
                  {!ROSELLE_DIARY_PAGE_DEFS.some(def => state.diaryPages[def.id].acquired) && <p className="text-xs text-stone-600">尚未取得任何页面。可疑纸页只会在对应公开档案、冒险地点或黑市人脉处出现。</p>}
                </div>
              )}

              {/* 晋升（非凡者） */}
              {beyonder && (
                <div className="mt-3 border-t border-stone-800 pt-3">
                  <h3 className="panel-title">晋升</h3>
                  {state.sequence === 9 ? (
                    (() => {
                      const progress = state.sequence8Progress;
                      const actingDef = SEQUENCE8_ACTING_DEFS[state.pathwayId as keyof typeof SEQUENCE8_ACTING_DEFS];
                      const ritualDef = SEQUENCE8_RITUAL_DEFS[state.pathwayId as keyof typeof SEQUENCE8_RITUAL_DEFS];
                      const reviewMissing = E.sequence8ReviewMissing(state);
                      const seq8Sources = Object.values(state.materialSources).filter(source => source.pathwayId === state.pathwayId && source.targetSequence === 8);
                      const remainingWindow = progress?.ritual.readyUntilHour === undefined ? null : progress.ritual.readyUntilHour - ((state.day - 1) * 24 + state.hour);
                      return <div className="space-y-3 text-xs">
                        <div className="rounded border border-stone-700 p-2">
                          <p className="text-purple-100/90">① 三原则证据与消化</p>
                          {actingDef.principles.map(principle => <p key={principle.id} className="text-stone-500">{principle.name}：{sequenceEvidenceLabel(progress?.evidence[principle.id]?.length ?? 0, progress?.requiredEvidencePerPrinciple ?? 2)}</p>)}
                          <p className="text-stone-500">魔药适应：{state.digestion >= 100 ? '已趋于完整' : state.digestion >= 50 ? '正在稳定融合' : '仍在摸索'}{progress?.mistakes.length ? ' · 曾出现排斥记录' : ''}</p>
                        </div>
                        <div className="rounded border border-stone-700 p-2">
                          <p className="text-purple-100/90">② 所属组织审核</p>
                          {progress?.legacyIdentityAudit && <p className="text-amber-200/80">旧档身份审计：{ORGANIZATIONS.find(org => org.id === progress.organizationId)?.name ?? '对应途径组织'}将核对旧记录；这不会伪造组织成员身份。</p>}
                          <p className="text-stone-500">{reviewMissing.length ? reviewMissing.join('、') : '证据满足，可提交审核'}</p>
                          {progress?.stage !== 'review_pending' && progress?.formulaStatus !== 'verified' && <button disabled={reviewMissing.length > 0} className="text-purple-200/80 disabled:opacity-40" onClick={() => runAction(s => E.requestSeq8Review(s))}>{progress?.legacyIdentityAudit ? '提交旧档身份与序列8审核' : '提交序列8审核'}</button>}
                          {progress?.stage === 'review_pending' && <button className="text-purple-200/80" onClick={() => runAction(s => E.completeSeq8Review(s))}>{progress.legacyIdentityAudit ? '完成旧档身份审计与交叉复核' : '完成组织交叉复核'}</button>}
                          <p className="text-stone-500">配方状态：{progress?.formulaStatus ?? 'locked'}。旧配方必须重新审核，商店不出售序列8配方。</p>
                        </div>
                        <div className="rounded border border-stone-700 p-2">
                          <p className="text-purple-100/90">③ 定向材料</p>
                          {progress?.formulaStatus === 'verified' ? seq8Sources.map(source => <p key={source.sourceId} className="text-stone-500">{findItem(source.itemId)?.name}：{source.unlocked ? `前往${LOCATIONS.find(location => location.id === source.locationId)?.name}（剩余${source.remaining}）` : '未解锁'}</p>) : <p className="text-stone-600">审核完成前不显示精确材料来源。</p>}
                        </div>
                        <div className="rounded border border-stone-700 p-2 space-y-1">
                          <p className="text-purple-100/90">④ 稳定化情境</p>
                          {!progress?.ritual.planned && <button disabled={progress?.formulaStatus !== 'verified'} className="text-purple-200/80 disabled:opacity-40" onClick={() => runAction(s => E.planSeq8Ritual(s))}>制定三步情境计划</button>}
                          {progress?.ritual.planned && !progress.ritual.ready && ritualDef.steps.map((step, index) => <p key={step.id} className={progress.ritual.steps.length === index ? 'text-purple-100/90' : 'text-stone-600'}>
                            {index + 1}. {step.name}{progress.ritual.steps.length === index && <button className="ml-2 text-purple-200/80" onClick={() => runAction(s => E.performSeq8RitualStep(s, step.id))}>执行</button>}
                          </p>)}
                          {progress?.ritual.ready && <p className={remainingWindow !== null && remainingWindow >= 0 ? 'text-emerald-200/80' : 'text-red-300/80'}>情境窗口：{remainingWindow !== null && remainingWindow >= 0 ? `剩余${remainingWindow}小时` : '已过期，需重新制定'}{remainingWindow !== null && remainingWindow < 0 && <button className="ml-2" onClick={() => runAction(s => E.planSeq8Ritual(s))}>重新准备</button>}</p>}
                        </div>
                        <button disabled={!promote.ok} onClick={() => runAction(s => E.doPromote(s))}
                          className="w-full py-2 rounded bg-purple-500/80 hover:bg-purple-400/80 disabled:opacity-40 text-sm">
                          ✦ 晋升序列8{promote.ok ? '' : `（缺：${promote.missing.map(m => findItem(m)?.name ?? m).join('、')}）`}
                        </button>
                      </div>;
                    })()
                  ) : (
                    <p className="text-xs text-stone-500">你已是序列8。更高的序列将在后续版本开放。</p>
                  )}
                </div>
              )}
            </div>
          )}
        </main>

        {/* 右栏：委托板 + NPC 与交易 */}
        <aside className="space-y-3">
          {state.atWork ? (
            <section className="panel border-sky-300/30 text-center py-6">
              <h3 className="text-sm text-sky-200/90">工作期间不可处理外部事务</h3>
              <p className="text-xs text-stone-500 mt-2 leading-5">委托、人脉、交易与宿敌事务将在下班离开后恢复。</p>
            </section>
          ) : (
          <>
          {state.nemesis && (
            <section className="panel border-red-400/40">
              <h3 className="panel-title text-red-300/90">⚔️ 宿敌</h3>
              {state.nemesis.known ? (
                <div className="text-xs space-y-1">
                  <p className="text-red-200/90">{state.nemesis.name}（{state.nemesis.archetype}）</p>
                  <p className="text-stone-500 leading-4">{state.nemesis.motive}</p>
                  <p className="text-stone-400">威胁：{threatLabel(state.nemesis.power)} · 态度：{hostilityLabel(state.nemesis.hostility)}</p>
                </div>
              ) : (
                <p className="text-xs text-stone-400 leading-4">有人在暗中对付你——刺杀、诅咒、干扰，但你不知道对方是谁。对方的行动正变得越来越直接。</p>
              )}
              <div className="flex flex-wrap gap-2 mt-2 text-xs">
                {!state.nemesis.known && (
                  <button className="px-2 py-1 rounded border border-stone-600 hover:border-amber-200/60"
                    onClick={() => update(s => E.nemesisIntel(s))}>打听底细（2苏勒）</button>
                )}
                <button className="px-2 py-1 rounded border border-stone-600 hover:border-sky-300/60"
                  onClick={() => update(s => E.nemesisShelter(s))}>求教会庇护</button>
                {state.nemesis.known && (
                  <button className="px-2 py-1 rounded border border-red-400/60 text-red-200 hover:bg-red-400/10"
                    onClick={() => update(s => E.nemesisFight(s))}>做个了断（4h）</button>
                )}
              </div>
              {state.tags.includes('cursed') && (
                <button className="mt-2 text-xs text-purple-200/80 hover:text-purple-100"
                  onClick={() => update(s => E.removeCurse(s))}>解除诅咒（5苏勒，找尼尔逊）</button>
              )}
            </section>
          )}
          <section className="panel">
            <h3 className="panel-title">🍺 打听到的差事（从交谈中获得）</h3>
            {state.activeCommission ? (
              <div className="rounded border border-amber-200/40 p-2 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-amber-100/90">进行中：{state.activeCommission.title}</span>
                  <span className="text-red-300/80">剩{state.activeCommission.daysLeft}天</span>
                </div>
                <p className="text-stone-500 leading-4">{state.activeCommission.text}</p>
                <p className="text-stone-400">报酬 {E.fmtMoney(state.activeCommission.reward)} · 前往【{LOCATIONS.find(l => l.id === state.activeCommission!.locationId)?.name ?? '?'}】并调查</p>
                <button className="text-stone-500 hover:text-red-300" onClick={() => update(s => E.abandonCommission(s))}>放弃委托</button>
              </div>
            ) : (
              <ul className="space-y-2 text-xs">
                {visibleBoard.map(c => {
                  const client = E.findAnyNPC(state, c.client);
                  return (
                    <li key={c.id} className="rounded border border-stone-800 p-2">
                      <div className="flex justify-between">
                        <span className="text-stone-200">{c.title}</span>
                        <span className="text-amber-200/70">{E.fmtMoney(c.reward)}</span>
                      </div>
                      <p className="text-stone-500 leading-4 mt-0.5">{c.text}</p>
                      <div className="flex justify-between mt-1 text-stone-600">
                        <span>委托人：{client?.name ?? '?'} · 📍{LOCATIONS.find(l => l.id === c.locationId)?.name ?? '?'} · {c.daysLeft}天内有效</span>
                        <button className="text-amber-200/80 hover:text-amber-100" onClick={() => update(s => E.acceptCommission(s, c.id))}>接下</button>
                      </div>
                    </li>
                  );
                })}
                {!visibleBoard.length && <li className="text-stone-600 leading-5">还没人跟你提过去向明确的活儿。去「醉水手」找老板麦克喝一杯，或跟街上的人聊聊。</li>}
              </ul>
            )}
          </section>
          <section className="panel">
            <h3 className="panel-title">人脉（按作息表出现）</h3>
            <ul className="space-y-2 text-sm max-h-[38vh] overflow-y-auto">
              {E.allNPCs(state).map(n => {
                const ok = npcAvailable(n, state.day, state.hour);
                const loc = npcLocation(n, state.day, state.hour);
                const visibleNpcLocation = loc ? E.redactLockedLocationText(state, loc) : null;
                const fav = state.relations[n.id];
                const lv = relationLevel(fav);
                const relatedLeadDefs = ORGANIZATION_LEAD_DEFS.filter(def => def.organizationId !== 'nightwatch' && def.contactNpc === n.id);
                return (
                  <li key={n.id} className={`rounded border p-2 ${ok ? 'border-stone-700' : 'border-stone-800 opacity-50'}`}>
                    <div className="flex justify-between items-center">
                      <span className={ok ? 'text-stone-200' : 'text-stone-500'}>{fav === undefined ? `眼熟的${n.identity}` : n.name}</span>
                      <span className={`text-xs ${lv.cls}`}>{lv.label}</span>
                    </div>
                    <div className="text-xs text-stone-500">{fav === undefined ? '还没打过交道' : n.identity}{visibleNpcLocation ? ` · 📍${visibleNpcLocation}` : ' · 此刻不在常去处'}</div>
                    <div className="text-[10px] text-stone-600 leading-4 mt-0.5">{E.redactLockedLocationText(state, scheduleHint(n))}</div>
                    {ok && fav !== undefined && fav >= E.VISIT_FAVOR && (
                      <button className="mt-1 text-xs text-amber-200/80 hover:text-amber-100"
                        onClick={() => update(s => E.doSocial(s, n.id))}>
                        拜访交谈（1h）
                      </button>
                    )}
                    {ok && (fav === undefined || fav < E.VISIT_FAVOR) && (
                      <button className="mt-1 text-xs text-sky-200/80 hover:text-sky-100"
                        onClick={() => update(s => E.doChat(s, n.id))}>
                        {fav === undefined ? '上前攀谈结交（1h）' : '继续攀谈（1h）· 建立信任后可拜访'}
                      </button>
                    )}
                    {!beyonder && n.id === 'nelson' && !E.hasClue(state, 'manor_address') && state.leads.abraham_door_map.stage === 'unknown' && (() => {
                      const issue = E.requestManorAddressIssue(state);
                      return <button disabled={!!issue} title={issue ?? ''}
                        className="block mt-1 text-xs text-amber-200/80 disabled:opacity-40"
                        onClick={() => runAction(s => E.requestManorAddress(s))}>
                        请他在旧地图上指出一处少有人知道的旧宅
                      </button>;
                    })()}
                    {n.id === 'nelson' && !state.divinationTraining.cards && (() => {
                      const issue = E.learnCardDivinationIssue(state);
                      return <button disabled={!!issue} title={issue ?? ''}
                        className="block mt-1 text-xs text-violet-200/80 disabled:opacity-40"
                        onClick={() => runAction(s => E.learnCardDivination(s))}>
                        学习安全纸牌占卜
                      </button>;
                    })()}
                    {!beyonder && fav !== undefined && relatedLeadDefs.filter(def => def.entryMode === 'npc_background' && state.leads[def.id].stage === 'unknown').map(def => {
                      const orgId = def.organizationId as OrganizationId;
                      const issue = E.organizationEntryIssue(state, orgId);
                      return <button key={`entry:${def.id}`} disabled={!!issue} title={issue ?? ''}
                        className="block mt-1 text-xs text-amber-200/80 disabled:opacity-40"
                        onClick={() => runAction(s => E.discoverOrganizationEvidence(s, orgId))}>
                        询问一段敏感背景：{def.publicLabel}{issue ? ` · ${issue}` : ''}
                      </button>;
                    })}
                    {!beyonder && relatedLeadDefs.filter(def => state.leads[def.id].stage === 'decoded').map(def => {
                      const orgId = def.organizationId as OrganizationId;
                      const issue = E.organizationIdentificationIssue(state, orgId, n.id);
                      return <button key={`identify:${def.id}`} disabled={!!issue} title={issue ?? ''}
                        className="block mt-1 text-xs text-sky-200/80 disabled:opacity-40"
                        onClick={() => runAction(s => E.identifyOrganizationEvidence(s, orgId, n.id))}>
                        请其辨认这份来源不明的隐秘线索{issue ? ` · ${issue}` : ''}
                      </button>;
                    })}
                    {!beyonder && n.id === 'victor' && E.hasVisitedLocation(state, 'black_market') && !state.diaryPages.diary_false_formula.acquired && (() => {
                      const issue = E.diarySourceIssue(state, 'diary_false_formula');
                      return <button disabled={!!issue} title={issue ?? ''} className="block mt-1 text-xs text-sky-200/80 disabled:opacity-40" onClick={() => runAction(s => E.discoverDiaryPage(s, 'diary_false_formula'))}>
                        询问黑市纸摊流出的一张可疑纸页{issue ? ` · ${issue}` : ''}
                      </button>;
                    })()}
                  </li>
                );
              })}
            </ul>
          </section>

          {beyonder && shopAvailable && (
            <section className="panel border-amber-200/30">
              <h3 className="panel-title text-amber-100/90">🌒 黑市后巷（22:00–2:00）</h3>
              <button onClick={() => setShopOpen(v => !v)} className="text-xs text-amber-200/80 mb-2">
                {shopOpen ? '收起货架' : '看看维克多的货'}
              </button>
              {shopOpen && (
                <>
                  <ul className="space-y-1 text-xs max-h-56 overflow-y-auto">
                    {E.getShopInventory(state, 'black_market_stall').map(item => (
                      <li key={item.itemId} className="flex justify-between items-center gap-2" title={E.itemPresentation(state, item.itemId)?.description}>
                        <span className="text-stone-300">{findItem(item.itemId)?.name ?? item.itemId}</span>
                        <button className="text-amber-200/80 hover:text-amber-100 whitespace-nowrap"
                          onClick={() => runAction(s => E.buyFromShop(s, 'black_market_stall', item.itemId))}>
                          {E.fmtMoney(item.price)}
                        </button>
                      </li>
                    ))}
                    {!E.getShopInventory(state, 'black_market_stall').length && <li className="text-stone-600">当前没有组织授权给你的货单。序列8材料不会出现在通用货架。</li>}
                  </ul>
                </>
              )}
            </section>
          )}
          </>
          )}
        </aside>
      </div>
    </div>
  );
}
