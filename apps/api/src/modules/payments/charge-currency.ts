import type Stripe from "stripe";
import { SERVICE_CURRENCY, SERVICE_FEE_CENTS } from "@nivo/shared";

export type CheckoutCharge = {
  currency: string;
  amountCents: number;
  /** Why we may have left EUR — Adaptive Pricing needs a settlement currency. */
  reason: "product_eur" | "settlement_override" | "settlement_auto";
};

/**
 * Adaptive Pricing only localizes prices whose currency is one of the account's
 * settlement currencies. An NZ sandbox that only settles NZD cannot Adaptive-Price
 * an EUR line item — Checkout stays in EUR.
 *
 * Prefer explicit STRIPE_CHARGE_* overrides; otherwise auto-convert the €149 fee
 * into the account default currency when it is not EUR.
 */
export async function resolveCheckoutCharge(
  stripe: Stripe,
  opts: {
    overrideCurrency?: string;
    overrideAmountCents?: number;
  } = {},
): Promise<CheckoutCharge> {
  if (opts.overrideCurrency && opts.overrideAmountCents) {
    return {
      currency: opts.overrideCurrency.toLowerCase(),
      amountCents: opts.overrideAmountCents,
      reason: "settlement_override",
    };
  }

  const account = await stripe.accounts.retrieve();
  const settlement = (account.default_currency ?? SERVICE_CURRENCY).toLowerCase();
  if (settlement === SERVICE_CURRENCY) {
    return { currency: SERVICE_CURRENCY, amountCents: SERVICE_FEE_CENTS, reason: "product_eur" };
  }

  const amountCents = await convertEurCents(SERVICE_FEE_CENTS, settlement);
  return { currency: settlement, amountCents, reason: "settlement_auto" };
}

async function convertEurCents(eurCents: number, toCurrency: string): Promise<number> {
  const to = toCurrency.toUpperCase();
  if (to === "EUR") return eurCents;
  const url = `https://api.frankfurter.app/latest?from=EUR&to=${encodeURIComponent(to)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Could not convert EUR→${to} for Adaptive Pricing (${res.status}).`);
  }
  const body = (await res.json()) as { rates?: Record<string, number> };
  const rate = body.rates?.[to];
  if (!rate || !Number.isFinite(rate)) {
    throw new Error(`Missing FX rate EUR→${to}.`);
  }
  return Math.max(1, Math.round(eurCents * rate));
}
