/** Keep measured stage results and cleanup failures in the same acceptance receipt. */
import fs from "node:fs";
import { failureDiagnostic } from "../lib/owned-process.mjs";
import { redactLiveUrl } from "./owned-live-host.mjs";

export function writeJSON(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

export function recordLiveFailure(result, error, extra = {}) {
  return {
    ...result,
    ...extra,
    ok: false,
    error: redactLiveUrl(error.stack || error.message),
    diagnostics: failureDiagnostic(error),
  };
}

export async function finishLiveReceipt(result, { root, cleanup }) {
  try {
    await cleanup();
  } catch (error) {
    result = {
      ...result,
      ok: false,
      error: [result?.error, error.message].filter(Boolean).join("; "),
      diagnostics: [
        ...(result?.diagnostics || []),
        ...failureDiagnostic(error),
      ],
    };
  }
  const privateRootRemoved = !fs.existsSync(root);
  return {
    ...result,
    cleanup: {
      privateRootRemoved,
      ...(privateRootRemoved ? {} : { workDir: root }),
    },
  };
}
