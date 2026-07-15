import {
  approveDocumentAction,
  requestApprovalAction,
  setVisibilityAction,
} from "@/app/actions";
import { formatTimestamp } from "@/lib/format";
import type { DocumentRecord, Role } from "@/lib/types";

export function DocumentRow({
  doc,
  role,
  engagementId,
}: {
  doc: DocumentRecord;
  role: Role;
  engagementId: string;
}) {
  const approval = doc.approvals?.[0];
  const uploader = doc.uploaded_by_role === "em" ? "Team" : "Client";

  return (
    <div className="doc-row">
      <div className="doc-main">
        <a className="doc-name" href={`/api/download/${doc.id}`}>
          {doc.name}
        </a>
        <div className="doc-meta">
          Uploaded {formatTimestamp(doc.created_at)} · {uploader}
          {approval?.status === "approved" && approval.approved_at && (
            <>
              {" "}
              · Approved by {approval.approved_by} on{" "}
              {formatTimestamp(approval.approved_at)}
            </>
          )}
        </div>
      </div>

      <span className={`chip chip--${doc.visibility}`}>{doc.visibility}</span>

      {approval?.status === "pending" && (
        <span className="chip chip--pending">Pending sign-off</span>
      )}
      {approval?.status === "approved" && (
        <span className="chip chip--approved">Approved</span>
      )}

      <div className="doc-actions">
        {/* EM: move a document between spaces */}
        {role === "em" && (
          <form action={setVisibilityAction}>
            <input type="hidden" name="documentId" value={doc.id} />
            <input type="hidden" name="engagementId" value={engagementId} />
            <input
              type="hidden"
              name="visibility"
              value={doc.visibility === "private" ? "shared" : "private"}
            />
            <button type="submit" className="btn">
              Move to {doc.visibility === "private" ? "shared" : "private"}
            </button>
          </form>
        )}

        {/* EM: request client sign-off on a shared document */}
        {role === "em" && doc.visibility === "shared" && !approval && (
          <form action={requestApprovalAction}>
            <input type="hidden" name="documentId" value={doc.id} />
            <input type="hidden" name="engagementId" value={engagementId} />
            <button type="submit" className="btn">
              Request approval
            </button>
          </form>
        )}

        {/* Project lead: approve a pending request (a genuine decision point → coral) */}
        {role === "client_contact" && approval?.status === "pending" && (
          <form action={approveDocumentAction} className="inline-form">
            <input type="hidden" name="approvalId" value={approval.id} />
            <input type="hidden" name="engagementId" value={engagementId} />
            <input
              type="text"
              name="approverName"
              placeholder="Your name"
              aria-label="Your name"
            />
            <button type="submit" className="btn btn--primary">
              Approve
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
