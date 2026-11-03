# Vendored anti-slop

Source: [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop), via the
`install-anti-slop` skill's `assets/anti-slop/` directory.

Upstream commit: unknown. The skill was installed with the `skills` CLI, which
records a content hash, not a commit. The hash in `skills-lock.json` for
`install-anti-slop` is
`1b9b5d3c0d9e0ef8dd7631f4d637e66b62a73e34dceaf4ae07c0d3de376fd7d7`, from
`.agents/skills/install-anti-slop`, added in local commit `55dd88b`. These files
are an unmodified copy of that skill's assets as of that commit.

Installed paths:

- `tools/oxlint/anti-slop/index.ts`: generic plugin, registered as `anti-slop`.
- `tools/oxlint/anti-slop/effect/index.ts`: Effect plugin, registered as
  `anti-slop-effect` because `effect` is a direct dependency.
- `tools/oxlint/anti-slop/vendor/eslint-stylistic/`: vendored rule with its own
  `LICENSE` and `UPSTREAM.md`.

Configuration lives in `.oxlintrc.json`. Every generic and Effect rule is
enabled at `error`, along with the native `oxc/no-accumulating-spread`.

Local deviations: none.
