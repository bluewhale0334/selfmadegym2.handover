# 브라우저 캐시/로컬 스토리지 클리어 방법

## 방법 1: 브라우저 개발자 도구 콘솔 사용 (가장 빠름)

1. 브라우저에서 F12 또는 개발자 도구 열기
2. Console 탭으로 이동
3. 다음 코드를 입력하고 Enter:

```javascript
// Firebase 인증 정보 제거
localStorage.clear();
sessionStorage.clear();
// 또는 Firebase 관련 항목만 제거
Object.keys(localStorage).forEach(key => {
  if (key.startsWith('firebase:authUser:')) {
    localStorage.removeItem(key);
  }
});
location.reload();
```

## 방법 2: Application/Storage 탭에서 수동 삭제

1. 브라우저에서 F12 또는 개발자 도구 열기
2. **Application** 탭 (Chrome) 또는 **Storage** 탭 (Firefox)으로 이동
3. 왼쪽 사이드바에서 **Local Storage** 클릭
4. 사이트 URL 클릭
5. `firebase:authUser:`로 시작하는 모든 항목 찾아서 삭제
6. 페이지 새로고침 (F5)

## 방법 3: 브라우저 설정에서 전체 캐시 삭제

### Chrome:
1. 설정 (Settings) > 개인정보 및 보안 > 인터넷 사용 기록 삭제
2. "쿠키 및 기타 사이트 데이터" 및 "캐시된 이미지 및 파일" 선택
3. 삭제

### Firefox:
1. 설정 > 개인정보 및 보안
2. 쿠키 및 사이트 데이터 > 데이터 삭제
3. 캐시된 웹 콘텐츠 선택 후 삭제

## 방법 4: 시크릿/프라이빗 모드 사용

브라우저의 시크릿 모드(Chrome) 또는 프라이빗 모드(Firefox)를 사용하여 새로 접속

## 방법 5: 개발자 도구에서 직접 로그아웃 (코드 실행)

콘솔에서 Firebase 인스턴스를 직접 사용하여 로그아웃:

```javascript
// 먼저 auth 인스턴스에 접근 (앱이 실행 중일 때)
// window.firebase 또는 전역 변수로 접근 가능한 경우
import { auth, signOut } from 'firebase/auth';
signOut(auth);
```

또는 간단하게:

```javascript
// localStorage 클리어 후 새로고침
localStorage.clear();
location.reload();
```
