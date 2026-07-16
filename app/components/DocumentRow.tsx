import {
  approveDocumentAction,
  requestApprovalAction,
  setVisibilityAction,
  summarizeDocumentAction,
} from "@/app/actions";
import { SubmitButton } from "@/app/components/SubmitButton";
import { DocumentComments } from "@/app/components/DocumentComments";
import { getDocumentVersions } from "@/lib/data";
import { formatTimestamp } from "@/lib/format";
import { isAiConfigured } from "@/lib/ai";
import type { DocumentRecord, Role } from "@/lib/types";

export async function DocumentRow({
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
  const priorVersions =
    doc.version > 1 ? await getDocumentVersions(doc.family_id, doc.version) : [];

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
        {priorVersions.length > 0 && (
          <div className="doc-versions">
            Version {doc.version} of {doc.version} — earlier:{" "}
            {priorVersions.map((v, i) => (
              <span key={v.id}>
                {i > 0 && ", "}
                <a href={`/api/download/${v.id}`}>v{v.version}</a>{" "}
                ({formatTimestamp(v.created_at)})
              </span>
            ))}
          </div>
        )}
      </div>

      {doc.version > 1 && <span className="chip chip--version">v{doc.version}</span>}
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
            <SubmitButton className="btn" pendingText="Moving…">
              Move to {doc.visibility === "private" ? "shared" : "private"}
            </SubmitButton>
          </form>
        )}

        {/* EM: request client sign-off on a shared document */}
        {role === "em" && doc.visibility === "shared" && !approval && (
          <form action={requestApprovalAction}>
            <input type="hidden" name="documentId" value={doc.id} />
            <input type="hidden" name="engagementId" value={engagementId} />
            <SubmitButton className="btn" pendingText="Requesting…">
              Request approval
            </SubmitButton>
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
            <SubmitButton className="btn btn--primary" pendingText="Approving…">
              Approve
            </SubmitButton>
          </form>
        )}

        {/* Any role that can already see this row: summarize it with AI. */}
        {isAiConfigured() && (
          <form action={summarizeDocumentAction} className="inline-form">
            <input type="hidden" name="documentId" value={doc.id} />
            <input type="hidden" name="engagementId" value={engagementId} />
            <SubmitButton className="btn" pendingText="Summarizing…">
              {doc.ai_summary ? "Re-summarize" : "Summarize"}
            </SubmitButton>
          </form>
        )}
      </div>

      {doc.ai_summary && (
        <div className="qa-list" style={{ marginTop: 10 }}>
          <div className="qa-item">
            <p className="qa-question">AI summary</p>
            <p className="qa-answer">{doc.ai_summary}</p>
          </div>
        </div>
      )}

      {doc.visibility === "shared" &&
        (role === "em" || role === "client_contact") && (
          <DocumentComments
            documentId={doc.id}
            engagementId={engagementId}
            comments={doc.comments ?? []}
          />
        )}
    </div>
  );
}
