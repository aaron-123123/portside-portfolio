import { uploadDocumentAction } from "@/app/actions";

/** EM-only upload form. Chooses which space the file lands in. */
export function UploadPanel({ engagementId }: { engagementId: string }) {
  return (
    <form action={uploadDocumentAction} className="panel">
      <p className="panel-title">Upload a document</p>
      <div className="field-row">
        <div className="field">
          <label htmlFor="file">File</label>
          <input id="file" type="file" name="file" required />
        </div>
        <div className="field">
          <label htmlFor="visibility">Space</label>
          <select id="visibility" name="visibility" defaultValue="private">
            <option value="private">Private (internal)</option>
            <option value="shared">Shared (client)</option>
          </select>
        </div>
        <input type="hidden" name="engagementId" value={engagementId} />
        <button type="submit" className="btn">
          Upload
        </button>
      </div>
    </form>
  );
}
