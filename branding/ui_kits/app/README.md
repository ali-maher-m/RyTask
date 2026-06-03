# RyTask — App UI Kit

A high-fidelity, interactive recreation of the RyTask app's primary surface: the **My issues** view with sidebar nav and the signature plan-vs-actual time meter built into every row.

Open `index.html`. It's a single self-contained screen (tokens from `../../colors_and_type.css`).

## What's demonstrated
- **Sidebar nav** — workspace switcher, quick capture, inbox/search, workspace + teams sections, running-timer bar, dark-mode toggle.
- **Issue list** — grouped by status (in progress / review / todo / done) with per-group time sums.
- **Task row** — status dot, checkbox (click to complete), ID, title, label badge, **time meter** (honey fill vs. planned tick; over-budget turns red), per-row play/pause timer, assignee avatar.
- **Live time-tracking** — press a row's play button to start a timer; the sidebar shows it tracking and the row's logged time ticks up.
- **Fast capture** — press <kbd>C</kbd> or "New issue"; type Slack-style (`Fix login @sam ~3h #bug high`) and watch assignee / estimate / label parse live; <kbd>⏎</kbd> creates the issue.

## Notes
- Icons are Lucide via CDN (substitution — self-host in production).
- This is a cosmetic recreation, not production code: data is in-memory, parsing is regex, no persistence beyond theme.
