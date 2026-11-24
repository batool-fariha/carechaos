# Screen-reader pass

Automated checks (axe in the e2e suite) pass, but nobody has run CareChaos with a real screen reader yet. This is a checklist for doing that in about 20 minutes, and for reporting what you hear. See [issue #5](https://github.com/batool-fariha/carechaos/issues/5).

## Setup

- **macOS:** VoiceOver, toggled with `Cmd+F5`. Use Safari. Useful keys: `VO` = `Ctrl+Option`; `VO+Right` moves forward; `VO+U` opens the rotor (headings, links, tables, form controls).
- **Windows:** NVDA with Firefox or Chrome. `Insert+F7` opens the elements list; `H` jumps by heading, `T` by table.
- Run the app with `npm install && npm run dev`, then open `http://localhost:3000`.

Write down the screen reader, browser and version when you report.

## Known candidates (from reading the code)

These are likely problems. Please confirm or refute each while you test.

- [ ] **Table names and column scope.** Every table now has a screen-reader-only `<caption>` and `scope="col"` on its header cells (they had neither before). Please confirm: the rotor or element list names each table sensibly, and moving across a row announces the column header. Check the "Event counts by outcome" table too, which has no header row, so each row is a status and a count.
- [ ] **Pipeline topology** is an SVG group of buttons. Each button's label carries the service, its health and queue depth. Check that it reads sensibly, and whether a changing queue depth is announced (it should not be noisy).
- [ ] **Run state** has `aria-live="polite"`. Check that "running", "paused" and "completed" are announced once each, not repeatedly.

## 1. Landing page (`/`)

- [ ] Skip link: the first `Tab` offers "skip to main content", and it works.
- [ ] Headings (`VO+U` or `H`) give a sensible outline: one `h1`, then sections.
- [ ] "Run the demo" is reachable and named clearly.

## 2. Lab (`/lab?autostart=1`)

- [ ] The scenario picker and the Resilient / Faulty toggle announce their name and state ("pressed" or "not pressed").
- [ ] The "What is happening" narration is a labelled region and reads in a sensible order.
- [ ] Run controls (start, pause, step, speed) are named and announce their state. The progress bar reports a percentage.
- [ ] Pipeline diagram: the diagram has a text description. Tab through the six service buttons; opening one shows details, and "Close details" returns focus somewhere sensible.
- [ ] Fault timeline: the fault bars are text-labelled, not colour-only.
- [ ] Event stream: filter inputs are labelled. In the table, each "Trace" button says which event it traces.

## 3. Results (`/experiments/<id>` after a run completes)

- [ ] The verdict ("All applicable assertions passed" or "Assertions failed") is read as text, not only shown by colour or a symbol.
- [ ] Assertions list: each shows pass/fail/not applicable as text.
- [ ] Comparison table: baseline vs this run vs the other mode. Moving across a row, do you hear which column each value belongs to?
- [ ] Recovery table and event table: same question.
- [ ] Charts: is there a text alternative, or at least a heading that explains what they show?

## 4. Forms (`/experiments/new`, `/settings`)

- [ ] Every field has a spoken label. Validation errors are announced when they appear.
- [ ] The fault injector announces the selected fault type and its help text.

## Reporting

Comment on [issue #5](https://github.com/batool-fariha/carechaos/issues/5) with:

1. Screen reader, browser, OS.
2. For each problem: the page, the control, what you heard, and what you expected.
3. Anything that was confusing even though it was technically correct.

Fixes for confirmed problems are small and mostly mechanical (captions, `scope`, live-region wording). A good first PR is to add `<caption className="sr-only">` and `scope="col"` to the tables.
