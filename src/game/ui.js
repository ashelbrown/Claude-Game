// Two-part interface: an immediate-mode HUD drawn on a 2D canvas over the
// scene, and a set of DOM screens (character, director, pause, results).

import { clamp, clamp01, lerp, v3, projectPoint, formatNum, vdistXZ } from '../core/math.js';
import {
  RARITY, ELEMENTS, SLOT_ORDER, WEAPON_SLOTS, ARMOR_SLOTS, STATS, statTier, POWER,
} from '../data/defs.js';
import { CLASSES, SUBCLASSES, SUPERS, CLASS_ABILITIES } from '../data/subclasses.js';
import { FAMILIES } from '../data/weapons.js';
import {
  itemSubtitle, itemScore, weaponPerkList, dismantleValue, canInfuse, infuseCost, computePower,
} from './loot.js';
import { ACTIVITIES, powerDelta, powerLabel } from './activities.js';

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

export class UI {
  constructor(game, hudCanvas, overlayRoot) {
    this.g = game;
    this.canvas = hudCanvas;
    this.ctx = hudCanvas.getContext('2d');
    this.root = overlayRoot;
    this.screen = null;
    this.bannerText = null;
    this.bannerSub = '';
    this.bannerTime = 0;
    this.damageDirs = [];
    this.toasts = [];
    this.killFeed = [];
    this.waypoint = null;
    this.waypointLabel = '';
    this.boss = null;
    this.selected = null;
    this.invFilter = 'all';
    this.invSort = 'power';
    this.infuseSource = null;
    this.dpr = 1;
    this._buildScreens();
    this.resize();
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = this.canvas.clientWidth;
    this.h = this.canvas.clientHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  // ================================================================ messages
  banner(text, sub = '') {
    this.bannerText = text; this.bannerSub = sub; this.bannerTime = 2.6;
  }
  flashDamage(angle, amount) {
    if (angle == null) { this.damageDirs.push({ angle: 0, life: 0.9, max: 0.9, amount, omni: true }); return; }
    this.damageDirs.push({ angle, life: 0.9, max: 0.9, amount });
  }
  markWaypoint(pos, label) { this.waypoint = v3(pos.x, pos.y + 2, pos.z); this.waypointLabel = label || ''; }
  clearWaypoint() { this.waypoint = null; }
  setBoss(enemy) { this.boss = enemy; }

  toast(title, sub, colorClass) {
    const node = el('div', 'toast ' + (colorClass ? 'bd-' + colorClass : ''),
      `<span class="${colorClass ? 'r-' + colorClass : ''}">${title}</span><span class="sub">${sub || ''}</span>`);
    this.toastStack.appendChild(node);
    setTimeout(() => { node.style.transition = 'opacity .4s'; node.style.opacity = '0'; }, 4200);
    setTimeout(() => node.remove(), 4700);
    while (this.toastStack.childElementCount > 7) this.toastStack.firstChild.remove();
  }
  lootToast(item) {
    this.toast(item.name, itemSubtitle(item) + ' · ' + item.power, item.rarity);
  }
  killMessage(text) {
    this.killFeed.push({ text, life: 3.2 });
    if (this.killFeed.length > 5) this.killFeed.shift();
  }

  // ================================================================ HUD
  renderHud(dt) {
    const ctx = this.ctx, g = this.g, W = this.w, H = this.h;
    ctx.clearRect(0, 0, W, H);
    if (!g.inActivity || !g.player) return;
    const p = g.player;

    this.bannerTime = Math.max(0, this.bannerTime - dt);
    for (let i = this.damageDirs.length - 1; i >= 0; i--) {
      this.damageDirs[i].life -= dt;
      if (this.damageDirs[i].life <= 0) this.damageDirs.splice(i, 1);
    }
    for (let i = this.killFeed.length - 1; i >= 0; i--) {
      this.killFeed[i].life -= dt;
      if (this.killFeed[i].life <= 0) this.killFeed.splice(i, 1);
    }

    this._vignette(ctx, W, H, p);
    this._worldText(ctx, g);
    this._enemyBars(ctx, g);
    this._crosshair(ctx, W, H, p);
    this._vitals(ctx, W, H, p);
    this._abilities(ctx, W, H, p);
    this._ammo(ctx, W, H, p);
    this._radar(ctx, W, H, g);
    this._objective(ctx, W, H, g);
    this._bossBar(ctx, W, H);
    this._damageDirs(ctx, W, H);
    this._banner(ctx, W, H);
    this._killFeed(ctx, W, H);
    if (g.showFps) this._debug(ctx, W, H, g);
  }

  _vignette(ctx, W, H, p) {
    const frac = (p.hp + p.shield) / (p.maxHp + p.maxShield);
    const hurt = clamp01(1 - frac / 0.55);
    if (hurt <= 0.01 && !p.superActive) return;
    if (hurt > 0.01) {
      const grd = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28, W / 2, H / 2, Math.max(W, H) * 0.72);
      grd.addColorStop(0, 'rgba(120,0,0,0)');
      grd.addColorStop(1, `rgba(150,10,10,${0.55 * hurt})`);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);
    }
    if (p.superActive) {
      const c = ELEMENTS[p.superDef.element];
      const grd = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(1, c.css + '55');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);
    }
  }

  _project(pos, out) {
    const vp = this.g.viewProj;
    if (!projectPoint(vp, pos, out)) return false;
    out.sx = (out.x * 0.5 + 0.5) * this.w;
    out.sy = (-out.y * 0.5 + 0.5) * this.h;
    return true;
  }

  _worldText(ctx, g) {
    if (!g.profile.settings.showDamage) return;
    ctx.textAlign = 'center';
    for (const t of g.fx.texts) {
      if (!this._project(t.pos, _pt)) continue;
      const a = clamp01(t.life / t.max);
      const scale = clamp(14 / Math.max(_pt.w, 1) + 0.55, 0.5, 1.35);
      ctx.globalAlpha = a * a;
      ctx.font = `${t.crit ? '700 ' : '600 '}${Math.round(t.size * scale)}px Rajdhani, DIN Alternate, sans-serif`;
      ctx.fillStyle = 'rgba(0,0,0,.65)';
      ctx.fillText(t.text, _pt.sx + 1.5, _pt.sy + 1.5);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, _pt.sx, _pt.sy);
    }
    ctx.globalAlpha = 1;
  }

  _enemyBars(ctx, g) {
    ctx.textAlign = 'center';
    for (const e of g.enemies) {
      if (!e.alive || e === this.boss) continue;
      const showBar = e.rank !== 'minor' || (e.hp < e.maxHp && g.time - e.lastHitTime < 2.5);
      if (!showBar) continue;
      _wp.x = e.pos.x; _wp.y = e.pos.y + e.height + 0.35; _wp.z = e.pos.z;
      if (!this._project(_wp, _pt)) continue;
      const dist = _pt.w;
      if (dist > 70) continue;
      const w = clamp(74 - dist * 0.5, 28, 74);
      const h = 4;
      const x = _pt.sx - w / 2, y = _pt.sy;
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      const hpFrac = clamp01(e.hp / e.maxHp);
      ctx.fillStyle = e.rank === 'minor' ? '#e8624c' : e.rank === 'major' ? '#ffd45f' : '#ff9d3c';
      ctx.fillRect(x, y, w * hpFrac, h);
      if (e.maxShield > 0 && e.shield > 0) {
        ctx.fillStyle = ELEMENTS[e.shieldElement].css;
        ctx.fillRect(x, y - 5, w * clamp01(e.shield / e.maxShield), 3);
      }
      if (e.rank !== 'minor' && dist < 45) {
        ctx.font = '600 11px Rajdhani, sans-serif';
        ctx.fillStyle = '#e8eefc';
        ctx.fillText(e.def.name.toUpperCase(), _pt.sx, y - 9);
      }
    }
    // waypoint
    if (this.waypoint) {
      const onScreen = this._project(this.waypoint, _pt);
      const d = Math.round(vdistXZ(g.player.pos, this.waypoint));
      if (onScreen && _pt.sx > 0 && _pt.sx < this.w && _pt.sy > 0 && _pt.sy < this.h) {
        ctx.strokeStyle = '#e8c56a'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(_pt.sx, _pt.sy, 9, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(_pt.sx, _pt.sy, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = '#e8c56a'; ctx.fill();
        ctx.font = '600 11px Rajdhani, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(`${this.waypointLabel} ${d}m`, _pt.sx, _pt.sy - 15);
      } else {
        // clamp an off-screen marker to the screen edge
        const ang = Math.atan2(_pt.sy - this.h / 2, _pt.sx - this.w / 2) + (_pt.w <= 0 ? Math.PI : 0);
        const rx = this.w * 0.36, ry = this.h * 0.36;
        const x = this.w / 2 + Math.cos(ang) * rx, y = this.h / 2 + Math.sin(ang) * ry;
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
        ctx.fillStyle = '#e8c56a';
        ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, 5); ctx.lineTo(-5, -5); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
  }

  _crosshair(ctx, W, H, p) {
    const cx = W / 2, cy = H / 2;
    const w = p.weapon;
    const spread = w ? lerp(w.derived.spread, w.derived.adsSpread, p.ads) : 0.01;
    const gap = clamp(6 + spread * 900 + (p.sprinting ? 8 : 0), 4, 40);
    const len = 6;
    ctx.strokeStyle = 'rgba(232,238,252,.85)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (p.ads < 0.75 || !w || w.derived.zoom < 3) {
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        ctx.moveTo(cx + dx * gap, cy + dy * gap);
        ctx.lineTo(cx + dx * (gap + len), cy + dy * (gap + len));
      }
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(232,238,252,.9)';
    ctx.fillRect(cx - 1, cy - 1, 2, 2);

    // sniper scope overlay
    if (w && w.derived.zoom >= 3 && p.ads > 0.75) {
      const r = Math.min(W, H) * 0.42;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.arc(cx, cy, r, 0, Math.PI * 2, true);
      ctx.fillStyle = 'rgba(0,0,0,.92)';
      ctx.fill('evenodd');
      ctx.restore();
      ctx.strokeStyle = 'rgba(232,238,252,.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - r, cy); ctx.lineTo(cx - 14, cy);
      ctx.moveTo(cx + 14, cy); ctx.lineTo(cx + r, cy);
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy - 14);
      ctx.moveTo(cx, cy + 14); ctx.lineTo(cx, cy + r);
      ctx.stroke();
    }

    for (const hm of this.g.fx.hitmarkers) {
      const a = clamp01(hm.life / hm.max);
      ctx.strokeStyle = hm.kill ? 'rgba(255,90,70,' + a + ')' : hm.crit ? 'rgba(255,224,138,' + a + ')' : 'rgba(255,255,255,' + a + ')';
      ctx.lineWidth = hm.kill ? 2.6 : 2;
      const o = 5, l = hm.kill ? 9 : 6;
      ctx.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.moveTo(cx + sx * o, cy + sy * o);
        ctx.lineTo(cx + sx * (o + l), cy + sy * (o + l));
      }
      ctx.stroke();
    }

    // charge / reload arc
    if (p.charge > 0 && p.weapon) {
      const t = clamp01(p.charge / p.weapon.derived.chargeTime);
      ctx.strokeStyle = ELEMENTS[p.weapon.element].css;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(cx, cy, 24, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2); ctx.stroke();
    }
    if (p.reloading && p.weapon) {
      const t = 1 - clamp01(p.reloadTimer / (p.weapon.derived.reloadTime || 1));
      ctx.strokeStyle = 'rgba(232,197,106,.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(cx, cy, 26, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2); ctx.stroke();
    }
  }

  _vitals(ctx, W, H, p) {
    const x = 42, y = H - 62, w = 250;
    // shield
    ctx.fillStyle = 'rgba(0,0,0,.42)';
    ctx.fillRect(x - 2, y - 2, w + 4, 26);
    const sFrac = clamp01(p.shield / p.maxShield);
    const hFrac = clamp01(p.hp / p.maxHp);
    ctx.fillStyle = 'rgba(255,255,255,.10)';
    ctx.fillRect(x, y, w, 10);
    ctx.fillStyle = p.superActive ? ELEMENTS[p.superDef.element].css : '#9fd6ff';
    ctx.fillRect(x, y, w * sFrac, 10);
    if (p.overshield > 0) {
      ctx.fillStyle = '#e8c56a';
      ctx.fillRect(x, y - 5, w * clamp01(p.overshield / 320), 3);
    }
    ctx.fillStyle = 'rgba(255,255,255,.10)';
    ctx.fillRect(x, y + 13, w, 8);
    ctx.fillStyle = hFrac > 0.35 ? '#e8eefc' : '#ff6b6b';
    ctx.fillRect(x, y + 13, w * hFrac, 8);

    ctx.font = '600 12px Rajdhani, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#7f90a8';
    ctx.fillText(`${Math.ceil(p.hp)} / ${p.maxHp}`, x, y + 36);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#e8c56a';
    ctx.fillText('POWER ' + p.power, x + w, y + 36);
  }

  _abilities(ctx, W, H, p) {
    const cx = W / 2, y = H - 54;
    const items = [
      { key: 'Q', charge: p.grenadeCharge, label: p.subclass.grenade.name, color: ELEMENTS[p.subclass.grenade.element].css },
      { key: 'E', charge: p.meleeCharge, label: p.subclass.melee.name, color: ELEMENTS[p.element].css },
      { key: 'F', charge: p.classCharge, label: p.classAbility.name, color: '#e8eefc' },
    ];
    const size = 34, gap = 12;
    const total = items.length * size + (items.length - 1) * gap;
    let x = cx - total / 2;
    for (const it of items) {
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.fillRect(x, y, size, size);
      ctx.strokeStyle = it.charge >= 1 ? it.color : 'rgba(126,166,220,.28)';
      ctx.lineWidth = it.charge >= 1 ? 1.8 : 1;
      ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
      ctx.fillStyle = it.charge >= 1 ? it.color + '44' : 'rgba(255,255,255,.10)';
      ctx.fillRect(x + 2, y + size - 2 - (size - 4) * clamp01(it.charge), size - 4, (size - 4) * clamp01(it.charge));
      ctx.font = '700 14px Rajdhani, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = it.charge >= 1 ? '#ffffff' : '#7f90a8';
      ctx.fillText(it.key, x + size / 2, y + size / 2 + 5);
      x += size + gap;
    }

    // super meter: a wide arc under the abilities
    const sw = total + 60;
    const sy = y + size + 12;
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.fillRect(cx - sw / 2 - 1, sy - 1, sw + 2, 8);
    ctx.fillStyle = 'rgba(255,255,255,.10)';
    ctx.fillRect(cx - sw / 2, sy, sw, 6);
    const sc = ELEMENTS[p.superDef.element].css;
    const frac = p.superActive ? clamp01(p.superTime / (p.superDef.duration || 1)) : p.superEnergy;
    ctx.fillStyle = sc;
    ctx.fillRect(cx - sw / 2, sy, sw * frac, 6);
    if (p.superEnergy >= 1 && !p.superActive) {
      const pulse = 0.5 + 0.5 * Math.sin(this.g.time * 6);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - sw / 2, sy, sw, 6);
      ctx.globalAlpha = 1;
      ctx.font = '700 11px Rajdhani, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = sc;
      ctx.fillText('[X] ' + p.superDef.name.toUpperCase(), cx, sy + 20);
    }
    if (p.superActive && p.superDef.casts) {
      ctx.font = '700 11px Rajdhani, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = sc;
      ctx.fillText(`${p.superCasts} REMAINING`, cx, sy + 20);
    }
  }

  _ammo(ctx, W, H, p) {
    const w = p.weapon;
    const x = W - 42, y = H - 62;
    ctx.textAlign = 'right';
    if (!w) {
      ctx.font = '600 14px Rajdhani, sans-serif';
      ctx.fillStyle = '#7f90a8';
      ctx.fillText('NO WEAPON', x, y + 30);
      return;
    }
    const type = w.derived.ammoType;
    ctx.font = '700 40px Rajdhani, DIN Alternate, sans-serif';
    ctx.fillStyle = w.ammo === 0 ? '#ff6b6b' : '#e8eefc';
    ctx.fillText(String(w.ammo), x - 52, y + 32);
    ctx.font = '600 18px Rajdhani, sans-serif';
    ctx.fillStyle = '#7f90a8';
    const reserve = type === 'primary' ? '∞' : String(p.reserves[type]);
    ctx.fillText('/ ' + reserve, x, y + 32);
    ctx.font = '600 13px Rajdhani, sans-serif';
    ctx.fillStyle = RARITY[w.rarity].css;
    ctx.fillText(w.name.toUpperCase(), x, y - 4);
    ctx.font = '600 10px Rajdhani, sans-serif';
    ctx.fillStyle = ELEMENTS[w.element].css;
    ctx.fillText(`${FAMILIES[w.family].name.toUpperCase()} · ${ELEMENTS[w.element].name.toUpperCase()} · ${type.toUpperCase()}`, x, y - 18);

    // slot pips
    const slots = ['kinetic', 'energy', 'power'];
    let px = x - 88;
    for (const s of slots) {
      const has = !!p.weapons[s];
      const on = p.slot === s;
      ctx.fillStyle = on ? '#e8c56a' : has ? 'rgba(232,238,252,.35)' : 'rgba(232,238,252,.12)';
      ctx.fillRect(px, y + 42, 26, 3);
      px += 32;
    }
  }

  _radar(ctx, W, H, g) {
    const cx = 96, cy = 96, r = 62;
    const range = g.player.hasExotic('graven_helm') ? 55 : 38;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(6,10,18,.55)'; ctx.fill();
    ctx.strokeStyle = 'rgba(126,166,220,.3)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();

    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    const yaw = g.player.yaw;
    const cs = Math.cos(-yaw), sn = Math.sin(-yaw);
    for (const e of g.enemies) {
      if (!e.alive) continue;
      const dx = e.pos.x - g.player.pos.x, dz = e.pos.z - g.player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > range) continue;
      // rotate into player space; forward (-Z) maps to screen up
      const rx = dx * cs - dz * sn, rz = dx * sn + dz * cs;
      const sx = cx + (rx / range) * r, sy = cy + (rz / range) * r;
      const dy = e.pos.y - g.player.pos.y;
      const size = e.rank === 'minor' ? 3 : 5;
      ctx.fillStyle = e.rank === 'minor' ? '#ff6b5f' : e.rank === 'major' ? '#ffd45f' : '#ff9d3c';
      ctx.beginPath();
      if (dy > 1.5) { ctx.moveTo(sx, sy - size); ctx.lineTo(sx + size, sy + size); ctx.lineTo(sx - size, sy + size); }
      else if (dy < -1.5) { ctx.moveTo(sx, sy + size); ctx.lineTo(sx + size, sy - size); ctx.lineTo(sx - size, sy - size); }
      else ctx.arc(sx, sy, size, 0, Math.PI * 2);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // player arrow
    ctx.fillStyle = '#e8eefc';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 6); ctx.lineTo(cx + 4.5, cy + 5); ctx.lineTo(cx - 4.5, cy + 5);
    ctx.closePath(); ctx.fill();
  }

  _objective(ctx, W, H, g) {
    const d = g.director;
    if (!d) return;
    ctx.textAlign = 'center';
    ctx.font = '600 14px Rajdhani, sans-serif';
    ctx.fillStyle = '#e8c56a';
    ctx.fillText((d.objective || '').toUpperCase(), W / 2, 34);
    ctx.font = '500 12px Rajdhani, sans-serif';
    ctx.fillStyle = '#a9b8cc';
    ctx.fillText(d.sub || '', W / 2, 52);
    if (d.def.type === 'Survival') {
      ctx.font = '600 12px Rajdhani, sans-serif';
      ctx.fillStyle = '#7f90a8';
      ctx.textAlign = 'right';
      ctx.fillText('SCORE ' + formatNum(d.score), W - 42, 34);
    }
  }

  _bossBar(ctx, W, H) {
    const b = this.boss;
    if (!b || !b.alive) return;
    const w = Math.min(560, W * 0.6), x = (W - w) / 2, y = 74;
    ctx.textAlign = 'center';
    ctx.font = '600 13px Rajdhani, sans-serif';
    ctx.fillStyle = '#e8eefc';
    ctx.fillText(b.def.name.toUpperCase(), W / 2, y - 8);
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.fillRect(x - 2, y - 2, w + 4, 14);
    ctx.fillStyle = 'rgba(255,255,255,.1)';
    ctx.fillRect(x, y, w, 10);
    ctx.fillStyle = b.immune ? '#5f7fa8' : '#ff6b3c';
    ctx.fillRect(x, y, w * clamp01(b.hp / b.maxHp), 10);
    if (b.maxShield > 0 && b.shield > 0) {
      ctx.fillStyle = ELEMENTS[b.shieldElement].css;
      ctx.fillRect(x, y - 6, w * clamp01(b.shield / b.maxShield), 4);
    }
    // phase ticks
    if (b.def.phases) {
      ctx.fillStyle = 'rgba(0,0,0,.7)';
      for (const ph of b.def.phases) {
        if (ph.at >= 1) continue;
        ctx.fillRect(x + w * ph.at - 1, y, 2, 10);
      }
    }
    if (b.immune) {
      ctx.font = '600 11px Rajdhani, sans-serif';
      ctx.fillStyle = '#8fb6e0';
      ctx.fillText('IMMUNE', W / 2, y + 24);
    }
  }

  _damageDirs(ctx, W, H) {
    const cx = W / 2, cy = H / 2;
    for (const d of this.damageDirs) {
      const a = clamp01(d.life / d.max);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(d.omni ? 0 : -d.angle);
      ctx.globalAlpha = a * 0.85;
      ctx.strokeStyle = '#ff5f5f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 78, -Math.PI / 2 - 0.34, -Math.PI / 2 + 0.34);
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  _banner(ctx, W, H) {
    if (this.bannerTime <= 0 || !this.bannerText) return;
    const t = this.bannerTime / 2.6;
    const a = t > 0.85 ? (1 - t) / 0.15 : clamp01(t / 0.3);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.font = '700 30px Rajdhani, DIN Alternate, sans-serif';
    ctx.fillStyle = '#e8eefc';
    ctx.fillText(this.bannerText, W / 2, H * 0.26);
    if (this.bannerSub) {
      ctx.font = '600 14px Rajdhani, sans-serif';
      ctx.fillStyle = '#e8c56a';
      ctx.fillText(this.bannerSub, W / 2, H * 0.26 + 24);
    }
    ctx.globalAlpha = 1;
  }

  _killFeed(ctx, W, H) {
    ctx.textAlign = 'right';
    ctx.font = '600 12px Rajdhani, sans-serif';
    let y = 190;
    for (let i = this.killFeed.length - 1; i >= 0; i--) {
      const k = this.killFeed[i];
      ctx.globalAlpha = clamp01(k.life / 0.8);
      ctx.fillStyle = '#a9b8cc';
      ctx.fillText(k.text, W - 42, y);
      y += 17;
    }
    ctx.globalAlpha = 1;
  }

  _debug(ctx, W, H, g) {
    ctx.textAlign = 'left';
    ctx.font = '600 11px monospace';
    ctx.fillStyle = '#7f90a8';
    const lines = [
      `${g.fps.toFixed(0)} fps · ${g.renderer.drawCalls} draws`,
      `enemies ${g.enemies.length} · fx ${g.fx.particles.length} · proj ${g.projectiles.list.length}`,
      `pos ${g.player.pos.x.toFixed(1)}, ${g.player.pos.y.toFixed(1)}, ${g.player.pos.z.toFixed(1)}`,
    ];
    lines.forEach((l, i) => ctx.fillText(l, 42, H - 120 + i * 14));
  }

  // ================================================================ DOM screens
  _buildScreens() {
    this.toastStack = el('div', '');
    this.toastStack.id = 'toasts';
    this.root.appendChild(this.toastStack);

    this.screens = {};
    this.screens.title = this._buildTitle();
    this.screens.director = this._buildDirector();
    this.screens.character = this._buildCharacter();
    this.screens.pause = this._buildPause();
    this.screens.results = this._buildResults();
    for (const k of Object.keys(this.screens)) {
      this.screens[k].classList.add('hidden');
      this.root.appendChild(this.screens[k]);
    }
  }

  showScreen(name) {
    for (const k of Object.keys(this.screens)) this.screens[k].classList.toggle('hidden', k !== name);
    this.screen = name || null;
    if (name === 'character') this.refreshCharacter();
    if (name === 'director') this.refreshDirector();
    if (name === 'pause') this.refreshPause();
  }

  // ---------------------------------------------------------- title
  _buildTitle() {
    const s = el('div', 'screen centered');
    s.id = 'screen-title';
    const wrap = el('div', '');
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;padding:40px;max-width:1100px';
    wrap.appendChild(el('h1', 'logo', 'STARFALL'));
    wrap.appendChild(el('div', 'tag', 'A looter-shooter in the dark between stars'));

    this.continueRow = el('div', '');
    this.continueRow.style.cssText = 'display:flex;gap:12px;margin-bottom:30px';
    wrap.appendChild(this.continueRow);

    this.classChooseLabel = el('div', 'tag', 'Choose your class');
    wrap.appendChild(this.classChooseLabel);

    const picker = el('div', 'class-picker');
    for (const id of ['warden', 'ranger', 'adept']) {
      const c = CLASSES[id];
      const card = el('div', 'class-card');
      card.innerHTML = `
        <div class="role">${c.role}</div>
        <h3>${c.name}</h3>
        <p>${c.blurb}</p>
        <ul>${c.highlights.map((h) => `<li>${h}</li>`).join('')}</ul>`;
      card.onclick = () => { this.g.audio.ui('click'); this.g.newGame(id); };
      picker.appendChild(card);
    }
    wrap.appendChild(picker);

    const help = el('div', 'tag', '');
    help.style.marginTop = '30px';
    help.innerHTML = '<span class="kbd">WASD</span> move · <span class="kbd">Space</span> jump ×N · ' +
      '<span class="kbd">Shift</span> sprint · <span class="kbd">Ctrl</span> slide · ' +
      '<span class="kbd">Q</span> grenade · <span class="kbd">E</span> melee · <span class="kbd">F</span> class · <span class="kbd">X</span> super';
    wrap.appendChild(help);
    s.appendChild(wrap);
    return s;
  }

  refreshTitle(hasSave) {
    this.continueRow.innerHTML = '';
    if (hasSave) {
      const b = el('button', 'btn primary', 'Continue');
      b.onclick = () => { this.g.audio.ui('click'); this.g.continueGame(); };
      this.continueRow.appendChild(b);
      const w = el('button', 'btn danger', 'New Character');
      w.onclick = () => {
        if (confirm('Delete your current Guardian and start over?')) { this.g.audio.ui('back'); this.g.wipeSave(); }
      };
      this.continueRow.appendChild(w);
      this.classChooseLabel.textContent = 'or start a new Guardian';
    } else {
      this.classChooseLabel.textContent = 'Choose your class';
    }
  }

  // ---------------------------------------------------------- director
  _buildDirector() {
    const s = el('div', 'screen');
    const head = el('div', 'screen-head');
    head.innerHTML = '<h2>Director</h2><span class="sub">Select a destination</span><span class="spacer"></span>';
    this.dirPower = el('span', 'sub', '');
    head.appendChild(this.dirPower);
    s.appendChild(head);
    this.dirBody = el('div', 'screen-body');
    s.appendChild(this.dirBody);
    const foot = el('div', 'screen-foot');
    const b1 = el('button', 'btn small', 'Character  [Tab]');
    b1.onclick = () => { this.g.audio.ui('click'); this.showScreen('character'); };
    foot.appendChild(b1);
    const b2 = el('button', 'btn small', 'Close  [Esc]');
    b2.onclick = () => { this.g.audio.ui('back'); this.g.closeMenus(); };
    foot.appendChild(b2);
    foot.appendChild(el('span', 'spacer'));
    this.dirFootNote = el('span', '', '');
    foot.appendChild(this.dirFootNote);
    s.appendChild(foot);
    return s;
  }

  refreshDirector() {
    const g = this.g;
    const power = g.profile ? computePower(g.equipped()) : POWER.start;
    this.dirPower.textContent = `Power ${power} · Level ${g.profile.level} · ${formatNum(g.profile.shards)} shards`;
    this.dirBody.innerHTML = '';
    const grid = el('div', 'activity-grid');
    for (const a of ACTIVITIES) {
      const locked = power < a.unlockPower;
      const card = el('div', 'activity' + (locked ? ' locked' : ''));
      const delta = powerDelta(power, a);
      const lab = powerLabel(delta);
      card.innerHTML = `
        <div class="type">${a.type}${a.rewardTier !== 'world' ? ' · ' + a.rewardTier.toUpperCase() + ' REWARDS' : ''}</div>
        <h3>${a.name}</h3>
        <div class="desc">${a.desc}</div>
        ${a.modifiers ? `<div class="desc muted">Modifiers: ${a.modifiers.join(' · ')}</div>` : ''}
        <div class="power">
          <span>Recommended ${a.power}</span>
          <span class="rec ${lab.cls}">${locked ? 'Locked — Power ' + a.unlockPower : lab.text}</span>
        </div>`;
      if (!locked) card.onclick = () => { g.audio.ui('click'); g.startActivity(a.id); };
      grid.appendChild(card);
    }
    this.dirBody.appendChild(grid);
    this.dirFootNote.textContent = g.inActivity ? 'Launching abandons your current run' : '';
  }

  // ---------------------------------------------------------- character
  _buildCharacter() {
    const s = el('div', 'screen');
    const head = el('div', 'screen-head');
    head.innerHTML = '<h2>Character</h2>';
    this.charSub = el('span', 'sub', '');
    head.appendChild(this.charSub);
    head.appendChild(el('span', 'spacer'));
    this.charShards = el('span', 'sub', '');
    head.appendChild(this.charShards);
    s.appendChild(head);

    const body = el('div', 'screen-body');
    const layout = el('div', 'char-layout');

    // left column: equipment + stats + subclass
    const left = el('div', '');
    left.style.cssText = 'display:flex;flex-direction:column;gap:16px';
    this.slotPanel = el('div', 'panel');
    this.slotPanel.appendChild(el('h4', '', 'Equipment'));
    this.slotList = el('div', 'slot-list');
    this.slotPanel.appendChild(this.slotList);
    left.appendChild(this.slotPanel);

    this.statPanel = el('div', 'panel');
    this.statPanel.appendChild(el('h4', '', 'Attributes'));
    this.statList = el('div', '');
    this.statPanel.appendChild(this.statList);
    left.appendChild(this.statPanel);

    this.subPanel = el('div', 'panel');
    this.subPanel.appendChild(el('h4', '', 'Subclass'));
    this.subList = el('div', '');
    this.subPanel.appendChild(this.subList);
    left.appendChild(this.subPanel);
    layout.appendChild(left);

    // right column: inventory + detail
    const right = el('div', '');
    right.style.cssText = 'display:grid;grid-template-columns:1fr 320px;gap:16px;align-items:start';
    const invCol = el('div', '');
    this.invToolbar = el('div', 'inv-toolbar');
    invCol.appendChild(this.invToolbar);
    this.invGrid = el('div', 'inv-grid');
    invCol.appendChild(this.invGrid);
    right.appendChild(invCol);

    this.detailPanel = el('div', 'panel detail');
    right.appendChild(this.detailPanel);
    layout.appendChild(right);

    body.appendChild(layout);
    s.appendChild(body);

    const foot = el('div', 'screen-foot');
    const b1 = el('button', 'btn small', 'Director  [M]');
    b1.onclick = () => { this.g.audio.ui('click'); this.showScreen('director'); };
    foot.appendChild(b1);
    const b2 = el('button', 'btn small', 'Close  [Tab]');
    b2.onclick = () => { this.g.audio.ui('back'); this.g.closeMenus(); };
    foot.appendChild(b2);
    foot.appendChild(el('span', 'spacer'));
    foot.appendChild(el('span', '', 'Click an item to inspect · Double-click to equip'));
    s.appendChild(foot);
    return s;
  }

  refreshCharacter() {
    const g = this.g;
    if (!g.profile) return;
    const eq = g.equipped();
    const power = computePower(eq);
    const cls = CLASSES[g.profile.classId];
    this.charSub.textContent = `${cls.name} · Level ${g.profile.level} · Power ${power}`;
    this.charShards.textContent = `${formatNum(g.profile.shards)} shards`;

    // --- equipment slots
    this.slotList.innerHTML = '';
    for (const slot of SLOT_ORDER) {
      const it = eq[slot];
      const row = el('div', 'slot' + (this.selected && it && this.selected.uid === it.uid ? ' active' : ''));
      const meta = it
        ? `<div class="name ${'r-' + it.rarity}">${it.name}</div><div class="sub">${itemSubtitle(it)}</div>`
        : `<div class="name empty">Empty</div><div class="sub">${slot}</div>`;
      row.innerHTML = `<div class="icon">${{ kinetic: '◆', energy: '◇', power: '✦', helmet: '⌂', arms: '⊐', chest: '⬔', legs: '⋔', class: '❖' }[slot]}</div>
        <div class="meta">${meta}</div><div class="pw">${it ? it.power : '—'}</div>`;
      if (it) row.onclick = () => { this.selected = it; this.refreshCharacter(); };
      this.slotList.appendChild(row);
    }

    // --- attributes
    this.statList.innerHTML = '';
    const stats = g.playerStats();
    for (const st of STATS) {
      const v = stats[st.id];
      const tier = statTier(v);
      const row = el('div', 'stat-row');
      row.innerHTML = `<span class="label">${st.name}</span>
        <span class="bar"><i style="width:${clamp01(v / 100) * 100}%"></i></span>
        <span class="val">${v} <small>T${tier}</small></span>`;
      row.title = st.desc;
      this.statList.appendChild(row);
    }

    // --- subclass picker
    this.subList.innerHTML = '';
    for (const id of cls.subclasses) {
      const sc = SUBCLASSES[id];
      const sup = SUPERS[sc.super];
      const active = g.profile.subclassId === id;
      const row = el('div', 'slot' + (active ? ' active' : ''));
      row.innerHTML = `<div class="icon" style="color:${ELEMENTS[sc.element].css}">◈</div>
        <div class="meta"><div class="name">${sc.name}</div>
        <div class="sub">${ELEMENTS[sc.element].name} · ${sup.name}</div></div>`;
      row.title = `${sc.tagline}\n\nSuper: ${sup.name} — ${sup.desc}\nGrenade: ${sc.grenade.name}\nMelee: ${sc.melee.name}\nPassive: ${sc.passive.name} — ${sc.passive.desc}`;
      row.onclick = () => { g.audio.ui('click'); g.setSubclass(id); this.refreshCharacter(); };
      this.subList.appendChild(row);
    }

    this._refreshInventory();
    this._refreshDetail();
  }

  _refreshInventory() {
    const g = this.g;
    this.invToolbar.innerHTML = '';
    const filters = [['all', 'All'], ['weapon', 'Weapons'], ['armor', 'Armor'], ['exotic', 'Exotic']];
    for (const [id, label] of filters) {
      const c = el('div', 'chip' + (this.invFilter === id ? ' on' : ''), label);
      c.onclick = () => { this.invFilter = id; this._refreshInventory(); };
      this.invToolbar.appendChild(c);
    }
    this.invToolbar.appendChild(el('span', 'spacer'));
    for (const [id, label] of [['power', 'Power'], ['score', 'Quality'], ['name', 'Name']]) {
      const c = el('div', 'chip' + (this.invSort === id ? ' on' : ''), 'Sort: ' + label);
      c.onclick = () => { this.invSort = id; this._refreshInventory(); };
      this.invToolbar.appendChild(c);
    }
    const bulk = el('button', 'btn small danger', 'Dismantle junk');
    bulk.title = 'Shard every unlocked Common and Uncommon that is not equipped';
    bulk.onclick = () => { g.audio.ui('click'); g.dismantleJunk(); this.refreshCharacter(); };
    this.invToolbar.appendChild(bulk);

    const eqUids = new Set(Object.values(g.profile.equipped));
    let items = g.profile.inventory.slice();
    if (this.invFilter === 'weapon') items = items.filter((i) => i.kind === 'weapon');
    else if (this.invFilter === 'armor') items = items.filter((i) => i.kind === 'armor');
    else if (this.invFilter === 'exotic') items = items.filter((i) => i.rarity === 'exotic');
    items.sort((a, b) => {
      if (this.invSort === 'name') return a.name.localeCompare(b.name);
      if (this.invSort === 'score') return itemScore(b) - itemScore(a);
      return b.power - a.power || itemScore(b) - itemScore(a);
    });

    this.invGrid.innerHTML = '';
    if (!items.length) {
      this.invGrid.appendChild(el('div', 'empty-note', 'Nothing here yet. Go and take some.'));
      return;
    }
    for (const it of items) {
      const equipped = eqUids.has(it.uid);
      const card = el('div', `item-card bd-${it.rarity}${equipped ? ' equipped' : ''}`);
      const tags = [];
      if (equipped) tags.push('EQUIPPED');
      if (it.locked) tags.push('LOCKED');
      if (it.kind === 'armor') tags.push('T' + Math.floor((it.total || 0) / 10) + ' · ' + (it.total || 0));
      card.innerHTML = `
        <div class="name r-${it.rarity}">${it.name}</div>
        <div class="sub">${itemSubtitle(it)}</div>
        <div class="foot"><span class="pw">${it.power}</span>
        <span class="tags">${tags.map((t) => `<span class="tag">${t}</span>`).join('')}</span></div>`;
      card.onclick = () => { this.selected = it; this._refreshDetail(); this._markSelected(); };
      card.ondblclick = () => { g.equipItem(it); this.refreshCharacter(); };
      card.dataset.uid = it.uid;
      this.invGrid.appendChild(card);
    }
    this._markSelected();
  }

  _markSelected() {
    for (const c of this.invGrid.children) {
      if (!c.dataset) continue;
      c.style.outlineColor = '';
      if (this.selected && c.dataset.uid === this.selected.uid) c.style.outline = '1px solid rgba(126,200,255,.8)';
      else c.style.outline = '';
    }
  }

  _refreshDetail() {
    const g = this.g;
    const it = this.selected;
    this.detailPanel.innerHTML = '';
    if (!it) {
      this.detailPanel.appendChild(el('div', 'empty-note', 'Select an item'));
      return;
    }
    const eqUids = new Set(Object.values(g.profile.equipped));
    const equipped = eqUids.has(it.uid);

    this.detailPanel.appendChild(el('div', `title r-${it.rarity}`, it.name));
    this.detailPanel.appendChild(el('div', 'kind', itemSubtitle(it) + ' · Power ' + it.power));

    if (it.kind === 'weapon') {
      const d = it.derived;
      const rows = [
        ['Impact', it.stats.impact], ['Range', it.stats.range], ['Stability', it.stats.stability],
        ['Handling', it.stats.handling], ['Reload', it.stats.reload], ['Magazine', it.stats.magazine],
      ];
      for (const [label, v] of rows) {
        const row = el('div', 'stat-row');
        row.innerHTML = `<span class="label">${label}</span><span class="bar"><i style="width:${v}%"></i></span><span class="val">${v}</span>`;
        this.detailPanel.appendChild(row);
      }
      const info = el('div', 'kind', '');
      info.style.marginTop = '10px';
      info.innerHTML = `${Math.round(d.damage)} dmg · ${Math.round(d.rpm)} rpm · ${d.magazine} rounds · ${d.reloadTime.toFixed(1)}s reload · ${d.crit.toFixed(2)}× precision`;
      this.detailPanel.appendChild(info);
      for (const p of weaponPerkList(it)) {
        const node = el('div', 'perk');
        node.innerHTML = `<div class="pname" ${p.exotic ? 'style="color:#f5d33f"' : ''}>${p.name}</div><div class="pdesc">${p.desc}</div>`;
        this.detailPanel.appendChild(node);
      }
    } else {
      for (const st of STATS) {
        const v = it.stats[st.id] || 0;
        const row = el('div', 'stat-row');
        row.innerHTML = `<span class="label">${st.name}</span><span class="bar"><i style="width:${clamp01(v / 34) * 100}%"></i></span><span class="val">${v}</span>`;
        this.detailPanel.appendChild(row);
      }
      const tot = el('div', 'kind', `Total ${it.total}`);
      tot.style.marginTop = '8px';
      this.detailPanel.appendChild(tot);
      if (it.trait) {
        const node = el('div', 'perk');
        node.innerHTML = `<div class="pname" style="color:#f5d33f">${it.trait.name}</div><div class="pdesc">${it.trait.desc}</div>`;
        this.detailPanel.appendChild(node);
      }
    }

    if (it.flavor) this.detailPanel.appendChild(el('div', 'flavor', it.flavor));

    const actions = el('div', 'detail-actions');
    if (!equipped) {
      const b = el('button', 'btn primary small', 'Equip');
      b.onclick = () => { g.audio.ui('click'); g.equipItem(it); this.refreshCharacter(); };
      actions.appendChild(b);
    }
    const lock = el('button', 'btn small', it.locked ? 'Unlock' : 'Lock');
    lock.onclick = () => { it.locked = !it.locked; g.saveProfile(); this.refreshCharacter(); };
    actions.appendChild(lock);

    if (!equipped && !it.locked) {
      const b = el('button', 'btn small danger', `Dismantle (+${dismantleValue(it)})`);
      b.onclick = () => { g.audio.ui('back'); g.dismantle(it); this.selected = null; this.refreshCharacter(); };
      actions.appendChild(b);
    }

    // infusion: raise this item's power using a higher-power item of the same slot
    const sources = g.profile.inventory.filter((s) => canInfuse(it, s) && !eqUids.has(s.uid) && !s.locked);
    if (sources.length) {
      const best = sources.sort((a, b) => b.power - a.power)[0];
      const cost = infuseCost(it, best);
      const b = el('button', 'btn small', `Infuse → ${best.power} (${cost.shards} shards)`);
      b.disabled = g.profile.shards < cost.shards;
      b.title = 'Consumes: ' + best.name;
      b.onclick = () => { g.audio.ui('click'); g.infuse(it, best); this.refreshCharacter(); };
      actions.appendChild(b);
    }
    this.detailPanel.appendChild(actions);
  }

  // ---------------------------------------------------------- pause
  _buildPause() {
    const s = el('div', 'screen centered');
    const box = el('div', 'panel');
    box.style.cssText = 'width:min(460px,92vw);padding:26px';
    box.appendChild(el('h4', '', 'Paused'));
    this.pauseInfo = el('div', 'kind', '');
    box.appendChild(this.pauseInfo);

    const mk = (label, fn, cls) => {
      const b = el('button', 'btn ' + (cls || ''), label);
      b.style.cssText = 'width:100%;margin-top:8px;text-align:left';
      b.onclick = () => { this.g.audio.ui('click'); fn(); };
      box.appendChild(b);
      return b;
    };
    mk('Resume', () => this.g.closeMenus(), 'primary');
    mk('Character  [Tab]', () => this.showScreen('character'));
    mk('Director  [M]', () => this.showScreen('director'));

    const settings = el('div', '');
    settings.style.marginTop = '18px';
    settings.appendChild(el('h4', '', 'Settings'));
    const slider = (label, min, max, step, get, set, fmt) => {
      const row = el('div', 'stat-row');
      const input = el('input', '');
      input.type = 'range'; input.min = min; input.max = max; input.step = step;
      input.style.cssText = 'flex:1;accent-color:#7fd0ff';
      const val = el('span', 'val', '');
      const sync = () => { input.value = get(); val.textContent = fmt ? fmt(get()) : get(); };
      input.oninput = () => { set(parseFloat(input.value)); val.textContent = fmt ? fmt(get()) : get(); };
      row.appendChild(el('span', 'label', label));
      row.appendChild(input); row.appendChild(val);
      settings.appendChild(row);
      return sync;
    };
    const g = this.g;
    this._syncs = [
      slider('Sensitivity', 0.4, 6, 0.1, () => g.profile.settings.sensitivity,
        (v) => { g.profile.settings.sensitivity = v; g.applySettings(); }, (v) => v.toFixed(1)),
      slider('FOV', 70, 120, 1, () => g.profile.settings.fov,
        (v) => { g.profile.settings.fov = v; g.applySettings(); }),
      slider('Volume', 0, 1, 0.05, () => g.profile.settings.volume,
        (v) => { g.profile.settings.volume = v; g.applySettings(); }, (v) => Math.round(v * 100) + '%'),
      slider('Music', 0, 1, 0.05, () => g.profile.settings.musicVolume,
        (v) => { g.profile.settings.musicVolume = v; g.applySettings(); }, (v) => Math.round(v * 100) + '%'),
    ];
    const invert = el('div', 'stat-row');
    const cb = el('input', ''); cb.type = 'checkbox';
    cb.onchange = () => { g.profile.settings.invertY = cb.checked; g.applySettings(); };
    invert.appendChild(el('span', 'label', 'Invert Y'));
    invert.appendChild(cb);
    settings.appendChild(invert);
    this._invertBox = cb;
    box.appendChild(settings);

    const quit = el('button', 'btn danger', 'Abandon activity');
    quit.style.cssText = 'width:100%;margin-top:18px';
    quit.onclick = () => { this.g.audio.ui('back'); this.g.abandon(); };
    box.appendChild(quit);

    s.appendChild(box);
    return s;
  }

  refreshPause() {
    const g = this.g;
    if (!g.profile) return;
    this.pauseInfo.textContent = g.director
      ? `${g.director.def.name} · ${g.director.objective}`
      : 'In orbit';
    this._invertBox.checked = !!g.profile.settings.invertY;
    for (const s of this._syncs) s();
  }

  // ---------------------------------------------------------- results
  _buildResults() {
    const s = el('div', 'screen centered');
    this.resultsBox = el('div', 'results');
    s.appendChild(this.resultsBox);
    return s;
  }

  showResults(data) {
    const g = this.g;
    this.resultsBox.innerHTML = '';
    this.resultsBox.appendChild(el('h2', '', data.title));
    this.resultsBox.appendChild(el('div', 'verdict ' + (data.win ? 'win' : 'lose'), data.verdict));
    for (const [k, v] of data.rows) {
      this.resultsBox.appendChild(el('div', 'kv', `<span>${k}</span><span>${v}</span>`));
    }
    if (data.rewards && data.rewards.length) {
      const rw = el('div', 'rewards');
      rw.appendChild(el('h4', '', 'Rewards'));
      for (const it of data.rewards) {
        rw.appendChild(el('div', 'kv', `<span class="r-${it.rarity}">${it.name}</span><span>${itemSubtitle(it)} · ${it.power}</span>`));
      }
      this.resultsBox.appendChild(rw);
    }
    const actions = el('div', 'detail-actions');
    const again = el('button', 'btn primary', data.win ? 'Run it again' : 'Retry');
    again.onclick = () => { g.audio.ui('click'); g.startActivity(data.activityId); };
    actions.appendChild(again);
    const orbit = el('button', 'btn', 'Return to orbit');
    orbit.onclick = () => { g.audio.ui('back'); g.returnToOrbit(); };
    actions.appendChild(orbit);
    const chr = el('button', 'btn', 'Character');
    chr.onclick = () => { g.audio.ui('click'); this.showScreen('character'); };
    actions.appendChild(chr);
    this.resultsBox.appendChild(actions);
    this.showScreen('results');
  }
}

const _pt = { x: 0, y: 0, w: 0, sx: 0, sy: 0 };
const _wp = v3();
