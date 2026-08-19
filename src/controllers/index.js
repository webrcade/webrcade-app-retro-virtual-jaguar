import React, { Component } from "react";

import {
  JaguarController,
  GamepadEnum,
  ImageButton,
  KCODES,
  Screen,
  WebrcadeContext
} from '@webrcade/app-common';

import './style.scss'

export class ControllerButton extends ImageButton {
  render() {
    const { buttonRef, ...other } = this.props;

    return (
      <ImageButton
        ref={buttonRef}
        className="controller-image-button"
        {...other}
      />
    );
  }
}

export class Controller extends Component {

  constructor() {
    super();

    this.buttonRefs = [
      [React.createRef(), React.createRef(), React.createRef()],
      [React.createRef(), React.createRef(), React.createRef()],
      [React.createRef(), React.createRef(), React.createRef()],
      [React.createRef(), React.createRef(), React.createRef()]
    ];

    this.descriptionKey = [
      ["1", "2", "3"],
      ["4", "5", "6"],
      ["7", "8", "9"],
      ["*", "0", "#"]
    ];
  }

  render() {
    const { buttonRefs, descriptionKey } = this;
    const { controllerIndex, emulator, descriptions, row, col, onFocusChanged, onSelect } = this.props;

    const updateDescription = (r, c) => {
      setTimeout(() => {
        const row = document.getElementById("controller-description-row");
        if (!row) return;

        let description = "";

        if (r >= 0 && c >= 0) {
          const keyName = descriptionKey[r][c];
          description = (descriptions && descriptions[keyName]) || keyName;

          if (row.innerHTML !== description) {
            row.classList.remove("description-fade-in");
            setTimeout(() => {
              row.classList.add("description-fade-in");
            }, 50);
          }
        }

        row.innerHTML = description;
      }, 0);
    }

    updateDescription(row, col);

    setTimeout(() => {
      if (row >= 0 && col >= 0) {
        const buttonRef = buttonRefs[row][col];
        if (buttonRef.current) {
          buttonRef.current.focus()
        }
      }
    }, 0);

    const onClick = (e, key, r, c) => {
      if (e && e.type && e.type === GamepadEnum.A) {
        if (e.index !== controllerIndex) {
          return;
        }
      }

      // Skip keystrokes (enter, space, etc.)
      if (e.clientX !== undefined && e.clientX === 0) {
        return;
      }

      onSelect(key, r, c, e && e.code);
    }

    const keys = [
      [emulator.KEYPAD_1, emulator.KEYPAD_2, emulator.KEYPAD_3],
      [emulator.KEYPAD_4, emulator.KEYPAD_5, emulator.KEYPAD_6],
      [emulator.KEYPAD_7, emulator.KEYPAD_8, emulator.KEYPAD_9],
      [emulator.KEYPAD_STAR, emulator.KEYPAD_0, emulator.KEYPAD_POUND],
    ];

    return (
      <div className="controller"
        style={{
          backgroundImage: "url(" + JaguarController + ")",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {keys.map((keyRow, r) => (
          <div className={"controller-row" + (r === 0 ? " controller-first-row" : "")} key={r}>
            {keyRow.map((key, c) => (
              <div className="controller-row-button" key={r + "-" + c}>
                <ControllerButton
                  buttonRef={buttonRefs[r][c]}
                  onFocus={() => onFocusChanged(r, c)}
                  onClick={(e) => onClick(e, key, r, c)}
                  onMouseEnter={() => updateDescription(r, c)}
                  onMouseLeave={() => updateDescription(row, col)}
                />
              </div>
            ))}
          </div>
        ))}
        <div id="controller-description-row" className="controller-row controller-description-row"></div>
      </div>
    );
  }
}

export class ControllersScreen extends Screen {
  constructor() {
    super();

    this.gamepadNotifier.setImmediateA(true);
    this.state = {
      controllerIndex: null,
      row: 0,
      col: 0
    };
  }

  ModeEnum = {};

  componentDidMount() {
    const { controllerIndex } = this.state;

    super.componentDidMount();
    const docElement = document.documentElement;
    docElement.addEventListener("keydown", this.handleKeyDownEvent);

    if (controllerIndex === null) {
      this.setState({
        controllerIndex: this.props.controllerIndex,
        row: this.props.initialRow !== undefined ? this.props.initialRow : 0,
        col: this.props.initialCol !== undefined ? this.props.initialCol : 0,
      });
    }
  }

  componentWillUnmount() {
    super.componentWillUnmount();
    const docElement = document.documentElement;
    docElement.removeEventListener("keydown", this.handleKeyDownEvent);
  }

  focus() {
    const { row, col } = this.state;
    if (this.gamepadNotifier.padCount > 0) {
      if (row < 0 || col < 0) {
        this.setState({ row: 0, col: 0 });
      }
    }
  }

  globalGamepadCallback = e => {
    const { controllerIndex, row, col } = this.state;
    let newCol = col;
    let newRow = row;

    if (controllerIndex !== e.index) return;

    if (row >= 0 && col >= 0) {
      if (e.type === GamepadEnum.LEFT) {
        if (col > 0) newCol = col - 1;
      } else if (e.type === GamepadEnum.RIGHT) {
        if (col < 2) newCol = col + 1;
      } else if (e.type === GamepadEnum.UP) {
        if (row > 0) newRow = row - 1;
      } else if (e.type === GamepadEnum.DOWN) {
        if (row < 3) newRow = row + 1;
      }

      this.setState({ row: newRow, col: newCol });
    }

    if (e.type === GamepadEnum.ESC || e.type === GamepadEnum.START) {
      this.close();
    }
  }

  handleKeyDownEvent = (e) => {
    const { controllerIndex, row, col } = this.state;
    const { emulator, onSelect } = this.props;

    // Control opens this screen (see emulator/index.js's sendInput()) --
    // toggle behavior means pressing it again while already open closes
    // it, same as Escape below. This listener is attached directly to
    // document for as long as this screen is mounted, independent of
    // controllers.setEnabled()/the paused display loop, so it works even
    // though the emulator's own Control handling can't run while paused.
    if (e.code === KCODES.CONTROL_LEFT || e.code === KCODES.CONTROL_RIGHT) {
      this.close();
      return;
    }

    if (e.code === KCODES.SPACE_BAR || e.code === KCODES.ENTER) {
      const keys = [
        emulator.KEYPAD_1,
        emulator.KEYPAD_2,
        emulator.KEYPAD_3,
        emulator.KEYPAD_4,
        emulator.KEYPAD_5,
        emulator.KEYPAD_6,
        emulator.KEYPAD_7,
        emulator.KEYPAD_8,
        emulator.KEYPAD_9,
        emulator.KEYPAD_STAR,
        emulator.KEYPAD_0,
        emulator.KEYPAD_POUND,
      ]

      if (controllerIndex === 0) {
        if (row >= 0 && col >= 0) {
          this.close();
          onSelect(keys[row * 3 + col], row, col, e.code);
        } else if (e.code === KCODES.ENTER) {
          this.close();
        }
      }
    }
  }

  handleKeyUpEvent = (e) => {
    let { controllerIndex, row, col } = this.state;

    if (controllerIndex === 0) {
      let invalid = false;
      let key = false;
      if (row < 0) {
        invalid = true;
        row = 0;
      }
      if (col < 0) {
        col = 0;
        invalid = true;
      }
      let newRow = row;
      let newCol = col;
      if (e.code === KCODES.ARROW_LEFT) {
        key = true;
        if (col > 0) newCol = col - 1;
      } else if (e.code === KCODES.ARROW_RIGHT) {
        key = true;
        if (col < 2) newCol = col + 1;
      } else if (e.code === KCODES.ARROW_UP) {
        key = true;
        if (row > 0) newRow = row - 1;
      } else if (e.code === KCODES.ARROW_DOWN) {
        key = true;
        if (row < 3) newRow = row + 1;
      }

      if (invalid && key) {
        this.setState({ row: 0, col: 0 });
      } else {
        if (col !== newCol || row !== newRow) {
          this.setState({ row: newRow, col: newCol });
        }
      }
    }

    if (e.code === KCODES.ESCAPE) {
      this.close()
    }
  }

  onSelectFunc(key, r, c, keyCode) {
    const { onSelect } = this.props;
    onSelect(key, r, c, keyCode);
    this.close();
  }

  render() {
    const { screenContext, screenStyles } = this;
    const { controllerIndex, row, col } = this.state;
    const { emulator, descriptions } = this.props;

    const onFocusChanged = (r, c) => {
      if (r >= 0 && c >= 0) {
        if (r !== row || c !== col) {
          setTimeout(() => this.setState({ row: r, col: c }), 0);
        }
      }
    };

    const controller = (
      <Controller
        emulator={emulator}
        descriptions={descriptions}
        controllerIndex={controllerIndex}
        onSelect={(key, r, c, keyCode) => this.onSelectFunc(key, r, c, keyCode)}
        col={col}
        row={row}
        onFocusChanged={onFocusChanged} />
    )

    return (
      <>
        <WebrcadeContext.Provider value={screenContext}>
          <div className={screenStyles['screen-transparency']} />
          <div className={"controllers-screen"} onClick={() => this.close()}>
            <div className={'controllers-screen-inner ' + screenStyles.screen}>
              <div className={"controllers-screen-inner-controllers"}>
                {controllerIndex === 0 ? controller : <div />}
                {controllerIndex === 1 ? controller : <div />}
              </div>
            </div>
          </div>
        </WebrcadeContext.Provider>
      </>
    );
  }
}
