import SharedCategoryContent from "./SharedCategoryContent";

function ChecklistContent({ category, selectedDate, onNavigateToCategory, onDateSelect, user, profile, globalRefreshKey, onRefresh }) {
  return (
    <SharedCategoryContent
      showDocuments={false}
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

export default ChecklistContent;
