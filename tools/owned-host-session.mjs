/** Acceptance only: exchange an owned loopback host launch URL, never log its credential. */
export async function ownedHostHeaders(
  input,
  {
    fetch: request = globalThis.fetch,
    signal = AbortSignal.timeout(10000),
  } = {},
) {
  const url = new URL(input);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.pathname !== "/" ||
    url.username ||
    url.password ||
    url.hash ||
    url.searchParams.getAll("token").length !== 1 ||
    !url.searchParams.get("token") ||
    [...url.searchParams.keys()].some((key) => key !== "token")
  )
    throw Error("Expected an owned loopback root launch URL");
  const response = await request(url, {
    redirect: "manual",
    credentials: "omit",
    signal,
  });
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .find((value) =>
      /^dsh-auth-[a-zA-Z0-9_-]+=v[12]\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(
        value,
      ),
    );
  if (response.status !== 303 || !cookie)
    throw Error("Owned host session exchange failed");
  return { "X-DSH-Compat-Request": "1", Cookie: cookie };
}
