import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  const msg = "VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sont requis. Verifiez votre .env";
  console.error(msg);
  if (import.meta.env.DEV) throw new Error(msg);
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder"
);
