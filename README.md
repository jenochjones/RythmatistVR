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
2. The start page is deliberately simple: just the mode buttons. Choose
   **Practice vs Chalk AI** for solo play, **Testing Mode** to try
   drawings against an opponent who does not draw, **Tutorial** for
   the full instructions, or **Host a Duel** / **Join a Duel** for a
   2-player match.
3. Tap **Enter VR (Quest 2+)** and allow VR. The page starts in 2D —
   that is normal. If you start a game in 2D first, the **Enter VR**
   button stays in the bottom-right corner, so you can switch into VR
   at any time, and **Exit VR** brings you back to 2D.
4. You spawn 100 feet (30.48 m) from your opponent, facing each other.

**On desktop:**

Drag with the mouse to draw, WASD to move, Q / E to turn,
right-drag to look around. Full controls and rules are in the in-game
**Tutorial** (from the start page), not on the start page itself.

**Testing Mode:**

Choose **Testing Mode** from the start page and your opponent stands
still and does not draw — no defenses, no Chalklings, no attacks.
Use it to try out drawings, test how a shape moves and hits, and see
how much damage it does, without anything coming back at you.

## How a duel works — tournament style

* Best of 3 rounds. Win a round by dropping your opponent to 0 health.
  First to 2 rounds wins the match.
* **Hold a trigger** and the controller in that hand becomes a piece of chalk,
  held like a pencil: the controller stays visible, and a longer pencil
  sits in it, blunt end at the controller and tip forward, left, and
  below it, angled 45° down and 20° to the left. It only draws while
  the tip is within 6 inches of the ground, and the lines are thin
  (about 2 cm wide). There are no instructions inside gameplay — the
  arena shows no how-to board, and how-to toasts are gone; instructions
  live only in the Tutorial on the start page.
* Drawings do not activate immediately: they stay plain white chalk for
  1 second after you finish drawing them. Then their lines glow gold
  and they come alive — even if you start drawing something else right
  away (each drawing has its own 1-second timer; drawing again does
  not reset a drawing that is already waiting). Completed drawings are
  not filled in, just the lines glowing gold (a thin owner-coloured line
  underneath still shows whose a Chalkling is). No circles are shown at
  the start of a game; circles only appear as defenses you draw.
* **Cloth to erase your own drawings.** Hold chalk in one hand (trigger
  held), then press the trigger on the other hand — that hand gets a
  light-blue cloth, not a second piece of chalk. Rub the cloth on the
  ground over one of your own drawings to erase it: pending white
  chalk, Chalklings, defenses, defenders, tethers, and walls you drew.
  It never erases your foe's drawings, and it only erases when the cloth
  is near the ground (under 0.5 m). On desktop, Shift + drag erases
  instead of drawing.
* **Start with your defense.** Draw a closed shape all the way around
  yourself and it becomes your initial defense. You cannot leave this
  first perimeter: once it exists, you can move only inside it (you
  slide along its inside edge if you try to walk out). If it breaks,
  you can move freely again until you draw a new one. A circle is strongest:
  strength is measured by circularity (4π·area / perimeter²), so a
  perfect circle has 1000 health, a square about 850, and a ragged shape
  much less. No initial defense, no protection — draw it first.
* **Draw inside your perimeter.** You cannot leave your first perimeter,
  so draw everything inside it. **Later defenses must physically
  connect to a perimeter defense line:** a closed shape becomes part
  of your defense only if its drawn line actually touches (within
  about 15 cm of) your initial defense or another defense piece.
  Nearby is not enough. Anything closed and not connected is a
  Chalkling, even if it was drawn inside your perimeter or around
  you — and if it was drawn inside your initial defense, it wiggles
  out through your own perimeter on activation. Your own defense
  never blocks your own Chalklings.
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
  along its perimeter, slowly erasing it (its gold glow lines fade as
  its health falls), and does 1.5× damage at a corner or dip. A perfect
  circle has no corners, so it just takes slight damage all the way
  around. Chalklings degrade as they deal damage and disappear when
  their damage budget is spent — more complex and more perfectly
  circular Chalklings deal more damage before they degrade.
* **Long straight line (not pointed at your foe)** → a Line of
  Forbiddance, a wall Chalklings must break through.
* **No direct interaction with Chalklings.** You cannot pick up, carry,
  or throw a Chalkling — in VR, on desktop, or in a duel, and squeezing
  a controller does nothing. Once a drawing activates, it acts on its
  own. You affect Chalklings only indirectly, by drawing defenses,
  tethered defenders, walls, or new Chalklings. Chalklings have no eyes:
  they are just their gold glowing lines and a thin owner-coloured line.
* **Scenery rotates each match.** Each time you start a match, the set
  changes: **The Stage** (wooden floor, red curtains, footlights),
  **The Park** (grass, trees, benches, lamp posts), then **The Roman
  Coliseum** (sand floor, stone wall ring, columns, red banners), then
  back to The Stage. The rotation is saved, so the next match after a
  reload uses the next set. In a duel, the host's set is sent to the
  joiner so both players see the same scenery.
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
  tournament rounds, the practice AI, and peer-to-peer multiplayer.
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
