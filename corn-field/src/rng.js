// A seeded random number generator, so a field can be the same field twice.
//
// mulberry32: thirty-two bits of state and four multiplies. The point is not
// quality — nothing here is cryptography and nobody is counting the bias in a
// stalk's lean. The point is that the same seed gives the same sequence, which
// is the whole mechanism behind a maze you can walk back into.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed() {
  return (Math.random() * 4294967296) >>> 0;
}
