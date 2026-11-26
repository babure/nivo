import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import {
  CheckCircle2,
  Download,
  Eye,
  FileDown,
  FileText,
  Home,
  IdCard,
  ImageIcon,
  KeyRound,
  MapPinned,
  Maximize2,
  PenLine,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
  Undo2,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import {
  PASSWORD_REQUIREMENTS,
  accommodationLeadSchema,
  passwordSchema,
  referralCodeSchema,
} from "@nivo/shared";
import { ActionTable, type ActionColumn } from "../components/ActionTable";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Dialog } from "../components/Dialog";
import { Field, FieldGrid, FormSection, Page } from "../components/Page";
import { Skeleton } from "../components/Skeleton";
import {
  api,
  ApiError,
  downloadAuthenticated,
  fetchAuthenticatedBlob,
  formatApiError,
  uploadFile,
  viewAuthenticated,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { logoutPathFor } from "../lib/navigation";
import { useToast } from "../lib/toast";

const MAX_UPLOAD_MB = 5;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

type Lead = {
  id: string;
  status: string;
  city: string;
  budget: string;
  roomType: string;
  createdAt: string;
};

export function Accommodation() {
  const { user } = useAuth();
  const toast = useToast();
  const [city, setCity] = useState("");
  const [budget, setBudget] = useState("");
  const [roomType, setRoomType] = useState("shared");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [withdrawId, setWithdrawId] = useState<string | null>(null);

  const loadLeads = useCallback(async () => {
    try {
      const res = await api.get<{ leads: Lead[] }>("/v1/accommodation/mine");
      setLeads(res.leads);
      setLoadError(undefined);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load enquiries.");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void loadLeads();
  }, [loadLeads]);

  function openForm() {
    setFormOpen(true);
  }

  function closeForm() {
    if (busy) return;
    setFormOpen(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = accommodationLeadSchema.safeParse({
      city: city.trim(),
      budget: budget.trim() || "flexible",
      roomType,
      phone: phone.trim(),
      notes: notes.trim() || undefined,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue?.path?.join(".") ?? "";
      const msg = path && issue ? `${path}: ${issue.message}` : issue?.message ?? "Check the form and try again.";
      toast.error("Check the form", msg);
      return;
    }
    setBusy(true);
    try {
      await api.post("/v1/accommodation/leads", parsed.data);
      await loadLeads();
      setCity("");
      setBudget("");
      setRoomType("shared");
      setPhone("");
      setNotes("");
      setFormOpen(false);
      toast.success("Enquiry sent");
    } catch (err) {
      toast.error(
        "Could not send enquiry",
        formatApiError(err, "Check phone format and try again."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(id: string) {
    setBusy(true);
    try {
      await api.post(`/v1/accommodation/leads/${id}/withdraw`);
      toast.success("Enquiry withdrawn");
      setWithdrawId(null);
      await loadLeads();
    } catch (err) {
      toast.error("Could not withdraw enquiry", err instanceof ApiError ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const leadColumns = useMemo<ActionColumn<Lead>[]>(
    () => [
      {
        key: "city",
        header: "City",
        cell: (l) => <span className="table-primary">{l.city}</span>,
      },
      {
        key: "room",
        header: "Room",
        cell: (l) => <span className="capitalize">{l.roomType}</span>,
      },
      {
        key: "budget",
        header: "Budget",
        cell: (l) => l.budget,
      },
      {
        key: "status",
        header: "Status",
        cell: (l) => <span className="capitalize">{l.status}</span>,
      },
    ],
    [],
  );

  const newEnquiryBtn = (
    <Button type="button" onClick={openForm}>
      <Plus className="h-4 w-4 shrink-0" aria-hidden />
      New enquiry
    </Button>
  );

  return (
    <Page title="Housing" intro="City, budget and room type — an agent follows up with leads." wide compact embedded>
      <FormSection
        title="Your enquiries"
        description="Requests you’ve already sent. Open a new enquiry when you need another city or budget."
      >
        <div className="mb-3 flex justify-end">{ready && leads.length > 0 ? newEnquiryBtn : null}</div>
        <ActionTable
          columns={leadColumns}
          rows={leads}
          getRowId={(l) => l.id}
          loading={!ready}
          error={loadError}
          emptyTitle="No enquiries yet"
          emptyDescription="Start with a city, budget and room type — an agent will follow up."
          emptyIcon={Home}
          emptyAction={newEnquiryBtn}
          actions={(l) =>
            l.status !== "closed" && l.status !== "booked" ? (
              <button
                type="button"
                className="btn-table"
                disabled={busy}
                onClick={() => setWithdrawId(l.id)}
              >
                <Undo2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Withdraw
              </button>
            ) : (
              <span className="text-xs text-charcoal-soft">—</span>
            )
          }
        />
      </FormSection>

      <ConfirmDialog
        open={withdrawId !== null}
        title="Withdraw this enquiry?"
        description="We'll stop following up on this housing request. You can send a new enquiry anytime."
        confirmLabel="Withdraw"
        tone="danger"
        busy={busy}
        onClose={() => setWithdrawId(null)}
        onConfirm={() => {
          if (withdrawId) return withdraw(withdrawId);
        }}
      />

      <Dialog
        open={formOpen}
        title="New enquiry"
        description="We’ll email Roshan within a minute."
        onClose={closeForm}
        wide
        footer={
          <>
            <Button type="button" className="btn-secondary" disabled={busy} onClick={closeForm}>
              <X className="h-4 w-4 shrink-0" aria-hidden />
              Cancel
            </Button>
            <Button type="submit" form="housing-enquiry-form" disabled={busy}>
              <Send className="h-4 w-4 shrink-0" aria-hidden />
              {busy ? "Sending…" : "Request help"}
            </Button>
          </>
        }
      >
        <form id="housing-enquiry-form" onSubmit={onSubmit} className="space-y-4">
          <FieldGrid>
            <Field label="Preferred city">
              <input className="input" value={city} onChange={(e) => setCity(e.target.value)} required minLength={2} />
            </Field>
            <Field label="Monthly budget">
              <input
                className="input"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="e.g. 600–800 EUR"
                required
              />
            </Field>
            <Field label="Room type">
              <select className="input" value={roomType} onChange={(e) => setRoomType(e.target.value)}>
                <option value="shared">Shared room</option>
                <option value="private">Private room</option>
                <option value="studio">Studio</option>
                <option value="apartment">Apartment</option>
              </select>
            </Field>
            <Field label="Phone (international)" hint="Use international format, e.g. +491701234567">
              <input
                className="input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+49…"
                required
              />
            </Field>
            <Field label="Notes (optional)" className="sm:col-span-2">
              <textarea className="input min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
            </Field>
          </FieldGrid>
          {user ? (
            <p className="text-xs text-charcoal-soft">Signed in as {user.email}. Payment and identity must be complete.</p>
          ) : null}
        </form>
      </Dialog>
    </Page>
  );
}

type IdentityMasked = {
  complete: boolean;
  fullName: string | null;
  passportNumber: string | null;
  files: { id: string; kind: string; mime: string; sizeBytes: number }[];
};

type PaymentStatus = {
  status: string;
  invoices: { number: string; issuedAt: string; documentId?: string | null }[];
};

type InvoiceRow = PaymentStatus["invoices"][number];
type FileRow = IdentityMasked["files"][number];

const FILE_KINDS = [
  {
    value: "passport",
    label: "Passport scan",
    accept: "image/jpeg,image/png,application/pdf",
    formats: "JPEG, PNG or PDF",
    Icon: IdCard,
  },
  {
    value: "selfie",
    label: "Selfie",
    accept: "image/jpeg,image/png",
    formats: "JPEG or PNG",
    Icon: ImageIcon,
  },
  {
    value: "address_proof",
    label: "Address proof",
    accept: "image/jpeg,image/png,application/pdf",
    formats: "JPEG, PNG or PDF",
    Icon: MapPinned,
  },
  {
    value: "signature",
    label: "Signature",
    accept: "image/png",
    formats: "PNG only",
    Icon: PenLine,
  },
] as const;

const OTHER_KIND = {
  value: "other" as const,
  label: "Other document",
  accept: "image/jpeg,image/png,application/pdf",
  formats: "JPEG, PNG or PDF",
  Icon: FileText as LucideIcon,
};

type RequiredFileKind = (typeof FILE_KINDS)[number]["value"];
type FileKind = RequiredFileKind | typeof OTHER_KIND.value;
type KindMeta = (typeof FILE_KINDS)[number] | typeof OTHER_KIND;
type DocTab = "uploads" | "invoices" | "terms";
type StoredDoc = { id: string; kind: string; title: string; createdAt: string };

function kindLabel(kind: string) {
  if (kind === "other") return OTHER_KIND.label;
  return FILE_KINDS.find((k) => k.value === kind)?.label ?? kind.replaceAll("_", " ");
}

function kindMeta(kind: FileKind): KindMeta {
  if (kind === "other") return OTHER_KIND;
  return FILE_KINDS.find((k) => k.value === kind) ?? OTHER_KIND;
}

function mimeAllowed(kind: FileKind, file: File): boolean {
  const meta = kindMeta(kind);
  const allowed = meta.accept.split(",").map((s) => s.trim());
  if (allowed.includes(file.type)) return true;
  const name = file.name.toLowerCase();
  if (kind === "signature") return name.endsWith(".png");
  if (kind === "selfie") return /\.(jpe?g|png)$/.test(name);
  return /\.(jpe?g|png|pdf)$/.test(name);
}

function UploadDocCard({
  kind,
  file,
  disabled,
  busy,
  viewing,
  downloading,
  onUpload,
  onView,
  onDownload,
  onRemove,
}: {
  kind: KindMeta;
  file?: FileRow;
  disabled?: boolean;
  busy?: boolean;
  viewing?: boolean;
  downloading?: boolean;
  onUpload: (file: File) => void;
  onView: () => void;
  onDownload: () => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [previewError, setPreviewError] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const isImage = Boolean(file && (file.mime === "image/jpeg" || file.mime === "image/png"));
  const isPdf = Boolean(file && file.mime === "application/pdf");

  useEffect(() => {
    if (!file) {
      setPreviewUrl(undefined);
      setPreviewError(false);
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    let objectUrl: string | undefined;
    setPreviewLoading(true);
    setPreviewError(false);
    setPreviewUrl(undefined);

    void fetchAuthenticatedBlob(`/v1/identity/files/${file.id}/view`)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
        setPreviewLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setPreviewError(true);
        setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file?.id, file?.mime, file?.sizeBytes]);

  function takeFile(next: File | undefined) {
    if (!next || disabled || busy) return;
    onUpload(next);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    takeFile(e.dataTransfer.files?.[0]);
  }

  const KindIcon = kind.Icon;

  return (
    <div
      className={`flex flex-col rounded-2xl border bg-white p-3 transition ${
        dragOver ? "border-orange bg-orange/[0.04]" : "border-charcoal/10"
      } ${file ? "shadow-soft" : "border-dashed"}`}
      title={`${kind.label}${file ? "" : ` · ${kind.formats} · max ${MAX_UPLOAD_MB} MB`}`}
      onDragEnter={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragOver(false);
      }}
      onDrop={onDrop}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-charcoal">
          <KindIcon className="h-4 w-4 shrink-0 text-orange-dark" aria-hidden strokeWidth={1.75} />
          <span className="truncate text-xs font-semibold">{kind.label}</span>
        </span>
        {file ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" aria-label="Uploaded" strokeWidth={1.75} />
        ) : null}
      </div>

      {file ? (
        <div className="mt-2 space-y-2">
          <button
            type="button"
            className="group relative block h-28 w-full shrink-0 overflow-hidden rounded-xl border border-charcoal/10 bg-[#FAF8F5] text-left sm:h-32"
            onClick={() => {
              if (previewUrl) setLightboxOpen(true);
              else void onView();
            }}
            aria-label={`Preview ${kind.label}`}
          >
            <div className="relative h-28 w-full overflow-hidden sm:h-32">
              {previewLoading ? <Skeleton className="absolute inset-0 h-full w-full rounded-none" /> : null}
              {!previewLoading && previewUrl && isImage ? (
                <img
                  src={previewUrl}
                  alt={`${kind.label} preview`}
                  className="absolute inset-0 h-full w-full object-cover object-center"
                />
              ) : null}
              {!previewLoading && previewUrl && isPdf ? (
                <iframe
                  title={`${kind.label} preview`}
                  src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                  className="pointer-events-none absolute inset-0 h-full w-full border-0 bg-white"
                />
              ) : null}
              {!previewLoading && (previewError || !previewUrl) ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <FileText className="h-7 w-7 text-charcoal-soft" aria-hidden strokeWidth={1.5} />
                </div>
              ) : null}
            </div>
          </button>
          <div className="flex items-center justify-center gap-1">
            <button
              type="button"
              className="btn-secondary h-8 w-8 p-0"
              disabled={viewing}
              onClick={onView}
              aria-label={viewing ? "Opening…" : `View ${kind.label}`}
              title="View"
            >
              <Eye className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              className="btn-secondary h-8 w-8 p-0"
              disabled={downloading}
              onClick={onDownload}
              aria-label={downloading ? "Downloading…" : `Download ${kind.label}`}
              title="Download"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              className="btn-secondary h-8 w-8 p-0"
              disabled={disabled || busy}
              onClick={() => inputRef.current?.click()}
              aria-label={busy ? "Uploading…" : `Replace ${kind.label}`}
              title="Replace"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              className="btn-secondary h-8 w-8 p-0"
              disabled={busy}
              onClick={onRemove}
              aria-label={`Remove ${kind.label}`}
              title="Remove"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          className="mt-2 flex h-28 w-full shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-charcoal/15 bg-[#FAF8F5]/80 px-3 text-center transition hover:border-orange/40 hover:bg-orange/[0.03] disabled:cursor-not-allowed disabled:opacity-50 sm:h-32"
          aria-label={busy ? `Uploading ${kind.label}` : `Upload ${kind.label}`}
        >
          {busy ? (
            <Upload className="h-6 w-6 animate-pulse text-orange-dark" aria-hidden strokeWidth={1.75} />
          ) : (
            <KindIcon className="h-6 w-6 text-orange-dark" aria-hidden strokeWidth={1.75} />
          )}
          <span className="text-sm font-semibold text-charcoal">
            {busy ? "Uploading…" : kind.label}
          </span>
          <span className="text-[11px] leading-snug text-charcoal-soft">
            {busy ? "Please wait" : `Drop or click · ${kind.formats}`}
          </span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept={kind.accept}
        disabled={disabled || busy}
        onChange={(e) => {
          takeFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <Dialog
        open={lightboxOpen && Boolean(previewUrl)}
        title={kind.label}
        description={`${file?.mime ?? ""} · ${file ? Math.max(1, Math.round(file.sizeBytes / 1024)) : 0} KB`}
        onClose={() => setLightboxOpen(false)}
        wide
        footer={
          <>
            <Button type="button" className="btn-secondary" onClick={() => setLightboxOpen(false)}>
              <X className="h-4 w-4 shrink-0" aria-hidden />
              Close
            </Button>
            <Button type="button" className="btn-secondary" disabled={viewing} onClick={onView}>
              <Maximize2 className="h-4 w-4 shrink-0" aria-hidden />
              Open full size
            </Button>
          </>
        }
      >
        {previewUrl && isImage ? (
          <img src={previewUrl} alt={`${kind.label} full preview`} className="mx-auto max-h-[60vh] w-auto max-w-full rounded-lg object-contain" />
        ) : null}
        {previewUrl && isPdf ? (
          <iframe
            title={`${kind.label} full preview`}
            src={`${previewUrl}#toolbar=1`}
            className="h-[60vh] w-full rounded-lg border border-charcoal/10 bg-white"
          />
        ) : null}
      </Dialog>
    </div>
  );
}

export function Documents() {
  const toast = useToast();
  const [tab, setTab] = useState<DocTab>("uploads");
  const [identity, setIdentity] = useState<IdentityMasked | null>(null);
  const [payments, setPayments] = useState<PaymentStatus | null>(null);
  const [storedDocs, setStoredDocs] = useState<StoredDoc[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [uploadingKind, setUploadingKind] = useState<FileKind>();
  const [exporting, setExporting] = useState(false);
  const [downloading, setDownloading] = useState<string>();
  const [viewing, setViewing] = useState<string>();
  const [deletingId, setDeletingId] = useState<string>();
  const [removeTarget, setRemoveTarget] = useState<FileRow | null>(null);
  const [pendingReplace, setPendingReplace] = useState<{
    kind: FileKind;
    file: File;
    replaceFileIds: string[];
  } | null>(null);
  const otherInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [id, pay, docs] = await Promise.all([
        api.get<IdentityMasked>("/v1/identity"),
        api.get<PaymentStatus>("/v1/payments/status"),
        api.get<{ documents: StoredDoc[] }>("/v1/documents"),
      ]);
      setIdentity(id);
      setPayments(pay);
      setStoredDocs(docs.documents ?? []);
      setLoadError(undefined);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load documents.");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function requestUploadKind(kind: FileKind, file: File | null, opts?: { replaceFileIds?: string[] }) {
    if (!file) return;
    const replaceIds =
      opts?.replaceFileIds ??
      (kind === "other"
        ? []
        : (identity?.files ?? []).filter((f) => f.kind === kind).map((f) => f.id));
    if (replaceIds.length > 0) {
      setPendingReplace({ kind, file, replaceFileIds: replaceIds });
      return;
    }
    void uploadKind(kind, file, { replaceFileIds: replaceIds });
  }

  async function uploadKind(kind: FileKind, file: File, opts?: { replaceFileIds?: string[] }) {
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("File too large", `Maximum size is ${MAX_UPLOAD_MB} MB.`);
      return;
    }
    if (!mimeAllowed(kind, file)) {
      toast.error("Invalid file type", `Use ${kindMeta(kind).formats}.`);
      return;
    }
    setUploadingKind(kind);
    try {
      const replaceIds = opts?.replaceFileIds ?? [];
      await uploadFile(`/v1/identity/files?kind=${kind}`, file);
      for (const id of replaceIds) {
        try {
          await api.delete(`/v1/identity/files/${id}`);
        } catch {
          /* best-effort replace */
        }
      }
      toast.success("Uploaded", kindLabel(kind));
      setPendingReplace(null);
      await load();
    } catch (err) {
      toast.error("Upload failed", err instanceof ApiError ? err.message : undefined);
    } finally {
      setUploadingKind(undefined);
    }
  }

  async function exportIdentity() {
    setExporting(true);
    try {
      const data = await api.get<unknown>("/v1/identity/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "nivo-identity-export.json";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch (err) {
      toast.error("Export failed", err instanceof ApiError ? err.message : undefined);
    } finally {
      setExporting(false);
    }
  }

  async function viewInvoice(inv: InvoiceRow) {
    if (!inv.documentId) {
      toast.error("PDF not ready yet");
      return;
    }
    setViewing(inv.number);
    try {
      await viewAuthenticated(`/v1/documents/${inv.documentId}/view`);
    } catch (err) {
      toast.error("Could not open invoice", err instanceof ApiError ? err.message : undefined);
    } finally {
      setViewing(undefined);
    }
  }

  async function downloadInvoice(inv: InvoiceRow) {
    if (!inv.documentId) {
      toast.error("PDF not ready yet");
      return;
    }
    setDownloading(inv.number);
    try {
      await downloadAuthenticated(`/v1/documents/${inv.documentId}/download`, `${inv.number}.pdf`);
      toast.success("Invoice downloaded");
    } catch (err) {
      toast.error("Download failed", err instanceof ApiError ? err.message : undefined);
    } finally {
      setDownloading(undefined);
    }
  }

  async function viewFile(f: FileRow) {
    setViewing(f.id);
    try {
      await viewAuthenticated(`/v1/identity/files/${f.id}/view`);
    } catch (err) {
      toast.error("Could not open file", err instanceof ApiError ? err.message : undefined);
    } finally {
      setViewing(undefined);
    }
  }

  async function downloadFile(f: FileRow) {
    setDownloading(f.id);
    try {
      const ext = f.mime === "application/pdf" ? "pdf" : f.mime === "image/png" ? "png" : "jpg";
      await downloadAuthenticated(`/v1/identity/files/${f.id}/download`, `${f.kind}.${ext}`);
      toast.success("Downloaded", kindLabel(f.kind));
    } catch (err) {
      toast.error("Download failed", err instanceof ApiError ? err.message : undefined);
    } finally {
      setDownloading(undefined);
    }
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    setDeletingId(removeTarget.id);
    try {
      await api.delete(`/v1/identity/files/${removeTarget.id}`);
      toast.success("Document removed", kindLabel(removeTarget.kind));
      setRemoveTarget(null);
      await load();
    } catch (err) {
      toast.error("Could not remove document", err instanceof ApiError ? err.message : undefined);
    } finally {
      setDeletingId(undefined);
    }
  }

  const invoices = payments?.invoices ?? [];
  const termsDocs = useMemo(() => storedDocs.filter((d) => d.kind === "terms_pdf"), [storedDocs]);
  const files = identity?.files ?? [];
  const fileByKind = useMemo(() => {
    const map = new Map<string, FileRow>();
    for (const f of files) {
      if (f.kind === "other") continue;
      const prev = map.get(f.kind);
      if (!prev) map.set(f.kind, f);
    }
    return map;
  }, [files]);
  const otherFiles = useMemo(() => files.filter((f) => f.kind === "other"), [files]);
  const uploadsLocked = ready && !identity?.complete;
  const otherBusy = uploadingKind === "other";

  const invoiceColumns = useMemo<ActionColumn<InvoiceRow>[]>(
    () => [
      {
        key: "number",
        header: "Invoice",
        cell: (inv) => <span className="table-primary">{inv.number}</span>,
      },
      {
        key: "issued",
        header: "Issued",
        cell: (inv) => (
          <span className="table-meta">
            {inv.issuedAt ? new Date(inv.issuedAt).toLocaleDateString() : "—"}
          </span>
        ),
      },
      {
        key: "format",
        header: "Format",
        cell: () => <span className="table-meta">PDF</span>,
      },
    ],
    [],
  );

  return (
    <Page
      title="Document store"
      intro="Upload required scans, open your service-fee invoices, and download accepted Terms."
      wide
      compact
      embedded
    >
      <div className="space-y-5">
        <div
          className="flex w-full rounded-xl border border-charcoal/10 bg-[#FAF8F5] p-1 sm:inline-flex sm:w-auto"
          role="tablist"
          aria-label="Document store sections"
        >
          {(
            [
              ["uploads", "Uploads"],
              ["invoices", "Invoices"],
              ["terms", "Terms"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`min-h-tap flex-1 rounded-lg px-3.5 py-1.5 text-sm font-medium transition sm:flex-none ${
                tab === id ? "bg-white text-charcoal shadow-sm" : "text-charcoal-soft hover:text-charcoal"
              }`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {loadError ? <p role="alert" className="text-sm font-medium text-red-700">{loadError}</p> : null}

        {tab === "uploads" ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-charcoal-soft">
                {identity?.complete
                  ? `Masked: ${identity.fullName} · passport ${identity.passportNumber}`
                  : "Finish identity onboarding before uploading scans."}
              </p>
              <div className="flex flex-wrap gap-2">
                {!identity?.complete && ready ? (
                  <Link to="/onboarding/identity" className="btn-secondary text-sm no-underline">
                    Continue details
                  </Link>
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!ready || exporting || !identity?.complete}
                  onClick={() => void exportIdentity()}
                >
                  <FileDown className="h-4 w-4 shrink-0" aria-hidden />
                  {exporting ? "Exporting…" : "Export my data"}
                </Button>
              </div>
            </div>

            {!ready ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-52 w-full rounded-2xl" />
                ))}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {FILE_KINDS.map((kind) => {
                  const file = fileByKind.get(kind.value);
                  return (
                    <UploadDocCard
                      key={kind.value}
                      kind={kind}
                      file={file}
                      disabled={uploadsLocked}
                      busy={uploadingKind === kind.value || Boolean(file && deletingId === file.id)}
                      viewing={Boolean(file && viewing === file.id)}
                      downloading={Boolean(file && downloading === file.id)}
                      onUpload={(f) => requestUploadKind(kind.value, f)}
                      onView={() => {
                        if (file) void viewFile(file);
                      }}
                      onDownload={() => {
                        if (file) void downloadFile(file);
                      }}
                      onRemove={() => {
                        if (file) setRemoveTarget(file);
                      }}
                    />
                  );
                })}

                {otherFiles.map((file, i) => (
                  <UploadDocCard
                    key={file.id}
                    kind={{ ...OTHER_KIND, label: otherFiles.length > 1 ? `Other ${i + 1}` : OTHER_KIND.label }}
                    file={file}
                    disabled={uploadsLocked}
                    busy={deletingId === file.id || otherBusy}
                    viewing={viewing === file.id}
                    downloading={downloading === file.id}
                    onUpload={(f) => requestUploadKind("other", f, { replaceFileIds: [file.id] })}
                    onView={() => void viewFile(file)}
                    onDownload={() => void downloadFile(file)}
                    onRemove={() => setRemoveTarget(file)}
                  />
                ))}

                <button
                  type="button"
                  disabled={uploadsLocked || otherBusy}
                  onClick={() => otherInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    requestUploadKind("other", e.dataTransfer.files?.[0] ?? null);
                  }}
                  className="flex min-h-[11.5rem] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-charcoal/20 bg-transparent px-3 py-5 text-center transition hover:border-orange/50 hover:bg-orange/[0.03] disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={otherBusy ? "Uploading other document" : "Add other document"}
                  title={`Add other document · ${OTHER_KIND.formats} · max ${MAX_UPLOAD_MB} MB`}
                >
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-charcoal/25 text-orange-dark">
                    {otherBusy ? (
                      <Upload className="h-5 w-5 animate-pulse" aria-hidden strokeWidth={1.75} />
                    ) : (
                      <Plus className="h-5 w-5" aria-hidden strokeWidth={1.75} />
                    )}
                  </span>
                  <span className="text-sm font-semibold text-charcoal">
                    {otherBusy ? "Uploading…" : "Add other document"}
                  </span>
                  <span className="text-[11px] leading-snug text-charcoal-soft">
                    {otherBusy ? "Please wait" : `${OTHER_KIND.formats} · max ${MAX_UPLOAD_MB} MB`}
                  </span>
                </button>
                <input
                  ref={otherInputRef}
                  type="file"
                  className="sr-only"
                  accept={OTHER_KIND.accept}
                  disabled={uploadsLocked || otherBusy}
                  onChange={(e) => {
                    requestUploadKind("other", e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
              </div>
            )}
            {uploadsLocked ? (
              <p className="text-xs text-charcoal-soft">
                Uploads unlock after payment and identity details are complete.
              </p>
            ) : null}
          </div>
        ) : tab === "invoices" ? (
          <ActionTable
            columns={invoiceColumns}
            rows={invoices}
            getRowId={(inv) => inv.number}
            loading={!ready}
            emptyTitle="No invoices yet"
            emptyDescription="A receipt appears here after you activate your account."
            emptyIcon={FileText}
            actions={(inv) => (
              <>
                <button
                  type="button"
                  className="btn-table-icon"
                  disabled={!inv.documentId || viewing === inv.number}
                  onClick={() => void viewInvoice(inv)}
                  aria-label={
                    !inv.documentId ? "Invoice pending" : viewing === inv.number ? "Opening…" : `View ${inv.number}`
                  }
                  title={!inv.documentId ? "Pending" : "View"}
                >
                  <Eye className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  className="btn-table-icon"
                  disabled={!inv.documentId || downloading === inv.number}
                  onClick={() => void downloadInvoice(inv)}
                  aria-label={
                    !inv.documentId
                      ? "Invoice pending"
                      : downloading === inv.number
                        ? "Downloading…"
                        : `Download ${inv.number}`
                  }
                  title={!inv.documentId ? "Pending" : "Download"}
                >
                  <Download className="h-3.5 w-3.5" aria-hidden />
                </button>
              </>
            )}
          />
        ) : (
          <ActionTable
            columns={[
              {
                key: "title",
                header: "Document",
                cell: (d: StoredDoc) => <span className="table-primary">{d.title}</span>,
              },
              {
                key: "created",
                header: "Accepted",
                cell: (d: StoredDoc) => (
                  <span className="table-meta">
                    {d.createdAt ? new Date(d.createdAt).toLocaleDateString() : "—"}
                  </span>
                ),
              },
              {
                key: "format",
                header: "Format",
                cell: () => <span className="table-meta">PDF</span>,
              },
            ]}
            rows={termsDocs}
            getRowId={(d) => d.id}
            loading={!ready}
            emptyTitle="No Terms PDF yet"
            emptyDescription="Accept the Terms (at register or re-accept) to generate a copy here."
            emptyIcon={FileText}
            actions={(d) => (
              <>
                <button
                  type="button"
                  className="btn-table-icon"
                  disabled={viewing === d.id}
                  onClick={() => {
                    setViewing(d.id);
                    void viewAuthenticated(`/v1/documents/${d.id}/view`)
                      .catch((err) =>
                        toast.error(
                          "Could not open Terms PDF",
                          err instanceof ApiError ? err.message : undefined,
                        ),
                      )
                      .finally(() => setViewing(undefined));
                  }}
                  aria-label={`View ${d.title}`}
                  title="View"
                >
                  <Eye className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  className="btn-table-icon"
                  disabled={downloading === d.id}
                  onClick={() => {
                    setDownloading(d.id);
                    void downloadAuthenticated(`/v1/documents/${d.id}/download`, `${d.title}.pdf`)
                      .then(() => toast.success("Terms PDF downloaded"))
                      .catch((err) =>
                        toast.error("Download failed", err instanceof ApiError ? err.message : undefined),
                      )
                      .finally(() => setDownloading(undefined));
                  }}
                  aria-label={`Download ${d.title}`}
                  title="Download"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden />
                </button>
              </>
            )}
          />
        )}
      </div>

      <ConfirmDialog
        open={removeTarget !== null}
        title="Remove document?"
        description={
          removeTarget
            ? `${kindLabel(removeTarget.kind)} · ${Math.max(1, Math.round(removeTarget.sizeBytes / 1024))} KB will be deleted. You can upload again later.`
            : undefined
        }
        confirmLabel="Remove"
        tone="danger"
        busy={Boolean(deletingId)}
        onClose={() => {
          if (!deletingId) setRemoveTarget(null);
        }}
        onConfirm={() => confirmRemove()}
      >
        This only removes the uploaded scan from NIVO. It does not change your passport details form.
      </ConfirmDialog>

      <ConfirmDialog
        open={pendingReplace !== null}
        title="Replace this document?"
        description={
          pendingReplace
            ? `The existing ${kindLabel(pendingReplace.kind)} file will be removed after the new upload succeeds.`
            : undefined
        }
        confirmLabel="Replace"
        tone="danger"
        busy={Boolean(pendingReplace && uploadingKind === pendingReplace.kind)}
        onClose={() => setPendingReplace(null)}
        onConfirm={() => {
          if (pendingReplace) {
            return uploadKind(pendingReplace.kind, pendingReplace.file, {
              replaceFileIds: pendingReplace.replaceFileIds,
            });
          }
        }}
      />
    </Page>
  );
}

export function Profile() {
  const { user, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [referral, setReferral] = useState<{
    attributed: boolean;
    shareProgressWithConsultancy: boolean;
    organisation: { name: string; code: string } | null;
  } | null>(null);
  const [referralCodeInput, setReferralCodeInput] = useState("");
  const [shareProgress, setShareProgress] = useState(false);
  const [confirmDeletion, setConfirmDeletion] = useState(false);
  const [confirmReferral, setConfirmReferral] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    void api
      .get<{
        attributed: boolean;
        shareProgressWithConsultancy: boolean;
        organisation: { name: string; code: string } | null;
      }>("/v1/me/referral")
      .then((res) => {
        setReferral(res);
        setShareProgress(res.shareProgressWithConsultancy);
      })
      .catch(() => undefined);
  }, []);

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (user?.passwordSet && !currentPassword) {
      toast.error("Enter your current password");
      return;
    }
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      toast.error("Check the form", parsed.error.issues[0]?.message ?? PASSWORD_REQUIREMENTS);
      return;
    }
    try {
      await api.post("/v1/me/password", {
        password: parsed.data,
        ...(user?.passwordSet ? { currentPassword } : {}),
      });
      toast.success("Password updated");
      setPassword("");
      setCurrentPassword("");
      await refresh();
    } catch (e) {
      toast.error("Could not update password", formatApiError(e, "Could not update password."));
    }
  }

  function saveReferral(e: FormEvent) {
    e.preventDefault();
    if (!referral?.attributed && !referralCodeInput.trim()) {
      toast.error("Enter a referral code to link a consultancy");
      return;
    }
    if (!referral?.attributed && referralCodeInput.trim()) {
      const codeParsed = referralCodeSchema.safeParse(referralCodeInput.trim());
      if (!codeParsed.success) {
        toast.error("Check the form", codeParsed.error.issues[0]?.message ?? "Enter a valid referral code.");
        return;
      }
      setConfirmReferral(true);
      return;
    }
    void doSaveReferral();
  }

  async function doSaveReferral() {
    try {
      const body: { code?: string; shareProgressWithConsultancy: boolean } = {
        shareProgressWithConsultancy: shareProgress,
      };
      if (!referral?.attributed && referralCodeInput.trim()) {
        const codeParsed = referralCodeSchema.safeParse(referralCodeInput.trim());
        if (!codeParsed.success) {
          toast.error("Check the form", codeParsed.error.issues[0]?.message ?? "Enter a valid referral code.");
          return;
        }
        body.code = codeParsed.data;
      }
      const res = await api.post<{
        attributed: boolean;
        shareProgressWithConsultancy: boolean;
        organisation: { name: string; code: string } | null;
      }>("/v1/me/referral", body);
      setReferral(res);
      setShareProgress(res.shareProgressWithConsultancy);
      setReferralCodeInput("");
      setConfirmReferral(false);
      toast.success(
        res.organisation ? `Linked with ${res.organisation.name}` : "Referral preferences saved",
      );
    } catch (e) {
      toast.error(
        "Could not update referral",
        formatApiError(e, "Check the code and try again."),
      );
    }
  }

  function requestDeletion(e: FormEvent) {
    e.preventDefault();
    setConfirmDeletion(true);
  }

  async function doRequestDeletion() {
    try {
      await api.post("/v1/me/deletion-request", {
        ...(user?.passwordSet ? { password: currentPassword || password } : { confirmEmail }),
      });
      toast.success("Deletion requested", "We’ll process it shortly.");
      setConfirmDeletion(false);
      const role = user?.role;
      await signOut();
      navigate(logoutPathFor(role), { replace: true });
    } catch (e) {
      toast.error("Could not request deletion", e instanceof ApiError ? e.message : undefined);
    }
  }

  function paint(x: number, y: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#2D2A26";
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  async function uploadSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("empty");
      const file = new File([blob], "signature.png", { type: "image/png" });
      await uploadFile("/v1/identity/files?kind=signature", file);
      toast.success("Signature saved", "Stored encrypted.");
    } catch (e) {
      toast.error("Could not save signature", e instanceof ApiError ? e.message : undefined);
    }
  }

  return (
    <Page title="You" intro="Security, signature and privacy for your account." wide compact embedded>
      <div className="space-y-4">
        <FormSection
          title="Consultancy referral"
          description="Who invited you — and whether they can see your contact details."
        >
          {referral?.attributed && referral.organisation ? (
            <p className="text-sm text-charcoal">
              Invited by <span className="font-medium">{referral.organisation.name}</span>
              <span className="ml-2 font-mono text-xs text-charcoal-soft">{referral.organisation.code}</span>
            </p>
          ) : (
            <p className="text-sm text-charcoal-soft">No consultancy linked yet.</p>
          )}
          <form onSubmit={saveReferral} className="mt-3 space-y-3">
            {!referral?.attributed && (
              <Field label="Referral code">
                <input
                  className="input"
                  value={referralCodeInput}
                  onChange={(e) => setReferralCodeInput(e.target.value)}
                  placeholder="From your consultancy link"
                />
              </Field>
            )}
            {(referral?.attributed || referralCodeInput.trim()) && (
              <label className="flex min-h-tap items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0 accent-orange"
                  checked={shareProgress}
                  onChange={(e) => setShareProgress(e.target.checked)}
                />
                <span>Share my progress (email/phone) with my consultancy.</span>
              </label>
            )}
            <Button type="submit" variant="secondary">
              <Save className="h-4 w-4 shrink-0" aria-hidden />
              Save referral settings
            </Button>
          </form>
        </FormSection>

        <FormSection title="Signature">
          <canvas
            ref={canvasRef}
            width={320}
            height={120}
            className="w-full max-w-sm touch-none rounded-xl border border-charcoal/15 bg-white"
            onPointerDown={(e) => {
              drawing.current = true;
              const rect = e.currentTarget.getBoundingClientRect();
              paint(e.clientX - rect.left, e.clientY - rect.top);
            }}
            onPointerMove={(e) => {
              if (!drawing.current) return;
              const rect = e.currentTarget.getBoundingClientRect();
              paint(e.clientX - rect.left, e.clientY - rect.top);
            }}
            onPointerUp={() => {
              drawing.current = false;
              canvasRef.current?.getContext("2d")?.beginPath();
            }}
          />
          <Button variant="secondary" onClick={() => void uploadSignature()}>
            <Upload className="h-4 w-4 shrink-0" aria-hidden />
            Save signature PNG
          </Button>
        </FormSection>

        <FormSection title={user?.passwordSet ? "Change password" : "Set password"}>
          <form onSubmit={changePassword} className="space-y-3">
            {user?.passwordSet && (
              <Field label="Current password">
                <input
                  className="input"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </Field>
            )}
            <Field label="New password" hint={PASSWORD_REQUIREMENTS}>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={12}
                autoComplete="new-password"
              />
            </Field>
            <Button type="submit">
              <KeyRound className="h-4 w-4 shrink-0" aria-hidden />
              Save password
            </Button>
          </form>
        </FormSection>

        <section
          className="rounded-2xl border border-red-200 bg-red-50/40 p-3.5 sm:p-5"
          aria-labelledby="danger-zone-title"
        >
          <header className="mb-3 border-b border-red-200/80 pb-3">
            <h2 id="danger-zone-title" className="font-display text-sm font-semibold text-red-800">
              Danger zone
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-red-800/80">
              Request account deletion. This signs you out and we process the removal shortly — it cannot be undone from
              here.
            </p>
          </header>
          <form onSubmit={requestDeletion} className="space-y-3">
            {user?.passwordSet ? (
              <Field label="Confirm with password">
                <input
                  className="input border-red-200 focus:border-red-500"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </Field>
            ) : (
              <Field label="Type your email to confirm">
                <input
                  className="input border-red-200 focus:border-red-500"
                  type="email"
                  value={confirmEmail}
                  onChange={(e) => setConfirmEmail(e.target.value)}
                  required
                />
              </Field>
            )}
            <button
              type="submit"
              className="btn border border-red-300 bg-white text-red-800 hover:border-red-400 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
              Request account deletion
            </button>
          </form>
        </section>
      </div>

      <ConfirmDialog
        open={confirmDeletion}
        title="Request account deletion?"
        description="You will be signed out. We process removal shortly — this cannot be undone from the app."
        confirmLabel="Request deletion"
        tone="danger"
        onClose={() => setConfirmDeletion(false)}
        onConfirm={() => doRequestDeletion()}
      />

      <ConfirmDialog
        open={confirmReferral}
        title="Link this consultancy?"
        description={`Code ${referralCodeInput.trim().toUpperCase()} will be attributed to your account. This usually cannot be changed later.`}
        confirmLabel="Link consultancy"
        onClose={() => setConfirmReferral(false)}
        onConfirm={() => doSaveReferral()}
      />
    </Page>
  );
}
