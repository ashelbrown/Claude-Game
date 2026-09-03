using UnityEngine;

namespace Starfall.Game {

/// <summary>
/// Entry point. The whole game is constructed from code, so this is the only
/// thing a scene ever needs to contain — and the RuntimeInitializeOnLoadMethod
/// below means it does not even need that: pressing Play on an empty scene
/// starts the game.
/// </summary>
[DisallowMultipleComponent]
public sealed class Bootstrap : MonoBehaviour {

    static bool _started;
    public static GameManager Game { get; private set; }

    /// <summary>
    /// Runs after the first scene loads, whichever scene that is. Keeping the
    /// boot path here rather than in a prefab means there is nothing to wire up
    /// in the editor and nothing that can be left unassigned.
    /// </summary>
    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    static void AutoStart() {
        if (_started) return;
        var existing = FindObjectOfType<Bootstrap>();
        if (existing == null) {
            var go = new GameObject("Starfall");
            go.AddComponent<Bootstrap>();
        }
    }

    void Awake() {
        if (_started) { Destroy(gameObject); return; }
        _started = true;
        DontDestroyOnLoad(gameObject);

        QualitySettings.vSyncCount = 1;
        Application.targetFrameRate = 144;

        var host = new GameObject("GameManager");
        host.transform.SetParent(transform);
        Game = host.AddComponent<GameManager>();
        Game.Boot();
    }

    void OnApplicationQuit() {
        if (Game != null && Game.Profile != null) SaveSystem.Save(Game.Profile);
    }
}
}
