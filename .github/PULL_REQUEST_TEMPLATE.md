## Summary

<!-- One or two sentences. What does this PR do and why? -->

## Type of Change

- [ ] 🐛 Bug fix (non-breaking change that fixes an issue)
- [ ] ✨ New feature (non-breaking change that adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to change)
- [ ] 📚 Documentation only
- [ ] 🛠 Build / CI / tooling
- [ ] ♻️ Refactor (no functional change)
- [ ] ⚡ Performance improvement
- [ ] 🧪 Test addition / improvement
- [ ] 🌐 i18n / translation

## Related Issues

Fixes #<issue_number>
Relates to #<issue_number>

## What changed?

<!-- Bullet list of the substantive changes. Not "updated file X". -->
-

## How was it tested?

- [ ] `bun run typecheck` passes
- [ ] `bun test` passes (add new tests for new functionality)
- [ ] Manual testing: ___

### Test plan (for the reviewer)

<!-- Concrete steps to verify the change. -->

1.
2.
3.

## Screenshots / Output

<!-- If relevant: before/after, terminal output, or a GIF. -->

<details>
<summary>Click to expand</summary>

```

```

</details>

## Checklist

- [ ] My code follows the project's [coding style](./AGENTS.md#coding-style--conventions)
- [ ] I have added tests that prove my fix/feature works
- [ ] New and existing unit tests pass locally
- [ ] I have updated relevant documentation (`docs/`, `README.md`, `CHANGELOG.md`)
- [ ] I have added the entry to `CHANGELOG.md` (Unreleased section)
- [ ] My changes generate no new warnings
- [ ] Any dependent changes have been merged and published
- [ ] I have read [CONTRIBUTING.md](./CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)

## For New Skills / Plugins

- [ ] SKILL.md has YAML frontmatter (`name`, `description`)
- [ ] SKILL.md has "When to use" and "Limitations" sections
- [ ] Plugin manifest (`upup.plugin.json`) declares runtime and capabilities
- [ ] Listed in [docs/skills.md](./docs/skills.md) or [docs/plugins.md](./docs/plugins.md)
- [ ] i18n strings added to both `en` and `zh-CN` in `src/i18n/strings.ts`
- [ ] At least 1 test added

## Risk Assessment

- **Blast radius**: (low / medium / high) — what could break if this is buggy?
- **Rollback plan**: (revert commit / feature flag / data migration?)
- **Performance impact**: (none / minor / measurable)

---

<!--
Maintainer review checklist (DO NOT EDIT):
- [ ] CI green
- [ ] Code review by 1+ maintainer
- [ ] Documentation reviewed
- [ ] CHANGELOG entry verified
- [ ] Squash merge
-->
