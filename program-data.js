// Samerth Training Program — source of truth for gym plan, habits, and reference data
const PROGRAM_VERSION = 1;

const DAY_NAME_TO_DOW = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
};

const SAMERTH_PROGRAM = {
  program: 'Samerth Training Program',
  user: {
    name: 'Sam',
    age: 28,
    height_cm: 188,
    weight_kg: 89,
    goal: 'Fat loss + muscle building + pain free',
  },
  weekly_schedule: [
    { day: 'Monday', session: 'Upper Push' },
    { day: 'Tuesday', session: 'Lower Quad Focus' },
    { day: 'Wednesday', session: 'Home Corrective Routine' },
    { day: 'Thursday', session: 'Upper Pull' },
    { day: 'Friday', session: 'Lower Hamstring Focus' },
    { day: 'Saturday', session: 'Outdoor Walk 45-60 min' },
    { day: 'Sunday', session: 'Rest' },
  ],
  sessions: [
    {
      id: 'corrective_warmup',
      name: 'Corrective Warmup',
      type: 'warmup',
      note: 'Do this before every gym session. Non-negotiable.',
      phases: [
        {
          phase: 1,
          name: 'Release',
          duration_min: 5,
          exercises: [
            { name: 'Right Pec Minor Stretch', sets: 3, reps: null, duration_seconds: 45, weight_kg: 0, side: 'RIGHT', cue: 'Doorway, arm at 90°, lean forward gently' },
            { name: 'Right Hip Flexor Stretch', sets: 3, reps: null, duration_seconds: 45, weight_kg: 0, side: 'RIGHT', cue: 'Kneeling lunge, right knee down, push hips forward' },
            { name: 'Right QL Stretch', sets: 3, reps: null, duration_seconds: 45, weight_kg: 0, side: 'RIGHT', cue: 'Stand, reach left arm overhead and bend left, feel right side stretch' },
            { name: 'Left Upper Trap Stretch', sets: 3, reps: null, duration_seconds: 45, weight_kg: 0, side: 'LEFT', cue: 'Sit, drop left ear to right shoulder, don\'t force it' },
            { name: 'Neck Extensor Stretch', sets: 2, reps: null, duration_seconds: 30, weight_kg: 0, side: 'BOTH', cue: 'Chin to chest, gentle overpressure with hands' },
          ],
        },
        {
          phase: 2,
          name: 'Activate — Jacky\'s Exercises',
          duration_min: 8,
          exercises: [
            { name: 'Banded Clamshells', sets: 3, reps: 10, duration_seconds: null, weight_kg: 0, side: 'RIGHT emphasis', cue: 'Slow, hold at top, don\'t let pelvis rock back. Right side priority.' },
            { name: 'Dead Bug', sets: 3, reps: 10, duration_seconds: null, weight_kg: 0, side: 'BOTH', cue: 'Exhale fully before moving, lower back flat on floor throughout' },
            { name: 'Hip CARs', sets: 3, reps: 10, duration_seconds: null, weight_kg: 0, side: 'BOTH', cue: 'Full range circles, keep spine completely still, only hip moves' },
            { name: 'Standing Hip Abduction', sets: 3, reps: 10, duration_seconds: null, weight_kg: 0, side: 'BOTH', cue: 'Tap opposite toes to reset between reps. Don\'t lean trunk sideways.' },
          ],
        },
        {
          phase: 3,
          name: 'Integrate',
          duration_min: 7,
          exercises: [
            { name: 'Wall Chin Tucks', sets: 3, reps: 10, duration_seconds: null, weight_kg: 0, side: 'BOTH', cue: 'Stand against wall, push head back, hold 3 seconds each rep' },
            { name: 'Wall Slides', sets: 3, reps: 10, duration_seconds: null, weight_kg: 0, side: 'BOTH', cue: 'Arms slide up wall, keep both shoulders back and down throughout' },
            { name: 'Band Pull-Aparts', sets: 3, reps: 15, duration_seconds: null, weight_kg: 0, side: 'BOTH', cue: 'Squeeze shoulder blades together at end of every rep' },
            { name: 'Side Plank', sets: 3, reps: null, duration_seconds: 30, weight_kg: 0, side: 'RIGHT emphasis', cue: 'Push floor away with foot, lift from hip not waist. RIGHT side priority.' },
            { name: 'Pallof Press', sets: 3, reps: 10, duration_seconds: null, weight_kg: 0, side: 'BOTH', cue: 'Stand tall, don\'t rotate, brace core before pressing' },
          ],
        },
      ],
    },
    {
      id: 'upper_push',
      name: 'Upper Push',
      day: 'Monday',
      type: 'main',
      warmup_id: 'corrective_warmup',
      exercises: [
        { name: 'Incline DB Press', sets: 4, reps: 10, weight_kg: null, cue: 'Right shoulder back and down before every set. Don\'t let it creep forward.' },
        { name: 'Landmine Press', sets: 3, reps: 10, weight_kg: null, side: 'each side', cue: 'Shoulder safe pressing. Control the descent.' },
        { name: 'Cable Lateral Raise', sets: 3, reps: 15, weight_kg: null, cue: 'Controlled, no momentum. Feel the side delt.' },
        { name: 'Face Pulls', sets: 4, reps: 15, weight_kg: null, cue: 'Pull to nose level, flare elbows high. Non-negotiable every session.' },
        { name: 'Tricep Pushdown', sets: 3, reps: 12, weight_kg: null, cue: 'Elbows tucked, full extension at bottom' },
        { name: 'Overhead Tricep Extension', sets: 3, reps: 12, weight_kg: null, cue: 'Control the eccentric, don\'t flare elbows' },
      ],
      session_note: 'No overhead press. No dips. Right shoulder not ready yet.',
    },
    {
      id: 'lower_quad',
      name: 'Lower Quad Focus',
      day: 'Tuesday',
      type: 'main',
      warmup_id: 'corrective_warmup',
      exercises: [
        { name: 'Goblet Squat', sets: 4, reps: 10, weight_kg: null, cue: 'Watch right hip in mirror. Don\'t let it hike up.' },
        { name: 'Bulgarian Split Squat', sets: 3, reps: 10, weight_kg: null, side: 'each side', cue: 'Always start RIGHT leg first. Check hip level in mirror.' },
        { name: 'Leg Press', sets: 3, reps: 12, weight_kg: null, cue: 'Feet even, watch right knee tracks over right toe' },
        { name: 'Romanian Deadlift', sets: 3, reps: 10, weight_kg: null, cue: 'Hip hinge, no spinal rounding. Push hips back.' },
        { name: 'Copenhagen Plank', sets: 3, reps: null, duration_seconds: 20, weight_kg: 0, side: 'each side', cue: 'Keep hips level throughout. Don\'t let right hip drop.' },
        { name: 'Pallof Press', sets: 3, reps: 10, weight_kg: null, side: 'each side', cue: 'Stand tall, brace before pressing, don\'t rotate' },
        { name: 'Incline Treadmill Walk', sets: 1, reps: null, duration_seconds: 900, weight_kg: 0, cue: 'After session. Incline 8-10%, HR 120-135 bpm' },
      ],
    },
    {
      id: 'home_corrective',
      name: 'Home Corrective Routine',
      day: 'Wednesday',
      type: 'corrective',
      duration_min: 20,
      exercises: [
        { name: 'Right Pec Minor Stretch', sets: 3, reps: null, duration_seconds: 45, weight_kg: 0, side: 'RIGHT' },
        { name: 'Right Hip Flexor Stretch', sets: 3, reps: null, duration_seconds: 45, weight_kg: 0, side: 'RIGHT' },
        { name: 'Right QL Stretch', sets: 3, reps: null, duration_seconds: 45, weight_kg: 0, side: 'RIGHT' },
        { name: 'Left Upper Trap Stretch', sets: 3, reps: null, duration_seconds: 45, weight_kg: 0, side: 'LEFT' },
        { name: 'Cat-Cow', sets: 2, reps: 10, duration_seconds: null, weight_kg: 0, cue: 'Slow and controlled, breathe through each rep' },
        { name: 'Banded Clamshells', sets: 3, reps: 10, weight_kg: 0, side: 'RIGHT emphasis', cue: 'Slow, hold at top' },
        { name: 'Dead Bug', sets: 3, reps: 10, weight_kg: 0, cue: 'Back flat, exhale fully' },
        { name: 'Hip CARs', sets: 3, reps: 10, weight_kg: 0, side: 'each side', cue: 'Spine still, full range' },
        { name: 'Standing Hip Abduction', sets: 3, reps: 10, weight_kg: 0, side: 'each side', cue: 'Toe tap reset between reps' },
        { name: 'Single Leg Glute Bridge', sets: 3, reps: 12, weight_kg: 0, side: 'RIGHT only', cue: 'Drive through right heel, squeeze right glute at top' },
        { name: 'Side Plank', sets: 3, reps: null, duration_seconds: 30, weight_kg: 0, side: 'RIGHT emphasis', cue: 'Lift from hip not waist' },
        { name: 'Wall Chin Tucks', sets: 3, reps: 10, weight_kg: 0, cue: 'Hold 3 seconds each rep' },
      ],
    },
    {
      id: 'upper_pull',
      name: 'Upper Pull',
      day: 'Thursday',
      type: 'main',
      warmup_id: 'corrective_warmup',
      exercises: [
        { name: 'Seated Cable Row', sets: 4, reps: 10, weight_kg: null, cue: 'Pause 2s at chest. Both shoulder blades squeeze. Equal both sides.' },
        { name: 'Lat Pulldown', sets: 4, reps: 10, weight_kg: null, cue: 'Pull elbows down equally both sides. Don\'t let right shoulder elevate.' },
        { name: 'Single Arm DB Row', sets: 3, reps: 12, weight_kg: null, side: 'each side', cue: 'Right side — pull elbow to ceiling. Feel right blade retract.' },
        { name: 'Rear Delt Fly', sets: 3, reps: 15, weight_kg: null, cue: 'Control the movement, squeeze rear delts at top' },
        { name: 'Face Pulls', sets: 4, reps: 15, weight_kg: null, cue: 'Pull to nose level, elbows high and wide. Non-negotiable.' },
        { name: 'Y-T-W Raises', sets: 2, reps: 10, weight_kg: null, cue: 'Light weight. Face down on incline bench. Feel shoulder blade move each position.' },
        { name: 'Hammer Curl', sets: 3, reps: 12, weight_kg: null, cue: 'Neutral grip, control the eccentric' },
        { name: 'Incline DB Curl', sets: 3, reps: 10, weight_kg: null, cue: 'Full stretch at bottom, don\'t swing' },
      ],
    },
    {
      id: 'lower_hamstring',
      name: 'Lower Hamstring Focus',
      day: 'Friday',
      type: 'main',
      warmup_id: 'corrective_warmup',
      exercises: [
        { name: 'Hip Thrust', sets: 4, reps: 12, weight_kg: null, cue: 'Both heels drive equally. Watch for right hip hiking. Squeeze both glutes at top.' },
        { name: 'Deficit Reverse Lunge', sets: 3, reps: 10, weight_kg: null, side: 'each side', cue: 'Control the descent. Keep torso upright.' },
        { name: 'Seated Leg Curl', sets: 4, reps: 12, weight_kg: null, cue: 'Full range, slow eccentric, squeeze at top' },
        { name: 'Single Leg RDL', sets: 3, reps: 8, weight_kg: null, side: 'each side', cue: 'RIGHT leg standing. Move slow. Hip level throughout.' },
        { name: 'Side Lying Hip Abduction', sets: 3, reps: 15, weight_kg: 0, side: 'RIGHT focus', cue: 'Slow and controlled, don\'t let hip roll back' },
        { name: 'Dead Bug', sets: 3, reps: 6, weight_kg: 0, side: 'each side', cue: 'Back flat, exhale fully before each rep' },
        { name: 'Incline Treadmill Walk', sets: 1, reps: null, duration_seconds: 900, weight_kg: 0, cue: 'After session. Incline 8-10%, HR 120-135 bpm' },
      ],
    },
    {
      id: 'outdoor_walk',
      name: 'Outdoor Walk',
      day: 'Saturday',
      type: 'cardio',
      duration_min: 60,
      exercises: [
        { name: 'Outdoor Walk', sets: 1, reps: null, duration_seconds: 3600, weight_kg: 0, cue: 'Walk tall, chin back, shoulders relaxed down. Natural terrain preferred. Seawall or QE Park.' },
      ],
    },
  ],
  exercises_to_avoid: [
    { name: 'Overhead Press', reason: 'Right shoulder not in safe position yet' },
    { name: 'Dips', reason: 'Worsens right pec minor tightness and shoulder protraction' },
    { name: 'Upright Rows', reason: 'Impingement risk with current shoulder position' },
    { name: 'Barbell Back Squat', reason: 'Too much asymmetrical spinal loading with current hip pattern' },
    { name: 'Heavy Shrugs', reason: 'Worsens left neck tension' },
    { name: 'Behind The Neck Anything', reason: 'Dangerous with forward head posture' },
    { name: 'Running', reason: 'Reinforces hip pattern under speed and load' },
    { name: 'HIIT', reason: 'Reinforces hip pattern, kills recovery, joint stress on Accutane' },
    { name: 'Sit-ups / Crunches', reason: 'Worsens forward head posture and spinal flexion pattern' },
  ],
  nutrition: {
    daily_calories: 2500,
    daily_protein_g: 170,
    meals: [
      { meal: 'Morning', foods: '3 eggs + 1 cup Greek yogurt', protein_g: 35 },
      { meal: 'Midday', foods: '1.5 scoops whey isolate in water', protein_g: 40 },
      { meal: 'Tiffin Meal 1', foods: 'Dal/egg item + roti', protein_g: 20 },
      { meal: 'Tiffin Meal 2', foods: 'Chicken + rice', protein_g: 40 },
      { meal: 'Evening', foods: 'Cottage cheese or second shake', protein_g: 25 },
    ],
  },
  supplements: [
    { name: 'Creatine', dose_g: 5, timing: 'Any time daily — consistency matters' },
    { name: 'Whey Isolate', dose: '1.5 scoops', timing: 'Post-workout or midday' },
    { name: 'Vitamin D3', timing: 'With tiffin — fat containing meal' },
    { name: 'Omega-3', timing: 'With tiffin — critical on Accutane for joints' },
    { name: 'B12', timing: 'Morning' },
    { name: 'Magnesium', timing: 'Before bed' },
    { name: 'Zinc', timing: 'Before bed, 30 min gap from magnesium' },
    { name: 'Ashwagandha', timing: 'Same time daily, morning or before bed' },
  ],
};

function formatDuration(seconds) {
  if (!seconds) return null;
  if (seconds >= 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds >= 60) return `${Math.round(seconds / 60)} min`;
  return `${seconds} sec`;
}

function mapProgramExercise(ex) {
  const noteParts = [];
  if (ex.side && ex.side !== 'BOTH') noteParts.push(ex.side);
  if (ex.duration_seconds) noteParts.push(formatDuration(ex.duration_seconds));
  const note = noteParts.length ? noteParts.join(' · ') : undefined;
  const logType = ex.weight_kg === 0 || ex.duration_seconds ? 'check' : 'weight';

  return {
    name: ex.name.trim(),
    sets: Number(ex.sets) > 0 ? Number(ex.sets) : 3,
    reps: ex.reps != null && ex.reps !== '' ? Number(ex.reps) : null,
    note,
    cue: ex.cue || undefined,
    side: ex.side || undefined,
    duration_seconds: ex.duration_seconds || undefined,
    logType,
  };
}

function buildGymConfigFromProgram(program = SAMERTH_PROGRAM) {
  const sessionsById = {};
  program.sessions.forEach(s => { sessionsById[s.id] = s; });

  const warmupSession = sessionsById.corrective_warmup;
  const warmup = {
    note: warmupSession?.note,
    phases: (warmupSession?.phases || []).map(phase => ({
      name: phase.name,
      exercises: (phase.exercises || []).map(mapProgramExercise),
    })),
  };

  const templates = {};
  program.sessions
    .filter(s => s.type !== 'warmup')
    .forEach(s => {
      templates[s.id] = {
        name: s.name,
        sessionType: s.type,
        sessionNote: s.session_note || undefined,
        includeWarmup: !!s.warmup_id,
        exercises: (s.exercises || []).map(mapProgramExercise),
      };
    });

  const schedule = {};
  program.weekly_schedule.forEach(({ day, session }) => {
    if (session === 'Rest') return;
    const match = program.sessions.find(s => s.day === day);
    const dow = DAY_NAME_TO_DOW[day];
    if (match && dow != null) schedule[dow] = match.id;
  });

  return { templates, schedule, warmup };
}

function getProgramMeta(program = SAMERTH_PROGRAM) {
  return {
    program: program.program,
    user: program.user,
    exercises_to_avoid: program.exercises_to_avoid,
    nutrition: program.nutrition,
    supplements: program.supplements,
    weekly_checkin: program.weekly_checkin,
    session_log_fields: program.session_log_fields,
  };
}

function buildProgramHabits(program = SAMERTH_PROGRAM) {
  const habits = [];
  let order = 1;

  const add = (label, block, sub, freq = 'daily', notes = '') => {
    habits.push({ label, block, sub, freq, status: 'have', item_order: order++, notes });
  };

  add('Creatine 5g', 'morning', program.supplements.find(s => s.name === 'Creatine')?.timing || '');
  add('B12', 'morning', 'With breakfast');
  add('Ashwagandha', 'morning', 'Same time daily');

  add('Whey isolate (1.5 scoops)', 'midday', '40g protein target');
  add('Vitamin D3', 'midday', 'With tiffin — fat-containing meal');
  add('Omega-3', 'midday', 'Critical on Accutane for joints');
  add('Tiffin meal 1', 'midday', 'Dal/egg + roti · ~20g protein', 'weekdays');
  add('Tiffin meal 2', 'midday', 'Chicken + rice · ~40g protein', 'weekdays');

  add('Morning protein', 'morning', '3 eggs + Greek yogurt · ~35g', 'daily');
  add('Evening protein', 'evening', 'Cottage cheese or shake · ~25g', 'daily');

  add('Magnesium', 'bedtime', 'Before bed');
  add('Zinc', 'bedtime', '30 min after magnesium');

  add('Outdoor walk', 'morning', '45–60 min · seawall or QE Park', 'weekends');

  return habits;
}
