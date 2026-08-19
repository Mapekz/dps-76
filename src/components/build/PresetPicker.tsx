import * as React from 'react';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SectionLabel } from '@/components/ui/typography';
import { BUILD_PRESETS, type BuildPreset } from '@/data/presets';
import { useGameMode } from '@/hooks/useGameMode';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';
import { createDefaultBuildState, type BuildState } from '@/state/build-reducer';

/** Plain structural comparison — every field here is JSON-serializable build data. */
function statesEqual(a: BuildState, b: BuildState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Preset benchmark-build picker (issue #1) — always-visible, NOT an
 * accordion section (mounted in BuildColumn between the header and
 * StatSummary). A preset is a one-shot loader, not a persistent mode: it
 * dispatches `build/hydrate` (the same bulk-load path usePersistence's boot
 * hydration and BuildUrlInput's N&D-undo use) and the app tracks no "active
 * preset" afterward — the user edits freely from there, same as after an
 * N&D import.
 *
 * Confirms first via the same Dialog pattern BuildUrlInput uses for its
 * "replace current build?" case, but only when loading would actually lose
 * something: skipped when the current build is still the untouched default
 * OR is already this exact preset (re-clicking the active preset, or
 * landing on a fresh page, is a no-op either way).
 */
export function PresetPicker() {
  const { mode } = useGameMode();
  const build = useBuild();
  const dispatch = useBuildDispatch();
  const [pending, setPending] = React.useState<BuildPreset | null>(null);

  const loadPreset = React.useCallback(
    (preset: BuildPreset) => {
      dispatch({ type: 'build/hydrate', state: preset.build(mode) });
    },
    [dispatch, mode],
  );

  const handleSelect = (preset: BuildPreset) => {
    const candidate = preset.build(mode);
    const isDefault = statesEqual(build, createDefaultBuildState());
    const isAlreadyLoaded = statesEqual(build, candidate);
    if (isDefault || isAlreadyLoaded) {
      dispatch({ type: 'build/hydrate', state: candidate });
      return;
    }
    setPending(preset);
  };

  return (
    <div className="mb-3">
      <SectionLabel className="mb-1.5">Preset</SectionLabel>
      <ButtonGroup className="w-full" aria-label="Load a preset build">
        {BUILD_PRESETS.map((preset) => (
          <Button
            key={preset.id}
            type="button"
            size="sm"
            variant="outline"
            className="flex-1"
            title={preset.description}
            onClick={() => handleSelect(preset)}
          >
            {preset.name}
          </Button>
        ))}
      </ButtonGroup>

      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replace current build?</DialogTitle>
            <DialogDescription>
              Loading "{pending?.name}" replaces your entire build — weapon, perks, SPECIAL, and
              conditions.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="default"
              onClick={() => {
                if (pending) loadPreset(pending);
                setPending(null);
              }}
            >
              Load preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
