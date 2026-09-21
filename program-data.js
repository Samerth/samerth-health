// Samerth Training Program — source of truth for gym plan, habits, and reference data
// PRIMARY GOAL: Fix right hip and knee pain. Recomp is secondary.
const PROGRAM_VERSION = 6;

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
    goal: 'Fix right hip and knee pain; then recomp (thicker chest/shoulders/back/glutes, flatter midsection) + pain-free posture.',
  },
  weekly_schedule: [
    { day: 'Monday', session: 'Upper Push' },
    { day: 'Tuesday', session: 'Lower Quad Focus' },
    { day: 'Wednesday', session: 'Home Pain Block' },
    { day: 'Thursday', session: 'Upper Pull' },
    { day: 'Friday', session: 'Lower Hamstring Focus' },
    { day: 'Saturday', session: 'Outdoor Walk 45-60 min' },
    { day: 'Sunday', session: 'Rest (or pain block if needed)' },
  ],
  sessions: [
    {
      id: 'pain_block',
      name: 'Short Pain Block',
      type: 'pain_block',
      duration_min: 12,
      note: 'MANDATORY before every gym session. Short but essential — do not skip.',
      exercises: [
        { name: 'Right Hip Flexor Stretch', sets: 2, reps: null, duration_seconds: 40, weight_kg: 0, side: 'RIGHT', cue: 'Kneeling lunge, right knee down, tuck pelvis, push hips forward gently' },
        { name: 'Right QL Stretch', sets: 2, reps: null, duration_seconds: 40, weight_kg: 0, side: 'RIGHT', cue: 'Stand, reach left arm overhead and bend left, feel right side stretch' },
        { name: 'Banded Clamshells', sets: 2, reps: 12, duration_seconds: null, weight_kg: 0, side: 'RIGHT first', cue: 'Right side first. Slow, hold at top 2s, don\'t let pelvis rock back.' },
        { name: 'Single-Leg Glute Bridge', sets: 2, reps: 10, duration_seconds: null, weight_kg: 0, side: 'RIGHT only', cue: 'Drive through right heel, squeeze right glute hard at top. This is key.' },
        { name: 'Dead Bug', sets: 2, reps: 6, duration_seconds: null, weight_kg: 0, side: 'each side', cue: 'Exhale fully before moving, lower back flat on floor throughout. Slow.' },
        { name: 'Banded TKE', sets: 2, reps: 12, duration_seconds: null, weight_kg: 0, side: 'RIGHT', cue: 'Band behind right knee, squeeze quad to full lock. Hold 1s. Knee rehab priority.' },
      ],
    },
    {
      id: 'upper_push',
      name: 'Upper Push',
      day: 'Monday',
      type: 'main',
      pain_block_id: 'pain_block',
      session_note: 'Short pain block MANDATORY (~12 min). Stop if right hip/knee >4/10. No OHP/dips.',
      exercises: [
        { name: 'Incline DB Press', sets: 3, reps: 10, weight_kg: null, cue: 'Chin tucked, shoulders back and down. Control descent.' },
        { name: 'Landmine Press', sets: 3, reps: 10, weight_kg: null, side: 'each side', cue: 'Shoulder safe pressing. Control the descent.' },
        { name: 'Face Pulls', sets: 3, reps: 15, weight_kg: null, cue: 'Pull to nose level, elbows high. Posture work built in.' },
        { name: 'Tricep Pushdown', sets: 3, reps: 12, weight_kg: null, cue: 'Elbows tucked, full extension at bottom' },
      ],
    },
    {
      id: 'lower_quad',
      name: 'Lower Quad Focus',
      day: 'Tuesday',
      type: 'main',
      pain_block_id: 'pain_block',
      session_note: 'Short pain block MANDATORY (~12 min). RIGHT leg first. Stop if right hip/knee >4/10. Swap to leg press if squats aggravate knee.',
      exercises: [
        { name: 'Goblet Squat OR Leg Press', sets: 3, reps: 10, weight_kg: null, cue: 'Watch right hip in mirror. Depth to comfort. Use leg press if knee angry.' },
        { name: 'Bulgarian Split Squat', sets: 3, reps: 8, weight_kg: null, side: 'each side', cue: 'RIGHT leg first. Short ROM. Skip if knee >3/10.' },
        { name: 'RDL', sets: 3, reps: 10, weight_kg: null, cue: 'Hip hinge, no spinal rounding. Push hips back. Knee-friendly.' },
      ],
    },
    {
      id: 'home_pain_block',
      name: 'Home Pain Block',
      day: 'Wednesday',
      type: 'pain_block',
      duration_min: 12,
      session_note: 'Same 6-move short pain block. No gym. Focus on right hip/knee rehab.',
      exercises: [
        { name: 'Right Hip Flexor Stretch', sets: 2, reps: null, duration_seconds: 40, weight_kg: 0, side: 'RIGHT', cue: 'Kneeling lunge, right knee down, tuck pelvis, push hips forward' },
        { name: 'Right QL Stretch', sets: 2, reps: null, duration_seconds: 40, weight_kg: 0, side: 'RIGHT', cue: 'Stand, reach left arm overhead and bend left, feel right side stretch' },
        { name: 'Banded Clamshells', sets: 2, reps: 12, weight_kg: 0, side: 'RIGHT first', cue: 'Slow, hold at top 2s' },
        { name: 'Single-Leg Glute Bridge', sets: 2, reps: 10, weight_kg: 0, side: 'RIGHT only', cue: 'Drive through right heel, squeeze right glute at top' },
        { name: 'Dead Bug', sets: 2, reps: 6, weight_kg: 0, side: 'each side', cue: 'Back flat, exhale fully. Slow and controlled.' },
        { name: 'Banded TKE', sets: 2, reps: 12, weight_kg: 0, side: 'RIGHT', cue: 'Band behind right knee, squeeze quad to full lock' },
      ],
    },
    {
      id: 'upper_pull',
      name: 'Upper Pull',
      day: 'Thursday',
      type: 'main',
      pain_block_id: 'pain_block',
      session_note: 'Short pain block MANDATORY (~12 min). Stop if right hip/knee >4/10.',
      exercises: [
        { name: 'Seated Cable Row', sets: 3, reps: 10, weight_kg: null, cue: 'Pause 2s at chest. Chin tucked, shoulder blades squeeze.' },
        { name: 'Lat Pulldown', sets: 3, reps: 10, weight_kg: null, cue: 'Pull elbows down equally. Don\'t let right shoulder elevate.' },
        { name: 'Face Pulls', sets: 3, reps: 15, weight_kg: null, cue: 'Pull to nose level, elbows high. Posture work built in.' },
        { name: 'Single-Arm DB Row', sets: 3, reps: 10, weight_kg: null, side: 'each side', cue: 'Right side — pull elbow to ceiling. Feel right blade retract.' },
      ],
    },
    {
      id: 'lower_hamstring',
      name: 'Lower Hamstring Focus',
      day: 'Friday',
      type: 'main',
      pain_block_id: 'pain_block',
      session_note: 'Short pain block MANDATORY (~12 min). RIGHT leg first. Stop if right hip/knee >4/10.',
      exercises: [
        { name: 'Hip Thrust', sets: 3, reps: 10, weight_kg: null, cue: 'Both heels drive equally. Watch for right hip hiking. Squeeze glutes at top.' },
        { name: 'Seated Leg Curl', sets: 3, reps: 12, weight_kg: null, cue: 'Full range, slow eccentric, squeeze at top. Knee-friendly.' },
        { name: 'Single-Leg RDL', sets: 3, reps: 8, weight_kg: null, side: 'each side', cue: 'RIGHT leg standing first. Move slow. Hip level throughout.' },
      ],
    },
    {
      id: 'outdoor_walk',
      name: 'Outdoor Walk',
      day: 'Saturday',
      type: 'cardio',
      duration_min: 60,
      exercises: [
        { name: 'Outdoor Walk', sets: 1, reps: null, duration_seconds: 3600, weight_kg: 0, cue: 'Walk tall, chin back, shoulders relaxed. Natural terrain preferred. Seawall or QE Park. 45-60 min.' },
      ],
    },
  ],
  exercises_to_avoid: [
    { name: 'Overhead Press (OHP)', reason: 'Right shoulder not in safe position yet' },
    { name: 'Dips', reason: 'Worsens right pec minor tightness and shoulder protraction' },
    { name: 'Upright Rows', reason: 'Impingement risk with current shoulder position' },
    { name: 'Barbell Back Squat', reason: 'Too much asymmetrical spinal loading with current hip pattern' },
    { name: 'Running', reason: 'Reinforces hip pattern and loads right knee under impact' },
    { name: 'HIIT', reason: 'Reinforces hip pattern, kills recovery, joint stress' },
    { name: 'Deep Lunges', reason: 'Aggravates right knee when inflamed — shorten ROM or swap to leg press' },
    { name: 'Jump Training', reason: 'Impact stress on right knee during rehab phase' },
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
    { name: 'Vitamin D3 + K2', dose: '1000 IU', timing: 'With breakfast fat', brand: 'Organika', note: 'recheck labs with clinician' },
    { name: 'Vitamin B12', dose: '1000 mcg', timing: 'Sublingual with breakfast', note: 'recheck labs' },
    { name: 'Omega-3 (EPA/DHA)', timing: 'With breakfast', brand: 'Jamieson Extra Strength' },
    { name: 'Creatine', dose_g: 5, timing: 'Daily with breakfast' },
    { name: 'Magnesium', timing: 'Morning with breakfast', note: '≥2h from evening minocycline' },
    { name: 'Whey Isolate', dose: '1.5 scoops', timing: 'Afternoon' },
    { name: 'Zinc bisglycinate', dose: '50 mg', timing: 'Evening', freq: '3x_week', brand: 'Webber', note: '≥2h after minocycline · not for indefinite daily use' },
  ],
  skincare: {
    morning: [
      { step: 1, product: 'Face wash' },
      { step: 2, product: 'Arencia vitamin C' },
      { step: 3, product: 'CeraVe ultra-light moisturizer' },
      { step: 4, product: 'Sheer zinc mineral SPF' },
    ],
    evening: [
      { step: 1, product: 'Face wash PM' },
      { step: 2, product: 'CeraVe moisturizer' },
      { step: 3, product: 'Differin (adapalene)' },
      { step: 4, product: 'Minoxidil 5% foam temples/hair' },
    ],
    rx: [
      { product: 'Minocycline (oral antibiotic)', timing: 'With dinner', status: 'rx' },
    ],
    weekly: [
      { product: 'Ketoconazole 1% (Nizoral) scalp+beard', timing: 'Leave 3-5 min', freq: '3x/week' },
    ],
  },
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

  const painBlockSession = sessionsById.pain_block;

  const warmup = {
    note: 'MANDATORY: Short pain block (~12 min) first. Posture via Face Pulls + chin cues. Stop lifts if right hip/knee >4/10.',
    phases: [
      {
        name: painBlockSession?.name || 'Short Pain Block',
        exercises: (painBlockSession?.exercises || []).map(mapProgramExercise),
      },
    ],
  };

  const templates = {};
  program.sessions
    .filter(s => s.day != null)
    .forEach(s => {
      const isMainSession = s.type === 'main';
      templates[s.id] = {
        name: s.name,
        sessionType: s.type,
        sessionNote: s.session_note || undefined,
        includeWarmup: isMainSession,
        exercises: (s.exercises || []).map(mapProgramExercise),
      };
    });

  const schedule = {};
  program.weekly_schedule.forEach(({ day, session }) => {
    if (session === 'Rest' || session.includes('Rest')) return;
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
    skincare: program.skincare,
    weekly_checkin: program.weekly_checkin,
    session_log_fields: program.session_log_fields,
  };
}

function buildProgramHabits(program = SAMERTH_PROGRAM) {
  const habits = [];
  let order = 1;

  const add = (label, block, sub, freq = 'daily', notes = '', status = 'have') => {
    habits.push({ label, block, sub, freq, status, item_order: order++, notes });
  };

  // ─── MORNING (block: morning) ───
  add('Face wash', 'morning', 'AM cleanse');
  add('Arencia vitamin C', 'morning', 'After cleanse');
  add('CeraVe ultra-light moisturizer', 'morning', 'After vitamin C');
  add('Sheer zinc mineral SPF', 'morning', 'Last skincare step');
  add('Vitamin D3 + K2 (1000 IU)', 'morning', 'With breakfast fat · Organika', 'daily', 'recheck labs with clinician');
  add('Vitamin B12 1000 mcg', 'morning', 'Sublingual with breakfast', 'daily', 'recheck labs');
  add('Omega-3 (EPA/DHA)', 'morning', 'With breakfast · Jamieson Extra Strength');
  add('Creatine 5g', 'morning', 'Daily with breakfast');
  add('Magnesium', 'morning', 'Morning with breakfast', 'daily', '≥2h from evening minocycline');
  add('Morning protein', 'morning', 'Eggs + Greek yogurt · ~35g');

  // ─── AFTERNOON (block: midday) ───
  add('Whey isolate 1.5 scoops', 'midday', '~40g protein');
  add('Tiffin meal 1', 'midday', 'Dal/egg + roti · ~20g protein', 'weekdays');
  add('Tiffin meal 2', 'midday', 'Chicken + rice · ~40g protein', 'weekdays');
  add('Posture break / hip openers', 'midday', '2-3 min if desk-bound', 'weekdays', 'Optional');
  add('English conversation / accent practice', 'midday', '30 min with Communication Bot · 12:00–12:30 PT', 'daily');

  // ─── PRE-GYM / PHYSIO (block: physio) ───
  add('Short pain block (~12 min)', 'physio', 'Right hip & knee — MANDATORY before lifting', 'gym_days');
  add('Mon: Upper Push', 'physio', 'After pain block · 4 lifts', 'mon_only');
  add('Tue: Lower Quad', 'physio', 'After pain block · right leg first · 3 lifts', 'tue_only');
  add('Thu: Upper Pull', 'physio', 'After pain block · 4 lifts', 'thu_only');
  add('Fri: Lower Ham', 'physio', 'After pain block · right leg first · 3 lifts', 'fri_only');
  add('Wed: Home Pain Block', 'physio', '~12 min corrective · no gym', 'wed_only');

  // ─── EVENING (block: evening) ───
  add('Face wash PM', 'evening', 'Evening cleanse');
  add('CeraVe moisturizer', 'evening', 'After cleanse');
  add('Differin (adapalene)', 'evening', 'Retinoid');
  add('Minoxidil 5% foam', 'evening', 'Temples/hair');
  add('Minocycline (oral antibiotic)', 'evening', 'With dinner', 'daily', '', 'rx');
  add('Evening protein', 'evening', 'Cottage cheese or shake · ~25g');
  add('Zinc bisglycinate 50 mg', 'evening', '≥2h after minocycline · Webber', '3x_week', 'not for indefinite daily use');
  add('Nizoral (ketoconazole 1%)', 'evening', 'Scalp+beard · leave 3-5 min', '3x_week');

  // ─── WEEKEND (block: morning) ───
  add('Outdoor walk 45-60 min', 'morning', 'Seawall or QE Park', 'weekends');

  return habits;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PROGRAM_VERSION,
    SAMERTH_PROGRAM,
    buildGymConfigFromProgram,
    getProgramMeta,
    buildProgramHabits,
    DAY_NAME_TO_DOW,
  };
}
