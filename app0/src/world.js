import { BR } from './viaduct.js';
import { BRIDGE, sampleHeight } from './terrain.js';

/*──────────────── the solid world: what you cannot walk through ──────────*/
/*──────────────────── solid world: what you cannot walk through ────────────*/
/*  Every building registers an oriented box as it is modelled, so the collision
    set can never drift out of step with the geometry.                        */
export const SOLIDS = [];
export function pushSolid(x, z, hx, hz, yaw){
  SOLIDS.push({ x, z, hx, hz, ca:Math.cos(yaw), sa:Math.sin(yaw),
                rr: Math.pow(Math.hypot(hx,hz) + 1.4, 2) });
}

/*───────────────────────────── §9c  THE VILLAGE ────────────────────────────*/

/*──────────────── the walkable world: ground, deck, parapets ───────────────*/
/*  The viaduct is 26 m of open air above the river, so it cannot simply be
    folded into the heightmap — the ground under the arches has to stay where
    it is.  Instead the deck is a second, conditional surface: you are on it
    only if you are ALREADY at roughly deck level, which is what happens when
    you walk up the railway embankment onto the abutment.  Standing in the
    gorge underneath, the deck is not there for you at all.                   */
export const BR_L  = BR.total/2 + 9.0;         // deck half-length including abutments
export const BR_HW = BR.width/2 - 0.62;        // clear width between the parapets
export function onDeck(x, z, curY){
  if(Math.abs(curY - BR.deck) > 3.0) return false;
  const dx = x - BRIDGE.x, dz = z - BRIDGE.z;
  const al = dx*BR.ax[0] + dz*BR.ax[1];
  const sd = dx*BR.pp[0] + dz*BR.pp[1];
  return Math.abs(al) <= BR_L && Math.abs(sd) <= BR.width/2;
}
export function groundHeightAt(x, z, curY){
  const h = sampleHeight(x, z);
  return onDeck(x, z, curY) ? Math.max(h, BR.deck + 0.02) : h;
}
// resolves a proposed position against the buildings and the bridge parapets
const _res = [0,0];
export function collideWalk(x, z, curY, radius){
  for(let i=0;i<SOLIDS.length;i++){
    const s = SOLIDS[i];
    const dx = x - s.x, dz = z - s.z;
    if(dx*dx + dz*dz > s.rr) continue;
    let lx =  dx*s.ca + dz*s.sa;
    let lz = -dx*s.sa + dz*s.ca;
    const ex = s.hx + radius, ez = s.hz + radius;
    if(Math.abs(lx) < ex && Math.abs(lz) < ez){
      // eject along whichever local axis is the shallower penetration
      if(ex - Math.abs(lx) < ez - Math.abs(lz)) lx = (lx < 0 ? -ex : ex);
      else                                      lz = (lz < 0 ? -ez : ez);
      x = s.x + lx*s.ca - lz*s.sa;
      z = s.z + lx*s.sa + lz*s.ca;
    }
  }
  const dx0 = x - BRIDGE.x, dz0 = z - BRIDGE.z;
  const al = dx0*BR.ax[0] + dz0*BR.ax[1];
  let   sd = dx0*BR.pp[0] + dz0*BR.pp[1];
  if(Math.abs(al) <= BR_L + 1.5 && Math.abs(sd) > BR_HW && Math.abs(curY - BR.deck) < 3.0){
    sd = sd < 0 ? -BR_HW : BR_HW;
    x = BRIDGE.x + BR.ax[0]*al + BR.pp[0]*sd;
    z = BRIDGE.z + BR.ax[1]*al + BR.pp[1]*sd;
  }
  _res[0]=x; _res[1]=z; return _res;
}

