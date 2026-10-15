import { randomBytes } from "node:crypto";
console.log(`DATA_ENCRYPTION_KEY="${randomBytes(32).toString("base64")}"`);
