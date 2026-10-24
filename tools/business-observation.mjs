/** Optional same-host service-only prediction input; no loader/business labels. */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { normalizeObservation } from "../lib/observation.mjs";
export function servicePredictionInput(surface, { nm, dshVersion }) {
  const target = { profileId: nm, dshVersion, maxAgeMs: 24 * 60 * 60 * 1000 };
  const normalized = normalizeObservation(surface, target);
  if (
    !normalized.bound ||
    !normalized.usable ||
    !surface.probedAt ||
    !Number.isFinite(Date.parse(surface.probedAt))
  )
    throw Error("Service observation identity/version/freshness mismatch");
  if (Date.parse(surface.probedAt) > Date.now() + 60000)
    throw Error("Service observation timestamp is in the future");
  const root = {};
  for (const [name, info] of Object.entries(surface.root)) {
    const shape = normalized.root[name];
    const value = { status: shape.status };
    if (shape.status === "absent") value.present = false;
    if (shape.status === "present") value.present = true;
    if (info.methods !== undefined && shape.status !== "absent")
      value.methods = Object.fromEntries(
        shape.methods.map((name) => [name, "function"]),
      );
    for (const key of ["complete", "truncated", "namesComplete"])
      if (typeof info[key] === "boolean") value[key] = info[key];
    for (const key of ["unknownMethods", "nonCallableMethods"])
      if (Array.isArray(info[key])) value[key] = shape[key];
    if (shape.status === "unreadable") value.error = "Service sampling failed";
    Object.defineProperty(root, name, { value, enumerable: true });
  }
  return {
    observationVersion: 1,
    profileId: surface.profileId,
    dshVersion: surface.dshVersion,
    probedAt: surface.probedAt,
    root,
  };
}
export function installServiceObserver(
  profile,
  services,
  dshVersion = "0.2.1-rc.2",
) {
  const dir = path.join(profile, "node_modules/@business/service-observer");
  fs.mkdirSync(dir, { recursive: true });
  const output = path.join(profile, "business-workspace/root-services.json");
  const observation = pathToFileURL(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../lib/observation.mjs",
    ),
  ).href;
  const source = `import fs from 'node:fs';import {sampleServices} from ${JSON.stringify(observation)};
export const inject=['appReady'];
export function apply(ctx){
  const ready=ctx.get('appReady',false);
  if(typeof ready?.onReady!=='function')throw Error('Owned service observer requires official application readiness');
  ctx.effect(()=>ready.onReady(()=>{
    const file=${JSON.stringify(output)};
    const value=sampleServices(ctx,${JSON.stringify(services)},{profileId:${JSON.stringify(path.join(profile, "node_modules"))},dshVersion:${JSON.stringify(dshVersion)}});
    fs.writeFileSync(file+'.tmp',JSON.stringify(value),{mode:0o600});
    fs.renameSync(file+'.tmp',file);
  }));
}`;
  fs.writeFileSync(path.join(dir, "index.js"), source);
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({
      name: "@business/service-observer",
      version: "1.0.0",
      type: "module",
      main: "index.js",
      dsh: { bundle: { patch: "cordis.patch.yml" } },
    }),
  );
  fs.writeFileSync(
    path.join(dir, "cordis.patch.yml"),
    '- insert:\n    - id: business-service-observer\n      name: "@business/service-observer"\n',
  );
  const file = path.join(profile, "package.json"),
    pkg = JSON.parse(fs.readFileSync(file));
  pkg.dependencies["@business/service-observer"] = "file:" + dir;
  pkg.dsh.profile.bundles.push("@business/service-observer");
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2));
  return { source, output };
}
