// Keyboard + mouse with pointer lock. Exposes edge-triggered "pressed" queries
// so gameplay code can ask "was this tapped this frame?" without its own bookkeeping.

export class Input {
  constructor(target) {
    this.target = target;
    this.down = new Set();       // physical codes currently held
    this.pressed = new Set();    // went down since last endFrame()
    this.released = new Set();
    this.mouse = { dx: 0, dy: 0, wheel: 0, buttons: 0 };
    this.locked = false;
    this.sensitivity = 0.0022;
    this.invertY = false;
    this.enabled = true;
    this.onLockChange = null;

    this._onKeyDown = (e) => {
      if (e.code === 'F5' || (e.ctrlKey && e.code === 'KeyR')) return; // let reload through
      if (this.enabled && LOCKED_KEYS.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
    };
    this._onKeyUp = (e) => {
      this.down.delete(e.code);
      this.released.add(e.code);
    };
    this._onBlur = () => { this.down.clear(); this.mouse.buttons = 0; };
    this._onMouseMove = (e) => {
      if (!this.locked || !this.enabled) return;
      this.mouse.dx += e.movementX || 0;
      this.mouse.dy += e.movementY || 0;
    };
    this._onMouseDown = (e) => {
      if (!this.locked) return;
      this.mouse.buttons |= 1 << e.button;
      this.pressed.add('Mouse' + e.button);
      this.down.add('Mouse' + e.button);
    };
    this._onMouseUp = (e) => {
      this.mouse.buttons &= ~(1 << e.button);
      this.released.add('Mouse' + e.button);
      this.down.delete('Mouse' + e.button);
    };
    this._onWheel = (e) => {
      if (!this.locked) return;
      e.preventDefault();
      this.mouse.wheel += Math.sign(e.deltaY);
    };
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.target;
      if (!this.locked) { this.down.clear(); this.mouse.buttons = 0; }
      if (this.onLockChange) this.onLockChange(this.locked);
    };

    window.addEventListener('keydown', this._onKeyDown, { passive: false });
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('wheel', this._onWheel, { passive: false });
    document.addEventListener('pointerlockchange', this._onLockChange);
    document.addEventListener('contextmenu', (e) => { if (this.locked) e.preventDefault(); });
  }

  requestLock() {
    if (!this.locked && this.target.requestPointerLock) {
      const p = this.target.requestPointerLock();
      // Chrome 113+ returns a promise that rejects if the doc isn't focused; ignore.
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  }
  exitLock() { if (this.locked && document.exitPointerLock) document.exitPointerLock(); }

  isDown(code) { return this.down.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  wasReleased(code) { return this.released.has(code); }
  /** true if any of the given codes is held */
  anyDown(...codes) { return codes.some((c) => this.down.has(c)); }
  consume(code) { const had = this.pressed.has(code); this.pressed.delete(code); return had; }

  /** Accumulated look delta in radians since the last endFrame(). */
  lookDelta() {
    const dx = this.mouse.dx * this.sensitivity;
    const dy = this.mouse.dy * this.sensitivity * (this.invertY ? -1 : 1);
    return { yaw: -dx, pitch: -dy };
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
  }
}

// Keys the browser would otherwise scroll/quick-find with.
const LOCKED_KEYS = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Slash', 'Quote',
]);
