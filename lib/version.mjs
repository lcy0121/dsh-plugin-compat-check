/** Shared version source; package manifests are checked against this literal. */
export const TOOL_VERSION = '0.1.7';
export function versionLine() {
  return `dsh-plugin-compat-check ${TOOL_VERSION}`;
}
