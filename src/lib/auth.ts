"use client";

// Auth client backed by Supabase Auth. Sessions live in Supabase's cookies;
// the browser never handles raw tokens or password hashes. The exported
// interface keeps auth details small and never exposes raw tokens.

import { createClient } from "@/lib/supabase/client";

export interface Session {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
}

/** Returns an error message, or null on success. */
export async function signUp(
  name: string,
  email: string,
  password: string
): Promise<string | null> {
  const supabase = createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    // Consumed by the handle_new_user() trigger to seed the profile row.
    options: { data: { name } },
  });
  return error ? error.message : null;
}

/** Returns an error message, or null on success. */
export async function signIn(
  email: string,
  password: string
): Promise<string | null> {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error) return null;
  // Normalise Supabase's wording to match the rest of the app.
  return /invalid login/i.test(error.message)
    ? "Incorrect email or password."
    : error.message;
}

export async function getSession(): Promise<Session | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, role")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? "",
    name: profile?.name ?? "",
    role: (profile?.role as "user" | "admin") ?? "user",
  };
}

export async function signOut(): Promise<void> {
  await createClient().auth.signOut();
}
