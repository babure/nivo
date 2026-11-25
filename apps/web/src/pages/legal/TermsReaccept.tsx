import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Field, Page } from "../../components/Page";
import { Button } from "../../components/Button";
import { api, ApiError, formatApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { homePathFor } from "../../lib/navigation";
import { useToast } from "../../lib/toast";

export function TermsReaccept() {
  const { user, ready, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [version, setVersion] = useState<string>();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api
      .get<{ version: string }>("/v1/legal/terms")
      .then((doc) => setVersion(doc.version))
      .catch(() => setVersion(undefined));
  }, []);

  if (ready && !user) {
    return <Navigate to="/login" replace />;
  }
  if (ready && user && !user.termsReacceptRequired) {
    return <Navigate to={homePathFor(user)} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!accepted || !version) {
      toast.error("Please accept the current Terms to continue");
      return;
    }
    setBusy(true);
    try {
      await api.post("/v1/legal/accept", { slug: "terms", version });
      const next = await refresh();
      toast.success("Terms accepted");
      navigate(next ? homePathFor(next) : "/dashboard", { replace: true });
    } catch (err) {
      toast.error(
        "Could not save acceptance",
        formatApiError(err, err instanceof ApiError ? err.message : "Could not save acceptance."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page
      title="Updated Terms"
      intro="We published a new version of our Terms. Please review and accept to continue using NIVO."
      narrow
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <p className="text-sm text-charcoal-soft">
          Current version: <strong>{version ?? "…"}</strong>. Read the full text on{" "}
          <Link to="/terms" className="text-orange-dark underline">
            Terms &amp; Conditions
          </Link>
          .
        </p>
        <Field label="Acceptance">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            <span>
              I have read and accept the current Terms of Service
              {version ? ` (version ${version})` : ""}.
            </span>
          </label>
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy || !version}>
            Continue
          </Button>
          <Button
            type="button"
            className="btn-secondary"
            onClick={() => {
              void signOut().then(() => navigate("/login", { replace: true }));
            }}
          >
            Sign out
          </Button>
        </div>
      </form>
    </Page>
  );
}
