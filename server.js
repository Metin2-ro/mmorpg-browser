const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Permite serverului să citească toate fișierele din folderul principal (inclusiv Knight.glb)
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

let players = {};
let monsters = {
    m1: { id: 'm1', x: 400, y: 300 },
    m2: { id: 'm2', x: 500, y: 400 }
};

io.on('connection', (socket) => {
    console.log('Jucător conectat:', socket.id);

    players[socket.id] = {
        x: 0,
        y: 0,
        playerId: socket.id
    };

    socket.emit('currentPlayers', players);
    socket.emit('currentMonsters', monsters);
    socket.broadcast.emit('newPlayer', { id: socket.id, player: players[socket.id] });

    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            socket.broadcast.emit('playerMoved', { id: socket.id, x: players[socket.id].x, y: players[socket.id].y });
        }
    });

    socket.on('chatMessage', (msg) => {
        io.emit('chatMessage', { name: 'Knight', message: msg });
    });

    socket.on('disconnect', () => {
        console.log('Jucător deconectat:', socket.id);
        delete players[socket.id];
        io.emit('disconnect', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serverul rulează pe portul ${PORT}`);
});
