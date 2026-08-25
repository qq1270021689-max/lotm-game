import type { GameState, Effect, GameEvent, LogEntry, GenNPC } from './types';
import { EVENTS, NPCS, PATHWAYS, ORIGINS, SKILL_NAMES, LOCATIONS, findEvent, findItem, findPathway, formulaName, npcAvailable, npcLocation, companionSpec, COMPANION_MIN_FAVOR, STAT_NAMES } from './data';
import { generateNPC, generateCommission, spawnNemesis } from './gen';
import type { NPCDef } from './types';

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const rnd = (n: number) => Math.floor(Math.random() * n);

export const originOf = (s: GameState) => ORIGINS.find(o => o.id === s.originId) ?? ORIGINS[0];
export const hasTalent = (s: GameState, id: string) => s.talents.includes(id);
/** 全部 NPC = 手写核心 + 程序生成 */
export const allNPCs = (s: GameState): NPCDef[] => [...NPCS, ...s.genNpcs];
export const findAnyNPC = (s: GameState, id: string) => allNPCs(s).find(n => n.id === id);
const isNight = (h: number) => h >= 18 || h < 6;

// ============ 人脉阶段 ============
/** 好感达到该值才解锁「登门拜访」 */
export const VISIT_FAVOR = 20;
/** 是否已结识（relations 无记录 = 未结识的陌生人） */
export const isMet = (s: GameState, id: string) => s.relations[id] !== undefined;
/** 结交事件：与陌生人正式相识（叙事由调用方补充） */
export function acquaint(s: GameState, id: string, base: number) {
  if (isMet(s, id)) return;
  applyEffects(s, [{ k: 'favor', id, v: base }]);
}
function energyCost(s: GameState, base: number): number {
  return Math.round(base * (hasTalent(s, 'night_owl') && isNight(s.hour) ? 0.7 : 1));
}

// ============ 初始状态（普通人开局，出身+天赋+随机城市人口） ============
export function newGame(name: string, originId: string, talents: string[]): GameState {
  const origin = ORIGINS.find(o => o.id === originId) ?? ORIGINS[0];
  const genNpcs: GenNPC[] = [];
  for (let i = 0; i < 8; i++) genNpcs.push(generateNPC());
  const s: GameState = {
    started: true,
    playerName: name || '无名者',
    originId: origin.id,
    talents,
    pathwayId: null,
    sequence: null,
    day: 1,
    hour: 7,
    stats: { phy: 20, spi: 10, mnd: 20, cha: 20, san: 85, cor: 0, energy: 90 },
    pence: origin.pence,
    digestion: 0,
    exposure: 0,
    formulas: [],
    items: { ...(origin.items ?? {}) },
    intel: [...(origin.intel ?? [])],
    knowledge: [...(origin.knowledge ?? [])],
    studyProgress: 0,
    skills: { investigate: 0, combat: 0, speech: 0, occult: 0, sneak: 0 },
    nemesis: null,
    relations: {},
    tags: [...(origin.tags ?? [])],
    flags: {},
    timers: [
      {
        id: 'rent', label: '房租（玛尔塔婶婶）', hoursLeft: 7 * 24,
        effect: [{ k: 'flag', id: 'rent_due', v: 1 }], renewHours: 7 * 24,
      },
      { id: 'audit', label: '教会季度审查', hoursLeft: 30 * 24, effect: [{ k: 'flag', id: 'audit_now', v: 1 }], renewHours: 30 * 24 },
      { id: 'market', label: '黑市集会日', hoursLeft: 2 * 24, effect: [], renewHours: 3 * 24 },
    ],
    genNpcs,
    board: [],
    activeCommission: null,
    log: [],
    pendingEvent: null,
    pendingNpc: null,
    firedOnce: [],
    gameOver: null,
  };
  // 人脉：初始只认识房东婶婶与出身自带的关系；其余皆需「结交事件」开启
  s.relations.martha = 6;
  for (const [k, v] of Object.entries(origin.statMods)) {
    const key = k as keyof typeof s.stats;
    s.stats[key] = clamp(s.stats[key] + (v ?? 0));
  }
  for (const [npc, f] of Object.entries(origin.favors ?? {})) s.relations[npc] = f;
  if (talents.includes('spirit_affinity')) s.stats.spi = clamp(s.stats.spi + 5);
  if (talents.includes('sixth_sense')) s.stats.spi = clamp(s.stats.spi + 3);
  if (talents.includes('strong_body')) s.stats.phy = clamp(s.stats.phy + 6);

  addLog(s, `第1天清晨，你在东区的阁楼里睁开眼。【${origin.name}】——${origin.desc}`, 'system');
  addLog(s, `全部身家${fmtMoney(origin.pence)}，房租7天后到期。这座雾城表面平静，水面之下却有东西在动……活下去。至于会不会撞上「那个世界」——看机缘。`, 'info');
  addLog(s, '想赚外快就去「醉水手」坐坐——酒馆是这座城市的耳朵，老板麦克什么都听得见。', 'info');
  return s;
}

export function biography(s: GameState): string {
  const o = originOf(s);
  return `${s.playerName}，${o.name}。${o.desc}`;
}

// ============ 日志 ============
export function addLog(s: GameState, text: string, kind: LogEntry['kind'] = 'info') {
  s.log.push({ day: s.day, hour: s.hour, text, kind });
  if (s.log.length > 300) s.log.splice(0, s.log.length - 300);
}

// ============ 金钱格式化 ============
export function fmtMoney(pence: number): string {
  const sign = pence < 0 ? '−' : '';
  const abs = Math.abs(pence);
  const pounds = Math.floor(abs / 240);
  const soli = Math.floor((abs % 240) / 12);
  const p = abs % 12;
  const parts: string[] = [];
  if (pounds) parts.push(`${pounds}镑`);
  if (soli) parts.push(`${soli}苏勒`);
  if (p || !parts.length) parts.push(`${p}便士`);
  return sign + parts.join('');
}

export const isBeyonder = (s: GameState) => s.pathwayId !== null;

// ============ 条件检查 ============
export function checkCond(s: GameState, cond?: string): boolean {
  if (!cond) return true;
  return cond.split('&').every(c => checkSingle(s, c.trim()));
}
function checkSingle(s: GameState, c: string): boolean {
  if (c.includes('|')) return c.split('|').some(x => checkSingle(s, x.trim())); // 或条件
  if (c === 'mortal') return !isBeyonder(s);
  if (c === 'beyonder') return isBeyonder(s);
  if (c.startsWith('intel:')) return s.intel.includes(c.slice(6));
  if (c.startsWith('item:')) return (s.items[c.slice(5)] ?? 0) > 0;
  if (c.startsWith('tag:')) return s.tags.includes(c.slice(4));
  if (c.startsWith('flag:')) return !!s.flags[c.slice(5)];
  if (c.startsWith('formula:')) return s.formulas.includes(c.slice(8));
  const m = c.match(/^(\w+)(?::(\w+))?\s*(>=|<=|>|<|==)\s*(-?\d+)$/);
  if (!m) return true;
  const [, key, sub, op, raw] = m;
  const target = Number(raw);
  let val = 0;
  if (key === 'money') val = s.pence;
  else if (key === 'digestion') val = s.digestion;
  else if (key === 'exposure') val = s.exposure;
  else if (key === 'favor' && sub) val = s.relations[sub] ?? 0;
  else if (key in s.stats) val = s.stats[key as keyof typeof s.stats];
  else return true;
  switch (op) {
    case '>=': return val >= target;
    case '<=': return val <= target;
    case '>': return val > target;
    case '<': return val < target;
    case '==': return val === target;
  }
  return true;
}

// ============ 效果应用（含天赋/出身修正） ============
export function applyEffects(s: GameState, effects: Effect[]) {
  for (const e of effects) {
    let v = e.v ?? 0;
    switch (e.k) {
      case 'money': s.pence += v; break;
      case 'energy': s.stats.energy = clamp(s.stats.energy + v); break;
      case 'san':
        if (v < 0 && hasTalent(s, 'iron_nerves')) v = Math.ceil(v * 0.75);
        s.stats.san = clamp(s.stats.san + v); break;
      case 'cor': s.stats.cor = clamp(s.stats.cor + v); break;
      case 'digestion': s.digestion = clamp(s.digestion + v); break;
      case 'exposure': {
        const mult = originOf(s).exposureMult ?? 1;
        s.exposure = clamp(s.exposure + (v > 0 ? Math.ceil(v * mult) : v)); break;
      }
      case 'stat': if (e.stat) s.stats[e.stat] = clamp(s.stats[e.stat] + v, 1); break;
      case 'item': if (e.id) s.items[e.id] = Math.max(0, (s.items[e.id] ?? 0) + v); break;
      case 'favor':
        if (e.id) {
          if (v > 0 && hasTalent(s, 'silver_tongue')) v = Math.ceil(v * 1.5);
          s.relations[e.id] = clamp((s.relations[e.id] ?? 0) + v, -100);
        }
        break;
      case 'intel': if (e.id && !s.intel.includes(e.id)) s.intel.push(e.id); break;
      case 'knowledge': if (e.id && !s.knowledge.includes(e.id)) s.knowledge.push(e.id); break;
      case 'formula':
        if (e.id === 'random9') {
          const unknown = PATHWAYS.filter(p => !s.formulas.includes(p.id + '9'));
          if (unknown.length) {
            const pw = unknown[rnd(unknown.length)];
            s.formulas.push(pw.id + '9');
            addLog(s, `✦ 获得魔药配方：【${formulaName(pw.id + '9')}】`, 'good');
          }
        } else if (e.id && !s.formulas.includes(e.id)) {
          s.formulas.push(e.id);
        }
        break;
      case 'tag':
        if (e.id) {
          if (e.on === false) s.tags = s.tags.filter(t => t !== e.id);
          else if (!s.tags.includes(e.id)) s.tags.push(e.id);
        }
        break;
      case 'timer':
        if (e.id && !s.timers.some(t => t.id === e.id)) {
          s.timers.push({ id: e.id, label: e.timerLabel ?? e.id, hoursLeft: e.timerHours ?? 24, effect: e.timerEffect ?? [] });
        }
        break;
      case 'commission': {
        const c = generateCommission(s);
        if (s.board.length >= 5) s.board.shift(); // 线索簿最多记5桩
        s.board.push(c);
        const client = findAnyNPC(s, c.client);
        addLog(s, `✦ 打听到一桩差事：「${c.title}」（委托人：${client?.name ?? '?'}，${c.daysLeft}天内有效）`, 'good');
        break;
      }
      case 'flag':
        if (e.id) {
          s.flags[e.id] = e.v ?? 1;
          // 私吞析出特性 → 可能引来死者的同门复仇
          if (e.id === 'loot_char' && e.v === 1 && !s.nemesis && rnd(100) < 40) {
            s.nemesis = spawnNemesis(s, 'revenge');
            addLog(s, '⚠️ 你隐约听说有人在黑市打听「那具尸体的东西落到谁手里了」。麻烦找上门了。', 'bad');
          }
        }
        break;
      case 'gameover': break;
    }
  }
}

// ============ 时间推进 ============
export function advanceHours(s: GameState, hours: number) {
  for (let i = 0; i < hours; i++) {
    s.hour++;
    if (s.hour >= 24) {
      s.hour = 0;
      s.day++;
      dailySettlement(s);
    }
    tickTimers(s);
    if (s.gameOver) return;
  }
  checkGameOver(s);
}

function tickTimers(s: GameState) {
  for (const t of s.timers) {
    t.hoursLeft--;
    if (t.hoursLeft <= 0) {
      addLog(s, `⏳【${t.label}】到期了。`, 'bad');
      applyEffects(s, t.effect);
      resolveTimerFlags(s, t.id);
      if (t.renewHours) t.hoursLeft = t.renewHours;
      else s.timers = s.timers.filter(x => x.id !== t.id);
    }
  }
}

function resolveTimerFlags(s: GameState, timerId: string) {
  if (timerId === 'rent' && s.flags.rent_due) {
    s.flags.rent_due = 0;
    if (s.pence >= 240) {
      s.pence -= 240;
      addLog(s, `玛尔塔婶婶准时来收租。你交出1镑。（−1镑）`, 'bad');
    } else if (s.relations.martha >= 30) {
      s.relations.martha -= 15;
      addLog(s, `你付不起房租。玛尔塔婶婶看了你很久：「……宽限一周。就一周。」（好感大降）`, 'bad');
    } else {
      s.tags.push('homeless');
      addLog(s, `你付不起房租，行李被扔到了街上。【无家可归】：睡眠恢复减半。`, 'bad');
    }
  }
  if (timerId === 'market' && isBeyonder(s)) {
    forceEvent(s, 'secret_gathering');
  }
  if (timerId === 'audit' && s.flags.audit_now) {
    s.flags.audit_now = 0;
    if (!isBeyonder(s)) {
      addLog(s, '教会审查季到了。普查表格、例行问询——对普通人来说只是烦琐的官样文章。', 'system');
    } else if (s.exposure >= 50 || s.flags.church_suspect) {
      addLog(s, '⚠️ 教会审查季。你的名字显然已在值夜者的名单上……', 'bad');
      forceEvent(s, 'nighthawk_visit');
    } else {
      s.exposure = clamp(s.exposure + 3);
      addLog(s, '教会审查平稳过去。你的伪装还没破——但档案里关于你的记录又厚了一页。（暴露+3）', 'system');
    }
  }
}

/** 每日 00:00 世界推进 */
function dailySettlement(s: GameState) {
  const meal = originOf(s).mealCost ?? 6;
  if (s.pence >= meal) { s.pence -= meal; }
  else { s.stats.san = clamp(s.stats.san - 5); addLog(s, '你没钱吃饭。饥饿啃噬着你的胃和理智。（理智−5）', 'bad'); }
  if (s.stats.cor >= 70) {
    addLog(s, '⚠️ 污染在你体内低语。失控的边缘越来越近……', 'bad');
    if (rnd(100) < 25) { s.stats.san = clamp(s.stats.san - 6); addLog(s, '你在镜子里看到自己的影子慢了半拍。（理智−6）', 'bad'); }
  }
  if (s.pathwayId === 'sleepless' && rnd(100) < 50) s.stats.cor = clamp(s.stats.cor + 1);
  if (isBeyonder(s) && s.stats.cor >= 70) s.exposure = clamp(s.exposure + 2);

  // 宿敌的日常骚扰
  nemesisDaily(s);
  // 诅咒缠身：每日侵蚀
  if (s.tags.includes('cursed')) {
    applyEffects(s, [{ k: 'san', v: -3 }]);
    addLog(s, '黑猫的诅咒仍在：整日耳鸣、心悸、噩兆连连。（理智−3，需找人解除）', 'bad');
  }
  // 占卜干扰倒计时
  if (typeof s.flags.jammed === 'number' && s.flags.jammed > 0) s.flags.jammed = (s.flags.jammed as number) - 1;
  // 高污染招来呓语之主
  if (s.stats.cor >= 80 && !s.pendingEvent) forceEvent(s, 'true_creator_whispers');

  // 打听到的差事有保鲜期：每日衰减，过期作废
  if (s.board.length) {
    const before = s.board.length;
    for (const c of s.board) c.daysLeft--;
    s.board = s.board.filter(c => c.daysLeft > 0);
    if (s.board.length < before) addLog(s, '有几桩打听到的差事拖太久，已经凉了——委托人另找了别人。', 'system');
  }
  // 已接委托倒计时
  if (s.activeCommission) {
    s.activeCommission.daysLeft--;
    if (s.activeCommission.daysLeft <= 0) {
      const client = findAnyNPC(s, s.activeCommission.client);
      addLog(s, `⏳ 委托「${s.activeCommission.title}」超期了。${client?.name ?? '委托人'}很失望。（好感下降）`, 'bad');
      applyEffects(s, [{ k: 'favor', id: s.activeCommission.client, v: -6 }]);
      s.activeCommission = null;
    }
  }
  // NPC 际遇骰：生成池 NPC 的日常生活
  if (s.genNpcs.length && rnd(100) < 20) {
    const npc = s.genNpcs[rnd(s.genNpcs.length)];
    const fortune = [
      `${npc.name}（${npc.identity}）最近似乎手头宽裕了些。`,
      `听说${npc.name}病了两天，${npc.schedule[0].location}没见到人。`,
      `${npc.name}和人吵了一架，起因似乎是「${npc.motive}」。`,
    ];
    addLog(s, `👥 ${fortune[rnd(fortune.length)]}`, 'system');
  }

  const news = [
    '《贝克兰德晨报》：东区雾灾持续，市政厅提醒市民减少夜间出行。',
    '《塔索克报》：码头工会与资方谈判破裂，罢工一触即发。',
    '《贝克兰德晨报》：又一起失踪案。值夜者呼吁市民「相信教会」。',
    '《每日观察报》：黑面粉价格上涨，贫民区动荡加剧。',
  ];
  addLog(s, `📰 ${news[rnd(news.length)]}`, 'system');
  maybeTrigger(s, 'daily');
}

// ============ 事件系统 ============
function maybeTrigger(s: GameState, slot: string, npcId?: string, locationId?: string): boolean {
  const pool = EVENTS.filter(e => {
    if (e.slot !== slot) return false;
    if (npcId && e.npc !== npcId) return false;
    if (!npcId && e.npc) return false;
    if (e.locations && locationId && !e.locations.includes(locationId)) return false;
    if (e.once && s.firedOnce.includes(e.id)) return false;
    return checkCond(s, e.cond);
  });
  if (!pool.length) return false;
  const total = pool.reduce((a, e) => a + e.weight, 0);
  let roll = rnd(total);
  let picked: GameEvent = pool[0];
  for (const e of pool) { roll -= e.weight; if (roll < 0) { picked = e; break; } }
  s.pendingEvent = picked.id;
  s.pendingNpc = npcId ?? null;
  if (picked.once) s.firedOnce.push(picked.id);
  addLog(s, `▶ ${picked.text}`, 'event');
  return true;
}

function forceEvent(s: GameState, eventId: string) {
  const ev = findEvent(eventId);
  if (!ev || s.pendingEvent) return;
  if (ev.once && s.firedOnce.includes(ev.id)) return;
  s.pendingEvent = ev.id;
  s.pendingNpc = null;
  if (ev.once) s.firedOnce.push(ev.id);
  addLog(s, `▶ ${ev.text}`, 'event');
}

export function resolveChoice(s: GameState, choiceIndex: number) {
  const ev = s.pendingEvent ? findEvent(s.pendingEvent) : null;
  if (!ev) return;
  const validChoices = ev.choices.filter(c => checkCond(s, c.cond));
  const choice = validChoices[choiceIndex];
  if (!choice) return;
  applyEffects(s, choice.effects);
  addLog(s, `  → ${choice.result}`, choice.effects.some(e => (e.k === 'san' || e.k === 'cor' || e.k === 'money') && (e.v ?? 0) < 0) ? 'bad' : 'good');
  s.pendingEvent = null;
  s.pendingNpc = null;
  checkGameOver(s);
}

export function currentEvent(s: GameState): GameEvent | null {
  return s.pendingEvent ? findEvent(s.pendingEvent) ?? null : null;
}

// ============ 委托 ============
export function acceptCommission(s: GameState, id: string): ActionResult {
  if (s.activeCommission) return { ok: false, msg: '一次只能接一个委托。' };
  const c = s.board.find(x => x.id === id);
  if (!c) return { ok: false, msg: '委托已被人捷足先登。' };
  s.activeCommission = c;
  s.board = s.board.filter(x => x.id !== id);
  const client = findAnyNPC(s, c.client);
  if (client && !isMet(s, c.client)) {
    acquaint(s, c.client, 4);
    addLog(s, `✦ 结交：你按地址找到委托人${client.name}（${client.identity}）面谈了细节，算是正式认识。`, 'good');
  }
  addLog(s, `你揭下了「${c.title}」。委托人：${client?.name ?? '?'}（${c.daysLeft}天内完成，报酬${fmtMoney(c.reward)}）。—— 去「冒险」来推进委托。`, 'good');
  return { ok: true };
}

export function abandonCommission(s: GameState) {
  if (!s.activeCommission) return;
  addLog(s, `你放弃了委托「${s.activeCommission.title}」。`, 'bad');
  applyEffects(s, [{ k: 'favor', id: s.activeCommission.client, v: -4 }]);
  s.activeCommission = null;
}

// ============ 行动 ============
export interface ActionResult { ok: boolean; msg?: string }

export function doWork(s: GameState): ActionResult {
  if (s.stats.energy < 20) return { ok: false, msg: '精力不足，无法工作。' };
  if (s.hour >= 18) return { ok: false, msg: '太晚了，今天的工时已经结束。' };
  const mult = (originOf(s).workPayMult ?? 1) * (hasTalent(s, 'money_grubber') ? 1.2 : 1);
  const pay = Math.round(48 * mult);
  applyEffects(s, [{ k: 'money', v: pay }, { k: 'energy', v: -energyCost(s, 25) }]);
  addLog(s, `你在电报局工作了4小时。（+${fmtMoney(pay)}，精力−${energyCost(s, 25)}）`, 'info');
  advanceHours(s, 4);
  if (!s.gameOver && rnd(100) < 20) {
    // 工作中结识同事/同行
    let npc = s.genNpcs.find(n => !isMet(s, n.id));
    if (!npc && s.genNpcs.length < 14) { npc = generateNPC(); s.genNpcs.push(npc); }
    if (npc) {
      acquaint(s, npc.id, 3 + rnd(3));
      addLog(s, `✦ 结交：午休时你和${npc.name}（${npc.identity}）拼桌吃了饭，聊起各自的日子，算是认识了。`, 'good');
    }
  }
  if (!s.gameOver && rnd(100) < 45) maybeTrigger(s, 'work');
  return { ok: true };
}

export function doAdventure(s: GameState, locationId: string, companionId?: string): ActionResult {
  const loc = LOCATIONS.find(l => l.id === locationId);
  if (!loc) return { ok: false, msg: '未知地点。' };
  if (loc.nightOnly && !(s.hour >= 22 || s.hour < 2)) return { ok: false, msg: `${loc.name}只在深夜（22:00–2:00）张开。` };
  // 同行者校验：需信任（好感≥40）且此刻方便出门
  let comp: ReturnType<typeof findAnyNPC> = undefined;
  if (companionId) {
    const n = findAnyNPC(s, companionId);
    if (!n) return { ok: false, msg: '找不到这个人。' };
    if ((s.relations[companionId] ?? -999) < COMPANION_MIN_FAVOR) return { ok: false, msg: `${n.name}还没把你当自己人（好感≥${COMPANION_MIN_FAVOR} 才愿意同行）。` };
    if (!npcAvailable(n, s.day, s.hour)) return { ok: false, msg: `${n.name}此刻走不开——摸清ta的作息，挑ta得空的时候来邀。` };
    comp = n;
  }
  let cost = 6 + loc.hours * 8;
  if (s.pathwayId === 'hunter') cost -= 7;
  if (hasTalent(s, 'strong_body')) cost -= 5;
  cost = energyCost(s, cost);
  if (s.stats.energy < cost + 5) return { ok: false, msg: `精力不足（需${cost + 5}），这趟远门等于送死。` };
  applyEffects(s, [{ k: 'energy', v: -cost }]);
  const compSpec = comp ? companionSpec(comp) : null;
  addLog(s, comp
    ? `你约上${comp.name}（擅长${STAT_NAMES[compSpec!.stat]} ${compSpec!.value}），一同前往【${loc.name}】（往返${loc.hours}小时，危险度${loc.danger}）。${loc.desc}`
    : `你前往【${loc.name}】（往返${loc.hours}小时，危险度${loc.danger}）。${loc.desc}`, 'info');
  if (hasTalent(s, 'sixth_sense')) {
    const omen = ['后颈微凉——此行有凶险，量力而行。', '没什么特别的感觉，应该顺利。', '一种说不清的不安萦绕不去……今天最好避开雾浓的地方。'][rnd(3)];
    addLog(s, `（第六感）${omen}`, 'system');
  }
  if (isBeyonder(s) && rnd(100) < 50) applyEffects(s, [{ k: 'exposure', v: 1 }]);
  advanceHours(s, loc.hours);
  if (s.gameOver) return { ok: true };

  // 委托地点不符 → 提醒后按普通探索结算
  if (s.activeCommission && s.activeCommission.locationId !== locationId) {
    const target = LOCATIONS.find(l => l.id === s.activeCommission!.locationId);
    addLog(s, `（你接的委托「${s.activeCommission.title}」地点在【${target?.name ?? '?'}】，来这里帮不上忙。）`, 'system');
  }

  // 有进行中的委托且地点正确 → 确定性检定结算（无随机）
  if (s.activeCommission && s.activeCommission.locationId === locationId) {
    const c = s.activeCommission;
    const skillKey = ({ investigate: 'investigate', hunt: 'combat', escort: 'speech', collect: 'sneak' } as const)[c.kind];
    const skillLv = s.skills[skillKey] ?? 0;
    // 队伍检定：取队伍成员该属性的最高值作基础
    let base = s.stats[c.stat];
    let baseFrom = `你的${STAT_NAMES[c.stat]}${s.stats[c.stat]}`;
    if (comp && compSpec) {
      if (compSpec.stat === c.stat && compSpec.value > base) {
        base = compSpec.value;
        baseFrom = `${comp.name}的${STAT_NAMES[c.stat]}${compSpec.value}（全队最高）`;
      } else if (compSpec.stat !== c.stat) {
        base += 3;
        baseFrom = `你的${STAT_NAMES[c.stat]}${s.stats[c.stat]} + ${comp.name}从旁协助3`;
      }
    }
    let total = base + skillLv * 4;
    let pathBonus = 0;
    if (s.pathwayId === 'hunter' && c.stat === 'phy') pathBonus = 10;
    if (s.pathwayId === 'seer' && c.stat === 'spi') pathBonus = 8;
    if (s.pathwayId === 'spectator' && c.stat === 'cha') pathBonus = 8;
    if (s.pathwayId === 'apprentice' && c.kind === 'collect') pathBonus = 10;
    if (s.pathwayId === 'sleepless' && isNight(s.hour)) pathBonus += 8;
    total += pathBonus;
    let jam = 0;
    if (typeof s.flags.jammed === 'number' && s.flags.jammed > 0) { jam = 10; total -= 10; }
    if (s.stats.energy < 20) total -= 8;
    addLog(s, `委托检定「${c.title}」：${Math.round(total)} vs 难度${c.difficulty}（${baseFrom} + 技能${skillLv}×4${pathBonus ? ` + 途径${pathBonus}` : ''}${jam ? ' − 干扰10' : ''}）`, 'info');
    if (total >= c.difficulty) {
      const client = findAnyNPC(s, c.client);
      applyEffects(s, [{ k: 'money', v: c.reward }, { k: 'favor', id: c.client, v: 8 }]);
      if (c.occult) applyEffects(s, [{ k: 'cor', v: 3 }, { k: 'san', v: -2 }]);
      if (s.skills[skillKey] < 10) { s.skills[skillKey]++; addLog(s, `你的【${SKILL_NAMES[skillKey]}】技能在实践中精进了。（Lv.${s.skills[skillKey]}）`, 'good'); }
      addLog(s, `✦ 委托完成！${client?.name ?? '委托人'}痛快地付了钱。（+${fmtMoney(c.reward)}，委托人好感+8）${c.occult ? '只是过程中你瞥见了不该看的东西……（污染+3）' : ''}`, 'good');
      if (comp) {
        const cut = Math.round(c.reward * 0.3);
        applyEffects(s, [{ k: 'money', v: -cut }, { k: 'favor', id: comp.id, v: 4 }]);
        addLog(s, `${comp.name}分走了三成报酬（−${fmtMoney(cut)}）。共同出生入死一场，ta看你的眼神多了几分信任。（好感+4）`, 'info');
      }
      s.activeCommission = null;
      // 碰了非凡事务，可能惹上隐秘组织
      if (c.occult && !s.nemesis && rnd(100) < 30) {
        s.nemesis = spawnNemesis(s, 'occult');
        addLog(s, `⚠️ 回程路上你总觉得被什么视线黏着。有人盯上你了。`, 'bad');
      }
    } else {
      applyEffects(s, [{ k: 'san', v: -3 }]);
      if (comp) applyEffects(s, [{ k: 'favor', id: comp.id, v: -3 }]);
      if (s.skills[skillKey] < 10 && rnd(100) < 50) { s.skills[skillKey]++; }
      addLog(s, `✖ 检定失败——线索断了，对方比预想中棘手。（还剩${c.daysLeft}天；失败也是经验，技能有所感悟）${comp ? ` ${comp.name}陪你白跑一趟，颇有些怨言。（好感−3）` : ''}`, 'bad');
    }
    return { ok: true };
  }

  // 地点专属事件；若无事件，则按危险度结算一次探索收获
  const triggered = maybeTrigger(s, 'adventure', undefined, locationId);
  if (!triggered) {
    let loot = Math.round(10 + rnd(loc.danger));
    if (comp) loot = Math.round(loot * 1.3);
    applyEffects(s, [{ k: 'money', v: loot }]);
    addLog(s, comp
      ? `你和${comp.name}把${loc.name}翻了个底朝天，没有特别的遭遇，但两个人手快，收获比独行多些。（+${fmtMoney(loot)}）`
      : `你在${loc.name}仔细搜了一圈，没有特别的遭遇，捡/省出了些零碎。（+${fmtMoney(loot)}）`, 'info');
    if (comp) applyEffects(s, [{ k: 'favor', id: comp.id, v: 2 }]);
    if (loc.danger >= 50 && rnd(100) < 35) {
      applyEffects(s, [{ k: 'cor', v: 2 }, { k: 'san', v: -2 }]);
      addLog(s, '离开前，你总觉得暗处有什么在目送你。（污染+2，理智−2）', 'bad');
    }
  }
  return { ok: true };
}

export function doAct(s: GameState): ActionResult {
  if (!isBeyonder(s)) return { ok: false, msg: '你还没有踏入非凡世界，扮演无从谈起——先找到属于你的「机缘」。' };
  if (s.stats.energy < 15) return { ok: false, msg: '精力不足，无法专注扮演。' };
  const pw = findPathway(s.pathwayId);
  const gain = 3 + rnd(4);
  applyEffects(s, [{ k: 'digestion', v: gain }, { k: 'energy', v: -energyCost(s, 15) }, { k: 'money', v: 3 + rnd(6) }, { k: 'exposure', v: 1 }]);
  addLog(s, `你践行着【${pw?.seqNames[9 - (s.sequence ?? 9)]}】的扮演守则——「${pw?.actingHint}」（消化度+${gain}%，暴露微增）`, 'info');
  advanceHours(s, 2);
  if (!s.gameOver && rnd(100) < 35) maybeTrigger(s, 'act');
  if (!s.gameOver && s.digestion >= 100) addLog(s, '✦ 魔药已完全消化！集齐配方与材料后即可晋升序列8。', 'system');
  return { ok: true };
}

export function doStudy(s: GameState): ActionResult {
  if (s.stats.energy < 10) return { ok: false, msg: '太累读不进书。' };
  const hasNotes = (s.items.occult_notes ?? 0) > 0;
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, 10) }]);
  let progress = hasNotes ? 2 : 1;
  if (hasTalent(s, 'quick_wit')) progress += 1;
  if (hasTalent(s, 'spirit_affinity')) progress += 1;
  s.studyProgress += progress;
  addLog(s, hasNotes ? '你研读《神秘学札记》。' : '你凭记忆温习听来的神秘学常识（有札记可翻倍）。', 'info');
  if (s.studyProgress >= 6) {
    s.studyProgress = 0;
    const kn = ['ritual_basic', 'spirit_vision', 'potion_brew'].find(k => !s.knowledge.includes(k));
    if (kn) { s.knowledge.push(kn); applyEffects(s, [{ k: 'stat', stat: 'spi', v: 2 }]); addLog(s, '✦ 你掌握了新的神秘学知识，灵性强韧了。（灵性+2）', 'good'); }
    else if (s.skills.occult < 10) { s.skills.occult++; addLog(s, `神秘学技能精进。（Lv.${s.skills.occult}）`, 'good'); }
    // 破译密文残页：有神秘学基础 + 一次完整研读
    if ((s.items.cryptic_note ?? 0) > 0 && (s.knowledge.includes('ritual_basic') || s.skills.occult >= 1)) {
      s.items.cryptic_note--;
      const unknown = PATHWAYS.filter(p => !s.formulas.includes(p.id + '9'));
      if (unknown.length) {
        const pw = unknown[rnd(unknown.length)];
        s.formulas.push(pw.id + '9');
        addLog(s, `✦ 破译成功！那些蠕动的字迹在你眼中归位——那张手抄纸是一份【${formulaName(pw.id + '9')}】！`, 'good');
      } else {
        addLog(s, '你破译了那张手抄纸，但上面的配方你已经有了。', 'info');
      }
    }
  }
  advanceHours(s, 2);
  if (!s.gameOver && rnd(100) < 30) maybeTrigger(s, 'study');
  return { ok: true };
}

/** 攀谈：在对方当前所在的公开场合搭话。陌生人会触发「结交事件」，初识则慢慢加深印象。 */
export function doChat(s: GameState, npcId: string): ActionResult {
  const npc = findAnyNPC(s, npcId);
  if (!npc) return { ok: false, msg: '找不到这个人。' };
  if (!npcAvailable(npc, s.day, s.hour)) return { ok: false, msg: `${npc.name}现在不在方便搭话的地方。` };
  const fav = s.relations[npcId];
  if (fav !== undefined && fav >= VISIT_FAVOR) return { ok: false, msg: '你们已经是熟人，可以直接「拜访」了。' };
  if (s.stats.energy < 6) return { ok: false, msg: '精力不足。' };
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, 6) }]);
  advanceHours(s, 1);
  if (s.gameOver) return { ok: true };

  const gen = s.genNpcs.find(n => n.id === npcId);
  if (fav === undefined) {
    // —— 结交事件：第一次正式相识 ——
    acquaint(s, npcId, 4 + rnd(4));
    if (gen) {
      addLog(s, `✦ 结交：你找机会和${gen.name}搭上了话（${gen.identity}）。ta${gen.traits.join('、')}——聊下来你隐约觉得，这个人心里装着「${gen.motive}」这回事。`, 'good');
    } else {
      addLog(s, `✦ 结交：你正式认识了${npc.name}（${npc.identity}）。${npc.desc}`, 'good');
    }
  } else {
    // —— 初识阶段的寒暄 ——
    applyEffects(s, [{ k: 'favor', id: npcId, v: 1 + rnd(3) }]);
    const smallTalk = gen
      ? [`你陪${gen.name}聊了几句${gen.motive}的进展。`, `${gen.name}对你熟络了些，顺嘴抱怨起今天的活计。`, `你给${gen.name}递了支烟，ta的话多了两句。`]
      : [`你和${npc.name}寒暄了一阵，ta对你多了几分印象。`, `${npc.name}抬眼认出是你，语气比上回缓和了些。`, `你陪${npc.name}聊了些街区见闻，关系近了一点。`];
    addLog(s, smallTalk[rnd(smallTalk.length)], 'info');
    const now = s.relations[npcId] ?? 0;
    if (now >= VISIT_FAVOR) addLog(s, `✦ ${npc.name}已经把你当自己人了——现在可以登门「拜访」了。`, 'system');
  }
  return { ok: true };
}

export function doSocial(s: GameState, npcId: string): ActionResult {
  const npc = findAnyNPC(s, npcId);
  if (!npc) return { ok: false, msg: '找不到这个人。' };
  if (!npcAvailable(npc, s.day, s.hour)) return { ok: false, msg: `${npc.name}现在不在方便见客的地方。` };
  const fav = s.relations[npcId];
  if (fav === undefined) return { ok: false, msg: '你们还不认识。先找机会攀谈结交（酒馆、街头、市集都是认识人的地方）。' };
  if (fav < VISIT_FAVOR) return { ok: false, msg: `你们还只是点头之交（好感${fav}）——好感≥${VISIT_FAVOR} 后对方才愿意在家接待你。先多攀谈几次吧。` };
  if (s.stats.energy < 8) return { ok: false, msg: '精力不足。' };
  applyEffects(s, [{ k: 'energy', v: -energyCost(s, 8) }]);
  addLog(s, `你拜访了${npc.name}（${npc.identity}）。`, 'info');
  advanceHours(s, 1);
  if (s.gameOver) return { ok: true };

  // 生成 NPC：通用社交结算
  const gen = s.genNpcs.find(n => n.id === npcId);
  if (gen) {
    applyEffects(s, [{ k: 'favor', id: npcId, v: 2 + rnd(3) }]);
    const roll = rnd(100);
    if ((s.relations[npcId] ?? 0) >= 20 && roll < 25) {
      addLog(s, `几杯酒下肚，${gen.name}压低声音说出一个秘密：「${gen.secret}——你可别往外说。」`, 'event');
      if (gen.secret.includes('野生非凡者') && !isBeyonder(s)) addLog(s, '你的心猛地一跳。非凡者……原来真的存在，而且就在你身边。', 'system');
      if (gen.secret.includes('野生非凡者') && isBeyonder(s)) applyEffects(s, [{ k: 'favor', id: npcId, v: 6 }]);
    } else if (roll < 45) {
      const c = generateCommission(s);
      if (s.board.length >= 5) s.board.shift();
      s.board.push(c);
      addLog(s, `${gen.name}提到最近有桩活儿没人接：「${c.title}」。你默默记下了。（可在右侧「打听到的差事」中揭下）`, 'info');
    } else {
      const small = [`你们聊了聊${gen.motive}的事。`, `${gen.name}抱怨起物价和雾。`, `你从${gen.name}那儿听到几个街头传闻。（不过是些家长里短）`];
      addLog(s, small[rnd(small.length)], 'info');
    }
    return { ok: true };
  }

  maybeTrigger(s, 'social', npcId);
  return { ok: true };
}

/** 去酒馆坐坐：结交人脉的主渠道。先认识老板麦克，再从常客里结交新面孔。 */
export function doTavern(s: GameState): ActionResult {
  if (!(s.hour >= 16 || s.hour < 2)) return { ok: false, msg: '「醉水手」要16:00才开门，凌晨2:00打烊。' };
  if (s.pence < 6) return { ok: false, msg: '连一杯麦酒的钱都没有了。' };
  if (s.stats.energy < 6) return { ok: false, msg: '精力不足。' };
  applyEffects(s, [{ k: 'money', v: -6 }, { k: 'energy', v: -energyCost(s, 5) }]);
  addLog(s, '你推开「醉水手」的橡木门。劣质烟草、麦酒和潮湿的呢子大衣味扑面而来。（−6便士）', 'info');
  advanceHours(s, 2);
  if (s.gameOver) return { ok: true };

  // 此刻酒馆里的人
  const present = allNPCs(s).filter(n => (npcLocation(n, s.day, s.hour) ?? '').includes('醉水手'));
  // 第一次来：先认识吧台后的老板
  if (!isMet(s, 'mike')) {
    acquaint(s, 'mike', 5);
    addLog(s, '✦ 结交：吧台后的胖子朝你抬了抬下巴：「新面孔。麦克，这儿的老板。坐吧台吧，第一天来的都坐吧台。」——你认识了「胖子」麦克。', 'good');
  } else {
    const stranger = present.filter(n => !isMet(s, n.id) && n.id !== 'mike');
    if (stranger.length) {
      const npc = stranger[rnd(stranger.length)];
      const gen = s.genNpcs.find(n => n.id === npc.id);
      acquaint(s, npc.id, 4 + rnd(4));
      addLog(s, gen
        ? `✦ 结交：你在酒馆结识了${npc.name}（${npc.identity}）。几杯下肚，${gen.traits.join('、')}的ta说漏了嘴——ta正为「${gen.motive}」发愁。`
        : `✦ 结交：你在酒馆结识了${npc.name}（${npc.identity}）。${npc.desc}`, 'good');
    } else {
      const known = present.filter(n => n.id !== 'mike' && (s.relations[n.id] ?? 0) < VISIT_FAVOR);
      if (known.length) {
        const npc = known[rnd(known.length)];
        applyEffects(s, [{ k: 'favor', id: npc.id, v: 2 + rnd(3) }]);
        addLog(s, `你和${npc.name}拼了一桌，边喝边聊。（好感上升）`, 'info');
        if ((s.relations[npc.id] ?? 0) >= VISIT_FAVOR) addLog(s, `✦ ${npc.name}已经把你当自己人了——现在可以登门「拜访」了。`, 'system');
      } else {
        applyEffects(s, [{ k: 'san', v: 2 }]);
        addLog(s, '今晚没有新面孔。你独自喝了两杯，听水手可耻地夸大战绩。', 'info');
      }
    }
    // 麦克是吧台后的耳朵：可能听到活儿
    if (rnd(100) < 30) {
      const c = generateCommission(s);
      if (s.board.length >= 5) s.board.shift();
      s.board.push(c);
      addLog(s, `麦克擦着杯子，状似无意地提起一桩活儿：「${c.title}」——细节去问委托人。（可在「打听到的差事」中揭下）`, 'event');
    }
  }
  return { ok: true };
}

export function doNap(s: GameState): ActionResult {
  applyEffects(s, [{ k: 'energy', v: 12 }]);
  addLog(s, '你小憩了一小时。（精力+12）', 'info');
  advanceHours(s, 1);
  return { ok: true };
}

export function doMeal(s: GameState): ActionResult {
  if (s.pence < 4) return { ok: false, msg: '连顿饭钱都付不起了。' };
  applyEffects(s, [{ k: 'money', v: -4 }, { k: 'energy', v: 20 }, { k: 'san', v: 2 }]);
  addLog(s, '你吃了顿像样的热食。（−4便士，精力+20）', 'info');
  advanceHours(s, 1);
  return { ok: true };
}

export function doSleep(s: GameState): ActionResult {
  const hours = s.hour < 7 ? 7 - s.hour : 24 - s.hour + 7;
  if (s.pathwayId === 'sleepless') {
    applyEffects(s, [{ k: 'energy', v: 40 }, { k: 'san', v: 5 }]);
    addLog(s, '不眠者无需睡眠。你静夜冥想，让灵性缓缓沉淀。（精力+40，理智+5）', 'info');
    advanceHours(s, 2);
    return { ok: true };
  }
  const recover = s.tags.includes('homeless') ? 50 : 100;
  addLog(s, s.tags.includes('homeless') ? '你在桥洞下凑合了一夜。（无家可归：恢复减半）' : '你睡了一觉。蒸汽城在窗外低鸣。', 'info');
  s.stats.energy = recover;
  s.stats.san = clamp(s.stats.san + 10);
  advanceHours(s, hours);
  return { ok: true };
}

export function doWander(s: GameState): ActionResult {
  applyEffects(s, [{ k: 'energy', v: -5 }]);
  addLog(s, '你在街上闲逛。雾、煤气灯、和永远行色匆匆的人群。', 'info');
  advanceHours(s, 1);
  if (s.gameOver) return { ok: true };
  // 撞见此刻正在街面上的人：陌生人→结交事件；熟人→寒暄
  const present = allNPCs(s).filter(n => npcAvailable(n, s.day, s.hour) && n.id !== 'mike');
  if (present.length && rnd(100) < 45) {
    const strangers = present.filter(n => !isMet(s, n.id));
    const npc = (strangers.length ? strangers : present)[rnd((strangers.length ? strangers : present).length)];
    const spot = npcLocation(npc, s.day, s.hour) ?? '街上';
    if (!isMet(s, npc.id)) {
      acquaint(s, npc.id, 3 + rnd(3));
      const gen = s.genNpcs.find(n => n.id === npc.id);
      addLog(s, gen
        ? `✦ 结交：你在${spot}撞见了${npc.name}（${npc.identity}）——${gen.traits.join('、')}。你们站着聊了一刻钟，约好下回再会。`
        : `✦ 结交：你在${spot}遇上了${npc.name}（${npc.identity}），攀谈了几句，算是正式认识了。`, 'good');
    } else {
      applyEffects(s, [{ k: 'favor', id: npc.id, v: 1 + rnd(2) }]);
      addLog(s, `你撞见了${npc.name}——这个时间ta果然在${spot}。你们站在街边聊了几句。（好感微升）`, 'info');
    }
    return { ok: true };
  }
  // 偶遇新面孔（人口池上限14）：打过照面即结交
  if (s.genNpcs.length < 14 && rnd(100) < 15) {
    const npc = generateNPC();
    s.genNpcs.push(npc);
    acquaint(s, npc.id, 2 + rnd(3));
    addLog(s, `✦ 结交：你结识了新面孔：${npc.name}，${npc.identity}。${npc.traits[0]}，${npc.motive}。`, 'good');
    return { ok: true };
  }
  if (rnd(100) < 40) maybeTrigger(s, 'street');
  return { ok: true };
}

// ============ 黑市与配方交易 ============
export function buyItem(s: GameState, itemId: string, price: number, sellerId?: string): ActionResult {
  if (s.pence < price) return { ok: false, msg: '钱不够。' };
  s.pence -= price;
  s.items[itemId] = (s.items[itemId] ?? 0) + 1;
  if (sellerId && !isMet(s, sellerId)) {
    acquaint(s, sellerId, 3);
    const seller = findAnyNPC(s, sellerId);
    addLog(s, `✦ 结交：生意做成，${seller?.name ?? '卖家'}记住了你的脸。`, 'good');
  }
  addLog(s, `你买下了【${findItem(itemId)?.name ?? itemId}】。`, 'info');
  return { ok: true };
}

export function buyFormula(s: GameState, formulaId: string, price: number, sellerId?: string): ActionResult {
  if (s.pence < price) return { ok: false, msg: '钱不够。' };
  if (s.formulas.includes(formulaId)) return { ok: false, msg: '这份配方你已经有了。' };
  s.pence -= price;
  s.formulas.push(formulaId);
  if (sellerId && !isMet(s, sellerId)) {
    acquaint(s, sellerId, 3);
    const seller = findAnyNPC(s, sellerId);
    addLog(s, `✦ 结交：这笔买卖让你和${seller?.name ?? '卖家'}搭上了线。`, 'good');
  }
  addLog(s, `✦ 获得魔药配方：【${formulaName(formulaId)}】`, 'good');
  if (isBeyonder(s)) applyEffects(s, [{ k: 'exposure', v: 2 }]);
  return { ok: true };
}

// ============ 服食魔药（普通人→序列9） ============
export function canDrink(s: GameState, pathwayId: string): { ok: boolean; missing: string[] } {
  if (isBeyonder(s)) return { ok: false, missing: ['你已是非凡者'] };
  const pw = findPathway(pathwayId);
  if (!pw) return { ok: false, missing: ['途径数据缺失'] };
  if (!s.formulas.includes(pathwayId + '9')) return { ok: false, missing: ['没有配方'] };
  const missing = pw.seq9.materials.filter(m => (s.items[m] ?? 0) <= 0);
  return { ok: missing.length === 0, missing };
}

export function drinkPotion(s: GameState, pathwayId: string): ActionResult {
  const check = canDrink(s, pathwayId);
  if (!check.ok) return { ok: false, msg: '条件不足：' + check.missing.join('、') };
  const pw = findPathway(pathwayId)!;
  // 确定性检定：准备分 = 85 + 理智修正 + 知识加成 + 神秘学技能×2 − 污染×0.3，≥60 成功
  const rate = Math.round(85 + (s.stats.san - 50) * 0.1 + (s.knowledge.includes('potion_brew') ? 5 : 0) + s.skills.occult * 2 - s.stats.cor * 0.3);
  addLog(s, `——服食魔药：${pw.name}·序列9——`, 'system');
  addLog(s, `检定：准备分${rate} vs 难度60（理智${s.stats.san}、神秘学Lv.${s.skills.occult}、污染−${Math.round(s.stats.cor * 0.3)}）。瓶中的液体在煤气灯下泛着不祥的微光。`, 'system');
  for (const m of pw.seq9.materials) s.items[m] = Math.max(0, (s.items[m] ?? 0) - 1);
  advanceHours(s, 1);
  if (rate >= 60) {
    s.pathwayId = pathwayId;
    s.sequence = 9;
    s.digestion = 5;
    s.stats.spi = clamp(s.stats.spi + 10);
    s.stats.phy = clamp(s.stats.phy + 3);
    s.stats.cha = clamp(s.stats.cha + 3);
    addLog(s, `✦✦ 魔药入喉，世界骤然变得不同了——声音更远了，色彩更深了，影子们似乎都在看你。你已是【${pw.name}·序列9 ${pw.seqNames[0]}】！`, 'good');
    addLog(s, `${pw.seq9Ability}`, 'good');
    addLog(s, `从这一刻起：扮演守则「${pw.actingHint}」将消化你的魔药；而你的每一次出手，都可能被某些人看见。`, 'system');
  } else {
    applyEffects(s, [{ k: 'cor', v: 20 }, { k: 'san', v: -15 }, { k: 'energy', v: -50 }]);
    addLog(s, '✖ 检定失败，魔药在你体内暴走了！耳语、幻象、皮肤下的蠕动……（材料尽毁，污染+20，理智−15）', 'bad');
    if (s.stats.cor >= 60) {
      s.gameOver = { title: '失控', text: '第一瓶魔药就要了你的命。你甚至没来得及成为非凡者，就先成为了值夜者档案里的一行字：「东区，未遂服食者，异变体，已清除。」' };
    } else {
      addLog(s, '你用尽全身力气把自己拽了回来。这次准备不足——下次，把理智养足、把神秘学练深再来。', 'info');
    }
  }
  return { ok: true };
}

// ============ 晋升（序列9→8） ============
export function canPromote(s: GameState): { ok: boolean; missing: string[] } {
  if (!isBeyonder(s)) return { ok: false, missing: ['普通人无法晋升'] };
  if (s.sequence !== 9) return { ok: false, missing: ['Demo 目前只开放到序列8'] };
  const pw = findPathway(s.pathwayId);
  if (!pw) return { ok: false, missing: ['途径数据缺失'] };
  const missing: string[] = [];
  if (s.digestion < 100) missing.push('消化度未满');
  if (!s.formulas.includes(s.pathwayId! + '8')) missing.push('没有序列8配方');
  for (const m of pw.seq8.materials) if ((s.items[m] ?? 0) <= 0) missing.push(m);
  return { ok: missing.length === 0, missing };
}

export function doPromote(s: GameState): ActionResult {
  const check = canPromote(s);
  if (!check.ok) return { ok: false, msg: '条件不足：' + check.missing.join('、') };
  const pw = findPathway(s.pathwayId)!;
  // 确定性检定：消化度×0.45 + 知识 + 神秘学技能×2 + 理智修正 − 污染×0.3，≥60 成功
  const rate = Math.round(20 + s.digestion * 0.45 + (s.knowledge.includes('potion_brew') ? 8 : 0)
    + s.skills.occult * 2 + (s.stats.san - 50) * 0.2 - s.stats.cor * 0.3);
  addLog(s, `——晋升仪式开始——`, 'system');
  addLog(s, `${pw.seq8.ritual}`, 'system');
  addLog(s, `检定：准备分${rate} vs 难度60（消化${Math.round(s.digestion)}、神秘学Lv.${s.skills.occult}、理智${s.stats.san}、污染−${Math.round(s.stats.cor * 0.3)}）`, 'system');
  advanceHours(s, 1);
  for (const m of pw.seq8.materials) s.items[m] = Math.max(0, (s.items[m] ?? 0) - 1);
  if (rate >= 60) {
    s.sequence = 8;
    s.digestion = 5;
    s.stats.spi = clamp(s.stats.spi + 8);
    s.stats.phy = clamp(s.stats.phy + 4);
    s.stats.cha = clamp(s.stats.cha + 4);
    applyEffects(s, [{ k: 'exposure', v: 5 }]);
    addLog(s, `✦✦ 魔药顺喉而下，灵性的潮汐漫过全身。你已是【${pw.name}·序列8 ${pw.seqNames[1]}】！`, 'good');
    addLog(s, '世界在你眼中裂开了一条新的缝隙。与此同时，城市某处的某些存在，隐约察觉到了新的非凡者的诞生。', 'good');
  } else {
    applyEffects(s, [{ k: 'cor', v: 15 }, { k: 'energy', v: -50 }, { k: 'san', v: -15 }]);
    addLog(s, '✖ 检定失败，魔药在你体内暴走了。（材料尽毁，污染+15，理智−15）', 'bad');
    if (s.stats.cor >= 65) {
      s.gameOver = { title: '失控', text: '压不住的。最后一刻，你听见自己体内传来另一人的笑声。值夜者的记录上多了一行字：「东区，序列9失控体，已清除。」' };
    } else {
      addLog(s, '你咬碎牙关，把失控的冲动一寸寸压了回去。消化、理智、神秘学——把短板补上再来。', 'info');
    }
  }
  return { ok: true };
}

// ============ 宿敌系统 ============
function nemesisDaily(s: GameState) {
  const n = s.nemesis;
  if (!n || !n.alive) return;
  n.hostility = clamp(n.hostility + 2);
  n.power = Math.round(n.power + 0.5);
  const roll = rnd(100);
  if (roll < 30) {
    // 刺杀（确定性检定：体质 + 格斗×4 + 武器/途径加成 vs 威胁度）
    const def = s.stats.phy + s.skills.combat * 4 + ((s.items.revolver ?? 0) > 0 ? 15 : 0) + (s.pathwayId === 'hunter' ? 8 : 0);
    addLog(s, '⚠️ 深夜传来异响——有人撬开了你的窗！', 'bad');
    if (def >= n.power) {
      addLog(s, `刺杀检定：${Math.round(def)} vs ${n.power}——你早有防备，掀翻台灯砸向破窗而入的黑影，对方负伤逃走。敌意加深了。`, 'good');
      n.hostility = clamp(n.hostility + 6);
    } else {
      addLog(s, `刺杀检定：${Math.round(def)} vs ${n.power}——冰冷的刀刃划过肋侧，你拼死反抗才把人逼退。（精力−30，理智−6）`, 'bad');
      applyEffects(s, [{ k: 'energy', v: -30 }, { k: 'san', v: -6 }]);
    }
  } else if (roll < 55) {
    if (!s.tags.includes('cursed')) {
      s.tags.push('cursed');
      addLog(s, '⚠️ 清晨你发现门槛上钉着一只剖开的黑猫——诅咒仪式。厄运将持续侵蚀你的精神（每日理智−3，直到解除）。', 'bad');
    }
  } else if (roll < 75) {
    s.flags.jammed = 2;
    addLog(s, '⚠️ 你的直觉与占卜近日一片混沌——有人在暗中干扰你。（未来2天委托检定−10）', 'bad');
  }
}

/** 花钱通过麦克打听宿敌底细 */
export function nemesisIntel(s: GameState): ActionResult {
  const n = s.nemesis;
  if (!n || !n.alive) return { ok: false, msg: '没有宿敌。' };
  if (n.known) return { ok: false, msg: '底细已经查清。' };
  if (s.pence < 24) return { ok: false, msg: '麦克的情报不便宜：需要2苏勒。' };
  s.pence -= 24;
  n.known = true;
  addLog(s, `麦克的渠道很快有了回音：盯上你的是【${n.name}】，${n.archetype}。${n.motive}（威胁度${n.power}）`, 'event');
  addLog(s, '知己知彼——现在你可以主动「做个了断」了。', 'system');
  return { ok: true };
}

/** 求教会庇护 */
export function nemesisShelter(s: GameState): ActionResult {
  const n = s.nemesis;
  if (!n || !n.alive) return { ok: false, msg: '没有宿敌。' };
  const eligible = s.tags.includes('registered') || (s.relations.evelyn ?? 0) >= 30;
  if (!eligible) return { ok: false, msg: '教会不会为无干人等出手。（需要备案身份或伊芙琳好感≥30）' };
  n.hostility = clamp(n.hostility - 45);
  applyEffects(s, [{ k: 'favor', id: 'evelyn', v: -10 }]);
  addLog(s, `伊芙琳听完你的叙述，只说了一句「知道了」。三天后，那些盯梢的目光明显稀了下去——值夜者「路过」了几次对方的地盘。（敌意大降，欠教会一个人情）`, 'good');
  return { ok: true };
}

/** 做个了断（确定性战斗检定） */
export function nemesisFight(s: GameState): ActionResult {
  const n = s.nemesis;
  if (!n || !n.alive) return { ok: false, msg: '没有宿敌。' };
  if (!n.known) return { ok: false, msg: '对方藏在暗处，先查清底细再动手。' };
  if (s.stats.energy < 40) return { ok: false, msg: '精力不足40，主动寻仇等于送死。' };
  applyEffects(s, [{ k: 'energy', v: -35 }]);
  advanceHours(s, 4);
  const atk = s.stats.phy + s.skills.combat * 4 + ((s.items.revolver ?? 0) > 0 ? 15 : 0) + (s.pathwayId === 'hunter' ? 8 : 0) + Math.round(s.stats.spi * 0.3);
  const diff = n.power + 10; // 对方有准备
  addLog(s, `你查清了${n.name}的落脚点，在雨夜里摸了过去。决战检定：${Math.round(atk)} vs ${diff}`, 'system');
  if (atk >= diff) {
    addLog(s, `✦ 短促而惨烈的搏杀后，一切结束了。${n.name}倒在积水中，你在尸体旁站了很久。（威胁解除）`, 'good');
    applyEffects(s, [{ k: 'money', v: 80 }, { k: 'cor', v: 4 }, { k: 'san', v: -4 }]);
    if (s.skills.combat < 10) s.skills.combat += 1;
    if (n.archetype !== '黑帮清道夫' && s.formulas.length < 8) {
      const unknown = PATHWAYS.filter(p => !s.formulas.includes(p.id + '9'));
      if (unknown.length) { const f = unknown[rnd(unknown.length)].id + '9'; s.formulas.push(f); addLog(s, `你在对方身上搜出一页手抄配方：【${formulaName(f)}】。`, 'good'); }
    }
    addLog(s, '一条人命。你告诉自己：在这座城市的规则里，这已经是仁慈的结局。', 'system');
    s.nemesis = null;
  } else {
    addLog(s, `✖ 对方比你想象的更强。你拼死逃出那条巷子，肋骨断了三根。（精力−40，理智−10，污染+5；敌意更深了）`, 'bad');
    applyEffects(s, [{ k: 'energy', v: -40 }, { k: 'san', v: -10 }, { k: 'cor', v: 5 }]);
    n.hostility = clamp(n.hostility + 15);
  }
  return { ok: true };
}

/** 解除诅咒（找尼尔逊或艾拉） */
export function removeCurse(s: GameState): ActionResult {
  if (!s.tags.includes('cursed')) return { ok: false, msg: '你身上没有诅咒。' };
  if (s.pence < 60) return { ok: false, msg: '解除诅咒需要5苏勒的材料与酬劳。' };
  s.pence -= 60;
  s.tags = s.tags.filter(t => t !== 'cursed');
  addLog(s, '尼尔逊用银刀、盐和你的一撮头发完成了驱邪仪式。门槛上的黑猫化为黑灰，耳鸣消失了。（诅咒解除）', 'good');
  return { ok: true };
}

// ============ 终局检查 ============
function checkGameOver(s: GameState) {
  if (s.gameOver) return;
  if (s.stats.san <= 0) s.gameOver = { title: '精神崩溃', text: '呓语终于淹没了你。邻居说，那个人最后几天一直在和空气下棋。' };
  else if (s.stats.cor >= 100) s.gameOver = { title: '失控', text: '你的皮肤下有东西在蠕动。第二天，值夜者在巷子里发现了一滩会呼吸的暗影。' };
  else if (s.stats.energy <= 0) {
    s.stats.energy = 30;
    addLog(s, '你眼前一黑，昏倒在街边。醒来时已是8小时后，钱袋明显瘪了一圈。（−2苏勒）', 'bad');
    s.pence = Math.max(0, s.pence - 24);
    advanceHours(s, 8);
  }
  if (s.gameOver) addLog(s, `——${s.gameOver.title}——`, 'bad');
}

// ============ 存档 ============
const SAVE_KEY = 'lotm-demo-save-v6';
export function saveGame(s: GameState) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as GameState) : null;
  } catch { return null; }
}
export function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }
