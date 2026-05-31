import { useKhataStore } from "../store/useKhataStore";

interface LogoProps {
  className?: string;
  size?: number;
}

/**
 * KhataFlow Logo Component
 * Renders high-definition PNG files directly as requested, switching dynamically
 * between logo_dark.png (for Dark Mode) and logo_light.png (for Light Mode).
 */
export default function Logo({ className = "", size = 32 }: LogoProps) {
  const { theme } = useKhataStore();
  
  // Dynamic asset resolution based on active theme
  const logoSrc = theme === "dark" ? "/logo_dark.png" : "/logo_light.png";

  return (
    <img
      src={logoSrc}
      alt="KhataFlow"
      width={size}
      height={size}
      className={`object-contain select-none shrink-0 transition-opacity duration-300 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
