/**
 * VS ENEMIES — full-width sortable table (effective DPS, % retained, TTK per
 * curated enemy). Ships with the enemy-extraction phase; the flag stays off
 * until real ESM-extracted resistances land.
 */
const ENEMY_TABLE_ENABLED = false;

export function EnemyTableSection() {
  if (!ENEMY_TABLE_ENABLED) return null;
  return (
    <section className="container mx-auto px-4 pb-8">
      <h2 className="font-condensed text-muted-foreground mb-2 text-sm font-semibold uppercase tracking-[0.14em]">
        Vs enemies
      </h2>
      {/* EnemyTable lands here (phase 3). */}
    </section>
  );
}
