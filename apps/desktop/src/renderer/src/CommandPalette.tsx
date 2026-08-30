import { useEffect, useMemo, useReducer, useRef } from "react";
import {
  commandShortcutLabel,
  filterCommands,
  type ResolvedCommand,
} from "./commands";
import {
  CLOSED_COMMAND_PALETTE,
  commandPaletteReducer,
  executeEnabledCommand,
  restoreCommandPaletteFocus,
} from "./command-palette-state";

interface CommandPaletteProps {
  commands: readonly ResolvedCommand[];
  openToken: number;
  onClosed: () => void;
}

export default function CommandPalette({ commands, openToken, onClosed }: CommandPaletteProps) {
  const [state, dispatch] = useReducer(commandPaletteReducer, CLOSED_COMMAND_PALETTE);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const results = useMemo(() => filterCommands(commands, state.query), [commands, state.query]);
  const selectedIndex = Math.min(state.selectedIndex, Math.max(0, results.length - 1));

  useEffect(() => {
    if (openToken <= 0) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    dispatch({ type: "open" });
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [openToken]);

  useEffect(() => {
    const command = results[selectedIndex];
    if (state.open && command) {
      document.getElementById(`command-${command.id}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [results, selectedIndex, state.open]);

  const close = () => {
    const target = previousFocusRef.current;
    previousFocusRef.current = null;
    dispatch({ type: "close" });
    onClosed();
    requestAnimationFrame(() => restoreCommandPaletteFocus(target));
  };

  useEffect(() => {
    if (!state.open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      close();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [state.open]);

  const execute = (command: ResolvedCommand) => {
    if (!executeEnabledCommand(command)) return;
    close();
  };

  if (!state.open) return null;

  return (
    <div className="command-palette-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) close();
    }}>
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-palette-title"
      >
        <h2 id="command-palette-title" className="sr-only">Command Palette</h2>
        <input
          ref={inputRef}
          type="text"
          value={state.query}
          onChange={(event) => dispatch({ type: "query", query: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              close();
            } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              dispatch({
                type: "move",
                direction: event.key === "ArrowDown" ? 1 : -1,
                resultCount: results.length,
              });
            } else if (event.key === "Enter" && results[selectedIndex]) {
              event.preventDefault();
              execute(results[selectedIndex]);
            }
          }}
          placeholder="Type a command"
          aria-label="Search IDE commands"
          aria-controls="command-palette-results"
          aria-activedescendant={results[selectedIndex] ? `command-${results[selectedIndex].id}` : undefined}
          autoComplete="off"
        />
        <div id="command-palette-results" className="command-palette-results" role="listbox">
          {results.length === 0 ? (
            <div className="command-palette-empty">No commands match “{state.query}”.</div>
          ) : results.map((command, index) => {
            const shortcut = commandShortcutLabel(command.shortcut, navigator.platform.startsWith("Mac") ? "darwin" : "other");
            const selected = index === selectedIndex;
            return (
              <button
                type="button"
                id={`command-${command.id}`}
                key={command.id}
                role="option"
                aria-selected={selected}
                aria-disabled={Boolean(command.disabledReasonText)}
                className={`${selected ? "selected" : ""} ${command.disabledReasonText ? "disabled" : ""}`}
                onMouseEnter={() => {
                  const movement = index - selectedIndex;
                  for (let step = 0; step < Math.abs(movement); step += 1) {
                    dispatch({ type: "move", direction: movement > 0 ? 1 : -1, resultCount: results.length });
                  }
                }}
                onClick={() => execute(command)}
              >
                <span>
                  <strong>{command.name}</strong>
                  {command.disabledReasonText && <small>{command.disabledReasonText}</small>}
                </span>
                {shortcut && <kbd>{shortcut}</kbd>}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
