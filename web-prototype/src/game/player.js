// The Guardian: movement, gunplay, abilities and Supers.
//
// Derived numbers all flow from equipped gear: armor stats set health, speed and
// cooldowns; weapon rolls set damage, recoil and handling; perks and exotic
// traits hook into the shot/kill/reload pipeline.

import {
  v3, vset, vcopy, vnorm, vdistXZ, clamp, clamp01, lerp, damp,
  dirFromAngles, coneSpread, randRange, rayAabb, aabb,
} from '../core/math.js';
import { ELEMENTS, statTier, POWER, powerDamageOut, powerDamageIn } from '../data/defs.js';
import { CLASSES, SUBCLASSES, SUPERS, CLASS_ABILITIES } from '../data/subclasses.js';
import { weaponHooks, weaponDerived } from './loot.js';

const GRAVITY = 26;
const EYE_HEIGHT = 1.62;
const CROUCH_EYE = 1.05;

export class Player {
  constructor(game) {
    this.g = game;
    this.pos = v3(0, 1, 0);
    this.vel = v3();
    this.yaw = 0; this.pitch = 0;
    this.radius = 0.38;
    this.height = 1.8;
    this.alive = true;

    // --- movement state
    this.grounded = false;
    this.jumpsLeft = 2;
    this.sprinting = false;
    this.crouching = false;
    this.sliding = false;
    this.slideTime = 0;
    this.eyeY = EYE_HEIGHT;
    this.bob = 0;
    this.stepDist = 0;
    this.coyote = 0;

    // --- combat state
    this.slot = 'kinetic';
    this.weapons = { kinetic: null, energy: null, power: null };
    this.reserves = { primary: 999, special: 24, heavy: 8 };
    this.fireTimer = 0;
    this.reloadTimer = 0;
    this.reloading = false;
    this.charge = 0;
    this.burstQueue = 0;
    this.burstTimer = 0;
    this.ads = 0;
    this.swapTimer = 0;
    this.recoilPitch = 0; this.recoilYaw = 0;
    this.recoilVelP = 0; this.recoilVelY = 0;
    this.viewKick = 0;
    this.combatTime = 0;
    this.lastDamageTime = -99;
    this.triggerHeld = 0;

    // --- vitals
    this.hp = 100; this.maxHp = 100;
    this.shield = 100; this.maxShield = 100;
    this.overshield = 0;
    this.shieldDelay = 5.5; this.healthDelay = 8.5;
    this.shieldRegen = 60; this.healthRegen = 14;
    this.regenTimer = 0;

    // --- abilities
    this.grenadeCharge = 1; this.meleeCharge = 1; this.classCharge = 1;
    this.superEnergy = 0;
    this.superActive = false;
    this.superTime = 0;
    this.superCasts = 0;
    this.superFireTimer = 0;
    this.superWasReady = false;
    this.invisible = 0;
    this.empower = 0; this.empowerTimer = 0;
    this.meleeBuff = 1; this.meleeBuffTimer = 0;
    this.damageResist = 0;
    this.sprintCharge = 0;
    this.markedTarget = null;

    // --- structures owned by the player
    this.barricade = null;
    this.dodgeTimer = 0;
    this.dodgeDir = v3();
    this.invuln = 0;

    this.classId = 'warden';
    this.subclassId = 'emberforge';
    this.stats = { resilience: 0, mobility: 0, recovery: 0, discipline: 0, intellect: 0, strength: 0 };
    this.exoticTraits = new Set();
    this.power = POWER.start;
    this.kills = 0;
    this.deaths = 0;
  }

  // ---------------------------------------------------------------- setup
  get cls() { return CLASSES[this.classId]; }
  get subclass() { return SUBCLASSES[this.subclassId]; }
  get superDef() { return SUPERS[this.subclass.super]; }
  get classAbility() { return CLASS_ABILITIES[this.cls.classAbility]; }
  get weapon() { return this.weapons[this.slot]; }
  get element() { return this.subclass.element; }

  /** Rebuild every derived number from the equipped loadout. */
  applyLoadout(profile) {
    this.classId = profile.classId;
    this.subclassId = profile.subclassId;
    this.power = profile.power;
    this.stats = profile.stats;
    this.weapons.kinetic = profile.equipped.kinetic || null;
    this.weapons.energy = profile.equipped.energy || null;
    this.weapons.power = profile.equipped.power || null;

    this.exoticTraits.clear();
    for (const s of ['helmet', 'arms', 'chest', 'legs', 'class']) {
      const it = profile.equipped[s];
      if (it && it.exoticId) this.exoticTraits.add(it.exoticId);
    }

    const t = (k) => statTier(this.stats[k]);
    this.maxHp = Math.round(100 + t('resilience') * 5.2);
    this.maxShield = Math.round(95 + t('resilience') * 4.4);
    this.shieldDelay = 6.0 - t('recovery') * 0.26;
    this.healthDelay = this.shieldDelay + 3.2;
    this.shieldRegen = 52 + t('recovery') * 7.5;
    this.healthRegen = 12 + t('recovery') * 2.4;
    this.moveSpeed = this.cls.moveSpeed * (0.93 + t('mobility') * 0.015);
    this.jumpPower = this.cls.jumpPower;
    this.maxJumps = this.cls.jumps;

    const sub = this.subclass;
    this.grenadeCd = sub.grenade.cooldown * (1.22 - t('discipline') * 0.052);
    this.meleeCd = sub.melee.cooldown * (1.22 - t('strength') * 0.052);
    this.classCd = this.classAbility.cooldown * (1.22 - t('recovery') * 0.035);
    this.superCd = 105 * (1.28 - t('intellect') * 0.050);

    if (!this.weapon || !this.weapons[this.slot]) {
      this.slot = this.weapons.kinetic ? 'kinetic' : this.weapons.energy ? 'energy' : 'power';
    }
    for (const s of ['kinetic', 'energy', 'power']) {
      const w = this.weapons[s];
      if (w) { w.derived = weaponDerived(w); w.rt ||= { buffs: {} }; if (w.ammo == null) w.ammo = w.derived.magazine; }
    }
  }

  hasExotic(id) { return this.exoticTraits.has(id); }

  respawn(pos, yaw = 0) {
    vcopy(this.pos, pos);
    this.pos.y += 0.1;
    vset(this.vel, 0, 0, 0);
    this.yaw = yaw; this.pitch = 0;
    this.alive = true;
    this.hp = this.maxHp; this.shield = this.maxShield; this.overshield = 0;
    this.regenTimer = 0;
    this.invuln = 1.2;
    this.superActive = false;
    this.sliding = false;
    this.reloading = false;
    this.burstQueue = 0;
    this.charge = 0;
    for (const s of ['kinetic', 'energy', 'power']) {
      const w = this.weapons[s];
      if (w) w.ammo = w.derived.magazine;
    }
  }

  fullHeal() { this.hp = this.maxHp; this.shield = this.maxShield; }

  // ---------------------------------------------------------------- geometry
  eye(out = v3()) { out.x = this.pos.x; out.y = this.pos.y + this.eyeY; out.z = this.pos.z; return out; }
  center(out = v3()) { out.x = this.pos.x; out.y = this.pos.y + this.height * 0.5; out.z = this.pos.z; return out; }
  aimPoint(out = v3()) { return this.eye(out); }
  forward(out = v3()) { return dirFromAngles(this.yaw + this.recoilYaw, this.pitch + this.recoilPitch, out); }

  rayHit(origin, dir, maxT, pad = 0) {
    _box.minx = this.pos.x - this.radius - pad; _box.maxx = this.pos.x + this.radius + pad;
    _box.miny = this.pos.y; _box.maxy = this.pos.y + this.height + pad;
    _box.minz = this.pos.z - this.radius - pad; _box.maxz = this.pos.z + this.radius + pad;
    const t = rayAabb(origin, dir, _box, maxT);
    return t >= 0 ? { t, crit: false } : null;
  }

  // ---------------------------------------------------------------- damage
  takeDamage(amount, opts = {}) {
    const g = this.g;
    if (!this.alive || this.invuln > 0) return 0;
    let dmg = amount * powerDamageIn(this.power, g.activityPower) * (1 - this.damageResist);
    if (this.superActive) dmg *= 1 - (this.superDef.damageResist || 0);
    if (dmg <= 0) return 0;

    let remaining = dmg;
    if (this.overshield > 0) {
      const used = Math.min(this.overshield, remaining);
      this.overshield -= used; remaining -= used;
    }
    const hadShield = this.shield > 0;
    if (remaining > 0 && this.shield > 0) {
      const used = Math.min(this.shield, remaining);
      this.shield -= used; remaining -= used;
      if (hadShield && this.shield <= 0) { g.audio.shieldDown(); g.fx.addShake(0.3); }
    }
    if (remaining > 0) this.hp -= remaining;

    this.regenTimer = 0;
    this.lastDamageTime = g.time;
    g.fx.addShake(clamp(dmg / 90, 0.06, 0.5));
    g.audio.hurt(clamp(dmg / 60, 0.4, 1.4));
    g.ui.flashDamage(opts.pos ? this._damageAngle(opts.pos) : null, clamp01(dmg / 70));

    if (this.hp <= 0) { this.hp = 0; this.die(); }
    return dmg;
  }

  _damageAngle(from) {
    const dx = from.x - this.pos.x, dz = from.z - this.pos.z;
    const world = Math.atan2(dx, dz);
    return world - (this.yaw + Math.PI);
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.deaths++;
    this.superActive = false;
    this.g.audio.die();
    this.g.fx.addShake(1.0);
    this.g.onPlayerDeath();
  }

  heal(n) {
    if (!this.alive) return;
    const before = this.hp + this.shield;
    this.hp = Math.min(this.maxHp, this.hp + n);
    if (this.hp >= this.maxHp) this.shield = Math.min(this.maxShield, this.shield + (n - (this.maxHp - before)));
    if (this.shield > this.maxShield) this.shield = this.maxShield;
  }

  addOvershield(n) { this.overshield = Math.min(320, this.overshield + n); }
  cloak(dur) { this.invisible = Math.max(this.invisible, dur); }
  buffMelee(mult, dur) { this.meleeBuff = Math.max(this.meleeBuff, mult); this.meleeBuffTimer = Math.max(this.meleeBuffTimer, dur); }
  applyEmpower(amount, dur) { this.empower = Math.max(this.empower, amount); this.empowerTimer = Math.max(this.empowerTimer, dur); }

  chargeAbility(kind, frac) {
    if (kind === 'grenade') this.grenadeCharge = clamp01(this.grenadeCharge + frac);
    else if (kind === 'melee') this.meleeCharge = clamp01(this.meleeCharge + frac);
    else if (kind === 'class') this.classCharge = clamp01(this.classCharge + frac);
    else if (kind === 'super') this.superEnergy = clamp01(this.superEnergy + frac);
  }

  // ---------------------------------------------------------------- update
  update(dt, input) {
    const g = this.g;
    this.invuln = Math.max(0, this.invuln - dt);
    this.invisible = Math.max(0, this.invisible - dt);
    if (this.empowerTimer > 0) { this.empowerTimer -= dt; if (this.empowerTimer <= 0) this.empower = 0; }
    if (this.meleeBuffTimer > 0) { this.meleeBuffTimer -= dt; if (this.meleeBuffTimer <= 0) this.meleeBuff = 1; }

    if (!this.alive) { this._physics(dt, 0, 0); return; }

    this._look(dt, input);
    this._move(dt, input);
    this._vitals(dt);
    this._abilities(dt, input);
    this._weapons(dt, input);
    this._structures(dt);

    if (g.time - this.lastCombat < 5) this.combatTime += dt; else this.combatTime = 0;
    if (this.superActive) this._superUpdate(dt, input);
    else {
      // passive super charge, plus a bonus while sprinting with the Vagabond Sigil
      let rate = 1 / this.superCd;
      if (this.sprinting && this.hasExotic('vagabond_sigil')) rate *= 1.6;
      this.superEnergy = clamp01(this.superEnergy + rate * dt);
      if (this.superEnergy >= 1 && !this.superWasReady) {
        this.superWasReady = true;
        g.audio.superReady();
        g.ui.banner('SUPER READY', 'X');
      }
      if (this.superEnergy < 1) this.superWasReady = false;
    }

    // Stormfeet: sprinting builds a melee charge
    if (this.hasExotic('stormfeet')) {
      if (this.sprinting) this.sprintCharge = clamp01(this.sprintCharge + dt * 0.28);
      else this.sprintCharge = Math.max(0, this.sprintCharge - dt * 0.1);
    }
    if (this.sprinting && this.hasExotic('vagabond_sigil')) {
      const b = dt * 0.055;
      this.grenadeCharge = clamp01(this.grenadeCharge + b);
      this.meleeCharge = clamp01(this.meleeCharge + b);
      this.classCharge = clamp01(this.classCharge + b);
    }
  }

  get lastCombat() { return Math.max(this.lastDamageTime, this._lastKillTime || -99); }

  _look(dt, input) {
    if (!input.locked) return;
    const d = input.lookDelta();
    const sens = this.ads > 0.1 ? 1 / lerp(1, this.weapon?.derived.zoom || 1, this.ads * 0.75) : 1;
    this.yaw += d.yaw * sens;
    this.pitch = clamp(this.pitch + d.pitch * sens, -1.52, 1.52);
    // recoil recovery
    this.recoilVelP = damp(this.recoilVelP, 0, 12, dt);
    this.recoilVelY = damp(this.recoilVelY, 0, 12, dt);
    this.recoilPitch += this.recoilVelP * dt;
    this.recoilYaw += this.recoilVelY * dt;
    this.recoilPitch = damp(this.recoilPitch, 0, 6.5, dt);
    this.recoilYaw = damp(this.recoilYaw, 0, 6.5, dt);
    this.viewKick = damp(this.viewKick, 0, 9, dt);
  }

  _move(dt, input) {
    const g = this.g;
    let ix = 0, iz = 0;
    if (input.isDown('KeyW')) iz -= 1;
    if (input.isDown('KeyS')) iz += 1;
    if (input.isDown('KeyA')) ix -= 1;
    if (input.isDown('KeyD')) ix += 1;
    const mag = Math.hypot(ix, iz);
    if (mag > 0) { ix /= mag; iz /= mag; }

    const wantSprint = input.anyDown('ShiftLeft', 'ShiftRight') && iz < -0.3 && this.ads < 0.3;
    this.sprinting = wantSprint && this.grounded;

    const wantCrouch = input.anyDown('ControlLeft', 'KeyC');
    // slide: crouch while sprinting at speed
    const speedNow = Math.hypot(this.vel.x, this.vel.z);
    if (wantCrouch && !this.crouching && this.grounded && speedNow > this.moveSpeed * 1.05 && this.slideTime <= 0) {
      this.sliding = true; this.slideTime = 0.72;
      this.g.audio.ui('open');
      this.g.fx.burst(this.pos, 10, [0.7, 0.75, 0.85], { speed: 3, size: 0.06, life: 0.4, up: 0.3 });
    }
    this.crouching = wantCrouch;
    if (this.sliding) {
      this.slideTime -= dt;
      if (this.slideTime <= 0 || !this.grounded) this.sliding = false;
    }

    let speed = this.moveSpeed;
    if (this.sprinting) speed *= 1.42;
    if (this.crouching && !this.sliding) speed *= 0.52;
    if (this.ads > 0.1) speed *= lerp(1, 0.55, this.ads);
    if (this.superActive) speed *= this.superDef.speedMult || 1;
    if (this.sliding) speed *= 1.9;

    const cs = Math.cos(this.yaw), sn = Math.sin(this.yaw);
    // camera-relative: forward is -Z rotated by yaw
    const wx = ix * cs - iz * sn;
    const wz = -ix * sn - iz * cs;

    const targetX = wx * speed, targetZ = wz * speed;
    const control = this.grounded ? (this.sliding ? 1.2 : 15) : 4.2;
    if (this.dodgeTimer > 0) {
      this.dodgeTimer -= dt;
      const t = clamp01(this.dodgeTimer / this.classAbility.time);
      const ds = this.classAbility.distance / this.classAbility.time * (0.35 + t);
      this.vel.x = this.dodgeDir.x * ds;
      this.vel.z = this.dodgeDir.z * ds;
    } else if (this.sliding) {
      this.vel.x = damp(this.vel.x, targetX * 0.35, 1.2, dt);
      this.vel.z = damp(this.vel.z, targetZ * 0.35, 1.2, dt);
    } else {
      this.vel.x = damp(this.vel.x, targetX, control, dt);
      this.vel.z = damp(this.vel.z, targetZ, control, dt);
    }

    // jumping
    if (this.grounded) { this.jumpsLeft = this.maxJumps; this.coyote = 0.14; }
    else this.coyote = Math.max(0, this.coyote - dt);
    if (input.consume('Space')) {
      if (this.grounded || this.coyote > 0 || this.jumpsLeft > 0) {
        if (!this.grounded && this.coyote <= 0) this.jumpsLeft--;
        this.vel.y = this.jumpPower * (this.jumpsLeft < this.maxJumps - 1 ? 0.86 : 1);
        this.grounded = false; this.coyote = 0; this.sliding = false;
        if (this.jumpsLeft < this.maxJumps) {
          this.g.fx.burst(this.pos, 8, ELEMENTS[this.element].glow, { speed: 3.5, size: 0.07, life: 0.35, up: 0.2 });
        }
      }
    }

    this._physics(dt, this.vel.x, this.vel.z);

    // view bob and eye height
    const moving = Math.hypot(this.vel.x, this.vel.z);
    this.stepDist += moving * dt;
    this.bob = Math.sin(this.stepDist * 2.4) * clamp01(moving / this.moveSpeed) * (this.grounded ? 1 : 0.2);
    const wantEye = this.sliding ? 0.85 : this.crouching ? CROUCH_EYE : EYE_HEIGHT;
    this.eyeY = damp(this.eyeY, wantEye, 12, dt);

    // footstep audio
    if (this.grounded && moving > 1.5) {
      this._stepTimer = (this._stepTimer || 0) - dt * moving;
      if (this._stepTimer <= 0) { this._stepTimer = 3.4; g.audio.ui('back'); }
    }
  }

  _physics(dt, vx, vz) {
    const world = this.g.world;
    this.vel.y -= GRAVITY * dt;
    if (this.vel.y < -60) this.vel.y = -60;

    const r = this.radius, h = this.height;
    let nx = this.pos.x + vx * dt;
    let nz = this.pos.z + vz * dt;
    let ny = this.pos.y + this.vel.y * dt;

    world.query(Math.min(nx, this.pos.x) - r - 1, Math.min(nz, this.pos.z) - r - 1,
                Math.max(nx, this.pos.x) + r + 1, Math.max(nz, this.pos.z) + r + 1, _near);

    // vertical first, so we land before resolving lateral overlap
    this.grounded = false;
    for (const b of _near) {
      if (this.pos.x + r <= b.minx || this.pos.x - r >= b.maxx) continue;
      if (this.pos.z + r <= b.minz || this.pos.z - r >= b.maxz) continue;
      if (this.vel.y <= 0 && this.pos.y >= b.maxy - 0.06 && ny <= b.maxy) {
        ny = b.maxy; this.vel.y = 0; this.grounded = true;
      } else if (this.vel.y > 0 && this.pos.y + h <= b.miny + 0.06 && ny + h >= b.miny) {
        ny = b.miny - h; this.vel.y = 0;
      }
    }
    this.pos.y = ny;

    const stepUp = 0.62;
    for (const b of _near) {
      if (b.maxy <= this.pos.y + 0.02 || b.miny >= this.pos.y + h) continue;
      const canStep = b.maxy - this.pos.y <= stepUp && this.grounded;
      if (nx + r > b.minx && nx - r < b.maxx && this.pos.z + r > b.minz && this.pos.z - r < b.maxz) {
        if (canStep) { this.pos.y = b.maxy; }
        else { nx = vx > 0 ? b.minx - r - 0.001 : b.maxx + r + 0.001; this.vel.x = 0; }
      }
      if (this.pos.x + r > b.minx && this.pos.x - r < b.maxx && nz + r > b.minz && nz - r < b.maxz) {
        if (canStep) { this.pos.y = b.maxy; }
        else { nz = vz > 0 ? b.minz - r - 0.001 : b.maxz + r + 0.001; this.vel.z = 0; }
      }
    }
    this.pos.x = nx; this.pos.z = nz;
    world.clampToBounds(this.pos, this.radius + 0.4);

    // safety net: never fall out of the level
    if (this.pos.y < -25) {
      const s = world.playerSpawn;
      vset(this.pos, s.x, s.y + 1, s.z);
      vset(this.vel, 0, 0, 0);
      this.takeDamage(40, {});
    }
  }

  _vitals(dt) {
    this.regenTimer += dt;
    if (this.overshield > 0) this.overshield = Math.max(0, this.overshield - dt * 6);
    if (this.regenTimer > this.shieldDelay && this.shield < this.maxShield) {
      const before = this.shield;
      this.shield = Math.min(this.maxShield, this.shield + this.shieldRegen * dt);
      if (before <= 0 && this.shield > 0) this.g.audio.shieldUp();
    }
    if (this.regenTimer > this.healthDelay && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + this.healthRegen * dt);
    }
  }

  // ---------------------------------------------------------------- weapons
  _weapons(dt, input) {
    const g = this.g;
    this.swapTimer = Math.max(0, this.swapTimer - dt);
    const w = this.weapon;

    // slot swap
    const slots = ['kinetic', 'energy', 'power'];
    for (let i = 0; i < 3; i++) {
      if (input.consume('Digit' + (i + 1)) && this.weapons[slots[i]] && this.slot !== slots[i]) {
        this.slot = slots[i]; this.swapTimer = 0.35; this.reloading = false; this.charge = 0;
        this.burstQueue = 0; g.audio.reload(2);
      }
    }
    if (input.mouse.wheel !== 0) {
      const idx = slots.indexOf(this.slot);
      for (let k = 1; k <= 3; k++) {
        const n = slots[(idx + k * (input.mouse.wheel > 0 ? 1 : 2)) % 3];
        if (this.weapons[n]) { this.slot = n; this.swapTimer = 0.35; this.reloading = false; g.audio.reload(2); break; }
      }
    }
    if (!w) return;

    const d = w.derived;
    const hooks = weaponHooks(w);

    // ADS
    const wantAds = (input.mouse.buttons & 2) !== 0 && !this.sprinting && !this.superActive;
    const adsSpeed = 1 / Math.max(0.05, d.adsTime * this._hookMul(hooks, 'modHandling', 1) ** -1);
    this.ads = clamp01(this.ads + (wantAds ? dt * adsSpeed : -dt * adsSpeed * 1.5));

    // reload
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this._finishReload(w, hooks);
    } else if ((input.consume('KeyR') || w.ammo <= 0) && w.ammo < d.magazine && this.reserveFor(w) > 0 && !this.superActive) {
      this._startReload(w, hooks);
    }

    this.fireTimer -= dt;
    if (this.burstQueue > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0) {
        this.burstQueue--;
        this.burstTimer = d.burstDelay;
        this._fireOnce(w, hooks);
      }
      return;
    }

    if (this.superActive) return;

    const trigger = (input.mouse.buttons & 1) !== 0;
    if (trigger) this.triggerHeld += dt; else this.triggerHeld = 0;
    if (w.exoticId === 'the_long_answer') {
      w.rt ||= { buffs: {} };
      w.rt.held = trigger ? Math.min(5, (w.rt.held || 0) + dt * 2) : 0;
    }

    // charge weapons hold, then release
    if (d.chargeTime > 0) {
      if (trigger && !this.reloading && w.ammo > 0 && this.swapTimer <= 0) {
        if (this.charge === 0) g.audio.charge(d.chargeTime);
        this.charge += dt;
        if (this.charge >= d.chargeTime) { this.charge = 0; this._fireOnce(w, hooks); this.fireTimer = d.shotInterval; }
      } else this.charge = 0;
      return;
    }

    const auto = ['auto', 'smg', 'mg', 'sidearm'].includes(w.family);
    const wantShot = auto ? trigger : input.consume('Mouse0');
    if (wantShot && this.fireTimer <= 0 && !this.reloading && this.swapTimer <= 0) {
      if (w.ammo <= 0) {
        if (this.reserveFor(w) > 0) this._startReload(w, hooks);
        else g.audio.dryFire();
        this.fireTimer = 0.25;
        return;
      }
      const rpmMul = this._hookMul(hooks, 'modRpm', 1);
      this.fireTimer = d.shotInterval / rpmMul;
      if (d.burst > 1) {
        this.burstQueue = d.burst - 1;
        this.burstTimer = d.burstDelay;
        this.fireTimer = d.shotInterval / rpmMul + d.burstDelay * d.burst;
      }
      this._fireOnce(w, hooks);
    }
  }

  reserveFor(w) { return this.reserves[w.derived.ammoType] ?? 0; }

  _startReload(w, hooks) {
    if (this.reloading) return;
    const mul = this._hookMul(hooks, 'modReload', 1);
    this.reloading = true;
    this.reloadTimer = w.derived.reloadTime * mul;
    this.g.audio.reload(0);
    this._reloadStage = 0;
  }

  _finishReload(w, hooks) {
    this.reloading = false;
    const need = w.derived.magazine - w.ammo;
    const type = w.derived.ammoType;
    if (type === 'primary') { w.ammo = w.derived.magazine; }
    else {
      const take = Math.min(need, this.reserves[type]);
      w.ammo += take; this.reserves[type] -= take;
    }
    for (const h of hooks) if (h.onReload) h.onReload(w, this.g, {});
    this.g.audio.reload(1);
  }

  _hookMul(hooks, name, base) {
    let v = base;
    for (const h of hooks) if (h[name]) v *= h[name](this.weapon, this.g, _ctx);
    return v;
  }

  /** One trigger pull: pellets, hitscan/projectile, perks, recoil, audio. */
  _fireOnce(w, hooks) {
    const g = this.g;
    const d = w.derived;
    if (w.ammo <= 0) return;
    w.ammo--;

    const eye = this.eye(_eye);
    const dir = this.forward(_dir);
    const spread = lerp(d.spread, d.adsSpread, this.ads) * (this.grounded ? 1 : 1.7) *
      (this.sprinting ? 1.6 : 1) / this._hookMul(hooks, 'modStability', 1);

    const ctx = _ctx;
    ctx.refillMag = 0;
    let anyHit = false, allPellets = true, killedAny = false, critAny = false;

    if (d.projectile) {
      const p = d.projectile;
      coneSpread(dir, spread, Math.random, _shotDir);
      const proj = g.projectiles.spawn({
        pos: eye, vel: { x: _shotDir.x * p.speed, y: _shotDir.y * p.speed, z: _shotDir.z * p.speed },
        team: 'player', damage: this._damageOf(w, hooks, null) , element: w.element,
        color: ELEMENTS[w.element].glow, gravity: p.gravity, splash: p.splash,
        splashDamage: p.splashDamage * this._damageScale(w, hooks, null),
        bounce: p.bounce || 0, fuse: p.fuse || 0, size: 0.2, trailSize: 0.13,
        source: 'weapon', weapon: w, life: 8, lightRadius: 9,
        onImpact: (pr, pos, ent) => { for (const h of hooks) if (h.onProjectileImpact) h.onProjectileImpact(w, g, { pos, target: ent }); },
      });
      void proj;
    } else {
      const pellets = d.pellets;
      for (let i = 0; i < pellets; i++) {
        coneSpread(dir, spread, Math.random, _shotDir);
        const hit = this._hitscan(eye, _shotDir, w, hooks, i, pellets, ctx);
        if (hit.hitEnemy) anyHit = true; else allPellets = false;
        if (hit.killed) killedAny = true;
        if (hit.crit) critAny = true;
      }
    }

    ctx.allPellets = allPellets && d.pellets > 1;
    if (ctx.allPellets) for (const h of hooks) if (h.onHit) h.onHit(w, g, { allPellets: true, pos: this.pos });

    if (ctx.refillMag) w.ammo = Math.min(d.magazine, w.ammo + ctx.refillMag);

    // recoil + feedback
    const stab = this._hookMul(hooks, 'modStability', 1);
    this.recoilVelP += (d.recoilV / stab) * 0.11 * (this.ads > 0.5 ? 0.62 : 1);
    this.recoilVelY += (randRange(-1, 1) * d.recoilH / stab) * 0.11;
    this.viewKick = Math.min(1, this.viewKick + 0.35);
    g.fx.addShake(clamp(d.damage / 900, 0.015, 0.16));
    g.audio.fire(d.sound, 0.85 + (1 - clamp01(d.damage / 200)) * 0.5, 0);
    this._muzzleFlash = 0.055;

    if (anyHit) g.fx.hitmarker(critAny, killedAny);
    this.lastDamageTime = Math.max(this.lastDamageTime, g.time - 4.9);
    void killedAny;
  }

  /** Base per-bullet damage with every multiplicative source folded in. */
  _damageScale(w, hooks, target) {
    _ctx.target = target;
    let mul = 1;
    for (const h of hooks) if (h.modDamage) mul *= h.modDamage(w, this.g, _ctx);
    mul *= 1 + this.empower;
    mul *= powerDamageOut(this.power, this.g.activityPower);
    if (target && this.markedTarget === target) mul *= 1.2;
    return mul;
  }
  _damageOf(w, hooks, target) { return w.derived.damage * this._damageScale(w, hooks, target); }

  _hitscan(origin, dir, w, hooks, pelletIndex, pelletCount, ctx) {
    const g = this.g;
    const d = w.derived;
    const maxRange = Math.max(d.rangeMax * 1.6, 120);
    let best = null, bestT = maxRange, bestCrit = false;

    for (const e of g.enemies) {
      if (!e.alive) continue;
      const h = e.rayHit(origin, dir, bestT, 0);
      if (h && h.t < bestT) { bestT = h.t; best = e; bestCrit = h.crit; }
    }
    const wall = g.world.raycast(origin, dir, bestT);
    if (wall) {
      _hit.x = origin.x + dir.x * wall.t; _hit.y = origin.y + dir.y * wall.t; _hit.z = origin.z + dir.z * wall.t;
      if (pelletIndex < 3) {
        g.fx.impact(_hit, _upNormal, [0.9, 0.85, 0.75], 5);
        g.fx.tracer(origin, _hit, ELEMENTS[w.element].glow, 0.05, 0.02);
      }
      return { hitEnemy: false, killed: false, crit: false };
    }
    if (!best) {
      _hit.x = origin.x + dir.x * 60; _hit.y = origin.y + dir.y * 60; _hit.z = origin.z + dir.z * 60;
      if (pelletIndex < 2) g.fx.tracer(origin, _hit, ELEMENTS[w.element].glow, 0.04, 0.018);
      return { hitEnemy: false, killed: false, crit: false };
    }

    _hit.x = origin.x + dir.x * bestT; _hit.y = origin.y + dir.y * bestT; _hit.z = origin.z + dir.z * bestT;
    if (pelletIndex < 3) g.fx.tracer(origin, _hit, ELEMENTS[w.element].glow, 0.05, 0.022);

    // range falloff
    let dmg = this._damageOf(w, hooks, best);
    if (bestT > d.rangeMin) {
      const t = clamp01((bestT - d.rangeMin) / Math.max(1, d.rangeMax - d.rangeMin));
      dmg *= lerp(1, d.falloff, t);
    }
    let critMul = 1;
    if (bestCrit) {
      critMul = d.crit;
      for (const h of hooks) if (h.modCrit) critMul *= h.modCrit(w, g, _ctx);
      dmg *= critMul;
    }

    ctx.pos = _hit; ctx.target = best; ctx.crit = bestCrit; ctx.damage = dmg; ctx.pelletIndex = pelletIndex;
    const res = g.damageEnemy(best, dmg, { crit: bestCrit, element: w.element, pos: _hit, weapon: w, source: 'weapon' });

    for (const h of hooks) {
      if (h.onHit) h.onHit(w, g, ctx);
      if (bestCrit && h.onPrecisionHit) h.onPrecisionHit(w, g, ctx);
      if (res.killed) {
        if (h.onKill) h.onKill(w, g, ctx);
        if (bestCrit && h.onPrecisionKill) h.onPrecisionKill(w, g, ctx);
      }
    }
    if (res.killed && bestCrit && this.subclass.passive.id === 'lucky') {
      this.superEnergy = clamp01(this.superEnergy + 0.02);
    }
    return { hitEnemy: true, killed: res.killed, crit: bestCrit };
  }

  // ---------------------------------------------------------------- abilities
  _abilities(dt, input) {
    const g = this.g;
    if (this.grenadeCharge < 1) this.grenadeCharge = clamp01(this.grenadeCharge + dt / this.grenadeCd);
    if (this.meleeCharge < 1) this.meleeCharge = clamp01(this.meleeCharge + dt / this.meleeCd);
    if (this.classCharge < 1) this.classCharge = clamp01(this.classCharge + dt / this.classCd);

    if (input.consume('KeyQ') && this.grenadeCharge >= 1) { this.grenadeCharge = 0; this._throwGrenade(); }
    if (input.consume('KeyE') && this.meleeCharge >= 1) { this.meleeCharge = 0; this._doMelee(); }
    if (input.consume('KeyF') && this.classCharge >= 1) { this.classCharge = 0; this._doClassAbility(); }
    if (input.consume('KeyX') && this.superEnergy >= 1 && !this.superActive) this._castSuper();
  }

  _abilityDamage(base) { return base * this.g.difficultyDamageScale * (1 + this.empower); }

  _throwGrenade() {
    const g = this.g;
    const gr = this.subclass.grenade;
    const eye = this.eye(_eye);
    const dir = this.forward(_dir);
    const split = this.hasExotic('astral_coil') ? 3 : 1;
    g.audio.ability('grenade', gr.element);

    for (let i = 0; i < split; i++) {
      const a = split > 1 ? (i - 1) * 0.12 : 0;
      const c = Math.cos(a), s = Math.sin(a);
      _shotDir.x = dir.x * c - dir.z * s; _shotDir.y = dir.y; _shotDir.z = dir.x * s + dir.z * c;
      vnorm(_shotDir, _shotDir);
      const dmgScale = split > 1 ? 0.5 : 1;
      const speed = gr.speed;
      const common = {
        pos: eye, vel: { x: _shotDir.x * speed, y: _shotDir.y * speed + 2, z: _shotDir.z * speed },
        team: 'player', element: gr.element, color: ELEMENTS[gr.element].glow,
        gravity: gr.gravity, size: 0.2, trailSize: 0.12, source: 'grenade', life: 8, lightRadius: 8,
      };

      if (gr.behavior === 'firebolt') {
        g.projectiles.spawn({ ...common, damage: this._abilityDamage(gr.damage * 0.4 * dmgScale),
          splash: gr.radius, splashDamage: this._abilityDamage(gr.damage * dmgScale),
          onDetonate: (p, pos) => {
            for (let k = 0; k < gr.bolts; k++) {
              const e = g.nearestEnemyExcluding(pos, gr.radius * 2.2, k);
              if (!e) break;
              g.applyBurn(e, gr.burn.dps * dmgScale, gr.burn.dur);
              g.fx.lightning(pos, e.center(_tmp), ELEMENTS.ember.glow, 4, 0.2);
              g.damageEnemy(e, this._abilityDamage(gr.damage * 0.35 * dmgScale), { element: 'ember', pos: e.center(_tmp), source: 'grenade' });
            }
          } });
      } else if (gr.behavior === 'pulse') {
        g.projectiles.spawn({ ...common, damage: this._abilityDamage(gr.damage * 0.3 * dmgScale), sticky: true,
          onStick: (p) => {
            g.projectiles.spawnArea({ pos: p.pos, kind: 'pulse', radius: gr.radius, duration: gr.pulses * gr.interval + 0.4,
              element: gr.element, color: ELEMENTS.surge.glow, burst: this._abilityDamage(gr.damage * dmgScale),
              pulses: gr.pulses, pulseInterval: gr.interval, team: 'player' });
            p.dead = true;
          } });
      } else if (gr.behavior === 'vortex') {
        g.projectiles.spawn({ ...common, damage: this._abilityDamage(gr.damage * 0.4 * dmgScale),
          splash: gr.radius * 0.8, splashDamage: this._abilityDamage(gr.damage * dmgScale),
          onDetonate: (p, pos) => {
            g.projectiles.spawnArea({ pos, kind: 'vortex', radius: gr.radius, duration: gr.duration,
              element: 'null', color: ELEMENTS.null.glow, dps: this._abilityDamage(gr.damage * 1.5 * dmgScale) / gr.duration * 2,
              tick: gr.tick, pull: gr.pull, team: 'player' });
          } });
      } else if (gr.behavior === 'tripmine') {
        g.projectiles.spawn({ ...common, damage: 0, sticky: true, gravity: gr.gravity, life: gr.life,
          onStick: (p) => { p.armTime = gr.armTime; p.triggerRadius = gr.radius * 0.62; },
          onDetonate: (p, pos) => g.explode(pos, gr.radius, this._abilityDamage(gr.damage * dmgScale), 'ember', { source: 'grenade' }) });
      } else { // frag
        g.projectiles.spawn({ ...common, damage: this._abilityDamage(gr.damage * 0.3 * dmgScale), bounce: gr.bounce,
          fuse: gr.fuse, splash: gr.radius, splashDamage: this._abilityDamage(gr.damage * dmgScale) });
      }
    }
  }

  _doMelee() {
    const g = this.g;
    const m = this.subclass.melee;
    const mult = this.meleeBuff * (1 + this.sprintCharge * 1.2);
    this.sprintCharge = 0;
    this.meleeBuff = 1; this.meleeBuffTimer = 0;
    g.audio.ability('melee', this.element);
    const eye = this.eye(_eye);
    const dir = this.forward(_dir);

    if (m.behavior === 'charge') {
      this.vel.x = -Math.sin(this.yaw) * m.dashSpeed;
      this.vel.z = -Math.cos(this.yaw) * m.dashSpeed;
      this.vel.y = Math.max(this.vel.y, 1.5);
      this.invuln = Math.max(this.invuln, 0.18);
      this._pendingMelee = { def: m, mult, time: 0.34 };
      g.fx.burst(this.pos, 14, ELEMENTS[this.element].glow, { speed: 6, size: 0.09, life: 0.4 });
    } else if (m.behavior === 'knife') {
      g.projectiles.spawn({
        pos: eye, vel: { x: dir.x * m.speed, y: dir.y * m.speed, z: dir.z * m.speed },
        team: 'player', damage: this._abilityDamage(m.damage * mult), crit: m.critMult || 1.5,
        element: this.element, color: ELEMENTS[this.element].glow, gravity: m.gravity,
        size: 0.14, trailSize: 0.08, source: 'melee', life: 4, splash: m.radius || 0,
        splashDamage: m.radius ? this._abilityDamage(m.damage * 0.5) : 0,
        onImpact: (p, pos, ent) => {
          if (m.cloak) this.cloak(m.cloak);
          if (ent && this.subclassId === 'gunslinger') g.applyBurn(ent, 20, 4);
          if (m.blind && ent) ent.applySuppress(m.blind * 0.4);
        },
      });
    } else { // blast
      const hits = g.enemiesInCone(eye, dir, m.range, 0.85);
      let killed = 0;
      for (const e of hits) {
        const res = g.damageEnemy(e, this._abilityDamage(m.damage * mult), { element: this.element, pos: e.center(_tmp), source: 'melee' });
        if (res.killed) killed++;
      }
      if (hits.length) {
        this.heal(m.heal || 0);
        this._onMeleeKill(killed, hits[0].center(_tmp));
      }
      g.explode(this._pointAhead(m.range * 0.6, _tmp), m.radius, this._abilityDamage(m.damage * 0.4 * mult), this.element,
        { source: 'melee', silent: true });
      g.fx.ring(this._pointAhead(m.range * 0.55, _tmp), m.radius, ELEMENTS[this.element].glow, 0.3, { vertical: true });
    }
  }

  _pointAhead(dist, out) {
    const dir = this.forward(_dir);
    out.x = this.pos.x + dir.x * dist;
    out.y = this.pos.y + 1.1 + dir.y * dist;
    out.z = this.pos.z + dir.z * dist;
    return out;
  }

  _onMeleeKill(count, pos) {
    if (count <= 0) return;
    const g = this.g;
    const w = this.weapon;
    if (w) for (const h of weaponHooks(w)) if (h.onMeleeKill) h.onMeleeKill(w, g, { pos });
    if (this.hasExotic('wardens_oath')) { this.addOvershield(140); this.meleeCharge = 1; }
    if (this.subclass.passive.id === 'flow') { this.meleeCharge = clamp01(this.meleeCharge + 0.4); if (w) w.ammo = w.derived.magazine; }
    if (this.subclass.melee.refundOnKill) this.meleeCharge = clamp01(this.meleeCharge + this.subclass.melee.refundOnKill);
  }

  _doClassAbility() {
    const g = this.g;
    const ab = this.classAbility;
    g.audio.ability('class', this.element);

    if (ab.id === 'barricade') {
      if (this.barricade) { g.world.removeDynamic(this.barricade.box); this.barricade = null; }
      const dir = this.forward(_dir);
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const cx = this.pos.x + fx * 1.6, cz = this.pos.z + fz * 1.6;
      const gy = g.world.groundY(cx, cz, this.pos.y + 1);
      const along = Math.abs(fx) > Math.abs(fz);
      const box = g.world.addDynamic({
        minx: cx - (along ? 0.28 : ab.width / 2), maxx: cx + (along ? 0.28 : ab.width / 2),
        miny: gy, maxy: gy + ab.height,
        minz: cz - (along ? ab.width / 2 : 0.28), maxz: cz + (along ? ab.width / 2 : 0.28),
        color: ELEMENTS[this.element].glow, emissive: 0.5, solid: true,
      });
      this.barricade = { box, life: ab.duration, center: v3(cx, gy + ab.height / 2, cz) };
      g.fx.ring(v3(cx, gy, cz), ab.width, ELEMENTS[this.element].glow, 0.45);
      void dir;
    } else if (ab.id === 'dodge') {
      let ix = 0, iz = 0;
      if (this.g.input.isDown('KeyA')) ix -= 1;
      if (this.g.input.isDown('KeyD')) ix += 1;
      if (this.g.input.isDown('KeyW')) iz -= 1;
      if (this.g.input.isDown('KeyS')) iz += 1;
      if (ix === 0 && iz === 0) iz = 1;
      const cs = Math.cos(this.yaw), sn = Math.sin(this.yaw);
      const wx = ix * cs - iz * sn, wz = -ix * sn - iz * cs;
      const l = Math.hypot(wx, wz) || 1;
      vset(this.dodgeDir, wx / l, 0, wz / l);
      this.dodgeTimer = ab.time;
      this.invuln = Math.max(this.invuln, ab.invulnWindow);
      if (this.weapon) {
        this.weapon.ammo = this.weapon.derived.magazine;
        this.reloading = false;
      }
      if (this.subclass.passive.id === 'vanish') this.cloak(3);
      if (this.hasExotic('ravenclaw')) {
        const e = g.nearestEnemy(this.pos, 30);
        if (e) { this.markedTarget = e; this._markTimer = 12; }
      }
      g.fx.burst(this.pos, 16, ELEMENTS[this.element].glow, { speed: 5, size: 0.07, life: 0.35, up: 0.3 });
    } else { // rift
      const gy = g.world.groundY(this.pos.x, this.pos.z, this.pos.y + 0.6);
      g.projectiles.spawnArea({
        pos: v3(this.pos.x, gy, this.pos.z), kind: 'rift', radius: ab.radius, duration: ab.duration,
        element: this.element, color: ELEMENTS[this.element].glow, team: 'player',
        heal: this.element === 'ember' || this.element === 'null' ? ab.healPerSec : ab.healPerSec * 0.4,
        damageBuff: this.element === 'surge' ? ab.damageBuff * 1.6 : ab.damageBuff,
        tick: 0.25,
      });
      g.fx.ring(v3(this.pos.x, gy, this.pos.z), ab.radius, ELEMENTS[this.element].glow, 0.5);
    }
  }

  _structures(dt) {
    if (this.barricade) {
      this.barricade.life -= dt;
      if (this.hasExotic('ashborne_plate') && vdistXZ(this.pos, this.barricade.center) < 3.2) {
        this.heal(28 * dt);
        this.addOvershield(40 * dt);
      }
      if (this.barricade.life <= 0) {
        this.g.world.removeDynamic(this.barricade.box);
        this.g.fx.burst(this.barricade.center, 12, ELEMENTS[this.element].glow, { speed: 4, size: 0.08, life: 0.4 });
        this.barricade = null;
      }
    }
    if (this._pendingMelee) {
      const pm = this._pendingMelee;
      pm.time -= dt;
      const hits = this.g.enemiesInCone(this.eye(_eye), this.forward(_dir), pm.def.range, 0.55);
      if (hits.length || pm.time <= 0) {
        let killed = 0;
        for (const e of hits) {
          const res = this.g.damageEnemy(e, this._abilityDamage(pm.def.damage * pm.mult), { element: this.element, pos: e.center(_tmp), source: 'melee' });
          if (res.killed) killed++;
        }
        if (hits.length) {
          this.g.explode(hits[0].center(_tmp), pm.def.radius, this._abilityDamage(pm.def.damage * 0.5 * pm.mult), this.element, { source: 'melee' });
          this._onMeleeKill(killed, hits[0].center(_tmp));
          this.vel.x *= 0.2; this.vel.z *= 0.2;
        }
        this._pendingMelee = null;
      }
    }
    if (this._markTimer > 0) { this._markTimer -= dt; if (this._markTimer <= 0) this.markedTarget = null; }
    if (this.markedTarget && !this.markedTarget.alive) this.markedTarget = null;
    if (this._muzzleFlash > 0) this._muzzleFlash -= dt;
  }

  // ---------------------------------------------------------------- supers
  _castSuper() {
    const g = this.g;
    const sd = this.superDef;
    this.superEnergy = 0;
    this.superActive = true;
    this.superTime = sd.duration * (this.hasExotic('nightfall_shroud') ? 1.4 : 1);
    this.superCasts = sd.casts || sd.shots || 1;
    this.superFireTimer = 0;
    this.superWasReady = false;
    g.audio.superCast(sd.element);
    g.fx.addShake(0.8);
    g.fx.burst(this.center(_tmp), 60, ELEMENTS[sd.element].glow, { speed: 12, size: 0.14, life: 0.9 });
    g.fx.ring(this.pos, 7, ELEMENTS[sd.element].glow, 0.6);
    g.ui.banner(sd.name.toUpperCase(), '');
    this.invuln = Math.max(this.invuln, 0.5);

    if (sd.behavior === 'domeWard') {
      const gy = g.world.groundY(this.pos.x, this.pos.z, this.pos.y + 0.6);
      g.projectiles.spawnArea({
        pos: v3(this.pos.x, gy, this.pos.z), kind: 'ward', radius: sd.radius, duration: sd.duration,
        element: sd.element, color: ELEMENTS[sd.element].glow, team: 'player',
        damageBuff: sd.damageBuff, tick: 0.4,
        onTick: (a) => { if (vdistXZ(this.pos, a.pos) < a.radius) this.addOvershield(sd.overshield * 0.4); },
      });
      this.addOvershield(sd.overshield);
      this.superActive = false; // instant cast
    } else if (sd.behavior === 'novaBomb') {
      const dir = this.forward(_dir);
      g.projectiles.spawn({
        pos: this.eye(_eye), vel: { x: dir.x * sd.speed, y: dir.y * sd.speed, z: dir.z * sd.speed },
        team: 'player', damage: this._abilityDamage(sd.damage), element: sd.element,
        color: ELEMENTS[sd.element].glow, gravity: sd.gravity, splash: sd.splash,
        splashDamage: this._abilityDamage(sd.splashDamage), size: 0.6, trailSize: 0.3,
        source: 'super', life: 8, lightRadius: 20,
        onDetonate: (p, pos) => {
          g.projectiles.spawnArea({ pos, kind: 'vortex', radius: sd.splash * 0.6, duration: sd.lingerDuration,
            element: sd.element, color: ELEMENTS[sd.element].glow, dps: this._abilityDamage(sd.lingerDps),
            tick: 0.35, pull: 3, team: 'player' });
          g.fx.addShake(1.2);
          g.audio.explode(true);
        },
      });
      this.superActive = false;
      this.superTime = 0;
    }
  }

  _superUpdate(dt, input) {
    const g = this.g;
    const sd = this.superDef;
    this.superTime -= dt;
    this.superFireTimer -= dt;
    if (this.superTime <= 0 || this.superCasts <= 0) { this._endSuper(); return; }

    // trailing light and particles
    if (Math.random() < dt * 40) {
      g.fx.particle(this.pos.x + randRange(-0.4, 0.4), this.pos.y + Math.random() * 1.8, this.pos.z + randRange(-0.4, 0.4),
        randRange(-0.5, 0.5), randRange(0.5, 2), randRange(-0.5, 0.5),
        { life: 0.5, size: 0.1, color: ELEMENTS[sd.element].glow, gravity: -2, drag: 2 });
    }

    const trigger = (input.mouse.buttons & 1) !== 0;
    const tap = input.consume('Mouse0');

    if (sd.behavior === 'projectileBarrage') {
      if (sd.hover && !this.grounded) this.vel.y = Math.max(this.vel.y, -1.2);
      if ((trigger || tap) && this.superFireTimer <= 0) {
        this.superFireTimer = sd.fireRate;
        this.superCasts--;
        const dir = this.forward(_dir);
        g.projectiles.spawn({
          pos: this.eye(_eye), vel: { x: dir.x * sd.speed, y: dir.y * sd.speed, z: dir.z * sd.speed },
          team: 'player', damage: this._abilityDamage(sd.damage), element: sd.element,
          color: ELEMENTS[sd.element].glow, gravity: sd.gravity, splash: sd.splash,
          splashDamage: this._abilityDamage(sd.splashDamage), size: 0.3, trailSize: 0.16,
          source: 'super', life: 6, lightRadius: 12,
        });
        g.audio.fire('rocket', 1.4, 0);
        this.recoilVelP += 0.5;
      }
    } else if (sd.behavior === 'precisionShots') {
      if (tap && this.superFireTimer <= 0) {
        this.superFireTimer = sd.fireRate;
        this.superCasts--;
        const eye = this.eye(_eye), dir = this.forward(_dir);
        let best = null, bestT = 200, crit = false;
        for (const e of g.enemies) {
          if (!e.alive) continue;
          const h = e.rayHit(eye, dir, bestT, 0.3);
          if (h && h.t < bestT) { bestT = h.t; best = e; crit = h.crit; }
        }
        const wall = g.world.raycast(eye, dir, bestT);
        _hit.x = eye.x + dir.x * (wall ? wall.t : bestT);
        _hit.y = eye.y + dir.y * (wall ? wall.t : bestT);
        _hit.z = eye.z + dir.z * (wall ? wall.t : bestT);
        g.fx.tracer(eye, _hit, ELEMENTS[sd.element].glow, 0.3, 0.09);
        g.fx.burst(_hit, 20, ELEMENTS[sd.element].glow, { speed: 8, size: 0.12, life: 0.5 });
        if (best && !wall) {
          g.damageEnemy(best, this._abilityDamage(sd.damage) * (crit ? 1.4 : 1),
            { crit, element: sd.element, pos: _hit, source: 'super' });
        }
        g.explode(_hit, sd.splash, this._abilityDamage(sd.splashDamage), sd.element, { source: 'super' });
        g.audio.fire('hand', 0.7, 0);
        g.fx.addShake(0.4);
        this.recoilVelP += 0.9;
      }
    } else if (sd.behavior === 'roamingMelee') {
      if (tap && this.superFireTimer <= 0) {
        this.superFireTimer = 0.42;
        const dir = this.forward(_dir);
        this.vel.x = dir.x * sd.dashSpeed; this.vel.z = dir.z * sd.dashSpeed;
        if (dir.y > 0.1) this.vel.y = Math.max(this.vel.y, dir.y * sd.dashSpeed * 0.5);
        this._superStrike = 0.3;
        g.audio.ability('melee', sd.element);
      }
      if (this._superStrike > 0) {
        this._superStrike -= dt;
        const hits = g.enemiesInCone(this.eye(_eye), this.forward(_dir), sd.radius, 0.2);
        for (const e of hits) {
          const res = g.damageEnemy(e, this._abilityDamage(sd.damage), { element: sd.element, pos: e.center(_tmp), source: 'super' });
          g.explode(e.center(_tmp), sd.radius * 0.7, this._abilityDamage(sd.damage * 0.4), sd.element, { source: 'super', silent: true });
          if (sd.chain) g.chainLightning(e.center(_tmp), e, this._abilityDamage(sd.chain.damage), sd.chain.range, sd.chain.targets);
          if (res.killed && sd.refundOnKill) this.superTime += sd.refundOnKill;
          if (res.killed && this.hasExotic('nightfall_shroud')) this.superTime += 0.5;
        }
        if (hits.length) { this._superStrike = 0; g.fx.addShake(0.35); }
      }
      if (sd.lightArc) g.fx.lightning(this.eye(_eye), this._pointAhead(2.2, _tmp), ELEMENTS[sd.element].glow, 3, 0.08);
    } else if (sd.behavior === 'beam') {
      if (trigger) {
        const eye = this.eye(_eye), dir = this.forward(_dir);
        let best = null, bestT = sd.range;
        for (const e of g.enemies) {
          if (!e.alive) continue;
          const h = e.rayHit(eye, dir, bestT, 0.8);
          if (h && h.t < bestT) { bestT = h.t; best = e; }
        }
        const wall = g.world.raycast(eye, dir, bestT);
        const end = _hit;
        const t = wall ? wall.t : bestT;
        end.x = eye.x + dir.x * t; end.y = eye.y + dir.y * t; end.z = eye.z + dir.z * t;
        g.fx.lightning(eye, end, ELEMENTS[sd.element].glow, 5, 0.06);
        if (best && !wall) {
          g.damageEnemy(best, this._abilityDamage(sd.dps) * dt, { element: sd.element, pos: end, source: 'super', tick: true });
          if (sd.chain) g.chainLightning(best.center(_tmp), best, this._abilityDamage(sd.chain.damage) * dt * 3, sd.chain.range, sd.chain.targets, true);
        }
        this.superTime -= dt * 0.35; // channelling drains faster
      }
    } else if (sd.behavior === 'tetherShot') {
      if (tap && this.superFireTimer <= 0) {
        this.superFireTimer = sd.fireRate;
        this.superCasts--;
        const dir = this.forward(_dir);
        g.projectiles.spawn({
          pos: this.eye(_eye), vel: { x: dir.x * 46, y: dir.y * 46, z: dir.z * 46 },
          team: 'player', damage: this._abilityDamage(sd.damage), element: sd.element,
          color: ELEMENTS[sd.element].glow, gravity: 0, size: 0.28, trailSize: 0.15,
          source: 'super', life: 4, lightRadius: 12,
          onDetonate: (p, pos) => {
            g.projectiles.spawnArea({ pos, kind: 'tether', radius: sd.radius, duration: sd.tetherDuration,
              element: sd.element, color: ELEMENTS[sd.element].glow, team: 'player',
              dps: this._abilityDamage(sd.damage * 0.15), tick: 0.5, weaken: sd.weaken, pull: 1 });
            g.fx.ring(pos, sd.radius, ELEMENTS[sd.element].glow, 0.7);
            g.audio.superCast(sd.element);
          },
        });
        g.audio.fire('sniper', 0.8, 0);
      }
    }
  }

  _endSuper() {
    this.superActive = false;
    this.superTime = 0;
    this._superStrike = 0;
    this.g.fx.burst(this.center(_tmp), 20, ELEMENTS[this.superDef.element].glow, { speed: 6, size: 0.1, life: 0.5 });
  }

  onKillCredit(enemy, opts) {
    this._lastKillTime = this.g.time;
    this.kills++;
    // super energy from kills scales with target value
    const gain = enemy.rank === 'boss' ? 0.06 : enemy.rank === 'ultra' ? 0.05 : enemy.rank === 'major' ? 0.035 : 0.011;
    this.superEnergy = clamp01(this.superEnergy + gain);

    const p = this.subclass.passive.id;
    const abilityKill = opts.source === 'grenade' || opts.source === 'melee' || opts.source === 'super' ||
      opts.source === 'vortex' || opts.source === 'burn' || opts.source === 'pulse';
    if (p === 'devour' && abilityKill) { this.fullHeal(); this.grenadeCharge = clamp01(this.grenadeCharge + 0.35); }
    if (p === 'sunwarrior' && abilityKill) { this.heal(45); this.applyEmpower(0.2, 6); }
    if (p === 'controlled' && opts.element === 'null') this.heal(30);
    if (opts.source === 'super' && this.hasExotic('voidbloom_crown')) this.superEnergy = clamp01(this.superEnergy + 0.03);
    if (this.hasExotic('second_wind') && this.hp / this.maxHp < 0.45) {
      this.superEnergy = clamp01(this.superEnergy + 0.03);
      this.applyEmpower(0.25, 5);
    }
    if (opts.source === 'melee') this._onMeleeKill(1, enemy.center(_tmp));
  }

  // ---------------------------------------------------------------- render
  /**
   * First-person view model. Built from small cubes positioned along the camera
   * basis rather than one long box — the renderer only supports yaw rotation, so
   * a chain of short segments is what keeps the weapon aligned when you look up
   * or down.
   */
  render(r, camPos, fwd, right, up) {
    const w = this.weapon;
    const sway = Math.sin(this.stepDist * 2.4) * 0.03 * (this.grounded ? 1 : 0.2);
    const bobY = Math.abs(Math.cos(this.stepDist * 2.4)) * 0.022;
    const ads = this.ads;
    const kick = this.viewKick;

    // camera-space placement helper: forward / right / up offsets, in metres
    const put = (fo, ro, uo, size, col, em) => {
      const x = camPos.x + fwd.x * fo + right.x * ro + up.x * uo;
      const y = camPos.y + fwd.y * fo + right.y * ro + up.y * uo;
      const z = camPos.z + fwd.z * fo + right.z * ro + up.z * uo;
      r.box(x, y, z, size, size, size, this.yaw, col, em, em > 0.9);
    };

    if (this.superActive) {
      const el = ELEMENTS[this.superDef.element].glow;
      const t = this.g.time * 6;
      for (let i = 0; i < 5; i++) {
        const f = 0.95 + i * 0.09;
        put(f, 0.40 + sway, -0.28 + bobY + Math.sin(t + i) * 0.02, 0.038, el, 1);
        put(f, -0.40 - sway, -0.28 + bobY - Math.sin(t + i) * 0.02, 0.038, el, 1);
      }
      r.addLight(camPos, el, 14, 1.4);
      return;
    }
    if (!w) return;

    const d = w.derived;
    // longer archetypes get a longer silhouette
    const barrelSegs = d.rangeMax > 70 ? 6 : d.rangeMax > 45 ? 4 : 3;
    const bulk = w.family === 'shotgun' || w.family === 'mg' || w.family === 'rocket' ? 1.35 : 1;

    const recoilBack = kick * 0.10;
    const reloadDip = this.reloading
      ? Math.sin(clamp01(1 - this.reloadTimer / (d.reloadTime || 1)) * Math.PI) : 0;

    const fo = lerp(0.86, 0.80, ads) - recoilBack;
    const ro = lerp(0.42, 0.0, ads) + sway * (1 - ads);
    const uo = lerp(-0.34, -0.105, ads) + bobY * (1 - ads) - kick * 0.03 - reloadDip * 0.22;

    const body = w.rarity === 'exotic' ? [0.55, 0.46, 0.20] : [0.30, 0.32, 0.38];
    const dark = w.rarity === 'exotic' ? [0.34, 0.28, 0.13] : [0.17, 0.18, 0.22];
    const accent = ELEMENTS[w.element].glow;
    const s = 0.036 * bulk;

    // receiver
    for (let i = 0; i < 4; i++) put(fo + i * 0.075, ro, uo, s, body, 0);
    // barrel
    for (let i = 0; i < barrelSegs; i++) put(fo + 0.30 + i * 0.065, ro, uo + 0.004, s * 0.55, dark, 0);
    // stock, grip, magazine
    put(fo - 0.085, ro, uo + 0.005, s * 0.9, dark, 0);
    put(fo - 0.16, ro, uo - 0.01, s * 0.8, dark, 0);
    put(fo + 0.02, ro, uo - 0.075, s * 0.85, dark, 0);
    put(fo + 0.10, ro, uo - 0.062, s * 0.7, dark, 0);
    // sight and element strip
    put(fo + 0.20, ro, uo + 0.052, s * 0.42, dark, 0);
    for (let i = 0; i < 3; i++) put(fo + 0.06 + i * 0.075, ro, uo + 0.040, s * 0.30, accent, 1);

    if (this.charge > 0) {
      const c = clamp01(this.charge / Math.max(d.chargeTime, 0.001));
      put(fo + 0.30 + barrelSegs * 0.065, ro, uo, 0.02 + c * 0.06, accent, 1);
      r.addLight(camPos, accent, 7 * c, 1.2 * c);
    }
    if (this._muzzleFlash > 0) {
      const f = this._muzzleFlash / 0.055;
      put(fo + 0.30 + barrelSegs * 0.065, ro, uo + 0.006, 0.055 * f, accent, 1);
      r.addLight(camPos, accent, 11 * f, 1.8 * f);
    }
    // a soft fill so the weapon reads against dark environments
    r.addLight(camPos, [0.55, 0.62, 0.78], 3.2, 0.7);
  }
}

const _eye = v3(), _dir = v3(), _shotDir = v3(), _hit = v3(), _tmp = v3();
const _upNormal = v3(0, 1, 0);
const _box = aabb(0, 0, 0, 0, 0, 0);
const _near = [];
const _ctx = { target: null, crit: false, damage: 0, pos: null, refillMag: 0, pelletIndex: 0, allPellets: false };
