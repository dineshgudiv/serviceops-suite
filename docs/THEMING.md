# Theming

## Where Tokens Live
- Core theme definitions live in `apps/web/src/lib/theme.ts`.
- Runtime token application is handled by `applyThemeSettings(...)`.
- Global semantic token consumption and shell styling live in `apps/web/src/app/globals.css`.

## What Is Tokenized
- Core semantic tokens:
  - `--bg`, `--bg2`, `--bg3`
  - `--fg`, `--muted`
  - `--card`, `--card-2`, `--card-fg`
  - `--border`
  - `--primary`, `--primary-fg`
  - `--accent`, `--accent-fg`
  - `--danger`, `--warning`, `--success`
  - `--sidebar-bg`, `--sidebar-fg`, `--sidebar-active`
  - `--ring`
  - `--shadow-strength`
  - `--radius-sm`, `--radius-md`, `--radius-lg`
  - `--density-scale`
  - `--font-scale`
  - `--chart-1` through `--chart-6`
- These tokens drive the app shell directly and also theme repeated page surfaces through centralized global overrides.

## Persistence
- Theme settings persist in `localStorage` under `ui.theme.studio`.
- `apps/web/src/app/layout.tsx` injects an SSR-safe bootstrap script that reads persisted settings before hydration.
- This prevents the app shell from flashing the wrong preset/mode on refresh.

## Adding A New Preset
1. Add a new key to `ThemePresetKey` in `apps/web/src/lib/theme.ts`.
2. Add the preset object to `themePresets` with both `dark` and `light` token sets.
3. Keep semantic meanings stable. Only change token values, not component logic.
4. The Theme Studio will pick it up automatically because it renders from `themePresets`.

## Real Surfaces Affected
- App shell:
  - header
  - sidebar
  - tabs
  - search
  - user chip
  - theme controls
- Shared surfaces:
  - cards/panels
  - buttons
  - inputs/selects/textareas
  - badges
  - focus rings
  - mobile drawer
- Data visualization:
  - chart palette tokens
  - dashboard donuts/bars
  - Recharts-based charts under `apps/web/src/components/serviceops`

## Notes
- Existing presets `Midnight`, `Ocean`, `Ember`, and `Forest` are preserved.
- Additional presets are defined centrally, not page-by-page.
- High-contrast and reduced-motion are real runtime settings, not UI-only toggles.
