---
name: rytask-design
description: Use this skill to generate well-branded interfaces and assets for RyTask — an open-source, self-hostable issue & time tracker — either for production or throwaway prototypes/mocks. Contains essential design guidelines, color & type tokens, fonts, logo assets, and UI-kit components for prototyping.
user-invocable: true
---

Read the `README.md` file within this skill, and explore the other available files.

Key files:
- `colors_and_type.css` — all design tokens (color light+dark, type, spacing, radius, shadow, motion). Copy this into any artifact and use only the semantic `var(--*)` names.
- `RyTask Style Sheet.html` — the canonical one-page reference for the brand and every core component.
- `assets/` — logo mark + wordmark SVGs.
- `ui_kits/app/` — high-fidelity app components to fork.

Core rules to internalize: Sunbeam yellow primary (dark ink on fills), Honey accent (= time), warm Stone neutrals, three semantic hues only. Hanken Grotesk for UI, Schibsted Grotesk for brand moments, Geist Mono (tabular) for every figure. Flat fills — no decorative gradients, no glassmorphism, no floaty shadows, no emoji as chrome, small radii. Plain, kind, jargon-free copy that passes the non-technical-teammate test.

If creating visual artifacts (mocks, prototypes, slides), copy assets out and produce static HTML files for the user to view. If working on production code, copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without other guidance, ask what they want to build, ask a few focused questions, then act as an expert designer who outputs HTML artifacts or production code.
