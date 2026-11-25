import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { ObjectGetResult, ObjectPutOptions, ObjectStorage } from "./types.js";

export type S3CompatibleConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** MinIO / some S3-compat need path-style; R2 usually works with virtual-hosted. */
  forcePathStyle?: boolean;
};

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (typeof (body as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray === "function") {
    const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
    return Buffer.from(bytes);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * S3-compatible adapter — works with MinIO (dev) and Cloudflare R2 (prod).
 * Swap only env vars; no call-site changes.
 */
export class S3CompatibleObjectStorage implements ObjectStorage {
  readonly driver = "s3" as const;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(cfg: S3CompatibleConfig) {
    this.bucket = cfg.bucket;
    this.client = new S3Client({
      region: cfg.region || "auto",
      endpoint: cfg.endpoint,
      forcePathStyle: cfg.forcePathStyle ?? true,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    });
  }

  async ensureReady(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      } catch (err) {
        const name = (err as { name?: string })?.name ?? "";
        if (name !== "BucketAlreadyOwnedByYou" && name !== "BucketAlreadyExists") {
          throw err;
        }
      }
    }
  }

  async put(key: string, body: Buffer | string, opts?: ObjectPutOptions): Promise<void> {
    const bytes = typeof body === "string" ? Buffer.from(body, "utf8") : body;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key.replace(/^\/+/, ""),
        Body: bytes,
        ContentType: opts?.contentType,
        Metadata: opts?.metadata,
      }),
    );
  }

  async get(key: string): Promise<ObjectGetResult | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key.replace(/^\/+/, ""),
        }),
      );
      const body = await streamToBuffer(res.Body);
      return { body, contentType: res.ContentType };
    } catch (err) {
      const name = (err as { name?: string })?.name ?? "";
      const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      if (name === "NoSuchKey" || name === "NotFound" || status === 404) return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key.replace(/^\/+/, ""),
      }),
    );
  }
}
