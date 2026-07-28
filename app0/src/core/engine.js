import * as THREE from 'three';
import { CFG } from './config.js';
import { DEG } from './math.js';
import { VHEAD, FHEAD } from './glsl.js';

/*──────── core renderer / scene / shared uniforms ────────*/
export const DEPTH_FS = /* glsl */`
precision mediump float;
out vec4 o;
void main(){ o = vec4(1.0); }`;

export const renderer = new THREE.WebGLRenderer({ antialias:false, powerPreference:'high-performance',
  stencil:false, alpha:false });
renderer.setClearColor(0x0e1219, 1);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;   // we encode sRGB ourselves
renderer.autoClear = false;
document.querySelector('#app').appendChild(renderer.domElement);
export const gl = renderer.getContext();
export const hasFloatLinear = !!gl.getExtension('OES_texture_float_linear');
gl.getExtension('EXT_color_buffer_float');
gl.getExtension('EXT_color_buffer_half_float');
gl.getExtension('EXT_float_blend');

export const scene  = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(CFG.fov, 1, 0.12, 14000);
export const sunCam = new THREE.OrthographicCamera(-1,1,1,-1, 1, 1400);
sunCam.matrixWorldAutoUpdate = true;
export const reflCam = new THREE.PerspectiveCamera(CFG.fov, 1, 0.12, 14000);
reflCam.matrixWorldAutoUpdate = false;

export const SUN = (()=>{
  const el=CFG.sunElev*DEG, az=CFG.sunAzim*DEG;
  return new THREE.Vector3(Math.sin(az)*Math.cos(el), Math.sin(el), Math.cos(az)*Math.cos(el)).normalize();
})();

export const G = {
  uTime:        { value:0 },
  uSunDir:      { value:SUN.clone() },
  uCamPos:      { value:new THREE.Vector3() },
  uWindOrigin:  { value:new THREE.Vector2() },
  uCloudDrift:  { value:new THREE.Vector2() },
  uMeanWind:    { value:new THREE.Vector2(3,1) },
  uWindTex:     { value:null },
  uHeight:      { value:null },
  uSplat:       { value:null },
  uMeadow:      { value:null },
  uShadowMap:   { value:null },
  uCloudSh:     { value:null },
  uCloudShOrigin:{ value:new THREE.Vector2() },
  uLightMat:    { value:new THREE.Matrix4() },
  uShadowTexel: { value:1/2048 },
  uPuff:        { value:null },
  uProxyC:      { value:new THREE.Vector2() },
  uShadowC:     { value:new THREE.Vector2() },
  uCull:        { value:new THREE.Vector4(0,0,-1.1,0) },
  uWindLag:     { value:new THREE.Vector2() },
  uCloudAmount: { value:1.0 },
  uFogMul:      { value:1.0 },
};
export const U = extra => Object.assign({}, G, extra||{});
export const RSM = (vs, fs, uni, opt)=> new THREE.RawShaderMaterial(Object.assign({
  vertexShader: VHEAD + vs, fragmentShader: FHEAD + fs,
  uniforms: uni, glslVersion: THREE.GLSL3,
}, opt||{}));
// Every depth-only material: the shadow map's colour attachment is written by
// the driver and never read by anything, which is ~16 MB of pointless
// bandwidth per shadow pass.  colorWrite:false also lets the hardware take its
// double-speed depth-only path.
export const DSM = (vs, uni, opt)=> RSM(vs, DEPTH_FS, uni,
  Object.assign({ colorWrite:false }, opt||{}));
export const TRANSP = {
  transparent:true, depthWrite:false, blending:THREE.CustomBlending,
  blendSrc:THREE.SrcAlphaFactor, blendDst:THREE.OneMinusSrcAlphaFactor,
  blendEquation:THREE.AddEquation,
  blendSrcAlpha:THREE.ZeroFactor, blendDstAlpha:THREE.OneFactor,
  blendEquationAlpha:THREE.AddEquation,
};

/*──────── fullscreen quad plumbing ────────*/
export const quadGeo = (()=>{
  const g=new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1,-1,0, 3,-1,0, -1,3,0]),3));
  g.setAttribute('uv',       new THREE.BufferAttribute(new Float32Array([0,0, 2,0, 0,2]),2));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 10);
  return g;
})();
export const quadCam = new THREE.Camera();
export const quadScene = new THREE.Scene();
export const quadMesh = new THREE.Mesh(quadGeo, null);
quadMesh.frustumCulled=false; quadScene.add(quadMesh);
export function blit(mat, target){
  quadMesh.material = mat;
  renderer.setRenderTarget(target||null);
  renderer.render(quadScene, quadCam);
}
export const postMat = (fs, uni)=> new THREE.RawShaderMaterial({
  vertexShader:'precision highp float;\nin vec3 position;\nin vec2 uv;\nout vec2 vUv;\nvoid main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
  fragmentShader:'precision highp float;\n'+fs, uniforms:uni, glslVersion:THREE.GLSL3, depthTest:false, depthWrite:false });

