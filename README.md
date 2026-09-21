# Sensoraft

Tell your phone what you want to measure.
Sensoraft builds the instrument.

Sensoraft is a local-first Expo and React Native app that turns smartphone sensors into small, focused measuring instruments. Phase 2.5 provides three built-in Android-first instruments that share one validated DSL, compiled runtime, and generic display.

## Implemented now

- Android-first Expo app written in TypeScript.
- Built-in `Vibration Meter` with LIVE / STOPPED state.
- Start / Stop sensor lifecycle with subscription cleanup.
- Accelerometer X / Y / Z sampling through `expo-sensors`.
- Vector magnitude, gravity/baseline compensation, moving average, and RMS processing.
- Current vibration value in `m/s² RMS`.
- Lightweight real-time history chart with a bounded 90-sample buffer.
- Friendly unavailable-sensor error state.
- Version 1 Instrument DSL with strict JSON parsing, validation, operation type checking, and a compiled runtime.
- Declarative Vibration Meter definition using gravity compensation, magnitude, moving average, RMS, and scale operations.
- Built-in `Rotation Meter` using gyroscope data in `rad/s`.
- Built-in `Magnetic Field Meter` using magnetometer data in `μT`.
- Instrument picker and generic definition-driven screen shared by all built-in instruments.
- Optional `Build with AI` flow that turns a measurement request into a validated instrument through a Cloudflare Worker and Token Harbor Chat Completions.
- Unit tests for signal primitives, DSL validation, compilation, runtime output, and lifecycle cleanup.
- No account, prompt history database, RevenueCat, BLE, or FFT.

## Vision

The long-term product is an instrument builder: a user describes what they want to measure and Sensoraft generates a sensor pipeline and display. Future phases may add saved instruments, CSV export, barometer support, BLE, and multi-device measurement.

## Instrument DSL

Phase 2 adds a small, allowlisted Instrument DSL. Definitions are validated and compiled before a sensor starts; JSON cannot execute arbitrary JavaScript. See [docs/INSTRUMENT_DSL.md](docs/INSTRUMENT_DSL.md) for the schema, type flow, validation rules, and security model.

The optional natural-language generation flow is documented in [docs/AI_GENERATION.md](docs/AI_GENERATION.md). The Worker owns the Token Harbor secret; the app only receives a validated declarative definition.

## Requirements

- Node.js LTS
- npm
- Android phone with the sensor used by the selected instrument
- Expo Go compatible with this project's Expo SDK, or an Android development build
- Computer and phone on the same Wi-Fi network when using the Expo development server

## Install and run

```bash
npm install
npm run start
```

To enable `Build with AI`, deploy the Worker and set `EXPO_PUBLIC_SENSORAFT_AI_ENDPOINT` as described in [docs/AI_GENERATION.md](docs/AI_GENERATION.md). The built-in instruments work without that endpoint.

Then scan the QR code from Expo Go on Android. To open the Android target from a connected device or emulator:

```bash
npm run android
```

The app opens with an instrument picker. Choose an instrument, tap `Start measuring`, and interact with the physical environment. The selected graph and value should respond to the corresponding sensor.

## Android physical-device verification

The key acceptance tests require a real Android device. A simulator or emulator is not assumed to provide representative sensor data.

1. Install the Expo Go version compatible with this project's Expo SDK.
2. Run `npm run start` on the development computer.
3. Open the project in Expo Go on the Android device.
4. Open `Vibration Meter`, tap `Start measuring`, and confirm the status changes to `LIVE`.
5. Leave the phone still for a few seconds and confirm the compensated value settles near zero.
6. Tap the desk beside the phone or gently move the phone and confirm the chart produces visible spikes.
7. Stop it, return to the picker, open `Rotation Meter`, and rotate the phone. Confirm the `rad/s` value and chart respond.
8. Open `Magnetic Field Meter`, bring a magnet or magnetic object near the phone, and confirm the `μT` value and chart change clearly.
9. For each instrument, repeat Start / Stop and verify that the chart continues with one stable stream rather than duplicated updates.

If the device lacks a selected sensor, the app shows a sensor-specific in-app error instead of attempting to display fabricated data.

## Quality checks

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build:check
npm run worker:check
```

`npm run format` applies Prettier formatting. `npm run build:check` exports the Android JavaScript bundle without committing generated output. The automated checks exercise deterministic signal-processing code; physical sensor behavior must still be confirmed on Android hardware.

## Architecture

```text
src/
├─ sensors/
│  ├─ types.ts              # Sensor types, samples, adapters, subscriptions
│  ├─ vector3-source.ts     # shared Expo vector-sensor adapter
│  ├─ accelerometer.ts     # accelerometer adapter
│  ├─ gyroscope.ts         # gyroscope adapter
│  ├─ magnetometer.ts      # magnetometer adapter
│  └─ sensor-manager.ts    # availability, start/stop, cancellation, cleanup
├─ signal/
│  ├─ constants.ts          # units and tunable processing settings
│  ├─ magnitude.ts          # vector magnitude
│  ├─ gravity-compensation.ts
│  ├─ moving-average.ts
│  ├─ rms.ts
│  └─ ...                   # pure signal primitives used by registry processors
├─ instruments/
│  ├─ dsl/
│  │  ├─ types.ts           # versioned DSL types
│  │  ├─ parser.ts          # JSON parsing boundary
│  │  ├─ validator.ts       # strict schema and type-flow checks
│  │  └─ errors.ts
│  ├─ definitions/
│  │  ├─ vibration-meter.ts # declarative Vibration Meter definition
│  │  ├─ rotation-meter.ts
│  │  ├─ magnetic-field-meter.ts
│  │  └─ index.ts           # built-in instrument catalog
│  ├─ runtime/
│  │  ├─ operation-registry.ts
│  │  ├─ compiler.ts
│  │  ├─ sensor-factory.ts
│  │  └─ runtime.ts
│  └─ types.ts              # compatibility re-export
├─ components/
│  └─ SignalChart.tsx       # bounded chart presentation
├─ ai/
│  ├─ types.ts               # generator contract and result types
│  ├─ remote-instrument-generator.ts
│  └─ request-gate.ts        # stale response protection
└─ screens/
   ├─ InstrumentPickerScreen.tsx # built-in instrument selection
   ├─ GenerateInstrumentScreen.tsx # natural-language generation
   ├─ InstrumentScreen.tsx       # generic definition-driven UI
   └─ VibrationMeterScreen.tsx   # compatibility entry point

worker/
├─ src/                    # Cloudflare Worker and Token Harbor boundary
└─ tests/                  # mocked upstream contract tests
```

All built-in instruments use this route:

```text
Instrument Definition
  → strict validator
  → operation registry compiler
  → sensor factory and controller
  → compiled signal pipeline
  → generic InstrumentScreen
```

The accelerometer pipeline additionally performs vector-first gravity compensation before magnitude so lateral vibration is preserved. The sensor adapters do not know about UI, the operation registry does not know about React Native, and the generic screen receives only compiled runtime measurements. The runtime owns one `SensorController`, removes its subscription on Stop and dispose, and keeps only a bounded chart history.

## License

MIT. See [LICENSE](LICENSE).
