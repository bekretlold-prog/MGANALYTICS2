// ============================================================
//  modules/dashboard/dashboard.js
// ============================================================

const Dashboard = (() => {

  let channelChart = null, trendChart = null;

  async function render() {
    Utils.showLoader("Загружаем дашборд...");
    const sales = await DB.getSales();
    const menu  = await DB.getMenu();
    Utils.hideLoader();

    if (!sales.length) {
      document.getElementById("dash-content").innerHTML = '<p class="muted center" style="padding:60px">Загрузи отчёты во вкладке «Загрузка» чтобы увидеть дашборд</p>';
      return;
    }

    const today = Utils.formatDate(new Date());
    const yesterday = Utils.formatDate(Utils.daysAgo(1));

    // Агрегаты
    function sumBy(date, channel) {
      return sales.filter(r => r.date === date && (channel ? r.channel === channel : r.channel !== "total")).reduce((a, b) => a + b.sum, 0);
    }
    function checksBy(date) {
      return sales.filter(r => r.date === date && r.channel !== "total").reduce((a, b) => a + b.checks, 0);
    }

    const todaySum  = sumBy(today);
    const yestSum   = sumBy(yesterday);
    const todayChks = checksBy(today);
    const yestChks  = checksBy(yesterday);

    const todayAvg = todayChks  ? todaySum  / todayChks  : 0;
    const yestAvg  = yestChks   ? yestSum   / yestChks   : 0;

    // Сравнение с той же неделей прошлого года
    const todayDate = Utils.parseDate(today);
    const lyDate = new Date(todayDate); lyDate.setFullYear(lyDate.getFullYear() - 1);
    // Ищем тот же день недели в ±3 дня
    let lySum = 0;
    for (let offset = 0; offset <= 3; offset++) {
      for (const sign of [0, 1, -1]) {
        const d = new Date(lyDate); d.setDate(lyDate.getDate() + offset * sign);
        if (d.getDay() === todayDate.getDay()) {
          const s = sumBy(Utils.formatDate(d));
          if (s > 0) { lySum = s; break; }
        }
      }
      if (lySum) break;
    }

    const vsLY = lySum ? ((todaySum - lySum) / lySum * 100).toFixed(1) : null;

    // Каналы сегодня
    const alfaSum  = sumBy(today, "alfa");
    const kioskSum = sumBy(today, "kiosk");
    const cashSum  = sumBy(today, "cash");

    // KPI блок
    document.getElementById("dash-kpi").innerHTML = `
      <div class="kpi-card">
        <div class="kpi-label">Выручка сегодня</div>
        <div class="kpi-value">${Utils.money(todaySum)}</div>
        <div class="kpi-delta ${yestSum && todaySum >= yestSum ? "pos" : "neg"}">
          ${yestSum ? (todaySum >= yestSum ? "▲" : "▼") + " " + Math.abs(((todaySum - yestSum) / yestSum * 100)).toFixed(1) + "% vs вчера" : "нет данных вчера"}
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Чеков сегодня</div>
        <div class="kpi-value">${Utils.num(todayChks)}</div>
        <div class="kpi-delta ${yestChks && todayChks >= yestChks ? "pos" : "neg"}">
          ${yestChks ? (todayChks >= yestChks ? "▲" : "▼") + " vs вчера " + Utils.num(yestChks) : "нет данных вчера"}
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Средний чек</div>
        <div class="kpi-value">${Utils.money(todayAvg)}</div>
        <div class="kpi-delta ${yestAvg && todayAvg >= yestAvg ? "pos" : "neg"}">
          ${yestAvg ? (todayAvg >= yestAvg ? "▲" : "▼") + " vs вчера " + Utils.money(yestAvg) : "нет данных вчера"}
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">vs прошлый год</div>
        <div class="kpi-value ${vsLY !== null ? (parseFloat(vsLY) >= 0 ? "pos" : "neg") : ""}">${vsLY !== null ? (parseFloat(vsLY) >= 0 ? "+" : "") + vsLY + "%" : "нет данных"}</div>
        <div class="kpi-delta muted">${lySum ? "база: " + Utils.money(lySum) : "загрузи данные прошлого года"}</div>
      </div>
    `;

    // Тренд последних 14 дней
    const dates14 = [];
    for (let i = 13; i >= 0; i--) dates14.push(Utils.formatDate(Utils.daysAgo(i)));
    const trend14 = dates14.map(d => sumBy(d));

    if (trendChart) trendChart.destroy();
    trendChart = new Chart(document.getElementById("trend-chart").getContext("2d"), {
      type: "line",
      data: {
        labels: dates14.map(d => d.slice(5)),
        datasets: [{ label: "Выручка", data: trend14, borderColor: "#3b82f6", backgroundColor: "rgba(59,130,246,0.1)", tension: 0.3, fill: true, pointRadius: 3 }],
      },
      options: { responsive: true, plugins: { legend: { display: false } } },
    });

    // Каналы
    if (channelChart) channelChart.destroy();
    channelChart = new Chart(document.getElementById("channel-chart").getContext("2d"), {
      type: "doughnut",
      data: {
        labels: ["Альфа Банк", "Киоск", "Наличные"],
        datasets: [{ data: [alfaSum, kioskSum, cashSum], backgroundColor: ["#3b82f6", "#10b981", "#f59e0b"], borderWidth: 0 }],
      },
      options: { responsive: true, plugins: { legend: { position: "right" } } },
    });

    // Топ-5 блюд сегодня
    const todayDishes = menu.filter(r => r.date === today);
    const topDishes = todayDishes.sort((a, b) => b.sum - a.sum).slice(0, 5);
    document.getElementById("top-dishes").innerHTML = topDishes.length
      ? topDishes.map((d, i) => `
          <div class="top-row">
            <span class="top-num">${i + 1}</span>
            <span class="top-name">${d.dish}</span>
            <span class="top-qty">${d.qty} шт</span>
            <span class="top-sum">${Utils.money(d.sum)}</span>
          </div>`).join("")
      : '<p class="muted">Нет данных меню за сегодня</p>';

    // Алерты
    const alerts = [];
    if (todaySum > 0 && yestSum > 0 && todaySum < yestSum * 0.7)
      alerts.push({ type: "warn", text: `Выручка на ${Math.round((1 - todaySum/yestSum)*100)}% ниже вчера` });
    if (kioskSum > 0 && (alfaSum + cashSum) > 0 && kioskSum / (alfaSum + cashSum + kioskSum) > 0.6)
      alerts.push({ type: "info", text: `Киоск даёт ${Math.round(kioskSum/(alfaSum+cashSum+kioskSum)*100)}% выручки сегодня` });

    document.getElementById("dash-alerts").innerHTML = alerts.length
      ? alerts.map(a => `<div class="alert alert-${a.type}">${a.text}</div>`).join("")
      : '<div class="alert alert-ok">✓ Всё в норме</div>';
  }

  function init() {
    render();
  }

  return { init };
})();

window.Dashboard = Dashboard;
