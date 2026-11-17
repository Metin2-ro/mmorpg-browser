const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

const players = {};

io.on('connection', (socket) => {
    console.log(`Un jucător s-a conectat: ${socket.id}`);

    players[socket.id] = {
        x: Math.floor(Math.random() * 600) + 100,
        y: Math.floor(Math.random() * 400) + 100,
        color: '#' + Math.floor(Math.random()*16777215).toString(16)
    };

    socket.emit('currentPlayers', players);
    socket.broadcast.emit('newPlayer', { id: socket.id, player: players[socket.id] });

    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            socket.broadcast.emit('playerMoved', { id: socket.id, x: players[socket.id].x, y: players[socket.id].y });
        }
    });

    socket.on('disconnect', () => {
        console.log(`Jucător deconectat: ${socket.id}`);
        delete players[socket.id];
        io.emit('disconnect', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serverul MMORPG rulează pe portul ${PORT}`);
});
