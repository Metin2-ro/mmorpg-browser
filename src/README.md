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


## Modul extras: multiplayer

- `network.js` gestionează conectarea Socket.io și evenimentele multiplayer: join, jucători, mișcare, PvP, stare lume, monștri, loot, mesaje și leaderboard.
- Este încărcat ca script clasic înainte de `game.js`. Astfel, funcțiile sale pot folosi starea globală inițializată de `game.js` la momentul apelului, fără conversie prematură la ES modules.
- `game.js` păstrează în continuare starea și funcțiile de joc folosite de celelalte sisteme.


## Modul extras: arme

- `weaponSystem.js` conține configurațiile armelor pe clase, găsirea oaselor mâinilor, calculul punctului de prindere și atașarea modelelor GLB.
- Este încărcat înainte de `game.js` ca script clasic, pentru a păstra integrarea cu Three.js și starea globală existentă.
- Modelele trebuie să existe în `characters/arme/` cu numele exact configurat în `CLASS_WEAPON_CONFIG`; lipsa unui model va fi raportată în consolă și nu va bloca încărcarea jocului.


## Modul extras: combat

- `combat.js` conține logica de atac, combo-uri, abilități de luptă, daune, monștri, efecte, viața jucătorului și respawn.
- Este încărcat după `network.js` și înainte de `game.js`, ca script clasic, pentru a păstra compatibilitatea cu starea globală existentă.


## Modul extras: UI

- `ui.js` conține ferestrele de abilități, magazinul, inventarul, panoul personajului, cursorul și țintirea, clasamentul și minim harta.
- Se încarcă după `combat.js` și `weaponSystem.js`, înainte de `game.js`, astfel încât funcțiile UI să fie disponibile când clientul inițializează jocul.


## Modul extras: main

- `main.js` coordonează pornirea jocului: `startGame`, inițializarea scenei Three.js, bucla `update`/`animateGame` și redimensionarea ferestrei.
- Se încarcă ultimul, după modulele de rețea, combat, arme, UI și `game.js`, deoarece pornește subsistemele deja definite.
