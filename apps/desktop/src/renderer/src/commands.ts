export type CommandId =
  | "file.openFolder"
  | "file.closeWorkspace"
  | "file.save"
  | "file.saveAll"
  | "file.newFile"
  | "file.newFolder"
  | "search.findInFiles"
  | "git.showSourceControl"
  | "view.showExplorer"
  | "view.showSearch"
  | "view.toggleTerminal"
  | "view.toggleOutput"
  | "view.focusObserver"
  | "terminal.new"
  | "run.currentFile"
  | "run.stop"
  | "observer.ask"
  | "markdown.edit"
  | "markdown.preview"
  | "markdown.split"
  | "preferences.openSettings"
  | "window.openWelcome";

export interface CommandState {
  workspaceOpen: boolean;
  activeFile: boolean;
  activeFileSavable: boolean;
  dirtyFileCount: number;
  activeFileRunnable: boolean;
  runActive: boolean;
  terminalActive: boolean;
  terminalCreating: boolean;
  observerCanAsk: boolean;
  markdownActive: boolean;
  welcomeOpen: boolean;
}

export type CommandHandlers = Record<CommandId, () => void | Promise<void>>;

export interface CommandDefinition {
  id: CommandId;
  name: string;
  shortcut?: string;
  disabledReason: (state: CommandState) => string | null;
}

export interface ResolvedCommand extends CommandDefinition {
  disabledReasonText: string | null;
  execute: () => void | Promise<void>;
}

const available = () => null;
const requiresWorkspace = (state: CommandState) => state.workspaceOpen ? null : "No workspace open";
const requiresActiveFile = (state: CommandState) => state.activeFile ? null : "No active file";
const requiresMarkdown = (state: CommandState) => {
  if (!state.activeFile) return "No active file";
  return state.markdownActive ? null : "Active file is not Markdown";
};

export const IDE_COMMANDS: readonly CommandDefinition[] = defineCommandRegistry([
  { id: "file.openFolder", name: "File: Open Folder", disabledReason: available },
  { id: "file.closeWorkspace", name: "File: Close Workspace", disabledReason: requiresWorkspace },
  {
    id: "file.save",
    name: "File: Save",
    shortcut: "Mod+S",
    disabledReason: (state) => !state.activeFile
      ? "No active file"
      : state.activeFileSavable ? null : "Active file cannot be saved",
  },
  {
    id: "file.saveAll",
    name: "File: Save All",
    disabledReason: (state) => state.dirtyFileCount > 0 ? null : "No unsaved files",
  },
  { id: "file.newFile", name: "File: New File", disabledReason: requiresWorkspace },
  { id: "file.newFolder", name: "File: New Folder", disabledReason: requiresWorkspace },
  { id: "search.findInFiles", name: "Search: Find in Files", shortcut: "Mod+Shift+F", disabledReason: requiresWorkspace },
  { id: "git.showSourceControl", name: "Git: Show Source Control", shortcut: "Mod+Shift+G", disabledReason: requiresWorkspace },
  { id: "view.showExplorer", name: "View: Show Explorer", disabledReason: available },
  { id: "view.showSearch", name: "View: Show Search", disabledReason: available },
  { id: "view.toggleTerminal", name: "View: Toggle Terminal", disabledReason: available },
  { id: "view.toggleOutput", name: "View: Toggle Output", disabledReason: available },
  { id: "view.focusObserver", name: "View: Focus Observer", disabledReason: available },
  {
    id: "terminal.new",
    name: "Terminal: New Terminal",
    disabledReason: (state) => !state.workspaceOpen
      ? "No workspace open"
      : state.terminalCreating
        ? "Terminal is starting"
        : state.terminalActive ? "A terminal is already open" : null,
  },
  {
    id: "run.currentFile",
    name: "Run: Run Current File",
    shortcut: "Mod+R",
    disabledReason: (state) => !state.activeFile
      ? "No active file"
      : state.runActive
        ? "A file is already running"
        : state.activeFileRunnable ? null : "Active file is not runnable",
  },
  {
    id: "run.stop",
    name: "Run: Stop Current Run",
    disabledReason: (state) => state.runActive ? null : "No active run",
  },
  {
    id: "observer.ask",
    name: "Observer: Ask Observer",
    shortcut: "Mod+Enter",
    disabledReason: (state) => !state.activeFile
      ? "No active file"
      : state.observerCanAsk ? null : "Observer is unavailable for the current context",
  },
  { id: "markdown.edit", name: "Markdown: Edit Mode", disabledReason: requiresMarkdown },
  { id: "markdown.preview", name: "Markdown: Preview Mode", disabledReason: requiresMarkdown },
  { id: "markdown.split", name: "Markdown: Split Mode", disabledReason: requiresMarkdown },
  { id: "preferences.openSettings", name: "Preferences: Open Settings", shortcut: "Mod+,", disabledReason: available },
  {
    id: "window.openWelcome",
    name: "Window: Open Welcome Screen",
    disabledReason: (state) => state.welcomeOpen ? "Welcome screen is already open" : null,
  },
]);

export function defineCommandRegistry<T extends readonly CommandDefinition[]>(commands: T): T {
  const ids = new Set<string>();
  const shortcuts = new Set<string>();
  for (const command of commands) {
    if (ids.has(command.id)) throw new Error(`Duplicate command ID: ${command.id}`);
    ids.add(command.id);
    if (!command.shortcut) continue;
    const shortcut = command.shortcut.toLocaleLowerCase("en-US").replaceAll(" ", "");
    if (shortcuts.has(shortcut)) throw new Error(`Conflicting command shortcut: ${command.shortcut}`);
    shortcuts.add(shortcut);
  }
  return commands;
}

export function resolveCommands(state: CommandState, handlers: CommandHandlers): ResolvedCommand[] {
  return IDE_COMMANDS.map((command) => ({
    ...command,
    disabledReasonText: command.disabledReason(state),
    execute: handlers[command.id],
  }));
}

function fuzzyScore(candidate: string, query: string): number | null {
  const value = candidate.toLocaleLowerCase("en-US");
  const needle = query.trim().toLocaleLowerCase("en-US");
  if (!needle) return 0;
  const direct = value.indexOf(needle);
  if (direct >= 0) return direct;
  let candidateIndex = 0;
  let score = 0;
  for (const character of needle) {
    const found = value.indexOf(character, candidateIndex);
    if (found < 0) return null;
    score += found - candidateIndex;
    candidateIndex = found + 1;
  }
  return 100 + score;
}

export function filterCommands(commands: readonly ResolvedCommand[], query: string): ResolvedCommand[] {
  return commands
    .map((command, index) => ({ command, index, score: fuzzyScore(command.name, query) }))
    .filter((item): item is { command: ResolvedCommand; index: number; score: number } => item.score !== null)
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map((item) => item.command);
}

export function commandShortcutLabel(shortcut: string | undefined, platform: string): string | null {
  if (!shortcut) return null;
  return shortcut.replace("Mod", platform === "darwin" ? "Cmd" : "Ctrl");
}

export interface PaletteShortcutEvent {
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  key: string;
}

export function shouldOpenCommandPalette(event: PaletteShortcutEvent): boolean {
  return (event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && event.key.toLowerCase() === "p";
}

export function shouldOpenSettings(event: PaletteShortcutEvent): boolean {
  return (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key === ",";
}

export function shouldOpenSourceControl(event: PaletteShortcutEvent): boolean {
  return (event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && event.key.toLowerCase() === "g";
}

export function isTerminalKeyboardTarget(target: unknown): boolean {
  const element = target as { closest?: (selector: string) => unknown } | null;
  return typeof element?.closest === "function" && Boolean(element.closest(".xterm"));
}

export function shouldPreserveTerminalShortcut(target: unknown, command: "save" | "run"): boolean {
  return (command === "save" || command === "run") && isTerminalKeyboardTarget(target);
}
