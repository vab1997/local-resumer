# Chrome Web Store — dashboard answers (copy-paste source)

> **PUBLISHED 2026-07-13** — live at
> https://chromewebstore.google.com/detail/kchemponejhcgbnchebgmfonoddiklhn (item ID
> `kchemponejhcgbnchebgmfonoddiklhn`). This doc remains the source for future listing edits;
> version bumps re-enter review on upload.

Everything the developer dashboard asks for, pre-written. Long descriptions live in
`listing-en.md` / `listing-es.md`; the promo tile in `assets/store/promo-tile-440x280.png`;
screenshots are captured manually (1280×800, 1–5).

## Single purpose

> Summarize the article on the current page into a title, TL;DR and key points, shown in the
> browser side panel.

## Permission justifications

**sidePanel** — The extension's entire UI lives in the browser side panel; it is opened from
the toolbar icon.

**tabs** — Read the active tab's URL for two purposes only: (1) detect that the user navigated
away or switched tabs so a summary is never attributed to the wrong page ("stale summary"
notice), and (2) check the page is http(s) before attempting extraction. No history is
collected, stored, or transmitted.

**storage** — Persist user preferences locally: selected model, measured model download size,
and (only if the user opts into cloud mode) their own API keys. Nothing syncs; everything stays
in `chrome.storage.local`.

**scripting** — Inject the article-extraction content script (Mozilla Readability) into the
current tab at the moment the user clicks Summarize. There is no always-on content script.

**Host permission `*://*/*` (optional)** — Requested at runtime, on the user's first Summarize
click, via the standard Chrome prompt. Needed because the user can summarize an article on any
site; access is used exclusively to read the page's article text on explicit user action.

## Data usage form

- **What is collected:** Website content (the article text of the page the user explicitly
  summarizes).
- **How it is used:** Generated into a summary. By default processing is 100% local (in-browser
  model, WebGPU) and the text never leaves the device. If — and only if — the user opts into
  cloud mode and provides their own API key, the article text is sent directly to the provider
  they chose (OpenAI, Anthropic, or OpenRouter). The UI states this explicitly next to the mode
  selector and in the key panel.
- **Authentication information:** User-provided API keys are stored locally
  (`chrome.storage.local`), never transmitted anywhere except to the corresponding provider as
  the request's auth header.
- **Not collected:** browsing history, personal communications, location, financial data,
  analytics/telemetry of any kind. The developer operates no servers.
- Certifications: data is not sold, not used for purposes unrelated to the single purpose, not
  used for creditworthiness. ✔ all three.

## Other dashboard fields

- **Category:** Productivity → Tools (or "Workflow & Planning"; pick Productivity).
- **Language(s):** English + Spanish (the package ships `_locales/en` + `_locales/es`).
- **Remote code:** **No.** All code ships in the package (ONNX Runtime WASM is bundled at
  `/ort`; model weights are data, not code, fetched from the Hugging Face Hub).
- **Privacy policy URL:** `https://article-lens-web.vercel.app/privacy` (source:
  `apps/web/src/pages/privacy.astro`; ES at `/es/privacy`). ⚠️ Confirm the real Vercel project
  URL after the first deploy — if it differs, update this and `apps/web/src/layouts/Layout.astro`
  (`SITE`).
- **Trader declaration:** user decision (personal, non-commercial → non-trader).
- **Visibility:** Public.

## Pre-submit checklist

- [ ] `pnpm zip` → upload `.output/*.zip`
- [ ] Long description EN + ES pasted
- [ ] 1–5 screenshots 1280×800 uploaded
- [ ] Promo tile 440×280 uploaded
- [ ] Permission justifications pasted (above)
- [ ] Data usage form completed (above)
- [ ] Web deployed on Vercel (root dir `apps/web`) and privacy URL confirmed
- [ ] Contact email verified, trader status declared

## Release checklist (new version)

1. Changes merged to main (repo workflow).
2. Bump `apps/extension/package.json` version (must exceed the published one).
3. `pnpm compile:ext && pnpm lint:ext && pnpm build:ext` + manual smoke on the unpacked build.
4. `pnpm zip:ext` → `.output/article-lens-<version>-chrome.zip`.
5. Dashboard → item → Package → **Upload new package** (listing/privacy persist).
6. Only if changed: new permissions → justify in Privacy tab (warning-bearing permissions
   disable the extension for existing users until re-accepted — avoid); data-practice changes →
   update the data-usage form **and** the website privacy policy first.
7. Submit for review → on approval publish; Chrome auto-updates users within hours.
