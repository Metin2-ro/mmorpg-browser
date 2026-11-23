/* =====================================================================
   weapon-fix.js — armele se pun corect în mână, la orice personaj

   Încărcat după src/main.js. Înlocuiește funcțiile globale attachClassWeapon
   și syncEquippedWeaponVisual definite de src/weaponSystem.js.
   ===================================================================== */
(function () {
    "use strict";

    var D2R = Math.PI / 180;
    var STORE_KEY = "mu_weapon_adj_v1";
    var DEFAULT_PITCH = { "Viking": 55, "Wizard": 70 };
    var DEFAULT_ADJ = {};

    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}") || {}; } catch (e) {}
    var forceWeapon = false;
    var analyses = {};

    var CANON = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0))
    );

    function eigen3(c) {
        var a = [c[0].slice(), c[1].slice(), c[2].slice()];
        var V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
        for (var sweep = 0; sweep < 40; sweep++) {
            if (Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]) < 1e-18) break;
            [[0, 1], [0, 2], [1, 2]].forEach(function (pq) {
                var p = pq[0], q = pq[1];
                if (Math.abs(a[p][q]) < 1e-20) return;
                var th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
                var t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1));
                var cs = 1 / Math.sqrt(t * t + 1), sn = t * cs, k;
                for (k = 0; k < 3; k++) { var x1 = a[k][p], x2 = a[k][q]; a[k][p] = cs * x1 - sn * x2; a[k][q] = sn * x1 + cs * x2; }
                for (k = 0; k < 3; k++) { var y1 = a[p][k], y2 = a[q][k]; a[p][k] = cs * y1 - sn * y2; a[q][k] = sn * y1 + cs * y2; }
                for (k = 0; k < 3; k++) { var z1 = V[k][p], z2 = V[k][q]; V[k][p] = cs * z1 - sn * z2; V[k][q] = sn * z1 + cs * z2; }
            });
        }
        var out = [0, 1, 2].map(function (i) { return { val: a[i][i], vec: new THREE.Vector3(V[0][i], V[1][i], V[2][i]).normalize() }; });
        out.sort(function (m, n) { return n.val - m.val; });
        return out;
    }

    function analyze(file, asset) {
        if (analyses[file]) return analyses[file];
        asset.updateMatrixWorld(true);
        var inv = new THREE.Matrix4().copy(asset.matrixWorld).invert();
        var m = new THREE.Matrix4(), v = new THREE.Vector3(), pts = [];
        asset.traverse(function (n) {
            if (!n.isMesh || !n.geometry || !n.geometry.attributes.position) return;
            m.multiplyMatrices(inv, n.matrixWorld);
            var pos = n.geometry.attributes.position;
            var step = Math.max(1, Math.floor(pos.count / 3000));
            for (var i = 0; i < pos.count; i += step) {
                v.fromBufferAttribute(pos, i).applyMatrix4(m);
                pts.push(v.x, v.y, v.z);
            }
        });
        var n = pts.length / 3;
        if (n < 4) return null;

        var mean = new THREE.Vector3(), i;
        for (i = 0; i < n; i++) { mean.x += pts[i * 3]; mean.y += pts[i * 3 + 1]; mean.z += pts[i * 3 + 2]; }
        mean.divideScalar(n);
        var c = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
        for (i = 0; i < n; i++) {
            var dx = pts[i * 3] - mean.x, dy = pts[i * 3 + 1] - mean.y, dz = pts[i * 3 + 2] - mean.z;
            c[0][0] += dx * dx; c[0][1] += dx * dy; c[0][2] += dx * dz;
            c[1][1] += dy * dy; c[1][2] += dy * dz; c[2][2] += dz * dz;
        }
        c[1][0] = c[0][1]; c[2][0] = c[0][2]; c[2][1] = c[1][2];
        var e = eigen3(c);
        var p1 = e[0].vec, p3 = e[2].vec;

        var lo = Infinity, hi = -Infinity;
        for (i = 0; i < n; i++) {
            var t = pts[i * 3] * p1.x + pts[i * 3 + 1] * p1.y + pts[i * 3 + 2] * p1.z;
            if (t < lo) lo = t;
            if (t > hi) hi = t;
        }
        var len = hi - lo;
        if (!(len > 1e-6)) return null;

        var s0 = 0, c0 = 0, s1 = 0, c1 = 0;
        for (i = 0; i < n; i++) {
            var qx = pts[i * 3] - mean.x, qy = pts[i * 3 + 1] - mean.y, qz = pts[i * 3 + 2] - mean.z;
            var along = qx * p1.x + qy * p1.y + qz * p1.z;
            var radial = Math.sqrt(Math.max(0, qx * qx + qy * qy + qz * qz - along * along));
            var u = ((pts[i * 3] * p1.x + pts[i * 3 + 1] * p1.y + pts[i * 3 + 2] * p1.z) - lo) / len;
            if (u < 0.3) { s0 += radial; c0++; } else if (u > 0.7) { s1 += radial; c1++; }
        }
        var tipSign = (c1 ? s1 / c1 : 0) >= (c0 ? s0 / c0 : 0) ? 1 : -1;

        analyses[file] = { pts: new Float32Array(pts), mean: mean, p1: p1.clone(), p3: p3.clone(), lo: lo, hi: hi, len: len, tipSign: tipSign };
        return analyses[file];
    }

    function sliceCenter(an, x, g) {
        var tol = an.len * 0.04, sx = 0, sy = 0, sz = 0, n = 0, p = an.pts;
        for (var i = 0; i < p.length; i += 3) {
            var t = p[i] * x.x + p[i + 1] * x.y + p[i + 2] * x.z;
            if (Math.abs(t - g) < tol) { sx += p[i]; sy += p[i + 1]; sz += p[i + 2]; n++; }
        }
        if (n >= 3) return new THREE.Vector3(sx / n, sy / n, sz / n);
        return an.mean.clone().addScaledVector(x, g - an.mean.dot(x));
    }

    function findHand(model, side) {
        var want = /^right/i.test(side) ? "right" : "left";
        var letter = want === "right" ? "r" : "l";
        var found = null;
        var candidates = [];
        model.traverse(function (n) {
            if (!n.isBone) return;
            var raw = String(n.name || "").toLowerCase();
            var nm = raw.replace(/^.*[:|]/, "").replace(/[^a-z0-9]/g, "").replace(/^mixamorig/, "");
            if (/(index|middle|ring|pinky|thumb|finger)/i.test(nm)) return;
            candidates.push(n.name);
            var exact = new RegExp("^(?:" + want + "hand|hand" + want + "|" + letter + "hand|hand" + letter + ")\\d*$");
            var broad = (nm.indexOf(want) >= 0 && nm.indexOf("hand") >= 0) ||
                        (nm.indexOf(letter + "hand") >= 0) ||
                        (nm.indexOf("hand" + letter) >= 0) ||
                        (nm.indexOf(want + "wrist") >= 0) ||
                        (nm.indexOf("wrist" + want) >= 0);
            if (!found && (exact.test(nm) || broad)) found = n;
        });
        if (!found && typeof findHandBone === "function") found = findHandBone(model, side);
        if (!found) console.warn("WeaponFix: nu am găsit osul " + side + ". Oase disponibile:", candidates);
        else console.info("WeaponFix: os " + side + " identificat:", found.name);
        return found;
    }

    function bindQuat(model, hand) {
        var found = null;
        model.traverse(function (n) {
            if (found || !n.isSkinnedMesh || !n.skeleton) return;
            var i = n.skeleton.bones.indexOf(hand);
            if (i >= 0) found = { mesh: n, i: i };
        });
        if (!found) return new THREE.Quaternion();
        var root = model.parent || model;
        root.updateMatrixWorld(true);
        found.mesh.updateMatrixWorld(true);
        var mesh = found.mesh;
        var M = new THREE.Matrix4().copy(mesh.bindMatrix).invert().premultiply(mesh.matrixWorld);
        M.multiply(new THREE.Matrix4().copy(mesh.skeleton.boneInverses[found.i]).invert());
        M.premultiply(new THREE.Matrix4().copy(root.matrixWorld).invert());
        var q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
        M.decompose(p, q, s);
        return q;
    }

    function getAdj(key, cls) {
        var a = { yaw: 0, pitch: DEFAULT_PITCH[cls] || 0, roll: 0, grip: 0.14, scale: 1, ox: 0, oy: 0, oz: 0, flip: false };
        [DEFAULT_ADJ[key], saved[key]].forEach(function (o) {
            if (!o) return;
            for (var k in a) if (k in o) a[k] = o[k];
        });
        return a;
    }

    function saveAdj(rec) {
        saved[rec.key] = Object.assign({}, rec.adj);
        try { localStorage.setItem(STORE_KEY, JSON.stringify(saved)); } catch (e) {}
    }

    function layout(rec) {
        var an = rec.an, a = rec.adj, cfg = rec.cfg;
        var tip = an.tipSign * (a.flip ? -1 : 1);
        var x = an.p1.clone().multiplyScalar(tip);
        var z = an.p3.clone();
        var y = new THREE.Vector3().crossVectors(z, x).normalize();
        z.crossVectors(x, y).normalize();
        var B = new THREE.Matrix4().makeBasis(x, y, z);
        var q = new THREE.Quaternion().setFromRotationMatrix(B).invert();

        var ext0 = tip > 0 ? an.lo : -an.hi;
        var ext1 = tip > 0 ? an.hi : -an.lo;
        var g = ext0 + THREE.MathUtils.clamp(a.grip, 0, 1) * (ext1 - ext0);
        var gp = sliceCenter(an, x, g);

        rec.hand.updateWorldMatrix(true, false);
        var hs = rec.hand.getWorldScale(new THREE.Vector3()).x || 1;
        var s = cfg.length * a.scale / ((ext1 - ext0) * hs);

        rec.weapon.scale.setScalar(s);
        rec.weapon.quaternion.copy(q);
        rec.weapon.position.copy(gp).applyQuaternion(q).multiplyScalar(-s);

        var qadj = new THREE.Quaternion().setFromEuler(new THREE.Euler(a.roll * D2R, a.yaw * D2R, a.pitch * D2R, "XYZ"));
        var qp = rec.bindQ.clone().invert().multiply(CANON).multiply(qadj);
        rec.pivot.quaternion.copy(qp);
        var off = new THREE.Vector3(a.ox, a.oy, a.oz).multiplyScalar(cfg.length / hs).applyQuaternion(qp);
        rec.pivot.position.copy(rec.palm).add(off);
    }

    function loadAsset(file) {
        if (!CLASS_WEAPON_ASSET_PROMISES[file]) {
            CLASS_WEAPON_ASSET_PROMISES[file] = new Promise(function (resolve, reject) {
                new THREE.GLTFLoader().load("./characters/arme/" + file, function (gltf) { resolve(gltf.scene); }, undefined, reject);
            }).catch(function (err) {
                delete CLASS_WEAPON_ASSET_PROMISES[file];
                throw err;
            });
        }
        return CLASS_WEAPON_ASSET_PROMISES[file];
    }

    function buildRec(model, cls, item, asset) {
        var hand = item.hand, cfg = item.config;
        if (!model.parent || !hand.parent) return null;
        var an = analyze(cfg.file, asset);
        if (!an) throw new Error("Modelul armei " + cfg.file + " nu are geometrie.");
        model.parent.updateMatrixWorld(true);
        var key = cls + ":" + item.idx;
        var rec = {
            key: key, cfg: cfg, hand: hand, model: model, an: an,
            pivot: new THREE.Group(), weapon: asset.clone(true), adj: getAdj(key, cls),
            palm: getPalmGripAnchor(hand, model).clone(), bindQ: bindQuat(model, hand)
        };
        rec.weapon.traverse(function (n) {
            if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; n.frustumCulled = false; }
        });
        rec.pivot.add(rec.weapon);
        hand.add(rec.pivot);
        layout(rec);
        return rec;
    }

    function removeRec(rec) { if (rec && rec.pivot && rec.pivot.parent) rec.pivot.parent.remove(rec.pivot); }

    function removeAll(model) {
        (model.userData.weaponRecs || []).forEach(removeRec);
        (model.userData.classWeaponObjects || []).forEach(function (o) { if (o.parent) o.parent.remove(o); });
        model.userData.weaponRecs = [];
        model.userData.classWeaponObjects = [];
        model.userData.classWeaponAttached = false;
    }

    function wanted() { return (typeof equipped !== "undefined" && equipped && equipped.weapon) || forceWeapon; }

    window.attachClassWeapon = function (model, className) {
        var configs = CLASS_WEAPON_CONFIG[className];
        if (!model || !configs || model.userData.classWeaponPending || model.userData.classWeaponAttached) return;
        if (!wanted()) return;

        var items = [];
        configs.forEach(function (cfg, idx) {
            var hand = findHand(model, cfg.hand);
            if (hand) items.push({ config: cfg, idx: idx, hand: hand });
            else console.warn("Nu am găsit osul mâinii (" + cfg.hand + ") pentru " + className);
        });
        if (!items.length) return;

        model.userData.classWeaponPending = true;
        var built = [];
        Promise.all(items.map(function (item) {
            return loadAsset(item.config.file).then(function (asset) {
                var rec = buildRec(model, className, item, asset);
                if (rec) built.push(rec);
                return rec;
            });
        })).then(function (recs) {
            recs = recs.filter(Boolean);
            model.userData.classWeaponPending = false;
            if (!wanted()) { recs.forEach(removeRec); return; }
            model.userData.weaponRecs = recs;
            model.userData.classWeaponObjects = recs.map(function (r) { return r.pivot; });
            model.userData.classWeaponAttached = recs.length > 0;
            refreshPanel();
        }).catch(function (err) {
            built.forEach(removeRec);
            model.userData.classWeaponPending = false;
            console.warn("Arma nu s-a putut atașa pentru clasa " + className + ":", err);
        });
    };

    window.syncEquippedWeaponVisual = function () {
        if (!characterModel) return;
        if (wanted()) window.attachClassWeapon(characterModel, selectedCharacterName);
        else removeAll(characterModel);
    };

    var FIELDS = [
        ["yaw", "Rotire stânga / dreapta", -180, 180, 1],
        ["pitch", "Ridică / coboară vârful", -180, 180, 1],
        ["roll", "Răsucire pe lungime", -180, 180, 1],
        ["grip", "Unde apucă mâna (0 = capătul mânerului)", 0, 1, 0.01],
        ["scale", "Mărime", 0.4, 2.5, 0.01],
        ["ox", "Mută înainte / înapoi", -0.5, 0.5, 0.01],
        ["oy", "Mută sus / jos", -0.5, 0.5, 0.01],
        ["oz", "Mută stânga / dreapta", -0.5, 0.5, 0.01]
    ];
    var panel = null, selIdx = 0;

    function recs() { return (characterModel && characterModel.userData.weaponRecs) || []; }

    function fmt(v, f) {
        v = Number(v);
        if (f[0] === "yaw" || f[0] === "pitch" || f[0] === "roll") return Math.round(v) + "°";
        if (f[0] === "scale") return v.toFixed(2) + "×";
        return v.toFixed(2);
    }

    function buildPanel() {
        if (panel) return;
        var st = document.createElement("style");
        st.textContent = [
            "#weapon-cal{position:fixed;right:20px;top:392px;width:268px;max-height:calc(100vh - 410px);overflow-y:auto;display:none;z-index:45;",
            "background:rgba(12,8,6,.95);border:2px solid #8c6239;border-radius:6px;padding:10px 12px;font-size:12px;color:#d8c28a;box-shadow:0 4px 18px rgba(0,0,0,.85)}",
            "#weapon-cal .wc-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;color:#ffd700}",
            "#weapon-cal button{background:linear-gradient(#d4af37,#8c6239);color:#111;border:1px solid #ffd700;border-radius:4px;padding:4px 8px;font-weight:bold;font-size:11px;cursor:pointer}",
            "#weapon-cal select{width:100%;margin:6px 0;background:#18110e;color:#ffd700;border:1px solid #6e4f2c;border-radius:3px;padding:4px}",
            "#weapon-cal .wc-field{margin-top:7px}",
            "#weapon-cal .wc-lab{display:flex;justify-content:space-between;margin-bottom:2px}",
            "#weapon-cal .wc-lab span:last-child{color:#ffd700}",
            "#weapon-cal input[type=range]{width:100%}",
            "#weapon-cal .wc-btns{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}",
            "#weapon-cal .wc-note{margin-top:8px;color:#a8957a;line-height:1.45}",
            "#weapon-cal label{display:flex;gap:6px;align-items:center}"
        ].join("");
        document.head.appendChild(st);

        panel = document.createElement("div");
        panel.id = "weapon-cal";
        panel.innerHTML = '<div class="wc-head"><b>Calibrare arme</b><button data-wc="close">✕</button></div><div id="wc-body"></div>';
        document.body.appendChild(panel);
        panel.addEventListener("input", onInput);
        panel.addEventListener("change", onChange);
        panel.addEventListener("click", onClick);
    }

    function renderPanel() {
        var body = document.getElementById("wc-body");
        if (!body) return;
        var rs = recs(), h = "";
        h += '<label><input type="checkbox" data-wc="force"' + (forceWeapon ? " checked" : "") + '> Arată arma chiar dacă nu e echipată</label>';
        if (!rs.length) {
            h += '<div class="wc-note">' + (wanted()
                ? "Arma se încarcă sau nu s-a găsit osul mâinii (vezi consola, F12)."
                : "Nicio armă pe personaj. Bifează căsuța de mai sus sau echipează o armă (I).") + "</div>";
            body.innerHTML = h;
            return;
        }
        if (selIdx >= rs.length) selIdx = 0;
        if (rs.length > 1) {
            h += '<select data-wc="sel">' + rs.map(function (r, i) {
                return '<option value="' + i + '"' + (i === selIdx ? " selected" : "") + ">" +
                    (r.cfg.hand === "LeftHand" ? "Mâna stângă" : "Mâna dreaptă") + " · " + r.cfg.file + "</option>";
            }).join("") + "</select>";
        }
        var r = rs[selIdx];
        FIELDS.forEach(function (f) {
            h += '<div class="wc-field"><div class="wc-lab"><span>' + f[1] + '</span><span id="wc-v-' + f[0] + '">' + fmt(r.adj[f[0]], f) + "</span></div>" +
                 '<input type="range" data-f="' + f[0] + '" min="' + f[2] + '" max="' + f[3] + '" step="' + f[4] + '" value="' + r.adj[f[0]] + '"></div>';
        });
        h += '<div class="wc-btns"><button data-wc="flip">Întoarce arma</button><button data-wc="reset">Resetează</button><button data-wc="copy">Copiază valorile</button></div>' +
             '<div class="wc-note">Dacă arma stă cu mânerul în față, apasă „Întoarce arma”. Valorile se salvează automat în browser.</div>';
        body.innerHTML = h;
    }

    function refreshPanel() { if (panel && panel.style.display === "block") renderPanel(); }

    function onInput(e) {
        var f = e.target.dataset && e.target.dataset.f;
        if (!f) return;
        var r = recs()[selIdx];
        if (!r) return;
        r.adj[f] = Number(e.target.value);
        var def = FIELDS.filter(function (x) { return x[0] === f; })[0];
        var lab = document.getElementById("wc-v-" + f);
        if (lab && def) lab.textContent = fmt(r.adj[f], def);
        saveAdj(r);
        layout(r);
    }

    function onChange(e) {
        var t = e.target, w = t.dataset && t.dataset.wc;
        if (t.dataset && t.dataset.f) { t.blur(); return; }
        if (w === "force") {
            forceWeapon = !!t.checked;
            window.syncEquippedWeaponVisual();
            renderPanel();
        } else if (w === "sel") {
            selIdx = Number(t.value) || 0;
            renderPanel();
        }
    }

    function onClick(e) {
        var b = e.target.closest("[data-wc]");
        if (!b || b.tagName !== "BUTTON") return;
        var w = b.dataset.wc, r = recs()[selIdx];
        if (w === "close") { panel.style.display = "none"; return; }
        if (!r) return;
        if (w === "flip") {
            r.adj.flip = !r.adj.flip;
            saveAdj(r); layout(r); renderPanel();
        } else if (w === "reset") {
            delete saved[r.key];
            try { localStorage.setItem(STORE_KEY, JSON.stringify(saved)); } catch (err) {}
            r.adj = getAdj(r.key, selectedCharacterName);
            layout(r); renderPanel();
        } else if (w === "copy") {
            var all = {};
            recs().forEach(function (x) { all[x.key] = x.adj; });
            var text = JSON.stringify(all);
            console.log("Valori arme:", text);
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(function () { addChat("Valorile armelor au fost copiate.", "#2ecc71"); },
                    function () { window.prompt("Copiază valorile:", text); });
            } else {
                window.prompt("Copiază valorile:", text);
            }
        }
    }

    function togglePanel() {
        buildPanel();
        var show = panel.style.display !== "block";
        panel.style.display = show ? "block" : "none";
        if (show) renderPanel();
    }

    window.addEventListener("keydown", function (e) {
        if (e.code === "F2") { e.preventDefault(); togglePanel(); }
    });
    var bar = document.getElementById("toolbar");
    if (bar) {
        var btn = document.createElement("button");
        btn.textContent = "🗡️ Arme (F2)";
        btn.addEventListener("click", togglePanel);
        bar.appendChild(btn);
    }
})();