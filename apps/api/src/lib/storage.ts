import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EncryptedBlob } from "@nivo/shared";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../storage");

export function storagePath(...parts: string[]): string {
  return join(ROOT, ...parts);
}

export async function writeJsonBlob(relKey: string, value: unknown): Promise<void> {
  const full = storagePath(relKey);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, JSON.stringify(value), "utf8");
}

export async function readJsonBlob<T>(relKey: string): Promise<T | null> {
  try {
    const raw = await readFile(storagePath(relKey), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeEncryptedBlob(relKey: string, blob: EncryptedBlob): Promise<void> {
  await writeJsonBlob(relKey, blob);
}

export async function readEncryptedBlob(relKey: string): Promise<EncryptedBlob | null> {
  return readJsonBlob<EncryptedBlob>(relKey);
}

export async function removeStorageKey(relKey: string): Promise<void> {
  try {
    await unlink(storagePath(relKey));
  } catch {
    /* ignore missing */
  }
}

export { ROOT as STORAGE_ROOT };
