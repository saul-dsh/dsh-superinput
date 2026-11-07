# dsh-power-picker

[![CI](https://github.com/saul-dsh/dsh-power-picker/actions/workflows/ci.yml/badge.svg)](https://github.com/saul-dsh/dsh-power-picker/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A **Codex-style model & reasoning-effort picker** for DeepSeek Harness (dsh): the composer's model seat is reshaped into the OpenAI Codex desktop form — a gradient power slider for reasoning effort, twinkling stars, a big white knob, and a provider-grouped model list. The look is Codex; the data flows entirely through dsh's official session model directory.

![Model and reasoning-effort panel](docs/panel.png)

## How it works

1. `conversation.input.model` is a **single slot**; dsh renders only the lowest-priority registration. This plugin registers at `priority: -1` and **legitimately shadows** the built-in picker (source: ui-slots — "register at a different priority to shadow it (lowest renders)").
2. Catalog data comes from `ctx.modelDirectories` (the same service the built-in `ui-model-selection` uses): `subscribe/getSnapshot` for rendering, `directory.select({ provider, model, reasoningEffort? })` for switching. Effort ladders (`catalog.reasoningFor(model)`) are **dynamic** per model from the Host's model catalog.
3. The server half is a thin `GET /api/dsh-power-picker/enabled` switch: set `enabled: false` to bring the built-in picker back without uninstalling.

## Install

```sh
dsh plugin --profile web add /absolute/path/to/dsh-power-picker
dsh plugin --profile desktop add /absolute/path/to/dsh-power-picker
```

Restart dsh.

## Configuration

| Key | Default | Description |
|-----|---------|-------------|
| `enabled` | `true` | set `false` to restore the built-in picker (plugin stays installed but stops shadowing) |

## Known limits

- Shadowing is global: subagent sessions (which have no model selection anyway) render no seat.
- Crash fallback: the seat goes empty if the panel throws (ErrorBoundary); flip `enabled` to `false` and restart to recover.
- dsh upgrades that rename model-directory snapshot fields may empty the list — the first snapshot's keys are logged to the console (`[dsh-power-picker] snapshot keys:`); adjust `readSnapshotShape` accordingly.
- Visuals are reverse-engineered from OpenAI.Codex desktop 26.1021; the interaction contract follows the open-source [openai/codex](https://github.com/openai/codex) CLI model/effort semantics.

## License

[MIT](LICENSE)
