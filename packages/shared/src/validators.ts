import { z } from "zod";

const nameRegex = /^[\p{L}\p{M}][\p{L}\p{M}\s'\-]{0,78}[\p{L}\p{M}]$/u;

/** Shown in UI hints — keep in sync with `passwordSchema`. */
export const PASSWORD_REQUIREMENTS =
  "At least 12 characters with uppercase, lowercase and a number (e.g. NivoSecure12)";

export const personNameSchema = z
  .string()
  .trim()
  .min(2, "Enter at least 2 characters")
  .max(80, "Name is too long (max 80 characters)")
  .regex(nameRegex, "Use letters, spaces, hyphens or apostrophes only");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(254, "Email is too long");

/** Generic E.164-ish phone: + and 8–15 digits */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, "Use international format, e.g. +491234567890");

export const passportNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{6,9}$/, "Passport number must be 6–9 letters or digits");

export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters")
  .max(128, "Password is too long (max 128 characters)")
  .refine((v) => /[a-z]/.test(v), { message: "Add at least one lowercase letter" })
  .refine((v) => /[A-Z]/.test(v), { message: "Add at least one uppercase letter" })
  .refine((v) => /\d/.test(v), { message: "Add at least one number" });

/** Login / confirm-current-password: length only (legacy weak hashes must still authenticate). */
export const passwordPresentSchema = z
  .string()
  .min(1, "Password is required")
  .max(128, "Password is too long");

export const addressSchema = z.object({
  street: z.string().trim().min(1, "Street is required").max(120),
  houseNumber: z.string().trim().min(1, "House number is required").max(20),
  city: z.string().trim().min(1, "City is required").max(80),
  postalCode: z.string().trim().min(2, "Postal code is required").max(20),
  country: z.string().trim().min(2, "Country is required").max(56),
});

export const referralCodeSchema = z
  .string()
  .trim()
  .min(4, "Referral code must be at least 4 characters")
  .max(32, "Referral code is too long")
  .regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, underscore or hyphen only");

export const registerSchema = z.object({
  fullName: personNameSchema,
  email: emailSchema,
  phone: phoneSchema,
  country: z.string().trim().min(2, "Country is required").max(56),
  intake: z.string().trim().min(2, "Intake is required").max(40),
  password: passwordSchema,
  ageConfirmed: z.literal(true, {
    errorMap: () => ({ message: "Confirm that you are 18 or older" }),
  }),
  acceptedTermsVersion: z.string().min(1, "Accept the Terms to continue"),
  acceptedPrivacyVersion: z.string().min(1, "Accept the Privacy Policy to continue"),
  referralCode: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    referralCodeSchema.optional(),
  ),
  shareProgressWithConsultancy: z.boolean().optional().default(false),
});

export const identitySchema = z.object({
  fullName: personNameSchema,
  fatherName: personNameSchema,
  motherName: personNameSchema,
  phone: phoneSchema,
  email: emailSchema,
  currentAddress: addressSchema,
  permanentAddress: addressSchema,
  permanentSameAsCurrent: z.boolean(),
  passportNumber: passportNumberSchema,
  identityConsent: z.literal(true, {
    errorMap: () => ({ message: "Consent is required to store identity details" }),
  }),
});

export const createAdminSchema = z.object({
  email: emailSchema,
  fullName: personNameSchema,
  password: passwordSchema,
});

export const createConsultancySchema = z
  .object({
    name: z.string().trim().min(2, "Organisation name is required").max(160),
    code: referralCodeSchema,
    managerEmail: emailSchema.optional(),
    managerPassword: passwordSchema.optional(),
    managerName: personNameSchema.optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.managerEmail && !val.managerPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["managerPassword"],
        message: "Manager password is required when creating a login",
      });
    }
    if (val.managerPassword && !val.managerEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["managerEmail"],
        message: "Manager email is required when setting a password",
      });
    }
  });

export const addManagerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: personNameSchema.optional(),
});

export const accommodationLeadSchema = z.object({
  city: z.string().trim().min(2, "Enter a city (at least 2 characters)").max(80),
  budget: z.string().trim().min(1, "Enter a monthly budget").max(40),
  roomType: z.string().trim().min(1, "Choose a room type").max(40),
  phone: phoneSchema,
  notes: z.string().trim().max(1000, "Notes are too long (max 1000 characters)").optional(),
});

export const SERVICE_FEE_CENTS = 14900;
export const SERVICE_CURRENCY = "eur" as const;

export function maskSecret(value: string, visible = 3): string {
  if (value.length <= visible) return "*".repeat(value.length);
  return "*".repeat(value.length - visible) + value.slice(-visible);
}

/** Flatten Zod issues into a short actionable string for UI / API envelopes. */
export function formatValidationIssues(
  issues: { path?: PropertyKey[]; message: string }[],
): string {
  const parts = issues.map((i) => {
    const path = (i.path ?? []).filter((p) => typeof p === "string" || typeof p === "number").join(".");
    return path ? `${path}: ${i.message}` : i.message;
  });
  if (parts.length === 0) return "Request validation failed.";
  if (parts.length === 1) return parts[0]!;
  return `Fix ${parts.length} fields: ${parts.slice(0, 3).join(" · ")}${parts.length > 3 ? "…" : ""}`;
}
