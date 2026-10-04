import { OBSERVER_CONTEXT_CHARACTERS } from "./observer-budget.ts";
import type { ObserverProvider, ObserverRequest, ObserverSuggestion } from './observer';
import type { IpcResult } from './workspace';
export const LIVE_CONFIG = Object.freeze({ pauseMs: 2500, cooldownMs: 2500, maximumRequestsPerHour: 120, radius: 80, maximumCodeCharacters: OBSERVER_CONTEXT_CHARACTERS, maximumDiagnosticCharacters: 1000, freshnessMs: 3500, minimumPauseMs: 1000, maximumPauseMs: 30000 });
export const LIVE_CHANNELS = { configure: 'live:configure', edit: 'live:edit', activity: 'live:activity', cancel: 'live:cancel', state: 'live:state' } as const;
export const LIVE_LANGUAGES: Record<string, string> = { py: 'python', js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp', java: 'java', cs: 'csharp', go: 'go', rs: 'rust', rb: 'ruby', php: 'php', swift: 'swift', kt: 'kotlin' };
export const liveLanguage = (path: string) => LIVE_LANGUAGES[path.split('.').at(-1)?.toLowerCase() ?? ''];
export interface LiveEdit { trayItems?: import('./context-tray').ContextTrayItem[]; relativePath: string; content: string; previousContent: string; line: number; column: number; diagnostics: { line: number; column: number; message: string }[] }
export const LIVE_BLOCK_REASONS = ['manual', 'automatic', 'review', 'dialog', 'privacy', 'settings', 'file', 'workspace'] as const;
export type LiveBlockReason = typeof LIVE_BLOCK_REASONS[number];
export const LIVE_PAUSED_MESSAGES: Record<LiveBlockReason, string> = {
 manual: 'Paused: manual Observer has priority. Finish or dismiss it, then make a new edit.',
 automatic: 'Paused: automatic error help has priority. Make a new edit when it finishes.',
 review: 'Paused: a review is open. Finish or dismiss it, then make a new edit.',
 dialog: 'Paused: a dialog is open. Close it, then make a new edit.',
 privacy: 'Paused: Observer is disabled in Privacy settings. No code will be sent.',
 settings: 'Paused: waiting for privacy settings to load. No code will be sent.',
 file: 'Paused: the active file is unavailable or has an external conflict.',
 workspace: 'Paused: the workspace is not ready for Live Observer.',
};
export interface LiveActivity { relativePath: string | null; focused: boolean; blocked: boolean; reason?: LiveBlockReason }
export interface LiveTiming { pauseMs: number; cooldownMs: number; maximumRequestsPerHour: number }
export interface LiveState { enabled: boolean; message: string; status: 'off' | 'idle' | 'waiting' | 'cooldown' | 'limited' | 'checking' | 'thinking' | 'ready' | 'paused' | 'blocked'; timing?: LiveTiming; reviewWithObserver?: boolean; relativePath?: string; request?: ObserverRequest; suggestion?: ObserverSuggestion }
export const LIVE_OFF: LiveState = { enabled: false, status: 'off', message: 'Off · code completion and corrections · session-only' };
export interface LiveBridge {
 configure: (enabled: boolean, provider: ObserverProvider, pauseMs: number) => Promise<IpcResult<LiveState>>;
 edit: (edit: LiveEdit) => void;
 activity: (activity: LiveActivity) => void;
 cancel: () => void;
 onState: (listener: (state: LiveState) => void) => () => void;
}
