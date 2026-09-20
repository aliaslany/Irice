/**
 * The globals layer: conventions that every module depends on and none may
 * redefine — rial integers, gram integers, UTC storage with Jalali at the edge,
 * normalised Persian input, one message catalog, one error taxonomy.
 *
 * See docs/ARCHITECTURE.md §5.
 */
export * from "./money.js";
export * from "./weight.js";
export * from "./digits.js";
export * from "./date.js";
export * from "./i18n.js";
export * from "./rtl.js";
export * from "./errors.js";
export { loadEnv, resetEnvCache, type Env } from "./config.js";
