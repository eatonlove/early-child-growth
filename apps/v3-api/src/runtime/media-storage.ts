import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { config } from "../config.js";
import { publicSupabaseUrl, serviceClient } from "../supabase.js";

interface StorageError {
  message: string;
}

interface UploadOptions {
  contentType?: string;
  cacheControl?: string;
  upsert?: boolean;
}

interface MediaStorage {
  createSignedUploadUrl(path: string): Promise<{ data: { path: string; token: string } | null; error: StorageError | null }>;
  list(folder: string, options: { search?: string; limit?: number }): Promise<{ data: Array<{ name: string }> | null; error: StorageError | null }>;
  upload(path: string, body: Buffer, options: UploadOptions): Promise<{ error: StorageError | null }>;
  remove(path: string): Promise<{ error: StorageError | null }>;
  download(path: string): Promise<{ data: Buffer | null; error: StorageError | null }>;
  createSignedUrl(path: string, expiresIn: number): Promise<{ data: { signedUrl: string } | null; error: StorageError | null }>;
  readSigned(path: string, expires: number, signature: string): Promise<Buffer | null>;
}

class SupabaseMediaStorage implements MediaStorage {
  private bucket() {
    return serviceClient.storage.from(config.SUPABASE_STORAGE_BUCKET);
  }

  async createSignedUploadUrl(path: string) {
    const { data, error } = await this.bucket().createSignedUploadUrl(path);
    return { data: data ? { path: data.path, token: data.token } : null, error };
  }

  async list(folder: string, options: { search?: string; limit?: number }) {
    const { data, error } = await this.bucket().list(folder, options);
    return { data: data?.map((item) => ({ name: item.name })) ?? null, error };
  }

  async upload(path: string, body: Buffer, options: UploadOptions) {
    const { error } = await this.bucket().upload(path, body, options);
    return { error };
  }

  async download(path: string) {
    const { data, error } = await this.bucket().download(path);
    if (error || !data) return { data: null, error };
    try {
      return { data: Buffer.from(await data.arrayBuffer()), error: null };
    } catch (reason) {
      return { data: null, error: { message: reason instanceof Error ? reason.message : "Storage download failed" } };
    }
  }

  async remove(path: string) {
    const { error } = await this.bucket().remove([path]);
    return { error };
  }

  async createSignedUrl(path: string, expiresIn: number) {
    const { data, error } = await this.bucket().createSignedUrl(path, expiresIn);
    return { data: data ? { signedUrl: publicSupabaseUrl(data.signedUrl) } : null, error };
  }

  async readSigned() {
    return null;
  }
}

class LocalMediaStorage implements MediaStorage {
  private readonly root = resolve(config.LOCAL_MEDIA_ROOT);
  private readonly secret = config.LOCAL_JWT_SECRET!;

  private filePath(path: string) {
    const fullPath = resolve(this.root, path);
    if (fullPath !== this.root && !fullPath.startsWith(`${this.root}${sep}`)) throw new Error("Invalid media path");
    return fullPath;
  }

  private signature(path: string, expires: number) {
    return createHmac("sha256", this.secret).update(`${path}\n${expires}`).digest("base64url");
  }

  async createSignedUploadUrl(path: string) {
    return { data: { path, token: randomUUID() }, error: null };
  }

  async list(folder: string, options: { search?: string; limit?: number }) {
    try {
      const entries = await readdir(this.filePath(folder), { withFileTypes: true });
      const data = entries
        .filter((entry) => entry.isFile() && (!options.search || entry.name.includes(options.search)))
        .slice(0, options.limit ?? 100)
        .map((entry) => ({ name: entry.name }));
      return { data, error: null };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return { data: [], error: null };
      return { data: null, error: { message: error instanceof Error ? error.message : "Local media list failed" } };
    }
  }

  async upload(path: string, body: Buffer, options: UploadOptions) {
    try {
      const target = this.filePath(path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, body, { flag: options.upsert ? "w" : "wx" });
      return { error: null };
    } catch (error) {
      return { error: { message: error instanceof Error ? error.message : "Local media upload failed" } };
    }
  }

  async download(path: string) {
    try {
      return { data: await readFile(this.filePath(path)), error: null };
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : "Local media download failed" } };
    }
  }

  async remove(path: string) {
    try {
      await unlink(this.filePath(path));
      return { error: null };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { error: null };
      return { error: { message: error instanceof Error ? error.message : "Local media delete failed" } };
    }
  }

  async createSignedUrl(path: string, expiresIn: number) {
    try {
      await stat(this.filePath(path));
      const expires = Math.floor(Date.now() / 1000) + expiresIn;
      const publicBaseUrl = config.LOCAL_MEDIA_PUBLIC_BASE_URL ?? config.PUBLIC_APP_URL;
      const url = new URL("/api/local-media", publicBaseUrl);
      url.searchParams.set("path", path);
      url.searchParams.set("expires", String(expires));
      url.searchParams.set("signature", this.signature(path, expires));
      const signedUrl = config.LOCAL_MEDIA_PUBLIC_BASE_URL ? url.toString() : `${url.pathname}${url.search}`;
      return { data: { signedUrl }, error: null };
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : "Local media URL failed" } };
    }
  }

  async readSigned(path: string, expires: number, suppliedSignature: string) {
    if (!Number.isInteger(expires) || expires <= Math.floor(Date.now() / 1000)) return null;
    const expected = Buffer.from(this.signature(path, expires));
    const supplied = Buffer.from(suppliedSignature);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
    try {
      return await readFile(this.filePath(path));
    } catch {
      return null;
    }
  }
}

export const mediaStorage: MediaStorage = config.isLocalLite ? new LocalMediaStorage() : new SupabaseMediaStorage();

export function localMediaContentType(path: string) {
  const extension = extname(path).toLowerCase();
  return ({
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  } as Record<string, string>)[extension] ?? "application/octet-stream";
}
