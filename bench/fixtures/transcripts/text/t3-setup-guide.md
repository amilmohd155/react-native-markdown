# Setting up a TypeScript monorepo

Below is a minimal but **production-ready** layout using Yarn workspaces.

## Layout

```
repo/
  package.json
  tsconfig.base.json
  packages/
    core/
    app/
```

## Root configuration

`package.json`:

```json
{
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "yarn workspaces foreach -pt run build",
    "typecheck": "tsc -b"
  }
}
```

Then a shared `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "composite": true,
    "moduleResolution": "bundler"
  }
}
```

## Common pitfalls

1. **Missing `references`**: `tsc -b` skips packages that are not referenced
2. **Hoisting surprises**: two copies of `react` cause the "invalid hook call" error
3. **Stale builds**: delete `*.tsbuildinfo` when paths change

### Quick comparison

| Tool | Speed | Setup effort |
|---|---|---|
| Yarn workspaces | Good | Low |
| Turborepo | Great | Medium |
| Nx | Great | High |

For most small teams, plain workspaces plus `tsc -b` is enough. Read the [Yarn workspaces guide](https://yarnpkg.com/features/workspaces) before adding anything else.

> Tip: keep `core` free of platform imports so it stays easy to test.

Want me to add ESLint and a release workflow next?
