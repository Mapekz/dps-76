import { nukesDragonsPerks } from '@/data/nukesdragons';
import type { ParsedPerk, PerkLoadout } from '@/types';

/**
 * Parse a Nukes & Dragons build URL to extract perks.
 */
export function parseBuildUrl(url: string): ParsedPerk[] {
  try {
    const urlObj = new URL(url);
    const params = new URLSearchParams(urlObj.search);
    const perkString = params.get('p') ?? '';
    return parsePerkString(perkString);
  } catch {
    return parsePerkString(url);
  }
}

export function parsePerkString(perkString: string): ParsedPerk[] {
  const perks: ParsedPerk[] = [];
  for (let i = 0; i + 2 < perkString.length; i += 3) {
    const key = perkString.slice(i, i + 2);
    const rankChar = perkString[i + 2];
    const rank = parseInt(rankChar, 10);
    const name = nukesDragonsPerks[key as keyof typeof nukesDragonsPerks];
    if (name && !isNaN(rank) && rank >= 1 && rank <= 5) {
      perks.push({ key, name, rank });
    }
  }
  return perks;
}

export function parsedPerksToLoadout(parsedPerks: ParsedPerk[]): PerkLoadout[] {
  return parsedPerks.map((perk) => ({ perkId: perk.key, rank: perk.rank }));
}

export function parseBuildName(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const params = new URLSearchParams(urlObj.search);
    const name = params.get('n');
    return name ? decodeURIComponent(name) : null;
  } catch {
    return null;
  }
}

export function isValidNukesDragonsUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname === 'nukesdragons.com' && urlObj.pathname.includes('/fallout-76/character');
  } catch {
    return false;
  }
}

export function getPerkName(key: string): string | undefined {
  return nukesDragonsPerks[key as keyof typeof nukesDragonsPerks];
}
