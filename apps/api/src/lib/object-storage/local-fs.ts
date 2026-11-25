import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ObjectGetResult, ObjectPutOptions, ObjectStorage } from "./types.js";

function resolveSafe(root: string, key: string): string {
  const normalized = key.replace(/^\/+/, "").replace(/\\/g, "/");
  if (!normalized || normalized.includes("..")) {
    throw new Error("Invalid object key");
  }
  const full = path.resolve(root, ...normalized.split("/"));
  const rootResolved = path.resolve(root);
  if (full !== rootResolved && !full.startsWith(rootResolved + path.sep)) {
    throw new Error("Invalid object key");
  }
  return full;
}

export class LocalFsObjectStorage implements ObjectStorage {
  readonly driver = "local" as const;

  constructor(private readonly rootDir: string) {}

  async ensureReady(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
  }

  async put(key: string, body: Buffer | string, _opts?: ObjectPutOptions): Promise<void> {
    const full = resolveSafe(this.rootDir, key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  }

  async get(key: string): Promise<ObjectGetResult | null> {
    try {
      const full = resolveSafe(this.rootDir, key);
      const body = await readFile(full);
      return { body };
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(resolveSafe(this.rootDir, key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return;
      throw err;
    }
  }
}
