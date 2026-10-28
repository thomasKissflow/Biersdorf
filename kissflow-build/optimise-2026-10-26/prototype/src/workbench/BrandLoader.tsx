// Full-screen loading state with the Beiersdorf logo, matching the static loader in workbench.html so the hand-over
// from HTML to React doesn't jump. The logo is imported as an asset (WB-2: never from @/layout).
import logo from "@/assets/beiersdorf-logo.webp";

export function BrandLoader({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="brand-loader" data-testid="wb-loader">
      <img src={logo} alt="Beiersdorf" className="brand-loader-logo logo-adaptive" draggable={false} />
      <div className="brand-loader-track" aria-hidden>
        <div className="brand-loader-bar" />
      </div>
      <p className="brand-loader-label">{label}</p>
    </div>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return <img src={logo} alt="Beiersdorf" className={`logo-adaptive h-[22px] w-auto select-none ${className}`} draggable={false} />;
}
