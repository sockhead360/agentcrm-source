# Sandbox Review Fixes — Implementation Plan (2026-07-10)

Source: Chris's role-play sims in the sandbox (agent replies from group members). 10 fixes,
ordered by impact. Every root cause below was verified against `main.js` (v1.1.371-era code).

**Rules of engagement (from project memory — do not violate):**
- After every change: `node deploy.js` (never `npm run dist`).
- Never bypass `assertCanSend`; never touch send caps.
- When a bug is found, audit every similar call site; verify LLM-judged checks against the
  real sandbox (`aiSimulate`), not just reasoning.
- Prod + sandbox share `decidePhase2()` — put multi-turn logic THERE, never fork the two.
- Regression battery must stay green: Phase 1 8/8, multi-turn gate 8/8, rulings 6/6
  (Jake comp / Aimee multi / Jesse will-ask / Terrie), Theresa derived-price → hot,
  conv-1206 answers-criteria. Harness scripts in scratchpad/pw-test (restore
  `npm install playwright-core` if missing).

---

## Fix 1 — THE BIG ONE: `warm` + follow-ups require an actual property signal

**Sims affected (7):** identity_local→need_both; criteria→need_both ("direct buyer or
wholesaler?"); "year built / bed bath?"→need_both; soft_commit "Thanks I'll work on it" →
48h follow-up; criteria_payment→acknowledgment_no_property→need_both_silent (the
"warm_went_cold at the end" confusion); call_request_no_property→need_both_silent;
unfulfillable_parked (POF + recent-acquisitions demand); identity_investor→need_both.

**Chris's rule:** An agent merely vetting us — identity, criteria, financing, entity name,
buyer-type questions — or acknowledging ("Nice ok perfect", "Thanks I'll work on it") has
given NO signal they have a property. Answer their questions naturally (current replies are
all "handled well") but the conversation must NOT become warm, NOT get follow-ups/drips,
NOT get 🤝 parking. Cold/engaged is fine; the monthly re-blast is the net.

**Root cause (3 layers):**
1. `decidePhase2()` terminal branches return `category: 'warm'` unconditionally:
   `need_both` (main.js:2717), `need_both_silent` (:2714), `soft_commit` via
   `P2_SOFT_COMMIT_RE` (:2710-2711, matched "I'll work on it… get back asap" → 48h drip),
   `side_question` (:2708, preserves pending follow-ups that should never have existed).
2. `generateAiReply`'s prompt lets engaged-vetting classify as `warm`, and the follow_up
   branch (:2629-2634) promotes to warm on that verdict.
3. Sandbox multi-turn synthesizes `category='warm'` whenever priorOutbound>0, forcing the
   warm branch.

**Fix:**
- **(a) Prompt (generateAiReply system prompt):** tighten the warm definition — `warm` ONLY
  when the agent has signaled they have / know of / will have a specific property (address,
  price, "I have one/a few", "under contract", pre-listing/listing-agreement language,
  "coming soon", "might have something", "when I get my listing signed", assignment deal,
  inventory claim, third-party referral). An agent only ASKING qualifying questions or
  acknowledging, with no such signal anywhere in the conversation = `follow_up` (answer the
  question) — never warm.
- **(b) New JSON output field:** add `"agent_has_property": true|false` to the
  generateAiReply reply schema — "true only if the AGENT (inbound lines) has indicated they
  have/know of/expect a property, at any point in the history."
- **(c) Deterministic backstop in `decidePhase2`:** compute
  `convoHasPropertySignal = burstHasAddr || burstHasPrice ||`
  any inbound in `recentMsgs` hits `containsStreetAddress / containsPrice /
  detectAnotherPropertySignal / detectMakeAnOfferSignal / PRE_LISTING_RE /
  detectMultiPropertyClaim` `|| warmClass?.agent_has_property`.
  In the terminal branches (`soft_commit`, `side_question`, `need_both`,
  `need_both_silent` — NOT the address/price watchdog branches, which by definition have
  details), when `!convoHasPropertySignal` → return new kind
  **`engaged_no_signal`**: `{ category: 'follow_up', reply: warmClass?.reply || null }` —
  no `hours`, no `dripStep`, no `preserveFollowUps`, no emoji.
- **(d) Executor + sandbox:** production switch case for `engaged_no_signal` = send reply
  if present, cancel nothing, schedule nothing. Sandbox note text:
  `'[Answered — no property signal, no follow-ups scheduled]'` and render category as cold.
- **(e)** `unfulfillable_parked` needs no separate change: main.js:2544-2547 already keys
  off `category === 'warm'` — once no-signal convs stop being warm, a gate demand without a
  deal correctly falls to `unfulfillable_cold`.

**CAUTION (north star):** the signal test must stay GENEROUS — any hint they have/will have
something keeps the thread warm ("superhuman follow-up"). Regression-test that these stay
warm: "Yes but need an NDA first", "coming soon", "when I get my listing agreement signed",
"I know a man selling…", "I might have one", Judy Dause, Theresa, Jake/Aimee/Jesse, all
drip-continuation cases (drips only exist post-signal, so `lastDripStep`/`hasPendingDrip`
paths are inherently post-signal — leave them warm).

**Explain to Chris (no code change):** the "not sure what happened at the end" sim — "I can
send you some options. What is your email?" is a find-for-you offer, which the LLM correctly
reads cold (Demarkus ruling); it displayed as `warm_went_cold` only because the conversation
was wrongly warm to begin with. Fix 1 makes that whole thread read cold throughout.

---

## Fix 2 — multi_property_gate miscount on a single-property showing blast

**Sim:** Miami "private investor showing… 11940 NW 19th Ave… $370,000…" → "Are you direct
on these?" (multi_property_gate).

**Root cause (REPRODUCED):** `countStreetAddresses` (main.js:466-468) regex
`\b\d{2,6}\s+([A-Za-z]+)` matched `['00 AM', '00 PM', '11940 NW', '000 Estimated']` = 4 ≥ 3.
Clock times ("10:00 AM") and comma-grouped prices ("$370,000 Estimated") count as addresses.

**Fix:** reject matches whose digits are preceded by `:` or `,` (they're time/number
fragments): change the match to use a lookbehind, e.g.
`/(?<![:,\d])\b\d{2,6}\s+([A-Za-z]+)/g`
…and add `am|pm|noon|estimated|cma|value|sales?` to `NOT_STREET_WORD` (:457) as
belt-and-suspenders. **Verify:** exact Miami message → count 1 (no gate, flows to the LLM
as a single property signal); control "123 Main St, 456 Oak Ave, 789 Pine Dr" → 3 (gate
still fires); the +16266021067 deal-sheet regression from batch 7 still counts 1.

---

## Fix 3 — No-price flow: ballpark ask → timeline ask (no hot, no silence)

**Sim:** address given, asked price, agent: "We're still working on that part" → LLM chose
silence (`need_price_silent`). Chris wants: "Okay, do you have a ballpark range?" → if they
say no again → ask the timeline question ("No worries — when do you think you'll have it?")
→ timed follow-up from the answer.

**Does it contradict current rules? Partially — flag to Chris.** Ruling #3 (2026-07-06,
wait-if-reason): "reason the price doesn't exist → acknowledge once and wait, do NOT push."
Chris's new instruction inserts ONE ballpark ask into that path, then a timeline ask, then a
timed wait. It does NOT touch the other path: deflection/refusal where a price exists but
they won't say it (comps, "make an offer", "taking offers") keeps the full 3-ask sequence →
hot. Net new rule set:
- **Reason-price-doesn't-exist** ("still working on it", "I'll ask the seller", "don't know
  yet"): Ask A "Okay, do you have a ballpark range?" → if still nothing → Ask B timeline
  question → schedule follow-up to the stated/estimated time. NEVER promote hot on this
  path (pushing when they literally don't have it is inappropriate).
- **Deflection/refusal** (unchanged): 3 asks (price → "just need the asking price" →
  ballpark) → refusal → hot.

**Implementation:** rewrite the wait-if-reason prompt rule in generateAiReply; in
`decidePhase2` the `need_price` branch already uses `warmClass.reply`, so most of this is
prompt. BUT audit the deterministic hot backup at main.js:2667-2670: `askedBallparkAlready
&& P2_REFUSES_RANGE_RE` would promote hot when the ballpark refusal is itself a
"don't-have-one-yet" reason ("No idea, still waiting on the seller") — add a reason-guard
(reuse/extend the pending-wait detection) so that combination routes to the timeline ask
instead. **Verify in sandbox:** the exact sim sequence → ballpark ask → "no" → timeline
question → timed follow-up; Jake comp-deflection still gets Ask 2; full 3-ask refusal still
→ hot 3/3.

---

## Fix 4 — NDA standoff after a real signal → park warm 🤝

**Sim:** "Yes but need an NDA signed first" → asked address once (correct) → "Can't send
that until we sign something" → got `side_question`/schedule-untouched. Chris: should park
warm + 🤝 manual flag (they HAVE something; gate is a human-only act).

**Root cause:** `UNFULFILLABLE_GATE_RE` (main.js:29-50) matches "nda" but not the follow-up
phrasing "can't send that until we sign something" — so the gate check at :2544 never fired
on turn 2 and it fell through to side_question.

**Fix:** extend `UNFULFILLABLE_GATE_RE` with generic sign-first standoffs:
`can'?t (send|share|give)( you)? (that|it|anything|the address|details)? ?(out )?(until|before|unless)`,
`until (we|you) sign`, `once (we|you) sign`, `after (we|you) sign`,
`sign something (first|before)`, `have to sign something`.
With Fix 1 in place the conversation is genuinely warm (the "Yes" was the signal), so
:2544-2547 → `unfulfillable_parked` 🤝. **Verify:** both sim turns; control: "I need you to
sign for the package" nonsense shouldn't trip anything weird (it's wrong-number territory);
the one-ask-then-silent prompt rule (:1728) still holds for the first NDA turn.

---

## Fix 5 — Phase 1 gate demands with NO property (ID/title-company, etc.)

**Sim:** "Happy to help however I need ID verification and I need to know what title
company…" → `unfulfillable_gate_id_title` WARM. Chris: no signal ⇒ cold/no-response; if
borderline (LLM can't tell if they have something), reply:
**"I'm happy to send all of that info over to you but first can I ask if you have an
off-market fixer upper I can look at?"**

**Fix (prompt, rule at main.js:~1728):** rewrite the UNFULFILLABLE GATE rule's no-deal
branch: the one-attempt-then-warm flow applies ONLY when a real deal is in play. A gate
demand with no property signal → if plainly just process demands, `not_interested`,
reply=null; if there's any hint they might have something, send Chris's borderline line as
`follow_up` (per Fix 1: not warm) — if the next reply still shows no signal, cold. Also add
`id verification|verify (my|your) identity|title company` to the gate regex so Phase 2
occurrences of the same demand hit the deterministic gate (which post-Fix-1 correctly colds
when not warm). **Verify:** exact sim message → borderline line or cold (Chris accepts
either; default to the borderline line since "happy to help" hints cooperation); NDA-with-
signal (Fix 4) still parks 🤝.

---

## Fix 6 — Auction ≠ automatic cold: qualify the timing

**Sim:** "Yes it's going to auction on the 20th" → cold (`excluded_deal_type`).

**Chris's rule:** Bank-owned/REO = cold, full stop. But a FUTURE auction means we can try to
buy it BEFORE the auction — clarify when the auction is. Same logic family as
pre-foreclosure (already treated as an opportunity).

**Root cause:** `\bauction\b` sits in `EXCLUDED_DEAL_TYPE_RE` (main.js:73) → deterministic
cold at :1490; the prompt's bucket lists (:1043, :1061) also name auction as 'no'.

**Fix:**
- Remove `\bauction\b` from `EXCLUDED_DEAL_TYPE_RE` (keep FSBO/foreclosure-active/
  bank-owned/REO/short sale/HUD/commercial).
- New handling: auction mention + bank-owned/REO context → cold (unchanged). Auction
  mention alone → warm-track clarify: if a future date is stated ("going to auction on the
  20th") → treat as a live pre-auction window: chase address + asking price with the
  deadline in mind; if no date → reply **"When's the auction?"** (new bucket
  `auction_timing`); auction already happened / bid-at-auction-only → cold.
- Update both prompt bucket lists (:1043, :1061) and the generateAiReply rules to match;
  also the sim-mock ON_MARKET list (:1322) and example strings if they assert auction=cold.
- **Open question for Chris (noted, default chosen):** how close to the auction date is
  too close to bother? Default: any future date → chase.

**Verify:** sim message → asks for address/asking price (not cold); "it's bank owned, going
to auction" → cold; "pre-foreclosure" unchanged (warm).

---

## Fix 7 — A dated reply ("Feb 17th") must RE-TIME the pending follow-up

**Sim:** "When I get my listing agreement signed yes!" → warm, asked timing → "Feb 17th" →
`side_question`, schedule untouched. Chris: auto-calculate hours until Feb 17 and follow up
then, REPLACING the regular schedule.

**Root cause (2 parts):** (a) `parseScheduleHours`'s `MONTHS` array (main.js:1883, :2021)
only has full month names — "Feb 17th" parses to null; (b) even when a date parses, the
warm-branch timeframe check (:2613-2614) is the only rescheduler, and the
`hasPendingDrip → side_question` path (:2702-2708) never checks for a timeframe, it just
preserves.

**Fix:** (a) add month abbreviations (jan feb mar apr may jun jul aug sep sept oct nov dec,
with optional trailing `.`) to the month-date parsing in `parseScheduleHours`. (b) in
`decidePhase2`, inside the `hasPendingDrip` branch, BEFORE the side-question return: if
`parseScheduleHours(message)` yields real hours → return a reschedule decision (reuse
`drip_future` semantics or a new `pending_retimed` kind) with `hours = parsed`, reply
`"Sounds good, I'll follow up with you then!"` (or silence if the LLM chose one) —
superseding the pending schedule (this matches the documented `sendDueWarmDrips` supersede
rule: a NEW real timeframe replaces the old schedule). **Verify:** the exact 2-turn sim →
follow-up scheduled ≈ hours-until-Feb-17; a genuine side question ("are you an investor?")
still preserves the schedule; "next Friday" mid-drip still retimes (existing behavior).

---

## Fix 8 — Mobile / manufactured / double-wide: land ownership is the test

**Sim:** "Only a double wide mobile home in a 55+ community" → cold
(`wrong_property_type`). Chris: we DO buy mobile/manufactured/double-wides — they just have
to own the land. (Canned answer already exists for the QUESTION form: main.js:1009
`mobile_home: "Yes, as long as they own the land."`)

**Fix (prompt):** in both the bucket-classifier 'no' list (:1061) and generateAiReply rules:
an agent OFFERING a mobile/manufactured/double-wide home is a property signal, NOT a wrong
type. If land ownership is unknown → reply **"Do they own the land?"** (warm — this is a
real signal, Fix 1's gate passes). Owns the land → normal address/price chase. Land-lease /
park-owned / lot-rent → cold. A 55+ community alone is NOT disqualifying. **Verify:** sim
message → asks about land; "double wide on leased lot" → cold; question form "do you buy
mobile homes?" unchanged.

---

## Fix 9 — Canned-answer pack (prompt rules; keep replies verbatim where quoted)

All in the generateAiReply prompt (and the Phase-1 mirror where noted). Chris supplied exact
wording — do not paraphrase the quoted strings:

1. **Offer terms** ("what are your normal terms when submitting an offer?"):
   reply exactly:
   `"14-21 days COE\nWe pay closing and title fees\nCash/ hard money\n5-8 day inspection period"`
2. **Assignment objection** ("we don't allow assignments / no assigning the contract"):
   change the reply at main.js:2608 (decidePhase2) AND the Phase-1 path (:1541) to:
   `"That's fine, we don't have to include the assignment clause in the contract."`
   (keep appending the standard address/price ask when appropriate).
3. **"Would you (try to) assign it?"** (intent question, not an objection):
   `"Depends on the deal — I'll have my team look at it, I just need more info first."`
   then keep chasing address/price.
4. **Bio request** ("send me your bio"): reply with name + company + email from settings
   (myName/myLastName, company, email — e.g. "Chris Nold, Swift Offer Solutions LLC,
   christian.nold@gmail.com"). Read from settings, don't hardcode. (Personal Gmail OK per
   2026-07-06 David Hines ruling.) Currently says "I don't have a bio…" — replace.
5. **Bare representation question, no property yet** ("Would I be representing you as the
   buyer?" / "Would I be your agent?"): reply `"Yes, can you send me the address and asking
   price?"` — do NOT use the `agent_q` canned "We work with multiple agents." here. KEEP the
   post-signal behavior (exclusivity pressed AFTER they showed a property → "I work with
   several agents, but I can sign a property-specific agreement if these work out" → and if
   they then demand a BBA, 🤝 park — Chris confirmed that flow is perfect).
6. **Commission question (with property signal)** — tighten to:
   `"We can cover your commission as long as the numbers work — when you have a property to
   send me, you can write up a property-specific buyer broker agreement."` + address ask.

**Verify each** with the corresponding sim message in the sandbox, plus the identity/POF/
inspection-period canned controls to confirm no prompt regression.

---

## Fix 10 — Consultation / appointment pitches → cold, no reply

**Sim (Sydnee):** long buyer-consultation + exclusive-BBA pitch, no property → got
`soft_future_commit` + "Okay thanks, please keep me in mind." Chris: cold/ignore — we don't
do in-person meetings, consultations, or appointments; nothing to chase here. (If she HAD
said she has something, we'd push for the property info instead.)

**Root cause:** the deterministic `soft_future_commit` shortcut (main.js:1543-1549) matched
"I will let you know in advance…" via `SOFT_FUTURE_COMMIT_RE` (:194) and replied before the
LLM — whose prompt already classifies "buyer consultation offers" as 'no' (:1061) — ever saw
it. Same family as the affirmative_short/timeframe_deferral lesson: a default-to-engaged
shortcut blind to the rest of the message.

**Fix:** guard the shortcut — skip `soft_future_commit` when the message also matches a
consultation/appointment/gate pattern: `detectUnfulfillableGate(msgBody) ||
detectCallScheduleNoProperty(msgBody) || CONSULT_RE` where `CONSULT_RE` ≈
`/\b(buyer )?consult(ation)?s?\b|\bappointments?\b|\bmy next available\b|\bcome (in|into|by) (the )?office\b|\bopenings? between\b/i`
→ falls through to generateAiReply → `not_interested`, reply=null. **Verify:** Sydnee's
full message → cold, no reply; genuine "I'll keep you posted if I find something" still →
soft_future_commit "keep me in mind".

---

## Verification (after all fixes)

1. Replay EVERY sim from Chris's review in the sandbox (they're all reproducible via
   aiSimulate multi-turn) — expected outcomes as annotated above.
2. Full regression battery (scratchpad/pw-test): Phase 1 8/8, multi-turn gate 8/8, rulings
   6/6, Theresa hot 3/3, conv-1206, will-get-address silence.
3. Warm-preservation spot checks for Fix 1 (list in Fix 1 CAUTION).
4. `node deploy.js` once green.

## Open questions for Chris (defaults chosen, proceed unless overridden)

1. **Fix 1:** engaged-no-signal threads get NOTHING scheduled (monthly re-blast is the
   net). OK, or do you want one long-dated (e.g. 2-week) check-in on the best of these?
   Default: nothing.
2. **Fix 3:** confirms ruling #3 (2026-07-06 "acknowledge once and wait") is amended to
   ballpark-ask → timeline-ask → timed wait, with NO hot promotion when they gave a reason
   the price doesn't exist. Deflection 3-ask → hot unchanged. Default: as written.
3. **Fix 6:** any future auction date = worth chasing? Default: yes, any future date.
4. **Fix 9.5:** plain "Yes" to "would I be representing you?" — confirmed despite the
   multiple-agents reality (the property-specific-agreement nuance comes later if pressed).
   Default: Chris's exact wording.
