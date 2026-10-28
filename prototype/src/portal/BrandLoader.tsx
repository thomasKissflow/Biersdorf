// Full-screen loading state with the Beiersdorf logo: shown while connecting to Kissflow and while the supplier's
// questionnaires load. Matches the static loader in portal.html, so the hand-over from HTML to React doesn't jump.
import { Logo } from "@/layout/Shells";

export function BrandLoader({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="brand-loader">
      <Logo className="brand-loader-logo" />
      <div className="brand-loader-track" aria-hidden>
        <div className="brand-loader-bar" />
      </div>
      <p className="brand-loader-label">{label}</p>
    </div>
  );
}
