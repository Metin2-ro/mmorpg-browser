"use strict";

// Sistemul de luptă, monștri, efecte de lovire și viață.
// Script clasic pentru compatibilitate cu starea globală Three.js a clientului.

/* ====================== COMBAT: ATAC, MONȘTRI, PvP ====================== */
const MONSTER_COUNT = 14;
const MONSTER_MAX_HP = 300;
const MONSTER_AGGRO = 16;
const MONSTER_LEASH = 38;
const MONSTER_ATTACK_RANGE = 2.2;
const MONSTER_SPEED = 4.5;          // unități/secundă (jucătorul merge cu ~6.6, aleargă cu ~13.8)
const MONSTER_DAMAGE_MIN = 16;
const MONSTER_DAMAGE_MAX = 26;
const MONSTER_RESPAWN_SECONDS = 8;

let myMP = 700;
let maxMP = 700;
let playerDead = false;
let deadTimer = 0;
let lastHitTime = -100;
let attackUntil = 0, attackStart = 0, attackType = 1, attackProcedural = false;
const attackActions = [];
let deathAction = null, hitAction = null;
let hitUntil = 0, lastHitAnim = -100;
let shieldMesh = null;
let monstersSpawned = false;
let monsterKills = 0;
const monsters = [];
const floatingTexts = [];
const effects = [];
let hudTimer = 0, hpSendTimer = 0, lastHpSent = 1500;

const SKILLS = {
    1: { cd: 0.6, mp: 0,   range: 3.8, arc: Math.PI * 0.9, min: 90, max: 130, hitDelay: 0.22, readyAt: 0 },
    2: { cd: 3.0, mp: 100, range: 6.0, arc: Math.PI * 2,   min: 70, max: 100, hitDelay: 0.30, readyAt: 0 }
};
const DEFENSE = { cd: 6, mp: 50, duration: 2.5, readyAt: 0 };

function nowSec() { return performance.now() / 1000; }

function updateMyMpUI() {
    const pct = Math.max(0, Math.min(100, (myMP / maxMP) * 100));
    document.getElementById("ui-mp-bar").style.width = pct + "%";
    document.getElementById("ui-mp-text").textContent = "MP: " + Math.max(0, Math.round(myMP)) + " / " + maxMP;
}

function updateKillUI() {
    document.getElementById("pvp-kills").textContent = pvpKills;
    document.getElementById("monster-kills").textContent = monsterKills;
}

/* ---------- bară de viață (sprite) și text plutitor ---------- */
function makeBarSprite(label) {
    const canvas = document.createElement("canvas");
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext("2d");
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.6, 0.65, 1);
    sprite.renderOrder = 998;
    let currentRatio = 1;

    function draw(ratio) {
        ratio = Math.max(0, Math.min(1, ratio));
        currentRatio = ratio;
        ctx.clearRect(0, 0, 256, 64);
        let size = 24;
        ctx.font = "bold " + size + "px Arial";
        while (ctx.measureText(label).width > 240 && size > 12) {
            size--;
            ctx.font = "bold " + size + "px Arial";
        }
        ctx.textAlign = "center";
        ctx.lineWidth = 5;
        ctx.strokeStyle = "#000";
        ctx.strokeText(label, 128, 24);
        ctx.fillStyle = "#ffd966";
        ctx.fillText(label, 128, 24);
        ctx.fillStyle = "rgba(0,0,0,0.75)";
        ctx.fillRect(8, 34, 240, 22);
        const g = ctx.createLinearGradient(0, 34, 0, 56);
        g.addColorStop(0, "#ff4d4d");
        g.addColorStop(1, "#8b0000");
        ctx.fillStyle = g;
        ctx.fillRect(10, 36, 236 * ratio, 18);
        ctx.strokeStyle = "#c9a24a";
        ctx.lineWidth = 2;
        ctx.strokeRect(8, 34, 240, 22);
        tex.needsUpdate = true;
    }
    function setLabel(text) {
        label = text;
        draw(currentRatio);
    }
    draw(1);
    return { sprite: sprite, draw: draw, setLabel: setLabel };
}

function spawnFloatingText(text, color, pos, big) {
    if (!scene) return;
    const canvas = document.createElement("canvas");
    canvas.width = 256; canvas.height = 96;
    const ctx = canvas.getContext("2d");
    ctx.font = "bold " + (big ? 62 : 48) + "px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 9;
    ctx.strokeStyle = "#000";
    ctx.strokeText(text, 128, 48);
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 48);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(big ? 3.4 : 2.6, big ? 1.3 : 1.0, 1);
    sprite.position.copy(pos);
    sprite.position.x += (Math.random() - 0.5) * 0.6;
    sprite.renderOrder = 999;
    scene.add(sprite);
    floatingTexts.push({ sprite: sprite, mat: mat, tex: tex, life: 0, max: 0.95 });
}

function updateFloatingTexts(delta) {
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const f = floatingTexts[i];
        f.life += delta;
        f.sprite.position.y += 2.2 * delta;
        const t = f.life / f.max;
        f.mat.opacity = Math.max(0, 1 - t * t);
        if (f.life >= f.max) {
            scene.remove(f.sprite);
            f.mat.dispose();
            f.tex.dispose();
            floatingTexts.splice(i, 1);
        }
    }
}

/* ---------- efecte vizuale de atac ---------- */
function spawnSlashEffect(x, y, z, rotY, skill, tilt) {
    if (!scene) return;
    const group = new THREE.Group();
    group.position.set(x, y + 0.9, z);

    let geo;
    if (skill === 2) geo = new THREE.RingGeometry(1.2, 5.2, 48);
    else geo = new THREE.RingGeometry(1.0, 3.4, 28, 1, -Math.PI * 0.42, Math.PI * 0.84);

    const mat = new THREE.MeshBasicMaterial({
        color: skill === 2 ? 0x66ccff : 0xffaa33,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    const tiltGroup = new THREE.Group();
    tiltGroup.rotation.x = tilt || 0;
    tiltGroup.add(mesh);
    group.add(tiltGroup);
    group.rotation.y = rotY - Math.PI / 2;
    scene.add(group);

    effects.push({ group: group, mat: mat, geo: geo, life: 0, max: skill === 2 ? 0.55 : 0.3, skill: skill });
}

function updateEffects(delta) {
    for (let i = effects.length - 1; i >= 0; i--) {
        const f = effects[i];
        f.life += delta;
        const t = Math.min(1, f.life / f.max);
        if (f.skill === 2) {
            f.group.scale.setScalar(0.5 + 0.8 * t);
            f.group.rotation.y += delta * 10;
        } else if (f.skill === 3) {
            f.group.scale.setScalar(0.3 + 0.7 * t);
        } else {
            f.group.scale.setScalar(0.7 + 0.5 * t);
        }
        f.mat.opacity = 0.85 * (1 - t);
        if (f.life >= f.max) {
            scene.remove(f.group);
            f.geo.dispose();
            f.mat.dispose();
            effects.splice(i, 1);
        }
    }
}

/* ---------- animația de atac a jucătorului ---------- */
function playOneShot(action, speed) {
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.setEffectiveTimeScale(speed);
    action.setEffectiveWeight(1);
    action.play();
    if (activeAction && activeAction !== action) activeAction.crossFadeTo(action, 0.1, false);
    activeAction = action;
}

function startAttackAnim(n) {
    const now = nowSec();
    if (attackActions.length) {
        const action = attackActions[(n - 1) % attackActions.length];
        const clip = action.getClip();
        let speed = Math.max(1, Math.min(2.5, clip.duration / 0.6));
        if (clip.name === "SwordAttack_Retargeted") speed = (n === 2) ? 2.5 : 2.0;
        playOneShot(action, speed);
        attackUntil = now + Math.min(clip.duration / speed, 1.0);
        attackProcedural = false;
    } else {
        attackUntil = now + (n === 2 ? 0.6 : 0.45);
        attackProcedural = true;
    }
    attackStart = now;
    attackType = n;
}

function autoFaceNearest(range) {
    // ținta selectată are prioritate
    const ti = targetInfo();
    if (ti && Math.hypot(ti.x - myPos.x, ti.z - myPos.z) <= range + 6) {
        myPos.rotY = Math.atan2(ti.x - myPos.x, ti.z - myPos.z);
        return;
    }
    let best = null, bestD = range;
    for (const m of monsters) {
        if (!m.alive) continue;
        const d = Math.hypot(m.x - myPos.x, m.z - myPos.z);
        if (d < bestD) { bestD = d; best = { x: m.x, z: m.z }; }
    }
    for (const id in remotePlayers) {
        const rp = remotePlayers[id];
        if (!rp.mesh || rp.hp <= 0) continue;
        const x = rp.rx !== undefined ? rp.rx : rp.x;
        const z = rp.rz !== undefined ? rp.rz : rp.z;
        const d = Math.hypot(x - myPos.x, z - myPos.z);
        if (d < bestD) { bestD = d; best = { x: x, z: z }; }
    }
    if (best) myPos.rotY = Math.atan2(best.x - myPos.x, best.z - myPos.z);
}

let comboStage = 0, comboLast = -10;
function useSkill(n) {
    if (!characterLoaded || playerDead || !SKILLS[n] || n > 2 || !skillLearned(n) || nowSec() < rollUntil) return;
    const cfg = SKILLS[n];
    const now = nowSec();
    if (now < cfg.readyAt) return;
    if (myMP < cfg.mp) { addChat("Mană insuficientă!", "#e74c3c"); return; }

    let visual = n, tilt = 0, cdUsed = cfg.cd;
    let opts = { mult: 1, delay: cfg.hitDelay };

    if (n === 1) {
        // combo: 3 lovituri la rând (în maxim 1,4 s una după alta)
        const stage = (now - comboLast < 1.4 && comboStage < 3) ? comboStage + 1 : 1;
        comboStage = stage;
        comboLast = now;
        if (stage === 2) {
            opts = { mult: 1.15, delay: cfg.hitDelay };
            tilt = 0.9;
        } else if (stage === 3) {
            opts = { mult: 1.9, delay: 0.3, arc: Math.PI * 2, range: 4.8 };
            visual = 2;
            cdUsed = 1.1;
            comboStage = 0;
        }
        if (stage > 1) {
            spawnFloatingText("Combo x" + stage, "#ffcc66",
                new THREE.Vector3(myPos.x, myPos.y + PLAYER_HEIGHT + 1.3, myPos.z), stage === 3);
        }
    }

    myMP -= cfg.mp;
    cfg.readyAt = now + cdUsed;

    autoFaceNearest(cfg.range + 3);
    startAttackAnim(visual);
    sndSwing(visual);
    if (visual === 2) spawnBladeVortex(myPos.x, myPos.y, myPos.z, function() { return myPos; });
    else spawnSwordSlash(myPos.x, myPos.y, myPos.z, myPos.rotY, tilt);
    if (n === 2) castText(2);
    if (socket && socket.connected) socket.emit("playerAttack", { skill: visual });

    setTimeout(function() { applyAttackDamage(n, opts); }, opts.delay * 1000);
}

function rollDamage(cfg, mult) {
    const effectiveCrit = Math.min(0.95, critChance + (nowSec() < classBuffUntil && classBuffType === "critbuff" ? classBuffAmount : 0));
    const crit = Math.random() < effectiveCrit;
    const sp = cfg.id ? skillPowerForLevel(skillLv[cfg.id] || 1) : 1;
    const buff = nowSec() < buffUntil ? 1 + buffAmount : 1;
    let dmg = (cfg.min + Math.random() * (cfg.max - cfg.min)) * damageMult * sp * buff * (mult || 1);
    if (selectedCharacterName === "Wizard") dmg *= spellMult;
    if (nowSec() < classBuffUntil && (classBuffType === "damagebuff" || classBuffType === "spellbuff")) dmg *= 1 + classBuffAmount;
    if (crit) dmg *= 1.8;
    return { dmg: Math.max(1, Math.round(dmg)), crit: crit };
}

function applyAttackDamage(n, opts) {
    if (playerDead) return;
    opts = opts || {};
    const cfg = SKILLS[n];
    const range = opts.range || cfg.range;
    const arc = opts.arc || cfg.arc;
    const mult = opts.mult || 1;
    const fx = Math.sin(myPos.rotY), fz = Math.cos(myPos.rotY);
    const cosHalf = Math.cos(arc / 2);
    const fullCircle = arc >= Math.PI * 2 - 0.01;

    function inCone(x, z, extra) {
        const dx = x - myPos.x, dz = z - myPos.z;
        const d = Math.hypot(dx, dz);
        if (d > range + 0.6 + extra) return false;
        if (fullCircle || d < 0.5) return true;
        return (dx * fx + dz * fz) / d >= cosHalf;
    }

    for (const m of monsters) {
        if (!m.alive || !inCone(m.x, m.z, m.boss ? 2.0 : 0)) continue;
        const r = rollDamage(cfg, mult);
        damageMonster(m, r.dmg, r.crit, "melee");
    }

    for (const id in remotePlayers) {
        const rp = remotePlayers[id];
        if (!rp.mesh || rp.hp <= 0) continue;
        const x = rp.rx !== undefined ? rp.rx : rp.x;
        const z = rp.rz !== undefined ? rp.rz : rp.z;
        if (!inCone(x, z, 0)) continue;
        const r = rollDamage(cfg, mult);
        spawnFloatingText((r.crit ? "CRIT " : "") + r.dmg, r.crit ? "#ffdd33" : "#ffffff",
            new THREE.Vector3(x, rp.mesh.position.y + PLAYER_HEIGHT + 1.0, z), r.crit);
        if (socket && socket.connected) socket.emit("attackPlayer", { targetId: id, damage: r.dmg });
        sndHit(r.crit, 0);
        setRemoteHp(id, rp.hp - r.dmg);
    }
}

function triggerAttack3D() { useSkill(1); }
function triggerSkill2() { useSkill(2); }

function triggerDefense3D() {
    if (!characterLoaded || playerDead || !skillLearned(3)) return;
    const now = nowSec();
    if (now < DEFENSE.readyAt) return;
    if (myMP < DEFENSE.mp) { addChat("Mană insuficientă!", "#e74c3c"); return; }
    myMP -= DEFENSE.mp;
    DEFENSE.readyAt = now + DEFENSE.cd;
    isDefending = true;
    addChat("🛡️ Scut activat! (-70% daune)", "#3498db");
    sndShield();
    castText(3);
    setTimeout(function() { isDefending = false; }, (2 + 0.12 * skillLv[3]) * 1000);
}

/* ---------- vrajă la distanță + rostogolire ---------- */
const SPELL_SPEED = 24;      // unități/secundă
const SPELL_RANGE = 30;
const SPELL_ANIM_SPEED = 1.7;
let spellAction = null, rollAction = null;
let rollUntil = 0, rollDX = 0, rollDZ = 1;
const projectiles = [];
const particles = [];
const PARTICLE_GEO = new THREE.SphereGeometry(1, 6, 5);
SKILLS[4] = { cd: 1.5, mp: 80, range: SPELL_RANGE, min: 110, max: 150, readyAt: 0 };
const ROLL = { cd: 3.0, readyAt: 0, speed: 0.19, animSpeed: 1.8 };

function spawnParticle(x, y, z, vx, vy, vz, color, size, life) {
    if (!scene) return;
    const mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(PARTICLE_GEO, mat);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(size);
    scene.add(mesh);
    particles.push({ mesh: mesh, mat: mat, vx: vx, vy: vy, vz: vz, size: size, life: 0, max: life });
}

function updateParticles(delta) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += delta;
        const t = p.life / p.max;
        p.mesh.position.x += p.vx * delta;
        p.mesh.position.y += p.vy * delta;
        p.mesh.position.z += p.vz * delta;
        p.mesh.scale.setScalar(Math.max(0.001, p.size * (1 - t)));
        p.mat.opacity = 0.9 * (1 - t);
        if (p.life >= p.max) {
            scene.remove(p.mesh);
            p.mat.dispose();
            particles.splice(i, 1);
        }
    }
}

function updateProjectiles(delta) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        const pos = p.group.position;
        const step = SPELL_SPEED * delta;
        pos.x += p.dx * step;
        pos.z += p.dz * step;
        p.dist += step;
        p.t += delta;

        const gy = getGroundHeight(pos.x, pos.z, NaN);
        if (Number.isFinite(gy)) pos.y += (gy + 1.3 - pos.y) * Math.min(1, 10 * delta);

        p.halo.scale.setScalar(2.4 + 0.4 * Math.sin(p.t * 24));
        p.rings[0].rotation.x += 9 * delta;
        p.rings[1].rotation.z += 11 * delta;
        p.shell.scale.setScalar(0.44 + 0.05 * Math.sin(p.t * 30));
        if (p.visualGroup) {
            const heading = Math.atan2(p.dx, p.dz);
            if (p.visualType === "shuriken") {
                p.visualGroup.rotation.y = heading;
                p.visualGroup.userData.spin.rotation.z += 18 * delta;
            } else if (p.visualType === "axe") {
                p.visualGroup.rotation.y = heading + p.t * 5;
                p.visualGroup.rotation.x = p.t * 7;
            } else if (p.visualType === "bladewave") {
                p.visualGroup.rotation.y = heading;
                p.visualGroup.rotation.z += 3.8 * delta;
            } else {
                p.visualGroup.rotation.y = heading;
                if (p.visualGroup.userData.spin) {
                    p.visualGroup.userData.spin.rotation.x += 4.5 * delta;
                    p.visualGroup.userData.spin.rotation.y += 5.2 * delta;
                }
            }
        }
        p.trail -= delta;
        if (p.trail <= 0) {
            p.trail = 0.025;
            spawnParticle(pos.x, pos.y, pos.z, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, p.color, 0.26, 0.5);
            spawnParticle(pos.x, pos.y, pos.z, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, p.accent, 0.14, 0.4);
        }

        let hit = false;
        if (p.mine && !playerDead) {
            for (const m of monsters) {
                if (!m.alive) continue;
                const hitR = m.boss ? 3.0 : 1.4;
                if (Math.hypot(m.x - pos.x, m.z - pos.z) < hitR && Math.abs(m.y + (m.boss ? 2.0 : 1.2) - pos.y) < (m.boss ? 4.0 : 2.6)) {
                    if (p.splash > 0) applyClassAreaDamage(pos.x, pos.z, p.splash, Math.PI * 2, p.mult, p.skillId);
                    else {
                        const r = rollDamage(SKILLS[p.skillId] || SKILLS[4], p.mult);
                        damageMonster(m, r.dmg, r.crit, "spell");
                    }
                    hit = true;
                    break;
                }
            }
            if (!hit) {
                for (const id in remotePlayers) {
                    const rp = remotePlayers[id];
                    if (!rp.mesh || rp.hp <= 0) continue;
                    const x = rp.rx !== undefined ? rp.rx : rp.x;
                    const z = rp.rz !== undefined ? rp.rz : rp.z;
                    if (Math.hypot(x - pos.x, z - pos.z) < 1.2 && Math.abs(rp.mesh.position.y + 1.0 - pos.y) < 2.4) {
                        if (p.splash > 0) applyClassAreaDamage(pos.x, pos.z, p.splash, Math.PI * 2, p.mult, p.skillId);
                        else {
                            const r = rollDamage(SKILLS[p.skillId] || SKILLS[4], p.mult);
                            spawnFloatingText((r.crit ? "CRIT " : "") + r.dmg, r.crit ? "#ffdd33" : "#ffffff",
                                new THREE.Vector3(x, rp.mesh.position.y + PLAYER_HEIGHT + 1.0, z), r.crit);
                            if (socket && socket.connected) socket.emit("attackPlayer", { targetId: id, damage: r.dmg });
                            sndHit(r.crit, 0);
                            setRemoteHp(id, rp.hp - r.dmg);
                        }
                        hit = true;
                        break;
                    }
                }
            }
        }

        if (hit || p.dist > SPELL_RANGE) {
            explodeAt(pos.x, pos.y, pos.z, p.classColor);
            if (p.visualType) {
                const impactStyle = p.visualType === "shuriken" || p.visualType === "bladewave" ? "blades"
                    : p.visualType === "axe" ? "quake"
                    : p.visualType === "fireball" ? "fire" : "shock";
                spawnClassBurst(pos.x, pos.z, p.splash || 1.8, p.classColor || p.color, impactStyle);
            }
            removeProjectile(i);
        }
    }
}

function fireSpell() {
    if (playerDead) return;
    const dx = Math.sin(myPos.rotY), dz = Math.cos(myPos.rotY);
    spawnProjectile(myPos.x + dx * 0.9, myPos.y + 1.3, myPos.z + dz * 0.9, dx, dz, true);
    sndSpellFire();
}

function useSpell() {
    if (!characterLoaded || playerDead || !skillLearned(4) || nowSec() < rollUntil) return;
    const cfg = SKILLS[4];
    const now = nowSec();
    if (now < cfg.readyAt) return;
    if (myMP < cfg.mp) { addChat("Mană insuficientă!", "#e74c3c"); return; }

    myMP -= cfg.mp;
    cfg.readyAt = now + cfg.cd;
    autoFaceNearest(22);

    if (spellAction) playOneShot(spellAction, SPELL_ANIM_SPEED);
    sndSpellCast();
    spawnRuneCircle(myPos.x, myPos.y, myPos.z, "#c060ff", 1, 2.5, 0.9, 2.5);
    castText(4);
    attackStart = now;
    attackUntil = spellAction ? now + spellAction.getClip().duration / SPELL_ANIM_SPEED : now + 0.7;
    attackProcedural = !spellAction;
    attackType = 4;

    if (socket && socket.connected) socket.emit("playerAttack", { skill: 4 });
    setTimeout(fireSpell, SPELL_DATA.hit / SPELL_ANIM_SPEED * 1000);
}

function doRoll() {
    if (!characterLoaded || playerDead) return;
    const now = nowSec();
    if (now < rollUntil || now < ROLL.readyAt) return;

    // direcția apăsată; dacă nu apeși nimic, în față
    const fX = -Math.sin(cameraAngle), fZ = -Math.cos(cameraAngle);
    const rX = Math.cos(cameraAngle), rZ = -Math.sin(cameraAngle);
    let dx = 0, dz = 0;
    if (keys["KeyW"] || keys["w"] || keys["ArrowUp"]) { dx += fX; dz += fZ; }
    if (keys["KeyS"] || keys["s"] || keys["ArrowDown"]) { dx -= fX; dz -= fZ; }
    if (keys["KeyA"] || keys["a"] || keys["ArrowLeft"]) { dx -= rX; dz -= rZ; }
    if (keys["KeyD"] || keys["d"] || keys["ArrowRight"]) { dx += rX; dz += rZ; }
    let len = Math.hypot(dx, dz);
    if (len < 0.001) { dx = Math.sin(myPos.rotY); dz = Math.cos(myPos.rotY); len = 1; }
    rollDX = dx / len;
    rollDZ = dz / len;
    myPos.rotY = Math.atan2(rollDX, rollDZ);

    ROLL.readyAt = now + ROLL.cd;
    attackUntil = 0;
    hitUntil = 0;
    if (rollAction) playOneShot(rollAction, ROLL.animSpeed);
    else {
        attackStart = now;
        attackUntil = now + 0.55;
        attackProcedural = true;
        attackType = 2;
    }
    sndRoll();
    spawnDust(myPos.x, myPos.y, myPos.z, 8, 0.8);
    rollUntil = rollAction ? now + rollAction.getClip().duration / ROLL.animSpeed : now + 0.55;
}

/* ---------- daune primite / moarte / respawn ---------- */
function takeDamage(amount, attackerId) {
    if (playerDead || amount <= 0) return;
    if (nowSec() < classDodgeUntil) {
        sndDodge();
        spawnFloatingText("Eschivă!", getClassConfig().colors[2],
            new THREE.Vector3(myPos.x, myPos.y + PLAYER_HEIGHT + 0.4, myPos.z), false);
        return;
    }
    if (nowSec() < rollUntil) {
        sndDodge();
        spawnFloatingText("Esquivă!", "#7fdbff",
            new THREE.Vector3(myPos.x, myPos.y + PLAYER_HEIGHT + 0.4, myPos.z), false);
        return;
    }
    amount = Math.min(300, Math.round(amount));
    if (defense > 0) amount = Math.max(1, Math.round(amount * (1 - defense)));
    if (isDefending) {
        const reduction = nowSec() < classGuardUntil ? classGuardReduction : 0.7;
        amount = Math.max(1, Math.round(amount * (1 - reduction)));
        shieldFlash = 1;
    }
    myHP -= amount;
    lastHitTime = nowSec();
    sndHurt();
    if (hitAction && myHP > 0 && lastHitTime >= attackUntil && lastHitTime - lastHitAnim > 0.7) {
        lastHitAnim = lastHitTime;
        hitUntil = lastHitTime + hitAction.getClip().duration;
        playOneShot(hitAction, 1);
    }
    spawnFloatingText("-" + amount, "#ff4444",
        new THREE.Vector3(myPos.x, myPos.y + PLAYER_HEIGHT + 0.4, myPos.z), false);
    updateMyHpUI();
    if (myHP <= 0) killPlayer(attackerId);
}

function killPlayer(attackerId) {
    myHP = 0;
    updateMyHpUI();
    playerDead = true;
    deadTimer = 4;
    isDefending = false;
    attackUntil = 0;
    hitUntil = 0;
    jumping = false;
    jumpOffset = 0;
    if (deathAction) playOneShot(deathAction, 1);
    sndDeath();
    myPos.velocityX = 0;
    myPos.velocityZ = 0;
    addChat("☠️ Ai murit! Revii în 4 secunde.", "#e74c3c");
    document.getElementById("death-overlay").style.display = "flex";
    if (socket && socket.connected) {
        if (attackerId) socket.emit("playerDied", { killerId: attackerId });
        sendHp();
    }
}

function respawnPlayer() {
    myPos.x = 0; myPos.z = 0;
    myPos.velocityX = 0; myPos.velocityZ = 0;
    myPos.y = getGroundHeight(0, 0, 0);
    myHP = maxHP;
    myMP = maxMP;
    playerDead = false;
    lastHitTime = -100;
    updateMyHpUI();
    updateMyMpUI();
    document.getElementById("death-overlay").style.display = "none";
    addChat("Ai reînviat.", "#2ecc71");
    if (socket && socket.connected) {
        socket.emit("playerMovement", { x: 0, y: 0 });
        sendHp();
    }
}

/* ---------- jucători la distanță: viață ---------- */
function setRemoteHp(id, hp, max) {
    const rp = remotePlayers[id];
    if (!rp) return;
    if (max) rp.maxHp = max;
    const top = rp.maxHp || 1500;
    rp.hp = Math.max(0, Math.min(top, hp));
    if (rp.bar) rp.bar.draw(rp.hp / top);
    if (rp.mesh) rp.mesh.rotation.x = rp.hp <= 0 ? -1.4 : 0;
    if (rp.hp <= 0) rp.reviveAt = nowSec() + 4;
}

function removeRemotePlayer(id) {
    const rp = remotePlayers[id];
    if (!rp) return;
    if (rp.mesh) scene.remove(rp.mesh);
    delete remotePlayers[id];
    updateOnlineCount();
}

/* ---------- monștri ---------- */
function createMonsterMesh(tint, scale, boss) {
    const root = new THREE.Group();
    const model = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.65, metalness: 0.15, emissive: boss ? 0x551100 : 0x220000 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a0d0d, roughness: 0.8 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: boss ? 0xff3300 : 0xffee33 });

    function add(geo, mat, x, y, z, rx, ry, rz) {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        m.rotation.set(rx || 0, ry || 0, rz || 0);
        m.castShadow = true;
        model.add(m);
        return m;
    }

    const body = add(new THREE.SphereGeometry(0.75, 14, 12), bodyMat, 0, 1.0, 0);
    body.scale.set(1, 1.15, 0.9);
    add(new THREE.SphereGeometry(0.42, 12, 10), bodyMat, 0, 1.95, 0.1);
    add(new THREE.ConeGeometry(0.12, boss ? 0.9 : 0.55, 8), darkMat, -0.26, 2.4, 0.05, 0, 0, 0.35);
    add(new THREE.ConeGeometry(0.12, boss ? 0.9 : 0.55, 8), darkMat, 0.26, 2.4, 0.05, 0, 0, -0.35);
    add(new THREE.SphereGeometry(0.07, 8, 8), eyeMat, -0.16, 2.0, 0.46);
    add(new THREE.SphereGeometry(0.07, 8, 8), eyeMat, 0.16, 2.0, 0.46);
    add(new THREE.CylinderGeometry(0.13, 0.1, 0.95, 8), bodyMat, -0.88, 1.1, 0.15, 0.4, 0, 0.5);
    add(new THREE.CylinderGeometry(0.13, 0.1, 0.95, 8), bodyMat, 0.88, 1.1, 0.15, 0.4, 0, -0.5);
    add(new THREE.CylinderGeometry(0.17, 0.14, 0.7, 8), darkMat, -0.32, 0.35, 0);
    add(new THREE.CylinderGeometry(0.17, 0.14, 0.7, 8), darkMat, 0.32, 0.35, 0);

    model.scale.setScalar(0.85 * (scale || 1));
    root.add(model);
    return { root: root, model: model, bodyMat: bodyMat };
}

function pickSpawnPoint() {
    const baseY = getGroundHeight(0, 0, 0);
    for (let i = 0; i < 40; i++) {
        const ang = Math.random() * Math.PI * 2;
        const rad = 14 + Math.random() * (MAP_TARGET_SIZE * 0.32);
        const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
        const y = getGroundHeight(x, z, NaN);
        if (Number.isFinite(y) && Math.abs(y - baseY) < 10) return { x: x, y: y, z: z };
    }
    return null;
}

function damageMonster(m, dmg, crit, kind) {
    if (!m.alive || !socket || !socket.connected) return;
    m.flash = 0.15;
    sndHit(crit, 0);
    spawnFloatingText((crit ? "CRIT " : "") + dmg, crit ? "#ffdd33" : "#ffffff",
        new THREE.Vector3(m.x, m.y + 3.0 * m.scale, m.z), crit);
    m.hp = Math.max(1, m.hp - dmg);   // doar vizual; serverul hotărăște moartea
    m.shownHp = m.hp;
    m.bar.draw(m.hp / m.maxHp);
    socket.emit("hitMonster", { id: m.id, damage: dmg, crit: !!crit, kind: kind || "melee" });
}

function updateMonsters(delta, now) {
    for (const m of monsters) {
        if (!m.alive) {
            if (m.deathT < 1.4) {
                m.deathT += delta;
                m.model.rotation.x = -Math.min(1.45, m.deathT * 3);
                if (m.deathT >= 1.4) m.root.visible = false;
            }
            continue;
        }

        const k = Math.min(1, 12 * delta);
        m.x += (m.tx - m.x) * k;
        m.z += (m.tz - m.z) * k;
        const moving = Math.hypot(m.tx - m.x, m.tz - m.z) > 0.08;
        const dist = Math.hypot(myPos.x - m.x, myPos.z - m.z);
        m.bar.sprite.visible = dist < (m.boss ? 90 : 45);

        // înălțimea terenului (interogare rară)
        m.groundTimer -= delta;
        if ((moving || m.needGround) && m.groundTimer <= 0 && mapLoaded) {
            m.groundTimer = 0.12;
            m.gy = getGroundHeight(m.x, m.z, m.y);
            if (m.needGround) { m.y = m.gy; m.needGround = false; }
        }
        m.y += (m.gy - m.y) * Math.min(1, 12 * delta);

        // orientare lină
        let diff = m.face - m.root.rotation.y;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        m.root.rotation.y += diff * Math.min(1, 10 * delta);

        // animația de atac pornește când serverul numără o lovitură nouă
        if (m.attackCount !== m.attackSeen) {
            m.attackSeen = m.attackCount;
            m.attackT = 0.0001;
            sndMonsterAttack(dist, m.boss);
        }
        if (m.attackT > 0) {
            m.attackT += delta / 0.5;
            if (m.attackT >= 1) m.attackT = 0;
        }

        m.model.position.y = moving ? Math.abs(Math.sin(now * 9 + m.phase)) * 0.12 : 0;
        m.model.position.z = m.attackT > 0 ? Math.sin(Math.min(1, m.attackT) * Math.PI) * 0.6 * m.scale : 0;

        m.flash -= delta;
        m.bodyMat.emissive.setHex(m.flash > 0 ? 0xff5522 : (m.boss ? 0x551100 : 0x220000));

        m.root.position.set(m.x, m.y, m.z);
    }
}

/* ---------- actualizare generală de combat (apelată din update) ---------- */
function updateCombat(delta, now) {
    if (!playerDead) {
        myMP = Math.min(maxMP, myMP + (12 + playerLevel * 0.5) * delta);
        if (now - lastHitTime > 5 && myHP < maxHP) myHP = Math.min(maxHP, myHP + (20 + playerLevel) * delta);
    } else {
        deadTimer -= delta;
        document.getElementById("death-text").textContent = "Revii în " + Math.max(0, Math.ceil(deadTimer)) + " secunde...";
        if (deadTimer <= 0) respawnPlayer();
    }

    hudTimer += delta;
    if (hudTimer > 0.15) {
        hudTimer = 0;
        updateMyHpUI();
        updateMyMpUI();
        const cd = function(id, ready, total) {
            const el = document.getElementById(id);
            if (el) el.style.height = Math.min(100, Math.max(0, (ready - now) / total) * 100) + "%";
        };
        cd("cd1", SKILLS[1].readyAt, SKILLS[1].cd);
        cd("cd2", SKILLS[2].readyAt, SKILLS[2].cd);
        cd("cd3", selectedCharacterName === "Dark Knight" ? DEFENSE.readyAt : SKILLS[3].readyAt,
            selectedCharacterName === "Dark Knight" ? DEFENSE.cd : SKILLS[3].cd);
        cd("cd4", SKILLS[4].readyAt, SKILLS[4].cd);
        cd("cd5", SKILLS[5].readyAt, SKILLS[5].cd);
        cd("cd6", SKILLS[6].readyAt, SKILLS[6].cd);
        cd("cd7", SKILLS[7].readyAt, SKILLS[7].cd);
        cd("cdroll", ROLL.readyAt, ROLL.cd);
        const bi = document.getElementById("buff-indicator");
        if (bi) bi.textContent = now < buffUntil ? "📣 Strigăt de Luptă: +" + pct(buffAmount) + "% daune (" + Math.ceil(buffUntil - now) + "s)" : "";

        // bara boss-ului
        const boss = monsterById["boss"];
        const bossBar = document.getElementById("boss-bar");
        musicMode = (boss && boss.alive && Math.hypot(boss.x - myPos.x, boss.z - myPos.z) < 70) ? "boss" : "calm";
        if (boss && boss.alive && Math.hypot(boss.x - myPos.x, boss.z - myPos.z) < 80) {
            bossBar.style.display = "block";
            document.getElementById("boss-fill").style.width = Math.max(0, boss.hp / boss.maxHp * 100) + "%";
            document.getElementById("boss-text").textContent = Math.max(0, Math.round(boss.hp)) + " / " + boss.maxHp;
        } else {
            bossBar.style.display = "none";
        }
    }

    hpSendTimer += delta;
    if (hpSendTimer > 0.5) {
        hpSendTimer = 0;
        if (socket && socket.connected && Math.round(myHP) !== lastHpSent) sendHp();
    }

    updateShieldFx(delta, now);
    updateWarAura(delta, now);
    if (now < rollUntil) {
        rollDustTimer -= delta;
        if (rollDustTimer <= 0) { rollDustTimer = 0.07; spawnDust(myPos.x, myPos.y, myPos.z, 2, 0.5); }
    }

    updateMonsters(delta, now);
    updateEffects(delta);
    updateProjectiles(delta);
    updateParticles(delta);
    updateBolts(delta);
    updateFx(delta);
    updateTelegraphs(delta);
    updateLoot(delta, now);
    updateFloatingTexts(delta);
    updateTarget(delta);
    updateMinimap(delta);
}

