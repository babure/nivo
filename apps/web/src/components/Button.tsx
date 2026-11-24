import type { ButtonHTMLAttributes } from "react";
import { Link, type LinkProps } from "react-router-dom";

type Variant = "primary" | "secondary";

const cls = (variant: Variant, extra?: string) =>
  [variant === "primary" ? "btn-primary" : "btn-secondary", extra].filter(Boolean).join(" ");

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type={type} className={cls(variant, className)} {...rest} />;
}

export function LinkButton({
  variant = "primary",
  className,
  ...rest
}: LinkProps & { variant?: Variant }) {
  return <Link className={cls(variant, className)} {...rest} />;
}
