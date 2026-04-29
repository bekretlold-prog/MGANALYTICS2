// ============================================================
//  modules/forecast/forecast.js
//  Прогноз с учётом дня недели + тренд + персонал
// ============================================================

const Forecast = (() => {

  // Собирает все записи по каналам в итого по дате+часу
  function aggregateSales(records) {
    const map = new Map();
    for (const r of records) {
      if (r.channel === "total") continue;
      const key = `${r.date}|${r.hour}`;
      if (!map.has(key)) map.set(key, { date: r.date, hour: r.hour, sum: 0, checks: 0, alfa: 0, kiosk: 0, cash: 0 });
      const entry = map.get(key);
      entry.sum    += r.sum;
      entry.checks += r.checks;
      entry[r.channel] = (entry[r.channel] || 0) + r.sum;
    }
    return Array.from(map.values());
  }

  // Считает тренд по каждому часу отдельно (последние 4 недели vs год назад)
  function computeHourlyTrend(agg, hours, targetDate) {
    const trends = {};
    const today = new Date();

    for (const h of hours) {
      // Последние 4 недели того же дня недели
      const recentVals = [];
      for (let w = 1; w <= 4; w++) {
        const d = Utils.daysAgo(w * 7, today);
        if (d.getDay() !== targetDate.getDay()) continue;
        const key = `${Utils.formatDate(d)}|${h}`;
        const rec = agg.find(r => `${r.date}|${r.hour}` == key); // loose compare hour
        if (rec) recentVals.push(rec.sum);
      }

      // Год назад ±2 недели того же дня недели
      const lastYear = new Date(targetDate);
      lastYear.setFullYear(lastYear.getFullYear() - 1);
      const lastYearVals = [];
      for (let offset = -14; offset <= 14; offset++) {
        const d = new Date(lastYear);
        d.setDate(lastYear.getDate() + offset);
        if (d.getDay() !== targetDate.getDay()) continue;
        const dStr = Utils.formatDate(d);
        const rec = agg.find(r => r.date === dStr && r.hour == h);
        if (rec) lastYearVals.push(rec.sum);
      }

      const avgRecent   = recentVals.length   ? recentVals.reduce((a, b) => a + b, 0)   / recentVals.length   : null;
      const avgLastYear = lastYearVals.length  ? lastYearVals.reduce((a, b) => a + b, 0) / lastYearVals.length : null;
      trends[h] = (avgRecent && avgLastYear && avgLastYear > 0) ? avgRecent / avgLastYear : 1;
    }
    return trends;
  }

  async function compute(targetDateStr) {
    const raw = await DB.getSales();
    if (!raw.length) return null;

    const agg = aggregateSales(raw);
    const targetDate = Utils.parseDate(targetDateStr);
    const targetWD = targetDate.getDay();
    const hours = [...new Set(agg.map(r => r.hour))].sort((a, b) => a - b);

    const hourlyTrends = computeHourlyTrend(agg, hours, targetDate);

    // База: данные прошлого года того же дня недели
    const lastYear = new Date(targetDate);
    lastYear.setFullYear(lastYear.getFullYear() - 1);

    // Ищем базу — сначала точную дату, потом ближайший такой же день недели в ±21 день
    function findBase(hour) {
      // Точная дата год назад
      const exact = agg.find(r => r.date === Utils.formatDate(lastYear) && r.hour == hour);
      if (exact) return exact;

      // Ближайший тот же день недели в прошлом году
      for (let offset = 1; offset <= 21; offset++) {
        for (const sign of [1, -1]) {
          const d = new Date(lastYear);
          d.setDate(lastYear.getDate() + offset * sign);
          if (d.getDay() !== targetWD) continue;
          const rec = agg.find(r => r.date === Utils.formatDate(d) && r.hour == hour);
          if (rec) return rec;
        }
      }

      // Fallback: последние 4 недели того же дня недели
      const today = new Date();
      const fallbackVals = [];
      for (let w = 1; w <= 8; w++) {
        const d = Utils.daysAgo(w * 7, today);
        if (d.getDay() !== targetWD) continue;
        const rec = agg.find(r => r.date === Utils.formatDate(d) && r.hour == hour);
        if (rec) fallbackVals.push(rec);
      }
      if (fallbackVals.length) {
        const avgSum    = fallbackVals.reduce((a, b) => a + b.sum, 0)    / fallbackVals.length;
        const avgChecks = fallbackVals.reduce((a, b) => a + b.checks, 0) / fallbackVals.length;
        return { sum: avgSum, checks: avgChecks, isFallback: true };
      }
      return null;
    }

    const hourly = [];
    let totalSum = 0, totalChecks = 0;

    for (const h of hours) {
      const base = findBase(h);
      const trend = hourlyTrends[h] || 1;
      const forecastSum    = base ? Math.round(base.sum    * trend) : 0;
      const forecastChecks = base ? Math.round(base.checks * trend) : 0;
      const staff = forecastChecks > 0 ? Math.ceil(forecastChecks / CONFIG.STAFF_NORM) : 0;

      hourly.push({
        hour: h,
        sum: forecastSum,
        checks: forecastChecks,
        staff,
        trend: trend.toFixed(2),
        isFallback: base?.isFallback || false,
      });

      totalSum    += forecastSum;
      totalChecks += forecastChecks;
    }

    return {
      date: targetDateStr,
      dayName: Utils.dayName(targetDate),
      hourly,
      totalSum,
      totalChecks,
      totalStaff: Math.ceil(totalChecks / hours.length / CONFIG.STAFF_NORM),
    };
  }

  async function getActual(dateStr) {
    const raw = await DB.getSales();
    const agg = aggregateSales(raw.filter(r => r.date === dateStr));
    if (!agg.length) return null;
    return {
      date: dateStr,
      hourly: agg,
      totalSum: agg.reduce((a, b) => a + b.sum, 0),
      totalChecks: agg.reduce((a, b) => a + b.checks, 0),
    };
  }

  let compChart = null, hourlyChart = null;

  async function render() {
    const picker = document.getElementById("forecast-date");
    const dateStr = picker.value;
    if (!dateStr) return;

    Utils.showLoader("Считаем прогноз...");

    const forecast = await compute(dateStr);
    const actual   = await getActual(dateStr);

    Utils.hideLoader();

    if (!forecast) { Utils.toast("Недостаточно данных для прогноза", "error"); return; }

    // KPI карточки
    const actualSum = actual?.totalSum || 0;
    const diff = actualSum - forecast.totalSum;
    const diffPct = forecast.totalSum ? ((diff / forecast.totalSum) * 100).toFixed(1) : 0;

    document.getElementById("fc-date").textContent    = `${dateStr} (${forecast.dayName})`;
    document.getElementById("fc-forecast").textContent = Utils.money(forecast.totalSum);
    document.getElementById("fc-actual").textContent   = Utils.money(actualSum);
    document.getElementById("fc-diff").textContent     = (diff >= 0 ? "+" : "") + diffPct + "%";
    document.getElementById("fc-diff").style.color     = diff >= 0 ? "var(--success)" : "var(--danger)";
    document.getElementById("fc-checks").textContent   = Utils.num(forecast.totalChecks);

    // Пиковый час
    const peak = [...forecast.hourly].sort((a, b) => b.sum - a.sum)[0];
    document.getElementById("fc-peak").textContent = peak ? `${peak.hour}:00 (${Utils.money(peak.sum)})` : "—";

    // Таблица
    const tbody = document.querySelector("#fc-table tbody");
    tbody.innerHTML = "";
    for (const h of forecast.hourly) {
      const act = actual?.hourly.find(r => r.hour == h.hour);
      const actSum    = act?.sum    || 0;
      const actChecks = act?.checks || 0;
      const d = actSum - h.sum;
      const dPct = h.sum ? ((d / h.sum) * 100).toFixed(1) : 0;

      const tr = tbody.insertRow();
      tr.innerHTML = `
        <td>${h.hour}:00</td>
        <td>${Utils.money(h.sum)}</td>
        <td>${h.checks}</td>
        <td>${h.staff} чел.</td>
        <td>${actSum ? Utils.money(actSum) : "—"}</td>
        <td>${actChecks || "—"}</td>
        <td class="${d >= 0 ? "pos" : "neg"}">${actSum ? (d >= 0 ? "+" : "") + dPct + "%" : "—"}</td>
        <td class="muted">${h.isFallback ? "~" : "×" + h.trend}</td>
      `;
    }

    // Графики
    const labels = forecast.hourly.map(h => `${h.hour}:00`);
    const fcData  = forecast.hourly.map(h => h.sum);
    const actData = forecast.hourly.map(h => actual?.hourly.find(r => r.hour == h.hour)?.sum || 0);
    const staffData = forecast.hourly.map(h => h.staff);

    if (compChart) compChart.destroy();
    compChart = new Chart(document.getElementById("fc-chart").getContext("2d"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Прогноз", data: fcData, backgroundColor: "rgba(59,130,246,0.7)", borderRadius: 6 },
          { label: "Факт",    data: actData, backgroundColor: "rgba(16,185,129,0.7)", borderRadius: 6 },
        ],
      },
      options: { responsive: true, plugins: { legend: { position: "top" } } },
    });

    if (hourlyChart) hourlyChart.destroy();
    hourlyChart = new Chart(document.getElementById("staff-chart").getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets: [{ label: "Нужно сотрудников", data: staffData, borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,0.15)", tension: 0.3, fill: true, pointRadius: 4 }],
      },
      options: { responsive: true, scales: { y: { min: 0, ticks: { stepSize: 1 } } } },
    });
  }

  function init() {
    const picker = document.getElementById("forecast-date");
    picker.value = Utils.formatDate(new Date());
    document.getElementById("btn-forecast").addEventListener("click", render);
    render();
  }

  return { init };
})();

window.Forecast = Forecast;
