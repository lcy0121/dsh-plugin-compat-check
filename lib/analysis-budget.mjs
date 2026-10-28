/** Semantic and transfer budgets: errors never truncate evidence into success. */
export const ANALYSIS_LIMITS = Object.freeze({
  plugins: 2000,
  services: 20000,
  dependencies: 50000,
  callSites: 50000,
  reportBytes: 8 * 1024 * 1024,
});
export function analysisLimits(overrides = {}) {
  const limits = { ...ANALYSIS_LIMITS };
  for (const [key, value] of Object.entries(overrides)) {
    if (
      !Object.hasOwn(limits, key) ||
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > limits[key]
    )
      throw Error("Invalid analysis resource budget / 预算");
    limits[key] = value;
  }
  return limits;
}
export function assertAnalysisBudget(report, overrides) {
  const limits = analysisLimits(overrides);
  const counts = { plugins: 0, services: 0, dependencies: 0, callSites: 0 };
  const check = () => {
    for (const key of Object.keys(counts))
      if (counts[key] > limits[key])
        throw Error(
          `Analysis ${key} exceeds resource budget / 分析条目超出预算`,
        );
  };
  for (const p of Object.values(report.perPlugin || {})) {
    counts.plugins++;
    for (const key of ["services", "dependencies", "callSites"])
      counts[key] += (p[key] || []).length;
    check();
  }
  for (const key of ["services", "callSites"])
    counts[key] = Math.max(counts[key], (report[key] || []).length);
  check();
  return limits;
}
/** Called inside supervised workers before structured-cloning results to host. */
export function assertAnalysisBytes(value, overrides) {
  const { reportBytes } = analysisLimits(overrides);
  if (Buffer.byteLength(JSON.stringify(value)) > reportBytes)
    throw Error("Analysis report exceeds byte budget / 分析报告超出字节预算");
  return value;
}
