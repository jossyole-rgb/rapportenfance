/** Vérifie la configuration au démarrage du serveur : l'application refuse de démarrer si elle est invalide. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { env } = await import("@/lib/env");
    env();
    const { encrypt, decrypt } = await import("@/lib/security/crypto");
    if (decrypt(encrypt("controle")) !== "controle") throw new Error("Clé de chiffrement invalide.");
  }
}
