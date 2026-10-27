import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { REPO } from "../helpers.mjs";
import { nextSteps } from "../../lib/finding-guidance.mjs";
import { hostVmSource } from "./host-vm-source.mjs";
import * as localRequest from "../../plugin/lib/local-request.js";
import * as hostResources from "../../plugin/lib/host-resources.js";
import * as reportContract from "../../plugin/lib/report-contract.js";
import * as upgradeContract from "../../plugin/lib/upgrade-contract.js";
import { createReportRuntime } from "../../plugin/lib/host-reports.js";
import { createReviewRuntime } from "../../plugin/lib/host-reviews.js";
import { createUpgradeRuntime } from "../../plugin/lib/host-upgrade.js";
import { createHttpRuntime } from "../../plugin/lib/host-http.js";
const nodeRequire = createRequire(import.meta.url);
const HOST = path.join(REPO, "plugin/index.js");
const SRC = fs.readFileSync(HOST, "utf8");
/** 在受控环境里求值宿主半边，返回它的导出 */
export function loadHost(env = {}) {
  const logs = [];
  const timers = [];
  const sandbox = {
    console: {
      log: (m) => logs.push(String(m)),
      warn: (m) => logs.push("WARN " + m),
      error: () => {},
    },
    process: {
      ...process,
      argv: process.argv,
      env: { ...process.env, ...env },
    },
    setTimeout: (fn, delay) => {
      const timer = {
        fn,
        delay,
        unrefed: false,
        cancelled: false,
        fired: false,
        unref() {
          this.unrefed = true;
        },
      };
      timers.push(timer);
      return timer;
    },
    clearTimeout: (timer) => {
      if (timer) timer.cancelled = true;
    },
    URL,
    Date,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Error,
    TypeError,
    Promise,
    Symbol,
    RegExp,
    Map,
    Set,
    WeakMap,
    Math,
    Reflect,
    Proxy,
    Buffer,
    globalThis: undefined,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  // 把 ESM 的 import 换成受控替身；导出换成赋值
  const cjs = hostVmSource(SRC);
  sandbox.__modules = {
    "./lib/host-http.js": { createHttpRuntime },
    "./lib/host-upgrade.js": { createUpgradeRuntime },
    "./lib/host-reviews.js": { createReviewRuntime },
    "./lib/host-reports.js": { createReportRuntime },
    "node:fs": nodeRequire("node:fs"),
    "node:os": nodeRequire("node:os"),
    "node:path": nodeRequire("node:path"),
    "node:url": nodeRequire("node:url"),
    "node:module": nodeRequire("node:module"),
    "node:crypto": nodeRequire("node:crypto"),
    "./lib/local-request.js": localRequest,
    "./lib/host-resources.js": hostResources,
    "./lib/report-contract.js": reportContract,
    "./lib/upgrade-contract.js": upgradeContract,
    "./lib/finding-guidance.js": { nextSteps },
  };
  sandbox.__importMetaUrl = pathToFileURL(HOST).href;
  sandbox.__out = {};
  const wrapped = `${cjs}\n__out.apply = (typeof apply === 'function') ? apply : null;\n`;
  vm.runInContext(wrapped, sandbox, {
    timeout: 5000,
    filename: HOST,
    importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
  });
  vm.runInContext("__out.resolveDshVersion = resolveDshVersion", sandbox);
  async function fire(timer) {
    if (!timer || timer.cancelled || timer.fired)
      throw new Error("Timer is not pending");
    timer.fired = true;
    timer.fn();
    await new Promise(setImmediate);
  }
  return { apply: sandbox.__out.apply, logs, sandbox, timers, fire };
}
