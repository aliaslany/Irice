import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { loadEnv } from "../globals/config";
import * as schema from "./schema/index";

/**
 * One connection pool per process. `max: 10` is a starting point for a single
 * app instance; checkout holds row locks on lots, so the pool wants to stay
 * small enough that contention surfaces as queueing rather than lock storms.
 */
const env = loadEnv();

const queryClient = postgres(env.DATABASE_URL, {
  max: 10,
  // Transform undefined to null rather than throwing on optional inserts.
  transform: { undefined: null },
});

export const db = drizzle(queryClient, { schema });
export type Database = typeof db;
/** The type `db.transaction(async (tx) => ...)` hands its callback. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export { schema };
