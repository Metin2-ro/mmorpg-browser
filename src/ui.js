"use strict";

// Interfața utilizatorului: abilități, magazin, inventar, personaj, țintire, clasament și minimap.
// Script clasic pentru compatibilitate cu callback-urile HTML și starea globală.

/* ---------- fereastra de abilități ---------- */
function toggleSkills() { if (skillOpen) closeSkills(); else openSkills(); }

function openSkills() {
    if (!gameStarted) return;
    skillOpen = true;
    document.getElementById("skill-panel").style.display = "block";
    renderSkills();
    sndClick();
}

function closeSkills() {
    if (!skillOpen) return;
    skillOpen = false;
    document.getElementById("skill-panel").style.display = "none";
}

function renderSkills() {
    if (!skillOpen) return;
    document.getElementById("skill-points").textContent = skillPoints > 0 ? "✨ " + skillPoints + " puncte de abilitate" : "Fără puncte libere";
    let h = '<div class="skill-note">Pui puncte până la nivelul 17, apoi o promovezi la <b>M1</b> (Master). ' +
            'De la <b>M1 până la G1</b> (Grand Master) antrenarea costă <b>aur</b>, iar de la <b>G1 până la P</b> (Perfect) costă <b>cristale</b>. ' +
            'Primești 2 puncte la fiecare nivel și 1 punct pentru fiecare boss învins.</div>';
    for (let n = 1; n <= SKILL_COUNT; n++) {
        const d = SKILL_DEFS[n];
        const lv = skillLv[n] || 0;
        const info = skillUpgradeInfo(lv);
        let btn;
        if (info.type === "max") {
            btn = '<span class="shop-tag ok">✦ PERFECT</span>';
        } else if (info.type === "promote") {
            btn = '<button class="shop-btn" data-act="skill-up" data-id="' + n + '">Promovează la M1</button>';
        } else if (info.type === "point") {
            btn = '<button class="shop-btn" data-act="skill-up" data-id="' + n + '"' + (skillPoints < 1 ? " disabled" : "") + '>' +
                  (lv === 0 ? "Învață (1 punct)" : "+1 punct") + '</button>';
        } else if (info.type === "gold") {
            btn = '<button class="shop-btn" data-act="skill-up" data-id="' + n + '"' + (gold < info.cost ? " disabled" : "") + '>' +
                  skillRank(lv) + ' → ' + skillRank(lv + 1) + ' · ' + info.cost + ' 💰</button>';
        } else {
            btn = '<button class="shop-btn" data-act="skill-up" data-id="' + n + '"' + (crystals < info.cost ? " disabled" : "") + '>' +
                  skillRank(lv) + ' → ' + skillRank(lv + 1) + ' · ' + info.cost + ' 💎</button>';
        }
        const barColor = lv <= 17 ? "#cfcfcf" : (lv <= 27 ? "#4da6ff" : (lv <= 37 ? "#c77dff" : "#ff9a1f"));
        h += '<div class="sk-row"><div class="sk-ico">' + d.icon + '</div><div>' +
             '<div class="sk-name">' + n + '. ' + d.name + '<span class="rk ' + skillRankClass(lv) + '">' + (lv >= 1 ? skillRank(lv) + ' · putere ×' + skillPowerForLevel(lv).toFixed(2) : "neînvățată") + '</span></div>' +
             '<div class="sk-desc">' + d.desc + '</div>' +
             '<div class="sk-bar"><i style="width:' + (lv / SKILL_MAX_LV * 100) + '%;background:' + barColor + '"></i></div></div>' +
             '<div>' + btn + '</div></div>';
    }
    h += '<div style="margin-top:10px"><button class="shop-btn" data-act="reset-skills">Resetează abilitățile până la Nv.17 (' + (150 * playerLevel) + ' aur)</button></div>';
    document.getElementById("skill-body").innerHTML = h;
}

(function setupSkillEvents() {
    const panel = document.getElementById("skill-panel");
    if (!panel) return;
    panel.addEventListener("click", function(e) {
        e.stopPropagation();
        const b = e.target.closest("[data-act]");
        if (!b || b.disabled) return;
        const a = b.dataset.act;
        if (a === "close") closeSkills();
        else if (a === "skill-up") upgradeSkill(Number(b.dataset.id));
        else if (a === "reset-skills") resetSkills();
    });
})();

/* ====================== PANOURI: MAGAZIN, INVENTAR, PERSONAJ ====================== */
let shopOpen = false, lbOpen = false, invOpen = false, charOpen = false;
let shopTab = "weapon", lbTimer = null, invSel = -1;

const SHOP = {
    weapon: { label: "Arme", tiers: [
        { name: "Sabie de fier",    lvl: 1,  price: 150,   stats: { dmg: 0.12 } },
        { name: "Sabie de oțel",    lvl: 5,  price: 700,   stats: { dmg: 0.28 } },
        { name: "Sabie runică",     lvl: 10, price: 2500,  stats: { dmg: 0.50 } },
        { name: "Sabia Infernului", lvl: 20, price: 8000,  crystals: 3, stats: { dmg: 0.85 } }
    ] },
    armor: { label: "Armuri", tiers: [
        { name: "Armură de piele",   lvl: 1,  price: 120,  stats: { hp: 300 } },
        { name: "Zale de oțel",      lvl: 5,  price: 600,  stats: { hp: 800 } },
        { name: "Platoșă runică",    lvl: 10, price: 2200, stats: { hp: 1700 } },
        { name: "Armura Infernului", lvl: 20, price: 7000, crystals: 2, stats: { hp: 3200 } }
    ] },
    helmet: { label: "Căști", tiers: [
        { name: "Coif de piele",      lvl: 1,  price: 90,   stats: { hp: 150, mp: 30 } },
        { name: "Coif de oțel",       lvl: 5,  price: 450,  stats: { hp: 400, mp: 80 } },
        { name: "Coif runic",         lvl: 10, price: 1700, stats: { hp: 850, mp: 160 } },
        { name: "Coroana Infernului", lvl: 20, price: 5500, crystals: 2, stats: { hp: 1600, mp: 300 } }
    ] },
    shield: { label: "Scuturi", tiers: [
        { name: "Scut de lemn",     lvl: 1,  price: 110,  stats: { def: 0.04, hp: 100 } },
        { name: "Scut de fier",     lvl: 5,  price: 520,  stats: { def: 0.07, hp: 260 } },
        { name: "Scut runic",       lvl: 10, price: 1900, stats: { def: 0.11, hp: 520 } },
        { name: "Egida Infernului", lvl: 20, price: 6000, crystals: 2, stats: { def: 0.16, hp: 1000 } }
    ] },
    bracelet: { label: "Brățări", tiers: [
        { name: "Brățară de cupru",    lvl: 1,  price: 140,  stats: { crit: 0.01, hp: 80 } },
        { name: "Brățară de oțel",     lvl: 5,  price: 650,  stats: { crit: 0.02, hp: 200 } },
        { name: "Brățară runică",      lvl: 10, price: 2000, stats: { crit: 0.035, hp: 420 } },
        { name: "Brățara Infernului",  lvl: 20, price: 6500, crystals: 2, stats: { crit: 0.06, hp: 800 } }
    ] },
    necklace: { label: "Coliere", tiers: [
        { name: "Colier de bronz",  lvl: 1,  price: 300,   stats: { mp: 100, crit: 0.02 } },
        { name: "Colier de argint", lvl: 5,  price: 1200,  stats: { mp: 250, crit: 0.04 } },
        { name: "Colier de aur",    lvl: 12, price: 4000,  stats: { mp: 500, crit: 0.07 } },
        { name: "Inima Infernului", lvl: 20, price: 12000, crystals: 5, stats: { mp: 900, crit: 0.12 } }
    ] },
    earring: { label: "Cercei", tiers: [
        { name: "Cercei de bronz",    lvl: 1,  price: 130,  stats: { dmg: 0.02, mp: 50 } },
        { name: "Cercei de argint",   lvl: 5,  price: 600,  stats: { dmg: 0.04, mp: 130 } },
        { name: "Cercei de aur",      lvl: 10, price: 2100, stats: { dmg: 0.07, mp: 260 } },
        { name: "Cerceii Infernului", lvl: 20, price: 6800, crystals: 2, stats: { dmg: 0.11, mp: 480 } }
    ] },
    boots: { label: "Papuci", tiers: [
        { name: "Papuci de piele",     lvl: 1,  price: 90,   stats: { speed: 0.02, hp: 80 } },
        { name: "Papuci întăriți",     lvl: 5,  price: 420,  stats: { speed: 0.04, hp: 200 } },
        { name: "Papuci runici",       lvl: 10, price: 1500, stats: { speed: 0.06, hp: 400 } },
        { name: "Papucii Infernului",  lvl: 20, price: 5000, crystals: 2, stats: { speed: 0.09, hp: 800 } }
    ] }
};

function shopItem(slot, tierIdx) {
    const t = SHOP[slot].tiers[tierIdx];
    return sanitizeItem({ uid: newUid(), slot: slot, rarity: RARITY[tierIdx], name: t.name, lvl: t.lvl, ilvl: t.lvl, stats: t.stats });
}

function panelOpen() { return shopOpen || lbOpen || invOpen || charOpen || skillOpen; }

function closePanels() {
    closeShop();
    closeLeaderboard();
    closeInventory();
    closeCharacter();
    closeSkills();
    hideItemTip();
}

function toggleShop() { if (shopOpen) closeShop(); else openShop(); }
function toggleInventory() { if (invOpen) closeInventory(); else openInventory(); }
function toggleCharacter() { if (charOpen) closeCharacter(); else openCharacter(); }

function openShop() {
    if (!gameStarted || playerDead) return;
    closeLeaderboard();
    shopOpen = true;
    document.getElementById("shop-panel").style.display = "block";
    renderShop();
    sndClick();
}
function closeShop() {
    if (!shopOpen) return;
    shopOpen = false;
    document.getElementById("shop-panel").style.display = "none";
}

function openInventory() {
    if (!gameStarted) return;
    invOpen = true;
    document.getElementById("inv-window").style.display = "block";
    renderInventory();
    sndClick();
}
function closeInventory() {
    if (!invOpen) return;
    invOpen = false;
    invSel = -1;
    document.getElementById("inv-window").style.display = "none";
    hideItemTip();
}

function openCharacter() {
    if (!gameStarted) return;
    charOpen = true;
    document.getElementById("char-panel").style.display = "block";
    renderCharacter();
    sndClick();
}
function closeCharacter() {
    if (!charOpen) return;
    charOpen = false;
    document.getElementById("char-panel").style.display = "none";
}

/* ---------- magazin ---------- */
function renderShop() {
    const body = document.getElementById("shop-body");
    document.getElementById("shop-gold").textContent = "💰 " + gold + "    💎 " + crystals + "    🎒 " + freeSlots() + " locuri libere";
    document.querySelectorAll("#shop-tabs button").forEach(function(b) {
        b.classList.toggle("active", b.dataset.tab === shopTab);
    });

    let html = "";
    if (SHOP[shopTab]) {
        SHOP[shopTab].tiers.forEach(function(t, i) {
            const need = [];
            if (playerLevel < t.lvl) need.push("nivel " + t.lvl);
            if (gold < t.price) need.push("aur");
            if ((t.crystals || 0) > crystals) need.push("cristale");
            if (freeSlots() === 0) need.push("loc în inventar");
            const state = need.length
                ? '<button class="shop-btn" disabled>Necesită: ' + need.join(", ") + '</button>'
                : '<button class="shop-btn" data-act="buy" data-slot="' + shopTab + '" data-tier="' + i + '">Cumpără</button>';
            const price = t.price + " aur" + (t.crystals ? " + " + t.crystals + " 💎" : "");
            html += '<div class="shop-row"><div><b style="color:' + RARITY_INFO[RARITY[i]].color + '">' + t.name + '</b><small>' +
                    statLines(t.stats).join(", ") + ' · nivel ' + t.lvl + '</small></div><div class="shop-price">' + price + '</div><div>' + state + '</div></div>';
        });
        html += '<div class="shop-row"><div><small>Obiectele cumpărate ajung în inventar (I), de unde le echipezi.</small></div></div>';
    } else if (shopTab === "potions") {
        html += '<div class="shop-row"><div><b>🧪 Poțiune de viață</b><small>Vindecă 35% din viață · ai ' + hpPotions + '</small></div>' +
                '<div class="shop-price">' + POTION_PRICE + ' aur</div><div>' +
                '<button class="shop-btn" data-act="potion" data-kind="hp" data-n="1"' + (gold < POTION_PRICE ? " disabled" : "") + '>x1</button> ' +
                '<button class="shop-btn" data-act="potion" data-kind="hp" data-n="5"' + (gold < POTION_PRICE * 5 ? " disabled" : "") + '>x5</button></div></div>';
        html += '<div class="shop-row"><div><b>💧 Poțiune de mană</b><small>Dă înapoi 40% din mană · ai ' + mpPotions + '</small></div>' +
                '<div class="shop-price">' + POTION_PRICE + ' aur</div><div>' +
                '<button class="shop-btn" data-act="potion" data-kind="mp" data-n="1"' + (gold < POTION_PRICE ? " disabled" : "") + '>x1</button> ' +
                '<button class="shop-btn" data-act="potion" data-kind="mp" data-n="5"' + (gold < POTION_PRICE * 5 ? " disabled" : "") + '>x5</button></div></div>';
    } else {
        html += '<div class="shop-row"><div><b>💎 Cristal</b><small>Ai ' + crystals + ' · cristalele sunt necesare pentru echipamentul Infernului</small></div>' +
                '<div class="shop-price">' + CRYSTAL_SELL + ' aur</div><div>' +
                '<button class="shop-btn" data-act="sell"' + (crystals < 1 ? " disabled" : "") + '>Vinde 1</button></div></div>';
        html += '<div class="shop-row"><div><small>Echipamentul din inventar îl vinzi din fereastra Inventar (I), cu butonul „Vinde”.</small></div></div>';
    }
    body.innerHTML = html;
}

function buyShopItem(slot, tierIdx) {
    const def = SHOP[slot];
    const t = def && def.tiers[tierIdx];
    if (!t) return;
    if (playerLevel < t.lvl || gold < t.price || (t.crystals || 0) > crystals || freeSlots() === 0) { sndError(); return; }
    const item = shopItem(slot, tierIdx);
    gold -= t.price;
    crystals -= (t.crystals || 0);
    addToBag(item);
    updateInvUI();
    sndBuy();
    addChat("🛒 Ai cumpărat: " + item.name + ". Îl găsești în inventar (I).", RARITY_INFO[item.rarity].color);
    saveNow();
}

function buyPotion(kind, n) {
    const cost = POTION_PRICE * n;
    if (gold < cost) { sndError(); return; }
    gold -= cost;
    if (kind === "hp") hpPotions += n; else mpPotions += n;
    updateInvUI();
    sndBuy();
    saveNow();
}

function sellCrystal() {
    if (crystals < 1) { sndError(); return; }
    crystals--;
    gold += CRYSTAL_SELL;
    updateInvUI();
    sndCoin();
    saveNow();
}

function onShopClick(e) {
    e.stopPropagation();
    const tab = e.target.closest("[data-tab]");
    if (tab) { shopTab = tab.dataset.tab; sndClick(); renderShop(); return; }
    const b = e.target.closest("[data-act]");
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === "close") closeShop();
    else if (act === "buy") buyShopItem(b.dataset.slot, Math.floor(Number(b.dataset.tier)));
    else if (act === "potion") buyPotion(b.dataset.kind, Math.max(1, Math.min(5, Number(b.dataset.n) || 1)));
    else if (act === "sell") sellCrystal();
}

/* ---------- inventar ---------- */
function changeGear(fn) {
    const oldHP = maxHP, oldMP = maxMP;
    const oldWeapon = equipped.weapon;
    fn();
    if (oldWeapon !== equipped.weapon) syncEquippedWeaponVisual();
    recalcStats(false);
    myHP = Math.min(maxHP, myHP + Math.max(0, maxHP - oldHP));
    myMP = Math.min(maxMP, myMP + Math.max(0, maxMP - oldMP));
    updateMyHpUI();
    updateMyMpUI();
    sendHp();
    updateInvUI();
    saveNow();
}

function sndEquip() {
    sndTone(1800, 0.09, { type: "sine", vol: 0.1 });
    sndTone(2700, 0.12, { type: "sine", vol: 0.06, delay: 0.03 });
    sndNoise(0.06, { filter: "highpass", freq: 3000, vol: 0.05 });
}

function equipFromBag(idx) {
    const it = bag[idx];
    if (!it) return false;
    if (playerLevel < it.lvl) {
        addChat("Ai nevoie de nivel " + it.lvl + " pentru " + it.name + ".", "#e74c3c");
        sndError();
        return false;
    }
    changeGear(function() {
        bag[idx] = equipped[it.slot];     // ce purtai trece în rucsac, pe același loc
        equipped[it.slot] = it;
        invSel = -1;
    });
    sndEquip();
    return true;
}

function unequipSlot(slot, toIdx) {
    const it = equipped[slot];
    if (!it) return false;
    let idx = (toIdx !== undefined && !bag[toIdx]) ? toIdx : -1;
    if (idx < 0) {
        for (let i = 0; i < BAG_SIZE; i++) if (!bag[i]) { idx = i; break; }
    }
    if (idx < 0) {
        addChat("🎒 Inventarul este plin!", "#e74c3c");
        sndError();
        return false;
    }
    changeGear(function() {
        bag[idx] = it;
        equipped[slot] = null;
    });
    sndEquip();
    return true;
}

function sellFromBag(idx) {
    const it = bag[idx];
    if (!it) return;
    const p = sellPrice(it);
    gold += p;
    bag[idx] = null;
    invSel = -1;
    sndCoin();
    addChat("💰 Ai vândut " + it.name + " pentru " + p + " aur.", "#ffd34d");
    updateInvUI();
    saveNow();
}

function moveInBag(a, b) {
    if (a === b || a < 0 || b < 0 || a >= BAG_SIZE || b >= BAG_SIZE) return;
    const t = bag[a];
    bag[a] = bag[b];
    bag[b] = t;
    if (invSel === a) invSel = b; else if (invSel === b) invSel = a;
    sndClick();
    renderInventory();
    saveGame();
}

function handleDrop(src, dst) {
    if (!src || !dst) return;
    const sp = src.split(":"), dp = dst.split(":");
    if (sp[0] === "bag" && dp[0] === "bag") moveInBag(Number(sp[1]), Number(dp[1]));
    else if (sp[0] === "bag" && dp[0] === "eq") {
        const it = bag[Number(sp[1])];
        if (it && it.slot === dp[1]) equipFromBag(Number(sp[1])); else sndError();
    } else if (sp[0] === "eq" && dp[0] === "bag") {
        const j = Number(dp[1]);
        const cur = equipped[sp[1]];
        if (!cur) return;
        if (!bag[j]) unequipSlot(sp[1], j);
        else if (bag[j].slot === sp[1]) equipFromBag(j);
        else unequipSlot(sp[1]);
    }
}

function itemTipHtml(it) {
    const ri = RARITY_INFO[it.rarity];
    return '<b style="color:' + ri.color + '">' + escapeHtml(it.name) + '</b><br>' +
           '<span style="color:#a8957a">' + SLOT_INFO[it.slot].label + ' · ' + ri.label + '</span><br>' +
           statLines(it.stats).map(function(l) { return '<span style="color:#9fe39f">' + l + '</span>'; }).join("<br>") + '<br>' +
           '<span style="color:' + (playerLevel >= it.lvl ? "#ccc" : "#ff6b6b") + '">Nivel necesar: ' + it.lvl + '</span><br>' +
           '<span style="color:#ffd34d">Vânzare: ' + sellPrice(it) + ' aur</span>';
}

function showItemTip(it, x, y) {
    const tip = document.getElementById("item-tip");
    tip.innerHTML = itemTipHtml(it);
    tip.style.display = "block";
    tip.style.left = Math.min(window.innerWidth - 260, x + 16) + "px";
    tip.style.top = Math.min(window.innerHeight - 160, y + 12) + "px";
}

function hideItemTip() {
    const tip = document.getElementById("item-tip");
    if (tip) tip.style.display = "none";
}

function renderInventory() {
    if (!invOpen) return;
    let h = "";
    SLOTS.forEach(function(sl) {
        const it = equipped[sl];
        h += '<div class="equip-slot" data-eq="' + sl + '" data-drop="eq:' + sl + '"' +
             (it ? ' draggable="true" style="border-color:' + RARITY_INFO[it.rarity].color + '"' : '') + '>' +
             '<span class="ico">' + (it ? SLOT_INFO[sl].icon : '<span class="faded">' + SLOT_INFO[sl].icon + '</span>') + '</span>' +
             '<small>' + (it ? escapeHtml(it.name) : SLOT_INFO[sl].label) + '</small></div>';
    });
    document.getElementById("inv-equip").innerHTML = h;

    h = "";
    for (let i = 0; i < BAG_SIZE; i++) {
        const it = bag[i];
        h += '<div class="slot' + (i === invSel ? " sel" : "") + '" data-bag="' + i + '" data-drop="bag:' + i + '"' +
             (it ? ' draggable="true" style="border-color:' + RARITY_INFO[it.rarity].color + '"' : '') + '>' +
             (it ? SLOT_INFO[it.slot].icon : "") + '</div>';
    }
    document.getElementById("inv-bag").innerHTML = h;
    document.getElementById("inv-free").textContent = freeSlots() + " / " + BAG_SIZE + " locuri libere";

    document.getElementById("inv-cons").innerHTML =
        "💰 " + gold + " &nbsp; 🧪 ×" + hpPotions + ' <button data-act="use-hp"' + (hpPotions < 1 ? " disabled" : "") + '>Folosește</button>' +
        " &nbsp; 💧 ×" + mpPotions + ' <button data-act="use-mp"' + (mpPotions < 1 ? " disabled" : "") + '>Folosește</button>' +
        " &nbsp; 💎 ×" + crystals;

    const sel = invSel >= 0 ? bag[invSel] : null;
    document.getElementById("inv-actions").innerHTML = sel
        ? '<b style="color:' + RARITY_INFO[sel.rarity].color + '">' + escapeHtml(sel.name) + '</b> · ' + statLines(sel.stats).join(", ") +
          '<br><button data-act="equip">Echipează</button><button data-act="sell">Vinde (' + sellPrice(sel) + ' aur)</button>'
        : "Click pe un obiect pentru detalii · dublu-click sau click dreapta = echipează · trage obiectele ca să le muți.";
}

function itemAtEvent(e) {
    const b = e.target.closest("[data-bag]");
    if (b) return bag[Number(b.dataset.bag)];
    const q = e.target.closest("[data-eq]");
    if (q) return equipped[q.dataset.eq];
    return null;
}

(function setupInventoryEvents() {
    const win = document.getElementById("inv-window");
    if (!win) return;

    win.addEventListener("click", function(e) {
        e.stopPropagation();
        const act = e.target.closest("[data-act]");
        if (act && !act.disabled) {
            const a = act.dataset.act;
            if (a === "close") closeInventory();
            else if (a === "use-hp") usePotion("hp");
            else if (a === "use-mp") usePotion("mp");
            else if (a === "equip") equipFromBag(invSel);
            else if (a === "sell") sellFromBag(invSel);
            return;
        }
        const b = e.target.closest("[data-bag]");
        if (b) {
            const i = Number(b.dataset.bag);
            invSel = (bag[i] && invSel !== i) ? i : -1;
            sndClick();
            renderInventory();
            return;
        }
        const q = e.target.closest("[data-eq]");
        if (q && equipped[q.dataset.eq]) unequipSlot(q.dataset.eq);
    });

    win.addEventListener("dblclick", function(e) {
        const b = e.target.closest("[data-bag]");
        if (b) equipFromBag(Number(b.dataset.bag));
    });

    win.addEventListener("contextmenu", function(e) {
        e.preventDefault();
        const b = e.target.closest("[data-bag]");
        if (b) { equipFromBag(Number(b.dataset.bag)); return; }
        const q = e.target.closest("[data-eq]");
        if (q) unequipSlot(q.dataset.eq);
    });

    win.addEventListener("mousemove", function(e) {
        const it = itemAtEvent(e);
        if (it) showItemTip(it, e.clientX, e.clientY); else hideItemTip();
    });
    win.addEventListener("mouseleave", hideItemTip);

    win.addEventListener("dragstart", function(e) {
        const b = e.target.closest("[data-bag]"), q = e.target.closest("[data-eq]");
        const src = b ? "bag:" + b.dataset.bag : (q ? "eq:" + q.dataset.eq : null);
        if (!src || !e.dataTransfer) return;
        e.dataTransfer.setData("text/plain", src);
        e.dataTransfer.effectAllowed = "move";
        hideItemTip();
    });
    win.addEventListener("dragover", function(e) {
        if (e.target.closest("[data-drop]")) e.preventDefault();
    });
    win.addEventListener("drop", function(e) {
        const d = e.target.closest("[data-drop]");
        if (!d || !e.dataTransfer) return;
        e.preventDefault();
        handleDrop(e.dataTransfer.getData("text/plain"), d.dataset.drop);
    });
})();

/* ---------- puncte de caracter ---------- */
const STAT_INFO = [
    { key: "str", name: "Putere",       desc: "+1,5% daune pe punct" },
    { key: "vit", name: "Vitalitate",   desc: "+45 viață pe punct" },
    { key: "int", name: "Inteligență",  desc: "+25 mană și +1,5% daune la vrajă pe punct" },
    { key: "agi", name: "Agilitate",    desc: "+0,35% șansă critică și +0,25% viteză pe punct" }
];

function addStat(key, n) {
    n = Math.max(1, n || 1);
    if (!(key in stats) || statPoints < n) { sndError(); return; }
    changeGear(function() {
        stats[key] += n;
        statPoints -= n;
    });
    sndClick();
}

function resetCost() { return 100 * playerLevel; }

function resetStats() {
    const spent = stats.str + stats.vit + stats.int + stats.agi;
    if (spent === 0) { sndError(); return; }
    const cost = resetCost();
    if (gold < cost) { addChat("Ai nevoie de " + cost + " aur pentru resetarea punctelor.", "#e74c3c"); sndError(); return; }
    changeGear(function() {
        gold -= cost;
        statPoints += spent;
        stats.str = stats.vit = stats.int = stats.agi = 0;
    });
    sndCoin();
    addChat("🔄 Punctele de caracter au fost resetate (" + cost + " aur).", "#ffd966");
}

function renderCharacter() {
    if (!charOpen) return;
    document.getElementById("char-points").textContent = statPoints > 0 ? "✨ " + statPoints + " puncte libere" : "";
    let h = '<div style="margin-bottom:8px;color:#d8c28a;font-size:13px">' + escapeHtml(heroName) + ' · Nivel ' + playerLevel +
            '<br>XP ' + playerXP + ' / ' + xpForLevel(playerLevel) + '</div>';
    STAT_INFO.forEach(function(si) {
        h += '<div class="stat-row"><div><b>' + si.name + '</b><small>' + si.desc + '</small></div>' +
             '<span class="stat-val">' + stats[si.key] + '</span>' +
             '<span><button data-act="stat" data-key="' + si.key + '" data-n="1"' + (statPoints < 1 ? " disabled" : "") + '>+1</button> ' +
             '<button data-act="stat" data-key="' + si.key + '" data-n="5"' + (statPoints < 5 ? " disabled" : "") + '>+5</button></span></div>';
    });
    const g = gearTotals();
    h += '<div class="derived">' +
         '❤️ Viață maximă: <b>' + maxHP + '</b><br>' +
         '💧 Mană maximă: <b>' + maxMP + '</b><br>' +
         '⚔️ Daune: <b>×' + damageMult.toFixed(2) + '</b> · vrajă: <b>×' + spellMult.toFixed(2) + '</b><br>' +
         '🎯 Șansă critică: <b>' + pct(critChance) + '%</b><br>' +
         '👟 Viteză de mișcare: <b>+' + pct(moveMult - 1) + '%</b><br>' +
         '<span style="color:#8a7a66">Din echipament: ' + (statLines(g).join(", ") || "nimic") + '</span></div>';
    h += '<div style="margin-top:10px"><button class="shop-btn" data-act="reset-stats">Resetează punctele (' + resetCost() + ' aur)</button></div>';
    document.getElementById("char-body").innerHTML = h;
}

(function setupCharacterEvents() {
    const panel = document.getElementById("char-panel");
    if (!panel) return;
    panel.addEventListener("click", function(e) {
        e.stopPropagation();
        const b = e.target.closest("[data-act]");
        if (!b || b.disabled) return;
        const a = b.dataset.act;
        if (a === "close") closeCharacter();
        else if (a === "stat") addStat(b.dataset.key, Number(b.dataset.n) || 1);
        else if (a === "reset-stats") resetStats();
    });
})();

/* ====================== CURSOR ȘI ȚINTIRE (stil MMORPG) ====================== */
function svgCursor(svg, x, y) {
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '") ' + x + ' ' + y + ', auto';
}

const CURSORS = {
    "default": svgCursor("<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'>" +
        "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#fff1c1'/><stop offset='1' stop-color='#c9892b'/></linearGradient></defs>" +
        "<path d='M3 2 L3 25 L9 19.5 L13.5 29 L18 27 L13.7 18 L22 18 Z' fill='url(#g)' stroke='#24140a' stroke-width='1.8' stroke-linejoin='round'/>" +
        "<path d='M3 2 L3 25 L9 19.5' fill='none' stroke='#ffffff' stroke-opacity='.4' stroke-width='.8'/></svg>", 3, 2),
    attack: svgCursor("<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'>" +
        "<path d='M27 3 L30 6 L15 21 L12 18 Z' fill='#e8eef5' stroke='#1b1b1b' stroke-width='1.6' stroke-linejoin='round'/>" +
        "<path d='M9 17 L15 23 L13.2 25 L7.2 19 Z' fill='#d9a441' stroke='#1b1b1b' stroke-width='1.6' stroke-linejoin='round'/>" +
        "<path d='M8.4 23.6 L4.5 29 L2.8 27.4 L8 22.6 Z' fill='#7a4a2a' stroke='#1b1b1b' stroke-width='1.6' stroke-linejoin='round'/>" +
        "<circle cx='28' cy='4' r='2.2' fill='#ff3b3b' fill-opacity='.85'/></svg>", 28, 4),
    loot: svgCursor("<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'>" +
        "<path d='M16 6 C10 6 7 12 7 18 C7 24 11 28 16 28 C21 28 25 24 25 18 C25 12 22 6 16 6 Z' fill='#c9892b' stroke='#24140a' stroke-width='1.8'/>" +
        "<path d='M12 4 L20 4 L19 9 L13 9 Z' fill='#7a4a2a' stroke='#24140a' stroke-width='1.5'/>" +
        "<circle cx='16' cy='18' r='4.2' fill='#ffd34d' stroke='#24140a' stroke-width='1.2'/></svg>", 16, 16)
};

let hoverKind = "";
let hoverTimer = 0;
let selectedTarget = null;
let targetRing = null;
const hoverRay = new THREE.Raycaster();

function setCursor(kind) {
    if (kind === hoverKind) return;
    hoverKind = kind;
    document.body.style.cursor = CURSORS[kind] || CURSORS["default"];
}
setCursor("default");

function pickAt(clientX, clientY) {
    if (!camera || !scene) return null;
    hoverRay.setFromCamera(new THREE.Vector2(clientX / window.innerWidth * 2 - 1, -(clientY / window.innerHeight) * 2 + 1), camera);
    const list = [];
    for (const m of monsters) if (m.alive && m.root.visible) list.push(m.root);
    for (const id in remotePlayers) {
        const rp = remotePlayers[id];
        if (rp.mesh && rp.hp > 0) list.push(rp.mesh);
    }
    for (const id in lootItems) list.push(lootItems[id].group);
    const hits = hoverRay.intersectObjects(list, true);
    for (const hit of hits) {
        let o = hit.object;
        while (o) {
            if (o.userData && o.userData.pickType) return { kind: o.userData.pickType, id: o.userData.pickId };
            o = o.parent;
        }
    }
    return null;
}

function selectTarget(kind, id) {
    selectedTarget = { kind: kind, id: id };
    sndClick();
    updateTarget(0);
}

function clearTarget() {
    selectedTarget = null;
    updateTarget(0);
}

function targetInfo() {
    if (!selectedTarget) return null;
    if (selectedTarget.kind === "monster") {
        const m = monsterById[selectedTarget.id];
        if (!m || !m.alive) return null;
        return { x: m.x, y: m.y, z: m.z, hp: m.hp, max: m.maxHp, name: m.name, scale: m.scale };
    }
    const rp = remotePlayers[selectedTarget.id];
    if (!rp || !rp.mesh || rp.hp <= 0) return null;
    return {
        x: rp.rx !== undefined ? rp.rx : rp.x, y: rp.mesh.position.y, z: rp.rz !== undefined ? rp.rz : rp.z,
        hp: rp.hp, max: rp.maxHp || 1500, name: (rp.name || "Erou") + " Lv." + (rp.level || 1), scale: 1
    };
}

function targetNearest() {
    const cands = [];
    for (const m of monsters) {
        if (!m.alive) continue;
        const d = Math.hypot(m.x - myPos.x, m.z - myPos.z);
        if (d < 45) cands.push({ kind: "monster", id: m.id, d: d });
    }
    for (const id in remotePlayers) {
        const rp = remotePlayers[id];
        if (!rp.mesh || rp.hp <= 0) continue;
        const d = Math.hypot((rp.rx !== undefined ? rp.rx : rp.x) - myPos.x, (rp.rz !== undefined ? rp.rz : rp.z) - myPos.z);
        if (d < 45) cands.push({ kind: "player", id: id, d: d });
    }
    if (!cands.length) { clearTarget(); return; }
    cands.sort(function(a, b) { return a.d - b.d; });
    let next = cands[0];
    if (selectedTarget && cands[0].kind === selectedTarget.kind && cands[0].id === selectedTarget.id && cands.length > 1) next = cands[1];
    selectTarget(next.kind, next.id);
}

function worldClick(x, y) {
    const p = pickAt(x, y);
    if (p && (p.kind === "monster" || p.kind === "player")) selectTarget(p.kind, p.id);
    if (!p || p.kind !== "loot") useSkill(1);
}

function updateTarget(delta) {
    const frame = document.getElementById("target-frame");
    const info = targetInfo();
    if (info && Math.hypot(info.x - myPos.x, info.z - myPos.z) > 80) { selectedTarget = null; }
    const ti = selectedTarget ? info : null;

    if (!targetRing && scene) {
        targetRing = new THREE.Mesh(
            new THREE.RingGeometry(0.9, 1.1, 40),
            new THREE.MeshBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
        );
        targetRing.rotation.x = -Math.PI / 2;
        targetRing.visible = false;
        scene.add(targetRing);
    }
    if (targetRing) {
        targetRing.visible = !!ti;
        if (ti) {
            targetRing.position.set(ti.x, ti.y + 0.12, ti.z);
            targetRing.scale.setScalar(ti.scale * (1 + 0.06 * Math.sin(performance.now() / 150)));
        }
    }
    if (frame) {
        frame.style.display = ti ? "block" : "none";
        if (ti) {
            document.getElementById("target-name").textContent = ti.name;
            document.getElementById("target-fill").style.width = Math.max(0, ti.hp / ti.max * 100) + "%";
            document.getElementById("target-text").textContent = Math.max(0, Math.round(ti.hp)) + " / " + ti.max;
        }
    }
}

/* ====================== CLASAMENT ====================== */
let statsTimer = null;

function getPlayerKey() {
    try {
        let k = localStorage.getItem("mu_player_key");
        if (!k || !/^[A-Za-z0-9-]{8,48}$/.test(k)) {
            k = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
                : (Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2));
            localStorage.setItem("mu_player_key", k);
        }
        return k;
    } catch (e) {
        return null;
    }
}

function sendStats() {
    if (!socket || !socket.connected) return;
    socket.emit("stats", { level: playerLevel, xp: playerXP, kills: monsterKills, bossKills: bossKills, pvp: pvpKills });
}

function sendStatsSoon() {
    if (statsTimer) return;
    statsTimer = setTimeout(function() { statsTimer = null; sendStats(); }, 2000);
}

function escapeHtml(v) {
    return String(v).replace(/[&<>"']/g, function(c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
}

function toggleLeaderboard() { if (lbOpen) closeLeaderboard(); else openLeaderboard(); }

function openLeaderboard() {
    if (!gameStarted) return;
    closeShop();
    lbOpen = true;
    document.getElementById("lb-panel").style.display = "block";
    sendStats();
    requestLeaderboard();
    if (lbTimer) clearInterval(lbTimer);
    lbTimer = setInterval(requestLeaderboard, 5000);
    sndClick();
}

function closeLeaderboard() {
    if (!lbOpen) return;
    lbOpen = false;
    document.getElementById("lb-panel").style.display = "none";
    if (lbTimer) { clearInterval(lbTimer); lbTimer = null; }
}

function requestLeaderboard() {
    if (socket && socket.connected) socket.emit("getLeaderboard");
    else document.getElementById("lb-body").textContent = "Fără conexiune la server.";
}

function renderLeaderboard(d) {
    const body = document.getElementById("lb-body");
    if (!d || !d.top) { body.textContent = "Fără date."; return; }
    let html = '<table class="lb-table"><tr><th>#</th><th>Erou</th><th>Nivel</th><th>Monștri</th><th>Boss</th><th>PvP</th></tr>';
    d.top.forEach(function(r) {
        html += '<tr class="' + (r.me ? "me" : "") + '"><td>' + r.rank + '</td><td>' +
                (r.online ? '<span class="lb-dot">●</span>' : "") + escapeHtml(r.name) + '</td><td>' + r.level +
                '</td><td>' + r.kills + '</td><td>' + r.bossKills + '</td><td>' + r.pvp + '</td></tr>';
    });
    html += "</table>";
    if (!d.top.length) html = "Încă nu există eroi în clasament.";
    body.innerHTML = html;
    document.getElementById("lb-rank").textContent = d.myRank ? "Locul tău: " + d.myRank + " din " + d.total : "";
}

// panourile nu trebuie să blocheze camera când dai click pe ele
(function() {
    const shop = document.getElementById("shop-panel");
    const lb = document.getElementById("lb-panel");
    const bar = document.getElementById("toolbar");
    if (shop) shop.addEventListener("click", onShopClick);
    if (lb) lb.addEventListener("click", function(e) {
        e.stopPropagation();
        const b = e.target.closest("[data-act]");
        if (b && b.dataset.act === "close") closeLeaderboard();
    });
    if (bar) bar.addEventListener("click", function(e) { e.stopPropagation(); sndClick(); });
})();

/* ====================== HARTĂ MICĂ ====================== */
const MM_SIZE = 170;
let mmRange = 55, mmCtx = null, mmTimer = 0, mmScan = null;

function minimapZoom(delta) { mmRange = Math.max(25, Math.min(140, mmRange + delta)); }

function startMinimapScan() {
    if (mmScan || !mapLoaded || !mapMeshes.length) return;
    const box = new THREE.Box3();
    for (const mesh of mapMeshes) { mesh.updateMatrixWorld(true); box.expandByObject(mesh); }
    if (box.isEmpty()) return;
    const n = 48;
    mmScan = {
        n: n, h: new Float32Array(n * n), i: 0,
        minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z,
        cw: (box.max.x - box.min.x) / n, ch: (box.max.z - box.min.z) / n,
        done: false, canvas: null
    };
    mmScan.h.fill(NaN);
}

// scanează terenul treptat, ca să nu blocheze jocul
function stepMinimapScan() {
    const S = mmScan;
    if (!S || S.done) return;
    const total = S.n * S.n;
    const t0 = performance.now();
    do {
        const iu = S.i % S.n, iv = Math.floor(S.i / S.n);
        S.h[S.i] = getGroundHeight(S.minX + (iu + 0.5) * S.cw, S.minZ + (iv + 0.5) * S.ch, NaN);
        S.i++;
    } while (S.i < total && performance.now() - t0 < 4);
    setLoad("scan", S.i / total);
    if (S.i >= total) finishMinimapScan();
}

function finishMinimapScan() {
    const S = mmScan;
    S.done = true;
    try {
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < S.h.length; i++) {
            const v = S.h[i];
            if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
        }
        const c = document.createElement("canvas");
        c.width = S.n; c.height = S.n;
        const cx = c.getContext("2d");
        const img = cx.createImageData(S.n, S.n);
        const span = Math.max(1, hi - lo);
        for (let i = 0; i < S.h.length; i++) {
            const v = S.h[i], o = i * 4;
            if (Number.isFinite(v)) {
                const t = (v - lo) / span;
                img.data[o] = 55 + 90 * t;
                img.data[o + 1] = 48 + 70 * t;
                img.data[o + 2] = 68 + 80 * t;
                img.data[o + 3] = 235;
            } else {
                img.data[o + 3] = 0;
            }
        }
        cx.putImageData(img, 0, 0);
        S.canvas = c;
    } catch (e) {
        S.canvas = null;
    }
}

function updateMinimap(delta) {
    stepMinimapScan();
    mmTimer += delta;
    if (mmTimer < 0.033) return;
    mmTimer = 0;
    drawMinimap();
}

function drawMinimap() {
    if (!mmCtx) {
        const cv = document.getElementById("minimap");
        if (!cv) return;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        cv.width = MM_SIZE * dpr;
        cv.height = MM_SIZE * dpr;
        cv.style.width = MM_SIZE + "px";
        cv.style.height = MM_SIZE + "px";
        mmCtx = cv.getContext("2d");
        mmCtx.scale(dpr, dpr);
    }
    const ctx = mmCtx;
    const cx = MM_SIZE / 2, cy = MM_SIZE / 2, R = MM_SIZE / 2 - 3;
    const s = R / mmRange;
    const a = cameraAngle;
    // direcția "în sus" pe hartă = direcția în care privește camera
    const fx = -Math.sin(a), fz = -Math.cos(a), rx = Math.cos(a), rz = -Math.sin(a);
    const px = myPos.x, pz = myPos.z;

    function toMap(x, z) {
        const dx = x - px, dz = z - pz;
        return [cx + (dx * rx + dz * rz) * s, cy - (dx * fx + dz * fz) * s];
    }

    ctx.clearRect(0, 0, MM_SIZE, MM_SIZE);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "rgba(10, 8, 9, 0.88)";
    ctx.fillRect(0, 0, MM_SIZE, MM_SIZE);

    if (mmScan && mmScan.canvas) {
        const S = mmScan;
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.transform(
            s * S.cw * rx, -s * S.cw * fx,
            s * S.ch * rz, -s * S.ch * fz,
            cx + s * ((S.minX - px) * rx + (S.minZ - pz) * rz),
            cy - s * ((S.minX - px) * fx + (S.minZ - pz) * fz)
        );
        ctx.drawImage(S.canvas, 0, 0);
        ctx.restore();
    }

    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    for (let k = 1; k <= 2; k++) {
        ctx.beginPath();
        ctx.arc(cx, cy, R * k / 3, 0, Math.PI * 2);
        ctx.stroke();
    }

    for (const t of telegraphs) {
        const p = toMap(t.x, t.z);
        ctx.fillStyle = "rgba(255, 50, 20, 0.3)";
        ctx.beginPath();
        ctx.arc(p[0], p[1], t.r * s, 0, Math.PI * 2);
        ctx.fill();
    }

    for (const id in lootItems) {
        const it = lootItems[id];
        const p = toMap(it.x, it.z);
        ctx.fillStyle = "#" + lootColor(it).toString(16).padStart(6, "0");
        ctx.fillRect(p[0] - 1.5, p[1] - 1.5, 3, 3);
    }

    const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 250);
    for (const m of monsters) {
        if (!m.alive) continue;
        const p = toMap(m.x, m.z);
        ctx.beginPath();
        if (m.boss) {
            ctx.fillStyle = "rgba(255, 140, 40, " + (0.55 + 0.45 * pulse) + ")";
            ctx.arc(p[0], p[1], 6, 0, Math.PI * 2);
        } else {
            ctx.fillStyle = "#e04848";
            ctx.arc(p[0], p[1], 2.6, 0, Math.PI * 2);
        }
        ctx.fill();
    }

    for (const id in remotePlayers) {
        const rp = remotePlayers[id];
        if (!rp.mesh) continue;
        const p = toMap(rp.rx !== undefined ? rp.rx : rp.x, rp.rz !== undefined ? rp.rz : rp.z);
        ctx.fillStyle = "#4fc3f7";
        ctx.beginPath();
        ctx.arc(p[0], p[1], 3.2, 0, Math.PI * 2);
        ctx.fill();
    }

    // săgeată spre boss când e în afara hărții
    const boss = monsterById["boss"];
    if (boss && boss.alive) {
        const dx = boss.x - px, dz = boss.z - pz;
        const r = dx * rx + dz * rz, f = dx * fx + dz * fz;
        const dist = Math.hypot(r, f);
        if (dist > mmRange) {
            ctx.save();
            ctx.translate(cx + r / dist * (R - 6), cy - f / dist * (R - 6));
            ctx.rotate(Math.atan2(r, f));
            ctx.fillStyle = "rgba(255, 140, 40, " + (0.6 + 0.4 * pulse) + ")";
            ctx.beginPath();
            ctx.moveTo(0, -6);
            ctx.lineTo(5, 4);
            ctx.lineTo(-5, 4);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
    }
    ctx.restore();

    // eu: săgeată orientată în direcția personajului
    const hf = Math.sin(myPos.rotY) * fx + Math.cos(myPos.rotY) * fz;
    const hr = Math.sin(myPos.rotY) * rx + Math.cos(myPos.rotY) * rz;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.atan2(hr, hf));
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(0, 2);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = "#8c6239";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
}

