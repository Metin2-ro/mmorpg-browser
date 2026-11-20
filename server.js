const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// codul serverului și datele jucătorilor nu trebuie să poată fi descărcate din browser
app.use((req, res, next) => {
    if (/^\/(server\.js|package(-lock)?\.json|data(\/|$)|node_modules(\/|$)|\.git)/i.test(req.path)) {
        return res.status(404).end();
    }
    next();
});
app.use(express.static(__dirname));

/* ===================== SETĂRI ===================== */
const TICK_MS = 100;                 // 10 actualizări pe secundă
const MONSTER_COUNT = 14;
const MONSTER_RESPAWN = 8;           // secunde
const BOSS_RESPAWN = 90;             // secunde
const LOOT_TTL = 90;                 // secunde
const MAX_LOOT = 100;
const PLAYER_SCALE = 20;             // clientul trimite pozițiile înmulțite cu 20

/* ===================== STARE ===================== */
const players = {};
const monsters = [];
const monsterById = {};
const loot = {};
let spawnPoints = [];
let bossPoint = null;
let worldReady = false;
let nextLootId = 1;

const nowSec = () => Date.now() / 1000;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const r2 = (v) => Math.round(v * 100) / 100;

function cleanName(value) {
    const text = String(value || '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 14);
    return text || 'Erou';
}

function playerPos(p) {
    return { x: p.x / PLAYER_SCALE, z: p.y / PLAYER_SCALE };
}

function alivePlayers() {
    const list = [];
    for (const id in players) {
        const p = players[id];
        if (p.hp > 0) {
            const pos = playerPos(p);
            list.push({ id: id, x: pos.x, z: pos.z });
        }
    }
    return list;
}

/* ===================== CLASAMENT ===================== */
// Se salvează în data/leaderboard.json. Pe planul gratuit Render discul se șterge la fiecare
// redeploy, deci clasamentul rezistă doar cât timp instanța rulează (pentru unul permanent trebuie o bază de date).
const DATA_DIR = path.join(__dirname, 'data');
const LB_FILE = path.join(DATA_DIR, 'leaderboard.json');
const MAX_SCORES = 2000;
let scores = {};
let scoresTimer = null;

try {
    scores = JSON.parse(fs.readFileSync(LB_FILE, 'utf8')) || {};
    console.log(`Clasament încărcat: ${Object.keys(scores).length} eroi.`);
} catch (e) {
    scores = {};
}

function saveScoresSoon() {
    if (scoresTimer) return;
    scoresTimer = setTimeout(() => {
        scoresTimer = null;
        try {
            fs.mkdirSync(DATA_DIR, { recursive: true });
            fs.writeFileSync(LB_FILE, JSON.stringify(scores));
        } catch (e) {
            console.warn('Clasamentul nu a putut fi salvat:', e.message);
        }
    }, 5000);
}

function validKey(k) {
    return typeof k === 'string' && /^[A-Za-z0-9-]{8,48}$/.test(k);
}

function recordStats(p, d) {
    if (!p || !p.key || !d) return;
    const n = (v, hi) => Math.max(0, Math.min(hi, Math.floor(Number(v)) || 0));
    scores[p.key] = {
        name: p.name,
        level: Math.max(1, n(d.level, 50)),
        xp: n(d.xp, 1e9),
        kills: n(d.kills, 1e9),
        bossKills: n(d.bossKills, 1e9),
        pvp: n(d.pvp, 1e9),
        updated: Date.now()
    };
    const keys = Object.keys(scores);
    if (keys.length > MAX_SCORES) {
        keys.sort((a, b) => scores[a].updated - scores[b].updated);
        for (let i = 0; i < keys.length - MAX_SCORES; i++) delete scores[keys[i]];
    }
    saveScoresSoon();
}

function buildLeaderboard(me) {
    const online = new Set(Object.values(players).map((p) => p.key).filter(Boolean));
    const list = Object.entries(scores)
        .map(([key, v]) => Object.assign({ key: key }, v))
        .sort((a, b) => b.level - a.level || b.xp - a.xp || b.kills - a.kills);
    const top = list.slice(0, 10).map((v, i) => ({
        rank: i + 1, name: v.name, level: v.level, kills: v.kills, bossKills: v.bossKills, pvp: v.pvp,
        online: online.has(v.key), me: !!(me && me.key && me.key === v.key)
    }));
    const idx = me && me.key ? list.findIndex((v) => v.key === me.key) : -1;
    return { top: top, myRank: idx >= 0 ? idx + 1 : null, total: list.length };
}

/* ===================== MONȘTRI ===================== */
function makeMonster(id, type, point) {
    const boss = type === 'boss';
    return {
        id: id,
        type: type,
        name: boss ? 'Alfa Vârcolac' : 'Vârcolac',
        scale: boss ? 1.5 : 1.2,
        x: point.x, z: point.z,
        spawnX: point.x, spawnZ: point.z,
        hp: boss ? 4000 : 300,
        maxHp: boss ? 4000 : 300,
        alive: true,
        aggroOn: false,
        speed: boss ? 3.8 : 4.5,
        range: boss ? 3.8 : 2.2,
        aggro: boss ? 26 : 16,
        leash: boss ? 60 : 38,
        dmgMin: boss ? 45 : 16,
        dmgMax: boss ? 70 : 26,
        attackEvery: boss ? 1.6 : 1.3,
        nextAttack: 0,
        attackCount: 0,
        pendingHit: null,
        face: 0,
        respawnAt: 0,
        xp: boss ? 600 : 35,
        // doar boss
        telegraph: false,
        slamAt: 0,
        slamX: 0,
        slamZ: 0,
        nextSlam: nowSec() + 8
    };
}

function initWorld(points, boss) {
    spawnPoints = points;
    bossPoint = boss || points[0];
    monsters.length = 0;
    for (const k in monsterById) delete monsterById[k];

    for (let i = 0; i < MONSTER_COUNT; i++) {
        const m = makeMonster('m' + i, 'normal', points[i % points.length]);
        monsters.push(m);
        monsterById[m.id] = m;
    }
    const b = makeMonster('boss', 'boss', bossPoint);
    monsters.push(b);
    monsterById[b.id] = b;

    worldReady = true;
    console.log(`Lumea a fost creată: ${MONSTER_COUNT} monștri + boss, ${points.length} puncte de apariție.`);
    io.emit('worldState', worldSnapshot());
}

function worldSnapshot() {
    return {
        monsters: monsters.map((m) => ({
            id: m.id, type: m.type, name: m.name, scale: m.scale,
            x: r2(m.x), z: r2(m.z), hp: m.hp, maxHp: m.maxHp, alive: m.alive
        })),
        loot: Object.values(loot)
    };
}

function respawnMonster(m) {
    const point = m.type === 'boss'
        ? bossPoint
        : spawnPoints[randInt(0, spawnPoints.length - 1)];
    m.x = point.x; m.z = point.z;
    m.spawnX = point.x; m.spawnZ = point.z;
    m.hp = m.maxHp;
    m.alive = true;
    m.aggroOn = false;
    m.pendingHit = null;
    m.telegraph = false;
    m.nextSlam = nowSec() + 8;
    m.nextAttack = nowSec() + 1;
}

function damageRoll(m, mult) {
    return Math.round(rand(m.dmgMin, m.dmgMax) * mult);
}

function enraged(m) {
    return m.type === 'boss' && m.hp < m.maxHp * 0.3;
}

function stepMonster(m, now, dt, targets) {
    if (!m.alive) {
        if (now >= m.respawnAt) respawnMonster(m);
        return;
    }

    // lovitura programată (apare după puțin timp de la începerea animației)
    if (m.pendingHit && now >= m.pendingHit.at) {
        const victim = players[m.pendingHit.targetId];
        if (victim && victim.hp > 0) {
            const pos = playerPos(victim);
            if (Math.hypot(pos.x - m.x, pos.z - m.z) <= m.range + 1.4) {
                io.to(m.pendingHit.targetId).emit('playerHit', {
                    attackerId: null, monsterId: m.id, damage: m.pendingHit.dmg
                });
            }
        }
        m.pendingHit = null;
    }

    // cel mai apropiat jucător
    let target = null, best = Infinity;
    for (const t of targets) {
        const d = Math.hypot(t.x - m.x, t.z - m.z);
        if (d < best) { best = d; target = t; }
    }

    const fromSpawn = Math.hypot(m.x - m.spawnX, m.z - m.spawnZ);
    if (target && best <= m.aggro) m.aggroOn = true;
    if (m.aggroOn && (!target || best > m.leash || fromSpawn > m.leash)) m.aggroOn = false;

    // atacul special al boss-ului: lovitură în sol
    if (m.type === 'boss') {
        if (m.telegraph) {
            if (now >= m.slamAt) {
                m.telegraph = false;
                const radius = 8;
                const slamDmg = Math.round(90 * (enraged(m) ? 1.25 : 1));
                for (const t of targets) {
                    if (Math.hypot(t.x - m.slamX, t.z - m.slamZ) <= radius) {
                        io.to(t.id).emit('playerHit', { attackerId: null, monsterId: m.id, damage: slamDmg });
                    }
                }
                io.emit('bossSlam', { x: r2(m.slamX), z: r2(m.slamZ), r: radius });
            }
            return; // stă pe loc cât pregătește lovitura
        }
        if (m.aggroOn && target && best <= 20 && now >= m.nextSlam) {
            m.telegraph = true;
            m.slamAt = now + 1.5;
            m.slamX = m.x;
            m.slamZ = m.z;
            m.nextSlam = now + (enraged(m) ? 6 : 9);
            io.emit('bossSlamWarn', { x: r2(m.x), z: r2(m.z), r: 8, t: 1.5 });
            return;
        }
    }

    const speedMul = enraged(m) ? 1.3 : 1;

    if (m.aggroOn && target) {
        const dx = target.x - m.x, dz = target.z - m.z;
        m.face = Math.atan2(dx, dz);
        if (best > m.range) {
            const step = m.speed * speedMul * dt;
            m.x += dx / best * step;
            m.z += dz / best * step;
        } else if (now >= m.nextAttack) {
            m.nextAttack = now + m.attackEvery / speedMul;
            m.attackCount++;
            m.pendingHit = { at: now + 0.25, targetId: target.id, dmg: damageRoll(m, enraged(m) ? 1.25 : 1) };
        }
    } else if (fromSpawn > 1.5) {
        const dx = m.spawnX - m.x, dz = m.spawnZ - m.z;
        m.face = Math.atan2(dx, dz);
        const step = m.speed * 0.7 * dt;
        m.x += dx / fromSpawn * step;
        m.z += dz / fromSpawn * step;
    } else if (m.hp < m.maxHp) {
        m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.1 * dt);
    }
}

/* ===================== DROP-URI ===================== */
function addLoot(type, amount, x, z, extra) {
    const ids = Object.keys(loot);
    if (ids.length >= MAX_LOOT) {
        delete loot[ids[0]];
        io.emit('lootGone', { id: ids[0] });
    }
    const angle = Math.random() * Math.PI * 2;
    const radius = 0.6 + Math.random() * 1.6;
    const item = {
        id: 'l' + (nextLootId++),
        type: type,
        amount: amount,
        x: r2(x + Math.cos(angle) * radius),
        z: r2(z + Math.sin(angle) * radius),
        expires: nowSec() + LOOT_TTL
    };
    if (extra) Object.assign(item, extra);
    loot[item.id] = item;
    io.emit('lootDrop', item);
}

const GEAR_SLOTS = ['weapon', 'armor', 'helmet', 'boots', 'amulet'];

function rollRarity(boss) {
    const r = Math.random() * 100;
    if (boss) return r < 55 ? 'rare' : (r < 95 ? 'epic' : 'legendary');
    return r < 70 ? 'common' : (r < 92 ? 'uncommon' : (r < 98.5 ? 'rare' : 'epic'));
}

function addGear(x, z, ilvl, boss) {
    addLoot('gear', 1, x, z, {
        slot: GEAR_SLOTS[randInt(0, GEAR_SLOTS.length - 1)],
        rarity: rollRarity(boss),
        ilvl: Math.max(1, Math.min(50, ilvl)),
        seed: randInt(1, 2147483646)
    });
}

function dropLoot(m, killerLevel) {
    if (m.type === 'boss') {
        addLoot('gold', randInt(250, 400), m.x, m.z);
        for (let i = 0; i < 3; i++) addLoot('hp', 1, m.x, m.z);
        for (let i = 0; i < 2; i++) addLoot('mp', 1, m.x, m.z);
        addLoot('crystal', 1, m.x, m.z);
        addGear(m.x, m.z, killerLevel + 1, true);
        addGear(m.x, m.z, killerLevel + 1, true);
        return;
    }
    addLoot('gold', randInt(8, 25), m.x, m.z);
    if (Math.random() < 0.35) addLoot('hp', 1, m.x, m.z);
    if (Math.random() < 0.25) addLoot('mp', 1, m.x, m.z);
    if (Math.random() < 0.06) addLoot('crystal', 1, m.x, m.z);
    if (Math.random() < 0.14) addGear(m.x, m.z, killerLevel, false);
}

function killMonster(m, killerId) {
    m.alive = false;
    m.hp = 0;
    m.aggroOn = false;
    m.pendingHit = null;
    m.telegraph = false;
    m.respawnAt = nowSec() + (m.type === 'boss' ? BOSS_RESPAWN : MONSTER_RESPAWN);
    const killer = players[killerId];
    dropLoot(m, killer ? killer.level : 1);

    // XP: ucigașul primește tot, jucătorii din apropiere primesc jumătate
    for (const t of alivePlayers()) {
        if (Math.hypot(t.x - m.x, t.z - m.z) > 35) continue;
        const own = t.id === killerId;
        io.to(t.id).emit('xpGain', {
            xp: own ? m.xp : Math.round(m.xp / 2),
            killed: own,
            name: m.name,
            boss: m.type === 'boss'
        });
    }
    if (m.type === 'boss') io.emit('serverMessage', { text: 'Lordul Infernului a fost învins!' });
}

/* ===================== BUCLA SERVERULUI ===================== */
setInterval(() => {
    const now = nowSec();
    for (const id in loot) {
        if (now >= loot[id].expires) {
            delete loot[id];
            io.emit('lootGone', { id: id });
        }
    }

    if (!worldReady || Object.keys(players).length === 0) return;

    const dt = TICK_MS / 1000;
    const targets = alivePlayers();
    for (const m of monsters) stepMonster(m, now, dt, targets);

    io.volatile.emit('monsters', monsters.map((m) => ({
        id: m.id,
        x: r2(m.x),
        z: r2(m.z),
        hp: m.hp,
        a: m.alive ? 1 : 0,
        c: m.attackCount,
        f: r2(m.face)
    })));
}, TICK_MS);

/* ===================== CONEXIUNI ===================== */
io.on('connection', (socket) => {
    console.log(`Un jucător s-a conectat: ${socket.id}`);

    players[socket.id] = {
        x: 0,
        y: 0,
        color: '#' + Math.floor(Math.random() * 16777215).toString(16),
        name: 'Erou',
        level: 1,
        hp: 1500,
        maxHp: 1500,
        tokens: 20,
        lastRefill: nowSec(),
        key: null,
        lastStats: 0
    };

    socket.emit('currentPlayers', publicPlayers());
    socket.broadcast.emit('newPlayer', { id: socket.id, player: publicPlayer(players[socket.id]) });

    if (worldReady) socket.emit('worldState', worldSnapshot());
    else socket.emit('needSpawnPoints');

    // limită de lovituri pe monștri: max ~15/secundă
    function allowHit() {
        const p = players[socket.id];
        const now = nowSec();
        p.tokens = Math.min(20, p.tokens + (now - p.lastRefill) * 15);
        p.lastRefill = now;
        if (p.tokens < 1) return false;
        p.tokens -= 1;
        return true;
    }

    socket.on('join', (d) => {
        const p = players[socket.id];
        if (!p || !d) return;
        p.name = cleanName(d.name);
        p.level = Math.max(1, Math.min(50, Math.floor(Number(d.level)) || 1));
        const maxHp = Math.floor(Number(d.maxHp));
        if (maxHp > 0 && maxHp < 20000) { p.maxHp = maxHp; p.hp = maxHp; }
        if (Number.isFinite(d.x) && Number.isFinite(d.y)) { p.x = d.x; p.y = d.y; }
        p.key = validKey(d.key) ? d.key : null;
        recordStats(p, { level: p.level, xp: d.xp, kills: d.kills, bossKills: d.bossKills, pvp: d.pvp });
        socket.broadcast.emit('playerInfo', { id: socket.id, name: p.name, level: p.level });
        socket.broadcast.emit('playerHp', { id: socket.id, hp: p.hp, max: p.maxHp });
    });

    socket.on('stats', (d) => {
        const p = players[socket.id];
        if (!p || !p.key || !d) return;
        const now = nowSec();
        if (now - p.lastStats < 1.5) return;
        p.lastStats = now;
        p.level = Math.max(1, Math.min(50, Math.floor(Number(d.level)) || p.level));
        recordStats(p, d);
    });

    socket.on('getLeaderboard', () => {
        socket.emit('leaderboard', buildLeaderboard(players[socket.id]));
    });

    socket.on('levelUpdate', (d) => {
        const p = players[socket.id];
        if (!p || !d) return;
        p.level = Math.max(1, Math.min(50, Math.floor(Number(d.level)) || p.level));
        socket.broadcast.emit('playerInfo', { id: socket.id, name: p.name, level: p.level });
    });

    socket.on('spawnPoints', (d) => {
        if (worldReady || !d || !Array.isArray(d.points)) return;
        const points = d.points
            .filter((q) => q && Number.isFinite(q.x) && Number.isFinite(q.z))
            .slice(0, 60)
            .map((q) => ({ x: q.x, z: q.z }));
        if (points.length < 5) return;
        const boss = d.boss && Number.isFinite(d.boss.x) && Number.isFinite(d.boss.z)
            ? { x: d.boss.x, z: d.boss.z }
            : null;
        initWorld(points, boss);
    });

    socket.on('playerMovement', (movementData) => {
        const p = players[socket.id];
        if (!p || !movementData) return;
        if (!Number.isFinite(movementData.x) || !Number.isFinite(movementData.y)) return;
        p.x = movementData.x;
        p.y = movementData.y;
        socket.broadcast.emit('playerMoved', { id: socket.id, x: p.x, y: p.y });
    });

    /* ---- lupta cu monștrii ---- */
    socket.on('hitMonster', (d) => {
        const p = players[socket.id];
        if (!p || !worldReady || !d || p.hp <= 0 || !allowHit()) return;
        const m = monsterById[d.id];
        if (!m || !m.alive) return;

        let dmg = Math.floor(Number(d.damage));
        if (!(dmg > 0)) return;
        dmg = Math.min(dmg, Math.round(480 * (1 + 0.08 * (p.level - 1))));

        const pos = playerPos(p);
        const reach = (d.kind === 'spell' ? 36 : 10) + m.scale * 2;
        if (Math.hypot(pos.x - m.x, pos.z - m.z) > reach) return;

        m.hp -= dmg;
        m.aggroOn = true;
        socket.broadcast.emit('monsterDamaged', { id: m.id, dmg: dmg, crit: !!d.crit, by: socket.id });
        if (m.hp <= 0) killMonster(m, socket.id);
    });

    socket.on('pickupLoot', (d) => {
        const p = players[socket.id];
        if (!p || !d) return;
        const item = loot[d.id];
        if (!item) return;
        const pos = playerPos(p);
        if (Math.hypot(pos.x - item.x, pos.z - item.z) > 4) return;
        delete loot[item.id];
        io.emit('lootGone', { id: item.id });
        socket.emit('lootGranted', { type: item.type, amount: item.amount, slot: item.slot, rarity: item.rarity, ilvl: item.ilvl, seed: item.seed });
    });

    /* ---- PvP ---- */
    socket.on('attackPlayer', (d) => {
        if (!d || !players[d.targetId] || d.targetId === socket.id) return;
        const damage = Math.min(Math.max(Number(d.damage) || 0, 0), 600);
        if (damage > 0) io.to(d.targetId).emit('playerHit', { attackerId: socket.id, damage: damage });
    });

    socket.on('playerAttack', (d) => {
        socket.broadcast.emit('playerAttacked', { id: socket.id, skill: d && d.skill });
    });

    socket.on('hpUpdate', (d) => {
        const p = players[socket.id];
        if (!p) return;
        const hp = typeof d === 'object' && d ? Number(d.hp) : Number(d);
        const max = typeof d === 'object' && d ? Number(d.max) : p.maxHp;
        if (!Number.isFinite(hp)) return;
        p.hp = Math.max(0, hp);
        if (Number.isFinite(max) && max > 0 && max < 20000) p.maxHp = max;
        socket.broadcast.emit('playerHp', { id: socket.id, hp: p.hp, max: p.maxHp });
    });

    socket.on('playerDied', (d) => {
        if (d && players[d.killerId]) io.to(d.killerId).emit('pvpKill', { victimId: socket.id });
    });

    socket.on('disconnect', () => {
        console.log(`Jucător deconectat: ${socket.id}`);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

function publicPlayer(p) {
    return { x: p.x, y: p.y, color: p.color, name: p.name, level: p.level, hp: p.hp, maxHp: p.maxHp };
}

function publicPlayers() {
    const out = {};
    for (const id in players) out[id] = publicPlayer(players[id]);
    return out;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serverul MMORPG rulează pe portul ${PORT}`);
});
