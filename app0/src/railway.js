import * as THREE from 'three';
import { clamp, lerp, smootherstep } from './core/math.js';
import { terrainAt, catmull, BRIDGE, heightData, HM, WS, HALF, makeDF } from './terrain.js';
import { BR } from './viaduct.js';

/*──────────────────────────── §9b  THE RAILWAY ─────────────────────────────*/
/* The track is graded like a real railway: the raw ground profile is smoothed
   and then iteratively clamped to a maximum gradient of 2.5%, so the line
   cuts through the shoulders and rides an embankment across the flats.       */

export let TRACK = null;
export function trackAdjust(x, z, h){
  if(!TRACK) return h;
  const f = TRACK.field(x,z);
  if(f.d > 34) return h;
  const y = TRACK.yAt(f.t);
  const target = y - 0.85;
  const rise = target - h;              // + = embankment, - = cutting
  // A railway can raise the ground about seven metres on an embankment and
  // sink about fifteen into a cutting.  Beyond that the line is on a VIADUCT,
  // and the valley underneath has to stay open — otherwise the earthworks
  // swallow the arches.
  const limit = rise > 0 ? (1 - smootherstep(5.0, 9.5, rise))
                         : (1 - smootherstep(11.0, 18.0, -rise));
  if(limit <= 0.001) return h;
  const w = smootherstep(34, 9, f.d) * limit;
  return lerp(h, target, w*0.92);
}

export function buildTrack(){
  const bAlong = BR.ax, bPerp = BR.pp;
  const B = [BRIDGE.x, BRIDGE.z];
  const P = (a,c)=>[B[0] + bAlong[0]*a + bPerp[0]*(c||0), B[1] + bAlong[1]*a + bPerp[1]*(c||0)];
  const CTRL = [
    [B[0]-bAlong[0]*1150 + 240, B[1]-bAlong[1]*1150 + 90],
    [B[0]-bAlong[0]*760  + 120, B[1]-bAlong[1]*760  + 40],
    [B[0]-bAlong[0]*420  + 26,  B[1]-bAlong[1]*420  + 8],
    P(-150), P(-72), P(0), P(72), P(150),
    [B[0]+bAlong[0]*300 + 40,  B[1]+bAlong[1]*300 - 70],
    [B[0]+bAlong[0]*560 + 165, B[1]+bAlong[1]*560 - 200],
    [B[0]+bAlong[0]*900 + 400, B[1]+bAlong[1]*900 - 400],
  ];
  const N = 1400, pts=[]; let acc=0;
  for(let i=0;i<=N;i++){
    const p = catmull(CTRL, i/N);
    if(i>0) acc += Math.hypot(p[0]-pts[i-1].x, p[1]-pts[i-1].z);
    pts.push({x:p[0], z:p[1], s:acc, y:0});
  }
  const total = acc;
  pts.forEach(p=>p.t = p.s/total);

  // raw ground, then a railway engineer's grading pass
  for(const p of pts) p.y = terrainAt(p.x, p.z) + 0.9;
  for(let pass=0; pass<7; pass++){
    const src = pts.map(p=>p.y);
    for(let i=0;i<pts.length;i++){
      let s=0,n=0;
      for(let k=-26;k<=26;k++){ const j=clamp(i+k,0,pts.length-1); s+=src[j]; n++; }
      pts[i].y = s/n;
    }
  }
  // hard-set the bridge deck, then blend the approaches
  const sB = total*0.5;
  let iB = 0, best=1e9;
  for(let i=0;i<pts.length;i++){ const d=Math.hypot(pts[i].x-B[0], pts[i].z-B[1]); if(d<best){best=d;iB=i;} }
  const sMid = pts[iB].s;
  for(const p of pts){
    const da = Math.abs(p.s - sMid);
    if(da < 80) p.y = BR.deck;
    else if(da < 260) p.y = lerp(BR.deck, p.y, smootherstep(80, 260, da));
  }
  // enforce a maximum gradient
  const ds = total/N;
  for(let pass=0; pass<70; pass++){
    for(let i=1;i<pts.length;i++){
      const dy = pts[i].y - pts[i-1].y, mx = 0.025*ds;
      if(Math.abs(dy) > mx){ const ex=(Math.abs(dy)-mx)*Math.sign(dy)*0.5; pts[i].y-=ex; pts[i-1].y+=ex; }
    }
    for(const p of pts){ const da=Math.abs(p.s-sMid); if(da<80) p.y=BR.deck; }
  }
  const field = makeDF(pts, 384);
  const yAt = (t)=>{ const i=clamp(Math.round(t*N),0,N); return pts[i].y; };
  TRACK = { pts, total, field, yAt, iB, sMid, N };
  return TRACK;
}
export function trackPose(s){                        // world position + tangent at arc length s
  const T = TRACK;
  const u = clamp(s/T.total, 0, 1);
  const fi = u*T.N, i = clamp(Math.floor(fi), 0, T.N-1), f = fi-i;
  const a=T.pts[i], b=T.pts[i+1];
  const x=lerp(a.x,b.x,f), z=lerp(a.z,b.z,f), y=lerp(a.y,b.y,f);
  const i0=clamp(i-4,0,T.N), i1=clamp(i+4,0,T.N);
  let tx=T.pts[i1].x-T.pts[i0].x, tz=T.pts[i1].z-T.pts[i0].z, ty=T.pts[i1].y-T.pts[i0].y;
  const L=Math.hypot(tx,tz,ty)||1;
  return { x,y,z, tx:tx/L, ty:ty/L, tz:tz/L };
}

/*  Ballast, sleepers and bullhead rail, for the WHOLE length of the line.
    It used to be built for a ±540 m window around the viaduct, which meant the
    train ran on nothing at all for most of its journey and the line simply
    vanished into the hills — the "missing track".  The full run is ~2.3 km and
    still only ~170k vertices, one draw call, so there was never a reason to
    truncate it.  The rail is a real section — foot, web and head — rather than
    a ribbon, so it catches the low sun along its top face and reads as steel
    from the far bank.                                                        */
export function buildPermanentWay(){
  const pos=[], nrm=[], col=[], idx=[]; let n=0;
  const V=(x,y,z,nx,ny,nz,c)=>{pos.push(x,y,z);nrm.push(nx,ny,nz);col.push(c);return n++;};
  const quad=(a,b,c,d)=>{idx.push(a,b,c,a,c,d);};
  const T=TRACK, GA=1.435/2;
  const s0 = 2, s1 = T.total - 2;
  const step = 1.2;
  // rail section, as (lateral offset from the rail centreline, height): foot,
  // web, head — traced up one side, over the top and down the other
  const SECT = [
    [ 0.085, 0.02], [ 0.085, 0.055], [ 0.030, 0.075], [ 0.030, 0.155],
    [ 0.072, 0.175], [ 0.072, 0.215], [-0.072, 0.215], [-0.072, 0.175],
    [-0.030, 0.155], [-0.030, 0.075], [-0.085, 0.055], [-0.085, 0.02],
  ];
  const shadeOf = (i)=> (SECT[i][1] > 0.20 ? 2.35 : (SECT[i][1] > 0.10 ? 1.15 : 0.85));
  let prev = null;
  for(let s=s0; s<=s1; s+=step){
    const p = trackPose(s);
    const px=-p.tz, pz=p.tx;
    const cur = {p, px, pz};
    if(prev){
      for(const side of [-1,1]){
        const o = side*GA;
        for(let i=0;i<SECT.length-1;i++){
          const A=SECT[i], B=SECT[i+1];
          // face normal: perpendicular to the section edge, in the sleeper plane
          let ex=-(B[1]-A[1]), ey=(B[0]-A[0]);
          const el=Math.hypot(ex,ey)||1; ex/=el; ey/=el;
          const nA=[prev.px*ex, ey, prev.pz*ex], nB=[cur.px*ex, ey, cur.pz*ex];
          const shd = (shadeOf(i)+shadeOf(i+1))*0.5;
          const pA=[prev.p.x+prev.px*(o+A[0]), prev.p.y+A[1], prev.p.z+prev.pz*(o+A[0])];
          const pB=[prev.p.x+prev.px*(o+B[0]), prev.p.y+B[1], prev.p.z+prev.pz*(o+B[0])];
          const qA=[cur.p.x +cur.px *(o+A[0]), cur.p.y +A[1], cur.p.z +cur.pz *(o+A[0])];
          const qB=[cur.p.x +cur.px *(o+B[0]), cur.p.y +B[1], cur.p.z +cur.pz *(o+B[0])];
          quad(V(pA[0],pA[1],pA[2],nA[0],nA[1],nA[2],shd),
               V(qA[0],qA[1],qA[2],nB[0],nB[1],nB[2],shd),
               V(qB[0],qB[1],qB[2],nB[0],nB[1],nB[2],shd),
               V(pB[0],pB[1],pB[2],nA[0],nA[1],nA[2],shd));
        }
      }
      // ballast prism: 1:2 shoulders down to the formation
      const w0=2.75, w1=1.75;
      const A=[prev.p.x+prev.px*-w0, prev.p.y-0.52, prev.p.z+prev.pz*-w0];
      const Bv=[cur.p.x+cur.px*-w0, cur.p.y-0.52, cur.p.z+cur.pz*-w0];
      const Cv=[cur.p.x+cur.px*-w1, cur.p.y+0.02, cur.p.z+cur.pz*-w1];
      const D=[prev.p.x+prev.px*-w1, prev.p.y+0.02, prev.p.z+prev.pz*-w1];
      quad(V(A[0],A[1],A[2],0,1,0,0.70),V(Bv[0],Bv[1],Bv[2],0,1,0,0.70),
           V(Cv[0],Cv[1],Cv[2],0,1,0,0.88),V(D[0],D[1],D[2],0,1,0,0.88));
      const A2=[prev.p.x+prev.px*w1, prev.p.y+0.02, prev.p.z+prev.pz*w1];
      const B2=[cur.p.x+cur.px*w1, cur.p.y+0.02, cur.p.z+cur.pz*w1];
      const C2=[cur.p.x+cur.px*w0, cur.p.y-0.52, cur.p.z+cur.pz*w0];
      const D2=[prev.p.x+prev.px*w0, prev.p.y-0.52, prev.p.z+prev.pz*w0];
      quad(V(A2[0],A2[1],A2[2],0,1,0,0.88),V(B2[0],B2[1],B2[2],0,1,0,0.88),
           V(C2[0],C2[1],C2[2],0,1,0,0.70),V(D2[0],D2[1],D2[2],0,1,0,0.70));
      quad(V(D[0],D[1],D[2],0,1,0,0.95),V(Cv[0],Cv[1],Cv[2],0,1,0,0.95),
           V(B2[0],B2[1],B2[2],0,1,0,0.95),V(A2[0],A2[1],A2[2],0,1,0,0.95));
    }
    prev = cur;
  }
  // sleepers
  for(let s=s0; s<=s1; s+=0.78){
    const p=trackPose(s); const px=-p.tz, pz=p.tx;
    const hw=1.32, hl=0.14, hh=0.095;
    const c0=[p.x, p.y+0.02, p.z];
    const ex=[px*hw, 0, pz*hw], ey=[0,hh,0], ez=[p.tx*hl, 0, p.tz*hl];
    const V8=[];
    for(let i=0;i<8;i++){
      const sx=(i&1)?1:-1, sy=(i&2)?1:-1, sz=(i&4)?1:-1;
      V8.push([c0[0]+ex[0]*sx+ez[0]*sz, c0[1]+ey[1]*sy, c0[2]+ex[2]*sx+ez[2]*sz]);
    }
    const F=[[0,1,3,2],[4,6,7,5],[0,2,6,4],[1,5,7,3],[2,3,7,6],[0,4,5,1]];
    const NR=[[0,-1,0],[0,1,0],[-px,0,-pz],[px,0,pz],[p.tx,0,p.tz],[-p.tx,0,-p.tz]];
    // creosoted timber weathers unevenly
    const sh = 0.40 + 0.22*(0.5 + 0.5*Math.sin(s*11.7));
    for(let f=0;f<6;f++){
      const q=F[f], nn=NR[f];
      quad(V(V8[q[0]][0],V8[q[0]][1],V8[q[0]][2],nn[0],nn[1],nn[2],sh),
           V(V8[q[1]][0],V8[q[1]][1],V8[q[1]][2],nn[0],nn[1],nn[2],sh),
           V(V8[q[2]][0],V8[q[2]][1],V8[q[2]][2],nn[0],nn[1],nn[2],sh),
           V(V8[q[3]][0],V8[q[3]][1],V8[q[3]][2],nn[0],nn[1],nn[2],sh));
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(pos),3));
  g.setAttribute('nrm',new THREE.BufferAttribute(new Float32Array(nrm),3));
  g.setAttribute('shade',new THREE.BufferAttribute(new Float32Array(col),1));
  g.setIndex(idx); g.computeBoundingSphere();
  return g;
}

/*──────────────────── stone: one instanced, individually worn block ────────*/

/*  The permanent way must never be swallowed by the hillside.  trackAdjust
    deliberately refuses to fill a deep gorge (or the viaduct's arches would be
    buried in an earth causeway), but a *cutting* can always be dug: no amount
    of excavation can fill a valley.  This second pass therefore guarantees a
    level, un-buried formation for the full length of the line.               */
export function carveTrackBed(){
  if(!TRACK) return;
  for(let y=0;y<HM;y++){
    const wz=(y/(HM-1))*WS-HALF;
    for(let x=0;x<HM;x++){
      const wx=(x/(HM-1))*WS-HALF;
      const f=TRACK.field(wx,wz);
      if(f.d > 26) continue;
      const formation = TRACK.yAt(f.t) - 0.92;
      const h = heightData[y*HM+x];
      if(h <= formation + 0.05) continue;          // already low enough
      // full depth on the 4.4 m formation, then a 1:3 batter out to 26 m
      const w = 1 - smootherstep(4.4, 26.0, f.d);
      const target = formation + Math.max(0, f.d-4.4)*0.34;
      heightData[y*HM+x] = Math.min(h, lerp(h, Math.min(h, target), w));
    }
  }
}
