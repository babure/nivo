/**
 * Object storage port (DIP).
 * MinIO locally, Cloudflare R2 (S3-compatible) in production — swap via factory only.
 */
export type ObjectPutOptions = {
  contentType?: string;
  metadata?: Record<string, string>;
};

export type ObjectGetResult = {
  body: Buffer;
  contentType?: string;
};

export interface ObjectStorage {
  readonly driver: "local" | "s3";
  put(key: string, body: Buffer | string, opts?: ObjectPutOptions): Promise<void>;
  get(key: string): Promise<ObjectGetResult | null>;
  delete(key: string): Promise<void>;
  /** Ensure bucket/root exists (no-op for local). */
  ensureReady(): Promise<void>;
}
