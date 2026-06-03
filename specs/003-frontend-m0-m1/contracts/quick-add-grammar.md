# Contract: Quick-Add Grammar (client preview vs server authority)

**Feature**: `003-frontend-m0-m1` | FR-WEB-020/021, US2 | server grammar: M1 `FR-WI-004`

Quick-add captures a fully structured item from one line. **The server is the parser of record** — it
creates the item and returns `meta.unresolved[]`. The client runs a **display-only tokenizer** so the
user sees recognized tokens as chips while typing; it never owns correctness and never drops tokens
(D13).

## Grammar

```
line        := segment*
segment     := token | word
token       := assignee | label | priority | date
assignee    := '@' handle
label       := '#' slug
priority    := '!' ('urgent' | 'high' | 'medium' | 'low' | 'none')
date        := '^' ('today' | 'tomorrow' | weekday | 'YYYY-MM-DD')
title       := the words that are not tokens, joined
```

Example: `Fix login redirect @ali #bug !urgent ^Friday`
→ title `Fix login redirect`, assignee `@ali`, label `#bug`, priority `URGENT`, due `^Friday`.

## Rules

1. **Recognized tokens → chips** rendered live as the user types (client preview only). (FR-WEB-021)
2. **Unresolved/ambiguous tokens are never dropped and never block capture.** The item is created with
   everything recognized; each unresolved token is surfaced inline for correction, sourced from the
   server's `meta.unresolved` (the authority) — e.g. an unknown `@handle`, an undefined `#label`, or an
   unparseable `^date` like `^someday`. (FR-WEB-021, US2.3, SC-002)
3. **Escaping / quoting**: a title that legitimately contains `@ # ! ^` keeps them literal via escaping
   (e.g. a backslash `\@`) or quoting; escaped characters are not parsed as tokens. (US2.4)
4. **Minimal keystrokes**: a full token line yields the correct structured item with **≤2 keystrokes
   beyond the typed text** and appears without a page reload, under 2 seconds. (FR-WEB-020, SC-002)
5. **Priority vocabulary** maps to the M1 `Priority` enum (`URGENT|HIGH|MEDIUM|LOW|NONE`).
6. **Date vocabulary** resolves in the **org timezone** (`today|tomorrow|<weekday>|YYYY-MM-DD`), server-side.

## Request / response

```http
POST /api/v1/work-items
{ "projectId": "<uuid>", "quickAdd": "Fix login redirect @ali #bug !urgent ^Friday" }
```
```jsonc
// 201
{ "data": { "key": "RY-142", "title": "Fix login redirect", /* …structured fields… */ },
  "meta": { "unresolved": [ /* { token, kind } for anything not resolved */ ] } }
```

## Client preview tokenizer (unit-tested, NOT authoritative)

```ts
function previewTokens(line: string): { chips: ParsedToken[]; titlePreview: string };
// chips render @/#/!/^ recognitions; honors escaping; resolved=false until the server confirms.
```
- Tested cases: bare title (no tokens) → one default item; full token line → 4 chips + title; an
  escaped `\@name` stays in the title; an ambiguous token still previews but is reconciled to the
  server's `meta.unresolved`. The tokenizer disagreeing with the server is always resolved in the
  server's favor.
