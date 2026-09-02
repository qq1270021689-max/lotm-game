import type {
  CheckAttemptRecord,
  CheckContext,
  CheckDef,
  CheckInternalResult,
  CheckPublicResult,
  CheckRequest,
  CheckRequirement,
  SkillKey,
  StatKey,
} from './types';

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const uniqueSorted = (values: readonly string[]) => [...new Set(values)].sort();

function requirementSatisfied(requirement: CheckRequirement, context: CheckContext): boolean | null {
  switch (requirement.kind) {
    case 'clue': return context.clueIds.includes(requirement.id);
    case 'tool': return context.toolIds.includes(requirement.id);
    case 'ability': return context.abilityIds.includes(requirement.id);
    case 'location': return context.locationId === requirement.id;
    default: return null;
  }
}

function definitionInput(def: CheckDef, context: CheckContext) {
  const statIds = uniqueSorted(def.contributions.filter(term => term.kind === 'stat').map(term => term.id)) as StatKey[];
  const skillIds = uniqueSorted(def.contributions.filter(term => term.kind === 'skill').map(term => term.id)) as SkillKey[];
  const clueIds = uniqueSorted([
    ...def.requirements.filter(term => term.kind === 'clue').map(term => term.id),
    ...def.contributions.filter(term => term.kind === 'clue').map(term => term.id),
  ]).filter(id => context.clueIds.includes(id));
  const toolIds = uniqueSorted([
    ...def.requirements.filter(term => term.kind === 'tool').map(term => term.id),
    ...def.contributions.filter(term => term.kind === 'tool').map(term => term.id),
  ]).filter(id => context.toolIds.includes(id));
  const abilityIds = uniqueSorted([
    ...def.requirements.filter(term => term.kind === 'ability').map(term => term.id),
    ...def.contributions.filter(term => term.kind === 'ability').map(term => term.id),
  ]).filter(id => context.abilityIds.includes(id));
  return {
    target: context.target,
    locationId: def.requirements.some(term => term.kind === 'location') ? context.locationId ?? null : null,
    stats: Object.fromEntries(statIds.map(id => [id, context.stats[id] ?? 0])),
    skills: Object.fromEntries(skillIds.map(id => [id, context.skills[id] ?? 0])),
    clueIds,
    toolIds,
    abilityIds,
    companionId: def.contributions.some(term => term.kind === 'ability' && term.id.startsWith('companion:'))
      ? context.companionId ?? null : null,
    preparationIds: uniqueSorted(context.preparationIds.filter(id => def.contributions.some(term => term.kind === 'preparation' && term.id === id))),
  };
}

function canonicalCheckContext(def: CheckDef, raw: CheckContext): CheckContext | null {
  if (!raw.target || raw.target.kind !== def.target.kind || raw.target.id !== def.target.id
    || !raw.stats || !raw.skills || !Array.isArray(raw.clueIds) || !raw.clueIds.every(id => typeof id === 'string')
    || !Array.isArray(raw.toolIds) || !raw.toolIds.every(id => typeof id === 'string')
    || !Array.isArray(raw.abilityIds) || !raw.abilityIds.every(id => typeof id === 'string')
    || !Array.isArray(raw.preparationIds) || !raw.preparationIds.every(id => typeof id === 'string')) return null;
  const statIds = uniqueSorted(def.contributions.filter(term => term.kind === 'stat').map(term => term.id)) as StatKey[];
  const skillIds = uniqueSorted(def.contributions.filter(term => term.kind === 'skill').map(term => term.id)) as SkillKey[];
  if (statIds.some(id => raw.stats[id] !== undefined && !finite(raw.stats[id]))
    || skillIds.some(id => raw.skills[id] !== undefined && !finite(raw.skills[id]))) return null;
  const relevantClues = new Set([
    ...def.requirements.filter(term => term.kind === 'clue').map(term => term.id),
    ...def.contributions.filter(term => term.kind === 'clue').map(term => term.id),
  ]);
  const relevantTools = new Set([
    ...def.requirements.filter(term => term.kind === 'tool').map(term => term.id),
    ...def.contributions.filter(term => term.kind === 'tool').map(term => term.id),
  ]);
  const relevantAbilities = new Set([
    ...def.requirements.filter(term => term.kind === 'ability').map(term => term.id),
    ...def.contributions.filter(term => term.kind === 'ability').map(term => term.id),
  ]);
  const relevantPreparations = new Set(def.contributions
    .filter(term => term.kind === 'preparation').map(term => term.id));
  return {
    target: { ...def.target },
    locationId: def.requirements.some(term => term.kind === 'location') ? raw.locationId : undefined,
    stats: Object.fromEntries(statIds.map(id => [id, raw.stats[id] ?? 0])),
    skills: Object.fromEntries(skillIds.map(id => [id, raw.skills[id] ?? 0])),
    clueIds: uniqueSorted(raw.clueIds.filter(id => relevantClues.has(id))),
    toolIds: uniqueSorted(raw.toolIds.filter(id => relevantTools.has(id))),
    abilityIds: uniqueSorted(raw.abilityIds.filter(id => relevantAbilities.has(id))),
    companionId: undefined,
    preparationIds: uniqueSorted(raw.preparationIds.filter(id => relevantPreparations.has(id))),
  };
}

/** 指纹只包含定义声明会读取的输入；日期、日志和无关属性不会让失败重试失效。 */
export function createCheckFingerprint(def: CheckDef, context: CheckContext): string {
  return JSON.stringify({ checkId: def.id, version: def.version, input: definitionInput(def, context) });
}

export function evaluateCheck(definitions: readonly CheckDef[], request: CheckRequest): CheckInternalResult {
  const def = definitions.find(candidate => candidate.id === request.checkId);
  if (!def || (request.definitionVersion !== undefined && request.definitionVersion !== def.version)) {
    return {
      checkId: request.checkId, definitionVersion: request.definitionVersion ?? 0,
      eligible: false, outcome: 'blocked', reason: 'unknown_check', score: 0,
      difficulty: Number.POSITIVE_INFINITY, fingerprint: `unknown:${request.checkId}`, contributions: [],
    };
  }
  if (!request.context || !request.context.target) {
    return {
      checkId: def.id, definitionVersion: def.version, eligible: false, outcome: 'blocked', reason: 'unknown_target',
      score: 0, difficulty: def.difficulty, fingerprint: `invalid-target:${def.id}`, contributions: [],
    };
  }
  const canonicalContext = canonicalCheckContext(def, request.context);
  const fingerprint = createCheckFingerprint(def, canonicalContext ?? request.context);
  if (request.context.target.kind !== def.target.kind || request.context.target.id !== def.target.id) {
    return {
      checkId: def.id, definitionVersion: def.version, eligible: false, outcome: 'blocked', reason: 'unknown_target',
      score: 0, difficulty: def.difficulty, fingerprint, contributions: [],
    };
  }
  if (!canonicalContext) {
    return {
      checkId: def.id, definitionVersion: def.version, eligible: false, outcome: 'blocked', reason: 'unknown_requirement',
      score: 0, difficulty: def.difficulty, fingerprint, contributions: [],
    };
  }

  let unknownRequirement = false;
  let missingRequirement = false;
  for (const requirement of def.requirements) {
    const satisfied = requirementSatisfied(requirement, canonicalContext);
    if (satisfied === null) unknownRequirement = true;
    else if (!satisfied) missingRequirement = true;
  }

  const contributions = [] as CheckInternalResult['contributions'];
  let score = 0;
  for (const term of def.contributions) {
    let value: number | null = null;
    switch (term.kind) {
      case 'stat': value = (canonicalContext.stats[term.id] ?? 0) * term.multiplier; break;
      case 'skill': value = (canonicalContext.skills[term.id] ?? 0) * term.multiplier; break;
      case 'clue': value = canonicalContext.clueIds.includes(term.id) ? term.value : 0; break;
      case 'tool': value = canonicalContext.toolIds.includes(term.id) ? term.value : 0; break;
      case 'ability': value = canonicalContext.abilityIds.includes(term.id) ? term.value : 0; break;
      case 'preparation': value = canonicalContext.preparationIds.includes(term.id) ? term.value : 0; break;
      default: value = null;
    }
    if (value === null || !finite(value)) {
      unknownRequirement = true;
      continue;
    }
    score += value;
    if (value !== 0) contributions.push({ id: `${term.kind}:${term.id}`, kind: term.kind, publicLabel: term.publicLabel, value });
  }

  if (unknownRequirement) {
    return { checkId: def.id, definitionVersion: def.version, eligible: false, outcome: 'blocked', reason: 'unknown_requirement', score, difficulty: def.difficulty, fingerprint, contributions };
  }
  if (missingRequirement) {
    return { checkId: def.id, definitionVersion: def.version, eligible: false, outcome: 'blocked', reason: 'missing_requirement', score, difficulty: def.difficulty, fingerprint, contributions };
  }
  const passed = score >= def.difficulty;
  return {
    checkId: def.id, definitionVersion: def.version, eligible: true,
    outcome: passed ? 'passed' : 'blocked', reason: passed ? 'passed' : 'insufficient',
    score, difficulty: def.difficulty, fingerprint, contributions,
  };
}

export function toPublicCheckResult(result: CheckInternalResult): CheckPublicResult {
  const reason: CheckPublicResult['reason'] = result.reason === 'passed' ? 'passed'
    : result.reason === 'missing_requirement' ? 'missing_prerequisite'
      : result.reason === 'insufficient' ? 'needs_preparation' : 'unavailable';
  return {
    checkId: result.checkId,
    eligible: result.eligible,
    outcome: result.outcome,
    reason,
    helpedBy: [...new Set(result.contributions.map(term => term.publicLabel))],
  };
}

const primitive = (value: unknown) => value === undefined || value === null
  || typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean';

/**
 * 读取存档时重算指纹和检定结果。记录只用于审计，即使合法也不能授予任何领域状态。
 */
export function sanitizeCheckAttemptRecord(
  definitions: readonly CheckDef[],
  raw: unknown,
): CheckAttemptRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<CheckAttemptRecord>;
  const def = definitions.find(candidate => candidate.id === value.checkId && candidate.version === value.definitionVersion);
  if (!def || typeof value.attemptId !== 'string' || value.attemptId.length < 1
    || !Number.isInteger(value.startedDay) || (value.startedDay ?? 0) < 1
    || !Number.isInteger(value.startedHour) || (value.startedHour ?? -1) < 0 || (value.startedHour ?? 24) > 23
    || !value.context || typeof value.context !== 'object') return null;
  const rawContext = value.context as CheckContext;
  const context = canonicalCheckContext(def, rawContext);
  if (!context) return null;
  const result = evaluateCheck(definitions, {
    checkId: def.id, definitionVersion: def.version, context,
    startedAt: { day: value.startedDay!, hour: value.startedHour! },
  });
  const contributionIds = uniqueSorted(result.contributions.map(term => term.id));
  if (value.fingerprint !== result.fingerprint || value.outcome !== result.outcome || value.reason !== result.reason
    || !Array.isArray(value.publicContributionIds)
    || JSON.stringify(uniqueSorted(value.publicContributionIds)) !== JSON.stringify(contributionIds)
    || !value.receipt || !Number.isInteger(value.receipt.hoursElapsed) || value.receipt.hoursElapsed < 0
    || !Array.isArray(value.receipt.effects)) return null;
  const receiptPolicy = def.receiptPolicy[result.outcome];
  const recordedEffectIds = value.receipt.effects.map(entry => entry?.id).filter((id): id is string => typeof id === 'string');
  if (!receiptPolicy || value.receipt.hoursElapsed !== receiptPolicy.hoursElapsed
    || JSON.stringify(uniqueSorted(recordedEffectIds)) !== JSON.stringify(uniqueSorted(receiptPolicy.effectIds))
    || new Set(recordedEffectIds).size !== recordedEffectIds.length) return null;
  const effects = value.receipt.effects.filter(entry => entry && typeof entry.id === 'string'
    && receiptPolicy.effectIds.includes(entry.id) && typeof entry.applied === 'boolean'
    && primitive(entry.before) && primitive(entry.after)
    && (entry.actualDelta === undefined || finite(entry.actualDelta)));
  if (effects.length !== value.receipt.effects.length) return null;
  return {
    attemptId: value.attemptId,
    checkId: def.id,
    definitionVersion: def.version,
    context: structuredClone(context),
    fingerprint: result.fingerprint,
    startedDay: value.startedDay!,
    startedHour: value.startedHour!,
    outcome: result.outcome,
    reason: result.reason,
    publicContributionIds: contributionIds,
    receipt: { hoursElapsed: value.receipt.hoursElapsed, effects: structuredClone(effects) },
  };
}
