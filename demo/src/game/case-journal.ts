import { CLUE_DEFS, DEEP_INVESTIGATION_DEFS, DIVINATION_CLUB_COMMISSIONS, DOCK_CASE_DISPOSITIONS, DOCK_SEQUENCE9_ACTIONS, LOCATIONS, PATHWAYS } from './data';
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
const DOCK_WITNESS_OUTCOME_CLUES = new Set([
  'dock_witness_warned', 'dock_watcher_route', 'dock_witness_disappeared', 'dock_witness_protected',
]);
const DOCK_WITNESS_FOLLOWUP_CLUES = new Set([
  'dock_witness_statement', 'dock_witness_fragment', 'dock_transfer_watch_record', 'dock_transfer_decoy',
  'dock_witness_locker_token', 'dock_witness_last_errand', 'dock_sealed_statement_excerpt', 'dock_official_case_summary',
]);
const DOCK_GRAY_HAT_OPERATION_CLUES = new Set([
  'dock_gray_hat_exchange_pattern', 'dock_gray_hat_abandoned_route',
  'dock_gray_hat_countermark', 'dock_gray_hat_trap_exposed',
  'dock_gray_hat_joint_watch', 'dock_gray_hat_watch_delayed',
]);
const DOCK_ENCOUNTER_SOURCE_CLUES = new Set([
  'dock_gray_hat_escape_recollection', 'dock_gray_hat_dropped_token', 'dock_gray_hat_scene_lost',
]);
const DOCK_ENCOUNTER_AFTERMATH_CLUES = new Set([
  'dock_gray_hat_retreat_route', 'dock_gray_hat_trail_lost', 'dock_gray_hat_token_handoff', 'dock_gray_hat_evidence_preserved',
]);
const DOCK_OLD_YARD_TERMINAL_CLUES = new Set([
  'dock_old_yard_night_transfer', 'dock_old_yard_watch_disturbed',
]);
const DOCK_TRANSFER_FOLLOWUP_CLUES = new Set([
  'dock_wagon_coal_yard_route', 'dock_wagon_lost_at_bridge',
  'dock_crate_tar_seal', 'dock_crate_packing_trace',
  'dock_official_interception_record', 'dock_interception_declined',
]);

function dockCase(state: GameState): CaseJournalEntry | null {
  const facts = factsFor(state, 'dock_manifest');
  const lead = state.leads.iron_blood_token;
  const route = state.organizationRoutes.iron_and_blood;
  const discovered = state.intel.includes('dock_missing') || facts.length > 0
    || lead?.stage !== 'unknown' || route?.routeStep !== 'none';
  if (!discovered) return null;
  const resolutionReady = facts.some(fact => fact.clueId === 'dock_seq9_conclusion');
  const dispositionFact = facts.find(fact => DOCK_DISPOSITION_CLUES.has(fact.clueId));
  const witnessOutcomeFact = facts.find(fact => DOCK_WITNESS_OUTCOME_CLUES.has(fact.clueId));
  const witnessFollowupFact = facts.find(fact => DOCK_WITNESS_FOLLOWUP_CLUES.has(fact.clueId));
  const grayHatOperationFact = facts.find(fact => DOCK_GRAY_HAT_OPERATION_CLUES.has(fact.clueId));
  const encounterSourceFact = facts.find(fact => DOCK_ENCOUNTER_SOURCE_CLUES.has(fact.clueId));
  const encounterAftermathFact = facts.find(fact => DOCK_ENCOUNTER_AFTERMATH_CLUES.has(fact.clueId));
  const oldYardTerminalFact = facts.find(fact => DOCK_OLD_YARD_TERMINAL_CLUES.has(fact.clueId));
  const transferFollowupFact = facts.find(fact => DOCK_TRANSFER_FOLLOWUP_CLUES.has(fact.clueId));
  const concluded = !!dispositionFact;
  const pathwayFacts = facts.filter(fact => DOCK_PATH_CLUES.has(fact.clueId));
  const pathwayFact = pathwayFacts[0];
  const secularFact = facts.some(fact => ['dock_missing_reports', 'dock_manifest_discrepancy', 'dock_marked_manifest'].includes(fact.clueId));
  const stage = concluded ? 'concluded' : resolutionReady ? 'resolution_ready' : pathwayFact ? 'pathway_inquiry' : secularFact ? 'investigating' : 'rumor';
  const directions: string[] = [];
  const atDocks = state.currentLocation?.locationId === 'docks';
  const confirmedDirections = DEEP_INVESTIGATION_DEFS
    .filter(def => def.caseId === 'dock_manifest' && !!state.deepInvestigations?.[def.id])
    .sort((left, right) => {
      const a = state.deepInvestigations[left.id];
      const b = state.deepInvestigations[right.id];
      return (a.confirmedDay * 24 + a.confirmedHour) - (b.confirmedDay * 24 + b.confirmedHour);
    })
    .map(def => def.nextStepText);
  const reliableAssessment = (state.investigationWorkspaces?.dock_manifest?.assessments ?? [])
    .some(assessment => assessment.outcome === 'reliable' || assessment.outcome === 'strong');
  const witnessCrisisReady = state.relations.mike !== undefined && facts.some(fact => fact.clueId === 'dock_missing_reports')
    && (reliableAssessment || confirmedDirections.length >= 2);
  const witnessCrisisActive = witnessCrisisReady && !witnessOutcomeFact;
  const witnessFollowupActive = !!witnessOutcomeFact && !witnessFollowupFact;
  const grayHatOperationActive = !!witnessFollowupFact && !grayHatOperationFact;
  const encounterAftermathActive = !!encounterSourceFact && encounterSourceFact.clueId !== 'dock_gray_hat_scene_lost'
    && !encounterAftermathFact;
  const oldYardActive = encounterAftermathFact?.clueId === 'dock_gray_hat_retreat_route' && !oldYardTerminalFact;
  const transferFollowupActive = oldYardTerminalFact?.clueId === 'dock_old_yard_night_transfer' && !transferFollowupFact;
  if (!concluded && !resolutionReady) directions.push(...confirmedDirections.slice(-1));
  if (concluded) {
    directions.push('复核案件簿中的事实来源，保留原始证物与记录。', '继续其他生活、组织或个人路线，不必结束当前人生。');
  } else if (witnessCrisisActive) {
    directions.length = 0;
    directions.push('到「醉水手」酒馆托麦克送出避险口信。');
    directions.push('入夜后前往东区码头，在交接处暗中守候。');
    if (hasFormalNightwatchRoute(state)) directions.push('到黑荆棘安保公司请求正式保护知情人。');
  } else if (witnessFollowupActive) {
    directions.length = 0;
    if (witnessOutcomeFact.clueId === 'dock_witness_warned') directions.push('回到「醉水手」酒馆，请麦克安排一次隐蔽会面。');
    else if (witnessOutcomeFact.clueId === 'dock_watcher_route') directions.push('入夜后前往运河仓库，监看下一次转运。');
    else if (witnessOutcomeFact.clueId === 'dock_witness_disappeared') directions.push('白天回到东区码头，核对工棚储物柜与领货簿。');
    else directions.push('到黑荆棘安保公司申请核验被封存的陈述。');
  } else if (grayHatOperationActive) {
    directions.length = 0;
    directions.push('入夜后在运河仓区继续监视交换点。');
    if (facts.some(fact => fact.clueId === 'dock_marked_manifest')) directions.push('入夜后回到东区码头，用旧仓单放出假暗记。');
    if (hasFormalNightwatchRoute(state)) directions.push('到黑荆棘安保公司申请联合盯守。');
  } else if (encounterAftermathActive) {
    directions.length = 0;
    directions.push('回到住处复盘灰帽人的撤退方向。');
    if (encounterSourceFact.clueId === 'dock_gray_hat_dropped_token' && hasFormalNightwatchRoute(state)) {
      directions.push('把灰帽人掉落的黄铜牌送往黑荆棘安保公司核验。');
    }
    directions.push('封存现有证物与笔记，停止继续追击。');
  } else if (oldYardActive) {
    directions.length = 0;
    directions.push('白天前往运河下游旧装卸区，先沿公共边界确认观察位置。');
    directions.push('请麦克引见附近的临时搬运工，只核对班次与汽笛时间。');
    directions.push('外围与班次都有记录后，再在夜间守候可能出现的转运。');
  } else if (transferFollowupActive) {
    directions.length = 0;
    directions.push('入夜后回到旧装卸区，保持距离跟住下一辆无编号篷车。');
    directions.push('在旧装卸区检查转运后留下的封箱与封签。');
    if (hasFormalNightwatchRoute(state)) directions.push('到黑荆棘安保公司申请联合截查无编号篷车。');
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
    statusLabel: concluded ? '已完成阶段处置' : witnessCrisisActive ? '知情人可能正被盯上'
      : witnessFollowupActive ? '口信之后仍有一处需要核验'
      : grayHatOperationActive ? '灰帽接头人已经成为唯一活线'
      : encounterAftermathActive ? '遭遇结束，仍需处理现场所得'
      : oldYardActive ? '撤退方向指向一处仍待核验的旧装卸区'
      : transferFollowupActive ? '无编号篷车已经成为新的活线'
      : witnessOutcomeFact?.clueId === 'dock_witness_disappeared' ? '知情人失踪，案件出现新的缺口'
        : resolutionReady ? '综合调查完成，等待选择处置渠道'
          : transferFollowupFact?.clueId === 'dock_wagon_coal_yard_route' ? '无编号篷车的去向已经指向河湾煤栈'
          : transferFollowupFact?.clueId === 'dock_crate_tar_seal' ? '遗留封箱的铅封已经取得'
          : transferFollowupFact?.clueId === 'dock_official_interception_record' ? '无编号篷车已经留下正式截查记录'
          : transferFollowupFact ? '无编号篷车的后续只形成有限记录'
          : encounterAftermathFact ? '灰帽人遭遇所得已经完成处理'
          : encounterSourceFact?.clueId === 'dock_gray_hat_scene_lost' ? '遭遇现场已经丢失'
          : grayHatOperationFact ? '灰帽人的行动职责已经确认'
          : witnessFollowupFact ? '知情人线索已经形成可核验记录'
          : witnessOutcomeFact ? '知情人危机已经处理'
          : pathwayFacts.length >= 2 ? '本途径两份记录已经建立' : pathwayFact ? '本途径现场记录已经建立'
            : secularFact ? '世俗记录正在形成证据链' : '目前只有失踪传闻',
    facts,
    unlockedLocations: unlockedLocations(state, ['docks', 'canal', 'old_loading_yard', 'riverside_coal_yard']),
    currentQuestion: concluded ? '哪些事实应当保留，以便将来继续追查仍然未知的幕后身份？'
      : witnessCrisisActive ? '先保住知情人，还是冒险跟住正在打听他的人？'
        : witnessFollowupActive && witnessOutcomeFact?.clueId === 'dock_witness_warned' ? '知情人究竟看见了什么，怎样问才不会把他再次暴露？'
          : witnessFollowupActive && witnessOutcomeFact?.clueId === 'dock_watcher_route' ? '灰帽人留下的路线是真实转运点，还是故意布下的诱饵？'
            : witnessFollowupActive && witnessOutcomeFact?.clueId === 'dock_witness_disappeared' ? '知情人失踪前接过的最后一件差事是什么？'
              : witnessFollowupActive ? '正式保护记录中，哪些内容能够在不暴露知情人的前提下核验？'
                : grayHatOperationActive ? '应当继续观察、主动设局，还是借正式力量盯住灰帽人？'
                  : encounterAftermathActive ? '应当继续追索撤退方向、移交实物，还是保全证据后停手？'
                    : oldYardActive ? '旧装卸区只是废弃场地，还是仍在承担未登记的夜间转运？'
                    : transferFollowupActive ? '应当冒险跟车、检查遗留实物，还是把截查交给正式人员？'
                    : encounterAftermathFact ? '遭遇后的事实能够证明什么，又有哪些身份线索仍然缺失？'
                  : grayHatOperationFact ? '已经确认的是灰帽人的职责，哪些仍然只是对其身份与所属的猜测？'
        : witnessOutcomeFact?.clueId === 'dock_witness_disappeared' ? '知情人失踪前，盯梢者利用了哪一段交接空档？'
          : witnessOutcomeFact?.clueId === 'dock_watcher_route' ? '盯梢者绕向的转运仓区与哪份仓单有关？'
            : witnessOutcomeFact?.clueId === 'dock_witness_protected' ? '在证词被封存期间，哪些公开记录仍能独立核验？'
              : witnessOutcomeFact?.clueId === 'dock_witness_warned' ? '知情人暂时避开后，怎样查清是谁在打听点名册？'
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

function elliotCase(state: GameState): CaseJournalEntry | null {
  const caseState = state.elliotCase;
  if (!caseState || caseState.stage === 'unknown') return null;
  const facts = factsFor(state, 'elliot_kidnapping');
  const directions: string[] = [];
  const atBlackthorn = state.currentLocation?.locationId === 'blackthorn_security';
  const atHideout = state.currentLocation?.locationId === 'forston_hideout';
  const statusByStage: Record<typeof caseState.stage, string> = {
    commissioned: '委托人与同行安排已经登记',
    location_known: '已经查明一个需要现场核验的地址',
    presence_confirmed: '已确认失踪者仍在屋内',
    backup_ready: '增援方案已经复核',
    rescued: '失踪者已经救出，等待正式结案',
    closed: '委托人与组织已经共同结案',
  };
  const questionByStage: Record<typeof caseState.stage, string> = {
    commissioned: '旧外套与公开记录能否指向同一个可靠地址？',
    location_known: '目标地址内是否确实有失踪者，而不是诱饵？',
    presence_confirmed: '应当按同行方案行动，还是先撤回申请增援？',
    backup_ready: '如何利用已经复核的增援方案安全带出失踪者？',
    rescued: '如何把营救记录交回组织，并由登记委托人确认结果？',
    closed: '这次外勤中哪些方法值得保留到下一桩案件？',
  };
  if (caseState.stage === 'commissioned') {
    directions.push(atBlackthorn
      ? '使用失踪者旧外套进行寻人占卜，或从车行与账目公开记录交叉核对。'
      : '回到黑荆棘安保公司，在正式记录与队友协助下查找去向。');
    directions.push('如果一种方法没有形成可靠指向，可以补充相应技能后重试，或换用另一条调查路线。');
  } else if (caseState.stage === 'location_known') {
    directions.push(atHideout ? '从门窗、脚印和屋内气息确认艾略特是否仍在。' : '前往已经查明的弗尔斯顿路旧宅，先在外围核验屋内情况。');
    directions.push('地址只是方向，不能代替现场确认；不要提前发动营救。');
  } else if (caseState.stage === 'presence_confirmed') {
    directions.push(atHideout ? '与伦纳德按既定分工营救，或先撤回申请增援。' : '带着现场确认返回目标旧宅，与已经登记的同行队员会合。');
  } else if (caseState.stage === 'backup_ready') {
    directions.push(atHideout ? '按已经复核的增援方案与伦纳德执行营救。' : '准备妥当后返回目标旧宅，与队员共同执行营救。');
  } else if (caseState.stage === 'rescued') {
    directions.push(atBlackthorn ? '在白天递交营救记录，请委托人确认并结清报酬。' : '白天返回黑荆棘安保公司，由委托人与组织共同结案。');
  } else if (caseState.stage === 'closed') {
    directions.push('复核寻人、现场确认与团队协作记录。', '继续参加轮值和训练，等待新的正式指派。');
  }
  return {
    id: 'elliot_kidnapping',
    title: '艾略特失踪案',
    stage: caseState.stage === 'closed' ? 'concluded' : caseState.stage,
    statusLabel: statusByStage[caseState.stage],
    facts,
    unlockedLocations: unlockedLocations(state, ['blackthorn_security', 'forston_hideout']),
    currentQuestion: questionByStage[caseState.stage],
    directions: directions.slice(0, 3),
    milestone: caseState.stage === 'closed' ? '值夜者第一桩正式外勤完成' : undefined,
  };
}

function divinationClubCase(state: GameState): CaseJournalEntry | null {
  const active = DIVINATION_CLUB_COMMISSIONS.find(candidate => candidate.id === state.divinationClub.activeCommissionId);
  let completed = undefined as (typeof DIVINATION_CLUB_COMMISSIONS)[number] | undefined;
  for (let index = state.divinationClub.completedCommissionIds.length - 1; index >= 0; index -= 1) {
    const completedId = state.divinationClub.completedCommissionIds[index];
    completed = DIVINATION_CLUB_COMMISSIONS.find(candidate => candidate.id === completedId);
    if (completed) break;
  }
  const commission = active ?? completed;
  if (!commission) return null;

  const allowedClueIds = new Set([commission.briefingClueId, commission.fieldClueId, commission.outcomeClueId]);
  const facts = factsFor(state, 'divination_club').filter(fact => allowedClueIds.has(fact.clueId));
  const hasFieldRecord = facts.some(fact => fact.clueId === commission.fieldClueId);
  const hasOutcome = facts.some(fact => fact.clueId === commission.outcomeClueId);
  const isCompleted = state.divinationClub.completedCommissionIds.includes(commission.id);
  const fieldLocation = LOCATIONS.find(candidate => candidate.id === commission.fieldLocationId);
  const directions: string[] = [];
  let stage: CaseJournalEntry['stage'];
  let statusLabel: string;
  let currentQuestion: string;

  if (isCompleted) {
    stage = 'concluded';
    statusLabel = hasOutcome
      ? `${commission.clientName}已经签收有限结论，咨询费用已结清`
      : '旧版咨询已经结清，但没有保留完整的外勤复核记录';
    currentQuestion = '哪些事实来源和判断边界值得保留到下一次咨询？';
    directions.push('复核事实陈述、外勤旁证与有限结论的来源。', '等待下一位实名来访者登记，不根据旧案推断新案。');
  } else if (hasFieldRecord) {
    stage = 'resolution_ready';
    statusLabel = '公开记录已经核对，等待整理有限结论';
    currentQuestion = '现实旁证与来访者陈述之间，哪些对应能够被重复核验？';
    directions.push('返回占卜家俱乐部，结合事实陈述与外勤旁证整理有限结论。', '只说明能够复核的范围，不推断地址、身份或幕后原因。');
  } else {
    stage = 'commissioned';
    statusLabel = '来访者已经签署事实陈述，等待外勤核对';
    currentQuestion = '公开记录能否支持来访者提供的时间、地点与生活细节？';
    directions.push(`前往【${fieldLocation?.name ?? '已经登记的公共地点'}】完成【${commission.fieldActionLabel}】。`, commission.fieldNextStepText);
  }

  return {
    id: 'divination_club',
    title: `占卜家俱乐部·${commission.label}`,
    stage,
    statusLabel,
    facts,
    unlockedLocations: unlockedLocations(state, ['divination_club', commission.fieldLocationId]),
    currentQuestion,
    directions: directions.slice(0, 3),
  };
}

/** 纯派生 selector：不写状态，也不创建第二套案件进度。 */
export function getCaseJournalEntries(state: GameState): CaseJournalEntry[] {
  return [clocktowerCase(state), dockCase(state), elliotCase(state), divinationClubCase(state)].filter((entry): entry is CaseJournalEntry => entry !== null);
}
