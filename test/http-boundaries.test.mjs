import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { writePackageFixture } from "./fixture-utils.mjs";
import { launchChromePipe } from "../lib/debugger.mjs";

const requestHeaders = { "X-DSH-Compat-Request": "1" };
const chromePath =
  process.env.DSC_CHROME ||
  [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].find((file) => fs.existsSync(file));

async function withHost(check) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-http-boundary-"));
  const home = path.join(root, "home"),
    nm = path.join(home, "profiles/http/node_modules");
  writePackageFixture(
    path.join(nm, "sample"),
    {
      name: "sample",
      version: "1.0.0",
      type: "module",
      main: "index.js",
      dsh: { bundle: { patch: "cordis.patch.yml" } },
    },
    "export function apply(){}",
    "- insert:\n    - name: ./index.js\n",
  );
  const overrides = {
    DSH_HOME: home,
    DSC_KERNEL: path.resolve("."),
    DSC_PROFILE: "http",
    DSH_VERSION: "0.2.1-rc.2",
    DSC_AUTORUN_MS: "60000",
    DSC_SCAN_DELAYS: "60000,120000",
    DSC_OUT_DIR: path.join(root, "diagnostics"),
  };
  const previous = Object.fromEntries(
    Object.keys(overrides).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, overrides);
  const routes = new Map(),
    disposers = [],
    receipts = [];
  const server = http.createServer(async (req, res) => {
    const route = routes.get(new URL(req.url, "http://localhost").pathname);
    if (!route) {
      res.setHeader("content-type", "text/html");
      res.end("<!doctype html><body>owned page</body>");
      return;
    }
    const receipt = { url: req.url, headers: req.headers, status: null };
    receipts.push(receipt);
    res.once("finish", () => {
      receipt.status = res.statusCode;
    });
    try {
      await route.handler(req, res);
    } catch (error) {
      res.writeHead(500);
      res.end(error.message);
    }
  });
  try {
    const { apply } = await import(
      new URL("../plugin/index.js?http=" + path.basename(root), import.meta.url)
    );
    apply({
      get: () => undefined,
      inject: (deps, fn) => {
        if (!deps.includes("webServer")) return;
        const off = fn({
          webServer: {
            register: (route) => {
              routes.set(route.path, route);
              return () => routes.delete(route.path);
            },
          },
        });
        if (typeof off === "function") disposers.push(off);
      },
      effect: (fn) => {
        const off = fn();
        if (typeof off === "function") disposers.push(off);
      },
    });
    assert.equal(routes.size, 3);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    await check({
      root,
      home,
      origin: `http://127.0.0.1:${server.address().port}`,
      receipts,
    });
  } finally {
    for (const off of disposers.reverse()) off();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    for (const [key, value] of Object.entries(previous))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("HTTP requests without the application header cannot compute reports, preview or save reviews", async () =>
  withHost(async ({ home, origin }) => {
    for (const route of [
      "/report?refresh=1",
      "/upgrade-preview?targetVersion=0.2.0-rc.2",
      "/reviews",
    ]) {
      const response = await fetch(origin + "/plugin-compat-check" + route, {
        method: route === "/reviews" ? "POST" : "GET",
        headers:
          route === "/reviews" ? { "content-type": "application/json" } : {},
        ...(route === "/reviews" ? { body: "{}" } : {}),
      });
      assert.equal(response.status, 403, route);
    }
    assert.equal(
      fs.existsSync(path.join(home, "dsh-plugin-compat-check")),
      false,
    );
  }));

test("HTTP metadata cannot bypass same-origin fetch admission or advance a rejected baseline", async () =>
  withHost(async ({ home, origin }) => {
    for (const headers of [
      { "sec-fetch-site": "cross-site" },
      { "sec-fetch-site": "same-site" },
      {
        "sec-fetch-site": "none",
        "sec-fetch-mode": "navigate",
        "sec-fetch-dest": "document",
      },
      {
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "no-cors",
        "sec-fetch-dest": "image",
      },
      { origin: "null" },
      { origin: origin + "/path" },
      { referer: "http://127.0.0.1:1/evil" },
      { origin: origin, "sec-fetch-site": "same-site" },
    ]) {
      const response = await fetch(
        origin + "/plugin-compat-check/report?refresh=1",
        { headers: { ...requestHeaders, ...headers } },
      );
      assert.equal(response.status, 403, JSON.stringify(headers));
    }
    assert.equal(
      fs.existsSync(path.join(home, "dsh-plugin-compat-check")),
      false,
    );
    const deniedMethod = await fetch(origin + "/plugin-compat-check/report", {
      method: "POST",
      headers: requestHeaders,
    });
    assert.equal(deniedMethod.status, 405);
    const allowed = await fetch(
      origin + "/plugin-compat-check/report?refresh=1",
      { headers: requestHeaders },
    );
    assert.equal(allowed.status, 200);
    const report = await allowed.json();
    assert.equal(report.ok, true, JSON.stringify(report));
    assert.equal(report.baseline.wrote, true);
    const files = fs.readdirSync(path.join(home, "dsh-plugin-compat-check"));
    assert.ok(
      files.some(
        (file) => file.startsWith("baseline.") && file.endsWith(".json"),
      ),
    );
  }));

test(
  "real Chrome cross-port images omit Origin but cannot start analysis; same-origin fetch recovers",
  { skip: process.env.DSC_SLOW !== "1" },
  async () => {
    assert.ok(chromePath, "Chrome is required for browser boundary acceptance");
    await withHost(async ({ home, origin, receipts }) => {
      const attack = http.createServer((req, res) => {
        res.setHeader("content-type", "text/html");
        res.end(
          '<!doctype html><img src="' +
            origin +
            '/plugin-compat-check/report?refresh=1">',
        );
      });
      await new Promise((resolve) => attack.listen(0, "127.0.0.1", resolve));
      let chrome;
      const waitFor = async (predicate) => {
        const deadline = Date.now() + 10000;
        while (!predicate()) {
          if (Date.now() > deadline)
            throw Error("browser request did not complete");
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      };
      try {
        chrome = await launchChromePipe(chromePath, { timeoutMs: 10000 });
        await chrome.send("Page.enable");
        await chrome.send("Page.navigate", {
          url: `http://127.0.0.1:${attack.address().port}/`,
        });
        await waitFor(() => receipts.some((r) => r.status !== null));
        const image = receipts.find(
          (r) => r.headers["sec-fetch-dest"] === "image",
        );
        assert.ok(image);
        assert.equal(image.headers.origin, undefined);
        assert.equal(image.headers["sec-fetch-site"], "same-site");
        assert.equal(
          fs.existsSync(path.join(home, "dsh-plugin-compat-check")),
          false,
          "cross-port image must not create baseline state",
        );
        assert.equal(image.status, 403);
        await chrome.send("Page.navigate", { url: origin + "/" });
        // Evaluate against the owned document after its navigation commits.
        let result;
        const deadline = Date.now() + 10000;
        do {
          result = await chrome.send("Runtime.evaluate", {
            expression: "location.origin",
            returnByValue: true,
          });
          if (result.result.value === origin) break;
          await new Promise((resolve) => setTimeout(resolve, 20));
        } while (Date.now() < deadline);
        assert.equal(result.result.value, origin);
        const fetched = await chrome.send("Runtime.evaluate", {
          expression: `fetch('/plugin-compat-check/report?refresh=1',{headers:{'X-DSH-Compat-Request':'1'}}).then(async r=>({status:r.status,body:await r.json()}))`,
          awaitPromise: true,
          returnByValue: true,
        });
        assert.equal(fetched.result.value.status, 200);
        assert.equal(fetched.result.value.body.ok, true);
        assert.equal(fetched.result.value.body.baseline.wrote, true);
      } finally {
        await chrome?.close();
        attack.closeAllConnections();
        await new Promise((resolve) => attack.close(resolve));
      }
    });
  },
);
