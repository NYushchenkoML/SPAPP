import axios from 'axios';
import { app, BrowserWindow, ipcMain, netLog } from 'electron';
import childProcess from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import log from 'electron-log';
import createDatabase from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let win;
let serverProcess;
let loadingWin;
let serverReady = false;
let db;

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
        printerIp: '192.168.88.110',
        printerPort: 9100
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
        printerIp: '192.168.88.110',
        printerPort: 9100
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
        NODE_ENV: app.isPackaged ? 'production' : 'development'
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
