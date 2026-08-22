import React from 'react';
import { NavLink } from "react-router-dom";
import { Trans, useTranslation } from 'react-i18next';
import {
    LogIn,
    LayoutDashboard,
    Users,
    Building,
    ClipboardList,
    FileSignature,
    BarChartHorizontal,
    Settings,
    HelpCircle,
    AlertTriangle,
    Info,
    CheckSquare,
} from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { GuideHero } from './GuideHero';
import { GuideSection } from './GuideSection';

export function AdminGuideContent() {
    const { t } = useTranslation('guides');

    const NavBadge = ({ to, children }: { to: string; children: React.ReactNode }) => (
        <Badge variant="secondary" className="text-sm font-mono px-2 py-0.5">
            <NavLink to={to} className="hover:underline">{children}</NavLink>
        </Badge>
    );

    return (
        <div>
            <GuideHero
                icon={LayoutDashboard}
                title={t('admin.heroTitle')}
                description={t('admin.heroDescription')}
            />

            <GuideSection id="premiers-pas" icon={LogIn} title={t('admin.firstSteps.title')} first>
                <h3>{t('admin.firstSteps.login')}</h3>
                <p>
                    <Trans i18nKey="admin.firstSteps.loginBody" components={{ home: <NavBadge to="/" /> }} />
                </p>

                <h3>{t('admin.firstSteps.dashboard')}</h3>
                <p>
                    <Trans i18nKey="admin.firstSteps.dashboardIntro" components={{ dash: <NavBadge to="/dashboard" /> }} />
                </p>
                <ul>
                    <li><Trans i18nKey="admin.firstSteps.itemStats" components={{ strong: <strong /> }} /></li>
                    <li><Trans i18nKey="admin.firstSteps.itemActivity" components={{ strong: <strong /> }} /></li>
                    <li><Trans i18nKey="admin.firstSteps.itemShortcuts" components={{ strong: <strong /> }} /></li>
                    <li><Trans i18nKey="admin.firstSteps.itemNotifs" components={{ strong: <strong /> }} /></li>
                </ul>
                <Alert className="mt-6">
                    <Info className="h-4 w-4" />
                    <AlertTitle>{t('admin.firstSteps.alertTitle')}</AlertTitle>
                    <AlertDescription>
                        {t('admin.firstSteps.alertBody')}
                    </AlertDescription>
                </Alert>
            </GuideSection>

            <GuideSection id="gestion-utilisateurs" icon={Users} title={t('admin.users.title')}>
                <h3>
                    <Trans i18nKey="admin.users.students" components={{ students: <NavBadge to="/students" /> }} />
                </h3>
                <ul>
                    <li><Trans i18nKey="admin.users.add" components={{ strong: <strong /> }} /></li>
                    <li><Trans i18nKey="admin.users.import" components={{ strong: <strong /> }} /></li>
                    <li><Trans i18nKey="admin.users.edit" components={{ strong: <strong /> }} /></li>
                    <li><Trans i18nKey="admin.users.view" components={{ strong: <strong /> }} /></li>
                    <li><Trans i18nKey="admin.users.archive" components={{ strong: <strong /> }} /></li>
                </ul>

                <h3>
                    <Trans i18nKey="admin.users.teachers" components={{ teaching: <NavBadge to="/teaching" /> }} />
                </h3>
                <ul>
                    <li><Trans i18nKey="admin.users.teacherAdd" components={{ strong: <strong /> }} /></li>
                    <li><Trans i18nKey="admin.users.teacherAssign" components={{ strong: <strong /> }} /></li>
                    <li><Trans i18nKey="admin.users.teacherEdit" components={{ strong: <strong /> }} /></li>
                </ul>

                <h3>{t('admin.users.guardians')}</h3>
                <p>
                    {t('admin.users.guardiansBody')}
                </p>

                <h3>{t('admin.users.admins')}</h3>
                <p>
                    <Trans i18nKey="admin.users.adminsBody" components={{ users: <NavBadge to="/users" /> }} />
                </p>
            </GuideSection>

            <GuideSection id="gestion-structure" icon={Building} title={t('admin.structure.title')}>
                <h3>
                    <Trans i18nKey="admin.structure.institutions" components={{ institutions: <NavBadge to="/institutions" /> }} />
                </h3>
                <p>
                    {t('admin.structure.institutionsBody')}
                </p>

                <h3>
                    <Trans i18nKey="admin.structure.classes" components={{ classes: <NavBadge to="/classes" /> }} />
                </h3>
                <p>
                    {t('admin.structure.classesBody')}
                </p>

                <h3>{t('admin.structure.courses')}</h3>
                <p>
                    <Trans i18nKey="admin.structure.coursesBody" components={{ settings: <NavBadge to="/settings" /> }} />
                </p>
            </GuideSection>

            <GuideSection id="gestion-absences" icon={ClipboardList} title={t('admin.absences.title')}>
                <h3>
                    <Trans i18nKey="admin.absences.follow" components={{ absences: <NavBadge to="/absences" /> }} />
                </h3>
                <p>
                    {t('admin.absences.followBody')}
                </p>

                <h3>
                    <Trans i18nKey="admin.absences.process" components={{ absences: <NavBadge to="/absences" /> }} />
                </h3>
                <p>
                    {t('admin.absences.processBody')}
                </p>

                <h3>{t('admin.absences.manual')}</h3>
                <p>
                    <Trans i18nKey="admin.absences.manualBody" components={{ absences: <NavBadge to="/absences" /> }} />
                </p>
                <Alert variant="destructive" className="mt-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>{t('admin.absences.alertTitle')}</AlertTitle>
                    <AlertDescription>
                        {t('admin.absences.alertBody')}
                    </AlertDescription>
                </Alert>
            </GuideSection>

            <GuideSection id="gestion-signatures" icon={FileSignature} title={t('admin.signatures.title')}>
                <h3>
                    <Trans i18nKey="admin.signatures.sheets" components={{ signatures: <NavBadge to="/signatures" /> }} />
                </h3>
                <p>
                    {t('admin.signatures.sheetsBody')}
                </p>

                <h3>
                    <Trans i18nKey="admin.signatures.config" components={{ settings: <NavBadge to="/settings" /> }} />
                </h3>
                <p>
                    {t('admin.signatures.configBody')}
                </p>
            </GuideSection>

            <GuideSection id="rapports" icon={BarChartHorizontal} title={t('admin.reports.title')}>
                <h3>{t('admin.reports.access')}</h3>
                <p>
                    <Trans i18nKey="admin.reports.accessBody" components={{ exports: <NavBadge to="/exports" /> }} />
                </p>

                <h3>{t('admin.reports.generate')}</h3>
                <p>
                    {t('admin.reports.generateBody')}
                </p>

                <h3>{t('admin.reports.export')}</h3>
                <p>
                    {t('admin.reports.exportBody')}
                </p>
                <Alert className="mt-6">
                    <CheckSquare className="h-4 w-4" />
                    <AlertTitle>{t('admin.reports.alertTitle')}</AlertTitle>
                    <AlertDescription>
                        {t('admin.reports.alertBody')}
                    </AlertDescription>
                </Alert>
            </GuideSection>

            <GuideSection id="modules-etablissement" icon={Building} title={t('admin.modules.title')}>
                <h3>
                    <Trans i18nKey="admin.modules.finance" components={{ finance: <NavBadge to="/finance" /> }} />
                </h3>
                <p>
                    {t('admin.modules.financeBody')}
                </p>
                <h3>
                    <Trans i18nKey="admin.modules.documents" components={{ documents: <NavBadge to="/documents" /> }} />
                </h3>
                <p>
                    {t('admin.modules.documentsBody')}
                </p>
                <h3>{t('admin.modules.admissions')}</h3>
                <p>
                    {t('admin.modules.admissionsBody')}
                </p>
                <h3>{t('admin.modules.comms')}</h3>
                <p>
                    <Trans i18nKey="admin.modules.commsBody" components={{ support: <NavBadge to="/support" /> }} />
                </p>
            </GuideSection>

            <GuideSection id="configuration" icon={Settings} title={<Trans i18nKey="admin.config.title" components={{ settings: <NavBadge to="/settings" /> }} />}>
                <h3>{t('admin.config.general')}</h3>
                <p>
                    {t('admin.config.generalBody')}
                </p>

                <h3>{t('admin.config.absenceTypes')}</h3>
                <p>
                    {t('admin.config.absenceTypesBody')}
                </p>

                <h3>{t('admin.config.notifs')}</h3>
                <p>
                    {t('admin.config.notifsBody')}
                </p>
            </GuideSection>

            <GuideSection id="aide-supplementaire" icon={HelpCircle} title={t('admin.help.title')}>
                <p>
                    {t('admin.help.intro')}
                </p>
                <ul>
                    <li><Trans i18nKey="admin.help.faq" components={{ aide: <NavLink to="/aide" /> }} /></li>
                    <li><Trans i18nKey="admin.help.contact" components={{ contact: <NavLink to="/contact" /> }} /></li>
                </ul>
            </GuideSection>
        </div>
    );
}
