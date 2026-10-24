#!/usr/bin/env node
/** Offline document contracts and local links. Tests are never run recursively. */
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TOOL_VERSION } from "../lib/version.mjs";
import { CATALOG_REFERENCES } from "../lib/contracts.mjs";
import { SUPPORTED_PREVIEW_VERSIONS } from "../lib/upgrade-contract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT_READMES = ["README.md", "README.en.md", "README.ko.md"];
export function maintainedDocuments(root) {
  const tracked = execFileSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "-z",
      "--",
      "*.md",
    ],
    { cwd: root, encoding: "utf8" },
  )
    .split("\0")
    .filter((rel) => rel && fs.existsSync(path.join(root, rel)));
  return [
    ...new Set([...ROOT_READMES, "THIRD_PARTY_NOTICES.md", ...tracked]),
  ].sort();
}

/** GitHub-style anchors for the headings used by maintained Markdown. */
function anchors(source) {
  const found = new Set(),
    counts = new Map();
  let fenced = false;
  for (const line of source.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const heading = /^#{1,6}\s+(.+?)(?:\s+#+)?$/.exec(line);
    if (!heading) continue;
    const base = heading[1]
      .replace(/<[^>]*>/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}_\- ]/gu, "")
      .replace(/ /g, "-");
    const n = counts.get(base) || 0;
    counts.set(base, n + 1);
    found.add(base + (n ? "-" + n : ""));
  }
  return found;
}

/** Check every repository Markdown link, including heading fragments. */
export function checkDocumentLinks(root, documents) {
  const problems = [];
  for (const rel of documents) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) {
      problems.push(`${rel}: missing document`);
      continue;
    }
    let fenced = false;
    for (const [index, line] of fs
      .readFileSync(file, "utf8")
      .split("\n")
      .entries()) {
      if (/^\s*(```|~~~)/.test(line)) {
        fenced = !fenced;
        continue;
      }
      if (fenced) continue;
      for (const match of line.matchAll(
        /\]\((<[^>]+>|[^\s)]+)(?:\s+"[^\"]*")?\)/g,
      )) {
        const url = match[1].replace(/^<|>$/g, "");
        // External URLs and historical absolute local attachments have separate scope.
        if (/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(url)) continue;
        let target, fragment;
        try {
          target = decodeURIComponent(url.split(/[?#]/)[0]);
          fragment = url.includes("#")
            ? decodeURIComponent(url.slice(url.indexOf("#") + 1))
            : "";
        } catch {
          problems.push(`${rel}:${index + 1}: invalid link ${url}`);
          continue;
        }
        const resolved = target
          ? path.resolve(path.dirname(file), target)
          : file;
        const relative = path.relative(root, resolved);
        if (
          relative.startsWith(`..${path.sep}`) ||
          relative === ".." ||
          !fs.existsSync(resolved)
        )
          problems.push(`${rel}:${index + 1}: broken local link ${url}`);
        else if (
          fragment &&
          resolved.endsWith(".md") &&
          !anchors(fs.readFileSync(resolved, "utf8")).has(fragment)
        )
          problems.push(`${rel}:${index + 1}: missing heading ${url}`);
      }
    }
  }
  return problems;
}

/** Check the visible claims, not every version mentioned in commands or history. */
export function checkDocumentVersions(root) {
  const expected = CATALOG_REFERENCES.map((item) => item.version).sort();
  const problems = [];
  const same = (values) =>
    JSON.stringify([...values].sort()) === JSON.stringify(expected);
  const claims = [
    ["README.md", /已认证精确目录仅 \*\*([^*]+)\*\*/],
    ["README.en.md", /Certified exact catalogues remain \*\*([^*]+)\*\*/],
    ["README.ko.md", /인증된 정확한 카탈로그 버전은 \*\*([^*]+)\*\*/],
    ["plugin/README.md", /已认证精确目录仍仅\*\*([^*]+)\*\*/],
    ["docs/Plan.md", /仅支持精确\*\*([^*]+)\*\*/],
    ["docs/Plan.md", /默认矩阵包含([^。]+)。/, "author default"],
    ["docs/guide.md", /已认证精确目录为([^。]+)。/],
    ["skill/SKILL.md", /当前已认证目录仅为 ([^。]+)。/],
    ["docs/author-ci.md", /默认矩阵包含已认证的 ([^。]+)。/, "author default"],
    [
      "examples/author-ci.yml",
      /# Default reviewed source matrix: ([^;]+);/,
      "author default",
    ],
  ];
  for (const [rel, pattern, label = "certified versions"] of claims) {
    const text = fs.readFileSync(path.join(root, rel), "utf8");
    const matches = [...text.matchAll(new RegExp(pattern.source, "g"))];
    const values =
      matches[0]?.[1].match(/\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?/g) || [];
    if (matches.length !== 1 || !same(values))
      problems.push(`${rel}: ${label} must list ${expected.join(", ")}`);
  }
  const current = JSON.parse(
    fs.readFileSync(path.join(root, "docs/current-state.json"), "utf8"),
  );
  if (!same(current.verification?.catalogueScope?.certifiedExactVersions || []))
    problems.push(
      "docs/current-state.json: certified versions differ from registry",
    );
  if (!same(SUPPORTED_PREVIEW_VERSIONS))
    problems.push(
      "lib/upgrade-contract.mjs: certified versions differ from registry",
    );
  return problems;
}

function main(argv) {
  const problems = [];
  try {
    execFileSync(
      process.execPath,
      [path.join(ROOT, "tools/third-party-notices.mjs"), "--check"],
      { stdio: "pipe" },
    );
  } catch (error) {
    problems.push(
      "Third-party notices differ from dependency metadata/licenses: " +
        String(error.stderr || error.message).trim(),
    );
  }
  try {
    execFileSync(
      process.execPath,
      [path.join(ROOT, "plugin/scripts/stage-contract.mjs"), "--check"],
      { stdio: "pipe" },
    );
  } catch {
    problems.push(
      "Generated report contracts differ from lib/contracts.mjs; run stage-contract.mjs",
    );
  }
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
  const current = JSON.parse(read("docs/current-state.json"));
  const count = fs
    .readdirSync(path.join(ROOT, "test"))
    .filter((f) => f.endsWith(".test.mjs")).length;
  if (current.testFiles !== count)
    problems.push(`testFiles: ${current.testFiles} != ${count}`);
  if (current.toolVersion !== TOOL_VERSION)
    problems.push("toolVersion differs from kernel");
  for (const rel of [
    "plugin/package.json",
    "probe/package.json",
    "tools/slot-probe/package.json",
  ])
    if (JSON.parse(read(rel)).version !== TOOL_VERSION)
      problems.push(`${rel}: version differs from kernel`);
  for (const rel of ROOT_READMES) {
    if (!read(rel).includes("docs/current-state.json"))
      problems.push(`${rel}: missing current-state link`);
    if (!read(rel).includes("docs/Plan.md"))
      problems.push(`${rel}: missing migrated plan link`);
    if (!read(rel).includes(TOOL_VERSION))
      problems.push(`${rel}: missing current version`);
  }
  for (const name of ["Plan.md", "GPT审计及重构方案文档.md"]) {
    if (fs.existsSync(path.join(ROOT, name)))
      problems.push(`${name}: obsolete root copy`);
    if (name === "Plan.md" && !fs.existsSync(path.join(ROOT, "docs", name)))
      problems.push(`docs/${name}: missing maintained plan`);
  }
  if (read("skill/SKILL.md") !== read("plugin/skill/SKILL.md"))
    problems.push("packaged skill differs from source");
  for (const rel of [...ROOT_READMES, "plugin/README.md"]) {
    const headings = [...read(rel).matchAll(/^## (.+)$/gm)];
    if (
      headings.at(-1)?.[1] !== "License" ||
      !read(rel).includes("THIRD_PARTY_NOTICES.md")
    )
      problems.push(
        `${rel}: final License section / third-party notices link missing`,
      );
  }
  const documents = maintainedDocuments(ROOT);
  problems.push(...checkDocumentLinks(ROOT, documents));
  problems.push(...checkDocumentVersions(ROOT));
  let summaryTests;
  if (argv.length) {
    if (argv.length !== 2 || argv[0] !== "--test-summary")
      throw new Error(
        "Usage: node tools/doc-check.mjs [--test-summary <successful TAP log>]",
      );
    const log = fs.readFileSync(argv[1], "utf8");
    const tests = Number(/^(?:#|ℹ) tests (\d+)/m.exec(log)?.[1]);
    const failed = Number(/^(?:#|ℹ) fail (\d+)/m.exec(log)?.[1]);
    if (!Number.isFinite(tests) || failed !== 0)
      problems.push("Missing or failing test summary");
    else {
      summaryTests = tests;
      const profiles = current.verification?.optionalProfiles || {};
      const sameInputs = Object.entries(profiles).every(
        ([name, present]) =>
          fs.existsSync(
            path.join(os.homedir(), ".dsh/profiles", name, "node_modules"),
          ) === present,
      );
      if (sameInputs && tests !== current.tests)
        problems.push(`tests: ${current.tests} != ${tests}`);
      console.log(
        `Verified successful test summary: ${tests} tests${sameInputs ? "" : " (different optional profile inputs)"}`,
      );
    }
  }
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exitCode = 1;
  } else
    console.log(
      `Documentation facts checked: ${TOOL_VERSION}, ${count} test files, ${documents.length} documents${summaryTests === undefined ? "" : `, ${summaryTests} tests`}`,
    );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
