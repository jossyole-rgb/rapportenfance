export const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric" });

export const fmtDateTime = (d: Date | string) =>
  new Date(d).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export const fmtRelative = (d: Date | string) => {
  const diff = Date.now() - new Date(d).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const days = Math.round(h / 24);
  if (days < 7) return `il y a ${days} j`;
  return `le ${fmtDate(d)}`;
};

/** Date du jour au format AAAA-MM-JJ (fuseau Europe/Paris). */
export const todayIso = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
