// Keyboard input manager — tracks currently-held keys (state, not events)
// so simultaneous movement + attack works naturally.

export class InputManager {
  constructor() {
    this.held = new Set();
    this.pressedThisTick = new Set(); // one-shot for attack triggers
    this._onDown = this._onDown.bind(this);
    this._onUp = this._onUp.bind(this);
  }

  attach() {
    window.addEventListener('keydown', this._onDown);
    window.addEventListener('keyup', this._onUp);
    // If the tab loses focus while a key is held, clear state
    window.addEventListener('blur', () => this.clear());
  }

  detach() {
    window.removeEventListener('keydown', this._onDown);
    window.removeEventListener('keyup', this._onUp);
  }

  clear() {
    this.held.clear();
    this.pressedThisTick.clear();
  }

  _onDown(e) {
    // Prevent default for game keys so page doesn't scroll on space/arrows
    if (['KeyA','KeyD','KeyW','KeyS','KeyJ','KeyK','KeyL','Space'].includes(e.code)) {
      e.preventDefault();
    }
    if (!this.held.has(e.code)) {
      this.pressedThisTick.add(e.code);
    }
    this.held.add(e.code);
  }

  _onUp(e) {
    this.held.delete(e.code);
  }

  isDown(code) {
    return this.held.has(code);
  }

  // Consume-once helper. Returns true and clears if the key was pressed since last consume.
  consumePress(code) {
    if (this.pressedThisTick.has(code)) {
      this.pressedThisTick.delete(code);
      return true;
    }
    return false;
  }

  // Reset per-frame one-shots that weren't consumed (keeps them "hot" for one frame).
  endFrame() {
    this.pressedThisTick.clear();
  }
}
