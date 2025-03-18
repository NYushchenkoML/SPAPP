import sqlite3 from 'sqlite3';
import path from 'path';
import { app } from 'electron';

const dbPath = path.join(app.getPath('userData'), 'db.sqlite3');

function createDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);

    db.serialize(function() {
      db.run(`
        CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pin TEXT NOT NULL
        );
      `);

      // Установка пин-кода по умолчанию
      db.run('INSERT OR IGNORE INTO settings (pin) VALUES (?)', ['1234'], function(err) {
        if (err) {
          console.error(err);
        }
      });

      resolve(db);
    });

    db.on('error', (err) => {
      reject(err);
    });
  });
}

export default createDatabase;
