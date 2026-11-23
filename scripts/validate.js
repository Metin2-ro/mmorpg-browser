"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const jsFiles = [
    "server.js",
    "src/network.js",
    "src/combat.js",
    "src/weaponSystem.js",
    "src/ui.js",
    "src/game.js",
    "src/main.js"
];

let failed = false;

// Regression test: UAL spine segment suffixes must remain distinct while
// Knight exporter IDs are removed from target bone names.
try {
    const gameSource = fs.readFileSync(path.join(root, "src/game.js"), "utf8");
    const match = gameSource.match(/function canonicalRigBoneName\(name\) \{[\s\S]*?\n\}/);
    if (!match) throw new Error("Funcția canonicalRigBoneName nu a fost găsită.");
    const canonicalRigBoneName = vm.runInNewContext("(" + match[0] + ")");
    const cases = [
        ["spine_01", "spine02"],
        ["spine_02", "spine01"],
        ["spine_03", "spine"],
        ["Spine01_13", "spine01"],
        ["Spine02_14", "spine02"],
        ["Spine_12", "spine"]
    ];
    for (const [input, expected] of cases) {
        const actual = canonicalRigBoneName(input);
        if (actual !== expected) throw new Error(input + " -> " + actual + " (așteptat " + expected + ")");
    }
    console.log("OK mapare oase spine UAL/Knight:", cases.length, "cazuri");
} catch (error) {
    failed = true;
    console.error("EROARE mapare oase:", error.message);
}

for (const file of jsFiles) {
    const fullPath = path.join(root, file);
    try {
        const source = fs.readFileSync(fullPath, "utf8");
        new vm.Script(source, { filename: file });
        console.log("OK JavaScript:", file);
    } catch (error) {
        failed = true;
        console.error("EROARE JavaScript:", file, error.message);
    }
}

try {
    const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
    const refs = [];
    for (const match of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi)) {
        const ref = match[1];
        if (/^(?:https?:)?\/\//i.test(ref) || ref.startsWith("#") || ref.startsWith("/socket.io/")) continue;
        if (ref.startsWith("/")) continue;
        refs.push(ref.split(/[?#]/)[0]);
    }
    for (const ref of refs) {
        if (!fs.existsSync(path.join(root, ref))) {
            failed = true;
            console.error("LIPSEȘTE RESURSA LOCALĂ:", ref);
        } else {
            console.log("OK resursă:", ref);
        }
    }
} catch (error) {
    failed = true;
    console.error("EROARE index.html:", error.message);
}


try {
    const catalogPath = path.join(root, "characters/arme/weapons.json");
    const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
    if (!catalog.classes || !Array.isArray(catalog.assets)) throw new Error("Structura catalogului este incompletă.");
    for (const asset of catalog.assets) {
        const file = path.join(root, catalog.basePath.replace(/^\.\//, ""), asset.file);
        if (!fs.existsSync(file)) {
            failed = true;
            console.error("LIPSEȘTE MODELUL DE ARMĂ:", asset.file);
        }
    }
    for (const [className, weapons] of Object.entries(catalog.classes)) {
        for (const weapon of weapons) {
            if (!catalog.assets.some((asset) => asset.file === weapon.file)) {
                failed = true;
                console.error("ARMA NU ESTE ÎN CATALOG:", className, weapon.file);
            }
        }
    }
    console.log("OK catalog arme:", catalog.assets.length, "modele");
} catch (error) {
    failed = true;
    console.error("EROARE catalog arme:", error.message);
}

try {
    JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    console.log("OK package.json");
} catch (error) {
    failed = true;
    console.error("EROARE package.json:", error.message);
}

if (failed) process.exit(1);
console.log("Verificările statice au trecut.");
