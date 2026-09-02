import type { Pathway, ItemDef, NPCDef, GameEvent, EventBlueprint, Origin, Talent, LocationDef, StatKey, JobDef, ClueSourceKind, CheckDef, BookDef, BookSourceDef, DockCaseDispositionDef, DockSequence9ActionDef, OrganizationQualificationTaskDef, SalvageDef, ShopDef, TingenLandmarkActionDef, LandmarkEncounterDef, TradeFairProductDef, BeyonderDeathSourceDef, Sequence9CombatSkillDef, Sequence9ExplorationAbilityDef, SkillKey, DeepInvestigationDef, OpeningScenarioDef, HuntTargetDef, NightwatchRoutineActionDef, DivinationClubCommissionDef, DivinationMethodDef, SeerTrainingNodeDef, DockCombatPreparationDef, InvestigationEvidenceDef, InvestigationHypothesisDef, InvestigationMethodDef, InvestigationHypothesisId, InvestigationMethodId } from './types';

// ============ 出身 ============
export const ORIGINS: Origin[] = [
  {
    id: 'clerk', name: '东区小职员',
    desc: '电报局誊写员，父母早亡，独自租住在阁楼。不多不少的钱，不远不近的关系——一个随时可能被城市吞没的普通人。',
    pence: 240, statMods: {}, mealCost: 6, initialJobId: 'telegraph_clerk',
  },
  {
    id: 'docker', name: '码头工人之子',
    desc: '在货箱与缆绳之间长大，父亲死于一场「事故」。你有一身力气，和一群从小混到大的码头朋友。',
    pence: 180, statMods: { phy: 6 },
    favors: { victor: 10 }, intel: ['dock_missing'],
    workPayMult: 1.25, mealCost: 6, initialJobId: 'dock_loader',
  },
  {
    id: 'orphan', name: '教会孤儿院出身',
    desc: '在圣赛琳娜教堂的孤儿院长大，唱诗、认字、守规矩。教堂执事认得你的脸——这层熟悉，是护身符也是约束。',
    pence: 200, statMods: { san: 10 },
    favors: { evelyn: 15 }, knowledge: ['church_liturgy'],
    exposureMult: 0.8, mealCost: 6, initialJobId: 'church_copyist',
  },
  {
    id: 'merchant', name: '商人之子',
    desc: '家里经营着一间不起眼的杂货铺。你从小看惯了讨价还价，口袋里比同龄人多几个便士，嘴皮子也比他们利索。',
    pence: 480, statMods: { cha: 3 },
    items: { whiskey: 2 },
    workPayMult: 1.1, mealCost: 6, initialJobId: 'shop_assistant',
  },
  {
    id: 'fallen_noble', name: '破落贵族',
    desc: '祖上曾有爵位，如今只剩姓氏和改不掉的体面。你受过良好教育、举止得体，但维持「体面」本身，就是一笔债。',
    pence: 600, statMods: { cha: 6, mnd: 3 },
    tags: ['体面负担'], mealCost: 12, initialJobId: 'private_tutor',
  },
];

export const OPENING_SCENARIOS: readonly OpeningScenarioDef[] = [
  {
    id: 'ordinary_morning', name: '平常的清晨',
    desc: '桌上只有昨夜没收好的账单。今天首先要考虑的是上班、吃饭和七天后的房租。',
  },
  {
    id: 'strange_notebook', name: '桌上的陌生笔记',
    desc: '你面前的桌上放着一本奇怪的笔记。你不记得自己何时把它带回了家。',
  },
];

// ============ 日常职业 ============
export const JOBS: JobDef[] = [
  {
    id: 'telegraph_clerk', name: '电报局誊写员', location: '佐特兰街电报局', locationId: 'home',
    shiftStart: 8, shiftEnd: 18, commuteHours: 1, workHours: 4, pay: 48, energyCost: 25,
    desc: '誊写、归档并转送电文，收入稳定，也容易听见城市各处的只言片语。',
    tendency: '稳定收入 · 心智倾向 · 情报机会', coworkerIdentity: '电报局职员',
  },
  {
    id: 'dock_loader', name: '码头装卸工', location: '东区码头', locationId: 'docks',
    shiftStart: 6, shiftEnd: 17, commuteHours: 1, workHours: 4, pay: 42, energyCost: 34,
    desc: '搬运货箱、系缆和清点舱货，辛苦但现金结算快。',
    tendency: '高体力消耗 · 体质倾向 · 码头传闻', coworkerIdentity: '码头装卸工',
  },
  {
    id: 'church_copyist', name: '教会文书助理', location: '圣赛琳娜教堂', locationId: 'st_selena_church',
    shiftStart: 8, shiftEnd: 17, commuteHours: 1, workHours: 4, pay: 38, energyCost: 20,
    desc: '整理捐赠名册、抄写布告和归档教区记录，薪水不高但环境安稳。',
    tendency: '低消耗 · 心智倾向 · 教会见闻', coworkerIdentity: '教会文书',
  },
  {
    id: 'shop_assistant', name: '杂货铺伙计', location: '东区杂货铺', locationId: 'market',
    shiftStart: 7, shiftEnd: 19, commuteHours: 1, workHours: 5, pay: 54, energyCost: 27,
    desc: '理货、记账、招呼客人并和供货商讨价还价。',
    tendency: '较长工时 · 魅力倾向 · 市井消息', coworkerIdentity: '杂货铺伙计',
  },
  {
    id: 'private_tutor', name: '家庭教师', location: '北区雇主宅邸', locationId: 'home',
    shiftStart: 10, shiftEnd: 20, commuteHours: 2, workHours: 3, pay: 66, energyCost: 22,
    desc: '为商人家庭的子女教授文法、历史与礼仪，路远但报酬体面。',
    tendency: '长通勤 · 高报酬 · 心智与魅力倾向', coworkerIdentity: '宅邸雇员',
  },
  {
    id: 'tavern_hand', name: '酒馆帮工', location: '「醉水手」酒馆', locationId: 'tavern',
    shiftStart: 12, shiftEnd: 23, commuteHours: 1, workHours: 5, pay: 56, energyCost: 30,
    desc: '搬酒桶、收拾桌面、招呼醉客。来钱不慢，也能认识形形色色的人。',
    tendency: '晚班 · 魅力倾向 · 人脉机会', coworkerIdentity: '酒馆帮工',
  },
];

export function findJob(id: string | null) { return JOBS.find(j => j.id === id); }

export function sequenceEvidenceLabel(done: number, required: number): string {
  if (done <= 0) return '尚未留下可信记录';
  if (done < required) return '已有实践，仍需更多不同情境';
  return '记录已足以交叉核验';
}

export const DIVINATION_METHOD_DEFS: readonly DivinationMethodDef[] = [
  {
    id: 'cards', baseValue: 5,
    toolBonuses: [
      { itemId: 'symbol_cards', value: 4, publicLabel: '固定象征纸牌' },
      { itemId: 'ritual_chalk', value: 2, publicLabel: '清晰的边界标记' },
    ],
  },
  { id: 'dream', baseValue: 10, toolBonuses: [] },
];

// ============ 调查线索与确定性探索检定 ============
export const CLUE_DEFS: readonly {
  id: string;
  caseId: string;
  title: string;
  sourceKind: ClueSourceKind;
  sourceId: string;
  sourceLabel: string;
}[] = [
  {
    id: 'clocktower_public_complaints', caseId: 'clocktower', title: '旧钟楼夜间投诉汇编',
    sourceKind: 'public_records', sourceId: 'municipal_complaints', sourceLabel: '地方报纸与市政投诉簿',
  },
  {
    id: 'strange_notebook_inconsistency', caseId: 'strange_notebook', title: '黑色笔记的内容矛盾记录',
    sourceKind: 'event', sourceId: 'opening:strange_notebook', sourceLabel: '阁楼桌面的逐页核对记录',
  },
  {
    id: 'strange_notebook_direction_omen', caseId: 'strange_notebook', title: '旧笔记形成的模糊指向',
    sourceKind: 'event', sourceId: 'divination:antigonus_notebook', sourceLabel: '对陌生黑色笔记的占卜记录',
  },
  {
    id: 'strange_notebook_official_receipt', caseId: 'strange_notebook', title: '异常旧书移交回条',
    sourceKind: 'location', sourceId: 'blackthorn_security', sourceLabel: '正式安保机构的证物接收回条',
  },
  {
    id: 'masked_smuggler_trade_tell', caseId: 'private_hunt', title: '蒙面货商反复避开的象征',
    sourceKind: 'npc', sourceId: 'masked_fortune_smuggler', sourceLabel: '秘密交易会中的近距离交谈记录',
  },
  {
    id: 'masked_smuggler_routine', caseId: 'private_hunt', title: '蒙面货商的作息与离场习惯',
    sourceKind: 'npc', sourceId: 'masked_fortune_smuggler', sourceLabel: '跨越两次集会的跟踪记录',
  },
  {
    id: 'masked_smuggler_secluded_meeting', caseId: 'private_hunt', title: '无人旁听的会面安排',
    sourceKind: 'npc', sourceId: 'masked_fortune_smuggler', sourceLabel: '以交易为名安排的单独会面',
  },
  {
    id: 'masked_smuggler_escape_route', caseId: 'private_hunt', title: '避开巡夜路线的撤离记录',
    sourceKind: 'location', sourceId: 'black_market', sourceLabel: '黑市后巷的撤离路线勘察',
  },
  {
    id: 'masked_smuggler_ambush_position', caseId: 'private_hunt', title: '能够取得先手的伏击位置',
    sourceKind: 'location', sourceId: 'black_market', sourceLabel: '黑市后巷的遮挡与视线记录',
  },
  {
    id: 'clocktower_repair_orders', caseId: 'clocktower', title: '反复改期的维修工单',
    sourceKind: 'archive', sourceId: 'municipal_repair_archive', sourceLabel: '市政工程档案室',
  },
  {
    id: 'dock_missing_reports', caseId: 'dock_manifest', title: '码头失踪人员登记',
    sourceKind: 'public_records', sourceId: 'dock_missing_registry', sourceLabel: '治安所与码头公开登记',
  },
  {
    id: 'dock_manifest_discrepancy', caseId: 'dock_manifest', title: '货运记录中的缺口',
    sourceKind: 'archive', sourceId: 'dock_cargo_archive', sourceLabel: '码头货运档案',
  },
  {
    id: 'dock_crate_trace', caseId: 'dock_manifest', title: '雾中货箱外围记录',
    sourceKind: 'event', sourceId: 'adv_dock', sourceLabel: '东区码头雾中现场',
  },
  {
    id: 'dock_marked_manifest', caseId: 'dock_manifest', title: '留有陌生印记的仓单',
    sourceKind: 'location', sourceId: 'dock_manifest_office', sourceLabel: '东区码头旧仓单房',
  },
  {
    id: 'dock_witness_warned', caseId: 'dock_manifest', title: '送达夜班工人的避险口信',
    sourceKind: 'npc', sourceId: 'mike', sourceLabel: '麦克转交的夜班避险口信',
  },
  {
    id: 'dock_watcher_route', caseId: 'dock_manifest', title: '灰帽盯梢者的转运路线',
    sourceKind: 'event', sourceId: 'dock_witness_crisis:shadow_watcher', sourceLabel: '夜班交接处的暗中跟踪记录',
  },
  {
    id: 'dock_witness_disappeared', caseId: 'dock_manifest', title: '夜班工人未归的空铺记录',
    sourceKind: 'event', sourceId: 'dock_witness_crisis:shadow_watcher', sourceLabel: '工棚与夜班点名册的次日核对',
  },
  {
    id: 'dock_witness_protected', caseId: 'dock_manifest', title: '夜班工人的正式保护回条',
    sourceKind: 'location', sourceId: 'blackthorn_security', sourceLabel: '黑荆棘安保公司的保护接收记录',
  },
  {
    id: 'dock_witness_statement', caseId: 'dock_manifest', title: '知情工人的完整交接陈述',
    sourceKind: 'npc', sourceId: 'mike', sourceLabel: '麦克安排的隐蔽会面记录',
  },
  {
    id: 'dock_witness_fragment', caseId: 'dock_manifest', title: '知情工人留下的半句口信',
    sourceKind: 'npc', sourceId: 'mike', sourceLabel: '麦克转交的匆忙口信',
  },
  {
    id: 'dock_transfer_watch_record', caseId: 'dock_manifest', title: '运河仓区的夜间转运记录',
    sourceKind: 'location', sourceId: 'canal', sourceLabel: '运河仓库外围的定点观察',
  },
  {
    id: 'dock_transfer_decoy', caseId: 'dock_manifest', title: '被临时替换的转运标记',
    sourceKind: 'location', sourceId: 'canal', sourceLabel: '运河仓区被清理后的残留标记',
  },
  {
    id: 'dock_witness_locker_token', caseId: 'dock_manifest', title: '知情工人储物柜里的领货牌',
    sourceKind: 'location', sourceId: 'docks', sourceLabel: '码头工棚储物柜与领货簿',
  },
  {
    id: 'dock_witness_last_errand', caseId: 'dock_manifest', title: '知情工人失踪前的临时差事',
    sourceKind: 'location', sourceId: 'docks', sourceLabel: '夜班点名册背面的临时记号',
  },
  {
    id: 'dock_sealed_statement_excerpt', caseId: 'dock_manifest', title: '封存陈述的核验摘录',
    sourceKind: 'location', sourceId: 'blackthorn_security', sourceLabel: '黑荆棘安保公司的限阅摘录',
  },
  {
    id: 'dock_official_case_summary', caseId: 'dock_manifest', title: '知情人保护情况摘要',
    sourceKind: 'location', sourceId: 'blackthorn_security', sourceLabel: '黑荆棘安保公司的公开受理摘要',
  },
  {
    id: 'dock_gray_hat_exchange_pattern', caseId: 'dock_manifest', title: '灰帽接头人的交换规律',
    sourceKind: 'location', sourceId: 'canal', sourceLabel: '运河仓区连续守候记录',
  },
  {
    id: 'dock_gray_hat_abandoned_route', caseId: 'dock_manifest', title: '被灰帽人放弃的旧路线',
    sourceKind: 'location', sourceId: 'canal', sourceLabel: '运河仓区空置交换点',
  },
  {
    id: 'dock_gray_hat_countermark', caseId: 'dock_manifest', title: '假仓单引出的回应暗记',
    sourceKind: 'location', sourceId: 'docks', sourceLabel: '东区码头假仓单设局记录',
  },
  {
    id: 'dock_gray_hat_trap_exposed', caseId: 'dock_manifest', title: '被识破的假仓单',
    sourceKind: 'location', sourceId: 'docks', sourceLabel: '东区码头暴露的设局现场',
  },
  {
    id: 'dock_gray_hat_joint_watch', caseId: 'dock_manifest', title: '针对灰帽接头人的联合盯守记录',
    sourceKind: 'location', sourceId: 'blackthorn_security', sourceLabel: '黑荆棘安保公司联合盯守回条',
  },
  {
    id: 'dock_gray_hat_watch_delayed', caseId: 'dock_manifest', title: '未获批准的联合盯守申请',
    sourceKind: 'location', sourceId: 'blackthorn_security', sourceLabel: '黑荆棘安保公司的受理答复',
  },
  {
    id: 'dock_gray_hat_escape_recollection', caseId: 'dock_manifest', title: '甩脱灰帽人后的路线回忆',
    sourceKind: 'event', sourceId: 'encounter:dock_manifest_cleaner', sourceLabel: '码头追踪遭遇后的即时记录',
  },
  {
    id: 'dock_gray_hat_dropped_token', caseId: 'dock_manifest', title: '灰帽人撤退时掉落的黄铜牌',
    sourceKind: 'event', sourceId: 'encounter:dock_manifest_cleaner', sourceLabel: '码头交锋结束后的现场拾取',
  },
  {
    id: 'dock_gray_hat_scene_lost', caseId: 'dock_manifest', title: '伤后丢失的遭遇现场',
    sourceKind: 'event', sourceId: 'encounter:dock_manifest_cleaner', sourceLabel: '巡夜人赶到后的有限记录',
  },
  {
    id: 'dock_gray_hat_retreat_route', caseId: 'dock_manifest', title: '灰帽人的撤退方向',
    sourceKind: 'event', sourceId: 'dock_encounter_aftermath:trace_retreat', sourceLabel: '脱身后的路线复盘',
  },
  {
    id: 'dock_gray_hat_trail_lost', caseId: 'dock_manifest', title: '无法继续确认的撤退痕迹',
    sourceKind: 'event', sourceId: 'dock_encounter_aftermath:trace_retreat', sourceLabel: '脱身后的失败追索记录',
  },
  {
    id: 'dock_gray_hat_token_handoff', caseId: 'dock_manifest', title: '灰帽人黄铜牌的正式移交回条',
    sourceKind: 'location', sourceId: 'blackthorn_security', sourceLabel: '黑荆棘安保公司的证物接收回条',
  },
  {
    id: 'dock_gray_hat_evidence_preserved', caseId: 'dock_manifest', title: '封存的遭遇证物与笔记',
    sourceKind: 'event', sourceId: 'dock_encounter_aftermath:preserve_evidence', sourceLabel: '停止追击后的个人封存记录',
  },
  {
    id: 'dock_old_yard_perimeter_map', caseId: 'dock_manifest', title: '旧装卸区外围通路记录',
    sourceKind: 'location', sourceId: 'old_loading_yard', sourceLabel: '旧装卸区白天踩点记录',
  },
  {
    id: 'dock_old_yard_public_boundary', caseId: 'dock_manifest', title: '旧装卸区无法越过的公开边界',
    sourceKind: 'location', sourceId: 'old_loading_yard', sourceLabel: '旧装卸区受阻的外围观察',
  },
  {
    id: 'dock_old_yard_porter_schedule', caseId: 'dock_manifest', title: '旧装卸区临时搬运班次',
    sourceKind: 'npc', sourceId: 'old_yard_porter', sourceLabel: '麦克引见的临时搬运工口述',
  },
  {
    id: 'dock_old_yard_workers_silent', caseId: 'dock_manifest', title: '搬运工回避的旧装卸区话题',
    sourceKind: 'npc', sourceId: 'old_yard_porter', sourceLabel: '临时搬运工中断的谈话记录',
  },
  {
    id: 'dock_old_yard_night_transfer', caseId: 'dock_manifest', title: '旧装卸区无编号夜间转运',
    sourceKind: 'location', sourceId: 'old_loading_yard', sourceLabel: '旧装卸区夜间守候记录',
  },
  {
    id: 'dock_old_yard_watch_disturbed', caseId: 'dock_manifest', title: '旧装卸区提前熄灭的灯号',
    sourceKind: 'location', sourceId: 'old_loading_yard', sourceLabel: '旧装卸区受惊后的守候记录',
  },
  {
    id: 'dock_wagon_coal_yard_route', caseId: 'dock_manifest', title: '篷车驶向河湾煤栈的路线',
    sourceKind: 'location', sourceId: 'old_loading_yard', sourceLabel: '夜间跟车留下的路线记录',
  },
  {
    id: 'dock_wagon_lost_at_bridge', caseId: 'dock_manifest', title: '篷车在桥区消失的位置',
    sourceKind: 'location', sourceId: 'old_loading_yard', sourceLabel: '夜间跟车中断记录',
  },
  {
    id: 'dock_crate_tar_seal', caseId: 'dock_manifest', title: '遗留封箱上的焦油铅封',
    sourceKind: 'location', sourceId: 'old_loading_yard', sourceLabel: '旧装卸区遗留封箱检查记录',
  },
  {
    id: 'dock_crate_packing_trace', caseId: 'dock_manifest', title: '已被清空的封箱填料',
    sourceKind: 'location', sourceId: 'old_loading_yard', sourceLabel: '旧装卸区受阻的封箱检查',
  },
  {
    id: 'dock_official_interception_record', caseId: 'dock_manifest', title: '无编号篷车的正式截查记录',
    sourceKind: 'location', sourceId: 'blackthorn_security', sourceLabel: '黑荆棘安保公司的联合截查回条',
  },
  {
    id: 'dock_interception_declined', caseId: 'dock_manifest', title: '未获批准的篷车截查申请',
    sourceKind: 'location', sourceId: 'blackthorn_security', sourceLabel: '黑荆棘安保公司的书面答复',
  },
  {
    id: 'dock_tar_seal_coal_omen', caseId: 'dock_manifest', title: '焦油铅封指向的煤尘与河湾征兆',
    sourceKind: 'event', sourceId: 'divination:tarred_cargo_seal', sourceLabel: '对遗留铅封的有限占卜记录',
  },
  {
    id: 'secret_order_cipher', caseId: 'organization_secret_order', title: '旧书账册中的星象暗记夹页',
    sourceKind: 'npc', sourceId: 'nelson', sourceLabel: '老尼尔逊交付的可信账册夹页',
  },
  {
    id: 'psychology_case_notes', caseId: 'organization_psychology', title: '需要匿名处理的病例观察索引',
    sourceKind: 'npc', sourceId: 'ella', sourceLabel: '艾拉交付的匿名病例索引',
  },
  {
    id: 'abraham_door_map', caseId: 'organization_abraham', title: '门框夹层里的空间草图',
    sourceKind: 'location', sourceId: 'manor', sourceLabel: '雾林庄园门框夹层',
  },
  {
    id: 'manor_address', caseId: 'manor_access', title: '雾林旧宅的手绘路线',
    sourceKind: 'npc', sourceId: 'nelson', sourceLabel: '老尼尔逊提供的旧地址',
  },
  {
    id: 'clocktower_divination_omen', caseId: 'clocktower', title: '停摆指针的重复征兆',
    sourceKind: 'event', sourceId: 'divination:old_tower', sourceLabel: '对旧钟楼的占卜记录',
  },
  {
    id: 'cryptic_note_warning', caseId: 'cryptic_note', title: '残页上的回望警告',
    sourceKind: 'event', sourceId: 'divination:cryptic_note', sourceLabel: '对密文残页的占卜记录',
  },
  {
    id: 'dock_ledger_notation', caseId: 'dock_manifest', title: '港务编号抄写法',
    sourceKind: 'archive', sourceId: 'book:dock_manifest_manual', sourceLabel: '《港务编号与仓单抄写规范》',
  },
  {
    id: 'manor_guest_registry', caseId: 'manor_history', title: '庄园访客名册摘录',
    sourceKind: 'archive', sourceId: 'book:manor_guest_registry', sourceLabel: '《雾林庄园访客名册》',
  },
  {
    id: 'tingen_city_directory', caseId: 'tingen_landmarks', title: '廷根市公共地点目录',
    sourceKind: 'public_records', sourceId: 'market_city_notice', sourceLabel: '铁十字街公共告示与城区地图',
  },
  {
    id: 'tingen_honest_paper', caseId: 'tingen_landmarks', title: '《廷根市诚实报》公共场所索引',
    sourceKind: 'archive', sourceId: 'dewill_periodicals', sourceLabel: '德维尔图书馆公共报刊架',
  },
  {
    id: 'tingen_church_directory', caseId: 'tingen_landmarks', title: '廷根教会公共服务公告',
    sourceKind: 'public_records', sourceId: 'st_selena_notice', sourceLabel: '圣赛琳娜教堂公开公告栏',
  },
  {
    id: 'blackthorn_referral', caseId: 'blackthorn_contact', title: '安保公司异常说明转介回条',
    sourceKind: 'location', sourceId: 'hound_message', sourceLabel: '猎犬酒馆代收的安保联络口信',
  },
  {
    id: 'river_sea_missing_notices', caseId: 'dock_manifest', title: '河运失踪人员公开告示',
    sourceKind: 'public_records', sourceId: 'river_sea_shipping_board', sourceLabel: '河与海教堂公开河运告示栏',
  },
  {
    id: 'dock_scale_transfer_omen', caseId: 'dock_manifest', title: '硬质薄片指向的转运与退路',
    sourceKind: 'event', sourceId: 'divination:dock_scale_evidence', sourceLabel: '对沾水硬质薄片的占卜记录',
  },
  {
    id: 'dock_seq9_seer_omen', caseId: 'dock_manifest', title: '潮痕与失踪时刻的重复预兆',
    sourceKind: 'location', sourceId: 'dock_seq9_seer', sourceLabel: '东区码头的象征预兆记录',
  },
  {
    id: 'dock_seq9_spectator_testimony', caseId: 'dock_manifest', title: '搬运工证词中的回避与矛盾',
    sourceKind: 'location', sourceId: 'dock_seq9_spectator', sourceLabel: '东区码头的公开证词整理',
  },
  {
    id: 'dock_seq9_hunter_tracks', caseId: 'dock_manifest', title: '退潮泥地上的拖行回路',
    sourceKind: 'location', sourceId: 'dock_seq9_hunter', sourceLabel: '东区码头的痕迹追踪记录',
  },
  {
    id: 'dock_seq9_sleepless_watch', caseId: 'dock_manifest', title: '夜班交接间隙的异常动静',
    sourceKind: 'location', sourceId: 'dock_seq9_sleepless', sourceLabel: '东区码头的夜间守望记录',
  },
  {
    id: 'dock_seq9_apprentice_passage', caseId: 'dock_manifest', title: '货栈之间不合常理的通路关系',
    sourceKind: 'location', sourceId: 'dock_seq9_apprentice', sourceLabel: '东区码头的通路勘察记录',
  },
  {
    id: 'dock_seq9_seer_manifest_omen', caseId: 'dock_manifest', title: '仓单日期与预兆的交叉记录',
    sourceKind: 'location', sourceId: 'dock_seq9_seer_manifest', sourceLabel: '东区码头账房的仓单核验',
  },
  {
    id: 'dock_seq9_spectator_ledger_evasion', caseId: 'dock_manifest', title: '账房答复中的一致回避',
    sourceKind: 'location', sourceId: 'dock_seq9_spectator_ledger', sourceLabel: '东区码头账房的问询记录',
  },
  {
    id: 'dock_seq9_hunter_transfer_marks', caseId: 'dock_manifest', title: '运河转运点的重复痕迹',
    sourceKind: 'location', sourceId: 'dock_seq9_hunter_transfer', sourceLabel: '运河仓库外围的追踪记录',
  },
  {
    id: 'dock_seq9_sleepless_shift_recollection', caseId: 'dock_manifest', title: '麦克复述的夜班交接片段',
    sourceKind: 'npc', sourceId: 'mike', sourceLabel: '醉水手酒馆老板麦克的回忆',
  },
  {
    id: 'dock_seq9_apprentice_transfer_geometry', caseId: 'dock_manifest', title: '运河仓区的转运几何关系',
    sourceKind: 'location', sourceId: 'dock_seq9_apprentice_canal', sourceLabel: '运河仓库外围的通路测绘',
  },
  {
    id: 'dock_seq9_conclusion', caseId: 'dock_manifest', title: '综合调查完成、等待处置',
    sourceKind: 'location', sourceId: 'dock_seq9_synthesis', sourceLabel: '码头失踪案的交叉核验记录',
  },
  {
    id: 'dock_disposition_public_report', caseId: 'dock_manifest', title: '向港务公开窗口递交报告',
    sourceKind: 'location', sourceId: 'dock_public_report', sourceLabel: '东区码头港务公开窗口',
  },
  {
    id: 'dock_disposition_workers_warning', caseId: 'dock_manifest', title: '通过麦克提醒夜班工人',
    sourceKind: 'npc', sourceId: 'mike', sourceLabel: '醉水手酒馆的工人互助口信',
  },
  {
    id: 'dock_disposition_official_handoff', caseId: 'dock_manifest', title: '向正式接触的安保人员移交记录',
    sourceKind: 'location', sourceId: 'blackthorn_security', sourceLabel: '黑荆棘安保公司的正式接收回条',
  },
  {
    id: 'tingen_factory_repairs', caseId: 'tingen_industry', title: '城郊机械事故与修理公告',
    sourceKind: 'public_records', sourceId: 'st_number_repairs', sourceLabel: '圣数教堂公开修理公告',
  },
  {
    id: 'club_lost_keepsake_brief', caseId: 'divination_club', title: '遗失纪念品的来访记录',
    sourceKind: 'npc', sourceId: 'club_client_lena', sourceLabel: '蕾娜女士签名确认的委托记录',
  },
  {
    id: 'club_journey_statement', caseId: 'divination_club', title: '出行咨询的事实陈述',
    sourceKind: 'npc', sourceId: 'club_client_owen', sourceLabel: '欧文先生签名确认的预约陈述',
  },
  {
    id: 'club_nightmare_statement', caseId: 'divination_club', title: '反复噩梦的来访记录',
    sourceKind: 'npc', sourceId: 'club_client_adele', sourceLabel: '阿黛尔女士签名确认的梦境与作息记录',
  },
  {
    id: 'club_lost_keepsake_market_trace', caseId: 'divination_club', title: '市场柜台的失物核对记录',
    sourceKind: 'location', sourceId: 'market', sourceLabel: '铁十字街市场的柜台与失物登记',
  },
  {
    id: 'club_journey_public_notice', caseId: 'divination_club', title: '河运公告与行程核对记录',
    sourceKind: 'location', sourceId: 'river_sea_church', sourceLabel: '河与海教堂公开河运告示栏',
  },
  {
    id: 'club_nightmare_periodical_trace', caseId: 'divination_club', title: '梦境细节的旧报核对记录',
    sourceKind: 'location', sourceId: 'dewill_library', sourceLabel: '德维尔图书馆公共报刊架',
  },
  {
    id: 'club_lost_keepsake_outcome', caseId: 'divination_club', title: '遗失纪念品咨询结论',
    sourceKind: 'npc', sourceId: 'club_client_lena', sourceLabel: '蕾娜女士签收的有限咨询结论',
  },
  {
    id: 'club_journey_omen_outcome', caseId: 'divination_club', title: '远行征兆咨询结论',
    sourceKind: 'npc', sourceId: 'club_client_owen', sourceLabel: '欧文先生签收的行程提醒',
  },
  {
    id: 'club_nightmare_outcome', caseId: 'divination_club', title: '反复噩梦咨询结论',
    sourceKind: 'npc', sourceId: 'club_client_adele', sourceLabel: '阿黛尔女士签收的克制性建议',
  },
  {
    id: 'elliot_commission_brief', caseId: 'elliot_kidnapping', title: '艾略特失踪委托书',
    sourceKind: 'npc', sourceId: 'vickroyer', sourceLabel: '维克罗尔先生签署的寻人委托',
  },
  {
    id: 'elliot_worn_coat', caseId: 'elliot_kidnapping', title: '艾略特穿过的旧外套',
    sourceKind: 'npc', sourceId: 'vickroyer', sourceLabel: '委托人交付的失踪者随身物',
  },
  {
    id: 'elliot_partner_assignment', caseId: 'elliot_kidnapping', title: '值夜者同行安排',
    sourceKind: 'npc', sourceId: 'leonard', sourceLabel: '黑荆棘安保公司的外勤安排',
  },
  {
    id: 'elliot_hideout_address', caseId: 'elliot_kidnapping', title: '弗尔斯顿路藏身处地址',
    sourceKind: 'event', sourceId: 'elliot_locator', sourceLabel: '寻人占卜或公开记录交叉核对',
  },
  {
    id: 'elliot_presence_confirmed', caseId: 'elliot_kidnapping', title: '艾略特仍在屋内的现场确认',
    sourceKind: 'location', sourceId: 'forston_hideout', sourceLabel: '弗尔斯顿路藏身处外围',
  },
  {
    id: 'elliot_backup_ready', caseId: 'elliot_kidnapping', title: '撤退后的增援部署',
    sourceKind: 'npc', sourceId: 'leonard', sourceLabel: '黑荆棘安保公司的增援复核',
  },
  {
    id: 'elliot_rescue_record', caseId: 'elliot_kidnapping', title: '艾略特获救记录',
    sourceKind: 'location', sourceId: 'forston_hideout', sourceLabel: '值夜者外勤营救记录',
  },
  {
    id: 'sage_lesson_boundary_note', caseId: 'seer_training', title: '神秘学课程来源核验回条',
    sourceKind: 'event', sourceId: 'secret_gathering:sage_lesson', sourceLabel: '隐秘集会课程摊位的来源与风险回条',
  },
];

export const INVESTIGATION_EVIDENCE_DEFS: readonly InvestigationEvidenceDef[] = [
  { clueId: 'dock_missing_reports', claim: '几份登记里，班次和仓区似乎有些重合。', sourceQuality: '公开登记，随时可以回头查' },
  { clueId: 'river_sea_missing_notices', claim: '河运告示上还记着另一批失踪者的姓名和时间。', sourceQuality: '来自另一处的公开告示' },
  { clueId: 'dock_manifest_discrepancy', claim: '货运备份中有几段不自然的空白。', sourceQuality: '码头档案中的抄本' },
  { clueId: 'dock_marked_manifest', claim: '旧仓单上留着陌生印记，库位也被改过。', sourceQuality: '保存下来的旧仓单' },
  { clueId: 'dock_crate_trace', claim: '拖痕和水迹没有沿着平常的卸货路线延伸。', sourceQuality: '亲眼记下的现场痕迹' },
  { clueId: 'dock_scale_transfer_omen', claim: '那枚硬质薄片反复带来转运与退路的征兆。', sourceQuality: '占卜所得，还需要现实印证' },
  { clueId: 'dock_witness_warned', claim: '口信送达后，知情工人暂时避开了原本的夜班路线。', sourceQuality: '由已经结识的麦克转交' },
  { clueId: 'dock_watcher_route', claim: '盯梢者离开交接处后，反复绕向同一片转运仓区。', sourceQuality: '亲自跟踪留下的路线记录' },
  { clueId: 'dock_witness_disappeared', claim: '被盯上的工人没有回到住处，点名册上也没有请假记录。', sourceQuality: '工棚与夜班名册能够互相核对' },
  { clueId: 'dock_witness_protected', claim: '正式安保人员已经接走知情工人，并封存了他的当晚陈述。', sourceQuality: '有接收回条，但陈述暂时不在自己手中' },
  { clueId: 'dock_witness_statement', claim: '知情人确认灰帽人每次都在同一声汽笛后更换领货牌。', sourceQuality: '由麦克安排的当面陈述' },
  { clueId: 'dock_witness_fragment', claim: '工人只留下“第二声汽笛”和一段没写完的库位号。', sourceQuality: '匆忙留下的片段，还需别处印证' },
  { clueId: 'dock_transfer_watch_record', claim: '运河仓区在第二声汽笛后出现了一次没有登记的短暂停靠。', sourceQuality: '亲眼记录的夜间转运' },
  { clueId: 'dock_transfer_decoy', claim: '原本的转运标记已被替换，说明有人发现路线可能暴露。', sourceQuality: '被清理现场留下的反向证据' },
  { clueId: 'dock_witness_locker_token', claim: '领货牌上的库位号与异常仓单的一处涂改相同。', sourceQuality: '实物与码头领货簿可以互相核对' },
  { clueId: 'dock_witness_last_errand', claim: '知情人失踪前被临时调去搬运一件没有正式编号的货物。', sourceQuality: '点名册背面的临时记号' },
  { clueId: 'dock_sealed_statement_excerpt', claim: '限阅摘录确认了汽笛时间、领货牌和一名灰帽接头人。', sourceQuality: '正式机构核验后的有限摘录' },
  { clueId: 'dock_official_case_summary', claim: '受理摘要只确认威胁与交接空档有关，没有开放知情人的完整陈述。', sourceQuality: '正式机构公开摘要，内容有限' },
  { clueId: 'dock_gray_hat_exchange_pattern', claim: '灰帽人不直接碰货，只在换车前后更换领货牌和仓单暗记。', sourceQuality: '多次守候后形成的行动规律' },
  { clueId: 'dock_gray_hat_abandoned_route', claim: '旧交换点已经停用，但清理顺序证明对方能够及时获知路线暴露。', sourceQuality: '空置现场形成的反向证据' },
  { clueId: 'dock_gray_hat_countermark', claim: '假仓单被留下回应暗记，说明灰帽人负责核验仓单而非搬运货物。', sourceQuality: '设局后取得的直接回应' },
  { clueId: 'dock_gray_hat_trap_exposed', claim: '假仓单被人划去并留下一道警告，设局已经暴露。', sourceQuality: '失败设局留下的风险事实' },
  { clueId: 'dock_gray_hat_joint_watch', claim: '联合盯守确认灰帽人是负责清理记录与核验交接的中间人。', sourceQuality: '正式人员共同见证的行动记录' },
  { clueId: 'dock_gray_hat_watch_delayed', claim: '联合行动没有获准，但答复确认类似灰帽人曾出现在其他记录清理现场。', sourceQuality: '正式答复中的有限旁证' },
  { clueId: 'dock_gray_hat_escape_recollection', claim: '甩脱追踪时，灰帽人始终试图把你逼离一条通向运河的窄巷。', sourceQuality: '紧张遭遇后的即时回忆，需要复盘' },
  { clueId: 'dock_gray_hat_dropped_token', claim: '黄铜牌一面是磨损库号，另一面有与假仓单相近的回应暗记。', sourceQuality: '交锋现场取得的实物' },
  { clueId: 'dock_gray_hat_scene_lost', claim: '巡夜人赶到时对方与现场痕迹都已离开，只能确认袭击确实发生。', sourceQuality: '伤后留下的有限事实' },
  { clueId: 'dock_gray_hat_retreat_route', claim: '撤退方向绕过主街，最终指向运河下游的旧装卸区。', sourceQuality: '根据现场、时间与路线交叉复盘' },
  { clueId: 'dock_gray_hat_trail_lost', claim: '撤退痕迹在主街人流中断开，无法继续指向具体落脚处。', sourceQuality: '失败追索仍能限定的边界' },
  { clueId: 'dock_gray_hat_token_handoff', claim: '正式人员接收黄铜牌，并确认它不是公开港务凭证。', sourceQuality: '带有接收回条的证物核验' },
  { clueId: 'dock_gray_hat_evidence_preserved', claim: '遭遇证物、路线回忆与原始笔记被分开封存，避免继续冒险丢失。', sourceQuality: '自行完成的证物保存记录' },
  { clueId: 'dock_old_yard_perimeter_map', claim: '旧装卸区有一条不在公共货运图上的临河通道，能绕开正门。', sourceQuality: '白天沿公共边界逐段核对的通路记录' },
  { clueId: 'dock_old_yard_public_boundary', claim: '围栏、值守与积水挡住了继续观察，尚不能确认内部用途。', sourceQuality: '失败踩点仍能确认的现场边界' },
  { clueId: 'dock_old_yard_porter_schedule', claim: '临时工只在第二声夜间汽笛前后被叫去搬运没有编号的封箱。', sourceQuality: '由熟人引见后取得的当面口述' },
  { clueId: 'dock_old_yard_workers_silent', claim: '搬运工听见库位号后立刻停止谈话，说明这个话题可能已经引起戒备。', sourceQuality: '谈话受阻留下的风险事实' },
  { clueId: 'dock_old_yard_night_transfer', claim: '一辆没有港务编号的篷车在第二声汽笛后短暂停靠，交接者使用了灰帽人的回应暗记。', sourceQuality: '路线、口述与现场守候互相印证' },
  { clueId: 'dock_old_yard_watch_disturbed', claim: '预定灯号在你靠近后提前熄灭，无法确认来车与灰帽人的关系。', sourceQuality: '守候失败后留下的有限事实' },
  { clueId: 'dock_wagon_coal_yard_route', claim: '无编号篷车绕开主路，最终驶入河湾煤栈后侧的一扇矮门。', sourceQuality: '夜间保持距离完成的连续路线记录' },
  { clueId: 'dock_wagon_lost_at_bridge', claim: '篷车在桥区利用两辆运煤车遮挡转向，后续去向无法确认。', sourceQuality: '跟踪失败仍能确认的最后位置' },
  { clueId: 'dock_crate_tar_seal', claim: '遗留封箱使用掺煤灰的焦油和重复压印铅封，说明包装可被统一替换。', sourceQuality: '现场取得的铅封与包装记录' },
  { clueId: 'dock_crate_packing_trace', claim: '封箱已经被清空，只留下煤灰、湿麻绳与重新钉合的痕迹。', sourceQuality: '未取得实物时保留下来的包装痕迹' },
  { clueId: 'dock_official_interception_record', claim: '正式截查确认篷车没有公开港务编号，车夫只持有一次性运煤票据。', sourceQuality: '正式人员共同见证并出具回条' },
  { clueId: 'dock_interception_declined', claim: '正式人员认为现有记录不足以当场截车，但已登记车体与灯号特征。', sourceQuality: '书面答复中的有限确认' },
  { clueId: 'dock_tar_seal_coal_omen', claim: '占卜反复出现煤尘、河湾水声与一扇低矮后门，仍需现实路线印证。', sourceQuality: '针对明确实物的有限占卜结果' },
];

export const INVESTIGATION_HYPOTHESIS_DEFS: readonly InvestigationHypothesisDef[] = [
  {
    id: 'dock_transfer_window', caseId: 'dock_manifest', label: '反复出现的交接空档',
    statement: '这几起失踪，或许都和同一段交接空档有关。',
    requiredClueIds: ['dock_missing_reports', 'dock_manifest_discrepancy'],
    methodIds: ['compare_records', 'interview_witness'],
    preparationId: 'hypothesis:dock_transfer_window:supported',
    nextStepByOutcome: {
      inconclusive: '时间和班次还是对不上。先去找另一份告示，或者弄懂港务编号。',
      limited: '有几处时间碰到了一起，但还不能排除误记。也许该找夜班的人聊聊。',
      reliable: '失踪时间和货运空白落在同一段交接时间里。旧仓单值得再翻一遍。',
      strong: '几份互不相干的记录都指向同一段时间。接下来可以盯住那段交接空档。',
    },
  },
  {
    id: 'dock_silenced_witnesses', caseId: 'dock_manifest', label: '几名失踪者经手过同一件事',
    statement: '他们的失踪，也许和同一批货物或同一张仓单有关。',
    requiredClueIds: ['dock_missing_reports', 'dock_marked_manifest'],
    methodIds: ['compare_records', 'interview_witness'],
    preparationId: 'hypothesis:dock_silenced_witnesses:supported',
    nextStepByOutcome: {
      inconclusive: '姓名和仓单暂时连不起来，眼下还不能怀疑任何人。',
      limited: '其中一两个人确实碰过这张仓单，但还少一份旁证。',
      reliable: '几名失踪者都在同一环节留下过名字。接下来要查清他们经手的先后。',
      strong: '仓单和证词都能对上。最好先护住知情人，再考虑把记录交出去。',
    },
  },
  {
    id: 'dock_occult_interference', caseId: 'dock_manifest', label: '现场还藏着别的东西',
    statement: '货箱附近的痕迹，也许不只是走私或事故留下的。',
    requiredClueIds: ['dock_crate_trace', 'dock_scale_transfer_omen'],
    methodIds: ['inspect_scene', 'occult_verify'],
    preparationId: 'hypothesis:dock_occult_interference:supported',
    nextStepByOutcome: {
      inconclusive: '残留的东西太杂，看不出异样从哪里来。先把样本和位置记好。',
      limited: '征兆和现场有一两处能对上，但普通原因仍然说得通。',
      reliable: '灵视所见和现场痕迹彼此呼应。接下来最好找一位可靠的非凡者帮忙。',
      strong: '两边看到的东西几乎完全一致。再独自追下去，恐怕会很危险。',
    },
  },
];

export const INVESTIGATION_METHOD_DEFS: readonly InvestigationMethodDef[] = [
  { id: 'compare_records', label: '把记录重新排一遍', description: '按时间、班次和库位，把手头几份记录摊开重看。', hours: 2, energyCost: 8, attentionOnAttempt: 5 },
  { id: 'interview_witness', label: '找知情人聊聊', description: '不亮出所有底牌，听麦克再说一遍那几个夜班。', hours: 2, energyCost: 8, attentionOnAttempt: 10 },
  { id: 'inspect_scene', label: '回现场看看', description: '照着笔记重走一遍，只看位置、痕迹和可以离开的路。', hours: 2, energyCost: 12, attentionOnAttempt: 15 },
  { id: 'occult_verify', label: '用灵视看一眼', description: '回到安全的地方，短暂开启灵视，看看两边是否能对上。', hours: 2, energyCost: 14, attentionOnAttempt: 20 },
];

export const NIGHTWATCH_ROUTINE_ACTIONS: readonly NightwatchRoutineActionDef[] = [
  {
    id: 'archive_rotation', label: '整理值夜档案', description: '核对公开受理记录和已脱敏的轮值表，不接触封印物档案。',
    hours: 2, energyCost: 8, openFrom: 9, openTo: 17, cooldown: 'daily', pay: 36, reputationGain: 1,
  },
  {
    id: 'combat_drill', label: '参加基础格斗训练', description: '与队员练习控制距离、撤退口令和非致命制服。',
    hours: 2, energyCost: 12, openFrom: 9, openTo: 19, cooldown: 'daily', pay: 0, reputationGain: 1,
    trainingSkill: 'combat', trainingPoints: 1,
  },
  {
    id: 'night_patrol', label: '执行夜间外围轮值', description: '按固定路线完成外围巡查，只记录并上报异常。',
    hours: 4, energyCost: 18, openFrom: 18, openTo: 24, cooldown: 'weekly', pay: 72, reputationGain: 2,
    trainingSkill: 'investigate', trainingPoints: 1,
  },
];

export const DIVINATION_CLUB_COMMISSIONS: readonly DivinationClubCommissionDef[] = [
  {
    id: 'lost_keepsake', clientId: 'club_client_lena', clientName: '蕾娜女士',
    label: '遗失的纪念品', description: '根据蕾娜女士的陈述与物品使用习惯，缩小一枚纪念戒指的遗失范围。',
    acceptCheckId: 'club_accept_lost_keepsake', checkId: 'club_commission_lost_keepsake', briefingClueId: 'club_lost_keepsake_brief',
    fieldCheckId: 'club_field_lost_keepsake', fieldLocationId: 'market', fieldClueId: 'club_lost_keepsake_market_trace',
    fieldActionLabel: '核对市场柜台与失物登记', fieldNextStepText: '柜台记录仍无法相互印证；可以补看城区目录，或提高调查经验后重新核对。',
    outcomeClueId: 'club_lost_keepsake_outcome', actingPrincipleId: 'observe',
    acceptEnergyCost: 4, acceptHours: 1, fieldPassEnergyCost: 8, fieldPassHours: 2, fieldBlockedEnergyCost: 4, fieldBlockedHours: 1,
    reward: 72, reputationGain: 2, digestionGain: 3, passEnergyCost: 8, passHours: 2,
    blockedEnergyCost: 4, blockedHours: 1,
    nextStepText: '陈述中的时间顺序仍有空白；可以提升调查经验，或补充公共记录后再核对。',
    narrationVariants: ['你把失物范围收束到来访者当天停留过的两处柜台。', '你从反复出现的生活细节中排除了错误方向。'],
  },
  {
    id: 'journey_omen', clientId: 'club_client_owen', clientName: '欧文先生',
    label: '出行前的征兆咨询', description: '在不夸大结论的前提下，为准备远行的欧文先生整理象征与现实风险。',
    acceptCheckId: 'club_accept_journey_omen', checkId: 'club_commission_journey_omen', briefingClueId: 'club_journey_statement',
    fieldCheckId: 'club_field_journey_omen', fieldLocationId: 'river_sea_church', fieldClueId: 'club_journey_public_notice',
    fieldActionLabel: '核对河运公告与行程', fieldNextStepText: '公开班次与来访陈述还没有形成稳定对应；可以补足教会公告来源，或提高交谈经验后再问询。',
    outcomeClueId: 'club_journey_omen_outcome', actingPrincipleId: 'warn',
    acceptEnergyCost: 4, acceptHours: 1, fieldPassEnergyCost: 8, fieldPassHours: 2, fieldBlockedEnergyCost: 4, fieldBlockedHours: 1,
    reward: 96, reputationGain: 3, digestionGain: 4, passEnergyCost: 10, passHours: 2,
    blockedEnergyCost: 4, blockedHours: 1,
    nextStepText: '象征之间尚未形成稳定对应；可以继续练习神秘学，或取得与行程有关的可靠旁证。',
    narrationVariants: ['你只陈述能够重复验证的征兆，并给出了一条现实层面的避险建议。', '你把模糊象征整理成了有限、可复核的提示。'],
  },
  {
    id: 'recurring_nightmare', clientId: 'club_client_adele', clientName: '阿黛尔女士',
    label: '反复出现的噩梦', description: '核对阿黛尔女士反复梦境中的现实来源，并把结论限制在能够复核的范围。',
    acceptCheckId: 'club_accept_recurring_nightmare', checkId: 'club_commission_recurring_nightmare', briefingClueId: 'club_nightmare_statement',
    fieldCheckId: 'club_field_recurring_nightmare', fieldLocationId: 'dewill_library', fieldClueId: 'club_nightmare_periodical_trace',
    fieldActionLabel: '核对梦境细节与旧报', fieldNextStepText: '梦境细节与旧报索引仍有混淆；可以重整来访记录，或提高神秘学经验后再核对。',
    outcomeClueId: 'club_nightmare_outcome', actingPrincipleId: 'restraint',
    acceptEnergyCost: 4, acceptHours: 1, fieldPassEnergyCost: 8, fieldPassHours: 2, fieldBlockedEnergyCost: 4, fieldBlockedHours: 1,
    reward: 84, reputationGain: 2, digestionGain: 4, passEnergyCost: 9, passHours: 2,
    blockedEnergyCost: 4, blockedHours: 1,
    nextStepText: '梦境与现实记录还不能稳定对应；可以重新梳理陈述，或在克制结论的前提下继续练习。',
    narrationVariants: ['你只指出梦境与旧报细节的对应，并建议她调整作息、必要时求助医生。', '你拒绝把反复梦境解释成确定预兆，只交付了能够复核的现实对应。'],
  },
];

export const SEER_TRAINING_NODES: readonly SeerTrainingNodeDef[] = [
  {
    id: 'meditation_control', label: '冥想控制', description: '学习收束杂念、记录状态并主动结束冥想。',
    prerequisites: [], hours: 2, energyCost: 8,
  },
  {
    id: 'spirit_vision_focus', label: '灵视收束', description: '把灵视限制在明确目标和短时窗口内，避免无目的扫视。',
    prerequisites: ['meditation_control'], hours: 2, energyCost: 10, requiredPractice: 'meditation',
  },
  {
    id: 'dowsing', label: '灵摆寻人', description: '以有来源的随身物和固定问题进行寻人指向，不把模糊摆动当成身份答案。',
    prerequisites: ['spirit_vision_focus'], hours: 3, energyCost: 12, requiredItemId: 'plain_pendulum',
  },
  {
    id: 'spirituality_wall', label: '灵性之墙', description: '用普通粉笔、固定边界和结束口令建立练习区域。',
    prerequisites: ['dowsing'], hours: 3, energyCost: 12, requiredItemId: 'ritual_chalk',
  },
  {
    id: 'ritual_safety', label: '仪式安全', description: '学习材料核对、退出条件与失败后的封存流程。',
    prerequisites: ['spirituality_wall'], hours: 3, energyCost: 14, requiredItemId: 'ritual_chalk',
  },
  {
    id: 'spirit_channeling', label: '通灵基础', description: '只对正式案件记录进行受监督回溯，并在越过记录边界前主动终止。',
    prerequisites: ['ritual_safety'], hours: 3, energyCost: 14, requiredPractice: 'ritual_safety',
  },
  {
    id: 'charm_theory', label: '符咒理论', description: '认识空白载体、结构、作废线与失效边界。',
    prerequisites: ['spirit_channeling'], hours: 3, energyCost: 12, requiredPractice: 'spirit_channeling_review', requiredItemId: 'blank_charm_paper',
  },
];

const dockSequence9Check = (
  pathwayId: string,
  stat: StatKey,
  skill: SkillKey,
  pathClueId: string,
  statLabel: string,
  skillLabel: string,
): CheckDef => ({
  id: `dock_seq9_resolution_${pathwayId}`, version: 1, domain: 'exploration',
  target: { kind: 'case', id: `dock_manifest_${pathwayId}` }, difficulty: 36,
  requirements: [{ kind: 'clue', id: pathClueId }],
  contributions: [
    { kind: 'stat', id: stat, multiplier: 1, publicLabel: statLabel },
    { kind: 'skill', id: skill, multiplier: 4, publicLabel: skillLabel },
    { kind: 'clue', id: pathClueId, value: 10, publicLabel: '本途径现场记录' },
    { kind: 'clue', id: 'dock_missing_reports', value: 4, publicLabel: '公开失踪登记' },
    { kind: 'clue', id: 'dock_manifest_discrepancy', value: 6, publicLabel: '货运记录旁证' },
    { kind: 'clue', id: 'dock_crate_trace', value: 4, publicLabel: '码头现场记录' },
    { kind: 'clue', id: 'dock_ledger_notation', value: 4, publicLabel: '仓单编号知识' },
    { kind: 'clue', id: 'dock_marked_manifest', value: 4, publicLabel: '异常仓单记录' },
    { kind: 'clue', id: 'river_sea_missing_notices', value: 3, publicLabel: '河运失踪告示' },
    { kind: 'clue', id: 'dock_witness_warned', value: 4, publicLabel: '已经送达的避险口信' },
    { kind: 'clue', id: 'dock_watcher_route', value: 8, publicLabel: '盯梢者的转运路线' },
    { kind: 'clue', id: 'dock_witness_disappeared', value: 6, publicLabel: '知情人失踪记录' },
    { kind: 'clue', id: 'dock_witness_protected', value: 4, publicLabel: '正式保护回条' },
    { kind: 'clue', id: 'dock_witness_statement', value: 8, publicLabel: '知情人完整陈述' },
    { kind: 'clue', id: 'dock_witness_fragment', value: 4, publicLabel: '知情人口信片段' },
    { kind: 'clue', id: 'dock_transfer_watch_record', value: 8, publicLabel: '夜间转运记录' },
    { kind: 'clue', id: 'dock_transfer_decoy', value: 4, publicLabel: '被替换的转运标记' },
    { kind: 'clue', id: 'dock_witness_locker_token', value: 8, publicLabel: '储物柜领货牌' },
    { kind: 'clue', id: 'dock_witness_last_errand', value: 4, publicLabel: '失踪前临时差事' },
    { kind: 'clue', id: 'dock_sealed_statement_excerpt', value: 8, publicLabel: '封存陈述摘录' },
    { kind: 'clue', id: 'dock_official_case_summary', value: 4, publicLabel: '保护情况摘要' },
    { kind: 'clue', id: 'dock_gray_hat_exchange_pattern', value: 10, publicLabel: '灰帽人交换规律' },
    { kind: 'clue', id: 'dock_gray_hat_abandoned_route', value: 5, publicLabel: '被放弃的旧路线' },
    { kind: 'clue', id: 'dock_gray_hat_countermark', value: 10, publicLabel: '回应暗记' },
    { kind: 'clue', id: 'dock_gray_hat_trap_exposed', value: 5, publicLabel: '暴露的假仓单' },
    { kind: 'clue', id: 'dock_gray_hat_joint_watch', value: 10, publicLabel: '联合盯守记录' },
    { kind: 'clue', id: 'dock_gray_hat_watch_delayed', value: 5, publicLabel: '联合盯守答复' },
    { kind: 'clue', id: 'dock_gray_hat_escape_recollection', value: 4, publicLabel: '遭遇后的路线回忆' },
    { kind: 'clue', id: 'dock_gray_hat_dropped_token', value: 8, publicLabel: '灰帽人遗落的黄铜牌' },
    { kind: 'clue', id: 'dock_gray_hat_scene_lost', value: 3, publicLabel: '袭击确实发生的记录' },
    { kind: 'clue', id: 'dock_gray_hat_retreat_route', value: 8, publicLabel: '复盘出的撤退方向' },
    { kind: 'clue', id: 'dock_gray_hat_trail_lost', value: 4, publicLabel: '追索中断的位置' },
    { kind: 'clue', id: 'dock_gray_hat_token_handoff', value: 6, publicLabel: '黄铜牌移交回条' },
    { kind: 'clue', id: 'dock_gray_hat_evidence_preserved', value: 5, publicLabel: '封存的遭遇证物' },
    { kind: 'clue', id: 'dock_old_yard_perimeter_map', value: 6, publicLabel: '旧装卸区外围通路' },
    { kind: 'clue', id: 'dock_old_yard_public_boundary', value: 3, publicLabel: '旧装卸区现场边界' },
    { kind: 'clue', id: 'dock_old_yard_porter_schedule', value: 8, publicLabel: '临时搬运班次' },
    { kind: 'clue', id: 'dock_old_yard_workers_silent', value: 3, publicLabel: '工人回避的敏感话题' },
    { kind: 'clue', id: 'dock_old_yard_night_transfer', value: 10, publicLabel: '无编号夜间转运' },
    { kind: 'clue', id: 'dock_old_yard_watch_disturbed', value: 4, publicLabel: '提前熄灭的灯号' },
    { kind: 'clue', id: 'dock_wagon_coal_yard_route', value: 10, publicLabel: '篷车驶入煤栈的路线' },
    { kind: 'clue', id: 'dock_wagon_lost_at_bridge', value: 4, publicLabel: '跟踪中断的桥区' },
    { kind: 'clue', id: 'dock_crate_tar_seal', value: 8, publicLabel: '遗留封箱的焦油铅封' },
    { kind: 'clue', id: 'dock_crate_packing_trace', value: 4, publicLabel: '被清空的包装痕迹' },
    { kind: 'clue', id: 'dock_official_interception_record', value: 10, publicLabel: '正式截查记录' },
    { kind: 'clue', id: 'dock_interception_declined', value: 4, publicLabel: '截查申请答复' },
    { kind: 'clue', id: 'dock_tar_seal_coal_omen', value: 6, publicLabel: '铅封占卜征兆' },
  ],
  receiptPolicy: {
    blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours'] },
    passed: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'clue:dock_seq9_conclusion'] },
  },
});

const dockSequence9SynthesisCheck = (
  pathwayId: string,
  stat: StatKey,
  skill: SkillKey,
  firstClueId: string,
  secondClueId: string,
  statLabel: string,
  skillLabel: string,
): CheckDef => ({
  id: `dock_seq9_synthesis_${pathwayId}`, version: 1, domain: 'exploration',
  target: { kind: 'case', id: `dock_manifest_synthesis_${pathwayId}` }, difficulty: 48,
  requirements: [{ kind: 'clue', id: firstClueId }, { kind: 'clue', id: secondClueId }],
  contributions: [
    { kind: 'stat', id: stat, multiplier: 1, publicLabel: statLabel },
    { kind: 'skill', id: skill, multiplier: 4, publicLabel: skillLabel },
    { kind: 'clue', id: firstClueId, value: 10, publicLabel: '本途径现场记录' },
    { kind: 'clue', id: secondClueId, value: 10, publicLabel: '本途径交叉记录' },
    { kind: 'clue', id: 'dock_missing_reports', value: 4, publicLabel: '公开失踪登记' },
    { kind: 'clue', id: 'dock_manifest_discrepancy', value: 6, publicLabel: '货运记录旁证' },
    { kind: 'clue', id: 'dock_crate_trace', value: 4, publicLabel: '码头现场记录' },
    { kind: 'clue', id: 'dock_ledger_notation', value: 4, publicLabel: '仓单编号知识' },
    { kind: 'clue', id: 'dock_marked_manifest', value: 4, publicLabel: '异常仓单记录' },
    { kind: 'clue', id: 'river_sea_missing_notices', value: 3, publicLabel: '河运失踪告示' },
    { kind: 'clue', id: 'dock_scale_transfer_omen', value: 6, publicLabel: '薄片转运预兆' },
    { kind: 'clue', id: 'dock_witness_warned', value: 4, publicLabel: '已经送达的避险口信' },
    { kind: 'clue', id: 'dock_watcher_route', value: 8, publicLabel: '盯梢者的转运路线' },
    { kind: 'clue', id: 'dock_witness_disappeared', value: 6, publicLabel: '知情人失踪记录' },
    { kind: 'clue', id: 'dock_witness_protected', value: 4, publicLabel: '正式保护回条' },
    { kind: 'clue', id: 'dock_witness_statement', value: 8, publicLabel: '知情人完整陈述' },
    { kind: 'clue', id: 'dock_witness_fragment', value: 4, publicLabel: '知情人口信片段' },
    { kind: 'clue', id: 'dock_transfer_watch_record', value: 8, publicLabel: '夜间转运记录' },
    { kind: 'clue', id: 'dock_transfer_decoy', value: 4, publicLabel: '被替换的转运标记' },
    { kind: 'clue', id: 'dock_witness_locker_token', value: 8, publicLabel: '储物柜领货牌' },
    { kind: 'clue', id: 'dock_witness_last_errand', value: 4, publicLabel: '失踪前临时差事' },
    { kind: 'clue', id: 'dock_sealed_statement_excerpt', value: 8, publicLabel: '封存陈述摘录' },
    { kind: 'clue', id: 'dock_official_case_summary', value: 4, publicLabel: '保护情况摘要' },
    { kind: 'clue', id: 'dock_gray_hat_exchange_pattern', value: 10, publicLabel: '灰帽人交换规律' },
    { kind: 'clue', id: 'dock_gray_hat_abandoned_route', value: 5, publicLabel: '被放弃的旧路线' },
    { kind: 'clue', id: 'dock_gray_hat_countermark', value: 10, publicLabel: '回应暗记' },
    { kind: 'clue', id: 'dock_gray_hat_trap_exposed', value: 5, publicLabel: '暴露的假仓单' },
    { kind: 'clue', id: 'dock_gray_hat_joint_watch', value: 10, publicLabel: '联合盯守记录' },
    { kind: 'clue', id: 'dock_gray_hat_watch_delayed', value: 5, publicLabel: '联合盯守答复' },
    { kind: 'clue', id: 'dock_gray_hat_escape_recollection', value: 4, publicLabel: '遭遇后的路线回忆' },
    { kind: 'clue', id: 'dock_gray_hat_dropped_token', value: 8, publicLabel: '灰帽人遗落的黄铜牌' },
    { kind: 'clue', id: 'dock_gray_hat_scene_lost', value: 3, publicLabel: '袭击确实发生的记录' },
    { kind: 'clue', id: 'dock_gray_hat_retreat_route', value: 8, publicLabel: '复盘出的撤退方向' },
    { kind: 'clue', id: 'dock_gray_hat_trail_lost', value: 4, publicLabel: '追索中断的位置' },
    { kind: 'clue', id: 'dock_gray_hat_token_handoff', value: 6, publicLabel: '黄铜牌移交回条' },
    { kind: 'clue', id: 'dock_gray_hat_evidence_preserved', value: 5, publicLabel: '封存的遭遇证物' },
    { kind: 'clue', id: 'dock_old_yard_perimeter_map', value: 6, publicLabel: '旧装卸区外围通路' },
    { kind: 'clue', id: 'dock_old_yard_public_boundary', value: 3, publicLabel: '旧装卸区现场边界' },
    { kind: 'clue', id: 'dock_old_yard_porter_schedule', value: 8, publicLabel: '临时搬运班次' },
    { kind: 'clue', id: 'dock_old_yard_workers_silent', value: 3, publicLabel: '工人回避的敏感话题' },
    { kind: 'clue', id: 'dock_old_yard_night_transfer', value: 10, publicLabel: '无编号夜间转运' },
    { kind: 'clue', id: 'dock_old_yard_watch_disturbed', value: 4, publicLabel: '提前熄灭的灯号' },
    { kind: 'clue', id: 'dock_wagon_coal_yard_route', value: 10, publicLabel: '篷车驶入煤栈的路线' },
    { kind: 'clue', id: 'dock_wagon_lost_at_bridge', value: 4, publicLabel: '跟踪中断的桥区' },
    { kind: 'clue', id: 'dock_crate_tar_seal', value: 8, publicLabel: '遗留封箱的焦油铅封' },
    { kind: 'clue', id: 'dock_crate_packing_trace', value: 4, publicLabel: '被清空的包装痕迹' },
    { kind: 'clue', id: 'dock_official_interception_record', value: 10, publicLabel: '正式截查记录' },
    { kind: 'clue', id: 'dock_interception_declined', value: 4, publicLabel: '截查申请答复' },
    { kind: 'clue', id: 'dock_tar_seal_coal_omen', value: 6, publicLabel: '铅封占卜征兆' },
  ],
  receiptPolicy: {
    blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours'] },
    passed: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'clue:dock_seq9_conclusion'] },
  },
});

const divinationClubAcceptCheck = (commission: DivinationClubCommissionDef): CheckDef => ({
  id: commission.acceptCheckId, version: 1, domain: 'exploration',
  target: { kind: 'case', id: `divination_club:${commission.id}:accept` }, difficulty: 1,
  requirements: [{ kind: 'ability', id: 'seer_divination' }, { kind: 'location', id: 'divination_club' }],
  contributions: [{ kind: 'ability', id: 'seer_divination', value: 1, publicLabel: '占卜家会员资格' }],
  receiptPolicy: {
    blocked: { hoursElapsed: commission.acceptHours, effectIds: ['energy', `clue:${commission.briefingClueId}`, 'hours'] },
    passed: { hoursElapsed: commission.acceptHours, effectIds: ['energy', `clue:${commission.briefingClueId}`, 'hours'] },
  },
});

export const DEEP_INVESTIGATION_DEFS: readonly DeepInvestigationDef[] = [
  {
    id: 'deep_dock_missing_reports', clueId: 'dock_missing_reports', caseId: 'dock_manifest',
    checkId: 'deep_check_dock_missing_reports', label: '深入核对失踪登记',
    description: '把失踪时间、班次和仓区逐项交叉，确认登记之间是否存在共同规律。',
    locationId: 'docks', openFrom: 9, openTo: 17, passEnergyCost: 8, blockedEnergyCost: 4,
    passHours: 2, blockedHours: 1, nextStepId: 'dock_next_compare_cargo_records',
    nextStepText: '失踪者集中在相邻班次和同一仓区。下一步应核对同期货运备份，确认他们是否经手过同一批货物。',
    blockedText: '现有登记还不足以形成可靠规律。可以寻找另一份公开失踪告示，或先提升调查经验。',
    threatId: 'dock_manifest_cleaner', attentionOnAttempt: 10,
  },
  {
    id: 'deep_dock_manifest_discrepancy', clueId: 'dock_manifest_discrepancy', caseId: 'dock_manifest',
    checkId: 'deep_check_dock_manifest_discrepancy', label: '深入追查货运缺口',
    description: '按船名、库位和经手人重排货运备份，寻找被人为拆散的转运顺序。',
    locationId: 'docks', openFrom: 9, openTo: 17, passEnergyCost: 10, blockedEnergyCost: 5,
    passHours: 2, blockedHours: 1, nextStepId: 'dock_next_trace_marked_manifest',
    nextStepText: '缺口集中在同一批次的旧仓单。下一步应按库位变更顺序追查原件，而不是继续猜测失踪原因。',
    blockedText: '你确认记录有问题，却无法还原修改顺序。港务编号知识或另一份仓单旁证会有帮助。',
    threatId: 'dock_manifest_cleaner', attentionOnAttempt: 20,
  },
  {
    id: 'deep_dock_crate_trace', clueId: 'dock_crate_trace', caseId: 'dock_manifest',
    checkId: 'deep_check_dock_crate_trace', label: '深入复核货箱现场',
    description: '重新整理货箱位置、拖痕、水迹与退路，只确认能够由现场记录支持的方向。',
    locationId: 'docks', passEnergyCost: 12, blockedEnergyCost: 5,
    passHours: 2, blockedHours: 1, nextStepId: 'dock_next_crosscheck_crate_trace',
    nextStepText: '拖痕和水迹与正常卸货路线不符。下一步应把现场记录与失踪登记、货运缺口交叉核对；若持有薄片，可在安全环境下另行检视或占卜。',
    blockedText: '外围记录只能证明现场异常，尚不能指出具体去向。可以补充公开登记、货运旁证或本途径的现场记录。',
    threatId: 'dock_manifest_cleaner', attentionOnAttempt: 45,
  },
];

export const ORGANIZATION_QUALIFICATION_TASKS: readonly OrganizationQualificationTaskDef[] = [
  {
    organizationId: 'secret_order', checkId: 'org_qualification_secret_order_provenance',
    label: '来源分级与保密删节', narrative: '把一组混杂来源的研究摘记按可信程度分层，并删去会暴露无关人员的细节。',
    stat: 'mnd', skill: 'occult', statLabel: '来源推理', skillLabel: '神秘学整理',
    hardClueId: 'secret_order_cipher', passEnergyCost: 14, passHours: 3,
  },
  {
    organizationId: 'psychology_alchemists', checkId: 'org_qualification_psychology_ethics',
    label: '匿名观察与伦理边界', narrative: '整理一份匿名观察记录，只保留行为事实，并明确哪些推断不能越过当事人的边界。',
    stat: 'cha', skill: 'speech', statLabel: '共情判断', skillLabel: '沟通伦理',
    hardClueId: 'psychology_case_notes', passEnergyCost: 12, passHours: 3,
  },
  {
    organizationId: 'iron_and_blood', checkId: 'org_qualification_iron_and_blood_field',
    label: '可撤回货运路线复盘', narrative: '复盘一条货运路线，标出观察点、撤回条件与证据不足时必须停止的位置。',
    stat: 'phy', skill: 'investigate', statLabel: '现场耐力', skillLabel: '路线调查',
    hardClueId: 'dock_marked_manifest', passEnergyCost: 20, passHours: 4,
  },
  {
    organizationId: 'abraham_branch', checkId: 'org_qualification_abraham_provenance',
    label: '空间草图来源、退路与担保', narrative: '说明空间草图的发现来源、可核验退路与担保责任，不把未证实结构当成可开启的门。',
    stat: 'spi', skill: 'occult', statLabel: '空间直觉', skillLabel: '神秘学辨源',
    hardClueId: 'abraham_door_map', passEnergyCost: 16, passHours: 3,
  },
];

const organizationQualificationCheck = (
  task: OrganizationQualificationTaskDef,
  difficulty: number,
  optionalClues: readonly { id: string; value: number; publicLabel: string }[],
): CheckDef => ({
  id: task.checkId, version: 1, domain: 'exploration',
  target: { kind: 'case', id: `organization_qualification:${task.organizationId}` }, difficulty,
  requirements: [{ kind: 'clue', id: task.hardClueId }],
  contributions: [
    { kind: 'stat', id: task.stat, multiplier: 1, publicLabel: task.statLabel },
    { kind: 'skill', id: task.skill, multiplier: 4, publicLabel: task.skillLabel },
    ...optionalClues.map(clue => ({ kind: 'clue' as const, ...clue })),
  ],
  receiptPolicy: {
    blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours'] },
    passed: { hoursElapsed: task.passHours, effectIds: ['energy', 'hours', `route:${task.organizationId}`] },
  },
});

export const DOCK_COMBAT_PREPARATIONS: readonly DockCombatPreparationDef[] = [
  {
    id: 'mapped_retreat', checkId: 'dock_combat_prepare_retreat', label: '按货箱记录重画退路',
    description: '把已经核对过的货箱间隙与灯火方向连成一条可执行路线。',
    benefitText: '逃脱失败时减少第一轮追击造成的伤害。', energyCost: 4,
  },
  {
    id: 'prepared_ambush', checkId: 'dock_combat_prepare_ambush', label: '利用账目空档布置反击位置',
    description: '只在确认交接空档且持有可靠武器时，预先选定一次反击角度。',
    benefitText: '主动应战且暴击能力达到阈值时，固定触发一次破绽反击。', energyCost: 6,
  },
  {
    id: 'spiritual_guard', checkId: 'dock_combat_prepare_guard', label: '沿转运预兆布置灵性防护',
    description: '依据已有预兆，用普通仪式粉笔划出收束感知的边界。',
    benefitText: '降低冲突中的精神值损失，并提供定性的异常征兆判断。', energyCost: 4,
  },
];

export const investigationHypothesisCheckId = (hypothesisId: InvestigationHypothesisId, methodId: InvestigationMethodId) =>
  `investigation:${hypothesisId}:${methodId}`;

const investigationCheck = (
  hypothesisId: InvestigationHypothesisId,
  methodId: InvestigationMethodId,
  stat: StatKey,
  skill: SkillKey,
  difficulty: number,
  statLabel: string,
  skillLabel: string,
  options: { locationId?: string; abilityId?: string } = {},
): CheckDef => {
  const hypothesis = INVESTIGATION_HYPOTHESIS_DEFS.find(candidate => candidate.id === hypothesisId)!;
  const method = INVESTIGATION_METHOD_DEFS.find(candidate => candidate.id === methodId)!;
  const requirements: CheckDef['requirements'] = [
    ...hypothesis.requiredClueIds.map(id => ({ kind: 'clue' as const, id })),
    ...(options.locationId ? [{ kind: 'location' as const, id: options.locationId }] : []),
    ...(options.abilityId ? [{ kind: 'ability' as const, id: options.abilityId }] : []),
  ];
  const evidenceTerms = INVESTIGATION_EVIDENCE_DEFS.map(evidence => ({
    kind: 'clue' as const, id: evidence.clueId,
    value: hypothesis.requiredClueIds.includes(evidence.clueId) ? 7 : 3,
    publicLabel: evidence.sourceQuality,
  }));
  return {
    id: investigationHypothesisCheckId(hypothesisId, methodId), version: 1, domain: 'exploration',
    target: { kind: 'case', id: `investigation:${hypothesisId}` }, difficulty,
    requirements,
    contributions: [
      { kind: 'stat', id: stat, multiplier: 1, publicLabel: statLabel },
      { kind: 'skill', id: skill, multiplier: 4, publicLabel: skillLabel },
      ...evidenceTerms,
      ...(options.abilityId ? [{ kind: 'ability' as const, id: options.abilityId, value: 6, publicLabel: '受控灵视' }] : []),
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: method.hours, effectIds: ['energy', 'hours', `hypothesis:${hypothesisId}:assessment`] },
      passed: { hoursElapsed: method.hours, effectIds: ['energy', 'hours', `hypothesis:${hypothesisId}:assessment`] },
    },
  };
};

export const INVESTIGATION_HYPOTHESIS_CHECKS: readonly CheckDef[] = [
  investigationCheck('dock_transfer_window', 'compare_records', 'mnd', 'investigate', 38, '记录推理', '调查经验'),
  investigationCheck('dock_transfer_window', 'interview_witness', 'cha', 'speech', 36, '临场判断', '交谈经验', { locationId: 'tavern' }),
  investigationCheck('dock_silenced_witnesses', 'compare_records', 'mnd', 'investigate', 42, '人物关联推理', '调查经验'),
  investigationCheck('dock_silenced_witnesses', 'interview_witness', 'cha', 'speech', 38, '证词判断', '交谈经验', { locationId: 'tavern' }),
  investigationCheck('dock_occult_interference', 'inspect_scene', 'mnd', 'investigate', 40, '现场判断', '调查经验', { locationId: 'docks' }),
  investigationCheck('dock_occult_interference', 'occult_verify', 'spi', 'occult', 42, '灵性控制', '神秘学经验', { abilityId: 'spirit_vision' }),
];

export const EXPLORATION_CHECKS: readonly CheckDef[] = [
  {
    id: 'clocktower_night_trace', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'clocktower' }, difficulty: 34,
    requirements: [{ kind: 'clue', id: 'clocktower_public_complaints' }],
    contributions: [
      { kind: 'stat', id: 'mnd', multiplier: 1, publicLabel: '现场推理' },
      { kind: 'skill', id: 'investigate', multiplier: 4, publicLabel: '调查经验' },
      { kind: 'clue', id: 'clocktower_public_complaints', value: 4, publicLabel: '公开投诉记录' },
      { kind: 'clue', id: 'clocktower_repair_orders', value: 10, publicLabel: '维修工单' },
      { kind: 'clue', id: 'clocktower_divination_omen', value: 8, publicLabel: '钟楼预兆' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours'] },
      passed: { hoursElapsed: 3, effectIds: ['energy', 'san', 'item:anomaly_evidence', 'flag:met_beyonder', 'hours', 'state:awareness', 'lead:nightwatch_clocktower', 'route:nightwatch'] },
    },
  },
  {
    id: 'dock_witness_crisis_warn', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'dock_witness_crisis:warn_worker' }, difficulty: 1,
    requirements: [{ kind: 'clue', id: 'dock_missing_reports' }, { kind: 'location', id: 'tavern' }],
    contributions: [{ kind: 'clue', id: 'dock_missing_reports', value: 1, publicLabel: '已经核对的失踪登记' }],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours'] },
      passed: { hoursElapsed: 1, effectIds: ['energy', 'hours', 'clue:dock_witness_warned', 'favor:mike', 'threat:dock_manifest_cleaner'] },
    },
  },
  {
    id: 'dock_witness_crisis_shadow', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'dock_witness_crisis:shadow_watcher' }, difficulty: 40,
    requirements: [{ kind: 'clue', id: 'dock_missing_reports' }, { kind: 'location', id: 'docks' }],
    contributions: [
      { kind: 'stat', id: 'mnd', multiplier: 1, publicLabel: '临场判断' },
      { kind: 'skill', id: 'sneak', multiplier: 4, publicLabel: '潜行经验' },
      { kind: 'clue', id: 'dock_manifest_discrepancy', value: 6, publicLabel: '交接空档记录' },
      { kind: 'clue', id: 'dock_crate_trace', value: 6, publicLabel: '现场退路记录' },
      { kind: 'clue', id: 'dock_seq9_sleepless_watch', value: 6, publicLabel: '夜班守望记录' },
      { kind: 'preparation', id: 'hypothesis:dock_transfer_window:supported', value: 6, publicLabel: '已经对上的交接时间' },
      { kind: 'preparation', id: 'hypothesis:dock_silenced_witnesses:supported', value: 8, publicLabel: '已经对上的经手记录' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'clue:dock_witness_disappeared', 'threat:dock_manifest_cleaner'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'clue:dock_watcher_route', 'threat:dock_manifest_cleaner'] },
    },
  },
  {
    id: 'dock_witness_crisis_protection', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'dock_witness_crisis:request_protection' }, difficulty: 1,
    requirements: [{ kind: 'clue', id: 'dock_missing_reports' }, { kind: 'location', id: 'blackthorn_security' }],
    contributions: [{ kind: 'clue', id: 'dock_missing_reports', value: 1, publicLabel: '已经核对的失踪登记' }],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours'] },
      passed: { hoursElapsed: 1, effectIds: ['energy', 'hours', 'clue:dock_witness_protected', 'threat:dock_manifest_cleaner'] },
    },
  },
  {
    id: 'dock_witness_followup_warned', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'dock_witness_followup:warned_witness' }, difficulty: 40,
    requirements: [{ kind: 'clue', id: 'dock_witness_warned' }, { kind: 'location', id: 'tavern' }],
    contributions: [
      { kind: 'stat', id: 'cha', multiplier: 1, publicLabel: '临场分寸' },
      { kind: 'skill', id: 'speech', multiplier: 4, publicLabel: '交谈经验' },
      { kind: 'clue', id: 'dock_manifest_discrepancy', value: 6, publicLabel: '能够核对的货运缺口' },
      { kind: 'clue', id: 'dock_marked_manifest', value: 6, publicLabel: '留有印记的仓单' },
      { kind: 'preparation', id: 'hypothesis:dock_silenced_witnesses:supported', value: 8, publicLabel: '已经对上的经手记录' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'clue:dock_witness_fragment', 'threat:dock_manifest_cleaner'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'clue:dock_witness_statement', 'favor:mike', 'threat:dock_manifest_cleaner'] },
    },
  },
  {
    id: 'dock_witness_followup_transfer', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'dock_witness_followup:watched_transfer' }, difficulty: 42,
    requirements: [{ kind: 'clue', id: 'dock_watcher_route' }, { kind: 'location', id: 'canal' }],
    contributions: [
      { kind: 'stat', id: 'mnd', multiplier: 1, publicLabel: '现场判断' },
      { kind: 'skill', id: 'investigate', multiplier: 4, publicLabel: '调查经验' },
      { kind: 'clue', id: 'dock_watcher_route', value: 8, publicLabel: '盯梢者的转运路线' },
      { kind: 'clue', id: 'dock_manifest_discrepancy', value: 6, publicLabel: '货运记录缺口' },
      { kind: 'clue', id: 'dock_crate_trace', value: 5, publicLabel: '货箱外围痕迹' },
      { kind: 'preparation', id: 'hypothesis:dock_transfer_window:supported', value: 6, publicLabel: '已经对上的交接时间' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 3, effectIds: ['energy', 'hours', 'clue:dock_transfer_decoy', 'threat:dock_manifest_cleaner'] },
      passed: { hoursElapsed: 3, effectIds: ['energy', 'hours', 'clue:dock_transfer_watch_record', 'threat:dock_manifest_cleaner'] },
    },
  },
  {
    id: 'dock_witness_followup_missing', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'dock_witness_followup:missing_witness' }, difficulty: 38,
    requirements: [{ kind: 'clue', id: 'dock_witness_disappeared' }, { kind: 'location', id: 'docks' }],
    contributions: [
      { kind: 'stat', id: 'mnd', multiplier: 1, publicLabel: '细节判断' },
      { kind: 'skill', id: 'investigate', multiplier: 4, publicLabel: '调查经验' },
      { kind: 'clue', id: 'dock_witness_disappeared', value: 8, publicLabel: '空铺与点名册记录' },
      { kind: 'clue', id: 'dock_manifest_discrepancy', value: 6, publicLabel: '货运记录缺口' },
      { kind: 'clue', id: 'dock_ledger_notation', value: 5, publicLabel: '港务编号知识' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'clue:dock_witness_last_errand', 'threat:dock_manifest_cleaner'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'clue:dock_witness_locker_token', 'threat:dock_manifest_cleaner'] },
    },
  },
  {
    id: 'dock_witness_followup_protected', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'dock_witness_followup:protected_witness' }, difficulty: 40,
    requirements: [{ kind: 'clue', id: 'dock_witness_protected' }, { kind: 'location', id: 'blackthorn_security' }],
    contributions: [
      { kind: 'stat', id: 'cha', multiplier: 1, publicLabel: '说明分寸' },
      { kind: 'skill', id: 'speech', multiplier: 4, publicLabel: '交谈经验' },
      { kind: 'clue', id: 'dock_manifest_discrepancy', value: 6, publicLabel: '可供核验的货运记录' },
      { kind: 'clue', id: 'dock_witness_protected', value: 6, publicLabel: '正式保护回条' },
      { kind: 'preparation', id: 'hypothesis:dock_silenced_witnesses:supported', value: 8, publicLabel: '已经对上的经手记录' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours', 'clue:dock_official_case_summary', 'threat:dock_manifest_cleaner'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'clue:dock_sealed_statement_excerpt', 'threat:dock_manifest_cleaner'] },
    },
  },
  {
    id: 'dock_gray_hat_observe', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'dock_gray_hat_operation:observe_exchange' }, difficulty: 44,
    requirements: [{ kind: 'location', id: 'canal' }],
    contributions: [
      { kind: 'stat', id: 'mnd', multiplier: 1, publicLabel: '长时间观察' },
      { kind: 'skill', id: 'investigate', multiplier: 4, publicLabel: '调查经验' },
      { kind: 'skill', id: 'sneak', multiplier: 3, publicLabel: '隐蔽经验' },
      { kind: 'clue', id: 'dock_transfer_watch_record', value: 8, publicLabel: '夜间转运记录' },
      { kind: 'clue', id: 'dock_transfer_decoy', value: 5, publicLabel: '被替换的转运标记' },
      { kind: 'clue', id: 'dock_witness_statement', value: 6, publicLabel: '知情人陈述' },
      { kind: 'clue', id: 'dock_sealed_statement_excerpt', value: 6, publicLabel: '封存陈述摘录' },
      { kind: 'preparation', id: 'hypothesis:dock_transfer_window:supported', value: 6, publicLabel: '已经对上的交接时间' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 3, effectIds: ['energy', 'hours', 'clue:dock_gray_hat_abandoned_route', 'threat:dock_manifest_cleaner'] },
      passed: { hoursElapsed: 3, effectIds: ['energy', 'hours', 'clue:dock_gray_hat_exchange_pattern', 'threat:dock_manifest_cleaner'] },
    },
  },
  {
    id: 'dock_gray_hat_bait', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'dock_gray_hat_operation:bait_manifest' }, difficulty: 44,
    requirements: [{ kind: 'clue', id: 'dock_marked_manifest' }, { kind: 'location', id: 'docks' }],
    contributions: [
      { kind: 'stat', id: 'mnd', multiplier: 1, publicLabel: '设局判断' },
      { kind: 'skill', id: 'investigate', multiplier: 4, publicLabel: '调查经验' },
      { kind: 'clue', id: 'dock_marked_manifest', value: 8, publicLabel: '留有暗记的旧仓单' },
      { kind: 'clue', id: 'dock_witness_locker_token', value: 7, publicLabel: '储物柜领货牌' },
      { kind: 'clue', id: 'dock_witness_fragment', value: 4, publicLabel: '残缺库位口信' },
      { kind: 'clue', id: 'dock_official_case_summary', value: 4, publicLabel: '保护情况摘要' },
      { kind: 'preparation', id: 'hypothesis:dock_silenced_witnesses:supported', value: 8, publicLabel: '已经对上的经手记录' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'clue:dock_gray_hat_trap_exposed', 'threat:dock_manifest_cleaner'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'clue:dock_gray_hat_countermark', 'threat:dock_manifest_cleaner'] },
    },
  },
  {
    id: 'dock_gray_hat_joint_watch', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'dock_gray_hat_operation:joint_watch' }, difficulty: 42,
    requirements: [{ kind: 'location', id: 'blackthorn_security' }],
    contributions: [
      { kind: 'stat', id: 'cha', multiplier: 1, publicLabel: '说明分寸' },
      { kind: 'skill', id: 'speech', multiplier: 4, publicLabel: '交谈经验' },
      { kind: 'clue', id: 'dock_sealed_statement_excerpt', value: 8, publicLabel: '封存陈述摘录' },
      { kind: 'clue', id: 'dock_official_case_summary', value: 5, publicLabel: '保护情况摘要' },
      { kind: 'clue', id: 'dock_transfer_watch_record', value: 6, publicLabel: '夜间转运记录' },
      { kind: 'clue', id: 'dock_witness_statement', value: 6, publicLabel: '知情人陈述' },
      { kind: 'preparation', id: 'hypothesis:dock_silenced_witnesses:supported', value: 6, publicLabel: '已经对上的经手记录' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'clue:dock_gray_hat_watch_delayed', 'threat:dock_manifest_cleaner'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'clue:dock_gray_hat_joint_watch', 'threat:dock_manifest_cleaner'] },
    },
  },
  {
    id: 'dock_encounter_aftermath_trace', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'dock_encounter_aftermath:trace_retreat' }, difficulty: 42,
    requirements: [],
    contributions: [
      { kind: 'stat', id: 'mnd', multiplier: 1, publicLabel: '路线复盘' },
      { kind: 'skill', id: 'investigate', multiplier: 4, publicLabel: '调查经验' },
      { kind: 'skill', id: 'sneak', multiplier: 3, publicLabel: '跟踪经验' },
      { kind: 'clue', id: 'dock_gray_hat_escape_recollection', value: 8, publicLabel: '遭遇后的路线回忆' },
      { kind: 'clue', id: 'dock_gray_hat_dropped_token', value: 6, publicLabel: '灰帽人掉落的黄铜牌' },
      { kind: 'clue', id: 'dock_gray_hat_exchange_pattern', value: 6, publicLabel: '已经确认的交换规律' },
      { kind: 'clue', id: 'dock_gray_hat_countermark', value: 6, publicLabel: '假仓单回应暗记' },
      { kind: 'clue', id: 'dock_crate_trace', value: 4, publicLabel: '货箱外围退路记录' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'clue:dock_gray_hat_trail_lost'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'clue:dock_gray_hat_retreat_route'] },
    },
  },
  {
    id: 'dock_encounter_aftermath_handoff', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'dock_encounter_aftermath:handoff_token' }, difficulty: 1,
    requirements: [{ kind: 'clue', id: 'dock_gray_hat_dropped_token' }, { kind: 'location', id: 'blackthorn_security' }],
    contributions: [{ kind: 'clue', id: 'dock_gray_hat_dropped_token', value: 1, publicLabel: '灰帽人掉落的黄铜牌' }],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours'] },
      passed: { hoursElapsed: 1, effectIds: ['energy', 'hours', 'clue:dock_gray_hat_token_handoff'] },
    },
  },
  {
    id: 'dock_encounter_aftermath_preserve', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'dock_encounter_aftermath:preserve_evidence' }, difficulty: 1,
    requirements: [],
    contributions: [
      { kind: 'clue', id: 'dock_gray_hat_escape_recollection', value: 1, publicLabel: '遭遇后的路线回忆' },
      { kind: 'clue', id: 'dock_gray_hat_dropped_token', value: 1, publicLabel: '灰帽人掉落的黄铜牌' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours'] },
      passed: { hoursElapsed: 1, effectIds: ['energy', 'hours', 'clue:dock_gray_hat_evidence_preserved'] },
    },
  },
  {
    id: 'dock_old_yard_survey', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'dock_old_yard:survey_perimeter' }, difficulty: 40,
    requirements: [{ kind: 'clue', id: 'dock_gray_hat_retreat_route' }, { kind: 'location', id: 'old_loading_yard' }],
    contributions: [
      { kind: 'stat', id: 'mnd', multiplier: 1, publicLabel: '现场判断' },
      { kind: 'skill', id: 'investigate', multiplier: 4, publicLabel: '调查经验' },
      { kind: 'skill', id: 'sneak', multiplier: 2, publicLabel: '隐蔽观察' },
      { kind: 'clue', id: 'dock_gray_hat_retreat_route', value: 8, publicLabel: '复盘出的撤退方向' },
      { kind: 'clue', id: 'dock_gray_hat_exchange_pattern', value: 5, publicLabel: '灰帽人的交换规律' },
      { kind: 'clue', id: 'dock_gray_hat_countermark', value: 5, publicLabel: '灰帽人的回应暗记' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'clue:dock_old_yard_public_boundary'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'clue:dock_old_yard_perimeter_map'] },
    },
  },
  {
    id: 'dock_old_yard_question', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'dock_old_yard:question_porters' }, difficulty: 42,
    requirements: [{ kind: 'clue', id: 'dock_gray_hat_retreat_route' }, { kind: 'location', id: 'old_loading_yard' }],
    contributions: [
      { kind: 'stat', id: 'cha', multiplier: 1, publicLabel: '交谈分寸' },
      { kind: 'skill', id: 'speech', multiplier: 4, publicLabel: '交谈经验' },
      { kind: 'clue', id: 'dock_witness_statement', value: 8, publicLabel: '知情人的完整陈述' },
      { kind: 'clue', id: 'dock_witness_fragment', value: 4, publicLabel: '知情人的残缺口信' },
      { kind: 'clue', id: 'dock_gray_hat_retreat_route', value: 6, publicLabel: '复盘出的撤退方向' },
      { kind: 'clue', id: 'dock_old_yard_perimeter_map', value: 4, publicLabel: '外围通路记录' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'clue:dock_old_yard_workers_silent', 'threat:dock_manifest_cleaner'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'clue:dock_old_yard_porter_schedule', 'threat:dock_manifest_cleaner'] },
    },
  },
  {
    id: 'dock_old_yard_watch', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'dock_old_yard:watch_night_transfer' }, difficulty: 48,
    requirements: [{ kind: 'clue', id: 'dock_gray_hat_retreat_route' }, { kind: 'location', id: 'old_loading_yard' }],
    contributions: [
      { kind: 'stat', id: 'mnd', multiplier: 1, publicLabel: '长时间观察' },
      { kind: 'skill', id: 'investigate', multiplier: 4, publicLabel: '调查经验' },
      { kind: 'skill', id: 'sneak', multiplier: 3, publicLabel: '隐蔽经验' },
      { kind: 'clue', id: 'dock_old_yard_perimeter_map', value: 8, publicLabel: '外围通路记录' },
      { kind: 'clue', id: 'dock_old_yard_public_boundary', value: 3, publicLabel: '已经确认的现场边界' },
      { kind: 'clue', id: 'dock_old_yard_porter_schedule', value: 10, publicLabel: '临时搬运班次' },
      { kind: 'clue', id: 'dock_old_yard_workers_silent', value: 3, publicLabel: '工人回避的敏感话题' },
      { kind: 'clue', id: 'dock_gray_hat_exchange_pattern', value: 6, publicLabel: '灰帽人的交换规律' },
      { kind: 'clue', id: 'dock_transfer_watch_record', value: 6, publicLabel: '先前的夜间转运记录' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 3, effectIds: ['energy', 'hours', 'clue:dock_old_yard_watch_disturbed', 'threat:dock_manifest_cleaner'] },
      passed: { hoursElapsed: 3, effectIds: ['energy', 'hours', 'clue:dock_old_yard_night_transfer', 'threat:dock_manifest_cleaner'] },
    },
  },
  {
    id: 'dock_transfer_tail_wagon', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'dock_transfer_followup:tail_wagon' }, difficulty: 50,
    requirements: [{ kind: 'clue', id: 'dock_old_yard_night_transfer' }, { kind: 'location', id: 'old_loading_yard' }],
    contributions: [
      { kind: 'stat', id: 'mnd', multiplier: 1, publicLabel: '路线判断' },
      { kind: 'skill', id: 'investigate', multiplier: 4, publicLabel: '调查经验' },
      { kind: 'skill', id: 'sneak', multiplier: 4, publicLabel: '跟踪经验' },
      { kind: 'clue', id: 'dock_old_yard_perimeter_map', value: 6, publicLabel: '旧装卸区外围通路' },
      { kind: 'clue', id: 'dock_old_yard_porter_schedule', value: 6, publicLabel: '临时搬运班次' },
      { kind: 'clue', id: 'dock_gray_hat_retreat_route', value: 5, publicLabel: '灰帽人的撤退路线' },
      { kind: 'tool', id: 'plain_disguise_kit', value: 5, publicLabel: '普通伪装用品' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 3, effectIds: ['energy', 'hours', 'clue:dock_wagon_lost_at_bridge', 'threat:dock_manifest_cleaner'] },
      passed: { hoursElapsed: 3, effectIds: ['energy', 'hours', 'clue:dock_wagon_coal_yard_route', 'threat:dock_manifest_cleaner'] },
    },
  },
  {
    id: 'dock_transfer_inspect_crate', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'dock_transfer_followup:inspect_crate' }, difficulty: 44,
    requirements: [{ kind: 'clue', id: 'dock_old_yard_night_transfer' }, { kind: 'location', id: 'old_loading_yard' }],
    contributions: [
      { kind: 'stat', id: 'mnd', multiplier: 1, publicLabel: '包装判断' },
      { kind: 'skill', id: 'investigate', multiplier: 4, publicLabel: '调查经验' },
      { kind: 'clue', id: 'dock_old_yard_night_transfer', value: 8, publicLabel: '夜间转运记录' },
      { kind: 'clue', id: 'dock_manifest_discrepancy', value: 5, publicLabel: '货运记录缺口' },
      { kind: 'clue', id: 'dock_gray_hat_countermark', value: 5, publicLabel: '灰帽人的回应暗记' },
      { kind: 'tool', id: 'hunting_knife', value: 5, publicLabel: '结实的短刀' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'clue:dock_crate_packing_trace'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'clue:dock_crate_tar_seal', 'item:tarred_cargo_seal'] },
    },
  },
  {
    id: 'dock_transfer_request_interception', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'dock_transfer_followup:request_interception' }, difficulty: 46,
    requirements: [{ kind: 'clue', id: 'dock_old_yard_night_transfer' }, { kind: 'location', id: 'blackthorn_security' }],
    contributions: [
      { kind: 'stat', id: 'cha', multiplier: 1, publicLabel: '说明分寸' },
      { kind: 'skill', id: 'speech', multiplier: 4, publicLabel: '交谈经验' },
      { kind: 'clue', id: 'dock_old_yard_night_transfer', value: 10, publicLabel: '无编号夜间转运记录' },
      { kind: 'clue', id: 'dock_gray_hat_token_handoff', value: 8, publicLabel: '黄铜牌移交回条' },
      { kind: 'clue', id: 'dock_gray_hat_joint_watch', value: 8, publicLabel: '先前联合盯守记录' },
      { kind: 'clue', id: 'dock_sealed_statement_excerpt', value: 5, publicLabel: '封存陈述摘录' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 3, effectIds: ['energy', 'hours', 'clue:dock_interception_declined'] },
      passed: { hoursElapsed: 4, effectIds: ['energy', 'hours', 'clue:dock_official_interception_record'] },
    },
  },
  {
    id: 'dock_manifest_trace', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'dock_manifest' }, difficulty: 34,
    requirements: [{ kind: 'clue', id: 'dock_missing_reports' }],
    contributions: [
      { kind: 'stat', id: 'mnd', multiplier: 1, publicLabel: '档案推理' },
      { kind: 'skill', id: 'investigate', multiplier: 4, publicLabel: '调查经验' },
      { kind: 'clue', id: 'dock_missing_reports', value: 4, publicLabel: '公开失踪登记' },
      { kind: 'clue', id: 'dock_manifest_discrepancy', value: 10, publicLabel: '货运记录旁证' },
      { kind: 'clue', id: 'dock_ledger_notation', value: 4, publicLabel: '仓单编号知识' },
      { kind: 'clue', id: 'dock_crate_trace', value: 4, publicLabel: '码头现场记录' },
      { kind: 'clue', id: 'river_sea_missing_notices', value: 3, publicLabel: '河运失踪告示' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'clue:dock_marked_manifest', 'lead:iron_blood_token', 'route:iron_and_blood'] },
    },
  },
  {
    id: 'deep_check_dock_missing_reports', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'deep:dock_missing_reports' }, difficulty: 30,
    requirements: [{ kind: 'clue', id: 'dock_missing_reports' }, { kind: 'location', id: 'docks' }],
    contributions: [
      { kind: 'stat', id: 'mnd', multiplier: 1, publicLabel: '档案推理' },
      { kind: 'skill', id: 'investigate', multiplier: 4, publicLabel: '调查经验' },
      { kind: 'clue', id: 'dock_missing_reports', value: 4, publicLabel: '失踪登记' },
      { kind: 'clue', id: 'river_sea_missing_notices', value: 6, publicLabel: '另一份公开告示' },
      { kind: 'clue', id: 'dock_ledger_notation', value: 4, publicLabel: '港务编号知识' },
      { kind: 'clue', id: 'dock_witness_warned', value: 6, publicLabel: '知情人避险后的复述' },
      { kind: 'clue', id: 'dock_witness_disappeared', value: 8, publicLabel: '空铺与点名册记录' },
      { kind: 'clue', id: 'dock_witness_protected', value: 5, publicLabel: '正式保护接收记录' },
      { kind: 'preparation', id: 'hypothesis:dock_transfer_window:supported', value: 6, publicLabel: '已经对上的交接时间' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours', 'threat:dock_manifest_cleaner'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'investigation:deep_dock_missing_reports', 'threat:dock_manifest_cleaner'] },
    },
  },
  {
    id: 'deep_check_dock_manifest_discrepancy', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'deep:dock_manifest_discrepancy' }, difficulty: 36,
    requirements: [{ kind: 'clue', id: 'dock_manifest_discrepancy' }, { kind: 'location', id: 'docks' }],
    contributions: [
      { kind: 'stat', id: 'mnd', multiplier: 1, publicLabel: '货运推理' },
      { kind: 'skill', id: 'investigate', multiplier: 4, publicLabel: '调查经验' },
      { kind: 'clue', id: 'dock_manifest_discrepancy', value: 8, publicLabel: '货运记录缺口' },
      { kind: 'clue', id: 'dock_missing_reports', value: 4, publicLabel: '失踪登记' },
      { kind: 'clue', id: 'dock_ledger_notation', value: 6, publicLabel: '港务编号知识' },
      { kind: 'clue', id: 'dock_marked_manifest', value: 6, publicLabel: '异常仓单记录' },
      { kind: 'clue', id: 'dock_watcher_route', value: 8, publicLabel: '盯梢者的转运路线' },
      { kind: 'clue', id: 'dock_witness_disappeared', value: 5, publicLabel: '知情人失踪记录' },
      { kind: 'preparation', id: 'hypothesis:dock_transfer_window:supported', value: 6, publicLabel: '已经对上的交接时间' },
      { kind: 'preparation', id: 'hypothesis:dock_silenced_witnesses:supported', value: 6, publicLabel: '已经对上的经手记录' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours', 'threat:dock_manifest_cleaner'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'investigation:deep_dock_manifest_discrepancy', 'threat:dock_manifest_cleaner'] },
    },
  },
  {
    id: 'deep_check_dock_crate_trace', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'deep:dock_crate_trace' }, difficulty: 34,
    requirements: [{ kind: 'clue', id: 'dock_crate_trace' }, { kind: 'location', id: 'docks' }],
    contributions: [
      { kind: 'stat', id: 'mnd', multiplier: 1, publicLabel: '现场推理' },
      { kind: 'skill', id: 'investigate', multiplier: 4, publicLabel: '调查经验' },
      { kind: 'clue', id: 'dock_crate_trace', value: 8, publicLabel: '货箱外围记录' },
      { kind: 'clue', id: 'dock_missing_reports', value: 4, publicLabel: '失踪登记' },
      { kind: 'clue', id: 'dock_manifest_discrepancy', value: 4, publicLabel: '货运记录缺口' },
      { kind: 'clue', id: 'dock_scale_transfer_omen', value: 6, publicLabel: '薄片转运预兆' },
      { kind: 'clue', id: 'dock_seq9_hunter_tracks', value: 4, publicLabel: '痕迹追踪记录' },
      { kind: 'clue', id: 'dock_watcher_route', value: 8, publicLabel: '盯梢者的转运路线' },
      { kind: 'preparation', id: 'hypothesis:dock_occult_interference:supported', value: 8, publicLabel: '现场与灵视彼此呼应' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours', 'threat:dock_manifest_cleaner'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'investigation:deep_dock_crate_trace', 'threat:dock_manifest_cleaner'] },
    },
  },
  {
    id: 'dock_combat_prepare_retreat', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'encounter:dock_manifest_cleaner:prepare_retreat' }, difficulty: 1,
    requirements: [{ kind: 'clue', id: 'dock_crate_trace' }],
    contributions: [{ kind: 'clue', id: 'dock_crate_trace', value: 1, publicLabel: '货箱外围记录' }],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours'] },
      passed: { hoursElapsed: 1, effectIds: ['energy', 'hours', 'combat-prep:mapped_retreat'] },
    },
  },
  {
    id: 'dock_combat_prepare_ambush', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'encounter:dock_manifest_cleaner:prepare_ambush' }, difficulty: 1,
    requirements: [{ kind: 'clue', id: 'dock_manifest_discrepancy' }, { kind: 'tool', id: 'revolver' }],
    contributions: [{ kind: 'tool', id: 'revolver', value: 1, publicLabel: '可靠武器' }],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours'] },
      passed: { hoursElapsed: 1, effectIds: ['energy', 'hours', 'combat-prep:prepared_ambush'] },
    },
  },
  {
    id: 'dock_combat_prepare_guard', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'encounter:dock_manifest_cleaner:prepare_guard' }, difficulty: 1,
    requirements: [
      { kind: 'clue', id: 'dock_scale_transfer_omen' }, { kind: 'tool', id: 'ritual_chalk' },
      { kind: 'ability', id: 'spirit_vision' },
    ],
    contributions: [{ kind: 'ability', id: 'spirit_vision', value: 1, publicLabel: '受控灵视' }],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours'] },
      passed: { hoursElapsed: 1, effectIds: ['energy', 'hours', 'combat-prep:spiritual_guard'] },
    },
  },
  {
    id: 'dock_manifest_cleaner_escape', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'encounter:dock_manifest_cleaner' }, difficulty: 34,
    requirements: [],
    contributions: [
      { kind: 'stat', id: 'phy', multiplier: 1, publicLabel: '行动能力' },
      { kind: 'skill', id: 'sneak', multiplier: 4, publicLabel: '潜行经验' },
      { kind: 'clue', id: 'dock_crate_trace', value: 6, publicLabel: '事先记录的退路' },
      { kind: 'clue', id: 'dock_seq9_apprentice_passage', value: 8, publicLabel: '通路勘察记录' },
      { kind: 'clue', id: 'dock_seq9_hunter_transfer_marks', value: 6, publicLabel: '转运路线痕迹' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'san', 'hours', 'encounter:combat'] },
      passed: { hoursElapsed: 1, effectIds: ['energy', 'hours', 'encounter:escaped'] },
    },
  },
  {
    id: 'dock_manifest_cleaner_combat', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'encounter:dock_manifest_cleaner_combat' }, difficulty: 42,
    requirements: [],
    contributions: [
      { kind: 'stat', id: 'phy', multiplier: 1, publicLabel: '体能' },
      { kind: 'skill', id: 'combat', multiplier: 4, publicLabel: '格斗经验' },
      { kind: 'tool', id: 'revolver', value: 15, publicLabel: '随身武器' },
      { kind: 'clue', id: 'dock_crate_trace', value: 4, publicLabel: '熟悉现场退路' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'san', 'hours', 'encounter:survived'] },
      passed: { hoursElapsed: 1, effectIds: ['energy', 'san', 'hours', 'threat:resolved'] },
    },
  },
  {
    id: 'dock_manifest_cleaner_spiritual_combat', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'encounter:dock_manifest_cleaner_spiritual_combat' }, difficulty: 42,
    requirements: [{ kind: 'ability', id: 'spirit_vision' }],
    contributions: [
      { kind: 'stat', id: 'spi', multiplier: 1, publicLabel: '灵性控制' },
      { kind: 'skill', id: 'occult', multiplier: 4, publicLabel: '神秘学经验' },
      { kind: 'ability', id: 'spirit_vision', value: 6, publicLabel: '合法序列能力' },
      { kind: 'clue', id: 'dock_scale_transfer_omen', value: 6, publicLabel: '已核验的转运预兆' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'san', 'spirit', 'hours', 'encounter:survived'] },
      passed: { hoursElapsed: 1, effectIds: ['energy', 'san', 'spirit', 'hours', 'threat:resolved'] },
    },
  },
  {
    id: 'dock_manifest_cleaner_active_combat', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'encounter:dock_manifest_cleaner_active_combat' }, difficulty: 42,
    requirements: [],
    contributions: [
      { kind: 'stat', id: 'phy', multiplier: 1, publicLabel: '体能' },
      { kind: 'skill', id: 'combat', multiplier: 4, publicLabel: '格斗经验' },
      { kind: 'tool', id: 'revolver', value: 15, publicLabel: '随身武器' },
      { kind: 'clue', id: 'dock_crate_trace', value: 4, publicLabel: '熟悉现场退路' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'san', 'hours', 'encounter:survived'] },
      passed: { hoursElapsed: 1, effectIds: ['energy', 'san', 'hours', 'threat:resolved'] },
    },
  },
  {
    id: 'dock_manifest_cleaner_active_spiritual_combat', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'encounter:dock_manifest_cleaner_active_spiritual_combat' }, difficulty: 42,
    requirements: [{ kind: 'ability', id: 'spirit_vision' }],
    contributions: [
      { kind: 'stat', id: 'spi', multiplier: 1, publicLabel: '灵性控制' },
      { kind: 'skill', id: 'occult', multiplier: 4, publicLabel: '神秘学经验' },
      { kind: 'ability', id: 'spirit_vision', value: 6, publicLabel: '合法序列能力' },
      { kind: 'clue', id: 'dock_scale_transfer_omen', value: 6, publicLabel: '已核验的转运预兆' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'san', 'spirit', 'hours', 'encounter:survived'] },
      passed: { hoursElapsed: 1, effectIds: ['energy', 'san', 'spirit', 'hours', 'threat:resolved'] },
    },
  },
  {
    id: 'hunt_masked_smuggler_identify', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'hunt:masked_smuggler:identify' }, difficulty: 42,
    requirements: [{ kind: 'clue', id: 'masked_smuggler_trade_tell' }, { kind: 'location', id: 'black_market' }],
    contributions: [
      { kind: 'stat', id: 'mnd', multiplier: 1, publicLabel: '细节判断' },
      { kind: 'skill', id: 'investigate', multiplier: 4, publicLabel: '调查经验' },
      { kind: 'skill', id: 'occult', multiplier: 3, publicLabel: '神秘学辨识' },
      { kind: 'ability', id: 'spirit_vision', value: 8, publicLabel: '灵视辅助' },
      { kind: 'clue', id: 'masked_smuggler_trade_tell', value: 6, publicLabel: '近距离异常记录' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours', 'hunt:suspicion'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'hunt:identity'] },
    },
  },
  {
    id: 'hunt_masked_smuggler_routine', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'hunt:masked_smuggler:routine' }, difficulty: 40,
    requirements: [{ kind: 'clue', id: 'masked_smuggler_trade_tell' }, { kind: 'location', id: 'black_market' }],
    contributions: [
      { kind: 'stat', id: 'mnd', multiplier: 1, publicLabel: '观察判断' },
      { kind: 'skill', id: 'investigate', multiplier: 4, publicLabel: '调查经验' },
      { kind: 'skill', id: 'sneak', multiplier: 3, publicLabel: '隐蔽跟踪' },
      { kind: 'clue', id: 'masked_smuggler_trade_tell', value: 6, publicLabel: '近距离异常记录' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours', 'hunt:suspicion'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'clue:masked_smuggler_routine'] },
    },
  },
  {
    id: 'hunt_masked_smuggler_isolation', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'hunt:masked_smuggler:isolation' }, difficulty: 42,
    requirements: [{ kind: 'clue', id: 'masked_smuggler_routine' }, { kind: 'location', id: 'black_market' }],
    contributions: [
      { kind: 'stat', id: 'cha', multiplier: 1, publicLabel: '临场说服' },
      { kind: 'skill', id: 'speech', multiplier: 4, publicLabel: '话术经验' },
      { kind: 'clue', id: 'masked_smuggler_routine', value: 8, publicLabel: '目标作息记录' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours', 'hunt:suspicion'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'clue:masked_smuggler_secluded_meeting'] },
    },
  },
  {
    id: 'hunt_masked_smuggler_escape_route', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'hunt:masked_smuggler:escape_route' }, difficulty: 38,
    requirements: [{ kind: 'clue', id: 'masked_smuggler_routine' }, { kind: 'location', id: 'black_market' }],
    contributions: [
      { kind: 'stat', id: 'mnd', multiplier: 1, publicLabel: '路线判断' },
      { kind: 'skill', id: 'investigate', multiplier: 4, publicLabel: '调查经验' },
      { kind: 'skill', id: 'sneak', multiplier: 2, publicLabel: '避人耳目' },
      { kind: 'clue', id: 'masked_smuggler_routine', value: 8, publicLabel: '目标作息记录' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours', 'hunt:suspicion'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'clue:masked_smuggler_escape_route'] },
    },
  },
  {
    id: 'hunt_masked_smuggler_ambush', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'hunt:masked_smuggler:ambush' }, difficulty: 44,
    requirements: [{ kind: 'clue', id: 'masked_smuggler_routine' }, { kind: 'location', id: 'black_market' }],
    contributions: [
      { kind: 'stat', id: 'phy', multiplier: 1, publicLabel: '行动能力' },
      { kind: 'skill', id: 'sneak', multiplier: 4, publicLabel: '潜伏经验' },
      { kind: 'skill', id: 'combat', multiplier: 3, publicLabel: '格斗经验' },
      { kind: 'tool', id: 'revolver', value: 12, publicLabel: '可靠武器' },
      { kind: 'clue', id: 'masked_smuggler_routine', value: 8, publicLabel: '目标作息记录' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours', 'hunt:suspicion'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'clue:masked_smuggler_ambush_position'] },
    },
  },
  {
    id: 'hunt_masked_smuggler_strike', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'hunt:masked_smuggler:strike' }, difficulty: 62,
    requirements: [
      { kind: 'clue', id: 'masked_smuggler_routine' },
      { kind: 'clue', id: 'masked_smuggler_secluded_meeting' },
      { kind: 'clue', id: 'masked_smuggler_escape_route' },
      { kind: 'clue', id: 'masked_smuggler_ambush_position' },
      { kind: 'location', id: 'black_market' },
    ],
    contributions: [
      { kind: 'stat', id: 'phy', multiplier: 1, publicLabel: '体能' },
      { kind: 'skill', id: 'combat', multiplier: 4, publicLabel: '格斗经验' },
      { kind: 'skill', id: 'sneak', multiplier: 3, publicLabel: '先手准备' },
      { kind: 'tool', id: 'revolver', value: 12, publicLabel: '可靠武器' },
      { kind: 'clue', id: 'masked_smuggler_routine', value: 5, publicLabel: '目标作息记录' },
      { kind: 'clue', id: 'masked_smuggler_secluded_meeting', value: 7, publicLabel: '单独会面安排' },
      { kind: 'clue', id: 'masked_smuggler_escape_route', value: 6, publicLabel: '撤离路线' },
      { kind: 'clue', id: 'masked_smuggler_ambush_position', value: 9, publicLabel: '伏击先手' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'san', 'hours', 'hunt:combat'] },
      passed: { hoursElapsed: 1, effectIds: ['energy', 'san', 'hours', 'hunt:death', 'infamy', 'law_attention', 'nemesis'] },
    },
  },
  {
    id: 'hunt_masked_smuggler_escape', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'hunt:masked_smuggler:escape' }, difficulty: 42,
    requirements: [{ kind: 'location', id: 'black_market' }],
    contributions: [
      { kind: 'stat', id: 'phy', multiplier: 1, publicLabel: '行动能力' },
      { kind: 'skill', id: 'sneak', multiplier: 4, publicLabel: '潜行经验' },
      { kind: 'clue', id: 'masked_smuggler_escape_route', value: 10, publicLabel: '预先勘察的退路' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'san', 'hours', 'hunt:combat'] },
      passed: { hoursElapsed: 1, effectIds: ['energy', 'hours', 'hunt:escaped'] },
    },
  },
  {
    id: 'hunt_masked_smuggler_combat', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'hunt:masked_smuggler:combat' }, difficulty: 58,
    requirements: [{ kind: 'location', id: 'black_market' }],
    contributions: [
      { kind: 'stat', id: 'phy', multiplier: 1, publicLabel: '体能' },
      { kind: 'skill', id: 'combat', multiplier: 4, publicLabel: '格斗经验' },
      { kind: 'tool', id: 'revolver', value: 12, publicLabel: '可靠武器' },
      { kind: 'clue', id: 'masked_smuggler_ambush_position', value: 6, publicLabel: '预先选择的位置' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'san', 'hours', 'hunt:survived'] },
      passed: { hoursElapsed: 1, effectIds: ['energy', 'san', 'hours', 'hunt:combat_resolved'] },
    },
  },
  {
    id: 'identity_investigate_witness', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'identity:witness_description' }, difficulty: 32,
    requirements: [],
    contributions: [
      { kind: 'stat', id: 'mnd', multiplier: 1, publicLabel: '记录梳理' },
      { kind: 'skill', id: 'investigate', multiplier: 3, publicLabel: '调查经验' },
      { kind: 'skill', id: 'speech', multiplier: 2, publicLabel: '侧面问询' },
      { kind: 'clue', id: 'tingen_city_directory', value: 6, publicLabel: '城区公共目录' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'identity:trace'] },
    },
  },
  {
    id: 'identity_investigate_confrontation', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'identity:public_confrontation' }, difficulty: 36,
    requirements: [],
    contributions: [
      { kind: 'stat', id: 'mnd', multiplier: 1, publicLabel: '现场复盘' },
      { kind: 'skill', id: 'investigate', multiplier: 3, publicLabel: '调查经验' },
      { kind: 'skill', id: 'sneak', multiplier: 2, publicLabel: '反跟踪意识' },
      { kind: 'clue', id: 'tingen_city_directory', value: 6, publicLabel: '城区公共目录' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'identity:trace'] },
    },
  },
  {
    id: 'identity_investigate_death', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'identity:death_connection' }, difficulty: 42,
    requirements: [],
    contributions: [
      { kind: 'stat', id: 'mnd', multiplier: 1, publicLabel: '交易记录梳理' },
      { kind: 'skill', id: 'investigate', multiplier: 3, publicLabel: '调查经验' },
      { kind: 'skill', id: 'speech', multiplier: 2, publicLabel: '中间人口风' },
      { kind: 'clue', id: 'tingen_city_directory', value: 6, publicLabel: '城区公共目录' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'identity:trace'] },
    },
  },
  {
    id: 'identity_resolve_witness', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'identity:resolve:witness_description' }, difficulty: 38,
    requirements: [],
    contributions: [
      { kind: 'stat', id: 'cha', multiplier: 1, publicLabel: '可信陈述' },
      { kind: 'skill', id: 'speech', multiplier: 4, publicLabel: '话术经验' },
      { kind: 'skill', id: 'investigate', multiplier: 2, publicLabel: '行程凭据' },
      { kind: 'clue', id: 'tingen_city_directory', value: 6, publicLabel: '办事目录' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'money', 'hours'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'money', 'hours', 'identity:resolved'] },
    },
  },
  {
    id: 'identity_resolve_confrontation', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'identity:resolve:public_confrontation' }, difficulty: 44,
    requirements: [{ kind: 'tool', id: 'plain_disguise_kit' }],
    contributions: [
      { kind: 'stat', id: 'mnd', multiplier: 1, publicLabel: '痕迹判断' },
      { kind: 'skill', id: 'sneak', multiplier: 4, publicLabel: '反跟踪经验' },
      { kind: 'tool', id: 'plain_disguise_kit', value: 12, publicLabel: '普通伪装用品' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 2, effectIds: ['energy', 'money', 'item:plain_disguise_kit', 'hours'] },
      passed: { hoursElapsed: 3, effectIds: ['energy', 'money', 'item:plain_disguise_kit', 'hours', 'identity:resolved'] },
    },
  },
  {
    id: 'identity_resolve_death', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'identity:resolve:death_connection' }, difficulty: 48,
    requirements: [],
    contributions: [
      { kind: 'stat', id: 'cha', multiplier: 1, publicLabel: '正式陈述' },
      { kind: 'skill', id: 'speech', multiplier: 4, publicLabel: '交涉经验' },
      { kind: 'skill', id: 'investigate', multiplier: 2, publicLabel: '交易记录核对' },
      { kind: 'clue', id: 'tingen_city_directory', value: 6, publicLabel: '办事目录' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 2, effectIds: ['energy', 'money', 'hours'] },
      passed: { hoursElapsed: 4, effectIds: ['energy', 'money', 'hours', 'identity:resolved'] },
    },
  },
  {
    id: 'identity_prepare_cover', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'identity:prepare_cover' }, difficulty: 42,
    requirements: [{ kind: 'tool', id: 'plain_disguise_kit' }],
    contributions: [
      { kind: 'stat', id: 'mnd', multiplier: 1, publicLabel: '细节规划' },
      { kind: 'skill', id: 'sneak', multiplier: 4, publicLabel: '隐藏习惯' },
      { kind: 'skill', id: 'speech', multiplier: 2, publicLabel: '身份说辞' },
      { kind: 'tool', id: 'plain_disguise_kit', value: 12, publicLabel: '普通伪装用品' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'item:plain_disguise_kit', 'hours'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'item:plain_disguise_kit', 'hours', 'identity:cover'] },
    },
  },
  dockSequence9Check('seer', 'spi', 'occult', 'dock_seq9_seer_omen', '灵性直觉', '神秘学常识'),
  dockSequence9Check('spectator', 'mnd', 'speech', 'dock_seq9_spectator_testimony', '细节观察', '交谈经验'),
  dockSequence9Check('hunter', 'phy', 'investigate', 'dock_seq9_hunter_tracks', '追踪耐力', '调查经验'),
  dockSequence9Check('sleepless', 'mnd', 'investigate', 'dock_seq9_sleepless_watch', '夜间专注', '调查经验'),
  dockSequence9Check('apprentice', 'spi', 'sneak', 'dock_seq9_apprentice_passage', '空间感知', '潜行经验'),
  dockSequence9SynthesisCheck('seer', 'spi', 'occult', 'dock_seq9_seer_omen', 'dock_seq9_seer_manifest_omen', '灵性直觉', '神秘学常识'),
  dockSequence9SynthesisCheck('spectator', 'mnd', 'speech', 'dock_seq9_spectator_testimony', 'dock_seq9_spectator_ledger_evasion', '细节观察', '交谈经验'),
  dockSequence9SynthesisCheck('hunter', 'phy', 'investigate', 'dock_seq9_hunter_tracks', 'dock_seq9_hunter_transfer_marks', '追踪耐力', '调查经验'),
  dockSequence9SynthesisCheck('sleepless', 'mnd', 'investigate', 'dock_seq9_sleepless_watch', 'dock_seq9_sleepless_shift_recollection', '夜间专注', '调查经验'),
  dockSequence9SynthesisCheck('apprentice', 'spi', 'sneak', 'dock_seq9_apprentice_passage', 'dock_seq9_apprentice_transfer_geometry', '空间感知', '潜行经验'),
  ...DIVINATION_CLUB_COMMISSIONS.map(divinationClubAcceptCheck),
  {
    id: 'club_field_lost_keepsake', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'divination_club:lost_keepsake:field' }, difficulty: 42,
    requirements: [{ kind: 'clue', id: 'club_lost_keepsake_brief' }, { kind: 'location', id: 'market' }],
    contributions: [
      { kind: 'stat', id: 'mnd', multiplier: 1, publicLabel: '现场梳理' },
      { kind: 'skill', id: 'investigate', multiplier: 4, publicLabel: '调查经验' },
      { kind: 'clue', id: 'club_lost_keepsake_brief', value: 8, publicLabel: '来访记录' },
      { kind: 'clue', id: 'tingen_city_directory', value: 4, publicLabel: '城区公共目录' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'clue:club_lost_keepsake_market_trace'] },
    },
  },
  {
    id: 'club_field_journey_omen', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'divination_club:journey_omen:field' }, difficulty: 42,
    contributions: [
      { kind: 'stat', id: 'cha', multiplier: 1, publicLabel: '问询分寸' },
      { kind: 'skill', id: 'speech', multiplier: 4, publicLabel: '交谈经验' },
      { kind: 'clue', id: 'club_journey_statement', value: 8, publicLabel: '来访陈述' },
      { kind: 'clue', id: 'tingen_church_directory', value: 4, publicLabel: '教会公共公告' },
    ],
    requirements: [{ kind: 'clue', id: 'club_journey_statement' }, { kind: 'location', id: 'river_sea_church' }],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'clue:club_journey_public_notice'] },
    },
  },
  {
    id: 'club_field_recurring_nightmare', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'divination_club:recurring_nightmare:field' }, difficulty: 42,
    requirements: [{ kind: 'clue', id: 'club_nightmare_statement' }, { kind: 'location', id: 'dewill_library' }],
    contributions: [
      { kind: 'stat', id: 'mnd', multiplier: 1, publicLabel: '细节整理' },
      { kind: 'skill', id: 'investigate', multiplier: 4, publicLabel: '调查经验' },
      { kind: 'clue', id: 'club_nightmare_statement', value: 8, publicLabel: '梦境与作息记录' },
      { kind: 'clue', id: 'tingen_honest_paper', value: 4, publicLabel: '公共报刊索引' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'clue:club_nightmare_periodical_trace'] },
    },
  },
  {
    id: 'club_commission_lost_keepsake', version: 3, domain: 'exploration',
    target: { kind: 'case', id: 'divination_club:lost_keepsake' }, difficulty: 44,
    requirements: [
      { kind: 'clue', id: 'club_lost_keepsake_brief' }, { kind: 'clue', id: 'club_lost_keepsake_market_trace' },
      { kind: 'ability', id: 'seer_divination' }, { kind: 'location', id: 'divination_club' },
    ],
    contributions: [
      { kind: 'stat', id: 'mnd', multiplier: 1, publicLabel: '陈述梳理' },
      { kind: 'skill', id: 'investigate', multiplier: 4, publicLabel: '调查经验' },
      { kind: 'clue', id: 'club_lost_keepsake_brief', value: 8, publicLabel: '来访记录' },
      { kind: 'clue', id: 'club_lost_keepsake_market_trace', value: 10, publicLabel: '市场核对记录' },
      { kind: 'tool', id: 'symbol_cards', value: 4, publicLabel: '固定象征纸牌媒介' },
      { kind: 'ability', id: 'seer_divination', value: 2, publicLabel: '占卜家职业经验' },
      { kind: 'ability', id: 'seer_dowsing', value: 6, publicLabel: '灵摆寻物训练' },
      { kind: 'ability', id: 'seer_meditation_focus', value: 4, publicLabel: '本次冥想专注' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours', 'seer_training:focus_preparation'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'money', 'digestion', 'club_reputation', 'hours', 'clue:club_lost_keepsake_outcome', 'acting:club:lost_keepsake', 'seer_training:focus_preparation'] },
    },
  },
  {
    id: 'club_commission_journey_omen', version: 3, domain: 'exploration',
    target: { kind: 'case', id: 'divination_club:journey_omen' }, difficulty: 44,
    requirements: [
      { kind: 'clue', id: 'club_journey_statement' }, { kind: 'clue', id: 'club_journey_public_notice' },
      { kind: 'ability', id: 'seer_divination' }, { kind: 'location', id: 'divination_club' },
    ],
    contributions: [
      { kind: 'stat', id: 'spi', multiplier: 1, publicLabel: '灵性直觉' },
      { kind: 'skill', id: 'occult', multiplier: 4, publicLabel: '神秘学经验' },
      { kind: 'clue', id: 'club_journey_statement', value: 8, publicLabel: '预约陈述' },
      { kind: 'clue', id: 'club_journey_public_notice', value: 10, publicLabel: '河运公告核对记录' },
      { kind: 'tool', id: 'symbol_cards', value: 4, publicLabel: '固定象征纸牌媒介' },
      { kind: 'ability', id: 'seer_divination', value: 2, publicLabel: '占卜家职业经验' },
      { kind: 'ability', id: 'seer_spirit_vision_focus', value: 6, publicLabel: '灵视收束训练' },
      { kind: 'ability', id: 'seer_meditation_focus', value: 4, publicLabel: '本次冥想专注' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours', 'seer_training:focus_preparation'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'money', 'digestion', 'club_reputation', 'hours', 'clue:club_journey_omen_outcome', 'acting:club:journey_omen', 'seer_training:focus_preparation'] },
    },
  },
  {
    id: 'club_commission_recurring_nightmare', version: 3, domain: 'exploration',
    target: { kind: 'case', id: 'divination_club:recurring_nightmare' }, difficulty: 44,
    requirements: [
      { kind: 'clue', id: 'club_nightmare_statement' }, { kind: 'clue', id: 'club_nightmare_periodical_trace' },
      { kind: 'ability', id: 'seer_divination' }, { kind: 'location', id: 'divination_club' },
    ],
    contributions: [
      { kind: 'stat', id: 'mnd', multiplier: 1, publicLabel: '梦境梳理' },
      { kind: 'skill', id: 'occult', multiplier: 4, publicLabel: '神秘学经验' },
      { kind: 'clue', id: 'club_nightmare_statement', value: 8, publicLabel: '梦境与作息记录' },
      { kind: 'clue', id: 'club_nightmare_periodical_trace', value: 10, publicLabel: '旧报核对记录' },
      { kind: 'tool', id: 'symbol_cards', value: 4, publicLabel: '固定象征纸牌媒介' },
      { kind: 'ability', id: 'seer_divination', value: 2, publicLabel: '占卜家职业经验' },
      { kind: 'ability', id: 'seer_spirit_vision_focus', value: 6, publicLabel: '灵视收束训练' },
      { kind: 'ability', id: 'seer_meditation_focus', value: 4, publicLabel: '本次冥想专注' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours', 'seer_training:focus_preparation'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'money', 'digestion', 'club_reputation', 'hours', 'clue:club_nightmare_outcome', 'acting:club:recurring_nightmare', 'seer_training:focus_preparation'] },
    },
  },
  {
    id: 'elliot_locator_divination', version: 3, domain: 'exploration',
    target: { kind: 'case', id: 'elliot_kidnapping:locator' }, difficulty: 34,
    requirements: [{ kind: 'clue', id: 'elliot_worn_coat' }, { kind: 'ability', id: 'spirit_vision' }, { kind: 'location', id: 'blackthorn_security' }],
    contributions: [
      { kind: 'stat', id: 'spi', multiplier: 1, publicLabel: '灵性直觉' },
      { kind: 'skill', id: 'occult', multiplier: 4, publicLabel: '神秘学经验' },
      { kind: 'clue', id: 'elliot_worn_coat', value: 8, publicLabel: '失踪者随身物' },
      { kind: 'tool', id: 'plain_pendulum', value: 4, publicLabel: '普通灵摆媒介' },
      { kind: 'ability', id: 'seer_divination', value: 2, publicLabel: '占卜家职业经验' },
      { kind: 'ability', id: 'spirit_vision', value: 6, publicLabel: '基础灵视' },
      { kind: 'ability', id: 'seer_dowsing', value: 8, publicLabel: '灵摆寻人训练' },
      { kind: 'ability', id: 'seer_meditation_focus', value: 4, publicLabel: '本次冥想专注' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'clue:elliot_hideout_address'] },
    },
  },
  {
    id: 'elliot_locator_records', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'elliot_kidnapping:locator' }, difficulty: 38,
    requirements: [{ kind: 'clue', id: 'elliot_commission_brief' }, { kind: 'location', id: 'blackthorn_security' }],
    contributions: [
      { kind: 'stat', id: 'mnd', multiplier: 1, publicLabel: '记录推理' },
      { kind: 'skill', id: 'investigate', multiplier: 4, publicLabel: '调查经验' },
      { kind: 'clue', id: 'elliot_commission_brief', value: 8, publicLabel: '正式委托书' },
      { kind: 'clue', id: 'tingen_city_directory', value: 4, publicLabel: '城区公共目录' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'clue:elliot_hideout_address'] },
    },
  },
  {
    id: 'elliot_confirm_spirit_vision', version: 2, domain: 'exploration',
    target: { kind: 'location', id: 'forston_hideout' }, difficulty: 32,
    requirements: [{ kind: 'clue', id: 'elliot_hideout_address' }, { kind: 'ability', id: 'spirit_vision' }, { kind: 'location', id: 'forston_hideout' }],
    contributions: [
      { kind: 'stat', id: 'spi', multiplier: 1, publicLabel: '灵性感知' },
      { kind: 'skill', id: 'occult', multiplier: 4, publicLabel: '神秘学经验' },
      { kind: 'clue', id: 'elliot_hideout_address', value: 8, publicLabel: '藏身处地址' },
      { kind: 'ability', id: 'spirit_vision', value: 6, publicLabel: '灵视' },
      { kind: 'ability', id: 'seer_spirit_vision_focus', value: 8, publicLabel: '灵视收束训练' },
      { kind: 'ability', id: 'seer_meditation_focus', value: 4, publicLabel: '本次冥想专注' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours'] },
      passed: { hoursElapsed: 1, effectIds: ['energy', 'hours', 'clue:elliot_presence_confirmed'] },
    },
  },
  {
    id: 'elliot_confirm_investigation', version: 1, domain: 'exploration',
    target: { kind: 'location', id: 'forston_hideout' }, difficulty: 36,
    requirements: [{ kind: 'clue', id: 'elliot_hideout_address' }, { kind: 'location', id: 'forston_hideout' }],
    contributions: [
      { kind: 'stat', id: 'mnd', multiplier: 1, publicLabel: '现场判断' },
      { kind: 'skill', id: 'investigate', multiplier: 4, publicLabel: '调查经验' },
      { kind: 'clue', id: 'elliot_hideout_address', value: 8, publicLabel: '藏身处地址' },
      { kind: 'clue', id: 'elliot_partner_assignment', value: 4, publicLabel: '同行观察记录' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours'] },
      passed: { hoursElapsed: 1, effectIds: ['energy', 'hours', 'clue:elliot_presence_confirmed'] },
    },
  },
  {
    id: 'elliot_team_rescue', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'elliot_kidnapping:rescue' }, difficulty: 42,
    requirements: [{ kind: 'clue', id: 'elliot_presence_confirmed' }, { kind: 'clue', id: 'elliot_partner_assignment' }, { kind: 'location', id: 'forston_hideout' }],
    contributions: [
      { kind: 'stat', id: 'phy', multiplier: 1, publicLabel: '行动能力' },
      { kind: 'skill', id: 'combat', multiplier: 4, publicLabel: '格斗训练' },
      { kind: 'clue', id: 'elliot_presence_confirmed', value: 8, publicLabel: '人质位置确认' },
      { kind: 'clue', id: 'elliot_partner_assignment', value: 8, publicLabel: '同行队员' },
      { kind: 'clue', id: 'elliot_backup_ready', value: 10, publicLabel: '增援部署' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'clue:elliot_rescue_record'] },
    },
  },
  {
    id: 'seer_ritual_safety_practice', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'seer_training:ritual_safety' }, difficulty: 36,
    requirements: [
      { kind: 'ability', id: 'seer_spirituality_wall' }, { kind: 'ability', id: 'seer_ritual_safety' },
      { kind: 'tool', id: 'ritual_chalk' }, { kind: 'location', id: 'blackthorn_security' },
    ],
    contributions: [
      { kind: 'stat', id: 'spi', multiplier: 1, publicLabel: '灵性控制' },
      { kind: 'skill', id: 'occult', multiplier: 4, publicLabel: '神秘学经验' },
      { kind: 'ability', id: 'seer_spirituality_wall', value: 8, publicLabel: '灵性之墙课程' },
      { kind: 'ability', id: 'seer_ritual_safety', value: 8, publicLabel: '仪式安全课程' },
      { kind: 'tool', id: 'ritual_chalk', value: 4, publicLabel: '普通仪式粉笔' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'seer_training:ritual_practice'] },
    },
  },
  {
    id: 'seer_spirit_channeling_review', version: 1, domain: 'exploration',
    target: { kind: 'case', id: 'seer_training:spirit_channeling' }, difficulty: 30,
    requirements: [
      { kind: 'ability', id: 'seer_spirit_channeling' }, { kind: 'clue', id: 'elliot_commission_brief' },
      { kind: 'location', id: 'blackthorn_security' },
    ],
    contributions: [
      { kind: 'stat', id: 'mnd', multiplier: 1, publicLabel: '记录复核' },
      { kind: 'skill', id: 'occult', multiplier: 4, publicLabel: '神秘学经验' },
      { kind: 'ability', id: 'seer_spirit_channeling', value: 10, publicLabel: '受监督通灵基础' },
      { kind: 'clue', id: 'elliot_commission_brief', value: 4, publicLabel: '正式案件记录' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'hours', 'seer_training:case_review'] },
    },
  },
  {
    id: 'seer_blank_charm_structure', version: 1, domain: 'exploration',
    target: { kind: 'item', id: 'blank_charm_paper' }, difficulty: 30,
    requirements: [
      { kind: 'ability', id: 'seer_charm_theory' }, { kind: 'tool', id: 'blank_charm_paper' },
      { kind: 'location', id: 'blackthorn_security' },
    ],
    contributions: [
      { kind: 'stat', id: 'mnd', multiplier: 1, publicLabel: '结构记忆' },
      { kind: 'skill', id: 'occult', multiplier: 4, publicLabel: '神秘学经验' },
      { kind: 'ability', id: 'seer_charm_theory', value: 10, publicLabel: '符咒理论课程' },
      { kind: 'tool', id: 'blank_charm_paper', value: 2, publicLabel: '空白纸质载体' },
    ],
    receiptPolicy: {
      blocked: { hoursElapsed: 1, effectIds: ['energy', 'hours'] },
      passed: { hoursElapsed: 2, effectIds: ['energy', 'item:blank_charm_paper', 'hours', 'seer_training:blank_charm'] },
    },
  },
  organizationQualificationCheck(ORGANIZATION_QUALIFICATION_TASKS[0], 32, [
    { id: 'cryptic_note_warning', value: 6, publicLabel: '经过核验的残页警告' },
    { id: 'manor_guest_registry', value: 6, publicLabel: '庄园名册旁证' },
    { id: 'clocktower_divination_omen', value: 4, publicLabel: '已记录的钟楼预兆' },
  ]),
  organizationQualificationCheck(ORGANIZATION_QUALIFICATION_TASKS[1], 32, [
    { id: 'clocktower_public_complaints', value: 4, publicLabel: '公开投诉记录' },
    { id: 'dock_missing_reports', value: 4, publicLabel: '公开失踪登记' },
    { id: 'manor_guest_registry', value: 4, publicLabel: '庄园名册旁证' },
  ]),
  organizationQualificationCheck(ORGANIZATION_QUALIFICATION_TASKS[2], 40, [
    { id: 'dock_manifest_discrepancy', value: 8, publicLabel: '货运记录旁证' },
    { id: 'dock_ledger_notation', value: 4, publicLabel: '仓单编号知识' },
    { id: 'dock_crate_trace', value: 4, publicLabel: '码头现场记录' },
    { id: 'dock_missing_reports', value: 4, publicLabel: '公开失踪登记' },
  ]),
  organizationQualificationCheck(ORGANIZATION_QUALIFICATION_TASKS[3], 28, [
    { id: 'manor_address', value: 4, publicLabel: '旧宅路线来源' },
    { id: 'manor_guest_registry', value: 8, publicLabel: '庄园名册旁证' },
    { id: 'cryptic_note_warning', value: 6, publicLabel: '经过核验的残页警告' },
  ]),
  ...INVESTIGATION_HYPOTHESIS_CHECKS,
];

export const DOCK_SEQUENCE9_ACTIONS: readonly DockSequence9ActionDef[] = [
  {
    id: 'dock_seq9_seer', pathwayId: 'seer', locationId: 'docks', label: '以预兆定位潮痕',
    description: '只对已知失踪时间与码头现场作象征整理，不扫描未知目标。', hours: 2, energyCost: 10,
    clueId: 'dock_seq9_seer_omen', result: '你把失踪时刻、潮位和反复出现的象征并列记录。预兆没有说出答案，却稳定指向同一段货栈交接时刻。',
  },
  {
    id: 'dock_seq9_seer_manifest', pathwayId: 'seer', locationId: 'docks', label: '核对仓单日期的预兆',
    description: '在账房开放时段把已知象征与仓单日期逐项交叉，不追问未知幕后。', hours: 2, energyCost: 10,
    openFrom: 9, openTo: 17, requiredClueIds: ['dock_seq9_seer_omen'],
    clueId: 'dock_seq9_seer_manifest_omen', result: '几处日期与潮位象征稳定重合，说明固定交接空档曾被反复利用；预兆仍没有给出幕后者的名字。',
  },
  {
    id: 'dock_seq9_spectator', pathwayId: 'spectator', locationId: 'docks', label: '静观证词矛盾',
    description: '观察公开受访者的停顿与回避，只整理可交叉核验的证词。', hours: 2, energyCost: 10,
    clueId: 'dock_seq9_spectator_testimony', result: '你没有猜测任何人的秘密，只标出几名搬运工在同一处货栈和同一段时间上出现的共同回避。',
  },
  {
    id: 'dock_seq9_spectator_ledger', pathwayId: 'spectator', locationId: 'docks', label: '观察账房答复',
    description: '在账房开放时段复述已知问题，记录不同人员对同一交接空档的共同回避。', hours: 2, energyCost: 10,
    openFrom: 9, openTo: 17, requiredClueIds: ['dock_seq9_spectator_testimony'],
    clueId: 'dock_seq9_spectator_ledger_evasion', result: '账房人员各自使用不同说法，却都避开同一段交接时间。你只记录可复核的回避，没有把猜测写成供词。',
  },
  {
    id: 'dock_seq9_hunter', pathwayId: 'hunter', locationId: 'docks', label: '追踪退潮痕迹',
    description: '沿公开仓区追踪拖痕与脚印，不制造猎物或额外掉落。', hours: 2, energyCost: 10,
    clueId: 'dock_seq9_hunter_tracks', result: '你沿退潮泥地重走数遍，确认几组拖行痕迹会绕开值守视线，又在同一片仓区附近汇合。',
  },
  {
    id: 'dock_seq9_hunter_transfer', pathwayId: 'hunter', locationId: 'canal', label: '追索转运痕迹',
    description: '沿已经查明的回路前往运河仓区，只比对重复出现的拖痕与落脚点。', hours: 2, energyCost: 10,
    requiredClueIds: ['dock_seq9_hunter_tracks'],
    clueId: 'dock_seq9_hunter_transfer_marks', result: '码头的拖行回路在运河仓区找到对应落点；痕迹证明有人沿固定路线转运，却没有留下足以指认幕后者的身份特征。',
  },
  {
    id: 'dock_seq9_sleepless', pathwayId: 'sleepless', locationId: 'docks', label: '守望夜班交接',
    description: '在夜间保持清醒，记录交接空档中的声音和灯火变化。', hours: 2, energyCost: 10, nightOnly: true,
    clueId: 'dock_seq9_sleepless_watch', result: '你熬过最安静的交接空档，记下远处灯火熄灭、拖拽声出现与巡夜脚步错开的固定次序。',
  },
  {
    id: 'dock_seq9_sleepless_tavern', pathwayId: 'sleepless', locationId: 'tavern', label: '请麦克复述夜班片段',
    description: '在晚间酒馆里，请已经结识的麦克回忆夜班交接中重复出现的空档。', hours: 2, energyCost: 8,
    openFrom: 18, openTo: 26, requiredClueIds: ['dock_seq9_sleepless_watch'], requiredNpcId: 'mike',
    clueId: 'dock_seq9_sleepless_shift_recollection', result: '麦克把几段看似零散的回忆按班次重新排好：同一条口信总会让工人在固定时刻离开岗哨，但他也不知道是谁在安排。',
  },
  {
    id: 'dock_seq9_apprentice', pathwayId: 'apprentice', locationId: 'docks', label: '勘察货栈通路',
    description: '测量公开通路、门窗和视线死角，不穿越封锁或解锁未知地点。', hours: 2, energyCost: 10,
    clueId: 'dock_seq9_apprentice_passage', result: '你逐段核对货栈之间的通路，发现一条看似绕远的搬运路线实际上总能避开两个公开岗哨。',
  },
  {
    id: 'dock_seq9_apprentice_canal', pathwayId: 'apprentice', locationId: 'canal', label: '测绘转运几何',
    description: '沿已经查明的通路关系测量运河仓区外围，不穿越封锁或未知门扉。', hours: 2, energyCost: 10,
    requiredClueIds: ['dock_seq9_apprentice_passage'],
    clueId: 'dock_seq9_apprentice_transfer_geometry', result: '两处仓区的门、坡道与视线死角构成一条稳定转运几何；路线可以被复核，却无法说明幕后者属于哪个组织。',
  },
];

export const DOCK_CASE_DISPOSITIONS: readonly DockCaseDispositionDef[] = [
  {
    id: 'public_report', clueId: 'dock_disposition_public_report', locationId: 'docks', label: '递交公开港务报告',
    description: '只提交可公开核验的人员、班次与转运路线，保留原始证物。', openFrom: 9, openTo: 17,
  },
  {
    id: 'workers_warning', clueId: 'dock_disposition_workers_warning', locationId: 'tavern', label: '提醒夜班工人避开空档',
    description: '通过已经结识的麦克传递具体避险提醒，不渲染未知威胁。', openFrom: 16, openTo: 26, requiredNpcId: 'mike',
  },
  {
    id: 'official_handoff', clueId: 'dock_disposition_official_handoff', locationId: 'blackthorn_security', label: '正式移交调查记录',
    description: '向已经建立正式接触的安保人员移交副本，原始证物仍由你保管。', openFrom: 9, openTo: 17,
    requiresFormalLocationAccess: true,
  },
];

// ============ 固定书籍与来源 ============
export const BOOK_DEFS: readonly BookDef[] = [
  {
    id: 'municipal_archive_manual', title: '《市政档案检索与编号手册》',
    surfaceDesc: '市政窗口常见的工具书，讲解卷宗编号、索引卡和调阅次序。', category: 'book', language: 'ruen', totalHours: 4,
    rewards: [{ kind: 'knowledge', id: 'archive_method' }, { kind: 'skill', id: 'investigate', maxGain: 1 }],
  },
  {
    id: 'dock_manifest_manual', title: '《港务编号与仓单抄写规范》',
    surfaceDesc: '港务处内部使用的旧版抄写规范，夹有大量更正页。', category: 'book', language: 'ruen', totalHours: 6,
    minSkill: { id: 'investigate', level: 1 },
    check: { stat: 'mnd', skill: 'investigate', difficulty: 30, clueBonuses: { dock_missing_reports: 4, dock_manifest_discrepancy: 6 } },
    rewards: [{ kind: 'knowledge', id: 'cargo_notation' }, { kind: 'clue', id: 'dock_ledger_notation' }],
  },
  {
    id: 'church_festivals_excerpt', title: '《黑夜教会节期与礼仪摘录》',
    surfaceDesc: '面向教区志愿者的节期与礼仪摘录，不含内部教义。', category: 'book', language: 'ruen', totalHours: 4,
    rewards: [{ kind: 'knowledge', id: 'church_liturgy' }],
  },
  {
    id: 'old_feysac_primer', title: '《旧弗萨克语入门》',
    surfaceDesc: '一本写满音变、格位和抄写练习的旧语言教材。', category: 'book', language: 'ruen', totalHours: 8, minMind: 18,
    rewards: [{ kind: 'language', id: 'old_feysac', level: 'reading' }],
  },
  {
    id: 'manor_guest_registry_book', title: '《雾林庄园访客名册》',
    surfaceDesc: '虫蛀严重的访客名册，多数姓名用旧弗萨克语写成。', category: 'book', language: 'old_feysac', totalHours: 8,
    minSkill: { id: 'investigate', level: 2 },
    rewards: [{ kind: 'clue', id: 'manor_guest_registry' }, { kind: 'event', id: 'manor_registry_memory' }],
  },
  {
    id: 'abridged_occult_notes', title: '《神秘学札记·删节本》',
    surfaceDesc: '删除了仪式步骤与危险实例的理论札记，只保留术语、辨伪和安全边界。', category: 'book', language: 'ruen', totalHours: 10,
    rewards: [{ kind: 'knowledge', id: 'occult_theory' }, { kind: 'skill', id: 'occult', maxGain: 1 }],
  },
];

export const BOOK_SOURCE_DEFS: readonly BookSourceDef[] = [
  { bookId: 'municipal_archive_manual', kind: 'public_location', sourceId: 'municipal_library', price: 12 },
  { bookId: 'dock_manifest_manual', kind: 'location', sourceId: 'docks', price: 0 },
  { bookId: 'church_festivals_excerpt', kind: 'npc', sourceId: 'evelyn', price: 0 },
  { bookId: 'old_feysac_primer', kind: 'npc', sourceId: 'nelson', price: 36 },
  { bookId: 'manor_guest_registry_book', kind: 'location', sourceId: 'manor', price: 0 },
  { bookId: 'abridged_occult_notes', kind: 'npc', sourceId: 'nelson', price: 60 },
];

// ============ 天赋（开局 8 选 2） ============
export const TALENTS: Talent[] = [
  { id: 'spirit_affinity', name: '灵性亲和', desc: '你从小就能「感觉」到别人感觉不到的东西。', effect: '更容易察觉细微异常，也更适合整理神秘学线索' },
  { id: 'iron_nerves', name: '钢铁神经', desc: '天塌下来，你先算完手里这笔账。', effect: '面对冲击时更容易保持镇定' },
  { id: 'quick_wit', name: '过目不忘', desc: '读过的每一页书都躺在你脑子里。', effect: '阅读与整理知识时更容易抓住重点' },
  { id: 'silver_tongue', name: '巧舌如簧', desc: '你说话，别人总是愿意多听两句。', effect: '更容易在交谈中留下好印象' },
  { id: 'night_owl', name: '夜行动物', desc: '夜晚的你比白天清醒得多。', effect: '夜间行动时更从容' },
  { id: 'money_grubber', name: '精打细算', desc: '每一个便士在你手里都会下崽。', effect: '更擅长从日常工作中攒下钱' },
  { id: 'sixth_sense', name: '第六感', desc: '危险来临前，你的后颈总会先知道。', effect: '接近危险时偶尔会收到模糊预兆' },
  { id: 'strong_body', name: '膀大腰圆', desc: '这身板，码头工头看了都想招你。', effect: '体力更充沛，适合长途与艰苦行动' },
];

// ============ 五条途径 ============

// ============ 五条途径 ============
export const PATHWAYS: Pathway[] = [
  {
    id: 'seer', name: '占卜家途径', title: '窥见命运之人',
    desc: '信息差流。用占卜预判风险、规避危险、在委托与黑市中先人一步；正面战力弱。',
    tendency: '灵性↑↑ 心智↑ 魅力↑ 体质—',
    seqNames: ['占卜家', '小丑', '魔术师', '无面人', '秘偶大师', '诡法师', '古代学者', '奇迹师', '诡秘侍者', '愚者'],
    seq9Ability: '灵摆与塔罗占卜：可从已知目标中整理象征性启示与行动方向；微弱的危险直觉。',
    actingHint: '常做占卜，但敬畏命运；不把结果说透。',
    seq9: { materials: ['octopus_blood', 'star_crystal'], auxiliary: 'seer9_auxiliary' },
    seq8: { materials: ['goat_horn', 'face_rose'], ritual: '在众人的嘲笑或漠视中服食魔药。' },
  },
  {
    id: 'spectator', name: '观众途径', title: '洞察人心之人',
    desc: '社交流天花板。洞察情绪、读取人心，靠人脉与情报立足；几乎没有战斗力。',
    tendency: '魅力↑↑ 心智↑↑ 灵性↑ 体质—',
    seqNames: ['观众', '读心者', '心理医生', '催眠师', '梦境行者', '操纵师', '织梦人', '洞察者', '作家', '空想家'],
    seq9Ability: '洞察情绪：社交时能看到对方的情绪倾向与谎言苗头。',
    actingHint: '做听众而非主角；先观察后开口；绝不暴露非凡身份。',
    seq9: { materials: ['manhal_eye', 'hornfish_blood'], auxiliary: 'spectator9_auxiliary' },
    seq8: { materials: ['toad_brain', 'lizard_scale'], ritual: '独处镜前，直视自己的倒影服食。' },
  },
  {
    id: 'hunter', name: '猎人途径', title: '战争与火焰之人',
    desc: '战斗/阴谋流。追踪、挑衅、纵火；冒险收益最高，树敌也最快。',
    tendency: '体质↑↑ 魅力↑ 心智↑ 灵性—',
    seqNames: ['猎人', '挑衅者', '纵火家', '阴谋家', '收割者', '铁血骑士', '战争主教', '天气术士', '征服者', '红祭司'],
    seq9Ability: '追踪与陷阱：冒险行动精力消耗降低，收获提升。',
    actingHint: '每日保持狩猎练习；猎物必有所获；不杀无价值的目标。',
    seq9: { materials: ['blood_red_chestnut', 'activated_marsh_crystal'], auxiliary: 'hunter9_auxiliary' },
    seq8: { materials: ['ape_brain', 'scorpion_sting'], ritual: '在一场冲突的怒火中服食魔药。' },
  },
  {
    id: 'sleepless', name: '不眠者途径', title: '黑夜眷者',
    desc: '时间流。免除睡眠，每天多出 6-8 小时；夜晚全能力加成；代价是污染增速更快。',
    tendency: '灵性↑ 心智↑ 体质↑（夜间翻倍）',
    seqNames: ['不眠者', '午夜诗人', '梦魇', '安魂师', '灵巫', '守夜人', '恐惧主教', '隐秘之仆', '厄难骑士', '黑暗'],
    seq9Ability: '免除睡眠需求；夜视；深夜时段全判定加成。',
    actingHint: '昼伏夜出；守护他人的安眠；不在黑夜中恐惧。',
    seq9: { materials: ['midnight_beauty_flower', 'six_legged_owl_eye'], auxiliary: 'sleepless9_auxiliary' },
    seq8: { materials: ['nightingale_throat', 'jellyfish_crystal'], ritual: '于亲手写下的安眠诗吟诵声中服食。' },
  },
  {
    id: 'apprentice', name: '学徒途径', title: '穿行万门之人',
    desc: '探索流。穿墙、戏法、占星——冒险与探索的唯一真神；战斗与社交平庸。',
    tendency: '灵性↑↑ 心智↑ 体质— 魅力—',
    seqNames: ['学徒', '戏法大师', '占星人', '记录官', '旅行家', '秘法师', '漫游者', '旅法师', '星之匙', '门'],
    seq9Ability: '仪式魔法快速学习；每日一次短暂穿墙（绕过部分障碍）。',
    actingHint: '每日学习新知识；好奇心必须有行动；对未知保持记录。',
    seq9: { materials: ['treasure_eating_bug', 'phantom_crystal'], auxiliary: 'apprentice9_auxiliary' },
    seq8: { materials: ['parrot_tongue', 'mirror_mercury'], ritual: '完成一场无人识破的公开戏法后服食。' },
  },
];

/**
 * 序列9探索能力的权威配置。数值只供引擎结算，App 不得直接展示；
 * 占卜家复用现有目标化占卜，其余四途径在当前地点形成一次性准备。
 */
export const SEQUENCE9_EXPLORATION_ABILITIES: readonly Sequence9ExplorationAbilityDef[] = [
  {
    id: 'seer_divination', pathwayId: 'seer', mode: 'divination', label: '自行占卜',
    description: '可在安全环境中针对已知地点或持有物，自行进行纸牌与梦境占卜；象征不会替代实地调查。',
    hours: 0, energyCost: 0, commissionKinds: [], exploreEnergyRelief: 0, commissionBonus: 0,
    preparationText: '你把问题、媒介与已有线索分别摆好，准备自行占卜。',
  },
  {
    id: 'spectator_observation', pathwayId: 'spectator', mode: 'preparation', label: '静观现场',
    description: '暂不介入，只记录人群反应、行动次序与情绪变化，为同地点下一次调查做好准备。',
    hours: 1, energyCost: 5, commissionKinds: ['investigate', 'escort'], exploreEnergyRelief: 3, commissionBonus: 8,
    preparationText: '你退到不引人注意的位置，把现场的人群反应与行动次序默记下来。你没有据此断言任何人的真伪或秘密。',
  },
  {
    id: 'hunter_tracking', pathwayId: 'hunter', mode: 'preparation', label: '追踪痕迹',
    description: '辨认足迹、拖痕与退路，为同地点下一次调查或追捕做好准备。',
    hours: 1, energyCost: 6, commissionKinds: ['investigate', 'hunt'], exploreEnergyRelief: 5, commissionBonus: 8,
    preparationText: '你沿外围重新辨认足迹、拖痕与可用退路，只留下能够在现场复核的追踪标记。',
  },
  {
    id: 'sleepless_night_watch', pathwayId: 'sleepless', mode: 'preparation', label: '夜间守望',
    description: '利用夜视与清醒优势守住同一地点，为下一次夜间探索或委托做好准备。',
    hours: 1, energyCost: 4, nightOnly: true, commissionKinds: ['investigate', 'collect', 'hunt', 'escort'], exploreEnergyRelief: 4, commissionBonus: 8,
    preparationText: '你让视线适应夜色，逐一记下照明死角、巡行间隔与撤离方向；这些观察没有揭示此地的真实危险程度。',
  },
  {
    id: 'apprentice_passage_probe', pathwayId: 'apprentice', mode: 'preparation', label: '勘察通路',
    description: '检查门窗、缝隙与空间回声，为同地点下一次调查或采集寻找安全通路。',
    hours: 1, energyCost: 5, commissionKinds: ['investigate', 'collect'], exploreEnergyRelief: 4, commissionBonus: 8,
    preparationText: '你沿门窗、墙缝与转角检查空间回声，只规划当前地点内的安全通路，没有越过任何封锁或未知入口。',
  },
];

/** 序列9的遭遇战技。每场冲突每项只能使用一次，敌方精确数值不进入公开描述。 */
export const SEQUENCE9_COMBAT_SKILLS: readonly Sequence9CombatSkillDef[] = [
  {
    id: 'seer_danger_premonition', pathwayId: 'seer', label: '危险预感',
    description: '顺着突如其来的危险直觉提前错开一步，以灵性换取安全距离。',
    baseAction: 'guard', scoreBonus: 10, advantageBonus: 1, incomingReduction: 6, spiritCost: 5,
  },
  {
    id: 'spectator_read_intent', pathwayId: 'spectator', label: '读取意图',
    description: '观察重心、呼吸与视线，在对方真正行动前判断其下一步。',
    baseAction: 'guard', scoreBonus: 12, advantageBonus: 2, incomingReduction: 4, spiritCost: 4,
  },
  {
    id: 'hunter_vital_strike', pathwayId: 'hunter', label: '猎人猛击',
    description: '抓住已暴露的站位，以强化后的体魄完成一次干脆的近身猛击。',
    baseAction: 'physical', scoreBonus: 14, advantageBonus: 1, incomingReduction: 1, spiritCost: 0,
  },
  {
    id: 'sleepless_night_counter', pathwayId: 'sleepless', label: '夜间反击',
    description: '依靠黑暗中的清晰视野守住节奏；在夜间会更加有效。',
    baseAction: 'physical', scoreBonus: 6, nightScoreBonus: 10, advantageBonus: 1, incomingReduction: 3, spiritCost: 2,
  },
  {
    id: 'apprentice_phase_step', pathwayId: 'apprentice', label: '门径闪步',
    description: '借助对门窗与空间缝隙的感知突然换位，不把短暂穿行误作正面杀伤。',
    baseAction: 'guard', scoreBonus: 10, advantageBonus: 1, incomingReduction: 9, spiritCost: 6,
  },
];

export const ORGANIZATIONS = [
  { id: 'nightwatch', name: '黑夜教会值夜者', heldPathways: ['sleepless', 'seer'], contactNpc: 'evelyn', entry: '圣赛琳娜教堂', qualification: '接受教会背景审查与封锁线观察勤务', membership: '签署保密、夜间调遣与定期评估义务' },
  { id: 'secret_order', name: '密修会外围研究结社', heldPathways: ['seer'], contactNpc: 'nelson', entry: '由可信古书商代转外围研究者的引荐信', qualification: '完成来源核验与保密边界测试', membership: '接受外围结社的保密、研究记录与召回义务' },
  { id: 'psychology_alchemists', name: '心理炼金会外围研究会', heldPathways: ['spectator'], contactNpc: 'ella', entry: '由可信心理医生提交匿名病例观察记录', qualification: '完成观察伦理与保密测试', membership: '接受病例匿名、监督用药与定期评估义务' },
  { id: 'iron_and_blood', name: '铁血十字会外围互助会', heldPathways: ['hunter'], contactNpc: 'victor', entry: '先调查码头异常仓单，再由码头掮客辨认', qualification: '完成野外执行与保密边界测试', membership: '接受任务召集、战利品登记与互助担保义务' },
  { id: 'abraham_branch', name: '亚伯拉罕家族保护网', heldPathways: ['apprentice'], contactNpc: 'nelson', entry: '旧宅遗留物经古书商与家族外围担保人双重核验', qualification: '核对遗物来源、血缘风险与担保责任', membership: '签署家族保护与担保式契约；这不是对外招募的公开社团' },
] as const;

export const ORGANIZATION_LEAD_DEFS = [
  { id: 'nightwatch_clocktower', organizationId: 'nightwatch', source: '地方报纸与旧钟楼', publicLabel: '反复延期的市政维修记录', entryMode: 'public_records', locationId: 'old_tower', contactNpc: 'evelyn', minFavor: 0, place: '旧钟楼' },
  { id: 'secret_order_cipher', organizationId: 'secret_order', source: '旧书店账册里的星象暗记', publicLabel: '旧书商不愿公开解释的账册夹页', entryMode: 'npc_background', locationId: null, contactNpc: 'nelson', minFavor: 20, place: '老尼尔逊的古书店' },
  { id: 'psychology_case_notes', organizationId: 'psychology_alchemists', source: '艾拉诊所匿名病例索引', publicLabel: '一组需要谨慎处理的匿名观察记录', entryMode: 'npc_background', locationId: null, contactNpc: 'ella', minFavor: 20, place: '艾拉诊所' },
  { id: 'iron_blood_token', organizationId: 'iron_and_blood', source: '码头仓单背面的猎人徽记', publicLabel: '码头旧仓单背面的陌生徽记', entryMode: 'adventure', locationId: 'docks', contactNpc: 'victor', minFavor: 20, place: '东区码头' },
  { id: 'abraham_door_map', organizationId: 'abraham_branch', source: '废弃庄园门框夹层的空间图', publicLabel: '庄园门框夹层里的空间草图', entryMode: 'adventure', locationId: 'manor', contactNpc: 'nelson', minFavor: 20, place: '雾林废弃庄园' },
] as const;

export const ROSELLE_DIARY_PAGE_DEFS = [
  { id: 'diary_org_rules', title: '日记·隐秘组织制度', source: '教区旧报纸装订册', truth: 'authentic', clue: '组织会控制知识、审查候选并限定所掌握的途径；译读本身不能绕过审查。' },
  { id: 'diary_door_fragment', title: '日记·门与学徒残页', source: '废弃庄园书房暗格', truth: 'authentic', clue: '作者记录过一扇位置异常的门，但关键操作段缺失，只能作为亚伯拉罕线索。' },
  { id: 'diary_false_formula', title: '日记·材料替代札记', source: '黑市旧纸摊', truth: 'forged', clue: '字面声称一种材料可以替代多种主材；真假与可操作性都必须另行核验。' },
] as const;

const MATERIAL_SOURCE_BINDINGS: Record<string, { source: string; locationId: string }> = {
  octopus_blood: { source: '运河仓库的结社冷藏柜', locationId: 'canal' },
  star_crystal: { source: '东区码头的密封寄存箱', locationId: 'docks' },
  manhal_eye: { source: '东区码头的心理研究会样本箱', locationId: 'docks' },
  hornfish_blood: { source: '运河仓库的低温样本柜', locationId: 'canal' },
  blood_red_chestnut: { source: '雾林庄园外围的血红栗林', locationId: 'manor' },
  activated_marsh_crystal: { source: '霍纳奇斯山麓活化沼泽的结晶点', locationId: 'honakisu' },
  midnight_beauty_flower: { source: '拉斐尔墓园的午夜花圃', locationId: 'graveyard' },
  six_legged_owl_eye: { source: '旧钟楼封锁物证库', locationId: 'old_tower' },
  treasure_eating_bug: { source: '废弃庄园门后温室', locationId: 'manor' },
  phantom_crystal: { source: '旧钟楼背阴地窖', locationId: 'old_tower' },
};
export const MATERIAL_SOURCE_DEFS = [
  ...PATHWAYS.flatMap(pathway => pathway.seq9.materials.map(itemId => ({
  id: `${pathway.id}:${itemId}`,
  pathwayId: pathway.id,
  itemId,
  source: MATERIAL_SOURCE_BINDINGS[itemId].source,
  locationId: MATERIAL_SOURCE_BINDINGS[itemId].locationId,
  targetSequence: 9 as const,
  acquisitionMode: 'collect' as const,
}))),
  { id: 'seq8:seer:goat_horn', pathwayId: 'seer', itemId: 'goat_horn', source: '霍纳奇斯山麓的灰山羊活动区', locationId: 'honakisu', targetSequence: 8 as const, acquisitionMode: 'collect' as const },
  { id: 'seq8:seer:face_rose', pathwayId: 'seer', itemId: 'face_rose', source: '废弃庄园封闭花房', locationId: 'manor', targetSequence: 8 as const, acquisitionMode: 'collect' as const },
  { id: 'seq8:spectator:toad_brain', pathwayId: 'spectator', itemId: 'toad_brain', source: '运河仓库的诊所样本转运箱', locationId: 'canal', targetSequence: 8 as const, acquisitionMode: 'collect' as const },
  { id: 'seq8:spectator:lizard_scale', pathwayId: 'spectator', itemId: 'lizard_scale', source: '废弃庄园温室标本柜', locationId: 'manor', targetSequence: 8 as const, acquisitionMode: 'collect' as const },
  { id: 'seq8:hunter:ape_brain', pathwayId: 'hunter', itemId: 'ape_brain', source: '霍纳奇斯山麓猎场', locationId: 'honakisu', targetSequence: 8 as const, acquisitionMode: 'collect' as const },
  { id: 'seq8:hunter:scorpion_sting', pathwayId: 'hunter', itemId: 'scorpion_sting', source: '运河仓库危险品货柜', locationId: 'canal', targetSequence: 8 as const, acquisitionMode: 'collect' as const },
  { id: 'seq8:sleepless:nightingale_throat', pathwayId: 'sleepless', itemId: 'nightingale_throat', source: '拉斐尔墓园夜莺栖息地', locationId: 'graveyard', targetSequence: 8 as const, acquisitionMode: 'collect' as const },
  { id: 'seq8:sleepless:jellyfish_crystal', pathwayId: 'sleepless', itemId: 'jellyfish_crystal', source: '运河仓库的深水货柜', locationId: 'canal', targetSequence: 8 as const, acquisitionMode: 'collect' as const },
  { id: 'seq8:apprentice:parrot_tongue', pathwayId: 'apprentice', itemId: 'parrot_tongue', source: '运河仓库的异兽标本箱', locationId: 'canal', targetSequence: 8 as const, acquisitionMode: 'collect' as const },
  { id: 'seq8:apprentice:mirror_mercury', pathwayId: 'apprentice', itemId: 'mirror_mercury', source: '废弃庄园镜厅暗柜', locationId: 'manor', targetSequence: 8 as const, acquisitionMode: 'collect' as const },
];

export const SEQUENCE8_ACTING_DEFS = {
  seer: {
    principles: [{ id: 'observe', name: '先观察再解释' }, { id: 'restraint', name: '尊重命运边界' }, { id: 'warn', name: '给出警示而非答案' }],
    actions: [
      { id: 'seer_trace_canal', name: '复盘运河痕迹', principleId: 'observe', requirement: { kind: 'visited', id: 'canal' } },
      { id: 'seer_consult_nelson', name: '向尼尔逊验证边界', principleId: 'restraint', requirement: { kind: 'npc', id: 'nelson' } },
      { id: 'seer_night_warning', name: '在夜色中记录危险预兆', principleId: 'warn', requirement: { kind: 'night', id: 'night' } },
      { id: 'seer_overclaim', name: '把猜测宣称为必然', principleId: 'mistake', wrong: true, requirement: { kind: 'none', id: 'self' } },
    ],
  },
  spectator: {
    principles: [{ id: 'listen', name: '倾听而不抢夺叙事' }, { id: 'distance', name: '保持观察距离' }, { id: 'record', name: '记录可验证细节' }],
    actions: [
      { id: 'spectator_listen_ella', name: '旁听艾拉的交流方式', principleId: 'listen', requirement: { kind: 'npc', id: 'ella' } },
      { id: 'spectator_market_distance', name: '在市集观察而不介入', principleId: 'distance', requirement: { kind: 'visited', id: 'market' } },
      { id: 'spectator_theory_record', name: '用理论记录情绪变化', principleId: 'record', requirement: { kind: 'knowledge', id: 'occult_theory' } },
      { id: 'spectator_manipulate', name: '故意操纵熟人的情绪', principleId: 'mistake', wrong: true, requirement: { kind: 'none', id: 'self' } },
    ],
  },
  hunter: {
    principles: [{ id: 'track', name: '追踪必须留下证据链' }, { id: 'prepare', name: '先布置再出手' }, { id: 'value', name: '只追逐有价值的目标' }],
    actions: [
      { id: 'hunter_docks_track', name: '追踪码头搬运痕迹', principleId: 'track', requirement: { kind: 'visited', id: 'docks' } },
      { id: 'hunter_manor_prepare', name: '在庄园布置撤离路线', principleId: 'prepare', requirement: { kind: 'visited', id: 'manor' } },
      { id: 'hunter_honakisu_value', name: '筛选山麓真正猎物', principleId: 'value', requirement: { kind: 'visited', id: 'honakisu' } },
      { id: 'hunter_pointless_provoke', name: '无目的挑衅路人', principleId: 'mistake', wrong: true, requirement: { kind: 'none', id: 'self' } },
    ],
  },
  sleepless: {
    principles: [{ id: 'vigil', name: '在黑夜中保持清醒' }, { id: 'protect', name: '守护他人的安眠' }, { id: 'calm', name: '直面黑暗而不恐惧' }],
    actions: [
      { id: 'sleepless_night_vigil', name: '完成一次深夜守望', principleId: 'vigil', requirement: { kind: 'night', id: 'night' } },
      { id: 'sleepless_evelyn_protect', name: '向伊芙琳复盘守护职责', principleId: 'protect', requirement: { kind: 'npc', id: 'evelyn' } },
      { id: 'sleepless_graveyard_calm', name: '在墓园记录恐惧反应', principleId: 'calm', requirement: { kind: 'visited', id: 'graveyard' } },
      { id: 'sleepless_frighten', name: '借黑夜恐吓普通人', principleId: 'mistake', wrong: true, requirement: { kind: 'none', id: 'self' } },
    ],
  },
  apprentice: {
    principles: [{ id: 'learn', name: '每次探索都学习新结构' }, { id: 'record', name: '为未知留下可靠记录' }, { id: 'exit', name: '进入前先确认退路' }],
    actions: [
      { id: 'apprentice_manor_learn', name: '测绘庄园门框结构', principleId: 'learn', requirement: { kind: 'visited', id: 'manor' } },
      { id: 'apprentice_canal_record', name: '记录运河仓库通道', principleId: 'record', requirement: { kind: 'visited', id: 'canal' } },
      { id: 'apprentice_tower_exit', name: '规划旧钟楼撤离路线', principleId: 'exit', requirement: { kind: 'visited', id: 'old_tower' } },
      { id: 'apprentice_blind_door', name: '不记录就触碰未知门扉', principleId: 'mistake', wrong: true, requirement: { kind: 'none', id: 'self' } },
    ],
  },
} as const;

export const SEQUENCE8_RITUAL_DEFS = {
  seer: { windowHours: 4, steps: [{ id: 'audience', name: '在市集选定公开见证环境', requirement: { kind: 'visited', id: 'market' } }, { id: 'boundary', name: '请尼尔逊复核措辞边界', requirement: { kind: 'npc', id: 'nelson' } }, { id: 'perform', name: '在漠视中完成一次克制占卜', requirement: { kind: 'day', id: 'day' } }] },
  spectator: { windowHours: 3, steps: [{ id: 'mirror', name: '检查庄园镜厅', requirement: { kind: 'visited', id: 'manor' } }, { id: 'record', name: '写下自我观察记录', requirement: { kind: 'knowledge', id: 'occult_theory' } }, { id: 'alone', name: '夜间独自直视倒影', requirement: { kind: 'night', id: 'night' } }] },
  hunter: { windowHours: 2, steps: [{ id: 'ground', name: '确认码头冲突场地', requirement: { kind: 'visited', id: 'docks' } }, { id: 'escape', name: '在庄园演练撤离路线', requirement: { kind: 'visited', id: 'manor' } }, { id: 'anger', name: '夜间稳定驾驭怒火', requirement: { kind: 'night', id: 'night' } }] },
  sleepless: { windowHours: 6, steps: [{ id: 'poem', name: '写下安眠诗记录', requirement: { kind: 'knowledge', id: 'occult_theory' } }, { id: 'cemetery', name: '在墓园确认静夜环境', requirement: { kind: 'visited', id: 'graveyard' } }, { id: 'midnight', name: '于深夜完成吟诵', requirement: { kind: 'night', id: 'night' } }] },
  apprentice: { windowHours: 1, steps: [{ id: 'stage', name: '在市集选定公开戏法场地', requirement: { kind: 'visited', id: 'market' } }, { id: 'route', name: '记录运河仓库备用通道', requirement: { kind: 'visited', id: 'canal' } }, { id: 'trick', name: '白日完成无人识破的戏法', requirement: { kind: 'day', id: 'day' } }] },
} as const;

// ============ 物品 ============
export const ITEMS: ItemDef[] = [
  // 序列9 魔药材料
  { id: 'octopus_blood', name: '拉瓦章鱼血液', desc: '深蓝色的小瓶，晃一晃会泛起微光。', category: 'occult', surfaceName: '密封的深蓝样本', surfaceDesc: '没有成分标签的深蓝色小瓶，来源与性质仍待核验。', occultMarked: true, price: 48 },
  { id: 'star_crystal', name: '星水晶', desc: '对着光看，内部有星点缓缓移动。', category: 'occult', surfaceName: '带星点的晶体样本', surfaceDesc: '一枚密封晶体，内部似有反光，来源与性质仍待核验。', occultMarked: true, price: 55 },
  { id: 'manhal_eye', name: '曼哈尔鱼眼珠', desc: '一对浑圆的鱼眼，据说死后的曼哈尔鱼仍在观察世界。', category: 'occult', surfaceName: '防腐液中的眼状样本', surfaceDesc: '浸在防腐液里的圆形组织，标签只剩批次号。', occultMarked: true, price: 40 },
  { id: 'hornfish_blood', name: '羊角黑鱼血液', desc: '粘稠如墨，倒入水中会聚成羊角形状。', category: 'occult', surfaceName: '密封的黑色液体', surfaceDesc: '一瓶粘稠黑色液体，成分标签已经脱落。', occultMarked: true, price: 42 },
  { id: 'blood_red_chestnut', name: '血红栗', desc: '果壳呈暗红色，内部组织带有异常活性。', category: 'occult', surfaceName: '暗红色坚果样本', surfaceDesc: '一枚被蜡封的暗红色坚果，品种与来源未注明。', occultMarked: true, price: 45 },
  { id: 'activated_marsh_crystal', name: '活化沼泽结晶', desc: '从活化沼泽中析出的浑浊结晶，内部气泡会缓慢移动。', category: 'occult', surfaceName: '浑浊结晶样本', surfaceDesc: '一枚包在油纸中的浑浊结晶，内部似有细小气泡。', occultMarked: true, price: 42 },
  { id: 'midnight_beauty_flower', name: '午夜美人花', desc: '只在午夜完全绽放的深色花朵，香气极淡。', category: 'occult', surfaceName: '避光保存的深色花朵', surfaceDesc: '一朵被避光纸包严密封存的深色花朵。', occultMarked: true, price: 44 },
  { id: 'six_legged_owl_eye', name: '六足猫头鹰眼睛', desc: '封存在深色药液中的眼睛，瞳孔在暗处仍会收缩。', category: 'occult', surfaceName: '避光保存的眼状样本', surfaceDesc: '深色小瓶里封着一枚眼状组织，物种标签已脱落。', occultMarked: true, price: 46 },
  { id: 'treasure_eating_bug', name: '噬宝虫', desc: '甲壳边缘泛着金属光泽，触须会朝贵金属方向偏转。', category: 'occult', surfaceName: '金属光泽的甲虫标本', surfaceDesc: '一只封在树脂里的甲虫标本，甲壳略有金属光泽。', occultMarked: true, price: 46 },
  { id: 'phantom_crystal', name: '幻影水晶', desc: '转动时会留下短暂重影，边缘难以稳定聚焦。', category: 'occult', surfaceName: '带重影的透明晶体', surfaceDesc: '一枚透明晶体，转动时似乎会留下短暂重影。', occultMarked: true, price: 48 },
  // 序列9辅助材料包：两主材路线与完整特性替代路线都必须消耗一份。
  { id: 'seer9_auxiliary', name: '占卜家序列9辅助材料包', desc: '经担保分装的固定辅助材料，不含主材料。', category: 'occult', surfaceName: '编号辅助材料包', surfaceDesc: '多只封蜡小瓶组成的编号材料包，未注明用途。', occultMarked: true, seq9Product: { kind: 'auxiliary', pathwayId: 'seer' }, price: 48 },
  { id: 'spectator9_auxiliary', name: '观众序列9辅助材料包', desc: '经担保分装的固定辅助材料，不含主材料。', category: 'occult', surfaceName: '编号辅助材料包', surfaceDesc: '多只封蜡小瓶组成的编号材料包，未注明用途。', occultMarked: true, seq9Product: { kind: 'auxiliary', pathwayId: 'spectator' }, price: 48 },
  { id: 'hunter9_auxiliary', name: '猎人序列9辅助材料包', desc: '经担保分装的固定辅助材料，不含主材料。', category: 'occult', surfaceName: '编号辅助材料包', surfaceDesc: '多只封蜡小瓶组成的编号材料包，未注明用途。', occultMarked: true, seq9Product: { kind: 'auxiliary', pathwayId: 'hunter' }, price: 48 },
  { id: 'sleepless9_auxiliary', name: '不眠者序列9辅助材料包', desc: '经担保分装的固定辅助材料，不含主材料。', category: 'occult', surfaceName: '编号辅助材料包', surfaceDesc: '多只封蜡小瓶组成的编号材料包，未注明用途。', occultMarked: true, seq9Product: { kind: 'auxiliary', pathwayId: 'sleepless' }, price: 48 },
  { id: 'apprentice9_auxiliary', name: '学徒序列9辅助材料包', desc: '经担保分装的固定辅助材料，不含主材料。', category: 'occult', surfaceName: '编号辅助材料包', surfaceDesc: '多只封蜡小瓶组成的编号材料包，未注明用途。', occultMarked: true, seq9Product: { kind: 'auxiliary', pathwayId: 'apprentice' }, price: 48 },
  // 担保成品与死亡析出特性。成品只在交易会担保购买后可直接确认来源；掉落特性必须另行鉴定。
  ...PATHWAYS.flatMap(pathway => ([
    {
      id: `${pathway.id}9_potion`, name: `${pathway.seqNames[0]}魔药（序列9）`, desc: `经担保封签的${pathway.name}序列9成品魔药。`,
      category: 'occult' as const, surfaceName: '封签药剂瓶', surfaceDesc: '一只贴着批次封签的深色药剂瓶，未核验前看不出内容物。',
      occultMarked: true, seq9Product: { kind: 'potion' as const, pathwayId: pathway.id }, price: 420,
    },
    {
      id: `${pathway.id}9_characteristic`, name: `${pathway.seqNames[0]}非凡特性`, desc: `同途径序列9非凡者死亡后析出的完整特性，可替代该途径两件主材料，但仍需辅助材料调配。`,
      category: 'occult' as const, surfaceName: '凝结的异常残留', surfaceDesc: '一团被双层容器封住的半凝固残留，来源与性质尚未核验。', occultMarked: true,
      spiritVision: { result: `残留的灵性结构与${pathway.name}序列9层次一致；它可以整组替代两件主材料，但不能生吞，仍需对应辅助材料完成调配。`, sanityCost: 2, revealsOccult: true },
      divination: {
        title: '凝结的异常残留', difficulty: 38, pressure: 'high' as const,
        successText: {
          cards: `象征聚成“完整核心”后停在${pathway.name}的方向：它不是普通材料，也不适合直接入口；应先核验来源，再配合完整辅助材料处理。`,
          dream: `梦里那团残留试图贴近你的影子，随后被一道代表${pathway.name}的门槛拦下。答案只指向同途径调配与严格封存。`,
        },
      },
      seq9Product: { kind: 'characteristic' as const, pathwayId: pathway.id }, price: 360,
    },
  ] satisfies ItemDef[])),
  // 序列8 魔药材料
  { id: 'goat_horn', name: '灰山羊独角结晶', desc: '霍纳奇斯山脉灰山羊的独角结晶，散发着让人想发笑的气味。', category: 'occult', surfaceName: '角质结晶样本', surfaceDesc: '一小块角质结晶，被蜡封在无名纸盒中。', occultMarked: true, price: 96 },
  { id: 'face_rose', name: '人脸玫瑰', desc: '花瓣的纹路酷似一张扭曲的人脸。', category: 'occult', surfaceName: '压干的异形花朵', surfaceDesc: '压干花瓣的纹路有些古怪，但物种无法确认。', occultMarked: true, price: 84 },
  { id: 'toad_brain', name: '三目蟾蜍脑垂体', desc: '浸泡在防腐液中的灰白色小块。', category: 'occult', surfaceName: '灰白组织样本', surfaceDesc: '防腐液中漂着一小块灰白组织，标签缺失。', occultMarked: true, price: 90 },
  { id: 'lizard_scale', name: '心灵蜥蜴鳞粉', desc: '在光线下会随观察者情绪变色。', category: 'occult', surfaceName: '细碎鳞粉样本', surfaceDesc: '一管细碎鳞粉会随光线略微变色，来源不明。', occultMarked: true, price: 88 },
  { id: 'ape_brain', name: '暴怒猿猴脑髓液', desc: '瓶中的液体至今仍在愤怒地翻涌。', category: 'occult', surfaceName: '浑浊组织液样本', surfaceDesc: '小瓶中的浑浊组织液一直没有完全沉淀。', occultMarked: true, price: 92 },
  { id: 'scorpion_sting', name: '仇恨之蝎尾针', desc: '被它蛰到的人会死于自己的怒火。', category: 'occult', surfaceName: '封蜡的蝎尾针', surfaceDesc: '一枚用厚蜡封住的蝎尾针，采集记录已经遗失。', occultMarked: true, price: 86 },
  { id: 'nightingale_throat', name: '安魂夜莺歌喉', desc: '即使离体，午夜仍会发出无声的鸣唱。', category: 'occult', surfaceName: '封存的鸟类组织', surfaceDesc: '避光盒里封着一小块鸟类喉部组织。', occultMarked: true, price: 94 },
  { id: 'jellyfish_crystal', name: '沉眠水母伞盖结晶', desc: '握着它的人会做最深的梦。', category: 'occult', surfaceName: '半透明胶质结晶', surfaceDesc: '半透明结晶被装在软垫盒中，没有种类说明。', occultMarked: true, price: 82 },
  { id: 'parrot_tongue', name: '双簧鹦鹉舌骨', desc: '能同时说出两句互相矛盾的真话。', category: 'occult', surfaceName: '细小鸟类舌骨', surfaceDesc: '两枚相连的细小鸟类舌骨，来源标签已被撕去。', occultMarked: true, price: 88 },
  { id: 'mirror_mercury', name: '镜面水银', desc: '水银表面映出的不是你的脸。', category: 'occult', surfaceName: '密封的银色液体', surfaceDesc: '双层玻璃瓶里封着少量银色液体，不能直接开启。', occultMarked: true, price: 90 },
  // 普通物品
  {
    id: 'antigonus_notebook', name: '异常黑色笔记',
    desc: '一本内容会在复核间发生变化的黑色硬封皮旧笔记。现有记录只能确认它会主动影响接触者，真实来源仍未查明。',
    category: 'occult', surfaceName: '奇怪的旧笔记',
    surfaceDesc: '一本深黑色硬质封皮的旧笔记。纸页带着古老气息，你不记得自己何时把它放在桌上。', occultMarked: true,
    spiritVision: {
      result: '灵视刚触及纸页，书中的灵性便像合拢的眼睛般收紧。它不是普通古籍，却也拒绝显露来源；继续独自接触并不安全。',
      sanityCost: 5, corruptionCost: 2, revealsOccult: true,
    },
    divination: {
      title: '奇怪的旧笔记', difficulty: 56, pressure: 'high', antiDivination: true,
      clueId: 'strange_notebook_direction_omen',
      successText: {
        cards: '所有象征都避开书名，只在桌面上形成一道不断偏转的箭头：它不像被动等待阅读的书，某种去向正在借你的手成形。',
        dream: '梦里，你抱着黑色笔记走过一段醒来后完全不记得的街道。远处有人等着，但每当你试图看清，那个人便退入更深的雾。',
      },
    }, price: 0,
  },
  {
    id: 'anomaly_evidence', name: '染着冷灰的铜质铭牌', desc: '从旧钟楼附近异常现场带回的证物。触感冰冷，边缘刻着被人为刮去的教会编号。',
    category: 'occult', surfaceName: '染着冷灰的旧铜牌', surfaceDesc: '一枚染着冷灰的旧铜牌，边缘有被刮擦过的痕迹。', occultMarked: true,
    spiritVision: { result: '灵视中，铜牌边缘残留着极淡的黑夜气息；被刮去的位置曾属于一套教会编号。残留已经衰弱，但不宜随意丢弃。', sanityCost: 1, revealsOccult: true },
    divination: {
      title: '染着冷灰的旧铜牌', difficulty: 34, pressure: 'low',
      successText: {
        cards: '指示牌落在“门槛”与“守夜”之间：这件东西曾属于一套有编号、有接管人的正式处置流程。',
        dream: '梦里，铜牌被一只戴黑手套的手放回编号柜；醒来后你记住了“交给守夜的人”，却看不清那张脸。',
      },
    }, price: 0,
  },
  {
    id: 'cryptic_note', name: '看不懂的手抄纸', desc: '来源不明的密文残页，字迹仿佛在缓慢蠕动。独自学习无法验证，需要可信机构或导师鉴定。',
    category: 'occult', surfaceName: '泛黄的手抄纸', surfaceDesc: '一张泛黄的手抄纸，字迹杂乱，来源无法确认。', occultMarked: true,
    spiritVision: { result: '灵视刚触及纸面，字迹背后便浮出一层朝观察者转动的暗影。它像是在反过来辨认你；不要独自朗读，也不要长时间注视。', sanityCost: 4, corruptionCost: 1, revealsOccult: true },
    divination: {
      title: '泛黄的手抄残页', difficulty: 38, pressure: 'high', antiDivination: true, clueId: 'cryptic_note_warning',
      clueBonuses: { cryptic_note_warning: 6 },
      successText: {
        cards: '象征没有解释文字，只显示一只从纸背回望的眼睛：不要独自朗读，也不要把它当成配方。',
        dream: '梦中的纸页自行翻到背面，一只没有眼睑的眼睛正等待你读出第一句。你在开口前惊醒，只留下“必须交叉鉴定”的警告。',
      },
    }, price: 0,
  },
  {
    id: 'symbol_cards', name: '固定象征纸牌', desc: '按固定象征整理过的一副旧纸牌，只适合安全、浅层的民间占卜。',
    category: 'tool', surfaceDesc: '一副边角磨损、画着重复象征的旧纸牌。',
    spiritVision: { result: '牌面没有非凡残留；真正起作用的是固定象征、受训者的灵性与严格的收牌边界。它是媒介，不是力量来源。', revealsOccult: false },
    divination: {
      title: '固定象征纸牌', difficulty: 26, pressure: 'low',
      successText: {
        cards: '所有牌最终指回摆牌者的手：这副牌只负责固定象征，答案来自方法、问题与已有信息，而不是纸牌本身。',
        dream: '梦里的纸牌围成闭环，环外一片空白。它提醒你：可靠的媒介首先应当守住边界。',
      },
    }, price: 0,
  },
  { id: 'ritual_chalk', name: '普通仪式粉笔', desc: '能在地板上留下清晰边界的普通粉笔，不含非凡力量。', category: 'tool', price: 6 },
  { id: 'medical_dressing', name: '消毒绷带与敷料', desc: '药房封好的普通医疗用品，可用于处理不严重的外伤。', category: 'tool', price: 10 },
  { id: 'plain_disguise_kit', name: '普通伪装用品', desc: '廉价染发粉、旧眼镜、领巾与衣物配件。只能改变普通目击者的描述，不能消除正式身份记录。', category: 'tool', price: 24 },
  { id: 'plain_pendulum', name: '普通练习灵摆', desc: '一枚系在细绳上的普通金属坠，只是稳定手势与问题边界的媒介。', category: 'tool', price: 8 },
  { id: 'blank_charm_paper', name: '空白符咒练习纸', desc: '按固定尺寸裁好的普通纸张，只用于结构练习，本身没有任何效果。', category: 'tool', price: 3 },
  {
    id: 'dock_scale_evidence', name: '带有异常残留的硬质薄片', desc: '从码头货箱附近取得的证物。表面残留与周围环境不协调，但仅凭它无法判断来源。',
    category: 'occult', surfaceName: '沾水的硬质薄片', surfaceDesc: '一枚指甲盖大小的灰黑薄片，边缘磨损，表面沾着码头污水。仅凭外观看不出来自何物。', occultMarked: true,
    spiritVision: {
      result: '灵视中，薄片上的微弱残留像被潮水拖向旧仓区深处；它只能说明接触过异常环境，无法据此辨认来源。继续处理前应核对货运路径并避免徒手久持。',
      sanityCost: 2, revealsOccult: true,
    },
    divination: {
      title: '沾水的硬质薄片', difficulty: 35, pressure: 'low', clueId: 'dock_scale_transfer_omen',
      successText: {
        cards: '牌面停在“货箱”“断裂的绳结”与“退路”之间：线索指向旧仓区的转运过程，而不是薄片本身的名称。先查货运备份，再决定是否靠近。',
        dream: '梦里，薄片沿积水逆流滑回一排看不清编号的旧仓门。你醒来时记住的是方向与撤离路线，仍无法看清留下它的东西。',
      },
    }, price: 0,
  },
  {
    id: 'tarred_cargo_seal', name: '沾焦油的货箱铅封',
    desc: '从旧装卸区遗留封箱上取下的铅封片。焦油里混着煤灰，压印被重复覆盖。',
    category: 'misc', price: 0,
    spiritVision: {
      result: '铅封上没有稳定的非凡残留，只有几次短促接触留下的杂乱灵性痕迹。它更像被反复用于不同货箱的普通伪装物。',
      sanityCost: 1, revealsOccult: false,
    },
    divination: {
      title: '沾焦油的货箱铅封', difficulty: 38, pressure: 'low', clueId: 'dock_tar_seal_coal_omen',
      clueBonuses: { dock_crate_tar_seal: 6, dock_old_yard_night_transfer: 4 },
      successText: {
        cards: '“煤尘”“河湾”和“低矮门洞”的象征反复相邻。它们指向一个处理封箱的地点，却没有给出任何人的身份。',
        dream: '梦里，铅封在煤灰中滚过一段临河斜坡，最后停在一扇低矮后门外。门内没有人影，只有卸煤声。',
      },
    },
  },
  { id: 'whiskey', name: '黑麦威士忌', desc: '南区蒸馏所出品，劣等但够劲。送礼佳品。', category: 'misc', price: 12 },
  { id: 'occult_notes', name: '神秘学札记', desc: '老尼尔逊的手抄本，记录着仪式魔法的入门知识。', category: 'misc', price: 60 },
  { id: 'reinforced_cane', name: '包铁手杖', desc: '外表体面，杖芯和握柄经过加固，适合格挡与近身自卫。', category: 'tool', combat: { slot: 'weapon', profileBonus: { physicalAttack: 5, physicalDefense: 2 } }, price: 36 },
  { id: 'hunting_knife', name: '猎刀', desc: '短而结实的野外刀具。携带它会显得可疑，但近身时远胜徒手。', category: 'tool', combat: { slot: 'weapon', profileBonus: { physicalAttack: 9, critical: 4 } }, price: 54 },
  { id: 'leather_coat', name: '加厚皮外套', desc: '夹层经过补强，能减轻擦伤和不致命的钝击。', category: 'tool', combat: { slot: 'armor', profileBonus: { physicalDefense: 6 } }, price: 72 },
  { id: 'silver_focus_mirror', name: '银质仪式小镜', desc: '受训者可用它稳定自身灵性边界；未经训练时只是一面昂贵的小镜子。', category: 'tool', combat: { slot: 'focus', profileBonus: { spiritualDefense: 5, spiritualAttack: 2 } }, price: 66 },
  { id: 'flash_powder', name: '镁光粉包', desc: '一次性的强光粉包，使用不当也会伤到自己。', category: 'tool', combat: { slot: 'consumable', technique: { label: '扬起镁光粉', description: '制造一瞬强光，迫使对方停下逼近并暴露站位。', baseAction: 'guard', scoreBonus: 8, advantageBonus: 1, incomingReduction: 7, spiritCost: 0, consume: true } }, price: 18 },
  { id: 'warding_sachet', name: '边界草药香囊', desc: '按教会民俗配方缝制的草药香囊，只能短暂帮助集中精神，不是封印物。', category: 'tool', combat: { slot: 'consumable', technique: { label: '捏碎边界香囊', description: '借强烈气味与固定祷词稳定感知，减轻一轮精神侵扰。', baseAction: 'guard', scoreBonus: 5, advantageBonus: 0, incomingReduction: 9, spiritCost: 0, consume: true } }, price: 20 },
  { id: 'revolver_ammo', name: '左轮弹药', desc: '与随身左轮口径匹配的普通弹药。每次开火消耗一发。', category: 'tool', price: 4 },
  { id: 'revolver', name: '左轮手枪', desc: '六发。对非凡者意义有限，对劫匪意义重大。', category: 'tool', combat: { slot: 'weapon', profileBonus: { physicalAttack: 18, critical: 4 } }, price: 150 },
];

export const INVENTORY_CATEGORY_LABELS = {
  tool: '工具', book: '书籍', misc: '杂物', occult: '超凡物品',
} as const;

/** 通用秘密交易会的序列9固定目录；不包含任何序列8商品。 */
export const TRADE_FAIR_PRODUCTS: readonly TradeFairProductDef[] = PATHWAYS.flatMap(pathway => {
  const materialProducts: TradeFairProductDef[] = pathway.seq9.materials.map(itemId => ({
    id: `trade:${pathway.id}:material:${itemId}`, pathwayId: pathway.id, sequence: 9, kind: 'material',
    itemId, price: ITEMS.find(item => item.id === itemId)?.price ?? 60, initialStock: 2,
  }));
  return [
    { id: `trade:${pathway.id}:formula`, pathwayId: pathway.id, sequence: 9, kind: 'formula', formulaId: `${pathway.id}9`, price: 180, initialStock: 1 },
    { id: `trade:${pathway.id}:potion`, pathwayId: pathway.id, sequence: 9, kind: 'potion', itemId: `${pathway.id}9_potion`, price: 420, initialStock: 1 },
    ...materialProducts,
    { id: `trade:${pathway.id}:auxiliary`, pathwayId: pathway.id, sequence: 9, kind: 'auxiliary', itemId: pathway.seq9.auxiliary, price: 48, initialStock: 2 },
    { id: `trade:${pathway.id}:characteristic`, pathwayId: pathway.id, sequence: 9, kind: 'characteristic', itemId: `${pathway.id}9_characteristic`, price: 360, initialStock: 1 },
  ] satisfies TradeFairProductDef[];
});

/** 只有这些固定事件中明确确认死亡的非凡者，才允许析出一次特性。 */
export const BEYONDER_DEATH_SOURCES: readonly BeyonderDeathSourceDef[] = [
  {
    id: 'fallen_seer_smuggler', npcId: 'masked_fortune_smuggler', publicIdentity: '蒙面占卜货商',
    pathwayId: 'seer', sequence: 9, characteristicItemId: 'seer9_characteristic',
    eventId: 'adv_confirmed_beyonder_death', huntTargetId: 'masked_fortune_smuggler',
  },
];

export const HUNT_TARGET_DEFS: readonly HuntTargetDef[] = [
  {
    id: 'masked_fortune_smuggler', npcId: 'masked_fortune_smuggler', locationId: 'black_market',
    publicLabel: '蒙面占卜货商', pathwayId: 'seer', sequence: 9,
    deathSourceId: 'fallen_seer_smuggler', characteristicItemId: 'seer9_characteristic', power: 58,
    avenger: {
      name: '「灰手套」莱辛', archetype: '复仇者',
      motive: '那名蒙面货商曾替他挡过一次秘密组织的清算；货商失踪后，他沿着残留的交易记录找到了你。',
      power: 52, hostility: 58, known: false, alive: true,
    },
  },
];

// ============ 魔药配方 ============
export const FORMULA_PRICE_NELSON = 180; // 老尼尔逊的价：15苏勒
export const FORMULA_PRICE_BLACK = 264;  // 黑市价：1镑2苏勒，更贵但不需要人情
export function formulaName(fid: string): string {
  const pw = PATHWAYS.find(p => fid.startsWith(p.id));
  if (!pw) return fid;
  const seq = fid.endsWith('8') ? 8 : 9;
  return `${pw.name}·序列${seq}「${pw.seqNames[9 - seq]}」配方`;
}

// ============ NPC ============
export const NPCS: NPCDef[] = [
  {
    id: 'old_neil', name: '老尼尔', identity: '黑荆棘安保公司资深文职人员', secret: undefined,
    desc: '说话絮叨却严格遵守安全边界；他只在正式值夜者课程中教授可复核的占卜家技巧。',
    schedule: [{ from: 9, to: 17, location: '黑荆棘安保公司', interactable: true, days: [1, 2, 3, 4, 5, 6] }],
  },
  {
    id: 'vickroyer', name: '维克罗尔先生', identity: '前来委托寻子的商人', secret: undefined,
    desc: '衣着体面却难掩焦虑；他带来了签名委托书和儿子艾略特穿过的旧外套。',
    schedule: [{ from: 9, to: 17, location: '黑荆棘安保公司', interactable: true }],
  },
  {
    id: 'leonard', name: '伦纳德', identity: '黑荆棘安保公司外勤队员', secret: undefined,
    desc: '负责与新人一同行动的年轻队员，接案时会明确撤退口令和支援边界。',
    schedule: [{ from: 9, to: 22, location: '黑荆棘安保公司', interactable: true }],
  },
  {
    id: 'masked_fortune_smuggler', name: '蒙面占卜货商', identity: '只在秘密交易会出现的旧货商',
    secret: '真实身份与力量来源尚待调查',
    desc: '他出售旧纸牌、护符匣和来历含糊的占卜用品，从不在同一盏灯下停留太久。',
    category: 'special',
    schedule: [{ from: 22, to: 26, location: '黑市后巷', interactable: true, days: [3, 6] }],
  },
  {
    id: 'victor', name: '「灰鼠」维克多', identity: '东区码头记账员', secret: '黑市非凡材料掮客',
    desc: '语速很快，先谈价再谈事。据说没有他搞不到的东西，只有他不敢碰的东西。',
    schedule: [
      { from: 9, to: 17, location: '码头账房', interactable: true, days: [1, 2, 3, 4, 5, 6] },
      { from: 18, to: 19, location: '「醉水手」酒馆', interactable: true },
      { from: 22, to: 26, location: '黑市后巷', interactable: true, days: [3, 6] }, // 周三、周六半夜开黑市
    ],
  },
  {
    id: 'martha', name: '玛尔塔婶婶', identity: '你的房东', secret: undefined,
    desc: '寡居的房东太太，嘴硬心软。房租一天不能晚，但汤也总是多给你盛一勺。',
    schedule: [
      { from: 7, to: 11, location: '公寓门厅', interactable: true },
      { from: 17, to: 21, location: '公寓门厅', interactable: true },
    ],
  },
  {
    id: 'nelson', name: '老尼尔逊', identity: '旧书店老板', secret: '退休的野生非凡者（序列8）',
    desc: '驼背、独眼、满嘴谜语。书店后间卖的不是书，是「知识」。',
    schedule: [{ from: 10, to: 20, location: '「斑纹」旧书店', interactable: true, days: [1, 2, 3, 4, 5, 6] }], // 周日闭店
  },
  {
    id: 'evelyn', name: '「夜莺」伊芙琳', identity: '圣赛琳娜教堂执事', secret: '值夜者成员（序列7）',
    desc: '黑夜教会的超凡执法者。对野生非凡者而言，她是保护伞，也是铡刀。',
    schedule: [{ from: 9, to: 18, location: '圣赛琳娜教堂', interactable: true }],
  },
  {
    id: 'ella', name: '艾拉医生', identity: '北区诊所心理医生', secret: '观众途径序列8',
    desc: '温和的灰眼女士。她的诊金不便宜，但疯过的人都说值。',
    schedule: [{ from: 9, to: 17, location: '北区诊所', interactable: true, days: [1, 2, 3, 4, 5, 6] }], // 周日休诊
  },
  {
    id: 'brandon', name: '「血手套」布兰登', identity: '码头帮打手', secret: '罪犯途径序列9',
    desc: '放贷、收债、打断腿，一条龙。欠他的钱，利息比他的耐心长得快。',
    schedule: [{ from: 19, to: 26, location: '「醉水手」酒馆', interactable: true }],
  },
  {
    id: 'mike', name: '「胖子」麦克', identity: '「醉水手」酒馆老板', secret: '几方势力的情报中转站',
    desc: '脸上的横肉笑起来像和风细雨。谁的闲事他都知道一点，谁的闲事他都假装不知道。',
    schedule: [{ from: 16, to: 26, location: '「醉水手」酒馆', interactable: true }],
  },
];

// ============ 情报/知识词条 ============
export const INTEL_NAMES: Record<string, string> = {
  dock_missing: '码头失踪案传闻',
  patrol_route: '值夜者巡逻路线',
  black_market: '黑市的开门暗号',
  victor_debt: '维克多欠血手套40镑',
  church_audit: '教会季度审查临近',
  trade_fair_invitation: '秘密交易会担保邀请与日程',
};
export const KNOWLEDGE_NAMES: Record<string, string> = {
  archive_method: '市政档案检索法',
  cargo_notation: '港务编号与仓单抄写法',
  church_liturgy: '教会礼仪与档案常识',
  tingen_public_records: '廷根公共记录索引常识',
  tingen_history_lecture: '廷根地方史公开讲座笔记',
  public_divination_etiquette: '民间占卜礼仪常识',
  occult_theory: '神秘学理论常识',
  spirit_vision_theory: '灵视概念（仅理论）',
  ritual_basic: '仪式魔法基础',
  spirit_vision: '灵视入门',
  potion_brew: '魔药调配要诀',
};

// ============ 技能 ============
export const SKILL_NAMES: Record<string, string> = {
  investigate: '侦查',
  combat: '格斗',
  speech: '话术',
  occult: '神秘学',
  sneak: '潜行',
};

// ============ 冒险地点（按小说世界观分区） ============
export const LOCATION_REGIONS = ['城区', '城郊', '远方'];
export const LOCATIONS: LocationDef[] = [
  // —— 城区：雾城之内，当日往返 ——
  { id: 'market', name: '铁十字街（街市段）', region: '城区', desc: '全城最热闹的露天街市。公共告示、城区地图和日常货摊都集中在这里。', hours: 1, danger: 8, public: true, actions: ['explore', 'wander', 'shop'] },
  { id: 'north_clinic', name: '北区诊所', region: '城区', desc: '面向普通市民营业的社区诊所，提供外伤清创、包扎与转诊。艾拉医生也在这里接诊。', hours: 2, danger: 5, public: true, actions: [] },
  { id: 'tavern', name: '「醉水手」酒馆', region: '城区', desc: '码头工、跑腿人和消息贩子常去的酒馆。老板麦克记得每一张常客的脸。', hours: 2, danger: 10, public: true, actions: ['tavern'] },
  { id: 'st_selena_church', name: '圣赛琳娜教堂', region: '城区', desc: '红月亮街上的黑夜女神教堂，面向市民提供礼拜、慈善与救济公告。', hours: 2, danger: 8, actions: ['explore'] },
  { id: 'river_sea_church', name: '河与海教堂', region: '城区', desc: '位于廷根北部的风暴之主教堂，来往河运人员常在公开告示栏寻找航运消息。', hours: 2, danger: 8, actions: ['explore'] },
  { id: 'divination_club', name: '占卜俱乐部', region: '城区', desc: '北区豪尔斯街13号二楼的民间俱乐部，提供会员咨询与普通占卜礼仪交流。', hours: 2, danger: 9, actions: ['explore'] },
  { id: 'blackthorn_security', name: '黑荆棘安保公司', region: '城区', desc: '佐特兰街36号二楼，一家承接护卫、寻人与风险说明的安保公司。', hours: 2, danger: 10, actions: ['explore'] },
  { id: 'forston_hideout', name: '弗尔斯顿路旧宅', region: '城区', desc: '一栋门窗紧闭的普通旧宅；只有掌握确切门牌后才能从相似房屋中认出它。', hours: 2, danger: 24, actions: ['explore'] },
  { id: 'hoy_university', name: '霍伊大学', region: '城区', desc: '廷根的高等学府，校内不时公布面向市民的历史讲座与馆藏目录。', hours: 2, danger: 7, actions: ['explore'] },
  { id: 'dewill_library', name: '德维尔图书馆', region: '城区', desc: '收藏地方报刊与通俗读物的公共图书馆，阅览架按日期整理。', hours: 2, danger: 7, actions: ['explore'] },
  { id: 'municipal_library', name: '市政图书馆', region: '城区', desc: '面向公众开放的市政图书馆，可查询城市目录、旧报索引和常用办事手册。', hours: 2, danger: 7, actions: ['explore'] },
  { id: 'hound_tavern', name: '猎犬酒馆', region: '城区', desc: '一间客人来去频繁的普通酒馆，常有人在这里谈论工作、球赛与城区新闻。', hours: 2, danger: 11, actions: ['explore'] },
  { id: 'dragon_bar', name: '恶龙酒吧', region: '城区', desc: '灯光昏暗、设有拳台的热闹酒吧，公开区域以酒水和比赛招徕客人。', hours: 2, danger: 14, actions: ['explore'] },
  { id: 'docks', name: '东区码头', region: '城区', desc: '货箱、缆绳与雾气挤在河岸边，搬运工和账房人员按班次维持着繁忙秩序。', hours: 2, danger: 20, actions: ['explore', 'salvage'] },
  { id: 'canal', name: '运河仓库', region: '城区', desc: '成排的货仓，锁着的门比开着的多。走私者的中转站。', hours: 2, danger: 25, actions: ['explore', 'salvage'] },
  { id: 'old_loading_yard', name: '运河下游旧装卸区', region: '城区', desc: '几座停用货棚靠着下游河湾，公共货运图只画到外侧围栏。', hours: 2, danger: 32, actions: ['explore'] },
  { id: 'riverside_coal_yard', name: '河湾煤栈', region: '城区', desc: '临河堆着成排煤包，白天有普通运煤车进出；后侧矮门不在公开货场图上。', hours: 2, danger: 36, actions: ['explore'] },
  { id: 'black_market', name: '黑市后巷', region: '城区', desc: '只在深夜张开的灰色集市。规矩：不问来路，不问去处。', hours: 2, danger: 30, nightOnly: true, actions: ['explore', 'shop'] },
  // —— 城郊：出城半日，雾野与废墟 ——
  { id: 'st_number_church', name: '圣数教堂', region: '城郊', desc: '位于城郊的蒸汽与机械之神教堂，公开栏会张贴机械事故、修理与工匠互助信息。', hours: 3, danger: 8, actions: ['explore'] },
  { id: 'graveyard', name: '拉斐尔墓园', region: '城郊', desc: '新坟旧冢层层叠叠。夜里的抓挠声，守墓人已经习惯了。', hours: 3, danger: 40, actions: ['explore', 'salvage'] },
  { id: 'sewer', name: '下水道', region: '城郊', desc: '城市的肠腹。黑暗、污水，和比狗大的东西。', hours: 3, danger: 45, actions: ['explore', 'salvage'] },
  { id: 'factory', name: '废弃印刷厂', region: '城郊', desc: '停产三年的厂房。据说午夜还能听见机器运转的声音。', hours: 3, danger: 55, actions: ['explore', 'salvage'] },
  { id: 'old_tower', name: '旧钟楼', region: '城郊', desc: '停摆多年、迟迟没有维修的旧建筑。报纸偶尔刊登附近居民对夜间噪声的投诉。', hours: 4, danger: 70, actions: ['explore'] },
  { id: 'manor', name: '雾林废弃庄园', region: '城郊', desc: '三十年前主人一家暴毙后无人敢住的宅邸。有夜行人说，听过里面传出钢琴声。', hours: 4, danger: 60, actions: ['explore', 'salvage'] },
  // —— 远方：要花上一整天的路程，去之前掂量一下自己 ——
  { id: 'ramd', name: '拉姆德废镇', region: '远方', desc: '一夜之间全镇消失的小镇，官方口径是「瘟疫」。去过的人回来都病了——病在梦里。', hours: 6, danger: 80, actions: ['explore'] },
  { id: 'honakisu', name: '霍纳奇斯山麓', region: '远方', desc: '主峰终年埋在云里，传说山顶有「夜之国度」的遗迹。采药人只在山麓活动，更深处的路标会自己挪动。', hours: 8, danger: 90, actions: ['explore'] },
];

export const TINGEN_LANDMARK_ACTIONS: readonly TingenLandmarkActionDef[] = [
  {
    id: 'market_city_directory', locationId: 'market', label: '查看城市公共告示与地图',
    description: '核对公开街区图、公共机构名录与告示栏。', hours: 1, energyCost: 3, openFrom: 7, openTo: 20,
    completion: { kind: 'clue', id: 'tingen_city_directory' }, effects: [{ k: 'clue', id: 'tingen_city_directory' }],
    result: '你抄下几处公开机构的名称与方位，并把来源记为铁十字街公共告示。',
  },
  {
    id: 'st_selena_public_notices', locationId: 'st_selena_church', label: '查看慈善与教会公告',
    description: '只查阅面向普通市民开放的礼拜、救济与教区服务信息。', hours: 1, energyCost: 3, openFrom: 8, openTo: 18,
    completion: { kind: 'clue', id: 'tingen_church_directory' }, effects: [{ k: 'clue', id: 'tingen_church_directory' }],
    result: '你从公开公告中整理出另外两处教堂的名称与大致方位，没有接触任何内部事务。',
  },
  {
    id: 'dewill_public_periodicals', locationId: 'dewill_library', label: '查阅公共报刊',
    description: '翻查《廷根市诚实报》的城市版与公共场所栏目。', hours: 1, energyCost: 4, openFrom: 9, openTo: 18,
    completion: { kind: 'clue', id: 'tingen_honest_paper' }, effects: [{ k: 'clue', id: 'tingen_honest_paper' }],
    result: '你从报刊索引中抄下大学、俱乐部与两间酒馆的公开地址，内容仅限城市生活信息。',
  },
  {
    id: 'municipal_old_news_index', locationId: 'municipal_library', label: '查询城市目录与旧报索引',
    description: '学习公共目录、索引卡和旧报合订本的查找方式。', hours: 1, energyCost: 4, openFrom: 9, openTo: 18,
    completion: { kind: 'knowledge', id: 'tingen_public_records' }, effects: [{ k: 'knowledge', id: 'tingen_public_records' }],
    result: '你记下了市政图书馆的目录规则，今后能更稳妥地定位公开记录。',
  },
  {
    id: 'hoy_public_history_lecture', locationId: 'hoy_university', label: '查看历史系公开讲座',
    description: '阅读校方公开张贴的地方史讲座目录。', hours: 1, energyCost: 3, openFrom: 9, openTo: 17,
    completion: { kind: 'knowledge', id: 'tingen_history_lecture' }, effects: [{ k: 'knowledge', id: 'tingen_history_lecture' }],
    introductions: [{ encounterId: 'hoy_azik', introducerId: 'quentin_cohen', introducerName: '昆汀·科恩教授' }],
    result: '你旁听了一段廷根地方史导论，只留下可核验的公开讲座笔记。',
  },
  {
    id: 'divination_club_etiquette', locationId: 'divination_club', label: '咨询会员制度与普通占卜礼仪',
    description: '了解民间俱乐部的预约、记录与礼仪边界，不涉及能力训练。', hours: 1, energyCost: 3, openFrom: 10, openTo: 20,
    completion: { kind: 'knowledge', id: 'public_divination_etiquette' }, effects: [{ k: 'knowledge', id: 'public_divination_etiquette' }],
    introductions: [{ encounterId: 'club_hanass', introducerId: 'club_receptionist', introducerName: '俱乐部接待员' }],
    result: '接待员说明了会员规则和普通礼仪。你得到的只是公开礼仪常识，不构成任何特殊能力或正式训练。',
  },
  {
    id: 'hound_public_visit', locationId: 'hound_tavern', label: '在酒馆听普通见闻',
    description: '听客人谈论工作、球赛与城区日常。', hours: 1, energyCost: 3, openFrom: 16, openTo: 26,
    completion: { kind: 'flag', id: 'hound_tavern_visit' }, effects: [{ k: 'flag', id: 'hound_tavern_visit', v: 1 }],
    result: '你坐了一会儿，只记下几条关于工作、球赛和物价的普通城市见闻。',
  },
  {
    id: 'hound_leave_security_message', locationId: 'hound_tavern', label: '给安保联络人留口信',
    description: '只说明自己亲历的异常或持有的可疑证物，请求正规风险咨询。', hours: 1, energyCost: 4, openFrom: 16, openTo: 26, requirement: 'abnormal_witness',
    completion: { kind: 'clue', id: 'blackthorn_referral' }, effects: [{ k: 'clue', id: 'blackthorn_referral' }],
    result: '酒保收下了写明事实边界的口信，稍后交给你一张安保公司前台转介回条。',
  },
  {
    id: 'blackthorn_public_report', locationId: 'blackthorn_security', label: '递交异常情况说明',
    description: '向前台递交时间、地点与证物清单，只索取公开受理回执。', hours: 1, energyCost: 4, openFrom: 9, openTo: 17,
    completion: { kind: 'flag', id: 'blackthorn_public_receipt' }, effects: [{ k: 'flag', id: 'blackthorn_public_receipt', v: 1 }],
    introductions: [{ encounterId: 'blackthorn_dunn', introducerId: 'blackthorn_roxanne', introducerName: '前台职员罗珊' }],
    result: '前台收下说明，给了你一张普通受理回执，并请你回去等待书面答复。',
  },
  {
    id: 'dragon_watch_boxing', locationId: 'dragon_bar', label: '观看公开拳台',
    description: '只在公开区域观看比赛和酒客往来。', hours: 1, energyCost: 4, openFrom: 16, openTo: 26,
    completion: { kind: 'flag', id: 'dragon_boxing_observed' }, effects: [{ k: 'flag', id: 'dragon_boxing_observed', v: 1 }],
    introductions: [{ encounterId: 'dragon_swain', introducerId: 'dragon_bar_regular', introducerName: '看台熟客' }],
    result: '你看完一场拳赛便离开，只记住了公开赛程、酒水牌和几位拳手的名字。',
  },
  {
    id: 'river_sea_shipping_notices', locationId: 'river_sea_church', label: '查看失踪船员与河运告示',
    description: '核对船员家属张贴的寻人启事和公开河运记录。', hours: 1, energyCost: 4, openFrom: 8, openTo: 18,
    completion: { kind: 'clue', id: 'river_sea_missing_notices' }, effects: [{ k: 'clue', id: 'river_sea_missing_notices' }],
    result: '你把几份失踪船员告示与河运日期抄入笔记。这只能指出码头方向，仍需亲自核对当地的正式失踪登记。',
  },
  {
    id: 'st_number_repair_notices', locationId: 'st_number_church', label: '查询机械事故与修理公告',
    description: '查看工匠互助、机械事故和停产修理的公开信息。', hours: 1, energyCost: 4, openFrom: 9, openTo: 17,
    completion: { kind: 'clue', id: 'tingen_factory_repairs' }, effects: [{ k: 'clue', id: 'tingen_factory_repairs' }],
    result: '你整理出一处停产工厂的公开修理记录；它只说明世俗事故与设备异常，仍需实地核对。',
  },
] as const;

/**
 * 廷根地标的有条件邂逅。真实背景只供规则与审查测试使用；首遇、NPC 卡片和日志
 * 始终使用 npc.identity / npc.desc / meetText，不得拼接 npc.secret。
 */
export const TINGEN_LANDMARK_ENCOUNTERS: readonly LandmarkEncounterDef[] = [
  {
    id: 'hoy_azik', locationId: 'hoy_university', triggerActionIds: ['hoy_public_history_lecture', 'explore'],
    minLocationRelation: 10, chance: 0.3, cooldownDays: 1, guaranteeAfterAttempts: 3, initialFavor: 8,
    npc: {
      id: 'azik', name: '阿兹克·艾格斯', identity: '霍伊大学历史教员',
      secret: '失去部分记忆的高序列死神途径非凡者',
      desc: '肤色偏古铜，待人温和，讲解历史时常能指出教科书没有收录的细节。',
      schedule: [{ from: 9, to: 17, location: '霍伊大学', interactable: true, days: [1, 2, 3, 4, 5] }],
    },
    meetText: '昆汀·科恩教授把你介绍给阿兹克·艾格斯先生。他只以霍伊大学历史教员的身份与你交谈，并替你纠正了几处旧地名。',
    missText: '昆汀·科恩教授替你问过，但那位负责地方史课程的教员今天正忙；你只得先留下自己的公开问题。',
  },
  {
    id: 'club_hanass', locationId: 'divination_club', triggerActionIds: ['divination_club_etiquette', 'explore'],
    minLocationRelation: 9, chance: 0.28, cooldownDays: 1, guaranteeAfterAttempts: 4, initialFavor: 6,
    npc: {
      id: 'hanass', name: '海纳斯·凡森特', identity: '占卜俱乐部知名占卜者',
      secret: '极光会成员',
      desc: '衣着考究、措辞谨慎，谈论的始终是俱乐部规则与民间占卜礼仪。',
      schedule: [{ from: 13, to: 20, location: '占卜俱乐部', interactable: true, days: [2, 4, 6] }],
    },
    meetText: '接待员请一位知名占卜者回答你的礼仪问题。海纳斯·凡森特只谈公开规矩，没有承诺教授任何特殊技巧。',
    missText: '接待员说资深会员今日没有空档，建议你先把问题按普通占卜礼仪重新整理。',
  },
  {
    id: 'blackthorn_dunn', locationId: 'blackthorn_security', triggerActionIds: ['blackthorn_public_report', 'explore'],
    minLocationRelation: 8, chance: 0.42, cooldownDays: 1, guaranteeAfterAttempts: 3, initialFavor: 8,
    npc: {
      id: 'dunn', name: '邓恩·史密斯', identity: '黑荆棘安保公司负责人',
      secret: '黑夜教会值夜者廷根小队队长，序列7梦魇',
      desc: '灰眸沉静，说话不快，更关心证词中的时间、地点与可以复核的事实。',
      schedule: [{ from: 9, to: 18, location: '黑荆棘安保公司', interactable: true }],
    },
    meetText: '前台职员罗珊把受理回执递进内间。片刻后，负责人邓恩·史密斯出来核对了几处事实，只以安保业务的口径提醒你保留原始证物。',
    missText: '罗珊说负责人正在处理另一宗事务，你的说明已归档，暂时只能等待普通书面答复。',
  },
  {
    id: 'dragon_swain', locationId: 'dragon_bar', triggerActionIds: ['dragon_watch_boxing', 'explore'],
    minLocationRelation: 8, chance: 0.34, cooldownDays: 1, guaranteeAfterAttempts: 4, initialFavor: 7,
    npc: {
      id: 'swain', name: '斯维因', identity: '恶龙酒吧老板',
      secret: '前廷根代罚者队长，暴怒之民序列8',
      desc: '身形壮实，嗓音洪亮，公开场合只谈拳赛、酒水与店里的规矩。',
      schedule: [{ from: 16, to: 26, location: '恶龙酒吧', interactable: true }],
    },
    meetText: '一位看台熟客把你介绍给老板斯维因。他点评了两句拳手的步法，又提醒你在公开区域遵守店规。',
    missText: '看台熟客说老板正在后面核对账目，今晚不会出来见普通客人。',
  },
] as const;

export const SALVAGE_DEFS: readonly SalvageDef[] = [
  { id: 'salvage_docks_crate', locationId: 'docks', hours: 1, energyCost: 6, reward: { kind: 'item', itemId: 'whiskey', amount: 1 }, requiresVisited: true },
  { id: 'salvage_canal_rope', locationId: 'canal', hours: 1, energyCost: 6, reward: { kind: 'money', amount: 18 }, requiresVisited: true },
  { id: 'salvage_graveyard_tools', locationId: 'graveyard', hours: 1, energyCost: 7, reward: { kind: 'money', amount: 12 }, requiresVisited: true },
  { id: 'salvage_sewer_brass', locationId: 'sewer', hours: 1, energyCost: 8, reward: { kind: 'money', amount: 15 }, requiresVisited: true },
  { id: 'salvage_factory_type', locationId: 'factory', hours: 1, energyCost: 8, reward: { kind: 'money', amount: 20 }, requiresVisited: true },
  { id: 'salvage_manor_cellar', locationId: 'manor', hours: 1, energyCost: 8, reward: { kind: 'item', itemId: 'whiskey', amount: 1 }, requiresVisited: true },
];

export const SHOP_DEFS: readonly ShopDef[] = [
  { id: 'market_general_store', locationId: 'market', openFrom: 8, openTo: 20, inventory: [{ itemId: 'whiskey', price: 12 }, { itemId: 'medical_dressing', price: 10 }, { itemId: 'plain_disguise_kit', price: 24 }, { itemId: 'reinforced_cane', price: 36 }, { itemId: 'hunting_knife', price: 54 }, { itemId: 'leather_coat', price: 72 }, { itemId: 'silver_focus_mirror', price: 66 }, { itemId: 'flash_powder', price: 18 }, { itemId: 'warding_sachet', price: 20 }, { itemId: 'revolver_ammo', price: 4 }, { itemId: 'revolver', price: 150 }, { itemId: 'ritual_chalk', price: 6 }, { itemId: 'plain_pendulum', price: 8 }, { itemId: 'blank_charm_paper', price: 3 }] },
  { id: 'black_market_stall', locationId: 'black_market', openFrom: 22, openTo: 26, inventory: [], organizationAuthorized: true },
];

// ============ 特殊角色（高序列存在：天使与神） ============
// 不作息、不闲逛，只在特定条件下「注视」或「显现」
export const SPECIAL_BEINGS = [
  { id: 'sage', name: '「隐匿贤者」', desc: '隐秘集会的传说主持者，出售任何知识——只要你付得起「代价」之外的价钱。' },
  { id: 'gray_fog', name: '雾中传说', desc: '码头与旧街流传着许多关于灰雾的民间故事，彼此矛盾，也没有可靠证据能证明其中存在会回应祈祷的实体。' },
  { id: 'angel_time', name: '时天使的幻影', desc: '戴着单片眼镜的幻影。它出现时，你的怀表会少几格。', danger: true },
  { id: 'true_creator', name: '呓语之主', desc: '污染越重，它的声音越清晰。那不是启示，是食欲。', danger: true },
];

// ============ 事件池 ============
/**
 * 固定机制、随机叙事文本的生活事件。
 * 注意：这里仅允许 item / knowledge / skill 三种确定性效果；数值与奖励不得写入叙事文本。
 */
export const RANDOM_TEXT_EVENTS: EventBlueprint[] = [
  {
    id: 'ambient_skill_work_observation', slot: 'work', weight: 3,
    cond: 'skill:investigate<10', contentVersion: 1,
    titleVariants: ['老同事的诀窍', '差错留下的痕迹', '一眼看穿的问题'],
    textVariants: [
      '一位老同事没有直接指出差错，只让你观察纸张的折痕、墨迹的深浅和经手人留下的习惯。',
      '两份看似相同的记录摆在桌上。主管让你别急着核对数字，先想想它们分别经过了谁的手。',
      '工作间隙，有人教你从工具的摆放和残留痕迹判断上一道工序出了什么问题。',
    ],
    choices: [{
      textVariants: ['照着方法重新检查', '从细微痕迹开始排查', '记下这套观察次序'],
      effects: [{ k: 'skill', skill: 'investigate', v: 1 }],
      resultVariants: [
        '你放慢速度重新看了一遍，原本杂乱的细节开始自行排列出先后。',
        '真正的问题藏在最不起眼的地方。看见它以后，其余疑点也顺次清晰起来。',
        '你把方法默记在心。下一次面对相似痕迹时，或许不必再等别人提醒。',
      ],
    }],
  },
];

export const EVENTS: GameEvent[] = [
  {
    id: 'manor_registry_memory', slot: 'book', weight: 1, cond: 'clue:manor_guest_registry', once: true,
    title: '名册夹页里的旧事',
    text: '你把名册中反复出现的访客姓名与日期排列后，发现一张夹页记着同一场冬宴：有人提前离席，有人从未在官方记录中出现。',
    choices: [{ text: '把矛盾日期抄入调查笔记', effects: [], result: '这段旧事仍不足以证明任何组织或配方，只为庄园过去留下了一条可核验的时间线。' }],
  },
  {
    id: 'divination_note_echo', slot: 'divination', weight: 1,
    cond: 'clue:cryptic_note_warning', once: true, title: '纸背的第二层墨迹',
    text: '把占卜记录与残页并排放置后，你发现纸背有一处先前被忽略的压痕。它不像答案，更像留给下一位持有者的警告。',
    choices: [{
      text: '只把压痕临摹进调查笔记', effects: [],
      result: '你克制住继续解读的冲动，只留下可供日后交叉核验的临摹。残页没有因此变成配方，也没有教会你任何能力。',
    }],
  },
  // ---- 普通人机缘 ----
  {
    id: 'fog_dream', slot: 'daily', weight: 4, cond: 'mortal', once: true, title: '雾中的噩梦',
    text: '昨夜你梦见自己在浓雾笼罩的旧街上迷路。没有宫殿，没有启示，只有看不清面孔的行人和远处反复响起的钟声。醒来时，你的掌心全是汗。',
    choices: [
      { text: '把梦记下来', effects: [{ k: 'flag', id: 'dreamed_fog', v: 1 }], result: '你记下了梦的每个细节。它或许只是近日压力留下的杂乱印象，不能证明任何超自然现象。' },
      { text: '只是个噩梦，忘了它', effects: [{ k: 'san', v: 1 }], result: '你喝了杯热水，努力把那座停摆的钟楼抛到脑后。' },
    ],
  },
  {
    id: 'street_stranger', slot: 'street', weight: 3, cond: 'mortal', once: true, title: '擦肩而过的怪人',
    text: '一个裹在黑斗篷里的身影与你擦肩而过，你分明闻到一股铁锈与焚香的混合气味。那人忽然停下，回头看了你一眼——那一眼里有某种让你脊椎发凉的「重量」。',
    choices: [
      { text: '跟上去看看', effects: [{ k: 'stat', stat: 'spi', v: 2 }, { k: 'san', v: -3 }, { k: 'flag', id: 'met_beyonder', v: 1 }], result: '你跟了三条街，那人却在转角的浓雾里凭空消失了。地上只留一枚烧过的黑蜡烛头。这个世界，似乎没有你以为的那么简单。' },
      { text: '快步离开', effects: [{ k: 'san', v: -1 }], result: '你走得很快。可那一眼的重量，一路跟到了你家门口。' },
    ],
  },
  // ---- 打工 ----
  {
    id: 'work_overtime', slot: 'work', weight: 3, title: '临近收工的急活',
    text: '临近收工，主管又塞来一批急活：「今天做完，另算一笔辛苦钱。」周围的同事都在悄悄看你的反应。',
    choices: [
      { text: '接下急活', effects: [{ k: 'money', v: 24 }, { k: 'energy', v: -20 }], result: '你咬牙处理完额外的差事。主管把2苏勒辛苦钱递到你手里，周围有人佩服，也有人觉得你抢了风头。' },
      { text: '婉拒，按约定完成本职', effects: [], result: '主管没有多说什么。你做完了该做的部分，也保住了剩下的精力。' },
    ],
  },
  {
    id: 'work_rumor', slot: 'work', weight: 3, title: '同事的耳语',
    text: '歇手时，一位同事压低声音：「码头又失踪了两个人……听说连尸体都找不到，就像被雾吃掉了。」',
    choices: [
      { text: '仔细打听细节', effects: [{ k: 'intel', id: 'dock_missing' }], result: '你记下了失踪地点与时间。这条情报或许值钱——或者值钱的是它背后的麻烦。' },
      { text: '不掺和，埋头干活', effects: [], result: '你埋头干活。在这座城里，不知道有时是一种福气。' },
    ],
  },
  {
    id: 'work_accident', slot: 'work', weight: 2, cond: 'energy<40', title: '疲惫出错',
    text: '疲惫让你手脚发沉，一项重要工作出了差错。主管检查记录时，脸色立刻沉了下来。',
    choices: [
      { text: '道歉并主动修正', effects: [{ k: 'money', v: -12 }], result: '你被扣了半天工钱，但主管记住了你的担当。' },
      { text: '悄悄把错误混过去', effects: [{ k: 'san', v: -3 }, { k: 'flag', id: 'work_blunder', v: 1 }], result: '没人发现。至少今天没有。你总觉得那项错误还会回来找你。' },
    ],
  },
  // ---- 冒险 ----
  {
    id: 'adv_confirmed_beyonder_death', slot: 'adventure', weight: 2,
    cond: 'mortal&intel:trade_fair_invitation', locations: ['black_market'], once: true,
    title: '担保人封锁的后巷',
    text: '交易会散场后，担保人封住一段后巷。一个以占卜货商身份活动的蒙面人已经确认死亡，现场记录与遗留封签都证明他并非普通人。尸体旁正有一团异常残留缓慢凝结。',
    choices: [
      {
        text: '请担保人见证封存残留', effects: [{ k: 'beyonder_death', id: 'fallen_seer_smuggler' }, { k: 'san', v: -4 }],
        result: '你没有触碰尸体，只在担保人见证下把凝结物装进双层容器。它仍未鉴定，不能直接服食，也不能凭外观判断途径。',
      },
      { text: '不碰现场，立即离开', effects: [], result: '你留下原始封锁线与尸体。没有可核验的死亡确认，就不会有任何东西凭空进入物品栏。' },
    ],
  },
  {
    id: 'adv_dock', slot: 'adventure', weight: 4, cond: 'mortal&intel:dock_missing', locations: ['docks'], once: true, title: '雾中的码头',
    text: '凭着手里的失踪案情报，你沿码头核对货箱编号时，一团从河面漫来的局部浓雾忽然吞没了相邻栈桥。雾深处传来拖拽重物的声音，还有……湿漉漉的、不像人的喘息。',
    choices: [
      { text: '循声摸过去查看', effects: [{ k: 'clue', id: 'dock_crate_trace' }, { k: 'item', id: 'dock_scale_evidence', v: 1 }, { k: 'san', v: -8 }, { k: 'cor', v: 5 }], result: '你在货箱后找到几件散落遗物和一枚沾水的硬质薄片。你没有贸然判断它是什么，只把薄片封好，并记下货箱、拖痕与退路。' },
      { text: '保持距离，只记录动静', effects: [{ k: 'clue', id: 'dock_crate_trace' }, { k: 'san', v: -2 }], result: '你没有靠近雾里的动静，只从外围记下货箱位置、拖拽节奏与水迹方向。这份现场记录可以拿去和公开登记、货运备份交叉核对。' },
      { text: '撤退', effects: [], result: '雾里的东西没有追来。至少你回头看的时候，没有。' },
    ],
  },
  {
    id: 'adv_rat', slot: 'adventure', weight: 3, locations: ['sewer'], once: true, title: '下水道红眼',
    text: '市政维修记录里反复提到下水道的「大老鼠」。油灯照亮管道的刹那，你看见几十双红色的眼睛同时亮起——那些「老鼠」大得像狗。',
    choices: [
      { text: '抄起家伙驱散它们', effects: [{ k: 'energy', v: -15 }, { k: 'stat', stat: 'phy', v: 2 }], result: '一番恶战后，红眼睛终于退入支管。你带着几道咬伤记下了巢穴位置，这里显然不是普通鼠患。' },
      { text: '用陷阱试探', effects: [{ k: 'stat', stat: 'mnd', v: 2 }, { k: 'energy', v: -8 }], result: '诱饵加落石让鼠群暴露了绕行路线。你开始理解猎人为什么总说「猎物的脑子比牙齿值钱」。' },
      { text: '数量太多，撤', effects: [], result: '几十双红眼睛同时逼近半步——你果断退出了管道。再有价值的发现，也得有命带回去。' },
    ],
  },
  {
    id: 'adv_grave', slot: 'adventure', weight: 3, locations: ['graveyard'], once: true, title: '墓园异响',
    text: '你调查夜间墓园的抓挠声时，守墓人也提着灯赶了过来。声音来自一座新下葬的墓穴——棺材里面。还很急促。',
    choices: [
      { text: '立刻开棺', effects: [{ k: 'san', v: -5 }, { k: 'stat', stat: 'cha', v: 2 }], result: '棺中是假死下葬的年轻人，再晚半小时就真死了。家属记住了你的善意，守墓人看你的眼神像看圣人。' },
      { text: '先确认亡者情况', effects: [{ k: 'stat', stat: 'mnd', v: 1 }], result: '你和守墓人核对记录后合力开棺救人，也由此知道了墓园近来的几桩怪事。' },
      { text: '不敢碰，离开墓园', effects: [{ k: 'san', v: -6 }], result: '你走得很快。第二天听说那口棺材安静了。你希望那是因为救援及时。' },
    ],
  },
  {
    id: 'adv_corpse', slot: 'adventure', weight: 3, cond: 'flag:met_beyonder', locations: ['factory', 'canal', 'old_tower'], once: true, title: '死去的非凡者',
    text: '在一条后巷的垃圾堆后，你发现了一具尸体——不是饿殍。死者衣着体面，手指却扭曲成非人的角度，心口处有一团正在缓慢凝结的、微微发光的……什么东西。他的口袋里有一页折叠的纸。',
    choices: [
      { text: '只收起无法辨认的残页', effects: [{ k: 'item', id: 'cryptic_note', v: 1 }, { k: 'cor', v: 5 }, { k: 'san', v: -6 }], result: '纸上的字迹仿佛在缓慢蠕动。你无法确认它是什么，更不可能靠在家研读把它变成可用配方；它需要可信渠道鉴定。' },
      { text: '报警（交给值夜者）', effects: [{ k: 'favor', id: 'evelyn', v: 8 }, { k: 'flag', id: 'met_beyonder', v: 1 }], result: '教堂的人来得比你想象中快得多，接管现场的手法专业得可怕。一位黑风衣女士深深看了你一眼：「你做得很对。以及——今晚你什么都没看见。」她让人记下了你的姓名与证词。' },
      { text: '装作没看见，离开', effects: [], result: '你绕开了那条巷子。但那团微光，在你梦里亮了好几天。' },
    ],
  },
  {
    id: 'adv_cult', slot: 'adventure', weight: 2, cond: 'beyonder&cor>30', locations: ['old_tower', 'factory', 'sewer'], once: true, title: '雾中的耳语',
    text: '冒险途中，你体内的非凡特性忽然躁动起来——雾里有某种同源的东西在「呼唤」你。跟着它走，也许有大收获。也许没有也许。',
    choices: [
      { text: '循着呼唤深入', effects: [{ k: 'cor', v: 10 }, { k: 'san', v: -10 }, { k: 'money', v: 120 }, { k: 'stat', stat: 'spi', v: 3 }], result: '你在雾的尽头找到一处被遗弃的仪式场，只带走了几件可变卖的普通银器。没有可核验的死者身份与死亡记录，任何异常残留都被你留在原处。' },
      { text: '咬牙抵抗呼唤', effects: [{ k: 'san', v: -4 }, { k: 'stat', stat: 'mnd', v: 3 }], result: '你掐着自己的手腕，一步步退出浓雾。身后传来类似失望的叹息。' },
    ],
  },
  {
    id: 'adv_market_ears', slot: 'adventure', weight: 4, locations: ['market'], title: '市集的耳目',
    text: '铁十字街人声鼎沸。一个摆摊的掮客朝你招手：「朋友，看你眼生。这儿的规矩——消息换便士，便士换消息。要来点哪样？」',
    choices: [
      { text: '花6便士买条消息', cond: 'money>=6', effects: [{ k: 'money', v: -6 }, { k: 'intel', id: 'black_market' }], result: '掮客收下便士，压低声音说了几个地名和暗号。在这座城里，知道去哪打听，比知道答案值钱。' },
      { text: '帮摊主搭把手熟悉街面', effects: [{ k: 'energy', v: -8 }], result: '你帮着整理摊位，也顺便认了认附近的街口与招牌。掮客仍只肯按规矩卖消息，没有额外许诺。' },
      { text: '只是随便逛逛', effects: [], result: '你在人群里转了一圈，闻了闻烤栗子的香味就走了。市集永远在这儿，不急。' },
    ],
  },
  {
    id: 'adv_manor', slot: 'adventure', weight: 3, locations: ['manor'], once: true, title: '深夜钢琴声',
    text: '废弃庄园的楼梯在你脚下呻吟。搜到二楼时，你听见了——琴房方向传来断断续续的钢琴声。可这宅子已经空了整整三十年。',
    choices: [
      { text: '循声推开琴房的门', effects: [{ k: 'san', v: -8 }, { k: 'cor', v: 5 }, { k: 'stat', stat: 'spi', v: 3 }, { k: 'money', v: 60 }], result: '琴凳上空无一人，琴键却在自己下沉。你强迫自己搜完琴房——在暗格里摸到一串珍珠项链和一本烧掉一半的琴谱。离开时琴声停了，像是目送你。' },
      { text: '只搜一楼书房就撤', effects: [{ k: 'money', v: 30 }, { k: 'san', v: -3 }], result: '你压着楼上的琴声翻完书房，带走几件银器。有些门，今天还不用推开。' },
      { text: '这宅子不对劲，立刻离开', effects: [{ k: 'san', v: -2 }], result: '你退到庄园外的雾里，回头望了一眼——琴房的窗户后，似乎有道白影也朝你望了一眼。' },
    ],
  },
  {
    id: 'adv_ramd', slot: 'adventure', weight: 2, locations: ['ramd'], once: true, title: '全镇跪拜的广场',
    text: '拉姆德的街道安静得能听见自己的血流。广场中央，上百具干尸保持着跪拜的姿势，朝向一座门窗都被钉死的教堂。风穿过他们空洞的嘴，像一声拉长的祷词。',
    choices: [
      { text: '走进那座被钉死的教堂', effects: [{ k: 'money', v: 150 }, { k: 'cor', v: 12 }, { k: 'san', v: -12 }, { k: 'stat', stat: 'spi', v: 3 }], result: '祭坛上没有神像——只有一片焦黑的、人形的痕迹。你在灰烬里扒出几件没被烧完的教会圣物，转手能卖个好价。跨出门槛时你不敢回头：你觉得那些干尸的头，转动了一个微小的角度。' },
      { text: '只搜外围的民居', effects: [{ k: 'money', v: 45 }, { k: 'san', v: -4 }], result: '民居里的碗筷还摆在桌上，床铺整齐，像全镇人在晚餐中途被「接走」了。你拿走几样值钱物件，没敢碰任何餐具。' },
      { text: '这地方不该来，马上走', effects: [{ k: 'san', v: -2 }], result: '你退出镇界时，背后的祷词声停了。你没有回头确认——这是你这辈子做过最正确的决定之一。' },
    ],
  },
  {
    id: 'adv_honakisu', slot: 'adventure', weight: 2, locations: ['honakisu'], once: true, title: '山麓的夜雾',
    text: '霍纳奇斯的雾比城里的冷。采药人警告过你：过了第二块界碑，路标会自己挪动。黄昏时分，你在雾中瞥见一座不属于任何年代的石拱门——以及拱门旁一具靠着背包坐化的旅人遗骸。',
    choices: [
      { text: '靠近遗骸，翻开旅人的背包', cond: 'spi>=25', effects: [{ k: 'item', id: 'cryptic_note', v: 1 }, { k: 'cor', v: 8 }, { k: 'san', v: -8 }, { k: 'stat', stat: 'spi', v: 2 }], result: '背包里没有干粮，只有一摞写满密文的手稿——这位旅人死前仍在记录什么，最后一页的字迹扭曲得不像人手所书。你收好手稿下了山；它只能作为待鉴定线索。' },
      { text: '去山民村落打探传说', effects: [{ k: 'money', v: -6 }, { k: 'stat', stat: 'spi', v: 1 }, { k: 'san', v: 2 }], result: '山民收了你几便士的柴火钱，围着火塘讲起「夜之国度」与「安提哥努斯」的古老名字。讲到一半，老人忽然不肯再说了，只劝你：「山上看一眼就够了，别住下。」' },
      { text: '天气不对，立刻下山', effects: [], result: '你赶在夜雾合拢前下了山。石拱门在你身后的雾里轻轻「合」上了——你没有看清，也庆幸没有看清。' },
    ],
  },
  // ---- 街道（闲逛） ----
  {
    id: 'street_pickpocket', slot: 'street', weight: 3, title: '三只手',
    text: '人流中，一只瘦小的手摸向你的口袋。',
    choices: [
      { text: '当场抓住他', effects: [], result: '是个面黄肌瘦的孩子。你松开手，他消失在巷子里。' },
      { text: '装作没有察觉', effects: [{ k: 'money', v: -10 }], result: '你的钱袋轻了一点。这座城总要收点学费。' },
    ],
  },
  {
    id: 'street_preacher', slot: 'street', weight: 2, title: '街角的布道者',
    text: '一个黑袍教士在街角宣讲：「黑夜庇佑不眠之人，风暴涤荡不义之徒。」他独眼的目光扫过人群，在你身上停留了一瞬。',
    choices: [
      { text: '驻足聆听', effects: [{ k: 'san', v: 3 }], result: '祷词里有种让人平静的力量。你的精神好了一些。' },
      { text: '不感兴趣，继续赶路', cond: 'mortal', effects: [], result: '你绕开聚集的人群，继续处理自己的日常事务。' },
      { text: '收敛异常，快步离开', cond: 'beyonder', effects: [], result: '你不愿在公开布道场合久留，压低帽檐离开了街角。' },
    ],
  },
  {
    id: 'street_beggar_seer', slot: 'street', weight: 2, title: '独眼占卜师',
    text: '巷口的瞎眼老妇人朝你的方向「看」过来：「年轻人，一便士，婆婆给你占一占前程。」',
    choices: [
      { text: '给她一便士', effects: [{ k: 'money', v: -1 }, { k: 'san', v: 2 }], result: '她说了些模棱两可的吉言，又在你掌心敲了三下。那节奏令人印象深刻，却不足以证明她真看见了命运。' },
      { text: '摇头离开', effects: [], result: '「命运不要你的便士，」她在背后说，「那它就要别的了。」' },
    ],
  },
  // ---- 扮演 ----
  {
    id: 'act_crowd', slot: 'act', weight: 3, cond: 'beyonder', title: '围观者',
    text: '你扮演时，一个醉醺醺的看客凑过来起哄，引来一群人围观。是麻烦，也是舞台。',
    choices: [
      { text: '把他变成表演的一部分', effects: [{ k: 'digestion', v: 6 }, { k: 'exposure', v: 2 }], result: '哄笑声中你完成了今天最漂亮的一次扮演。魔药在体内松动了一丝。只是……人群里似乎有道过于专注的目光。' },
      { text: '收摊避开', effects: [{ k: 'digestion', v: 1 }], result: '你提前收摊。扮演讲究顺势而为，今天「势」不在你。' },
    ],
  },
  {
    id: 'act_overdone', slot: 'act', weight: 2, cond: 'beyonder&exposure>40', title: '入戏太深',
    text: '扮演结束时你恍惚了一瞬——刚才那个「角色」，和你自己，边界模糊了一秒。周围有个报童打扮的孩子多看了你两眼，跑开了。',
    choices: [
      { text: '（继续）', effects: [{ k: 'exposure', v: 4 }, { k: 'san', v: -2 }], result: '你压下心头的不安。这座城市里，多看你两眼的人，都可能是别人的眼睛。' },
    ],
  },
  // ---- 暴露事件链 ----
  {
    id: 'exposed_hint', slot: 'daily', weight: 10, cond: 'beyonder&exposure>=60', once: true, title: '被盯上了',
    text: '今天总有哪里不对劲：街对面读报的人翻了同一页半小时；教堂尖塔上的乌鸦跟着你飞了三条街；夜里你分明听见屋顶有极轻的脚步声。你被盯上了——问题只是被谁。',
    choices: [
      { text: '最近收敛一点', effects: [{ k: 'exposure', v: -8 }, { k: 'san', v: -4 }], result: '你减少了外出和扮演。那种被注视的感觉淡了些许，但没有消失。' },
      { text: '装作毫无察觉', effects: [{ k: 'san', v: -2 }], result: '你照常生活。注视仍在，像一根抵在后心的手指，迟迟不按下来。' },
    ],
  },
  {
    id: 'nighthawk_visit', slot: 'daily', weight: 10, cond: 'beyonder&exposure>=85', title: '值夜者上门',
    text: '门被敲响了。门外站着一位黑风衣女士——圣赛琳娜教堂的伊芙琳执事。她的目光平静得像深夜的湖：「别紧张。我是来给你三个选择的：登记、消失，或者……被消失。」你注意到她身后的小巷里，还有两个模糊的人影。',
    choices: [
      { text: '接受登记，成为「备案野生者」', effects: [{ k: 'exposure', v: -55 }, { k: 'tag', id: 'registered', on: true }, { k: 'favor', id: 'evelyn', v: 10 }], result: '你在一份写满密文的档案上按了手印。从此你是教会眼里的「可观察者」——自由少了，追杀令也撤了。伊芙琳收笔时低声说：「聪明的选择。上一个拒绝的人，现在是2-107号封印物的燃料。」' },
      { text: '连夜逃走（赌一把）', effects: [{ k: 'money', v: -60 }, { k: 'exposure', v: -30 }, { k: 'san', v: -8 }, { k: 'tag', id: 'fugitive', on: true }], result: '你从后窗翻出，在屋顶上跑出了有生以来最快的速度。值夜者没有追——至少今晚没有。你成了「在逃者」，从此睡觉都得睁半只眼。' },
      { text: '试着请求伊芙琳通融', cond: 'favor:evelyn>=40', effects: [{ k: 'exposure', v: -50 }, { k: 'favor', id: 'evelyn', v: -20 }], result: '她沉默了很久，最终收起档案夹：「下不为例。把自己收拾干净点——下次来的人不会是我。」你欠了她一个大人情。' },
    ],
  },
  // ---- 特殊存在事件 ----
  {
    id: 'secret_gathering', slot: 'special', weight: 1, cond: 'beyonder', title: '隐秘集会',
    text: '黑市集会日。午夜的地窖里烛火摇曳，十几个兜帽身影围坐。主持者被灰雾般的薄纱笼罩——传说中「隐匿贤者」的代理人。「新人。」那声音直接响在你脑海里，「知识、材料、庇护，这里都有价。」',
    choices: [
      { text: '花100便士购买一份课程来源核验', cond: 'money>=100', effects: [{ k: 'money', v: -100 }, { k: 'clue', id: 'sage_lesson_boundary_note' }], result: '摊主交给你一张写明来源、担保人与风险边界的回条。担保人今晚没有到场，他拒绝继续讲解，只让你带着回条另行核验。' },
      { text: '听主持人讲解集会规矩', effects: [{ k: 'san', v: 2 }], result: '主持人敲了敲桌面，逐条说明身份遮掩、交易担保与违约惩罚：每项回应，都要在见证下结清代价。' },
      { text: '只观察，不交易', effects: [{ k: 'intel', id: 'patrol_route' }], result: '你记下在场者的口音、气味与手势，并从几段刻意压低的交谈里拼出某些人的巡逻习惯。' },
    ],
  },
  {
    id: 'true_creator_whispers', slot: 'special', weight: 1, title: '呓语',
    text: '污染让那道声音变得清晰了。它在你颅骨内侧呢喃，许诺力量、许诺真相、许诺「只要再靠近一点」。你的指甲缝里渗出血丝。',
    choices: [
      { text: '（抵抗）', effects: [{ k: 'san', v: -8 }, { k: 'cor', v: 4 }], result: '你用头撞墙直到耳鸣盖过呓语。这一夜你赢了，但它还会回来——它知道你听得见了。' },
    ],
  },
  // ---- 每日结算 ----
  {
    id: 'daily_dream_omen', slot: 'daily', weight: 2, cond: 'san<40', title: '不祥的梦',
    text: '你梦见自己被困在无门无窗的雾巷里，无数双眼睛藏在窗帘后注视着你。醒来时，枕边湿漉漉的。',
    choices: [
      { text: '（继续）', effects: [{ k: 'san', v: -2 }], result: '你点起灯，直到天亮。' },
    ],
  },
  // ---- 社交事件（绑定 NPC） ----
  {
    id: 'npc_victor_market', slot: 'social', npc: 'victor', weight: 5, title: '灰鼠的货架',
    text: '维克多搓着手凑过来：「朋友，最近到了批好东西……章鱼血、玫瑰、结晶，懂的都懂。当然，也收东西——你懂的。」',
    choices: [
      { text: '花12便士请他喝一杯', cond: 'money>=12', effects: [{ k: 'money', v: -12 }, { k: 'favor', id: 'victor', v: 8 }], result: '「上道！」他灌了口酒，压低声音，「下周……算了，到时候再说。」' },
      { text: '闲聊码头传闻', effects: [{ k: 'favor', id: 'victor', v: 3 }, { k: 'intel', id: 'black_market' }], result: '你们聊了半小时。他什么都没承诺，但你记住了黑市的开门暗号。' },
      { text: '询问异常遗留物的收购规矩', cond: 'beyonder', effects: [{ k: 'favor', id: 'victor', v: 2 }], result: '维克多只肯说明规矩：必须有可核验的死亡来源、完整封存记录与当面鉴定；仅凭一团发光的东西，他不会付款。' },
    ],
  },
  {
    id: 'npc_martha_soup', slot: 'social', npc: 'martha', weight: 5, title: '一勺汤的人情',
    text: '玛尔塔婶婶堵住你：「房租的日子记着呢吧？」顿了顿，又塞给你一碗热汤，「……喝你的，瘦成这样，死在我房子里我还要倒贴棺材钱。」',
    choices: [
      { text: '道谢并聊聊家常', effects: [{ k: 'favor', id: 'martha', v: 6 }, { k: 'san', v: 3 }, { k: 'energy', v: 10 }], result: '热汤下肚，婶婶唠叨着东区的物价。这种「有人在等你回家」的感觉，值很多钱。' },
      { text: '保证按时交租', effects: [{ k: 'favor', id: 'martha', v: 3 }], result: '「记住你说的话。」她转身走了，汤留下了。' },
    ],
  },
  {
    id: 'npc_martha_suspicion', slot: 'social', npc: 'martha', weight: 6, cond: 'beyonder&exposure>=50', once: true, title: '房东太太的疑心',
    text: '玛尔塔婶婶欲言又止地拦住你：「孩子……你最近半夜老出去。前天我打扫，你房间里有一股烧过的草药味，还有……」她压低声音，「你窗台上有烧剩的蜡烛油，摆成了奇怪的图案。你是不是……沾上什么不好的东西了？」',
    choices: [
      { text: '坦白一部分（她是可信的人）', effects: [{ k: 'favor', id: 'martha', v: 10 }, { k: 'exposure', v: -5 }, { k: 'san', v: 4 }], result: '她听完沉默很久，只说了一句：「别死在我房子里。」第二天你发现她悄悄在你的门口挂了一串驱邪的草环——粗陋，但真心。' },
      { text: '用谎言搪塞', effects: [{ k: 'favor', id: 'martha', v: -5 }, { k: 'exposure', v: 3 }], result: '「哦，偏方治失眠。」她盯着你看了几秒，没再问。但你能感觉到，那道门缝后的目光，从此多了一层担忧——和警惕。' },
    ],
  },
  {
    id: 'npc_nelson_book', slot: 'social', npc: 'nelson', weight: 5, title: '后间的买卖',
    text: '老尼尔逊用独眼打量你：「书架上的东西都有来历。想借哪一本，先说清楚你准备拿它做什么。」',
    choices: [
      { text: '询问他的固定书目', effects: [{ k: 'favor', id: 'nelson', v: 2 }], result: '他指向墙边的登记簿：「先建立信任，再按书目借阅。书不会从一次闲聊里凭空进你的口袋。」' },
      { text: '请他解释阅读边界', cond: 'flag:met_beyonder', effects: [{ k: 'favor', id: 'nelson', v: 3 }], result: '老人只肯讲安全边界，并反复警告：听过术语不等于掌握知识，更不等于获得能力。' },
      { text: '闲聊他的过去', effects: [{ k: 'favor', id: 'nelson', v: 4 }, { k: 'san', v: 2 }], result: '他讲了个退休水手与灯塔的故事。真假难辨，但你注意到书架后藏着一根海蛇骨手杖。' },
      { text: '只是随便逛逛', effects: [], result: '你在书架间转了一圈就走了。老人头也不抬地继续拨他的算盘。' },
    ],
  },
  {
    id: 'npc_evelyn_watch', slot: 'social', npc: 'evelyn', weight: 5, title: '夜莺的注视',
    text: '伊芙琳执事的目光在你眉心停留了半秒：「你最近……『睡』得好吗？」这不是寒暄。值夜者问这句话时，是在给人分类：平民，可观察者，还是可清除者。',
    choices: [
      { text: '坦然回答，表现无害', effects: [{ k: 'favor', id: 'evelyn', v: 6 }, { k: 'flag', id: 'church_noticed', v: 1 }], result: '「那就好。」她收回目光，「教会欢迎安分的市民。记住，是安分的。」你被登记了——这不完全是坏事。' },
      { text: '含糊其辞，尽快告辞', effects: [{ k: 'flag', id: 'church_suspect', v: 1 }, { k: 'exposure', v: 5 }], result: '她没有拦你。但走出教堂时，你后背发凉——被值夜者惦记，比被通缉好不了多少。' },
    ],
  },
  {
    id: 'npc_ella_clinic', slot: 'social', npc: 'ella', weight: 5, title: '灰眼睛的医生',
    text: '艾拉医生的诊所里飘着安神的熏香。「你的精神像一根绷了太久的弦。」她温声说，「治疗一次8便士。或者，你也可以只和我聊聊天——聊天免费。」',
    choices: [
      { text: '花8便士接受治疗', cond: 'money>=8', effects: [{ k: 'money', v: -8 }, { k: 'san', v: 15 }, { k: 'favor', id: 'ella', v: 5 }], result: '熏香与她平缓的声线里，你脑海中那些湿冷的呓语退潮了。' },
      { text: '只聊聊天', effects: [{ k: 'san', v: 5 }, { k: 'favor', id: 'ella', v: 3 }], result: '你们聊了天气、物价和梦。不知为何，聊完你轻松了许多——也许这就是她的「治疗」。' },
    ],
  },
  {
    id: 'npc_ella_peers', slot: 'social', npc: 'ella', weight: 6, cond: 'beyonder&san<50', once: true, title: '同类的识别',
    text: '诊疗结束，艾拉医生送你到门口，忽然轻声说：「你的『弦』不是被生活绷紧的。是被『扮演』绷紧的，对吗？」你浑身一僵。她笑了笑，灰眼睛里满是了然：「别怕。我也是『观众』——只不过比你早看了几年。」',
    choices: [
      { text: '承认并请教', effects: [{ k: 'favor', id: 'ella', v: 12 }, { k: 'knowledge', id: 'potion_brew' }, { k: 'exposure', v: 3 }], result: '她教了你一些控制扮演边界的技巧，临别时叮嘱：「这座城市里，认出你的人会越来越多。学会在他们认出你之前，先认出他们。」' },
      { text: '矢口否认', effects: [{ k: 'favor', id: 'ella', v: -3 }], result: '「也好。」她没有拆穿，「谨慎是美德。但如果你哪天绷不住了——诊所的门开着。」' },
    ],
  },
  {
    id: 'npc_mike_leads', slot: 'social', npc: 'mike', weight: 6, title: '吧台后的耳朵',
    text: '麦克擦着杯子听你闲聊，忽然压低声音：「最近有几桩活儿没人接……你要是想赚外快，我帮你留意着。这座城里没有我这吧台听不见的事。」',
    choices: [
      { text: '请他替你留意合适的差事', effects: [{ k: 'commission' }, { k: 'favor', id: 'mike', v: 4 }], result: '麦克朝你眨眨眼，在你耳边说了个大概：「细节去问委托人，就说是麦克介绍的。」' },
      { text: '花12便士请他喝一杯', cond: 'money>=12', effects: [{ k: 'money', v: -12 }, { k: 'favor', id: 'mike', v: 6 }], result: '「懂事。」他不动声色地把你的杯子满上了。' },
    ],
  },
  {
    id: 'npc_brandon_loan', slot: 'social', npc: 'brandon', weight: 5, once: true, title: '血手套的善意',
    text: '布兰登用缠着绷带的手指敲着桌面：「缺钱？找我借啊。一镑起借，一周还一镑四苏勒。还不上……」他笑了笑，「我这双手套本来是白的。」',
    choices: [
      { text: '接受一镑借款和一周还款期限', effects: [{ k: 'money', v: 240 }, { k: 'timer', id: 'debt', timerLabel: '血手套的债', timerHours: 168, timerEffect: [{ k: 'money', v: -288 }, { k: 'san', v: -10 }] }], result: '他把一镑拍在你手心：「聪明人。」你注意到他指节上的旧血渍没洗干净。' },
      { text: '谢绝', effects: [{ k: 'favor', id: 'brandon', v: 2 }], result: '「行，有志气。」他咧嘴，「志气短了再来。」' },
    ],
  },
];

// ============ 工具函数 ============
export function findPathway(id: string | null) { return PATHWAYS.find(p => p.id === id); }
export function findItem(id: string) { return ITEMS.find(i => i.id === id); }
export function findNPC(id: string) { return NPCS.find(n => n.id === id); }
export function findEvent(id: string) { return EVENTS.find(e => e.id === id); }

/** 星期计算与作息判断 */
export const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
export function weekdayOf(day: number): number { return ((day - 1) % 7 + 7) % 7; }

function scheduleEntryOwnerDay(entry: NPCDef['schedule'][number], day: number, hour: number): number | null {
  let scheduleDay = day;
  let scheduleHour = hour;
  // 22→26 等跨午夜作息在次日 0→2 点仍归属于前一晚；日期限制也按前一日判断。
  if (entry.to > 24 && hour < entry.to - 24) {
    scheduleDay -= 1;
    scheduleHour += 24;
  }
  const wd = weekdayOf(scheduleDay);
  return entry.interactable && (!entry.days || entry.days.includes(wd))
    && scheduleHour >= entry.from && scheduleHour < entry.to ? scheduleDay : null;
}

/** 返回当前公开作息条目所属的营业日；跨午夜时可能是前一日。 */
export function npcScheduleOwnerDay(npc: NPCDef, day: number, hour: number): number | null {
  for (const entry of npc.schedule) {
    const ownerDay = scheduleEntryOwnerDay(entry, day, hour);
    if (ownerDay !== null) return ownerDay;
  }
  return null;
}

/** 判断 NPC 在指定日期的指定小时是否可交互 */
export function npcAvailable(npc: NPCDef, day: number, hour: number): boolean {
  return npcScheduleOwnerDay(npc, day, hour) !== null;
}
export function npcLocation(npc: NPCDef, day: number, hour: number): string | null {
  for (const entry of npc.schedule) {
    if (scheduleEntryOwnerDay(entry, day, hour) !== null) return entry.location;
  }
  return null;
}

/** 作息规律的人类可读摘要（供玩家“摸清”NPC 节奏） */
export function scheduleHint(npc: NPCDef): string {
  return npc.schedule.filter(s => s.interactable).map(s => {
    const h = `${s.from}:00–${s.to > 24 ? s.to - 24 : s.to}:00`;
    if (!s.days) return `每天${h} ${s.location}`;
    if (s.days.length === 6 && !s.days.includes(0)) return `周一至周六${h} ${s.location}`;
    const days = [...s.days].sort().map(d => WEEKDAY_NAMES[d]).join('/');
    return `${days}${h} ${s.location}`;
  }).join('；');
}

// ============ 同行者（好感≥40 可邀请一同冒险；检定时取队伍该属性最高值） ============
export const COMPANION_MIN_FAVOR = 40;
/** 同伴在检定中能提供的属性值：核心 NPC 按人设，随机 NPC 按职业 */
const CORE_COMPANION: Record<string, { stat: StatKey; value: number }> = {
  victor: { stat: 'cha', value: 32 },   // 掮客的嘴皮子
  martha: { stat: 'cha', value: 22 },   // 房东太太的泼辣
  nelson: { stat: 'mnd', value: 38 },   // 退休非凡者的经验
  evelyn: { stat: 'phy', value: 44 },   // 值夜者队长的战力
  ella: { stat: 'cha', value: 36 },     // 观众的洞察
  brandon: { stat: 'phy', value: 40 },  // 罪犯途径的打手
  mike: { stat: 'cha', value: 30 },     // 酒馆老板的场面
};
const JOB_COMPANION: Record<string, { stat: StatKey; value: number }> = {
  码头搬运工: { stat: 'phy', value: 32 }, 酒馆侍者: { stat: 'cha', value: 30 },
  报童: { stat: 'cha', value: 26 }, 裁缝: { stat: 'mnd', value: 26 },
  巡警: { stat: 'phy', value: 34 }, 大学旁听生: { stat: 'mnd', value: 32 },
  诊所助手: { stat: 'spi', value: 28 }, 运河水手: { stat: 'phy', value: 30 },
  墓地看守: { stat: 'spi', value: 30 }, 当铺伙计: { stat: 'mnd', value: 28 },
  烟囱清扫工: { stat: 'phy', value: 26 }, 剧院女演员: { stat: 'cha', value: 32 },
  商行账房: { stat: 'mnd', value: 30 }, 鱼贩: { stat: 'cha', value: 28 },
};
export function companionSpec(npc: NPCDef): { stat: StatKey; value: number } {
  return CORE_COMPANION[npc.id] ?? JOB_COMPANION[npc.identity] ?? { stat: 'mnd', value: 22 };
}
export const STAT_NAMES: Record<StatKey, string> = { phy: '体质', spi: '灵性', mnd: '心智', cha: '魅力' };
