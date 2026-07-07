import * as React from 'react';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupButton } from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import { LinkIcon, CheckIcon, XIcon, Loader2Icon } from 'lucide-react';
import { parseBuildUrl, isValidNukesDragonsUrl, parseBuildName, parseSpecialFromUrl, type ParsedSpecial } from '@/lib/nukes-dragons';
import type { ParsedPerk } from '@/types';

interface BuildUrlInputProps {
  onPerksLoaded: (perks: ParsedPerk[], buildName: string | null, special: ParsedSpecial | null) => void;
}

type ParseState = 'idle' | 'parsing' | 'success' | 'error';

export function BuildUrlInput({ onPerksLoaded }: BuildUrlInputProps) {
  const [url, setUrl] = React.useState('');
  const [parseState, setParseState] = React.useState<ParseState>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const [lastParsedUrl, setLastParsedUrl] = React.useState<string | null>(null);

  const handleParse = React.useCallback(() => {
    if (!url.trim()) { setError('Please enter a URL'); setParseState('error'); return; }
    if (!isValidNukesDragonsUrl(url)) { setError('Invalid Nukes & Dragons URL'); setParseState('error'); return; }
    setParseState('parsing'); setError(null);
    setTimeout(() => {
      try {
        const perks = parseBuildUrl(url);
        const buildName = parseBuildName(url);
        if (perks.length === 0) { setError('No perks found in URL'); setParseState('error'); return; }
        onPerksLoaded(perks, buildName, parseSpecialFromUrl(url));
        setParseState('success'); setLastParsedUrl(url);
        setTimeout(() => setParseState('idle'), 2000);
      } catch { setError('Failed to parse build URL'); setParseState('error'); }
    }, 300);
  }, [url, onPerksLoaded]);

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleParse(); };

  const getStatusIcon = () => {
    switch (parseState) {
      case 'parsing': return <Loader2Icon className="size-4 animate-spin" />;
      case 'success': return <CheckIcon className="size-4 text-green-500" />;
      case 'error': return <XIcon className="size-4 text-red-500" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="build-url">Nukes & Dragons Build URL</Label>
        {lastParsedUrl && parseState !== 'error' && <span className="text-muted-foreground text-xs">Build loaded successfully</span>}
      </div>
      <InputGroup>
        <InputGroupAddon><LinkIcon className="size-4" /></InputGroupAddon>
        <InputGroupInput id="build-url" type="url" placeholder="https://nukesdragons.com/fallout-76/character?..." value={url}
          onChange={(e) => { setUrl(e.target.value); if (parseState === 'error') { setParseState('idle'); setError(null); } }}
          onKeyDown={handleKeyDown} aria-invalid={parseState === 'error'} />
        <InputGroupAddon align="inline-end">
          {getStatusIcon()}
          <InputGroupButton onClick={handleParse} disabled={parseState === 'parsing'}>Import</InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
    </div>
  );
}
