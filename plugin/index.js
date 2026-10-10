// Host half of the dsh-plugin-compat-check plugin skeleton.
//
// HARD RULE (Plan.md §4 第 6 条：绝不抛、绝不拖累宿主): this plugin must never throw and must never keep the
// host from booting. A health-check plugin that breaks host startup becomes an
// instance of the very class of problem it is meant to detect.
//
// This revision is the deliberate minimum: it declares `name` / `inject` / `apply`
// so Cordis can activate the entry, and does nothing else.

export const name = "dsh-plugin-compat-check";

/**
 * No host services are consumed yet, so nothing is injected. Declaring a service
 * that the running host does not provide would park the fiber in PENDING, which
 * is exactly the failure mode this tool exists to report -- do not add entries
 * here until that service is actually used.
 */
export const inject = [];

export function apply(ctx) {
  console.log("[dsh-plugin-compat-check] HOST-HALF-ACTIVATED");
}
