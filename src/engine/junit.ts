import type { Evaluation } from "./run";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface JUnitRow {
  name: string;
  mode: string;
  evaluation: Evaluation;
}

/** JUnit XML so CI systems (GitHub, GitLab, Jenkins, CircleCI) can show each assertion as a test case. */
export function toJUnit(rows: JUnitRow[]): string {
  let tests = 0;
  let failures = 0;
  const suites = rows.map((r) => {
    const cases = r.evaluation.assertions.map((a) => {
      tests++;
      const base = `<testcase classname="${esc(`${r.name} [${r.mode}]`)}" name="${esc(a.title)}">`;
      if (a.status === "failed") {
        failures++;
        return `${base}<failure message="${esc(a.actual)}">${esc(`expected: ${a.expected}\nactual: ${a.actual}${a.eventIds.length ? `\nevents: ${a.eventIds.join(", ")}` : ""}`)}</failure></testcase>`;
      }
      if (a.status === "not_applicable") return `${base}<skipped message="precondition not present"/></testcase>`;
      return `${base}</testcase>`;
    });
    const f = r.evaluation.assertions.filter((a) => a.status === "failed").length;
    return `  <testsuite name="${esc(`${r.name} [${r.mode}]`)}" tests="${r.evaluation.assertions.length}" failures="${f}">\n    ${cases.join("\n    ")}\n  </testsuite>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="carechaos" tests="${tests}" failures="${failures}">\n${suites.join("\n")}\n</testsuites>\n`;
}
