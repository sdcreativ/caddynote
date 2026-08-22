import GuideLayout from '@/components/layout/GuideLayout';
import { ParentGuideContent } from '@/components/guides/ParentGuideContent';
import { ParentGuideToc } from '@/components/guides/ParentGuideToc';

export default function ParentGuidePage() {
    return (
        <GuideLayout tocComponent={<ParentGuideToc />}>
            <ParentGuideContent />
        </GuideLayout>
    );
}
