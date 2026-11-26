import { useEffect, useState, type ReactNode } from "react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { Field } from "./Page";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Danger styling for destructive actions */
  tone?: "default" | "danger";
  busy?: boolean;
  onClose: () => void;
  onConfirm: (input: { reason?: string }) => void | Promise<void>;
  /** Optional free-text reason collected before confirm */
  reasonField?: {
    label: string;
    required?: boolean;
    placeholder?: string;
    minLength?: number;
    maxLength?: number;
  };
  children?: ReactNode;
};

/** Pre-action confirm built on Dialog — Cancel / Confirm, optional reason. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  busy = false,
  onClose,
  onConfirm,
  reasonField,
  children,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string>();

  useEffect(() => {
    if (!open) {
      setReason("");
      setLocalError(undefined);
    }
  }, [open]);

  const minLen = reasonField?.minLength ?? (reasonField?.required ? 10 : 0);
  const maxLen = reasonField?.maxLength ?? 500;
  const trimmed = reason.trim();
  const reasonOk =
    !reasonField ||
    (!reasonField.required && trimmed.length === 0) ||
    (trimmed.length >= minLen && trimmed.length <= maxLen);

  async function handleConfirm() {
    if (reasonField && !reasonOk) {
      setLocalError(
        trimmed.length < minLen
          ? `Enter at least ${minLen} characters.`
          : `Keep it under ${maxLen} characters.`,
      );
      return;
    }
    setLocalError(undefined);
    await onConfirm({ reason: reasonField ? trimmed || undefined : undefined });
  }

  return (
    <Dialog
      open={open}
      title={title}
      description={description}
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        <>
          <Button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            disabled={busy || (Boolean(reasonField?.required) && !reasonOk)}
            className={
              tone === "danger"
                ? "border border-red-300 bg-white text-red-800 hover:border-red-400 hover:bg-red-50"
                : undefined
            }
            onClick={() => void handleConfirm()}
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </>
      }
    >
      {children ? <div className="mb-3 text-sm text-charcoal-soft">{children}</div> : null}
      {reasonField ? (
        <Field label={reasonField.label} error={localError}>
          <textarea
            className="input min-h-24"
            value={reason}
            disabled={busy}
            placeholder={reasonField.placeholder}
            maxLength={maxLen}
            onChange={(e) => {
              setReason(e.target.value);
              if (localError) setLocalError(undefined);
            }}
          />
        </Field>
      ) : null}
    </Dialog>
  );
}
