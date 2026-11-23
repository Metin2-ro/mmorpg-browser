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

if (failed) process.exit(1);
console.log("Verificările statice au trecut.");
