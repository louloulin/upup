# Tasks: Remove Dead `src/tui/` Abstraction Layer

- [ ] 1. Stage the deletion of 46 dead files in `src/tui/` (keep `state/{input-state,store,store.test}.ts` + `utils/cursor.ts`)
- [ ] 2. Run `bun run typecheck` and confirm 0 errors
- [ ] 3. Run `bun test` and confirm totals match v6 (4447 pass, 18 pre-existing fails)
- [ ] 4. Re-run the dead-code audit `rg "from ['\"]\.{1,2}/.*tui/" src/ packages/ | grep -v '^src/tui/'` and confirm the only remaining hits are the 4 alive keep-set references
- [ ] 5. Commit the deletion in 1 atomic commit
- [ ] 6. Archive the change via `openspec archive remove-tui-dead-abstraction --yes`
