// ============================================================
//  core/calendar.js — Российский производственный календарь
//  + Классификатор типов дней для трассового ресторана М11
// ============================================================

const RusCalendar = (() => {

  // Официальные праздники и перенесённые выходные 2025-2026
  // Формат: 'YYYY-MM-DD'
  const HOLIDAYS = new Set([
    // 2025
    '2025-01-01','2025-01-02','2025-01-03','2025-01-04','2025-01-05',
    '2025-01-06','2025-01-07','2025-01-08',
    '2025-02-24', // перенос с 22.02
    '2025-03-10', // перенос с 08.03 (вс)
    '2025-05-01','2025-05-02', // Труд
    '2025-05-08','2025-05-09', // Победа
    '2025-06-12','2025-06-13', // Россия
    '2025-11-03','2025-11-04', // Единство
    '2025-12-31',
    // 2026
    '2026-01-01','2026-01-02','2026-01-03','2026-01-04','2026-01-05',
    '2026-01-06','2026-01-07','2026-01-08','2026-01-09',
    '2026-02-23',
    '2026-03-09', // 08.03 вс — перенос
    '2026-05-01','2026-05-04', // перенос
    '2026-05-08','2026-05-09','2026-05-11', // перенос
    '2026-06-12',
    '2026-11-04',
  ]);

  // Рабочие субботы (перенесённые)
  const WORKDAYS = new Set([
    '2025-11-08', // перенос
    '2026-01-09', // ??? уточни по офиц.календарю
  ]);

  function isHoliday(dateStr) {
    return HOLIDAYS.has(dateStr);
  }

  function isWeekend(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const wd = d.getDay();
    if (WORKDAYS.has(dateStr)) return false; // рабочая суббота
    return wd === 0 || wd === 6 || HOLIDAYS.has(dateStr);
  }

  // Считаем количество выходных подряд начиная с даты
  function _countConsecutiveOffDays(dateStr, direction = 1) {
    let count = 0;
    let d = new Date(dateStr + 'T00:00:00');
    for (let i = 0; i < 10; i++) {
      d.setDate(d.getDate() + direction);
      const ds = Utils.formatDate(d);
      if (isWeekend(ds)) count++;
      else break;
    }
    return count;
  }

  /**
   * Классификация дня — главная функция
   *
   * Типы:
   *  'pre_holiday'    — последний рабочий день перед 3+ выходными (М11: исходящий поток)
   *  'pre_holiday_2'  — предпредпраздничный (2 дня до старта): умеренный трафик
   *  'holiday_start'  — первый день длинных выходных (пиковый исходящий)
   *  'holiday_mid'    — середина длинных выходных
   *  'holiday_end'    — последний день длинных выходных (возвратный поток)
   *  'post_holiday'   — первый рабочий день после длинных выходных (возврат)
   *  'regular_weekend'— обычные выходные (сб/вс без праздников)
   *  'regular_workday'— обычный будний день
   */
  function classify(dateStr) {
    const d        = new Date(dateStr + 'T00:00:00');
    const wd       = d.getDay();
    const offToday = isWeekend(dateStr);

    if (!offToday) {
      // Рабочий день — смотрим что ЗА ним и ЧТО было ДО
      const nextOff = _countConsecutiveOffDays(dateStr, 1);
      const prevOff = _countConsecutiveOffDays(dateStr, -1);

      if (prevOff >= 3) return 'post_holiday';      // первый рабочий после длинных выходных
      if (nextOff >= 3) return 'pre_holiday';        // последний рабочий перед длинными
      if (nextOff === 2) return 'pre_holiday_2';     // пятница перед обычными выходными (всё равно трафик)
      return 'regular_workday';
    } else {
      // Выходной или праздник — определяем позицию внутри блока
      // Ищем начало и конец блока выходных
      let blockStart = new Date(d);
      for (let i = 1; i <= 14; i++) {
        const prev = new Date(blockStart);
        prev.setDate(prev.getDate() - 1);
        if (!isWeekend(Utils.formatDate(prev))) break;
        blockStart = prev;
      }
      let blockEnd = new Date(d);
      for (let i = 1; i <= 14; i++) {
        const next = new Date(blockEnd);
        next.setDate(next.getDate() + 1);
        if (!isWeekend(Utils.formatDate(next))) break;
        blockEnd = next;
      }

      const blockLen = Math.round((blockEnd - blockStart) / 86400000) + 1;

      if (blockLen <= 2) return 'regular_weekend'; // обычные сб-вс
      if (d.toDateString() === blockStart.toDateString()) return 'holiday_start';
      if (d.toDateString() === blockEnd.toDateString())   return 'holiday_end';
      return 'holiday_mid';
    }
  }

  // Человекочитаемое название типа
  const TYPE_LABELS = {
    pre_holiday:     '🚗 Предпраздничный (исход)',
    pre_holiday_2:   '📅 Перед выходными',
    holiday_start:   '🏁 Старт праздников (пик)',
    holiday_mid:     '🌅 Середина праздников',
    holiday_end:     '🔄 Конец праздников (возврат)',
    post_holiday:    '↩️ Постпраздничный (возврат)',
    regular_weekend: '📆 Обычные выходные',
    regular_workday: '💼 Рабочий день',
  };

  // Группы совместимости — какие типы можно сравнивать между собой
  const COMPAT_GROUPS = {
    pre_holiday:     ['pre_holiday', 'holiday_start'],
    pre_holiday_2:   ['pre_holiday_2', 'regular_weekend'],
    holiday_start:   ['holiday_start', 'pre_holiday'],
    holiday_mid:     ['holiday_mid'],
    holiday_end:     ['holiday_end', 'post_holiday'],
    post_holiday:    ['post_holiday', 'holiday_end'],
    regular_weekend: ['regular_weekend', 'pre_holiday_2'],
    regular_workday: ['regular_workday'],
  };

  function label(type) { return TYPE_LABELS[type] || type; }
  function compatTypes(type) { return COMPAT_GROUPS[type] || [type]; }

  return { classify, isHoliday, isWeekend, label, compatTypes };
})();

window.RusCalendar = RusCalendar;
