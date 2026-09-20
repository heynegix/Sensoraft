# Sensoraft

Tell your phone what you want to measure.
Sensoraft builds the instrument.

Sensoraft is a local-first Expo and React Native app that turns smartphone sensors into small, focused measuring instruments. Phase 0–1 delivers the first working instrument: a real-time accelerometer-based vibration meter for Android devices.

## Implemented now

- Android-first Expo app written in TypeScript.
- `Vibration Meter` screen with LIVE / STOPPED state.
- Start / Stop sensor lifecycle with subscription cleanup.
- Accelerometer X / Y / Z sampling through `expo-sensors`.
- Vector magnitude, gravity/baseline compensation, moving average, and RMS processing.
- Current vibration value in `m/s² RMS`.
- Lightweight real-time history chart with a bounded 90-sample buffer.
- Friendly unavailable-sensor error state.
- Version 1 Instrument DSL with strict JSON parsing, validation, operation type checking, and a compiled runtime.
- Declarative Vibration Meter definition using gravity compensation, magnitude, moving average, RMS, and scale operations.
- Unit tests for signal primitives, DSL validation, compilation, runtime output, and lifecycle cleanup.
- No account, cloud backend, AI API, RevenueCat, database, BLE, or FFT.

## Vision

The long-term product is an instrument builder: a user describes what they want to measure and Sensoraft generates a sensor pipeline and display. Future phases may add gyroscope, magnetometer, barometer, saved instruments, CSV export, AI-assisted generation, BLE, and multi-device measurement. AI generation is intentionally not part of this phase.

## Instrument DSL

Phase 2 adds a small, allowlisted Instrument DSL. Definitions are validated and compiled before a sensor starts; JSON cannot execute arbitrary JavaScript. See [docs/INSTRUMENT_DSL.md](docs/INSTRUMENT_DSL.md) for the schema, type flow, validation rules, and security model.

## Requirements

- Node.js LTS
- npm
- Android phone with a working accelerometer
- Expo Go compatible with this project's Expo SDK, or an Android development build
- Computer and phone on the same Wi-Fi network when using the Expo development server

## Install and run

```bash
npm install
npm run start
```

Then scan the QR code from Expo Go on Android. To open the Android target from a connected device or emulator:

```bash
npm run android
```

The vibration meter is the initial screen. Tap `Start measuring`, put the phone on a stable surface, and tap the desk or move the phone. The graph and RMS value should respond to the physical motion.

## Android physical-device verification

The key acceptance test requires a real Android device. A simulator or emulator is not assumed to provide representative accelerometer data.

1. Install the Expo Go version compatible with this project's Expo SDK.
2. Run `npm run start` on the development computer.
3. Open the project in Expo Go on the Android device.
4. Tap `Start measuring` and confirm the status changes to `LIVE`.
5. Leave the phone still for a few seconds and confirm the compensated value settles near zero.
6. Tap the desk beside the phone or gently move the phone and confirm the chart produces visible spikes.
7. Tap `Stop` and confirm the status returns to `STOPPED`.
8. Repeat Start / Stop and verify that the chart continues with one stable stream rather than duplicated updates.

If the device has no accelerometer, the app shows an in-app error instead of attempting to display fabricated data.

## Quality checks

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build:check
```

`npm run format` applies Prettier formatting. `npm run build:check` exports the Android JavaScript bundle without committing generated output. The automated checks exercise deterministic signal-processing code; physical sensor behavior must still be confirmed on Android hardware.

## Architecture

```text
src/
├─ sensors/
│  ├─ types.ts              # Sensor samples, adapters, subscriptions
│  ├─ accelerometer.ts      # expo-sensors adapter
│  └─ sensor-manager.ts     # availability, start/stop, cancellation, cleanup
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
│  │  └─ vibration-meter.ts # declarative Vibration Meter definition
│  ├─ runtime/
│  │  ├─ operation-registry.ts
│  │  ├─ compiler.ts
│  │  ├─ sensor-factory.ts
│  │  └─ runtime.ts
│  └─ types.ts              # compatibility re-export
├─ components/
│  └─ SignalChart.tsx       # bounded chart presentation
└─ screens/
   ├─ InstrumentScreen.tsx      # generic definition-driven UI
   └─ VibrationMeterScreen.tsx  # compatibility entry point
```

The current pipeline is:

```text
accelerometer x/y/z in g
  → slow 3-axis gravity baseline compensation
  → residual vector magnitude
  → moving average
  → RMS
  → m/s² display and chart
```

The sensor adapter does not know about UI, the operation registry does not know about React Native, and the generic screen receives only compiled runtime measurements. The runtime owns one `SensorController`, removes its subscription on Stop and dispose, and keeps only a bounded chart history.

## License

MIT. See [LICENSE](LICENSE).
