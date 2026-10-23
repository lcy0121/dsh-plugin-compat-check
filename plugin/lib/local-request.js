/** 本地信任栅栏：只有本机的 DSH 界面该读到这份数据。 */
export function isTrustedRequest(req) {
  try {
    const header = (name) => {
      const value = Object.entries(req.headers || {}).find(
        ([key]) => key.toLowerCase() === name,
      )?.[1];
      if (value !== undefined && typeof value !== "string")
        throw new Error("Invalid request header");
      return value;
    };
    // A non-safelisted header also fences legacy browsers that omit both Origin
    // and Fetch Metadata. It is a CSRF admission marker, never an auth secret.
    if (header("x-dsh-compat-request") !== "1") return false;
    const host = header("host") || "";
    const origin = header("origin");
    const hostOk = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(host);
    if (!hostOk) return false;
    const peer = req.socket?.remoteAddress;
    if (peer && !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(peer))
      return false;
    const protocol = req.socket?.encrypted === true ? "https:" : "http:";
    const expectedOrigin = new URL(`${protocol}//${host}`).origin;
    const site = header("sec-fetch-site"),
      mode = header("sec-fetch-mode"),
      dest = header("sec-fetch-dest");
    if (site !== undefined && site !== "same-origin") return false;
    if (mode !== undefined && !["cors", "same-origin"].includes(mode))
      return false;
    if (dest !== undefined && !["", "empty"].includes(dest)) return false;
    if (
      origin !== undefined &&
      (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(origin) ||
        new URL(origin).origin !== expectedOrigin)
    )
      return false;
    const referer = header("referer");
    if (referer !== undefined && new URL(referer).origin !== expectedOrigin)
      return false;
    return true;
  } catch {
    return false;
  }
}
