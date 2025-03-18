import axios from 'axios';
import { app, BrowserWindow, ipcMain, netLog, dialog } from 'electron';
import childProcess from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import log from 'electron-log';
import createDatabase from './db.js';
import pkg from 'electron-updater';

const { saveConfig, loadConfig } = import ('./config');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { autoUpdater } = pkg;

let win;
let serverProcess;
let loadingWin;
let serverReady = false;
let db;

// Функция для копирования файла конфигурации по умолчанию
function copyDefaultConfig() {
  const defaultConfigPath = path.join(__dirname, 'defaultConfig.json');
  const configPath = path.join(app.getPath('userData'), 'config.json');

  if (!fs.existsSync(configPath)) {
    try {
      fs.copyFileSync(defaultConfigPath, configPath);
      console.log('Файл конфигурации по умолчанию скопирован');
    } catch (error) {
      console.error('Ошибка при копировании файла конфигурации:', error);
    }
  }
}

// Загрузка настроек
let loadedConfig;
try {
  copyDefaultConfig(); // Копируем файл конфигурации по умолчанию при первом запуске
  loadedConfig = loadConfig() || { printerIp: '192.168.88.110', printerPort: 9100 };
  console.log('Конфигурация загружена:', loadedConfig);
} catch (error) {
  console.error('Ошибка при загрузке конфигурации:', error);
  loadedConfig = { printerIp: '192.168.88.110', printerPort: 9100 };
}

// Настройка логирования
const logPath = path.join(app.isPackaged ? process.resourcesPath : __dirname, 'logs', 'app.log');
const netLogPath = path.join(app.isPackaged ? process.resourcesPath : __dirname, 'logs', 'net-log.json');

log.transports.file.level = 'debug';
log.transports.file.file = logPath;

// Функция для отображения ошибок
function showErrorWindow(message) {
  const errorWin = new BrowserWindow({
    width: 400,
    height: 200,
    modal: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  errorWin.loadURL(`data:text/html;charset=utf-8,<h2>${message}</h2>`);
}

// Создание окна загрузки
const createLoadingWindow = () => {
  loadingWin = new BrowserWindow({
    width: 0,
    height: 0,
    icon: path.join(app.isPackaged ? process.resourcesPath : __dirname, 'icon.ico'),
    resizable: false,
    fullscreen: true,
    webPreferences: {
      preload: path.join(app.isPackaged ? process.resourcesPath : __dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  loadingWin.setMenuBarVisibility(false);
  loadingWin.setTitle('SPAPP');
  loadingWin.loadFile('src/loading.html');
};

// Создание основного окна
const createWindow = () => {
  win = new BrowserWindow({
    width: 0,
    height: 0,
    icon: path.join(app.isPackaged ? process.resourcesPath : __dirname, 'icon.ico'),
    resizable: false,
    fullscreen: true,
    webPreferences: {
      preload: path.join(app.isPackaged ? process.resourcesPath : __dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.setTitle('SPAPP');
  win.loadFile('src/lock.html');
  win.webContents.openDevTools();

  ipcMain.on('load-main-menu', () => {
    if (win) {
      win.loadFile('src/mainMenu.html');
    } else {
      console.error('Окно не создано');
    }
  });

  ipcMain.on('lock-app', () => {
    if (win) {
      win.loadFile('src/lock.html');
    } else {
      console.error('Окно не создано');
    }
  });
  
  ipcMain.on('quit-app', () => {
    if (serverProcess) {
      serverProcess.kill();
    }
    app.quit();
  });

  ipcMain.on('calibrate-printer', async () => {
    if (!serverProcess.connected) {
      showErrorWindow('Сервер недоступен');
      return;
    }
    
    try {
      const response = await axios.post('http://localhost:3000/print', {
        command: '~JC',
        printerIp: loadedConfig.printerIp,
        printerPort: loadedConfig.printerPort
      });
      log.info('Запрос на калибровку принтера выполнен успешно');
      console.log(response.data);
    } catch (error) {
      log.error('Ошибка при отправке запроса на калибровку принтера:', error);
      console.error('Ошибка при отправке запроса:', error);
    }
  });

  ipcMain.on('print-document', async () => {
    if (!serverProcess.connected) {
      showErrorWindow('Сервер недоступен');
      return;
    }
    
    try {
      const data = await fs.promises.readFile(path.join(app.isPackaged ? process.resourcesPath : __dirname, 'label.zpl'), 'utf8');
      const response = await axios.post('http://localhost:3000/print', {
        command: data,
        printerIp: loadedConfig.printerIp,
        printerPort: loadedConfig.printerPort
      });
      log.info('Запрос на печать документа выполнен успешно');
      console.log(response.data);
    } catch (error) {
      log.error('Ошибка при отправке запроса на печать документа:', error);
      console.error('Ошибка при отправке запроса:', error);
    }
  });

  ipcMain.on('verify-pin', (event, pin) => {
    db.get('SELECT * FROM settings WHERE pin = ?', [pin], (err, row) => {
      if (err) {
        console.error(err);
        event.sender.send('pin-verification', { success: false });
        return;
      }
      
      if (row) {
        event.sender.send('pin-verification', { success: true });
        win.loadFile('src/mainMenu.html');
      } else {
        event.sender.send('pin-verification', { success: false });
      }
    });
  });

   ipcMain.on('save-config', (event, config) => {
    saveConfig(config);
    loadedConfig = config; // Обновляем текущую конфигурацию
    console.log('Конфигурация сохранена:', config);
  });
}

// Функция для проверки статуса сервера
let serverCheckAttempts = 0;

async function checkServerStatus() {
  try {
    await axios.get('http://localhost:3000/health-check', { timeout: 1000 });
    ipcMain.emit('update-status', 'Сервер запущен');
    serverReady = true;
    checkInitializationStatus();
  } catch (err) {
    serverCheckAttempts++;
    if (serverCheckAttempts < 5) {
      ipcMain.emit('update-status', 'Проверка сервера...');
      setTimeout(checkServerStatus, 1000);
    } else {
      ipcMain.emit('update-status', 'Сервер не отвечает');
      showErrorWindow('Сервер не отвечает');
    }
  }
}

function checkInitializationStatus() {
  if (serverReady) {
    setTimeout(() => {
      if (loadingWin) {
        loadingWin.close();
      }
      createWindow();
    }, 3000); // Закрываем окно загрузки через 3 секунды
  } else {
    setTimeout(checkInitializationStatus, 500); // Проверяем статус каждые 0.5 секунды
  }
}

function setupAutoUpdater() {
  // Установите feedURL для GitHub Releases
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: process.env.GITHUB_USERNAME,
    repo: process.env.GITHUB_REPO,
    private: false,
  });

  // Отправляем сообщение в loading.html о начале проверки обновлений
  if (win && win.webContents) {
    win.webContents.send('update-status', 'Проверка обновлений...');
  }

  autoUpdater.on('update-available', (info) => {
    log.info('Update available', info);
    if (win && win.webContents) {
      win.webContents.send('update-status', 'Доступно обновление');
    }
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Available',
      message: `A new version of SPAPP is available. Downloading now...`
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded', info);
    if (win && win.webContents) {
      win.webContents.send('update-status', 'Обновление загружено');
    }
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Downloaded',
      message: 'Restart the app to apply the update.'
    }).then(() => {
      autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', (err) => {
    log.error('Auto-updater error:', err);
    if (win && win.webContents) {
      win.webContents.send('update-status', 'Ошибка обновления');
    }
  });

  // Проверка обновлений при запуске
  autoUpdater.checkForUpdates();
}

app.whenReady().then(async () => {
  try {
    // Создание директории для логов, если она не существует
    const logsDir = path.join(app.isPackaged ? process.resourcesPath : __dirname, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir);
    }

    // Создание базы данных
    db = await createDatabase();
    console.log('База данных создана');

    // Определение пути к серверу
    const serverPath = path.join(app.isPackaged ? process.resourcesPath : __dirname, 'server.js');

    if (!fs.existsSync(serverPath)) {
      log.error('Файл сервера не найден:', serverPath);
      console.error('Файл сервера не найден:', serverPath);
      showErrorWindow('Файл сервера не найден');
      return;
    }

    // Запуск сервера
    serverProcess = childProcess.fork(serverPath, {
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      env: {
        ...process.env,
        NODE_ENV: app.isPackaged ? 'production' : 'development',
        GITHUB_USERNAME: process.env.GITHUB_USERNAME, // Добавляем переменную
        GITHUB_REPO: process.env.GITHUB_REPO       // Добавляем переменную
      }
    });
    log.info('Сервер запущен');
    console.log('Сервер запущен');

    // Обработка ошибок сервера
    serverProcess.on('error', (err) => {
      log.error('Ошибка сервера:', err);
      console.error('Ошибка сервера:', err);
      showErrorWindow('Сервер не запущен');
    });

    serverProcess.on('exit', (code) => {
      log.info(`Сервер завершил работу с кодом ${code}`);
      console.log(`Сервер завершил работу с кодом ${code}`);
      if (code !== 0) {
        log.error(`Сервер аварийно завершил работу с кодом ${code}`);
        console.error(`Сервер аварийно завершил работу с кодом ${code}`);
        showErrorWindow('Сервер аварийно завершил работу');
      }
    });

    serverProcess.on('message', (message) => {
      if (message === 'ready') {
        createLoadingWindow();
        ipcMain.emit('update-status', 'Запуск сервера...');
        setTimeout(checkServerStatus, 1000); // Запускаем проверку статуса
      }
    });

    // Логирование сетевых событий
    await netLog.startLogging(netLogPath);
    log.info('Логирование сетевых событий запущено');

    // Настройка autoUpdater
    setupAutoUpdater();

  } catch (error) {
    log.error('Ошибка при запуске приложения:', error);
    console.error('Ошибка при запуске приложения:', error);
  }
});

app.on('window-all-closed', async () => {
  // Остановка логирования сетевых событий
  const path = await netLog.stopLogging();
  log.info('Логирование сетевых событий остановлено');
  console.log('Net-logs written to', path);

  // Остановка сервера при закрытии приложения
  if (serverProcess) {
    serverProcess.kill();
  }
  app.quit();
});
