import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
function publicKey(value: string) {
  if (value.startsWith("sb_secret_")) return false;
  if (value.startsWith("eyJ")) {
    try {
      return JSON.parse(atob(value.split(".")[1])).role === "anon";
    } catch {
      return false;
    }
  }
  return value.startsWith("sb_publishable_");
}
export const isConfigured = Boolean(
  url &&
  /^https?:\/\//.test(url) &&
  !url.includes("SEU-PROJETO") &&
  key &&
  publicKey(key),
);
export const supabase = isConfigured
  ? createClient(url!, key!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;
export const usernameEmail = (username: string) =>
  `${username.trim().toLowerCase()}@brownieflow.internal`;
