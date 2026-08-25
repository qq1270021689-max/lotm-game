import { useMemo, useRef, useState, useEffect } from 'react';
import './App.css';
import type { GameState, SkillKey } from './game/types';
import { PATHWAYS, NPCS, ITEMS, ORIGINS, TALENTS, SKILL_NAMES, LOCATIONS, LOCATION_REGIONS, findPathway, findItem, npcAvailable, npcLocation, scheduleHint, weekdayOf, WEEKDAY_NAMES, INTEL_NAMES, KNOWLEDGE_NAMES, FORMULA_PRICE_NELSON, FORMULA_PRICE_BLACK, formulaName, companionSpec, COMPANION_MIN_FAVOR, STAT_NAMES } from './game/data';
import * as E from './game/engine';

const HOURS = ['0','1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20','21','22','23'];

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
                  <p className="text-xs text-emerald-300/70 mt-0.5">{t.effect}</p>
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
          <h3 className="sheet-title">技能（检定时 技能×4 计入判定值）</h3>
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
                  <span className={`text-xs ${lv.cls}`}>{lv.label}{fav !== undefined ? `（${fav}）` : ''}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h3 className="sheet-title">履历与持有</h3>
          <div className="text-xs text-stone-400 space-y-1 leading-5">
            <p>资金：{E.fmtMoney(state.pence)}（出身家境：{E.fmtMoney(origin.pence)}）</p>
            <p>配方：{state.formulas.length ? state.formulas.map(formulaName).join('、') : '无'}</p>
            <p>情报：{state.intel.length ? state.intel.map(i => INTEL_NAMES[i] ?? i).join('、') : '无'}</p>
            <p>知识：{state.knowledge.length ? state.knowledge.map(k => KNOWLEDGE_NAMES[k] ?? k).join('、') : '无'}</p>
            <p>物品：{Object.entries(state.items).filter(([, n]) => n > 0).map(([id, n]) => `${findItem(id)?.name ?? id}×${n}`).join('、') || '无'}</p>
          </div>
        </section>
      </div>
    </div>
  );
}

/** 配方购买区 */
function FormulaShop({ state, price, seller, sellerId, update }: { state: GameState; price: number; seller: string; sellerId?: string; update: (fn: (s: GameState) => void) => void }) {
  const beyonder = E.isBeyonder(state);
  const offers: string[] = beyonder
    ? (state.sequence === 9 && state.pathwayId && !state.formulas.includes(state.pathwayId + '8') ? [state.pathwayId + '8'] : [])
    : PATHWAYS.filter(p => !state.formulas.includes(p.id + '9')).map(p => p.id + '9');
  if (!offers.length) return null;
  return (
    <ul className="space-y-1 text-xs mt-1">
      {offers.map(fid => (
        <li key={fid} className="flex justify-between items-center gap-2">
          <span className="text-purple-200/80">🧪 {formulaName(fid)}</span>
          <button className="text-amber-200/80 hover:text-amber-100 whitespace-nowrap"
            onClick={() => update(s => E.buyFormula(s, fid, price, sellerId))}>
            {E.fmtMoney(price)}
          </button>
        </li>
      ))}
      <li className="text-stone-600">（{seller}的配方渠道）</li>
    </ul>
  );
}

export default function App() {
  const [state, setState] = useState<GameState | null>(() => E.loadGame());
  const [shopOpen, setShopOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [advOpen, setAdvOpen] = useState(false);
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
                <div className="text-xs text-emerald-200/60 mt-1">
                  {[
                    o.workPayMult && o.workPayMult !== 1 ? `打工收入×${o.workPayMult}` : '',
                    o.mealCost && o.mealCost > 6 ? `每日开销${o.mealCost}便士（体面负担）` : '',
                    o.exposureMult && o.exposureMult < 1 ? '暴露增速减缓' : '',
                    o.favors ? '自带人脉' : '',
                    o.knowledge ? '自带神秘学基础' : '',
                    o.items ? '自带物品' : '',
                    o.intel ? '自带情报' : '',
                  ].filter(Boolean).join(' · ') || '均衡的开局'}
                </div>
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
                  <span className="text-xs text-stone-500 ml-2">{t.effect}</span>
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
  const victorHere = npcAvailable(NPCS[0], state.day, state.hour);
  const shopAvailable = victorHere && state.hour >= 22;
  const nelsonHere = npcAvailable(NPCS[2], state.day, state.hour);
  const nelsonTrust = (state.relations.nelson ?? 0) >= 10;

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
              {state.timers.map(t => (
                <li key={t.id} className="flex justify-between">
                  <span>{t.label}</span>
                  <span className="text-amber-200/70">{Math.floor(t.hoursLeft / 24)}天{t.hoursLeft % 24}时</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="panel">
            <h3 className="panel-title">持有</h3>
            <ul className="text-xs space-y-1 text-stone-300 max-h-48 overflow-y-auto">
              {state.formulas.map(f => <li key={f} className="text-purple-200/80">🧪 {formulaName(f)}</li>)}
              {Object.entries(state.items).filter(([, n]) => n > 0).map(([id, n]) => (
                <li key={id} className="flex justify-between" title={findItem(id)?.desc}>
                  <span>{findItem(id)?.name ?? id}</span><span>×{n}</span>
                </li>
              ))}
              {state.intel.map(i => <li key={i} className="text-sky-300/80">🕵 {INTEL_NAMES[i] ?? i}</li>)}
              {state.knowledge.map(k => <li key={k} className="text-emerald-300/80">📖 {KNOWLEDGE_NAMES[k] ?? k}</li>)}
              {!state.formulas.length && !Object.values(state.items).some(n => n > 0) && !state.intel.length && !state.knowledge.length &&
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
          ) : (
            <div className="panel">
              <h3 className="panel-title">下一步行动</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <button className="act-btn" onClick={() => update(s => E.doWork(s))}>打工<small>4h · 赚钱</small></button>
                <button className={`act-btn ${advOpen ? 'border-amber-200/80 bg-amber-100/5' : ''}`} onClick={() => setAdvOpen(v => !v)}>冒险<small>选择地点前往</small></button>
                <button className="act-btn" disabled={!beyonder} title={beyonder ? '' : '普通人无法扮演'}
                  onClick={() => update(s => E.doAct(s))}>扮演<small>{beyonder ? '2h · 消化魔药' : '需成为非凡者'}</small></button>
                <button className="act-btn" onClick={() => update(s => E.doStudy(s))}>学习<small>2h · 神秘学</small></button>
                <button className="act-btn" onClick={() => update(s => E.doMeal(s))}>正餐<small>1h · −4便士</small></button>
                <button className="act-btn" onClick={() => update(s => E.doNap(s))}>小睡<small>1h · 精力+12</small></button>
                <button className="act-btn" onClick={() => update(s => E.doWander(s))}>闲逛<small>1h · 街头事件</small></button>
                <button className="act-btn" onClick={() => update(s => E.doTavern(s))}>去酒馆坐坐<small>2h · −6便士 · 结交人脉</small></button>
                <button className="act-btn border-sky-300/40" onClick={() => update(s => E.doSleep(s))}>
                  {state.pathwayId === 'sleepless' ? '静夜冥想' : '睡觉'}<small>{state.pathwayId === 'sleepless' ? '2h · 不眠者' : '至次日7:00'}</small>
                </button>
              </div>

              {/* 冒险地点选择器（按区域分组） */}
              {advOpen && (
                <div className="mt-3 border-t border-stone-800 pt-3">
                  <h3 className="panel-title">前往何处？</h3>
                  {/* 同行者选择 */}
                  {(() => {
                    const candidates = E.allNPCs(state).filter(n => (state.relations[n.id] ?? -999) >= COMPANION_MIN_FAVOR);
                    if (!candidates.length) return <p className="text-[11px] text-stone-600 mb-3 leading-4">独自前往。好感≥{COMPANION_MIN_FAVOR} 的熟人可受邀同行——委托检定时取全队属性最高值，但报酬要分ta三成。</p>;
                    return (
                      <div className="mb-3">
                        <h4 className="text-[11px] text-stone-500 tracking-widest mb-1.5">—— 同行者（检定取全队最高值，报酬分三成）——</h4>
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
                                {n.name} · {STAT_NAMES[spec.stat]}{spec.value}{free ? '' : '（不得空）'}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                  {LOCATION_REGIONS.map(region => (
                    <div key={region} className="mb-3">
                      <h4 className="text-[11px] text-stone-500 tracking-widest mb-1.5">—— {region} ——</h4>
                      <ul className="grid md:grid-cols-2 gap-2 text-xs">
                        {LOCATIONS.filter(l => l.region === region).map(l => {
                          const nightBlocked = l.nightOnly && !(state.hour >= 22 || state.hour < 2);
                          const isTarget = state.activeCommission?.locationId === l.id;
                          return (
                            <li key={l.id} className={`rounded border p-2 ${nightBlocked ? 'border-stone-800 opacity-50' : isTarget ? 'border-amber-200/60' : 'border-stone-700'}`}>
                              <div className="flex justify-between items-center">
                                <span className="text-stone-200">{isTarget ? '🎯 ' : ''}{l.name}</span>
                                <span className="text-stone-500">{l.hours}h · 危险{l.danger}</span>
                              </div>
                              <p className="text-stone-500 leading-4 mt-0.5">{l.desc}</p>
                              <div className="flex justify-between items-center mt-1">
                                <span className="text-stone-600">{l.nightOnly ? '仅22:00–2:00' : '随时可去'}</span>
                                <button disabled={nightBlocked}
                                  onClick={() => { setAdvOpen(false); update(s => E.doAdventure(s, l.id, companionId || undefined)); }}
                                  className="text-amber-200/80 hover:text-amber-100 disabled:opacity-40">
                                  前往 →
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {/* 服食魔药（普通人） */}
              {!beyonder && (
                <div className="mt-3 border-t border-stone-800 pt-3">
                  <h3 className="panel-title">非凡之路</h3>
                  {state.formulas.length === 0 ? (
                    <p className="text-xs text-stone-500 leading-5">
                      你还没有魔药配方。获得机缘的途径：在冒险中撞见非凡者的遗物、从老尼尔逊的后间求购（需他信任你）、或在黑市重金求购……
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {state.formulas.filter(f => f.endsWith('9')).map(fid => {
                        const p = findPathway(fid.slice(0, -1))!;
                        const chk = E.canDrink(state, p.id);
                        return (
                          <li key={fid} className="text-xs">
                            <div className="flex justify-between items-center">
                              <span className="text-purple-200/90">{p.name}·序列9「{p.seqNames[0]}」</span>
                              <button disabled={!chk.ok} onClick={() => update(s => E.drinkPotion(s, p.id))}
                                className="px-3 py-1 rounded bg-purple-500/80 hover:bg-purple-400/80 disabled:opacity-40">
                                服食魔药
                              </button>
                            </div>
                            <div className="text-stone-500 mt-0.5">
                              材料：{p.seq9.materials.map(m => (
                                <span key={m} className={(state.items[m] ?? 0) > 0 ? 'text-emerald-300/80' : 'text-red-300/70'}>
                                  {findItem(m)?.name}{(state.items[m] ?? 0) > 0 ? '✓' : '✗'}{'　'}
                                </span>
                              ))}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}

              {/* 晋升（非凡者） */}
              {beyonder && (
                <div className="mt-3 border-t border-stone-800 pt-3">
                  <h3 className="panel-title">晋升</h3>
                  {state.sequence === 9 ? (
                    <>
                      <button disabled={!promote.ok} onClick={() => update(s => E.doPromote(s))}
                        className="w-full py-2 rounded bg-purple-500/80 hover:bg-purple-400/80 disabled:opacity-40 text-sm">
                        ✦ 晋升序列8{promote.ok ? '' : `（缺：${promote.missing.map(m => findItem(m)?.name ?? m).join('、')}）`}
                      </button>
                      <p className="text-xs text-stone-500 mt-1">条件：消化度100% + 序列8配方 + 材料齐备。{pw?.seq8.ritual}</p>
                    </>
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
          {state.nemesis && (
            <section className="panel border-red-400/40">
              <h3 className="panel-title text-red-300/90">⚔️ 宿敌</h3>
              {state.nemesis.known ? (
                <div className="text-xs space-y-1">
                  <p className="text-red-200/90">{state.nemesis.name}（{state.nemesis.archetype}）</p>
                  <p className="text-stone-500 leading-4">{state.nemesis.motive}</p>
                  <p className="text-stone-400">威胁度 {state.nemesis.power} · 敌意 {state.nemesis.hostility}</p>
                </div>
              ) : (
                <p className="text-xs text-stone-400 leading-4">有人在暗中对付你——刺杀、诅咒、干扰，但你不知道对方是谁。敌意 {state.nemesis.hostility}</p>
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
                <p className="text-stone-400">报酬 {E.fmtMoney(state.activeCommission.reward)} · 前往【{LOCATIONS.find(l => l.id === state.activeCommission!.locationId)?.name ?? '?'}】冒险推进</p>
                <button className="text-stone-500 hover:text-red-300" onClick={() => update(s => E.abandonCommission(s))}>放弃委托</button>
              </div>
            ) : (
              <ul className="space-y-2 text-xs">
                {state.board.map(c => {
                  const client = E.findAnyNPC(state, c.client);
                  return (
                    <li key={c.id} className="rounded border border-stone-800 p-2">
                      <div className="flex justify-between">
                        <span className="text-stone-200">{c.occult ? '🜏 ' : ''}{c.title}</span>
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
                {!state.board.length && <li className="text-stone-600 leading-5">还没人跟你提过活儿。去「醉水手」找老板麦克喝一杯，或跟街上的人聊聊。</li>}
              </ul>
            )}
          </section>
          <section className="panel">
            <h3 className="panel-title">人脉（按作息表出现）</h3>
            <ul className="space-y-2 text-sm max-h-[38vh] overflow-y-auto">
              {E.allNPCs(state).map(n => {
                const ok = npcAvailable(n, state.day, state.hour);
                const loc = npcLocation(n, state.day, state.hour);
                const fav = state.relations[n.id];
                const lv = relationLevel(fav);
                return (
                  <li key={n.id} className={`rounded border p-2 ${ok ? 'border-stone-700' : 'border-stone-800 opacity-50'}`}>
                    <div className="flex justify-between items-center">
                      <span className={ok ? 'text-stone-200' : 'text-stone-500'}>{fav === undefined ? `眼熟的${n.identity}` : n.name}</span>
                      <span className={`text-xs ${lv.cls}`}>{lv.label}{fav !== undefined ? ` ${fav}` : ''}</span>
                    </div>
                    <div className="text-xs text-stone-500">{fav === undefined ? '还没打过交道' : n.identity}{loc ? ` · 📍${loc}` : ' · 此刻不在常去处'}</div>
                    <div className="text-[10px] text-stone-600 leading-4 mt-0.5">{scheduleHint(n)}</div>
                    {ok && fav !== undefined && fav >= E.VISIT_FAVOR && (
                      <button className="mt-1 text-xs text-amber-200/80 hover:text-amber-100"
                        onClick={() => update(s => E.doSocial(s, n.id))}>
                        拜访交谈（1h）
                      </button>
                    )}
                    {ok && (fav === undefined || fav < E.VISIT_FAVOR) && (
                      <button className="mt-1 text-xs text-sky-200/80 hover:text-sky-100"
                        onClick={() => update(s => E.doChat(s, n.id))}>
                        {fav === undefined ? '上前攀谈结交（1h）' : `攀谈（1h）· 好感≥${E.VISIT_FAVOR} 解锁拜访`}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {nelsonHere && nelsonTrust && (
            <section className="panel border-purple-300/30">
              <h3 className="panel-title text-purple-100/90">📚 老尼尔逊的后间</h3>
              <p className="text-xs text-stone-500">「看来你是认真的。那么——开个价吧。」（需好感≥10）</p>
              <FormulaShop state={state} price={FORMULA_PRICE_NELSON} seller="老尼尔逊" sellerId="nelson" update={update} />
            </section>
          )}

          {shopAvailable && (
            <section className="panel border-amber-200/30">
              <h3 className="panel-title text-amber-100/90">🌒 黑市后巷（22:00–2:00）</h3>
              <button onClick={() => setShopOpen(v => !v)} className="text-xs text-amber-200/80 mb-2">
                {shopOpen ? '收起货架' : '看看维克多的货'}
              </button>
              {shopOpen && (
                <>
                  <ul className="space-y-1 text-xs max-h-56 overflow-y-auto">
                    {ITEMS.filter(it => it.price > 0).map(it => (
                      <li key={it.id} className="flex justify-between items-center gap-2" title={it.desc}>
                        <span className="text-stone-300">{it.name}</span>
                        <button className="text-amber-200/80 hover:text-amber-100 whitespace-nowrap"
                          onClick={() => update(s => E.buyItem(s, it.id, it.price, 'victor'))}>
                          {E.fmtMoney(it.price)}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <FormulaShop state={state} price={FORMULA_PRICE_BLACK} seller="黑市" sellerId="victor" update={update} />
                </>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
