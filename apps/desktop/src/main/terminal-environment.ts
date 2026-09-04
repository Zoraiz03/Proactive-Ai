const SAFE_ENVIRONMENT_KEYS = new Set([
  "PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "LC_ALL", "LC_CTYPE",
  "TMPDIR", "TMP", "TEMP", "SystemRoot", "WINDIR", "USERPROFILE", "APPDATA",
  "LOCALAPPDATA", "PATHEXT", "COMSPEC",
]);

export function createTerminalEnvironment(
  environment: NodeJS.ProcessEnv
): Record<string, string> {
  const safeEnvironment: Record<string, string> = {
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
  };
  SAFE_ENVIRONMENT_KEYS.forEach((key) => {
    const value = environment[key];
    if (typeof value === "string") safeEnvironment[key] = value;
  });
  return safeEnvironment;
}

export function selectTerminalShell(
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv
): string {
  if (platform === "win32") return environment.COMSPEC || "powershell.exe";
  if (environment.SHELL?.startsWith("/")) return environment.SHELL;
  return platform === "darwin" ? "/bin/zsh" : "/bin/bash";
}
