import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";

export type Mail = { to: string; subject: string; text: string };

/**
 * Envoi des e-mails transactionnels (invitation, réinitialisation).
 * Sans SMTP_URL (développement / tests), l'e-mail est écrit dans .dev-mailbox/ : ce mode est refusé en production.
 * Les e-mails ne contiennent jamais de données relatives aux dossiers.
 */
export async function sendMail(mail: Mail): Promise<void> {
  const smtp = process.env.SMTP_URL;
  if (smtp) {
    const transport = nodemailer.createTransport(smtp);
    await transport.sendMail({ from: process.env.MAIL_FROM, to: mail.to, subject: mail.subject, text: mail.text });
    return;
  }
  const localUrl = /^http:\/\/(localhost|127\.0\.0\.1)/.test(process.env.APP_URL ?? "");
  if (process.env.NODE_ENV === "production" && !localUrl) throw new Error("SMTP_URL non configuré.");
  const dir = path.join(process.cwd(), ".dev-mailbox");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}-${mail.to.replace(/[^a-z0-9@.]/gi, "_")}.txt`);
  await fs.writeFile(file, `À : ${mail.to}\nObjet : ${mail.subject}\n\n${mail.text}\n`, "utf8");
  console.info(`[mail de développement] ${mail.subject} -> ${file}`);
}
