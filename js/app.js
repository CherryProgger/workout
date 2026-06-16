let state = loadState();
let editingExerciseId = null;
let reminderTimer = null;
let selectedHistoryDate = todayKey();
let calendarCursor = (() => {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() };
})();

const TITLES = {
  today: 'Сегодня',
  history: 'История',
  weight: 'Вес',
  settings: 'Настройки',
};

const CIRCUMFERENCE = 2 * Math.PI * 52;

document.addEventListener('DOMContentLoaded', init);

function init() {
  registerServiceWorker();
  bindNavigation();
  bindForms();
  renderWeekdayHeader();
  renderAll();
  scheduleReminderCheck();
  setInterval(scheduleReminderCheck, 60_000);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(() => {
      navigator.serviceWorker.ready.then((reg) => reg.update());
    }).catch(() => {});
  }
}

function bindNavigation() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('tab-active', t.dataset.tab === name);
  });
  document.querySelectorAll('.view').forEach((v) => {
    v.classList.toggle('view-active', v.dataset.view === name);
  });
  document.getElementById('page-title').textContent = TITLES[name] || name;
  if (name === 'weight') renderWeight();
  if (name === 'history') renderHistory();
  if (name === 'settings') renderSettings();
}

function bindForms() {
  document.getElementById('weight-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('weight-input');
    const val = parseFloat(input.value);
    if (!val || val < 30 || val > 300) return;
    addWeight(state, val);
    input.value = '';
    renderWeight();
  });

  document.getElementById('add-exercise-btn').addEventListener('click', () => {
    editingExerciseId = null;
    openExerciseModal();
  });

  document.getElementById('exercise-cancel').addEventListener('click', () => {
    document.getElementById('exercise-modal').close();
  });

  document.getElementById('exercise-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('exercise-name').value.trim();
    const target = document.getElementById('exercise-target').value;
    const emoji = document.getElementById('exercise-emoji').value.trim() || '🏋️';
    const frequency = document.getElementById('exercise-frequency').value;
    const activeDays = [...document.querySelectorAll('#weekday-picker input:checked')].map((el) => Number(el.value));
    if (!name) return;

    if (editingExerciseId) {
      updateExercise(state, editingExerciseId, { name, target, emoji, frequency, activeDays });
    } else {
      addExercise(state, { name, target, emoji, frequency, activeDays });
    }

    document.getElementById('exercise-modal').close();
    renderAll();
    scheduleReminderCheck();
  });

  document.getElementById('exercise-frequency').addEventListener('change', updateCustomDaysVisibility);

  document.getElementById('reminder-enabled').addEventListener('change', (e) => {
    updateSettings(state, { reminderEnabled: e.target.checked });
    scheduleReminderCheck();
  });

  document.getElementById('reminder-time').addEventListener('change', (e) => {
    updateSettings(state, { reminderTime: e.target.value });
    scheduleReminderCheck();
  });

  document.getElementById('request-notifications-btn').addEventListener('click', requestNotifications);
  document.querySelectorAll('[data-template]').forEach((btn) => {
    btn.addEventListener('click', () => applyTemplate(btn.dataset.template));
  });
  document.getElementById('export-data-btn').addEventListener('click', exportData);
  document.getElementById('import-data-input').addEventListener('change', importData);
  document.getElementById('clear-data-btn').addEventListener('click', clearAllData);

  document.getElementById('calendar-prev').addEventListener('click', () => {
    if (calendarCursor.month === 0) {
      calendarCursor.month = 11;
      calendarCursor.year--;
    } else {
      calendarCursor.month--;
    }
    renderHistoryCalendar();
  });

  document.getElementById('calendar-next').addEventListener('click', () => {
    if (calendarCursor.month === 11) {
      calendarCursor.month = 0;
      calendarCursor.year++;
    } else {
      calendarCursor.month++;
    }
    renderHistoryCalendar();
  });
}

async function requestNotifications() {
  if (!('Notification' in window)) {
    alert('Уведомления не поддерживаются в этом браузере.');
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    new Notification('Workout 💪', {
      body: 'Напоминания включены! Не забудь потренироваться сегодня.',
      icon: './icons/icon.svg',
    });
    scheduleReminderCheck();
  }
}

function scheduleReminderCheck() {
  if (reminderTimer) clearTimeout(reminderTimer);
  if (!state.settings.reminderEnabled) return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  const target = getNextReminderDate();
  if (!target) return;

  const ms = target.getTime() - Date.now();
  reminderTimer = setTimeout(() => {
    const key = formatDateKey(target);
    if (isTrainingDay(state, key) && !isDayComplete(state, key)) {
      new Notification('Workout 💪', {
        body: 'Пора тренироваться! Сегодня запланированные упражнения ждут.',
        icon: './icons/icon.svg',
        tag: 'daily-reminder',
      });
    }
    scheduleReminderCheck();
  }, ms);
}

function renderAll() {
  renderHeader();
  renderToday();
  renderHistory();
  renderWeight();
  renderSettings();
}

function renderHeader() {
  const dateEl = document.getElementById('header-date');
  dateEl.textContent = new Date().toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const streak = calculateStreak(state);
  const badge = document.getElementById('streak-badge');
  if (streak > 0) {
    badge.hidden = false;
    document.getElementById('streak-count').textContent = streak;
  } else {
    badge.hidden = true;
  }
}

function renderToday() {
  const list = document.getElementById('exercise-list');
  const scheduled = getScheduledExercises(state);
  const progress = getDayProgress(state);
  const complete = isDayComplete(state);
  const trainingDay = scheduled.length > 0;

  document.getElementById('progress-percent').textContent = progress.percent + '%';
  document.getElementById('progress-text').textContent = trainingDay
    ? `${progress.done} из ${progress.total} повторений`
    : 'Сегодня по расписанию день отдыха';

  const ring = document.getElementById('progress-ring-fill');
  const offset = CIRCUMFERENCE - (progress.percent / 100) * CIRCUMFERENCE;
  ring.style.strokeDashoffset = offset;

  document.getElementById('complete-banner').hidden = !complete || !trainingDay;
  if (!trainingDay) {
    list.innerHTML = '<article class="exercise-card"><div class="exercise-name">День восстановления 🧘</div><div class="exercise-count">По текущему расписанию сегодня нет обязательных упражнений.</div></article>';
    return;
  }

  list.innerHTML = scheduled.map((ex) => {
    const count = getExerciseCount(state, ex.id);
    const pct = Math.min(100, Math.round((count / ex.target) * 100));
    const done = count >= ex.target;

    return `
      <article class="exercise-card ${done ? 'done' : ''}" data-id="${ex.id}">
        <div class="exercise-card-header">
          <div class="exercise-emoji">${ex.emoji}</div>
          <div class="exercise-info">
            <div class="exercise-name">${escapeHtml(ex.name)}</div>
            <div class="exercise-count">
              <strong>${count}</strong> / ${ex.target}
            </div>
          </div>
        </div>
        <div class="exercise-bar">
          <div class="exercise-bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="exercise-actions">
          <button class="btn-count" data-action="add" data-amount="1">+1</button>
          <button class="btn-count" data-action="add" data-amount="10">+10</button>
          <button class="btn-count" data-action="add" data-amount="25">+25</button>
          <button class="btn-count btn-reset" data-action="reset" title="Сбросить">↺</button>
        </div>
      </article>
    `;
  }).join('');

  list.querySelectorAll('.exercise-card').forEach((card) => {
    const id = card.dataset.id;
    card.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.action === 'add') {
          addReps(state, id, Number(btn.dataset.amount));
        } else {
          resetExercise(state, id);
        }
        renderAll();
        if (navigator.vibrate) navigator.vibrate(10);
      });
    });
  });
}

function renderHistory() {
  const stats = getTotalStats(state);

  document.getElementById('stats-row').innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${stats.streak}</div>
      <div class="stat-label">текущий стрик</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${stats.bestStreak}</div>
      <div class="stat-label">лучший стрик</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${stats.weekPercent}%</div>
      <div class="stat-label">выполнено за неделю</div>
    </div>
  `;

  renderHistoryCalendar();
  renderHistoryDayCard();
  renderActivityFeed();
  renderActivityChart();
  renderAchievements(stats);
}

function renderHistoryCalendar() {
  const title = new Date(calendarCursor.year, calendarCursor.month, 1).toLocaleDateString('ru-RU', {
    month: 'long',
    year: 'numeric',
  });
  document.getElementById('calendar-title').textContent = title;
  const days = getCalendarMonth(state, calendarCursor.year, calendarCursor.month);
  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = days
    .map((d) => {
      if (!d) return '<span class="calendar-empty"></span>';
      return `<button class="calendar-day status-${d.status} ${d.isToday ? 'is-today' : ''} ${selectedHistoryDate === d.date ? 'is-selected' : ''}" data-date="${d.date}">${d.day}</button>`;
    })
    .join('');
  grid.querySelectorAll('.calendar-day').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedHistoryDate = btn.dataset.date;
      renderHistoryCalendar();
      renderHistoryDayCard();
    });
  });
}

function renderHistoryDayCard() {
  const date = selectedHistoryDate;
  const progress = getDayProgress(state, date);
  const scheduled = getScheduledExercises(state, date);
  const note = getDayNote(state, date);
  const status = getDayStatus(state, date);
  const statusMap = { complete: 'Выполнено', partial: 'Частично', missed: 'Пропуск', rest: 'Отдых' };
  const statusIcon = { complete: '✅', partial: '⏳', missed: '❌', rest: '🛌' };
  const list = scheduled.length
    ? scheduled.map((ex) => `${ex.emoji} ${getExerciseCount(state, ex.id, date)}/${ex.target}`).join(' · ')
    : 'По расписанию упражнений нет';
  const readableDate = parseDateKey(date).toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  document.getElementById('history-day-card').innerHTML = `
    <div class="history-day-header">
      <div>
        <div class="history-date">${readableDate}</div>
        <div class="history-detail">${list}</div>
      </div>
      <span class="history-badge">${statusIcon[status]}</span>
    </div>
    <p class="history-status">Статус: ${statusMap[status]} · ${progress.done}/${progress.total}</p>
    <label class="field">
      <span>Заметка за день</span>
      <textarea id="day-note-input" rows="3" placeholder="Самочувствие, комментарии, что получилось...">${escapeHtml(note)}</textarea>
    </label>
    <button class="btn btn-secondary btn-block" id="save-day-note">Сохранить заметку</button>
  `;
  document.getElementById('save-day-note').addEventListener('click', () => {
    const val = document.getElementById('day-note-input').value;
    setDayNote(state, date, val);
    renderActivityFeed();
  });
}

function renderActivityFeed() {
  const history = getHistory(state, 20);
  const list = document.getElementById('history-list');
  if (!history.length) {
    list.innerHTML = '<p class="history-empty">Пока нет записей.<br>Начни первую тренировку!</p>';
    return;
  }

  list.innerHTML = history.map((item) => {
    const dateStr = new Date(item.date + 'T12:00:00').toLocaleDateString('ru-RU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    const detail = item.scheduled
      .map((ex) => `${ex.emoji} ${item.log[ex.id] ?? 0}/${ex.target}`)
      .join(' · ');
    const noteLine = item.note ? `<div class="history-note">${escapeHtml(item.note)}</div>` : '';
    const badges = { complete: '✅', partial: '⏳', missed: '❌', rest: '🛌' };

    return `
      <div class="history-item">
        <div>
          <div class="history-date">${dateStr}</div>
          <div class="history-detail">${detail}</div>
          ${noteLine}
        </div>
        <span class="history-badge">${badges[item.status]}</span>
      </div>
    `;
  }).join('');
}

function renderWeight() {
  const log = state.weightLog;
  const valueEl = document.getElementById('weight-value');
  const changeEl = document.getElementById('weight-change');

  if (!log.length) {
    valueEl.textContent = '—';
    changeEl.textContent = 'Добавь первую запись';
    changeEl.className = 'weight-change';
    drawWeightChart([]);
    document.getElementById('weight-history').innerHTML = '';
    return;
  }

  const latest = log[0];
  valueEl.textContent = latest.weight.toFixed(1) + ' кг';

  if (log.length > 1) {
    const diff = latest.weight - log[1].weight;
    const sign = diff > 0 ? '+' : '';
    changeEl.textContent = `${sign}${diff.toFixed(1)} кг с прошлой записи`;
    changeEl.className = 'weight-change ' + (diff > 0 ? 'positive' : diff < 0 ? 'negative' : '');
  } else {
    changeEl.textContent = '';
  }

  drawWeightChart([...log].reverse().slice(-14));

  document.getElementById('weight-history').innerHTML = log.slice(0, 10).map((entry) => {
    const dateStr = new Date(entry.date + 'T12:00:00').toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
    });
    return `
      <div class="weight-entry">
        <span class="weight-entry-date">${dateStr}</span>
        <span>${entry.weight.toFixed(1)} кг</span>
        <button class="btn-icon danger" data-weight-delete="${entry.id}" title="Удалить запись">✕</button>
      </div>
    `;
  }).join('');
  document.querySelectorAll('[data-weight-delete]').forEach((btn) => {
    btn.addEventListener('click', () => {
      deleteWeight(state, Number(btn.dataset.weightDelete));
      renderWeight();
    });
  });
}

function drawWeightChart(entries) {
  const canvas = document.getElementById('weight-chart');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  ctx.clearRect(0, 0, w, h);

  if (entries.length < 2) {
    ctx.fillStyle = '#8b9cb3';
    ctx.font = '14px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('График появится после 2 записей', w / 2, h / 2);
    return;
  }

  const weights = entries.map((e) => e.weight);
  const min = Math.min(...weights) - 1;
  const max = Math.max(...weights) + 1;
  const pad = { top: 16, right: 16, bottom: 24, left: 36 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  const x = (i) => pad.left + (i / (entries.length - 1)) * chartW;
  const y = (v) => pad.top + chartH - ((v - min) / (max - min)) * chartH;

  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const gy = pad.top + (chartH / 3) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, gy);
    ctx.lineTo(w - pad.right, gy);
    ctx.stroke();
  }

  ctx.beginPath();
  entries.forEach((e, i) => {
    if (i === 0) ctx.moveTo(x(i), y(e.weight));
    else ctx.lineTo(x(i), y(e.weight));
  });
  ctx.strokeStyle = '#3dd68c';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  ctx.lineTo(x(entries.length - 1), pad.top + chartH);
  ctx.lineTo(x(0), pad.top + chartH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, pad.top, 0, h);
  grad.addColorStop(0, 'rgba(61, 214, 140, 0.2)');
  grad.addColorStop(1, 'rgba(61, 214, 140, 0)');
  ctx.fillStyle = grad;
  ctx.fill();

  entries.forEach((e, i) => {
    ctx.beginPath();
    ctx.arc(x(i), y(e.weight), 4, 0, Math.PI * 2);
    ctx.fillStyle = '#3dd68c';
    ctx.fill();
  });

  ctx.fillStyle = '#8b9cb3';
  ctx.font = '11px -apple-system, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(max.toFixed(1), pad.left - 6, pad.top + 4);
  ctx.fillText(min.toFixed(1), pad.left - 6, pad.top + chartH);
}

function renderActivityChart() {
  const series = getActivitySeries(state, 14);
  const canvas = document.getElementById('activity-chart');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const w = rect.width;
  const h = rect.height;
  ctx.clearRect(0, 0, w, h);

  const maxReps = Math.max(10, ...series.map((s) => s.reps));
  const pad = { top: 14, right: 8, bottom: 22, left: 8 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;
  const barW = chartW / series.length - 4;

  series.forEach((item, i) => {
    const x = pad.left + i * (barW + 4);
    const y = pad.top + chartH - (item.reps / maxReps) * chartH;
    const height = Math.max(2, pad.top + chartH - y);
    const color =
      item.status === 'complete' ? '#3dd68c' :
      item.status === 'partial' ? '#ffcd64' :
      item.status === 'missed' ? '#ff6b6b' : '#506174';
    ctx.fillStyle = color;
    ctx.fillRect(x, y, barW, height);
    if (i % 3 === 0) {
      ctx.fillStyle = '#8b9cb3';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(item.label.split(' ')[0], x + barW / 2, h - 6);
    }
  });
}

function renderAchievements(stats) {
  const data = [
    { done: stats.completedDays >= 7, icon: '🏅', text: '7 завершенных тренировок' },
    { done: stats.bestStreak >= 5, icon: '🔥', text: 'Стрик 5+ дней' },
    { done: stats.totalReps >= 1000, icon: '💯', text: '1000+ повторений' },
    { done: state.weightLog.length >= 10, icon: '⚖️', text: '10 записей веса' },
  ];
  document.getElementById('achievements').innerHTML = data
    .map((a) => `<div class="achievement ${a.done ? 'unlocked' : ''}">${a.icon} ${a.text}</div>`)
    .join('');
}

function renderSettings() {
  const container = document.getElementById('settings-exercises');
  container.innerHTML = state.exercises.map((ex) => `
    <div class="settings-item" data-id="${ex.id}">
      <span class="settings-item-emoji">${ex.emoji}</span>
      <div class="settings-item-info">
        <div class="settings-item-name">${escapeHtml(ex.name)}</div>
        <div class="settings-item-target">Цель: ${ex.target} повторений</div>
        <div class="settings-item-target">Частота: ${getFrequencyLabel(ex)}</div>
      </div>
      <div class="settings-item-actions">
        <button class="btn-icon" data-edit="${ex.id}" title="Изменить">✏️</button>
        <button class="btn-icon danger" data-delete="${ex.id}" title="Удалить">🗑</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ex = state.exercises.find((e) => e.id === btn.dataset.edit);
      if (!ex) return;
      editingExerciseId = ex.id;
      openExerciseModal(ex);
    });
  });

  container.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (state.exercises.length <= 1) {
        alert('Нельзя удалить последнее упражнение.');
        return;
      }
      if (confirm('Удалить это упражнение?')) {
        deleteExercise(state, btn.dataset.delete);
        renderAll();
      }
    });
  });

  document.getElementById('reminder-enabled').checked = state.settings.reminderEnabled;
  document.getElementById('reminder-time').value = state.settings.reminderTime;
}

function applyTemplate(name) {
  const templates = {
    classic: [
      { id: 'pushups', name: 'Отжимания', target: 100, emoji: '💪', frequency: 'daily', activeDays: [0, 1, 2, 3, 4, 5, 6] },
      { id: 'squats', name: 'Приседания', target: 100, emoji: '🦵', frequency: 'daily', activeDays: [0, 1, 2, 3, 4, 5, 6] },
      { id: 'abs', name: 'Пресс', target: 100, emoji: '🔥', frequency: 'daily', activeDays: [0, 1, 2, 3, 4, 5, 6] },
    ],
    strength: [
      { id: 'pushups', name: 'Отжимания', target: 120, emoji: '💪', frequency: 'weekdays', activeDays: [1, 2, 3, 4, 5] },
      { id: 'squats', name: 'Приседания', target: 140, emoji: '🦵', frequency: 'weekdays', activeDays: [1, 2, 3, 4, 5] },
      { id: 'plank', name: 'Планка (сек)', target: 300, emoji: '🧱', frequency: '3week', activeDays: [1, 3, 5] },
    ],
    light: [
      { id: 'pushups', name: 'Отжимания', target: 40, emoji: '💪', frequency: '3week', activeDays: [1, 3, 5] },
      { id: 'squats', name: 'Приседания', target: 60, emoji: '🦵', frequency: '3week', activeDays: [1, 3, 5] },
      { id: 'walk', name: 'Ходьба (мин)', target: 30, emoji: '🚶', frequency: 'daily', activeDays: [0, 1, 2, 3, 4, 5, 6] },
    ],
  };
  if (!templates[name]) return;
  if (!confirm('Применить шаблон? Текущие упражнения будут заменены.')) return;
  state.exercises = templates[name].map((ex) => ({ ...ex }));
  saveState(state);
  renderAll();
  scheduleReminderCheck();
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `workout-backup-${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = migrateState(JSON.parse(String(reader.result)));
      state = parsed;
      saveState(state);
      renderAll();
      scheduleReminderCheck();
      alert('Данные успешно импортированы.');
    } catch {
      alert('Не удалось импортировать файл.');
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsText(file);
}

function clearAllData() {
  if (!confirm('Удалить все данные приложения?')) return;
  state = createDefaultState();
  saveState(state);
  renderAll();
  scheduleReminderCheck();
}

function openExerciseModal(exercise = null) {
  const modal = document.getElementById('exercise-modal');
  document.getElementById('exercise-modal-title').textContent =
    exercise ? 'Изменить упражнение' : 'Новое упражнение';
  document.getElementById('exercise-name').value = exercise?.name ?? '';
  document.getElementById('exercise-target').value = exercise?.target ?? 100;
  document.getElementById('exercise-emoji').value = exercise?.emoji ?? '🏋️';
  document.getElementById('exercise-frequency').value = exercise?.frequency ?? 'daily';
  const selectedDays = exercise?.activeDays ?? [1, 3, 5];
  document.querySelectorAll('#weekday-picker input').forEach((checkbox) => {
    checkbox.checked = selectedDays.includes(Number(checkbox.value));
  });
  updateCustomDaysVisibility();
  modal.showModal();
}

function updateCustomDaysVisibility() {
  const frequency = document.getElementById('exercise-frequency').value;
  document.getElementById('custom-days-field').hidden = frequency !== 'custom';
}

function getNextReminderDate() {
  const [h, m] = (state.settings.reminderTime || '08:00').split(':').map(Number);
  const now = new Date();
  for (let i = 0; i < 30; i++) {
    const candidate = new Date();
    candidate.setHours(h, m, 0, 0);
    candidate.setDate(candidate.getDate() + i);
    const key = formatDateKey(candidate);
    if (candidate > now && isTrainingDay(state, key) && !isDayComplete(state, key)) return candidate;
  }
  return null;
}

function renderWeekdayHeader() {
  document.getElementById('calendar-weekdays').innerHTML = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
    .map((d) => `<span>${d}</span>`)
    .join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatNumber(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'k';
  return String(n);
}

window.addEventListener('resize', () => {
  if (document.querySelector('[data-view="weight"]').classList.contains('view-active')) {
    renderWeight();
  }
});
