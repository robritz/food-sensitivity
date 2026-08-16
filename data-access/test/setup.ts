import { existsSync } from "node:fs";
import { config } from "dotenv";

const envFile = new URL("../.env.test", import.meta.url);
if (existsSync(envFile)) {
  config({ path: envFile, quiet: true });
}
