/** Exercise the installed official cache/decoder using loopback GET only. */
import assert from "node:assert/strict";
import http from "node:http";
export async function verifyModelListing({
  ModelListingCache,
  requestModelListing,
}) {
  let mode = "ok",
    clock = 0,
    credential,
    calls = 0,
    firstFinished = false,
    release;
  const gate = new Promise((r) => (release = r)),
    warnings = [];
  const server = http.createServer(async (req, res) => {
    calls++;
    assert.equal(req.method, "GET");
    assert.equal(req.url, "/models");
    if (mode === "wait") await gate;
    if (mode === "timeout") return;
    res.writeHead(mode === "failure" ? 401 : 200, {
      "Content-Type": "application/json",
    });
    res.end(
      JSON.stringify(
        mode === "failure"
          ? { error: "controlled failure" }
          : { data: [{ id: "deepseek-flash" }] },
      ),
    );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const settings = {
    url: `http://127.0.0.1:${server.address().port}/models`,
    timeoutMs: 3000,
    maxAgeMs: 10,
  };
  const cache = new ModelListingCache({
    credential: async () => credential,
    load: (url, key, signal) => {
      assert.equal(new URL(url).hostname, "127.0.0.1");
      return requestModelListing(url, { "x-api-key": key }, signal);
    },
    now: () => clock,
    info: () => {},
    warn: (s) => warnings.push(s),
  });
  try {
    assert.equal((await cache.view(settings)).authenticated, false);
    assert.equal(calls, 0);
    credential = "owned-test-key";
    mode = "wait";
    const pending = cache.view(settings).then((v) => {
      firstFinished = true;
      return v;
    });
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(firstFinished, false);
    release();
    const good = await pending;
    assert.equal(good.listing.entries[0].id, "deepseek-flash");
    mode = "failure";
    clock = 20;
    await cache.view(settings);
    for (let i = 0; i < 50 && !warnings.length; i++)
      await new Promise((r) => setTimeout(r, 10));
    assert.match(warnings.at(-1), /previous catalog/);
    assert.deepEqual(cache.current().listing, good.listing);
    cache.invalidate();
    assert.equal((await cache.view(settings)).listing, undefined);
    assert.match(warnings.at(-1), /bundled catalog/);
    cache.invalidate();
    mode = "timeout";
    settings.timeoutMs = 200;
    const start = Date.now();
    assert.equal((await cache.view(settings)).listing, undefined);
    assert(Date.now() - start < 2500);
    credential = undefined;
    const before = calls;
    assert.equal((await cache.view(settings)).authenticated, false);
    assert.equal(calls, before);
    assert(!warnings.join(" ").includes("owned-test-key"));
    return {
      noCredentialRequests: 0,
      firstUseWait: true,
      failureFallback: true,
      lastGoodRetained: true,
      deadline: true,
      requests: calls,
      modelCalls: 0,
      productionRequests: 0,
    };
  } finally {
    cache.dispose();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}
