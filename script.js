(() => {
  // ===== Config =====
  const PARAMS = [
    "melee","ranged","reflex","endurance","mobility",
    "tech","social","survival","pilot","analitics",
    "history","society","linguistics","art","navigation",
    "capital","will","reputation","karma","plot points"
  ];

  // Rank => rank dice expression
  // r1: 1d4, r2: 1d6 ... r5: 1d12, r6: 2d8, r7: 2d10, ...
  // r9: 3d10, r10: 3d12, r11: 4d12, r12: 5d12
  const RANK_DICE = {
    1: { dice: 1, sides: 4 },
    2: { dice: 1, sides: 6 },
    3: { dice: 1, sides: 8 },
    4: { dice: 1, sides: 10 },
    5: { dice: 1, sides: 12 },
    6: { dice: 2, sides: 8 },
    7: { dice: 2, sides: 10 },
    8: { dice: 2, sides: 12 },
    9: { dice: 3, sides: 10 },
    10:{ dice: 3, sides: 12 },
    11:{ dice: 4, sides: 12 },
    12:{ dice: 5, sides: 12 }
  };

  // Rank limit = max possible value on rank dice
  function rankLimit(rank) {
    const spec = RANK_DICE[rank];
    if (!spec) return 0;
    return spec.dice * spec.sides;
  }

  const STORAGE_KEY = "or_rank_sheet_v1";

  // ===== UI Elements =====
  const el = {
    sheet: document.getElementById("sheet"),
    charName: document.getElementById("charName"),
    charSpecies: document.getElementById("charSpecies"),
    hp: document.getElementById("hp"),
    sp: document.getElementById("sp"),

    rankSelect: document.getElementById("rankSelect"),
    rankLimitValue: document.getElementById("rankLimitValue"),
    paramCapValue: document.getElementById("paramCapValue"),

    paramsLeft: document.getElementById("paramsLeft"),
    paramsRight: document.getElementById("paramsRight"),

    openLogBtn: document.getElementById("openLogBtn"),
    logWindow: document.getElementById("logWindow"),
    logList: document.getElementById("logList"),
    closeLogBtn: document.getElementById("closeLogBtn")
  };

  // ===== Owlbear Integration Helpers (best-effort) =====
  function getOwlbearAPI() {
    // In many Owlbear extension pages, window.OwlbearExtension exists.
    // If your environment differs, this function is the only place to tweak.
    return window.OwlbearExtension || null;
  }

  function nowTimestamp() {
    const d = new Date();
    // compact-ish, sortable
    return d.toLocaleString();
  }

  function setLogOpen(open) {
    el.logWindow.classList.toggle("hidden", !open);
    el.logWindow.setAttribute("aria-hidden", open ? "false" : "true");
  }

  function playerColorFromContext(context) {
    // Best-effort: different APIs expose color differently.
    // Common is context.player.color or context.playerId -> lookup elsewhere.
    try {
      if (context?.player?.color) return context.player.color;
      if (context?.selectedPlayer?.color) return context.selectedPlayer.color;
      if (context?.playerColor) return context.playerColor;
    } catch {}
    return "#ffffff";
  }

  function ensureNumber(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function clampParam(value, cap) {
    const v = Math.round(ensureNumber(value, 0));
    return Math.max(-999999, Math.min(cap, v));
  }

  function buildParamRow(paramName, currentValue, onAdjust, onRoll) {
    const row = document.createElement("div");
    row.className = "param-row";

    const rollBtn = document.createElement("button");
    rollBtn.type = "button";
    rollBtn.className = "param-btn";
    rollBtn.textContent = paramName;
    rollBtn.title = "Roll check for this parameter";
    rollBtn.addEventListener("click", () => onRoll(paramName));

    const val = document.createElement("div");
    val.className = "param-val";
    val.textContent = String(currentValue);

    const minus = document.createElement("button");
    minus.type = "button";
    minus.className = "small-btn";
    minus.textContent = "–";
    minus.addEventListener("click", () => onAdjust(paramName, -1));

    const plus = document.createElement("button");
    plus.type = "button";
    plus.className = "small-btn";
    plus.textContent = "+";
    plus.addEventListener("click", () => onAdjust(paramName, +1));

    // Grid order: button | - | +
    // We'll place minus first then plus; that's the 2 auto columns (compact).
    row.appendChild(rollBtn);
    row.appendChild(minus);
    row.appendChild(plus);

    // Put value overlay-ish: to keep grid compact, we use the val right after (via CSS).
    // But our grid doesn't include val column; instead, we inject val as last and use flex? Simpler:
    // We'll append val as separate line is bigger. Better: repurpose + column? Not good.
    // Let's instead make val appear inside the roll button using a child span.
    // We'll update button text: "name: value" would clutter.
    // Alternative: place val as aria label only.
    rollBtn.textContent = `${paramName} (${currentValue})`;
    rollBtn.title = `Current: ${currentValue}. Click to roll.`;

    // Keep value updated by returning a setter.
    return { row, setValue: (newVal) => {
      const v = Math.round(newVal);
      rollBtn.textContent = `${paramName} (${v})`;
      rollBtn.title = `Current: ${v}. Click to roll.`;
    }};
  }

  function rollRankDice(rank) {
    const spec = RANK_DICE[rank];
    if (!spec) return { total: 0, rolls: [] };
    const rolls = [];
    let total = 0;
    for (let i = 0; i < spec.dice; i++) {
      const r = 1 + Math.floor(Math.random() * spec.sides);
      rolls.push(r);
      total += r;
    }
    return { total, rolls };
  }

  // ===== State =====
  const state = {
    rank: 1,
    name: "",
    species: "",
    hp: 0,
    sp: 0,
    params: Object.fromEntries(PARAMS.map(p => [p, 0]))
  };

  // UI param row references so we can update labels
  const paramRowRefs = {};

  function refreshRankLabels() {
    const cap = Math.floor(rankLimit(state.rank) * 1.5);
    el.rankLimitValue.textContent = String(rankLimit(state.rank));
    el.paramCapValue.textContent = String(cap);
  }

  function refreshAllUI() {
    el.charName.value = state.name;
    el.charSpecies.value = state.species;
    el.hp.value = state.hp;
    el.sp.value = state.sp;

    // rank select
    el.rankSelect.value = String(state.rank);

    refreshRankLabels();

    const cap = Math.floor(rankLimit(state.rank) * 1.5);
    for (const p of PARAMS) {
      state.params[p] = clampParam(state.params[p], cap);
      if (paramRowRefs[p]) paramRowRefs[p].setValue(state.params[p]);
    }
  }

  function buildParamUI() {
    el.paramsLeft.innerHTML = "";
    el.paramsRight.innerHTML = "";

    // split into 2 columns; “parts of 5”
    // Left: first 10 -> two groups of 5
    // Right: last 10 -> two groups of 5
    const left = PARAMS.slice(0, 10);
    const right = PARAMS.slice(10, 20);

    function addGroup(container, names) {
      for (const name of names) {
        const ref = buildParamRow(
          name,
          state.params[name] ?? 0,
          (param, delta) => adjustParam(param, delta),
          (param) => doRoll(param)
        );
        paramRowRefs[name] = ref;
        container.appendChild(ref.row);
      }
    }

    // For “divided somehow into parts of 5”: just create 2 batches and insert subtle label spacers
    const leftBatch1 = document.createElement("div");
    addGroup(leftBatch1, left.slice(0, 5));
    el.paramsLeft.appendChild(leftBatch1);

    const leftSpacer = document.createElement("div");
    leftSpacer.style.height = "6px";
    el.paramsLeft.appendChild(leftSpacer);

    const leftBatch2 = document.createElement("div");
    addGroup(leftBatch2, left.slice(5, 10));
    el.paramsLeft.appendChild(leftBatch2);

    const rightBatch1 = document.createElement("div");
    addGroup(rightBatch1, right.slice(0, 5));
    el.paramsRight.appendChild(rightBatch1);

    const rightSpacer = document.createElement("div");
    rightSpacer.style.height = "6px";
    el.paramsRight.appendChild(rightSpacer);

    const rightBatch2 = document.createElement("div");
    addGroup(rightBatch2, right.slice(5, 10));
    el.paramsRight.appendChild(rightBatch2);
  }

  function getParamCap() {
    return Math.floor(rankLimit(state.rank) * 1.5);
  }

  function adjustParam(paramName, delta) {
    const cap = getParamCap();
    state.params[paramName] = clampParam(state.params[paramName] + delta, cap);
    refreshAllUI();
    persistToTokenBestEffort();
  }

  function expressionForRank(rank) {
    const spec = RANK_DICE[rank];
    if (!spec) return "0";
    return `${spec.dice}d${spec.sides}`;
  }

  // ===== Token Persistence (best-effort) =====
  // Many Owlbear extensions expose a token store API.
  let currentTokenId = null;

  async function loadFromTokenBestEffort(token) {
    // token might contain tokenId + character data
    // We'll attempt: token.character?.[STORAGE_KEY] or token.character directly
    try {
      const data = token?.character?.[STORAGE_KEY];
      if (!data) return;

      state.rank = data.rank ?? 1;
      state.name = data.name ?? "";
      state.species = data.species ?? "";
      state.hp = data.hp ?? 0;
      state.sp = data.sp ?? 0;
      state.params = { ...state.params, ...(data.params ?? {}) };

      // clamp to cap
      const cap = getParamCap();
      for (const p of PARAMS) {
        state.params[p] = clampParam(state.params[p], cap);
      }

      refreshAllUI();
    } catch {}
  }

  async function persistToTokenBestEffort() {
    const api = getOwlbearAPI();
    if (!api) return;

    try {
      if (!currentTokenId) return;
      const payload = {
        rank: state.rank,
        name: state.name,
        species: state.species,
        hp: ensureNumber(state.hp, 0),
        sp: ensureNumber(state.sp, 0),
        params: state.params
      };

      // Attempt common pattern: api.room.character? / api.ui?? is uncertain.
      // Typical approach:
      // api.room.character.getCurrent? / api.room.character?.update?
      // We'll try the simplest likely method: api.room.getToken and update.
      if (api.room?.getCharacterToken && api.room?.updateCharacterToken) {
        await api.room.updateCharacterToken(currentTokenId, {
          character: { [STORAGE_KEY]: payload }
        });
      } else if (api.room?.character?.update) {
        await api.room.character.update(currentTokenId, {
          character: { [STORAGE_KEY]: payload }
        });
      } else if (api.token?.update) {
        await api.token.update(currentTokenId, {
          character: { [STORAGE_KEY]: payload }
        });
      } else {
        // fallback: store locally (so UI still works)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      }
    } catch {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          rank: state.rank,
          name: state.name,
          species: state.species,
          hp: ensureNumber(state.hp, 0),
          sp: ensureNumber(state.sp, 0),
          params: state.params
        }));
      } catch {}
    }
  }

  function loadFromLocalFallback() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      state.rank = data.rank ?? 1;
      state.name = data.name ?? "";
      state.species = data.species ?? "";
      state.hp = data.hp ?? 0;
      state.sp = data.sp ?? 0;
      state.params = { ...state.params, ...(data.params ?? {}) };
      refreshAllUI();
    } catch {}
  }

  // ===== Rolling + Logging =====
  function addLogItem({ characterName, playerColor, paramName, rollResult, timestamp }) {
    const item = document.createElement("div");
    item.className = "log-item";

    const top = document.createElement("div");
    top.className = "log-topline";

    const name = document.createElement("div");
    name.className = "log-name";

    const dot = document.createElement("div");
    dot.className = "color-dot";
    dot.style.background = playerColor;

    const nameText = document.createElement("div");
    nameText.textContent = characterName || "Unknown";

    name.appendChild(dot);
    name.appendChild(nameText);

    const time = document.createElement("div");
    time.className = "log-time";
    time.textContent = timestamp;

    top.appendChild(name);
    top.appendChild(time);

    const mid = document.createElement("div");
    mid.className = "log-mid";

    const badgeParam = document.createElement("div");
    badgeParam.className = "badge";
    badgeParam.textContent = `Param: ${paramName}`;

    const badgeRoll = document.createElement("div");
    badgeRoll.className = "badge";
    badgeRoll.textContent = rollResult.expression;

    const res = document.createElement("div");
    res.className = "result";
    res.textContent = `= ${rollResult.total}`;

    mid.appendChild(badgeParam);
    mid.appendChild(badgeRoll);
    mid.appendChild(res);

    item.appendChild(top);
    item.appendChild(mid);

    el.logList.prepend(item);
  }

  function doRoll(paramName) {
    // rollRankDice + add param value
    const rank = state.rank;
    const base = rollRankDice(rank);
    const paramVal = ensureNumber(state.params[paramName], 0);
    const total = base.total + paramVal;

    const expression = `${expressionForRank(rank)} + ${paramVal}`;

    // Player color
    const api = getOwlbearAPI();
    let color = "#ffffff";

    // If API provides context with player color, use it; else fallback.
    try {
      const ctx = api?.extension?.context?.player || api?.extension?.context || null;
      if (ctx) color = playerColorFromContext(ctx);
    } catch {}

    const payload = {
      characterName: state.name || "Unknown",
      playerColor: color,
      paramName,
      rollResult: {
        expression,
        total,
        raw: {
          rank,
          rankRolls: base.rolls,
          rankSum: base.total,
          paramVal
        }
      },
      timestamp: nowTimestamp()
    };

    // Show in log window
    addLogItem(payload);

    // Optional: also send a chat-style result via Owlbear dice system if available.
    // We'll keep it local because Owlbear roll API varies.
    // If your API supports api.dice.roll, paste your expected call signature and I’ll wire it.
  }

  // ===== Event Wiring =====
  function wireUI() {
    // rank select 1..12
    el.rankSelect.innerHTML = "";
    for (let r = 1; r <= 12; r++) {
      const opt = document.createElement("option");
      opt.value = String(r);
      opt.textContent = `r${r} (${expressionForRank(r)})`;
      el.rankSelect.appendChild(opt);
    }

    el.rankSelect.addEventListener("change", () => {
      state.rank = Number(el.rankSelect.value);
      refreshAllUI();
      persistToTokenBestEffort();
    });

    el.charName.addEventListener("input", () => {
      state.name = el.charName.value;
      persistToTokenBestEffort();
    });

    el.charSpecies.addEventListener("input", () => {
      state.species = el.charSpecies.value;
      persistToTokenBestEffort();
    });

    el.hp.addEventListener("input", () => {
      state.hp = ensureNumber(el.hp.value, 0);
      persistToTokenBestEffort();
    });

    el.sp.addEventListener("input", () => {
      state.sp = ensureNumber(el.sp.value, 0);
      persistToTokenBestEffort();
    });

    el.openLogBtn.addEventListener("click", () => setLogOpen(true));
    el.closeLogBtn.addEventListener("click", () => setLogOpen(false));

    // start closed
    setLogOpen(false);
  }

  async function initOwlbear() {
    const api = getOwlbearAPI();
    if (!api) {
      // fallback UI still works
      loadFromLocalFallback();
      return;
    }

    // Many Owlbear extensions use api.onReady
    if (typeof api.onReady === "function") {
      await api.onReady();
    }

    // Character token loading
    // The exact method differs. We'll try a few patterns.
    try {
      if (api?.token?.character?.onUpdate) {
        api.token.character.onUpdate(async (token) => {
          currentTokenId = token?.id || null;
          await loadFromTokenBestEffort(token);
        });
      } else if (api?.room?.onTokenUpdate) {
        api.room.onTokenUpdate(async (token) => {
          currentTokenId = token?.id || null;
          await loadFromTokenBestEffort(token);
        });
      } else if (api?.token?.onCharacterTokenSelected) {
        api.token.onCharacterTokenSelected(async (token) => {
          currentTokenId = token?.id || null;
          await loadFromTokenBestEffort(token);
        });
      } else {
        // No hook found; use local fallback.
        loadFromLocalFallback();
      }
    } catch {
      loadFromLocalFallback();
    }

    // Initial attempt: if API has current token
    try {
      const token = await api?.token?.getSelected?.();
      if (token) {
        currentTokenId = token.id || null;
        await loadFromTokenBestEffort(token);
      } else {
        loadFromLocalFallback();
      }
    } catch {
      loadFromLocalFallback();
    }
  }

  // ===== Boot =====
  function boot() {
    // default values
    state.rank = 1;
    state.name = "";
    state.species = "";
    state.hp = 0;
    state.sp = 0;
    for (const p of PARAMS) state.params[p] = 0;

    refreshRankLabels();
    buildParamUI();
    refreshAllUI();
    wireUI();
    initOwlbear();
  }

  boot();
})();
