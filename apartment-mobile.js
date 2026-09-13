(() => {
  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport) viewport.content = "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover";

  const style = document.createElement("style");
  style.textContent = `
    #view { touch-action: none; }
    .games-back { text-decoration:none; }
    .touch-controls {
      display:grid;
      position:absolute;
      left:18px;
      bottom:max(20px, env(safe-area-inset-bottom));
      grid-template-columns:repeat(3,60px);
      grid-template-rows:repeat(2,60px);
      gap:7px;
      pointer-events:auto;
      z-index:4;
    }
    .touch-controls button {
      width:60px;
      height:60px;
      padding:0;
      border:2px solid #ffffff6e;
      border-radius:18px;
      background:#203028e6;
      color:white;
      font:800 25px -apple-system,BlinkMacSystemFont,sans-serif;
      box-shadow:0 4px 18px #0004;
      touch-action:none;
    }
    .touch-controls button:active { transform:scale(.94); background:#4b6456; }
    .touch-controls .up { grid-column:2; }
    .touch-controls .left { grid-row:2; grid-column:1; }
    .touch-controls .down { grid-row:2; grid-column:2; }
    .touch-controls .right { grid-row:2; grid-column:3; }
    @media (pointer: coarse) {
      .instructions { display:none; }
      .card { padding:28px 24px; }
      .card h1 { font-size:38px; }
      .card p { font-size:16px; }
      .badge { max-width:240px; line-height:1.35; }
      .top { top:max(18px, env(safe-area-inset-top)); }
    }
  `;
  document.head.append(style);

  const tools = document.querySelector(".tools");
  if (tools) tools.insertAdjacentHTML("afterbegin", '<a class="games-back" href="games.html"><button type="button">All games</button></a>');

  document.body.insertAdjacentHTML("beforeend", `
    <div class="touch-controls" aria-label="Movement controls">
      <button class="up" type="button" data-key="ArrowUp" aria-label="Walk forward">↑</button>
      <button class="left" type="button" data-key="ArrowLeft" aria-label="Turn left">←</button>
      <button class="down" type="button" data-key="ArrowDown" aria-label="Walk backward">↓</button>
      <button class="right" type="button" data-key="ArrowRight" aria-label="Turn right">→</button>
    </div>
  `);

  const keySet = () => window.keys;
  const hold = (code, down) => {
    const set = keySet();
    if (!set) return;
    if (down) {
      if (!window.active) return;
      set.add(code);
    } else {
      set.delete(code);
    }
  };

  document.querySelectorAll(".touch-controls button").forEach((button) => {
    const release = (event) => {
      event.preventDefault();
      hold(button.dataset.key, false);
    };
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      hold(button.dataset.key, true);
      button.setPointerCapture?.(event.pointerId);
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach((type) => {
      button.addEventListener(type, release);
    });
  });

  const isTouch = window.matchMedia("(pointer: coarse)").matches;
  const touchInstructions = document.querySelector("#welcome p:nth-of-type(2)");
  if (touchInstructions && isTouch) {
    touchInstructions.innerHTML = "Use the <b>on-screen arrows</b> to walk and turn.<br>Drag anywhere else in the scene to look around.";
  }
})();
