import { defineConfig } from "drizzle-kit";

// Use DATABASE_URL from .env or fallback to local PostgreSQL
const connectionString = process.env.DATABASE_URL || "postgresql://ready2spray:ready2spray_local_2024@localhost:5432/ready2spray";

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
