/**
 * The real S3 adapter against the local storage server (`pnpm db:up`).
 * Skipped when nothing answers on S3_ENDPOINT (e.g. in CI, where services
 * use the in-memory fake instead).
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../config.js";
import { createS3Storage } from "./s3.js";

const config = loadConfig({
  DATABASE_URL: "postgresql://unused",
  JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
  S3_BUCKET: "titan-photos-test",
  CORS_ORIGINS: "http://localhost:8081",
  // Sign for localhost: this test runs on the same machine as the server.
  S3_PUBLIC_URL: process.env.S3_ENDPOINT ?? "http://localhost:9000",
  ...(process.env.S3_ENDPOINT && { S3_ENDPOINT: process.env.S3_ENDPOINT }),
});

async function reachable(url: string): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1000) });
    return true;
  } catch {
    return false;
  }
}

const available = await reachable(config.storage.endpoint);

// A 1×1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

async function postForm(
  form: { url: string; fields: Record<string, string> },
  file: Blob,
): Promise<Response> {
  const body = new FormData();
  for (const [name, value] of Object.entries(form.fields)) body.append(name, value);
  body.append("file", file);
  return fetch(form.url, { method: "POST", body });
}

describe.skipIf(!available)("S3 storage (local server)", () => {
  const storage = createS3Storage(config.storage);
  const key = () => `test/${randomUUID()}.png`;

  it("uploads with a signed form, reads with a signed URL, and deletes", async () => {
    await storage.ensureBucket();
    await storage.ensureBucket(); // idempotent
    const k = key();
    const form = await storage.createUploadForm({
      key: k,
      contentType: "image/png",
      maxBytes: 1024,
      expiresInSeconds: 60,
    });
    const res = await postForm(form, new Blob([PNG], { type: "image/png" }));
    expect(res.status).toBeLessThan(300);

    expect(await storage.head(k)).toEqual({ size: PNG.length, contentType: "image/png" });
    const url = await storage.signedUrl(k, new Date());
    const fetched = await fetch(url);
    expect(fetched.status).toBe(200);
    expect(Buffer.from(await fetched.arrayBuffer())).toEqual(PNG);

    await storage.delete([k]);
    expect(await storage.head(k)).toBeNull();
    await storage.delete([k]); // deleting again is fine
  });

  it("rejects files over the size limit and other content types", async () => {
    await storage.ensureBucket();
    const big = key();
    const tooBig = await postForm(
      await storage.createUploadForm({
        key: big,
        contentType: "image/png",
        maxBytes: 10,
        expiresInSeconds: 60,
      }),
      new Blob([PNG], { type: "image/png" }),
    );
    expect(tooBig.status).toBeGreaterThanOrEqual(400);
    expect(await storage.head(big)).toBeNull();

    const wrong = key();
    const form = await storage.createUploadForm({
      key: wrong,
      contentType: "image/png",
      maxBytes: 1024,
      expiresInSeconds: 60,
    });
    const tampered = await postForm(
      { url: form.url, fields: { ...form.fields, "Content-Type": "text/html" } },
      new Blob(["<script>"], { type: "text/html" }),
    );
    expect(tampered.status).toBeGreaterThanOrEqual(400);
    expect(await storage.head(wrong)).toBeNull();
  });

  it("lets the web app's origin upload from a browser (bucket CORS)", async () => {
    await storage.ensureBucket();
    const res = await fetch(`${config.storage.endpoint}/${config.storage.bucket}`, {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:8081", "Access-Control-Request-Method": "POST" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:8081");
  });

  it("applies the production bucket setup (CORS and the proof-photo lifecycle)", async () => {
    await storage.ensureBucket();
    await storage.configureBucket({
      corsOrigins: ["https://app.example.com"],
      expireProofsAfterDays: 120,
    });
    await storage.configureBucket({
      corsOrigins: ["https://app.example.com"],
      expireProofsAfterDays: 120,
    }); // idempotent
  });

  it("returns null for a missing object", async () => {
    await storage.ensureBucket();
    expect(await storage.head(key())).toBeNull();
  });
});
