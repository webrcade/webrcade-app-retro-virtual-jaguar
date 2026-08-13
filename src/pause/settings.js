import React from 'react';
import { Component } from 'react';

import {
  AppDisplaySettingsTab,
  EditorScreen,
  FieldsTab,
  FieldRow,
  FieldLabel,
  FieldControl,
  TelevisionWhiteImage,
  BlurImage,
  ShaderSettingsTab,
  Switch,
  TuneWhiteImage,
  WebrcadeContext,
} from '@webrcade/app-common';

export class JaguarSettingsEditor extends Component {
  constructor() {
    super();
    this.state = {
      tabIndex: null,
      focusGridComps: null,
      values: {},
    };

    this.busy = false;
  }

  componentDidMount() {
    const { emulator } = this.props;

    const values = {
      origBilinearMode: emulator.getPrefs().getBilinearMode(),
      bilinearMode: emulator.getPrefs().getBilinearMode(),
      origScreenSize: emulator.getPrefs().getScreenSize(),
      screenSize: emulator.getPrefs().getScreenSize(),
      disableFastBlitter: emulator.disableFastBlitter,
    }

    this.shaderService = this.props.emulator.getShadersService();
    this.shaderService.addEditorValues(values);

    this.setState({
      values: values
    });
  }

  render() {
    const { emulator, onClose, showOnScreenControls } = this.props;
    const { tabIndex, values, focusGridComps } = this.state;

    const setFocusGridComps = (comps) => {
      this.setState({ focusGridComps: comps });
    };

    const setValues = (values) => {
      this.setState({ values: values });
    };

    const tabs = [
      {
        image: TuneWhiteImage,
        label: 'Jaguar (Session Only)',
        content: (
          <JaguarTestingTab
            emulator={emulator}
            isActive={tabIndex === 0}
            setFocusGridComps={setFocusGridComps}
            values={values}
            setValues={setValues}
          />
        )
      },
      {
        image: TelevisionWhiteImage,
        label: 'Display Settings',
        content: (
          <AppDisplaySettingsTab
            emulator={emulator}
            isActive={tabIndex === 1}
            isBilinearMode={true}
            showOnScreenControls={showOnScreenControls}
            setFocusGridComps={setFocusGridComps}
            values={values}
            setValues={setValues}
          />
        )
      },
      {
        image: BlurImage,
        label: 'Shader Settings',
        content: (
          <ShaderSettingsTab
            shaderService={this.shaderService}
            emulator={emulator}
            isActive={tabIndex === 2}
            setFocusGridComps={setFocusGridComps}
            values={values}
            setValues={setValues}
          />
        )
      },
    ];

    return (
      <EditorScreen
        showCancel={true}
        onOk={async () => {
          if (this.busy) return;
          this.busy = true;

          let change = false;
          if (values.origBilinearMode !== values.bilinearMode) {
            emulator.getPrefs().setBilinearMode(values.bilinearMode);
            change = true;
          }
          if (values.origScreenSize !== values.screenSize) {
            emulator.getPrefs().setScreenSize(values.screenSize);
            emulator.updateScreenSize();
            change = true;
          }
          if (change) {
            emulator.getPrefs().save();
          }

          // Set the shader
          await this.shaderService.setShader(values.shaderId);
          emulator.updateBilinearFilter();

          onClose();
        }}
        onClose={onClose}
        focusGridComps={focusGridComps}
        onTabChange={(oldTab, newTab) => this.setState({ tabIndex: newTab })}
        tabs={tabs}
      />
    );
  }
}

// Session-only: applies immediately via emulator.setDisableFastBlitter(),
// does not persist to the catalog item's props. For testing which games
// need the accurate blitter, without needing to re-save the item each time.
class JaguarTestingTab extends FieldsTab {
  constructor(props) {
    super(props);
    this.disableFastBlitterRef = React.createRef();
    this.gridComps = [
      [this.disableFastBlitterRef]
    ];
  }

  componentDidUpdate(prevProps, prevState) {
    const { gridComps } = this;
    const { setFocusGridComps } = this.props;
    const { isActive } = this.props;

    if (isActive && isActive !== prevProps.isActive) {
      setFocusGridComps(gridComps);
    }
  }

  render() {
    const { disableFastBlitterRef } = this;
    const { focusGrid } = this.context;
    const { emulator, setValues, values } = this.props;

    return (
      <>
        <FieldRow>
          <FieldLabel>Disable Fast Blitter</FieldLabel>
          <FieldControl>
            <Switch
              ref={disableFastBlitterRef}
              onChange={(e) => {
                const disabled = e.target.checked;
                emulator.setDisableFastBlitter(disabled);
                setValues({
                  ...values,
                  ...{ disableFastBlitter: disabled },
                })
              }}
              checked={values.disableFastBlitter}
              onPad={(e) => focusGrid.moveFocus(e.type, disableFastBlitterRef)}
            />
          </FieldControl>
        </FieldRow>
      </>
    );
  }
}
JaguarTestingTab.contextType = WebrcadeContext;
