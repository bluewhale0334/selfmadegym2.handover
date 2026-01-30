import React from "react";

function StatsMonthNavigation({ viewYear, viewMonth, onPrevMonth, onNextMonth, onClickMonth, children, extra }) {
  return (
    <div className="work-status-month-nav">
      <button type="button" className="work-status-nav" onClick={onPrevMonth}>
        이전
      </button>
      <div className="work-status-month-wrapper">
        <button type="button" className="work-status-month" onClick={onClickMonth}>
          {viewYear}년 {viewMonth}월
        </button>
        {children}
      </div>
      <button type="button" className="work-status-nav" onClick={onNextMonth}>
        다음
      </button>
      {extra}
    </div>
  );
}

export default StatsMonthNavigation;
