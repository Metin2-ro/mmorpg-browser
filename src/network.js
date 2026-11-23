"use strict";

// Modul multiplayer extras din game.js. Rămâne script clasic pentru compatibilitate cu starea globală.

function sendJoin() {
    if (!socket || !socket.connected) return;
    socket.emit("join", {
        name: heroName, level: playerLevel, maxHp: maxHP, x: myPos.x * 20, y: myPos.z * 20,
        key: getPlayerKey(), xp: playerXP, kills: monsterKills, bossKills: bossKills, pvp: pvpKills
    });
    lastHpSent = Math.round(myHP);
}

function setupSocket() {
    try {
        if (typeof io === "undefined") {
            addChat("Serverul nu răspunde: fără monștri și multiplayer.", "#e74c3c");
            setLoad("server", 1);
            setLoad("world", 1);
            return;
        }
        socket = io();
        setLoad("server", 0.2);

        socket.on("connect", function() {
            addChat("Conectat la server.", "#2ecc71");
            setLoad("server", 1);
            sendJoin();
        });
        socket.on("disconnect", function() {
            addChat("Conexiune pierdută. Se reconectează...", "#e74c3c");
        });

        socket.on("currentPlayers", function(serverPlayers) {
            clearRemotePlayers();
            for (const id in serverPlayers) {
                if (id === socket.id) continue;
                addRemotePlayer(id, serverPlayers[id]);
            }
            updateOnlineCount();
        });
        socket.on("newPlayer", function(data) {
            if (!data || data.id === socket.id) return;
            addRemotePlayer(data.id, data.player);
            updateOnlineCount();
        });
        socket.on("playerMoved", function(data) {
            if (data.id === socket.id) return;
            if (!remotePlayers[data.id]) {
                addRemotePlayer(data.id, { x: data.x, y: data.y });
                updateOnlineCount();
            }
            const rp = remotePlayers[data.id];
            rp.x = data.x / 20;
            rp.z = data.y / 20;
        });
        socket.on("playerInfo", function(d) {
            const rp = d && remotePlayers[d.id];
            if (!rp) return;
            rp.name = d.name;
            rp.level = d.level;
            if (rp.bar) rp.bar.setLabel(remoteLabel(rp));
        });
        socket.on("playerHp", function(d) {
            if (d && remotePlayers[d.id]) setRemoteHp(d.id, Number(d.hp) || 0, Number(d.max) || undefined);
        });
        socket.on("playerDisconnected", function(id) {
            removeRemotePlayer(typeof id === "object" && id ? id.id : id);
        });

        // ---- PvP ----
        socket.on("playerHit", function(data) {
            takeDamage(Number(data && data.damage) || 0, data && data.attackerId);
        });
        socket.on("playerAttacked", function(data) {
            const rp = remotePlayers[data && data.id];
            if (!rp || !rp.mesh) return;
            if (data.skill === 5) {
                spawnWarCryFx(rp.mesh.position.x, rp.mesh.position.y, rp.mesh.position.z);
            } else if (data.skill === 6) {
                const ry6 = rp.mesh.rotation.y;
                spawnEarthSlam(rp.mesh.position.x + Math.sin(ry6) * 3.5, rp.mesh.position.z + Math.cos(ry6) * 3.5, SKILLS[6].range);
            } else if (data.skill === 7) {
                const ry7 = rp.mesh.rotation.y;
                const from = new THREE.Vector3(rp.mesh.position.x, rp.mesh.position.y + 1.4, rp.mesh.position.z);
                spawnBolt(from, new THREE.Vector3(from.x + Math.sin(ry7) * 10, from.y - 0.2, from.z + Math.cos(ry7) * 10));
            } else if (data.skill === 4) {
                const ry = rp.mesh.rotation.y;
                spawnProjectile(rp.mesh.position.x + Math.sin(ry) * 0.9, rp.mesh.position.y + 1.3, rp.mesh.position.z + Math.cos(ry) * 0.9,
                    Math.sin(ry), Math.cos(ry), false);
            } else {
                if (data.skill === 2) spawnBladeVortex(rp.mesh.position.x, rp.mesh.position.y, rp.mesh.position.z, null);
                else spawnSwordSlash(rp.mesh.position.x, rp.mesh.position.y, rp.mesh.position.z, rp.mesh.rotation.y, 0);
            }
        });
        socket.on("pvpKill", function() {
            pvpKills++;
            updateKillUI();
            addChat("⚔️ Ai învins un jucător!", "#2ecc71");
            saveGame();
            sendStatsSoon();
            sndPickup();
        });

        // ---- lumea (monștri, boss, drop-uri) ----
        socket.on("needSpawnPoints", function() {
            wantSpawnPoints = true;
            setLoad("world", 0.3);
            trySendSpawnPoints();
        });
        socket.on("worldState", handleWorldState);
        socket.on("monsters", handleMonsterSnapshot);
        socket.on("monsterDamaged", function(d) {
            const m = d && monsterById[d.id];
            if (!m || !m.alive) return;
            m.flash = 0.12;
            spawnFloatingText(String(d.dmg), d.crit ? "#ffdd33" : "#cfd8dc",
                new THREE.Vector3(m.x, m.y + 3.0 * m.scale, m.z), !!d.crit);
        });
        socket.on("xpGain", function(d) {
            if (!d) return;
            if (d.killed) {
                monsterKills++;
                if (d.boss) {
                    bossKills++;
                    skillPoints++;
                    addChat("✨ +1 punct de abilitate pentru boss (K).", "#ffd700");
                    updateInvUI();
                }
                updateKillUI();
            }
            gainXP(Number(d.xp) || 0);
            addChat((d.killed ? "☠️ Ai învins " : "✨ Ajutor la ") + d.name + " (+" + d.xp + " XP)", d.boss ? "#ffd966" : "#2ecc71");
        });
        socket.on("lootDrop", function(l) {
            addLootItem(l);
            if (l) sndDrop(Math.hypot(l.x - myPos.x, l.z - myPos.z));
        });
        socket.on("lootGone", function(d) { if (d) removeLootItem(d.id); });
        socket.on("lootGranted", applyLootGranted);
        socket.on("bossSlamWarn", function(d) { addTelegraph(d.x, d.z, d.r, d.t); sndBossWarn(); });
        socket.on("bossSlam", function(d) { spawnShockwave(d.x, d.z, d.r); sndBossSlam(Math.hypot(d.x - myPos.x, d.z - myPos.z)); });
        socket.on("serverMessage", function(d) { if (d) addChat("📢 " + d.text, "#ffd966"); });
        socket.on("leaderboard", renderLeaderboard);
    } catch (e) {
        console.warn("Eroare la conectarea la server:", e);
    }
}

