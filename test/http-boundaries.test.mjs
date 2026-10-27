import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { writePackageFixture } from "./fixture-utils.mjs";
import * as LocalRequest from "../plugin/lib/local-request.js";
import { launchChromePipe } from "../lib/debugger.mjs";

const requestHeaders = {
  "X-DSH-Compat-Request": "1",
  cookie: "owned-test-session=valid",
};
const chromePath =
  process.env.DSC_CHROME ||
  [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].find((file) => fs.existsSync(file));

async function withHost(
  check,
  authCheck = (req) =>
    req.headers.cookie === "owned-test-session=valid" ? undefined : 401,
) {
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
      res.setHeader(
        "set-cookie",
        "owned-test-session=valid; Path=/; SameSite=Strict",
      );
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
      get: (name) =>
        name === "connection" ? { requestRejection: authCheck } : undefined,
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
    assert.equal(routes.size, 4);
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
      "/history",
    ]) {
      const response = await fetch(origin + "/plugin-compat-check" + route, {
        method: ["/reviews", "/history"].includes(route) ? "POST" : "GET",
        headers: ["/reviews", "/history"].includes(route)
          ? { "content-type": "application/json" }
          : {},
        ...(["/reviews", "/history"].includes(route) ? { body: "{}" } : {}),
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
        res.setHeader(
          "set-cookie",
          "owned-test-session=valid; Path=/; SameSite=Strict",
        );
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

test("host authentication is required before any report, metadata, preview or review side effect", async () =>
  withHost(async ({ home, origin }) => {
    for (const route of [
      "/report?refresh=1",
      "/report?metadata=1",
      "/upgrade-preview?targetVersion=0.2.1-rc.3",
      "/reviews",
      "/history",
    ])
      for (const cookie of [
        undefined,
        "owned-test-session=forged",
        "owned-test-session=expired",
      ]) {
        const res = await fetch(origin + "/plugin-compat-check" + route, {
          method: ["/reviews", "/history"].includes(route) ? "POST" : "GET",
          headers: {
            "X-DSH-Compat-Request": "1",
            ...(cookie ? { cookie } : {}),
            ...(["/reviews", "/history"].includes(route)
              ? { "content-type": "application/json" }
              : {}),
          },
          ...(["/reviews", "/history"].includes(route) ? { body: "{}" } : {}),
        });
        assert.equal(res.status, 401, route);
        assert.equal(res.headers.get("cache-control"), "no-store");
        assert.equal(
          fs.existsSync(path.join(home, "dsh-plugin-compat-check")),
          false,
        );
      }
    const res = await fetch(origin + "/plugin-compat-check/report?refresh=1", {
      headers: requestHeaders,
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, true);
  }));

test("host auth method is called with its service receiver and failures never downgrade to CSRF-only access", () => {
  const req = {
    headers: { host: "127.0.0.1:8123", "x-dsh-compat-request": "1" },
    socket: { remoteAddress: "127.0.0.1" },
  };
  for (const connection of [
    undefined,
    {},
    {
      requestRejection() {
        throw new Error("PRIVATE");
      },
    },
    { requestRejection: () => false },
    { requestRejection: () => null },
    { requestRejection: () => Promise.resolve(undefined) },
  ])
    assert.equal(
      LocalRequest.requestRejection({ get: () => connection }, req),
      503,
    );
  const connection = {
    requestRejection(r) {
      assert.equal(this, connection);
      assert.equal(r, req);
      return undefined;
    },
  };
  assert.equal(
    LocalRequest.requestRejection({ get: () => connection }, req),
    null,
  );
  for (const rejection of [401, 403])
    assert.equal(
      LocalRequest.requestRejection(
        { get: () => ({ requestRejection: () => rejection }) },
        req,
      ),
      rejection,
    );
  assert.equal(
    LocalRequest.requestRejection(
      {
        get() {
          throw new Error("must not query auth");
        },
      },
      { headers: {} },
    ),
    403,
  );
});

test("owned acceptance login exchanges only the root launch URL for a signed session cookie", async () => {
  const { ownedHostHeaders } = await import("../tools/owned-host-session.mjs");
  let calls = 0;
  const fetcher = async (url, options) => {
    calls++;
    assert.equal(options.redirect, "manual");
    return {
      status: 303,
      headers: new Headers({
        "set-cookie":
          "dsh-auth-owned=v1.owned.signature; Path=/; HttpOnly; SameSite=Strict",
      }),
    };
  };
  const headers = await ownedHostHeaders(
    "http://127.0.0.1:8123/?token=owned-launch",
    { fetch: fetcher },
  );
  assert.equal(headers.Cookie, "dsh-auth-owned=v1.owned.signature");
  assert.equal(headers.Authorization, undefined);
  for (const url of [
    "https://external.test/?token=owned",
    "http://127.0.0.1:8123/other?token=owned",
    "http://127.0.0.1:8123/?token=a&token=b",
  ])
    await assert.rejects(ownedHostHeaders(url, { fetch: fetcher }));
  assert.equal(calls, 1);
  await assert.rejects(
    ownedHostHeaders("http://127.0.0.1:8123/?token=owned", {
      fetch: async () => ({ status: 401, headers: new Headers() }),
    }),
    /session/,
  );
});
