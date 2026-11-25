import { LoaderCircle } from "lucide-react";

type Props = {
  label?: string;
  /** Inline for buttons/toolbars only — prefer Skeleton for page/table loads. */
  variant?: "inline";
};

/** Inline spinner for buttons / small controls. Tables/panels should use Skeleton. */
export function Loader({ label = "Loading…", variant = "inline" }: Props) {
  void variant;
  return (
    <span className="inline-flex items-center gap-2 text-sm text-charcoal-soft" role="status">
      <LoaderCircle className="h-4 w-4 animate-spin text-orange" aria-hidden />
      {label}
    </span>
  );
}
