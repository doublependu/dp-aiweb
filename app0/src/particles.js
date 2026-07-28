import * as THREE from 'three';
import { C, CFG } from './core/config.js';
import { TAU, clamp, lerp, rng } from './core/math.js';
import { GL_UNI, GL_PAL, GL_HASH, GL_NOISE, GL_CLOUDFIELD, GL_LIGHT, GL_AIR, VHEAD, FHEAD } from './core/glsl.js';
import { TRANSP } from './core/engine.js';
import { sampleHeight } from './terrain.js';
import { windAtJS, WindSys } from './wind.js';

export class Particles {
  constructor(scene, uni, max, fragShader, order, sort){
    this.max=max; this.n=0; this.sort = !!sort;
    this.p = new Float32Array(max*4);       // x,y,z,size
    this.q = new Float32Array(max*4);       // age01, seed, opacity, kind
    this.data = new Array(max);
    for(let i=0;i<max;i++) this.data[i]={alive:false,x:0,y:0,z:0,vx:0,vy:0,vz:0,age:0,life:1,size:1,seed:0,kind:0,op:1};
    const g=new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1,-1,0, 1,-1,0, 1,1,0, -1,1,0]),3));
    g.setIndex([0,1,2, 0,2,3]);
    this.aP=new THREE.InstancedBufferAttribute(this.p,4); this.aP.setUsage(THREE.DynamicDrawUsage);
    this.aQ=new THREE.InstancedBufferAttribute(this.q,4); this.aQ.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iP', this.aP); g.setAttribute('iQ', this.aQ);
    g.instanceCount=0;
    g.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,0,0), 1e6);
    this.geom=g;
    this.mat=new THREE.RawShaderMaterial(Object.assign({
      vertexShader: VHEAD + PARTICLE_VS(), fragmentShader: FHEAD + fragShader,
      uniforms: uni, glslVersion: THREE.GLSL3, side:THREE.DoubleSide,
    }, TRANSP));
    this.mesh=new THREE.Mesh(g,this.mat);
    this.mesh.frustumCulled=false; this.mesh.renderOrder=order||20;
    scene.add(this.mesh);
    this.free=[]; for(let i=max-1;i>=0;i--) this.free.push(i);
  }
  spawn(o){
    if(!this.free.length) return null;
    const i=this.free.pop(); const d=this.data[i];
    d.alive=true; Object.assign(d,o);
    if(o.age===undefined) d.age=0;
    return d;
  }
  commit(camPos){
    let k=0;
    if(this.sort){
      const order=this._ord || (this._ord=[]);
      order.length=0;
      for(let i=0;i<this.max;i++){ const d=this.data[i]; if(!d.alive) continue;
        const dx=d.x-camPos.x, dy=d.y-camPos.y, dz=d.z-camPos.z;
        order.push(dx*dx+dy*dy+dz*dz, i); }
      const pairs=this._pairs || (this._pairs=[]);
      pairs.length=0;
      for(let i=0;i<order.length;i+=2) pairs.push(i);
      pairs.sort((a,b)=>order[b]-order[a]);
      for(const pi of pairs){
        const d=this.data[order[pi+1]];
        this.p[k*4]=d.x; this.p[k*4+1]=d.y; this.p[k*4+2]=d.z; this.p[k*4+3]=d.size;
        this.q[k*4]=clamp(d.age/d.life,0,1); this.q[k*4+1]=d.seed; this.q[k*4+2]=d.op; this.q[k*4+3]=d.kind;
        k++;
      }
    } else {
      for(let i=0;i<this.max;i++){ const d=this.data[i]; if(!d.alive) continue;
        this.p[k*4]=d.x; this.p[k*4+1]=d.y; this.p[k*4+2]=d.z; this.p[k*4+3]=d.size;
        this.q[k*4]=clamp(d.age/d.life,0,1); this.q[k*4+1]=d.seed; this.q[k*4+2]=d.op; this.q[k*4+3]=d.kind;
        k++; }
    }
    this.n=k; this.geom.instanceCount=k;
    if(k>0){ this.aP.needsUpdate=true; this.aQ.needsUpdate=true; }
  }
  kill(d){ d.alive=false; const i=this.data.indexOf(d); if(i>=0) this.free.push(i); }
}

export const PARTICLE_VS = ()=> /* glsl */`
${GL_UNI}
in vec4 iP; in vec4 iQ;
out vec2 vC; out float vAge; out float vSeed; out float vOp; out float vKind;
out vec3 vW; out vec3 vR; out vec3 vU; out vec3 vF; out float vDist;
void main(){
  vR = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
  vU = normalize(vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]));
  vF = normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]));
  vC = position.xy; vAge=iQ.x; vSeed=iQ.y; vOp=iQ.z; vKind=iQ.w;
  float rot = iQ.y*6.2831 + iQ.x*0.9;
  float cr=cos(rot), sr=sin(rot);
  vec2 c = vec2(position.x*cr - position.y*sr, position.x*sr + position.y*cr);
  float sz = iP.w;
  if(!(sz > 0.0) || !(sz < 400.0) || !(dot(iP.xyz,iP.xyz) < 1.0e12)){
    gl_Position = vec4(2.0,2.0,2.0,1.0); return;   // never let a bad particle
  }                                                // become a black square
  vec3 wp = iP.xyz + vR*(c.x*sz) + vU*(c.y*sz);
  vW = wp;
  vec4 mv = viewMatrix*vec4(wp,1.0); vDist=-mv.z;
  gl_Position = projectionMatrix*mv;
}`;

export const SMOKE_FS = ()=> /* glsl */`
precision highp float;
${GL_UNI}
${GL_PAL()}${GL_HASH}${GL_NOISE}${GL_CLOUDFIELD}${GL_LIGHT}${GL_AIR}
uniform sampler2D uPuff;
in vec2 vC; in float vAge; in float vSeed; in float vOp; in float vKind;
in vec3 vW; in vec3 vR; in vec3 vU; in vec3 vF; in float vDist;
out vec4 outColor;
void main(){
  float r=length(vC);
  if(!(r <= 1.0)) discard;                 // NaN-safe
  vec2 tile = vec2(mod(floor(vSeed*8.0), 2.0), mod(floor(vSeed*3.0), 2.0));
  vec4 pf = texture(uPuff, (clamp(vC,-1.0,1.0)*0.5 + 0.5)*0.5 + tile*0.5);
  // as in CLOUD_FS: an analytic radial falloff on top of the baked profile, so
  // a puff can never degenerate into a hard opaque square
  float a = pf.a * smoothstep(1.0, 0.55, r);
  float den = pf.g;
  float R = 0.78;
  a *= mix(0.5,1.0,den);
  // dissipate: thins and frays with age
  a *= vOp * (1.0 - smoothstep(0.45, 1.0, vAge));
  a *= mix(1.0, den, smoothstep(0.3,1.0,vAge));
  if(!(a > 0.004)) discard;

  float zz=sqrt(max(0.0,1.0-min(r,1.0)*min(r,1.0)));
  vec3 N=normalize(vR*vC.x + vU*vC.y + vF*zz*0.9 + vec3(0.0,0.42,0.0));
  vec3 V=normalize(uCamPos-vW);
  float ndl=dot(N,uSunDir);
  float t=clamp(ndl*0.5+0.5,0.0,1.0)*mix(0.75,1.05,den);
  vec3 fresh = mix(${C.smokeOld}, ${C.smokeNew}, 1.0-smoothstep(0.05,0.85,vAge));
  vec3 lit = fresh*1.06;
  vec3 mid = mix(fresh*0.80, K_C_UNDER, 0.35);
  vec3 shd = mix(K_C_CORE, K_SHADOW, 0.30)*mix(1.0,0.72,vKind);
  vec3 col = ramp3(t, shd, mid, lit, 0.16, (den-0.5)*0.08);
  float back = clamp(dot(V,-uSunDir),0.0,1.0);
  col += K_SUN * pow(back, 3.4) * 0.62 * (1.0 - smoothstep(0.4,1.0,vAge));
  col = mix(col, K_C_RIM, pf.b*pow(back,1.4)*0.55);
  col = aerial(col, vDist, V, vW.y);
  outColor = vec4(SAFE3(col), clamp(a, 0.0, 1.0));
}`;

export const MOTE_FS = ()=> /* glsl */`
precision highp float;
${GL_UNI}
${GL_PAL()}${GL_HASH}${GL_NOISE}${GL_AIR}
in vec2 vC; in float vAge; in float vSeed; in float vOp; in float vKind;
in vec3 vW; in vec3 vR; in vec3 vU; in vec3 vF; in float vDist;
out vec4 outColor;
void main(){
  float r=length(vC);
  if(!(r <= 1.0)) discard;                 // NaN-safe
  float a = smoothstep(1.0, 0.15, r);
  a *= a;
  vec3 V=normalize(uCamPos-vW);
  // motes flare when they cross the sun vector
  float back = clamp(dot(V,-uSunDir),0.0,1.0);
  float flare = pow(back, 3.0);
  vec3 col = mix(vec3(0.86,0.88,0.78), K_SUN*1.5, 0.35+0.65*flare);
  col *= 0.55 + 1.5*flare;
  a *= vOp * (0.16 + 0.72*flare) * (1.0 - smoothstep(0.85,1.0,vAge));
  if(!(a > 0.004)) discard;                // NaN-safe
  outColor = vec4(SAFE3(col), clamp(a,0.0,1.0));
}`;

export const BIRD_FS = ()=> /* glsl */`
precision highp float;
${GL_UNI}
${GL_PAL()}${GL_HASH}${GL_NOISE}${GL_AIR}
in vec2 vC; in float vAge; in float vSeed; in float vOp; in float vKind;
in vec3 vW; in vec3 vR; in vec3 vU; in vec3 vF; in float vDist;
out vec4 outColor;
void main(){
  // a painted gull silhouette: two swept wings that flap
  vec2 c = vC;
  float flap = sin(vAge*6.2831*4.0 + vSeed*17.0);
  float y = -abs(c.x)*(0.55 + 0.55*flap) + 0.06;
  float d = abs(c.y - y);
  float body = smoothstep(0.30, 0.05, d) * smoothstep(1.0, 0.85, abs(c.x));
  float head = smoothstep(0.18, 0.0, length(c - vec2(0.0, 0.10)));
  float a = clamp(body + head, 0.0, 1.0) * vOp;
  if(!(a > 0.02)) discard;                 // NaN-safe
  vec3 V = normalize(uCamPos - vW);
  vec3 col = mix(vec3(0.16,0.18,0.24), K_HAZE, 0.35);
  col = mix(col, K_SUN*0.9, pow(clamp(dot(V,-uSunDir),0.0,1.0),2.0)*0.45);
  col = aerial(col, vDist, V, vW.y);
  outColor = vec4(SAFE3(col), clamp(a, 0.0, 1.0));
}`;



/*──────────────────────────── life: motes & birds ──────────────────────────*/
export const MOTE_N = 2200;
export function initMotes(motes){
  const r=rng(1717);
  for(let i=0;i<MOTE_N;i++){
    const a=r()*TAU, rr=Math.sqrt(r())*30;
    const x=CFG.spawn.x+Math.cos(a)*rr, z=CFG.spawn.z+Math.sin(a)*rr;
    motes.spawn({ x, y:sampleHeight(x,z)+0.2+r()*9, z,
      vx:0,vy:0,vz:0, life:1e7, size:0.014, seed:r()*100, kind:0, op:0.55+r()*0.45 });
  }
}
/*  2,200 pollen motes each wanted a heightmap lookup and a full JS wind-field
    evaluation every frame — several milliseconds of pure CPU for something the
    eye reads as drifting dust.  Integrating a third of them per frame at 3x the
    timestep is visually identical and costs a third as much.                  */
let _motePhase = 0;
export function updateMotes(dt, cam, motes){
  const t = WindSys.time;
  const STRIDE = 3;
  _motePhase = (_motePhase + 1) % STRIDE;
  dt *= STRIDE;
  for(let i=_motePhase;i<motes.max;i+=STRIDE){
    const d=motes.data[i]; if(!d.alive) continue;
    const g = sampleHeight(d.x,d.z);
    const h = Math.max(0.05, d.y-g);
    const w = windAtJS(d.x, d.z, h);
    // drag toward the air, plus buoyancy and a little swirl
    const drag = 3.1;
    d.vx += (w.x - d.vx)*clamp(drag*dt,0,1);
    d.vz += (w.z - d.vz)*clamp(drag*dt,0,1);
    const swirl = Math.sin(t*1.7 + d.seed*3.1)*0.32 + Math.sin(t*0.63 + d.seed*7.7)*0.22;
    d.vy += (0.16 + swirl*0.5 - d.vy*1.4)*clamp(dt*2.2,0,1);
    d.x += d.vx*dt; d.y += d.vy*dt; d.z += d.vz*dt;
    if(d.y < g+0.06){ d.y = g+0.06; d.vy = Math.abs(d.vy)*0.3 + 0.2; }
    // keep the swarm around the walker
    const dx=d.x-cam.position.x, dz=d.z-cam.position.z;
    const dd=Math.hypot(dx,dz);
    if(dd > 34 || d.y-g > 13){
      const a=Math.random()*TAU, rr=Math.sqrt(Math.random())*26;
      d.x = cam.position.x+Math.cos(a)*rr; d.z = cam.position.z+Math.sin(a)*rr;
      d.y = sampleHeight(d.x,d.z)+0.15+Math.random()*7;
      d.vx=d.vy=d.vz=0;
    }
    const dist = Math.hypot(d.x-cam.position.x, d.y-cam.position.y, d.z-cam.position.z);
    d.size = clamp(Math.max(0.012, dist*0.0021), 0.01, 1.2);
    d.age = 0;
    if(!isFinite(d.x+d.y+d.z)){ d.x=cam.position.x; d.z=cam.position.z;
      d.y=sampleHeight(d.x,d.z)+2; d.vx=d.vy=d.vz=0; }
  }
}
export const BIRDS=[];
export function initBirds(birdsP){
  const r=rng(2929);
  for(let i=0;i<34;i++){
    const a=r()*TAU, rr=120+r()*260;
    const b={ x:CFG.spawn.x+Math.cos(a)*rr, z:CFG.spawn.z+Math.sin(a)*rr,
      y:0, vx:(r()-0.5)*8, vy:0, vz:(r()-0.5)*8, ph:r(), p:null };
    b.y = sampleHeight(b.x,b.z)+45+r()*45;
    b.p = birdsP.spawn({x:b.x,y:b.y,z:b.z, life:1, size:1.15, seed:r()*100, kind:0, op:1, age:r()});
    BIRDS.push(b);
  }
}
export function updateBirds(dt, t, birdsP){
  const cx=CFG.spawn.x-120, cz=CFG.spawn.z+40;
  for(let i=0;i<BIRDS.length;i++){
    const b=BIRDS[i];
    let sx=0,sz=0,sy=0, ax=0,ay=0,az=0, gx=0,gy=0,gz=0, n=0;
    for(let j=0;j<BIRDS.length;j++){
      if(i===j) continue;
      const o=BIRDS[j];
      const dx=o.x-b.x, dy=o.y-b.y, dz=o.z-b.z;
      const d2=dx*dx+dy*dy+dz*dz;
      if(d2 < 900){
        n++; gx+=o.x; gy+=o.y; gz+=o.z; ax+=o.vx; ay+=o.vy; az+=o.vz;
        if(d2 < 90){ const d=Math.sqrt(d2)+1e-3; sx-=dx/d; sy-=dy/d; sz-=dz/d; }
      }
    }
    if(n){ gx/=n; gy/=n; gz/=n; ax/=n; ay/=n; az/=n;
      b.vx += ((gx-b.x)*0.06 + (ax-b.vx)*0.16 + sx*2.2)*dt*4;
      b.vy += ((gy-b.y)*0.05 + (ay-b.vy)*0.16 + sy*2.2)*dt*4;
      b.vz += ((gz-b.z)*0.06 + (az-b.vz)*0.16 + sz*2.2)*dt*4;
    }
    // wander, and a long slow orbit of the valley
    b.vx += (Math.sin(t*0.31+b.ph*9)*2.4 + (cx-b.x)*0.010)*dt;
    b.vz += (Math.cos(t*0.27+b.ph*7)*2.4 + (cz-b.z)*0.010)*dt;
    const ground = sampleHeight(b.x,b.z);
    const want = ground + 62 + Math.sin(t*0.2+b.ph*5)*22;
    b.vy += (want-b.y)*0.22*dt*4;
    const w = windAtJS(b.x,b.z,40);
    b.vx += w.x*0.30*dt; b.vz += w.z*0.30*dt;
    const sp=Math.hypot(b.vx,b.vy,b.vz);
    if(sp>0.01){ const k=lerp(1, 11.5/sp, clamp(dt*1.5,0,1)); b.vx*=k; b.vy*=k; b.vz*=k; }
    b.x+=b.vx*dt; b.y+=b.vy*dt; b.z+=b.vz*dt;
    const p=b.p;
    p.x=b.x; p.y=b.y; p.z=b.z;
    // flap fast when climbing, glide when descending
    const climb = clamp(b.vy*0.25+0.5, 0, 1);
    p.age = (p.age + dt*(0.9+1.5*climb)) % 1;
    p.op = 0.92;
    p.size = 1.05 + climb*0.25;
  }
}
export function updateSmoke(dt, smoke){
  for(let i=0;i<smoke.max;i++){
    const d=smoke.data[i]; if(!d.alive) continue;
    d.age += dt;
    if(d.age >= d.life){ smoke.kill(d); continue; }
    const u = d.age/d.life;
    const w = windAtJS(d.x, d.z, Math.max(1, d.y - sampleHeight(d.x,d.z)));
    // buoyancy decays as the puff cools and mixes with the air
    const buoy = (d.kind===1 ? 1.5 : 4.2) * Math.exp(-d.age*0.42);
    d.vy += (buoy - d.vy)*clamp(dt*1.3,0,1);
    const mix = clamp(dt*(0.55 + u*1.6), 0, 1);
    d.vx += (w.x - d.vx)*mix;
    d.vz += (w.z - d.vz)*mix;
    d.x += d.vx*dt; d.y += d.vy*dt; d.z += d.vz*dt;
    d.size += dt*(d.kind===1 ? 0.55 : 1.55)*(1.0 - u*0.5);
    d.size = clamp(d.size, 0.05, 60);
    d.op = (d.kind===1?0.55:0.95) * (1 - u*0.15);
    if(!isFinite(d.x+d.y+d.z+d.size)) smoke.kill(d);
  }
}
export let villSmokeT=0;
export function emitVillageSmoke(dt, smoke, villageSmokers){
  villSmokeT -= dt;
  if(villSmokeT>0 || !villageSmokers.length) return;
  villSmokeT = 0.55;
  const s = villageSmokers[(Math.random()*villageSmokers.length)|0];
  smoke.spawn({ x:s.x+(Math.random()-0.5)*0.2, y:s.y, z:s.z+(Math.random()-0.5)*0.2,
    vx:0, vy:1.5, vz:0, life:22+Math.random()*10, size:0.5+Math.random()*0.4,
    seed:Math.random()*100, kind:1, op:0.5 });
}
