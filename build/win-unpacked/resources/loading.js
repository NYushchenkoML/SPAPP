import { contextBridge, ipcRenderer } from 'electron';

// Обновляем статус на странице
contextBridge.exposeInMainWorld('electronAPI', {
  onStatusUpdate: (callback) => {
    ipcRenderer.on('update-status', (event, status) => {
      callback(status);
    });
  }
});

// Используем в рендерере
window.electronAPI.onStatusUpdate((status) => {
  document.getElementById('status').innerText = status;
});
