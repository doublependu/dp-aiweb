import * as THREE from 'three';

/*───────────────────────────────── §0  CONFIG ─────────────────────────────────*/

export const CFG = {
  world:        2400,      // heightmap extent, metres
  hmRes:        1024,      // heightmap texels per side
  dataRes:      512,       // splat/mask texture
  sunElev:      13.5,      // degrees above horizon
  sunAzim:      292.0,     // degrees, 0=+Z(N) increasing toward +X(E)
  fov:          52,
  eyeHeight:    1.68,
  spawn:        { x:-46.5, z:92.1, heading:278.0, pitch:-4.0 },
  bridge:       { x:-195,  z:113 },
  shadowRes:    2048,
  // 210 m put the shadow horizon barely past the near trees.  480 m carries it
  // to the far bank; at 2304 texels that is 0.21 m/texel, and since the edge is
  // defined by the painterly wobble rather than by the filter width, the extra
  // coarseness is invisible while the reach more than doubles.
  shadowSpan:   480,
  windRTRes:    256,
  windRTSpan:   440,       // metres covered by the wind render target
  cloudDeck:    980,       // altitude of the cumulus layer, metres
  fogNear:      70,
  fogFar:       1700,
};

// `blades` is the number of Bezier segments per blade -> (2n+1) vertices.
// The chunk grid per ring is NOT listed here: it is derived from the ring's own
// far distance (ceil(2·far/chunk)+1) so that a ring can always physically reach
// the distance it claims to cover.  Hand-picked grids were too small for rings
// 1-3, which left an un-grassed annulus between every pair of rings — that is
// what made dense grass "only appear when you get closer".
// `px` is the supersample factor ON TOP of the device pixel ratio, so it is
// always >= 1.0 above Low and the composite always resolves DOWN to the canvas.
// The composite runs a luma FXAA, which is what lets 1.12x do the job the old
// 1.30x brute-force supersample was doing, for 1.35x fewer fragments.
export const QUALITY = [
  { grass:[0.30,0.28,0.26,0.24], shadow:1280, wind:160, px:0.85, bloomLv:4, blades:[3,1,1,1] },
  { grass:[0.58,0.55,0.52,0.48], shadow:1536, wind:224, px:1.00, bloomLv:5, blades:[3,2,1,1] },
  { grass:[1.00,1.00,1.00,1.00], shadow:2048, wind:288, px:1.12, bloomLv:5, blades:[4,2,1,1] },
  { grass:[1.45,1.38,1.30,1.20], shadow:2560, wind:352, px:1.32, bloomLv:6, blades:[5,3,2,1] },
];

// Four overlapping grass rings carry blades from underfoot to the far ridge.
// chunk = metres per chunk, blades = per chunk at density 1.0,
// near/far = the distance band this ring occupies (with soft overlaps).
/*  The four rings exist only to switch blade tessellation.  Density is ONE
    continuous law across all of them:

        blades/m²(d) = B_i · min(1, (dn_i / d)^1.45)

    with K = B_i·dn_i^1.45 held constant between rings (K ≈ 17600 here), so
    there is no density step anywhere.  The exponent matters enormously: at
    1.7 the blade count per steradian *falls* with distance and the far field
    dissolves into painted ground; at 1.45 it rises slightly, which is what
    makes the horizon read as a meadow rather than as a green plane.  Against
    the previous 1.7 law this is 1.4x denser at 20 m, 2.1x at 100 m and 3.3x
    at 500 m.

    The thinning happens twice.  Coarsely on the CPU, by lowering a chunk's
    *instance count* — the instance buffer is shuffled, so any prefix is a fair
    sample of the chunk and a thinned blade costs nothing at all, not even a
    vertex shader invocation.  Then finely in the vertex shader, per blade,
    against its own true distance: the CPU deliberately over-draws using the
    chunk's NEAREST corner so the shader can only ever remove.  That is what
    lets the far ring use 330 m chunks (few draw calls) with no banding.       */
/*  The exponent is 1.5 rather than 1.7 or 1.45 for a reason beyond taste: at
    exactly 1.5 the shader evaluates (dn/d)^1.5 as x·x·inversesqrt(x), three
    single-cycle instructions, where a general pow() is closer to ten — and this
    runs on every one of ~12 M grass vertices in a frame.

    What actually has to stay constant is not the blade COUNT but the screen
    COVERAGE, and coverage is density x width x height.  Since the angular floor
    widens a far blade in proportion to its distance, the far rings can trade
    count for width one-for-one and look identical: ring 3 now draws a quarter
    fewer blades at a proportionally wider stroke, which is both cheaper and,
    at eight hundred metres, more like a brush mark and less like a hair.      */
export const DENS_POW = 1.5;
export const RINGS = [
  { chunk:  9,  blades:  89000, near:0,    far:26,   dn:7,   wpx:1.70, hs:1.00 }, // 1100/m²
  { chunk: 30,  blades: 177000, near:22,   far:84,   dn:22,  wpx:2.00, hs:1.08 }, //  197/m²
  { chunk:100,  blades: 307000, near:76,   far:290,  dn:76,  wpx:2.75, hs:1.36 }, //   31/m²
  { chunk:250,  blades: 231000, near:260,  far:1250, dn:260, wpx:4.00, hs:1.95 }, //  3.7/m²
];

/*──────────────────────────────── §0b PALETTE ────────────────────────────────*/
// Every colour in the film, in one place.  sRGB hex -> linear at load.

export const P = {
  // sky & air
  skyZenith:'#4E80B4', skyUpper:'#7BA9CE', skyMid:'#A8CAE0', skyHorizon:'#E4DAC2',
  skyHorizonSun:'#FBE2AE', sunGlow:'#FFF1CE', sunDisc:'#FFFAEA', skyAnti:'#C8D4D6',
  haze:'#A9BCC7', mist:'#D6DDD4',
  // clouds
  cloudTop:'#FFF8EC', cloudBody:'#F6E7D2', cloudTerm:'#E8CFB4', cloudUnder:'#B7ACC3',
  cloudCore:'#9791B0', cloudRim:'#FFEFBE', cirrus:'#F3E6D6',
  // grass
  gTip:'#C6D46B', gUpper:'#93B84E', gMid:'#6C9A47', gLow:'#436E4F', gBase:'#2B564F',
  gTrans:'#E9EE7C', gSheen:'#EDF0C8', gDry:'#D9C079',
  gPatchA:'#87AC4B', gPatchB:'#6C9A56', gPatchC:'#9DBC5E', gPatchD:'#5F8A5A',
  // terrain
  tLit:'#93B159', tMid:'#6A924F', tShade:'#456A54', tHollow:'#33564F',
  ridgeNear:'#8FA9A2', ridgeMid:'#9CB0B4', ridgeFar:'#AEBCC9', ridgeFurthest:'#BFC8D4',
  pathLit:'#C9AD80', pathShade:'#7A664D', rockLit:'#B4A794', rockShade:'#5F5C58',
  bounce:'#AA9C64',
  // river
  wShallow:'#A5CBBE', wMid:'#5F9CA0', wDeep:'#2F5F6C', wDeepShade:'#274E5C',
  wSpark:'#FFFCEC', wFoam:'#EEF5EF', wetStone:'#6E7E75',
  // stone
  sA:'#CBB99E', sB:'#BDA98C', sC:'#D6C6AA', sD:'#B2A490',
  sShade:'#6C6355', sDeep:'#585A62', mortar:'#AB9C85', moss:'#6F8C4E', lichen:'#B3BE96',
  // trees
  cLit:'#84A94C', cMid:'#5A8148', cShade:'#2F5546', cDeep:'#254A44', cTrans:'#BED063',
  cVarA:'#98AC43', cVarB:'#6E9440', cVarC:'#A9B65C',
  trunkLit:'#8E7659', trunkShade:'#4C3F34',
  // village
  roofA:'#B96A4C', roofB:'#A05C46', roofSlate:'#6E7583', thatch:'#BC9E66',
  wallA:'#EFE4D0', wallB:'#E4D5BA', timber:'#7C5D46', windowGlow:'#FFD98C',
  // train
  boiler:'#2B333C', boilerLit:'#4E5763', boilerRim:'#8794A0', livery:'#94403A',
  brass:'#CBA44E', carBody:'#3C6152', carBand:'#EADEC2', carWin:'#FFDE9E',
  smokeNew:'#F4EDE3', smokeOld:'#B5ACB6',
  // light
  sun:'#FFD79C', ambSky:'#9EC6E6', ambGround:'#AA9C64', shadowTint:'#5C6E9E',
};

// hex -> THREE.Color (linear) and -> vec3 literal for glsl injection
export const LIN = {};
for (const k in P) LIN[k] = new THREE.Color(P[k]).convertSRGBToLinear();
export const v3 = c => `vec3(${c.r.toFixed(5)},${c.g.toFixed(5)},${c.b.toFixed(5)})`;
export const C = {}; for (const k in LIN) C[k] = v3(LIN[k]);


// query-string state, read once at load
export const QS = new URLSearchParams(location.search);
