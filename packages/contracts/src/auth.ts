import { z } from "zod";
import {
  avatarColorSchema,
  displayNameSchema,
  emailSchema,
  idSchema,
  isoDateTimeSchema,
  passwordSchema,
  roleSchema,
} from "./common.js";

export const signupBodySchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
});
export type SignupBody = z.infer<typeof signupBodySchema>;

export const loginBodySchema = z.strictObject({
  email: emailSchema,
  // Not passwordSchema: never tell a caller their password breaks today's rules.
  password: z.string().min(1).max(128),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

/**
 * Native apps send the refresh token in the body. The web app sends none: its
 * token is in an httpOnly cookie (with the `X-Titan-Client: web` header).
 */
export const refreshBodySchema = z.strictObject({
  refreshToken: z.string().min(1).max(200).optional(),
});
export type RefreshBody = z.infer<typeof refreshBodySchema>;

export const tokensSchema = z.object({
  /** Short-lived JWT; send as `Authorization: Bearer <token>`. */
  accessToken: z.string(),
  accessTokenExpiresAt: isoDateTimeSchema,
  /**
   * Long-lived, single-use; exchange at /v1/auth/refresh for a new pair.
   * Absent for the web app, which gets it as an httpOnly cookie instead.
   */
  refreshToken: z.string().optional(),
  refreshTokenExpiresAt: isoDateTimeSchema,
});
export type Tokens = z.infer<typeof tokensSchema>;

export const userSchema = z.object({
  id: idSchema,
  /** Null for kid profiles, which sign in by PIN on a family device. */
  email: z.string().nullable(),
  displayName: z.string(),
  avatarColor: z.string(),
});
export type User = z.infer<typeof userSchema>;

export const authResponseSchema = z.object({ user: userSchema, tokens: tokensSchema });
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const meResponseSchema = z.object({
  user: userSchema,
  memberships: z.array(
    z.object({
      membershipId: idSchema,
      familyId: idSchema,
      familyName: z.string(),
      role: roleSchema,
    }),
  ),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const updateMeBodySchema = z
  .strictObject({ displayName: displayNameSchema, avatarColor: avatarColorSchema })
  .partial();
export type UpdateMeBody = z.infer<typeof updateMeBodySchema>;
