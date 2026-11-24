import { z } from "zod";

const nameRegex = /^[\p{L}\p{M}][\p{L}\p{M}\s'\-]{0,78}[\p{L}\p{M}]$/u;

export const personNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(nameRegex, "Use letters, spaces, hyphens or apostrophes only");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(254);

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
  .max(128)
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v), {
    message: "Include upper, lower and a number",
  });

export const addressSchema = z.object({
  street: z.string().trim().min(1).max(120),
  houseNumber: z.string().trim().min(1).max(20),
  city: z.string().trim().min(1).max(80),
  postalCode: z.string().trim().min(2).max(20),
  country: z.string().trim().min(2).max(56),
});

export const registerSchema = z.object({
  fullName: personNameSchema,
  email: emailSchema,
  phone: phoneSchema,
  country: z.string().trim().min(2).max(56),
  intake: z.string().trim().min(2).max(40),
  password: passwordSchema,
  ageConfirmed: z.literal(true),
  acceptedTermsVersion: z.string().min(1),
  acceptedPrivacyVersion: z.string().min(1),
  referralCode: z.string().trim().max(32).optional(),
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
  identityConsent: z.literal(true),
});

export const SERVICE_FEE_CENTS = 14900;
export const SERVICE_CURRENCY = "eur" as const;

export function maskSecret(value: string, visible = 3): string {
  if (value.length <= visible) return "*".repeat(value.length);
  return "*".repeat(value.length - visible) + value.slice(-visible);
}
