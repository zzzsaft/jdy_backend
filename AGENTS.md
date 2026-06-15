# Agent Notes

- Keep `entity` directories limited to TypeORM entity modules and entity barrel exports only.
- Do not put tests, scripts, fixtures, generated artifacts, `.DS_Store`, or other side-effectful files under any `entity` directory; TypeORM imports entity globs during data-source initialization.
- Place tests under `test/` or the relevant feature test location outside `entity` directories.
