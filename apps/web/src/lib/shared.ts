/**
 * Browser-safe entry for @nivo/shared.
 *
 * The package root also exports node:crypto helpers, which must not be bundled
 * for the browser. Vite/TS alias `@nivo/shared` to this file, so app code can
 * keep importing from "@nivo/shared".
 */
export * from "../../../../packages/shared/src/validators";
export * from "../../../../packages/shared/src/cards";
export * from "../../../../packages/shared/src/permissions";
export * from "../../../../packages/shared/src/errors";
