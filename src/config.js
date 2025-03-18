const Store = require('electron-store');
const { app } = require('electron');

const store = new Store({
  cwd: app.getPath('userData'),
  name: 'config' // Укажите имя файла конфигурации
});

// Функция для сохранения настроек
function saveConfig(config) {
  store.set(config);
}

// Функция для загрузки настроек
function loadConfig() {
  return store.store;
}

module.exports = { saveConfig, loadConfig };
