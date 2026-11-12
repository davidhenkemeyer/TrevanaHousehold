import { describe, expect, it } from "vitest";
import { lanRank, loadConfig } from "./config.js";

describe("lanRank (which address phones use to reach local photo storage)", () => {
  it("prefers home network ranges and skips VPN addresses", () => {
    const addresses = ["100.89.75.7", "172.30.128.1", "192.168.86.64", "10.0.0.5"];
    const best = addresses.filter((a) => lanRank(a) > 0).sort((a, b) => lanRank(b) - lanRank(a));
    expect(best).toEqual(["192.168.86.64", "10.0.0.5", "172.30.128.1"]);
    expect(lanRank("100.89.75.7")).toBe(0);
    expect(lanRank("172.15.0.1")).toBe(0);
  });
});

describe("production configuration", () => {
  const good = {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://u:p@db.example.com/tenara",
    JWT_SECRET: "a-real-production-secret-of-at-least-32-chars",
    CORS_ORIGINS: "https://app.example.com",
    S3_ENDPOINT: "https://account.r2.cloudflarestorage.com",
    S3_PUBLIC_URL: "https://account.r2.cloudflarestorage.com",
    S3_ACCESS_KEY: "key",
    S3_SECRET_KEY: "a-real-storage-secret",
  };

  it("accepts a complete production setup", () => {
    const config = loadConfig(good);
    expect(config.cookieSecure).toBe(true);
    expect(config.storage.createBucket).toBe(false);
    expect(config.trustProxy).toBe(false);
  });

  it("refuses development defaults and missing settings, listing every problem", () => {
    const run = () =>
      loadConfig({
        ...good,
        JWT_SECRET: "dev-only-secret-change-me-0123456789abcdef",
        S3_SECRET_KEY: "chores-dev-secret",
        CORS_ORIGINS: "",
        S3_PUBLIC_URL: undefined,
      });
    expect(run).toThrow(/JWT_SECRET/);
    expect(run).toThrow(/S3_SECRET_KEY/);
    expect(run).toThrow(/CORS_ORIGINS/);
    expect(run).toThrow(/S3_PUBLIC_URL/);
  });

  it("requires https origins and photo URLs", () => {
    expect(() => loadConfig({ ...good, CORS_ORIGINS: "*" })).toThrow(/explicit https/);
    expect(() => loadConfig({ ...good, CORS_ORIGINS: "http://app.example.com" })).toThrow(
      /explicit https/,
    );
    expect(() => loadConfig({ ...good, S3_PUBLIC_URL: "http://photos.example.com" })).toThrow(
      /must be https/,
    );
  });

  it("reads proxy trust and the cookie flag", () => {
    expect(loadConfig({ ...good, TRUST_PROXY: "true" }).trustProxy).toBe(true);
    expect(loadConfig({ ...good, TRUST_PROXY: "1" }).trustProxy).toBe(1);
    expect(loadConfig({ ...good, TRUST_PROXY: "nonsense" }).trustProxy).toBe(false);
    const dev = loadConfig({ DATABASE_URL: "postgresql://x", JWT_SECRET: good.JWT_SECRET });
    expect(dev.cookieSecure).toBe(false);
    expect(loadConfig({ ...good, COOKIE_SECURE: "false" }).cookieSecure).toBe(false);
  });
});
