// Must be imported before PDFParse itself — sets up pdf-parse's worker in a
// way that resolves correctly inside Next.js's server runtime (see
// next.config.ts's serverExternalPackages for the other half of this fix).
import "pdf-parse/worker";
import { PDFParse } from "pdf-parse";

/**
 * Extract plain text from a PDF buffer. Used instead of sending the PDF's
 * raw bytes to the model, because native PDF understanding isn't a
 * guaranteed OpenRouter/OpenAI-compatible capability across arbitrary
 * models — text extraction works regardless of which model OPENROUTER_MODEL
 * points at. Trade-off: layout/images inside the PDF aren't understood,
 * only its text content.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return result.text;
}
