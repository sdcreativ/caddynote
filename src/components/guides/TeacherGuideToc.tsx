// src/components/guides/TeacherGuideToc.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';

export function TeacherGuideToc({ onClose }: { onClose?: () => void }) {
    const { t } = useTranslation('guides');

    const handleLinkClick = () => {
        if (onClose) {
            onClose();
        }
    };

    return (
        <nav className="space-y-2">
            <ul className="list-none space-y-2 !pl-0">
                <li><a href="#premiers-pas-ens" onClick={handleLinkClick} className="text-sm font-medium text-slate-600 hover:text-[#05335C] hover:underline">{t('teacher.toc.firstSteps')}</a></li>
                <li><a href="#gestion-presence" onClick={handleLinkClick} className="text-sm font-medium text-slate-600 hover:text-[#05335C] hover:underline">{t('teacher.toc.attendance')}</a></li>
                <li><a href="#signature-electronique-ens" onClick={handleLinkClick} className="text-sm font-medium text-slate-600 hover:text-[#05335C] hover:underline">{t('teacher.toc.signature')}</a></li>
                <li><a href="#consultation-suivi" onClick={handleLinkClick} className="text-sm font-medium text-slate-600 hover:text-[#05335C] hover:underline">{t('teacher.toc.followUp')}</a></li>
                <li><a href="#autres-fonctionnalites-ens" onClick={handleLinkClick} className="text-sm font-medium text-slate-600 hover:text-[#05335C] hover:underline">{t('teacher.toc.other')}</a></li>
                <li><a href="#aide-supplementaire-ens" onClick={handleLinkClick} className="text-sm font-medium text-slate-600 hover:text-[#05335C] hover:underline">{t('teacher.toc.help')}</a></li>
            </ul>
        </nav>
    );
}
