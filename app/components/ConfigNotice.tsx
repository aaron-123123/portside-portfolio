import { missingEnv } from "@/lib/supabase";

/**
 * Shown when the Supabase environment variables are not set yet, so a first-run
 * `npm run dev` gives a clear instruction instead of a stack trace.
 */
export function ConfigNotice() {
  const missing = missingEnv();
  return (
    <div className="config-error">
      <p className="eyebrow">Pit Wall / setup needed</p>
      <p>
        Supabase is not connected yet. Copy <code>.env.local.example</code> to{" "}
        <code>.env.local</code> and fill in your project values, then restart the
        dev server.
      </p>
      <p>Missing:</p>
      <ul>
        {missing.map((key) => (
          <li key={key}>
            <code>{key}</code>
          </li>
        ))}
      </ul>
      <p>
        Full step-by-step instructions are in <code>README.md</code> and{" "}
        <code>DEPLOY.md</code>.
      </p>
    </div>
  );
}
