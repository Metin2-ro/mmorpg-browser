const express = require('express');
const app = express();
const http = require('http').createServer(app);
const { Server } = require('socket.io');
const io = new Server(http);

app.use(express.static(__dirname));

const players = {};
const monsters = {};
const collectibles = {};

// Generăm 3 monștri 2D pe hartă
for (let i = 1; i <= 3; i++) {
    monsters[i] = {
        id: i,
        x: Math.floor(Math.random() * 600) + 100,
        y: Math.floor(Math.random() * 400) + 100
    };
}

// Generăm cristale de colectat
for (let i = 1; i <= 5; i++) {
    collectibles[i] = {
        id: i,
        x: Math.floor(Math.random() * 700) + 50,
        y: Math.floor(Math.random() * 500) + 50
    };
}

// Monștrii se mișcă singuri la fiecare secundă
setInterval(() => {
    for (const id in monsters) {
        monsters[id].x += Math.floor(Math.random() * 31) - 15; // mișcare aleatorie X
        monsters[id].y += Math.floor(Math.random() * 31) - 15; // mișcare aleatorie Y
        
        // Păstrăm monștrii în limitele hărții
        monsters[id].x = Math.max(30, Math.min(770, monsters[id].x));
        monsters[id].y = Math.max(30, Math.min(570, monsters[id].y));
    }
    io.emit('monstersMoved', monsters);
}, 1000);

io.on('connection', (socket) => {
    console.log(`Un jucător s-a conectat: ${socket.id}`);

    players[socket.id] = {
        x: Math.floor(Math.random() * 600) + 100,
        y: Math.floor(Math.random() * 400) + 100,
        color: '#' + Math.floor(Math.random()*16777215).toString(16),
        score: 0
    };

    socket.emit('currentPlayers', players);
    socket.emit('currentMonsters', monsters);
    socket.emit('currentCollectibles', collectibles);

    socket.broadcast.emit('newPlayer', { id: socket.id, player: players[socket.id] });

    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            
            // Verificăm colectarea cristalelor
            for (const id in collectibles) {
                const c = collectibles[id];
                const dist = Math.hypot(players[socket.id].x - c.x, players[socket.id].y - c.y);
                if (dist < 25) {
                    players[socket.id].score += 1;
                    delete collectibles[id];
                    io.emit('collectibleTaken', { collectibleId: id, score: players[socket.id].score, playerId: socket.id });
                    
                    setTimeout(() => {
                        collectibles[id] = {
                            id: id,
                            x: Math.floor(Math.random() * 700) + 50,
                            y: Math.floor(Math.random() * 500) + 50
                        };
                        io.emit('newCollectible', collectibles[id]);
                    }, 2000);
                }
            }

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
http.listen(PORT, () => {
    console.log(`Serverul MMORPG rulează pe portul ${PORT}`);
});
