import * as THREE from 'three';
import { lerp, TAU } from './math.js';
import { LIN } from './config.js';
import { GL_UNI, GL_PAL, GL_HASH, GL_NOISE, GL_TERRAIN, GL_CLOUDFIELD, GL_SHADOW, GL_LIGHT, GL_AIR } from './glsl.js';

/*──────────── a small mesh toolkit for everything hand-modelled ──────────*/
export const SOLID_VS = ()=> /* glsl */`
${GL_UNI}
in vec3 nrm; in float shade;
out vec3 vW; out vec3 vN; out float vS; out float vDist;
void main(){
  vec4 wp = modelMatrix * vec4(position,1.0);
  vW = wp.xyz; vN = normalize(mat3(modelMatrix)*nrm); vS = shade;
  vec4 mv = viewMatrix*wp; vDist=-mv.z;
  gl_Position = projectionMatrix*mv;
}`;
export const SOLID_FS = (litC, midC, shdC, extra)=> /* glsl */`
precision highp float;
${GL_UNI}
${GL_PAL()}${GL_HASH}${GL_NOISE}${GL_TERRAIN}
${GL_CLOUDFIELD}${GL_SHADOW}${GL_LIGHT}${GL_AIR}
in vec3 vW; in vec3 vN; in float vS; in float vDist;
out vec4 outColor;
void main(){
  vec3 N=normalize(vN), V=normalize(uCamPos-vW);
  vec3 lit=${litC}, mid=${midC}, shd=${shdC};
  ${extra||''}
  float g = pn2(vW.xz*3.1+vW.y*2.3)*0.5+0.5;
  lit *= 0.90+0.20*g; mid *= 0.90+0.20*g;
  lit *= vS; mid *= mix(1.0, vS, 0.6);
  float ndl=dot(N,uSunDir);
  float sh=sunShadow(vW,ndl)*cloudShadow(vW);
  Surf s; s.N=N; s.V=V; s.P=vW; s.shade=shd; s.mid=mid; s.lit=lit;
  s.soft=0.10; s.jit=(vn2(vW.xz*3.9 + vW.y*1.7)-0.5)*0.055;
  s.shadow=sh; s.trans=0.0; s.transCol=vec3(0.0);
  s.rim=0.25; s.ao=1.0; s.ambient=1.0;
  vec3 col=paint(s);
  col=aerial(col,vDist,V,vW.y);
  outColor = vec4(SAFE3(col), gFogAmt);
}`;


/*────────────── a small mesh toolkit for everything hand-modelled ──────────*/
export const LC = k => [LIN[k].r, LIN[k].g, LIN[k].b];
export const tint = (c,f)=>[c[0]*f, c[1]*f, c[2]*f];
export const mixc = (a,b,t)=>[lerp(a[0],b[0],t), lerp(a[1],b[1],t), lerp(a[2],b[2],t)];

export function PB(){ return {pos:[],nrm:[],col:[],mat:[],idx:[],n:0}; }
export function pv(M,x,y,z,nx,ny,nz,c,m){
  M.pos.push(x,y,z); M.nrm.push(nx,ny,nz); M.col.push(c[0],c[1],c[2]); M.mat.push(m||0);
  return M.n++;
}
export function pq(M,a,b,c,d){ M.idx.push(a,b,c, a,c,d); }
export function pt3(M,a,b,c){ M.idx.push(a,b,c); }
export function rotY(x,z,ca,sa){ return [x*ca - z*sa, x*sa + z*ca]; }

export function pbox(M, cx,cy,cz, hx,hy,hz, yaw, col, mat){
  const ca=Math.cos(yaw), sa=Math.sin(yaw);
  const P=(sx,sy,sz)=>{ const [x,z]=rotY(sx*hx, sz*hz, ca,sa); return [cx+x, cy+sy*hy, cz+z]; };
  const NF=(nx,nz)=>{ const [x,z]=rotY(nx,nz,ca,sa); return [x,0,z]; };
  const faces=[
    {q:[[ 1,-1,-1],[ 1,-1, 1],[ 1, 1, 1],[ 1, 1,-1]], n:NF(1,0)},
    {q:[[-1,-1, 1],[-1,-1,-1],[-1, 1,-1],[-1, 1, 1]], n:NF(-1,0)},
    {q:[[-1, 1,-1],[ 1, 1,-1],[ 1, 1, 1],[-1, 1, 1]], n:[0,1,0]},
    {q:[[-1,-1, 1],[ 1,-1, 1],[ 1,-1,-1],[-1,-1,-1]], n:[0,-1,0]},
    {q:[[-1,-1, 1],[-1, 1, 1],[ 1, 1, 1],[ 1,-1, 1]], n:NF(0,1)},
    {q:[[ 1,-1,-1],[ 1, 1,-1],[-1, 1,-1],[-1,-1,-1]], n:NF(0,-1)},
  ];
  for(const f of faces){
    const v=f.q.map(s=>{ const p=P(s[0],s[1],s[2]); return pv(M,p[0],p[1],p[2],f.n[0],f.n[1],f.n[2],col,mat); });
    pq(M,v[0],v[1],v[2],v[3]);
  }
}

export function pcyl(M, a, b, r0, r1, seg, col, mat, capA, capB){
  let t=[b[0]-a[0], b[1]-a[1], b[2]-a[2]];
  const L=Math.hypot(t[0],t[1],t[2])||1; t=[t[0]/L,t[1]/L,t[2]/L];
  let up=[0,1,0]; if(Math.abs(t[1])>0.94) up=[1,0,0];
  let s=[t[1]*up[2]-t[2]*up[1], t[2]*up[0]-t[0]*up[2], t[0]*up[1]-t[1]*up[0]];
  const sl=Math.hypot(s[0],s[1],s[2])||1; s=[s[0]/sl,s[1]/sl,s[2]/sl];
  const u=[t[1]*s[2]-t[2]*s[1], t[2]*s[0]-t[0]*s[2], t[0]*s[1]-t[1]*s[0]];
  const r0i=[], r1i=[];
  for(let i=0;i<seg;i++){
    const ang=i/seg*TAU, ca=Math.cos(ang), sa=Math.sin(ang);
    const nx=s[0]*ca+u[0]*sa, ny=s[1]*ca+u[1]*sa, nz=s[2]*ca+u[2]*sa;
    r0i.push(pv(M, a[0]+nx*r0, a[1]+ny*r0, a[2]+nz*r0, nx,ny,nz, col, mat));
    r1i.push(pv(M, b[0]+nx*r1, b[1]+ny*r1, b[2]+nz*r1, nx,ny,nz, col, mat));
  }
  for(let i=0;i<seg;i++){ const j=(i+1)%seg; pq(M, r0i[i], r1i[i], r1i[j], r0i[j]); }
  if(capB){ const c=pv(M,b[0],b[1],b[2],t[0],t[1],t[2],col,mat);
    for(let i=0;i<seg;i++){ const j=(i+1)%seg;
      const p1=pv(M, M.pos[r1i[i]*3],M.pos[r1i[i]*3+1],M.pos[r1i[i]*3+2],t[0],t[1],t[2],col,mat);
      const p2=pv(M, M.pos[r1i[j]*3],M.pos[r1i[j]*3+1],M.pos[r1i[j]*3+2],t[0],t[1],t[2],col,mat);
      pt3(M,c,p1,p2); } }
  if(capA){ const c=pv(M,a[0],a[1],a[2],-t[0],-t[1],-t[2],col,mat);
    for(let i=0;i<seg;i++){ const j=(i+1)%seg;
      const p1=pv(M, M.pos[r0i[i]*3],M.pos[r0i[i]*3+1],M.pos[r0i[i]*3+2],-t[0],-t[1],-t[2],col,mat);
      const p2=pv(M, M.pos[r0i[j]*3],M.pos[r0i[j]*3+1],M.pos[r0i[j]*3+2],-t[0],-t[1],-t[2],col,mat);
      pt3(M,c,p2,p1); } }
}

// gabled roof with an overhang; ridge runs along local X
export function proof(M, cx,cy,cz, hx,hz,hh, yaw, col, mat){
  const ca=Math.cos(yaw), sa=Math.sin(yaw);
  const P=(x,y,z)=>{ const [rx,rz]=rotY(x,z,ca,sa); return [cx+rx, cy+y, cz+rz]; };
  const A=P(-hx,0,-hz), B=P(hx,0,-hz), Cc=P(hx,0,hz), D=P(-hx,0,hz);
  const E=P(-hx,hh,0), F=P(hx,hh,0);
  const nA=(()=>{ const n=[0,hz,-hh]; const l=Math.hypot(n[1],n[2]); const [x,z]=rotY(0,n[2]/l,ca,sa); return [x, n[1]/l, z]; })();
  const nB=(()=>{ const n=[0,hz, hh]; const l=Math.hypot(n[1],n[2]); const [x,z]=rotY(0,n[2]/l,ca,sa); return [x, n[1]/l, z]; })();
  let v=[A,B,F,E].map(p=>pv(M,p[0],p[1],p[2],nA[0],nA[1],nA[2],col,mat)); pq(M,v[0],v[1],v[2],v[3]);
  v=[D,E,F,Cc].map(p=>pv(M,p[0],p[1],p[2],nB[0],nB[1],nB[2],col,mat)); pq(M,v[0],v[1],v[2],v[3]);
  const nE=(()=>{const [x,z]=rotY(-1,0,ca,sa); return [x,0,z];})();
  const nF=(()=>{const [x,z]=rotY( 1,0,ca,sa); return [x,0,z];})();
  let t=[A,E,D].map(p=>pv(M,p[0],p[1],p[2],nE[0],nE[1],nE[2],col,mat)); pt3(M,t[0],t[1],t[2]);
  t=[B,Cc,F].map(p=>pv(M,p[0],p[1],p[2],nF[0],nF[1],nF[2],col,mat)); pt3(M,t[0],t[1],t[2]);
}

export function finishPainted(M){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(M.pos),3));
  g.setAttribute('nrm',new THREE.BufferAttribute(new Float32Array(M.nrm),3));
  g.setAttribute('vcol',new THREE.BufferAttribute(new Float32Array(M.col),3));
  g.setAttribute('vmat',new THREE.BufferAttribute(new Float32Array(M.mat),1));
  g.setIndex(M.idx); g.computeBoundingSphere();
  return g;
}

export const PAINTED_VS = ()=> /* glsl */`
${GL_UNI}
in vec3 nrm; in vec3 vcol; in float vmat;
out vec3 vW; out vec3 vN; out vec3 vC; out float vM; out float vDist;
void main(){
  vec4 wp = modelMatrix*vec4(position,1.0);
  vW = wp.xyz; vN = normalize(mat3(modelMatrix)*nrm); vC=vcol; vM=vmat;
  vec4 mv = viewMatrix*wp; vDist=-mv.z;
  gl_Position = projectionMatrix*mv;
}`;

export const PAINTED_FS = ()=> /* glsl */`
precision highp float;
${GL_UNI}
${GL_PAL()}${GL_HASH}${GL_NOISE}${GL_TERRAIN}
${GL_CLOUDFIELD}${GL_SHADOW}${GL_LIGHT}${GL_AIR}
in vec3 vW; in vec3 vN; in vec3 vC; in float vM; in float vDist;
out vec4 outColor;
void main(){
  vec3 N=normalize(vN), V=normalize(uCamPos-vW);
  vec3 base = vC;
  float g = pn2(vW.xz*4.3 + vW.y*3.7)*0.5+0.5;
  float g2 = pn2(vW.xz*17.0 - vW.y*9.0)*0.5+0.5;
  base *= 0.90 + 0.20*g + 0.06*g2;

  // lit / mid / shade travel along a hue path, never a brightness ramp
  vec3 lit = base*1.12;
  vec3 mid = mix(base*0.76, K_AMB_SKY*0.22, 0.16);
  vec3 shd = mix(base*0.40, K_SHADOW*0.60, 0.44);
  float rim = 0.30, ao = 1.0;

  if(vM > 1.5 && vM < 2.5){                 // lit window
    float flick = 0.94 + 0.06*sin(uTime*2.1 + vW.x*3.1 + vW.z*1.7);
    outColor = vec4(SAFE3(base*2.4*flick + K_SUN*0.25), 0.0);
    return;
  }
  if(vM > 0.5 && vM < 1.5){                 // painted metal: crisper bands
    lit = base*1.25; mid = base*0.62;
    shd = mix(base*0.30, K_SHADOW*0.7, 0.5);
    rim = 0.62;
  }
  if(vM > 2.5){                             // glass / dark opening
    lit = mix(base, K_SKY_MID, 0.55); mid = base*0.7; shd = base*0.42; rim=0.75;
  }

  float ndl=dot(N,uSunDir);
  float sh=sunShadow(vW,ndl)*cloudShadow(vW);
  Surf s; s.N=N; s.V=V; s.P=vW; s.shade=shd; s.mid=mid; s.lit=lit;
  s.soft = mix(0.075, 0.19, clamp(vDist*0.004,0.0,1.0));
  s.jit = (vn2(vW.xz*3.9 + vW.y*1.7) - 0.5)*0.055;
  s.shadow=sh; s.trans=0.0; s.transCol=vec3(0.0);
  s.rim=rim; s.ao=ao; s.ambient=1.0;
  vec3 col=paint(s);
  col=aerial(col,vDist,V,vW.y);
  outColor = vec4(SAFE3(col), gFogAmt);
}`;
