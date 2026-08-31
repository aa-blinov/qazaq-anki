interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

/**
 * Brand mark for Qazaq. Renders the generated icon (parchment background,
 * terracotta Kazakh "Қ" with a flowing ornamental tail) as a crisp
 * bitmap. We use the PNG instead of inline SVG so the design stays in
 * sync with the asset on disk and so dark/light tints are baked in.
 *
 * Size map:
 *   sm — 26px — dense nav, inline with body text
 *   md — 30px — topbar brand
 *   lg — 44px — auth pages (login, register) hero mark
 *   xl — 64px — landing hero
 */
export function Logo({ size = 'md' }: LogoProps) {
  const dim = size === 'sm' ? 26 : size === 'lg' ? 44 : size === 'xl' ? 64 : 30;
  return (
    <img
      src="/favicon.png"
      alt="Qazaq"
      width={dim}
      height={dim}
      draggable={false}
      style={{
        display: 'block',
        flexShrink: 0,
        borderRadius: 8,
      }}
    />
  );
}
