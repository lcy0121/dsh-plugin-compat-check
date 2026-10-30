/** Shipped ACP against owned loopback Messages/catalog and a tools-only MCP fixture.
 * No real account, production endpoint or caller-selected executable is used.
 * This receipt is separate from Web/Desktop UI acceptance. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { isolatedEnvironment } from "../lib/execution-environment.mjs";
import { stopOwnedChild } from "../lib/probe-runner.mjs";
import { cleanupOwned } from "../lib/owned-process.mjs";
export function parseAcpFrames(text) {
  if (
    typeof text !== "string" ||
    !text.trim() ||
    Buffer.byteLength(text) > 2 * 1024 * 1024
  )
    throw Error("Missing or oversized ACP stdout");
  return text
    .trim()
    .split("\n")
    .map((line) => {
      const f = JSON.parse(line);
      if (
        !f ||
        f.jsonrpc !== "2.0" ||
        f.error ||
        (Object.hasOwn(f, "id") &&
          !["string", "number"].includes(typeof f.id)) ||
        (typeof f.method === "string"
          ? !f.method || Object.hasOwn(f, "result")
          : !Object.hasOwn(f, "id") || !Object.hasOwn(f, "result"))
      )
        throw Error("Invalid ACP JSON-RPC frame");
      return f;
    });
}
/** A clean stream alone cannot prove the requested read-only tool succeeded. */
export function assertAcpResourceOutcome(frames) {
  if (
    !frames.some(
      (f) =>
        f.method === "session/update" &&
        f.params?.update?.sessionUpdate === "tool_call_update" &&
        f.params.update.status === "completed",
    )
  )
    throw Error("ACP resources tool did not complete");
  return true;
}
export async function verifyRc5AcpStdout() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-rc5-acp-")),
    env = isolatedEnvironment(root),
    token = "owned-acp-catalog-token";
  let child,
    server,
    stdout = "",
    stderr = "",
    tail = "",
    failure,
    seq = 0,
    modelCalls = 0,
    catalogCalls = 0;
  const pending = new Map();
  const fail = (error) => {
    failure = error;
    for (const p of pending.values()) p.reject(error);
    pending.clear();
  };
  const expect = (v, m) => {
    if (!v) throw Error(m);
  };
  try {
    server = http.createServer((req, res) => {
      req.resume();
      if (req.method === "GET" && req.url === "/models") {
        catalogCalls++;
        if (req.headers["x-dsh-auth-token"] !== token) {
          res.writeHead(403).end();
          return;
        }
        res.writeHead(200, { "content-type": "application/json" }).end(
          JSON.stringify({
            data: [
              {
                id: "deepseek-flash",
                name: "Owned model",
                input_modalities: ["text"],
                output_modalities: ["text"],
                context_window: 1048576,
                max_output_tokens: 4096,
                api_capabilities: { anthropic_messages: {} },
              },
              { id: "deepseek-v4-pro" },
            ],
          }),
        );
        return;
      }
      if (req.method !== "POST" || !req.url.endsWith("/messages")) {
        res.writeHead(500).end();
        return;
      }
      modelCalls++;
      if (modelCalls > 2) {
        res.writeHead(500).end();
        return;
      }
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
      });
      const send = (data) =>
        res.write(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`);
      send({
        type: "message_start",
        message: {
          id: "owned-message",
          type: "message",
          role: "assistant",
          content: [],
          model: "fixture-api-key-model",
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 0 },
        },
      });
      if (modelCalls === 1) {
        send({
          type: "content_block_start",
          index: 0,
          content_block: {
            type: "tool_use",
            id: "owned-call",
            name: "list_mcp_resources",
            input: {},
          },
        });
        send({
          type: "content_block_delta",
          index: 0,
          delta: {
            type: "input_json_delta",
            partial_json: '{"server":"fixture"}',
          },
        });
      } else {
        send({
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" },
        });
        send({
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "Owned done" },
        });
      }
      send({ type: "content_block_stop", index: 0 });
      send({
        type: "message_delta",
        delta: {
          stop_reason: modelCalls === 1 ? "tool_use" : "end_turn",
          stop_sequence: null,
        },
        usage: { output_tokens: 1 },
      });
      send({ type: "message_stop" });
      res.end();
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    fs.writeFileSync(
      path.join(env.DSH_HOME, ".credentials.yaml"),
      JSON.stringify({
        version: 1,
        records: {
          "deepseek-account-platform/default": {
            kind: "grant",
            payload: { version: 1, token, issuer: origin },
          },
        },
      }),
      { mode: 0o600 },
    );
    const patch = path.join(root, "acp.patch.json");
    fs.writeFileSync(
      patch,
      JSON.stringify([
        {
          id: "deepseek-account",
          config: {
            platformOrigin: origin,
            inferenceOrigin: origin,
            allowLoopbackHttp: true,
          },
        },
        {
          id: "llm-deepseek-account",
          config: { baseURL: origin + "/anthropic" },
        },
        {
          id: "llm-deepseek",
          config: {
            baseURL: origin + "/anthropic",
            models: [{ id: "fixture-api-key-model" }],
          },
        },
        {
          id: "acp",
          inject: ["acpAppStartup", "deepseekAccount"],
          config: {
            provider: "deepseek-official",
            model: "fixture-api-key-model",
          },
        },
        {
          id: "session-persistence-jsonl",
          config: { root: path.join(root, "sessions"), compression: "none" },
        },
      ]),
    );
    const mcp = path.join(root, "mcp.mjs"),
      mcpReceipt = path.join(root, "mcp.json");
    fs.writeFileSync(
      mcp,
      `import fs from 'node:fs';import readline from 'node:readline';let calls=[];for await(const line of readline.createInterface({input:process.stdin})){const r=JSON.parse(line);if(r.id===undefined)continue;calls.push(r.method);fs.writeFileSync(${JSON.stringify(mcpReceipt)},JSON.stringify(calls));let result;if(r.method==='initialize')result={protocolVersion:r.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'owned-tools-only',version:'1.0.0'}};else if(r.method==='tools/list')result={tools:[]};else throw Error('Unexpected MCP operation');console.log(JSON.stringify({jsonrpc:'2.0',id:r.id,result}))}`,
    );
    child = spawn("dsh", ["--profile", "acp", "--patch", patch], {
      cwd: root,
      env: {
        ...env,
        DEEPSEEK_API_KEY: "owned-api-key",
        DEEPSEEK_BASE_URL: origin + "/anthropic",
        DSH_TELEMETRY_DISABLED: "1",
      },
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.on("error", fail);
    child.stdin.on("error", fail);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (b) => {
      stderr += b;
      if (Buffer.byteLength(stderr) > 2 * 1024 * 1024)
        fail(Error("ACP stderr budget"));
    });
    child.stdout.on("data", (b) => {
      stdout += b;
      tail += b;
      if (Buffer.byteLength(stdout) > 2 * 1024 * 1024) {
        fail(Error("ACP stdout budget"));
        return;
      }
      let end;
      while ((end = tail.indexOf("\n")) >= 0) {
        const line = tail.slice(0, end);
        tail = tail.slice(end + 1);
        if (!line.trim()) continue;
        try {
          const [f] = parseAcpFrames(line);
          if (f.method && f.id !== undefined) {
            if (f.method !== "session/request_permission")
              throw Error("Unexpected ACP client request");
            const choice = f.params.options.find(
              (o) => o.kind === "allow_once",
            );
            if (!choice)
              throw Error("Missing read-only tool permission option");
            child.stdin.write(
              JSON.stringify({
                jsonrpc: "2.0",
                id: f.id,
                result: {
                  outcome: { outcome: "selected", optionId: choice.optionId },
                },
              }) + "\n",
            );
          } else if (pending.has(f.id)) {
            pending.get(f.id).resolve(f.result);
            pending.delete(f.id);
          }
        } catch (e) {
          fail(e);
        }
      }
    });
    child.on("close", () => {
      if (pending.size) fail(Error("ACP exited before response"));
    });
    const request = (method, params) =>
      new Promise((resolve, reject) => {
        if (failure) return reject(failure);
        const id = ++seq,
          timer = setTimeout(() => {
            pending.delete(id);
            reject(Error("ACP request deadline: " + method));
          }, 20000);
        pending.set(id, {
          resolve: (v) => {
            clearTimeout(timer);
            resolve(v);
          },
          reject: (e) => {
            clearTimeout(timer);
            reject(e);
          },
        });
        child.stdin.write(
          JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
        );
      });
    await request("initialize", { protocolVersion: 1, clientCapabilities: {} });
    const created = await request("session/new", {
      cwd: root,
      mcpServers: [
        { name: "fixture", command: process.execPath, args: [mcp], env: [] },
      ],
    });
    expect(typeof created.sessionId === "string", "ACP session not created");
    const result = await request("session/prompt", {
      sessionId: created.sessionId,
      prompt: [{ type: "text", text: "List the owned fixture resources." }],
    });
    expect(result.stopReason === "end_turn", "ACP mock prompt did not finish");
    await request("session/close", { sessionId: created.sessionId });
    const closed = new Promise((resolve) => child.once("close", resolve));
    child.stdin.end();
    let closeTimer;
    try {
      await Promise.race([
        closed,
        new Promise((_, reject) => {
          closeTimer = setTimeout(
            () => reject(Error("ACP close deadline")),
            8000,
          );
        }),
      ]);
    } finally {
      clearTimeout(closeTimer);
    }
    expect(
      child.exitCode === 0 && !child.signalCode,
      "ACP did not exit normally",
    );
    if (failure) throw failure;
    const frames = parseAcpFrames(stdout);
    assertAcpResourceOutcome(frames);
    expect(
      catalogCalls === 1 && modelCalls === 2,
      "Unexpected owned endpoint calls",
    );
    expect(
      stderr.includes(
        "model listing from " + origin + "/models loaded 2 model(s)",
      ) && stderr.includes("no api_capabilities.anthropic_messages"),
      "Catalog diagnostics missing on stderr",
    );
    expect(
      !stderr.includes(token) && !stdout.includes(token),
      "ACP exposed fixture credential",
    );
    const mcpCalls = JSON.parse(fs.readFileSync(mcpReceipt));
    expect(
      mcpCalls.includes("initialize") &&
        !mcpCalls.some((c) => c.startsWith("resources/")),
      "MCP capability guard was bypassed",
    );
    const receipt = {
      actualAcp: true,
      catalogDiagnosticsStderr: true,
      mcpResources: true,
      stdoutJsonRpc: true,
      frames: frames.length,
      catalogRequests: catalogCalls,
      mockModelRequests: modelCalls,
      productionRequests: 0,
    };
    await stopOwnedChild(child);
    child = null;
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    server = null;
    fs.rmSync(root, { recursive: true, force: true });
    return { ...receipt, cleaned: !fs.existsSync(root) };
  } finally {
    await cleanupOwned([
      () => child && stopOwnedChild(child),
      async () => {
        if (server) {
          server.closeAllConnections();
          await new Promise((r) => server.close(r));
        }
      },
    ]);
    fs.rmSync(root, { recursive: true, force: true });
  }
}
