import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "RapportEnfance IA", template: "%s · RapportEnfance IA" },
  description: "Assistant de rédaction sécurisé pour les professionnels de la protection de l'enfance.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1b3a5e" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Lecture des en-têtes : rendu dynamique de toutes les pages, nécessaire au nonce CSP par requête
  await headers();
  return (
    <html lang="fr">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
