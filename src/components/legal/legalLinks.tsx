import { Link } from 'react-router-dom';

export const LEGAL_LINK_CLASS = 'font-semibold text-[#1D70D8] underline-offset-4 hover:underline';

export function legalTransComponents(className = LEGAL_LINK_CLASS) {
  return {
    privacy: <Link to="/confidentialite" className={className} />,
    notice: <Link to="/mentions-legales" className={className} />,
    contact: <Link to="/contact" className={className} />,
  };
}
