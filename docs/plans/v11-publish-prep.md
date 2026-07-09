# v11 — Publish prep: optional host permissions + store assets

## Context

Preparing the Chrome Web Store submission. The blocker found in grilling: the declared content
script on `*://*/*` forces the scariest install warning ("Read and change all your data on all
websites") and routes the extension into slow in-depth review — the #1 cause of rejections.
The extension only ever extracts on demand (panel click), so broad always-on injection is
unnecessary capability.

## Decisions (grilled 2026-07-09)

- **Injection model: `optional_host_permissions`** (chosen over pure activeTab). One Chrome
  prompt on first Summarize; after granting, UX identical to today — no re-click after in-tab
  navigation. Clean install (no host warning), fast review.
- **Injection mechanics: on-demand `executeScript`**, not persistent registration — matches the
  on-demand philosophy, and fixes the long-standing "page loaded before install" failure
  (`extract.ts:44`): we now inject at summarize time instead of hoping a script is there.
- **`tabs` permission stays** ("Read browsing history" warning) — needed for staleness detection
  (`useActiveTabUrl`); justified honestly in the dashboard.
- **Version: 1.0.0** for first submit.
- **Screenshots: user** captures 3–5 at 1280×800. Promo tile + long descriptions: generated here.
- **Privacy policy: ON HOLD** — will live on the future product web page. It is the only
  submission blocker left after this iteration.

## Changes

### 1. Manifest (`wxt.config.ts`)
- `permissions`: add `scripting`.
- Add `optional_host_permissions: ['*://*/*']`.
- Content script leaves the manifest via `registration: 'runtime'` in `entrypoints/content.ts`
  (WXT keeps emitting `content-scripts/content.js` for programmatic injection).

### 2. Extraction flow (`src/features/article-extraction/`)
- New `ensureHostAccess()`: `permissions.contains({origins:['*://*/*']})` → if missing,
  `permissions.request(...)`. Must run **first** in the Summarize click flow (gesture required
  for the prompt). Denied → typed error with i18n user-facing message.
- `extract.ts`: try `tabs.sendMessage` (script may already be there from a prior run) → on
  failure `scripting.executeScript({files:['/content-scripts/content.js']})` → retry message.
  Update the failure copy (the "reload the page" case disappears).

### 3. Locales (`locales/en.yml`, `es.yml`)
- New keys: permission-denied message ("allow access when Chrome asks"), injection-failure
  message.

### 4. Version + store assets
- `package.json` → `1.0.0` (WXT propagates to manifest).
- `scripts/make-icons.py`: add promo-tile generation → `assets/store/promo-tile-440x280.png`
  (dark bg, white mark + recolored wordmark; reuses `navy_to_white`).
- `docs/store/`: `listing-en.md` + `listing-es.md` (long descriptions with keywords) and
  `dashboard.md` (single-purpose statement, per-permission justifications, data-use form
  answers, remote-code: No). Copy-paste source for the dashboard.

### 5. Docs
- `docs/context/app-context.md`: v11 row; permissions/injection notes updated.
- `CLAUDE.md`/`AGENT.md` + `README.md`: content script description → on-demand injection with
  optional host permissions.

## Verification

1. `pnpm compile && pnpm lint && pnpm build`; built manifest has **no `content_scripts`**,
   has `optional_host_permissions` + `scripting`, version 1.0.0.
2. Manual (user): remove + load unpacked fresh → open article → Summarize → Chrome permission
   prompt appears → allow → summary runs. Deny path shows the guide message and next Summarize
   re-prompts. A tab opened **before** install summarizes fine (injection fixes it). Staleness
   still works after in-tab navigation.

## Out of scope / user tasks

- Screenshots (user), developer account + $5 + trader declaration (user).
- Privacy policy page (future web-page project) — **required before actual submit**.
