import React from 'react';
import { NavLink } from "react-router-dom";
import { Trans, useTranslation } from 'react-i18next';
import {
    LogIn, GraduationCap, CalendarDays, FilePenLine, QrCode, User, HelpCircle, Info, CheckSquare, AlertTriangle
} from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { GuideHero } from './GuideHero';
import { GuideSection } from './GuideSection';

export function StudentGuideContent() {
    const { t } = useTranslation('guides');

    const NavBadge = ({ to, children }: { to: string; children: React.ReactNode }) => (
        <Badge variant="secondary" className="text-sm font-mono px-2 py-0.5">
            <NavLink to={to} className="hover:underline">{children}</NavLink>
        </Badge>
    );

    return (
        <div>
            <GuideHero
                icon={GraduationCap}
                title={t('student.heroTitle')}
                description={t('student.heroDescription')}
            />

            <GuideSection id="premiers-pas-etu" icon={LogIn} title={t('student.firstSteps.title')} first>
                <h3>{t('student.firstSteps.login')}</h3>
                <p>
                    <Trans i18nKey="student.firstSteps.loginBody" components={{ home: <NavBadge to="/" /> }} />
                </p>

                <h3>
                    <Trans i18nKey="student.firstSteps.space" components={{ dash: <NavBadge to="/dashboard" /> }} />
                </h3>
                <p>
                    <Trans i18nKey="student.firstSteps.spaceIntro" components={{ dash: <NavBadge to="/dashboard" /> }} />
                </p>
                <ul>
                    <li><Trans i18nKey="student.firstSteps.itemSessions" components={{ strong: <strong /> }} /></li>
                    <li><Trans i18nKey="student.firstSteps.itemAbsences" components={{ strong: <strong /> }} /></li>
                    <li><Trans i18nKey="student.firstSteps.itemNotifs" components={{ strong: <strong /> }} /></li>
                    <li><Trans i18nKey="student.firstSteps.itemLinks" components={{ strong: <strong /> }} /></li>
                </ul>
                <Alert className="mt-6">
                    <Info className="h-4 w-4" />
                    <AlertTitle>{t('student.firstSteps.alertTitle')}</AlertTitle>
                    <AlertDescription>
                        {t('student.firstSteps.alertBody')}
                    </AlertDescription>
                </Alert>
            </GuideSection>

            <GuideSection id="consulter-infos" icon={CalendarDays} title={t('student.info.title')}>
                <h3>
                    <Trans i18nKey="student.info.calendar" components={{ calendar: <NavBadge to="/calendar" /> }} />
                </h3>
                <p>
                    {t('student.info.calendarBody')}
                </p>

                <h3>
                    <Trans i18nKey="student.info.absences" components={{ absences: <NavBadge to="/my-absences" /> }} />
                </h3>
                <p>
                    {t('student.info.absencesIntro')}
                </p>
                <ul>
                    <li>{t('student.info.itemDate')}</li>
                    <li>{t('student.info.itemStatus')}</li>
                    <li>{t('student.info.itemJustify')}</li>
                </ul>
                <Alert className="mt-6">
                    <CheckSquare className="h-4 w-4" />
                    <AlertTitle>{t('student.info.alertTitle')}</AlertTitle>
                    <AlertDescription>
                        {t('student.info.alertBody')}
                    </AlertDescription>
                </Alert>
                <h3>
                    <Trans i18nKey="student.info.grades" components={{ grades: <NavBadge to="/my-grades" /> }} />
                </h3>
                <p>
                    <Trans i18nKey="student.info.gradesBody" components={{ assignments: <NavBadge to="/assignments" /> }} />
                </p>
            </GuideSection>

            <GuideSection id="justifier-absence" icon={FilePenLine} title={t('student.justify.title')}>
                <h3>{t('student.justify.submit')}</h3>
                <p>
                    <Trans i18nKey="student.justify.submitIntro" components={{ absences: <NavBadge to="/my-absences" /> }} />
                </p>
                <ol>
                    <li>{t('student.justify.step1')}</li>
                    <li>{t('student.justify.step2')}</li>
                    <li>{t('student.justify.step3')}</li>
                    <li>{t('student.justify.step4')}</li>
                    <li>{t('student.justify.step5')}</li>
                    <li>{t('student.justify.step6')}</li>
                </ol>

                <h3>{t('student.justify.follow')}</h3>
                <p>
                    {t('student.justify.followBody')}
                </p>
                <Alert variant="destructive" className="mt-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>{t('student.justify.alertTitle')}</AlertTitle>
                    <AlertDescription>
                        {t('student.justify.alertBody')}
                    </AlertDescription>
                </Alert>
            </GuideSection>

            <GuideSection id="signer-presence" icon={QrCode} title={t('student.sign.title')}>
                <p>
                    {t('student.sign.intro')}
                </p>
                <ul>
                    <li><Trans i18nKey="student.sign.qr" components={{ strong: <strong />, sign: <NavBadge to="/sign" /> }} /></li>
                    <li><Trans i18nKey="student.sign.class" components={{ strong: <strong /> }} /></li>
                    <li><Trans i18nKey="student.sign.code" components={{ strong: <strong /> }} /></li>
                </ul>
                <p>
                    {t('student.sign.follow')}
                </p>
            </GuideSection>

            <GuideSection id="gestion-profil-etu" icon={User} title={<Trans i18nKey="student.profile.title" components={{ profile: <NavBadge to="/profile" /> }} />}>
                <p>
                    {t('student.profile.intro')}
                </p>
                <ul>
                    <li>{t('student.profile.info')}</li>
                    <li>{t('student.profile.password')}</li>
                    <li>{t('student.profile.prefs')}</li>
                </ul>
            </GuideSection>

            <GuideSection id="aide-supplementaire-etu" icon={HelpCircle} title={t('student.help.title')}>
                <p>
                    {t('student.help.intro')}
                </p>
                <ul>
                    <li><Trans i18nKey="student.help.faq" components={{ aide: <NavLink to="/aide" /> }} /></li>
                    <li>{t('student.help.admin')}</li>
                    <li><Trans i18nKey="student.help.contact" components={{ contact: <NavLink to="/contact" /> }} /></li>
                </ul>
            </GuideSection>
        </div>
    );
}
