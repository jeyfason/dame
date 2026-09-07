# Foundations (override)

Per MASTER.md logic, this page file overrides `design-system/DAME/MASTER.md`.

- **Tokens source of truth:** `app/dame-tokens.css` (`--dame-*` vars). Do not restate or diverge from it.
- **MASTER.md palette** (purple/rose) is advisory for future work, not current tokens.
- Components must reference only `var(--dame-*)`; raw hex lives solely in `app/dame-tokens.css`.
