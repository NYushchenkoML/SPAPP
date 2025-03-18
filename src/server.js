import express from 'express';
import net from 'net';

const app = express();
app.use(express.json());

// Маршрут для проверки статуса сервера
app.get('/health-check', (req, res) => {
  res.send('Server is running');
});

app.post('/print', (req, res) => {
  const { command, printerIp, printerPort } = req.body;
  
  const sock = net.createConnection(printerPort, printerIp);
  
  sock.on('error', (err) => {
    console.error('Ошибка при подключении к принтеру:', err);
    res.status(500).send('Ошибка при отправке команды на принтер');
  });
  
  sock.write(command);
  sock.end();
  
  res.send('Команда отправлена на принтер');
});

app.listen(3000, () => {
  console.log('Сервер запущен на порту 3000');
  process.send('ready'); // Отправляем сигнал о готовности
});
