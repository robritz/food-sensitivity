import { existsSync } from "node:fs";
import { config } from "dotenv";

// .env holds whatever project the wizard last provisioned (e.g. hosted);
// .env.test is test-specific and, when present, wins -- so `npm test` works
// right after provisioning (only .env exists yet) and still lets local dev
// point tests elsewhere without touching .env.
const envFile = new URL("../.env", import.meta.url);
const envTestFile = new URL("../.env.test", import.meta.url);

if (existsSync(envFile)) {
  config({ path: envFile, quiet: true });
}
if (existsSync(envTestFile)) {
  config({ path: envTestFile, quiet: true, override: true });
}
