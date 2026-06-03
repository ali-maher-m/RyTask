# RyTask — Design System

> **A tracker that doesn't talk like a tracker.**

RyTask is an open-source, self-hostable project & issue tracker for small, interrupt-driven teams — an alternative to Linear / Jira / Plane that passes the **"non-technical teammate" test**: calm, friendly, zero-jargon. The feel is **Linear's precision + Notion's warmth** — focused, trustworthy, lightweight; flat, fast, keyboard-first.

Three things the brand exists to express visually:
- **Native time-tracking** — plan-vs-actual lives *in the task row*, not bolted on.
- **Fast, Slack-style capture** — type a sentence, it parses assignee / estimate / status.
- **AI / MCP control** — the product is scriptable and agent-friendly.

This system was **created from scratch** for RyTask (no prior codebase or Figma) — it is original branding, not derived from any existing product.

---

## Index

| File / Folder | Purpose |
|---|---|
| `colors_and_type.css` | **All design tokens** — color (light + dark), type, spacing, radius, shadow, motion, layout. The single source of truth. |
| `RyTask Style Sheet.html` | **The one-page style sheet** — logo, palettes, type, every core component, token visualizations, "never do this". Light/dark toggle. |
| `assets/` | Logo mark + wordmark SVGs (color, dark, mono). |
| `preview/` | Design-System-tab cards (swatches, specimens, component states). |
| `ui_kits/app/` | High-fidelity recreation of the RyTask app (sidebar + issue list with live time meters). |
| `SKILL.md` | Agent-Skills entrypoint for reuse in Claude Code. |

---

## 1 · Content Fundamentals

Voice is **plain, kind, and direct** — the reader might be a developer *or* the ops person who's never filed a ticket. Never make the non-technical teammate feel dumb.

- **Casing:** Sentence case for everything human — titles, buttons, descriptions ("New issue", "Log time", "My issues"). `UPPERCASE + 0.06em tracking` only for micro-labels / section kickers (`WORKSPACE`, `IN PROGRESS`).
- **Point of view:** "you" and "your team". The product is a calm assistant, not a system of record talking at you.
- **Plain over clever:** "At risk", "Blocked", "Done" — not "Impeded", "Deprioritized". Time reads "2:47 / 2:00", not "Actual vs. budgeted effort variance".
- **Never:** hype or jargon — no "synergy", "supercharge", "revolutionary", "10x". No emoji as UI chrome (emoji only inside user-typed content).

> ✅ "RT-128 is over its estimate — logged 2:47 of a planned 2:00."
> ❌ "Velocity anomaly detected: this work item has exceeded its allocated effort budget. 🚀"

---

## 2 · Visual Foundations

**Aesthetic:** restrained, product-grade, flat. The warmth comes from neutrals and one honey accent — *not* from gradients or rounded bubbliness.

- **Color:** `Sunbeam` primary (#ECB30A, optimistic golden yellow — energy & focus; fills take dark ink text). `Honey` accent (#D98A0E — carries *time* and momentum). `Stone` warm-tinted neutrals (the Notion warmth). Three semantic hues only (green / amber / red). Full light **and** dark mode resolve from the same semantic token names. One indigo is kept solely for info / in-review status. No teal, no neon, no other off-palette color.
- **Type:** **Schibsted Grotesk** (800) for brand moments only; **Hanken Grotesk** (400–700) for the entire UI — humanist, warm, legible at 13px; **Geist Mono** for *every figure* (times, estimates, counts, IDs), always `tabular-nums` so columns never shift. Base UI size 14px. (Inter is deliberately avoided.)
- **Backgrounds:** flat color only. No decorative gradients, no imagery, no patterns. The single permitted gradient is conceptually the time meter's fill.
- **Borders & corners:** 1px hairlines (`--border`) do the structural work. Small radii signal precision — 6px inputs, 8px buttons, 10px cards, 14px modals; nothing over 18px except pills. No heavy outlines.
- **Shadows:** tight, warm-ink, offset-led. Elevation is a *whisper* (`--shadow-xs`→`lg`), never a floaty colored glow. Dark mode leans on borders + faint shadow.
- **Transparency / blur:** essentially absent. One subtle backdrop-blur on the sticky top bar; never frosted cards, nav, or modals. No glassmorphism.
- **Animation:** fast and calm, **no bounce / no overshoot**. `--dur-fast` 140ms hovers/presses, `--ease-out (.22,1,.36,1)` default, `--ease-snap` for menus. Press = 1px push-down. All decorative motion off under `prefers-reduced-motion`.
- **Hover / press:** hover = subtle background shift (`--surface-hover`) or one step darker primary; press = `translateY(1px)`. No color-flip novelty.
- **Cards:** `--surface` bg, 1px `--border`, 10px radius, `--shadow-sm`, ~16px padding. Selected rows get a 2px inset Iris bar + `--primary-soft` tint.
- **Layout:** 232px sidebar, 38px task rows, 32px controls. 4px spacing grid throughout.

---

## 3 · Iconography

- **Lucide** is the icon system (CDN). It matches the precise, 1.5px-stroke, keyboard-first feel. Load `https://unpkg.com/lucide@latest` and call `lucide.createIcons()`. *(Substitution note: Lucide was chosen as the closest-fit open icon set since this brand was built from scratch — swap for a self-hosted sprite in production.)*
- **No emoji as chrome** — emoji appear only inside user-generated content, never as buttons, status, or nav.
- **Status** uses geometric CSS dots/rings (backlog/todo = ring outline; in-progress/review/done = filled dot) colored by `--status-*` tokens — not icons.
- **Figures** (time, counts, IDs) are typographic, set in Geist Mono — treat them as a kind of iconography for "data".
- **Logo** in `assets/`: `logo-mark.svg` (color, any surface), `logo-mark-dark.svg` (brighter Iris for dark), `logo-mark-mono.svg` (currentColor stamp), `wordmark.svg` (mark + Schibsted Grotesk lockup).

---

## 4 · Caveats & Substitutions

- **Fonts** — Schibsted Grotesk, Hanken Grotesk, and Geist Mono are all pulled from Google Fonts. All three are real, available families; no fallback substitution was needed, but confirm they're the intended cuts.
- **Icons** — Lucide via CDN is a substitution chosen for fit; a production build should self-host.
- **Logo** — the mark was designed fresh for RyTask. Treat it as a v1 proposal open to iteration.

_For tokens: start at `colors_and_type.css`. For everything visual: open `RyTask Style Sheet.html`. For agent reuse: see `SKILL.md`._
