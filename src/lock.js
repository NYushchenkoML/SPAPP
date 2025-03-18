import axios from 'axios';
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';

let win = null; // Важно инициализировать как null

// Добавляем блокировку для одного экземпляра приложения
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

const createWindow = () => {
  if (win !== null) return; // Защита от повторного создания окна

  win = new BrowserWindow({
    width: 0,
    height: 0,
    icon: path.join(__dirname, 'icon.png'),
    resizable: false,
    fullscreen: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.setTitle('SPAPP');
  win.loadFile('src/load.html');

  // Открытие инструментов разработчика (лучше убрать в продакшене)
  win.webContents.openDevTools();

  // Обработчики событий IPC
  ipcMain.on('load-main-menu', () => {
    win.loadFile('src/mainMenu.html');
  });

  ipcMain.on('lock-app', () => {
    win.loadFile('src/lock.html');
  });

  ipcMain.on('calibrate-printer', async () => {
    try {
      const response = await axios.post('http://localhost:3000/print', {
        command: '~JC',
        printerIp: '192.168.88.110',
        printerPort: 9100
      });
      console.log(response.data);
    } catch (error) {
      console.error('Ошибка при отправке запроса:', error);
    }
  });

  // Обработчик закрытия окна
  win.on('closed', () => {
    win = null; // Важно для сборки мусора
  });
}

app.disableHardwareAcceleration();

app.whenReady().then(() => {
  // Сервер запускается в main.js
  createWindow();
});

// Обработчик для macOS
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
