import { TAU, rng, clamp } from './core/math.js';
import { PB, pv, pq, pt3, pbox, pcyl, proof, finishPainted, LC, tint, mixc, rotY} from './core/mesh-utils.js';
import { VILLAGE, riverField, waterLevel, RIVER_PTS, sampleHeight, riverWidth } from './terrain.js';
import { pushSolid } from './world.js';

export function buildVillage(){
  const M = PB(); const r = rng(8080);
  const smokers = [];
  const roofCols=[LC('roofA'), LC('roofB'), LC('roofSlate'), LC('thatch')];
  const wallCols=[LC('wallA'), LC('wallB'), tint(LC('wallA'),0.94)];
  const houses=[];

  // a lane winding up the slope, houses hung off it
  const laneN = 44;
  for(let i=0;i<laneN;i++){
    const u=i/(laneN-1);
    const a = -0.9 + u*3.4;
    const rr = 34 + u*118;
    const lx = VILLAGE.x + Math.cos(a)*rr*0.85;
    const lz = VILLAGE.z + Math.sin(a)*rr*0.62 - u*38;
    for(let k=0;k<2;k++){
      if(r()<0.24) continue;
      const off = (k?1:-1)*(9 + r()*8);
      const x = lx + Math.cos(a+1.57)*off, z = lz + Math.sin(a+1.57)*off;
      const rf = riverField(x,z);
      const gy = sampleHeight(x,z);
      if(gy < waterLevel(rf.t)+3.0) continue;
      houses.push({x,z,y:gy, yaw:a+1.57+(r()-0.5)*0.5, s:0.85+r()*0.5, seed:r()});
    }
  }
  for(const h of houses){
    const w = 3.0*h.s + r()*1.2, d = 4.0*h.s + r()*1.6, ht = 2.5*h.s + r()*1.3;
    const wc = wallCols[(r()*wallCols.length)|0];
    const rcI = r()<0.55?0 : (r()<0.5?1:(r()<0.6?2:3));
    const rc = tint(roofCols[rcI], 0.88+r()*0.28);
    const y0 = h.y - 0.5;
    pushSolid(h.x, h.z, w/2, d/2, h.yaw);
    pbox(M, h.x, y0+ht/2, h.z, w/2, ht/2, d/2, h.yaw, tint(wc, 0.92+r()*0.18), 0);
    proof(M, h.x, y0+ht, h.z, w/2*1.14, d/2*1.16, 1.5*h.s + r()*0.8, h.yaw, rc, 0);
    // chimney
    const cxo=(r()-0.5)*w*0.5;
    const [chx,chz]=rotY(cxo, d*0.22, Math.cos(h.yaw), Math.sin(h.yaw));
    const chY = y0+ht+1.5*h.s+0.7;
    pbox(M, h.x+chx, chY, h.z+chz, 0.22*h.s, 0.9*h.s, 0.22*h.s, h.yaw, tint(rc,0.75), 0);
    if(r()<0.55) smokers.push({x:h.x+chx, y:chY+0.9*h.s, z:h.z+chz, rate:0.5+r()*0.8});
    // windows, warm at golden hour
    const nw = 2 + (r()*3|0);
    for(let i=0;i<nw;i++){
      const side = r()<0.5?1:-1;
      const along = (r()-0.5)*w*0.7;
      const [wx,wz]=rotY(along, side*(d/2+0.06), Math.cos(h.yaw), Math.sin(h.yaw));
      const lvl = r()<0.6 ? y0+ht*0.42 : y0+ht*0.78;
      const on = r()<0.5;
      pbox(M, h.x+wx, lvl, h.z+wz, 0.30*h.s, 0.38*h.s, 0.05, h.yaw,
           on?LC('windowGlow'):tint(LC('timber'),0.6), on?2:3);
    }
    // timber framing on a few of them
    if(r()<0.4){
      for(let i=0;i<3;i++){
        const along=(i-1)*w*0.32;
        const [tx,tz]=rotY(along, d/2+0.04, Math.cos(h.yaw), Math.sin(h.yaw));
        pbox(M, h.x+tx, y0+ht/2, h.z+tz, 0.07*h.s, ht/2*0.94, 0.04, h.yaw, LC('timber'), 0);
      }
    }
  }
  // the bell tower: the village's vertical accent
  {
    const x=VILLAGE.x+22, z=VILLAGE.z-16, y=sampleHeight(x,z)-0.5;
    pushSolid(x, z, 2.1, 2.1, 0.3);
    pbox(M, x, y+7, z, 2.1, 7, 2.1, 0.3, LC('wallA'), 0);
    pbox(M, x, y+14.4, z, 2.5, 0.4, 2.5, 0.3, tint(LC('wallB'),0.9), 0);
    proof(M, x, y+14.8, z, 2.3, 2.3, 3.4, 0.3, LC('roofSlate'), 0);
    pbox(M, x, y+12.3, z+2.12, 0.62, 0.9, 0.06, 0.3, tint(LC('timber'),0.5), 3);
    smokers.push(null);
  }
  // the watermill on the near bank
  const mill = (()=>{
    const t=0.44;
    const pi=clamp(Math.round(t*(RIVER_PTS.length-1)),1,RIVER_PTS.length-2);
    const p=RIVER_PTS[pi], pm=RIVER_PTS[pi-2], pp=RIVER_PTS[pi+2];
    let tx=pp.x-pm.x, tz=pp.z-pm.z; const L=Math.hypot(tx,tz)||1; tx/=L; tz/=L;
    const off=riverWidth(p.t)+3.4;
    const x=p.x - tz*off, z=p.z + tx*off;
    const y=Math.max(sampleHeight(x,z), waterLevel(p.t)+1.2)-0.4;
    const yaw=Math.atan2(tx,tz);
    pushSolid(x, z, 3.1, 3.9, yaw);
    pbox(M, x, y+3.0, z, 3.0, 3.0, 3.8, yaw, LC('wallB'), 0);
    proof(M, x, y+6.0, z, 3.3, 4.1, 2.4, yaw, LC('thatch'), 0);
    pbox(M, x, y+2.6, z, 3.1, 0.9, 3.9, yaw, tint(LC('timber'),0.9), 0);
    return { x, y:y+2.4, z, yaw, r:2.6, tx, tz };
  })();
  return { geom:finishPainted(M), smokers:smokers.filter(Boolean), mill };
}

export function buildMillWheel(mill){
  const M=PB(); const wc=tint(LC('timber'),1.05);
  const R=mill.r;
  for(let i=0;i<12;i++){
    const a=i/12*TAU;
    const cx=Math.cos(a)*R*0.82, cy=Math.sin(a)*R*0.82;
    pbox(M, cx, cy, 0, 0.10, R*0.30, 0.85, 0, i%2?wc:tint(wc,0.85), 0);
    pbox(M, Math.cos(a)*R, Math.sin(a)*R, 0, 0.16, 0.16, 1.0, 0, tint(wc,0.9), 0);
  }
  for(let s of [-1,1]) for(let i=0;i<16;i++){
    const a=i/16*TAU, a2=(i+1)/16*TAU;
    pbox(M, Math.cos((a+a2)/2)*R, Math.sin((a+a2)/2)*R, s*0.95, R*0.20, 0.10, 0.08,
         0, tint(wc,0.8), 0);
  }
  pcyl(M, [0,0,-1.05],[0,0,1.05], 0.22,0.22, 8, tint(LC('timber'),0.7), 0, true, true);
  return finishPainted(M);
}


