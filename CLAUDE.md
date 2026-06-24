# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Fallout 76 DPS (Damage Per Second) calculator web application. It calculates damage dealt between players and enemies using game data from both Live servers and PTS (Public Test Server).

## Development Commands

- `pnpm dev` - Start development server with HMR
- `pnpm build` - Type check and build for production
- `pnpm build:gh-pages` - Build for GitHub Pages deployment (sets NODE_ENV=production)
- `pnpm lint` - Run ESLint
- `pnpm preview` - Preview production build locally

This project uses **pnpm** as the package manager, not npm or yarn.

## Architecture Overview

### Data Layer Architecture

The codebase maintains two parallel datasets:
- **Live data** (`src/data/live/`) - Current production game data
- **PTS data** (`src/data/pts/`) - Public Test Server data for upcoming patches

Data is organized by category:
- `perks.ts` - All perk cards and their stat modifications
- `enemies.ts` - Enemy types, mutations, and legendary modifiers
- `weapons.ts` - Weapon definitions with base stats
- `armor.ts` - Body armor pieces
- `power-armor.ts` - Power armor chassis and pieces
- `curvetables/` - Game curve tables for damage calculations

The `src/data/index.ts` file provides mode-aware accessors (e.g., `getPerks(mode)`, `getEnemies(mode)`) that return the appropriate dataset based on the current game mode.

### Game Mode System

The `useGameMode` hook provides context for switching between 'live' and 'pts' modes. The default mode is 'live'. All data access should go through the mode-aware functions in `src/data/index.ts` to ensure the correct dataset is used.

### Damage Calculation Flow

1. **Configuration:** Player and Enemy configs are managed in `App.tsx` state
2. **Calculation:** The `useDamageCalc` hook wraps `calculateDamage()` from `src/lib/damage-formulas.ts`
3. **Formulas:** All damage formulas live in `src/lib/damage-formulas.ts`, including:
   - `calculateOutgoingDamage()` - Player damage to enemy
   - `calculateIncomingDamage()` - Enemy damage to player (currently returns defaults — MVP dormant)
   - `calculateDamage()` - Top-level dispatch used by `useDamageCalc`
   - `calculateDamageResistMult()` - DR/ER mitigation multiplier
   - `getPerkStatTotal()` - Extract stat bonuses from perks

The damage calculation considers:
- Base weapon damage and fire rate
- Perk card bonuses (damage, resistance, etc.)
- Enemy resistances and legendary modifiers
- Weakpoint and VATS critical multipliers

### Component Structure

- `src/components/layout/` - Page layout components (Header, ThreeColumnLayout)
- `src/components/player/` - Player configuration UI (PlayerColumn)
- `src/components/enemy/` - Enemy configuration UI (EnemyColumn)
- `src/components/stats/` - Damage statistics display (DamageStatsColumn)
- `src/components/ui/` - Reusable UI components (Radix UI wrappers with Tailwind styling)

### Nukes & Dragons Integration

`src/lib/nukes-dragons.ts` handles parsing Nukes & Dragons build URLs. The `BuildUrlInput` component allows users to import builds, which populates the player's perk loadout.

## Type System

All types are centralized in `src/types/index.ts`:
- `GameMode` - 'live' | 'pts'
- `PlayerConfig` - Complete player build (perks, weapon, armor, mutations, consumables)
- `EnemyConfig` - Enemy selection and modifiers
- `DamageStats` - Calculated damage output (DPS, torso, weakpoint, VATS crit)
- `Perk`, `Weapon`, `Enemy`, etc. - Game entity definitions

## Import Path Alias

The project uses `@` as an alias for `src/`:
```typescript
import { calculateDamage } from '@/lib/damage-formulas';
import { useGameMode } from '@/hooks/useGameMode';
```

## Build Configuration

- Uses **rolldown-vite** (experimental Rolldown bundler) instead of standard Vite
- TypeScript with strict mode
- Tailwind CSS v4 with @tailwindcss/vite plugin
- Base URL is `/dps-76/` for production builds (GitHub Pages) and `/` for dev

## Adding New Game Data

When adding perks, weapons, enemies, or other game data:

1. Add to both `src/data/live/` and `src/data/pts/` (or just PTS if it's new)
2. Ensure the ID matches the PerkId enum if adding perks (`src/data/perk-ids.ts`)
3. For perks, define `statsModified` to specify which stats the perk affects
4. Stats are defined in `src/data/stats.ts` (e.g., `Stat.DamageResist`, `Stat.WeaponDamage`)
5. Test with both game modes to ensure data is accessible
