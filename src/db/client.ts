import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { loadEnv } from "../globals/config.js";
import * as schema from "./schema/index.js";

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
export { schema };
