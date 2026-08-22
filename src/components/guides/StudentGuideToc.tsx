// src/components/guides/StudentGuideToc.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';

export function StudentGuideToc({ onClose }: { onClose?: () => void }) {
    const { t } = useTranslation('guides');

    const handleLinkClick = () => {
        if (onClose) {
            onClose();
        }
    };

    return (
        <nav className="space-y-2">
            <ul className="list-none space-y-2 !pl-0">
                <li><a href="#premiers-pas-etu" onClick={handleLinkClick} className="text-sm font-medium text-slate-600 hover:text-[#05335C] hover:underline">{t('student.toc.firstSteps')}</a></li>
                <li><a href="#consulter-infos" onClick={handleLinkClick} className="text-sm font-medium text-slate-600 hover:text-[#05335C] hover:underline">{t('student.toc.info')}</a></li>
                <li><a href="#justifier-absence" onClick={handleLinkClick} className="text-sm font-medium text-slate-600 hover:text-[#05335C] hover:underline">{t('student.toc.justify')}</a></li>
                <li><a href="#signer-presence" onClick={handleLinkClick} className="text-sm font-medium text-slate-600 hover:text-[#05335C] hover:underline">{t('student.toc.sign')}</a></li>
                <li><a href="#gestion-profil-etu" onClick={handleLinkClick} className="text-sm font-medium text-slate-600 hover:text-[#05335C] hover:underline">{t('student.toc.profile')}</a></li>
                <li><a href="#aide-supplementaire-etu" onClick={handleLinkClick} className="text-sm font-medium text-slate-600 hover:text-[#05335C] hover:underline">{t('student.toc.help')}</a></li>
            </ul>
        </nav>
    );
}
