// Rank dice mapping (r -> dice formula)
const RANK_DICE = {
    1: { count: 1, sides: 4 },
    2: { count: 1, sides: 6 },
    3: { count: 1, sides: 8 },
    4: { count: 1, sides: 10 },
    5: { count: 1, sides: 12 },
    6: { count: 2, sides: 8 },
    7: { count: 2, sides: 10 },
    8: { count: 2, sides: 12 },
    9: { count: 3, sides: 10 },
    10:{ count: 3, sides: 12 },
    11:{ count: 4, sides: 12 },
    12:{ count: 5, sides: 12 }
  };
  
  const PARAMS = [
    "melee","ranged","reflex","endurance","mobility","tech","social","survival","pilot","analitics",
    "history","society","linguistics","art","navigation","capital","will","reputation","karma","plot points"
  ];
  
  // Current rank controls dice + limits
  const rankSlider = document.getElementById("rankSlider");
  const rankLabel = document.getElementById("rankLabel");
  const rankLimitLabel = document.getElementById("rankLimitLabel");
  
  const hpInput = document.getElementById("hpInput");
  const spInput = document.getElementById("spInput");
  
  const rollSummary = document.getElementById("rollSummary");
  const rollBreakdown = document.getElementById("rollBreakdown");
  
  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }
  
  function getRank() {
    return parseInt(rankSlider.value, 10);
  }
  
  function rankDice(rank) {
    const d = RANK_DICE[rank];
    return d ? d : { count: 1, sides: 4 };
  }
  
  // Rank limit = max possible value on the rank dice
  function rankLimit(rank) {
    const { count, sides } = rankDice(rank);
    return count * sides;
  }
  
  // Parameter can be as big as 1.5 their rank limit
  function paramCap(rank) {
    return Math.floor(rankLimit(rank) * 1.5);
  }
  
  function rollDie(sides) {
    return 1 + Math.floor(Math.random() * sides);
  }
  
  function rollRankDice(rank) {
    const { count, sides } = rankDice(rank);
    const results = [];
    for (let i = 0; i < count; i++) results.push(rollDie(sides));
    const total = results.reduce((a, b) => a + b, 0);
    return { count, sides, results, total };
  }
  
  function setParamCapUI() {
    const cap = paramCap(getRank());
    document.querySelectorAll(".param").forEach(p => {
      const meta = p.querySelector(".cap");
      const name = p.getAttribute("data-param");
      if (meta) meta.textContent = `Cap: ${cap}`;
      const input = p.querySelector(".param-value");
      if (input) {
        input.max = cap;
      }
    });
  }
  
  function safeGetParamValue(paramName) {
    const el = document.querySelector(`.param[data-param="${CSS.escape(paramName)}"] .param-value`);
    if (!el) return 0;
    const v = parseFloat(el.value);
    return Number.isFinite(v) ? v : 0;
  }
  
  function setParamValue(paramName, value) {
    const el = document.querySelector(`.param[data-param="${CSS.escape(paramName)}"] .param-value`);
    if (!el) return;
    el.value = String(value);
  }
  
  function rollParameter(paramName) {
    const rank = getRank();
    const { count, sides, results, total } = rollRankDice(rank);
    const paramValue = safeGetParamValue(paramName);
  
    const grandTotal = total + paramValue;
  
    rollSummary.textContent = `${paramName}: ${grandTotal}`;
    rollBreakdown.textContent =
      `Rank dice: ${count}d${sides} = (${results.join(", ")}) total ${total} + ${paramValue} = ${grandTotal}`;
  }
  
  function wireControls() {
    // Roll buttons
    document.querySelectorAll(".param").forEach(paramEl => {
      const paramName = paramEl.getAttribute("data-param");
  
      const rollBtn = paramEl.querySelector(".param-roll");
      const minusBtn = paramEl.querySelector(".param-minus");
      const plusBtn = paramEl.querySelector(".param-plus");
      const valInput = paramEl.querySelector(".param-value");
  
      if (rollBtn) {
        rollBtn.addEventListener("click", () => rollParameter(paramName));
      }
  
      function adjust(delta) {
        const cap = paramCap(getRank());
        const current = safeGetParamValue(paramName);
        const next = clamp(Math.round(current + delta), 0, cap);
        setParamValue(paramName, next);
      }
  
      if (minusBtn) minusBtn.addEventListener("click", () => adjust(-1));
      if (plusBtn) plusBtn.addEventListener("click", () => adjust(+1));
  
      if (valInput) {
        valInput.addEventListener("input", () => {
          const cap = paramCap(getRank());
          const v = parseInt(valInput.value, 10);
          const safe = Number.isFinite(v) ? v : 0;
          valInput.value = String(clamp(safe, 0, cap));
        });
      }
    });
  
    // Rank slider updates cap + label
    rankSlider.addEventListener("input", () => {
      const rank = getRank();
      rankLabel.textContent = String(rank);
      rankLimitLabel.textContent = String(rankLimit(rank));
  
      setParamCapUI();
      // Clamp existing values to new cap
      PARAMS.forEach(name => {
        const cap = paramCap(rank);
        const v = safeGetParamValue(name);
        setParamValue(name, clamp(Math.round(v), 0, cap));
      });
    });
  
    // Test roll (uses first parameter)
    const rollAllBtn = document.getElementById("rollAllBtn");
    if (rollAllBtn) {
      rollAllBtn.addEventListener("click", () => {
        rollParameter("melee");
      });
    }
  }
  
  function init() {
    // Initialize labels
    const rank = getRank();
    rankLabel.textContent = String(rank);
    rankLimitLabel.textContent = String(rankLimit(rank));
  
    setParamCapUI();
    wireControls();
  
    // Default HP/SP
    if (hpInput && hpInput.value === "") hpInput.value = "0";
    if (spInput && spInput.value === "") spInput.value = "0";
  
    rollSummary.textContent = "Ready. Pick a parameter and click its button to roll.";
  }
  
  init();
  