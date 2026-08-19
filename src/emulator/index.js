import {
  CIDS,
  Controller,
  Controllers,
  KCODES,
  KeyCodeToControlMapping,
  RetroAppWrapper,
  SCREEN_CONTROLS,
  VisibilityChangeMonitor,
  LOG
} from '@webrcade/app-common';

// Numeric IDs for the Jaguar's 12-key numpad, packed into bits 10-15 of
// the input value sent to Module._wrc_set_input() (see this app's
// sendInput() override and retrostash/virtualjaguar-libretro/libretro.c's
// wrc_update_input() for the C-side unpack). Matches phone-keypad reading
// order (1-9, then 0, *, #), same convention a5200 used for its own
// packed keypad field.
const KEYPAD_VALUES = {
  "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  "0": 10, "*": 11, "#": 12,
};

// a/b/x/y/lb/rb/lt/rt have no hardcoded function of their own -- same
// as Coleco/A5200, everything they do comes from the per-game mapping
// (props.mappings, editor's Mappings tab). D-pad/Start/Select stay
// hardcoded (always Move/Option/Pause) -- checked a5200/coleco for
// precedent here: neither lets Start/Select themselves be remapped
// either, only appear as possible mapping *targets* for the buttons
// that are (same shape "option"/"pause" already had in
// REAL_BUTTON_TARGETS below). Start/Select aren't source buttons here
// for the same reason. Opening the on-screen keypad screen moved off
// Start entirely, onto LTRIG+RANALOG (see handleEscape()). A mapping
// target is either a real controller function (REAL_BUTTON_TARGETS) or
// a numpad key (KEYPAD_VALUES).
const MAPPABLE_BUTTONS = [
  { button: "a", cid: CIDS.A },
  { button: "b", cid: CIDS.B },
  { button: "x", cid: CIDS.X },
  { button: "y", cid: CIDS.Y },
  { button: "lb", cid: CIDS.LBUMP },
  { button: "rb", cid: CIDS.RBUMP },
  { button: "lt", cid: CIDS.LTRIG },
  { button: "rt", cid: CIDS.RTRIG },
];

// Mapping target -> which INP_ bit (an instance property on Emulator,
// same constants RetroAppWrapper's pollControls() uses) carries it.
const REAL_BUTTON_TARGETS = {
  "firea": "INP_A",
  "fireb": "INP_B",
  "firec": "INP_Y",
  "option": "INP_START",
  "pause": "INP_SELECT",
};

// Direct keyboard passthrough for the numpad (player 1 only, same as
// a5200's AtariKeyCodeToControlMapping) -- independent of the gamepad
// "Mappings" system above, so keyboard players can just type 1-9/0/-/=
// without any per-game configuration. KEY_FLAG keeps these IDs well
// clear of CIDS's own small sequential numbers.
const KEY_FLAG = 0x8000;
// Distinct flag value, not reused from the 1-12 keypad range below --
// same idea as a5200's own SPACE_BAR control id, just numbered to not
// collide with this app's "flag low bits == keypad value" convention.
const SPACE_BAR = KEY_FLAG | 13;
// Bespoke -- unlike every other keyboard binding below, this isn't a
// mapping-table target (real button or keypad key), it opens the grid
// keypad screen directly (see sendInput()'s edge-detected check),
// mirroring LTRIG+RANALOG's role on gamepad.
const CONTROL_KEY = KEY_FLAG | 14;
const DIRECT_KEY_TO_KEYPAD_VALUE = {
  [KEY_FLAG | 1]: 1, [KEY_FLAG | 2]: 2, [KEY_FLAG | 3]: 3,
  [KEY_FLAG | 4]: 4, [KEY_FLAG | 5]: 5, [KEY_FLAG | 6]: 6,
  [KEY_FLAG | 7]: 7, [KEY_FLAG | 8]: 8, [KEY_FLAG | 9]: 9,
  [KEY_FLAG | 10]: 10, // Digit0 -> keypad "0"
  [KEY_FLAG | 11]: 11, // Minus  -> keypad "*"
  [KEY_FLAG | 12]: 12, // Equal  -> keypad "#"
};

class JaguarKeyCodeToControlMapping extends KeyCodeToControlMapping {
  constructor() {
    super({
      // Same D-pad/A/B/C/Option/Pause bindings as the base
      // DefaultKeyCodeToControlMapping (matches this app's documented
      // keyboard controls in pause/controls.js) -- reproduced here
      // rather than extended, since we need to layer in the digit keys
      // via the same super() call.
      [KCODES.ARROW_UP]: CIDS.UP,
      [KCODES.ARROW_DOWN]: CIDS.DOWN,
      [KCODES.ARROW_RIGHT]: CIDS.RIGHT,
      [KCODES.ARROW_LEFT]: CIDS.LEFT,
      // Each bound to the same CIDS slot its gamepad counterpart uses
      // (see MAPPABLE_BUTTONS' default mapping below), so a keyboard
      // press flows through the exact same mappings-table resolution a
      // gamepad button press would -- Z/X/C already matched this scheme
      // before the rework (kept as-is); A/S/D are new, replacing the
      // old Q/W-as-shoulder-buttons scheme now that Q/E are trigger-
      // equivalents instead.
      [KCODES.Z]: CIDS.X,
      [KCODES.X]: CIDS.A,
      [KCODES.C]: CIDS.B,
      [KCODES.A]: CIDS.LBUMP,
      [KCODES.S]: CIDS.Y,
      [KCODES.D]: CIDS.RBUMP,
      [KCODES.Q]: CIDS.LTRIG,
      [KCODES.E]: CIDS.RTRIG,
      [KCODES.SHIFT_RIGHT]: CIDS.SELECT,
      // Bound to CIDS.START, same as gamepad Start -- both now resolve
      // through the mappings table (default: Option), see sendInput().
      [KCODES.ENTER]: CIDS.START,
      [KCODES.ESCAPE]: CIDS.ESCAPE,
      // Also selects in the on-screen keypad screen (ControllersScreen
      // accepts Space or Enter) -- bound here so getKeypadValue()'s hold
      // tracking can see it, same as a5200's SPACE_BAR handling.
      [KCODES.SPACE_BAR]: SPACE_BAR,
      // Opens the grid keypad screen directly -- keyboard equivalent of
      // gamepad's LTRIG+RANALOG (see handleEscape()/sendInput()).
      [KCODES.CONTROL_LEFT]: CONTROL_KEY,
      [KCODES.CONTROL_RIGHT]: CONTROL_KEY,
      // Direct numpad passthrough
      [KCODES.DIGIT_1]: KEY_FLAG | 1,
      [KCODES.DIGIT_2]: KEY_FLAG | 2,
      [KCODES.DIGIT_3]: KEY_FLAG | 3,
      [KCODES.DIGIT_4]: KEY_FLAG | 4,
      [KCODES.DIGIT_5]: KEY_FLAG | 5,
      [KCODES.DIGIT_6]: KEY_FLAG | 6,
      [KCODES.DIGIT_7]: KEY_FLAG | 7,
      [KCODES.DIGIT_8]: KEY_FLAG | 8,
      [KCODES.DIGIT_9]: KEY_FLAG | 9,
      [KCODES.DIGIT_0]: KEY_FLAG | 10,
      [KCODES.MINUS]: KEY_FLAG | 11,
      [KCODES.EQUAL]: KEY_FLAG | 12,
    });
  }
}

export class Emulator extends RetroAppWrapper {

  GAME_SRAM_NAME = 'game.srm';
  SAVE_NAME = 'sav';

  // Base default is 4 (RetroAppWrapper's own createControllers() makes
  // 4), but createControllers() below only builds 2 -- the Jaguar only
  // ever supported 2 players. Must match the array length there, or the
  // base pollControls() loop indexes past the end of it and crashes.
  CONTROLLER_COUNT = 2;

  constructor(app, debug = false) {
    super(app, debug);
    window.emulator = this;

    // Session-only override for testing (pause > Jaguar (Session Only)
    // tab). Not persisted -- doesn't touch the catalog item's props.
    this.disableFastBlitter = false;

    // { "x": "firea", "y": "8", ... } -- gamepad button name -> real
    // controller function or keypad key (see REAL_BUTTON_TARGETS /
    // KEYPAD_VALUES). Matches the real Jaguar Pro Controller's own
    // convention: base row (A/B/C) are real fire buttons, the Pro's
    // bonus row (X/Y/Z) and the shoulder triggers are keypad shortcuts
    // rather than extra fire functions -- x/a/b -> Fire C/B/A still
    // matches genplusgx's (Genesis) own X/A/B -> A/B/C convention for a
    // 3-button layout on a 4-button gamepad. Configured per-game via the
    // editor's Mappings tab; falls back to the same default the editor
    // itself pre-fills for a new item (see setDefaultForJaguar() in
    // webrcade-editor/ItemEditor.js) so a game added directly to a feed
    // (bypassing the editor) still gets it -- both spots must stay in
    // sync.
    if (!app.mappings || Object.keys(app.mappings).length === 0) {
      this.mappings = {
        "x": "firec",
        "a": "fireb",
        "b": "firea",
        "y": "8",
        "lb": "7",
        "rb": "9",
        "lt": "4",
        "rt": "6",
      };
    } else {
      this.mappings = app.mappings;
    }

    // Packed keypad value (0 = none) selected via the on-screen keypad
    // screen (controllers/index.js), one per controller. Same hold
    // semantics as a5200/coleco: stays active for as long as the
    // physical select input (gamepad A, or Enter for keyboard) stays
    // held, with virtualKeypadCount as a short grace window covering the
    // frame(s) between selection and pollControls() next observing the
    // button as down.
    this.virtualKeypad = [0, 0];
    this.virtualKeypadDown = [false, false];
    this.virtualKeypadCount = [0, 0];

    // Guards handleEscape()'s LTRIG+RANALOG interception (opens the grid
    // keypad screen) from re-firing every frame while the combo stays
    // held -- same pending-flag pattern Apple II/Apple IIGS/Commodore
    // 8-bit/DOSBox Pure use for their own virtual-keyboard equivalent.
    this.gamepadVkPending = false;
    // Edge-detects CONTROL_KEY (see sendInput()) the same way -- Control
    // is a plain keydown, not a combo synthesized into CIDS.ESCAPE, so
    // it needs its own rising-edge check rather than handleEscape()'s
    // wait-for-release pattern.
    this.controlKeyDown = false;

    // Drives the upper-right touch overlay (keypad/pause icons) --
    // same mechanism as Apple II/melonDS's TouchOverlay: latch the first
    // time each interaction type is observed, and react via
    // checkOnScreenControls(). See onFrame() for where the listeners
    // actually get attached.
    this.firstFrame = true;
    this.touchEvent = false;
    this.mouseEvent = false;
    this.keyboardEvent = false;
  }

  // Packed numeric keypad IDs, exposed the same way a5200 exposes its
  // JST_* constants, so controllers/index.js doesn't need to duplicate
  // the KEYPAD_VALUES table above.
  KEYPAD_1 = KEYPAD_VALUES["1"];
  KEYPAD_2 = KEYPAD_VALUES["2"];
  KEYPAD_3 = KEYPAD_VALUES["3"];
  KEYPAD_4 = KEYPAD_VALUES["4"];
  KEYPAD_5 = KEYPAD_VALUES["5"];
  KEYPAD_6 = KEYPAD_VALUES["6"];
  KEYPAD_7 = KEYPAD_VALUES["7"];
  KEYPAD_8 = KEYPAD_VALUES["8"];
  KEYPAD_9 = KEYPAD_VALUES["9"];
  KEYPAD_0 = KEYPAD_VALUES["0"];
  KEYPAD_STAR = KEYPAD_VALUES["*"];
  KEYPAD_POUND = KEYPAD_VALUES["#"];

  createControllers() {
    this.keyToControlMapping = new JaguarKeyCodeToControlMapping();
    return new Controllers([
      new Controller(this.keyToControlMapping),
      new Controller(),
    ]);
  }

  // Force-closes the radial keypad the instant pause starts -- see
  // App.js's hideRadialKeypad() for why this can't just rely on
  // pause() stopping sendInput() from being called again.
  onPause(p) {
    super.onPause(p);
    if (p && this.app && this.app.hideRadialKeypad) {
      this.app.hideRadialKeypad();
    }
  }

  // Base class default pauses on any tap anywhere on screen -- redundant
  // (and disruptive) now that there's a dedicated Pause button in the
  // touch overlay. Same override Apple II/melonDS use for the same
  // reason.
  createTouchListener() {}

  createVisibilityMonitor() {
    const { app } = this;

    return new VisibilityChangeMonitor((p) => {
      if (!app.isPauseScreen() && !app.isControllersScreen()) {
        this.pause(p);
      }
    });
  }

  // Attaches the touch/mouse/keyboard interaction listeners once, on the
  // real first frame (same timing Apple II/melonDS use), and flips on
  // the touch overlay's gating state (App.js's showCanvas()) so it can't
  // render before the emulator actually exists.
  onFrame() {
    if (!this.firstFrame) return;
    this.firstFrame = false;

    this.app.showCanvas();

    setTimeout(() => {
      const onTouch = () => { this.onTouchEvent() };
      window.addEventListener("touchstart", onTouch);
      window.addEventListener("touchend", onTouch);
      window.addEventListener("touchcancel", onTouch);
      window.addEventListener("touchmove", onTouch);

      const onMouse = () => { this.onMouseEvent() };
      window.addEventListener("mousedown", onMouse);
      window.addEventListener("mouseup", onMouse);
      window.addEventListener("mousemove", onMouse);

      document.onkeydown = (e) => {
        if (this.paused) return;
        this.onKeyboardEvent(e);
      };
    }, 0);
  }

  onTouchEvent() {
    if (!this.touchEvent) {
      this.touchEvent = true;
      this.checkOnScreenControls();
    }
  }

  onMouseEvent() {
    if (!this.mouseEvent) {
      this.mouseEvent = true;
      this.checkOnScreenControls();
    }
  }

  onKeyboardEvent(e) {
    if (e.code && !this.keyboardEvent) {
      this.keyboardEvent = true;
      this.checkOnScreenControls();
    }
  }

  showTouchOverlay(show) {
    const to = document.getElementById("touch-overlay");
    if (to) {
      to.style.display = show ? 'block' : 'none';
    }
  }

  // Reacts immediately to a just-detected interaction (see
  // onTouchEvent()/onMouseEvent()/onKeyboardEvent() above) -- only
  // SC_AUTO needs to do anything here, since SC_ON/SC_OFF are already
  // handled unconditionally by updateOnScreenControls() at startup and
  // whenever the Settings preference itself changes.
  checkOnScreenControls() {
    const controls = this.prefs.getScreenControls();
    if (controls === SCREEN_CONTROLS.SC_AUTO) {
      setTimeout(() => {
        this.showTouchOverlay(true);
        this.app.forceRefresh();
      }, 0);
    }
  }

  // Broader lifecycle hook (base class calls this once at real startup
  // with initial=true, and the Settings screen calls it again whenever
  // "Screen Controls" changes) -- unlike checkOnScreenControls(), this
  // has to explicitly handle all three preference values, and skips
  // SC_AUTO entirely on the initial call so the overlay doesn't flash
  // before any real interaction has happened yet.
  updateOnScreenControls(initial = false) {
    const controls = this.prefs.getScreenControls();
    if (controls === SCREEN_CONTROLS.SC_OFF) {
      this.showTouchOverlay(false);
    } else if (controls === SCREEN_CONTROLS.SC_ON) {
      this.showTouchOverlay(true);
    } else if (controls === SCREEN_CONTROLS.SC_AUTO) {
      if (!initial) {
        setTimeout(() => {
          this.showTouchOverlay(this.touchEvent || this.mouseEvent);
          this.app.forceRefresh();
        }, 0);
      }
    }
  }

  // Called by the on-screen keypad screen (controllers/index.js) when a
  // key is clicked/tapped/selected. Matches a5200/coleco's onKeypad():
  // stays held for as long as the physical select input stays down (see
  // getKeypadValue()), not just a fixed duration.
  //
  // keyPressed (if the selection came from a real keyboard press, e.g.
  // Enter) gets a synthetic "down" fake key event -- this app's own
  // controllers.setEnabled(false) in showControllers() detaches the main
  // keyToControlMapping listener for as long as the keypad screen is
  // open, so it never actually observes the keydown that made the
  // selection (only ControllersScreen's own separate listener does).
  // Without this, isControlDown(CIDS.START) reads stale/false even
  // while the key is still physically held, which both breaks the hold
  // tracking below and can spuriously re-open the keypad screen.
  onKeypad(index, key, keyPressed = null) {
    const { controllers } = this;

    if (keyPressed && controllers) {
      controllers.addFakeKeyEvent(keyPressed, true);
    }

    this.virtualKeypad[index] = key;
    this.virtualKeypadDown[index] = true;
    this.virtualKeypadCount[index] = 10;
  }

  // Opens the on-screen keypad screen (App.js's CONTROLLERS_MODE),
  // mirroring a5200's own showControllers()/RetroAppWrapper's
  // showPauseMenu(): disable controls, hand off to the app, and
  // re-enable on close. Triggered by LTRIG+RANALOG (see handleEscape())
  // and the touch overlay's Keypad button, not Start -- Start no longer
  // does anything special (see sendInput()).
  showControllers(index) {
    const { app, controllers } = this;

    if (controllers) {
      controllers.setEnabled(false);

      // Same fake-key-event reset a5200 does: clears the Enter/Space
      // keydown that triggered this call, so ControllersScreen's own
      // handler doesn't immediately fire again for the same keypress.
      // Control gets the same treatment for a different reason: setEnabled
      // (false) detaches keyToControlMapping's keydown/keyup listeners for
      // as long as this screen is open, so if the physical Control key is
      // released while it's open (the common case -- press to open, then
      // let go), that release is never observed and isControlDown(
      // CONTROL_KEY) reads stuck-true even after the key is no longer
      // held. Without this reset, the next real press+release cycle just
      // clears the stale state instead of opening anything, making it
      // look like Control has to be pressed twice.
      controllers.addFakeKeyEvent(KCODES.SPACE_BAR, false);
      controllers.addFakeKeyEvent(KCODES.ENTER, false);
      controllers.addFakeKeyEvent(KCODES.CONTROL_LEFT, false);
      controllers.addFakeKeyEvent(KCODES.CONTROL_RIGHT, false);
    }

    setTimeout(() => {
      this.showPauseDelay = 0;
      app.showControllers(index, false /*swap*/, () => {
        if (controllers) {
          controllers.setEnabled(true);
        }
        this.pause(false, true);
      });
    }, this.showPauseDelay);
  }

  // Two things intercepted here, both via the same base-class hook
  // (RetroAppWrapper's pollControls() calls this whenever the
  // LTRIG+combo-synthesized CIDS.ESCAPE is down, and skips its own
  // default Escape/pause-menu handling for the frame if this returns
  // truthy):
  //
  // 1. LTRIG+RANALOG opens the grid keypad screen -- same gesture
  //    Apple II/Apple IIGS/Commodore 8-bit/DOSBox Pure already use for
  //    their own virtual keyboards, adopted here for consistency (see
  //    [[project_jaguar_port_todo]]). Replaces Start, which no longer
  //    does anything special (see sendInput()). Waits for the
  //    already-down CIDS.ESCAPE to release before acting, same
  //    pending-flag pattern those apps use, so it fires once per
  //    press-and-release rather than repeatedly while held.
  // 2. a5200's own trick: suppress the pause-menu-open gesture (not
  //    just the keypad-screen one) while a keypad selection is
  //    actively held, so releasing the button that made a keypad
  //    selection can't also spuriously open the pause menu.
  handleEscape(controllers) {
    if (controllers.isControlDown(0, CIDS.LTRIG) && controllers.isControlDown(0, CIDS.RANALOG)) {
      if (!this.gamepadVkPending) {
        this.gamepadVkPending = true;
        controllers
          .waitUntilControlReleased(0, CIDS.ESCAPE)
          .then(() => {
            this.gamepadVkPending = false;
            if (this.pause(true)) {
              this.showControllers(0);
            }
          });
      }
      return true;
    }

    return !!this.virtualKeypad[0];
  }

  // Which keypad key (if any) is currently held, as a packed numeric ID
  // (0 = none). The on-screen keypad screen takes priority, then the
  // per-game gamepad mapping, then direct keyboard digit keys (player 1
  // only -- a physical keyboard isn't per-controller) -- same priority
  // order a5200 uses (explicit selection/native input wins, keyboard
  // passthrough is the fallback).
  getKeypadValue(controller) {
    const { controllers, mappings, keyToControlMapping, virtualKeypad, virtualKeypadDown, virtualKeypadCount } = this;

    if (virtualKeypad[controller]) {
      virtualKeypadCount[controller]--;

      if (virtualKeypadDown[controller]) {
        // CIDS.A covers the grid keypad screen's own select button;
        // LB/RB cover the radial keypad's confirm (see sendInput()) --
        // either keeps resending the held value for as long as whichever
        // one actually triggered the selection stays physically down.
        virtualKeypadDown[controller] =
          (controllers && (
            controllers.isControlDown(controller, CIDS.A) ||
            controllers.isControlDown(controller, CIDS.LBUMP) ||
            controllers.isControlDown(controller, CIDS.RBUMP)
          )) ||
          (controller === 0 && keyToControlMapping && (
            keyToControlMapping.isControlDown(CIDS.START) ||
            keyToControlMapping.isControlDown(SPACE_BAR)
          ));
      }

      if (virtualKeypadCount[controller] <= 0 && !virtualKeypadDown[controller]) {
        virtualKeypad[controller] = 0;
      }

      if (virtualKeypad[controller]) {
        return virtualKeypad[controller];
      }
    }

    if (controllers) {
      for (const { button, cid } of MAPPABLE_BUTTONS) {
        const target = mappings[button];
        if (target && controllers.isControlDown(controller, cid)) {
          const value = KEYPAD_VALUES[target];
          if (value) return value;
        }
      }
    }

    if (controller === 0 && keyToControlMapping) {
      for (const key of Object.keys(DIRECT_KEY_TO_KEYPAD_VALUE)) {
        if (keyToControlMapping.isControlDown(Number(key))) {
          return DIRECT_KEY_TO_KEYPAD_VALUE[key];
        }
      }
    }

    return 0;
  }

  // a/b/x/y/lb/rb/lt/rt have no hardcoded function -- pollControls()
  // still auto-fills their raw INP_ bits from the raw CIDS press, but
  // that's discarded here and rebuilt purely from the mapping
  // (REAL_BUTTON_TARGETS), same as Coleco/A5200. Start/Select are
  // hardcoded instead (Option/Pause, matching a5200/coleco's own
  // precedent of not letting Start/Select themselves be remapped) --
  // opening the grid keypad screen moved off Start entirely, onto
  // LTRIG+RANALOG (see handleEscape()), matching Apple II/Apple IIGS/
  // Commodore 8-bit/DOSBox Pure's own virtual-keyboard trigger. Start
  // still needs the same keypadValue masking A/LB/RB get below, though --
  // Enter (bound to CIDS.START) also holds a grid-keypad selection open,
  // so without masking, Option would bleed through on every frame a
  // selection is held via Enter.
  sendInput(controller, input, analog0x, analog0y, analog1x, analog1y) {
    const { app, controllers, mappings, keyToControlMapping } = this;

    // Piggyback on this per-frame call rather than polling the gamepad a
    // second time -- analog1x/analog1y (right stick) are already read
    // fresh every frame here, and this method structurally can't run
    // while paused (pause() stops displayLoop, which is what calls
    // pollControls() -> sendInput()), so there's no separate pause guard
    // to maintain for the radial keypad either. LB/RB confirm the
    // highlighted key -- not A, since the radial ring is stick-driven
    // (thumb stays on the right stick) and either shoulder button is
    // comfortably reachable without moving it. Suppressed entirely while
    // LTRIG is held, since that's reserved for the LTRIG+RANALOG grid-
    // keypad gesture (handleEscape()) -- without this, deflecting the
    // stick while reaching for that combo would also pop the ring open.
    if (app && app.updateRadialStick && !(controllers && controllers.isControlDown(controller, CIDS.LTRIG))) {
      const confirmDown = !!(controllers && (
        controllers.isControlDown(controller, CIDS.LBUMP) ||
        controllers.isControlDown(controller, CIDS.RBUMP)
      ));
      app.updateRadialStick(controller, analog1x, analog1y, confirmDown);
    }

    // Control key opens the grid keypad screen -- keyboard equivalent
    // of LTRIG+RANALOG (handleEscape()), player 1/keyboard only, same
    // scope as the other keyboard-only bindings in this file. A plain
    // keydown, not a combo synthesized into CIDS.ESCAPE, so it needs its
    // own rising-edge check here rather than handleEscape()'s pattern.
    // Only handles opening -- this method structurally can't run while
    // paused (see the radial-stick comment above), so closing again on a
    // second Control press is handled directly by ControllersScreen's own
    // document-level listener instead (controllers/index.js), which stays
    // active for as long as the screen is mounted.
    if (controller === 0 && keyToControlMapping) {
      const controlDown = keyToControlMapping.isControlDown(CONTROL_KEY);
      if (controlDown && !this.controlKeyDown && this.pause(true)) {
        this.showControllers(0);
      }
      this.controlKeyDown = controlDown;
    }

    // keypadValue is also used below: A confirms a selection on the
    // grid keypad screen, LB/RB confirm one on the radial ring -- while
    // a selection from either is still held (keypadValue truthy), that
    // same physical button needs to be kept from also reaching the
    // normal mapping (e.g. fireb/Option) a frame or two after the
    // screen/ring closes, while it's still physically down.
    const keypadValue = this.getKeypadValue(controller);

    // INP_SELECT is deliberately NOT cleared/rebuilt here -- Select's raw
    // CIDS press passes through unmodified from the base class's own
    // auto-fill, hardcoding it to Pause with zero extra code. INP_START
    // gets the same hardcoded Option behavior, but Start (unlike Select)
    // doubles as one of the keys that can hold a grid-keypad selection
    // open (see getKeypadValue()'s virtualKeypadDown tracking), so it's
    // cleared and explicitly re-added below, masked while a selection is
    // held -- same shape as the A/LBUMP/RBUMP masking in the loop below.
    input &= ~(this.INP_A | this.INP_B | this.INP_X | this.INP_Y |
      this.INP_LBUMP | this.INP_RBUMP | this.INP_LTRIG | this.INP_RTRIG |
      this.INP_START);

    if (!keypadValue && controllers && controllers.isControlDown(controller, CIDS.START)) {
      input |= this.INP_START;
    }

    if (controllers) {
      for (const { button, cid } of MAPPABLE_BUTTONS) {
        if (keypadValue && (cid === CIDS.A || cid === CIDS.LBUMP || cid === CIDS.RBUMP)) {
          continue;
        }
        if (controllers.isControlDown(controller, cid)) {
          const bitProp = REAL_BUTTON_TARGETS[mappings[button]];
          if (bitProp) {
            input |= this[bitProp];
          }
        }
      }
    }

    // Clear the packed-keypad bit range (bits 10-15) before OR-ing in the
    // current selection -- otherwise a raw LB/RB/LT/RT/L3/R3 press could
    // leak stray bits into the packed value instead of being fully
    // replaced by it (LB/RB/LT/RT's raw bits were already cleared above,
    // but L3/R3 -- CIDS.LANALOG/RANALOG -- are untouched by that mask).
    input &= ~(0x3F << 10);
    input |= (keypadValue << 10);
    super.sendInput(controller, input, analog0x, analog0y, analog1x, analog1y);
  }

  getScriptUrl() {
    return 'js/virtualjaguar_libretro.js';
  }

  getHashFileExtension() {
    // RetroArch/deps/rcheevos/src/rhash/hash.c's extension table only
    // recognizes "jag" for RC_CONSOLE_ATARI_JAGUAR (not "j64") -- this
    // just tells cheevos which console/hash algorithm to use, unrelated
    // to the actual uploaded file's real extension.
    return 'jag';
  }

  applyGameSettings() {
    this.disableFastBlitter = this.getProps().disableFastBlitter === true;
    this.pushOptions();
  }

  // Fast Blitter is on by default; OPT1 disables it (falls back to the
  // slower, more accurate blitter) -- kept inverted so the prop's
  // default/unset value (false) matches the desired default behavior.
  pushOptions() {
    const { Module } = window;
    let options = 0;
    if (this.disableFastBlitter) {
      options |= this.OPT1;
    }
    Module._wrc_set_options(options);
  }

  setDisableFastBlitter(disabled) {
    this.disableFastBlitter = disabled;
    this.pushOptions();
  }

  // Called from the C core (EM_JS, wrc_get_m68k_clock_scale_pct /
  // wrc_get_risc_clock_scale_pct) once at load -- launch-only settings,
  // no live/session toggle, so no OPT bits needed; the core just asks
  // JS for the number directly.
  getM68kClockScalePct() {
    return this.getProps().m68kClockScale || 100;
  }

  getRiscClockScalePct() {
    return this.getProps().riscClockScale || 100;
  }

  // Called from the C core (EM_JS, wrc_get_use_real_bios) once at load --
  // one switch shared by cart and CD content alike (CD's "Auto" boot mode
  // was identical to "Real BIOS" in the core anyway, so there was nothing
  // a separate 3-way CD-only setting actually distinguished). HLE (false)
  // is the core's own default.
  getUseRealBios() {
    return this.getProps().useRealBios === true;
  }

  async saveState() {
    const { saveStatePath, started } = this;
    const { FS, Module } = window;

    try {
      if (!started) {
        return;
      }

      // Save to files
      Module._cmd_savefiles();

      let path = '';
      const files = [];
      let s = null;

      path = `/home/web_user/retroarch/userdata/saves/${this.GAME_SRAM_NAME}`;
      LOG.info('Checking: ' + path);
      try {
        s = FS.readFile(path);
        if (s) {
          LOG.info('Found save file: ' + path);
          files.push({
            name: this.SAVE_NAME,
            content: s,
          });
        }
      } catch (e) {}

      if (files.length > 0) {
        if (await this.getSaveManager().checkFilesChanged(files)) {
          await this.getSaveManager().save(
            saveStatePath,
            files,
            this.saveMessageCallback,
          );
        }
      } else {
        await this.getSaveManager().delete(path);
      }
    } catch (e) {
      LOG.error('Error persisting save state: ' + e);
    }
  }

  async loadState() {
    const { saveStatePath } = this;
    const { FS } = window;

    // Write the save state (if applicable)
    try {
      // Load
      const files = await this.getSaveManager().load(
        saveStatePath,
        this.loadMessageCallback,
      );

      if (files) {
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          if (f.name === this.SAVE_NAME) {
            LOG.info(`writing ${this.GAME_SRAM_NAME} file`);
            FS.writeFile(
              `/home/web_user/retroarch/userdata/saves/${this.GAME_SRAM_NAME}`,
              f.content,
            );
          }
        }

        // Cache the initial files
        await this.getSaveManager().checkFilesChanged(files);
      }
    } catch (e) {
      LOG.error('Error loading save state: ' + e);
    }
  }

  isForceAspectRatio() {
    return false;
  }

  getDefaultAspectRatio() {
    return 4 / 3;
  }

  resizeScreen(canvas) {
    this.canvas = canvas;
    this.updateScreenSize();
  }

  getShotAspectRatio() { return this.getDefaultAspectRatio(); }
}
