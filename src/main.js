"use strict";

// Main runtime: pornirea clientului Three.js, scena, bucla de randare și redimensionarea ferestrei.
// Se încarcă după game.js, astfel încât toate subsistemele și starea globală sunt deja definite.

function startGame() {
    setClassSkillKit();
    loadGame();
    const input = document.getElementById("hero-name");
    if (input && input.value.trim()) heroName = cleanHeroName(input.value);
    heroName = cleanHeroName(input && input.value.trim() ? input.value : selectedCharacterName);
    gameStarted = true;
    recalcStats(true);
    updateNameUI();
    updateXpUI();
    updateInvUI();
    updateKillUI();
    saveNow();

    document.getElementById("char-select-screen").style.display = "none";
    document.getElementById("player-hud").style.display = "flex";
    document.getElementById("quest-panel").style.display = "block";
    document.getElementById("inv-panel").style.display = "flex";
    document.getElementById("chat-container").style.display = "flex";
    document.getElementById("action-bar").style.display = "flex";
    document.getElementById("toolbar").style.display = "flex";
    document.getElementById("minimap-wrap").style.display = "block";
    sndInit();
    updateAudioButtons();
    buildActionBar();
    updateInvUI();
    startLoading();
    initGame();
}

function initGame() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d0908);
    scene.fog = new THREE.FogExp2(0x0d0908, 0.008);

    camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2000);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;

    document.getElementById("game-container").appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 1.8));

    const dirLight = new THREE.DirectionalLight(0xffd2a6, 2.5);
    dirLight.position.set(20, 50, 20);
    dirLight.castShadow = true;
    scene.add(dirLight);

    playerPointLight = new THREE.PointLight(0xffaa44, 2.5, 40);
    scene.add(playerPointLight);

    loadCharacter();
    loadMap();
    setupControls();
    setupSocket();
    setupCamera();
    setupChat();

    animateGame();
}

// Măsoară înălțimea reală a modelului (după oase dacă are schelet) și cota tălpilor

function update() {
    const delta = Math.min(clock.getDelta(), 0.05);
    const now = performance.now() / 1000;
    if (mixer) mixer.update(delta);

    for (const id in remotePlayers) {
        const rp = remotePlayers[id];
        if (rp.mixer) rp.mixer.update(delta);
        if (rp.mesh) {
            if (rp.rx === undefined) { rp.rx = rp.x; rp.rz = rp.z; }
            const px = rp.rx, pz = rp.rz;
            const k = Math.min(1, 12 * delta);
            rp.rx += (rp.x - rp.rx) * k;
            rp.rz += (rp.z - rp.rz) * k;
            if (Math.hypot(rp.rx - px, rp.rz - pz) > 0.002) rp.faceY = Math.atan2(rp.rx - px, rp.rz - pz);
            if (rp.faceY !== undefined) {
                let d = rp.faceY - rp.mesh.rotation.y;
                while (d < -Math.PI) d += Math.PI * 2;
                while (d > Math.PI) d -= Math.PI * 2;
                rp.mesh.rotation.y += d * Math.min(1, 10 * delta);
            }
            rp.mesh.position.set(rp.rx, getGroundHeight(rp.rx, rp.rz, rp.mesh.position.y), rp.rz);
        }
        if (rp.hp <= 0 && rp.reviveAt && now > rp.reviveAt) setRemoteHp(id, rp.maxHp || 1500);
    }

    if (!camera) return;

    updateCombat(delta, now);

    const forward = (keys["KeyW"] || keys["w"] || keys["ArrowUp"]) ? 1 : 0;
    const backward = (keys["KeyS"] || keys["s"] || keys["ArrowDown"]) ? 1 : 0;
    const left = (keys["KeyA"] || keys["a"] || keys["ArrowLeft"]) ? 1 : 0;
    const right = (keys["KeyD"] || keys["d"] || keys["ArrowRight"]) ? 1 : 0;

    const running = !!(keys["ShiftLeft"] || keys["ShiftRight"] || keys["shift"]);
    const speed = (running ? myPos.runSpeed : myPos.walkSpeed) * (now < attackUntil ? 0.4 : 1) * moveMult;

    const forwardX = -Math.sin(cameraAngle);
    const forwardZ = -Math.cos(cameraAngle);
    const rightX = Math.cos(cameraAngle);
    const rightZ = -Math.sin(cameraAngle);

    let inputX = 0, inputZ = 0;
    if (forward) { inputX += forwardX; inputZ += forwardZ; }
    if (backward) { inputX -= forwardX; inputZ -= forwardZ; }
    if (left) { inputX -= rightX; inputZ -= rightZ; }
    if (right) { inputX += rightX; inputZ += rightZ; }

    const length = playerDead ? 0 : Math.hypot(inputX, inputZ);
    let targetVX = 0, targetVZ = 0;
    if (length > 0) {
        targetVX = inputX / length * speed;
        targetVZ = inputZ / length * speed;
    }

    const frameScale = delta * 60;
    myPos.velocityX += (targetVX - myPos.velocityX) * Math.min(1, 0.5 * frameScale);
    myPos.velocityZ += (targetVZ - myPos.velocityZ) * Math.min(1, 0.5 * frameScale);
    if (now < rollUntil) {
        myPos.velocityX = rollDX * ROLL.speed;
        myPos.velocityZ = rollDZ * ROLL.speed;
    }
    myPos.x += myPos.velocityX * frameScale;
    myPos.z += myPos.velocityZ * frameScale;

    const groundY = getGroundHeight(myPos.x, myPos.z, myPos.y);
    myPos.y += (groundY - myPos.y) * Math.min(1, 0.4 * frameScale);

    if (jumping) {
        jumpVel -= GRAVITY * delta;
        jumpOffset += jumpVel * delta;
        if (jumpOffset <= 0) { jumpOffset = 0; jumpVel = 0; jumping = false; sndLand(); spawnDust(myPos.x, myPos.y, myPos.z, 7, 0.8); }
    }

    const moving = Math.hypot(myPos.velocityX, myPos.velocityZ) > 0.005;
    if (moving) {
        fadeToAction(running ? runAction : walkAction, 0.15);
        let targetRotation = Math.atan2(myPos.velocityX, myPos.velocityZ);
        let diff = targetRotation - myPos.rotY;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        myPos.rotY += diff * Math.min(1, 0.3 * frameScale);

        if (socket && socket.connected) {
            socket.emit("playerMovement", { x: myPos.x * 20, y: myPos.z * 20 });
        }
    } else if (idleAction) {
        fadeToAction(idleAction, 0.15);
    } else {
        fadeToRestPose(0.15);
    }

    if (localPlayerMesh) {
        localPlayerMesh.position.set(myPos.x, myPos.y + jumpOffset, myPos.z);
        let lean = 0, spin = 0, lunge = 0, hop = 0;
        if (playerDead) {
            lean = deathAction ? 0 : -1.4;
        } else if ((attackProcedural || attackType === 2) && now < attackUntil) {
            const t = Math.min(1, (now - attackStart) / (attackUntil - attackStart));
            if (attackType === 2) {
                // învârtire completă cu săritură
                spin = t * t * (3 - 2 * t) * Math.PI * 2;
                hop = Math.sin(t * Math.PI) * 0.5;
                lean = Math.sin(t * Math.PI) * 0.15;
            } else if (t < 0.3) {
                // pregătire: se trage înapoi și se răsucește
                const p = t / 0.3;
                spin = -0.9 * (1 - (1 - p) * (1 - p));
                lean = -0.25 * p;
            } else if (t < 0.6) {
                // lovitura: tăietură rapidă înainte
                const p = (t - 0.3) / 0.3;
                spin = -0.9 + 1.9 * p * p;
                lean = -0.25 + 0.7 * p;
                lunge = 0.9 * p;
            } else {
                // revenire
                const p = (t - 0.6) / 0.4;
                spin = 1.0 * (1 - p);
                lean = 0.45 * (1 - p);
                lunge = 0.9 * (1 - p);
            }
        }
        localPlayerMesh.rotation.x += (lean - localPlayerMesh.rotation.x) * Math.min(1, 25 * delta);
        localPlayerMesh.rotation.y = myPos.rotY + spin;
        if (lunge || hop) {
            localPlayerMesh.position.x += Math.sin(myPos.rotY) * lunge;
            localPlayerMesh.position.z += Math.cos(myPos.rotY) * lunge;
            localPlayerMesh.position.y += hop;
        }

        if (playerPointLight) {
            playerPointLight.position.set(myPos.x, myPos.y + 2, myPos.z);
        }

        const targetY = myPos.y + CAMERA_TARGET_OFFSET + jumpOffset * 0.5;
        const camHeight = cameraDistance * Math.sin(cameraPitch);
        const camRadius = cameraDistance * Math.cos(cameraPitch);

        camera.position.set(
            myPos.x + Math.sin(cameraAngle) * camRadius,
            targetY + camHeight,
            myPos.z + Math.cos(cameraAngle) * camRadius
        );
        camera.lookAt(myPos.x, targetY, myPos.z);

        if (shakeT > 0) {
            shakeT = Math.max(0, shakeT - delta);
            const sh = shakeT * 0.7;
            camera.position.x += (Math.random() - 0.5) * sh;
            camera.position.y += (Math.random() - 0.5) * sh;
            camera.position.z += (Math.random() - 0.5) * sh;
        }
    }
}

function animateGame() {
    requestAnimationFrame(animateGame);
    update();
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

window.addEventListener("resize", function() {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

