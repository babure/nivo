import type { EncryptedBlob } from "@nivo/shared";
import { ensureObjectStorageReady, getObjectStorage } from "./object-storage/index.js";

/**
 * Application-facing blob helpers.
 * Backed by ObjectStorage (local disk or S3-compatible MinIO/R2).
 */

export async function writeJsonBlob(relKey: string, value: unknown): Promise<void> {
  const store = await ensureObjectStorageReady();
  await store.put(relKey, JSON.stringify(value), { contentType: "application/json" });
}

export async function readJsonBlob<T>(relKey: string): Promise<T | null> {
  const store = getObjectStorage();
  const obj = await store.get(relKey);
  if (!obj) return null;
  return JSON.parse(obj.body.toString("utf8")) as T;
}

export async function writeEncryptedBlob(relKey: string, blob: EncryptedBlob): Promise<void> {
  await writeJsonBlob(relKey, blob);
}

export async function readEncryptedBlob(relKey: string): Promise<EncryptedBlob | null> {
  return readJsonBlob<EncryptedBlob>(relKey);
}

export async function writeBinaryBlob(
  relKey: string,
  body: Buffer,
  contentType?: string,
): Promise<void> {
  const store = await ensureObjectStorageReady();
  await store.put(relKey, body, { contentType });
}

export async function readBinaryBlob(relKey: string): Promise<{ body: Buffer; contentType?: string } | null> {
  const store = getObjectStorage();
  return store.get(relKey);
}

export async function removeStorageKey(relKey: string): Promise<void> {
  try {
    const store = getObjectStorage();
    await store.delete(relKey);
  } catch {
    /* ignore missing / not configured in tests that never write */
  }
}
