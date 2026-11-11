/**
 * PhotoStorage on S3 or any S3-compatible service (RustFS locally).
 *
 * Two clients: `internal` talks to storage from the API (HEAD, DELETE, bucket
 * setup); `public` only signs, using the host the app will reach. The host
 * is part of the signature, so signing with the address a phone can use
 * (e.g. http://192.168.1.20:9000) is what makes uploads and photos work on
 * a phone on the same Wi-Fi.
 */
import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  NotFound,
  PutBucketCorsCommand,
  PutBucketLifecycleConfigurationCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageConfig } from "../../config.js";
import {
  type PhotoStorage,
  SIGNED_URL_TTL_SECONDS,
  type StoredObject,
  type UploadForm,
  signingTime,
} from "./types.js";

/** The web app uploads and shows photos from another origin. */
function corsRules(origins: string[]) {
  return {
    CORSRules: [
      {
        AllowedOrigins: origins,
        AllowedMethods: ["GET", "HEAD", "POST", "PUT"],
        AllowedHeaders: ["*"],
        MaxAgeSeconds: 3600,
      },
    ],
  };
}

export function createS3Storage(config: StorageConfig): PhotoStorage {
  const client = (endpoint: string) =>
    new S3Client({
      endpoint,
      region: config.region,
      forcePathStyle: true, // local S3-compatible servers use path-style URLs
      credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
    });
  const internal = client(config.endpoint);
  const signer = client(config.publicUrl);
  const Bucket = config.bucket;

  return {
    async createUploadForm({ key, contentType, maxBytes, expiresInSeconds }): Promise<UploadForm> {
      const { url, fields } = await createPresignedPost(signer, {
        Bucket,
        Key: key,
        Fields: { "Content-Type": contentType },
        Conditions: [
          ["content-length-range", 1, maxBytes],
          ["eq", "$Content-Type", contentType],
        ],
        Expires: expiresInSeconds,
      });
      return { url, fields };
    },

    async head(key): Promise<StoredObject | null> {
      try {
        const res = await internal.send(new HeadObjectCommand({ Bucket, Key: key }));
        return { size: res.ContentLength ?? 0, contentType: res.ContentType };
      } catch (error) {
        if (error instanceof NotFound) return null;
        if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) {
          return null;
        }
        throw error;
      }
    },

    signedUrl(key, now) {
      return getSignedUrl(signer, new GetObjectCommand({ Bucket, Key: key }), {
        expiresIn: SIGNED_URL_TTL_SECONDS,
        signingDate: signingTime(now),
      });
    },

    async delete(keys) {
      // S3 deletes up to 1000 keys per request.
      for (let i = 0; i < keys.length; i += 1000) {
        const batch = keys.slice(i, i + 1000);
        await internal.send(
          new DeleteObjectsCommand({
            Bucket,
            Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
          }),
        );
      }
    },

    async configureBucket({ corsOrigins, expireProofsAfterDays }) {
      await internal.send(
        new PutBucketCorsCommand({ Bucket, CORSConfiguration: corsRules(corsOrigins) }),
      );
      await internal.send(
        new PutBucketLifecycleConfigurationCommand({
          Bucket,
          LifecycleConfiguration: {
            Rules: [
              {
                // A backstop: the photo-cleanup job deletes proof photos 90 days
                // after review. This catches anything it ever misses.
                ID: "expire-submission-photos",
                Status: "Enabled",
                Filter: { Prefix: "submission/" },
                Expiration: { Days: expireProofsAfterDays },
              },
              {
                ID: "abort-incomplete-multipart",
                Status: "Enabled",
                Filter: { Prefix: "" },
                AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
              },
            ],
          },
        }),
      );
    },

    async ensureBucket() {
      try {
        await internal.send(new HeadBucketCommand({ Bucket }));
      } catch {
        await internal.send(new CreateBucketCommand({ Bucket }));
      }
      // The web app uploads and shows photos from another origin.
      if (config.corsOrigins.length > 0) {
        await internal.send(
          new PutBucketCorsCommand({ Bucket, CORSConfiguration: corsRules(config.corsOrigins) }),
        );
      }
    },
  };
}
