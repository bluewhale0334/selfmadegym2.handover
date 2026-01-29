import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { trainerRecruitDb } from "../firebaseTrainerRecruit";
import "./TrainerToRecruitPage.css";

function TrainerToRecruitPage({ onClose }) {
  const [applications, setApplications] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [memoDrafts, setMemoDrafts] = useState({});
  const [interviewDrafts, setInterviewDrafts] = useState({});
  const [interviewEditStatus, setInterviewEditStatus] = useState({});
  const [memoEditStatus, setMemoEditStatus] = useState({});
  const [holdStatus, setHoldStatus] = useState({});

  const TRAINER_RECRUIT_COLLECTION = "applications";
  const ITEMS_PER_PAGE = 5;

  useEffect(() => {
    setIsLoading(true);
    setLoadError("");

    const q = query(
      collection(trainerRecruitDb, TRAINER_RECRUIT_COLLECTION),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const next = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setApplications(next);
        setIsLoading(false);
      },
      (error) => {
        console.error("Error loading trainer recruit data:", error);
        setLoadError("데이터를 불러오지 못했습니다.");
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const getInterviewDraftFromTimestamp = (timestamp) => {
    if (!timestamp) {
      return { date: "", hour: "00", minute: "00" };
    }
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return { date: "", hour: "00", minute: "00" };
    }
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minuteValue = Math.round(date.getMinutes() / 10) * 10;
    const minute = String(minuteValue % 60).padStart(2, "0");
    return { date: `${yyyy}-${mm}-${dd}`, hour, minute };
  };

  useEffect(() => {
    setMemoDrafts((prev) => {
      let hasChange = false;
      const next = { ...prev };
      applications.forEach((application) => {
        if (next[application.id] === undefined) {
          next[application.id] = application.memo || "";
          hasChange = true;
        }
      });
      return hasChange ? next : prev;
    });

    setInterviewDrafts((prev) => {
      let hasChange = false;
      const next = { ...prev };
      applications.forEach((application) => {
        if (next[application.id] === undefined) {
          const draft = getInterviewDraftFromTimestamp(application.interviewAt);
          next[application.id] = draft;
          hasChange = true;
        }
      });
      return hasChange ? next : prev;
    });
  }, [applications]);

  const updateApplication = async (id, data) => {
    try {
      await updateDoc(doc(trainerRecruitDb, TRAINER_RECRUIT_COLLECTION, id), data);
    } catch (error) {
      console.error("Error updating application:", error);
    }
  };

  const handleHoldToggle = (applicationId, nextHold) => {
    updateApplication(applicationId, { onHold: nextHold });
  };

  const handleResultChange = (applicationId, result) => {
    updateApplication(applicationId, { result });
  };

  const handleInterviewDraftChange = (applicationId, key, value) => {
    setInterviewDrafts((prev) => ({
      ...prev,
      [applicationId]: {
        ...prev[applicationId],
        [key]: value,
      },
    }));
  };

  const handleInterviewSave = (applicationId) => {
    const draft = interviewDrafts[applicationId];
    if (!draft || !draft.date) {
      updateApplication(applicationId, { interviewAt: null });
      return;
    }
    const date = new Date(
      `${draft.date}T${draft.hour || "00"}:${draft.minute || "00"}:00`
    );
    updateApplication(applicationId, { interviewAt: Timestamp.fromDate(date) });
    setInterviewEditStatus((prev) => ({
      ...prev,
      [applicationId]: false,
    }));
  };

  const handleInterviewEdit = (applicationId) => {
    setInterviewEditStatus((prev) => ({
      ...prev,
      [applicationId]: true,
    }));
  };

  const handleInterviewCancel = (applicationId) => {
    updateApplication(applicationId, { interviewAt: null });
    setInterviewDrafts((prev) => ({
      ...prev,
      [applicationId]: { date: "", hour: "00", minute: "00" },
    }));
    setInterviewEditStatus((prev) => ({
      ...prev,
      [applicationId]: true,
    }));
  };

  const formatInterviewDateTime = (timestamp) => {
    if (!timestamp) return "-";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "-";
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    return `${yyyy}/${mm}/${dd} - ${hour}시${minute}분`;
  };

  const handleMemoChange = (applicationId, value) => {
    setMemoDrafts((prev) => ({
      ...prev,
      [applicationId]: value,
    }));
  };

  const handleMemoSave = (applicationId) => {
    updateApplication(applicationId, { memo: memoDrafts[applicationId] || "" });
    setMemoEditStatus((prev) => ({
      ...prev,
      [applicationId]: false,
    }));
  };

  const handleMemoDelete = (applicationId) => {
    setMemoDrafts((prev) => ({
      ...prev,
      [applicationId]: "",
    }));
    updateApplication(applicationId, { memo: "" });
    setMemoEditStatus((prev) => ({
      ...prev,
      [applicationId]: false,
    }));
  };

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(applications.length / ITEMS_PER_PAGE)),
    [applications.length]
  );

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);

  const pagedApplications = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return applications.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [applications, currentPage]);

  const formatDate = (timestamp) => {
    if (!timestamp) return "-";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "-";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}/${month}/${day}`;
  };

  return (
    <div className="trainer-to-recruit-page">
      <div className="trainer-to-recruit-header">
        <div className="trainer-to-recruit-title">
          <h2>트레이너 지원서</h2>
          <div className="trainer-recruit-pagination">
            <button
              type="button"
              className="trainer-recruit-page-button"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              이전
            </button>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map(
              (page) => (
                <button
                  key={page}
                  type="button"
                  className={[
                    "trainer-recruit-page-button",
                    page === currentPage ? "active" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </button>
              )
            )}
            <button
              type="button"
              className="trainer-recruit-page-button"
              onClick={() =>
                setCurrentPage((prev) => Math.min(totalPages, prev + 1))
              }
              disabled={currentPage === totalPages}
            >
              다음
            </button>
          </div>
        </div>
        <button
          type="button"
          className="trainer-to-recruit-close"
          onClick={onClose}
        >
          닫기
        </button>
      </div>
      <div className="trainer-to-recruit-body">
        <div className="trainer-recruit-list">
          {isLoading && (
            <p className="trainer-recruit-status">지원서를 불러오는 중...</p>
          )}
          {loadError && <p className="trainer-recruit-error">{loadError}</p>}
          {!isLoading && !loadError && applications.length === 0 && (
            <p className="trainer-recruit-status">등록된 지원서가 없습니다.</p>
          )}
          {pagedApplications.map((application) => {
            const isHold = application.onHold ?? false;
            const interviewDraft = interviewDrafts[application.id] || {
              date: "",
              hour: "00",
              minute: "00",
            };
            const hasInterview = Boolean(application.interviewAt);
            const isEditingInterview =
              interviewEditStatus[application.id] ?? !hasInterview;
            const isEditingMemo = memoEditStatus[application.id] ?? false;
            return (
              <article key={application.id} className="trainer-recruit-card">
              <div className="trainer-recruit-info">
                <div className="trainer-recruit-row">
                  <span className="trainer-recruit-label">이름</span>
                  <span className="trainer-recruit-value">
                    {application.name || "-"}{" "}
                    <span className="trainer-recruit-meta">
                      ({application.gender || "-"})
                    </span>
                  </span>
                </div>
                <div className="trainer-recruit-row">
                  <span className="trainer-recruit-label">전화번호</span>
                  <span className="trainer-recruit-value">
                    {application.phone || "-"}
                  </span>
                </div>
                <div className="trainer-recruit-row">
                  <span className="trainer-recruit-label">E-mail</span>
                  <span className="trainer-recruit-value">
                    {application.email || "-"}
                  </span>
                </div>
                <div className="trainer-recruit-row">
                  <span className="trainer-recruit-label">지원 지점</span>
                  <span className="trainer-recruit-value">
                    {application.branch || "-"}
                  </span>
                </div>
                <div className="trainer-recruit-row">
                  <span className="trainer-recruit-label">파일</span>
                  {application.resumeUrl ? (
                    <a
                      className="trainer-recruit-download"
                      href={application.resumeUrl}
                      target="_blank"
                      rel="noreferrer"
                      download
                    >
                      이력서 다운로드
                    </a>
                  ) : (
                    <span className="trainer-recruit-value">-</span>
                  )}
                </div>
                <div className="trainer-recruit-row">
                  <span className="trainer-recruit-label">지원 날짜</span>
                  <span className="trainer-recruit-value">
                    {formatDate(application.createdAt)}
                  </span>
                </div>
              </div>
              <div
                className={[
                  "trainer-recruit-controls",
                  isHold ? "is-disabled" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="trainer-recruit-control">
                  <span className="trainer-recruit-label">합격 여부</span>
                  <div className="trainer-recruit-radio-group">
                    <label className="trainer-recruit-radio">
                      <input
                        type="radio"
                        name={`result-${application.id}`}
                        disabled={isHold}
                        checked={application.result === "pass"}
                        onChange={() => handleResultChange(application.id, "pass")}
                      />
                      합격
                    </label>
                    <label className="trainer-recruit-radio">
                      <input
                        type="radio"
                        name={`result-${application.id}`}
                        disabled={isHold}
                        checked={application.result === "fail"}
                        onChange={() => handleResultChange(application.id, "fail")}
                      />
                      불합격
                    </label>
                  </div>
                </div>
                <div className="trainer-recruit-control">
                  <span className="trainer-recruit-label">면접 일자</span>
                  <div className="trainer-recruit-datetime">
                    {hasInterview && !isEditingInterview ? (
                      <p className="trainer-recruit-interview-text">
                        면접일자 : {formatInterviewDateTime(application.interviewAt)}
                      </p>
                    ) : (
                      <>
                        <input
                          type="date"
                          disabled={isHold}
                          value={interviewDraft.date}
                          onChange={(event) =>
                            handleInterviewDraftChange(
                              application.id,
                              "date",
                              event.target.value
                            )
                          }
                        />
                        <div className="trainer-recruit-time">
                          <select
                            disabled={isHold}
                            value={interviewDraft.hour}
                            onChange={(event) =>
                              handleInterviewDraftChange(
                                application.id,
                                "hour",
                                event.target.value
                              )
                            }
                          >
                            {Array.from({ length: 24 }, (_, hour) => (
                              <option key={hour} value={hour}>
                                {String(hour).padStart(2, "0")}
                              </option>
                            ))}
                          </select>
                          <span className="trainer-recruit-time-separator">:</span>
                          <select
                            disabled={isHold}
                            value={interviewDraft.minute}
                            onChange={(event) =>
                              handleInterviewDraftChange(
                                application.id,
                                "minute",
                                event.target.value
                              )
                            }
                          >
                            {[0, 10, 20, 30, 40, 50].map((minute) => (
                              <option key={minute} value={minute}>
                                {String(minute).padStart(2, "0")}
                              </option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                    <div className="trainer-recruit-interview-actions">
                      {(!hasInterview || isEditingInterview) && (
                        <button
                          type="button"
                          className="trainer-recruit-save"
                          disabled={isHold}
                          onClick={() => handleInterviewSave(application.id)}
                        >
                          저장
                        </button>
                      )}
                      {hasInterview && !isEditingInterview && (
                        <button
                          type="button"
                          className="trainer-recruit-outline"
                          disabled={isHold}
                          onClick={() => handleInterviewEdit(application.id)}
                        >
                          수정
                        </button>
                      )}
                      {hasInterview && (
                        <button
                          type="button"
                          className="trainer-recruit-outline"
                          disabled={isHold}
                          onClick={() => handleInterviewCancel(application.id)}
                        >
                          면접취소
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <label className="trainer-recruit-checkbox">
                  <input
                    type="checkbox"
                    checked={isHold}
                    onChange={(event) => {
                      handleHoldToggle(application.id, event.target.checked);
                    }}
                  />
                  보류
                </label>
              </div>
              <div className="trainer-recruit-memo-panel">
                <span className="trainer-recruit-label">메모</span>
                <div className="trainer-recruit-memo">
                  <textarea
                    className="trainer-recruit-textarea"
                    placeholder="메모를 입력하세요"
                    rows={6}
                    value={memoDrafts[application.id] ?? ""}
                    onChange={(event) =>
                      handleMemoChange(application.id, event.target.value)
                    }
                    onFocus={() =>
                      setMemoEditStatus((prev) => ({
                        ...prev,
                        [application.id]: true,
                      }))
                    }
                  />
                  <div className="trainer-recruit-memo-actions">
                    <button
                      type="button"
                      className={[
                        "trainer-recruit-save",
                        isEditingMemo ? "is-accent" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => handleMemoSave(application.id)}
                    >
                      저장
                    </button>
                    <button
                      type="button"
                      className="trainer-recruit-outline"
                      onClick={() => handleMemoDelete(application.id)}
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default TrainerToRecruitPage;
