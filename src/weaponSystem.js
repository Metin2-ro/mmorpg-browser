"use strict";

// Modul de atașare a armelor GLB la oasele mâinilor personajului.
// Folosește Three.js și starea globală definită în game.js.

const CLASS_WEAPON_CONFIG = {
    "Dark Knight": [{ file: "03_Jawbone_Sword.glb", hand: "RightHand", length: 0.8, grip: [0.30, -0.21, 0], rotation: [0, 0, 0] }],
    "Ninja": [
        { file: "02_Tusk_Dagger.glb", hand: "RightHand", length: 0.48, grip: [0.25, -0.12, 0], rotation: [0, 0, 0] },
        { file: "02_Tusk_Dagger.glb", hand: "LeftHand", length: 0.48, grip: [0.25, -0.12, 0], rotation: [0, 0, Math.PI] }
    ],
    "Samurai": [{ file: "16_Sawtooth_Blade.glb", hand: "RightHand", length: 0.8, grip: [0.34, -0.28, 0], rotation: [0, 0, 3 * Math.PI / 2] }],
    "Viking": [{ file: "01_Skull-Splitter_Axe.glb", hand: "RightHand", length: 0.82, grip: [-0.31, -0.33, 0], rotation: [0, 0, 0] }],
    "Wizard": [{ file: "15_Shaman_s_Skull_Totem.glb", hand: "RightHand", length: 0.78, grip: [0.29, -0.33, 0.41], rotation: [0, 0, Math.PI / 2] }]
};
const CLASS_WEAPON_ASSET_PROMISES = {};

function findHandBone(model, side) {
    let hand = null;
    const normalizedSide = String(side || "").toLowerCase().replace(/hand$/, "");
    const pattern = new RegExp("^" + normalizedSide + "hand\\d*$");
    model.traverse(function(node) {
        if (!node.isBone) return;
        const name = String(node.name || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
        if (pattern.test(name)) hand = node;
    });
    return hand;
}

function getPalmGripAnchor(hand, model) {
    if (!hand) return new THREE.Vector3();

    const palmCenterWorld = new THREE.Vector3();
    let totalInfluence = 0;
    if (model) {
        model.updateWorldMatrix(true, true);
        model.traverse(function(mesh) {
            if (!mesh.isSkinnedMesh || !mesh.geometry || !mesh.skeleton) return;
            const boneIndex = mesh.skeleton.bones.indexOf(hand);
            const position = mesh.geometry.attributes.position;
            const indices = mesh.geometry.attributes.skinIndex;
            const weights = mesh.geometry.attributes.skinWeight;
            if (boneIndex < 0 || !position || !indices || !weights) return;

            for (let i = 0; i < position.count; i++) {
                let handWeight = 0;
                let maxWeight = 0;
                for (let channel = 0; channel < 4; channel++) {
                    const index = channel === 0 ? indices.getX(i) : channel === 1 ? indices.getY(i) : channel === 2 ? indices.getZ(i) : indices.getW(i);
                    const weight = channel === 0 ? weights.getX(i) : channel === 1 ? weights.getY(i) : channel === 2 ? weights.getZ(i) : weights.getW(i);
                    if (weight > maxWeight) maxWeight = weight;
                    if (index === boneIndex) handWeight += weight;
                }
                if (handWeight < 0.25 || handWeight + 1e-5 < maxWeight) continue;

                const vertex = new THREE.Vector3().fromBufferAttribute(position, i);
                mesh.boneTransform(i, vertex);
                mesh.localToWorld(vertex);
                palmCenterWorld.addScaledVector(vertex, handWeight);
                totalInfluence += handWeight;
            }
        });
    }

    hand.updateWorldMatrix(true, false);
    if (totalInfluence > 0) {
        palmCenterWorld.multiplyScalar(1 / totalInfluence);
        return hand.worldToLocal(palmCenterWorld);
    }

    const fingerBones = hand.children.filter(function(node) {
        return node.isBone && /(Index|Middle|Ring|Pinky)1$/i.test(node.name || "");
    });
    if (!fingerBones.length) return new THREE.Vector3();
    const fallback = new THREE.Vector3();
    fingerBones.forEach(function(node) { fallback.add(node.position); });
    return fallback.multiplyScalar(0.45 / fingerBones.length);
}

function syncEquippedWeaponVisual() {
    if (!characterModel) return;
    if (!equipped || !equipped.weapon) {
        const attached = characterModel.userData.classWeaponObjects || [];
        attached.forEach(function(weapon) {
            if (weapon.parent) weapon.parent.remove(weapon);
        });
        characterModel.userData.classWeaponObjects = [];
        characterModel.userData.classWeaponAttached = false;
        return;
    }
    attachClassWeapon(characterModel, selectedCharacterName);
}

function attachClassWeapon(model, className) {
    const configs = CLASS_WEAPON_CONFIG[className];
    if (!model || !configs || !equipped || !equipped.weapon || model.userData.classWeaponPending || model.userData.classWeaponAttached) return;

    const attachments = configs.map(function(config) {
        return { config: config, hand: findHandBone(model, config.hand) };
    }).filter(function(item) { return !!item.hand; });
    if (!attachments.length) {
        console.warn("Nu s-a găsit osul mâinii pentru arma clasei", className);
        return;
    }

    model.userData.classWeaponObjects = model.userData.classWeaponObjects || [];
    model.userData.classWeaponPending = true;
    const loads = attachments.map(function(item) {
        const config = item.config;
        if (!CLASS_WEAPON_ASSET_PROMISES[config.file]) {
            CLASS_WEAPON_ASSET_PROMISES[config.file] = new Promise(function(resolve, reject) {
                new THREE.GLTFLoader().load("./characters/arme/" + config.file, function(gltf) {
                    resolve(gltf.scene);
                }, undefined, reject);
            }).catch(function(err) {
                delete CLASS_WEAPON_ASSET_PROMISES[config.file];
                throw err;
            });
        }
        return CLASS_WEAPON_ASSET_PROMISES[config.file].then(function(asset) {
            const hand = item.hand;
            if (!equipped.weapon || !model.parent || !hand.parent) return;

            asset.updateMatrixWorld(true);
            const assetBox = new THREE.Box3().setFromObject(asset);
            const assetSize = assetBox.getSize(new THREE.Vector3());
            const assetLength = Math.max(assetSize.x, assetSize.y, assetSize.z);
            hand.updateWorldMatrix(true, false);
            const handScale = hand.getWorldScale(new THREE.Vector3());
            if (!(assetLength > 0) || !(handScale.x > 0)) {
                throw new Error("Mărimea modelului sau a osului mâinii nu este validă.");
            }

            const weapon = asset.clone(true);
            weapon.name = "weapon_" + config.file;
            weapon.scale.setScalar(config.length / (assetLength * handScale.x));
            weapon.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
            const gripPoint = new THREE.Vector3(config.grip[0], config.grip[1], config.grip[2]);
            gripPoint.applyEuler(weapon.rotation).multiplyScalar(weapon.scale.x);
            weapon.position.copy(getPalmGripAnchor(hand, model)).sub(gripPoint);
            weapon.traverse(function(node) {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                    node.frustumCulled = false;
                }
            });
            hand.add(weapon);
            model.userData.classWeaponObjects.push(weapon);
        });
    });

    Promise.all(loads).then(function() {
        model.updateMatrixWorld(true);
        model.userData.classWeaponAttached = model.userData.classWeaponObjects.some(function(weapon) { return !!weapon.parent; });
        model.userData.classWeaponPending = false;
    }).catch(function(err) {
        model.userData.classWeaponPending = false;
        console.warn("Arma GLB nu s-a putut atașa pentru clasa " + className + ":", err);
    });
}

