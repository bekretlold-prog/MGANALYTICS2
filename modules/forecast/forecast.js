// ============================================================
//  modules/forecast/forecast.js
//  Прогноз с учётом типа дня (праздник/предпраздник/будни)
//  Для трассового ресторана М11
// ============================================================

const Forecast = (() => {

  function aggregateSales(records) {
    const map = new Map();
    for (const r of records) {
      const key = `${r.date}|${r.hour}`;
      if (!map.has(key)) map.set(key, { date: r.date, hour: r.hour, sum: 0, checks: 0 });
      const e = map.get(key);
      e.sum    += r.sum;
      e.checks += r.checks;
    }
    return Array.from(map.values());
  }

  // Суммарные данные по дню
  function dayTotals(agg, dateStr) {
    const rows = agg.filter(r => r.date === dateStr);
    return {
      sum:    rows.reduce((a, b) => a + b.sum, 0),
      checks: rows.reduce((a, b) => a + b.checks, 0),
    };
  }

  async function compute(targetDateStr) {
    const raw = await DB.getSales();
    if (!raw.length) return null;

    const agg      = aggregateSales(raw);
    const allDates = [...new Set(agg.map(r => r.date))].sort();
    const hours    = [...new Set(agg.map(r => r.hour))].sort((a, b) => a - b);

    const targetDate = Utils.parseDate(targetDateStr);
    const targetType = RusCalendar.classify(targetDateStr);
    const compatTypes = RusCalendar.compatTypes(targetType);

    // Все исторические даты того же типа (или совместимого)
    const compatDates = allDates.filter(d => {
      if (d === targetDateStr) return false;
      const t = RusCalendar.classify(d);
      return compatTypes.includes(t);
    });

    // Среди совместимых — предпочитаем тот же день недели
    const sameWD = compatDates.filter(d => Utils.parseDate(d).getDay() === targetDate.getDay());
    const baseDates = sameWD.length >= 2 ? sameWD : compatDates;
    const usedDates = baseDates.slice(-6); // последние 6 похожих дней

    // Тренд: сравниваем суммарные данные старых vs новых похожих дней
    let trendCoeff = 1;
    if (usedDates.length >= 4) {
      const half    = Math.ceil(usedDates.length / 2);
      const older   = usedDates.slice(0, half);
      const newer   = usedDates.slice(half);
      const avgOld  = older.reduce((a, d) => a + dayTotals(agg, d).sum, 0) / older.length;
      const avgNew  = newer.reduce((a, d) => a + dayTotals(agg, d).sum, 0) / newer.length;
      if (avgOld > 0) trendCoeff = Math.min(Math.max(avgNew / avgOld, 0.5), 2.0); // ограничиваем 0.5-2.0
    }

    // Прогноз по часам
    const hourly = [];
    let totalSum = 0, totalChecks = 0;

    for (const h of hours) {
      const baseRows = usedDates
        .map(d => agg.find(r => r.date === d && r.hour === h))
        .filter(Boolean);

      let forecastSum = 0, forecastChecks = 0;
      let basisLabel = '—';

      if (baseRows.length >= 2) {
        // Берём последние 4 и применяем тренд
        const last4   = baseRows.slice(-4);
        const avgSum    = last4.reduce((a, b) => a + b.sum, 0)    / last4.length;
        const avgChecks = last4.reduce((a, b) => a + b.checks, 0) / last4.length;
        forecastSum    = Math.round(avgSum    * trendCoeff);
        forecastChecks = Math.round(avgChecks * trendCoeff);
        basisLabel = `×${trendCoeff.toFixed(2)}`;
      } else if (baseRows.length === 1) {
        forecastSum    = Math.round(baseRows[0].sum    * trendCoeff);
        forecastChecks = Math.round(baseRows[0].checks * trendCoeff);
        basisLabel = '1 день';
      } else {
        // Нет похожих часов — среднее по всем часам h
        const allH = agg.filter(r => r.hour === h && r.date !== targetDateStr);
        if (allH.length) {
          forecastSum    = Math.round(allH.reduce((a, b) => a + b.sum,    0) / allH.length);
          forecastChecks = Math.round(allH.reduce((a, b) => a + b.checks, 0) / allH.length);
          basisLabel = '~все';
        }
      }

      // Факт (если уже есть данные за целевую дату)
      const actual = agg.find(r => r.date === targetDateStr && r.hour === h);
      const staff  = forecastChecks > 0 ? Math.ceil(forecastChecks / CONFIG.STAFF_NORM) : 0;

      hourly.push({
        hour: h,
        sum: forecastSum,
        checks: forecastChecks,
        staff,
        basisLabel,
        actualSum:    actual?.sum    || 0,
        actualChecks: actual?.checks || 0,
        hasActual: !!actual,
      });

      totalSum    += forecastSum;
      totalChecks += forecastChecks;
    }

    const peak = [...hourly].sort((a, b) => b.sum - a.sum)[0];

    return {
      date: targetDateStr,
      dayName:    Utils.dayName(targetDate),
      dayType:    targetType,
      dayTypeLabel: RusCalendar.label(targetType),
      hourly,
      totalSum,
      totalChecks,
      trendCoeff,
      peak,
      basedOn:  usedDates,
      hasActual: allDates.includes(targetDateStr),
    };
  }

  let compChart = null, staffChart = null;

  async function render() {
    const dateStr = document.getElementById("forecast-date").value;
    if (!dateStr) return;

    Utils.showLoader("Считаем прогноз...");
    const result = await compute(dateStr);
    Utils.hideLoader();

    if (!result) {
      Utils.toast("Недостаточно данных. Загрузи отчёты во вкладке «Загрузка»", "error");
      return;
    }

    const actualTotal = result.hourly.reduce((a, b) => a + b.actualSum, 0);
    const diff    = result.hasActual ? actualTotal - result.totalSum : null;
    const diffPct = diff !== null && result.totalSum ? ((diff / result.totalSum) * 100).toFixed(1) : null;

    document.getElementById("fc-date").textContent      = `${result.date} (${result.dayName})`;
    document.getElementById("fc-daytype").textContent   = result.dayTypeLabel;
    document.getElementById("fc-forecast").textContent  = Utils.money(result.totalSum);
    document.getElementById("fc-actual").textContent    = result.hasActual ? Utils.money(actualTotal) : "нет данных";
    document.getElementById("fc-diff").textContent      = diffPct !== null ? (parseFloat(diffPct) >= 0 ? "+" : "") + diffPct + "%" : "—";
    document.getElementById("fc-diff").className        = diffPct !== null ? (parseFloat(diffPct) >= 0 ? "sum-value pos" : "sum-value neg") : "sum-value";
    document.getElementById("fc-checks").textContent    = Utils.num(result.totalChecks);
    document.getElementById("fc-peak").textContent      = result.peak ? `${result.peak.hour}:00 (${Utils.money(result.peak.sum)})` : "—";
    document.getElementById("fc-trend").textContent     = `×${result.trendCoeff.toFixed(2)}`;
    document.getElementById("fc-based").textContent     = result.basedOn.length
      ? result.basedOn.map(d => `${d} (${RusCalendar.label(RusCalendar.classify(d))})`).join(', ')
      : 'недостаточно похожих дней';

    // Таблица
    const tbody = document.querySelector("#fc-table tbody");
    tbody.innerHTML = "";
    for (const h of result.hourly) {
      if (h.sum === 0 && !h.hasActual) continue;
      const d = h.hasActual ? h.actualSum - h.sum : null;
      const dPct = d !== null && h.sum ? ((d / h.sum) * 100).toFixed(1) : null;
      const tr = tbody.insertRow();
      tr.innerHTML = `
        <td>${h.hour}:00</td>
        <td>${Utils.money(h.sum)}</td>
        <td>${h.checks || "—"}</td>
        <td>${h.staff > 0 ? h.staff + " чел." : "—"}</td>
        <td>${h.hasActual ? Utils.money(h.actualSum) : "—"}</td>
        <td>${h.hasActual ? (h.actualChecks || "—") : "—"}</td>
        <td class="${dPct !== null ? (parseFloat(dPct) >= 0 ? "pos" : "neg") : ""}">${dPct !== null ? (parseFloat(dPct) >= 0 ? "+" : "") + dPct + "%" : "—"}</td>
        <td class="muted">${h.basisLabel}</td>
      `;
    }

    // Графики
    const visible  = result.hourly.filter(h => h.sum > 0 || h.hasActual);
    const labels   = visible.map(h => `${h.hour}:00`);
    const fcData   = visible.map(h => h.sum);
    const actData  = visible.map(h => h.actualSum);
    const staffData = visible.map(h => h.staff);

    if (compChart) compChart.destroy();
    compChart = new Chart(document.getElementById("fc-chart").getContext("2d"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Прогноз", data: fcData,  backgroundColor: "rgba(88,166,255,0.7)", borderRadius: 4 },
          { label: "Факт",    data: actData, backgroundColor: "rgba(63,185,80,0.7)",  borderRadius: 4 },
        ],
      },
      options: { responsive: true, plugins: { legend: { position: "top" } } },
    });

    if (staffChart) staffChart.destroy();
    staffChart = new Chart(document.getElementById("staff-chart").getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Нужно сотрудников",
          data: staffData,
          borderColor: "#f59e0b",
          backgroundColor: "rgba(245,158,11,0.15)",
          tension: 0.3, fill: true, pointRadius: 4,
        }],
      },
      options: { responsive: true, scales: { y: { min: 0, ticks: { stepSize: 1 } } } },
    });
  }

  async function init() {
    const sales = await DB.getSales();
    const dates = [...new Set(sales.map(r => r.date))].sort();
    const picker = document.getElementById("forecast-date");
    picker.value = dates.length ? dates[dates.length - 1] : Utils.formatDate(new Date());
    document.getElementById("btn-forecast").addEventListener("click", render);
    render();
  }

  return { init };
})();

window.Forecast = Forecast;
