// Twin Moon River — keyboard + gamepad + touch merged into one input sample per frame.
//   sample() -> { up, down, left, right, jump, jumpPressed, start, pause, restart, touch }
// jumpPressed / start / pause / restart are edges: true for one sample only.
export class Input {
  constructor(el) {
    this.keys = new Set();
    this.edges = new Set();
    this.touch = { active: false, id: null, x0: 0, y0: 0, x: 0, t0: 0, moved: false, used: false };
    this.touchMode = false;
    this.padPrev = {};
    const key = e => {
      const k = e.code;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
      if (e.type === 'keydown') {
        if (!e.repeat) {
          if (k === 'Space') this.edges.add('jump');
          if (k === 'Enter') this.edges.add('start');
          if (k === 'KeyP' || k === 'Escape') this.edges.add('pause');
          if (k === 'KeyR') this.edges.add('restart');
        }
        this.keys.add(k);
      } else this.keys.delete(k);
    };
    addEventListener('keydown', key);
    addEventListener('keyup', key);
    addEventListener('blur', () => this.keys.clear());

    // touch: the hero runs / rows by itself; drag sideways to steer, tap to jump / throw / let go, hold to duck
    el.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse') { this.edges.add('start'); return; }
      this.touchMode = true; this.edges.add('start');
      Object.assign(this.touch, { active: true, id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, t0: performance.now(), moved: false, used: false });
    });
    el.addEventListener('pointermove', e => {
      if (!this.touch.active || e.pointerId !== this.touch.id) return;
      this.touch.x = e.clientX;
      if (Math.hypot(e.clientX - this.touch.x0, e.clientY - this.touch.y0) > 18) this.touch.moved = true;
    });
    const end = e => {
      if (!this.touch.active || e.pointerId !== this.touch.id) return;
      if (!this.touch.moved && performance.now() - this.touch.t0 < 260) this.edges.add('jump');
      this.touch.active = false;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  sample() {
    const k = this.keys;
    const s = {
      up: k.has('ArrowUp') || k.has('KeyW'),
      left: k.has('ArrowLeft') || k.has('KeyA'),
      right: k.has('ArrowRight') || k.has('KeyD'),
      down: k.has('ArrowDown') || k.has('KeyS'),
      jump: k.has('Space'),
      jumpPressed: this.edges.has('jump'), start: this.edges.has('start'), pause: this.edges.has('pause'), restart: this.edges.has('restart'),
      touch: this.touchMode,
    };
    this.edges.clear();

    const pad = navigator.getGamepads?.()[0];
    if (pad) {
      const b = i => !!pad.buttons[i]?.pressed, edge = i => b(i) && !this.padPrev[i];
      const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
      s.up ||= ay < -0.4 || b(12) || b(7);
      s.left ||= ax < -0.35 || b(14);
      s.right ||= ax > 0.35 || b(15);
      s.down ||= ay > 0.4 || b(13) || b(6);
      s.jump ||= b(0);
      s.jumpPressed ||= edge(0);
      s.start ||= edge(9) || edge(0);
      s.pause ||= edge(8);
      for (const i of [0, 8, 9]) this.padPrev[i] = b(i);
    }

    if (this.touchMode) {
      s.up = true;
      const t = this.touch;
      if (t.active) {
        const dx = (t.x - t.x0) / 50;
        if (dx < -0.3) s.left = true; else if (dx > 0.3) s.right = true;
        if (!t.moved && performance.now() - t.t0 > 260) s.jump = true;
      }
    }
    return s;
  }
}
