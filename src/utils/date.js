export function getBerlinYMD(tz = "Europe/Berlin") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  return {
    y: Number(parts.find((p) => p.type === "year")?.value),
    m: Number(parts.find((p) => p.type === "month")?.value),
    d: Number(parts.find((p) => p.type === "day")?.value),
  };
}

export function ymdToUtcMs({ y, m, d }) {
  return Date.UTC(y, m - 1, d);
}

export function parseYmdStringToUtcMs(yyyyMmDd) {
  const parts = String(yyyyMmDd || "").split("-");
  if (parts.length !== 3) return null;
  const [y, mo, d] = parts.map(Number);
  if (![y, mo, d].every(Number.isFinite)) return null;
  return Date.UTC(y, mo - 1, d);
}
