// Lokaler Worker-Prozess zum Testen der Rollentrennung:  APP_ROLE=worker npx tsx --env-file=.env scripts/worker-dev.ts
import { init } from "../src/lib/startup/init";
await init();
setInterval(() => {}, 1 << 30);
