import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

const authOptions = { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false };
const serverSupabaseUrl = config.isLocalLite
  ? config.LOCAL_POSTGREST_URL!
  : config.SUPABASE_INTERNAL_URL ?? config.SUPABASE_URL;

const localPostgrestFetch: typeof fetch = async (input, init) => {
  const requestUrl = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  requestUrl.pathname = requestUrl.pathname.replace(/^\/rest\/v1(?=\/|$)/, "");
  if (typeof input === "string" || input instanceof URL) return fetch(requestUrl, init);
  return fetch(new Request(requestUrl, input), init);
};

const localGlobal = config.isLocalLite ? { fetch: localPostgrestFetch } : undefined;

export function publicSupabaseUrl(value: string) {
  const publicBase = new URL(config.SUPABASE_URL);
  const target = new URL(value);
  return new URL(`${target.pathname}${target.search}${target.hash}`, publicBase).toString();
}

export const serviceClient = createClient(serverSupabaseUrl, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: authOptions,
  db: { schema: config.SUPABASE_SCHEMA },
  ...(localGlobal && { global: localGlobal }),
});

export const publicAuthClient = () => createClient(serverSupabaseUrl, config.SUPABASE_PUBLISHABLE_KEY, {
  auth: authOptions,
  db: { schema: config.SUPABASE_SCHEMA },
  ...(localGlobal && { global: localGlobal }),
});

export const userClient = (accessToken: string) => createClient(serverSupabaseUrl, config.SUPABASE_PUBLISHABLE_KEY, {
  auth: authOptions,
  db: { schema: config.SUPABASE_SCHEMA },
  global: {
    ...(localGlobal ?? {}),
    headers: { Authorization: `Bearer ${accessToken}` },
  },
});

export const schemaTable = (table: string) => serviceClient.schema(config.SUPABASE_SCHEMA).from(table);
