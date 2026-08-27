import { Pool } from "pg";
import { config } from "../config.js";
import { publicAuthClient, serviceClient } from "../supabase.js";
import { signLocalJwt, verifyLocalJwt } from "./local-jwt.js";

export interface AuthUser {
  id: string;
  email: string | null;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
  created_at?: string;
}

interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface AuthError {
  message: string;
  status?: number;
}

type AuthResult<T> = Promise<{ data: T | null; error: AuthError | null }>;

export interface AuthProvider {
  signInWithPassword(email: string, password: string): AuthResult<{ session: AuthSession; user: AuthUser }>;
  refreshSession(refreshToken: string): AuthResult<{ session: AuthSession; user: AuthUser }>;
  getUser(accessToken: string): AuthResult<{ user: AuthUser }>;
  signOut(accessToken?: string, refreshToken?: string): Promise<void>;
  createUser(input: { email: string; password: string; appMetadata: Record<string, unknown> }): AuthResult<{ user: AuthUser }>;
  deleteUser(userId: string): Promise<{ error: AuthError | null }>;
  setUserBan(userId: string, disabled: boolean): Promise<{ error: AuthError | null }>;
  updatePassword(userId: string, password: string): Promise<{ error: AuthError | null }>;
}

const authFailure = (message: string, status?: number) => ({ data: null, error: { message, status } });

class SupabaseAuthProvider implements AuthProvider {
  async signInWithPassword(email: string, password: string) {
    const { data, error } = await publicAuthClient().auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user) return authFailure(error?.message ?? "Authentication failed", error?.status);
    return { data: { session: data.session, user: data.user as AuthUser }, error: null };
  }

  async refreshSession(refreshToken: string) {
    const { data, error } = await publicAuthClient().auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session || !data.user) return authFailure(error?.message ?? "Refresh failed", error?.status);
    return { data: { session: data.session, user: data.user as AuthUser }, error: null };
  }

  async getUser(accessToken: string) {
    const { data, error } = await serviceClient.auth.getUser(accessToken);
    if (error || !data.user) return authFailure(error?.message ?? "Session invalid", error?.status);
    return { data: { user: data.user as AuthUser }, error: null };
  }

  async signOut(accessToken?: string, refreshToken?: string) {
    if (!accessToken || !refreshToken) return;
    const client = publicAuthClient();
    const { error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (!error) await client.auth.signOut({ scope: "local" });
  }

  async createUser(input: { email: string; password: string; appMetadata: Record<string, unknown> }) {
    const { data, error } = await serviceClient.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      app_metadata: input.appMetadata,
    });
    if (error || !data.user) return authFailure(error?.message ?? "Create user failed", error?.status);
    return { data: { user: data.user as AuthUser }, error: null };
  }

  async deleteUser(userId: string) {
    const { error } = await serviceClient.auth.admin.deleteUser(userId);
    return { error: error ? { message: error.message, status: error.status } : null };
  }

  async setUserBan(userId: string, disabled: boolean) {
    const { error } = await serviceClient.auth.admin.updateUserById(userId, { ban_duration: disabled ? "876000h" : "none" });
    return { error: error ? { message: error.message, status: error.status } : null };
  }

  async updatePassword(userId: string, password: string) {
    const { error } = await serviceClient.auth.admin.updateUserById(userId, { password });
    return { error: error ? { message: error.message, status: error.status } : null };
  }
}

interface LocalUserRow {
  id: string;
  email: string;
  raw_app_meta_data: Record<string, unknown>;
  raw_user_meta_data: Record<string, unknown>;
  created_at: Date;
}

class LocalAuthProvider implements AuthProvider {
  private readonly pool = new Pool({ connectionString: config.LOCAL_DATABASE_URL });
  private readonly secret = config.LOCAL_JWT_SECRET!;

  private toUser(row: LocalUserRow): AuthUser {
    return {
      id: row.id,
      email: row.email,
      app_metadata: row.raw_app_meta_data ?? {},
      user_metadata: row.raw_user_meta_data ?? {},
      created_at: row.created_at?.toISOString?.() ?? String(row.created_at),
    };
  }

  private issueSession(user: AuthUser): AuthSession {
    const common = {
      sub: user.id,
      role: "authenticated" as const,
      email: user.email ?? undefined,
      aud: "authenticated",
      app_metadata: user.app_metadata,
      user_metadata: user.user_metadata,
    };
    return {
      access_token: signLocalJwt({ ...common, type: "access" }, this.secret, 60 * 60),
      refresh_token: signLocalJwt({ ...common, type: "refresh" }, this.secret, 60 * 60 * 24 * 7),
      expires_in: 60 * 60,
    };
  }

  private async findActiveUser(userId: string) {
    const result = await this.pool.query<LocalUserRow>(
      `select id, email, raw_app_meta_data, raw_user_meta_data, created_at
       from auth.users
       where id = $1 and (banned_until is null or banned_until <= now())`,
      [userId],
    );
    return result.rows[0] ?? null;
  }

  async signInWithPassword(email: string, password: string) {
    try {
      const result = await this.pool.query<LocalUserRow>(
        `select id, email, raw_app_meta_data, raw_user_meta_data, created_at
         from auth.users
         where lower(email) = lower($1)
           and encrypted_password = crypt($2, encrypted_password)
           and (banned_until is null or banned_until <= now())`,
        [email, password],
      );
      const row = result.rows[0];
      if (!row) return authFailure("Invalid credentials", 401);
      const user = this.toUser(row);
      return { data: { session: this.issueSession(user), user }, error: null };
    } catch (error) {
      return authFailure(error instanceof Error ? error.message : "Local authentication failed", 500);
    }
  }

  async refreshSession(refreshToken: string) {
    try {
      const payload = verifyLocalJwt(refreshToken, this.secret, "refresh");
      const row = await this.findActiveUser(payload.sub);
      if (!row) return authFailure("User unavailable", 401);
      const user = this.toUser(row);
      return { data: { session: this.issueSession(user), user }, error: null };
    } catch {
      return authFailure("Invalid refresh token", 401);
    }
  }

  async getUser(accessToken: string) {
    try {
      const payload = verifyLocalJwt(accessToken, this.secret, "access");
      const row = await this.findActiveUser(payload.sub);
      if (!row) return authFailure("User unavailable", 401);
      return { data: { user: this.toUser(row) }, error: null };
    } catch {
      return authFailure("Invalid access token", 401);
    }
  }

  async signOut() {
    // Local sessions are short-lived signed tokens. There is no remote session store to revoke.
  }

  async createUser(input: { email: string; password: string; appMetadata: Record<string, unknown> }) {
    try {
      const result = await this.pool.query<LocalUserRow>(
        `insert into auth.users (email, encrypted_password, raw_app_meta_data, raw_user_meta_data, email_confirmed_at)
         values (lower($1), crypt($2, gen_salt('bf')), $3::jsonb, '{}'::jsonb, now())
         returning id, email, raw_app_meta_data, raw_user_meta_data, created_at`,
        [input.email, input.password, JSON.stringify(input.appMetadata)],
      );
      const row = result.rows[0];
      if (!row) return authFailure("Create user returned no row", 500);
      return { data: { user: this.toUser(row) }, error: null };
    } catch (error) {
      const databaseError = error as { code?: string; message?: string };
      return authFailure(databaseError.message ?? "Create user failed", databaseError.code === "23505" ? 422 : 500);
    }
  }

  async deleteUser(userId: string) {
    try {
      await this.pool.query("delete from auth.users where id = $1", [userId]);
      return { error: null };
    } catch (error) {
      return { error: { message: error instanceof Error ? error.message : "Delete user failed", status: 500 } };
    }
  }

  async setUserBan(userId: string, disabled: boolean) {
    try {
      await this.pool.query("update auth.users set banned_until = case when $2 then now() + interval '100 years' else null end, updated_at = now() where id = $1", [userId, disabled]);
      return { error: null };
    } catch (error) {
      return { error: { message: error instanceof Error ? error.message : "Update user failed", status: 500 } };
    }
  }

  async updatePassword(userId: string, password: string) {
    try {
      await this.pool.query("update auth.users set encrypted_password = crypt($2, gen_salt('bf')), updated_at = now() where id = $1", [userId, password]);
      return { error: null };
    } catch (error) {
      return { error: { message: error instanceof Error ? error.message : "Update password failed", status: 500 } };
    }
  }
}

export const authProvider: AuthProvider = config.isLocalLite ? new LocalAuthProvider() : new SupabaseAuthProvider();
