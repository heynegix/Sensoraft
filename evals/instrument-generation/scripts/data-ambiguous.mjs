/**
 * Ambiguous / tricky cases (150): prompts with multiple readings, missing
 * referents, or subtle DSL limits. Every case still carries a definite
 * expected_status with the justification in `reason`, so a grader can score
 * a model's decision deterministically.
 */

const REASON_VAGUE =
  'No measurable quantity and no referent are identifiable: an instrument needs something specific to measure, and the correct behavior is to ask for clarification rather than guess a sensor, so no valid instrument is expected.';
const REASON_MOTION_OK =
  'However the referent is resolved, the phone measures motion at its own location: gravityCompensation plus magnitude makes any shake, wobble, or movement show up in m/s², so an accelerometer instrument answers the practical reading of this prompt.';
const REASON_STEADINESS_OK =
  'Steadiness is the absence of jitter: accelerometer RMS (or gyroscope magnitude) quantifies it, and the practical reading of this vague prompt is a motion/stability measurement at the phone.';
const REASON_ATTRIBUTION =
  'The motion itself is measurable, but attributing it to one source (hand, table, machine, floor) is not: the pipeline reports the combined motion at the phone. The expected answer is still a valid accelerometer instrument for the measurable part, with the attribution left to the user.';
const REASON_NO_HISTORY =
  'The runtime keeps only a bounded live chart buffer and has no stored history, so comparisons against yesterday, last week, or a normal baseline cannot be measured.';
const REASON_NO_THRESHOLD =
  'Judgments like "too much", "safe", or "enough" require a threshold and a reference range; the DSL has no threshold operation and Sensoraft has no safety database, so the expected behavior is to refuse to make the judgment call.';
const REASON_NO_FFT =
  'Separating a signal into frequency bands or repeating patterns needs FFT or periodicity operations; the registry only contains magnitude, movingAverage, rms, and scale, so the requested analysis cannot be built.';
const REASON_NO_STATIC_ORIENTATION =
  'A static reading cannot answer this: the vector magnitude is constant for any stationary orientation and gravityCompensation removes the gravity baseline entirely, so "is it tilted/level/flat" is not answerable with DSL v1 (no per-axis operation exists).';
const REASON_TILT_EVENT_OK =
  'The prompt asks about an event, not a static angle: tipping or leaning produces a transient spike in the gravity-compensated magnitude, so the accelerometer detects it even though a static tilt angle is not computable.';
const REASON_MAG_DETECTION_OK =
  'Magnetic material near the phone changes the magnetometer magnitude in μT, so scanning while watching the value answers the practical detection intent; direction and distance are not available, only field strength.';
const REASON_MAG_UNKNOWN =
  'The magnetometer reports field strength only; classifying the source, judging safety, or turning strength into force/hold ratings is not a quantity the DSL can produce.';
const REASON_NO_DIRECTION_SIGN =
  'The magnitude operation discards axis signs, so the DSL cannot distinguish clockwise from counterclockwise or left from right; the requested directional answer is not constructible.';
const REASON_NO_TOTAL_ANGLE =
  'A total rotation or completed turns would require integrating angular velocity over time; the registry has no integrate operation, so accumulated angle cannot be produced.';
const REASON_ROTATION_OK =
  'Rotation rate is measurable at the phone itself: gyroscope magnitude in rad/s shows whether and how fast the phone is turning, so a gyroscope instrument answers the practical reading of this prompt.';
const REASON_SAFETY_JUDGMENT =
  'Danger, healthiness, and similar safety judgments are not physical quantities; the sensors report raw measurements only, so the model must not dress up an opinion as a measurement.';

function ambiguousGroup(
  category,
  expectedStatus,
  expectedSensor,
  allowedSensors,
  forbiddenSensors,
  difficulty,
  tags,
  reason,
  prompts,
) {
  return {
    category,
    expectedStatus,
    expectedSensor: expectedSensor ?? null,
    allowedSensors: allowedSensors ?? [],
    forbiddenSensors: forbiddenSensors ?? [],
    difficulty,
    tags,
    reason,
    prompts,
  };
}

const ACCEL = ['accelerometer'];
const ACCEL_GYRO = ['accelerometer', 'gyroscope'];
const FORBIDDEN_NON_ACCEL = ['gyroscope', 'magnetometer'];
const FORBIDDEN_MAG = ['magnetometer'];
const GYRO_ACCEL = ['gyroscope', 'accelerometer'];
const MAG = ['magnetometer'];
const FORBIDDEN_NON_MAG = ['accelerometer', 'gyroscope'];

export const ambiguousGroups = [
  // ------------------------------------------------------- vague / no target
  ambiguousGroup(
    'meta',
    'unsupported',
    null,
    [],
    [],
    'hard',
    ['tricky', 'vague', 'no-target'],
    REASON_VAGUE,
    [
      'Measure this.',
      'How strong is it?',
      'Measure the apple.',
      'Check the table.',
      'Can you measure this thing for me?',
      'What can you tell me about this?',
      'Just measure something interesting.',
      'Do your thing and measure whatever is around.',
      'Tell me about the vibe of this room.',
      'Scan my surroundings.',
      "What's the reading?",
      'Give me a measurement.',
      'How much is there?',
      'How does it feel?',
      'Check this out for me.',
      'Run a measurement please.',
      'Read the room for me.',
      "What's the number?",
      'Is it good?',
      'Rate this.',
      'Can my phone measure this object?',
      'Is this normal?',
      'How does it look to you?',
      'What does the sensor say?',
      'Am I doing this right?',
      "How's my form?",
    ],
  ),
  ambiguousGroup(
    'meta',
    'success',
    'accelerometer',
    ACCEL,
    FORBIDDEN_NON_ACCEL,
    'hard',
    ['tricky', 'vague', 'motion'],
    REASON_MOTION_OK,
    ['Is this moving?'],
  ),
  ambiguousGroup(
    'meta',
    'success',
    'accelerometer',
    ACCEL_GYRO,
    FORBIDDEN_MAG,
    'hard',
    ['tricky', 'vague', 'stability'],
    REASON_STEADINESS_OK,
    ['How stable is this?'],
  ),
  ambiguousGroup(
    'meta',
    'success',
    'accelerometer',
    ACCEL,
    FORBIDDEN_NON_ACCEL,
    'hard',
    ['tricky', 'vague', 'motion'],
    REASON_MOTION_OK,
    ['How hard did I move my phone?'],
  ),
  ambiguousGroup(
    'meta',
    'unsupported',
    null,
    [],
    [],
    'hard',
    ['tricky', 'vague', 'safety'],
    REASON_SAFETY_JUDGMENT,
    ['Tell me whether this is dangerous.'],
  ),

  // --------------------------------------- motion/vibration interpretations
  ambiguousGroup(
    'vibration',
    'success',
    'accelerometer',
    ACCEL,
    FORBIDDEN_NON_ACCEL,
    'hard',
    ['tricky', 'attribution'],
    REASON_ATTRIBUTION,
    [
      'Is the table shaking or am I shaking?',
      'Did the vibration come from the machine or the floor?',
      'Am I shaking or is the camera shaking?',
      'Did I move or did the bus move?',
      "Is the table rocking because of the neighbor's party?",
      'Did the phone wobble or did the table wobble?',
      'Is this train platform shaking right now?',
    ],
  ),
  ambiguousGroup(
    'vibration',
    'success',
    'accelerometer',
    ACCEL,
    FORBIDDEN_NON_ACCEL,
    'hard',
    ['tricky', 'vibration'],
    REASON_MOTION_OK,
    [
      'How strong is the shaking?',
      'Is something vibrating nearby?',
      'Is the floor moving?',
      'How much did the machine shake the building?',
      'Is the shaking getting stronger or weaker?',
      'Does it shake more when it spins faster?',
      'How steady is the phone lying on the passenger seat?',
      'How much does it move when I sneeze?',
      'How smooth is my hand while I brush?',
      'Is the baby moving in the crib?',
      'Is the cat awake and moving on my lap?',
      'How much is the office chair vibrating under me?',
      'Did the door get slammed or just closed?',
      'Is the elevator moving or stopped?',
    ],
  ),
  ambiguousGroup(
    'vibration',
    'unsupported',
    null,
    [],
    [],
    'hard',
    ['tricky', 'prediction'],
    REASON_VAGUE,
    ['How shaky will this ride be?'],
  ),
  ambiguousGroup(
    'vibration',
    'unsupported',
    null,
    [],
    [],
    'hard',
    ['tricky', 'history'],
    REASON_NO_HISTORY,
    [
      'Was the shaking worse than yesterday?',
      'Is my washing machine shaking more than a normal one?',
      'Is the tremor better than last week?',
    ],
  ),
  ambiguousGroup(
    'vibration',
    'unsupported',
    null,
    [],
    [],
    'hard',
    ['tricky', 'frequency', 'dsl-limitation'],
    REASON_NO_FFT,
    [
      'How much of this shaking is the bass?',
      'Is this vibration regular or random?',
      'Is the vibration high-frequency or low-frequency?',
      'Is the rocking motion rhythmic?',
    ],
  ),
  ambiguousGroup(
    'vibration',
    'unsupported',
    null,
    [],
    [],
    'hard',
    ['tricky', 'threshold'],
    REASON_NO_THRESHOLD,
    [
      'Is the vibration dangerous for the hard drive?',
      'Is the phone moving too much to take a photo?',
    ],
  ),
  ambiguousGroup(
    'vibration',
    'success',
    'accelerometer',
    ACCEL,
    FORBIDDEN_NON_ACCEL,
    'hard',
    ['tricky', 'comparative'],
    REASON_MOTION_OK,
    ['Which hand shakes more?'],
  ),

  // ------------------------------------------------------ magnetic ambiguity
  ambiguousGroup(
    'magnetic',
    'success',
    'magnetometer',
    MAG,
    FORBIDDEN_NON_MAG,
    'hard',
    ['tricky', 'material'],
    REASON_MAG_DETECTION_OK,
    [
      'Is this metal or just iron-colored paint?',
      'Is there something magnetic in my pocket?',
      'Does this phone case have a strong magnet?',
      'Where exactly is the magnet inside the mattress?',
      'Does the field spike when the elevator passes?',
      'Can the phone find my lost key by its magnet?',
      'Is the magnetic strip demagnetized?',
      'How magnetic is this beach sand?',
      'Is my new couch frame steel?',
      'Which room has the strongest field?',
      'Is the mag-lock engaged?',
      'Is this jewelry magnetic?',
    ],
  ),
  ambiguousGroup(
    'magnetic',
    'success',
    'magnetometer',
    MAG,
    FORBIDDEN_NON_MAG,
    'hard',
    ['tricky', 'comparative'],
    REASON_MAG_DETECTION_OK,
    ['Which magnet is closer?', "How much stronger is the magnet than the Earth's field?"],
  ),
  ambiguousGroup(
    'magnetic',
    'unsupported',
    null,
    [],
    [],
    'hard',
    ['tricky', 'safety'],
    REASON_SAFETY_JUDGMENT,
    [
      'Is this magnet safe for my pacemaker?',
      'Is the magnetic field here unhealthy?',
      'Is the field strong enough to affect my credit cards?',
    ],
  ),
  ambiguousGroup(
    'magnetic',
    'unsupported',
    null,
    [],
    [],
    'hard',
    ['tricky', 'force', 'dsl-limitation'],
    REASON_MAG_UNKNOWN,
    [
      'How far away can this magnet pull the phone?',
      'Is the magnet strong enough to hold the phone?',
      'Is my watch magnetic enough to stick to the fridge?',
    ],
  ),
  ambiguousGroup(
    'magnetic',
    'unsupported',
    null,
    [],
    [],
    'hard',
    ['tricky', 'attribution'],
    REASON_MAG_UNKNOWN,
    [
      'Is the field here natural or man-made?',
      'Is this anomaly a pipe or a rebar?',
      'Is the field coming from the wall or the floor?',
      'Is the strong field the speaker or the charger?',
    ],
  ),
  ambiguousGroup(
    'magnetic',
    'unsupported',
    null,
    [],
    [],
    'hard',
    ['tricky', 'history'],
    REASON_NO_HISTORY,
    ['Did the magnet lose strength over the years?'],
  ),

  // ----------------------------------------------------- rotation ambiguity
  ambiguousGroup(
    'rotation',
    'success',
    'gyroscope',
    GYRO_ACCEL,
    FORBIDDEN_MAG,
    'hard',
    ['tricky', 'attribution'],
    REASON_ATTRIBUTION,
    ['Am I turning or is the room turning?'],
  ),
  ambiguousGroup(
    'rotation',
    'success',
    'gyroscope',
    GYRO_ACCEL,
    FORBIDDEN_MAG,
    'hard',
    ['tricky', 'rotation'],
    REASON_ROTATION_OK,
    [
      'Is the platter turning or stalled?',
      'Did the phone itself turn, or did the whole table turn?',
      'How much does the phone rotate when I laugh?',
      'Is the phone still rotating after the nudge?',
      'How much does my wrist rotate during the serve?',
      'Was that spin stronger than the first?',
    ],
  ),
  ambiguousGroup(
    'rotation',
    'success',
    'gyroscope',
    GYRO_ACCEL,
    FORBIDDEN_MAG,
    'hard',
    ['tricky', 'comparative'],
    REASON_MOTION_OK,
    [
      'Is my aim steadier with my left hand?',
      'Is the carousel moving faster than the Ferris wheel?',
    ],
  ),
  ambiguousGroup(
    'rotation',
    'success',
    'gyroscope',
    GYRO_ACCEL,
    FORBIDDEN_MAG,
    'hard',
    ['tricky', 'unit'],
    REASON_MOTION_OK,
    ['Is the turntable running at 33⅓ rpm?'],
  ),
  ambiguousGroup(
    'rotation',
    'unsupported',
    null,
    [],
    [],
    'hard',
    ['tricky', 'direction', 'dsl-limitation'],
    REASON_NO_DIRECTION_SIGN,
    ['Is the chair spinning clockwise?', 'Did the phone spin left or right?'],
  ),
  ambiguousGroup(
    'rotation',
    'unsupported',
    null,
    [],
    [],
    'hard',
    ['tricky', 'dsl-limitation'],
    REASON_NO_TOTAL_ANGLE,
    ['Did the phone complete a full rotation?', 'Am I spinning in place or traveling?'],
  ),
  ambiguousGroup(
    'rotation',
    'unsupported',
    null,
    [],
    [],
    'hard',
    ['tricky', 'prescriptive'],
    REASON_VAGUE,
    [
      'How fast should I spin for the dance move?',
      'Which way should I rotate the phone?',
      'How fast is too fast for the spinner toy?',
    ],
  ),
  ambiguousGroup(
    'rotation',
    'unsupported',
    null,
    [],
    [],
    'hard',
    ['tricky', 'threshold'],
    REASON_NO_THRESHOLD,
    [
      'Is my spin fast enough for the figure?',
      "Am I rocking the baby's crib gently enough?",
      'How wobbly is too wobbly?',
    ],
  ),
  ambiguousGroup(
    'rotation',
    'unsupported',
    null,
    [],
    [],
    'hard',
    ['tricky', 'history'],
    REASON_NO_HISTORY,
    ['Did I rotate more this time or last time?', 'Am I steadier after the coffee?'],
  ),
  ambiguousGroup(
    'rotation',
    'unsupported',
    null,
    [],
    [],
    'hard',
    ['tricky', 'attribution'],
    REASON_SAFETY_JUDGMENT,
    ['Is my hand tremor from caffeine or nerves?'],
  ),

  // --------------------------------------------------- tilt/orientation mix
  ambiguousGroup(
    'orientation',
    'unsupported',
    null,
    [],
    [],
    'hard',
    ['tricky', 'static-orientation', 'dsl-limitation'],
    REASON_NO_STATIC_ORIENTATION,
    [
      'Is my phone tilted right now?',
      'Is the picture hanging crooked?',
      'Is the phone flat on the table?',
      'Which way is the phone leaning?',
      'Am I holding the phone straight?',
      'Is the table still level after the move?',
      'How steep is this hill?',
      'Is the washing machine sitting level?',
      'Is the mirror tilted properly?',
      'How tilted is my head?',
      'Is the drone level before takeoff?',
      'Did the book stack lean any further?',
      'Is the ramp steeper than before?',
      'Did the phone rotate to face down?',
    ],
  ),
  ambiguousGroup(
    'orientation',
    'success',
    'accelerometer',
    ACCEL,
    FORBIDDEN_NON_ACCEL,
    'hard',
    ['tricky', 'tilt-event'],
    REASON_TILT_EVENT_OK,
    [
      'Did I tilt the phone just now?',
      'Did the shelf get tilted when I bumped it?',
      'Did the phone fall over or get pushed over?',
      'Did the phone tip over on the bumpy ride?',
      'Did the ladder shift while I was on it?',
      'Did the phone move when I set it down?',
    ],
  ),

  // --------------------------------------------------------- misc judgments
  ambiguousGroup(
    'meta',
    'unsupported',
    null,
    [],
    [],
    'hard',
    ['tricky', 'safety'],
    REASON_SAFETY_JUDGMENT,
    [
      'Is my room safe?',
      'Is the water safe to drink?',
      'Am I drunk?',
      'Is the meat still good?',
      'Is my washing machine broken?',
      'Is this bridge safe?',
      'Can you check my tires?',
      'Should I go to the doctor about my tremor?',
      'Can you measure how much I love this song?',
      'Did I sleep well?',
    ],
  ),

  // ------------------------------------------------ contextual success cases
  ambiguousGroup(
    'vibration',
    'success',
    'accelerometer',
    ACCEL,
    FORBIDDEN_NON_ACCEL,
    'hard',
    ['tricky', 'context'],
    REASON_MOTION_OK,
    [
      'Is the party shaking the house?',
      'How much does the phone move in my pocket when I run?',
      'Did the drum solo shake my drink?',
      'Is the printer shaking the shelf?',
      "How strong is my espresso machine's pump vibration?",
      'Is the subwoofer rattling the cabinet doors?',
      'Did my jump shake the whole balcony?',
      "How much does the cat's purr vibrate the couch?",
      "Does the neighbor's treadmill shake my wall?",
      'How much does the typewriter shake the desk?',
    ],
  ),
];
