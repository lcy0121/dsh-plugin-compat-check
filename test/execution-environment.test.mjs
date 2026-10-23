import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

// A spread of the caller environment, missing private paths, or a boot-only
// bypass must fail these real subprocess checks.
for (const api of ["probeProfile", "installAndProbe"])
  test(`${api} isolates every DSH child and runs the actual probe`, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-environment-"));
    const source = path.join(root, "source"),
      trace = path.join(root, "trace");
    try {
      fs.mkdirSync(path.join(source, "node_modules"), { recursive: true });
      const config = JSON.stringify({
        dependencies: {},
        dsh: { profile: { bundles: [] } },
        secret: "copied-profile-secret",
      });
      fs.writeFileSync(path.join(source, "package.json"), config);
      const failOnce = path.join(root, "fail-once");
      fs.writeFileSync(failOnce, "");
      const fake = `#!${process.execPath}
const fs=require('node:fs'),path=require('node:path');
(async()=>{const a=process.argv.slice(2),profile=path.join(process.env.DSH_HOME,'profiles',a[a.indexOf('--profile')+1]);
const e=process.env, paths=['HOME','USERPROFILE','XDG_CONFIG_HOME','XDG_CACHE_HOME','DSH_HOME','DSH_AGENTS_HOME','npm_config_cache','npm_config_store_dir'];
fs.appendFileSync(${JSON.stringify(trace)},JSON.stringify({a,env:e,profileSecret:fs.existsSync(path.join(profile,'package.json'))?JSON.parse(fs.readFileSync(path.join(profile,'package.json'))).secret:null,privatePaths:paths.every(k=>fs.existsSync(e[k]||'')&&fs.statSync(e[k]).isDirectory()&&(fs.statSync(e[k]).mode&0o077)===0),configs:['npm_config_userconfig','npm_config_globalconfig'].map(k=>e[k]&&fs.existsSync(e[k])?{content:fs.readFileSync(e[k],'utf8'),mode:fs.statSync(e[k]).mode&0o777}:null)})+'\\n');
if(fs.existsSync(${JSON.stringify(failOnce)})){fs.rmSync(${JSON.stringify(failOnce)});process.exit(7);}
if(a.includes('--version')){console.log('0.2.0');return;}
if(a.includes('--dump-config')){fs.mkdirSync(path.join(profile,'node_modules'),{recursive:true});fs.writeFileSync(path.join(profile,'package.json'),JSON.stringify({dependencies:{},dsh:{profile:{bundles:[]}}}));return;}
if(a.includes('plugin'))return;
global.setTimeout=fn=>{queueMicrotask(fn);return {unref(){}}};
const probe=await import('file://'+path.join(e.DSC_OUT_DIR,'probe','index.mjs'));probe.apply({get:n=>n==='loader'?{entries:()=>[]}:undefined,effect(){}});setInterval(()=>{},1000);
})().catch(e=>{console.error(e);process.exit(1)});`;
      fs.writeFileSync(path.join(root, "dsh"), fake, { mode: 0o700 });
      const env = {
        ...process.env,
        PATH: root + path.delimiter + process.env.PATH,
        OPENAI_API_KEY: "sentinel-key",
        ANTHROPIC_API_KEY: "sentinel-key",
        CUSTOM_SECRET: "sentinel-secret",
        NODE_OPTIONS: "--no-warnings",
        NODE_PATH: "/sentinel/node-path",
        LD_LIBRARY_PATH: "/sentinel/lib",
        DYLD_LIBRARY_PATH: "/sentinel/lib",
        HTTPS_PROXY: "http://sentinel.invalid",
        HTTP_PROXY: "http://sentinel.invalid",
        ALL_PROXY: "http://sentinel.invalid",
        NO_PROXY: "sentinel",
        NODE_EXTRA_CA_CERTS: "",
        SSL_CERT_FILE: "/sentinel/cert",
        npm_config_registry: "https://sentinel.invalid",
        NPM_CONFIG_USERCONFIG: "/sentinel/npmrc",
        npm_config_ignore_scripts: "false",
        npm_config_cache: "/sentinel/cache",
        npm_config_store_dir: "/sentinel/store",
        DSC_DSH_VERSION: "stale-version",
        DSC_PROFILE_ID: "stale-profile",
        DSC_OUT_DIR: "/sentinel/out",
        DSC_TEST_HOOK: "sentinel-hook",
        DSH_HOME: "/sentinel/dsh",
        DSH_AGENTS_HOME: "/sentinel/agents",
        XDG_CONFIG_HOME: "/sentinel/config",
        HOME: root,
        USERPROFILE: root,
      };
      const expr =
        api === "probeProfile"
          ? `probeProfile(${JSON.stringify(path.join(source, "node_modules"))},{timeoutSec:5})`
          : `installAndProbe('file:/fake-plugin',{timeoutSec:5,servicesFor:()=>({services:[],manifests:[]})})`;
      const code = `import {probeProfile,installAndProbe} from ${JSON.stringify(new URL("../lib/probe-runner.mjs", import.meta.url).href)};const before=JSON.stringify(process.env);const failed=await ${expr};const out=await ${expr};console.log(JSON.stringify({failed,out,parentPreserved:JSON.stringify(process.env)===before}));`;
      const r = spawnSync(
        process.execPath,
        ["--input-type=module", "-e", code],
        { env, encoding: "utf8", timeout: 15000 },
      );
      assert.equal(r.status, 0, r.stderr);
      const { failed, out, parentPreserved } = JSON.parse(r.stdout);
      assert.ok(failed.error, JSON.stringify(failed));
      assert.equal((failed.cleanup || failed).tempProfileRemoved, true);
      assert.equal(out.error ?? null, null, JSON.stringify(out));
      assert.ok(out.surface);
      assert.equal(parentPreserved, true);
      assert.equal(
        fs.readFileSync(path.join(source, "package.json"), "utf8"),
        config,
      );
      const records = fs
        .readFileSync(trace, "utf8")
        .trim()
        .split("\n")
        .map(JSON.parse);
      assert.ok(records.some((r) => r.a.includes("--version")));
      assert.ok(records.some((r) => r.a.includes("--no-open")));
      assert.ok(records.some((r) => r.a.includes("plugin")));
      for (const record of records) {
        for (const key of [
          "OPENAI_API_KEY",
          "ANTHROPIC_API_KEY",
          "CUSTOM_SECRET",
          "NODE_OPTIONS",
          "NODE_PATH",
          "LD_LIBRARY_PATH",
          "DYLD_LIBRARY_PATH",
          "HTTPS_PROXY",
          "HTTP_PROXY",
          "ALL_PROXY",
          "NO_PROXY",
          "NODE_EXTRA_CA_CERTS",
          "SSL_CERT_FILE",
          "npm_config_registry",
          "NPM_CONFIG_USERCONFIG",
          "DSC_TEST_HOOK",
        ])
          assert.equal(
            Object.hasOwn(record.env, key),
            false,
            `${key} reached ${record.a}`,
          );
        assert.equal(record.env.PATH, env.PATH);
        assert.equal(record.privatePaths, true, JSON.stringify(record));
        assert.deepEqual(record.configs, [
          { content: "", mode: 0o600 },
          { content: "", mode: 0o600 },
        ]);
        assert.equal(record.env.npm_config_ignore_scripts, "true");
        const work = record.env.DSC_OUT_DIR;
        for (const key of [
          "HOME",
          "USERPROFILE",
          "XDG_CONFIG_HOME",
          "XDG_CACHE_HOME",
          "DSH_HOME",
          "DSH_AGENTS_HOME",
          "npm_config_cache",
          "npm_config_store_dir",
          "npm_config_userconfig",
          "npm_config_globalconfig",
        ])
          assert.ok(
            record.env[key].startsWith(work + path.sep),
            `${key} is not owned`,
          );
        if (record.a.includes("--no-open")) {
          if (api === "probeProfile")
            assert.equal(record.profileSecret, "copied-profile-secret");
          assert.equal(record.env.DSC_DSH_VERSION, "0.2.0");
          assert.equal(
            record.env.DSC_PROFILE_ID,
            api === "probeProfile"
              ? path.join(source, "node_modules")
              : path.join(
                  record.env.DSH_HOME,
                  "profiles",
                  record.a[1],
                  "node_modules",
                ),
          );
        } else assert.notEqual(record.env.DSC_DSH_VERSION, "stale-version");
        assert.equal(
          fs.existsSync(work),
          false,
          "successful cleanup removes the entire private environment",
        );
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
