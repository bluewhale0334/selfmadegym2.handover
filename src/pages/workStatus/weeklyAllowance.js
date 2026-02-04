const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

const parseTimeToMinutes = (value) => {
  if (!value) return null;
  const [hourText, minuteText = "0"] = String(value).split(":");
  const hour = Number.parseInt(hourText, 10);
  const minute = Number.parseInt(minuteText, 10) || 0;
  if (Number.isNaN(hour)) return null;
  return hour * 60 + minute;
};

// Deprecated: 이제 DB에서 저장된 assumedHours를 사용합니다.
// 하위 호환성을 위해 유지하지만, workTime.assumedHours가 있으면 우선 사용합니다.
const getDailyAssumedHours = (workTime) => {
  // DB에 저장된 상정근로시간이 있으면 우선 사용
  if (workTime?.assumedHours != null && workTime.assumedHours !== "") {
    return Number(workTime.assumedHours) || 0;
  }
  // 하위 호환성: 기존 계산 방식 (startTime, endTime 기반)
  if (!workTime?.startTime || !workTime?.endTime) return 0;
  const startMinutes = parseTimeToMinutes(workTime.startTime);
  const endMinutes = parseTimeToMinutes(workTime.endTime);
  if (startMinutes === null || endMinutes === null) return 0;
  let durationMinutes = endMinutes - startMinutes;
  if (durationMinutes <= 0) {
    durationMinutes += 24 * 60;
  }
  const durationHours = durationMinutes / 60;
  return Math.max(0, durationHours - 1);
};

export const getNetWorkHoursValue = (startTime, endTime, weekdayIndex) => {
  if (!startTime || !endTime) return 0;
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  if (startMinutes === null || endMinutes === null) return 0;
  let durationMinutes = endMinutes - startMinutes;
  if (durationMinutes <= 0) {
    durationMinutes += 24 * 60;
  }
  let breakMinutes = 0;
  if (weekdayIndex >= 1 && weekdayIndex <= 5) {
    if (durationMinutes >= 9 * 60) {
      breakMinutes = 60;
    }
  }
  const netMinutes = Math.max(0, durationMinutes - breakMinutes);
  return netMinutes / 60;
};

export const calculateWeeklyAllowance = ({
  year,
  month,
  workTime,
  recordsByDate,
  holidayTags = {},
  hourlyWage = 0,
  carryoverFromPrev = 0,
}) => {
  const results = [];
  let carryoverHours = 0;
  const isWeeklyAllowanceEnabled = workTime?.weeklyAllowanceEnabled !== false;
  const dailyAssumedHours = getDailyAssumedHours(workTime);
  const scheduledWeekdayCount = Array.isArray(workTime?.weekdays)
    ? workTime.weekdays.filter((day) => day !== "일").length
    : 0;
  const maxAssumedHours = Math.min(dailyAssumedHours * scheduledWeekdayCount, 40);
  const monthIndex = month - 1;
  const firstDay = new Date(year, monthIndex, 1);
  const startDate = new Date(firstDay);
  startDate.setDate(firstDay.getDate() - firstDay.getDay());

  const lastDay = new Date(year, monthIndex + 1, 0);
  for (let weekIndex = 0; weekIndex < 6; weekIndex += 1) {
    const weekDates = [];
    let hasCurrentMonthDay = false;
    let spillsToNextMonth = false;
    let isFirstWeek = false;
    let isLastWeek = false;
    for (let i = 0; i < 7; i += 1) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + weekIndex * 7 + i);
      weekDates.push(date);
      if (date.getMonth() === monthIndex) {
        hasCurrentMonthDay = true;
        if (date.getDate() === 1) {
          isFirstWeek = true;
        }
        if (date.getDate() === lastDay.getDate()) {
          isLastWeek = true;
        }
      } else if (date.getMonth() > monthIndex || date.getFullYear() > year) {
        spillsToNextMonth = true;
      }
    }
    if (!hasCurrentMonthDay) {
      continue;
    }

    const scheduledWeekdays = new Set(
      Array.isArray(workTime?.weekdays) ? workTime.weekdays : []
    );
    const inMonthDates = weekDates.filter((date) => date.getMonth() === monthIndex);
    const weeklyScheduledCount = inMonthDates.reduce((count, date) => {
      const weekdayLabel = WEEKDAY_LABELS[date.getDay()];
      if (!scheduledWeekdays.has(weekdayLabel)) return count;
      if (weekdayLabel === "일") return count;
      return count + 1;
    }, 0);
    const hasScheduledDays = weeklyScheduledCount > 0;
    const weeklyAssumedHours = Math.min(
      inMonthDates.reduce((sum, date) => {
        const weekdayLabel = WEEKDAY_LABELS[date.getDay()];
        if (!scheduledWeekdays.has(weekdayLabel)) return sum;
        if (weekdayLabel === "일") return sum;
        return sum + dailyAssumedHours;
      }, 0),
      40
    );

    const attendedMap = inMonthDates.reduce((acc, date) => {
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate()
      ).padStart(2, "0")}`;
      const weekdayLabel = WEEKDAY_LABELS[date.getDay()];
      if (!scheduledWeekdays.has(weekdayLabel)) return acc;
      if (holidayTags[dateKey]) {
        acc[dateKey] = true;
        return acc;
      }
      const record = recordsByDate[dateKey];
      if (record?.issueType === "결근") {
        acc[dateKey] = false;
        return acc;
      }
      acc[dateKey] = Boolean(record?.startTime && record?.endTime);
      return acc;
    }, {});

    const actualWorkdayCount = Object.values(attendedMap).filter(Boolean).length;
    const actualWorkedCount = inMonthDates.reduce((count, date) => {
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate()
      ).padStart(2, "0")}`;
      const weekdayLabel = WEEKDAY_LABELS[date.getDay()];
      if (!scheduledWeekdays.has(weekdayLabel)) return count;
      if (holidayTags[dateKey]) return count;
      const record = recordsByDate[dateKey];
      if (!record?.startTime || !record?.endTime) return count;
      return count + 1;
    }, 0);
    const hasAbsence = Object.values(attendedMap).some((value) => value === false);

    // 해당 주차에서 이전 달에 속한 날짜 중 근무 예정일이 있는지 확인
    const prevMonthScheduledCount = weekDates
      .filter((d) => d.getMonth() !== monthIndex)
      .reduce((count, date) => {
        const weekdayLabel = WEEKDAY_LABELS[date.getDay()];
        if (!scheduledWeekdays.has(weekdayLabel)) return count;
        if (weekdayLabel === "일") return count;
        return count + 1;
      }, 0);

    const eligible = isWeeklyAllowanceEnabled && hasScheduledDays
      ? isFirstWeek
        ? (carryoverFromPrev > 0 || prevMonthScheduledCount === 0) &&
          Object.values(attendedMap).every(Boolean)
        : Object.values(attendedMap).every(Boolean)
      : false;
    const hasHoliday = inMonthDates.some((date) => {
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate()
      ).padStart(2, "0")}`;
      return Boolean(holidayTags[dateKey]);
    });
    const weekWorkHours = inMonthDates.reduce((sum, date) => {
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate()
      ).padStart(2, "0")}`;
      const record = recordsByDate[dateKey];
      if (!record?.startTime || !record?.endTime) return sum;
      return sum + getNetWorkHoursValue(record.startTime, record.endTime, date.getDay());
    }, 0);

    let baseHours = hasHoliday ? weekWorkHours : weeklyAssumedHours;
    if (isFirstWeek && carryoverFromPrev > 0) {
      baseHours += carryoverFromPrev;
    }
    const allowanceHours = Math.min(baseHours, maxAssumedHours);
    const displayHours = Math.min(weekWorkHours, maxAssumedHours);
    const labelHours = Math.min(
      isFirstWeek && carryoverFromPrev > 0
        ? weekWorkHours + carryoverFromPrev
        : weekWorkHours,
      maxAssumedHours
    );
    const allowancePay = eligible ? Math.floor((allowanceHours / 40) * 8 * hourlyWage) : 0;

    let weekCarryoverHours = 0;
    if (isLastWeek && spillsToNextMonth && eligible && actualWorkdayCount < scheduledWeekdayCount) {
      weekCarryoverHours = weekWorkHours;
      carryoverHours = weekCarryoverHours;
    }

    results.push({
      weekStart: weekDates[0],
      eligible,
      allowanceHours,
      displayHours,
      labelHours,
      allowancePay,
      spillsToNextMonth,
      isFirstWeek,
      isLastWeek,
      carryoverHours: weekCarryoverHours,
    });
  }

  return {
    weeklyResults: results,
    carryoverHours,
  };
};
