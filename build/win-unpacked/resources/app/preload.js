const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  verifyPin: (pin) => ipcRenderer.send('verify-pin', pin),
  onPinVerification: (callback) => ipcRenderer.on('pin-verification', callback),
  loadMainMenu: () => ipcRenderer.send('load-main-menu'),
  lockApp: () => ipcRenderer.send('lock-app'),
  quitApp: () => ipcRenderer.send('quit-app'),
  calibratePrinter: () => ipcRenderer.send('calibrate-printer'),
  printDocument: () => ipcRenderer.send('print-document')
});
