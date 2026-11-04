# CLI and GitHub Action

Run experiments against your own pipeline profile in CI and fail the build when an assertion breaks. Everything is simulation: no network, no real data.

```bash
npm run carechaos -- <command> [options]
```

| Command | Purpose |
|---|---|
| `run [files...]` | Run experiment files ([format](pipeline-file.md)). Also `--scenario id,id` for built-ins |
| `validate <files...>` | Check files without running them |
| `init [file]` | Write an example file (default `carechaos.json`) |
| `list` | List built-in scenarios |

## `run` options

| Option | Meaning |
|---|---|
| `--mode resilient\|faulty\|both` | Which implementation to simulate (default `resilient`) |
| `--seed N` | Override the seed |
| `--out DIR` | Write a JSON and a Markdown report per run ([schema](report-schema.md)) |
| `--junit FILE` | Write JUnit XML, one test case per assertion |
| `--summary FILE` | Append a Markdown summary (use `$GITHUB_STEP_SUMMARY`) |
| `--strict` | Weak-mode (`faulty`) failures also fail the command |

**Exit codes:** `0` all counted runs passed, `1` an assertion failed, `2` bad usage or an invalid file.

By default only **resilient** runs can fail the command. The weak mode is a reference implementation used for comparison, so `--mode both` lets you see the contrast without breaking your build.

## Example

```bash
npm run carechaos -- init
npm run carechaos -- validate carechaos.json
npm run carechaos -- run carechaos.json examples/game-day.json --mode both --out reports --junit reports/junit.xml
```

```
PASS  Alerts survive a delivery outage on my pipeline  [resilient]  seed 42  assertions 4/4
FAIL  Alerts survive a delivery outage on my pipeline  [faulty]  seed 42  assertions 2/4
        ✗ Queued alerts are delivered after recovery
          0/11 completed
```

## GitHub Action

```yaml
name: Resilience
on: [push, pull_request]
jobs:
  chaos:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: batool-fariha/carechaos@main
        with:
          files: carechaos.json          # space-separated for several files
          mode: resilient                # resilient | faulty | both
          strict: "false"
          junit: carechaos-junit.xml
```

The action writes a results table and each failed assertion to the job summary, and a JUnit file you can feed to any test reporter. Pin a tag (for example `@v0.1.0`) once you rely on it.

## In your own repository without the Action

```bash
npx --yes tsx path/to/carechaos/scripts/carechaos.ts run carechaos.json
```
