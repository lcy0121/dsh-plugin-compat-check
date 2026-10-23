/** Filesystem inputs are data. Never open a FIFO in blocking mode or read to EOF. */
import fs from "node:fs";

export const inputError = (code, message) =>
  Object.assign(new Error(message), { code });
const stamp = (s) => [s.dev, s.ino, s.size, s.mtimeMs, s.ctimeMs];
const same = (a, b) => JSON.stringify(stamp(a)) === JSON.stringify(stamp(b));

export function lowerInputLimits(defaults, overrides = {}) {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides))
    throw inputError("STATIC_INPUT_BUDGET", "Invalid static input budget");
  for (const [key, value] of Object.entries(overrides))
    if (
      !Object.hasOwn(defaults, key) ||
      !Number.isSafeInteger(value) ||
      value <= 0 ||
      value > defaults[key]
    )
      throw inputError(
        "STATIC_INPUT_BUDGET",
        "Invalid static input budget: " + key,
      );
  return { ...defaults, ...overrides };
}

export function readStaticFile(file, maxBytes, check = () => {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
    throw inputError("STATIC_INPUT_BUDGET", "Invalid static input byte budget");
  let fd,
    observed = false;
  try {
    check();
    const before = fs.lstatSync(file);
    observed = true;
    if (!before.isFile())
      throw inputError("STATIC_INPUT_TYPE", "Input is not a regular file");
    if (before.size > maxBytes)
      throw inputError("STATIC_INPUT_BUDGET", "Input byte budget exceeded");
    fd = fs.openSync(
      file,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
    );
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || !same(before, opened))
      throw inputError("STATIC_INPUT_CHANGED", "Input identity changed");
    const buffer = Buffer.alloc(before.size + 1);
    let length = 0;
    while (length < buffer.length) {
      check();
      const n = fs.readSync(
        fd,
        buffer,
        length,
        Math.min(buffer.length - length, 65536),
        null,
      );
      if (!n) break;
      length += n;
    }
    if (length > maxBytes)
      throw inputError("STATIC_INPUT_BUDGET", "Input byte budget exceeded");
    if (
      length !== before.size ||
      !same(before, fs.fstatSync(fd)) ||
      !same(before, fs.lstatSync(file))
    )
      throw inputError(
        "STATIC_INPUT_CHANGED",
        "Input changed during bounded read",
      );
    return buffer.subarray(0, length);
  } catch (error) {
    if (observed && ["ENOENT", "ENOTDIR"].includes(error.code))
      throw inputError(
        "STATIC_INPUT_CHANGED",
        "Input path changed during bounded read",
      );
    throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/** Collect only a bounded directory listing; close the handle even on timeout. */
export function readStaticDirectory(dir, maxEntries, check = () => {}) {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 0)
    throw inputError(
      "STATIC_INPUT_BUDGET",
      "Invalid static input entry budget",
    );
  const handle = fs.opendirSync(dir),
    entries = [];
  try {
    for (;;) {
      check();
      const entry = handle.readSync();
      if (!entry) break;
      if (entries.length >= maxEntries)
        throw inputError(
          "STATIC_INPUT_BUDGET",
          "Directory entry budget exceeded",
        );
      entries.push(entry.name);
    }
    entries.sort();
    check();
    return entries;
  } finally {
    handle.closeSync();
  }
}
