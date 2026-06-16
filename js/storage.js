const STORAGE_KEY = 'workout-app-v2';

const DAY_LABELS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

const FREQUENCY_OPTIONS = {
  daily: { label: 'Каждый день', days: [0, 1, 2, 3, 4, 5, 6] },
  weekdays: { label: 'Будни', days: [1, 2, 3, 4, 5] },
  weekends: { label: 'Выходные', days: [0, 6] },
  eod: { label: 'Через день', days: null },
  '3week': { label: '3 раза в неделю', days: [1, 3, 5] },
  custom: { label: 'Свои дни', days: null },
};

const DEFAULT_EXERCISES = [
  { id: 'pushups', name: 'Отжимания', target: 100, emoji: '💪', frequency: 'daily', activeDays: [0, 1, 2, 3, 4, 5, 6] },
  { id: 'squats', name: 'Приседания', target: 100, emoji: '🦵', frequency: 'daily', activeDays: [0, 1, 2, 3, 4, 5, 6] },
  { id: 'abs', name: 'Пресс', target: 100, emoji: '🔥', frequency: 'daily', activeDays: [0, 1, 2, 3, 4, 5, 6] },
];

function todayKey() {
  return formatDateKey(new Date());
}

function formatDateKey(date) {
  const d = date instanceof Date ? date : new Date(date + 'T12:00:00');
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateKey(key) {
  return new Date(key + 'T12:00:00');
}

function daysBetween(fromKey, toKey) {
  const a = parseDateKey(fromKey).getTime();
  const b = parseDateKey(toKey).getTime();
  return Math.round((b - a) / 86400000);
}

function getDayOfWeek(dateKey) {
  return parseDateKey(dateKey).getDay();
}

function migrateState(raw) {
  if (!raw) return createDefaultState();

  let state = raw;

  if (raw.exercises && !raw.exercises[0]?.frequency) {
    state = {
      ...raw,
      exercises: raw.exercises.map((ex) => ({
        ...ex,
        frequency: 'daily',
        activeDays: [0, 1, 2, 3, 4, 5, 6],
      })),
    };
  }

  if (!state.exercises?.length) state.exercises = DEFAULT_EXERCISES.map((e) => ({ ...e }));
  if (!state.dailyLog) state.dailyLog = {};
  if (!state.weightLog) state.weightLog = [];
  if (!state.dayNotes) state.dayNotes = {};
  if (!state.settings) {
    state.settings = { reminderEnabled: false, reminderTime: '08:00', scheduleStart: todayKey() };
  }
  if (!state.settings.scheduleStart) state.settings.scheduleStart = todayKey();

  return state;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return migrateState(JSON.parse(raw));

    const legacy = localStorage.getItem('workout-app-v1');
    if (legacy) {
      const state = migrateState(JSON.parse(legacy));
      saveState(state);
      return state;
    }
    return createDefaultState();
  } catch {
    return createDefaultState();
  }
}

function createDefaultState() {
  return {
    exercises: DEFAULT_EXERCISES.map((e) => ({ ...e })),
    dailyLog: {},
    weightLog: [],
    dayNotes: {},
    settings: {
      reminderEnabled: false,
      reminderTime: '08:00',
      scheduleStart: todayKey(),
    },
  };
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function isExerciseScheduled(exercise, dateKey, scheduleStart) {
  const freq = exercise.frequency || 'daily';

  if (freq === 'eod') {
    const diff = daysBetween(scheduleStart, dateKey);
    return diff >= 0 && diff % 2 === 0;
  }

  if (freq === 'custom') {
    const days = exercise.activeDays?.length ? exercise.activeDays : [1, 3, 5];
    return days.includes(getDayOfWeek(dateKey));
  }

  const preset = FREQUENCY_OPTIONS[freq];
  const days = preset?.days ?? exercise.activeDays ?? [0, 1, 2, 3, 4, 5, 6];
  return days.includes(getDayOfWeek(dateKey));
}

function getScheduledExercises(state, dateKey = todayKey()) {
  const start = state.settings.scheduleStart || todayKey();
  return state.exercises.filter((ex) => isExerciseScheduled(ex, dateKey, start));
}

function isTrainingDay(state, dateKey = todayKey()) {
  return getScheduledExercises(state, dateKey).length > 0;
}

function getExerciseCount(state, exerciseId, dateKey = todayKey()) {
  return state.dailyLog[dateKey]?.[exerciseId] ?? 0;
}

function setExerciseCount(state, exerciseId, count, dateKey = todayKey()) {
  if (!state.dailyLog[dateKey]) state.dailyLog[dateKey] = {};
  state.dailyLog[dateKey][exerciseId] = Math.max(0, count);
  saveState(state);
  return state.dailyLog[dateKey][exerciseId];
}

function addReps(state, exerciseId, amount, dateKey = todayKey()) {
  const current = getExerciseCount(state, exerciseId, dateKey);
  return setExerciseCount(state, exerciseId, current + amount, dateKey);
}

function resetExercise(state, exerciseId, dateKey = todayKey()) {
  return setExerciseCount(state, exerciseId, 0, dateKey);
}

function isDayComplete(state, dateKey = todayKey()) {
  const scheduled = getScheduledExercises(state, dateKey);
  if (!scheduled.length) return false;
  const log = state.dailyLog[dateKey] ?? {};
  return scheduled.every((ex) => (log[ex.id] ?? 0) >= ex.target);
}

function getDayProgress(state, dateKey = todayKey()) {
  const scheduled = getScheduledExercises(state, dateKey);
  const log = state.dailyLog[dateKey] ?? {};
  let done = 0;
  let total = 0;
  for (const ex of scheduled) {
    done += Math.min(log[ex.id] ?? 0, ex.target);
    total += ex.target;
  }
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0, scheduled: scheduled.length };
}

function getDayStatus(state, dateKey) {
  if (!isTrainingDay(state, dateKey)) return 'rest';
  const progress = getDayProgress(state, dateKey);
  if (progress.total === 0) return 'rest';
  if (progress.percent >= 100) return 'complete';
  if (progress.done > 0) return 'partial';
  return 'missed';
}

function calculateStreak(state) {
  let streak = 0;
  const d = new Date();
  d.setHours(12, 0, 0, 0);

  for (let i = 0; i < 365; i++) {
    const key = formatDateKey(d);
    if (!isTrainingDay(state, key)) {
      d.setDate(d.getDate() - 1);
      continue;
    }
    if (isDayComplete(state, key)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else if (i === 0) {
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function getBestStreak(state) {
  let best = 0;
  let current = 0;
  const keys = Object.keys(state.dailyLog).sort();
  if (!keys.length) {
    const start = state.settings.scheduleStart;
    const end = todayKey();
    return scanRangeStreak(state, start, end).best;
  }

  const allDates = new Set(keys);
  const min = keys[0];
  const max = todayKey();
  let d = parseDateKey(min);
  const end = parseDateKey(max > todayKey() ? max : todayKey());

  while (d <= end) {
    const key = formatDateKey(d);
    if (isTrainingDay(state, key)) {
      if (isDayComplete(state, key)) {
        current++;
        best = Math.max(best, current);
      } else {
        current = 0;
      }
    }
    d.setDate(d.getDate() + 1);
  }
  return best;
}

function scanRangeStreak(state, fromKey, toKey) {
  let best = 0;
  let current = 0;
  let d = parseDateKey(fromKey);
  const end = parseDateKey(toKey);

  while (d <= end) {
    const key = formatDateKey(d);
    if (isTrainingDay(state, key)) {
      if (isDayComplete(state, key)) {
        current++;
        best = Math.max(best, current);
      } else {
        current = 0;
      }
    }
    d.setDate(d.getDate() + 1);
  }
  return { best, current };
}

function addWeight(state, weight, dateKey = todayKey()) {
  const entry = { date: dateKey, weight: Number(weight), id: Date.now() };
  state.weightLog.unshift(entry);
  saveState(state);
  return entry;
}

function deleteWeight(state, id) {
  state.weightLog = state.weightLog.filter((e) => e.id !== id);
  saveState(state);
}

function normalizeExerciseData({ name, target, emoji, frequency, activeDays }) {
  const freq = frequency || 'daily';
  let days = activeDays;
  if (freq !== 'custom' && freq !== 'eod') {
    days = FREQUENCY_OPTIONS[freq]?.days ?? [0, 1, 2, 3, 4, 5, 6];
  }
  if (!days?.length) days = [1, 3, 5];
  return {
    name,
    target: Number(target),
    emoji: emoji || '🏋️',
    frequency: freq,
    activeDays: [...days].sort((a, b) => a - b),
  };
}

function addExercise(state, data) {
  const id = 'ex-' + Date.now();
  state.exercises.push({ id, ...normalizeExerciseData(data) });
  saveState(state);
  return id;
}

function updateExercise(state, id, data) {
  const ex = state.exercises.find((e) => e.id === id);
  if (!ex) return;
  Object.assign(ex, normalizeExerciseData({ ...ex, ...data }));
  saveState(state);
}

function deleteExercise(state, id) {
  if (state.exercises.length <= 1) return false;
  state.exercises = state.exercises.filter((e) => e.id !== id);
  saveState(state);
  return true;
}

function setDayNote(state, dateKey, note) {
  if (note?.trim()) {
    state.dayNotes[dateKey] = note.trim();
  } else {
    delete state.dayNotes[dateKey];
  }
  saveState(state);
}

function getDayNote(state, dateKey) {
  return state.dayNotes[dateKey] ?? '';
}

function getHistory(state, limit = 60) {
  const dates = new Set([
    ...Object.keys(state.dailyLog),
    ...Object.keys(state.dayNotes),
  ]);

  return [...dates]
    .filter((date) => {
      const log = state.dailyLog[date];
      const hasActivity = log && Object.values(log).some((v) => v > 0);
      const hasNote = state.dayNotes[date];
      return hasActivity || hasNote || isTrainingDay(state, date);
    })
    .sort((a, b) => b.localeCompare(a))
    .slice(0, limit)
    .map((date) => ({
      date,
      log: state.dailyLog[date] ?? {},
      note: getDayNote(state, date),
      status: getDayStatus(state, date),
      complete: isDayComplete(state, date),
      progress: getDayProgress(state, date),
      scheduled: getScheduledExercises(state, date),
    }));
}

function getCalendarMonth(state, year, month) {
  const first = new Date(year, month, 1, 12, 0, 0);
  const last = new Date(year, month + 1, 0, 12, 0, 0);
  const startPad = first.getDay();
  const days = [];

  for (let i = 0; i < startPad; i++) days.push(null);

  for (let d = 1; d <= last.getDate(); d++) {
    const date = new Date(year, month, d, 12, 0, 0);
    const key = formatDateKey(date);
    days.push({
      date: key,
      day: d,
      status: getDayStatus(state, key),
      isToday: key === todayKey(),
    });
  }
  return days;
}

function getActivitySeries(state, days = 14) {
  const series = [];
  const d = new Date();
  d.setHours(12, 0, 0, 0);

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(d);
    date.setDate(date.getDate() - i);
    const key = formatDateKey(date);
    const progress = getDayProgress(state, key);
    const scheduled = getScheduledExercises(state, key);
    let reps = 0;
    const log = state.dailyLog[key] ?? {};
    for (const ex of scheduled) {
      reps += log[ex.id] ?? 0;
    }
    series.push({
      date: key,
      reps,
      percent: progress.percent,
      status: getDayStatus(state, key),
      label: date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
    });
  }
  return series;
}

function getExerciseStats(state, exerciseId, days = 30) {
  let total = 0;
  let completed = 0;
  const d = new Date();
  d.setHours(12, 0, 0, 0);

  for (let i = 0; i < days; i++) {
    const date = new Date(d);
    date.setDate(date.getDate() - i);
    const key = formatDateKey(date);
    const ex = state.exercises.find((e) => e.id === exerciseId);
    if (!ex || !isExerciseScheduled(ex, key, state.settings.scheduleStart)) continue;
    const count = getExerciseCount(state, exerciseId, key);
    total += count;
    if (count >= ex.target) completed++;
  }
  return { total, completed };
}

function getTotalStats(state) {
  let totalReps = 0;
  let completedDays = 0;
  let trainingDays = 0;

  const d = parseDateKey(state.settings.scheduleStart || todayKey());
  const end = parseDateKey(todayKey());

  while (d <= end) {
    const key = formatDateKey(d);
    if (isTrainingDay(state, key)) {
      trainingDays++;
      const log = state.dailyLog[key] ?? {};
      for (const ex of getScheduledExercises(state, key)) {
        totalReps += log[ex.id] ?? 0;
      }
      if (isDayComplete(state, key)) completedDays++;
    }
    d.setDate(d.getDate() + 1);
  }

  const weekSeries = getActivitySeries(state, 7);
  const weekComplete = weekSeries.filter((d) => d.status === 'complete').length;
  const weekTraining = weekSeries.filter((d) => d.status !== 'rest').length;

  return {
    totalReps,
    completedDays,
    trainingDays,
    streak: calculateStreak(state),
    bestStreak: getBestStreak(state),
    weekComplete,
    weekTraining,
    weekPercent: weekTraining ? Math.round((weekComplete / weekTraining) * 100) : 0,
  };
}

function getFrequencyLabel(exercise) {
  if (exercise.frequency === 'custom') {
    const days = (exercise.activeDays || []).map((d) => DAY_LABELS[d]).join(', ');
    return days || 'Свои дни';
  }
  return FREQUENCY_OPTIONS[exercise.frequency]?.label || 'Каждый день';
}

function updateSettings(state, settings) {
  state.settings = { ...state.settings, ...settings };
  saveState(state);
}
