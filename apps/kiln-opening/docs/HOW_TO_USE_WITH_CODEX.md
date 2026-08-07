# HOW_TO_USE_WITH_CODEX.md

## Option A — New repository (recommended)

1. Create a new GitHub repository, e.g. `kiln-opening-online`.
2. Unzip this handoff pack into the repository root.
3. Commit it:
   ```bash
   git add .
   git commit -m "Add Kiln Opening design and rules handoff"
   git push
   ```
4. Open the repository/folder in Codex.
5. Give Codex the contents of `prompts/01_engineering_design.md` as its first task.
6. Review the design before asking for implementation.

## Option B — Existing GitHub Pages repository

Copy:

- `AGENTS.md`
- `docs/`
- `data/`
- `assets/`
- `source_rulebook/`
- `prompts/`

into the repository root.

If the existing site already has production code, create a branch such as:

```bash
git checkout -b kiln-online-prototype
```

before Codex edits anything.

## Domain strategy

A clean deployment is:

- `example.com` — existing site / landing page
- `play.example.com` — Kiln Opening

or:

- `example.com/kiln/`

The static client can be hosted on GitHub Pages; realtime multiplayer requires the separate backend.

## What not to paste into Codex

Do not paste the entire raw ChatGPT transcript.

This handoff already captures:

- current authoritative rules;
- why rejected mechanics were rejected;
- current card values;
- art direction;
- multiplayer requirements;
- engineering constraints.

If a new design decision is made later, update `GAME_RULES.md` and/or `DESIGN_SPEC.md` in Git so the repository remains the long-term memory.
