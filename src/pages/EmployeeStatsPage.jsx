import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import EmployeeStatsPagination from "./EmployeeStatsPagination";
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

const getNetWorkHoursValue = (timeRange, weekdayIndex) => {
  if (!timeRange) return 0;
  const [start, end] = timeRange.split("-");
  if (!start || !end) return 0;
  const [startHour, startMinute = "0"] = start.split(":");
  const [endHour, endMinute = "0"] = end.split(":");
  const startTotal = Number(startHour) * 60 + Number(startMinute);
  const endTotal = Number(endHour) * 60 + Number(endMinute);
  if (!Number.isFinite(startTotal) || !Number.isFinite(endTotal)) return 0;

  let durationMinutes = endTotal - startTotal;
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

function EmployeeStatsPage({ profile, onClose }) {
  const [checklistStats, setChecklistStats] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const today = useMemo(() => formatToday(), []);
  const pageSize = 9;

  useEffect(() => {
    if (profile?.user_type !== "admin") return;
    const fetchStats = async () => {
      setIsLoading(true);
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
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;

        const stats = await Promise.all(
          users.map(async (user) => {
            const endTime = user.workTime?.endTime || "";
            const endHour = Number.parseInt(endTime, 10);
            const endMinutes = Number.isNaN(endHour)
              ? null
              : endHour === 0
              ? 24 * 60
              : endHour * 60;
            const includeToday = endMinutes === null ? true : nowMinutes >= endMinutes;

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
              if (data.date > today) return;
              if (data.date === today && !includeToday) return;
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
            const monthRecords = Object.values(recordByDate).filter((record) => {
              const [recordYear, recordMonth] = String(record.date)
                .split("-")
                .map(Number);
              return recordYear === currentYear && recordMonth === currentMonth;
            });
            const totalWorkDays = monthRecords.filter(
              (record) => record.startTime && record.endTime
            ).length;
            const totalWorkHours = monthRecords.reduce((sum, record) => {
              if (!record.startTime || !record.endTime) return sum;
              const [yearPart, monthPart, dayPart] = String(record.date)
                .split("-")
                .map(Number);
              if (!yearPart || !monthPart || !dayPart) return sum;
              const weekdayIndex = new Date(yearPart, monthPart - 1, dayPart).getDay();
              const timeRange = `${record.startTime}-${record.endTime}`;
              return sum + getNetWorkHoursValue(timeRange, weekdayIndex);
            }, 0);
            const hourlyWage = Number(user.workTime?.hourlyWage || 0);
            const monthlyWage = Math.floor(totalWorkHours * hourlyWage);
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
              hourlyWage,
            totalWorkDays,
            };
          })
        );

        const sorted = stats.sort((a, b) => b.percent - a.percent);
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
  }, [profile?.user_type, today]);

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
          <h2>직원 통계</h2>
          {onClose && (
            <button type="button" className="employee-stats-close" onClick={onClose}>
              닫기
            </button>
          )}
        </div>
        <div className="employee-stats-body">
          <div className="employee-stats-layout">
            <div className="employee-stats-categories">
              <button type="button" className="employee-stats-category-item active">
                체크리스트 실행률
              </button>
            </div>
            <div className="employee-stats-content">
              {isLoading ? (
                <p>불러오는 중...</p>
              ) : status ? (
                <p>{status}</p>
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
