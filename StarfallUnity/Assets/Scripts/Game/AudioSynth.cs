using System.Collections.Generic;
using UnityEngine;
using Starfall.Core;

namespace Starfall.Game {

/// <summary>
/// Every sound in the game is generated as PCM at startup — there are no audio
/// files to ship or import. Clips are rendered once into a cache and played
/// through a small pool of AudioSources.
///
/// This is the audio half of the swap layer: replacing it with real recordings
/// means changing Clip() to load from Resources and nothing else.
/// </summary>
public sealed class AudioSynth : MonoBehaviour {

    const int SampleRate = 44100;
    const int VoiceCount = 20;

    readonly Dictionary<string, AudioClip> _clips = new Dictionary<string, AudioClip>();
    AudioSource[] _voices;
    int _nextVoice;
    System.Random _rng = new System.Random(1234);
    float _masterVolume = 0.7f;

    public void Bind() {
        _voices = new AudioSource[VoiceCount];
        for (int i = 0; i < VoiceCount; i++) {
            var go = new GameObject("Voice" + i);
            go.transform.SetParent(transform);
            var src = go.AddComponent<AudioSource>();
            src.playOnAwake = false;
            src.spatialBlend = 0f;      // HUD-space by default; 3D calls set it per-shot
            src.rolloffMode = AudioRolloffMode.Linear;
            src.minDistance = 6f;
            src.maxDistance = 70f;
            _voices[i] = src;
        }
        BuildClips();
    }

    public void SetVolume(float v) { _masterVolume = Mathf.Clamp01(v); }

    // ------------------------------------------------------------- synthesis
    /// <summary>
    /// One-pole low-pass over a noise/oscillator mix with an exponential decay.
    /// Crude by DSP standards, but it is enough to give each weapon family a
    /// recognisable voice, and it costs nothing at runtime once rendered.
    /// </summary>
    AudioClip Render(string name, float seconds,
                     float freqStart, float freqEnd, float noiseMix,
                     float cutoffStart, float cutoffEnd, float attack, float curve,
                     float wave = 0f) {
        int samples = Mathf.Max(16, (int)(SampleRate * seconds));
        var data = new float[samples];
        float phase = 0f;
        float lp = 0f;

        for (int i = 0; i < samples; i++) {
            float t = i / (float)samples;

            // envelope: fast attack, exponential tail
            float env = t < attack ? (t / Mathf.Max(attack, 1e-4f))
                                   : Mathf.Exp(-curve * (t - attack) / Mathf.Max(1f - attack, 1e-4f));

            float freq = Mathf.Lerp(freqStart, freqEnd, t * t);
            phase += freq / SampleRate;
            if (phase > 1f) phase -= Mathf.Floor(phase);

            float tone;
            if (wave < 0.5f) tone = Mathf.Sin(phase * Mathf.PI * 2f);
            else if (wave < 1.5f) tone = phase < 0.5f ? 1f : -1f;                 // square
            else tone = 2f * phase - 1f;                                          // saw

            float noise = (float)(_rng.NextDouble() * 2.0 - 1.0);
            float raw = Mathf.Lerp(tone, noise, noiseMix);

            // one-pole low-pass with a swept cutoff
            float cutoff = Mathf.Lerp(cutoffStart, cutoffEnd, t);
            float k = Mathf.Clamp01(cutoff / (SampleRate * 0.5f));
            lp += (raw - lp) * k;

            data[i] = lp * env;
        }

        var clip = AudioClip.Create(name, samples, 1, SampleRate, false);
        clip.SetData(data, 0);
        _clips[name] = clip;
        return clip;
    }

    void BuildClips() {
        // --- weapons: each family gets its own character
        Render("fire_auto",    0.11f, 320f,  70f, 0.60f, 5200f,  700f, 0.004f, 6f, 1f);
        Render("fire_smg",     0.07f, 420f, 110f, 0.65f, 6200f, 1100f, 0.003f, 7f, 1f);
        Render("fire_pulse",   0.08f, 480f, 150f, 0.55f, 5600f,  900f, 0.003f, 7f, 1f);
        Render("fire_scout",   0.20f, 300f,  70f, 0.55f, 4600f,  420f, 0.004f, 5f, 2f);
        Render("fire_hand",    0.28f, 240f,  50f, 0.62f, 3800f,  300f, 0.004f, 4f, 2f);
        Render("fire_shotgun", 0.38f, 180f,  38f, 0.72f, 3000f,  180f, 0.005f, 3.4f, 2f);
        Render("fire_sniper",  0.55f, 360f,  40f, 0.66f, 6800f,  260f, 0.004f, 3f, 2f);
        Render("fire_fusion",  0.42f,  90f, 900f, 0.35f,  900f, 5000f, 0.10f,  3f, 2f);
        Render("fire_rocket",  0.60f, 320f,  60f, 0.70f, 2200f,  160f, 0.010f, 3f, 2f);
        Render("fire_mg",      0.13f, 220f,  55f, 0.62f, 4200f,  420f, 0.004f, 6f, 1f);

        // --- feedback
        Render("hit",        0.07f, 1400f,  600f, 0.55f, 6000f, 1200f, 0.002f, 9f);
        Render("hit_crit",   0.11f, 2100f, 1100f, 0.40f, 8000f, 2000f, 0.002f, 8f);
        Render("kill",       0.26f,  420f,   90f, 0.60f, 3000f,  240f, 0.004f, 5f, 2f);
        Render("kill_major", 0.55f,  260f,   50f, 0.55f, 2200f,  140f, 0.006f, 3.5f, 2f);
        Render("explode",    0.75f,  180f,   35f, 0.78f, 2000f,  110f, 0.006f, 3f, 2f);
        Render("explode_big",1.20f,  120f,   24f, 0.80f, 1500f,   80f, 0.010f, 2.4f, 2f);
        Render("shield_break",0.36f, 700f, 1900f, 0.45f, 4000f, 2600f, 0.004f, 5f, 1f);
        Render("ricochet",   0.14f, 2400f,  700f, 0.30f, 7000f, 1600f, 0.002f, 9f);

        // --- player state
        Render("hurt",       0.24f,  180f,   70f, 0.55f, 1200f,  200f, 0.004f, 5f, 2f);
        Render("shield_down",0.42f,  900f,  180f, 0.35f, 3200f,  500f, 0.006f, 4f, 2f);
        Render("shield_up",  0.34f,  420f, 1050f, 0.15f, 4600f, 3000f, 0.05f,  4f);
        Render("die",        1.50f,  300f,   28f, 0.55f, 1800f,  120f, 0.010f, 2.2f, 2f);
        Render("revive",     0.70f,  330f,  880f, 0.10f, 5200f, 4000f, 0.05f,  3f);
        Render("still",      0.90f,  600f,   90f, 0.30f, 3600f,  260f, 0.010f, 2.6f);
        Render("footstep",   0.06f,  140f,   70f, 0.85f, 1400f,  400f, 0.002f, 10f);

        // --- abilities
        Render("jump",       0.10f,  260f,  480f, 0.35f, 3200f, 2200f, 0.003f, 8f, 1f);
        Render("disperse",   0.28f,  900f, 2200f, 0.45f, 5200f, 3200f, 0.004f, 6f, 1f);
        Render("grenade",    0.24f,  300f,  900f, 0.25f, 3600f, 4200f, 0.006f, 6f);
        Render("melee",      0.22f,  520f,  110f, 0.55f, 3800f,  400f, 0.003f, 6f, 1f);
        Render("shed",       0.40f,  240f,  740f, 0.30f, 3000f, 4200f, 0.020f, 4f);
        Render("super_cast", 1.40f,  140f,  480f, 0.25f, 2000f, 5200f, 0.15f,  2f, 2f);
        Render("super_ready",0.65f,  660f, 1320f, 0.05f, 6000f, 6000f, 0.010f, 3.5f);
        Render("charge",     0.55f,  120f,  780f, 0.20f, 1400f, 4200f, 0.06f,  3f);

        // --- reload / ui
        Render("reload_a",   0.09f,  300f,  120f, 0.80f, 2800f,  600f, 0.003f, 9f);
        Render("reload_b",   0.09f,  420f,  160f, 0.80f, 3600f,  800f, 0.003f, 9f);
        Render("dry_fire",   0.05f,  260f,  120f, 0.85f, 2000f,  500f, 0.002f, 12f);
        Render("pickup",     0.16f,  880f, 1320f, 0.05f, 6000f, 6000f, 0.005f, 6f);
        Render("ammo",       0.13f,  520f,  780f, 0.10f, 5000f, 5000f, 0.005f, 7f);
        Render("ui_click",   0.05f, 1200f, 1800f, 0.10f, 5000f, 5000f, 0.002f, 10f, 1f);
        Render("ui_back",    0.07f,  700f,  420f, 0.10f, 4000f, 4000f, 0.002f, 10f, 1f);
        Render("ui_error",   0.18f,  220f,  160f, 0.10f, 2000f, 2000f, 0.004f, 7f, 1f);
        Render("objective",  0.80f,  392f,  784f, 0.05f, 6000f, 6000f, 0.010f, 3f);
        Render("warn",       0.55f,  300f,  240f, 0.10f, 1800f, 1600f, 0.006f, 4f, 1f);
        Render("level_up",   0.95f,  523f, 1318f, 0.04f, 7000f, 7000f, 0.010f, 2.6f);
        Render("loot",       0.60f,  660f, 1320f, 0.04f, 7000f, 7000f, 0.008f, 3f);
        Render("loot_exotic",1.10f,  392f, 1568f, 0.03f, 8000f, 8000f, 0.010f, 2.2f);
    }

    // ------------------------------------------------------------- playback
    void Play(string key, float volume, float pitch, Vector3? position) {
        AudioClip clip;
        if (_voices == null || !_clips.TryGetValue(key, out clip) || clip == null) return;
        var src = _voices[_nextVoice];
        _nextVoice = (_nextVoice + 1) % _voices.Length;
        src.clip = clip;
        src.volume = Mathf.Clamp01(volume) * _masterVolume;
        src.pitch = Mathf.Clamp(pitch, 0.3f, 3f);
        if (position.HasValue) {
            src.spatialBlend = 1f;
            src.transform.position = position.Value;
        } else {
            src.spatialBlend = 0f;
            src.transform.localPosition = Vector3.zero;
        }
        src.Play();
    }

    static float Vary(System.Random r, float spread) => 1f + (float)(r.NextDouble() * 2.0 - 1.0) * spread;

    // ------------------------------------------------------------- API
    public void Fire(string family, Vector3? at = null) =>
        Play("fire_" + family, 0.55f, Vary(_rng, 0.06f), at);
    public void DryFire() => Play("dry_fire", 0.4f, 1f, null);
    public void Charge() => Play("charge", 0.45f, 1f, null);
    public void Reload(int stage) => Play(stage == 0 ? "reload_a" : "reload_b", 0.5f, Vary(_rng, 0.08f), null);

    public void Hit(bool crit) => Play(crit ? "hit_crit" : "hit", crit ? 0.5f : 0.38f, Vary(_rng, 0.1f), null);
    public void Kill(bool major) => Play(major ? "kill_major" : "kill", 0.6f, Vary(_rng, 0.06f), null);
    public void Explode(bool big, Vector3 at) => Play(big ? "explode_big" : "explode", 0.7f, Vary(_rng, 0.06f), at);
    public void ShieldBreak(Vector3 at) => Play("shield_break", 0.6f, 1f, at);
    public void Ricochet(Vector3 at) => Play("ricochet", 0.3f, Vary(_rng, 0.2f), at);

    public void Hurt(float severity) => Play("hurt", 0.4f + severity * 0.3f, Vary(_rng, 0.08f), null);
    public void ShieldDown() => Play("shield_down", 0.55f, 1f, null);
    public void ShieldUp() => Play("shield_up", 0.4f, 1f, null);
    public void Die() => Play("die", 0.8f, 1f, null);
    public void Revive() => Play("revive", 0.6f, 1f, null);
    public void Still() => Play("still", 0.75f, 1f, null);
    public void Footstep() => Play("footstep", 0.16f, Vary(_rng, 0.18f), null);

    public void Jump() => Play("jump", 0.35f, Vary(_rng, 0.08f), null);
    public void Disperse() => Play("disperse", 0.5f, Vary(_rng, 0.1f), null);
    public void Grenade() => Play("grenade", 0.5f, 1f, null);
    public void Melee() => Play("melee", 0.55f, Vary(_rng, 0.08f), null);
    public void Shed() => Play("shed", 0.6f, 1f, null);
    public void SuperCast() => Play("super_cast", 0.8f, 1f, null);
    public void SuperReady() => Play("super_ready", 0.6f, 1f, null);

    public void Pickup() => Play("pickup", 0.45f, 1f, null);
    public void AmmoPickup() => Play("ammo", 0.4f, 1f, null);
    public void Loot(Rarity rarity) =>
        Play(rarity == Rarity.Exotic ? "loot_exotic" : "loot",
             rarity == Rarity.Exotic ? 0.75f : 0.5f,
             rarity >= Rarity.Legendary ? 1f : 1.15f, null);
    public void Objective() => Play("objective", 0.6f, 1f, null);
    public void Warn() => Play("warn", 0.6f, 1f, null);
    public void LevelUp() => Play("level_up", 0.7f, 1f, null);
    public void Ui(string kind) => Play("ui_" + kind, 0.35f, 1f, null);
}
}
