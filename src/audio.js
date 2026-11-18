// Twin Moon River — sound. WebAudio, started by the first key / tap / pad press (browsers block audio before that).
//   one-shots: play(name, vol, rate)     loops: loop(name, vol, rate) every frame (smoothed), vol 0 = silent
//   music: music(name) crossfades        mute(): toggles the master
export const ONESHOTS = ['steps', 'step_stone', 'jump', 'land', 'stumble', 'rope_throw', 'swing_whoosh', 'paddle', 'bump',
  'splash_big', 'duck', 'beam_hit', 'collect', 'respawn', 'board'];
export const LOOPS = ['rope_creak', 'waterfall', 'canyon', 'river', 'rapids', 'raft_creak'];
export const MUSIC = ['music_canyon', 'music_river', 'music_end'];

export class Sound {
  constructor(base = 'assets/audio/') {
    this.base = base;
    this.ctx = null; this.buf = {}; this.loops = {}; this.track = null; this.trackName = null; this.wantTrack = null;
    this.muted = new URLSearchParams(location.search).has('mute');
    this.ready = false; this.errors = [];
  }

  async start() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    const comp = ctx.createDynamicsCompressor();             // keeps the loud beds (rapids) from burying the music and cues
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
    comp.connect(ctx.destination);
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.9; this.master.connect(comp);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 1; this.sfx.connect(this.master);
    this.bus = ctx.createGain(); this.bus.gain.value = 0.38; this.bus.connect(this.master);
    const load = async n => {
      try {
        const r = await fetch(`${this.base}${n}.mp3`);
        if (!r.ok) throw new Error(`${r.status}`);
        this.buf[n] = await ctx.decodeAudioData(await r.arrayBuffer());
      } catch (e) { this.errors.push(`${n}: ${e.message}`); console.warn('sound missing', n, e.message); }
    };
    await Promise.all([...ONESHOTS, ...LOOPS, ...MUSIC].map(load));
    this.ready = true;
    if (this.wantTrack) { const w = this.wantTrack; this.wantTrack = null; this.music(w); }
  }

  mute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  play(name, vol = 1, rate = 1) {
    if (!this.ready || !this.buf[name]) return;
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
    s.buffer = this.buf[name]; s.playbackRate.value = rate; g.gain.value = vol;
    s.connect(g); g.connect(this.sfx); s.start();
  }

  loop(name, vol = 1, rate = 1) {
    if (!this.ready || !this.buf[name]) return;
    let L = this.loops[name];
    if (!L) {
      if (vol < 0.005) return;
      const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
      s.buffer = this.buf[name]; s.loop = true; g.gain.value = 0; s.connect(g); g.connect(this.sfx);
      s.start(0, Math.random() * s.buffer.duration);
      L = this.loops[name] = { s, g, vol: -1, rate: -1 };
    }
    if (Math.abs(vol - L.vol) > 0.01) { L.vol = vol; L.g.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.25); }
    if (Math.abs(rate - L.rate) > 0.01) { L.rate = rate; L.s.playbackRate.setTargetAtTime(rate, this.ctx.currentTime, 0.2); }
  }

  music(name, vol = 1, fade = 2) {
    if (!this.ready) { this.wantTrack = name; return; }
    if (this.trackName === name) return;
    const t = this.ctx.currentTime;
    if (this.track) { const old = this.track; old.g.gain.setTargetAtTime(0, t, fade / 3); setTimeout(() => { try { old.s.stop(); } catch (e) { /* already stopped */ } }, fade * 2000); }
    this.trackName = name; this.track = null;
    if (!name || !this.buf[name]) return;
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
    s.buffer = this.buf[name]; s.loop = name !== 'music_end'; g.gain.value = 0;
    s.connect(g); g.connect(this.bus); s.start();
    g.gain.setTargetAtTime(vol, t, fade / 3);
    this.track = { s, g };
  }
}
