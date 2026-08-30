export interface CommandPaletteState {
  open: boolean;
  query: string;
  selectedIndex: number;
}

export type CommandPaletteAction =
  | { type: "open" }
  | { type: "close" }
  | { type: "query"; query: string }
  | { type: "move"; direction: 1 | -1; resultCount: number };

export const CLOSED_COMMAND_PALETTE: CommandPaletteState = {
  open: false,
  query: "",
  selectedIndex: 0,
};

export function commandPaletteReducer(
  state: CommandPaletteState,
  action: CommandPaletteAction
): CommandPaletteState {
  if (action.type === "open") return { open: true, query: "", selectedIndex: 0 };
  if (action.type === "close") return CLOSED_COMMAND_PALETTE;
  if (action.type === "query") return { ...state, query: action.query, selectedIndex: 0 };
  if (action.resultCount <= 0) return { ...state, selectedIndex: 0 };
  return {
    ...state,
    selectedIndex: (state.selectedIndex + action.direction + action.resultCount) % action.resultCount,
  };
}

export function executeEnabledCommand(
  command: { disabledReasonText: string | null; execute: () => void | Promise<void> }
): boolean {
  if (command.disabledReasonText) return false;
  void command.execute();
  return true;
}

export function restoreCommandPaletteFocus(target: { focus: () => void } | null): void {
  target?.focus();
}
