import { useEffect, useMemo, useState, useRef } from "react";
import { signOut, signInWithEmailAndPassword } from "firebase/auth";
import {
  doc,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { trainerRecruitDb } from "../firebaseTrainerRecruit";
import DatePicker from "./categories/DatePicker";
import "./DashboardPage.css";
import DashboardContent from "./categories/DashboardContent";
import NoticeContent from "./categories/NoticeContent";
import InstructionContent from "./categories/InstructionContent";
import HandoverContent from "./categories/HandoverContent";
import ProgressContent from "./categories/ProgressContent";
import ChecklistContent from "./categories/ChecklistContent";
import RepairContent from "./categories/RepairContent";
import ProfilePage from "./ProfilePage";
import SettingsPage from "./SettingsPage";
import ChecklistSettingsPage from "./ChecklistSettingsPage";
import EmployeeStatsPage from "./EmployeeStatsPage";
import MyPostsPage from "./MyPostsPage";
import SearchPage from "./SearchPage";
import TrainerToRecruitPage from "./TrainerToRecruitPage";
import WorkStatusPage from "./WorkStatusPage";

function DashboardPage({ user, onShowAuthPage, onBeforeLogout }) {
  const [profile, setProfile] = useState(null);
  const [activeCategory, setActiveCategory] = useState("대시보드");
  const [activeDate, setActiveDate] = useState(null);
  const [activeSubCategory, setActiveSubCategory] = useState(null); // 전체 공지 하위 카테고리
  const [scrollTarget, setScrollTarget] = useState(null); // { category, documentId, date, subCategory }
  const [expandedCategories, setExpandedCategories] = useState({});
  const [expandedYears, setExpandedYears] = useState({}); // 각 카테고리의 연도별 펼침 상태 { "업무 지시": { "2024": true, "2025": false } }
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerCategory, setDatePickerCategory] = useState(null);
  const [visibleDateCounts, setVisibleDateCounts] = useState({}); // 각 카테고리-연도별 표시할 날짜 개수 { "업무 지시-2024": 5 }
  const [globalRefreshKey, setGlobalRefreshKey] = useState(0); // 전역 리프레시 키

  const NOTICE_SUB_CATEGORIES = [
    "현재 공지",
    "docs~노션 공지",
  ];
  const [showProfileMenu, setShowProfileMenu] = useState(false); // 프로필 메뉴 표시 여부
  const profileMenuRef = useRef(null); // 프로필 메뉴 참조
  const [showUpdatesModal, setShowUpdatesModal] = useState(false);
  const [isClosingUpdatesModal, setIsClosingUpdatesModal] = useState(false);
  const [updatesCloseTransform, setUpdatesCloseTransform] = useState({ x: 0, y: 0, scale: 1 });
  const updatesButtonRef = useRef(null);
  const updatesModalRef = useRef(null);
  const [showHandoverModal, setShowHandoverModal] = useState(false); // 인수인계 모달 표시 여부
  const [customerUsers, setCustomerUsers] = useState([]); // customer 타입 사용자 목록
  const [selectedUser, setSelectedUser] = useState(null); // 선택된 사용자
  const [passwordInput, setPasswordInput] = useState(""); // 비밀번호 입력
  const [handoverError, setHandoverError] = useState(""); // 인수인계 에러 메시지
  const [showProfilePage, setShowProfilePage] = useState(false); // 프로필 페이지 표시 여부
  const [showSettingsPage, setShowSettingsPage] = useState(false); // 환경설정 페이지 표시 여부
  const [showChecklistSettingsPage, setShowChecklistSettingsPage] = useState(false);
  const [showEmployeeStatsPage, setShowEmployeeStatsPage] = useState(false);
  const [showMyPostsPage, setShowMyPostsPage] = useState(false);
  const [showSearchPage, setShowSearchPage] = useState(false);
  const [showTrainerToRecruitPage, setShowTrainerToRecruitPage] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [submittedSearchKeyword, setSubmittedSearchKeyword] = useState("");
  const [unreadCategoryFlags, setUnreadCategoryFlags] = useState({});
  const [hasNewApplicants, setHasNewApplicants] = useState(false);

  const tagColors = useMemo(
    () => ({
      red: "#e4574f",
      orange: "#f2a65a",
      yellow: "#f7d36f",
      green: "#7fc8a9",
      blue: "#6baed6",
      purple: "#b58fd6",
      pink: "#f3a6c8",
      brown: "#c29a7f",
      gray: "#b0b3b8",
      black: "#2b2b2b",
      "red-orange": "linear-gradient(90deg, #e4574f 0 50%, #f2a65a 50% 100%)",
      "orange-yellow": "linear-gradient(90deg, #f2a65a 0 50%, #f7d36f 50% 100%)",
      "yellow-green": "linear-gradient(90deg, #f7d36f 0 50%, #7fc8a9 50% 100%)",
      "green-blue": "linear-gradient(90deg, #7fc8a9 0 50%, #6baed6 50% 100%)",
      "blue-purple": "linear-gradient(90deg, #6baed6 0 50%, #b58fd6 50% 100%)",
      "purple-pink": "linear-gradient(90deg, #b58fd6 0 50%, #f3a6c8 50% 100%)",
      "pink-brown": "linear-gradient(90deg, #f3a6c8 0 50%, #c29a7f 50% 100%)",
      "brown-gray": "linear-gradient(90deg, #c29a7f 0 50%, #b0b3b8 50% 100%)",
      "gray-black": "linear-gradient(90deg, #b0b3b8 0 50%, #2b2b2b 50% 100%)",
      "black-red": "linear-gradient(90deg, #2b2b2b 0 50%, #e4574f 50% 100%)",
    }),
    []
  );

  const updateNotes = useMemo(
    () => [
      {
        version: "1.4.3",
        content: `# handoverSM 1.4.3 - 변경사항

## 주요 변경사항

### 1. 대시보드 문서/토글 편집 개선
- 문서 내용과 토글 내용을 통합해 토글 기반 편집 구조로 변경
- 토글 추가/삭제 및 수정 흐름 개선
- 토글 내용에 Quill 에디터 적용 및 줄바꿈 정리 로직 추가
- 토글 카드 레이아웃(1열 세로) 및 삭제 버튼 위치 정리`,
      },
      {
        version: "1.4.2",
        content: `# handoverSM 1.4.2 - 변경사항

## 주요 변경사항

### 1. 직원 급여 현황 대시보드
- 통계 페이지 내 급여 상세 테이블 추가
- 총 급여 순 정렬 및 엑셀 스타일 뷰 구현

### 2. 인수인계 기능 안정화
- 계정 전환 시 발생하는 권한 오류 수정
- 일시적 통신 장애 시 세션 유지 강화

### 3. UI 일관성 개선
- 월별 내비게이션 바 컴포넌트화 및 디자인 통일`,
      },
      {
        version: "1.4.1",
        content: `# handoverSM 1.4.1 - 변경사항

## 주요 변경사항

### 1. 주휴수당 계산 공식 고도화
- 법정 주휴수당 공식 반영: (상정시간/40)*8*시급
- 예상 급여 상세 항목에 주휴수당 실지급액 표시

### 2. 예상 급여 합계 정교화
- 시급 총액 + 주휴수당 총액 합산 표시`,
      },
      {
        version: "1.4.0",
        content: `# handoverSM 1.4.0 - 변경사항

## 주요 변경사항

### 1. 주휴수당 로직 개선
- 첫 주차 이월 시간 포함 계산 및 라벨 표시
- 이월 없는 첫 주차 주휴수당 발생 조건 보완
- 주간 총 근로시간 기반 주휴수당 시간 산출 (최대 40h)

### 2. 근무 현황 안정화
- 주차별 근무일 충족 여부 판정 로직 정교화`,
      },
      {
        version: "1.3.3",
        content: `# handoverSM 1.3.3 - 변경사항

## 주요 변경사항

### 1. 검색 기능 추가
- 헤더 검색어 입력 후 검색 페이지로 이동
- 공지/지시/인수인계/업무완료 검색 결과 표시
- 본문/댓글 구분 라벨 표시
- 본문/댓글 하이라이트 표시

### 2. 업데이트 내역 모달 개선
- "일주일 동안 보지 않기" 옵션 추가

### 3. 댓글 알림 이동 보강
- 업무 지시/일일 인수인계/업무 완료사항 스크롤 이동 지원`,
      },
      {
        version: "1.3.2",
        content: `# handoverSM 1.3.2 - 변경사항

## 주요 변경사항

### 1. 반복 업무 기능 추가
- 반복 업무 탭/간격 옵션 추가
- 반복 업무 복사 시 대상 근무시간 기준 재계산
- 반복 업무 표시 범위: 현재시간 기준 -1시간 ~ +1시간

### 2. 업무 리스트 화면 보강
- 추가 업무 리스트 하단에 반복 업무 섹션 추가
- 반복 업무 시간 소숫점 표기 개선 (예: 1.5 → 01:30)

### 3. NEW 카드 슬라이더 안정화
- 전체 공지 포함 좌우 슬라이드 동작 개선
- NEW 카드 표시 제한 해제`,
      },
      {
        version: "1.3.1",
        content: `# handoverSM 1.3.1 - 변경사항

## 주요 변경사항

### 1. 업무 리스트 날짜 선택 UX 개선
- 날짜 선택 클릭 시 달력이 즉시 열리고 날짜 클릭 즉시 이동
- 생성된 날짜는 달력에 표시
- 오늘은 "날짜 선택" 텍스트, 다른 날짜는 날짜 표기
- 최근 5일 버튼은 스냅샷 없는 날짜 숨김

### 2. 대시보드 업무 리스트 카드 개선
- 카드 헤더의 텍스트 제거 및 바로가기 버튼 단독 배치

## 기술적 변경사항
- DatePicker에 생성 날짜 표시용 하이라이트 지원 추가`,
      },
      {
        version: "1.3.0",
        content: `# handoverSM 1.3.0 - 변경사항

## 주요 변경사항

### 1. 업무 리스트 명칭 정리
- **업무 리스트 명칭 통일**
  - 사이드바/버튼/안내 문구 텍스트 통일

### 2. 업무 리스트 화면 개선
- 일일/추가 업무를 분리한 레이아웃
- 완료 항목 분리 및 완료시간 표시
- 날짜 선택/추가 및 최근 5일 빠른 이동 버튼

### 3. 업무관리 설정 기능 확장
- 일일/주간/월간 템플릿 관리
- 주간 요일/월간 날짜 선택, 월간 다중 선택
- 관리자용 사용자별 관리 및 내용 복사

### 4. 대시보드 업무 리스트 위젯 추가
- 오늘 업무 목록 표시 (미완료만)
- 시간 경과 시 강조 표시, 시간 순 정렬
- 업무 리스트 바로가기 버튼

## 기술적 변경사항
- \`dailyChecklistSnapshots\`/ \`checklistTasks\` 기반 일일 스냅샷 저장
- Firestore 보안 규칙에 업무 리스트 컬렉션 권한 추가`,
      },
      {
        version: "1.2.0",
        content: `# handoverSM 1.2.0 - 변경사항

## 주요 변경사항

### 1. 카테고리 명칭 변경
- **"업무 진행사항" → "업무 완료사항"**
  - 사이드바/카테고리 표시/내부 안내 문구 일괄 변경

### 2. 대시보드 댓글 알림 박스 추가
- **대상**: 내가 작성한 문서에 달린 댓글
- **범위**: 전체 공지 + 모든 카테고리 문서
- **동작**
  - 읽지 않은 댓글 우선 표시
  - 읽은 댓글은 회색 처리 및 후순위 정렬
  - 클릭 시 읽음 처리

### 3. 알림 숨기기 버튼
- **조건**: 새 댓글 0건일 때 표시
- **기능**: 읽은 댓글 알림만 숨김 (댓글 데이터는 삭제하지 않음)

### 4. 댓글 클릭 시 문서로 이동
- 카테고리/날짜/하위 카테고리 자동 선택
- 해당 문서까지 자동 스크롤

## 기술적 변경사항
- **DashboardInContent.jsx**
  - 다중 컬렉션 \`onSnapshot\` 구독 및 댓글 집계
  - 댓글 \`readBy\` 업데이트로 읽음 처리
  - 알림 숨김 상태 로컬 관리
- **DashboardPage.jsx**
  - 문서 자동 스크롤 타겟 상태 전달
- **SharedDocuments.jsx / NoticeDocuments.jsx**
  - 문서 요소에 \`id\` 부여
  - 스크롤 타겟 수신 시 자동 스크롤 처리`,
      },
      {
        version: "1.1.2",
        content: `# handoverSM 1.1.2 - 변경사항

## 주요 변경사항

### 1. 대시보드 레이아웃 리디자인
- **좌/우 2분할 구조**
  - 왼쪽: 전체 높이를 채우는 단일 박스
  - 오른쪽: 상단 300px 고정 박스 + 하단 남은 영역
- **하단 영역 2분할**
  - 하단 영역을 가로로 나눠 좌/우 두 박스 구성

### 2. 대시보드 구성 요소 분리
- **DashboardInContent 컴포넌트 추가**
  - 대시보드 레이아웃을 전용 컴포넌트로 분리
  - 스타일을 전용 CSS 파일로 분리해 관리

### 3. 댓글 줄바꿈 표시 수정
- **멀티라인 댓글 유지**
  - 댓글 본문에 \`white-space: pre-wrap\` 적용
  - 입력한 줄바꿈이 화면에 그대로 표시되도록 개선`,
      },
      {
        version: "1.1.1",
        content: `# handoverSM 1.1.1 - 변경사항

## 주요 변경사항

### 1. 전체 공지 하위 카테고리 시스템
- **하위 카테고리 추가**
  - "현재 공지" (기본값)
  - "docs~노션 공지"
  - 사이드바에 토글로 표시
  - 카테고리별 문서 필터링

- **문서 구조 변경**
  - \`subCategory\` 필드 추가 (notices 컬렉션)
  - 하위 카테고리별 문서 분류
  - 기존 문서 호환성 유지 (subCategory 없는 문서는 "현재 공지"로 간주)

### 2. 전체 공지 전용 컴포넌트 분리
- **NoticeDocuments.jsx 생성**
  - SharedDocuments.jsx와 기능/디자인 동일
  - 전체 공지 전용 로직 구현
  - 날짜 필드 없음 (createdAt에서 날짜/시간 추출)

- **문서 표시 형식**
  - 작성자 - 날짜 - 시간 형식으로 표시
  - 예: "홍길동 - 1월 15일 - 14시"

### 3. 카테고리 설정 기능
- **"카테고리 설정" 버튼**
  - 작성하기 버튼 왼쪽에 배치
  - 하위 카테고리 선택 드롭다운 메뉴
  - 선택한 하위 카테고리로 문서 필터링
  - 새 문서 작성 시 선택한 하위 카테고리로 저장

### 4. 사이드바 하위 카테고리 표시
- **전체 공지 클릭 시**
  - 하위 카테고리 토글 표시 (펼치기/접기)
  - 하위 카테고리 클릭 시 해당 카테고리로 필터링
  - 기본값: "현재 공지" 자동 선택

### 5. 연도별 네비게이션 계층 구조
- **날짜 계층 구조 변경**
  - 기존: 상위 카테고리 - 하위 카테고리(날짜)
  - 변경: 상위 카테고리 - 하위 카테고리(연도) - 하위 카테고리(날짜)
- **구현**
  - 날짜 목록을 연도별로 그룹화
  - 연도 클릭 시 해당 연도의 날짜 목록 펼침/접기
  - 헤더에 연도 표시: \`업무 지시 > 2024 > 1월 15일\`
  - 각 연도별 독립적인 "더보기/접기" 기능

### 6. Admin CRUD 권한 개선
- **모든 문서 수정/삭제 권한**
  - Admin 사용자는 모든 문서의 수정/삭제 버튼 표시
  - 작성자 여부와 관계없이 수정/삭제 가능
  - Firestore Security Rules에서 admin 전체 CRUD 권한 부여

- **Firestore Rules 단순화**
  - \`isAuthorDisabled\`, \`isUserDisabled\` 헬퍼 함수 제거
  - Admin 권한 체크 단순화
  - Admin은 모든 문서 컬렉션에 대해 수정/삭제 가능

### 7. Firestore 에러 핸들링 개선
- **INTERNAL ASSERTION 오류 처리**
  - 리스너 설정 시 안전한 cleanup 보장
  - 문서 생성/삭제 시 INTERNAL ASSERTION 오류 특별 처리
  - 에러 발생 시에도 기능 정상 동작 (onSnapshot 자동 동기화)

- **리스너 안정성 개선**
  - \`isMounted\` 플래그로 언마운트 후 상태 업데이트 방지
  - 이전 리스너 cleanup 보장
  - 스냅샷 유효성 검사 추가

## 기술적 개선사항

### 컴포넌트 구조 변경
- **NoticeDocuments.jsx**: 전체 공지 전용 컴포넌트
  - 날짜 필드 관련 로직 제거
  - 하위 카테고리 필터링 로직 추가
  - 작성자-날짜-시간 표시 형식

- **DashboardPage.jsx**: 사이드바 하위 카테고리 지원
  - \`activeSubCategory\` state 추가
  - 하위 카테고리 토글 UI 추가
  - 헤더에 하위 카테고리 표시

### 상태 관리 개선
- 하위 카테고리 선택 상태 관리
- 연도별 펼침/접기 상태 관리 (\`expandedYears\`)
- 카테고리-연도별 날짜 개수 관리 (\`visibleDateCounts\`)

### 에러 처리 개선
- Firestore INTERNAL ASSERTION 오류 조용히 처리
- 문서 삭제 시 INTERNAL ASSERTION 오류 무시 (삭제는 성공)
- 리스너 cleanup 시 에러 처리

## UI/UX 개선사항

### 사이드바 개선
- 전체 공지 하위 카테고리 토글 표시
- 연도별 계층 구조로 날짜 표시
- 연도별 독립적인 펼침/접기 기능

### 문서 표시 개선
- 전체 공지 문서에 작성자-날짜-시간 형식 표시
- 하위 카테고리별 문서 필터링

### 헤더 표시 개선
- 하위 카테고리 선택 시: \`전체 공지 > 현재 공지\`
- 날짜 선택 시: \`업무 지시 > 2024 > 1월 15일\`

## 데이터 구조 변경

### notices 컬렉션
\`\`\`javascript
{
  // 기존 필드
  content: string,
  authorId: string,
  authorName: string,
  tagColor: string,
  createdAt: Timestamp,
  readBy: [...],
  comments: [...],
  
  // 새 필드
  subCategory: string, // "현재 공지" | "docs~노션 공지"
}
\`\`\`

## 주의사항
- 기존 문서들은 데이터베이스에서 수동으로 \`subCategory\` 필드를 추가해야 함
- 하위 카테고리 없는 문서는 "현재 공지"로 간주되어 필터링됨`,
      },
      {
        version: "1.1.0",
        content: `# handoverSM 1.1.0 - 변경사항

## 주요 변경사항

### 1. 대시보드 메인 설정
- **변경**: 리프레시 시 로그인 화면 깜빡임 제거
- **구현**: 대시보드를 항상 메인으로 표시, 로그인하지 않은 사용자도 대시보드 접근 가능
- **효과**: 더 나은 사용자 경험, 페이지 전환 시 깜빡임 없음

### 2. 인증 UI 개선
- **로그인/회원가입 버튼 추가**
  - 대시보드 헤더에 로그인/회원가입 버튼 표시
  - 로그인하지 않은 사용자에게만 표시
  - 버튼 클릭 시 AuthPage로 이동
  - 회원가입 버튼 클릭 시 회원가입 모드로 자동 전환
- **AuthPage 닫기 기능**
  - 닫기 버튼 추가
  - 대시보드로 돌아가기 가능

### 3. 프로필 메뉴 시스템
- **드롭다운 메뉴**
  - 프로필 버튼 클릭 시 드롭다운 메뉴 표시/숨김
  - 외부 클릭 시 자동 닫기
  - 메뉴 항목:
    - **프로필**: 클릭 시 "개발중입니다" 메시지 표시 (향후 구현 예정)
    - **인수인계**: customer 타입 사용자 목록 표시 및 사용자 전환

### 4. 인수인계 기능
- **사용자 목록 표시**
  - customer 타입 사용자 목록 조회
  - 프로필 정보 표시 (태그 색상 원, 이름, 직책)
  - 현재 로그인한 사용자 제외
- **사용자 전환**
  - 프로필 클릭 시 비밀번호 입력 폼 표시
  - 비밀번호 확인 후 해당 사용자로 자동 전환
  - \`signInWithEmailAndPassword\`를 사용한 사용자 전환
  - 에러 처리 (잘못된 비밀번호, 사용자 없음 등)
- **UI/UX**
  - 모달 오버레이 (외부 클릭 시 닫기)
  - Enter 키로 비밀번호 확인 가능
  - 취소 버튼 (다시 사용자 선택으로 돌아가기)

### 5. 프로필 정보 개선
- **role 표시 개선**
  - \`getDoc\` → \`onSnapshot\`으로 변경하여 실시간 업데이트
  - 로그인 직후에도 role 정보 즉시 표시
  - 프로필 정보 변경 시 자동 반영

### 6. 사용자 타입 시스템
- **user_type 필드 추가**
  - 기본값: "customer"
  - 회원가입 시 자동으로 "customer"로 설정
  - 향후 "admin" 타입 지원 예정
  - Firestore \`users\` 컬렉션에 저장

### 7. Firestore Security Rules 업데이트
- **users 컬렉션 권한 확장**
  - 인증된 사용자는 자신의 문서 읽기/쓰기 가능
  - 인증된 사용자는 customer 타입 사용자 목록 조회 가능 (인수인계 기능용)
  - 규칙: \`allow read: if request.auth != null && (request.auth.uid == userId || resource.data.user_type == "customer")\`

## 기술적 개선사항
- **상태 관리**: 프로필 메뉴, 인수인계 모달 상태 관리 추가
- **에러 처리**: Firestore 쿼리 에러 처리 개선 (인덱스 필요 시 명확한 메시지)
- **디버깅**: customer 사용자 목록 조회 시 콘솔 로그 추가
- **코드 구조**: 인수인계 관련 함수 분리 및 모듈화

## UI/UX 개선사항
- **모달 디자인**: 인수인계 모달 스타일 추가
- **프로필 메뉴**: 드롭다운 메뉴 스타일 및 애니메이션
- **버튼 스타일**: 로그인/회원가입 버튼 스타일 추가
- **반응형**: 모달 및 메뉴 반응형 디자인

## 다음 버전 계획
- 프로필 편집 기능 구현
- admin 타입 사용자 관리 기능
- admin 가입 승인 시스템`,
      },
      {
        version: "1.0.0",
        content: `# handoverSM 1.0.0 - 개발자 노트

## 프로젝트 개요
업무 인수인계를 더 간단하게 관리할 수 있는 웹 애플리케이션입니다.

## 기술 스택
- **Frontend**: React 18 + Vite
- **Backend**: Firebase (Authentication, Firestore)
- **스타일링**: CSS (CSS Variables 사용)

## 주요 기능

### 1. 인증 시스템
- **이메일/비밀번호 로그인**
  - 세션 지속성 (browserLocalPersistence)
  - 입력 검증 (이메일 형식, 비밀번호 길이)
  - 에러 처리 (존재하지 않는 계정, 잘못된 비밀번호 등)

- **회원가입**
  - 필수 정보: 이메일, 비밀번호(6자 이상), 이름, 직책, 전화번호, 태그 색상
  - 전화번호 형식 검증 (010-1234-5678)
  - 태그 색상 중복 방지 (10가지 색상: 빨강, 주황, 노랑, 초록, 파랑, 보라, 분홍, 갈색, 회색, 검정)
  - 사용 중인 태그 색상은 비활성화 및 사용자 이름 표시

- **비밀번호 재설정**
  - 이메일을 통한 비밀번호 재설정 링크 발송

### 2. 사용자 프로필
- **프로필 정보**
  - 이름, 직책, 전화번호, 태그 색상
  - Firestore \`users\` 컬렉션에 저장
  - 헤더에 프로필 정보 표시 (태그 색상 원, 이름, 직책)

### 3. 대시보드 레이아웃
- **헤더**
  - 앱 이름 (selfmadegym2)
  - 현재 활성 카테고리/날짜 표시
  - 프로필 버튼 (태그 색상, 이름, 직책)
  - 로그아웃 버튼

- **사이드바**
  - 카테고리 목록
  - 날짜별 하위 카테고리 (펼치기/접기)
  - "더보기"/"접기" 버튼 (5개씩 표시)
  - 카테고리별 활성 상태 표시

### 4. 카테고리 시스템
- **카테고리 구조**
  - 대시보드 (날짜 하위 카테고리 없음)
  - 전체 공지 (날짜 하위 카테고리 없음)
  - 업무 지시 (날짜 하위 카테고리 있음)
  - 일일 인수인계 (날짜 하위 카테고리 있음)
  - 업무 완료사항 (날짜 하위 카테고리 있음)
  - 업무 리스트 (날짜 하위 카테고리 있음, 사용자별 데이터)

- **날짜별 하위 카테고리**
  - 상위 카테고리 클릭: 해당 카테고리의 모든 문서 표시 (날짜별 정렬)
  - 하위 카테고리 클릭: 해당 날짜의 문서만 표시
  - 날짜 선택 버튼으로 새 날짜 문서 생성 가능
  - 날짜 플래그 문서로 하위 카테고리 영구 저장

### 5. NEW! 카드 섹션
- **기능**
  - 읽지 않은 문서를 카드 형태로 표시
  - 본인이 작성한 문서 제외
  - 이미 읽은 문서 제외
  - 카테고리별, 날짜별 정렬
  - 최대 5개 표시
  - 좌우 슬라이드 네비게이션
  - 카드 클릭 시 해당 문서의 카테고리/날짜로 이동

- **상태 관리**
  - 새로운 문서가 있을 때만 자동으로 열림
  - 새로운 문서가 없을 때는 기본적으로 닫힘
  - 새로운 문서가 없을 때 토글 클릭 시 "새로운 내용이 없습니다" 안내
  - 새로운 문서가 없을 때 "NEW!" → "Not Event"로 텍스트 변경

### 6. 문서 관리 (CRUD)
- **문서 작성**
  - 카테고리별 컬렉션에 저장
  - 작성자 정보 (이름, 태그 색상, UID) 자동 저장
  - 날짜 선택 가능 (날짜가 필요한 카테고리)
  - 실시간 동기화 (onSnapshot)

- **문서 수정**
  - 작성자만 수정 가능
  - 낙관적 업데이트로 즉시 UI 반영
  - 실시간 동기화

- **문서 삭제**
  - 작성자만 삭제 가능
  - 확인 다이얼로그
  - 낙관적 업데이트로 즉시 UI 반영
  - 실시간 동기화

- **문서 목록**
  - 날짜별 정렬 (하위 카테고리)
  - 생성 시간별 정렬 (상위 카테고리)
  - 작성자 정보 표시 (태그 색상, 이름, 날짜-시간)

### 7. 내용 확인 기능
- **기능**
  - 본인이 작성하지 않은 문서에만 "내용 확인" 버튼 표시
  - 클릭 시 \`readBy\` 배열에 사용자 정보 추가
  - 확인한 사용자 목록 표시 (✓ 체크 표시, 태그 색상, 이름)
  - 낙관적 업데이트로 즉시 UI 반영
  - 실시간 동기화

### 8. 댓글 시스템
- **댓글 추가**
  - 모든 문서에 댓글 추가 가능
  - 작성자 정보 자동 저장 (태그 색상, 이름, UID)
  - 최신 프로필 정보 사용
  - 실시간 동기화

- **댓글 수정**
  - 본인이 작성한 댓글만 수정 가능
  - 낙관적 업데이트로 즉시 UI 반영
  - 실시간 동기화

- **댓글 삭제**
  - 본인이 작성한 댓글만 삭제 가능
  - 확인 다이얼로그
  - 낙관적 업데이트로 즉시 UI 반영
  - 실시간 동기화

- **댓글 표시**
  - "색깔원 작성자:내용" 형식
  - 문서 하단에 표시

### 9. Firestore 데이터 구조
- **컬렉션**
  - \`users\`: 사용자 프로필 정보
  - \`tagColors\`: 태그 색상 예약 정보
  - \`notices\`: 전체 공지
  - \`instructions\`: 업무 지시
  - \`handovers\`: 일일 인수인계
  - \`progresses\`: 업무 완료사항
  - \`checklists\`: 업무 리스트 (사용자별)

- **문서 구조**
  \`\`\`javascript
  {
    content: string,
    authorId: string,
    authorName: string,
    tagColor: string,
    createdAt: Timestamp,
    date: string (optional),
    userId: string (checklists only),
    readBy: [
      {
        userId: string,
        userName: string,
        tagColor: string,
        readAt: Timestamp
      }
    ],
    comments: [
      {
        userId: string,
        userName: string,
        tagColor: string,
        content: string,
        createdAt: Timestamp
      }
    ],
    isDateFlag: boolean (optional)
  }
  \`\`\`

### 10. Firestore 보안 규칙
- **인증**
  - 모든 컬렉션은 인증된 사용자만 접근 가능

- **권한**
  - 문서 작성: 모든 인증된 사용자
  - 문서 수정/삭제: 작성자만
  - \`readBy\` 업데이트: 모든 인증된 사용자 (본인만 추가)
  - \`comments\` 업데이트: 모든 인증된 사용자 (댓글 추가/수정/삭제)

- **특수 규칙**
  - \`checklists\`: 사용자별로 읽기/쓰기 제한
  - \`tagColors\`: 공개 읽기, 인증된 사용자만 쓰기

### 11. 실시간 동기화
- **onSnapshot 사용**
  - 문서 목록 실시간 업데이트
  - 날짜 목록 실시간 업데이트
  - 카드 섹션 실시간 업데이트

- **낙관적 업데이트**
  - 문서 작성/수정/삭제 시 즉시 UI 반영
  - 댓글 추가/수정/삭제 시 즉시 UI 반영
  - 내용 확인 시 즉시 UI 반영
  - 에러 발생 시 롤백

### 12. 전역 리프레시 시스템
- **globalRefreshKey**
  - 모든 컴포넌트에서 공유하는 리프레시 키
  - CRUD 작업 후 자동 리프레시
  - 카드 섹션, 사이드바, 문서 목록 동시 업데이트

## UI/UX 특징
- **색상 테마**: 흰색/베이지 계열
- **반응형 디자인**: Flexbox/Grid 레이아웃
- **애니메이션**: 호버 효과, 전환 효과
- **접근성**: aria-label, 키보드 네비게이션 지원

## 주요 컴포넌트 구조
\`\`\`
App.jsx
├── AuthPage.jsx (로그인/회원가입)
└── DashboardPage.jsx
    ├── DashboardContent.jsx
    ├── NoticeContent.jsx
    │   └── SharedCategoryContent.jsx
    │       ├── NEW! 카드 섹션
    │       └── SharedDocuments.jsx
    │           ├── 문서 작성 폼
    │           ├── 문서 목록
    │           └── 댓글 시스템
    ├── InstructionContent.jsx
    ├── HandoverContent.jsx
    ├── ProgressContent.jsx
    └── ChecklistContent.jsx
\`\`\`
`,
      },
    ],
    []
  );
  const [expandedUpdateVersions, setExpandedUpdateVersions] = useState(() => new Set(["1.4.3"]));
  const currentVersionInfo = useMemo(
    () => `## 버전 정보
- **버전**: 1.4.3
- **프로젝트명**: handoverSM
- **개발 환경**: React + Vite + Firebase`,
    []
  );

  useEffect(() => {
    if (!showUpdatesModal) return;
    setExpandedUpdateVersions(new Set([updateNotes[0]?.version].filter(Boolean)));
  }, [showUpdatesModal, updateNotes]);

  const triggerCloseUpdatesModal = () => {
    if (isClosingUpdatesModal) return;
    const buttonRect = updatesButtonRef.current?.getBoundingClientRect();
    const modalRect = updatesModalRef.current?.getBoundingClientRect();
    if (!buttonRect || !modalRect) {
      setShowUpdatesModal(false);
      return;
    }
    const targetX = buttonRect.left + buttonRect.width / 2;
    const targetY = buttonRect.top + buttonRect.height / 2;
    const modalX = modalRect.left + modalRect.width / 2;
    const modalY = modalRect.top + modalRect.height / 2;
    const scale = Math.min(
      buttonRect.width / modalRect.width,
      buttonRect.height / modalRect.height,
      0.4
    );
    setUpdatesCloseTransform({
      x: Math.round(targetX - modalX),
      y: Math.round(targetY - modalY),
      scale: Number.isFinite(scale) && scale > 0 ? scale : 0.2,
    });
    setIsClosingUpdatesModal(true);
    setTimeout(() => {
      setShowUpdatesModal(false);
      setIsClosingUpdatesModal(false);
      setUpdatesCloseTransform({ x: 0, y: 0, scale: 1 });
    }, 280);
  };

  const categories = useMemo(
    () => [
      { label: "대시보드", type: "dashboard", hasDates: false },
      { label: "근무 현황", type: "workStatus", hasDates: false },
      { label: "전체 공지", type: "notice", hasDates: false },
      { label: "업무 지시", type: "instruction", hasDates: true },
      { label: "일일 인수인계", type: "handover", hasDates: true },
      { label: "업무 완료사항", type: "progress", hasDates: true },
      { label: "업무 리스트", type: "checklist", hasDates: true },
      { label: "고장&수리", type: "repair", hasDates: false },
    ],
    []
  );

  const newBadgeTargets = useMemo(
    () => [
      { label: "전체 공지", collection: "notices" },
      { label: "업무 지시", collection: "instructions" },
      { label: "일일 인수인계", collection: "handovers" },
      { label: "업무 완료사항", collection: "progresses" },
      { label: "고장&수리", collection: "repairs" },
    ],
    []
  );

  const [dateLists, setDateLists] = useState({
    "업무 지시": [],
    "일일 인수인계": [],
    "업무 완료사항": [],
    "업무 리스트": [],
  });

  // Firestore에서 날짜 목록 가져오기 (실시간 업데이트)
  useEffect(() => {
    if (!user) return;

    const categoryCollections = {
      "업무 지시": "instructions",
      "일일 인수인계": "handovers",
      "업무 완료사항": "progresses",
      "업무 리스트": "checklists",
    };

    const unsubscribes = [];

    for (const [category, collectionName] of Object.entries(categoryCollections)) {
      // globalRefreshKey가 변경되면 리스너 재구독
      try {
        let q;
        if (category === "업무 리스트") {
          // 업무 리스트는 userId로만 필터링하고, 정렬은 클라이언트에서 처리 (인덱스 불필요)
          q = query(
            collection(db, collectionName),
            where("userId", "==", user.uid)
          );
        } else {
          q = query(collection(db, collectionName), orderBy("date", "desc"));
        }

        const unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            const dates = new Set();
            snapshot.forEach((doc) => {
              const data = doc.data();
              if (data.date) {
                dates.add(data.date);
              }
            });
            setDateLists((prev) => ({
              ...prev,
              [category]: Array.from(dates).sort().reverse(),
            }));
          },
          (error) => {
            console.error(`Error fetching dates for ${category}:`, error);
            console.error("Error code:", error.code);
            console.error("Error message:", error.message);
            if (error.code === "failed-precondition") {
              console.warn(`인덱스가 필요합니다. Firebase 콘솔에서 인덱스를 생성해주세요.`);
            }
          }
        );

        unsubscribes.push(unsubscribe);
      } catch (error) {
        console.error(`Error setting up listener for ${category}:`, error);
      }
    }

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [user, globalRefreshKey]); // globalRefreshKey 추가

  useEffect(() => {
    if (!user) {
      setUnreadCategoryFlags({});
      return;
    }

    let isMounted = true;

    const fetchUnreadFlags = async () => {
      const nextFlags = {};

      await Promise.all(
        newBadgeTargets.map(async (target) => {
          try {
            const q = query(
              collection(db, target.collection),
              orderBy("createdAt", "desc")
            );
            const snapshot = await getDocs(q);
            let hasUnread = false;

            snapshot.forEach((docSnapshot) => {
              if (hasUnread) return;
              const data = docSnapshot.data();
              if (data.authorId === user.uid) return;
              const readBy = data.readBy || [];
              const hasRead = readBy.some((reader) => reader.userId === user.uid);
              if (!hasRead) {
                hasUnread = true;
              }
            });

            nextFlags[target.label] = hasUnread;
          } catch (error) {
            console.error(`Error fetching unread flag for ${target.label}:`, error);
            nextFlags[target.label] = false;
          }
        })
      );

      if (isMounted) {
        setUnreadCategoryFlags(nextFlags);
      }
    };

    fetchUnreadFlags();

    return () => {
      isMounted = false;
    };
  }, [user, globalRefreshKey, newBadgeTargets]);

  useEffect(() => {
    if (profile?.user_type !== "admin") {
      setHasNewApplicants(false);
      return;
    }

    let isFirstSnapshot = true;
    const unsubscribe = onSnapshot(
      collection(trainerRecruitDb, "applications"),
      (snapshot) => {
        if (isFirstSnapshot) {
          isFirstSnapshot = false;
          return;
        }
        const hasAdded = snapshot
          .docChanges()
          .some((change) => change.type === "added");
        if (hasAdded) {
          setHasNewApplicants(true);
        }
      },
      (error) => {
        console.error("Error watching trainer recruit applications:", error);
      }
    );

    return () => unsubscribe();
  }, [profile?.user_type]);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}월 ${day}일`;
  };

  // 날짜에서 연도 추출
  const getYearFromDate = (dateString) => {
    const date = new Date(dateString);
    return date.getFullYear().toString();
  };

  // 날짜 목록을 연도별로 그룹화
  const groupDatesByYear = (dates) => {
    const grouped = {};
    dates.forEach((date) => {
      const year = getYearFromDate(date);
      if (!grouped[year]) {
        grouped[year] = [];
      }
      grouped[year].push(date);
    });
    // 연도별로 정렬 (내림차순), 각 연도 내 날짜도 정렬 (내림차순)
    const sortedYears = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
    const result = {};
    sortedYears.forEach((year) => {
      result[year] = grouped[year].sort((a, b) => b.localeCompare(a));
    });
    return result;
  };

  // 연도 토글 핸들러
  const handleYearToggle = (categoryLabel, year, event) => {
    event.stopPropagation();
    setExpandedYears((prev) => ({
      ...prev,
      [categoryLabel]: {
        ...prev[categoryLabel],
        [year]: !prev[categoryLabel]?.[year],
      },
    }));
  };

  // 연도별 날짜 개수 관리
  const handleShowMoreDatesInYear = (categoryLabel, year) => {
    const key = `${categoryLabel}-${year}`;
    setVisibleDateCounts((prev) => ({
      ...prev,
      [key]: (prev[key] || 5) + 5,
    }));
  };

  const handleShowLessDatesInYear = (categoryLabel, year) => {
    const key = `${categoryLabel}-${year}`;
    setVisibleDateCounts((prev) => ({
      ...prev,
      [key]: Math.max(5, (prev[key] || 5) - 5),
    }));
  };

  const closeSidebarOverlays = () => {
    setShowChecklistSettingsPage(false);
    setShowProfilePage(false);
    setShowSettingsPage(false);
    setShowEmployeeStatsPage(false);
    setShowMyPostsPage(false);
    setShowSearchPage(false);
    setShowTrainerToRecruitPage(false);
  };

  const openSearchPage = () => {
    setSubmittedSearchKeyword(searchKeyword.trim());
    setShowSearchPage(true);
    setShowProfilePage(false);
    setShowSettingsPage(false);
    setShowChecklistSettingsPage(false);
    setShowEmployeeStatsPage(false);
    setShowMyPostsPage(false);
    setShowTrainerToRecruitPage(false);
  };

  const handleCategoryClick = (categoryLabel) => {
    if (categoryLabel === "대시보드") {
      window.location.reload();
      return;
    }
    closeSidebarOverlays();
    // 전체보기만 수행 (토글은 하지 않음)
    setActiveCategory(categoryLabel);
    setActiveDate(null);
    // 전체 공지가 아닌 경우 하위 카테고리 초기화
    if (categoryLabel !== "전체 공지") {
      setActiveSubCategory(null);
    } else {
      // 전체 공지인 경우 기본값 "현재 공지"로 설정 및 하위 카테고리 펼치기
      setActiveSubCategory("현재 공지");
      setExpandedCategories((prev) => ({
        ...prev,
        [categoryLabel]: true,
      }));
    }
  };

  const handleSubCategoryClick = (subCategory) => {
    closeSidebarOverlays();
    setActiveCategory("전체 공지");
    setActiveSubCategory(subCategory);
    setActiveDate(null);
    setExpandedCategories((prev) => ({
      ...prev,
      "전체 공지": true,
    }));
  };

  const handleToggleCategory = (categoryLabel, event) => {
    // 토글만 수행 (전체보기는 하지 않음)
    event.stopPropagation();
    const hasDates = categories.find((c) => c.label === categoryLabel)?.hasDates;
    const isNotice = categoryLabel === "전체 공지";
    if (hasDates || isNotice) {
      setExpandedCategories((prev) => {
        const isExpanding = !prev[categoryLabel];
        // 카테고리를 펼칠 때 초기 표시 개수 설정 (5개)
        if (isExpanding && hasDates) {
          setVisibleDateCounts((prevCounts) => ({
            ...prevCounts,
            [categoryLabel]: 5,
          }));
        }
        return {
          ...prev,
          [categoryLabel]: isExpanding,
        };
      });
    }
  };

  const handleShowMoreDates = (categoryLabel) => {
    setVisibleDateCounts((prev) => {
      const currentCount = prev[categoryLabel] || 5;
      return {
        ...prev,
        [categoryLabel]: currentCount + 5,
      };
    });
  };

  const handleShowLessDates = (categoryLabel) => {
    setVisibleDateCounts((prev) => ({
      ...prev,
      [categoryLabel]: 5,
    }));
  };

  const handleDateClick = (categoryLabel, date) => {
    closeSidebarOverlays();
    setActiveCategory(categoryLabel);
    setActiveDate(date);
  };

  const handleAddDateClick = (categoryLabel, event) => {
    event.stopPropagation();
    setDatePickerCategory(categoryLabel);
    setShowDatePicker(true);
  };

  const handleDatePickerSelect = async (date) => {
    if (datePickerCategory && user) {
      const categoryCollections = {
        "업무 지시": "instructions",
        "일일 인수인계": "handovers",
        "업무 완료사항": "progresses",
        "업무 리스트": "checklists",
        "고장&수리": "repairs",
      };

      const collectionName = categoryCollections[datePickerCategory];
      
      if (collectionName) {
        try {
          // 해당 날짜에 문서가 있는지 확인
          let checkQuery;
          if (datePickerCategory === "업무 리스트") {
            checkQuery = query(
              collection(db, collectionName),
              where("userId", "==", user.uid),
              where("date", "==", date),
              orderBy("createdAt", "desc")
            );
          } else {
            checkQuery = query(
              collection(db, collectionName),
              where("date", "==", date),
              orderBy("createdAt", "desc")
            );
          }

          const snapshot = await getDocs(checkQuery);
          
          // 해당 날짜에 문서가 없으면 빈 플래그 문서 생성
          if (snapshot.empty) {
            const flagDoc = {
              date: date,
              isDateFlag: true, // 날짜 플래그임을 표시
              createdAt: serverTimestamp(),
            };

            if (datePickerCategory === "업무 리스트") {
              flagDoc.userId = user.uid;
              flagDoc.authorId = user.uid;
            } else {
              flagDoc.authorId = user.uid;
            }

            await addDoc(collection(db, collectionName), flagDoc);
            console.log("Date flag document created for:", date);
          }
        } catch (error) {
          console.error("Error creating date flag:", error);
          // 에러가 발생해도 날짜 선택은 진행
        }
      }
      
      setActiveCategory(datePickerCategory);
      setActiveDate(date);
      setActiveSubCategory(null); // 날짜 선택 시 하위 카테고리 초기화
      setExpandedCategories((prev) => ({
        ...prev,
        [datePickerCategory]: true,
      }));
      setShowDatePicker(false);
      setDatePickerCategory(null);
    }
  };

  const isDateCategoryActive = (categoryLabel, date) => {
    return activeCategory === categoryLabel && activeDate === date;
  };

  const isCategoryActive = (categoryLabel) => {
    if (categoryLabel === "전체 공지") {
      // 전체 공지가 활성화되고, 하위 카테고리가 "현재 공지"이고, 날짜가 선택되지 않은 경우
      return activeCategory === categoryLabel && activeDate === null && activeSubCategory === "현재 공지";
    }
    return activeCategory === categoryLabel && activeDate === null;
  };

  const isSubCategoryActive = (subCategory) => {
    return activeCategory === "전체 공지" && activeSubCategory === subCategory;
  };

  const renderContent = () => {
    const currentCategory = categories.find((c) => c.label === activeCategory);
    if (!currentCategory) {
      return (
        <DashboardContent
          user={user}
          onNavigateToCategory={handleNavigateToCategory}
          onDateSelect={handleDateSelect}
          onSubCategorySelect={handleSubCategorySelect}
          onSelectDocument={handleSelectDocument}
        />
      );
    }

    const handleNavigateToCategory = (categoryLabel) => {
      setActiveCategory(categoryLabel);
      setActiveDate(null);
      // 전체 공지가 아닌 경우 하위 카테고리 초기화
      if (categoryLabel !== "전체 공지") {
        setActiveSubCategory(null);
      } else {
        // 전체 공지인 경우 기본값 "현재 공지"로 설정 및 하위 카테고리 펼치기
        setActiveSubCategory("현재 공지");
        setExpandedCategories((prev) => ({
          ...prev,
          [categoryLabel]: true,
        }));
      }
      if (categories.find((c) => c.label === categoryLabel)?.hasDates) {
        setExpandedCategories((prev) => ({
          ...prev,
          [categoryLabel]: true,
        }));
      }
    };

    const handleDateSelect = (categoryLabel, date) => {
      setActiveCategory(categoryLabel);
      setActiveDate(date);
      setActiveSubCategory(null);
      setExpandedCategories((prev) => ({
        ...prev,
        [categoryLabel]: true,
      }));
    };

    const handleSubCategorySelect = (subCategory) => {
      setActiveCategory("전체 공지");
      setActiveSubCategory(subCategory);
      setActiveDate(null);
    };

    const handleSelectDocument = (target) => {
      setScrollTarget(target);
    };

    const handleConsumeScrollTarget = () => {
      setScrollTarget(null);
    };

    const props = {
      category: activeCategory,
      selectedDate: activeDate,
      selectedSubCategory: activeSubCategory,
      user: user,
      profile: profile,
      onNavigateToCategory: handleNavigateToCategory,
      onDateSelect: handleDateSelect,
      onSubCategorySelect: handleSubCategorySelect,
      scrollTarget: scrollTarget,
      onConsumeScrollTarget: handleConsumeScrollTarget,
      globalRefreshKey: globalRefreshKey,
      onRefresh: () => setGlobalRefreshKey((prev) => prev + 1),
    };

    switch (activeCategory) {
      case "대시보드":
        return (
          <DashboardContent
            user={user}
            onNavigateToCategory={handleNavigateToCategory}
            onDateSelect={handleDateSelect}
            onSubCategorySelect={handleSubCategorySelect}
            onSelectDocument={handleSelectDocument}
          />
        );
      case "근무 현황":
        return <WorkStatusPage user={user} profile={profile} />;
      case "전체 공지":
        return <NoticeContent {...props} />;
      case "업무 지시":
        return <InstructionContent {...props} />;
      case "일일 인수인계":
        return <HandoverContent {...props} />;
      case "업무 완료사항":
        return <ProgressContent {...props} />;
      case "업무 리스트":
        return (
          <ChecklistContent
            {...props}
            onOpenChecklistSettings={() => setShowChecklistSettingsPage(true)}
          />
        );
      case "고장&수리":
        return <RepairContent {...props} />;
      default:
        return (
          <DashboardContent
            user={user}
            onNavigateToCategory={handleNavigateToCategory}
            onDateSelect={handleDateSelect}
            onSubCategorySelect={handleSubCategorySelect}
            onSelectDocument={handleSelectDocument}
          />
        );
    }
  };

  // Firestore에서 프로필 가져오기 (실시간 업데이트)
  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }

    const profileRef = doc(db, "users", user.uid);
    const unsubscribe = onSnapshot(
      profileRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const profileData = snapshot.data();
          setProfile(profileData);
          // 디버깅: role 값 확인
          console.log("Profile loaded:", profileData);
          console.log("Role:", profileData?.role);
        } else {
          console.warn("User profile not found in Firestore");
          setProfile(null);
        }
      },
      (error) => {
        console.error("Error fetching profile:", error);
        setProfile(null);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // customer 타입 사용자 목록 가져오기
  useEffect(() => {
    if (!showHandoverModal) return;

    const fetchCustomerUsers = async () => {
      try {
        console.log("Fetching customer users...");
        const q = query(
          collection(db, "users"),
          where("user_type", "==", "customer")
        );
        const snapshot = await getDocs(q);
        console.log("Snapshot size:", snapshot.size);
        const users = [];
        snapshot.forEach((docSnapshot) => {
          const data = docSnapshot.data();
          console.log("User data:", docSnapshot.id, data);
          // 현재 로그인한 사용자는 제외
          if (docSnapshot.id === user?.uid) {
            return;
          }
          users.push({
            id: docSnapshot.id,
            email: data.email,
            name: data.name || "사용자",
            role: data.role || "직책",
            tagColor: data.tagColor || "gray",
          });
        });
        console.log("Customer users found:", users.length);
        setCustomerUsers(users);
        if (users.length === 0) {
          setHandoverError("등록된 customer 타입 사용자가 없습니다.");
        } else {
          setHandoverError("");
        }
      } catch (error) {
        console.error("Error fetching customer users:", error);
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);
        if (error.code === "failed-precondition") {
          setHandoverError("Firestore 인덱스가 필요합니다. Firebase 콘솔에서 인덱스를 생성해주세요.");
        } else {
          setHandoverError(`사용자 목록을 불러오는데 실패했습니다: ${error.message}`);
        }
      }
    };

    fetchCustomerUsers();
  }, [showHandoverModal, user]);

  // 프로필 메뉴 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
    };

    if (showProfileMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showProfileMenu]);

  // 인수인계: 사용자 전환
  const handleHandover = async (targetUser) => {
    setSelectedUser(targetUser);
    setPasswordInput("");
    setHandoverError("");
  };

  // 인수인계: 비밀번호 확인 및 사용자 전환
  const handleConfirmHandover = async () => {
    if (!selectedUser || !passwordInput) {
      setHandoverError("비밀번호를 입력하세요.");
      return;
    }

    try {
      setHandoverError("");
      await signInWithEmailAndPassword(auth, selectedUser.email, passwordInput);
      // 로그인 성공 시 자동으로 사용자 전환됨 (onAuthStateChanged에서 처리)
      setShowHandoverModal(false);
      setSelectedUser(null);
      setPasswordInput("");
    } catch (error) {
      console.error("Handover error:", error);
      if (error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
        setHandoverError("비밀번호가 올바르지 않습니다.");
      } else if (error.code === "auth/user-not-found") {
        setHandoverError("사용자를 찾을 수 없습니다.");
      } else {
        setHandoverError("인수인계에 실패했습니다.");
      }
    }
  };

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <h1>selfmadegym2</h1>
        <div className="dashboard-category">
          {activeDate
            ? `${activeCategory} > ${getYearFromDate(activeDate)} > ${formatDate(activeDate)}`
            : activeSubCategory
            ? `${activeCategory} > ${activeSubCategory}`
            : activeCategory}
        </div>
        <div className="dashboard-search">
          <input
            type="text"
            placeholder="검색어를 입력하세요"
            className="dashboard-search-input"
            value={searchKeyword}
            onChange={(event) => setSearchKeyword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                openSearchPage();
              }
            }}
          />
          <button
            type="button"
            className="dashboard-search-button"
            aria-label="검색"
            onClick={openSearchPage}
          >
            🔍
          </button>
        </div>
        <div className="dashboard-actions">
          {user ? (
            <>
              {profile?.user_type === "admin" && (
                <button
                  type="button"
                  className="dashboard-admin-bell-button"
                  aria-label="관리자 알림"
                  onClick={() => {
                    setShowTrainerToRecruitPage(true);
                    setShowMyPostsPage(false);
                    setShowProfilePage(false);
                    setShowSettingsPage(false);
                    setShowChecklistSettingsPage(false);
                    setShowEmployeeStatsPage(false);
                    setShowSearchPage(false);
                    setHasNewApplicants(false);
                  }}
                >
                  🔔
                  {hasNewApplicants && <span className="dashboard-admin-bell-badge" />}
                </button>
              )}
              <button
                type="button"
                className="dashboard-my-posts-button"
                onClick={() => {
                  setShowMyPostsPage(true);
                  setShowProfilePage(false);
                  setShowSettingsPage(false);
                  setShowChecklistSettingsPage(false);
                  setShowEmployeeStatsPage(false);
                }}
              >
                내 글 보기
              </button>
              <button
                className="profile-button"
                type="button"
                ref={updatesButtonRef}
                onClick={() => setShowUpdatesModal(true)}
              >
                업데이트 내역
              </button>
              <div className="profile-menu-wrapper" ref={profileMenuRef}>
                <button
                  className="profile-button"
                  type="button"
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                >
                  <span
                    className="profile-dot"
                    style={{
                      background: tagColors[profile?.tagColor] ?? "#d9c5a5",
                    }}
                    aria-hidden="true"
                  />
                  <span>
                    {profile?.name ?? user?.displayName ?? "사용자"} -{" "}
                    {profile?.role || "직책"}
                  </span>
                </button>
                {showProfileMenu && (
                  <div className="profile-menu">
                    <button
                      type="button"
                      className="profile-menu-item"
                      onClick={() => {
                        setShowProfileMenu(false);
                        setShowProfilePage(true);
                      }}
                    >
                      프로필
                    </button>
                    <button
                      type="button"
                      className="profile-menu-item"
                      onClick={() => {
                        setShowProfileMenu(false);
                        setShowHandoverModal(true);
                        setSelectedUser(null);
                        setPasswordInput("");
                        setHandoverError("");
                      }}
                    >
                      인수인계
                    </button>
                    {profile?.user_type === "admin" && (
                      <button
                        type="button"
                        className="profile-menu-item"
                        onClick={() => {
                          setShowProfileMenu(false);
                          setShowEmployeeStatsPage(true);
                          setShowProfilePage(false);
                          setShowSettingsPage(false);
                          setShowChecklistSettingsPage(false);
                        }}
                      >
                        직원 통계
                      </button>
                    )}
                    {profile?.user_type === "admin" && (
                      <button
                        type="button"
                        className="profile-menu-item"
                        onClick={() => {
                          setShowProfileMenu(false);
                          setShowSettingsPage(true);
                          setShowEmployeeStatsPage(false);
                        }}
                      >
                        환경설정
                      </button>
                    )}
                  </div>
                )}
              </div>
              <button
                className="logout-button"
                type="button"
                onClick={async () => {
                  try {
                    await onBeforeLogout?.();
                    await signOut(auth);
                  } catch (error) {
                    console.error(error);
                  }
                }}
              >
                퇴근하기
              </button>
            </>
          ) : (
            <>
              <button
                className="login-button"
                type="button"
                onClick={() => onShowAuthPage?.("login")}
              >
                출근하기
              </button>
              <button
                className="signup-button"
                type="button"
                onClick={() => onShowAuthPage?.("signup")}
              >
                회원가입
              </button>
            </>
          )}
        </div>
      </header>
      <div className="dashboard-body">
        <aside className="dashboard-sidebar">
          <nav>
            {categories.map((category) => {
              const isExpanded = expandedCategories[category.label];
              const dates = dateLists[category.label] || [];
              const hasDates = category.hasDates && dates.length > 0;
              const isNotice = category.label === "전체 공지";

              return (
                <div key={category.label} className="nav-category-group">
                  <div
                    className={[
                      "nav-item",
                      isCategoryActive(category.label) ? "active" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <button
                      type="button"
                      className="nav-item-label"
                      onClick={() => handleCategoryClick(category.label)}
                    >
                      <span>{category.label}</span>
                      {unreadCategoryFlags[category.label] && (
                        <span className="nav-item-new">new!</span>
                      )}
                    </button>
                    <div className="nav-item-right">
                      {(hasDates || isNotice) && (
                        <button
                          type="button"
                          className="nav-toggle-button"
                          onClick={(e) => handleToggleCategory(category.label, e)}
                          aria-label={isExpanded ? "접기" : "펼치기"}
                        >
                          <span className="nav-expand-icon">
                            {isExpanded ? "▼" : "▶"}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                  {isNotice && isExpanded && (
                    <div className="nav-sub-items">
                      {NOTICE_SUB_CATEGORIES.map((subCat) => (
                        <button
                          key={subCat}
                          className={[
                            "nav-sub-item",
                            isSubCategoryActive(subCat) ? "active" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          type="button"
                          onClick={() => handleSubCategoryClick(subCat)}
                        >
                          {subCat}
                        </button>
                      ))}
                    </div>
                  )}
                  {hasDates && isExpanded && (() => {
                    const datesByYear = groupDatesByYear(dates);
                    const years = Object.keys(datesByYear);
                    
                    return (
                      <div className="nav-sub-items">
                        {years.map((year) => {
                          const yearDates = datesByYear[year];
                          const yearKey = `${category.label}-${year}`;
                          const isYearExpanded = expandedYears[category.label]?.[year] ?? true;
                          const visibleCount = visibleDateCounts[yearKey] || 5;
                          const visibleDates = yearDates.slice(0, visibleCount);
                          
                          return (
                            <div key={year} className="nav-year-group">
                              <button
                                type="button"
                                className="nav-year-item"
                                onClick={(e) => handleYearToggle(category.label, year, e)}
                              >
                                <span className="nav-year-toggle">
                                  {isYearExpanded ? "▼" : "▶"}
                                </span>
                                <span className="nav-year-label">{year}</span>
                              </button>
                              {isYearExpanded && (
                                <div className="nav-dates-in-year">
                                  {visibleDates.map((date) => (
                                    <button
                                      key={date}
                                      className={[
                                        "nav-sub-item",
                                        isDateCategoryActive(category.label, date)
                                          ? "active"
                                          : "",
                                      ]
                                        .filter(Boolean)
                                        .join(" ")}
                                      type="button"
                                      onClick={() => handleDateClick(category.label, date)}
                                    >
                                      {formatDate(date)}
                                    </button>
                                  ))}
                                  {(yearDates.length > visibleCount || visibleCount > 5) && (
                                    <div className="nav-show-buttons">
                                      {yearDates.length > visibleCount && (
                                        <button
                                          type="button"
                                          className="nav-show-more-button"
                                          onClick={() => handleShowMoreDatesInYear(category.label, year)}
                                        >
                                          ▼ 더보기
                                        </button>
                                      )}
                                      {visibleCount > 5 && (
                                        <button
                                          type="button"
                                          className="nav-show-less-button"
                                          onClick={() => handleShowLessDatesInYear(category.label, year)}
                                        >
                                          ▲ 접기
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </nav>
        </aside>
        {showDatePicker && (
          <DatePicker
            selectedDate={null}
            onSelect={handleDatePickerSelect}
            onClose={() => {
              setShowDatePicker(false);
              setDatePickerCategory(null);
            }}
          />
        )}
        <main className="dashboard-main">
          <section className="dashboard-content">
            {showSearchPage ? (
              <SearchPage
                query={submittedSearchKeyword}
                onClose={() => setShowSearchPage(false)}
              />
            ) : showProfilePage ? (
              <ProfilePage
                user={user}
                profile={profile}
                onClose={() => setShowProfilePage(false)}
              />
            ) : showSettingsPage ? (
              <SettingsPage
                user={user}
                profile={profile}
                onClose={() => setShowSettingsPage(false)}
              />
            ) : showChecklistSettingsPage ? (
              <ChecklistSettingsPage
                user={user}
                profile={profile}
                onClose={() => setShowChecklistSettingsPage(false)}
              />
            ) : showEmployeeStatsPage ? (
              <EmployeeStatsPage
                user={user}
                profile={profile}
                onClose={() => setShowEmployeeStatsPage(false)}
              />
            ) : showMyPostsPage ? (
              <MyPostsPage
                user={user}
                profile={profile}
                onClose={() => setShowMyPostsPage(false)}
              />
            ) : showTrainerToRecruitPage ? (
              <TrainerToRecruitPage onClose={() => setShowTrainerToRecruitPage(false)} />
            ) : (
              renderContent()
            )}
          </section>
        </main>
      </div>
      {/* 업데이트 내역 모달 */}
      {showUpdatesModal && (
        <div className="handover-modal-overlay">
          <div
            className={`handover-modal updates-modal${isClosingUpdatesModal ? " is-closing" : ""}`}
            onClick={(e) => e.stopPropagation()}
            ref={updatesModalRef}
            style={{
              "--updates-close-x": `${updatesCloseTransform.x}px`,
              "--updates-close-y": `${updatesCloseTransform.y}px`,
              "--updates-close-scale": updatesCloseTransform.scale,
            }}
          >
            <div className="handover-modal-header">
              <h2>업데이트 내역</h2>
              <div className="updates-modal-actions">
                <button
                  type="button"
                  className="handover-modal-close"
                  onClick={triggerCloseUpdatesModal}
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="handover-modal-content updates-modal-content">
              {updateNotes.map((note) => {
                const isOpen = expandedUpdateVersions.has(note.version);
                return (
                  <section key={note.version} className="updates-note">
                    <div className="updates-note-header">
                      <button
                        type="button"
                        className="updates-note-toggle"
                        onClick={() => {
                          setExpandedUpdateVersions((prev) => {
                            const next = new Set(prev);
                            if (next.has(note.version)) {
                              next.delete(note.version);
                            } else {
                              next.add(note.version);
                            }
                            return next;
                          });
                        }}
                      >
                        <span>{note.version}</span>
                        <span>{isOpen ? "▲" : "▼"}</span>
                      </button>
                    </div>
                    {isOpen && <pre className="updates-note-content">{note.content}</pre>}
                  </section>
                );
              })}
              <section className="updates-note updates-version-info">
                <pre className="updates-note-content">{currentVersionInfo}</pre>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* 인수인계 모달 */}
      {showHandoverModal && (
        <div className="handover-modal-overlay" onClick={() => setShowHandoverModal(false)}>
          <div className="handover-modal" onClick={(e) => e.stopPropagation()}>
            <div className="handover-modal-header">
              <h2>인수인계</h2>
              <button
                type="button"
                className="handover-modal-close"
                onClick={() => {
                  setShowHandoverModal(false);
                  setSelectedUser(null);
                  setPasswordInput("");
                  setHandoverError("");
                }}
              >
                ✕
              </button>
            </div>
            <div className="handover-modal-content">
              {!selectedUser ? (
                <>
                  <p className="handover-instruction">전환할 사용자를 선택하세요</p>
                  {handoverError && (
                    <p className="handover-error" style={{ marginBottom: "16px" }}>
                      {handoverError}
                    </p>
                  )}
                  <div className="customer-users-list">
                    {customerUsers.length === 0 && !handoverError ? (
                      <p className="handover-empty">등록된 사용자가 없습니다.</p>
                    ) : customerUsers.length > 0 ? (
                      customerUsers.map((customerUser) => (
                        <button
                          key={customerUser.id}
                          type="button"
                          className="customer-user-item"
                          onClick={() => handleHandover(customerUser)}
                        >
                          <span
                            className="customer-user-dot"
                            style={{
                              background: tagColors[customerUser.tagColor] ?? "#d9c5a5",
                            }}
                          />
                          <div className="customer-user-info">
                            <span className="customer-user-name">{customerUser.name}</span>
                            <span className="customer-user-role">{customerUser.role}</span>
                          </div>
                        </button>
                      ))
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  <div className="selected-user-info">
                    <span
                      className="selected-user-dot"
                      style={{
                        background: tagColors[selectedUser.tagColor] ?? "#d9c5a5",
                      }}
                    />
                    <div>
                      <span className="selected-user-name">{selectedUser.name}</span>
                      <span className="selected-user-role">{selectedUser.role}</span>
                    </div>
                  </div>
                  <div className="handover-password-form">
                    <label>
                      비밀번호
                      <input
                        type="password"
                        placeholder="비밀번호를 입력하세요"
                        value={passwordInput}
                        onChange={(e) => {
                          setPasswordInput(e.target.value);
                          setHandoverError("");
                        }}
                        onKeyPress={(e) => {
                          if (e.key === "Enter") {
                            handleConfirmHandover();
                          }
                        }}
                        autoFocus
                      />
                    </label>
                    {handoverError && (
                      <p className="handover-error">{handoverError}</p>
                    )}
                    <div className="handover-actions">
                      <button
                        type="button"
                        className="handover-cancel-button"
                        onClick={() => {
                          setSelectedUser(null);
                          setPasswordInput("");
                          setHandoverError("");
                        }}
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        className="handover-confirm-button"
                        onClick={handleConfirmHandover}
                      >
                        확인
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DashboardPage;
