import type { GameState, Outcome, Owner } from './types';

function isEnemy(owner: Owner): boolean {
  return owner === 'enemy1' || owner === 'enemy2' || owner === 'enemy3';
}

/** GDD §2.4: won when no enemy tower or unit in transit remains; lost when the player has none of those. */
export function getOutcome(state: GameState): Outcome {
  let playerHas = false;
  let enemyHas = false;
  for (const id in state.towers) {
    const owner = state.towers[id]!.owner;
    if (owner === 'player') playerHas = true;
    else if (isEnemy(owner)) enemyHas = true;
  }
  for (const u of state.units) {
    if (u.owner === 'player') playerHas = true;
    else if (isEnemy(u.owner)) enemyHas = true;
  }
  if (!playerHas) return 'lost';
  if (!enemyHas) return 'won';
  return 'playing';
}
