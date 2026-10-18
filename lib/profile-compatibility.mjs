/** Read independent profile grants without importing or changing target plugins. */
import fs from "node:fs";
import path from "node:path";
import semver from "semver";

const exact = (value) => {
  const parsed = typeof value === "string" ? semver.parse(value) : null;
  return (
    parsed !== null &&
    value ===
      parsed.version + (parsed.build.length ? "+" + parsed.build.join(".") : "")
  );
};
export function readProfileCompatibility(nodeModules) {
  const file = path.join(path.dirname(nodeModules), "compatibility.json");
  const unavailable = (note) => ({
    file,
    exemptions: undefined,
    notes: [note],
  });
  let fd;
  try {
    fd = fs.openSync(
      file,
      fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK || 0),
    );
    if (!fs.fstatSync(fd).isFile())
      return unavailable("compatibility.json 不是普通文件，精确豁免未观测");
    const buffer = Buffer.alloc(65537),
      length = fs.readSync(fd, buffer, 0, buffer.length, 0);
    if (length > 65536)
      return unavailable(
        "compatibility.json 超过64KiB读取预算，精确豁免未观测",
      );
    const value = JSON.parse(buffer.subarray(0, length).toString("utf8"));
    if (value === null || typeof value !== "object" || Array.isArray(value))
      return unavailable(
        "compatibility.json 必须为精确版本豁免对象，记录未采用",
      );
    const exemptions = Object.create(null),
      notes = [];
    for (const [key, versions] of Object.entries(value)) {
      const i = key.lastIndexOf("@");
      if (
        i <= 0 ||
        !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(
          key.slice(0, i),
        ) ||
        !exact(key.slice(i + 1)) ||
        !Array.isArray(versions) ||
        !versions.every(exact)
      ) {
        notes.push("compatibility.json 含无效的精确版本豁免记录，已忽略");
        continue;
      }
      Object.defineProperty(exemptions, key, {
        value: versions,
        enumerable: true,
      });
    }
    return { file, exemptions, notes };
  } catch (error) {
    return error.code === "ENOENT"
      ? { file, exemptions: {}, notes: [] }
      : unavailable("compatibility.json 不可读或JSON无效，精确豁免未观测");
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
