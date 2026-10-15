// Applique les migrations sur la base de test (nom terminant par _test).
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8").split("\n").map((l) => /^([A-Z_]+)="?(.*?)"?$/.exec(l.trim())).filter(Boolean).map((m) => [m[1], m[2]]),
);
const url = process.env.TEST_DATABASE_URL ?? env.DATABASE_URL.replace(/\/rapportenfance\?/, "/rapportenfance_test?");
if (!url.includes("_test")) throw new Error("TEST_DATABASE_URL doit désigner une base *_test.");
execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
