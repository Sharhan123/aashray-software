import aashrayLogo from '../assets/aashray-original.png';

export function BrandMark({ light = false }: { light?: boolean }) {
  return <img className={`brand-mark ${light ? 'brand-mark-light' : ''}`} src={aashrayLogo} alt="Aashray Group" />;
}

export function AashrayLogo({ className = '' }: { className?: string }) {
  return <img className={`aashray-logo ${className}`.trim()} src={aashrayLogo} alt="Aashray Group" />;
}
