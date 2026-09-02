import assert from "node:assert/strict";
import test from "node:test";
import {
  IDE_COMMANDS,
  defineCommandRegistry,
  filterCommands,
  resolveCommands,
  shouldOpenCommandPalette,
  shouldOpenSettings,
  shouldOpenSourceControl,
  safeVerificationCommands,
  shouldPreserveTerminalShortcut,
  type CommandDefinition,
  type CommandHandlers,
  type CommandState,
} from "./commands.ts";
import {
  CLOSED_COMMAND_PALETTE,
  commandPaletteReducer,
  executeEnabledCommand,
  restoreCommandPaletteFocus,
} from "./command-palette-state.ts";

const enabledState: CommandState = {
  workspaceOpen: true,
  activeFile: true,
  activeFileSavable: true,
  dirtyFileCount: 2,
  activeFileRunnable: true,
  runActive: false,
  terminalActive: false,
  terminalCreating: false,
  observerCanAsk: true,
  multiFileUndoAvailable: false,
  markdownActive: true,
  welcomeOpen: false,
  hasSelection: true,
  hasDiagnostic: true,
  hasRunFailure: true,
  hasTaskFailure: true,
  contextTrayCount: 1,
};

function handlers(onExecute: (id: string) => void = () => undefined): CommandHandlers {
  return Object.fromEntries(
    IDE_COMMANDS.map((command) => [command.id, () => onExecute(command.id)])
  ) as CommandHandlers;
}

test("opens and closes the command palette with reset search state", () => {
  assert.equal(IDE_COMMANDS.length, 32);
  assert.equal(new Set(IDE_COMMANDS.map((command) => command.id)).size, 32);
  assert.equal(IDE_COMMANDS.find((command) => command.id === "preferences.openSettings")?.shortcut, "Mod+,");
  const opened = commandPaletteReducer(CLOSED_COMMAND_PALETTE, { type: "open" });
  assert.deepEqual(opened, { open: true, query: "", selectedIndex: 0 });
  const queried = commandPaletteReducer(opened, { type: "query", query: "save" });
  assert.equal(queried.query, "save");
  assert.deepEqual(commandPaletteReducer(queried, { type: "close" }), CLOSED_COMMAND_PALETTE);
});

test("filters command names with direct and fuzzy matching", () => {
  const commands = resolveCommands(enabledState, handlers());
  assert.equal(filterCommands(commands, "save all")[0]?.id, "file.saveAll");
  assert.equal(filterCommands(commands, "svall")[0]?.id, "file.saveAll");
  assert.deepEqual(filterCommands(commands, "no command exists"), []);
});

test("keyboard navigation wraps up and down through available results", () => {
  const opened = commandPaletteReducer(CLOSED_COMMAND_PALETTE, { type: "open" });
  const up = commandPaletteReducer(opened, { type: "move", direction: -1, resultCount: 4 });
  assert.equal(up.selectedIndex, 3);
  const down = commandPaletteReducer(up, { type: "move", direction: 1, resultCount: 4 });
  assert.equal(down.selectedIndex, 0);
  assert.equal(
    commandPaletteReducer(down, { type: "move", direction: 1, resultCount: 0 }).selectedIndex,
    0
  );
});

test("executes enabled commands and refuses disabled commands", () => {
  const executed: string[] = [];
  const commands = resolveCommands(enabledState, handlers((id) => executed.push(id)));
  const save = commands.find((command) => command.id === "file.save")!;
  assert.equal(executeEnabledCommand(save), true);
  assert.deepEqual(executed, ["file.save"]);

  const disabled = resolveCommands(
    { ...enabledState, workspaceOpen: false, activeFile: false, activeFileSavable: false },
    handlers((id) => executed.push(id))
  ).find((command) => command.id === "file.newFile")!;
  assert.equal(disabled.disabledReasonText, "No workspace open");
  assert.equal(executeEnabledCommand(disabled), false);
  assert.deepEqual(executed, ["file.save"]);
});

test("rejects duplicate command IDs and conflicting shortcuts", () => {
  const base: CommandDefinition = {
    id: "file.save",
    name: "Save",
    shortcut: "Mod+S",
    disabledReason: () => null,
  };
  assert.throws(
    () => defineCommandRegistry([base, { ...base, name: "Save duplicate" }]),
    /Duplicate command ID/
  );
  assert.throws(
    () => defineCommandRegistry([base, { ...base, id: "file.saveAll", shortcut: "mod+s" }]),
    /Conflicting command shortcut/
  );
});

test("Escape-style close can restore the previously focused element", () => {
  let focusCount = 0;
  restoreCommandPaletteFocus({ focus: () => { focusCount += 1; } });
  restoreCommandPaletteFocus(null);
  assert.equal(focusCount, 1);
});

test("palette is intentionally global while save and run preserve terminal input", () => {
  const paletteEvent = {
    ctrlKey: true,
    metaKey: false,
    shiftKey: true,
    altKey: false,
    key: "P",
  };
  assert.equal(shouldOpenCommandPalette(paletteEvent), true);
  assert.equal(shouldOpenCommandPalette({ ...paletteEvent, shiftKey: false }), false);

  const terminalTarget = { closest: (selector: string) => selector === ".xterm" ? {} : null };
  const monacoTarget = { closest: () => null };
  assert.equal(shouldPreserveTerminalShortcut(terminalTarget, "save"), true);
  assert.equal(shouldPreserveTerminalShortcut(terminalTarget, "run"), true);
  assert.equal(shouldPreserveTerminalShortcut(monacoTarget, "save"), false);
});

test("settings opens only from the intentional global Ctrl/Cmd+Comma shortcut", () => {
  const event = { ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, key: "," };
  assert.equal(shouldOpenSettings(event), true);
  assert.equal(shouldOpenSettings({ ...event, ctrlKey: false, metaKey: true }), true);
  assert.equal(shouldOpenSettings({ ...event, shiftKey: true }), false);
  assert.equal(shouldOpenSettings({ ...event, key: "." }), false);
});

test("Source Control uses the standard non-conflicting Ctrl/Cmd+Shift+G shortcut", () => {
  const event = { ctrlKey: true, metaKey: false, shiftKey: true, altKey: false, key: "G" };
  assert.equal(shouldOpenSourceControl(event), true);
  assert.equal(shouldOpenSourceControl({ ...event, ctrlKey: false, metaKey: true }), true);
  assert.equal(shouldOpenSourceControl({ ...event, shiftKey: false }), false);
});

test("verification commands are explicit and restricted to non-Git validation commands", () => {
  assert.deepEqual(safeVerificationCommands(["npm test", "npx tsc --noEmit"]), ["npm test", "npx tsc --noEmit"]);
  assert.equal(safeVerificationCommands(["git reset --hard"]), null);
  assert.equal(safeVerificationCommands(["npm test && rm -rf build"]), null);
  assert.equal(safeVerificationCommands([]), null);
});
