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
3. Tap **Enter VR (Quest 2+)** and allow VR.
4. You spawn 100 feet (30.48 m) from your opponent, facing each other.

**On desktop (for testing):**

Drag with the mouse to draw, WASD to move, Q / E to turn,
right-drag to look around.

## How a duel works — tournament style

* Best of 3 rounds. Win a round by dropping your opponent to 0 health.
  First to 2 rounds wins the match.
* **Hold a trigger** and the controller in that hand becomes a piece of chalk.
  Draw on the ground while holding it.
* **Closed shape** → a Chalkling. It comes alive, wiggles across the arena
  toward your opponent, and attacks their defences — then them.
* **Big circle drawn around yourself** → a Line of Warding, your defensive ring.
  A foe Chalkling must chew through it before it can reach you.
* **Long straight line** → a Line of Forbiddance, a wall Chalklings must
  break through.
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
  shape classification, Chalklings, wards, walls, grabbing/throwing,
  tournament rounds, the practice AI, and peer-to-peer multiplayer.
* `style.css` — lobby and HUD styling.
* `.github/workflows/pages.yml` — deploys this static site to GitHub Pages.

## GitHub Pages setup

This repo is static, so Pages can serve it directly:

1. On GitHub, go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Push to `main` (the workflow in `.github/workflows/pages.yml` runs
   automatically) — the site appears at
   `https://jenochjones.github.io/RythmatistVR/`.

If you prefer the classic route instead, choose **Deploy from a branch**,
branch `main`, folder `/ (root)`.

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
* Chalklings are simulated by their owner and their positions are synced
  to the opponent, so a laggy connection may make a foe Chalkling look
  slightly jumpy. Gameplay (damage, wards, walls) is still decided once,
  by the Chalkling's owner.
* Ideas for later: named Rithmatic lines (Vigor, Making), chalkling
  variety by shape (fast small ones, slow tanky ones), and a spectator view.
