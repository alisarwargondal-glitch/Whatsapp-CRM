function ConversationItem({
  conversation,
  isActive,
  onSelect,
}: ConversationItemProps) {
  const contact = conversation.contact;
  const displayName = contact?.name || contact?.phone || "Unknown";
  const initials = displayName.charAt(0).toUpperCase();

  const handleClick = useCallback(() => {
    onSelect(conversation);
  }, [onSelect, conversation]);

  const timeAgo = conversation.last_message_at
    ? formatDistanceToNow(new Date(conversation.last_message_at), {
      addSuffix: false,
    })
    : "";

  // This creates the soft background and text colors for your new badges
  const badgeStyles = {
    open: "bg-primary/20 text-primary border-primary/30",
    pending: "bg-amber-500/20 text-amber-500 border-amber-500/30",
    closed: "bg-slate-800 text-slate-400 border-slate-700",
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-slate-800/50",
        isActive && "border-l-2 border-primary bg-slate-800/70"
      )}
    >
      {/* Avatar */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-700 text-sm font-medium text-white">
        {contact?.avatar_url ? (
          <img
            src={contact.avatar_url}
            alt={displayName}
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          initials
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-white">
            {displayName}
          </span>
          <span className="shrink-0 text-[10px] text-slate-500">{timeAgo}</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="truncate text-xs text-slate-400">
            {conversation.last_message_text || "No messages yet"}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            {/* The blue unread message counter badge */}
            {conversation.unread_count > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {conversation.unread_count}
              </span>
            )}

            {/* The new text status badge */}
            <span
              className={cn(
                "rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                badgeStyles[conversation.status as keyof typeof badgeStyles] || badgeStyles.open
              )}
            >
              {conversation.status}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}