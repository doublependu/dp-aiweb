import * as THREE from 'three';
import { C } from './core/config.js';
import { TAU, clamp, lerp, rng } from './core/math.js';
import { GL_UNI, GL_PAL, GL_HASH, GL_NOISE, GL_TERRAIN, GL_CLOUDFIELD, GL_SHADOW, GL_LIGHT, GL_AIR } from './core/glsl.js';
import { riverField, waterLevel, BRIDGE, BRIDGE_AXIS, BRIDGE_PERP } from './terrain.js';

/*────────────────────────── §9  VIADUCT ──────────────────────────*/
/*  Five semicircular arches of jittered voussoirs on battered piers, dressed
    in ~3,000 individually-shaped stones over a solid mortar core.            */

export const BR = (()=>{
  const rf = riverField(BRIDGE.x, BRIDGE.z);
  const water = waterLevel(rf.t);
  return {
    ax: BRIDGE_AXIS, pp: BRIDGE_PERP,
    water,
    deck: water + 26.0,
    spring: water + 8.2,
    span: 19.0, pierW: 5.2, arches: 5, width: 7.6,
    R: 9.5,
  };
})();
BR.total = BR.arches*BR.span + (BR.arches+1)*BR.pierW;

export function brPoint(along, side, y){
  return [ BRIDGE.x + BR.ax[0]*along + BR.pp[0]*side,
           y,
           BRIDGE.z + BR.ax[1]*along + BR.pp[1]*side ];
}
export function archCentres(){
  const out=[]; let s = -BR.total/2 + BR.pierW;
  for(let i=0;i<BR.arches;i++){ out.push(s + BR.span/2); s += BR.span + BR.pierW; }
  return out;
}
export function pierCentres(){
  const out=[]; let s = -BR.total/2;
  for(let i=0;i<=BR.arches;i++){ out.push(s + BR.pierW/2); s += BR.pierW + BR.span; }
  return out;
}

/* solid core: arch barrels, spandrels, piers, deck slab */
export function buildBridgeCore(){
  const pos=[], nrm=[], col=[], idx=[];
  let n=0;
  const V=(p,nn,c)=>{ pos.push(p[0],p[1],p[2]); nrm.push(nn[0],nn[1],nn[2]); col.push(c); return n++; };
  const quad=(a,b,c,d)=>{ idx.push(a,b,c, a,c,d); };
  const W = BR.width/2;

  // arches: intrados + spandrel walls on both faces
  for(const ac of archCentres()){
    const N=26;
    for(let i=0;i<N;i++){
      const t0=i/N, t1=(i+1)/N;
      const a0=Math.PI*t0, a1=Math.PI*t1;
      const x0=-Math.cos(a0)*BR.R, y0=Math.sin(a0)*BR.R;
      const x1=-Math.cos(a1)*BR.R, y1=Math.sin(a1)*BR.R;
      // intrados (barrel underside)
      const p00=brPoint(ac+x0,-W,BR.spring+y0), p01=brPoint(ac+x0, W,BR.spring+y0);
      const p10=brPoint(ac+x1,-W,BR.spring+y1), p11=brPoint(ac+x1, W,BR.spring+y1);
      const nA=[-Math.cos(a0)*0+0, -Math.sin(a0), 0];
      const nn=[-(-Math.cos(a0))*0, -1, 0];
      const nx = -( -Math.cos(a0) ), ny = -Math.sin(a0);
      const nw = [BR.ax[0]*nx, ny, BR.ax[1]*nx];
      quad(V(p00,nw,0.4), V(p10,nw,0.4), V(p11,nw,0.4), V(p01,nw,0.4));
      // spandrel faces (both sides), from the arch curve up to the deck
      for(const sgn of [-1,1]){
        const S = sgn*W;
        const nf=[BR.pp[0]*sgn, 0, BR.pp[1]*sgn];
        const b0=brPoint(ac+x0,S,BR.spring+y0), b1=brPoint(ac+x1,S,BR.spring+y1);
        const t0v=brPoint(ac+x0,S,BR.deck-0.6), t1v=brPoint(ac+x1,S,BR.deck-0.6);
        if(sgn>0) quad(V(b0,nf,0.9), V(b1,nf,0.9), V(t1v,nf,0.9), V(t0v,nf,0.9));
        else      quad(V(b1,nf,0.9), V(b0,nf,0.9), V(t0v,nf,0.9), V(t1v,nf,0.9));
      }
    }
  }
  // piers: battered boxes from the ground to the deck
  for(const pc of pierCentres()){
    const baseY = BR.water - 6.0;
    const topY  = BR.deck - 0.6;
    const steps = 5;
    for(let s=0;s<steps;s++){
      const u0=s/steps, u1=(s+1)/steps;
      const y0=lerp(baseY, topY, u0), y1=lerp(baseY, topY, u1);
      const hw0=lerp(BR.pierW*0.72, BR.pierW*0.5, u0), hw1=lerp(BR.pierW*0.72, BR.pierW*0.5, u1);
      const dw0=lerp(W*1.24, W, u0), dw1=lerp(W*1.24, W, u1);
      for(const sgn of [-1,1]){
        const nf=[BR.pp[0]*sgn,0,BR.pp[1]*sgn];
        const a=brPoint(pc-hw0, sgn*dw0, y0), b=brPoint(pc+hw0, sgn*dw0, y0);
        const c=brPoint(pc+hw1, sgn*dw1, y1), d=brPoint(pc-hw1, sgn*dw1, y1);
        if(sgn>0) quad(V(a,nf,0.75),V(b,nf,0.75),V(c,nf,0.75),V(d,nf,0.75));
        else      quad(V(b,nf,0.75),V(a,nf,0.75),V(d,nf,0.75),V(c,nf,0.75));
      }
      for(const sgn of [-1,1]){
        const nf=[BR.ax[0]*sgn,0,BR.ax[1]*sgn];
        const a=brPoint(pc+sgn*hw0, -dw0, y0), b=brPoint(pc+sgn*hw0, dw0, y0);
        const c=brPoint(pc+sgn*hw1,  dw1, y1), d=brPoint(pc+sgn*hw1,-dw1, y1);
        if(sgn>0) quad(V(a,nf,0.7),V(b,nf,0.7),V(c,nf,0.7),V(d,nf,0.7));
        else      quad(V(b,nf,0.7),V(a,nf,0.7),V(d,nf,0.7),V(c,nf,0.7));
      }
    }
  }
  // deck slab + parapets
  const yTop=BR.deck, yU=BR.deck-0.75;
  const L=BR.total/2 + 9;
  const up=[0,1,0];
  quad(V(brPoint(-L,-W,yTop),up,1.0), V(brPoint(L,-W,yTop),up,1.0),
       V(brPoint(L, W,yTop),up,1.0),  V(brPoint(-L, W,yTop),up,1.0));
  for(const sgn of [-1,1]){
    const nf=[BR.pp[0]*sgn,0,BR.pp[1]*sgn];
    const a=brPoint(-L,sgn*W,yU), b=brPoint(L,sgn*W,yU),
          c=brPoint(L,sgn*W,yTop+1.15), d=brPoint(-L,sgn*W,yTop+1.15);
    if(sgn>0) quad(V(a,nf,0.95),V(b,nf,0.95),V(c,nf,0.95),V(d,nf,0.95));
    else      quad(V(b,nf,0.95),V(a,nf,0.95),V(d,nf,0.95),V(c,nf,0.95));
    // parapet inner face + cap
    const iw = (W-0.55)*sgn;
    const nf2=[-BR.pp[0]*sgn,0,-BR.pp[1]*sgn];
    const e=brPoint(-L,iw,yTop), f=brPoint(L,iw,yTop),
          g=brPoint(L,iw,yTop+1.15), h=brPoint(-L,iw,yTop+1.15);
    if(sgn>0) quad(V(f,nf2,0.9),V(e,nf2,0.9),V(h,nf2,0.9),V(g,nf2,0.9));
    else      quad(V(e,nf2,0.9),V(f,nf2,0.9),V(g,nf2,0.9),V(h,nf2,0.9));
    quad(V(brPoint(-L,sgn*W,yTop+1.15),up,1.1), V(brPoint(L,sgn*W,yTop+1.15),up,1.1),
         V(brPoint(L,iw,yTop+1.15),up,1.1),      V(brPoint(-L,iw,yTop+1.15),up,1.1));
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos),3));
  g.setAttribute('nrm',      new THREE.BufferAttribute(new Float32Array(nrm),3));
  g.setAttribute('shade',    new THREE.BufferAttribute(new Float32Array(col),1));
  g.setIndex(idx); g.computeBoundingSphere();
  return g;
}

/* the dressing: individually shaped, individually coloured stones */
export function buildBridgeStones(){
  const r = rng(5150);
  const inst = [];   // pos(3) size(3) rot(3) seed(1)
  const W = BR.width/2;
  const push=(p, sz, yaw, pitch, seed)=>inst.push([p[0],p[1],p[2], sz[0],sz[1],sz[2], yaw, pitch, seed]);
  const yawOf = () => Math.atan2(BR.ax[0], BR.ax[1]);

  // voussoirs: a ring of wedge stones around each arch, spanning the full depth
  for(const ac of archCentres()){
    const N = 23;
    for(let i=0;i<N;i++){
      const a = Math.PI*(i+0.5)/N;
      const rr = BR.R + 0.72;
      const x = -Math.cos(a)*rr, y = Math.sin(a)*rr;
      const p = brPoint(ac+x, 0, BR.spring+y);
      push(p, [Math.PI*BR.R/N*0.47 + r()*0.06, 0.74 + r()*0.10, W*1.02],
           yawOf(), (a - Math.PI/2), r()*100);
    }
  }
  // spandrel courses on both faces
  for(const ac of archCentres()){
    for(let cRow=0;;cRow++){
      const y = BR.spring + BR.R + 0.9 + cRow*0.86;
      if(y > BR.deck-1.0) break;
      const nAcross = Math.floor(BR.span/1.32);
      for(let i=0;i<nAcross;i++){
        const off = (i - (nAcross-1)/2) * 1.32 + (cRow%2?0.4:0.0) + (r()-0.5)*0.12;
        const ax = ac + off;
        // clip against the arch curve
        const dx = off;
        if(Math.abs(dx) < BR.R+0.7){
          const yc = BR.spring + Math.sqrt(Math.max(0,(BR.R+0.9)*(BR.R+0.9) - dx*dx));
          if(y < yc + 0.5) continue;
        }
        for(const sgn of [-1,1]){
          const p = brPoint(ax, sgn*(W+0.10), y);
          push(p, [0.60+r()*0.07, 0.38+r()*0.05, 0.22+r()*0.06], yawOf(), 0, r()*100);
        }
      }
    }
  }
  // pier facing
  for(const pc of pierCentres()){
    const baseY = BR.water - 1.5, topY = BR.deck-1.0;
    for(let cRow=0;;cRow++){
      const y = baseY + cRow*0.92;
      if(y > topY) break;
      const u = clamp((y-(BR.water-6))/(topY-(BR.water-6)),0,1);
      const hw = lerp(BR.pierW*0.72, BR.pierW*0.5, u);
      const dw = lerp(W*1.24, W, u);
      const nA = Math.max(2, Math.floor(hw*2/1.25));
      for(let i=0;i<nA;i++){
        const off=(i-(nA-1)/2)*(hw*2/nA) + (cRow%2?0.30:0);
        for(const sgn of [-1,1])
          push(brPoint(pc+off, sgn*(dw+0.10), y), [0.56+r()*0.07,0.40+r()*0.05,0.20+r()*0.05], yawOf(), 0, r()*100);
      }
      const nB = Math.max(2, Math.floor(dw*2/1.25));
      for(let i=0;i<nB;i++){
        const off=(i-(nB-1)/2)*(dw*2/nB) + (cRow%2?0.30:0);
        for(const sgn of [-1,1])
          push(brPoint(pc+sgn*(hw+0.10), off, y), [0.20+r()*0.05,0.40+r()*0.05,0.56+r()*0.07], yawOf(), 0, r()*100);
      }
    }
  }
  // string course under the parapet
  for(let i=0;i<Math.floor(BR.total/0.9)+18;i++){
    const s = -BR.total/2-8 + i*0.9;
    for(const sgn of [-1,1])
      push(brPoint(s, sgn*(W+0.22), BR.deck-0.45), [0.44,0.30,0.34], yawOf(), 0, r()*100);
  }
  return inst;
}



export function roundedBoxGeometry(round){
  const pos=[], nrm=[], idx=[]; let n=0;
  const faces=[
    {n:[ 1,0,0], u:[0,0,-1], v:[0,1,0]}, {n:[-1,0,0], u:[0,0, 1], v:[0,1,0]},
    {n:[0, 1,0], u:[1,0, 0], v:[0,0,1]}, {n:[0,-1,0], u:[1,0, 0], v:[0,0,-1]},
    {n:[0,0, 1], u:[1,0, 0], v:[0,1,0]}, {n:[0,0,-1], u:[-1,0,0], v:[0,1,0]},
  ];
  const S=2;
  for(const f of faces){
    const base=n;
    for(let j=0;j<=S;j++) for(let i=0;i<=S;i++){
      const a=i/S*2-1, b=j/S*2-1;
      let p=[f.n[0]+f.u[0]*a+f.v[0]*b, f.n[1]+f.u[1]*a+f.v[1]*b, f.n[2]+f.u[2]*a+f.v[2]*b];
      // pull the corners in for a chamfered block that catches the light
      const k=1.0-round;
      const len=Math.hypot(p[0],p[1],p[2]);
      const q=[p[0]*k + p[0]/len*round, p[1]*k + p[1]/len*round, p[2]*k + p[2]/len*round];
      const edge = Math.max(Math.abs(a),Math.abs(b));
      const nn = edge>0.9 ? [ (f.n[0]+q[0]*0.55), (f.n[1]+q[1]*0.55), (f.n[2]+q[2]*0.55) ] : f.n.slice();
      const nl=Math.hypot(nn[0],nn[1],nn[2])||1;
      pos.push(q[0],q[1],q[2]); nrm.push(nn[0]/nl,nn[1]/nl,nn[2]/nl); n++;
    }
    for(let j=0;j<S;j++) for(let i=0;i<S;i++){
      const a=base+j*(S+1)+i, b=a+1, c=a+S+1, d=c+1;
      idx.push(a,c,b, b,c,d);
    }
  }
  const g=new THREE.InstancedBufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(pos),3));
  g.setAttribute('nrm',new THREE.BufferAttribute(new Float32Array(nrm),3));
  g.setIndex(idx);
  return g;
}

export const STONE_VS = ()=> /* glsl */`
${GL_UNI}
uniform vec2 uAx; uniform vec2 uPp;
${GL_HASH}${GL_NOISE}
in vec3 nrm;
in vec4 sA;   // pos.xyz, seed
in vec4 sB;   // size.xyz, pitch
out vec3 vW; out vec3 vN; out float vSeed; out float vDist; out vec3 vL;
void main(){
  float seed = sA.w;
  vec3 l = position * sB.xyz;
  // every stone is worn to its own shape
  vec3 wob = (hash33(position*2.3 + seed*3.77) - 0.5);
  l += wob * min(min(sB.x,sB.y),sB.z) * 0.30;
  vec3 nl = normalize(nrm + wob*0.55);
  float cp=cos(sB.w), sp=sin(sB.w);
  vec3 b  = vec3(l.x*cp - l.y*sp, l.x*sp + l.y*cp, l.z);
  vec3 bn = vec3(nl.x*cp - nl.y*sp, nl.x*sp + nl.y*cp, nl.z);
  vec3 wp = sA.xyz + vec3(uAx.x*b.x + uPp.x*b.z, b.y, uAx.y*b.x + uPp.y*b.z);
  vN = normalize(vec3(uAx.x*bn.x + uPp.x*bn.z, bn.y, uAx.y*bn.x + uPp.y*bn.z));
  vW = wp; vSeed = seed; vL = position;
  vec4 mv = viewMatrix*vec4(wp,1.0); vDist=-mv.z;
  gl_Position = projectionMatrix*mv;
}`;

export const STONE_FS = ()=> /* glsl */`
precision highp float;
${GL_UNI}
${GL_PAL()}${GL_HASH}${GL_NOISE}${GL_TERRAIN}
${GL_CLOUDFIELD}${GL_SHADOW}${GL_LIGHT}${GL_AIR}
in vec3 vW; in vec3 vN; in float vSeed; in float vDist; in vec3 vL;
out vec4 outColor;
void main(){
  vec3 N=normalize(vN), V=normalize(uCamPos-vW);
  float k=fract(vSeed*0.61803);
  vec3 base = k<0.25 ? ${C.sA} : (k<0.5 ? ${C.sB} : (k<0.75 ? ${C.sC} : ${C.sD}));
  float grain = pn2(vW.xz*7.0 + vW.y*5.0)*0.5+0.5;
  float grain2 = pn2(vW.xz*23.0 - vW.y*11.0)*0.5+0.5;
  base *= 0.88 + 0.26*grain + 0.08*grain2;
  vec3 lit=base, mid=mix(base,${C.sShade},0.55), shd=mix(${C.sShade},${C.sDeep},0.5);

  // lichen on the light, moss where water runs and on the shaded faces
  float lich = smoothstep(0.55,0.92, pn2(vW.xz*2.1+vW.y*1.7)*0.5+0.5 + N.y*0.22);
  lit = mix(lit, ${C.lichen}, lich*0.42); mid = mix(mid, ${C.lichen}*0.7, lich*0.3);
  float damp = smoothstep(${(BR.water+7).toFixed(1)}, ${(BR.water-1).toFixed(1)}, vW.y);
  float mossN = pn2(vW.xz*1.3 + vW.y*0.9)*0.5+0.5;
  float moss = clamp(damp*0.85 + smoothstep(0.1,-0.55,N.y)*0.55*mossN, 0.0, 1.0)*mossN;
  lit = mix(lit, ${C.moss}, moss*0.60); mid = mix(mid, ${C.moss}*0.6, moss*0.55);
  shd = mix(shd, ${C.cDeep}, moss*0.5);

  float ndl=dot(N,uSunDir);
  float sh = sunShadow(vW,ndl)*cloudShadow(vW);
  Surf s; s.N=N; s.V=V; s.P=vW; s.shade=shd; s.mid=mid; s.lit=lit;
  s.soft=0.10; s.shadow=sh; s.trans=0.0; s.transCol=vec3(0.0);
  s.jit = (vn2(vW.xz*3.9 + vW.y*1.7) - 0.5)*0.055;
  s.rim=0.30; s.ao=mix(0.80,1.0,smoothstep(0.0,0.75,length(vL.xy))); s.ambient=1.0;
  vec3 col=paint(s);
  col = aerial(col, vDist, V, vW.y);
  outColor = vec4(SAFE3(col), gFogAmt);
}`;
