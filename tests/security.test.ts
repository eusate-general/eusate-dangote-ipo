import { beforeAll, describe, expect, it, vi } from "vitest";

// getEnv() validates the whole process env (DATABASE_URL included) the first time it is called
// and caches the result for this test file's module lifetime. Stub a harmless value before
// anything below triggers that first parse — nothing here ever calls getDb(), so it is never
// used to actually connect.
beforeAll(() => {
  vi.stubEnv("DATABASE_URL", "postgres://test/test");
});

describe("clientIp", () => {
  it("prefers the Vercel-set header over a client-suppliable one", async () => {
    const { clientIp } = await import("@/lib/security/ratelimit");
    const h = new Headers({ "x-vercel-forwarded-for": "1.1.1.1", "x-forwarded-for": "9.9.9.9, 8.8.8.8" });
    expect(clientIp(h)).toBe("1.1.1.1");
  });

  it("takes the first hop of x-forwarded-for and falls back to x-real-ip, then unknown", async () => {
    const { clientIp } = await import("@/lib/security/ratelimit");
    expect(clientIp(new Headers({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" }))).toBe("2.2.2.2");
    expect(clientIp(new Headers({ "x-real-ip": "4.4.4.4" }))).toBe("4.4.4.4");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("verified-visitor session cookie", () => {
  const visitor = "11111111-1111-1111-1111-111111111111";
  const other = "22222222-2222-2222-2222-222222222222";
  const now = new Date("2026-09-19T12:00:00Z");

  it("round-trips: a freshly issued cookie verifies for the same visitor", async () => {
    const { issueVerifiedCookie, isVerified, VERIFIED_COOKIE_NAME } = await import("@/lib/security/session");
    const cookie = issueVerifiedCookie(visitor, now).split(";")[0].slice(`${VERIFIED_COOKIE_NAME}=`.length);
    expect(isVerified(cookie, visitor, now)).toBe(true);
    expect(isVerified(cookie, visitor, new Date(now.getTime() + 60_000))).toBe(true);
  });

  it("rejects a missing, malformed, expired, wrong-visitor or tampered cookie", async () => {
    const { issueVerifiedCookie, isVerified, VERIFIED_COOKIE_NAME } = await import("@/lib/security/session");
    const cookie = issueVerifiedCookie(visitor, now, 1000).split(";")[0].slice(`${VERIFIED_COOKIE_NAME}=`.length);
    expect(isVerified(undefined, visitor, now)).toBe(false);
    expect(isVerified("not.a.real.cookie.at.all", visitor, now)).toBe(false);
    expect(isVerified(cookie, visitor, new Date(now.getTime() + 2000))).toBe(false); // past its 1s ttl
    expect(isVerified(cookie, other, now)).toBe(false); // issued for someone else
    const [id, exp, sig] = cookie.split(".");
    expect(isVerified(`${id}.${exp}.${sig.slice(0, -1)}x`, visitor, now)).toBe(false); // tampered signature
    expect(isVerified(`${other}.${exp}.${sig}`, visitor, now)).toBe(false); // swapped id, stale signature
  });

  it("sets HttpOnly, SameSite=Lax and a Max-Age matching the ttl", async () => {
    const { issueVerifiedCookie } = await import("@/lib/security/session");
    const header = issueVerifiedCookie(visitor, now, 3_600_000);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Max-Age=3600");
  });
});

describe("Turnstile, not configured (the state this repo is in today)", () => {
  it("fails open and warns rather than blocking every visitor", async () => {
    const { verifyTurnstile } = await import("@/lib/security/turnstile");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await verifyTurnstile(undefined, "1.2.3.4")).toEqual({ ok: true, reason: "not_configured" });
    expect(await verifyTurnstile("some-token", "1.2.3.4")).toEqual({ ok: true, reason: "not_configured" });
    warn.mockRestore();
  });
});

describe("Turnstile, configured", () => {
  const setup = async () => {
    vi.resetModules();
    vi.stubEnv("TURNSTILE_SITE_KEY", "site-key");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret-key");
    return import("@/lib/security/turnstile");
  };

  it("fails closed when the browser sent no token at all", async () => {
    const { verifyTurnstile } = await setup();
    expect(await verifyTurnstile(undefined, "1.2.3.4")).toEqual({ ok: false, reason: "missing_token" });
  });

  it("verifies against Cloudflare with the right payload and succeeds on accept", async () => {
    const { verifyTurnstile } = await setup();
    const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
      expect(JSON.parse(String(init?.body))).toEqual({ secret: "secret-key", response: "tok", remoteip: "5.6.7.8" });
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await verifyTurnstile("tok", "5.6.7.8", fetchFn)).toEqual({ ok: true });
  });

  it("fails closed on a real rejection or a non-200 from Cloudflare", async () => {
    const { verifyTurnstile } = await setup();
    const rejected = vi.fn(async () => new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }), { status: 200 })) as unknown as typeof fetch;
    expect(await verifyTurnstile("bad-tok", "5.6.7.8", rejected)).toEqual({ ok: false, reason: "invalid-input-response" });

    const serverError = vi.fn(async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    expect(await verifyTurnstile("tok", "5.6.7.8", serverError)).toEqual({ ok: false, reason: "http_500" });
  });

  it("fails OPEN (not closed) when Cloudflare's verify endpoint is unreachable", async () => {
    const { verifyTurnstile } = await setup();
    const down = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await verifyTurnstile("tok", "5.6.7.8", down)).toEqual({ ok: true, reason: "verify_unavailable" });
    error.mockRestore();
  });
});
