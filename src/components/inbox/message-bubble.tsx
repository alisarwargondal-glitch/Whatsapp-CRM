import { cn } from "@/lib/utils";
import type { Message, MessageReaction } from "@/types";
import { format } from "date-fns";
import { Check, CheckCheck, Clock } from "lucide-react";

interface ReplyQuote {
  authorLabel: string;
  preview: string;
}

interface MessageBubbleProps {
  message: Message;
  reply?: ReplyQuote | null;
  reactions?: MessageReaction[];
  currentUserId?: string;
  onToggleReaction?: (emoji: string) => void;
}

const MESSAGE_STATUS_ICONS = {
  sending: Clock,
  sent: Check,
  delivered: CheckCheck,
  read: CheckCheck,
  failed: () => <span className="text-[10px] font-bold">!</span>,
};

// We built the ReactionPill directly into this file so Vercel doesn't have to look for it!
function ReactionPill({
  emoji,
  count,
  hasReacted,
  onClick,
}: {
  emoji: string;
  count: number;
  hasReacted?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800/90 px-1.5 py-0.5 text-[10px] shadow-sm transition-colors",
        hasReacted ? "border-primary text-primary" : "text-slate-300 hover:bg-slate-700",
        !onClick && "cursor-default"
      )}
    >
      <span>{emoji}</span>
      <span className="font-medium">{count}</span>
    </button>
  );
}

export function MessageBubble({
  message,
  reply,
  reactions,
  currentUserId,
  onToggleReaction,
}: MessageBubbleProps) {
  const isAgentMsg = message.sender_type === "agent" || message.sender_type === "bot";

  const StatusIcon = isAgentMsg ? MESSAGE_STATUS_ICONS[message.status] : null;

  // Render the text content based on the message type.
  let content = message.content_text || "Unsupported message type";
  if (message.content_type === "image" || message.content_type === "document") {
    content = `[${message.content_type}] ${message.content_text || ""}`;
  }

  // Aggregate reactions by emoji
  const groupedReactions = (reactions ?? []).reduce(
    (acc, r) => {
      acc[r.emoji] = (acc[r.emoji] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  // Check if current user has reacted
  const ownReaction = reactions?.find(
    (r) => r.actor_type === "agent" && r.actor_id === currentUserId,
  );

  return (
    <div
      className={cn(
        "flex w-full group",
        isAgentMsg ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "relative max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm sm:max-w-[75%]",
          isAgentMsg
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-slate-800 text-slate-100 rounded-bl-sm"
        )}
      >
        {/* Reply Quote Block */}
        {reply && (
          <div
            className={cn(
              "mb-2 mt-0.5 rounded-md border-l-2 p-2 text-xs",
              isAgentMsg
                ? "border-primary-foreground/50 bg-primary-foreground/10 text-primary-foreground"
                : "border-primary bg-slate-900/50 text-slate-300"
            )}
          >
            <div className="font-semibold">{reply.authorLabel}</div>
            <div className="mt-0.5 truncate opacity-90">{reply.preview}</div>
          </div>
        )}

        {/* Message Content */}
        <p className="whitespace-pre-wrap break-words">{content}</p>

        {/* Timestamp & Status */}
        <div
          className={cn(
            "mt-1 flex items-center justify-end gap-1 text-[10px]",
            isAgentMsg ? "text-primary-foreground/70" : "text-slate-400"
          )}
        >
          <span>{format(new Date(message.created_at), "HH:mm")}</span>
          {StatusIcon && (
            <StatusIcon
              className={cn(
                "h-3 w-3",
                message.status === "read" && "text-blue-400",
                message.status === "failed" && "text-red-400"
              )}
            />
          )}
        </div>

        {/* Reactions */}
        {Object.keys(groupedReactions).length > 0 && (
          <div
            className={cn(
              "absolute -bottom-3 flex flex-wrap gap-1",
              isAgentMsg ? "right-2 flex-row-reverse" : "left-2"
            )}
          >
            {Object.entries(groupedReactions).map(([emoji, count]) => (
              <ReactionPill
                key={emoji}
                emoji={emoji}
                count={count}
                hasReacted={ownReaction?.emoji === emoji}
                onClick={
                  onToggleReaction
                    ? () => onToggleReaction(emoji)
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}