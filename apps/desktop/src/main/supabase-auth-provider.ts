import { createClient, type AuthChangeEvent, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { DesktopAuthUser } from "../shared/auth";
import type { StoredAuthSession } from "./auth-session-store";
import type { AuthenticatedSession, DesktopAuthProvider } from "./auth-controller";

function storedTokens(session: Session): StoredAuthSession {
  return {
    version: 1,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
  };
}

export class SupabaseDesktopAuthProvider implements DesktopAuthProvider {
  private readonly client: SupabaseClient;
  private readonly listeners = new Set<(session: AuthenticatedSession | null) => void>();
  private readonly unsubscribeAuth: () => void;
  private currentUser: DesktopAuthUser | null = null;
  private generation = 0;

  constructor(url: string, publishableKey: string) {
    this.client = createClient(url, publishableKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
    const { data } = this.client.auth.onAuthStateChange((event, session) => {
      this.handleAuthEvent(event, session);
    });
    this.unsubscribeAuth = () => data.subscription.unsubscribe();
  }

  async restore(tokens: StoredAuthSession): Promise<AuthenticatedSession> {
    const { data, error } = await this.client.auth.setSession({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });
    if (error || !data.session || !data.user) throw error ?? new Error("Stored session is invalid.");
    const { data: verified, error: verificationError } = await this.client.auth.getUser(
      data.session.access_token
    );
    if (verificationError || !verified.user) {
      throw verificationError ?? new Error("Stored session is invalid.");
    }
    return this.toAuthenticatedSession(data.session, verified.user);
  }

  async signIn(email: string, password: string): Promise<AuthenticatedSession> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user) throw error ?? new Error("Sign-in returned no session.");
    return this.toAuthenticatedSession(data.session, data.user);
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut({ scope: "local" });
    if (error) throw error;
  }

  onSessionChanged(listener: (session: AuthenticatedSession | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.unsubscribeAuth();
    this.client.auth.stopAutoRefresh();
    this.listeners.clear();
  }

  private handleAuthEvent(event: AuthChangeEvent, session: Session | null): void {
    if (event === "INITIAL_SESSION" || event === "SIGNED_IN") return;
    if (event === "SIGNED_OUT" || !session) {
      this.generation += 1;
      this.currentUser = null;
      this.listeners.forEach((listener) => listener(null));
      return;
    }
    if (event === "TOKEN_REFRESHED" && this.currentUser) {
      const authenticated = { tokens: storedTokens(session), user: this.currentUser };
      this.listeners.forEach((listener) => listener(authenticated));
      return;
    }
    if (event !== "USER_UPDATED") return;
    const generation = ++this.generation;
    void this.toAuthenticatedSession(session, session.user).then((authenticated) => {
      if (generation !== this.generation) return;
      this.listeners.forEach((listener) => listener(authenticated));
    }).catch(() => undefined);
  }

  private async toAuthenticatedSession(session: Session, user: User): Promise<AuthenticatedSession> {
    const { data: profile } = await this.client
      .from("profiles")
      .select("name")
      .eq("id", user.id)
      .maybeSingle();
    const metadataName = typeof user.user_metadata?.name === "string" ? user.user_metadata.name : "";
    const profileName = typeof profile?.name === "string" ? profile.name : metadataName;
    const publicUser: DesktopAuthUser = {
      id: user.id,
      email: user.email ?? "",
      name: profileName,
    };
    this.currentUser = publicUser;
    return { tokens: storedTokens(session), user: publicUser };
  }
}
