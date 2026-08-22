import GuideLayout from '@/components/layout/GuideLayout';
import { AdminGuideContent } from '@/components/guides/AdminGuideContent';
import { AdminGuideToc } from '@/components/guides/AdminGuideToc';

export default function AdminGuidePage() {
    return (
        <GuideLayout tocComponent={<AdminGuideToc/>}>
            <AdminGuideContent/>
        </GuideLayout>
    );
}
