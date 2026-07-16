import { addDocumentCommentAction } from "@/app/actions";
import { SubmitButton } from "@/app/components/SubmitButton";
import { formatTimestamp } from "@/lib/format";
import type { DocumentComment } from "@/lib/types";

/**
 * One comment thread per document — not general chat. Only ever rendered for
 * shared documents, to EM or the client project lead; the sponsor tier never
 * sees a document to comment on in the first place.
 */
export function DocumentComments({
  documentId,
  engagementId,
  comments,
}: {
  documentId: string;
  engagementId: string;
  comments: DocumentComment[];
}) {
  return (
    <div className="comments">
      {comments.map((c) => (
        <div className="comment-row" key={c.id}>
          <span className="comment-meta">
            {c.author_name} · {formatTimestamp(c.created_at)}
          </span>
          <span className="comment-body">{c.body}</span>
        </div>
      ))}

      <form action={addDocumentCommentAction} className="comment-form">
        <input type="hidden" name="documentId" value={documentId} />
        <input type="hidden" name="engagementId" value={engagementId} />
        <input
          type="text"
          name="authorName"
          placeholder="Your name"
          aria-label="Your name"
          className="comment-name"
        />
        <input
          type="text"
          name="body"
          placeholder="Add a comment"
          aria-label="Comment"
          required
          className="comment-body-input"
        />
        <SubmitButton className="btn" pendingText="Posting…">
          Comment
        </SubmitButton>
      </form>
    </div>
  );
}
