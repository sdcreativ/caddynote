// src/pages/StudentGuidePage.tsx
import React from 'react';
import GuideLayout from '@/components/layout/GuideLayout'; // Importe le layout commun
import { StudentGuideContent } from '@/components/guides/StudentGuideContent'; // Importe le contenu étudiant
import { StudentGuideToc } from '@/components/guides/StudentGuideToc'; // Importe la ToC étudiant

export default function StudentGuidePage() {
    return (
        // Utilise GuideLayout et passe les composants spécifiques
        <GuideLayout tocComponent={<StudentGuideToc />}>
            <StudentGuideContent />
        </GuideLayout>
    );
}