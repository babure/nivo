import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppConfig } from "../../config.js";
import { LocalFsObjectStorage } from "./local-fs.js";
import { S3CompatibleObjectStorage } from "./s3-compatible.js";
import type { ObjectStorage } from "./types.js";

export type { ObjectStorage, ObjectGetResult, ObjectPutOptions } from "./types.js";
export { LocalFsObjectStorage } from "./local-fs.js";
export { S3CompatibleObjectStorage } from "./s3-compatible.js";

const DEFAULT_LOCAL_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../storage");

let singleton: ObjectStorage | null = null;
let readyPromise: Promise<void> | null = null;

export type ObjectStorageConfig = Pick<
  AppConfig,
  | "OBJECT_STORAGE"
  | "STORAGE_LOCAL_DIR"
  | "S3_ENDPOINT"
  | "S3_REGION"
  | "S3_BUCKET"
  | "S3_ACCESS_KEY"
  | "S3_SECRET_KEY"
  | "S3_FORCE_PATH_STYLE"
>;

/**
 * Factory (OCP): add drivers without changing callers.
 * - local → disk under STORAGE_LOCAL_DIR
 * - s3    → MinIO / Cloudflare R2 / any S3-compatible
 *
 * Prod R2: set OBJECT_STORAGE=s3 + S3_* to R2 endpoint/creds; call sites unchanged.
 */
export function createObjectStorage(cfg: ObjectStorageConfig): ObjectStorage {
  const driver = (cfg.OBJECT_STORAGE || "local").toLowerCase();
  if (driver === "s3") {
    if (!cfg.S3_ENDPOINT || !cfg.S3_BUCKET || !cfg.S3_ACCESS_KEY || !cfg.S3_SECRET_KEY) {
      throw new Error(
        "OBJECT_STORAGE=s3 requires S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY",
      );
    }
    return new S3CompatibleObjectStorage({
      endpoint: cfg.S3_ENDPOINT,
      region: cfg.S3_REGION || "auto",
      bucket: cfg.S3_BUCKET,
      accessKeyId: cfg.S3_ACCESS_KEY,
      secretAccessKey: cfg.S3_SECRET_KEY,
      forcePathStyle: cfg.S3_FORCE_PATH_STYLE,
    });
  }
  const root = cfg.STORAGE_LOCAL_DIR ? resolve(cfg.STORAGE_LOCAL_DIR) : DEFAULT_LOCAL_ROOT;
  return new LocalFsObjectStorage(root);
}

/** Bind the process-wide storage adapter (call once at startup). */
export function configureObjectStorage(cfg: ObjectStorageConfig): ObjectStorage {
  singleton = createObjectStorage(cfg);
  readyPromise = null;
  return singleton;
}

export function getObjectStorage(): ObjectStorage {
  if (!singleton) {
    throw new Error("Object storage not configured. Call configureObjectStorage() at startup.");
  }
  return singleton;
}

export async function ensureObjectStorageReady(): Promise<ObjectStorage> {
  const store = getObjectStorage();
  if (!readyPromise) readyPromise = store.ensureReady();
  await readyPromise;
  return store;
}

/** Reset singleton (tests). */
export function resetObjectStorageForTests(): void {
  singleton = null;
  readyPromise = null;
}
