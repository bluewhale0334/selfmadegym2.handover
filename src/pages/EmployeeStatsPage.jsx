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
            workTime: data.workTime || {},
          });
        });

        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();

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
            return {
              id: user.id,
              name: user.name,
              role: user.role,
              percent,
              totalCount,
              doneCount,
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
                          <div className="employee-stats-card-title">
                            {stat.name}
                            {stat.role ? ` (${stat.role})` : ""}
                          </div>
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
