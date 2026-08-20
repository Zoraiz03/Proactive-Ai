import type { IpcResult } from "./workspace";

export const AUTH_CHANNELS = {
  state: "auth:state",
  signIn: "auth:sign-in",
  signOut: "auth:sign-out",
  changed: "auth:changed",
} as const;

export interface DesktopAuthUser {
  id: string;
  email: string;
  name: string;
}

export type DesktopAuthState =
  | { status: "initializing" }
  | { status: "signed_out" }
  | { status: "signed_in"; user: DesktopAuthUser }
  | { status: "configuration_error"; message: string };

export interface DesktopSignInRequest {
  email: string;
  password: string;
}

export interface DesktopAuthBridge {
  getState: () => Promise<DesktopAuthState>;
  signIn: (request: DesktopSignInRequest) => Promise<IpcResult<DesktopAuthUser>>;
  signOut: () => Promise<IpcResult<void>>;
  onStateChanged: (listener: (state: DesktopAuthState) => void) => () => void;
}

