/** Standard CI serializers; outputs describe a static gate, never business acceptance. */
const relativeLocation = (location) => {
  if (
    !location ||
    typeof location.file !== "string" ||
    !Number.isSafeInteger(location.line) ||
    location.line < 1
  )
    return null;
  const file = location.file.replace(/\\/g, "/");
  if (
    file.startsWith("/") ||
    /^[A-Za-z][A-Za-z\d+.-]*:/.test(file) ||
    file.split("/").some((x) => x === ".." || x === "")
  )
    return null;
  return {
    uri: file.split("/").map(encodeURIComponent).join("/"),
    line: location.line,
    column: location.column,
  };
};
const evidence = (m, c, p, f) => ({
  dshVersion: c.dshVersion,
  pluginName: p,
  severity: f.severity,
  certainty: f.certainty,
  impactBasis: f.impactBasis,
  impact: f.impact,
  basis: f.basis,
  identity: c.identity,
  limitations: m.limitations,
});
export function renderSarif(matrix) {
  const results = [],
    notifications = [];
  for (const c of matrix.cells || []) {
    if (c.status !== "analyzed") {
      notifications.push({
        level: "error",
        message: { text: c.error || c.status },
        properties: { dshVersion: c.dshVersion, status: c.status },
      });
      continue;
    }
    for (const [name, p] of Object.entries(c.report.plugins))
      for (const f of p.findings) {
        const l = relativeLocation(f.location),
          result = {
            ruleId: f.category,
            level: f.severity === "fatal" ? "error" : "warning",
            message: {
              text: f.impact + " (" + f.certainty + "; " + f.basis + ")",
            },
            properties: evidence(matrix, c, name, f),
          };
        if (l)
          result.locations = [
            {
              physicalLocation: {
                artifactLocation: { uri: l.uri },
                region: {
                  startLine: l.line,
                  ...(Number.isSafeInteger(l.column) && l.column >= 0
                    ? { startColumn: l.column + 1 }
                    : {}),
                },
              },
            },
          ];
        results.push(result);
      }
  }
  // Gate-only blocks (coverage, unknown, invalid previous) must survive export too.
  for (const r of matrix.gate.reasons || [])
    if (r.code !== "finding")
      notifications.push({
        level: matrix.gate.exitCode === 3 ? "error" : "warning",
        message: { text: r.message },
        properties: r,
      });
  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "dsh-plugin-compat-check",
            version: matrix.toolVersion,
          },
        },
        invocations: [
          {
            executionSuccessful: matrix.gate.status !== "error",
            exitCode: matrix.gate.exitCode,
            toolExecutionNotifications: notifications,
          },
        ],
        results,
        properties: {
          identity: matrix.identity,
          policy: matrix.policy,
          gate: matrix.gate,
          limitations: matrix.limitations,
          scope: "Static compatibility evidence; no business acceptance.",
        },
      },
    ],
  };
}
const xml = (value) =>
  String(value ?? "")
    .replace(
      /[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu,
      "",
    )
    .replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&apos;",
        })[c],
    );
export function renderJUnit(matrix) {
  const cases = [];
  for (const c of matrix.cells || []) {
    const reasons = (matrix.gate.reasons || []).filter(
        (r) => r.dshVersion === c.dshVersion,
      ),
      error =
        c.status !== "analyzed" ||
        (matrix.gate.exitCode === 3 && reasons.length > 0),
      failure = !error && reasons.length > 0;
    const body = {
      dshVersion: c.dshVersion,
      status: c.status,
      error: c.error,
      identity: c.identity,
      kernelExitCode: c.kernelExitCode,
      gateReasons: reasons,
      plugins: c.report?.plugins,
      limitations: matrix.limitations,
      scope: "Static evidence; no business acceptance.",
    };
    const message = c.error || reasons.map((r) => r.message).join("; ");
    cases.push({
      error,
      failure,
      xml: `<testcase classname="author-ci" name="${xml(matrix.identity?.package?.name || "selected-package")} @ ${xml(c.dshVersion)}">${error ? `<error type="ToolError" message="${xml(message)}">${xml(message)}</error>` : failure ? `<failure type="PolicyGate" message="${xml(message)}">${xml(message)}</failure>` : ""}<system-out>${xml(JSON.stringify(body))}</system-out></testcase>`,
    });
  }
  const global = (matrix.gate.reasons || []).filter((r) => !r.dshVersion);
  if (global.length || cases.length === 0) {
    const error = matrix.gate.exitCode === 3,
      failure = !error && matrix.gate.exitCode !== 0,
      message = global.map((r) => r.message).join("; ");
    cases.push({
      error,
      failure,
      xml: `<testcase classname="author-ci" name="matrix gate">${error ? `<error message="${xml(message)}"/>` : failure ? `<failure message="${xml(message)}"/>` : ""}</testcase>`,
    });
  }
  const failures = cases.filter((c) => c.failure).length,
    errors = cases.filter((c) => c.error).length;
  const properties = {
    toolVersion: matrix.toolVersion,
    identity: matrix.identity,
    policy: matrix.policy,
    gate: matrix.gate,
    limitations: matrix.limitations,
    scope: "Static evidence; no business acceptance.",
  };
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites tests="${cases.length}" failures="${failures}" errors="${errors}"><testsuite name="author-ci" tests="${cases.length}" failures="${failures}" errors="${errors}" skipped="0"><properties>${Object.entries(
    properties,
  )
    .map(
      ([name, value]) =>
        `<property name="${xml(name)}" value="${xml(typeof value === "string" ? value : JSON.stringify(value))}"/>`,
    )
    .join(
      "",
    )}</properties>${cases.map((c) => c.xml).join("")}</testsuite></testsuites>\n`;
}
