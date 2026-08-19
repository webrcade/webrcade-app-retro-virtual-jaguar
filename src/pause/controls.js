import React from 'react';

import { ControlsTab } from '@webrcade/app-common';

const REAL_BUTTON_NAMES = {
  "firea": "Fire A",
  "fireb": "Fire B",
  "firec": "Fire C",
  "option": "Option",
  "pause": "Pause",
};

const getNameForValue = (value, descriptions) => {
  const description = descriptions[value];
  if (description) return description;
  return REAL_BUTTON_NAMES[value] || ("Keypad " + value);
}

const getName = (button, mappings, descriptions) => {
  const value = mappings[button];
  if (!value) return null;
  return getNameForValue(value, descriptions);
}

export class GamepadControlsTab extends ControlsTab {
  render() {
    const { emulator } = this.props;
    const mappings = (emulator && emulator.mappings) ? emulator.mappings : {};
    const descriptions = (emulator && emulator.getApp().descriptions) ? emulator.getApp().descriptions : {};

    const aName = getName("a", mappings, descriptions);
    const bName = getName("b", mappings, descriptions);
    const xName = getName("x", mappings, descriptions);
    const yName = getName("y", mappings, descriptions);
    const lbName = getName("lb", mappings, descriptions);
    const rbName = getName("rb", mappings, descriptions);
    const ltName = getName("lt", mappings, descriptions);
    const rtName = getName("rt", mappings, descriptions);

    return (
      <>
        {this.renderControls('ltrig', 'ranalog', 'Show Keypad')}
        {this.renderControl('start', 'Option')}
        {this.renderControl('select', 'Pause')}
        {this.renderControl('dpad', 'Move')}
        {xName && this.renderControl('x', xName)}
        {aName && this.renderControl('a', aName)}
        {bName && this.renderControl('b', bName)}
        {yName && this.renderControl('y', yName)}
        {lbName && this.renderControl('lbump', lbName)}
        {rbName && this.renderControl('rbump', rbName)}
        {ltName && this.renderControl('ltrig', ltName)}
        {rtName && this.renderControl('rtrig', rtName)}
      </>
    );
  }
}

export class KeyboardControlsTab extends ControlsTab {
  render() {
    const { emulator } = this.props;
    const mappings = (emulator && emulator.mappings) ? emulator.mappings : {};
    const descriptions = (emulator && emulator.getApp().descriptions) ? emulator.getApp().descriptions : {};

    const xName = getName("x", mappings, descriptions);
    const aName = getName("a", mappings, descriptions);
    const bName = getName("b", mappings, descriptions);
    const yName = getName("y", mappings, descriptions);
    const lbName = getName("lb", mappings, descriptions);
    const rbName = getName("rb", mappings, descriptions);
    const ltName = getName("lt", mappings, descriptions);
    const rtName = getName("rt", mappings, descriptions);

    return (
      <>
        {this.renderKey('ControlLeft', 'Show Keypad')}
        {this.renderKey('Enter', 'Option')}
        {this.renderKey('ShiftRight', 'Pause')}
        {this.renderKey('ArrowUp', 'Up')}
        {this.renderKey('ArrowDown', 'Down')}
        {this.renderKey('ArrowLeft', 'Left')}
        {this.renderKey('ArrowRight', 'Right')}
        {xName && this.renderKey('KeyZ', xName)}
        {aName && this.renderKey('KeyX', aName)}
        {bName && this.renderKey('KeyC', bName)}
        {lbName && this.renderKey('KeyA', lbName)}
        {yName && this.renderKey('KeyS', yName)}
        {rbName && this.renderKey('KeyD', rbName)}
        {ltName && this.renderKey('KeyQ', ltName)}
        {rtName && this.renderKey('KeyE', rtName)}
        {this.renderKey('Digit1', getNameForValue('1', descriptions))}
        {this.renderKey('Digit2', getNameForValue('2', descriptions))}
        {this.renderKey('Digit3', getNameForValue('3', descriptions))}
        {this.renderKey('Digit4', getNameForValue('4', descriptions))}
        {this.renderKey('Digit5', getNameForValue('5', descriptions))}
        {this.renderKey('Digit6', getNameForValue('6', descriptions))}
        {this.renderKey('Digit7', getNameForValue('7', descriptions))}
        {this.renderKey('Digit8', getNameForValue('8', descriptions))}
        {this.renderKey('Digit9', getNameForValue('9', descriptions))}
        {this.renderKey('Digit0', getNameForValue('0', descriptions))}
        {this.renderKey('Minus', getNameForValue('*', descriptions))}
        {this.renderKey('Equal', getNameForValue('#', descriptions))}
      </>
    );
  }
}
