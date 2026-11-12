# Tenara Suite: Architecture Notes

The Tenara suite is three apps built on one shared core, the **Tenara Engine** (from the Branding Suite doc). Master tagline: "Master Your Work. Empower Your Life."

The suite was called Titan until November 2026. It was renamed because "Titan" is crowded (email, watches, graphics cards, many apps) and sounds more forceful than a gentle habit product should. Tenara comes from Latin _tenax_, "holding fast" (as in tenacious), and keeps the "T" artwork. The Branding Suite doc still uses the old name.

| App           | Store title                    | Audience                    | Tagline                                  | Status                          |
| ------------- | ------------------------------ | --------------------------- | ---------------------------------------- | ------------------------------- |
| Tenara Family | Tenara Family: Chores & Habits | Families: chores and habits | "Building Habits, Together."             | In progress (this repo)         |
| Tenara Team   | Tenara Team: Tasks & Sprints   | Teams: Scrum / Kanban       | "Precision Execution for Modern Teams."  | Not started                     |
| Tenara Focus  | Tenara Focus: Goals & Routines | Individuals: goals, habits  | "Uninterrupted Flow, Continuous Growth." | Not started; requirements below |

## The Tenara Engine (what the apps should share)

Tenara Family is being built so its generic parts can move into shared `@tenara/*` packages when the second app starts. Candidates:

- **Accounts and groups**: sign-in, sessions, invites, roles. A "family" generalizes to a team (Tenara Team) or just one person (Focus).
- **Tasks with review**: the status machine, submissions, approve / rework / reject, batch review.
- **Recurrence and scheduling**: recurrence rules, time zones, capacity-based assignment.
- **Motivation**: XP, levels, badges, streak preservers, shared goals, following the branding doc's principles (no punitive deductions, no zero-sum leaderboards).
- **Design tokens**: one structure, a different accent palette per app.
- **Notifications**: daily digest by default.

The rule that makes this possible is already in place: business rules live in pure packages (`@tenara/domain`), and the API is the only client of the database. Don't extract anything until a second app needs it; extract from working code, not guesses.

## Tenara Focus: AI-powered goal coach (requirements, not yet built)

### What the user asked for

1. The user sets a goal in plain words, e.g. "Lose 10 pounds by New Year's."
2. An AI coach asks follow-up questions to tailor the plan: what equipment they have, what sports they play, their schedule, and so on.
3. The coach produces a **daily plan** that fits the user's lifestyle.
4. The user can **regenerate** any part of a day's plan. For example, the plan says shoulder stretches but their shoulders are sore, so they say "choose something else", and the plan adjusts.

### Proposed design

**Flow and API calls** (all calls go through the Tenara API server; the app never holds an API key):

1. **Intake interview**: a multi-turn chat. The coach asks one or two questions at a time and stops when it has enough. When the conversation ends, a separate call extracts a structured **profile** (equipment, activities, schedule and time available, constraints such as injuries, preferences) using structured outputs. The profile is stored and is editable by the user; the chat transcript isn't needed afterwards.
2. **Plan generation**: one call with the goal, the profile, and recent history. It returns a typed **daily plan** (a list of items, each with title, duration, intensity, target muscle groups or category, and a short "why") via structured outputs (`output_config.format`, or `client.messages.parse()` with a Zod schema shared from `@tenara/contracts`).
3. **Regenerate one item**: a small call with the day's plan, the item to replace, and the user's reason ("shoulders are sore"). It returns exactly one replacement item in the same schema. The reason is saved as a short-lived constraint (e.g. "avoid shoulders for 3 days") that later plans also respect. "Regenerate the whole day" is the same call with every item in play.
4. **Deterministic checks after every call**: the server validates each plan against rules in the domain package (total time fits the user's stated availability, rest days present, no item that conflicts with an active constraint, safe weekly loss rate) before saving it. If a check fails, it re-asks once with the specific problem, then falls back to the previous day's plan.

**Model and settings** (from the Claude API reference, November 2026):

- **Model**: Claude Opus 5.5 (`claude-opus-5-5`), with adaptive thinking (it can't be turned off on this model).
- **Effort**: set explicitly per call, since the default is `medium`. Suggested: `medium` for the interview and plan generation, `low` for single-item regeneration, which should feel instant. Measure quality and latency on an eval before changing models or effort.
- **Refusal handling**: always check `stop_reason` before reading the response. Enable the server-side fallback (`fallbacks: "default"` with the `server-side-fallback-2026-07-01` beta) so a safety-classifier decline is retried on a fallback model automatically.
- **Prompt caching**: put the stable parts first (coach instructions and safety rules, then the user's profile and goal) and the volatile parts last (today's date, recent check-ins, the regeneration reason). Every regeneration for the same user then reuses the cached prefix. Never put timestamps or request IDs in the system prompt. Verify with `usage.cache_read_input_tokens`.
- **Streaming**: stream the interview replies so the chat feels responsive; plan generation can use a regular call with a loading state.

**Safety (health and fitness advice):**

- The coach is a habit and planning assistant, not a medical provider. Say so in onboarding and in the system prompt.
- The intake asks screening questions: injuries, medical conditions, pregnancy, and history of disordered eating. Any of these makes plans conservative, and some (e.g. disordered eating) should steer away from weight targets entirely and suggest talking to a professional.
- Feasibility check on the goal itself: today to New Year's is about 7 weeks, so 10 pounds is about 1.4 lb a week, within common guidance of 1–2 lb a week. More aggressive goals get a gentle counter-proposal, not a crash plan.
- Pain is not soreness: if a user reports sharp pain, injury, or symptoms like chest pain or dizziness, the coach stops suggesting exercise for that area and recommends seeing a professional, rather than regenerating around it.
- Age: decide the minimum age before launch; minors would need different defaults and possibly parental consent.
- Log plan inputs and outputs (without unnecessary personal detail) so problems can be reviewed, and build an **eval set** of tricky goals and profiles before launch.

**Behavioral principles** apply as in Tenara Family: small daily steps (micro-checklists), "when–then" cues tied to the user's routine, immediate celebration on completion, streak preservers instead of streak resets, and a daily digest instead of constant alerts.

### Open questions for when Focus starts

- Which goal categories are in scope at launch (fitness, weight, learning, habits)?
- Will Focus integrate with health data (Apple Health, Google Fit) to see workouts and weight?
- Pricing: AI calls cost money per use, so Focus probably needs a subscription or usage limits.
