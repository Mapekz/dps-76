import * as React from 'react';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupButton,
} from '@/components/ui/input-group';
import { LinkIcon, CheckIcon, XIcon, Loader2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  parseBuildUrl,
  isValidNukesDragonsUrl,
  parseBuildName,
  parseSpecialFromUrl,
  parsedPerksToLoadout,
  isLegendaryPerkKey,
  type ParsedSpecial,
} from '@/lib/nukes-dragons';
import type { ParsedPerk } from '@/types';
import { equippedRaceLock } from '@/data/perk-race';
import { useGameMode } from '@/hooks/useGameMode';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';
import type { BuildState } from '@/state/build-reducer';

type ParseState = 'idle' | 'parsing' | 'success' | 'error';

interface PendingImport {
  perks: ParsedPerk[];
  name: string | null;
  special: ParsedSpecial | null;
  /** The race the link's own perks lock to, or null when it carries none. */
  locked: 'human' | 'ghoul' | null;
  /** The link mixes human-only and ghoul-only perks — no single race keeps everything. */
  conflict: boolean;
  /**
   * Both snapshotted at parse time (not re-read at dialog-render time) so
   * the confirm copy can't drift from what was actually true when the user
   * clicked Import.
   */
  hasExistingBuild: boolean;
  raceChanges: boolean;
  /**
   * `locked !== null ? locked === 'ghoul' : current` — the same fallback the
   * immediate-import path already used. Precomputed here so the dialog's
   * confirm button doesn't have to re-derive it.
   */
  resolvedIsGhoul: boolean;
}

/** What `build/importNd` actually overwrites (build-reducer.ts) — weapon/OMOD/mutation/consumable state is untouched. */
const REPLACES_CLAUSE = 'Importing replaces your perks and SPECIAL allocation';

/**
 * Nukes & Dragons import. Importing REPLACES the perk loadout AND race
 * together, and merges the URL's s= SPECIAL (clamped to 1–15); weapon/
 * mutation/consumable state is untouched (N&D URLs don't carry it in a
 * decoded form yet). Imports into an empty build with no race conflict apply
 * immediately; anything with something to lose — an existing perk loadout,
 * a race change, or an invalid mixed-race link — confirms first, with copy
 * naming the actual scope (perks + SPECIAL, optionally also race) rather
 * than only ever mentioning race. Same confirm-dialog pattern as the Race
 * toggle (SpecialLoadoutSection.tsx).
 *
 * Imports are undoable: every commit path snapshots the whole pre-import
 * `BuildState` first, and an inline "Undo" affordance (mirroring the error
 * message's placement/style) restores it via `build/hydrate`.
 */
export function BuildUrlInput() {
  const { mode } = useGameMode();
  const build = useBuild();
  const { player } = build;
  const dispatch = useBuildDispatch();
  const [url, setUrl] = React.useState('');
  const [parseState, setParseState] = React.useState<ParseState>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<PendingImport | null>(null);
  // The whole-state snapshot from right before the most recent import commit
  // — `null` means there's nothing to undo. `build/importNd` is a single,
  // wholesale-return reducer case (build-reducer.ts), so restoring via
  // `build/hydrate` (already used by usePersistence's boot hydration, and
  // pinned idempotent by build-reducer.test.ts) is a clean full revert, not
  // a partial patch. Clicking Undo always means "put back whatever was here
  // right before THIS import" — even if the user tweaked the build further
  // afterward, which is the correct undo semantics, not a bug to guard.
  const [preImportState, setPreImportState] = React.useState<BuildState | null>(null);

  // `runImport` intentionally does NOT depend on `build` (which changes on
  // every keystroke elsewhere in the app) — a ref keeps the snapshot fresh
  // without recreating the callback (and therefore `handleParse`, which
  // depends on it) on every unrelated state change. `runImport` is called
  // from JSX onClick handlers and from a setTimeout inside `handleParse`'s
  // useCallback — neither is an Effect, so `useEffectEvent` (which may only
  // be called from an Effect or another Effect Event in the same component)
  // isn't applicable here; the write instead moves into a dep-less effect
  // (runs after every commit) so the compiler can prove render stays pure.
  const buildRef = React.useRef(build);
  React.useEffect(() => {
    buildRef.current = build;
  });

  const runImport = React.useCallback(
    (imp: PendingImport, isGhoul: boolean) => {
      setPreImportState(buildRef.current);
      dispatch({
        type: 'build/importNd',
        perks: imp.perks,
        name: imp.name,
        special: imp.special,
        isGhoul,
      });
      setParseState('success');
      setTimeout(() => setParseState('idle'), 2000);
    },
    [dispatch],
  );

  const handleUndo = React.useCallback(() => {
    if (!preImportState) return;
    dispatch({ type: 'build/hydrate', state: preImportState });
    setPreImportState(null);
  }, [dispatch, preImportState]);

  const handleParse = React.useCallback(() => {
    if (!url.trim()) {
      setError('Paste a Nukes & Dragons build link first');
      setParseState('error');
      return;
    }
    if (!isValidNukesDragonsUrl(url)) {
      setError('That is not a Nukes & Dragons build link');
      setParseState('error');
      return;
    }
    setParseState('parsing');
    setError(null);
    setTimeout(() => {
      try {
        const perks = parseBuildUrl(url);
        const buildName = parseBuildName(url);
        if (perks.length === 0) {
          setError('No perks found in that link');
          setParseState('error');
          return;
        }
        const regular = parsedPerksToLoadout(perks.filter((p) => !isLegendaryPerkKey(p.key)));
        const legendary = parsedPerksToLoadout(perks.filter((p) => isLegendaryPerkKey(p.key)));
        const lock = equippedRaceLock(mode, regular, legendary);
        const current = player.conditions.isGhoul ?? false;
        const hasExistingBuild = player.perks.length > 0 || player.legendaryPerks.length > 0;
        const raceChanges = lock.locked !== null && (lock.locked === 'ghoul') !== current;
        const resolvedIsGhoul = lock.locked !== null ? lock.locked === 'ghoul' : current;
        const imp: PendingImport = {
          perks,
          name: buildName,
          special: parseSpecialFromUrl(url),
          locked: lock.locked,
          conflict: lock.conflict,
          hasExistingBuild,
          raceChanges,
          resolvedIsGhoul,
        };
        // Confirm first whenever there's something to lose (an existing perk
        // loadout) or the link forces a race decision.
        if (lock.conflict || raceChanges || hasExistingBuild) {
          setParseState('idle');
          setPending(imp);
        } else {
          runImport(imp, resolvedIsGhoul);
        }
      } catch {
        setError('Could not read that build link');
        setParseState('error');
      }
    }, 300);
  }, [
    url,
    mode,
    player.conditions.isGhoul,
    player.perks.length,
    player.legendaryPerks.length,
    runImport,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleParse();
  };

  const getStatusIcon = () => {
    switch (parseState) {
      case 'parsing':
        return <Loader2Icon className="size-4 animate-spin" />;
      case 'success':
        return <CheckIcon className="text-positive size-4" />;
      case 'error':
        return <XIcon className="text-negative size-4" />;
      default:
        return null;
    }
  };

  return (
    <div className="min-w-0 flex-1">
      <InputGroup>
        <InputGroupAddon>
          <LinkIcon className="size-4" />
        </InputGroupAddon>
        <InputGroupInput
          id="build-url"
          type="url"
          placeholder="Paste a Nukes & Dragons build link…"
          aria-label="Nukes & Dragons build URL"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (parseState === 'error') {
              setParseState('idle');
              setError(null);
            }
            // Same dismiss-on-edit rule as the error message below — typing
            // a new URL means the user has moved on from the last import.
            if (preImportState) setPreImportState(null);
          }}
          onKeyDown={handleKeyDown}
          aria-invalid={parseState === 'error'}
        />
        <InputGroupAddon align="inline-end">
          {getStatusIcon()}
          <InputGroupButton onClick={handleParse} disabled={parseState === 'parsing'}>
            Import build
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {error && (
        <p className="text-negative mt-1 text-xs" role="alert">
          {error}
        </p>
      )}
      {!error && preImportState && (
        <p className="text-muted-foreground mt-1 text-xs" role="status">
          Imported build.{' '}
          <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={handleUndo}>
            Undo
          </Button>
        </p>
      )}

      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pending?.conflict
                ? 'Invalid build link'
                : pending?.raceChanges
                  ? `Switch to ${pending.locked === 'ghoul' ? 'Ghoul' : 'Human'}?`
                  : 'Replace current build?'}
            </DialogTitle>
            <DialogDescription>
              {pending?.conflict
                ? `This link mixes human-only and ghoul-only perks. Pick a race to import as — the other race's perks are dropped.${pending.hasExistingBuild ? ` ${REPLACES_CLAUSE}.` : ''}`
                : pending?.raceChanges
                  ? `${REPLACES_CLAUSE} — and switches you to ${pending.locked === 'ghoul' ? 'Ghoul' : 'Human'}.`
                  : `${REPLACES_CLAUSE}.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPending(null)}>
              Cancel
            </Button>
            {pending?.conflict ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    runImport(pending, false);
                    setPending(null);
                  }}
                >
                  Import as Human
                </Button>
                <Button
                  type="button"
                  variant="default"
                  onClick={() => {
                    runImport(pending, true);
                    setPending(null);
                  }}
                >
                  Import as Ghoul
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="default"
                onClick={() => {
                  if (pending) runImport(pending, pending.resolvedIsGhoul);
                  setPending(null);
                }}
              >
                Import
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
