/**
 * Unsupported cases, part B (157): sensor-absent families continued, plus the
 * sensor-present/operation-absent family where the registry's five operations
 * (gravityCompensation, magnitude, movingAverage, rms, scale) cannot express
 * the requested measurement.
 */

import { unsupportedGroupsA } from './data-unsupported-a.mjs';

const REASON_NO_SENSOR =
  'Sensoraft v1 wires only accelerometer, gyroscope, and magnetometer (SUPPORTED_SENSOR_TYPES); there is no sensor that measures this, and the strict validator rejects any other sensor.type, so no valid instrument can be produced.';
const REASON_NO_ANGLE =
  'Even though the sensor exists, the DSL v1 pipeline starts from the full Vector3 and can only compute magnitude plus scalar filters: there is no per-axis operation, and the vector magnitude is constant for any static orientation, so a tilt angle or attitude reading cannot be produced.';
const REASON_NO_DIRECTION =
  'Registry operations output a scalar magnitude and discard axis signs, so the DSL cannot express direction or heading; the compass-style answer this prompt needs is not constructible.';
const REASON_NO_INTEGRATE =
  'The accelerometer senses acceleration, not distance or speed; deriving those requires time integration, and the operation registry has no integrate operation, so the requested quantity cannot be produced.';
const REASON_NO_COUNT =
  'Counting requires thresholds and accumulation over time; the registry has no threshold, counter, or integrate operation, so the DSL cannot produce a tally.';
const REASON_NO_DURATION =
  'Measuring elapsed time requires a timer; the DSL has no time-based operation, so a duration cannot be produced.';
const REASON_NO_FREQUENCY =
  'Frequency analysis needs FFT or periodicity operations; the registry only contains magnitude, movingAverage, rms, and scale, so a frequency value cannot be produced.';

function noSensorGroup(category, difficulty, tags, reason, prompts) {
  return {
    category,
    expectedStatus: 'unsupported',
    expectedSensor: null,
    allowedSensors: [],
    forbiddenSensors: [],
    difficulty,
    tags,
    reason,
    prompts,
  };
}

function noOperationGroup(category, difficulty, tags, reason, prompts) {
  return {
    category,
    expectedStatus: 'unsupported',
    expectedSensor: null,
    allowedSensors: [],
    forbiddenSensors: [],
    difficulty,
    tags,
    reason,
    prompts,
  };
}

export const unsupportedGroups = [
  ...unsupportedGroupsA,

  noSensorGroup('object', 'easy', ['unsupported', 'distance'], REASON_NO_SENSOR, [
    'How long is this room?',
    "How far is the wall from where I'm standing?",
    'How tall is this tree?',
    'How wide is this doorway?',
    'How big is the gap under the door?',
    'What are the dimensions of this box?',
    'How big is the TV screen diagonally?',
    'How thick is this sheet of paper?',
    'How long is this rope?',
    "What's the diameter of this pipe?",
    'How high is the ceiling?',
    'How far away is that building?',
    'How deep is this pool?',
    'How long is the hallway from here?',
  ]),
  noSensorGroup('object', 'easy', ['unsupported', 'appearance'], REASON_NO_SENSOR, [
    'What color is this shirt?',
    'What shade of blue is this paint?',
    'Does this wall color match the curtains?',
    "What's my skin tone in this lighting?",
    'What color is this LED emitting?',
    'Is this banana ripe yet?',
    'Is this avocado ready to eat?',
    'Are these tomatoes ripe enough to pick?',
    'Is this gold or brass?',
    'Is this figure made of plastic or metal?',
    'What kind of wood is this table made of?',
    "What's the fabric content of this sweater?",
    'Is this ring real silver?',
    'What alloy is this bike frame?',
    'Is this paper recycled or glossy?',
    'What material is this phone case made of?',
  ]),
  noSensorGroup('object', 'easy', ['unsupported', 'liquid'], REASON_NO_SENSOR, [
    'How full is this water bottle?',
    'How much fuel is left in the tank?',
    "What's the water level in the rain barrel?",
    'How much soup is left in the pot?',
    'How much rain fell into the gauge overnight?',
    'Is my cup half empty or half full?',
  ]),
  noSensorGroup('object', 'easy', ['unsupported', 'food'], REASON_NO_SENSOR, [
    'How much sugar is in this apple juice?',
    'How sweet is this melon?',
    'How salty is this broth?',
    'How strong is this coffee?',
    'Is the steak cooked medium-rare inside?',
    "What's the alcohol content of this homemade cider?",
    'How much caffeine is in this tea?',
    'Is the milk still fresh?',
    'How much is left in the shampoo bottle?',
    "What's the pH of this soil sample?",
    'How much vitamin C is in this orange?',
    'Is the jam sweet enough?',
  ]),
  noSensorGroup('position', 'easy', ['unsupported', 'location'], REASON_NO_SENSOR, [
    'What are my current GPS coordinates?',
    'Which city am I in right now?',
    'Where did I park my car?',
    'How far is it to the train station from here?',
    "What's my elevation above sea level?",
    'Which floor of the building am I on?',
    'How high up the mountain am I?',
    'How many meters above the ground is this balcony?',
    'Did I cross the county line yet?',
    'How many kilometers have I traveled today?',
    'Where is the nearest pharmacy?',
    "Am I inside the museum's geofence?",
    "What's my location for the emergency dispatcher?",
    'Which way is the exit from this parking garage?',
    'Is this the right platform for the express train?',
  ]),
  noSensorGroup('position', 'medium', ['unsupported', 'speed'], REASON_NO_INTEGRATE, [
    'How fast am I traveling down the highway?',
  ]),
  noSensorGroup('device', 'easy', ['unsupported', 'device'], REASON_NO_SENSOR, [
    'How much battery does my phone have left?',
    'Is my phone charging right now?',
    'How strong is my Wi-Fi signal here?',
    'Does this room have good cellular reception?',
    'How much storage space is left on my phone?',
    'Is Bluetooth turned on?',
    "What's my screen brightness set to?",
    'How much RAM is my phone using right now?',
    "Is my phone's screen cracked?",
    "How old is my phone's battery in charge cycles?",
    'Is the NFC reader working on this terminal?',
    'How many bars of signal do I have?',
  ]),
  noSensorGroup('safety', 'easy', ['unsupported', 'safety'], REASON_NO_SENSOR, [
    'How radioactive is this granite countertop?',
    'Is there radon in my basement?',
    'How strong is the radiation near the x-ray room?',
    'What does this flower smell like?',
    'Is there a gas leak in the kitchen?',
    'Is the smell of paint strong in this room?',
    'Is this perfume too strong?',
    'Can you detect mold behind this wall?',
    'How smoky is the air by the grill?',
    'Is there a ghost here — what does the ghost meter say?',
  ]),
  noSensorGroup('meta', 'medium', ['unsupported', 'static-state'], REASON_NO_SENSOR, [
    'Is my cat on the washing machine right now?',
    'Did someone sit in this chair while I was gone?',
    'How many people are in this room?',
  ]),
  noSensorGroup('object', 'medium', ['unsupported', 'household'], REASON_NO_SENSOR, [
    'How full is my trash can?',
    'Is there water in the wall cavity?',
  ]),
  noSensorGroup('environment', 'medium', ['unsupported', 'moisture'], REASON_NO_SENSOR, [
    'Is the plant soil wet enough?',
  ]),

  // --------------------------- sensor present, but the DSL cannot express it
  noOperationGroup(
    'orientation',
    'hard',
    ['unsupported', 'tilt-angle', 'dsl-limitation'],
    REASON_NO_ANGLE,
    [
      'How many degrees is this shelf tilted?',
      'What angle is my phone at right now?',
      'Is this picture frame hanging perfectly level?',
      'Is the table level or tilted?',
      'How tilted is this ladder against the wall?',
      'Is my floor sloping?',
      "What's the incline of this ramp?",
      'How many degrees off vertical is this leaning tower of books?',
      'Is the phone lying flat or standing up right now?',
      'Which way is my phone pointing — up or down?',
      'Is my phone screen facing the ceiling or the floor?',
      "What's the tilt angle of the solar panel?",
      'Is the roof pitch steeper than 30 degrees?',
      'How level is the pool table?',
    ],
  ),
  noOperationGroup(
    'orientation',
    'hard',
    ['unsupported', 'heading', 'dsl-limitation'],
    REASON_NO_DIRECTION,
    [
      'Which direction is north right now?',
      'What direction am I facing?',
      'Am I heading east on this road?',
      'Which compass heading is the balcony pointing?',
    ],
  ),
  noOperationGroup(
    'position',
    'medium',
    ['unsupported', 'distance', 'dsl-limitation'],
    REASON_NO_INTEGRATE,
    ['How far did I walk this morning?'],
  ),
  noOperationGroup(
    'time',
    'medium',
    ['unsupported', 'duration', 'dsl-limitation'],
    REASON_NO_DURATION,
    [
      'How many seconds did I hold my breath?',
      'How long did the vibration last?',
      'How much time did I spend shaking the phone?',
      'How long did the machine run before it stopped?',
      'How long until the paint dries?',
      'How long was the elevator ride?',
    ],
  ),
  noOperationGroup(
    'time',
    'medium',
    ['unsupported', 'counting', 'dsl-limitation'],
    REASON_NO_COUNT,
    [
      'How many rotations did the turntable make while I watched?',
      'How many times did I spin around?',
      'How many swings did the pendulum complete?',
      'How many reps did I complete in one minute?',
      'How many laps did I walk around the track?',
    ],
  ),
  noOperationGroup(
    'time',
    'hard',
    ['unsupported', 'frequency', 'dsl-limitation'],
    REASON_NO_FREQUENCY,
    [
      "What's the frequency of this vibration in hertz?",
      "What's the vibration frequency of the washing machine drum?",
      'How many beats per minute is my foot tapping?',
    ],
  ),
];
