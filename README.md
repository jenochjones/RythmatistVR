# Rithmatist VR — Duel of Chalklings

A browser-based, WebXR VR duel for Meta Quest 2 and later headsets — no install,
no build step, no server. Open the page in the Meta Quest Browser and play.

Fan-made tribute inspired by *The Rithmatist* by Brandon Sanderson.
Not affiliated with the author or publisher.

## Play it

**Hosted version (after GitHub Pages is enabled, see below):**

`https://jenochjones.github.io/RythmatistVR/`

**On Quest 2+:**

1. Open the link above in the Meta Quest Browser.
2. Choose **Practice vs Chalk AI** for solo play, or **Host a Duel** /
   **Join a Duel** for a 2-player match.
3. Tap **Enter VR (Quest 2+)** and allow VR. The page starts in 2D —
   that is normal. If you start a game in 2D first, the **Enter VR**
   button stays in the bottom-right corner, so you can switch into VR
   at any time, and **Exit VR** brings you back to 2D.
4. You spawn 100 feet (30.48 m) from your opponent, facing each other.

**On desktop (for testing):**

Drag with the mouse to draw, WASD to move, Q / E to turn,
right-drag to look around.

## How a duel works — tournament style

* Best of 3 rounds. Win a round by dropping your opponent to 0 health.
  First to 2 rounds wins the match.
* **Hold a trigger** and the controller in that hand becomes a piece of chalk.
  The chalk points down from the bottom of the controller, blunt end against
  the controller and tip below it. It only draws while the tip is within
  6 inches of the ground, and the lines are thin.
* Drawings do not activate immediately: they stay plain white chalk until
  you have lifted the chalk for 3 seconds straight. Then they glow gold
  and come alive (a thin owner-coloured outline still shows whose a
  Chalkling is). No circles are shown at the start of a game; circles
  only appear as defenses you draw.
* **Start with your defense.** Draw a closed shape all the way around
  yourself and it becomes your initial defense. A circle is strongest:
  strength is measured by circularity (4π·area / perimeter²), so a
  perfect circle has 1000 health, a square about 850, and a ragged shape
  much less. No initial defense, no protection — draw it first.
* **Later defenses must be attached to the first one.** A closed shape
  touching your initial defense (or any defense piece) extends it, with
  its own health from its own circularity. Anything closed and not
  attached is a Chalkling, and wiggles off to attack.
* **Tethered defenders.** Draw a line (a string/chain) out from your
  initial defense, then a closed shape near its far end. That defender
  hunts enemy Chalklings, deals its own damage to them, and takes damage
  back — but it cannot move further from its anchor than its tether
  allows. If your initial defense breaks, its extensions, tethers, and
  defenders break with it.
* **Chalkling strength comes from the drawing.**
  * Speed is set by width and length (aspect ratio): long and thin is
    fast, round is slow.
  * A straight line pointed directly at your foe becomes a dart:
    3.4 m/s, 10 damage a hit, eroding after 100 damage — so it takes
    100 hits (ten darts, ten hits each) to break a perfect-circle defense.
  * A perfect circle is very slow (about 0.55 m/s) but does 80 damage/s
    and lasts 800 damage before it erodes.
  * The more complex a shape (more sharp corners), the higher its damage
    and its damage budget, between those extremes.
* **Centre line = path.** Draw a line down through a Chalkling and it
  follows that line, scaled up to fit between you and your foe. With no
  centre line, it meanders generally toward your foe.
* **Attacking a defense.** A Chalkling that reaches a defense meanders
  along its perimeter, slowly erasing it (its gold fill fades as its
  health falls), and does 1.5× damage at a corner or dip. A perfect
  circle has no corners, so it just takes slight damage all the way
  around. Chalklings degrade as they deal damage and disappear when
  their damage budget is spent — more complex and more perfectly
  circular Chalklings deal more damage before they degrade.
* **Long straight line (not pointed at your foe)** → a Line of
  Forbiddance, a wall Chalklings must break through.
* **Grip / Squeeze** near a Chalkling to grab it, then release with a flick
  to throw it toward your opponent. A good throw gives it a burst of speed.
* Chalk is a resource: drawing costs chalk, and it recharges over time.
  You can have at most 5 Chalklings alive at once.

## Two players, no server

Duels are peer-to-peer via WebRTC (PeerJS cloud is used only for the
initial introduction; game data travels directly between the two browsers):

1. Player 1 chooses **Host a Duel** and shares the duel code (e.g. `chalk-4821`).
2. Player 2 opens the same page, chooses **Join a Duel**, enters the code.
3. Both players spawn in the same arena and see each other's headset,
   hands, drawings, wards, walls, and Chalklings.

Both headsets must be on a network that allows WebRTC peer connections
(a normal home Wi-Fi setup works; some strict corporate/school networks block it).

## Files

* `index.html` — lobby, HUD, and page shell.
* `game.js` — the whole game: Three.js + WebXR scene, chalk drawing and
  shape classification, Chalklings, defenses, tethered defenders, walls,
  grabbing/throwing, tournament rounds, the practice AI, and peer-to-peer
  multiplayer.
* `style.css` — lobby and HUD styling.

## GitHub Pages setup

This repo is static, so Pages can serve it directly:

1. On GitHub, go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. Choose branch `main`, folder `/ (root)` — the site appears at
   `https://jenochjones.github.io/RythmatistVR/`.

## Local testing

```sh
python3 -m http.server 8000
# open http://localhost:8000/ — use desktop controls, or
# open the same URL from your Quest Browser on the same Wi-Fi network
```

WebXR requires a secure context (https, or `localhost`), which is why
the hosted GitHub Pages URL is the recommended way to play on Quest.

## Known limits / next steps

* Drawings are classified by simple geometry (closure, size, straightness),
  not by recognising specific Rithmatic figures — that keeps the game
  playable on Quest 2 without a heavy ML step.
* Chalklings and defenders are simulated by their owner and their positions
  are synced to the opponent, so a laggy connection may make a foe unit
  look slightly jumpy. Gameplay (damage to defenses, walls, and units) is
  still decided once, by the attacking unit's owner, and synced to the other
  player in batched damage messages.
* Ideas for later: named Rithmatic lines (Vigor, Making), chalkling
  variety by shape (fast small ones, slow tanky ones), and a spectator view.
