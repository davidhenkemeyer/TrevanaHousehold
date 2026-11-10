/**
 * The core loop on the web app: a parent signs up, creates the family, adds a
 * kid, hands the device over, and the kid completes a chore with a partial
 * checklist. (Chores are created through the API until Step 6 adds the editor.)
 *
 * On the web, the navigation stack keeps earlier screens in the page, hidden.
 * The helpers below therefore only match elements that are actually visible.
 */
import { type Locator, type Page, expect, test } from "@playwright/test";

const API = process.env.E2E_API_URL ?? "http://localhost:3000";

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `e2e/output/${name}.png`, fullPage: true });

const visible = (locator: Locator) => locator.filter({ visible: true }).first();
const text = (page: Page, value: string | RegExp, exact = false) =>
  visible(page.getByText(value, { exact }));
const field = (page: Page, label: string) => visible(page.getByLabel(label, { exact: true }));
const button = (page: Page, name: string) =>
  visible(page.getByRole("button", { name, exact: true }));

async function api<T>(
  path: string,
  init: { method?: string; token?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(API + path, {
    method: init.method ?? "GET",
    headers: {
      ...(init.body !== undefined && { "content-type": "application/json" }),
      ...(init.token && { authorization: `Bearer ${init.token}` }),
    },
    ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

test("parent sets up the family; kid completes a chore on the shared device", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  const password = "correct horse battery";

  // Sign-in screen, then sign up.
  await page.goto("/");
  await expect(text(page, "Building Habits, Together.")).toBeVisible();
  await shot(page, "01-sign-in");
  await text(page, "New here? Create a family account").click();
  await field(page, "Your name").fill("Mom");
  await field(page, "Email").fill(email);
  await field(page, "Password (at least 8 characters)").fill(password);
  await button(page, "Create account").click();

  // Onboarding: create the family.
  await expect(text(page, "Let's set up your family. You'll add your kids next.")).toBeVisible();
  await field(page, "Family name").fill("The Testers");
  await shot(page, "02-onboarding");
  await button(page, "Create family").click();

  // Family tab: add Billy.
  await expect(text(page, "Add a kid", true)).toBeVisible();
  await field(page, "Name").fill("Billy");
  await button(page, "Add kid").click();
  await expect(text(page, "Billy", true)).toBeVisible();
  await shot(page, "03-family");

  // Create Billy's chore through the API (the chore editor is Step 6).
  const { tokens } = await api<{ tokens: { accessToken: string } }>("/v1/auth/login", {
    method: "POST",
    body: { email, password },
  });
  const me = await api<{ memberships: { familyId: string }[] }>("/v1/me", {
    token: tokens.accessToken,
  });
  const familyId = me.memberships[0]!.familyId;
  const family = await api<{ members: { id: string; displayName: string }[] }>(
    `/v1/families/${familyId}`,
    { token: tokens.accessToken },
  );
  const billyId = family.members.find((m) => m.displayName === "Billy")!.id;
  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local
  await api(`/v1/families/${familyId}/chores`, {
    method: "POST",
    token: tokens.accessToken,
    body: {
      name: "Clean your room",
      cue: "After school",
      effortMinutes: 20,
      recurrence: { freq: "DAILY", startDate: today },
      deadlineMinutes: 24 * 60,
      assignMode: "FIXED",
      eligibleMembershipIds: [billyId],
      checklist: ["Clothes in the hamper", "Make the bed", "Toys on the shelf"],
    },
  });

  // Hand the device to Billy (a parent needs no PIN for that).
  await button(page, "Hand this device to someone").click();
  await expect(text(page, "Who's using this?")).toBeVisible();
  await shot(page, "04-who");
  await button(page, "Billy").click();

  // Billy's Today view.
  await expect(text(page, "Hi Billy!")).toBeVisible();
  await expect(text(page, "Clean your room", true)).toBeVisible();
  await expect(text(page, "When: After school")).toBeVisible();
  await shot(page, "05-today");

  // Complete with 2 of 3 steps.
  await button(page, "Done ✓").click();
  await visible(page.getByRole("checkbox", { name: "Clothes in the hamper" })).click();
  await visible(page.getByRole("checkbox", { name: "Make the bed" })).click();
  await shot(page, "06-checklist");
  await button(page, "Done (2/3)").click();

  await expect(text(page, /Waiting for review · 1/)).toBeVisible();
  await page.waitForTimeout(600); // mid-celebration
  await shot(page, "07-celebration");

  // Detail screen shows the attempt.
  await button(page, "Open Clean your room").click();
  await expect(text(page, "2/3 STEPS")).toBeVisible();
  await shot(page, "08-detail");
});
