/**
 * One typed function per API endpoint. Types come from @titan/contracts, so a
 * change to the API contract shows up here as a type error.
 */
import type {
  AgendaResponse,
  AuthResponse,
  Chore,
  CreateChildBody,
  CreateChoreBody,
  CreateFamilyBody,
  CreateInviteBody,
  CreateInviteResponse,
  FamilyDetail,
  Instance,
  InstanceActionBody,
  InstanceDetail,
  LoginBody,
  Member,
  MeResponse,
  PairingCodeResponse,
  SignupBody,
  SubmitBody,
  SubmitResponse,
  Tokens,
  UpdateMemberBody,
} from "@titan/contracts";
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
    refresh: (refreshToken: string) =>
      http.request<Tokens>("POST", "/v1/auth/refresh", { refreshToken }, { auth: false }),
    logout: (refreshToken: string) =>
      http.request<void>("POST", "/v1/auth/logout", { refreshToken }, { auth: false }),
    me: () => http.request<MeResponse>("GET", "/v1/me"),

    // Families and members
    createFamily: (body: CreateFamilyBody) =>
      http.request<FamilyDetail>("POST", "/v1/families", body),
    family: (familyId: string) => http.request<FamilyDetail>("GET", f(familyId)),
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
    agenda: (familyId: string, params: { date?: string; memberId?: string } = {}) =>
      http.request<AgendaResponse>("GET", `${f(familyId)}/agenda${query(params)}`),
    instance: (familyId: string, instanceId: string) =>
      http.request<InstanceDetail>("GET", `${f(familyId)}/instances/${instanceId}`),
    act: (familyId: string, instanceId: string, action: InstanceActionBody["action"]) =>
      http.request<Instance>("POST", `${f(familyId)}/instances/${instanceId}/actions`, { action }),
    submit: (familyId: string, instanceId: string, checklist: SubmitBody["checklist"]) =>
      http.request<SubmitResponse>("POST", `${f(familyId)}/instances/${instanceId}/submissions`, {
        checklist,
      }),
  };
}

export type Api = ReturnType<typeof createApi>;
