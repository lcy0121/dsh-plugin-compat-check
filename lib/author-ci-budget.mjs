/** One budget for emitted evidence, saved reports and previous matrices. */
const reportBytes = 8 * 1024 * 1024;
export const AUTHOR_CI_LIMITS = Object.freeze({
  versions: 4,
  timeoutMs: 30000,
  previousBytes: reportBytes,
  reportBytes,
  cellBytes: 2 * 1024 * 1024,
  policyBytes: 65536,
});
export function checkCIOutput(text) {
  if (Buffer.byteLength(text + "\n") > AUTHOR_CI_LIMITS.reportBytes)
    throw Error("Author CI output exceeds the shared output budget");
  return text;
}
export function ciJSON(value, { cell = false } = {}) {
  const text = JSON.stringify(value, null, cell ? 0 : 2);
  if (typeof text !== "string") throw Error("Invalid author CI evidence");
  if (cell) {
    if (Buffer.byteLength(text) > AUTHOR_CI_LIMITS.cellBytes)
      throw Error("Author CI cell exceeds output budget");
    return text;
  }
  return checkCIOutput(text);
}
