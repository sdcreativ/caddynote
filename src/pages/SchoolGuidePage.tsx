
// src/pages/SchoolGuidePage.tsx
import React from 'react';
import GuideLayout from '@/components/layout/GuideLayout';
import { SchoolGuideContent } from '@/components/guides/SchoolGuideContent';
import { SchoolGuideToc } from '@/components/guides/SchoolGuideToc';

export default function SchoolGuidePage() {
    return (
        <GuideLayout tocComponent={<SchoolGuideToc />}>
            <SchoolGuideContent />
        </GuideLayout>
    );
}
