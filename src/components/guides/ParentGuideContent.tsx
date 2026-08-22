import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import { Trans, useTranslation } from 'react-i18next';
import {
    LogIn, Users, ClipboardList, Award, Wallet, HelpCircle, Info, CheckSquare, AlertTriangle
} from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { GuideHero } from './GuideHero';
import { GuideSection } from './GuideSection';

export function ParentGuideContent() {
    const { t } = useTranslation('guides');
    const NavBadge = ({ to, children }: { to: string; children: ReactNode }) => (
        <Badge variant="secondary" className="text-sm font-mono px-2 py-0.5">
            <NavLink to={to} className="hover:underline">{children}</NavLink>
        </Badge>
    );

    return (
        <div>
            <GuideHero
                icon={Users}
                title={t('parent.heroTitle')}
                description={t('parent.heroDescription')}
            />

            <GuideSection id="premiers-pas-par" icon={LogIn} title={t('parent.firstSteps.title')} first>
                <h3>{t('parent.firstSteps.login')}</h3>
                <p>
                    <Trans i18nKey="parent.firstSteps.loginBody" components={{ home: <NavBadge to="/" /> }} />
                </p>
                <h3>{t('parent.firstSteps.dashboard')}</h3>
                <p>
                    <Trans
                        i18nKey="parent.firstSteps.dashboardBody"
                        components={{
                            dash: <NavBadge to="/dashboard" />,
                            children: <NavBadge to="/my-children" />,
                        }}
                    />
                </p>
            </GuideSection>

            <GuideSection id="mes-enfants" icon={Users} title={t('parent.children.title')}>
                <p>
                    <Trans i18nKey="parent.children.body" components={{ children: <NavBadge to="/my-children" /> }} />
                </p>
                <Alert className="mt-6">
                    <Info className="h-4 w-4" />
                    <AlertTitle>{t('parent.children.alertTitle')}</AlertTitle>
                    <AlertDescription>
                        {t('parent.children.alertBody')}
                    </AlertDescription>
                </Alert>
            </GuideSection>

            <GuideSection id="absences-par" icon={ClipboardList} title={t('parent.absences.title')}>
                <p>
                    {t('parent.absences.body')}
                </p>
                <Alert variant="destructive" className="mt-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>{t('parent.absences.alertTitle')}</AlertTitle>
                    <AlertDescription>
                        {t('parent.absences.alertBody')}
                    </AlertDescription>
                </Alert>
            </GuideSection>

            <GuideSection id="notes-par" icon={Award} title={t('parent.grades.title')}>
                <p>
                    <Trans i18nKey="parent.grades.body" components={{ strong: <strong /> }} />
                </p>
                <Alert className="mt-6">
                    <CheckSquare className="h-4 w-4" />
                    <AlertTitle>{t('parent.grades.alertTitle')}</AlertTitle>
                    <AlertDescription>
                        {t('parent.grades.alertBody')}
                    </AlertDescription>
                </Alert>
            </GuideSection>

            <GuideSection id="finance-par" icon={Wallet} title={t('parent.finance.title')}>
                <p>
                    {t('parent.finance.body')}
                </p>
            </GuideSection>

            <GuideSection id="aide-par" icon={HelpCircle} title={t('parent.help.title')}>
                <ul>
                    <li><Trans i18nKey="parent.help.faq" components={{ aide: <NavLink to="/aide" /> }} /></li>
                    <li><Trans i18nKey="parent.help.ticket" components={{ support: <NavBadge to="/support" /> }} /></li>
                    <li><Trans i18nKey="parent.help.contact" components={{ contact: <NavLink to="/contact" /> }} /></li>
                </ul>
            </GuideSection>
        </div>
    );
}
