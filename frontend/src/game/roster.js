// LocalStorage-backed forge roster. Handles quota/corruption gracefully:
// bad entries are dropped; a corrupt blob returns an empty list.

const KEY = 'aibrawl.forge.roster.v1';
const CAP = 50;

function isValidFighterData(f) {
  if (!f || typeof f !== 'object') return false;
  if (typeof f.id !== 'string' || typeof f.name !== 'string') return false;
  if (!f.stats || typeof f.stats.hp !== 'number' || typeof f.stats.speed !== 'number' ||
      typeof f.stats.power !== 'number' || typeof f.stats.defense !== 'number') return false;
  if (!f.passive || typeof f.passive.type !== 'string' || typeof f.passive.value !== 'number') return false;
  if (!f.special || typeof f.special.type !== 'string' ||
      typeof f.special.damage !== 'number' || typeof f.special.cooldown !== 'number') return false;
  if (!f.visual || typeof f.visual.primaryColor !== 'string' ||
      typeof f.visual.secondaryColor !== 'string') return false;
  return true;
}

export function loadRoster() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidFighterData);
  } catch (e) {
    console.warn('[forge-roster] load failed, resetting:', e);
    return [];
  }
}

export function saveRoster(list) {
  try {
    const clean = (Array.isArray(list) ? list : []).filter(isValidFighterData).slice(0, CAP);
    localStorage.setItem(KEY, JSON.stringify(clean));
    return clean;
  } catch (e) {
    console.warn('[forge-roster] save failed:', e);
    return loadRoster();
  }
}

export function addFighter(fd) {
  if (!isValidFighterData(fd)) return loadRoster();
  const list = loadRoster();
  // Prepend newest; drop any prior entry with same id
  return saveRoster([fd, ...list.filter(f => f.id !== fd.id)]);
}

export function removeFighter(id) {
  return saveRoster(loadRoster().filter(f => f.id !== id));
}
