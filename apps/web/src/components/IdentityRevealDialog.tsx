import { X } from "lucide-react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

export type RevealedIdentity = {
  fullName: string;
  fatherName: string;
  motherName: string;
  phone: string;
  email: string;
  passportNumber: string;
  permanentSameAsCurrent: boolean;
  currentAddress: {
    street: string;
    houseNumber: string;
    city: string;
    postalCode: string;
    country: string;
  };
  permanentAddress: {
    street: string;
    houseNumber: string;
    city: string;
    postalCode: string;
    country: string;
  };
};

type Props = {
  open: boolean;
  studentName?: string;
  data: RevealedIdentity | null;
  onClose: () => void;
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[8.5rem_1fr] sm:gap-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-charcoal-soft">{label}</dt>
      <dd className="text-sm text-charcoal">{value || "—"}</dd>
    </div>
  );
}

function formatAddress(a: RevealedIdentity["currentAddress"]) {
  return `${a.street} ${a.houseNumber}, ${a.postalCode} ${a.city}, ${a.country}`;
}

/** Formatted privileged identity view — never dump raw JSON. */
export function IdentityRevealDialog({ open, studentName, data, onClose }: Props) {
  return (
    <Dialog
      open={open}
      title="Revealed identity"
      description={
        studentName
          ? `Sensitive details for ${studentName}. This access is audited.`
          : "Sensitive student details. This access is audited."
      }
      onClose={onClose}
      wide
      footer={
        <Button type="button" variant="secondary" onClick={onClose}>
          <X className="h-4 w-4 shrink-0" aria-hidden />
          Close
        </Button>
      }
    >
      {!data ? (
        <p className="text-sm text-charcoal-soft">No identity data.</p>
      ) : (
        <div className="space-y-5">
          <section className="rounded-2xl border border-orange/20 bg-orange/[0.04] px-4 py-3 text-xs text-charcoal-soft">
            Handle carefully. Do not copy into unsecured channels. Reveal events appear in Reports.
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-charcoal">Person</h3>
            <dl className="space-y-2.5">
              <Row label="Full name" value={data.fullName} />
              <Row label="Father" value={data.fatherName} />
              <Row label="Mother" value={data.motherName} />
              <Row label="Passport" value={data.passportNumber} />
            </dl>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-charcoal">Contact</h3>
            <dl className="space-y-2.5">
              <Row label="Email" value={data.email} />
              <Row label="Phone" value={data.phone} />
            </dl>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-charcoal">Addresses</h3>
            <dl className="space-y-2.5">
              <Row label="Current" value={formatAddress(data.currentAddress)} />
              <Row
                label="Permanent"
                value={
                  data.permanentSameAsCurrent
                    ? "Same as current"
                    : formatAddress(data.permanentAddress)
                }
              />
            </dl>
          </section>
        </div>
      )}
    </Dialog>
  );
}
