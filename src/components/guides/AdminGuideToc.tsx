// src/components/guides/AdminGuideToc.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';

export function AdminGuideToc({ onClose }: { onClose?: () => void }) {
    const { t } = useTranslation('guides');

    const handleLinkClick = () => {
        if (onClose) {
            onClose();
        }
    };

    return (
        <nav className="space-y-2">
            <ul className="list-none space-y-2 !pl-0">
                <li><a href="#premiers-pas" onClick={handleLinkClick} className="text-sm font-medium text-slate-600 hover:text-[#05335C] hover:underline">{t('admin.toc.firstSteps')}</a></li>
                <li><a href="#gestion-utilisateurs" onClick={handleLinkClick} className="text-sm font-medium text-slate-600 hover:text-[#05335C] hover:underline">{t('admin.toc.users')}</a></li>
                <li><a href="#gestion-structure" onClick={handleLinkClick} className="text-sm font-medium text-slate-600 hover:text-[#05335C] hover:underline">{t('admin.toc.structure')}</a></li>
                <li><a href="#gestion-absences" onClick={handleLinkClick} className="text-sm font-medium text-slate-600 hover:text-[#05335C] hover:underline">{t('admin.toc.absences')}</a></li>
                <li><a href="#gestion-signatures" onClick={handleLinkClick} className="text-sm font-medium text-slate-600 hover:text-[#05335C] hover:underline">{t('admin.toc.signatures')}</a></li>
                <li><a href="#rapports" onClick={handleLinkClick} className="text-sm font-medium text-slate-600 hover:text-[#05335C] hover:underline">{t('admin.toc.reports')}</a></li>
                <li><a href="#modules-etablissement" onClick={handleLinkClick} className="text-sm font-medium text-slate-600 hover:text-[#05335C] hover:underline">{t('admin.toc.modules')}</a></li>
                <li><a href="#configuration" onClick={handleLinkClick} className="text-sm font-medium text-slate-600 hover:text-[#05335C] hover:underline">{t('admin.toc.config')}</a></li>
                <li><a href="#aide-supplementaire" onClick={handleLinkClick} className="text-sm font-medium text-slate-600 hover:text-[#05335C] hover:underline">{t('admin.toc.help')}</a></li>
            </ul>
        </nav>
    );
}
