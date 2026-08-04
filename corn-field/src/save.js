// Where the field is written down between visits.
//
// localStorage rather than sessionStorage: a session ends when the tab does,
// and the whole promise here is that the corn is still standing where you left
// it tomorrow. It goes when the browser's site data goes, and not before.
//
// Every call is wrapped, because storage is allowed to say no — Safari in
// private mode throws on write, and some people turn it off altogether. A
// field that cannot be saved is still a field; it just forgets. Nothing in
// here may ever be the reason the page fails to start.

const KEY = 'cornfield.v1';

function num(v) {
  return (typeof v === 'number' && isFinite(v)) ? v : null;
}

export function load() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    // A seed is the one thing the rest of this is meaningless without. No seed
    // — half-written storage, a hand-edited key, a save from some older shape
    // of this file — reads as "no save" rather than as a crash on frame one.
    if (!s || typeof s.seed !== 'number' || !isFinite(s.seed)) return null;

    // Everything else is optional and separately distrusted. A position that
    // came back as undefined would put the camera at NaN and quietly delete
    // the world, so anything that is not a real number is simply not restored
    // and you start at the mouth of the maze instead. A field you come back to
    // slightly wrong is recoverable; a blank screen is not.
    const x = num(s.x), z = num(s.z);
    return {
      seed: s.seed >>> 0,
      x: x, z: z,
      hasSpawn: x !== null && z !== null,
      yaw: num(s.yaw),
      pitch: num(s.pitch),
      elapsed: num(s.elapsed) || 0,
      found: Array.isArray(s.found) ? s.found.filter(function (i) {
        return typeof i === 'number' && i >= 0;
      }) : [],
      walked: !!s.walked
    };
  } catch (e) {
    return null;
  }
}

export function save(state) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) { /* out of quota, or storage denied — walk on */ }
}

export function clear() {
  try {
    window.localStorage.removeItem(KEY);
  } catch (e) { /* nothing to do about it, and nothing that depends on it */ }
}
