# Architecture Guidelines

## Feature module conventions

All new business functionality must be implemented under `src/features/<feature>`. Existing modules remain supported, but any new work should follow the structure below.

### Standard feature structure

```
src/features/<feature>/
  routes.ts
  controller.ts
  service.ts
  entity/
  dto/
  types.ts
  index.ts
```

Notes:
- `routes.ts` should export the route definitions for the feature.
- `controller.ts` handles request/response orchestration.
- `service.ts` encapsulates core business logic.
- `entity/` holds ORM entities or persistence models scoped to the feature.
- `dto/` contains request/response DTOs.
- `types.ts` is for feature-specific shared types.
- `index.ts` should re-export the public surface (routes, services, types) of the feature.

### Route registration

Add feature routes to `src/features/index.ts`, which is imported by `src/routes/index.ts` to keep backward compatibility with existing route definitions.
