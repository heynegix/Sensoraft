# Sensoraft Phase 0–1 MVP

## Goal

Provide the first complete local loop:

```text
Open Sensoraft
→ Start Vibration Meter
→ Place phone on desk
→ Hit desk or move phone
→ See a real accelerometer signal spike
```

## Scope

Included:

- Expo + React Native + TypeScript app.
- Android physical-device accelerometer input.
- X / Y / Z capture, vector gravity compensation, residual magnitude, moving average, RMS.
- Numeric RMS value and bounded real-time chart.
- Start / Stop and unavailable-sensor handling.
- Unit tests for the pure signal primitives.

Excluded from this phase:

- AI or LLM integration.
- RevenueCat, login, accounts, cloud backend, Firebase, or server database.
- FFT, BLE, multi-device synchronization, CSV export, and saved instruments.
- Complex navigation and iOS-specific optimization.

## Acceptance checklist

- [ ] `Vibration Meter` opens from a clean Android launch.
- [ ] Start changes the state to `LIVE` when the accelerometer is available.
- [ ] X, Y, and Z values update from the physical sensor.
- [ ] Gravity compensation brings a stationary phone near a stable low value.
- [ ] A desk tap or phone movement creates a visible chart response.
- [ ] Stop changes the state to `STOPPED` and removes the subscription.
- [ ] Repeated Start / Stop does not duplicate chart updates.
- [ ] A device without an accelerometer gets an explanatory error.
- [ ] `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, and `npm run build:check` pass.

## Tunable settings

The initial settings live in `src/signal/constants.ts`:

- Sensor update interval: 50 ms / 20 Hz.
- Baseline compensation alpha: 0.04.
- Moving-average window: 4 samples.
- RMS window: 12 samples.
- Chart history: 90 samples.

These values are deliberately centralized so Android hardware testing can tune responsiveness without changing the UI or sensor adapter.
