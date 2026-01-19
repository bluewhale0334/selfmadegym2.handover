import "./DashboardInContent.css";

function DashboardInContent() {
  return (
    <section className="dashboard-overview">
      <div className="dashboard-split">
        <div className="dashboard-left">
          <div className="dashboard-left-box">
            <h3 className="dashboard-box-title">왼쪽 박스</h3>
            <p className="dashboard-box-body">내용을 추가할 예정</p>
            <p className="dashboard-box-body">Notice : 대시보드 개발중...
<br></br>현재 사용가능한 기능<br></br>
1. 전체 공지<br></br>
2. 업무 지시<br></br>
3. 일일 인수인계<br></br>
4. 업무 진행사항<br></br></p>
          </div>
        </div>
        <div className="dashboard-right">
          <div className="dashboard-right-top">
            <h3 className="dashboard-box-title">오른쪽 상단</h3>
            <p className="dashboard-box-body">높이 300px</p>
          </div>
          <div className="dashboard-right-bottom">
            <div className="dashboard-right-bottom-box">
              <h3 className="dashboard-box-title">하단 좌측</h3>
              <p className="dashboard-box-body">내용을 추가할 예정</p>
            </div>
            <div className="dashboard-right-bottom-box">
              <h3 className="dashboard-box-title">하단 우측</h3>
              <p className="dashboard-box-body">내용을 추가할 예정</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default DashboardInContent;
