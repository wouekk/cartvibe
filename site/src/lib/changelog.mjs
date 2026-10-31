// CHANGELOG.md to the few lines the site shows. Read at build time (the page imports the file with ?raw), so the
// browser makes no request for it.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Added first, then Changed and Fixed; the rest (Removed, Security, ...) only when nothing else is there.
const SECTION_ORDER = ["added", "changed", "fixed"];
const MAX = 64;
const CONVENTIONAL = /^(feat|fix|perf|refactor|docs|chore|build|ci|test|style|revert)(\([^)]*\))?!?:\s+(.+)$/i;

/** "2026-10-30" to "30 Oct 2026"; anything else is returned as it is. */
export function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return iso;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

function plain(text) {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/\s+/g, " ")
    .trim();
}

/** The one-line headline of a bullet: the Conventional Commit subject, the bold lead-in, or the first sentence. */
export function headline(bullet) {
  const text = bullet.replace(/\s+/g, " ").trim();
  const conventional = CONVENTIONAL.exec(plain(text));
  let line;
  if (conventional) line = conventional[3];
  else {
    const bold = /^\*\*(.+?)\*\*/.exec(text);
    if (bold) line = plain(bold[1]);
    else {
      const flat = plain(text);
      line = /^(.+?[^.\s][.!?])(\s|$)/.exec(flat)?.[1] ?? flat;
    }
  }
  line = line.replace(/\s*[.:;]+$/, "").trim();
  if (line.length > MAX) {
    // A long line is cut where a clause ends, else at a word.
    const clause = [": ", " (", ", ", " - ", " – ", "; "].map((m) => line.indexOf(m)).filter((i) => i >= 12 && i <= MAX).sort((a, b) => b - a)[0];
    if (clause !== undefined) line = line.slice(0, clause).trim();
    else line = `${line.slice(0, MAX - 1).replace(/\s+\S*$/, "")}…`;
  }
  // A cut can leave an opened bracket behind.
  if (line.split("(").length > line.split(")").length) line = line.slice(0, line.lastIndexOf("(")).trim();
  return line;
}

const SUMMARY_MAX = 140;

/** The milestone sentence of a release: plain text, no closing full stop, cut at a word when very long. */
function summarise(text) {
  const flat = plain(text).replace(/\s*[.:;]+$/, "");
  if (flat.length <= SUMMARY_MAX) return flat;
  return `${flat.slice(0, SUMMARY_MAX - 1).replace(/\s+\S*$/, "")}…`;
}

/**
 * The releases of a Keep a Changelog file, newest first, as { version, date, summary, highlights }. [Unreleased] is skipped. A
 * release without usable bullets has an empty `highlights`.
 */
export function parseChangelog(markdown, { releases = 5, highlights = 3 } = {}) {
  const out = [];
  let current = null;
  let section = "";
  let bullet = null;
  const flush = () => {
    if (current && bullet !== null) current.bullets.push({ section, text: bullet });
    bullet = null;
  };
  for (const line of markdown.replace(/\r/g, "").split("\n")) {
    const heading = /^## \[([^\]]+)\](?:\s*-\s*(\S+))?/.exec(line);
    if (heading) {
      flush();
      current = /^\d/.test(heading[1]) ? { version: heading[1], date: heading[2] ?? "", bullets: [], intro: [], introDone: false } : null;
      if (current) out.push(current);
      section = "";
      continue;
    }
    if (!current) continue;
    const sub = /^### (.+)$/.exec(line);
    if (sub) {
      flush();
      section = sub[1].trim().toLowerCase();
      continue;
    }
    // The sentence under the version heading is the release's milestone.
    if (section === "" && !current.introDone && !/^(- |> |#)/.test(line)) {
      if (line.trim()) current.intro.push(line.trim());
      else if (current.intro.length) current.introDone = true;
      continue;
    }
    if (/^- /.test(line)) {
      flush();
      bullet = line.slice(2);
    } else if (bullet !== null && /^\s+\S/.test(line)) bullet += ` ${line.trim()}`;
    else flush();
  }
  flush();
  const rank = (s) => {
    const i = SECTION_ORDER.indexOf(s);
    return i === -1 ? SECTION_ORDER.length : i;
  };
  return out.slice(0, releases).map((r) => ({
    version: r.version,
    date: r.date,
    summary: summarise(r.intro.join(" ")),
    highlights: r.bullets
      .map((b, order) => ({ ...b, order }))
      .sort((a, b) => rank(a.section) - rank(b.section) || a.order - b.order)
      .map((b) => headline(b.text))
      .filter((h) => h.length > 2)
      .slice(0, highlights),
  }));
}
