import React from "react";

import {
  WebrcadeRetroApp,
  APP_TYPE_KEYS,
} from '@webrcade/app-common';

import { Emulator } from './emulator';
import { EmulatorPauseScreen } from './pause';
import { ControllersScreen } from './controllers';

import './App.scss';

class App extends WebrcadeRetroApp {

  CONTROLLERS_MODE = "controllers";

  createEmulator(app, isDebug) {
    const { appProps } = this;

    let descriptions = appProps.descriptions;
    if (!descriptions) {
      descriptions = {}
    }
    this.descriptions = descriptions;

    let mappings = appProps.mappings;
    if (!mappings) {
      mappings = {}
    }
    this.mappings = mappings;

    return new Emulator(app, isDebug);
  }

  isDiscBased() {
    console.log(this.appProps.type, APP_TYPE_KEYS.RETRO_VIRTUAL_JAGUAR_CD);
    return this.appProps.type === APP_TYPE_KEYS.RETRO_VIRTUAL_JAGUAR_CD;
  }

  // Unlike Sega CD/32X CD, both the cart and CD boot ROMs are embedded in
  // the core -- no BIOS upload is ever required, disc-based or not.
  isBiosRequired() {
    return false;
  }

  renderControllersScreen() {
    const { controllerIndex } = this.state;
    const { CONTROLLERS_MODE, emulator, descriptions } = this;

    return (
      <ControllersScreen
        controllerIndex={controllerIndex}
        initialRow={this.lastKeyRow}
        initialCol={this.lastKeyCol}
        onSelect={(key, r, c, keyCode) => {
          this.lastKeyRow = r;
          this.lastKeyCol = c;
          emulator.onKeypad(controllerIndex, key, keyCode);
        }}
        closeCallback={() => { this.resume(CONTROLLERS_MODE) }}
        descriptions={descriptions}
        emulator={emulator}
      />
    );
  }

  renderPauseScreen() {
    const { appProps, emulator } = this;

    return (
      <EmulatorPauseScreen
        emulator={emulator}
        appProps={appProps}
        closeCallback={() => this.resume()}
        exitCallback={() => {
          this.exitFromPause();
        }}
        isEditor={this.isEditor}
        isStandalone={this.isStandalone}
      />
    );
  }

  showControllers(index, swap, resumeCallback) {
    const { mode } = this.state;
    const { CONTROLLERS_MODE } = this;

    if (mode !== CONTROLLERS_MODE) {
      this.setState({
        mode: CONTROLLERS_MODE,
        resumeCallback: resumeCallback,
        controllerIndex: index,
      })
      return true;
    }
    return false;
  }

  isControllersScreen() {
    const { mode } = this.state;
    const { CONTROLLERS_MODE } = this;
    return mode === CONTROLLERS_MODE;
  }

  render() {
    const { mode } = this.state;
    const { CONTROLLERS_MODE } = this;

    return (
      <>
        {super.render()}
        {mode === CONTROLLERS_MODE ? this.renderControllersScreen() : null}
      </>
    );
  }
}

export default App;
