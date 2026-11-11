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

/** A small solid-color PNG standing in for a camera photo (64 × 48, amber). */
function testPhoto(): Buffer {
  // Minimal PNG encoder: one IDAT with uncompressed (stored) deflate blocks.
  const width = 64;
  const height = 48;
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0)]);
  for (let x = 0; x < width; x++) row.set([0xd9, 0x77, 0x06], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  // zlib header, one stored block, adler32.
  let a = 1;
  let b = 0;
  for (const byte of raw) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  const len = Buffer.alloc(4);
  len.writeUInt16LE(raw.length, 0);
  len.writeUInt16LE(~raw.length & 0xffff, 2);
  const adler = Buffer.alloc(4);
  adler.writeUInt32BE(((b << 16) | a) >>> 0, 0);
  const idat = Buffer.concat([Buffer.from([0x78, 0x01, 0x01]), len, raw, adler]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

test("photo proof: reference photo, required photo, and pins on review", async ({ page }) => {
  const email = `e2e-photos-${Date.now()}@example.com`;
  const password = "correct horse battery";
  const tab = (name: string) => visible(page.getByRole("tab", { name: new RegExp(name) }));
  const switchTo = async (name: string, pin?: string) => {
    await tab("Me").click();
    await button(page, "Switch person").click();
    await button(page, name).click();
    if (pin !== undefined) {
      for (const digit of pin) await button(page, digit).click();
      await button(page, "Done").click();
    }
  };
  const attachPhoto = async (buttonName: string) => {
    const chooser = page.waitForEvent("filechooser");
    await button(page, buttonName).click();
    await (
      await chooser
    ).setFiles({ name: "photo.png", mimeType: "image/png", buffer: testPhoto() });
    // The thumbnail appears at once; wait until its upload has finished.
    await expect(visible(page.getByRole("button", { name: "Remove photo" }))).toBeVisible();
    await expect(
      page.getByText("Uploading", { exact: true }).filter({ visible: true }),
    ).toHaveCount(0, { timeout: 15_000 });
  };

  const { tokens } = await api<{ tokens: { accessToken: string } }>("/v1/auth/signup", {
    method: "POST",
    body: { email, password, displayName: "Mom" },
  });
  const token = tokens.accessToken;
  const created = await api<{ family: { id: string }; members: { id: string }[] }>("/v1/families", {
    method: "POST",
    token,
    body: { name: "The Photographers", timeZone: "America/Chicago" },
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

  // The editor: a chore that needs a photo, with a reference photo.
  await tab("Chores").click();
  await button(page, "New chore").click();
  await field(page, "Name").fill("Make your bed");
  await button(page, "Always the same").click();
  await button(page, "Billy").click();
  await visible(page.getByRole("switch", { name: "Needs a photo" })).click();
  await attachPhoto("Add photo");
  await shot(page, "20-reference");
  await button(page, "Add chore").click();
  await expect(text(page, "Make your bed", true)).toBeVisible();

  // Billy can't finish without a photo.
  await switchTo("Billy");
  await button(page, "Done ✓").click();
  await expect(text(page, "Make it look like this.")).toBeVisible();
  await expect(button(page, "Add a photo first")).toBeDisabled();
  await attachPhoto("Add photo");
  await shot(page, "21-proof");
  await button(page, "All done! ✓").click();
  await expect(text(page, /Waiting for review · 1/)).toBeVisible();

  // Mom sees both photos, drops a pin, and sends it back.
  await switchTo("Mom", "4321");
  await tab("Review").click();
  await expect(text(page, "Their photo")).toBeVisible();
  await expect(text(page, "Reference")).toBeVisible();
  await shot(page, "22-review-photos");
  await button(page, "Needs work").click();
  await button(page, "Mark up the photo").click();
  const photo = visible(page.getByRole("button", { name: "Photo: tap to add a pin" }));
  await photo.click({ position: { x: 60, y: 40 } });
  await field(page, "Pin 1").fill("Pillow goes at the top");
  await page.waitForTimeout(400); // let the viewer finish fading in
  await shot(page, "23-markup");
  await button(page, "Done").click();
  await expect(button(page, "Mark up the photo (1 pin)")).toBeVisible();
  await button(page, "Send back").click();
  await expect(text(page, "All caught up!")).toBeVisible();

  // Billy sees where.
  await switchTo("Billy");
  await button(page, "See the spot marked on your photo ›").click();
  await expect(text(page, "Pillow goes at the top")).toBeVisible();
  await shot(page, "24-pins-for-kid");
});

/** Signs up Mom with a family, Billy, and a quick-switch PIN, through the API. */
async function familyWithBilly(label: string) {
  const email = `e2e-${label}-${Date.now()}@example.com`;
  const password = "correct horse battery";
  const { tokens } = await api<{ tokens: { accessToken: string } }>("/v1/auth/signup", {
    method: "POST",
    body: { email, password, displayName: "Mom" },
  });
  const token = tokens.accessToken;
  const created = await api<{ family: { id: string }; members: { id: string }[] }>("/v1/families", {
    method: "POST",
    token,
    body: { name: "The Earners", timeZone: "America/Chicago" },
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
  return { email, password, token, familyId };
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/");
  await field(page, "Email").fill(email);
  await field(page, "Password").fill(password);
  await button(page, "Sign in").click();
}

const tabOf = (page: Page, name: string) =>
  visible(page.getByRole("tab", { name: new RegExp(name) }));

async function switchPerson(page: Page, name: string, pin?: string) {
  await tabOf(page, "Me").click();
  await button(page, "Switch person").click();
  await button(page, name).click();
  if (pin !== undefined) {
    for (const digit of pin) await button(page, digit).click();
    await button(page, "Done").click();
  }
}

test("rewards: points, the job board, and asking for a reward", async ({ page }) => {
  const { email, password } = await familyWithBilly("points");
  await signIn(page, email, password);

  // Turn on points and add a reward to the catalog.
  await tabOf(page, "Family").click();
  await button(page, "Rewards settings").click();
  await button(page, "Points").click();
  await field(page, "New reward").fill("Screen time");
  await field(page, "Cost in points").fill("50");
  await button(page, "Add reward").click();
  await expect(text(page, "50 pts", true)).toBeVisible();
  await shot(page, "30-rewards-settings");
  await button(page, "Back").click();

  // An extra job on the job board, worth 60 points.
  await tabOf(page, "Chores").click();
  await button(page, "New chore").click();
  await button(page, "Extra job").click();
  await field(page, "Name").fill("Wash the car");
  await button(page, "Job board").click();
  await field(page, "Points").fill("60");
  await shot(page, "31-extra-job");
  await button(page, "Add chore").click();
  await expect(text(page, /Job board \(anyone can claim it\)/)).toBeVisible();

  // Billy sees it on the board, claims it, and does it.
  await switchPerson(page, "Billy");
  await expect(text(page, "Job board · 1")).toBeVisible();
  await expect(text(page, "+60 pts", true)).toBeVisible();
  await shot(page, "32-job-board");
  await button(page, "Claim Wash the car").click();
  await expect(text(page, "To do · 1")).toBeVisible();
  await expect(button(page, "Give Wash the car back to the job board")).toBeVisible();
  await button(page, "Done ✓").click();
  await expect(text(page, /Waiting for review · 1/)).toBeVisible();
  await button(page, "My rewards: 0 pts").click();
  await expect(text(page, "60 pts waiting for review")).toBeVisible();
  await shot(page, "33-pending");
  await button(page, "Back").click();

  // Mom approves; the points land.
  await switchPerson(page, "Mom", "4321");
  await tabOf(page, "Review").click();
  await button(page, "Approve Wash the car by Billy").click();
  await expect(text(page, "All caught up!")).toBeVisible();

  // Billy spends 50 of his 60 points; they're held right away.
  await switchPerson(page, "Billy");
  await button(page, "My rewards: 60 pts").click();
  await button(page, "Ask for Screen time").click();
  await expect(text(page, "WAITING", true)).toBeVisible();
  await expect(visible(page.getByLabel("Balance: 10 pts"))).toBeVisible();
  await expect(button(page, "Ask for Screen time")).toBeDisabled();
  await shot(page, "34-asked");
  await button(page, "Back").click();

  // Mom sees the request in Review and says yes.
  await switchPerson(page, "Mom", "4321");
  await tabOf(page, "Review").click();
  await expect(text(page, "Reward requests · 1")).toBeVisible();
  await shot(page, "35-request");
  await button(page, "Approve Screen time for Billy").click();
  await expect(text(page, "All caught up!")).toBeVisible();
});

test("rewards: real money, with a payout larger than the balance", async ({ page }) => {
  const { email, password, token, familyId } = await familyWithBilly("money");
  await api(`/v1/families/${familyId}`, {
    method: "PATCH",
    token,
    body: { rewardCurrency: "MONEY" },
  });
  await signIn(page, email, password);

  await tabOf(page, "Family").click();
  await button(page, "Rewards for Billy").click();
  await expect(visible(page.getByLabel("Balance: $0.00"))).toBeVisible();
  await button(page, "Record payout").click();
  await field(page, "Amount").fill("5");
  await field(page, "Note (optional)").fill("Allowance, paid ahead");
  await visible(page.getByRole("button", { name: "Record payout" }).last()).click();
  await expect(visible(page.getByLabel("Balance: -$5.00"))).toBeVisible();
  await expect(text(page, "Paid out: Allowance, paid ahead")).toBeVisible();
  await shot(page, "36-advance");

  // A correction needs a note.
  await button(page, "Correction").click();
  await field(page, "Amount").fill("1.50");
  await button(page, "Save correction").click();
  await expect(text(page, "Say what you're correcting.")).toBeVisible();
  await field(page, "What happened").fill("Forgot last week's car wash");
  await button(page, "Save correction").click();
  await expect(visible(page.getByLabel("Balance: -$3.50"))).toBeVisible();
});

test("progress: family goal, XP, a badge, and a level-up celebration", async ({ page }) => {
  const { email, password, token, familyId } = await familyWithBilly("progress");
  const family = await api<{ members: { id: string; displayName: string }[] }>(
    `/v1/families/${familyId}`,
    { token },
  );
  const billyId = family.members.find((m) => m.displayName === "Billy")!.id;
  const today = new Date().toLocaleDateString("en-CA");
  await api(`/v1/families/${familyId}/chores`, {
    method: "POST",
    token,
    body: {
      name: "Feed the fish",
      effortMinutes: 60, // 60 XP: enough to reach level 2
      recurrence: { freq: "DAILY", startDate: today },
      deadlineMinutes: 24 * 60,
      assignMode: "FIXED",
      eligibleMembershipIds: [billyId],
    },
  });
  await signIn(page, email, password);

  // A shared family goal.
  await tabOf(page, "Family").click();
  await button(page, "Rewards settings").click();
  await field(page, "Goal").fill("Pizza Night");
  await button(page, "Start the goal").click();
  await expect(text(page, 'Now: "Pizza Night", 0 of 1000 XP.')).toBeVisible();
  await shot(page, "40-goal-settings");
  await button(page, "Back").click();

  // Billy sees the goal and what the chore is worth, then does it.
  await switchPerson(page, "Billy");
  await expect(text(page, "Pizza Night", true)).toBeVisible();
  await expect(text(page, "+60 XP", true)).toBeVisible();
  await expect(button(page, "My progress: Level 1")).toBeVisible();
  await button(page, "Done ✓").click();
  await expect(text(page, /Waiting for review · 1/)).toBeVisible();

  await switchPerson(page, "Mom", "4321");
  await tabOf(page, "Review").click();
  await button(page, "Approve Feed the fish by Billy").click();
  await expect(text(page, "All caught up!")).toBeVisible();

  // Billy is told once: level 2 and his first badge; the goal moved.
  await switchPerson(page, "Billy");
  await expect(text(page, "🎉 Level 2!")).toBeVisible();
  await expect(text(page, "🏅 New badge: First chore")).toBeVisible();
  await expect(text(page, "60 / 1000 XP")).toBeVisible();
  await shot(page, "41-celebration");
  await button(page, "Nice!").click();
  await button(page, "My progress: Level 2 · 1-day streak").click();
  await expect(text(page, "Level 2", true)).toBeVisible();
  await expect(visible(page.getByLabel("First chore, earned"))).toBeVisible();
  await shot(page, "42-progress");
});
