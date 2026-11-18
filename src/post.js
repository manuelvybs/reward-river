// Reward River — post: soft bloom, a warm grade with a vignette, and a frame-rate watchdog.
//   ?lowq  no bloom, no shadows      ?hiq  never downgrade
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uSat: { value: 1.06 }, uContrast: { value: 1.05 }, uWarm: { value: 0.035 }, uVignette: { value: 0.28 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uSat, uContrast, uWarm, uVignette; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c = (c - 0.18) * uContrast + 0.18;                         // around linear mid-grey
      c *= vec3(1.0 + uWarm, 1.0 + uWarm * 0.2, 1.0 - uWarm);    // golden-hour warmth
      float d = distance(vUv, vec2(0.5));
      c *= 1.0 - uVignette * smoothstep(0.38, 0.9, d);
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`,
};

export class Post {
  constructor(renderer, scene, camera, q) {
    this.renderer = renderer;
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.22, 0.5, 0.97);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.low = q.has('lowq'); this.lock = q.has('hiq');
    if (this.low) { this.bloom.enabled = false; renderer.shadowMap.enabled = false; }
    this.win = { t: 0, frames: 0 }; this.level = this.low ? 2 : 0; this.fps = 60;
  }

  setSize(w, h) { this.composer.setSize(w, h); this.bloom.setSize(w, h); }

  // drop bloom, then shadows, when the frame rate stays low (only while playing)
  watch(dt, playing) {
    if (!playing || this.lock) return;
    const w = this.win; w.t += dt; w.frames++;
    if (w.t < 3) return;
    this.fps = w.frames / w.t; w.t = 0; w.frames = 0;
    if (this.fps < 40 && this.level < 2) {
      this.level++;
      if (this.level === 1) this.bloom.enabled = false;
      if (this.level === 2) { this.renderer.shadowMap.enabled = false; this.renderer.shadowMap.needsUpdate = true; }
      console.info(`quality down to ${this.level} (${this.fps.toFixed(0)} fps)`);
    }
  }

  render() { this.composer.render(); }
}
