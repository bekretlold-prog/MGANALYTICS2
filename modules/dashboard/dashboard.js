// ============================================================
//  modules/dashboard/dashboard.js
//  Показывает последний доступный день, не обязательно "сегодня"
// ============================================================

const Dashboard = (() => {

  let channelChart = null, trendChart = null;

  function sumByDate(sales, date) {
    return sales.filter(r => r.date === date).reduce((a, b) => a + b.sum, 0);
  }
  function checksByDate(sales, date) {
    return sales.filter(r => r.date === date).reduce((a, b) => a + b.checks, 0);
  }

  async function render() {
    Utils.showLoader("Загружаем дашборд...");
    const sales = await DB.getSales();
    const menu  = await DB.getMenu();
    Utils.hideLoader();

    if (!sales.length) {
      document.getElementById("dash-content").innerHTML =
        '<p class="muted center" style="padding:60px 20px">Загрузи отчёты во вкладке «Загрузка» чтобы увидеть дашборд</p>';
      return;
    }

    // Берём последний доступный день и предыдущий
    const allDates = [...new Set(sales.map(r => r.date))].sort();
    const lastDate = allDates[allDates.length - 1];
    const prevDate = allDates.length > 1 ? allDates[allDates.length - 2] : null;

    const lastSum  = sumByDate(sales, lastDate);
    const prevSum  = prevDate ? sumByDate(sales, prevDate) : 0;
    const lastChks = checksByDate(sales, lastDate);
    const prevChks = prevDate ? checksByDate(sales, prevDate) : 0;
    const lastAvg  = lastChks  ? lastSum  / lastChks  : 0;
    const prevAvg  = prevChks  ? prevSum  / prevChks  : 0;

    // Тот же день недели неделю назад
    const lastDateObj = Utils.parseDate(lastDate);
    const sameWD = allDates
      .filter(d => {
        const obj = Utils.parseDate(d);
        return obj.getDay() === lastDateObj.getDay() && d !== lastDate;
      })
      .sort();
    const sameDayLast = sameWD.length ? sameWD[sameWD.length - 1] : null;
    const sameDaySum  = sameDayLast ? sumByDate(sales, sameDayLast) : 0;

    // Период всех данных
    const firstDate = allDates[0];
    const totalSum  = sales.reduce((a, b) => a + b.sum, 0);
    const totalChks = sales.reduce((a, b) => a + b.checks, 0);
    const avgCheck  = totalChks ? totalSum / totalChks : 0;

    function delta(cur, prev) {
      if (!prev) return "";
      const d = ((cur - prev) / prev * 100).toFixed(1);
      return `${parseFloat(d) >= 0 ? "▲" : "▼"} ${Math.abs(d)}%`;
    }
    function deltaClass(cur, prev) {
      if (!prev) return "";
      return cur >= prev ? "pos" : "neg";
    }

    document.getElementById("dash-kpi").innerHTML = `
      <div class="kpi-card">
        <div class="kpi-label">Последний день</div>
        <div class="kpi-value" style="font-size:18px">${lastDate} (${Utils.dayName(lastDateObj)})</div>
        <div class="kpi-delta muted">данные за ${allDates.length} дней: ${firstDate} → ${lastDate}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Выручка ${lastDate}</div>
        <div class="kpi-value">${Utils.money(lastSum)}</div>
        <div class="kpi-delta ${deltaClass(lastSum, prevSum)}">
          ${prevDate ? delta(lastSum, prevSum) + " vs " + prevDate : "нет предыдущего дня"}
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Чеков ${lastDate}</div>
        <div class="kpi-value">${Utils.num(lastChks)}</div>
        <div class="kpi-delta ${deltaClass(lastChks, prevChks)}">
          ${prevDate ? delta(lastChks, prevChks) + " vs " + prevDate : ""}
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Средний чек ${lastDate}</div>
        <div class="kpi-value">${Utils.money(lastAvg)}</div>
        <div class="kpi-delta ${deltaClass(lastAvg, prevAvg)}">
          ${prevAvg ? delta(lastAvg, prevAvg) + " vs " + prevDate : ""}
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Выручка за период</div>
        <div class="kpi-value">${Utils.money(totalSum)}</div>
        <div class="kpi-delta muted">${allDates.length} дней</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Средний чек (период)</div>
        <div class="kpi-value">${Utils.money(avgCheck)}</div>
        <div class="kpi-delta muted">${Utils.num(totalChks)} чеков всего</div>
      </div>
    `;

    // Тренд — все доступные дни
    const trendDates = allDates.slice(-14); // последние 14 дней из данных
    const trendData  = trendDates.map(d => sumByDate(sales, d));

    if (trendChart) trendChart.destroy();
    trendChart = new Chart(document.getElementById("trend-chart").getContext("2d"), {
      type: "bar",
      data: {
        labels: trendDates.map(d => d.slice(5) + " " + Utils.dayName(Utils.parseDate(d))),
        datasets: [{
          label: "Выручка",
          data: trendData,
          backgroundColor: trendDates.map(d => d === lastDate ? "rgba(88,166,255,0.9)" : "rgba(88,166,255,0.4)"),
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { ticks: { callback: v => Utils.money(v).replace(" ₽","") + "₽" } } },
      },
    });

    // По дням недели — средняя выручка
    const byWD = [0,1,2,3,4,5,6].map(wd => {
      const days = allDates.filter(d => Utils.parseDate(d).getDay() === wd);
      return days.length ? days.reduce((a, d) => a + sumByDate(sales, d), 0) / days.length : 0;
    });
    const WD_NAMES = ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];

    if (channelChart) channelChart.destroy();
    channelChart = new Chart(document.getElementById("channel-chart").getContext("2d"), {
      type: "bar",
      data: {
        labels: WD_NAMES,
        datasets: [{
          label: "Средняя выручка",
          data: byWD,
          backgroundColor: byWD.map((_, i) => i === 0 || i === 6 ? "rgba(245,158,11,0.7)" : "rgba(16,185,129,0.7)"),
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { ticks: { callback: v => Utils.money(v).replace(" ₽","") + "₽" } } },
      },
    });

    // Топ блюд за весь период
    const menuByDish = {};
    for (const r of menu) {
      if (!menuByDish[r.dish]) menuByDish[r.dish] = { dish: r.dish, qty: 0, sum: 0 };
      menuByDish[r.dish].qty += r.qty;
      menuByDish[r.dish].sum += r.sum;
    }
    const topDishes = Object.values(menuByDish).sort((a,b) => b.sum - a.sum).slice(0, 5);

    document.getElementById("top-dishes").innerHTML = topDishes.length
      ? topDishes.map((d, i) => `
          <div class="top-row">
            <span class="top-num">${i+1}</span>
            <span class="top-name">${d.dish}</span>
            <span class="top-qty">${d.qty} шт</span>
            <span class="top-sum">${Utils.money(d.sum)}</span>
          </div>`).join("")
      : '<p class="muted">Загрузи Prod Mix отчёт</p>';

    // Алерты
    const alerts = [];
    if (sameDayLast && lastSum < sameDaySum * 0.8)
      alerts.push({ type: "warn", text: `Выручка ${lastDate} на ${Math.round((1-lastSum/sameDaySum)*100)}% ниже прошлого ${Utils.dayName(lastDateObj)} (${sameDayLast})` });
    if (sameDayLast && lastSum > sameDaySum * 1.2)
      alerts.push({ type: "ok", text: `Выручка ${lastDate} на ${Math.round((lastSum/sameDaySum-1)*100)}% выше прошлого ${Utils.dayName(lastDateObj)} (${sameDayLast})` });
    if (lastChks > 0 && lastAvg < avgCheck * 0.85)
      alerts.push({ type: "warn", text: `Средний чек ${lastDate} (${Utils.money(lastAvg)}) ниже среднего по периоду (${Utils.money(avgCheck)})` });

    document.getElementById("dash-alerts").innerHTML = alerts.length
      ? alerts.map(a => `<div class="alert alert-${a.type}">${a.text}</div>`).join("")
      : `<div class="alert alert-ok">✓ Всё в норме за ${lastDate}</div>`;
  }

  function init() { render(); }
  return { init };
})();

window.Dashboard = Dashboard;
