import { z } from "zod";
import { emailSchema, idSchema, isoDateTimeSchema, roleSchema } from "./common.js";

export const createInviteBodySchema = z.strictObject({
  email: emailSchema,
  role: roleSchema,
});
export type CreateInviteBody = z.infer<typeof createInviteBodySchema>;

export const inviteSchema = z.object({
  id: idSchema,
  email: z.string(),
  role: roleSchema,
  expiresAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
});
export type Invite = z.infer<typeof inviteSchema>;

export const createInviteResponseSchema = z.object({
  invite: inviteSchema,
  /**
   * The secret the invitee uses to join. Returned only once, at creation.
   * (Until email delivery exists, the parent shares it themselves.)
   */
  token: z.string(),
});
export type CreateInviteResponse = z.infer<typeof createInviteResponseSchema>;

export const inviteListSchema = z.object({ invites: z.array(inviteSchema) });
export type InviteList = z.infer<typeof inviteListSchema>;

export const inviteParamsSchema = z.object({ familyId: idSchema, inviteId: idSchema });

export const acceptInviteBodySchema = z.strictObject({ token: z.string().min(1).max(200) });
export type AcceptInviteBody = z.infer<typeof acceptInviteBodySchema>;

export const acceptInviteResponseSchema = z.object({
  familyId: idSchema,
  membershipId: idSchema,
});
export type AcceptInviteResponse = z.infer<typeof acceptInviteResponseSchema>;
