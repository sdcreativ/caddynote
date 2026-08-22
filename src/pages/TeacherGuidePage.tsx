// src/pages/TeacherGuidePage.tsx
import React from 'react';
import GuideLayout from '@/components/layout/GuideLayout'; // Importe le nouveau layout
import { TeacherGuideContent } from '@/components/guides/TeacherGuideContent';
import { TeacherGuideToc } from '@/components/guides/TeacherGuideToc';

export default function TeacherGuidePage() {
    return (
        // Utilise GuideLayout et passe les composants spécifiques
        <GuideLayout tocComponent={<TeacherGuideToc />}>
            <TeacherGuideContent />
        </GuideLayout>
    );
}