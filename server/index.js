const http = require('http');
const SocketIO = require('socket.io');

const app = http.createServer((req, res) => {
  res.end();
});

app.listen('9000', () => {
  console.log('listening on 9000 ....')
});

const io = SocketIO(app);

const ROOM_NAME = 'rally';

io.on('connection', (socket) => {
  console.log('on connection');

  socket.on('disconnect', () => {
    console.log('on disconnect');
  });

  socket.on('chat', (payload) => {
    console.log('on chat: ' + payload);
    socket.broadcast.emit('chat', payload);
  });

  socket.on('join', () => {
    const clientsInRoom = io.sockets.adapter.rooms[ROOM_NAME];
    const numClients = clientsInRoom ? Object.keys(clientsInRoom.sockets).length : 0;
    if (numClients === 0) {
      socket.join(ROOM_NAME);
      socket.emit('host');
    } else if (numClients === 1) {
      socket.join(ROOM_NAME);
      socket.emit('guest');
      io.sockets.to(ROOM_NAME).emit('ready');
    } else {
      socket.emit('full');
    }
  });

  socket.on('bye', () => {
    io.sockets.to(ROOM_NAME).emit('bye');
  });

  socket.on('message', (payload) => {
    console.log('on message: ' + JSON.stringify(payload));
    socket.broadcast.emit('message', payload);
  });
});
