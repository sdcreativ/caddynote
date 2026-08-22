import { useTranslation } from 'react-i18next';

export function ParentGuideToc({ onClose }: { onClose?: () => void }) {
    const { t } = useTranslation('guides');
    const handleLinkClick = () => {
        if (onClose) onClose();
    };

    return (
        <nav className="space-y-2">
            <ul className="list-none space-y-2 !pl-0">
                <li><a href="#premiers-pas-par" onClick={handleLinkClick} className="text-sm font-medium text-slate-600 hover:text-[#05335C] hover:underline">{t('parent.toc.firstSteps')}</a></li>
                <li><a href="#mes-enfants" onClick={handleLinkClick} className="text-sm font-medium text-slate-600 hover:text-[#05335C] hover:underline">{t('parent.toc.children')}</a></li>
                <li><a href="#absences-par" onClick={handleLinkClick} className="text-sm font-medium text-slate-600 hover:text-[#05335C] hover:underline">{t('parent.toc.absences')}</a></li>
                <li><a href="#notes-par" onClick={handleLinkClick} className="text-sm font-medium text-slate-600 hover:text-[#05335C] hover:underline">{t('parent.toc.grades')}</a></li>
                <li><a href="#finance-par" onClick={handleLinkClick} className="text-sm font-medium text-slate-600 hover:text-[#05335C] hover:underline">{t('parent.toc.finance')}</a></li>
                <li><a href="#aide-par" onClick={handleLinkClick} className="text-sm font-medium text-slate-600 hover:text-[#05335C] hover:underline">{t('parent.toc.help')}</a></li>
            </ul>
        </nav>
    );
}
