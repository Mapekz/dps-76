import * as React from 'react';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupButton } from '@/components/ui/input-group';
import { LinkIcon, CheckIcon, XIcon, Loader2Icon } from 'lucide-react';
import { parseBuildUrl, isValidNukesDragonsUrl, parseBuildName, parseSpecialFromUrl } from '@/lib/nukes-dragons';
import { useBuildDispatch } from '@/state/BuildProvider';

type ParseState = 'idle' | 'parsing' | 'success' | 'error';

/**
 * Nukes & Dragons import. Importing REPLACES the perk loadout and merges the
 * URL's s= SPECIAL (clamped to 1–15); weapon/mutation/consumable state is
 * untouched (N&D URLs don't carry it in a decoded form yet).
 */
export function BuildUrlInput() {
  const dispatch = useBuildDispatch();
  const [url, setUrl] = React.useState('');
  const [parseState, setParseState] = React.useState<ParseState>('idle');
  const [error, setError] = React.useState<string | null>(null);

  const handleParse = React.useCallback(() => {
    if (!url.trim()) { setError('Paste a Nukes & Dragons build link first'); setParseState('error'); return; }
    if (!isValidNukesDragonsUrl(url)) { setError('That is not a Nukes & Dragons build link'); setParseState('error'); return; }
    setParseState('parsing'); setError(null);
    setTimeout(() => {
      try {
        const perks = parseBuildUrl(url);
        const buildName = parseBuildName(url);
        if (perks.length === 0) { setError('No perks found in that link'); setParseState('error'); return; }
        dispatch({ type: 'build/importNd', perks, name: buildName, special: parseSpecialFromUrl(url) });
        setParseState('success');
        setTimeout(() => setParseState('idle'), 2000);
      } catch { setError('Could not read that build link'); setParseState('error'); }
    }, 300);
  }, [url, dispatch]);

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleParse(); };

  const getStatusIcon = () => {
    switch (parseState) {
      case 'parsing': return <Loader2Icon className="size-4 animate-spin" />;
      case 'success': return <CheckIcon className="text-positive size-4" />;
      case 'error': return <XIcon className="text-negative size-4" />;
      default: return null;
    }
  };

  return (
    <div className="min-w-0 flex-1">
      <InputGroup>
        <InputGroupAddon><LinkIcon className="size-4" /></InputGroupAddon>
        <InputGroupInput
          id="build-url"
          type="url"
          placeholder="Paste a Nukes & Dragons build link…"
          aria-label="Nukes & Dragons build URL"
          value={url}
          onChange={(e) => { setUrl(e.target.value); if (parseState === 'error') { setParseState('idle'); setError(null); } }}
          onKeyDown={handleKeyDown}
          aria-invalid={parseState === 'error'}
        />
        <InputGroupAddon align="inline-end">
          {getStatusIcon()}
          <InputGroupButton onClick={handleParse} disabled={parseState === 'parsing'}>Import build</InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {error && <p className="text-negative mt-1 text-xs" role="alert">{error}</p>}
    </div>
  );
}
