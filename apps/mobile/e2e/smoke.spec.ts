/**
 * End-to-end checks of the web app against the real API:
 *  1. Setup and the kid's side: a parent signs up, creates the family, adds a
 *     kid, hands the device over, and the kid completes a chore with a partial
 *     checklist (that chore comes from the API, to keep this test about setup).
 *  2. Parent tools: the chore editor, the week view and daily time, PIN
 *     switching, and review (send back with a note, then approve by swiping).
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

test("parent creates a chore, balances time, and reviews the kid's work", async ({ page }) => {
  const email = `e2e-parent-${Date.now()}@example.com`;
  const password = "correct horse battery";
  const tab = (name: string) => visible(page.getByRole("tab", { name: new RegExp(name) }));
  const enterPin = async (pin: string) => {
    for (const digit of pin) await button(page, digit).click();
    await button(page, "Done").click();
  };
  const switchTo = async (name: string, pin?: string) => {
    await tab("Me").click();
    await button(page, "Switch person").click();
    await expect(text(page, "Who's using this?")).toBeVisible();
    await button(page, name).click();
    if (pin !== undefined) await enterPin(pin);
  };

  // Account, family, Billy, and Mom's quick-switch PIN via the API (the first test covers those screens).
  const { tokens } = await api<{ tokens: { accessToken: string } }>("/v1/auth/signup", {
    method: "POST",
    body: { email, password, displayName: "Mom" },
  });
  const token = tokens.accessToken;
  const created = await api<{ family: { id: string }; members: { id: string }[] }>("/v1/families", {
    method: "POST",
    token,
    body: { name: "The Editors", timeZone: "America/Chicago" },
  });
  const familyId = created.family.id;
  await api(`/v1/families/${familyId}/children`, {
    method: "POST",
    token,
    body: { displayName: "Billy" },
  });
  await api(`/v1/families/${familyId}/members/${created.members[0]!.id}`, {
    method: "PATCH",
    token,
    body: { pin: "4321" },
  });

  await page.goto("/");
  await field(page, "Email").fill(email);
  await field(page, "Password").fill(password);
  await button(page, "Sign in").click();
  await expect(tab("Review")).toBeVisible();

  // Chore editor: daily, 30 minutes, always Billy, two steps, OK to batch approve.
  await tab("Chores").click();
  await expect(text(page, "No chores yet")).toBeVisible();
  await button(page, "New chore").click();
  await field(page, "Name").fill("Feed the dog");
  await button(page, "After dinner").click();
  await button(page, "30 min").click();
  await button(page, "Always the same").click();
  await button(page, "Billy").click();
  await button(page, "Add a step").click();
  await field(page, "Step 1").fill("One scoop of food");
  await button(page, "Add a step").click();
  await field(page, "Step 2").fill("Fresh water");
  await button(page, "OK to batch").click();
  await expect(text(page, "Every day", true)).toBeVisible();
  await shot(page, "10-editor");
  await button(page, "Add chore").click();

  await expect(text(page, "Feed the dog", true)).toBeVisible();
  await expect(text(page, /Billy · After dinner/)).toBeVisible();
  await shot(page, "11-chores");

  // Week view: 30 minutes a day is more than a kid's default 20 on school days.
  await visible(page.getByRole("tab", { name: "Week", exact: true })).click();
  await expect(text(page, /more chores than time/)).toBeVisible();
  await shot(page, "12-week-over");

  // Give Billy more time ("Teen": 30 on weekdays, 60 on weekends); the week view clears up.
  await tab("Family").click();
  await button(page, "Daily time for Billy").click();
  await visible(page.getByRole("button", { name: /^Teen:/ })).click();
  await expect(text(page, "4 h 30 min a week")).toBeVisible();
  await shot(page, "13-capacity");
  await button(page, "Save").click();
  await tab("Chores").click();
  await visible(page.getByRole("tab", { name: "Week", exact: true })).click();
  await expect(text(page, "Everyone has enough time for their chores this week.")).toBeVisible();

  // Billy does it, skipping a step.
  await switchTo("Billy");
  await expect(text(page, "Hi Billy!")).toBeVisible();
  await button(page, "Done ✓").click();
  await visible(page.getByRole("checkbox", { name: "One scoop of food" })).click();
  await button(page, "Done (1/2)").click();
  await expect(text(page, /Waiting for review · 1/)).toBeVisible();

  // Mom takes the device back with her PIN and sends it back with a note.
  await switchTo("Mom", "4321");
  await tab("Review").click();
  await expect(text(page, "1 waiting for you")).toBeVisible();
  await expect(text(page, "Not checked: Fresh water")).toBeVisible();
  await shot(page, "14-review");
  await button(page, "Needs work").click();
  await field(page, "Note (optional)").fill("The water bowl is still empty");
  await shot(page, "15-needs-work");
  await button(page, "Send back").click();
  await expect(text(page, "All caught up!")).toBeVisible();

  // Billy sees the note, finishes, and sends it again.
  await switchTo("Billy");
  await expect(text(page, "The water bowl is still empty")).toBeVisible();
  await shot(page, "16-rework");
  await button(page, "Done ✓").click();
  await visible(page.getByRole("checkbox", { name: "One scoop of food" })).click();
  await visible(page.getByRole("checkbox", { name: "Fresh water" })).click();
  await button(page, "All done! ✓").click();
  await expect(text(page, /Waiting for review · 1/)).toBeVisible();

  // Mom approves it with a swipe to the right.
  await switchTo("Mom", "4321");
  await tab("Review").click();
  const card = text(page, "Feed the dog", true);
  await expect(card).toBeVisible();
  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 260, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(text(page, "All caught up!")).toBeVisible();
  await shot(page, "17-approved");
});
