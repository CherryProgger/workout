let state = loadState();
let editingExerciseId = null;
let reminderTimers = [];
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

const SLOGANS = {
  today: [
    'Один день за раз.',
    'Дисциплина — это свобода.',
    'Маленькие шаги. Большой результат.',
    'Сегодня — твой день.',
  ],
  history: [
    'Каждый повтор имеет значение.',
    'Прогресс любит постоянство.',
    'История пишется ежедневно.',
  ],
  weight: [
    'Тело помнит. Цифры говорят.',
    'Измеряй. Корректируй. Двигайся.',
    'Форма — это марафон, не спринт.',
  ],
  settings: [
    'Настрой ритм. Держи курс.',
    'Система сильнее настроения.',
    'Твои правила. Твой путь.',
  ],
};

const CHART = {
  ink: '#1c1c1c',
  muted: '#a8a29a',
  success: '#3d5c4a',
  warn: '#8b6914',
  danger: '#8b3a3a',
  rest: '#d4cec3',
  grid: 'rgba(28, 28, 28, 0.06)',
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
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkMissedReminders();
      scheduleReminderCheck();
    }
  });
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
  updateSlogan(name);
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
    renderReminderUI();
  });

  document.getElementById('add-reminder-time').addEventListener('click', () => {
    const times = getReminderTimes(state.settings);
    if (times.length >= 6) {
      alert('Максимум 6 напоминаний в день.');
      return;
    }
    times.push('18:00');
    updateSettings(state, { reminderTimes: times });
    renderReminderUI();
    scheduleReminderCheck();
  });

  document.querySelectorAll('[data-reminder-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const presets = {
        light: ['08:00'],
        standard: ['08:00', '14:00', '21:00'],
        intensive: ['07:00', '12:00', '17:00', '21:00'],
      };
      const preset = presets[btn.dataset.reminderPreset];
      if (!preset) return;
      updateSettings(state, { reminderTimes: preset });
      renderReminderUI();
      scheduleReminderCheck();
    });
  });

  document.getElementById('request-notifications-btn').addEventListener('click', requestNotifications);
  document.getElementById('test-reminder-btn').addEventListener('click', () => {
    if (Notification.permission !== 'granted') {
      alert('Сначала разреши уведомления.');
      return;
    }
    new Notification('FORM · Проверка', {
      body: getReminderProgressText(state),
      icon: './icons/icon.svg',
    });
  });
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
    updateSettings(state, { reminderEnabled: true });
    document.getElementById('reminder-enabled').checked = true;
    new Notification('FORM', {
      body: 'Напоминания включены. Мы сообщим, если тренировка не завершена.',
      icon: './icons/icon.svg',
    });
    scheduleReminderCheck();
    renderReminderUI();
  }
}

function clearReminderTimers() {
  reminderTimers.forEach(clearTimeout);
  reminderTimers = [];
}

function trySendReminder(dateKey, time) {
  if (!state.settings.reminderEnabled) return;
  if (Notification.permission !== 'granted') return;
  if (!isTrainingDay(state, dateKey)) return;
  if (isDayComplete(state, dateKey)) return;
  if (wasReminderSent(state, dateKey, time)) return;

  new Notification(`FORM · ${getReminderTitle(time)}`, {
    body: getReminderProgressText(state, dateKey),
    icon: './icons/icon.svg',
    tag: `reminder-${dateKey}-${time}`,
  });
  markReminderSent(state, dateKey, time);
  renderReminderStrip();
  renderReminderUI();
}

function checkMissedReminders() {
  if (!state.settings.reminderEnabled) return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const key = todayKey();
  if (!isTrainingDay(state, key) || isDayComplete(state, key)) return;

  const now = new Date();
  getReminderTimes(state.settings).forEach((time) => {
    const [h, m] = time.split(':').map(Number);
    const target = new Date();
    target.setHours(h, m, 0, 0);
    if (now >= target) trySendReminder(key, time);
  });
}

function scheduleReminderCheck() {
  clearReminderTimers();
  if (!state.settings.reminderEnabled) return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  checkMissedReminders();

  const now = Date.now();
  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + dayOffset);
    const key = formatDateKey(date);
    if (!isTrainingDay(state, key)) continue;

    getReminderTimes(state.settings).forEach((time) => {
      const [h, m] = time.split(':').map(Number);
      const target = new Date(date);
      target.setHours(h, m, 0, 0);
      if (target.getTime() <= now) return;
      if (dayOffset === 0 && isDayComplete(state, key)) return;

      const ms = target.getTime() - now;
      const timerId = setTimeout(() => {
        trySendReminder(key, time);
        scheduleReminderCheck();
      }, ms);
      reminderTimers.push(timerId);
    });
  }
}

function getReminderSlotState(time, dateKey = todayKey()) {
  if (!isTrainingDay(state, dateKey)) return 'rest';
  if (isDayComplete(state, dateKey)) return 'done';
  if (wasReminderSent(state, dateKey, time)) return 'sent';

  const [h, m] = time.split(':').map(Number);
  const target = new Date();
  target.setHours(h, m, 0, 0);
  const now = new Date();
  if (now >= target) return 'due';

  const times = getReminderTimes(state.settings);
  const nextTime = times.find((t) => {
    const [th, tm] = t.split(':').map(Number);
    const td = new Date();
    td.setHours(th, tm, 0, 0);
    return td > now && !wasReminderSent(state, dateKey, t);
  });
  return nextTime === time ? 'next' : 'wait';
}

function renderReminderStrip() {
  const strip = document.getElementById('reminder-strip');
  if (!state.settings.reminderEnabled || !isTrainingDay(state) || isDayComplete(state)) {
    strip.hidden = true;
    return;
  }

  const key = todayKey();
  const times = getReminderTimes(state.settings);
  const stateLabels = {
    done: 'Готово',
    sent: 'Отправлено',
    due: 'Пора',
    next: 'Следующее',
    wait: 'Ожидает',
    rest: 'Отдых',
  };

  strip.hidden = false;
  strip.innerHTML = `
    <div class="reminder-strip-title">Напоминания сегодня</div>
    <p class="reminder-strip-text">${escapeHtml(getReminderProgressText(state, key))}</p>
    <div class="reminder-timeline">
      ${times.map((time) => {
        const slot = getReminderSlotState(time, key);
        return `
          <div class="reminder-slot state-${slot}">
            <span class="reminder-slot-time">${time}</span>
            <span class="reminder-slot-state">${stateLabels[slot]}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderReminderUI() {
  const list = document.getElementById('reminder-times-list');
  const status = document.getElementById('reminder-status');
  const times = getReminderTimes(state.settings);

  list.innerHTML = times.map((time, index) => `
    <div class="reminder-time-row" data-index="${index}">
      <input type="time" value="${time}" data-reminder-time="${index}">
      <button class="btn-icon danger" type="button" data-remove-reminder="${index}" title="Удалить">×</button>
    </div>
  `).join('');

  list.querySelectorAll('[data-reminder-time]').forEach((input) => {
    input.addEventListener('change', () => {
      const idx = Number(input.dataset.reminderTime);
      const updated = getReminderTimes(state.settings);
      updated[idx] = input.value;
      updateSettings(state, { reminderTimes: [...new Set(updated)].sort() });
      scheduleReminderCheck();
      renderReminderUI();
      renderReminderStrip();
    });
  });

  list.querySelectorAll('[data-remove-reminder]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.removeReminder);
      const updated = getReminderTimes(state.settings);
      if (updated.length <= 1) {
        alert('Нужно хотя бы одно напоминание.');
        return;
      }
      updated.splice(idx, 1);
      updateSettings(state, { reminderTimes: updated });
      scheduleReminderCheck();
      renderReminderUI();
      renderReminderStrip();
    });
  });

  if (!state.settings.reminderEnabled) {
    status.innerHTML = '<p class="settings-hint">Напоминания выключены.</p>';
    return;
  }

  const key = todayKey();
  if (!isTrainingDay(state, key)) {
    status.innerHTML = '<p class="settings-hint">Сегодня день отдыха — напоминания не нужны.</p>';
    return;
  }
  if (isDayComplete(state, key)) {
    status.innerHTML = '<p class="settings-hint">Сегодня тренировка выполнена. Напоминания не придут.</p>';
    return;
  }

  const sent = times.filter((t) => wasReminderSent(state, key, t)).length;
  status.innerHTML = `
    <div class="reminder-status-item">
      <span class="reminder-status-label">Сегодня отправлено</span>
      <span class="reminder-status-value">${sent} из ${times.length}</span>
    </div>
    <div class="reminder-status-item">
      <span class="reminder-status-label">Прогресс</span>
      <span class="reminder-status-value">${getDayProgress(state, key).percent}%</span>
    </div>
  `;
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

  const activeTab = document.querySelector('.tab-active')?.dataset.tab || 'today';
  updateSlogan(activeTab);
}

function updateSlogan(view) {
  const list = SLOGANS[view] || SLOGANS.today;
  const dayIndex = new Date().getDate() % list.length;
  document.getElementById('header-slogan').textContent = list[dayIndex];
}

function exerciseMark(name) {
  return escapeHtml((name || '?').charAt(0).toUpperCase());
}

function statusPill(status) {
  const labels = { complete: 'Выполнено', partial: 'Частично', missed: 'Пропуск', rest: 'Отдых' };
  return `<span class="status-pill ${status}">${labels[status]}</span>`;
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
  renderReminderStrip();
  if (!trainingDay) {
    list.innerHTML = `
      <article class="exercise-card rest-card">
        <div class="exercise-name">День восстановления</div>
        <div class="exercise-count">Восстановление — часть прогресса.<br>Сегодня можно отдохнуть с чистой совестью.</div>
      </article>`;
    return;
  }

  list.innerHTML = scheduled.map((ex) => {
    const count = getExerciseCount(state, ex.id);
    const pct = Math.min(100, Math.round((count / ex.target) * 100));
    const done = count >= ex.target;

    return `
      <article class="exercise-card ${done ? 'done' : ''}" data-id="${ex.id}">
        <div class="exercise-card-header">
          <div class="exercise-mark">${exerciseMark(ex.name)}</div>
          <div class="exercise-info">
            <div class="exercise-name">${escapeHtml(ex.name)}</div>
            <div class="exercise-count">
              <strong>${count}</strong> из ${ex.target}
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
      <div class="stat-label">серия</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${stats.bestStreak}</div>
      <div class="stat-label">рекорд</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${stats.weekPercent}%</div>
      <div class="stat-label">за неделю</div>
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
  const list = scheduled.length
    ? scheduled.map((ex) => `${ex.name} ${getExerciseCount(state, ex.id, date)}/${ex.target}`).join(' · ')
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
      <span class="history-badge">${statusPill(status)}</span>
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
    list.innerHTML = '<p class="history-empty">История начинается с первого повторения.<br>Начни сегодня.</p>';
    return;
  }

  list.innerHTML = history.map((item) => {
    const dateStr = new Date(item.date + 'T12:00:00').toLocaleDateString('ru-RU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    const detail = item.scheduled
      .map((ex) => `${ex.name} ${item.log[ex.id] ?? 0}/${ex.target}`)
      .join(' · ');
    const noteLine = item.note ? `<div class="history-note">${escapeHtml(item.note)}</div>` : '';

    return `
      <div class="history-item">
        <div>
          <div class="history-date">${dateStr}</div>
          <div class="history-detail">${detail}</div>
          ${noteLine}
        </div>
        ${statusPill(item.status)}
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
    ctx.fillStyle = CHART.muted;
    ctx.font = 'italic 14px Georgia, serif';
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

  ctx.strokeStyle = CHART.grid;
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
  ctx.strokeStyle = CHART.ink;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  ctx.lineTo(x(entries.length - 1), pad.top + chartH);
  ctx.lineTo(x(0), pad.top + chartH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, pad.top, 0, h);
  grad.addColorStop(0, 'rgba(28, 28, 28, 0.08)');
  grad.addColorStop(1, 'rgba(28, 28, 28, 0)');
  ctx.fillStyle = grad;
  ctx.fill();

  entries.forEach((e, i) => {
    ctx.beginPath();
    ctx.arc(x(i), y(e.weight), 4, 0, Math.PI * 2);
    ctx.fillStyle = CHART.ink;
    ctx.fill();
  });

  ctx.fillStyle = CHART.muted;
  ctx.font = '11px "Source Sans 3", sans-serif';
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
      item.status === 'complete' ? CHART.success :
      item.status === 'partial' ? CHART.warn :
      item.status === 'missed' ? CHART.danger : CHART.rest;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, barW, height);
    if (i % 3 === 0) {
      ctx.fillStyle = CHART.muted;
      ctx.font = '10px "Source Sans 3", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(item.label.split(' ')[0], x + barW / 2, h - 6);
    }
  });
}

function renderAchievements(stats) {
  const data = [
    { done: stats.completedDays >= 7, text: 'Семь завершённых тренировок' },
    { done: stats.bestStreak >= 5, text: 'Серия из пяти дней' },
    { done: stats.totalReps >= 1000, text: 'Тысяча повторений' },
    { done: state.weightLog.length >= 10, text: 'Десять записей веса' },
  ];
  document.getElementById('achievements').innerHTML = data
    .map((a) => `<div class="achievement ${a.done ? 'unlocked' : ''}">${a.text}</div>`)
    .join('');
}

function renderSettings() {
  const container = document.getElementById('settings-exercises');
  container.innerHTML = state.exercises.map((ex) => `
    <div class="settings-item" data-id="${ex.id}">
      <span class="settings-item-mark">${exerciseMark(ex.name)}</span>
      <div class="settings-item-info">
        <div class="settings-item-name">${escapeHtml(ex.name)}</div>
        <div class="settings-item-target">Цель · ${ex.target} повторений</div>
        <div class="settings-item-target">Ритм · ${getFrequencyLabel(ex)}</div>
      </div>
      <div class="settings-item-actions">
        <button class="btn-icon" data-edit="${ex.id}" title="Изменить">✎</button>
        <button class="btn-icon danger" data-delete="${ex.id}" title="Удалить">×</button>
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
  renderReminderUI();
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
