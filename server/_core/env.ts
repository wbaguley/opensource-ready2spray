// Fail fast if JWT_SECRET is missing in production
if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET environment variable is required in production");
}

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "ready2spray-local",
  cookieSecret: process.env.JWT_SECRET ?? "dev-only-insecure-secret",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  isDevAuth: process.env.VITE_DEV_AUTH === "true",
  invitationCode: process.env.INVITATION_CODE ?? "BETA2024",
  // LLM Provider Configuration
  llmProvider: (process.env.LLM_PROVIDER ?? "ollama") as "ollama" | "anthropic" | "forge",
  // Ollama Configuration (for local model testing)
  ollamaUrl: process.env.OLLAMA_URL ?? "http://localhost:11434",
  ollamaModel: process.env.OLLAMA_MODEL ?? "qwen3.5:4b",
  // Anthropic Configuration
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514",
};
