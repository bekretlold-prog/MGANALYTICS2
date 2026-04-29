// ============================================================
//  modules/forecast/forecast.js
//  Прогноз — работает без данных прошлого года
//  База: похожие дни недели из доступных данных + тренд
// ============================================================

const Forecast = (() => {

  // Группируем записи по дате+час → итого
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

  // Все доступные даты того же дня недели что и targetDate, исключая саму targetDate
  function sameDayDates(allDates, targetDate) {
    const wd = targetDate.getDay();
    return allDates
      .filter(d => {
        const obj = Utils.parseDate(d);
        return obj.getDay() === wd && d !== Utils.formatDate(targetDate);
      })
      .sort();
  }

  async function compute(targetDateStr) {
    const raw = await DB.getSales();
    if (!raw.length) return null;

    const agg = aggregateSales(raw);
    const targetDate = Utils.parseDate(targetDateStr);
    const allDates = [...new Set(agg.map(r => r.date))].sort();
    const hours = [...new Set(agg.map(r => r.hour))].sort((a, b) => a - b);

    // Найти похожие дни недели (максимум 8)
    const similarDates = sameDayDates(allDates, targetDate).slice(-8);

    if (!similarDates.length && !allDates.includes(targetDateStr)) {
      return null; // совсем нет данных
    }

    // Для каждого часа считаем базу и тренд
    const hourly = [];
    let totalSum = 0, totalChecks = 0;

    for (const h of hours) {
      // Данные по похожим дням для этого часа
      const similar = similarDates
        .map(d => agg.find(r => r.date === d && r.hour === h))
        .filter(Boolean);

      // Если есть данные за targetDate — это факт, не прогноз
      const actual = agg.find(r => r.date === targetDateStr && r.hour === h);

      let forecastSum = 0, forecastChecks = 0;
      let trendLabel = "—";

      if (similar.length >= 2) {
        // Делим похожие дни на "старые" и "новые" для тренда
        const half = Math.ceil(similar.length / 2);
        const older = similar.slice(0, half);
        const newer = similar.slice(half);

        const avgOlder = older.reduce((a, b) => a + b.sum, 0) / older.length;
        const avgNewer = newer.reduce((a, b) => a + b.sum, 0) / newer.length;
        const trend = avgOlder > 0 ? avgNewer / avgOlder : 1;

        // База — среднее по последним 2-4 похожим дням с тренд-поправкой
        const base = similar.slice(-4);
        const baseAvgSum    = base.reduce((a, b) => a + b.sum, 0)    / base.length;
        const baseAvgChecks = base.reduce((a, b) => a + b.checks, 0) / base.length;

        forecastSum    = Math.round(baseAvgSum * (trend > 0.5 && trend < 2 ? trend : 1));
        forecastChecks = Math.round(baseAvgChecks);
        trendLabel = `×${trend.toFixed(2)}`;

      } else if (similar.length === 1) {
        forecastSum    = similar[0].sum;
        forecastChecks = similar[0].checks;
        trendLabel = "1 день";
      } else {
        // Нет похожих дней — берём среднее по всем дням для этого часа
        const allForHour = agg.filter(r => r.hour === h && r.date !== targetDateStr);
        if (allForHour.length) {
          forecastSum    = Math.round(allForHour.reduce((a, b) => a + b.sum, 0)    / allForHour.length);
          forecastChecks = Math.round(allForHour.reduce((a, b) => a + b.checks, 0) / allForHour.length);
          trendLabel = "~средн.";
        }
      }

      const staff = forecastChecks > 0 ? Math.ceil(forecastChecks / CONFIG.STAFF_NORM) : 0;

      hourly.push({
        hour: h,
        sum: forecastSum,
        checks: forecastChecks,
        staff,
        trendLabel,
        actualSum:    actual?.sum    || 0,
        actualChecks: actual?.checks || 0,
        hasActual: !!actual,
      });

      totalSum    += forecastSum;
      totalChecks += forecastChecks;
    }

    // Определяем пиковый час
    const peak = [...hourly].sort((a, b) => b.sum - a.sum)[0];

    return {
      date: targetDateStr,
      dayName: Utils.dayName(targetDate),
      hourly,
      totalSum,
      totalChecks,
      peak,
      basedOn: similarDates.slice(-4),
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

    // Актуальная выручка (если есть)
    const actualTotal = result.hourly.reduce((a, b) => a + b.actualSum, 0);
    const diff = result.hasActual ? actualTotal - result.totalSum : null;
    const diffPct = diff !== null && result.totalSum ? ((diff / result.totalSum) * 100).toFixed(1) : null;

    document.getElementById("fc-date").textContent     = `${dateStr} (${result.dayName})`;
    document.getElementById("fc-forecast").textContent = Utils.money(result.totalSum);
    document.getElementById("fc-actual").textContent   = result.hasActual ? Utils.money(actualTotal) : "нет данных";
    document.getElementById("fc-diff").textContent     = diffPct !== null ? (parseFloat(diffPct) >= 0 ? "+" : "") + diffPct + "%" : "—";
    document.getElementById("fc-diff").className       = diffPct !== null ? (parseFloat(diffPct) >= 0 ? "sum-value pos" : "sum-value neg") : "sum-value";
    document.getElementById("fc-checks").textContent   = Utils.num(result.totalChecks);
    document.getElementById("fc-peak").textContent     = result.peak ? `${result.peak.hour}:00 (${Utils.money(result.peak.sum)})` : "—";
    document.getElementById("fc-based").textContent    = result.basedOn.length ? result.basedOn.join(", ") : "среднее по всем дням";

    // Таблица
    const tbody = document.querySelector("#fc-table tbody");
    tbody.innerHTML = "";
    for (const h of result.hourly) {
      if (h.sum === 0 && !h.hasActual) continue; // пропускаем пустые часы
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
        <td class="muted">${h.trendLabel}</td>
      `;
    }

    // Графики
    const labels     = result.hourly.filter(h => h.sum > 0 || h.hasActual).map(h => `${h.hour}:00`);
    const fcData     = result.hourly.filter(h => h.sum > 0 || h.hasActual).map(h => h.sum);
    const actData    = result.hourly.filter(h => h.sum > 0 || h.hasActual).map(h => h.actualSum);
    const staffData  = result.hourly.filter(h => h.sum > 0 || h.hasActual).map(h => h.staff);

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
          tension: 0.3,
          fill: true,
          pointRadius: 4,
        }],
      },
      options: {
        responsive: true,
        scales: { y: { min: 0, ticks: { stepSize: 1 } } },
      },
    });
  }

  async function init() {
    // Устанавливаем последнюю доступную дату по умолчанию
    const sales = await DB.getSales();
    const dates = [...new Set(sales.map(r => r.date))].sort();
    const picker = document.getElementById("forecast-date");
    if (dates.length) {
      picker.value = dates[dates.length - 1];
    } else {
      picker.value = Utils.formatDate(new Date());
    }
    document.getElementById("btn-forecast").addEventListener("click", render);
    render();
  }

  return { init };
})();

window.Forecast = Forecast;
