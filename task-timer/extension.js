const vscode = require('vscode');

function activate(context) {
    const command = vscode.commands.registerCommand('taskTimer.open', () => {
        const panel = vscode.window.createWebviewPanel(
            'taskTimer',
            'Task Timer',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'media')
                ]
            }
        );

        panel.webview.html = getHtml(panel.webview, context.extensionUri);

        panel.webview.onDidReceiveMessage(async (message) => {
            if (message.type === 'ready') {
                const savedData = context.globalState.get('taskTimerData', {
                    settings: {
                        workMinutes: 25,
                        breakMinutes: 5,
                        dailyGoalMinutes: 120,
                        notifications: true,
                        sound: false,
                        theme: 'system'
                    },
                    sessions: []
                });

                panel.webview.postMessage({
                    type: 'loadData',
                    data: savedData
                });
            }

            if (message.type === 'saveData') {
                await context.globalState.update('taskTimerData', message.data);
            }

            if (message.type === 'notify') {
                vscode.window.showInformationMessage(message.text);
            }
        });
    });

    context.subscriptions.push(command);
}

function getHtml(webview, extensionUri) {
    const scriptUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, 'media', 'app.js')
    );
    const styleUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, 'media', 'style.css')
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta
        http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
    <link href="${styleUri}" rel="stylesheet">
    <title>Task Timer</title>
</head>
<body>
    <main class="app">
        <header class="top">
            <div>
                <p class="eyebrow">WORKSPACE TOOL</p>
                <h1>Task Timer</h1>
                <p class="muted">Время под контролем</p>
            </div>
            <span id="status" class="status">Готов</span>
        </header>

        <nav class="tabs">
            <button class="tab active" data-page="timer">Таймер</button>
            <button class="tab" data-page="stats">Статистика</button>
            <button class="tab" data-page="settings">Настройки</button>
        </nav>

        <section id="timer" class="page active">
            <div class="timer-card">
                <p id="modeLabel" class="muted">Рабочая сессия</p>
                <div id="clock" class="clock">25:00</div>
                <p id="taskLabel" class="muted">Фокус на задаче</p>
                <div class="progress-track">
                    <div id="progress" class="progress"></div>
                </div>
                <div class="timer-buttons">
                    <button id="startBtn" class="primary">Старт</button>
                    <button id="pauseBtn">Пауза</button>
                    <button id="resetBtn">Сброс</button>
                </div>
                <div class="timer-buttons secondary-buttons">
                    <button id="workBtn" class="selected">Работа</button>
                    <button id="breakBtn">Перерыв</button>
                </div>
            </div>
            <div class="small-grid">
                <div class="stat-card">
                    <span class="muted">Сегодня работал</span>
                    <strong id="todayTime">0 мин</strong>
                </div>
                <div class="stat-card">
                    <span class="muted">Завершено сессий</span>
                    <strong id="todaySessions">0</strong>
                </div>
            </div>
        </section>

        <section id="stats" class="page">
            <div class="section-heading">
                <h2>Статистика</h2>
                <p class="muted">Данные по завершённым рабочим сессиям</p>
            </div>
            <div class="small-grid">
                <div class="stat-card">
                    <span class="muted">Сегодня</span>
                    <strong id="statsToday">0 мин</strong>
                </div>
                <div class="stat-card">
                    <span class="muted">За 7 дней</span>
                    <strong id="statsWeek">0 мин</strong>
                </div>
                <div class="stat-card">
                    <span class="muted">Всего сессий</span>
                    <strong id="statsCount">0</strong>
                </div>
                <div class="stat-card">
                    <span class="muted">Цель на день</span>
                    <strong id="goalText">120 мин</strong>
                </div>
            </div>
            <div class="chart-card">
                <h3>Минуты работы за последние 7 дней</h3>
                <div id="chart" class="chart" aria-label="График времени работы"></div>
            </div>
            <div class="chart-card">
                <h3>Последние сессии</h3>
                <div id="history" class="history"></div>
                <button id="clearHistoryBtn" class="danger">Очистить историю</button>
            </div>
        </section>

        <section id="settings" class="page">
            <div class="section-heading">
                <h2>Настройки</h2>
                <p class="muted">Измени параметры под свой режим работы</p>
            </div>
            <form id="settingsForm" class="settings-card">
                <label>
                    Рабочая сессия (минуты)
                    <input id="workMinutes" type="number" min="1" max="180" required>
                </label>
                <label>
                    Перерыв (минуты)
                    <input id="breakMinutes" type="number" min="1" max="60" required>
                </label>
                <label>
                    Дневная цель (минуты)
                    <input id="dailyGoalMinutes" type="number" min="1" max="1440" required>
                </label>
                <label class="check-row">
                    <input id="notifications" type="checkbox">
                    Показывать уведомления
                </label>
                <label class="check-row">
                    <input id="sound" type="checkbox">
                    Звуковой сигнал в конце сессии
                </label>
                <label>
                    Тема панели
                    <select id="theme">
                        <option value="system">Как в VS Code</option>
                        <option value="dark">Тёмная</option>
                        <option value="light">Светлая</option>
                    </select>
                </label>
                <div class="timer-buttons">
                    <button type="submit" class="primary">Сохранить настройки</button>
                    <button id="defaultsBtn" type="button">По умолчанию</button>
                </div>
                <p id="settingsMessage" class="muted" role="status"></p>
            </form>
        </section>

        <footer class="footer muted">Task Timer · данные хранятся в настройках расширения VS Code</footer>
    </main>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
