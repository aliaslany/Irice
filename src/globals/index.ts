/**
 * The globals layer: conventions that every module depends on and none may
 * redefine — rial integers, gram integers, UTC storage with Jalali at the edge,
 * normalised Persian input, one message catalog, one error taxonomy.
 *
 * See docs/ARCHITECTURE.md §5.
 */
export * from "./money";
export * from "./weight";
export * from "./digits";
export * from "./date";
export * from "./i18n";
export * from "./rtl";
export * from "./errors";
export { loadEnv, resetEnvCache, type Env } from "./config";
