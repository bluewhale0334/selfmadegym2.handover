import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import EmployeeStatsPagination from "./EmployeeStatsPagination";
import StatsMonthNavigation from "./StatsMonthNavigation";
import { calculateWeeklyAllowance, getNetWorkHoursValue } from "./workStatus/weeklyAllowance";
import "./EmployeeStatsPage.css";

const formatToday = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getTenureMonths = (createdAt) => {
  if (!createdAt) return null;
  const joinDate = createdAt?.toDate ? createdAt.toDate() : createdAt;
  if (!(joinDate instanceof Date) || Number.isNaN(joinDate.getTime())) {
    return null;
  }
  const now = new Date();
  let months =
    (now.getFullYear() - joinDate.getFullYear()) * 12 +
    (now.getMonth() - joinDate.getMonth());
  if (now.getDate() < joinDate.getDate()) {
    months -= 1;
  }
  return Math.max(0, months) + 1;
};

const formatWorkTime = (workTime) => {
  const weekdays = Array.isArray(workTime?.weekdays) ? workTime.weekdays : [];
  const weekdaysText = weekdays.length > 0 ? weekdays.join(",") : "미설정";
  const startTime = workTime?.startTime ? `${workTime.startTime}` : "";
  const endTime = workTime?.endTime ? `${workTime.endTime}` : "";
  const timeText =
    startTime && endTime ? `${startTime}~${endTime}시` : "미설정";
  const hasSunday = weekdays.includes("일");
  const sundayStart = workTime?.sundayStartTime ? `${workTime.sundayStartTime}` : "";
  const sundayEnd = workTime?.sundayEndTime ? `${workTime.sundayEndTime}` : "";
  const sundayText =
    hasSunday && sundayStart && sundayEnd
      ? `${sundayStart}~${sundayEnd}시(일)`
      : "";
  return sundayText
    ? `${weekdaysText} / ${timeText} / ${sundayText}`
    : `${weekdaysText} / ${timeText}`;
};

function EmployeeStatsPage({ profile, onClose }) {
  const todayDate = useMemo(() => new Date(), []);
  const [viewDate, setViewDate] = useState(
    () => new Date(todayDate.getFullYear(), todayDate.getMonth(), 1)
  );
  const [activeTab, setActiveTab] = useState("checklist"); // 'checklist' | 'salary'
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isYearListOpen, setIsYearListOpen] = useState(false);
  const [checklistStats, setChecklistStats] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [holidayTags, setHolidayTags] = useState({});
  const pageSize = 9;

  const { viewYear, viewMonth } = useMemo(() => ({
    viewYear: viewDate.getFullYear(),
    viewMonth: viewDate.getMonth() + 1,
  }), [viewDate]);

  const handlePrevMonth = () => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleOpenPicker = () => {
    setIsPickerOpen((prev) => !prev);
    setIsYearListOpen(false);
  };

  const handleSelectMonth = (monthIndex) => {
    setViewDate((prev) => new Date(prev.getFullYear(), monthIndex, 1));
    setIsPickerOpen(false);
    setIsYearListOpen(false);
  };

  const handleSelectYear = (yearValue) => {
    setViewDate((prev) => new Date(yearValue, prev.getMonth(), 1));
    setIsYearListOpen(false);
  };

  const yearOptions = useMemo(() => {
    const current = viewDate.getFullYear();
    return Array.from({ length: 10 }, (_, index) => current - 4 + index);
  }, [viewDate]);

  const todayStr = useMemo(() => {
    const y = todayDate.getFullYear();
    const m = String(todayDate.getMonth() + 1).padStart(2, "0");
    const d = String(todayDate.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, [todayDate]);

  // 공휴일 정보 로드
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "workDayTags"), (snapshot) => {
      const map = {};
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data?.date && data?.type) map[data.date] = data.type;
      });
      setHolidayTags(map);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (profile?.user_type !== "admin") return;
    const fetchStats = async () => {
      setIsLoading(true);
      setChecklistStats([]);
      setStatus("");
      try {
        const usersSnapshot = await getDocs(
          query(collection(db, "users"), where("user_type", "==", "customer"))
        );
        const users = [];
        usersSnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          users.push({
            id: docSnap.id,
            name: data.name || "사용자",
            role: data.role || "",
            createdAt: data.createdAt || null,
            workTime: data.workTime || {},
          });
        });

        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();

        const prevMonth = viewMonth === 1 ? 12 : viewMonth - 1;
        const prevYear = viewMonth === 1 ? viewYear - 1 : viewYear;

        const stats = await Promise.all(
          users.map(async (user) => {
            const endTime = user.workTime?.endTime || "";
            const endHour = Number.parseInt(endTime, 10);
            const endMinutes = Number.isNaN(endHour)
              ? null
              : endHour === 0
              ? 24 * 60
              : endHour * 60;
            
            // 조회 중인 달이 현재 달인 경우에만 오늘 업무 포함 여부 판단
            const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === (now.getMonth() + 1);
            const includeToday = !isCurrentMonth || (endMinutes === null ? true : nowMinutes >= endMinutes);

            const snapshots = await getDocs(
              query(
                collection(db, "dailyChecklistSnapshots"),
                where("userId", "==", user.id)
              )
            );
            let totalCount = 0;
            let doneCount = 0;
            snapshots.forEach((snapDoc) => {
              const data = snapDoc.data();
              if (!data.date) return;
              const [snapY, snapM] = data.date.split("-").map(Number);
              if (snapY !== viewYear || snapM !== viewMonth) return;
              if (data.date > todayStr) return;
              if (data.date === todayStr && !includeToday) return;
              
              const items = Array.isArray(data.items) ? data.items : [];
              const extraItems = Array.isArray(data.extraItems) ? data.extraItems : [];
              const dailyItems = items.filter(
                (item) => (item.category || "일일 업무") === "일일 업무"
              );
              totalCount += dailyItems.length + extraItems.length;
              doneCount +=
                dailyItems.filter((item) => item.done).length +
                extraItems.filter((item) => item.done).length;
            });
            const percent = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);
            
            const attendanceSnapshot = await getDocs(
              query(
                collection(db, "workAttendance"),
                where("userId", "==", user.id)
              )
            );
            
            const recordByDate = {};
            attendanceSnapshot.forEach((recordDoc) => {
              const data = recordDoc.data();
              if (!data.date) return;
              const existing = recordByDate[data.date];
              if (!existing || data.source === "admin") {
                recordByDate[data.date] = data;
              }
            });

            const hourlyWage = Number(user.workTime?.hourlyWage || 0);

            const monthRecords = Object.values(recordByDate).filter((record) => {
              const [recordYear, recordMonth] = String(record.date).split("-").map(Number);
              return recordYear === viewYear && recordMonth === viewMonth;
            });

            const totalWorkDays = monthRecords.filter(
              (record) => record.startTime && record.endTime
            ).length;

            const totalWorkHours = monthRecords.reduce((sum, record) => {
              if (!record.startTime || !record.endTime) return sum;
              const [y, m, d] = String(record.date).split("-").map(Number);
              const weekdayIndex = new Date(y, m - 1, d).getDay();
              return sum + getNetWorkHoursValue(record.startTime, record.endTime, weekdayIndex);
            }, 0);

            const baseWage = Math.floor(totalWorkHours * hourlyWage);

            const prevResult = calculateWeeklyAllowance({
              year: prevYear,
              month: prevMonth,
              workTime: user.workTime,
              recordsByDate: recordByDate,
              holidayTags,
              hourlyWage,
            });
            const carryoverFromPrev = prevResult.carryoverHours || 0;

            const weeklyAllowanceResult = calculateWeeklyAllowance({
              year: viewYear,
              month: viewMonth,
              workTime: user.workTime,
              recordsByDate: recordByDate,
              holidayTags,
              hourlyWage,
              carryoverFromPrev,
            });

            const totalWeeklyBonus = (weeklyAllowanceResult.weeklyResults || []).reduce((sum, result) => {
              if (result.carryoverHours > 0) return sum;
              return sum + (result.allowancePay || 0);
            }, 0);

            const monthlyWage = baseWage + totalWeeklyBonus;

            return {
              id: user.id,
              name: user.name,
              role: user.role,
              percent,
              totalCount,
              doneCount,
              createdAt: user.createdAt,
              workTime: user.workTime,
              monthlyWage,
              baseWage,
              totalWeeklyBonus,
              totalWorkHours,
              hourlyWage,
              totalWorkDays,
            };
          })
        );

        const sorted = stats.sort((a, b) => {
          if (activeTab === "salary") {
            return b.monthlyWage - a.monthlyWage;
          }
          return b.percent - a.percent;
        });

        setChecklistStats(sorted);
        setCurrentPage(1);
      } catch (error) {
        console.error("Error fetching checklist stats:", error);
        setStatus("체크리스트 통계를 불러오지 못했습니다.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, [profile?.user_type, viewYear, viewMonth, todayStr, holidayTags, activeTab]);

  if (profile?.user_type !== "admin") {
    return (
      <div className="employee-stats-page">
        <div className="employee-stats-card">
          <p>접근 권한이 없습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="employee-stats-page">
      <div className="employee-stats-card">
        <div className="employee-stats-header">
          <div className="employee-stats-title-group">
            <h2>직원 통계</h2>
            <StatsMonthNavigation
              viewYear={viewYear}
              viewMonth={viewMonth}
              onPrevMonth={handlePrevMonth}
              onNextMonth={handleNextMonth}
              onClickMonth={handleOpenPicker}
            >
              {isPickerOpen && (
                <div className="work-status-picker">
                  <button
                    type="button"
                    className="work-status-picker-year"
                    onClick={() => setIsYearListOpen((prev) => !prev)}
                  >
                    {viewYear}년
                  </button>
                  {isYearListOpen ? (
                    <div className="work-status-year-list">
                      {yearOptions.map((yearValue) => (
                        <button
                          key={yearValue}
                          type="button"
                          className={[
                            "work-status-year-item",
                            yearValue === viewYear ? "active" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={() => handleSelectYear(yearValue)}
                        >
                          {yearValue}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="work-status-month-list">
                      {Array.from({ length: 12 }, (_, index) => (
                        <button
                          key={index}
                          type="button"
                          className={[
                            "work-status-month-item",
                            index === viewDate.getMonth() ? "active" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={() => handleSelectMonth(index)}
                        >
                          {index + 1}월
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </StatsMonthNavigation>
          </div>
          {onClose && (
            <button type="button" className="employee-stats-close" onClick={onClose}>
              닫기
            </button>
          )}
        </div>
        <div className="employee-stats-body">
          <div className="employee-stats-layout">
            <div className="employee-stats-categories">
              <button
                type="button"
                className={`employee-stats-category-item${activeTab === "checklist" ? " active" : ""}`}
                onClick={() => setActiveTab("checklist")}
              >
                체크리스트 실행률
              </button>
              <button
                type="button"
                className={`employee-stats-category-item${activeTab === "salary" ? " active" : ""}`}
                onClick={() => setActiveTab("salary")}
              >
                직원 급여 현황
              </button>
            </div>
            <div className="employee-stats-content">
              {isLoading ? (
                <p>불러오는 중...</p>
              ) : status ? (
                <p>{status}</p>
              ) : activeTab === "salary" ? (
                <div className="employee-stats-salary-content">
                  <div className="employee-stats-salary-table-wrapper">
                    <table className="employee-stats-salary-table">
                      <thead>
                        <tr>
                          <th>이름(직책)</th>
                          <th>근무일수</th>
                          <th>근무시간</th>
                          <th>시급</th>
                          <th>주휴수당</th>
                          <th>총급여</th>
                        </tr>
                      </thead>
                      <tbody>
                        {checklistStats
                          .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                          .map((stat) => (
                            <tr key={stat.id}>
                              <td className="stat-name-cell">
                                {stat.name}
                                {stat.role ? ` (${stat.role})` : ""}
                              </td>
                              <td>{stat.totalWorkDays}일</td>
                              <td>{stat.totalWorkHours.toFixed(1)}h</td>
                              <td>{stat.hourlyWage.toLocaleString()}원</td>
                              <td>{stat.totalWeeklyBonus.toLocaleString()}원</td>
                              <td className="stat-total-cell">
                                {stat.monthlyWage.toLocaleString()}원
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="employee-stats-footer-nav">
                    <StatsMonthNavigation
                      viewYear={viewYear}
                      viewMonth={viewMonth}
                      onPrevMonth={handlePrevMonth}
                      onNextMonth={handleNextMonth}
                      onClickMonth={handleOpenPicker}
                    />
                  </div>
                  <EmployeeStatsPagination
                    currentPage={currentPage}
                    totalPages={Math.ceil(checklistStats.length / pageSize)}
                    onPageChange={setCurrentPage}
                  />
                </div>
              ) : (
                <>
                  <div className="employee-stats-grid">
                    {checklistStats
                      .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                      .map((stat) => (
                        <div key={stat.id} className="employee-stats-card-item">
                          <div className="employee-stats-card-title-row">
                            <div className="employee-stats-card-title">
                              {stat.name}
                              {stat.role ? ` (${stat.role})` : ""}
                            </div>
                          </div>
                          <div className="employee-stats-card-body">
                            <div className="employee-stats-card-chart">
                              <div
                                className="employee-stats-card-progress"
                                style={{ "--progress": `${stat.percent}%` }}
                              >
                                <span className="employee-stats-card-percent">
                                  {stat.percent}%
                                </span>
                              </div>
                              <div className="employee-stats-card-sub">
                                {stat.doneCount}/{stat.totalCount}
                              </div>
                            </div>
                            <div className="employee-stats-card-info">
                              <div className="employee-stats-card-info-item">
                                <span className="employee-stats-card-info-label">
                                  근무 기간
                                </span>
                                <span className="employee-stats-card-info-value">
                                  {getTenureMonths(stat.createdAt)
                                    ? `${getTenureMonths(stat.createdAt)}개월째 근무`
                                    : "근무기간 미설정"}
                                </span>
                              </div>
                              <div className="employee-stats-card-info-item">
                                <span className="employee-stats-card-info-label">
                                  근무 타임
                                </span>
                                <span className="employee-stats-card-info-value">
                                  {formatWorkTime(stat.workTime)}
                                </span>
                              </div>
                              <div className="employee-stats-card-info-item">
                                <span className="employee-stats-card-info-label">
                                  출근 일수
                                </span>
                                <span className="employee-stats-card-info-value">
                                  {stat.totalWorkDays ? `${stat.totalWorkDays}일` : "0일"}
                                </span>
                              </div>
                              <div className="employee-stats-card-info-item">
                                <span className="employee-stats-card-info-label">
                                  이번달 예상급여
                                </span>
                                <span className="employee-stats-card-info-value">
                                  {stat.hourlyWage
                                    ? `${stat.monthlyWage.toLocaleString()}원`
                                    : "미설정"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                  <div className="employee-stats-footer-nav">
                    <StatsMonthNavigation
                      viewYear={viewYear}
                      viewMonth={viewMonth}
                      onPrevMonth={handlePrevMonth}
                      onNextMonth={handleNextMonth}
                      onClickMonth={handleOpenPicker}
                    />
                  </div>
                  <EmployeeStatsPagination
                    currentPage={currentPage}
                    totalPages={Math.ceil(checklistStats.length / pageSize)}
                    onPageChange={setCurrentPage}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EmployeeStatsPage;
