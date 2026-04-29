// ============================================================
//  modules/dashboard/dashboard.js — ИСПРАВЛЕННАЯ ВЕРСИЯ
// ============================================================

const Dashboard = (() => {

    async function render() {
        if (typeof Utils === "undefined" || typeof DB === "undefined") {
            console.error("Dashboard: Utils или DB не загружены");
            return;
        }

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

        // Обновляем карточки
        document.getElementById("total-revenue-14")?.textContent = Utils.money(totalRevenue);
        document.getElementById("total-checks")?.textContent     = Utils.num(totalChecks);
        document.getElementById("avg-check")?.textContent        = Utils.money(avgCheck);

        // Топ-5 блюд
        const todayStr = Utils.formatDate(new Date());
        const todayDishes = menu
            .filter(m => m.date === todayStr)
            .sort((a, b) => (b.sum || 0) - (a.sum || 0))
            .slice(0, 5);

        const topList = document.getElementById("top-dishes");
        if (topList) {
            topList.innerHTML = todayDishes.length ? 
                todayDishes.map(d => `
                    <div class="top-row">
                        <span class="top-name">${d.dish}</span>
                        <span class="top-qty">${Utils.num(d.qty)} шт</span>
                        <span class="top-sum">${Utils.money(d.sum)}</span>
                    </div>
                `).join('') 
                : '<p class="muted">Нет данных за сегодня</p>';
        }

        Utils.hideLoader();
    }

    function init() {
        console.log("✅ Dashboard module initialized");
        render();
    }

    return { init, render };

})();

// КРИТИЧНО ВАЖНАЯ СТРОКА — делаем объект глобальным
window.Dashboard = Dashboard;
