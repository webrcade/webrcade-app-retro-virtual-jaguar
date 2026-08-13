import {
  CIDS,
  Controller,
  Controllers,
  KCODES,
  KeyCodeToControlMapping,
  RetroAppWrapper,
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

// a/b/x/y/lb/rb/lt/rt have no hardcoded function of their own -- same as
// Coleco/A5200, everything they do comes from the per-game mapping
// (props.mappings, editor's Mappings tab). D-pad/Select stay hardcoded
// (always Move/Pause); Start is hardcoded to open the on-screen keypad
// screen (see sendInput()). A mapping target is either a real controller
// function (REAL_BUTTON_TARGETS) or a numpad key (KEYPAD_VALUES).
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
      [KCODES.Z]: CIDS.X,
      [KCODES.X]: CIDS.A,
      [KCODES.C]: CIDS.B,
      [KCODES.A]: CIDS.Y,
      // Option lives on the shoulder buttons, not Start -- see sendInput().
      [KCODES.Q]: CIDS.LBUMP,
      [KCODES.W]: CIDS.RBUMP,
      [KCODES.SHIFT_RIGHT]: CIDS.SELECT,
      // Opens the on-screen keypad screen (see sendInput()).
      [KCODES.ENTER]: CIDS.START,
      [KCODES.ESCAPE]: CIDS.ESCAPE,
      // Also selects in the on-screen keypad screen (ControllersScreen
      // accepts Space or Enter) -- bound here so getKeypadValue()'s hold
      // tracking can see it, same as a5200's SPACE_BAR handling.
      [KCODES.SPACE_BAR]: SPACE_BAR,
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

    // { "x": "firea", "y": "#", ... } -- gamepad button name -> real
    // controller function or keypad key (see REAL_BUTTON_TARGETS /
    // KEYPAD_VALUES). x/a/b -> Fire A/B/C matches genplusgx's (Genesis)
    // own X/A/B -> A/B/C convention for a 3-button layout on a 4-button
    // gamepad. Configured per-game via the editor's Mappings tab; falls
    // back to the same default the editor itself pre-fills for a new
    // item (see setDefaultForJaguar() in webrcade-editor/ItemEditor.js)
    // so a game added directly to a feed (bypassing the editor) still
    // gets it -- both spots must stay in sync.
    if (!app.mappings || Object.keys(app.mappings).length === 0) {
      this.mappings = {
        "x": "firec",
        "a": "fireb",
        "b": "firea",
        // "y": "1",
        "lb": "option",
        "rb": "option",
        // "lt": "2",
        // "rt": "3",
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

  createVisibilityMonitor() {
    const { app } = this;

    return new VisibilityChangeMonitor((p) => {
      if (!app.isPauseScreen() && !app.isControllersScreen()) {
        this.pause(p);
      }
    });
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
  // re-enable on close. Triggered by Start (see sendInput()) since
  // Option has moved to the shoulder buttons, freeing it up.
  showControllers(index) {
    const { app, controllers } = this;

    if (controllers) {
      controllers.setEnabled(false);

      // Same fake-key-event reset a5200 does: clears the Enter/Space
      // keydown that triggered this call, so ControllersScreen's own
      // handler doesn't immediately fire again for the same keypress.
      controllers.addFakeKeyEvent(KCODES.SPACE_BAR, false);
      controllers.addFakeKeyEvent(KCODES.ENTER, false);
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

  // a5200 wraps its entire Escape/Start trigger block in `if
  // (!keypadInput)`, suppressing the pause-menu-open gesture (not just
  // the keypad-screen one) while a keypad selection is actively held.
  // RetroAppWrapper's own pollControls() provides this exact hook for
  // that purpose -- returning truthy skips the default Escape handling
  // for the frame.
  handleEscape(controllers) {
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
        virtualKeypadDown[controller] =
          (controllers && controllers.isControlDown(controller, CIDS.A)) ||
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
  // still auto-fills their raw INP_ bits (plus INP_START) from the raw
  // CIDS press, but that's discarded here and rebuilt purely from the
  // mapping (REAL_BUTTON_TARGETS), same as Coleco/A5200. Start itself
  // is fully repurposed to open the on-screen keypad screen instead of
  // reaching the game at all -- default mapping sends Option via LB/RB
  // instead (see setDefaultForJaguar() in webrcade-editor/ItemEditor.js).
  sendInput(controller, input, analog0x, analog0y, analog1x, analog1y) {
    const { controllers, mappings } = this;

    input &= ~(this.INP_A | this.INP_B | this.INP_X | this.INP_Y |
      this.INP_LBUMP | this.INP_RBUMP | this.INP_LTRIG | this.INP_RTRIG |
      this.INP_START);

    if (controllers) {
      for (const { button, cid } of MAPPABLE_BUTTONS) {
        if (controllers.isControlDown(controller, cid)) {
          const bitProp = REAL_BUTTON_TARGETS[mappings[button]];
          if (bitProp) {
            input |= this[bitProp];
          }
        }
      }
    }

    // Compute the packed keypad value first -- a5200 gates its own
    // CIDS.START ("show controllers") check behind `if (!keypadInput)`,
    // skipping it entirely while a keypad selection is actively held.
    // Without that guard, holding Enter (which drives both "select" in
    // the keypad screen and CIDS.START here) immediately re-triggers
    // showControllers() the moment it's checked, since Enter is still
    // physically down from the selection that just closed the screen.
    const keypadValue = this.getKeypadValue(controller);

    if (!keypadValue && controllers && controllers.isControlDown(controller, CIDS.START)) {
      if (this.pause(true)) {
        controllers
          .waitUntilControlReleased(controller, CIDS.START)
          .then(() => this.showControllers(controller));
        return;
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
  // cartridge-only; the core ignores this for CD content (see
  // getCdBootMode()). HLE (false) is the core's own default.
  getUseRealBios() {
    return this.getProps().useRealBios === true;
  }

  // Called from the C core (EM_JS, wrc_get_cd_boot_mode) once at load --
  // CD-only, overrides getUseRealBios() for CD content. Return value
  // matches the EM_JS side: 0 = hle, 1 = auto, 2 = bios.
  getCdBootMode() {
    switch (this.getProps().cdBootMode) {
      case 'auto': return 1;
      case 'bios': return 2;
      default: return 0;
    }
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
