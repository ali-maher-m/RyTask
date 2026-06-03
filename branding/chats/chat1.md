# RyTask Branding System

_Started 2026-06-02 23:26 UTC_

---

## User

reformat this not rewrite it don't edit on it just reformat :" ▎ Create a branding + design system for RyTask — an open-source, self-hostable project & issue tracker for small, interrupt-driven teams. Alternative to 
 Linear/Jira/Plane, but must pass the "non-technical teammate" test: calm, friendly, zero-jargon.

 Feel: focused, trustworthy, lightweight — Linear's precision with Notion's warmth. Not corporate, not playful-cute. Flat, fast, keyboard-first.

 Differentiators to express visually: native time-tracking (plan-vs-actual), fast Slack-style capture, and AI/MCP control.

 Deliver, with explicit values:
 - Logo (SVG, light/dark) + wordmark
 - Color palette: primary, accent, neutrals, semantic (success/warn/error), full light and dark mode
 - Typography scale (UI + numeric/time-tracking figures)
 - Core components: button, input, task row, badge/status pill, card, sidebar nav, modal
 - Spacing/radius/shadow tokens + a "never do this" list

 Output as design tokens (CSS variables) + a one-page style sheet. Keep it dense and product-grade, not a generic AI gradient look."

## Assistant

Here's that reformatted — same words, just cleaned-up structure:

---

# Create a branding + design system for **RyTask**

An open-source, self-hostable project & issue tracker for small, interrupt-driven teams. Alternative to Linear/Jira/Plane, but must pass the **"non-technical teammate" test**: calm, friendly, zero-jargon.

## Feel
Focused, trustworthy, lightweight — Linear's precision with Notion's warmth. Not corporate, not playful-cute. Flat, fast, keyboard-first.

## Differentiators to express visually
- Native time-tracking (plan-vs-actual)
- Fast Slack-style capture
- AI/MCP control

## Deliver (with explicit values)
- **Logo** (SVG, light/dark) + wordmark
- **Color palette:** primary, accent, neutrals, semantic (success/warn/error), full light and dark mode
- **Typography scale** (UI + numeric/time-tracking figures)
- **Core components:** button, input, task row, badge/status pill, card, sidebar nav, modal
- **Spacing/radius/shadow tokens** + a "never do this" list

## Output
Design tokens (CSS variables) + a one-page style sheet. Keep it dense and product-grade, not a generic AI gradient look.

---

Want me to start building this design system, or did you just need the brief tidied up?

## User

building this design system

## Assistant

_[tool: list_files]_

_[tool: invoke_skill]_

_[tool: update_todos]_

_[tool: set_project_title]_

The Obelisk system is attached by default, but your brief explicitly asks for an *original* brand for RyTask with a different feel (Linear precision + Notion warmth) — so I'm creating a fresh, dedicated system rather than forcing Obelisk's earth-toned neo-brutalism onto a tracker. Here's my plan.

_[tool: write_file]_

Now the token file — the foundation everything references.

_[tool: write_file]_

Now the logo. A rounded "task tile" holding a confident check whose long arm leans forward — task done + momentum.

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

Now the hero deliverable — the dense, product-grade one-page style sheet with a light/dark toggle. I'll use Lucide (CDN) as the icon set since it matches the precise, keyboard-first feel.

_[tool: show_html]_

_[tool: show_html]_

_[tool: get_webview_logs]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: show_html]_

_[tool: get_webview_logs]_

_[tool: save_screenshot]_

Clean. Let me take a look.

_[tool: view_image]_

Looks sharp. Let me check the task row (the differentiator) and the dark mode.

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: str_replace_edit]_

Task meter looks great. The `RT-128` ID is wrapping — let me pin it nowrap.

_[tool: str_replace_edit]_

_[tool: write_file]_

Now the README, SKILL.md, and preview cards. The style sheet is the centerpiece; the design-system project structure rounds it out. Let me write those in parallel.

_[tool: write_file]_

_[tool: write_file]_

Now the UI kit — the RyTask app in context, which proves "product-grade, not generic AI."

_[tool: str_replace_edit]_

Same lucide icon-swap pitfall in the theme toggle — let me fix it with a wrapper.

_[tool: str_replace_edit]_

_[tool: show_html]_

_[tool: get_webview_logs]_

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: str_replace_edit]_

Polished. Two wrap issues — the "My issues" title and the group time-sums. Let me pin them nowrap.

_[tool: run_script]_

App is solid. Now the Design System tab cards — I'll generate them programmatically.

_[tool: register_assets]_

Now register everything for the Design System tab.

_[tool: write_file]_

_[tool: update_todos]_

_[tool: done]_

_[tool: fork_verifier_agent]_

_[tool: update_todos]_

**RyTask design system is built.** The Design System tab has 20 cards; the hero is **`RyTask Style Sheet.html`** (one page, light/dark, every token + component), backed by **`colors_and_type.css`** and a working app kit at `ui_kits/app/`.

The system, in short: **Iris** primary, **Honey** accent (= time), warm **Stone** neutrals, three semantic hues — full light *and* dark from one set of token names. Hanken Grotesk UI / Schibsted Grotesk brand / Geist Mono tabular figures. Flat, small-radius, whisper-shadow, with a "never do this" guardrail list. The signature move is the **plan-vs-actual time meter living inside the task row** (over-budget turns red), plus a Slack-style capture bar that parses `@assignee ~est #label`.

**Caveats / flags:**
- The **logo** is an original v1 I designed from scratch (rounded task-tile + forward-leaning check + honey dot) — most likely the thing you'll want to push on.
- **Icons = Lucide via CDN** (closest-fit open set since there was no source); self-host for production.
- I deliberately **ignored the attached Obelisk earth-tone system** — it conflicts with your stated feel. Say the word if you actually wanted RyTask built *on* Obelisk's palette.

**My bold ask:** lock the two decisions that everything hangs on — **(1) is Iris `#4257E0` the right primary, or do you want it warmer/cooler/greener?** and **(2) keep the Hanken + Geist Mono pairing, or swap in something with more edge?** Tell me those and I'll tune the whole system in one pass.

## User

change the 4257E0 primary color to yellow

## Assistant

_[tool: grep]_

Quick heads-up before I make the change: yellow can't carry white button text the way the blue did, so a proper switch means **dark text on yellow fills** (and the logo tile flips to a dark check). I'll handle that so nothing becomes unreadable. Let me find every spot that assumes the old blue.

_[tool: run_script]_

This is a real rebrand, not a one-liner — yellow needs dark text on fills, a legible "brand text" gold for links/wordmark on light, the logo flips to a dark check, and I'll move `info`/`in-review` to a small indigo so the status dots don't all go warm. Let me do it comprehensively across the token file, both mockups, the preview cards, and the logos.

First the token file:

_[tool: run_script]_

The media-block `--fg-on-accent` is inline on a longer line. Let me catch it.

_[tool: run_script]_

Now the mockups, preview cards, logos, and docs:

_[tool: unregister_assets]_

Re-label the swatch card, then verify.

_[tool: register_assets]_

_[tool: show_html]_

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: get_webview_logs]_

Dark mode looks great — yellow mark with dark check is crisp. Let me check light mode and the buttons/meters.

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: save_screenshot]_

Caught it mid-transition. Let me re-shoot once settled.

_[tool: view_image]_

_[tool: save_screenshot]_

Those dark secondary buttons are a theme-transition capture artifact (the page reloads to dark, then animates to light as I shoot). Let me kill transitions and force light for a clean read.

_[tool: view_image]_

_[tool: show_html]_

Clean and legible — yellow fills with dark ink, secondary stays white, danger stays red, focus ring is now yellow. Let me confirm the app mockup survived the token swap.

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: get_webview_logs]_

The yellow rebrand is coherent across both surfaces — workspace avatar, selected row, nav active state, focus ring, and the indigo `in-review` dot now reads distinctly against the gold `in-progress`. Logs clean?

_[tool: done]_

_[tool: fork_verifier_agent]_

Done — primary is now **Sunbeam yellow (`#ECB30A`)** across the whole system: tokens (light + dark), both mockups, all preview cards, and the logo.

Because yellow can't carry white text, I made a few necessary calls so nothing turned unreadable:
- **Yellow fills take dark ink text** (buttons, the logo's check, the workspace avatar) — added `--fg-on-accent: #201D1A`.
- **A separate "brand text" gold (`--primary-text`, `#936409`)** for links, the wordmark accent, and active-nav icons on light surfaces, so they stay legible where bright yellow wouldn't.
- **Moved `info` + `in-review` to a small indigo** so the status dots don't all collapse into warm tones (in-progress is already gold).

Honey stays the time/accent color. If you'd rather the yellow be **deeper/mustard** or **brighter/lemon**, or want the wordmark "Task" to read in solid dark instead of gold, say which and I'll nudge it.

## User

Apply comment

## Assistant

_[tool: eval_js]_

_[tool: str_replace_edit]_

Found it — the topbar is a direct child of `<body>`, and a stray negative margin (`0 -28px 0`) was yanking it left so the logo sat flush at x=0 while the page content starts at 28px. Removing that negative margin aligns them.

_[tool: show_html]_

_[tool: eval_js]_

Aligned — the logo now sits at 28px, flush with the page content below it. The full-bleed bar background and bottom border still span the viewport since the topbar is a body-level element.

