/** Read-only shape probe. Output requires an explicitly private directory. */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { sampleServices } from "../lib/observation.mjs";
import {
  privateDiagnostic,
  loaderObservations,
} from "../plugin/lib/host-resources.js";
export const name = "dsh-plugin-compat-check-probe";
const WORKDIR = process.env.DSC_OUT_DIR || null;
/** Independent gold collector: preserve raw identity and numeric loader state.
 * Never call the verdict mapper or use the extractor's manifest list here.
 */
export function captureLoaderLabels(ctx, identity) {
  const label = {
    labelVersion: 1,
    source: "loader.entries",
    ...identity,
    available: false,
    complete: true,
    entries: [],
  };
  try {
    const loader = ctx.get?.("loader", false) || ctx.loader;
    if (!loader?.entries) {
      label.complete = false;
      return label;
    }
    label.available = true;
    for (const entry of loader.entries()) {
      if (label.entries.length >= 20000) {
        label.complete = false;
        break;
      }
      try {
        const opts = entry.options || {},
          code = entry.fiber?.state;
        label.entries.push({
          id: typeof entry.id === "string" ? entry.id : null,
          name: typeof opts.name === "string" ? opts.name : null,
          packageName:
            typeof entry.packageName === "string"
              ? entry.packageName
              : typeof opts.packageName === "string"
                ? opts.packageName
                : null,
          stateCode:
            Number.isInteger(code) && code >= 0 && code <= 5 ? code : null,
          disabled: entry.disabled === true,
          group: opts.group === true,
        });
      } catch {
        label.complete = false;
      }
    }
  } catch {
    label.complete = false;
  }
  return label;
}
export function apply(ctx) {
  if (!WORKDIR) return;
  const write = (name, data) =>
    privateDiagnostic(path.join(WORKDIR, name), data);
  if (!write("probe-applied.txt", { appliedAt: new Date().toISOString() }))
    return;
  const timer = setTimeout(() => {
    let services = [],
      manifests = [];
    try {
      const data = JSON.parse(
        fs.readFileSync(path.join(WORKDIR, "services.json"), "utf8"),
      );
      if (!Array.isArray(data.services) || data.services.length > 10000)
        throw new Error("Invalid service list");
      services = data.services.filter(
        (s) => typeof s === "string" && s.length < 256,
      );
      manifests = Array.isArray(data.manifests) ? data.manifests : [];
    } catch {
      write("probe-report.json", {
        error: "Cannot read requested services",
        root: {},
        observationVersion: 1,
        profileId: process.env.DSC_PROFILE_ID || null,
      });
      return;
    }
    const report = sampleServices(ctx, services, {
      profileId: process.env.DSC_PROFILE_ID || null,
      dshVersion: process.env.DSC_DSH_VERSION || null,
    });
    report.sampleId = randomUUID();
    // Write labels first: readiness is the later probe-report.json write.
    write(
      "loader-labels.json",
      captureLoaderLabels(ctx, {
        sampleId: report.sampleId,
        profileId: report.profileId,
        dshVersion: report.dshVersion,
        probedAt: report.probedAt,
      }),
    );
    const entries = loaderObservations(ctx, manifests);
    report.entries = {
      plugins: entries.rows,
      note: entries.available ? null : "Loader unavailable",
      unmapped: entries.unmapped,
    };
    report.probeVersion = 5;
    write("probe-report.json", report);
  }, 4000);
  timer.unref?.();
  ctx.effect?.(() => () => clearTimeout(timer));
}
