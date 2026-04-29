// ============================================================
//  modules/dashboard/dashboard.js
//  Основной дашборд
// ============================================================

const Dashboard = (() => {

    async function render() {
        Utils.showLoader("Обновляем дашборд...");

        const hourly = await DB.getHourly();
        const sales  = await DB.getSales();
        const menu   = await DB.getMenu();

        // === KPI ===
        let totalRevenue = 0;
        let totalChecks = 0;

        hourly.forEach(h => {
            totalRevenue += h.sum || h.revenue || 0;
            totalChecks  += h.checks || 0;
        });

        // Если почасовых данных нет — fallback на sales
        if (totalChecks === 0 && sales.length) {
            totalChecks = sales.length;
            totalRevenue = sales.reduce((sum, r) => sum + (r.sum || r.revenue || 0), 0);
        }

        const avgCheck = totalChecks ? Math.round(totalRevenue / totalChecks) : 0;

        // Последние 14 дней
        const today = new Date();
        const last14 = [];
        for (let i = 13; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            last14.push(Utils.formatDate(d));
        }

        document.getElementById("total-revenue-14")?.textContent = Utils.money(totalRevenue);
        document.getElementById("total-checks")?.textContent     = Utils.num(totalChecks);
        document.getElementById("avg-check")?.textContent        = Utils.money(avgCheck);

        // Топ-5 блюд сегодня (упрощённо)
        const todayStr = Utils.formatDate(new Date());
        const todayDishes = menu.filter(m => m.date === todayStr);
        const topDishes = [...todayDishes]
            .sort((a, b) => b.sum - a.sum)
            .slice(0, 5);

        const topList = document.getElementById("top-dishes");
        if (topList) {
            topList.innerHTML = topDishes.map(d => `
                <div class="top-row">
                    <span class="top-name">${d.dish}</span>
                    <span class="top-qty">${Utils.num(d.qty)} шт</span>
                    <span class="top-sum">${Utils.money(d.sum)}</span>
                </div>
            `).join('');
        }

        Utils.hideLoader();
        Utils.toast("Дашборд обновлён", "success");
    }

    function init() {
        // Кнопка обновления дашборда (если есть)
        const refreshBtn = document.getElementById("refresh-dashboard");
        if (refreshBtn) refreshBtn.addEventListener("click", render);

        // Первичная загрузка
        render();
    }

    return { init, render };
})();

// Делаем глобально доступным
window.Dashboard = Dashboard;
