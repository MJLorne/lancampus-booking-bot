export function slugify(text, maxLen = 30) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen);
}

export function normalizeDateToYMD(input) {
  if (!input) return "unknown-date";
  const s = String(input).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  let m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${mo}-${da}`;
  }
  return "unknown-date";
}

export function buildZeitraum({ start_date, end_date, start_time, end_time }) {
  if (start_time || end_time) {
    return `${start_date || "?"} ${start_time || "?"} → ${end_date || "?"} ${end_time || "?"}`;
  }
  return `${start_date || "?"} → ${end_date || "?"}`;
}

export function buildFullName(lastname, firstname) {
  return [lastname, firstname].filter(Boolean).join(" ").trim();
}
