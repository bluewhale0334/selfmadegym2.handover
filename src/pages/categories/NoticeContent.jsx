import SharedCategoryContent from "./SharedCategoryContent";

function NoticeContent({ category, selectedDate, onNavigateToCategory, onDateSelect, user, profile, globalRefreshKey, onRefresh }) {
  return (
    <SharedCategoryContent
      category={category}
      selectedDate={selectedDate}
      onNavigateToCategory={onNavigateToCategory}
      onDateSelect={onDateSelect}
      user={user}
      profile={profile}
      globalRefreshKey={globalRefreshKey}
      onRefresh={onRefresh}
    />
  );
}

export default NoticeContent;
