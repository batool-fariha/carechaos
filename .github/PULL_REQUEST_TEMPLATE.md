## What and why

## Checklist
- [ ] `npm run typecheck && npm test` pass
- [ ] `npm run scenarios -- --mode both` still shows resilient passing and the weak mode failing only the intended assertions
- [ ] Engine changes stay deterministic (no `Math.random()` / `Date.now()` in `src/engine`)
- [ ] No real patient data, and no claims of clinical safety or compliance
- [ ] Docs updated if behavior or the report schema changed
