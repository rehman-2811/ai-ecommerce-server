# TODO

- [ ] Understand failing error source (Winston file transport tries to write to `logs/` on Vercel).
- [ ] Propose fix: make logger create `logs/` with `recursive: true` and gracefully fall back to console when filesystem is unavailable.
- [ ] Update `src/utils/logger.js` accordingly.
- [ ] Quick verification: run node server locally / start script to ensure logger no longer crashes when `logs/` is missing.
- [ ] (Optional) Re-deploy to Vercel and confirm endpoints return 200.

