import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import { calculateWeeklyAllowance } from "./workStatus/weeklyAllowance";
import StatsMonthNavigation from "./StatsMonthNavigation";
import "./WorkStatusPage.css";

function WorkStatusPage({ user, profile }) {
  const today = useMemo(() => new Date(), []);
  const [currentDate, setCurrentDate] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isYearListOpen, setIsYearListOpen] = useState(false);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [showSalaryView, setShowSalaryView] = useState(false);
  const [customerUsers, setCustomerUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedUserProfile, setSelectedUserProfile] = useState(null);
  const [editingDate, setEditingDate] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const editFormRef = useRef(null);
  const [startTimeError, setStartTimeError] = useState("");
  const [endTimeError, setEndTimeError] = useState("");
  const [isApplyingSchedule, setIsApplyingSchedule] = useState(false);
  const [holidayTags, setHolidayTags] = useState({});
  const [isHolidaySetting, setIsHolidaySetting] = useState(false);
  const [selectedHolidayDates, setSelectedHolidayDates] = useState([]);
  const [selectedHolidayType, setSelectedHolidayType] = useState("");
  const [holidayMessage, setHolidayMessage] = useState("");
  const [issueEditDate, setIssueEditDate] = useState("");

  const { year, month, days, startDayIndex } = useMemo(() => {
    const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const daysInMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      0
    ).getDate();
    return {
      year: currentDate.getFullYear(),
      month: currentDate.getMonth() + 1,
      days: daysInMonth,
      startDayIndex: firstDay.getDay(),
    };
  }, [currentDate]);

  const weeks = useMemo(() => {
    const cells = [];
    for (let i = 0; i < startDayIndex; i += 1) {
      cells.push(null);
    }
    for (let day = 1; day <= days; day += 1) {
      cells.push(day);
    }
    while (cells.length % 7 !== 0) {
      cells.push(null);
    }
    const rows = [];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(cells.slice(i, i + 7));
    }
    if (rows.length === 6 && rows[5][0] === null) {
      rows.pop();
    }
    return rows;
  }, [days, startDayIndex]);

  const gridStartDate = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1);
    const start = new Date(firstDay);
    start.setDate(firstDay.getDate() - firstDay.getDay());
    return start;
  }, [year, month]);

  const handlePrevMonth = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleOpenPicker = () => {
    setIsPickerOpen((prev) => !prev);
    setIsYearListOpen(false);
  };

  const handleSelectMonth = (monthIndex) => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), monthIndex, 1));
    setIsPickerOpen(false);
    setIsYearListOpen(false);
  };

  const handleSelectYear = (yearValue) => {
    setCurrentDate((prev) => new Date(yearValue, prev.getMonth(), 1));
    setIsYearListOpen(false);
  };

  const yearOptions = useMemo(() => {
    const current = currentDate.getFullYear();
    return Array.from({ length: 10 }, (_, index) => current - 4 + index);
  }, [currentDate]);

  const getWeekdayIndex = (day) =>
    new Date(year, month - 1, day).getDay(); // 0:일 ~ 6:토
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
  const getNetWorkHoursLabel = (timeRange, weekdayIndex) => {
    if (!timeRange) return "";
    const [start, end] = timeRange.split("-");
    if (!start || !end) return "";
    const [startHour, startMinute = "0"] = start.split(":");
    const [endHour, endMinute = "0"] = end.split(":");
    const startTotal = Number(startHour) * 60 + Number(startMinute);
    const endTotal = Number(endHour) * 60 + Number(endMinute);
    if (!Number.isFinite(startTotal) || !Number.isFinite(endTotal)) return "";

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
    const hoursValue = netMinutes / 60;
    return `${hoursValue.toFixed(1)}h`;
  };
  const getCreatedAtDate = (createdAt) => {
    if (!createdAt) return null;
    if (typeof createdAt?.toDate === "function") {
      return createdAt.toDate();
    }
    if (typeof createdAt?.seconds === "number") {
      return new Date(createdAt.seconds * 1000);
    }
    if (typeof createdAt === "number") {
      return new Date(createdAt);
    }
    if (typeof createdAt === "string") {
      const parsed = new Date(createdAt);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    return null;
  };
  const isBeforeCreatedAt = (dateObj, createdAt) => {
    const createdAtDate = getCreatedAtDate(createdAt);
    if (!createdAtDate) return false;
    const createdAtDay = new Date(
      createdAtDate.getFullYear(),
      createdAtDate.getMonth(),
      createdAtDate.getDate()
    );
    return dateObj < createdAtDay;
  };

  const isAdmin = profile?.user_type === "admin";
  const targetUserId = isAdmin ? selectedUserId : user?.uid;
  const activeProfile = isAdmin ? selectedUserProfile : profile;

  const workTime = activeProfile?.workTime || {};
  const weekdays = Array.isArray(workTime.weekdays) ? workTime.weekdays : [];
  const weekdayCountExSunday = weekdays.filter((day) => day !== "일").length;
  const startTime = workTime.startTime ? `${workTime.startTime}` : "";
  const endTime = workTime.endTime ? `${workTime.endTime}` : "";
  const timeText = startTime && endTime ? `${startTime}~${endTime}시` : "미설정";
  const weekdaysText = weekdays.length > 0 ? weekdays.join(",") : "미설정";

  const assumedHours = useMemo(() => {
    if (!startTime || !endTime) return 0;
    const startParts = startTime.split(":");
    const endParts = endTime.split(":");
    const startMinutes = Number(startParts[0]) * 60 + Number(startParts[1] || 0);
    const endMinutes = Number(endParts[0]) * 60 + Number(endParts[1] || 0);
    if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return 0;
    let durationMinutes = endMinutes - startMinutes;
    if (durationMinutes <= 0) {
      durationMinutes += 24 * 60;
    }
    const durationHours = durationMinutes / 60;
    const dailyAssumed = Math.max(0, durationHours - 1);
    return dailyAssumed * weekdayCountExSunday;
  }, [startTime, endTime, weekdayCountExSunday]);

  const monthRecords = useMemo(
    () =>
      attendanceRecords.filter((record) => {
        if (!record.date) return false;
        const [recordYear, recordMonth] = record.date.split("-").map(Number);
        return recordYear === year && recordMonth === month;
      }),
    [attendanceRecords, year, month]
  );

  const totalWorkDays = monthRecords.filter(
    (record) => record.startTime && record.endTime
  ).length;

  const totalWorkHours = monthRecords.reduce((sum, record) => {
    if (!record.startTime || !record.endTime) return sum;
    const [dayYear, dayMonth, dayDate] = record.date.split("-").map(Number);
    const weekdayIndex = new Date(dayYear, dayMonth - 1, dayDate).getDay();
    const timeRange = `${record.startTime}-${record.endTime}`;
    return sum + getNetWorkHoursValue(timeRange, weekdayIndex);
  }, 0);

  const hourlyWage = Number(workTime.hourlyWage || 0);
  const totalWage = Math.floor(totalWorkHours * hourlyWage);

  const firstSundayDay = useMemo(() => {
    const firstOfMonth = new Date(year, month - 1, 1);
    const diff = (7 - firstOfMonth.getDay()) % 7;
    return 1 + diff;
  }, [year, month]);

  useEffect(() => {
    if (!user) {
      setAttendanceRecords([]);
      return;
    }

    if (isAdmin) {
      setShowSalaryView(false);
    }
  }, [user, isAdmin]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "workDayTags"),
      (snapshot) => {
        const map = {};
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data?.date && data?.type) {
            map[data.date] = data.type;
          }
        });
        setHolidayTags(map);
      },
      (error) => {
        console.error("Error loading work day tags:", error);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAdmin || !user) {
      setCustomerUsers([]);
      setSelectedUserId("");
      setSelectedUserProfile(null);
      return;
    }

    const fetchCustomerUsers = async () => {
      try {
        const snapshot = await getDocs(
          query(collection(db, "users"), where("user_type", "==", "customer"))
        );
        const users = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setCustomerUsers(users);
        if (selectedUserId) {
          const selected = users.find((userItem) => userItem.id === selectedUserId);
          setSelectedUserProfile(selected || null);
        }
      } catch (error) {
        console.error("Error fetching customer users:", error);
      }
    };

    fetchCustomerUsers();
  }, [isAdmin, user]);

  useEffect(() => {
    if (!isAdmin) return;
    if (!selectedUserId) {
      setSelectedUserProfile(null);
      return;
    }
    const target = customerUsers.find((userItem) => userItem.id === selectedUserId);
    setSelectedUserProfile(target || null);
  }, [isAdmin, selectedUserId, customerUsers]);

  useEffect(() => {
    if (!targetUserId && !isAdmin) {
      setAttendanceRecords([]);
      return;
    }

    const q = isAdmin && !targetUserId
      ? query(collection(db, "workAttendance"))
      : query(collection(db, "workAttendance"), where("userId", "==", targetUserId));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const next = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setAttendanceRecords(next);
      },
      (error) => {
        console.error("Error loading work attendance:", error);
      }
    );

    return () => unsubscribe();
  }, [targetUserId, isAdmin]);

  const attendanceByDate = useMemo(() => {
    const map = {};
    attendanceRecords.forEach((record) => {
      if (!record.date) return;
      const existing = map[record.date];
      if (!existing || record.source === "admin") {
        map[record.date] = record;
      }
    });
    return map;
  }, [attendanceRecords]);

  const carryoverFromPrev = useMemo(() => {
    if (isAdmin && !selectedUserId) return 0;
    if (!activeProfile?.workTime) return 0;
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const result = calculateWeeklyAllowance({
      year: prevYear,
      month: prevMonth,
      workTime: activeProfile.workTime,
      recordsByDate: attendanceByDate,
      holidayTags,
      hourlyWage,
    });
    return result.carryoverHours || 0;
  }, [activeProfile, attendanceByDate, holidayTags, hourlyWage, isAdmin, selectedUserId, year, month]);

  const weeklyAllowance = useMemo(() => {
    if (!activeProfile?.workTime) return null;
    if (isAdmin && !selectedUserId) return null;
    return calculateWeeklyAllowance({
      year,
      month,
      workTime: activeProfile.workTime,
      recordsByDate: attendanceByDate,
      holidayTags,
      hourlyWage,
      carryoverFromPrev,
    });
  }, [activeProfile, attendanceByDate, holidayTags, hourlyWage, carryoverFromPrev, isAdmin, selectedUserId, year, month]);

  const totalWeeklyAllowance = useMemo(() => {
    if (!weeklyAllowance) return 0;
    return weeklyAllowance.weeklyResults.reduce((sum, result) => {
      // 이월(next month carryover) 되는 주차는 이번 달 합계에서 제외
      if (result.carryoverHours > 0) return sum;
      return sum + (result.allowancePay || 0);
    }, 0);
  }, [weeklyAllowance]);

  const showWeeklyBonus = assumedHours >= 15;
  const hasWeeklyAllowanceEligible = Boolean(
    weeklyAllowance?.weeklyResults?.some((result) => result.eligible)
  );
  const weeklyLabelByDate = useMemo(() => {
    if (!weeklyAllowance || !showWeeklyBonus) return {};
    const map = {};
    weeklyAllowance.weeklyResults.forEach((result) => {
      if (!result.eligible || result.allowanceHours <= 0) return;
      const saturday = new Date(result.weekStart);
      saturday.setDate(saturday.getDate() + 6);
      const dateKey = `${saturday.getFullYear()}-${String(saturday.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(saturday.getDate()).padStart(2, "0")}`;
      if (result.isLastWeek) {
        if (result.carryoverHours > 0) {
          map[dateKey] = { label: "이월", hours: result.carryoverHours };
        } else {
          map[dateKey] = {
            label: "주휴수당 발생",
            hours: result.labelHours ?? result.displayHours,
          };
        }
        return;
      }
      if (saturday.getFullYear() !== year || saturday.getMonth() !== month - 1) {
        return;
      }
      map[dateKey] = {
        label: "주휴수당 발생",
        hours: result.labelHours ?? result.displayHours,
      };
    });
    return map;
  }, [weeklyAllowance, showWeeklyBonus, year, month]);

  const userNameById = useMemo(() => {
    const map = {};
    customerUsers.forEach((userItem) => {
      map[userItem.id] = userItem.name || "근무자";
    });
    return map;
  }, [customerUsers]);

  const issuesByDate = useMemo(() => {
    if (!isAdmin || selectedUserId) return {};
    const preferredByUserDate = {};
    attendanceRecords.forEach((record) => {
      if (!record.date || !record.userId) return;
      const key = `${record.userId}_${record.date}`;
      const existing = preferredByUserDate[key];
      if (!existing || record.source === "admin") {
        preferredByUserDate[key] = record;
      }
    });
    const todayDate = new Date();
    const map = {};
    Object.values(preferredByUserDate).forEach((record) => {
      if (!record.date) return;
      const issueType = record.issueType || (record.late ? "지각" : "");
      if (!issueType || issueType === "공휴일" || issueType === "센터휴무") return;
      if (!map[record.date]) {
        map[record.date] = [];
      }
      map[record.date].push({
        userId: record.userId,
        type: issueType,
      });
    });
    customerUsers.forEach((userItem) => {
      const workWeekdays = Array.isArray(userItem.workTime?.weekdays)
        ? userItem.workTime.weekdays
        : [];
      for (let day = 1; day <= days; day += 1) {
        const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const dateObj = new Date(year, month - 1, day);
        if (isBeforeCreatedAt(dateObj, userItem.createdAt)) {
          continue;
        }
        if (dateObj >= new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate())) {
          continue;
        }
        if (holidayTags[dateKey]) {
          continue;
        }
        const weekdayLabel = ["일", "월", "화", "수", "목", "금", "토"][dateObj.getDay()];
        if (!workWeekdays.includes(weekdayLabel)) {
          continue;
        }
        const recordKey = `${userItem.id}_${dateKey}`;
        if (preferredByUserDate[recordKey]) {
          continue;
        }
        if (!map[dateKey]) {
          map[dateKey] = [];
        }
        map[dateKey].push({
          userId: userItem.id,
          type: "결근",
        });
      }
    });
    return map;
  }, [attendanceRecords, isAdmin, selectedUserId, customerUsers, days, year, month, holidayTags]);

  const startEdit = (dateKey, record) => {
    setEditingDate(dateKey);
    setEditStartTime(record?.startTime || "");
    setEditEndTime(record?.endTime || "");
    setStartTimeError("");
    setEndTimeError("");
  };

  const handleSelectIssueType = async (dateKey, issueType) => {
    if (!selectedUserId) return;
    if (issueType === "공휴일" || issueType === "센터휴무") {
      await setDoc(
        doc(db, "workDayTags", dateKey),
        { date: dateKey, type: issueType },
        { merge: true }
      );
      setIssueEditDate("");
      return;
    }
    const payload = {
      userId: selectedUserId,
      date: dateKey,
      issueType,
      late: issueType === "지각",
      source: "admin",
      updatedAt: serverTimestamp(),
    };
    await setDoc(doc(db, "workAttendance", `${selectedUserId}_${dateKey}`), payload, {
      merge: true,
    });
    setIssueEditDate("");
  };

  const validateTimeInput = (value) => {
    if (!value) return "00:00 형식을 지켜주세요!";
    const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (!match) return "00:00 형식을 지켜주세요!";
    const minutes = Number(match[2]);
    if (minutes % 30 !== 0) return "30분 단위로 써주세요!";
    return "";
  };

  const parseTimeToMinutes = (value) => {
    const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  };

  const getScheduledStartMinutes = () => {
    if (!activeProfile?.workTime || !editingDate) return null;
    const [yearPart, monthPart, dayPart] = editingDate.split("-").map(Number);
    if (!yearPart || !monthPart || !dayPart) return null;
    const weekdayIndex = new Date(yearPart, monthPart - 1, dayPart).getDay();
    const isSunday = weekdayIndex === 0;
    const scheduleKey = isSunday ? "sundayStartTime" : "startTime";
    const scheduleValue = activeProfile.workTime?.[scheduleKey];
    if (!scheduleValue) return null;
    return parseTimeToMinutes(String(scheduleValue));
  };

  const handleSaveRecord = async () => {
    if (!selectedUserId || !editingDate) return;
    const nextStartError = validateTimeInput(editStartTime);
    const nextEndError = validateTimeInput(editEndTime);
    setStartTimeError(nextStartError);
    setEndTimeError(nextEndError);
    if (nextStartError || nextEndError) return;
    const scheduledStartMinutes = getScheduledStartMinutes();
    const actualStartMinutes = parseTimeToMinutes(editStartTime);
    const late =
      scheduledStartMinutes !== null &&
      actualStartMinutes !== null &&
      actualStartMinutes - scheduledStartMinutes >= 30;
    await setDoc(
      doc(db, "workAttendance", `${selectedUserId}_${editingDate}`),
      {
        userId: selectedUserId,
        date: editingDate,
        startTime: editStartTime,
        endTime: editEndTime,
        late,
        source: "admin",
        issueType: deleteField(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    setEditingDate("");
  };

  const handleDeleteRecord = async (dateKey) => {
    if (!selectedUserId) return;
    await deleteDoc(doc(db, "workAttendance", `${selectedUserId}_${dateKey}`));
    setEditingDate("");
  };

  const handleApplyMonthlySchedule = async () => {
    if (!selectedUserId || !selectedUserProfile?.workTime) return;
    const workTime = selectedUserProfile.workTime;
    const weekdays = Array.isArray(workTime.weekdays) ? workTime.weekdays : [];
    if (weekdays.length === 0) return;
    setIsApplyingSchedule(true);
    try {
      const formatTimeValue = (value) => {
        if (value === null || value === undefined || value === "") return "";
        const [hourText, minuteText = "0"] = String(value).split(":");
        const hour = Number.parseInt(hourText, 10);
        const minute = Number.parseInt(minuteText, 10) || 0;
        if (Number.isNaN(hour)) return "";
        return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      };
      const batch = writeBatch(db);
      const daysInMonth = new Date(year, month, 0).getDate();
      for (let day = 1; day <= daysInMonth; day += 1) {
        const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const weekdayIndex = new Date(year, month - 1, day).getDay();
        const weekdayLabel = ["일", "월", "화", "수", "목", "금", "토"][weekdayIndex];
        if (!weekdays.includes(weekdayLabel)) {
          continue;
        }
        const isSunday = weekdayLabel === "일";
        const startKey = isSunday ? "sundayStartTime" : "startTime";
        const endKey = isSunday ? "sundayEndTime" : "endTime";
        const startValue = formatTimeValue(workTime[startKey]);
        const endValue = formatTimeValue(workTime[endKey]);
        if (!startValue || !endValue) {
          continue;
        }
        const recordRef = doc(db, "workAttendance", `${selectedUserId}_${dateKey}`);
        batch.set(
          recordRef,
          {
            userId: selectedUserId,
            date: dateKey,
            startTime: String(startValue),
            endTime: String(endValue),
            late: false,
            source: "admin",
            issueType: deleteField(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
      await batch.commit();
    } catch (error) {
      console.error("Error applying monthly schedule:", error);
    } finally {
      setIsApplyingSchedule(false);
    }
  };

  const toggleHolidayDate = (dateKey) => {
    setSelectedHolidayDates((prev) =>
      prev.includes(dateKey) ? prev.filter((value) => value !== dateKey) : [...prev, dateKey]
    );
  };

  const handleSaveHolidayTags = async () => {
    if (!selectedHolidayType) {
      setHolidayMessage("공휴일/센터휴무를 선택하세요.");
      return;
    }
    if (selectedHolidayDates.length === 0) {
      setHolidayMessage("날짜를 선택하세요.");
      return;
    }
    setHolidayMessage("");
    const batch = writeBatch(db);
    selectedHolidayDates.forEach((dateKey) => {
      batch.set(
        doc(db, "workDayTags", dateKey),
        { date: dateKey, type: selectedHolidayType },
        { merge: true }
      );
    });
    await batch.commit();
    setSelectedHolidayDates([]);
    setSelectedHolidayType("");
    setIsHolidaySetting(false);
  };

  useEffect(() => {
    if (!editingDate) return;
    const handleClickOutside = (event) => {
      const target = event.target;
      if (
        target.closest(".work-status-admin-form") ||
        target.closest(".work-status-admin-action")
      ) {
        return;
      }
      setEditingDate("");
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [editingDate]);

  if (!user) {
    return (
      <div className="work-status-page">
        <div className="work-status-body">
          <p>로그인이 필요합니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="work-status-page">
      <div className="work-status-header">
        <div className="work-status-title">
          <h2>근무 현황</h2>
          <StatsMonthNavigation
            viewYear={year}
            viewMonth={month}
            onPrevMonth={handlePrevMonth}
            onNextMonth={handleNextMonth}
            onClickMonth={handleOpenPicker}
            extra={
              isAdmin ? (
              <div className="work-status-user-select">
                <span>사용자 선택</span>
                <select
                  value={selectedUserId}
                  onChange={(event) => setSelectedUserId(event.target.value)}
                >
                  <option value="">선택</option>
                  {customerUsers.map((userItem) => (
                    <option key={userItem.id} value={userItem.id}>
                      {userItem.name || "사용자"}
                    </option>
                  ))}
                </select>
                {user?.uid === "p2Y6M5CdDLMPm91d0RBBHs0uaXi1" && (
                  <button
                    type="button"
                    className="work-status-apply-button"
                    onClick={handleApplyMonthlySchedule}
                    disabled={!selectedUserId || isApplyingSchedule}
                  >
                    {isApplyingSchedule ? "적용 중..." : "근무시간 전체 적용"}
                  </button>
                )}
                {isAdmin && (
                  <div className="work-status-holiday-controls">
                    {isHolidaySetting ? (
                      <>
                        <button
                          type="button"
                          className={`work-status-holiday-type${
                            selectedHolidayType === "공휴일" ? " active" : ""
                          }`}
                          onClick={() => setSelectedHolidayType("공휴일")}
                        >
                          공휴일
                        </button>
                        <button
                          type="button"
                          className={`work-status-holiday-type${
                            selectedHolidayType === "센터휴무" ? " active" : ""
                          }`}
                          onClick={() => setSelectedHolidayType("센터휴무")}
                        >
                          센터휴무
                        </button>
                        <button
                          type="button"
                          className="work-status-holiday-save"
                          onClick={handleSaveHolidayTags}
                        >
                          저장
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="work-status-holiday-open"
                        onClick={() => {
                          setIsHolidaySetting(true);
                          setHolidayMessage("");
                        }}
                      >
                        쉬는 날 설정
                      </button>
                    )}
                    {holidayMessage && (
                      <span className="work-status-holiday-message">{holidayMessage}</span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                className={`work-status-salary-button${showSalaryView ? " active" : ""}`}
                onClick={() => setShowSalaryView((prev) => !prev)}
              >
                {showSalaryView ? "닫기" : "예상 급여"}
              </button>
              )
            }
          >
            {isPickerOpen && (
              <div className="work-status-picker">
                <button
                  type="button"
                  className="work-status-picker-year"
                  onClick={() => setIsYearListOpen((prev) => !prev)}
                >
                  {year}년
                </button>
                {isYearListOpen ? (
                  <div className="work-status-year-list">
                    {yearOptions.map((yearValue) => (
                      <button
                        key={yearValue}
                        type="button"
                        className={[
                          "work-status-year-item",
                          yearValue === year ? "active" : "",
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
                          index === currentDate.getMonth() ? "active" : "",
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
      </div>
      <div className="work-status-body">
        {!isAdmin && showSalaryView ? (
          <div className="work-status-salary">
            <div className="work-status-salary-card">
              <div className="work-status-salary-meta">
                <div>
                  {activeProfile?.name || "근무자"} - {weekdaysText} - {timeText}
                </div>
                <div>
                  상정근로시간({assumedHours.toFixed(1)}시간) - 시급{" "}
                  {hourlyWage ? `${hourlyWage.toLocaleString()}원` : "미설정"}
                </div>
              </div>
              <div className="work-status-salary-main">
                <div className="work-status-salary-row">
                  <span>총 근무일수</span>
                  <span>{totalWorkDays}일</span>
                </div>
                <div className="work-status-salary-row">
                  <span>총 근무시간</span>
                  <span>{totalWorkHours.toFixed(1)}시간</span>
                </div>
                <div className="work-status-salary-row">
                  <span>총 시급</span>
                  <span>{totalWage.toLocaleString()}원</span>
                </div>
                {showWeeklyBonus && hasWeeklyAllowanceEligible && (
                  <div className="work-status-salary-row">
                    <span>주휴수당</span>
                    <span>{totalWeeklyAllowance.toLocaleString()}원</span>
                  </div>
                )}
              </div>
              <div className="work-status-salary-spacer" />
              <div className="work-status-salary-divider" />
              <div className="work-status-salary-total">
                <span>예상 급여</span>
                <span>{(totalWage + totalWeeklyAllowance).toLocaleString()}원</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="work-status-calendar">
            <div className="work-status-weekdays">
              {["일", "월", "화", "수", "목", "금", "토"].map((label) => (
                <div key={label} className="work-status-weekday">
                  {label}
                </div>
              ))}
            </div>
            <div className="work-status-grid">
              {weeks.map((week, weekIndex) => (
                <div key={`week-${weekIndex}`} className="work-status-week">
                  {week.map((day, dayIndex) => {
                    const cellDate = new Date(gridStartDate);
                    cellDate.setDate(gridStartDate.getDate() + weekIndex * 7 + dayIndex);
                    const cellDateKey = `${cellDate.getFullYear()}-${String(
                      cellDate.getMonth() + 1
                    ).padStart(2, "0")}-${String(cellDate.getDate()).padStart(2, "0")}`;
                    const weeklyLabel = weeklyLabelByDate[cellDateKey];
                    const isTopSundayCell = weekIndex === 0 && dayIndex === 0;
                    const shouldSelect =
                      isHolidaySetting &&
                      day &&
                      selectedHolidayDates.includes(
                        `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                      );
                    return (
                      <div
                        key={`day-${weekIndex}-${dayIndex}`}
                        className={[
                          "work-status-day",
                          shouldSelect ? "selected" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={(event) => {
                          if (!isHolidaySetting || !day) return;
                          const target = event.target;
                          if (
                            target.closest(".work-status-admin-action") ||
                            target.closest(".work-status-admin-form") ||
                            target.closest(".work-status-issue-menu") ||
                            target.closest(".work-status-time-button") ||
                            target.closest(".work-status-issue-tag")
                          ) {
                            return;
                          }
                          const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(
                            day
                          ).padStart(2, "0")}`;
                          toggleHolidayDate(dateKey);
                        }}
                      >
                      {day ? (
                        <div className="work-status-day-content">
                          {isAdmin && selectedUserId ? (
                            <div className="work-status-admin-action">
                              {editingDate === `${year}-${String(month).padStart(2, "0")}-${String(
                                day
                              ).padStart(2, "0")}` ? (
                                <>
                                  <button
                                    type="button"
                                    className="work-status-admin-save"
                                    onClick={handleSaveRecord}
                                  >
                                    저장
                                  </button>
                                  {attendanceByDate[
                                    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
                                      2,
                                      "0"
                                    )}`
                                  ]?.startTime && (
                                    <button
                                      type="button"
                                      className="work-status-admin-delete"
                                      onClick={() =>
                                        handleDeleteRecord(
                                          `${year}-${String(month).padStart(2, "0")}-${String(
                                            day
                                          ).padStart(2, "0")}`
                                        )
                                      }
                                    >
                                      삭제
                                    </button>
                                  )}
                                </>
                              ) : (
                                !attendanceByDate[
                                  `${year}-${String(month).padStart(2, "0")}-${String(
                                    day
                                  ).padStart(2, "0")}`
                                ]?.startTime && (
                                  <button
                                    type="button"
                                    className="work-status-admin-add"
                                    onClick={() =>
                                      startEdit(
                                        `${year}-${String(month).padStart(2, "0")}-${String(
                                          day
                                        ).padStart(2, "0")}`,
                                        attendanceByDate[
                                          `${year}-${String(month).padStart(2, "0")}-${String(
                                            day
                                          ).padStart(2, "0")}`
                                        ]
                                      )
                                    }
                                  >
                                    +
                                  </button>
                                )
                              )}
                            </div>
                          ) : null}
                          {isTopSundayCell && carryoverFromPrev > 0 && (
                            <span className="work-status-carryover">
                              이월-{carryoverFromPrev.toFixed(1)}h
                            </span>
                          )}
                          {weeklyLabelByDate[
                            `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                          ] && (
                            <span className="work-status-weekly-allowance">
                              {
                                weeklyLabelByDate[
                                  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                                ].label
                              }
                              {weeklyLabelByDate[
                                `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                              ].hours > 0
                                ? `-${weeklyLabelByDate[
                                    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                                  ].hours.toFixed(1)}h`
                                : ""}
                            </span>
                          )}
                          {!(day === firstSundayDay && carryoverFromPrev > 0) && (
                            <span className="work-status-day-number">{day}</span>
                          )}
                          {isAdmin && !selectedUserId ? (
                            (() => {
                              const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(
                                day
                              ).padStart(2, "0")}`;
                              const issues = issuesByDate[dateKey] || [];
                              const holidayTag = holidayTags[dateKey];
                              if (issues.length === 0 && !holidayTag) return null;
                              return (
                                <div className="work-status-issue-list">
                                  {holidayTag && (
                                    <span className="work-status-issue-tag global">
                                      {holidayTag}
                                    </span>
                                  )}
                                  {issues.map((issue, index) => (
                                    <span
                                      key={`${issue.userId}-${index}`}
                                      className="work-status-issue-tag"
                                    >
                                      {(userNameById[issue.userId] || "근무자")} -{" "}
                                      {issue.type}
                                    </span>
                                  ))}
                                </div>
                              );
                            })()
                          ) : (
                            (() => {
                            const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(
                              day
                            ).padStart(2, "0")}`;
                            const record = attendanceByDate[dateKey];
                            const holidayTag = holidayTags[dateKey];
                          if (isAdmin && selectedUserId && editingDate === dateKey) {
                            return (
                              <div className="work-status-admin-form" ref={editFormRef}>
                                <input
                                  type="text"
                                  placeholder="출근시간"
                                  value={editStartTime}
                                  onChange={(event) => {
                                    setEditStartTime(event.target.value);
                                    if (startTimeError) {
                                      setStartTimeError("");
                                    }
                                  }}
                                />
                                <input
                                  type="text"
                                  placeholder="퇴근시간"
                                  value={editEndTime}
                                  onChange={(event) => {
                                    setEditEndTime(event.target.value);
                                    if (endTimeError) {
                                      setEndTimeError("");
                                    }
                                  }}
                                />
                                {(startTimeError || endTimeError) && (
                                  <span className="work-status-admin-error">
                                    {startTimeError || endTimeError}
                                  </span>
                                )}
                              </div>
                            );
                          }
                            if (!record?.startTime || !record?.endTime) {
                              const isPast = new Date(year, month - 1, day) < new Date(
                                new Date().getFullYear(),
                                new Date().getMonth(),
                                new Date().getDate()
                              );
                              const isBeforeJoinDate = isBeforeCreatedAt(
                                new Date(year, month - 1, day),
                                activeProfile?.createdAt
                              );
                              const weekdayLabel = ["일", "월", "화", "수", "목", "금", "토"][
                                new Date(year, month - 1, day).getDay()
                              ];
                              const shouldWork = weekdays.includes(weekdayLabel);
                              const issueType =
                                holidayTag ||
                                record?.issueType ||
                                (isPast && shouldWork && !isBeforeJoinDate ? "결근" : "");
                              if (!issueType) return null;
                              return (
                                <div className="work-status-issue-list">
                                  <button
                                    type="button"
                                    className={`work-status-issue-tag${
                                      issueType === "공휴일" || issueType === "센터휴무" ? " global" : ""
                                    }`}
                                    onClick={() => {
                                      if (!isAdmin) return;
                                      setIssueEditDate(issueEditDate === dateKey ? "" : dateKey);
                                    }}
                                  >
                                    {issueType}
                                  </button>
                                  {isAdmin && issueEditDate === dateKey && (
                                    <div className="work-status-issue-menu">
                                      {["결근", "지각", "공휴일", "센터휴무"].map((type) => (
                                        <button
                                          key={type}
                                          type="button"
                                          onClick={() => handleSelectIssueType(dateKey, type)}
                                        >
                                          {type}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            }
                            const weekday = getWeekdayIndex(day);
                            const timeRange = `${record.startTime}-${record.endTime}`;
                            const netLabel = getNetWorkHoursLabel(timeRange, weekday);
                            return (
                              <>
                                <span className="work-status-time">
                                <button
                                  type="button"
                                  className="work-status-time-button"
                                  onClick={() => startEdit(dateKey, record)}
                                >
                                  {timeRange}
                                </button>
                                  {netLabel && (
                                    <span className="work-status-net-time">{netLabel}</span>
                                  )}
                                </span>
                                {holidayTag ? (
                                  <span className="work-status-issue-tag global">
                                    {holidayTag}
                                  </span>
                                ) : record.issueType || record.late ? (
                                  <button
                                    type="button"
                                    className="work-status-issue-tag"
                                    onClick={() => {
                                      if (!isAdmin) return;
                                      setIssueEditDate(issueEditDate === dateKey ? "" : dateKey);
                                    }}
                                  >
                                    {record.issueType || "지각"}
                                  </button>
                                ) : null}
                                {isAdmin && issueEditDate === dateKey && (
                                  <div className="work-status-issue-menu">
                                    {["결근", "지각", "공휴일", "센터휴무"].map((type) => (
                                      <button
                                        key={type}
                                        type="button"
                                        onClick={() => handleSelectIssueType(dateKey, type)}
                                      >
                                        {type}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </>
                            );
                        })()
                          )}
                        </div>
                      ) : weeklyLabel?.label || (isTopSundayCell && carryoverFromPrev > 0) ? (
                        <div className="work-status-day-content">
                          {weeklyLabel?.label ? (
                            <span className="work-status-weekly-allowance">
                              {weeklyLabel.label}
                              {weeklyLabel.hours > 0 ? `-${weeklyLabel.hours.toFixed(1)}h` : ""}
                            </span>
                          ) : (
                            <span className="work-status-carryover">
                              이월-{carryoverFromPrev.toFixed(1)}h
                            </span>
                          )}
                        </div>
                      ) : null}
                    </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default WorkStatusPage;
