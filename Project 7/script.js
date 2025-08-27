/* Code Breaker – The Array Heist
   Features per spec: visual array, insert/delete with shifting, subarray search animation,
   feedback messages, auto-generated secret pattern, 60s timer, sound effects, multiple levels.
*/
(() => {
  const CAPACITY = 10;
  const array = new Array(CAPACITY).fill(null);

  // --- DOM helpers ---
  const $ = (s, o = document) => o.querySelector(s);
  const $$ = (s, o = document) => Array.from(o.querySelectorAll(s));

  const arrayEl = $("#array");
  const cellTpl = $("#cell-template");
  const msgEl = $("#msg");
  const emptyMsg = $("#empty-msg");

  const idxEl = $("#idx");
  const valEl = $("#val");
  const patternEl = $("#pattern");

  const insertBtn = $("#insert");
  const deleteBtn = $("#delete");
  const searchBtn = $("#search");
  const resetBtn = $("#reset");
  const restartBtn = $("#restart");
  const nextLevelBtn = $("#next-level");

  const levelEl = $("#level");
  const timeEl = $("#time");
  const targetDescEl = $("#target-desc");
  const hintBtn = $("#hint-btn");
  const hintEl = $("#hint");

  // --- Game state ---
  let level = 1;
  let timer = null;
  let timeLeft = 60;
  let secret = [];
  let requireReversed = false;
  let won = false;

  // --- Sounds via Web Audio API ---
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = AC ? new AC() : null;

  function tone(freq = 440, dur = 0.12, type = "sine", vol = 0.07) {
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur);
  }
  function beep() { tone(880, 0.08, "sine", 0.09); }
  function buzz() { tone(130, 0.18, "sawtooth", 0.11); }
  function fanfare() {
    const seq = [523, 659, 784, 880, 988];
    seq.forEach((f, i) => setTimeout(() => tone(f, 0.08, "triangle", 0.08), i * 90));
  }

  // --- Utility ---
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function setMessage(text, kind = "info") {
    msgEl.textContent = text;
    if (kind === "ok") { msgEl.style.color = "var(--good)"; }
    else if (kind === "warn") { msgEl.style.color = "var(--warn)"; }
    else if (kind === "err") { msgEl.style.color = "var(--danger)"; }
    else { msgEl.style.color = "var(--text)"; }
  }

  // --- Rendering ---
  function renderArray(anim = {}) {
    arrayEl.innerHTML = "";
    let any = false;
    for (let i = 0; i < CAPACITY; i++) {
      const val = array[i];
      const cell = cellTpl.content.firstElementChild.cloneNode(true);
      cell.dataset.index = i;
      cell.dataset.filled = val !== null;
      cell.textContent = val !== null ? String(val) : "–";
      cell.setAttribute("aria-label", val !== null ? `index ${i} value ${val}` : `index ${i} empty`);

      // animation hints
      if (anim.slideRight && anim.slideRight.includes(i)) cell.classList.add("slide-right");
      if (anim.slideLeft && anim.slideLeft.includes(i)) cell.classList.add("slide-left");
      if (anim.inserted === i) cell.classList.add("inserted");
      if (anim.deleted === i) cell.classList.add("deleted");

      // quick clear on double click
      cell.addEventListener("dblclick", () => {
        if (array[i] !== null) {
          deleteAt(i, { silent: true });
          renderArray({ slideLeft: Array.from({ length: CAPACITY - i - 1 }, (_, k) => i + 1 + k), deleted: i });
        }
      });

      arrayEl.appendChild(cell);
      if (val !== null) any = true;
    }
    emptyMsg.style.display = any ? "none" : "block";
  }

  // --- Array ops with shifting ---
  function insertAt(index, value) {
    if (index < 0 || index >= CAPACITY) { setMessage("Index out of bounds!", "err"); buzz(); return false; }
    if (value < 0 || value > 9 || !Number.isInteger(value)) { setMessage("Enter a value 0–9.", "warn"); buzz(); return false; }
    if (array[CAPACITY - 1] !== null) { setMessage("Array full! Cannot insert.", "err"); buzz(); return false; }
    // shift right
    for (let i = CAPACITY - 1; i > index; i--) {
      array[i] = array[i - 1];
    }
    array[index] = value;
    renderArray({ slideRight: Array.from({ length: CAPACITY - index }, (_, k) => index + k), inserted: index });
    setMessage(`Inserted ${value} at index ${index}!`, "ok"); beep();
    checkWin();
    return true;
  }

  function deleteAt(index, opts = { silent: false }) {
    if (index < 0 || index >= CAPACITY) { if (!opts.silent) { setMessage("Index out of bounds!", "err"); buzz(); } return false; }
    if (array[index] === null) { if (!opts.silent) { setMessage("Nothing to delete at that index.", "warn"); buzz(); } return false; }
    // shift left
    for (let i = index; i < CAPACITY - 1; i++) {
      array[i] = array[i + 1];
    }
    array[CAPACITY - 1] = null;
    if (!opts.silent) {
      renderArray({ slideLeft: Array.from({ length: CAPACITY - index - 1 }, (_, k) => index + 1 + k), deleted: index });
      setMessage(`Deleted element at index ${index}.`, "ok"); beep();
      checkWin();
    }
    return true;
  }

  function resetArray() {
    array.fill(null);
    renderArray();
    setMessage("Array cleared.");
  }

  // --- Pattern parsing & search ---
  function parsePattern(text) {
    if (!text) return null;
    const parts = text.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
    if (!parts.length) return null;
    const nums = parts.map(n => Number(n));
    if (nums.some(n => !Number.isInteger(n) || n < 0 || n > 9)) return null;
    return nums;
  }

  async function animateSearch(pat) {
    const len = pat.length;
    const maxStart = CAPACITY - len;
    if (len === 0) { setMessage('Enter a valid pattern (e.g., 1,2,3).', 'warn'); buzz(); return; }

    setMessage("Searching...");
    for (let start = 0; start <= maxStart; start++) {
      // highlight window
      const windowIdx = Array.from({ length: len }, (_, k) => start + k);
      highlight(windowIdx, "highlight");
      await sleep(250);

      // check match against cells
      let ok = true;
      for (let k = 0; k < len; k++) {
        const val = array[start + k];
        if (val !== pat[k]) { ok = false; break; }
      }
      setWindowState(windowIdx, ok ? "match" : "mismatch");
      await sleep(250);
      clearWindow(windowIdx);

      if (ok) {
        setMessage(`Pattern found at index ${start}.`, "ok"); beep();
        return start;
      }
    }
    setMessage("Pattern not found.", "warn"); buzz();
    return -1;
  }

  function highlight(indices, cls) {
    indices.forEach(i => arrayEl.children[i]?.classList.add(cls));
  }
  function setWindowState(indices, cls) {
    indices.forEach(i => arrayEl.children[i]?.classList.add(cls));
  }
  function clearWindow(indices) {
    indices.forEach(i => arrayEl.children[i]?.classList.remove("highlight", "match", "mismatch"));
  }

  // --- Levels & secret pattern ---
  function randomDigits(n) {
    return Array.from({ length: n }, () => Math.floor(Math.random() * 10));
  }

  function describeTarget() {
    const len = secret.length;
    let desc = `${len}-digit pattern`;
    if (requireReversed) desc += " (reversed)";
    targetDescEl.textContent = desc;
  }

  function newLevel(n) {
    level = n;
    levelEl.textContent = String(level);
    requireReversed = (level === 3);
    secret = randomDigits(level === 1 ? 2 : 3);
    describeTarget();
    hintEl.hidden = true;
    hintEl.textContent = `Secret pattern: [${secret.join(", ")}]${requireReversed ? " → find its reverse" : ""}`;

    won = false;
    timeLeft = 60;
    timeEl.textContent = String(timeLeft);
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      timeLeft--;
      timeEl.textContent = String(timeLeft);
      if (timeLeft <= 0) {
        clearInterval(timer);
        setMessage("⛔ Time up! Try again.", "err"); buzz();
        nextLevelBtn.hidden = true;
      }
    }, 1000);

    resetArray();
    setMessage("New level started. Insert digits and search for the pattern!");
  }

  function revealHint() {
    hintEl.hidden = !hintEl.hidden;
  }

  function arrayHasPattern(target) {
    // linear subarray search including empties (nulls mismatch)
    const len = target.length;
    const maxStart = CAPACITY - len;
    for (let start = 0; start <= maxStart; start++) {
      let ok = true;
      for (let k = 0; k < len; k++) {
        if (array[start + k] !== target[k]) { ok = false; break; }
      }
      if (ok) return true;
    }
    return false;
  }

  function checkWin() {
    if (won) return;
    const target = requireReversed ? [...secret].reverse() : secret;
    if (arrayHasPattern(target)) {
      won = true;
      if (timer) clearInterval(timer);
      const taken = 60 - timeLeft;
      setMessage(`🎉 Level Complete! You cracked the code in ${taken}s.`, "ok");
      nextLevelBtn.hidden = level >= 3;
      fanfare();
    }
  }

  // --- Event wiring ---
  function bind() {
    insertBtn.addEventListener("click", () => {
      const i = Number(idxEl.value);
      const v = Number(valEl.value);
      insertAt(i, v);
    });

    deleteBtn.addEventListener("click", () => {
      const i = Number(idxEl.value);
      deleteAt(i);
    });

    resetBtn.addEventListener("click", resetArray);
    restartBtn.addEventListener("click", () => newLevel(level));

    searchBtn.addEventListener("click", async () => {
      const pat = parsePattern(patternEl.value);
      if (!pat) { setMessage('Enter a valid pattern (e.g., 1,2,3).', 'warn'); buzz(); return; }
      await animateSearch(pat);
    });

    nextLevelBtn.addEventListener("click", () => newLevel(level + 1));
    hintBtn.addEventListener("click", revealHint);

    // keyboard helpers
    idxEl.addEventListener("keydown", (e) => { if (e.key === "Enter") valEl.focus(); });
    valEl.addEventListener("keydown", (e) => { if (e.key === "Enter") insertBtn.click(); });
    patternEl.addEventListener("keydown", (e) => { if (e.key === "Enter") searchBtn.click(); });
  }

  // --- Init ---
  function init() {
    for (let i = 0; i < CAPACITY; i++) {
      const cell = cellTpl.content.firstElementChild.cloneNode(true);
      arrayEl.appendChild(cell);
    }
    renderArray();
    bind();
    newLevel(1);
  }

  init();
})();
