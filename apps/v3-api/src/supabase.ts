import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

const authOptions = { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false };
const serverSupabaseUrl = config.SUPABASE_INTERNAL_URL ?? config.SUPABASE_URL;

export function publicSupabaseUrl(value: string) {
  const publicBase = new URL(config.SUPABASE_URL);
  const target = new URL(value);
  return new URL(`${target.pathname}${target.search}${target.hash}`, publicBase).toString();
}

export const serviceClient = createClient(serverSupabaseUrl, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: authOptions,
  db: { schema: config.SUPABASE_SCHEMA },
});

export const publicAuthClient = () => createClient(serverSupabaseUrl, config.SUPABASE_PUBLISHABLE_KEY, {
  auth: authOptions,
  db: { schema: config.SUPABASE_SCHEMA },
});

export const userClient = (accessToken: string) => createClient(serverSupabaseUrl, config.SUPABASE_PUBLISHABLE_KEY, {
  auth: authOptions,
  db: { schema: config.SUPABASE_SCHEMA },
  global: { headers: { Authorization: `Bearer ${accessToken}` } },
});

export const schemaTable = (table: string) => serviceClient.schema(config.SUPABASE_SCHEMA).from(table);
