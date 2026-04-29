// ============================================================
//  modules/dashboard/dashboard.js
//  Исправленная версия
// ============================================================

const Dashboard = (() => {

    async function render() {
        Utils.showLoader("Обновляем дашборд...");

        const hourly = await DB.getHourly();
        const menu   = await DB.getMenu();

        let totalRevenue = 0;
        let totalChecks  = 0;

        hourly.forEach(h => {
            totalRevenue += Number(h.sum || h.revenue || 0);
            totalChecks  += Number(h.checks || 0);
        });

        const avgCheck = totalChecks ? Math.round(totalRevenue / totalChecks) : 0;

        // Обновляем KPI на странице
        document.getElementById("total-revenue-14")?.textContent = Utils.money(totalRevenue);
        document.getElementById("total-checks")?.textContent     = Utils.num(totalChecks);
        document.getElementById("avg-check")?.textContent        = Utils.money(avgCheck);

        // Топ-5 блюд сегодня
        const todayStr = Utils.formatDate(new Date());
        const todayDishes = menu
            .filter(m => m.date === todayStr)
            .sort((a, b) => (b.sum || 0) - (a.sum || 0))
            .slice(0, 5);

        const topList = document.getElementById("top-dishes");
        if (topList) {
            if (todayDishes.length > 0) {
                topList.innerHTML = todayDishes.map(d => `
                    <div class="top-row">
                        <span class="top-name">${d.dish}</span>
                        <span class="top-qty">${Utils.num(d.qty)} шт</span>
                        <span class="top-sum">${Utils.money(d.sum)}</span>
                    </div>
                `).join('');
            } else {
                topList.innerHTML = '<p class="muted center">Нет данных за сегодня</p>';
            }
        }

        Utils.hideLoader();
    }

    function init() {
        console.log("✅ Dashboard module initialized");
        render();
    }

    return { init, render };

})();

// ← Это очень важно!
window.Dashboard = Dashboard;
