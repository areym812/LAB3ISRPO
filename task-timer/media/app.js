const vscode = acquireVsCodeApi();

const defaultSettings = {
    workMinutes: 25,
    breakMinutes: 5,
    dailyGoalMinutes: 120,
    notifications: true,
    sound: false,
    theme: 'system'
};

let settings = { ...defaultSettings };
let sessions = [];
let mode = 'work';
let remainingSeconds = settings.workMinutes * 60;
let totalSeconds = remainingSeconds;
let running = false;
let intervalId = null;

const byId = (id) => document.getElementById(id);

function todayKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
}

function formatMinutes(minutes) {
    if (minutes < 60) return `${minutes} мин`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `${hours} ч` : `${hours} ч ${rest} мин`;
}

function saveData() {
    vscode.postMessage({
        type: 'saveData',
        data: { settings, sessions }
    });
}

function setStatus(text) {
    byId('status').textContent = text;
}

function updateClock() {
    byId('clock').textContent = formatTime(remainingSeconds);
    const elapsed = totalSeconds > 0 ? totalSeconds - remainingSeconds : 0;
    const percent = totalSeconds > 0 ? (elapsed / totalSeconds) * 100 : 0;
    byId('progress').style.width = `${Math.min(100, percent)}%`;
}

function stopInterval() {
    if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
    }
}

function startTimer() {
    if (running) return;
    running = true;
    setStatus('Работает');
    intervalId = setInterval(() => {
        if (remainingSeconds > 0) {
            remainingSeconds -= 1;
            updateClock();
        } else {
            finishSession();
        }
    }, 1000);
}

function pauseTimer() {
    running = false;
    stopInterval();
    setStatus('Пауза');
}

function resetTimer() {
    pauseTimer();
    totalSeconds = getModeMinutes() * 60;
    remainingSeconds = totalSeconds;
    setStatus('Готов');
    updateClock();
}

function getModeMinutes() {
    return mode === 'work' ? Number(settings.workMinutes) : Number(settings.breakMinutes);
}

function chooseMode(nextMode) {
    pauseTimer();
    mode = nextMode;
    totalSeconds = getModeMinutes() * 60;
    remainingSeconds = totalSeconds;
    byId('modeLabel').textContent = mode === 'work' ? 'Рабочая сессия' : 'Перерыв';
    byId('taskLabel').textContent = mode === 'work' ? 'Фокус на задаче' : 'Время отдохнуть';
    byId('workBtn').classList.toggle('selected', mode === 'work');
    byId('breakBtn').classList.toggle('selected', mode === 'break');
    setStatus('Готов');
    updateClock();
}

function finishSession() {
    pauseTimer();

    if (mode === 'work') {
        const minutes = getModeMinutes();
        sessions.push({
            date: todayKey(),
            minutes,
            finishedAt: new Date().toISOString(),
            mode: 'work'
        });
        saveData();
    }

    if (settings.notifications) {
        vscode.postMessage({
            type: 'notify',
            text: mode === 'work' ? 'Рабочая сессия завершена!' : 'Перерыв завершён!'
        });
    }

    if (settings.sound) {
        try {
            const audioContext = new AudioContext();
            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();
            oscillator.connect(gain);
            gain.connect(audioContext.destination);
            oscillator.frequency.value = 660;
            gain.gain.value = 0.08;
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.25);
        } catch (error) {
            // Звук может быть недоступен в некоторых окружениях.
        }
    }

    updateStats();
    chooseMode(mode === 'work' ? 'break' : 'work');
}

function getMinutesForDay(day) {
    return sessions
        .filter((session) => session.date === day && session.mode === 'work')
        .reduce((sum, session) => sum + Number(session.minutes || 0), 0);
}

function updateStats() {
    const today = todayKey();
    const todayMinutes = getMinutesForDay(today);
    const weekMinutes = [];
    const dayLabels = [];

    for (let offset = 6; offset >= 0; offset--) {
        const date = new Date();
        date.setDate(date.getDate() - offset);
        const key = todayKey(date);
        weekMinutes.push(getMinutesForDay(key));
        dayLabels.push(date.toLocaleDateString('ru-RU', { weekday: 'short' }));
    }

    const weekTotal = weekMinutes.reduce((sum, value) => sum + value, 0);
    const todayCount = sessions.filter((session) => session.date === today && session.mode === 'work').length;

    byId('todayTime').textContent = formatMinutes(todayMinutes);
    byId('todaySessions').textContent = String(todayCount);
    byId('statsToday').textContent = formatMinutes(todayMinutes);
    byId('statsWeek').textContent = formatMinutes(weekTotal);
    byId('statsCount').textContent = String(sessions.filter((session) => session.mode === 'work').length);
    byId('goalText').textContent = `${formatMinutes(todayMinutes)} / ${formatMinutes(Number(settings.dailyGoalMinutes))}`;

    renderChart(weekMinutes, dayLabels);
    renderHistory();
}

function renderChart(values, labels) {
    const chart = byId('chart');
    chart.replaceChildren();
    const maxValue = Math.max(...values, Number(settings.dailyGoalMinutes), 1);

    values.forEach((value, index) => {
        const column = document.createElement('div');
        column.className = 'bar-column';

        const valueLabel = document.createElement('span');
        valueLabel.className = 'bar-value';
        valueLabel.textContent = String(value);

        const track = document.createElement('div');
        track.className = 'bar-track';

        const bar = document.createElement('div');
        bar.className = 'bar';
        bar.style.height = `${Math.max(value > 0 ? 4 : 0, (value / maxValue) * 100)}%`;
        bar.title = `${labels[index]}: ${value} мин`;

        const label = document.createElement('span');
        label.className = 'bar-label';
        label.textContent = labels[index];

        track.appendChild(bar);
        column.append(valueLabel, track, label);
        chart.appendChild(column);
    });
}

function renderHistory() {
    const history = byId('history');
    history.replaceChildren();
    const workSessions = sessions
        .filter((session) => session.mode === 'work')
        .slice()
        .reverse()
        .slice(0, 10);

    if (workSessions.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'muted';
        empty.textContent = 'Пока нет завершённых рабочих сессий.';
        history.appendChild(empty);
        return;
    }

    workSessions.forEach((session) => {
        const row = document.createElement('div');
        row.className = 'history-row';

        const date = document.createElement('span');
        date.textContent = session.finishedAt
            ? new Date(session.finishedAt).toLocaleString('ru-RU')
            : session.date;

        const duration = document.createElement('strong');
        duration.textContent = formatMinutes(Number(session.minutes || 0));

        row.append(date, duration);
        history.appendChild(row);
    });
}

function fillSettingsForm() {
    byId('workMinutes').value = settings.workMinutes;
    byId('breakMinutes').value = settings.breakMinutes;
    byId('dailyGoalMinutes').value = settings.dailyGoalMinutes;
    byId('notifications').checked = settings.notifications;
    byId('sound').checked = settings.sound;
    byId('theme').value = settings.theme;
}

function applyTheme() {
    document.body.dataset.theme = settings.theme;
}

function loadData(data) {
    if (data && data.settings) settings = { ...defaultSettings, ...data.settings };
    if (data && Array.isArray(data.sessions)) sessions = data.sessions;
    totalSeconds = Number(settings.workMinutes) * 60;
    remainingSeconds = totalSeconds;
    fillSettingsForm();
    applyTheme();
    updateClock();
    updateStats();
}

document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
        document.querySelectorAll('.page').forEach((page) => page.classList.remove('active'));
        tab.classList.add('active');
        byId(tab.dataset.page).classList.add('active');
    });
});

byId('startBtn').addEventListener('click', startTimer);
byId('pauseBtn').addEventListener('click', pauseTimer);
byId('resetBtn').addEventListener('click', resetTimer);
byId('workBtn').addEventListener('click', () => chooseMode('work'));
byId('breakBtn').addEventListener('click', () => chooseMode('break'));

byId('settingsForm').addEventListener('submit', (event) => {
    event.preventDefault();

    const newSettings = {
        workMinutes: Number(byId('workMinutes').value),
        breakMinutes: Number(byId('breakMinutes').value),
        dailyGoalMinutes: Number(byId('dailyGoalMinutes').value),
        notifications: byId('notifications').checked,
        sound: byId('sound').checked,
        theme: byId('theme').value
    };

    if (
        newSettings.workMinutes < 1 || newSettings.workMinutes > 180 ||
        newSettings.breakMinutes < 1 || newSettings.breakMinutes > 60 ||
        newSettings.dailyGoalMinutes < 1 || newSettings.dailyGoalMinutes > 1440
    ) {
        byId('settingsMessage').textContent = 'Проверь значения в полях.';
        return;
    }

    settings = newSettings;
    resetTimer();
    applyTheme();
    saveData();
    updateStats();
    byId('settingsMessage').textContent = 'Настройки сохранены.';
});

byId('defaultsBtn').addEventListener('click', () => {
    settings = { ...defaultSettings };
    fillSettingsForm();
    resetTimer();
    applyTheme();
    saveData();
    updateStats();
    byId('settingsMessage').textContent = 'Настройки по умолчанию восстановлены.';
});

byId('clearHistoryBtn').addEventListener('click', () => {
    sessions = [];
    saveData();
    updateStats();
});

window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'loadData') loadData(message.data);
});

vscode.postMessage({ type: 'ready' });
