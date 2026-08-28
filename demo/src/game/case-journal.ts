import { CLUE_DEFS, DOCK_CASE_DISPOSITIONS, DOCK_SEQUENCE9_ACTIONS, LOCATIONS, PATHWAYS } from './data';
import { hasFormalNightwatchRoute, isLocationUnlocked } from './location-access';
import type { CaseJournalEntry, GameState } from './types';

const factsFor = (state: GameState, caseId: string) => state.clues
  .filter(record => record.caseId === caseId)
  .flatMap(record => {
    const def = CLUE_DEFS.find(candidate => candidate.id === record.id);
    return def ? [{ clueId: def.id, title: def.title, sourceLabel: def.sourceLabel }] : [];
  });

const unlockedLocations = (state: GameState, locationIds: readonly string[]) => locationIds.flatMap(locationId => {
  if (!isLocationUnlocked(state, locationId)) return [];
  const location = LOCATIONS.find(candidate => candidate.id === locationId);
  return location ? [{ locationId, name: location.name }] : [];
});

function clocktowerCase(state: GameState): CaseJournalEntry | null {
  const route = state.organizationRoutes.nightwatch;
  const lead = state.leads.nightwatch_clocktower;
  const facts = factsFor(state, 'clocktower');
  const discovered = facts.length > 0 || lead?.stage !== 'unknown' || route?.routeStep !== 'none';
  if (!discovered) return null;
  const witnessed = state.awareness !== 'ordinary' || ['identified', 'verified'].includes(lead.stage);
  const investigated = facts.some(fact => fact.clueId === 'clocktower_repair_orders');
  const stage = witnessed ? 'witnessed' : investigated ? 'investigating' : 'rumor';
  const directions: string[] = [];
  if (!investigated && !witnessed) directions.push('在市政开放时段继续核对维修工单。');
  if (!witnessed) directions.push('在异常出现的时段前往已解锁地点观察，并保留安全退路。');
  if (state.awareness === 'witness') directions.push('携带真实证物，在办理时段向已经建立联系的教会人员上报。');
  if (state.awareness === 'informed') directions.push('按已有官方接触记录继续完成下一项安排。');
  directions.push('暂缓深入，先从其他调查或阅读中积累经验。');
  return {
    id: 'clocktower', title: '旧钟楼异响', stage,
    statusLabel: witnessed ? '已经确认存在无法用常识解释的异常' : investigated ? '公开记录已能相互印证' : '只有世俗投诉与传闻',
    facts,
    unlockedLocations: unlockedLocations(state, ['old_tower']),
    currentQuestion: witnessed ? '如何安全处理证物并找到可靠的说明渠道？' : investigated ? '这些规律是否能在现场得到验证？' : '投诉、失踪与停摆记录是否指向同一件事？',
    directions: directions.slice(0, 3),
  };
}

const DOCK_PATH_CLUES = new Set(DOCK_SEQUENCE9_ACTIONS.map(action => action.clueId));
const DOCK_DISPOSITION_CLUES = new Set(DOCK_CASE_DISPOSITIONS.map(disposition => disposition.clueId));

function dockCase(state: GameState): CaseJournalEntry | null {
  const facts = factsFor(state, 'dock_manifest');
  const lead = state.leads.iron_blood_token;
  const route = state.organizationRoutes.iron_and_blood;
  const discovered = state.intel.includes('dock_missing') || facts.length > 0
    || lead?.stage !== 'unknown' || route?.routeStep !== 'none';
  if (!discovered) return null;
  const resolutionReady = facts.some(fact => fact.clueId === 'dock_seq9_conclusion');
  const dispositionFact = facts.find(fact => DOCK_DISPOSITION_CLUES.has(fact.clueId));
  const concluded = !!dispositionFact;
  const pathwayFacts = facts.filter(fact => DOCK_PATH_CLUES.has(fact.clueId));
  const pathwayFact = pathwayFacts[0];
  const secularFact = facts.some(fact => ['dock_missing_reports', 'dock_manifest_discrepancy', 'dock_marked_manifest'].includes(fact.clueId));
  const stage = concluded ? 'concluded' : resolutionReady ? 'resolution_ready' : pathwayFact ? 'pathway_inquiry' : secularFact ? 'investigating' : 'rumor';
  const directions: string[] = [];
  const atDocks = state.currentLocation?.locationId === 'docks';
  if (concluded) {
    directions.push('复核案件簿中的事实来源，保留原始证物与记录。', '继续其他生活、组织或个人路线，不必结束当前人生。');
  } else if (resolutionReady) {
    if (isLocationUnlocked(state, 'docks')) directions.push('在港务公开窗口办理时段递交可核验报告。');
    if (state.relations.mike !== undefined && isLocationUnlocked(state, 'tavern')) directions.push('在晚间通过已经结识的麦克提醒夜班工人。');
    if (hasFormalNightwatchRoute(state)) directions.push('在办理时段向已经建立正式接触的安保人员移交调查副本。');
  } else if (state.sequence === 9 && pathwayFacts.length >= 2) {
    directions.push(atDocks ? '在当前码头整合两份本途径记录与已有世俗线索。' : '回到已经查明的码头，整合两份本途径记录。');
    directions.push('尝试综合追查；若现有事实仍不足，就磨练与本途径直接相关的能力，或寻找可核验旁证。');
  } else if (state.sequence === 9 && pathwayFact) {
    const nextAction = DOCK_SEQUENCE9_ACTIONS.find(action => action.pathwayId === state.pathwayId
      && !facts.some(fact => fact.clueId === action.clueId)
      && isLocationUnlocked(state, action.locationId)
      && (!action.requiredNpcId || state.relations[action.requiredNpcId] !== undefined));
    if (nextAction) {
      const location = LOCATIONS.find(candidate => candidate.id === nextAction.locationId);
      directions.push(`在已经查明的${location?.name ?? '地点'}继续${nextAction.label}。`);
    } else directions.push('继续从已经查明的地点和正式结识的人脉中核对本途径记录。');
  } else if (state.sequence === 9) {
    directions.push(atDocks ? '在当前码头使用本途径的调查方法留下路径记录。' : '抵达已经查明的码头，再开展本途径调查。');
    directions.push('完成本途径现场记录后，再把已经持有的事实用于综合追查。');
  } else {
    if (!facts.some(fact => fact.clueId === 'dock_missing_reports')) directions.push('抵达已经查明的码头，在白天核对公开失踪登记。');
    if (facts.some(fact => fact.clueId === 'dock_missing_reports') && !facts.some(fact => fact.clueId === 'dock_manifest_discrepancy')) directions.push('在码头账房开放时比对货运备份。');
    directions.push('保留现场记录；不要把传闻当成正式委托或结论。');
  }
  const disposition = dispositionFact
    ? DOCK_CASE_DISPOSITIONS.find(candidate => candidate.clueId === dispositionFact.clueId)
    : undefined;
  const evidenceFacts = facts.filter(fact => fact.clueId !== 'dock_seq9_conclusion' && !DOCK_DISPOSITION_CLUES.has(fact.clueId));
  const pathway = state.pathwayId ? PATHWAYS.find(candidate => candidate.id === state.pathwayId) : undefined;
  return {
    id: 'dock_manifest', title: '码头失踪案', stage,
    statusLabel: concluded ? '已完成阶段处置' : resolutionReady ? '综合调查完成，等待选择处置渠道' : pathwayFacts.length >= 2 ? '本途径两份记录已经建立' : pathwayFact ? '本途径现场记录已经建立' : secularFact ? '世俗记录正在形成证据链' : '目前只有失踪传闻',
    facts,
    unlockedLocations: unlockedLocations(state, ['docks', 'canal']),
    currentQuestion: concluded ? '哪些事实应当保留，以便将来继续追查仍然未知的幕后身份？'
      : resolutionReady ? '应当通过哪个已经查明、实际可达的渠道处置这份调查记录？'
        : pathwayFact ? '本途径的两份观察如何与公开记录交叉印证？'
        : secularFact ? '失踪者、货物流向与现场痕迹是否能连成同一条线？' : '失踪传闻能否由公开登记证实？',
    directions: directions.slice(0, 3),
    milestone: concluded ? '廷根第一章·案件样板完成' : undefined,
    chapterReport: concluded && disposition ? {
      pathwayLabel: pathway ? `${pathway.name} · 序列9` : '序列9途径记录',
      evidenceCount: evidenceFacts.length,
      evidenceSources: [...new Set(evidenceFacts.map(fact => fact.sourceLabel))],
      dispositionLabel: disposition.label,
      unknowns: '幕后安排者的身份、所属与最终目的仍未查明。',
    } : undefined,
  };
}

/** 纯派生 selector：不写状态，也不创建第二套案件进度。 */
export function getCaseJournalEntries(state: GameState): CaseJournalEntry[] {
  return [clocktowerCase(state), dockCase(state)].filter((entry): entry is CaseJournalEntry => entry !== null);
}
