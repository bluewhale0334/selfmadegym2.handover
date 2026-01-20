import ChecklistInContent from "./ChecklistInContent";

function ChecklistContent({ selectedDate, onOpenChecklistSettings, user, profile }) {
  return (
    <ChecklistInContent
      selectedDate={selectedDate}
      onOpenChecklistSettings={onOpenChecklistSettings}
      user={user}
      profile={profile}
    />
  );
}

export default ChecklistContent;
