# Delivery 5 — Field captions in Grocy's language — Implementation Plan

**Goal:** what the app writes into Grocy (userfield captions, the list the Doctor creates) follows Grocy's language, and the Doctor offers to fix captions that are in another language.

**Architecture:** Grocy's language is `LOCALE` from `GET /system/config`. `logic/checkup.ts` holds the Grocy texts (fr, en) and picks French when the locale starts with `fr`, English otherwise. The checkup compares each app field's caption with the expected one and adds a `renameUserfields` fix; the store applies it with `PUT /objects/userfields/{id}` `{ caption }`.

## Global Constraints
- Internal names (`appprice`, `appbestbefore`, `appaisle`) never change; only captions.
- Captions follow Grocy's language, never the phone's (two phones must not fight).
- Rename only captions the app may have written (a known caption in any language); a caption the user wrote stays.
- Caption mismatch is a warning, not blocking; nothing changes before « Réparer ».
- The list is only named at creation; an existing list is never renamed.

## Review Focus
- `LOCALE` missing or unknown (de, '') → English (test).
- `fr_FR`, `fr_CA` → French (test).
- Missing field and wrong caption at once → only the creation is offered; captions are checked once fields exist.
- Wrong type still wins (error, no fix).
- Doctor notice no longer claims "only adds" when a rename is planned.

### Task 1: checkup
- `appUserfields(grocyLocale)`, `defaultListName(grocyLocale)`, `CheckupInput.grocyLocale`, userfields with `id` and `caption`, fixes `createList { name }` and `renameUserfields { fields: { id, name, caption }[] }`.
- [x] Tests in `checkup.test.ts` (French creation, rename warning, user caption kept, ok when matching, locale mapping, describeFix).

### Task 2: API, store, screen, script
- [x] `GrocyClient.setUserfieldCaption(id, caption)`, `getUserfields` returns `caption` (tests in `grocy.test.ts`).
- [x] Store reads `LOCALE` in `runCheckup`, applies both fixes; Doctor notice; integration script passes `grocyLocale`.

### Task 3: verify and ship
- [x] tsc, Jest, lint baseline; checkup against the real Grocy; caption update on a temporary field; Doctor screen in the simulator (« Réparer » not tapped).
- [x] README. Commit, push, PR.
