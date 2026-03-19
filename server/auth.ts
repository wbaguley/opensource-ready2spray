/**
 * Email/Password Authentication
 * Replaces OAuth with simple bcrypt + JWT auth
 */
import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { getDb } from "./db";
import { users } from "../drizzle/schema";

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function registerUser(email: string, password: string, name: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { eq } = await import("drizzle-orm");

  // Check if email already exists
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    throw new Error("Email already registered");
  }

  const passwordHash = await hashPassword(password);
  const openId = randomUUID(); // Use UUID as openId to maintain compatibility

  const result = await db.insert(users).values({
    openId,
    email,
    name,
    passwordHash,
    loginMethod: "email",
    role: "admin",
    userRole: "admin",
    lastSignedIn: new Date(),
  }).returning();

  return result[0];
}

export async function loginUser(email: string, password: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { eq } = await import("drizzle-orm");

  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (result.length === 0) {
    throw new Error("Invalid email or password");
  }

  const user = result[0];

  if (!user.passwordHash) {
    throw new Error("Invalid email or password");
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new Error("Invalid email or password");
  }

  // Update last signed in
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));

  return user;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;

  const { eq } = await import("drizzle-orm");
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}
