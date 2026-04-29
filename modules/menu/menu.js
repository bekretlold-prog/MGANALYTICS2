// ============================================================
//  modules/menu/menu.js
//  ABC анализ + Menu Engineering матрица
// ============================================================

const Menu = (() => {

  function aggregateByDish(records) {
    const map = new Map();
    for (const r of records) {
      if (!map.has(r.dish)) {
        map.set(r.dish, { dish: r.dish, category: r.category, group: r.group, qty: 0, sum: 0, discount: 0, costTotal: 0, days: new Set() });
      }
      const e = map.get(r.dish);
      e.qty       += r.qty;
      e.sum       += r.sum;
      e.discount  += r.discount;
      e.costTotal += r.costTotal;
      e.days.add(r.date);
    }
    return Array.from(map.values()).map(d => ({
      ...d,
      days: d.days.size,
      margin: d.sum > 0 ? (d.sum - d.costTotal) / d.sum : 0,
      avgPrice: d.qty > 0 ? d.sum / d.qty : 0,
      costPct: d.sum > 0 ? d.costTotal / d.sum : 0,
    }));
  }

  function abcAnalysis(dishes) {
    const sorted = [...dishes].sort((a, b) => b.sum - a.sum);
    const total = sorted.reduce((a, b) => a + b.sum, 0);
    let cum = 0;
    return sorted.map(d => {
      cum += d.sum;
      const pct = cum / total;
      return { ...d, abcClass: pct <= 0.7 ? "A" : pct <= 0.9 ? "B" : "C" };
    });
  }

  // Menu Engineering: популярность (высокая/низкая) × маржа (высокая/низкая)
  function menuEngineering(dishes) {
    const avgQty    = dishes.reduce((a, b) => a + b.qty, 0)    / dishes.length;
    const avgMargin = dishes.reduce((a, b) => a + b.margin, 0) / dishes.length;

    return dishes.map(d => {
      const highPop = d.qty >= avgQty;
      const highMar = d.margin >= avgMargin;
      let quadrant;
      if (highPop && highMar)  quadrant = "star";      // Звезда
      if (highPop && !highMar) quadrant = "plow";      // Рабочая лошадка
      if (!highPop && highMar) quadrant = "puzzle";    // Загадка
      if (!highPop && !highMar) quadrant = "dog";      // Собака
      return { ...d, quadrant, highPop, highMar };
    });
  }

  const QUAD_LABELS = {
    star:   { label: "⭐ Звезда",          color: "#10b981", tip: "Продвигать, держать цену" },
    plow:   { label: "🐴 Рабочая лошадка", color: "#3b82f6", tip: "Поднять цену или снизить себест." },
    puzzle: { label: "🧩 Загадка",          color: "#f59e0b", tip: "Продвигать или убрать" },
    dog:    { label: "🐶 Собака",           color: "#ef4444", tip: "Убрать из меню" },
  };

  let abcChart = null;

  async function render() {
    const raw = await DB.getMenu();
    if (!raw.length) {
      document.getElementById("menu-content").innerHTML = '<p class="muted center">Загрузи Prod Mix отчёт во вкладке «Загрузка»</p>';
      return;
    }

    const dishes = aggregateByDish(raw);
    const withABC = abcAnalysis(dishes);
    const withME  = menuEngineering(withABC);

    // Фильтр по категории
    const categories = ["Все", ...new Set(raw.map(r => r.category).filter(Boolean))];
    const filterEl = document.getElementById("menu-filter");
    if (!filterEl.dataset.built) {
      filterEl.innerHTML = categories.map(c => `<option>${c}</option>`).join("");
      filterEl.dataset.built = "1";
      filterEl.addEventListener("change", render);
    }
    const selectedCat = filterEl.value || "Все";
    const filtered = selectedCat === "Все" ? withME : withME.filter(d => d.category === selectedCat);

    // KPI
    const totalSum   = filtered.reduce((a, b) => a + b.sum, 0);
    const totalCost  = filtered.reduce((a, b) => a + b.costTotal, 0);
    const avgMargin  = filtered.length ? filtered.reduce((a, b) => a + b.margin, 0) / filtered.length : 0;
    const stars      = filtered.filter(d => d.quadrant === "star").length;
    const dogs       = filtered.filter(d => d.quadrant === "dog").length;

    document.getElementById("menu-kpi").innerHTML = `
      <div class="sum-card"><div class="sum-label">Позиций</div><div class="sum-value">${filtered.length}</div></div>
      <div class="sum-card"><div class="sum-label">Выручка</div><div class="sum-value">${Utils.money(totalSum)}</div></div>
      <div class="sum-card"><div class="sum-label">Средняя маржа</div><div class="sum-value">${Utils.pct(avgMargin)}</div></div>
      <div class="sum-card"><div class="sum-label">⭐ Звёзд</div><div class="sum-value">${stars}</div></div>
      <div class="sum-card"><div class="sum-label">🐶 Собак</div><div class="sum-value" style="color:var(--danger)">${dogs}</div></div>
    `;

    // Таблица
    const tbody = document.querySelector("#menu-table tbody");
    tbody.innerHTML = "";
    const sorted = [...filtered].sort((a, b) => b.sum - a.sum);
    for (const d of sorted) {
      const q = QUAD_LABELS[d.quadrant];
      const tr = tbody.insertRow();
      tr.innerHTML = `
        <td>${d.dish}</td>
        <td class="muted">${d.group || d.category}</td>
        <td>${Utils.num(d.qty)}</td>
        <td>${Utils.money(d.sum)}</td>
        <td>${Utils.money(d.avgPrice)}</td>
        <td>${Utils.pct(d.costPct)}</td>
        <td>${Utils.pct(d.margin)}</td>
        <td><span class="abc-badge abc-${d.abcClass}">${d.abcClass}</span></td>
        <td><span class="quad-badge" style="background:${q.color}20;color:${q.color}" title="${q.tip}">${q.label}</span></td>
      `;
    }

    // График ABC
    const abcCount = { A: 0, B: 0, C: 0 };
    const abcSum   = { A: 0, B: 0, C: 0 };
    withME.forEach(d => { abcCount[d.abcClass]++; abcSum[d.abcClass] += d.sum; });

    if (abcChart) abcChart.destroy();
    abcChart = new Chart(document.getElementById("abc-chart").getContext("2d"), {
      type: "doughnut",
      data: {
        labels: ["A — топ (70% выручки)", "B — средние", "C — хвост"],
        datasets: [{
          data: [abcSum.A, abcSum.B, abcSum.C],
          backgroundColor: ["#10b981", "#3b82f6", "#ef4444"],
          borderWidth: 0,
        }],
      },
      options: { responsive: true, plugins: { legend: { position: "right" } } },
    });
  }

  function init() {
    document.getElementById("menu-search").addEventListener("input", async e => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll("#menu-table tbody tr").forEach(tr => {
        tr.style.display = tr.cells[0]?.textContent.toLowerCase().includes(q) ? "" : "none";
      });
    });
    render();
  }

  return { init };
})();

window.Menu = Menu;
