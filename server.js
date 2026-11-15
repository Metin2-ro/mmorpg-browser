const express = require('express');
const app = express();
const http = require('http').createServer(app);
const { Server } = require('socket.io');
const io = new Server(http);

app.use(express.static(__dirname));

const players = {};
const monsters = {};
const collectibles = {};

// Generăm monștrii pe hartă
for (let i = 1; i <= 4; i++) {
    monsters[i] = {
        id: i,
        x: Math.floor(Math.random() * 500) + 100,
        y: Math.floor(Math.random() * 350) + 100
    };
}

// Generăm obiecte / poțiuni de colectat
for (let i = 1; i <= 5; i++) {
    collectibles[i] = {
        id: i,
        x: Math.floor(Math.random() * 600) + 50,
        y: Math.floor(Math.random() * 450) + 50,
        type: i % 2 === 0 ? 'potion' : 'gold'
    };
}

io.on('connection', (socket) => {
    console.log(`Un jucător s-a conectat: ${socket.id}`);

    players[socket.id] = {
        x: 350,
        y: 250,
        name: `Player ${Math.floor(Math.random() * 90) + 10}`,
        potions: 1,
        sword: 'Iron Sword',
        gold: 5
    };

    socket.emit('currentPlayers', players);
    socket.emit('currentMonsters', monsters);
    socket.emit('currentCollectibles', collectibles);

    socket.broadcast.emit('newPlayer', { id: socket.id, player: players[socket.id] });

    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;

            // Verificăm colectarea de iteme
            for (const id in collectibles) {
                const c = collectibles[id];
                const dist = Math.hypot(players[socket.id].x - c.x, players[socket.id].y - c.y);
                if (dist < 30) {
                    if (c.type === 'potion') players[socket.id].potions += 1;
                    else players[socket.id].gold += 5;

                    delete collectibles[id];
                    io.emit('collectibleTaken', { collectibleId: id, playerId: socket.id, player: players[socket.id] });

                    setTimeout(() => {
                        collectibles[id] = {
                            id: id,
                            x: Math.floor(Math.random() * 600) + 50,
                            y: Math.floor(Math.random() * 450) + 50,
                            type: Math.random() > 0.5 ? 'potion' : 'gold'
                        };
                        io.emit('newCollectible', collectibles[id]);
                    }, 3000);
                }
            }

            socket.broadcast.emit('playerMoved', { id: socket.id, x: players[socket.id].x, y: players[socket.id].y });
        }
    });

    socket.on('chatMessage', (msg) => {
        io.emit('chatMessage', { name: players[socket.id] ? players[socket.id].name : 'Guest', message: msg });
    });

    socket.on('disconnect', () => {
        console.log(`Jucător deconectat: ${socket.id}`);
        delete players[socket.id];
        io.emit('disconnect', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Serverul MMORPG rulează pe portul ${PORT}`);
});
