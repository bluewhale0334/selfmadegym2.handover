import { useMemo, useState } from "react";
import "./DatePicker.css";

function DatePicker({ selectedDate, onSelect, onClose, highlightedDates = [] }) {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(
    selectedDate ? new Date(selectedDate) : today
  );

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const daysInMonth = lastDayOfMonth.getDate();
  const startingDayOfWeek = firstDayOfMonth.getDay();

  const formatDateString = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const highlightedSet = useMemo(
    () => new Set(highlightedDates),
    [highlightedDates]
  );

  const handleDateClick = (day) => {
    const date = new Date(year, month, day);
    const dateString = formatDateString(date);
    onSelect?.(dateString);
  };

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(year, month - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(new Date(year, month + 1, 1));
  };

  const isSelected = (day) => {
    if (!selectedDate) return false;
    const date = new Date(selectedDate);
    return (
      date.getFullYear() === year &&
      date.getMonth() === month &&
      date.getDate() === day
    );
  };

  const isToday = (day) => {
    return (
      today.getFullYear() === year &&
      today.getMonth() === month &&
      today.getDate() === day
    );
  };

  const weekDays = ["일", "월", "화", "수", "목", "금", "토"];
  const monthNames = [
    "1월",
    "2월",
    "3월",
    "4월",
    "5월",
    "6월",
    "7월",
    "8월",
    "9월",
    "10월",
    "11월",
    "12월",
  ];

  return (
    <div className="date-picker-overlay" onClick={onClose}>
      <div className="date-picker" onClick={(e) => e.stopPropagation()}>
        <div className="date-picker-header">
          <button
            type="button"
            className="date-picker-nav"
            onClick={goToPreviousMonth}
          >
            ‹
          </button>
          <span className="date-picker-month">
            {year}년 {monthNames[month]}
          </span>
          <button
            type="button"
            className="date-picker-nav"
            onClick={goToNextMonth}
          >
            ›
          </button>
        </div>
        <div className="date-picker-weekdays">
          {weekDays.map((day) => (
            <div key={day} className="date-picker-weekday">
              {day}
            </div>
          ))}
        </div>
        <div className="date-picker-days">
          {Array.from({ length: startingDayOfWeek }).map((_, index) => (
            <div key={`empty-${index}`} className="date-picker-day empty" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, index) => {
            const day = index + 1;
            const dateString = formatDateString(new Date(year, month, day));
            const isHighlighted = highlightedSet.has(dateString);
            return (
              <button
                key={day}
                type="button"
                className={[
                  "date-picker-day",
                  isSelected(day) ? "selected" : "",
                  isToday(day) ? "today" : "",
                  isHighlighted ? "has-data" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => handleDateClick(day)}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default DatePicker;
