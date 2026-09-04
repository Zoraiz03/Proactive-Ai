import type { DesktopAuthState, DesktopAuthUser, DesktopSignInRequest } from "../shared/auth";
import type { IpcResult } from "../shared/workspace";
import { SessionStorageError, type EncryptedAuthSessionStore, type StoredAuthSession } from "./auth-session-store.ts";

export interface AuthenticatedSession {
  tokens: StoredAuthSession;
  user: DesktopAuthUser;
}

export interface DesktopAuthProvider {
  restore: (tokens: StoredAuthSession) => Promise<AuthenticatedSession>;
  signIn: (email: string, password: string) => Promise<AuthenticatedSession>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  onSessionChanged: (listener: (session: AuthenticatedSession | null) => void) => () => void;
  dispose: () => void;
}

export function parseSignInRequest(request: unknown): DesktopSignInRequest | null {
  if (typeof request !== "object" || request === null) return null;
  const { email, password } = request as Partial<DesktopSignInRequest>;
  if (
    typeof email !== "string" || email.length > 320 ||
    typeof password !== "string" || password.length < 1 || password.length > 1_024
  ) return null;
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return null;
  return { email: normalizedEmail, password };
}

function publicAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/invalid login credentials/i.test(message)) return "Incorrect email or password.";
  if (/email not confirmed/i.test(message)) return "Confirm your email before signing in.";
  if (/network|fetch failed|failed to fetch/i.test(message)) return "Unable to reach the authentication service.";
  if (/secure operating-system session storage/i.test(message)) return message;
  return "Sign-in failed. Check your details and try again.";
}

export class DesktopAuthController {
  private state: DesktopAuthState = { status: "initializing" };
  private readonly listeners = new Set<(state: DesktopAuthState) => void>();
  private readonly unsubscribeProvider: () => void;
  private readonly provider: DesktopAuthProvider | null;
  private readonly store: EncryptedAuthSessionStore | null;
  private readonly configurationError: string | null;

  constructor(
    provider: DesktopAuthProvider | null,
    store: EncryptedAuthSessionStore | null,
    configurationError: string | null = null
  ) {
    this.provider = provider;
    this.store = store;
    this.configurationError = configurationError;
    this.unsubscribeProvider = provider?.onSessionChanged((session) => {
      void this.handleProviderSession(session);
    }) ?? (() => undefined);
  }

  getState(): DesktopAuthState {
    return this.state;
  }

  isAuthenticated(): boolean {
    return this.state.status === "signed_in";
  }

  async getAccessToken(): Promise<string | null> {
    if (!this.provider || !this.isAuthenticated()) return null;
    return this.provider.getAccessToken();
  }

  subscribe(listener: (state: DesktopAuthState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async initialize(): Promise<void> {
    if (!this.provider || !this.store) {
      this.setState({
        status: "configuration_error",
        message: this.configurationError ?? "Desktop authentication is not configured.",
      });
      return;
    }
    try {
      await this.store.ensureAvailable();
    } catch (error) {
      this.setState({
        status: "configuration_error",
        message: error instanceof Error ? error.message : "Secure session storage is unavailable.",
      });
      return;
    }
    try {
      const stored = await this.store.load();
      if (!stored) {
        this.setState({ status: "signed_out" });
        return;
      }
      const session = await this.provider.restore(stored);
      await this.store.save(session.tokens);
      this.setState({ status: "signed_in", user: session.user });
    } catch (error) {
      if (error instanceof SessionStorageError) {
        this.setState({ status: "configuration_error", message: error.message });
        return;
      }
      await this.store.clear().catch(() => undefined);
      this.setState({ status: "signed_out" });
    }
  }

  async signIn(request: unknown): Promise<IpcResult<DesktopAuthUser>> {
    if (!this.provider || !this.store || this.state.status === "configuration_error") {
      return { ok: false, error: this.configurationError ?? "Desktop authentication is not configured." };
    }
    const parsed = parseSignInRequest(request);
    if (!parsed) return { ok: false, error: "Enter a valid email address and password." };
    try {
      const session = await this.provider.signIn(parsed.email, parsed.password);
      await this.store.save(session.tokens);
      this.setState({ status: "signed_in", user: session.user });
      return { ok: true, value: session.user };
    } catch (error) {
      await this.provider.signOut().catch(() => undefined);
      await this.store.clear().catch(() => undefined);
      this.setState({ status: "signed_out" });
      return { ok: false, error: publicAuthError(error) };
    }
  }

  async signOut(): Promise<IpcResult<void>> {
    try {
      await this.provider?.signOut();
    } catch {
      // Local secure data is cleared even if the remote logout request fails.
    }
    try {
      await this.store?.clear();
      this.setState({ status: "signed_out" });
      return { ok: true, value: undefined };
    } catch {
      return { ok: false, error: "The local desktop session could not be cleared." };
    }
  }

  dispose(): void {
    this.unsubscribeProvider();
    this.provider?.dispose();
    this.listeners.clear();
  }

  private async handleProviderSession(session: AuthenticatedSession | null): Promise<void> {
    if (!session) {
      await this.store?.clear().catch(() => undefined);
      if (this.state.status === "signed_in") this.setState({ status: "signed_out" });
      return;
    }
    try {
      await this.store?.save(session.tokens);
      this.setState({ status: "signed_in", user: session.user });
    } catch {
      await this.provider?.signOut().catch(() => undefined);
      await this.store?.clear().catch(() => undefined);
      this.setState({ status: "signed_out" });
    }
  }

  private setState(state: DesktopAuthState): void {
    this.state = state;
    this.listeners.forEach((listener) => listener(state));
  }
}
