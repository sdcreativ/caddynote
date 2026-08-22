
// src/components/guides/SchoolGuideToc.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';

export function SchoolGuideToc({ onClose }: { onClose?: () => void }) {
    const { t } = useTranslation('guides');
    const handleLinkClick = () => {
        if (onClose) {
            onClose();
        }
    };

    return (
        <nav className="space-y-2">
            <ul className="list-none space-y-2 !pl-0">
                <li><a href="#configuration-initiale" onClick={handleLinkClick} className="text-sm font-medium text-slate-600 hover:text-[#05335C] hover:underline">{t('school.toc.setup')}</a></li>
                <li><a href="#gestion-utilisateurs" onClick={handleLinkClick} className="text-sm font-medium text-slate-600 hover:text-[#05335C] hover:underline">{t('school.toc.users')}</a></li>
                <li><a href="#supervision-controle" onClick={handleLinkClick} className="text-sm font-medium text-slate-600 hover:text-[#05335C] hover:underline">{t('school.toc.supervision')}</a></li>
                <li><a href="#rapports-statistiques" onClick={handleLinkClick} className="text-sm font-medium text-slate-600 hover:text-[#05335C] hover:underline">{t('school.toc.reports')}</a></li>
                <li><a href="#gestion-signatures" onClick={handleLinkClick} className="text-sm font-medium text-slate-600 hover:text-[#05335C] hover:underline">{t('school.toc.signatures')}</a></li>
                <li><a href="#support-formation" onClick={handleLinkClick} className="text-sm font-medium text-slate-600 hover:text-[#05335C] hover:underline">{t('school.toc.support')}</a></li>
            </ul>
        </nav>
    );
}
