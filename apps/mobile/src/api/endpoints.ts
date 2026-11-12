/**
 * One typed function per API endpoint. Types come from @tenara/contracts, so a
 * change to the API contract shows up here as a type error.
 */
import type {
  AgendaResponse,
  AuthResponse,
  BatchApproveResponse,
  Chore,
  ChoreList,
  CreateChildBody,
  CreateChoreBody,
  CreateFamilyBody,
  CreateInviteBody,
  CorrectionBody,
  Inbox,
  NotificationSettings,
  RegisterDeviceBody,
  UpdateNotificationSettingsBody,
  CreateGoalBody,
  FamilyGoal,
  Progress,
  CreateInviteResponse,
  CreateRewardItemBody,
  CreateUploadBody,
  CreateUploadResponse,
  FamilyDetail,
  Instance,
  InstanceActionBody,
  InstanceDetail,
  InstanceList,
  JobBoard,
  LedgerChangeResponse,
  LedgerPage,
  LoginBody,
  Member,
  MeResponse,
  PairingCodeResponse,
  PayoutBody,
  Redemption,
  RedemptionDecisionBody,
  RedemptionList,
  RewardItem,
  RewardItemList,
  RewardsSummary,
  ReviewBody,
  ReviewQueue,
  ReviewResponse,
  SignupBody,
  StarterChoreList,
  AddStarterChoresResult,
  SubmitBody,
  SubmitResponse,
  Tokens,
  UpdateChoreBody,
  UpdateFamilyBody,
  UpdateMemberBody,
  WeekLoad,
} from "@tenara/contracts";
import type { HttpClient } from "./http";

function query(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined);
  return entries.length === 0 ? "" : `?${new URLSearchParams(entries).toString()}`;
}

export function createApi(http: HttpClient) {
  const f = (familyId: string) => `/v1/families/${familyId}`;
  return {
    // Accounts
    signup: (body: SignupBody) =>
      http.request<AuthResponse>("POST", "/v1/auth/signup", body, { auth: false }),
    login: (body: LoginBody) =>
      http.request<AuthResponse>("POST", "/v1/auth/login", body, { auth: false }),
    pair: (code: string) =>
      http.request<AuthResponse>("POST", "/v1/auth/pair", { code }, { auth: false }),
    // Native apps send the refresh token; the web app has none (it's an
    // httpOnly cookie the browser sends) and posts an empty body.
    refresh: (refreshToken?: string) =>
      http.request<Tokens>("POST", "/v1/auth/refresh", refreshToken ? { refreshToken } : {}, {
        auth: false,
      }),
    logout: (refreshToken?: string) =>
      http.request<void>("POST", "/v1/auth/logout", refreshToken ? { refreshToken } : {}, {
        auth: false,
      }),
    me: () => http.request<MeResponse>("GET", "/v1/me"),

    // Families and members
    createFamily: (body: CreateFamilyBody) =>
      http.request<FamilyDetail>("POST", "/v1/families", body),
    family: (familyId: string) => http.request<FamilyDetail>("GET", f(familyId)),
    updateFamily: (familyId: string, body: UpdateFamilyBody) =>
      http.request<FamilyDetail>("PATCH", f(familyId), body),
    createChild: (familyId: string, body: CreateChildBody) =>
      http.request<Member>("POST", `${f(familyId)}/children`, body),
    updateMember: (familyId: string, membershipId: string, body: UpdateMemberBody) =>
      http.request<Member>("PATCH", `${f(familyId)}/members/${membershipId}`, body),
    switchTo: (familyId: string, membershipId: string, pin?: string) =>
      http.request<AuthResponse>(
        "POST",
        `${f(familyId)}/members/${membershipId}/session`,
        pin === undefined ? {} : { pin },
      ),
    pairingCode: (familyId: string, membershipId: string) =>
      http.request<PairingCodeResponse>(
        "POST",
        `${f(familyId)}/members/${membershipId}/pairing-code`,
      ),
    invite: (familyId: string, body: CreateInviteBody) =>
      http.request<CreateInviteResponse>("POST", `${f(familyId)}/invites`, body),

    // Chores
    createChore: (familyId: string, body: Partial<CreateChoreBody>) =>
      http.request<Chore>("POST", `${f(familyId)}/chores`, body),
    starterChores: (familyId: string) =>
      http.request<StarterChoreList>("GET", `${f(familyId)}/starter-chores`),
    addStarterChores: (familyId: string, templateIds: string[]) =>
      http.request<AddStarterChoresResult>("POST", `${f(familyId)}/starter-chores`, {
        templateIds,
      }),
    chores: (familyId: string, includeArchived = false) =>
      http.request<ChoreList>(
        "GET",
        `${f(familyId)}/chores${query({ includeArchived: includeArchived ? "true" : undefined })}`,
      ),
    chore: (familyId: string, choreId: string) =>
      http.request<Chore>("GET", `${f(familyId)}/chores/${choreId}`),
    updateChore: (familyId: string, choreId: string, body: UpdateChoreBody) =>
      http.request<Chore>("PATCH", `${f(familyId)}/chores/${choreId}`, body),
    /** Archives the chore: untouched future occurrences go away, history stays. */
    archiveChore: (familyId: string, choreId: string) =>
      http.request<void>("DELETE", `${f(familyId)}/chores/${choreId}`),
    agenda: (familyId: string, params: { date?: string; memberId?: string } = {}) =>
      http.request<AgendaResponse>("GET", `${f(familyId)}/agenda${query(params)}`),
    instance: (familyId: string, instanceId: string) =>
      http.request<InstanceDetail>("GET", `${f(familyId)}/instances/${instanceId}`),
    act: (familyId: string, instanceId: string, action: InstanceActionBody["action"]) =>
      http.request<Instance>("POST", `${f(familyId)}/instances/${instanceId}/actions`, { action }),
    submit: (
      familyId: string,
      instanceId: string,
      checklist: SubmitBody["checklist"],
      photoUploadIds: string[] = [],
    ) =>
      http.request<SubmitResponse>("POST", `${f(familyId)}/instances/${instanceId}/submissions`, {
        checklist,
        photoUploadIds,
      }),
    instances: (
      familyId: string,
      params: { from: string; to: string; memberId?: string; cursor?: string },
    ) => http.request<InstanceList>("GET", `${f(familyId)}/instances${query(params)}`),
    weekLoad: (familyId: string, params: { from?: string; days?: number } = {}) =>
      http.request<WeekLoad>(
        "GET",
        `${f(familyId)}/week-load${query({ from: params.from, days: params.days?.toString() })}`,
      ),

    // Reviews (parents)
    reviewQueue: (familyId: string, params: { memberId?: string; cursor?: string } = {}) =>
      http.request<ReviewQueue>("GET", `${f(familyId)}/review-queue${query(params)}`),
    review: (familyId: string, submissionId: string, body: ReviewBody) =>
      http.request<ReviewResponse>(
        "POST",
        `${f(familyId)}/submissions/${submissionId}/review`,
        body,
      ),
    // Rewards: balances, history, payouts and corrections (parents)
    rewards: (familyId: string) => http.request<RewardsSummary>("GET", `${f(familyId)}/rewards`),
    ledger: (familyId: string, params: { memberId?: string; cursor?: string } = {}) =>
      http.request<LedgerPage>("GET", `${f(familyId)}/rewards/ledger${query(params)}`),
    payout: (familyId: string, body: PayoutBody) =>
      http.request<LedgerChangeResponse>("POST", `${f(familyId)}/rewards/payouts`, body),
    correction: (familyId: string, body: CorrectionBody) =>
      http.request<LedgerChangeResponse>("POST", `${f(familyId)}/rewards/corrections`, body),

    // The points catalog and requests to spend points
    rewardItems: (familyId: string) =>
      http.request<RewardItemList>("GET", `${f(familyId)}/reward-items`),
    createRewardItem: (familyId: string, body: CreateRewardItemBody) =>
      http.request<RewardItem>("POST", `${f(familyId)}/reward-items`, body),
    removeRewardItem: (familyId: string, itemId: string) =>
      http.request<void>("DELETE", `${f(familyId)}/reward-items/${itemId}`),
    redemptions: (familyId: string, status?: Redemption["status"]) =>
      http.request<RedemptionList>("GET", `${f(familyId)}/redemptions${query({ status })}`),
    requestRedemption: (familyId: string, itemId: string) =>
      http.request<Redemption>("POST", `${f(familyId)}/redemptions`, { itemId }),
    decideRedemption: (familyId: string, redemptionId: string, body: RedemptionDecisionBody) =>
      http.request<Redemption>("POST", `${f(familyId)}/redemptions/${redemptionId}/decision`, body),
    cancelRedemption: (familyId: string, redemptionId: string) =>
      http.request<Redemption>("POST", `${f(familyId)}/redemptions/${redemptionId}/cancel`),

    // Progress: XP, levels, streaks, badges, and the family goal
    progress: (familyId: string) => http.request<Progress>("GET", `${f(familyId)}/progress`),
    startGoal: (familyId: string, body: CreateGoalBody) =>
      http.request<FamilyGoal>("POST", `${f(familyId)}/goal`, body),
    closeGoal: (familyId: string) => http.request<void>("DELETE", `${f(familyId)}/goal`),

    // Notifications: inbox, settings, and this phone's push registration
    inbox: (familyId: string, cursor?: string) =>
      http.request<Inbox>("GET", `${f(familyId)}/notifications${query({ cursor })}`),
    markRead: (familyId: string, ids?: string[]) =>
      http.request<void>("POST", `${f(familyId)}/notifications/read`, ids ? { ids } : {}),
    notificationSettings: (familyId: string) =>
      http.request<NotificationSettings>("GET", `${f(familyId)}/notification-settings`),
    updateNotificationSettings: (familyId: string, body: UpdateNotificationSettingsBody) =>
      http.request<NotificationSettings>("PATCH", `${f(familyId)}/notification-settings`, body),
    registerDevice: (body: RegisterDeviceBody) =>
      http.request<void>("POST", "/v1/me/devices", body),
    unregisterDevice: (token: string) =>
      http.request<void>("DELETE", `/v1/me/devices/${encodeURIComponent(token)}`),

    // Job board: open jobs the viewer can claim (claim/release go through `act`)
    jobBoard: (familyId: string) => http.request<JobBoard>("GET", `${f(familyId)}/job-board`),

    // Photos: an upload form for a direct upload to storage (see features/photos/upload.ts).
    createUpload: (familyId: string, body: CreateUploadBody) =>
      http.request<CreateUploadResponse>("POST", `${f(familyId)}/uploads`, body),

    batchApprove: (familyId: string, submissionIds: string[]) =>
      http.request<BatchApproveResponse>("POST", `${f(familyId)}/review-queue/approve`, {
        submissionIds,
      }),
  };
}

export type Api = ReturnType<typeof createApi>;
