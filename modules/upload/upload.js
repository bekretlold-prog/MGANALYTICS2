// ============================================================
//  modules/upload/upload.js
// ============================================================

const Upload = (() => {

  let pendingFiles = [];

  function detectReportType(rows) {
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const rowStr = rows[i].map(c => String(c).toLowerCase()).join(" ");
      if (rowStr.includes("час закрытия") || rowStr.includes("альфа") || rowStr.includes("kiosk")) return "hourly";
      if (rowStr.includes("количество блюд") || rowStr.includes("себестоимость единицы")) return "prodmix";
    }
    return null;
  }

  async function processFiles() {
    if (!pendingFiles.length) { Utils.toast("Нет файлов для обработки", "error"); return; }

    Utils.showLoader("Обрабатываем файлы...");
    let salesAdded = 0, menuAdded = 0, errors = [];

    for (const file of pendingFiles) {
      try {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        const type = detectReportType(rows);

        if (type === "hourly") {
          const result = HourlyParser.parse(buffer);
          if (result.error) { errors.push(`${file.name}: ${result.error}`); continue; }
          const added = await DB.addSales(result.records);
          salesAdded += added;
          Utils.toast(`${file.name}: добавлено ${added} записей продаж (${result.date})`);
        } else if (type === "prodmix") {
          const result = ProdMixParser.parse(buffer);
          if (result.error) { errors.push(`${file.name}: ${result.error}`); continue; }
          const added = await DB.addMenu(result.records);
          menuAdded += added;
          Utils.toast(`${file.name}: добавлено ${added} позиций меню (${result.date})`);
        } else {
          errors.push(`${file.name}: неизвестный тип отчёта`);
        }
      } catch (e) {
        errors.push(`${file.name}: ${e.message}`);
      }
    }

    pendingFiles = [];
    renderFileList();
    Utils.hideLoader();
    renderSummary();

    if (errors.length) {
      errors.forEach(e => Utils.toast(e, "error"));
    } else {
      Utils.toast(`Готово! Продажи: +${salesAdded}, Меню: +${menuAdded}`, "success");
    }
  }

  async function renderSummary() {
    const sales = await DB.getSales();
    const menu  = await DB.getMenu();

    const dates = [...new Set(sales.map(r => r.date))].sort();
    const totalSum = sales.filter(r => r.channel !== "total").reduce((a, b) => a + b.sum, 0);
    const dishes = new Set(menu.map(r => r.dish)).size;

    document.getElementById("upload-summary").innerHTML = `
      <div class="summary-grid">
        <div class="sum-card">
          <div class="sum-label">Дней данных</div>
          <div class="sum-value">${dates.length}</div>
          <div class="sum-sub">${dates[0] || "—"} → ${dates[dates.length-1] || "—"}</div>
        </div>
        <div class="sum-card">
          <div class="sum-label">Записей продаж</div>
          <div class="sum-value">${sales.length}</div>
          <div class="sum-sub">по часам и каналам</div>
        </div>
        <div class="sum-card">
          <div class="sum-label">Общая выручка</div>
          <div class="sum-value">${Utils.money(totalSum)}</div>
          <div class="sum-sub">за весь период</div>
        </div>
        <div class="sum-card">
          <div class="sum-label">Позиций меню</div>
          <div class="sum-value">${dishes}</div>
          <div class="sum-sub">уникальных блюд</div>
        </div>
      </div>
    `;
  }

  function renderFileList() {
    const el = document.getElementById("file-list");
    if (!pendingFiles.length) { el.innerHTML = '<span class="muted">Файлы не выбраны</span>'; return; }
    el.innerHTML = pendingFiles.map(f => `<div class="file-item">📄 ${f.name}</div>`).join("");
  }

  function init() {
    const dropzone  = document.getElementById("dropzone");
    const fileInput = document.getElementById("file-input");

    dropzone.addEventListener("click", () => fileInput.click());
    dropzone.addEventListener("dragover", e => { e.preventDefault(); dropzone.classList.add("drag-over"); });
    dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag-over"));
    dropzone.addEventListener("drop", e => {
      e.preventDefault();
      dropzone.classList.remove("drag-over");
      pendingFiles.push(...Array.from(e.dataTransfer.files));
      renderFileList();
    });
    fileInput.addEventListener("change", e => {
      pendingFiles.push(...Array.from(e.target.files));
      renderFileList();
      fileInput.value = "";
    });

    document.getElementById("btn-process").addEventListener("click", processFiles);
    document.getElementById("btn-clear-sales").addEventListener("click", async () => {
      if (!confirm("Удалить все данные продаж?")) return;
      await DB.clearSales(); DB.clearCache(); renderSummary();
      Utils.toast("Данные продаж удалены");
    });
    document.getElementById("btn-clear-menu").addEventListener("click", async () => {
      if (!confirm("Удалить все данные меню?")) return;
      await DB.clearMenu(); DB.clearCache(); renderSummary();
      Utils.toast("Данные меню удалены");
    });

    renderSummary();
  }

  return { init };
})();

window.Upload = Upload;
