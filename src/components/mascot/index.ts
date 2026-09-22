export { MascotHost } from "./MascotHost";
export { MultiPostMascot } from "./MultiPostMascot";
export { MascotBubble } from "./MascotBubble";
export { MascotAssistant } from "./MascotAssistant";
export { MascotOnboarding } from "./MascotOnboarding";
export { MascotFigure } from "./MascotFigure";
export { TourSpotlight } from "./TourSpotlight";
export { mascot } from "./mascot-events";
export { MASCOT_EVENT, TOAST_EVENT, passesCooldown, mergePrefs, loadPrefs, savePrefs } from "./mascot-events";
export {
  MASCOT_DIRECTIONS,
  MASCOT_REACTIONS,
  MASCOT_LABEL,
  MASCOT_COOLDOWN_MS,
  QUIET_HOURS,
  inQuietHours,
  MASCOT_DISMISS_MS,
  MASCOT_PREFS_KEY,
  DEFAULT_PREFS,
  ASSISTANT_ACTIONS,
  TOUR_STEPS,
  FIRST_RUN_WINDOW_MS,
  isFreshAccount,
  firstRunWelcome,
  tourInvite,
  streakSaver,
  approvalsNudge,
  inboxNudge,
  milestoneTeaser,
  buildChecklist,
  greetingForHour,
  daySeedForDate,
  contextActionFor,
  matchRouteMessage,
  placeTourCard,
} from "./mascot-config";
export type { TourCardPlacement } from "./mascot-config";
export type { MascotTone, MascotMessage, AssistantAction, AssistantIcon, ChecklistItem, TourStep, MascotPrefs } from "./mascot-types";
