import { LOCATIONS, ORGANIZATIONS } from './data';
import type { GameState, LocationDef, OrganizationId } from './types';

const LOCATION_INTEL: Partial<Record<string, readonly string[]>> = {
  docks: ['dock_missing'],
  black_market: ['black_market'],
};

const LOCATION_CLUES: Partial<Record<string, readonly string[]>> = {
  docks: ['dock_missing_reports', 'dock_manifest_discrepancy', 'dock_marked_manifest', 'river_sea_missing_notices'],
  canal: ['dock_manifest_discrepancy'],
  old_tower: ['clocktower_public_complaints', 'clocktower_repair_orders'],
  manor: ['manor_address'],
  factory: ['tingen_factory_repairs'],
  st_selena_church: ['tingen_city_directory'],
  dewill_library: ['tingen_city_directory'],
  municipal_library: ['tingen_city_directory'],
  hoy_university: ['tingen_honest_paper'],
  divination_club: ['tingen_honest_paper'],
  hound_tavern: ['tingen_honest_paper'],
  dragon_bar: ['tingen_honest_paper'],
  st_number_church: ['tingen_church_directory'],
  river_sea_church: ['tingen_church_directory'],
};

export function isMaterialRouteValid(state: GameState, sourceId: string): boolean {
  const source = state.materialSources?.[sourceId];
  if (!source?.unlocked) return false;
  const pathway = state.pathwayLeads?.[source.pathwayId];
  const organizationId = pathway?.organizationId as OrganizationId | undefined;
  if (!pathway?.commitment || !organizationId) return false;
  const organization = ORGANIZATIONS.find(candidate => candidate.id === organizationId);
  const route = state.organizationRoutes?.[organizationId];
  return !!organization
    && organization.heldPathways.some(pathwayId => pathwayId === source.pathwayId)
    && route?.status === 'committed'
    && route.selectedPathway === source.pathwayId;
}

function hasMatchingMaterialRoute(state: GameState, locationId: string): boolean {
  return Object.values(state.materialSources ?? {}).some(source =>
    source.locationId === locationId && isMaterialRouteValid(state, source.sourceId));
}

function hasFormalBlackthornRoute(state: GameState): boolean {
  const route = state.organizationRoutes?.nightwatch;
  return !!route && (['contacted', 'qualified', 'member', 'offer_pending', 'committed'].includes(route.status)
    || route.history.some(entry => !!entry && entry.step === 'report_to_evelyn' && entry.outcome === 'passed'));
}

export function hasVerifiedBlackthornReferral(state: GameState): boolean {
  const clue = state.clues?.find(record => record.id === 'blackthorn_referral');
  const route = state.organizationRoutes?.nightwatch;
  return clue?.sourceKind === 'location' && clue.sourceId === 'hound_message'
    && !!route?.history.some(entry => !!entry && entry.step === 'hound_security_referral'
      && entry.outcome === 'passed' && entry.evidenceId === 'blackthorn_referral');
}

/** 只接受玩家已经掌握的、可核验的地点入口证据。 */
export function isLocationUnlocked(state: GameState, locationId: string): boolean {
  const location = LOCATIONS.find(candidate => candidate.id === locationId);
  if (!location) return false;
  if (locationId === 'blackthorn_security') {
    return hasFormalBlackthornRoute(state) || hasVerifiedBlackthornReferral(state);
  }
  if (location.public) return true;
  if ((state.visitedLocations ?? []).includes(locationId)) return true;
  if (state.activeCommission?.locationId === locationId) return true;
  if ((LOCATION_INTEL[locationId] ?? []).some(intelId => (state.intel ?? []).includes(intelId))) return true;
  if ((LOCATION_CLUES[locationId] ?? []).some(clueId => (state.clues ?? []).some(clue => clue.id === clueId))) return true;
  return hasMatchingMaterialRoute(state, locationId);
}

export function getVisibleLocations(state: GameState): LocationDef[] {
  return LOCATIONS.filter(location => isLocationUnlocked(state, location.id));
}

const NPC_LOCATION_ALIASES: readonly { text: string; locationId: string }[] = [
  ...LOCATIONS.map(location => ({ text: location.name, locationId: location.id })),
  { text: '码头账房', locationId: 'docks' },
  { text: '运河码头', locationId: 'canal' },
];

/** NPC 当前位置和作息文本共用的脱敏函数；普通城市场所不受影响。 */
export function redactLockedLocationText(state: GameState, text: string): string {
  return NPC_LOCATION_ALIASES.reduce((visibleText, alias) => {
    if (isLocationUnlocked(state, alias.locationId)) return visibleText;
    return visibleText.split(alias.text).join('未查明去向');
  }, text);
}

/** 锁定地点和无效 id 使用完全相同的泛化提示，避免泄露地点资料。 */
export function locationAccessIssue(state: GameState, locationId: string): string | null {
  return isLocationUnlocked(state, locationId)
    ? null
    : '这个去向尚未查明。先从传闻、委托或可信路线中寻找入口。';
}
