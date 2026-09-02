import React from 'react';
import { NavLink } from "react-router-dom";
import { Trans, useTranslation } from 'react-i18next';
import {
    LogIn, UserCheck, CalendarDays, ClipboardCheck, FileSignature, Settings, HelpCircle, Info, CheckSquare, AlertTriangle
} from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { GuideHero } from './GuideHero';
import { GuideSection } from './GuideSection';

export function TeacherGuideContent() {
    const { t } = useTranslation('guides');

    const NavBadge = ({ to, children }: { to: string; children: React.ReactNode }) => (
        <Badge variant="secondary" className="text-sm font-mono px-2 py-0.5">
            <NavLink to={to} className="hover:underline">{children}</NavLink>
        </Badge>
    );

    return (
        <div>
            <GuideHero
                icon={UserCheck}
                title={t('teacher.heroTitle')}
                description={t('teacher.heroDescription')}
            />

            <GuideSection id="premiers-pas-ens" icon={LogIn} title={t('teacher.firstSteps.title')} first>
                <h3>{t('teacher.firstSteps.login')}</h3>
                <p>
                    <Trans i18nKey="teacher.firstSteps.loginBody" components={{ home: <NavBadge to="/" /> }} />
                </p>

                <h3>{t('teacher.firstSteps.dashboard')}</h3>
                <p>
                    <Trans i18nKey="teacher.firstSteps.dashboardIntro" components={{ dash: <NavBadge to="/dashboard" /> }} />
                </p>
                <ul>
                    <li><Trans i18nKey="teacher.firstSteps.itemCourses" components={{ strong: <strong /> }} /></li>
                    <li><Trans i18nKey="teacher.firstSteps.itemNotifs" components={{ strong: <strong /> }} /></li>
                    <li><Trans i18nKey="teacher.firstSteps.itemShortcuts" components={{ strong: <strong /> }} /></li>
                    <li><Trans i18nKey="teacher.firstSteps.itemStats" components={{ strong: <strong /> }} /></li>
                </ul>
                <Alert className="mt-6">
                    <Info className="h-4 w-4" />
                    <AlertTitle>{t('teacher.firstSteps.alertTitle')}</AlertTitle>
                    <AlertDescription>
                        {t('teacher.firstSteps.alertBody')}
                    </AlertDescription>
                </Alert>
            </GuideSection>

            <GuideSection id="gestion-presence" icon={ClipboardCheck} title={t('teacher.attendance.title')}>
                <h3>{t('teacher.attendance.access')}</h3>
                <p>
                    {t('teacher.attendance.accessIntro')}
                </p>
                <ul>
                    <li><Trans i18nKey="teacher.attendance.fromDash" components={{ dash: <NavBadge to="/dashboard" /> }} /></li>
                    <li><Trans i18nKey="teacher.attendance.fromCalendar" components={{ calendar: <NavBadge to="/calendar" /> }} /></li>
                    <li><Trans i18nKey="teacher.attendance.fromTeaching" components={{ teaching: <NavBadge to="/teaching" /> }} /></li>
                </ul>
                <p>
                    {t('teacher.attendance.clickCourse')}
                </p>

                <h3>{t('teacher.attendance.mark')}</h3>
                <p>
                    {t('teacher.attendance.markIntro')}
                </p>
                <ul>
                    <li>{t('teacher.attendance.defaultPresent')}</li>
                    <li>{t('teacher.attendance.changeStatus')}</li>
                    <li>{t('teacher.attendance.otherStatus')}</li>
                    <li>{t('teacher.attendance.quickNote')}</li>
                </ul>
                <Alert className="mt-6">
                    <CheckSquare className="h-4 w-4" />
                    <AlertTitle>{t('teacher.attendance.alertTitle')}</AlertTitle>
                    <AlertDescription>
                        {t('teacher.attendance.alertBody')}
                    </AlertDescription>
                </Alert>

                <h3>{t('teacher.attendance.unlisted')}</h3>
                <p>
                    {t('teacher.attendance.unlistedBody')}
                </p>
            </GuideSection>

            <GuideSection id="signature-electronique-ens" icon={FileSignature} title={t('teacher.signature.title')}>
                <h3>{t('teacher.signature.signSheet')}</h3>
                <p>
                    {t('teacher.signature.signSheetBody')}
                </p>
                <p>
                    {t('teacher.signature.methodsIntro')}
                </p>
                <ul>
                    <li>{t('teacher.signature.click')}</li>
                    <li>{t('teacher.signature.pin')}</li>
                    <li>{t('teacher.signature.handwritten')}</li>
                </ul>
                <p>
                    <Trans i18nKey="teacher.signature.locked" components={{ signatures: <NavBadge to="/signatures" /> }} />
                </p>
                <Alert variant="destructive" className="mt-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>{t('teacher.signature.alertTitle')}</AlertTitle>
                    <AlertDescription>
                        {t('teacher.signature.alertBody')}
                    </AlertDescription>
                </Alert>

                <h3>{t('teacher.signature.studentSign')}</h3>
                <p>
                    {t('teacher.signature.studentSignIntro')}
                </p>
                <ul>
                    <li>{t('teacher.signature.tablet')}</li>
                    <li>{t('teacher.signature.qr')}</li>
                    <li>{t('teacher.signature.account')}</li>
                </ul>
                <p>
                    {t('teacher.signature.follow')}
                </p>
            </GuideSection>

            <GuideSection id="consultation-suivi" icon={CalendarDays} title={t('teacher.followUp.title')}>
                <h3>{t('teacher.followUp.history')}</h3>
                <p>
                    {t('teacher.followUp.historyIntro')}
                </p>
                <ul>
                    <li><Trans i18nKey="teacher.followUp.viaTeaching" components={{ teaching: <NavBadge to="/teaching" /> }} /></li>
                    <li><Trans i18nKey="teacher.followUp.viaSignatures" components={{ signatures: <NavBadge to="/signatures" /> }} /></li>
                    <li>{t('teacher.followUp.viaProfile')}</li>
                </ul>

                <h3>{t('teacher.followUp.justifications')}</h3>
                <p>
                    {t('teacher.followUp.justificationsBody')}
                </p>
            </GuideSection>

            <GuideSection id="autres-fonctionnalites-ens" icon={Settings} title={t('teacher.other.title')}>
                <h3>
                    <Trans i18nKey="teacher.other.profile" components={{ profile: <NavBadge to="/profile" /> }} />
                </h3>
                <p>
                    {t('teacher.other.profileBody')}
                </p>
                <h3>
                    <Trans i18nKey="teacher.other.calendar" components={{ calendar: <NavBadge to="/calendar" /> }} />
                </h3>
                <p>
                    {t('teacher.other.calendarBody')}
                </p>
                <h3>{t('teacher.other.grades')}</h3>
                <p>
                    <Trans
                        i18nKey="teacher.other.gradesBody"
                        components={{
                            grades: <NavBadge to="/grades" />,
                            assignments: <NavBadge to="/teacher-assignments" />,
                        }}
                    />
                </p>
                <h3>{t('teacher.other.unavailability')}</h3>
                <p>
                    {t('teacher.other.unavailabilityBody')}
                </p>
            </GuideSection>

            <GuideSection id="aide-supplementaire-ens" icon={HelpCircle} title={t('teacher.help.title')}>
                <p>
                    {t('teacher.help.intro')}
                </p>
                <ul>
                    <li><Trans i18nKey="teacher.help.faq" components={{ aide: <NavLink to="/aide" /> }} /></li>
                    <li><Trans i18nKey="teacher.help.contact" components={{ contact: <NavLink to="/contact" /> }} /></li>
                </ul>
            </GuideSection>
        </div>
    );
}
