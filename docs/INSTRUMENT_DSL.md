# Sensoraft Instrument DSL v1

The Instrument DSL is a small, declarative description of a sensor, an approved signal pipeline, and a display. It is the boundary between future AI-generated JSON and the Sensoraft measurement engine.

The current implementation supports only the accelerometer, but the schema keeps the sensor field extensible for future sensors.

## Runtime flow

    JSON string
      -> JSON.parse
      -> strict validation
      -> operation type checking
      -> compile approved operations once
      -> start sensor runtime
      -> process samples through the compiled pipeline
      -> render the display definition

InstrumentRuntime performs validation and compilation when it is constructed. Sensor samples never trigger JSON parsing, validation, compilation, or React component creation.

## Version 1 schema

    {
      "version": 1,
      "id": "desk-vibration",
      "name": "Desk Vibration",
      "description": "Measures short-term vibration using the accelerometer.",
      "sensor": {
        "type": "accelerometer",
        "sampleRateHz": 20
      },
      "pipeline": [
        {
          "op": "gravityCompensation",
          "alpha": 0.04
        },
        {
          "op": "magnitude"
        },
        {
          "op": "movingAverage",
          "windowSize": 4
        },
        {
          "op": "rms",
          "windowSize": 12
        },
        {
          "op": "scale",
          "factor": 9.80665
        }
      ],
      "display": {
        "type": "line",
        "label": "Vibration",
        "unit": "m/s²",
        "precision": 3
      }
    }

description and display.precision are normalized when omitted. The required fields are version, id, name, sensor, pipeline, and display.

## Supported sensors

| Sensor        | Status                               |
| ------------- | ------------------------------------ |
| accelerometer | Supported in v1                      |
| gyroscope     | Reserved for a future sensor adapter |
| magnetometer  | Reserved for a future sensor adapter |
| barometer     | Reserved for a future sensor adapter |
| microphone    | Reserved for a future sensor adapter |

sampleRateHz must be an integer from 1 through 100. This is converted to the Expo sensor update interval before the runtime starts.

## Supported operations

| Operation           | Flow               | Configuration                 |
| ------------------- | ------------------ | ----------------------------- |
| gravityCompensation | Vector3 -> Vector3 | alpha with 0 < alpha <= 1     |
| magnitude           | Vector3 -> Scalar  | none                          |
| movingAverage       | Scalar -> Scalar   | windowSize from 1 through 500 |
| rms                 | Scalar -> Scalar   | windowSize from 1 through 500 |
| scale               | Scalar -> Scalar   | finite numeric factor         |

Gravity compensation is deliberately vector-first: the runtime estimates the three-axis baseline, subtracts that vector, and only then applies magnitude. This preserves lateral vibration instead of hiding it in the 1 g gravity magnitude.

## Type flow validation

The accelerometer starts every pipeline as Vector3. The compiler checks every operation input and output type and requires the final value to be a Scalar for the current display system.

For example, this is rejected before a sensor subscription is created:

    {
      "op": "magnitude"
    },
    {
      "op": "gravityCompensation",
      "alpha": 0.04
    }

The validator reports:

    Pipeline type mismatch: gravityCompensation expects Vector3 but received Scalar.

## Validation rules

- Only version 1 is accepted.
- id, name, display label, and display unit must be non-empty strings.
- Unknown fields are rejected.
- Unknown operations are rejected.
- Empty pipelines are rejected.
- Pipelines are limited to 20 operations.
- Accelerometer sample rate is limited to 1–100 Hz.
- gravityCompensation.alpha is required and must satisfy 0 < alpha <= 1.
- movingAverage.windowSize and rms.windowSize are required integers from 1 through 500.
- scale.factor and display precision must be finite numbers.
- NaN and Infinity are rejected for definition values and runtime sensor samples.
- A pipeline must be type-compatible and end in a scalar value.

Validation errors use InstrumentValidationError and retain an issues array so a future UI can show actionable field-level feedback without displaying raw exceptions.

## Operation registry and security model

The operation registry is a static map of approved operation metadata and processor factories. Each entry owns its input type, output type, configuration normalization, and stateful processor creation.

JSON is treated as data only. The runtime does not use eval, new Function, dynamic imports, arbitrary expressions, shell commands, remote code, or plugin execution. A future AI response must pass through parseInstrumentDefinition and the strict validator before it can reach compileInstrument.

Adding an operation requires an explicit registry entry, a typed DSL variant, validation rules, a processor factory, and tests. An operation cannot become executable merely by appearing in JSON.

## Runtime and lifecycle

compileInstrument creates a CompiledInstrument containing the already-created processors. InstrumentRuntime owns that compiled instrument and one sensor controller. start resets the pipeline state and subscribes to the sensor; stop cancels pending starts, removes the subscription, and resets state; dispose permanently stops the runtime.

The UI receives only compiled measurements with timestamp, value, and raw sensor data plus runtime status/error callbacks. It does not assemble gravity compensation, magnitude, moving average, RMS, or scale processors.

## Future extensions

Future operations such as lowPass, threshold, peak, fft, or integrate should be added through the registry with explicit types and bounded configuration. Future sensor adapters should be connected through the sensor factory and controller interface. AI generation belongs outside this runtime and must produce only validated DSL data.
