import { createHash, randomUUID } from "node:crypto";
import {
  decryptField,
  deriveKeyFromSecret,
  encryptField,
  type identitySchema,
} from "@nivo/shared";
import type { z } from "zod";
import type { AuditLogger } from "../../lib/audit.js";
import { AppError } from "../../lib/errors.js";
import type { Repositories } from "../../repositories/types.js";

export type IdentityInput = z.infer<typeof identitySchema>;

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const FILE_KINDS = [
  "passport",
  "selfie",
  "address_proof",
  "completion_proof",
  "signature",
  "other",
] as const;
export type FileKind = (typeof FILE_KINDS)[number];

/** Verify real content type from magic bytes — never trust the client MIME header. */
export function sniffMime(buf: Buffer): "application/pdf" | "image/jpeg" | "image/png" | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  return null;
}

export type MaskedIdentity = {
  complete: boolean;
  fullName: string | null;
  passportNumber: string | null;
  updatedAt: Date | null;
  files: { id: string; kind: string; mime: string; sizeBytes: number }[];
};

export class IdentityService {
  private readonly key: Buffer;
  private readonly now: () => Date;

  constructor(
    private readonly deps: {
      repos: Repositories;
      audit: AuditLogger;
      encryptionSecret: string;
      now?: () => Date;
    },
  ) {
    this.key = deriveKeyFromSecret(deps.encryptionSecret);
    this.now = deps.now ?? (() => new Date());
  }

  async save(userId: string, input: IdentityInput): Promise<void> {
    const { repos, audit } = this.deps;
    const profile = await repos.profiles.get(userId);
    if (!profile) throw new AppError("NOT_FOUND", "Profile not found.");
    if (profile.paymentStatus !== "paid") {
      throw new AppError("PAYMENT_REQUIRED", "Complete payment before submitting identity details.");
    }

    const permanent = input.permanentSameAsCurrent ? input.currentAddress : input.permanentAddress;
    const payload = encryptField(
      JSON.stringify({ ...input, permanentAddress: permanent }),
      this.key,
      "v1",
    );
    await repos.identity.save({
      userId,
      payload,
      fullNameMasked: input.fullName
        .split(/\s+/)
        .map((w) => (w ? `${[...w][0]}${"*".repeat(Math.max(0, [...w].length - 1))}` : w))
        .join(" "),
      passportLast3: input.passportNumber.slice(-3),
      updatedAt: this.now(),
    });
    await repos.consents.add({
      id: randomUUID(),
      userId,
      kind: "identity",
      version: "1",
      ipHash: null,
      acceptedAt: this.now(),
    });
    await repos.profiles.patch(userId, { identityComplete: true });
    await audit.append({ actorId: userId, action: "identity.saved", entityType: "user", entityId: userId });
    // blocked_account may now be available; keep SIM state consistent.
  }

  async getMasked(userId: string): Promise<MaskedIdentity> {
    const [row, files] = await Promise.all([
      this.deps.repos.identity.get(userId),
      this.deps.repos.identity.listFiles(userId),
    ]);
    return {
      complete: row !== null,
      fullName: row?.fullNameMasked ?? null,
      passportNumber: row ? `******${row.passportLast3}` : null,
      updatedAt: row?.updatedAt ?? null,
      files: files.map((f) => ({ id: f.id, kind: f.kind, mime: f.mime, sizeBytes: f.sizeBytes })),
    };
  }

  /** Privileged full reveal. Always audited with the acting staff member and reason. */
  async reveal(studentId: string, actorId: string, reason: string): Promise<IdentityInput> {
    const row = await this.deps.repos.identity.get(studentId);
    if (!row) throw new AppError("NOT_FOUND", "No identity record.");
    await this.deps.audit.append({
      actorId,
      action: "identity.reveal",
      entityType: "user",
      entityId: studentId,
      meta: { reason },
    });
    return JSON.parse(decryptField(row.payload, this.key)) as IdentityInput;
  }

  async addFile(userId: string, kind: FileKind, data: Buffer): Promise<{ id: string; mime: string; sizeBytes: number }> {
    if (data.length === 0) throw new AppError("UPLOAD_REJECTED", "Empty file.");
    if (data.length > MAX_UPLOAD_BYTES) throw new AppError("UPLOAD_REJECTED", "File exceeds 5 MB.");
    const mime = sniffMime(data);
    if (!mime) throw new AppError("UPLOAD_REJECTED", "Only PDF, JPEG or PNG files are accepted.");

    const profile = await this.deps.repos.profiles.get(userId);
    if (profile?.paymentStatus !== "paid") {
      throw new AppError("PAYMENT_REQUIRED", "Complete payment before uploading documents.");
    }

    const id = randomUUID();
    await this.deps.repos.identity.addFile({
      id,
      userId,
      kind,
      mime,
      sizeBytes: data.length,
      sha256: createHash("sha256").update(data).digest("hex"),
      blob: encryptField(data.toString("base64"), this.key, "v1"),
      createdAt: this.now(),
    });
    await this.deps.audit.append({
      actorId: userId,
      action: "identity.file_uploaded",
      entityType: "identity_file",
      entityId: id,
      meta: { kind, mime, sizeBytes: data.length },
    });
    return { id, mime, sizeBytes: data.length };
  }

  async removeFile(userId: string, fileId: string): Promise<void> {
    const file = await this.deps.repos.identity.getFile(fileId);
    if (!file || file.userId !== userId) {
      throw new AppError("NOT_FOUND", "File not found.");
    }
    const removed = await this.deps.repos.identity.deleteFile(fileId);
    if (!removed) throw new AppError("NOT_FOUND", "File not found.");
    await this.deps.audit.append({
      actorId: userId,
      action: "identity.file_deleted",
      entityType: "identity_file",
      entityId: fileId,
      meta: { kind: file.kind },
    });
  }

  /** Decrypt and return file bytes for authenticated owner View/Download. */
  async getFileContent(
    userId: string,
    fileId: string,
  ): Promise<{ body: Buffer; mime: string; kind: string; filename: string }> {
    const file = await this.deps.repos.identity.getFile(fileId);
    if (!file || file.userId !== userId) {
      throw new AppError("NOT_FOUND", "File not found.");
    }
    return this.decryptFile(file);
  }

  /** Admin proof review: load file by id after the caller has authorised access. */
  async getFileContentById(
    fileId: string,
  ): Promise<{ body: Buffer; mime: string; kind: string; filename: string; userId: string }> {
    const file = await this.deps.repos.identity.getFile(fileId);
    if (!file) throw new AppError("NOT_FOUND", "File not found.");
    const decrypted = this.decryptFile(file);
    return { ...decrypted, userId: file.userId };
  }

  private decryptFile(file: {
    id: string;
    mime: string;
    kind: string;
    blob: Parameters<typeof decryptField>[0];
  }): { body: Buffer; mime: string; kind: string; filename: string } {
    const b64 = decryptField(file.blob, this.key);
    const body = Buffer.from(b64, "base64");
    const ext =
      file.mime === "application/pdf" ? "pdf" : file.mime === "image/png" ? "png" : "jpg";
    return {
      body,
      mime: file.mime,
      kind: file.kind,
      filename: `${file.kind}-${file.id.slice(0, 8)}.${ext}`,
    };
  }

  /** Student DSR export: masked metadata + decrypted payload (REQ-ID-04). */
  async exportForUser(userId: string): Promise<{
    exportedAt: string;
    identity: IdentityInput | null;
    files: { id: string; kind: string; mime: string; sizeBytes: number; sha256: string; createdAt: string }[];
  }> {
    const [row, files] = await Promise.all([
      this.deps.repos.identity.get(userId),
      this.deps.repos.identity.listFiles(userId),
    ]);
    await this.deps.audit.append({
      actorId: userId,
      action: "identity.exported",
      entityType: "user",
      entityId: userId,
    });
    return {
      exportedAt: this.now().toISOString(),
      identity: row ? (JSON.parse(decryptField(row.payload, this.key)) as IdentityInput) : null,
      files: files.map((f) => ({
        id: f.id,
        kind: f.kind,
        mime: f.mime,
        sizeBytes: f.sizeBytes,
        sha256: f.sha256,
        createdAt: f.createdAt.toISOString(),
      })),
    };
  }
}
