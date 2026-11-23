# Structura clientului

## Migrare în curs

- `game.js` păstrează temporar logica originală într-un script clasic, pentru a nu rupe funcțiile globale folosite de interfață.
- `main.js` va deveni punctul de intrare după ce inițializarea Three.js și dependențele globale sunt mutate în siguranță.
- `weaponSystem.js`, `combat.js`, `ui.js` și `network.js` vor fi extrase incremental din codul existent, păstrând aceleași evenimente Socket.io și aceleași ID-uri HTML.

## Reguli pentru migrare

1. Nu se elimină codul vechi până când echivalentul modular nu este verificat.
2. Se păstrează compatibilitatea cu Three.js r128 și Socket.io 4.x.
3. Serverul rămâne CommonJS (Node.js); modulele browserului vor fi ES modules doar după separarea completă a stării globale.
4. Fiecare etapă trebuie verificată în browser: încărcarea hărții, selecția personajului, HUD, mișcare, atacuri, inventar, chat și multiplayer.
