import React from 'react';
import { NavLink } from "react-router-dom";
import { Trans, useTranslation } from 'react-i18next';
import {
    Building, Users, Settings, BarChartHorizontal,
    Shield, Database, HelpCircle, Info, CheckSquare, AlertTriangle
} from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { GuideHero } from './GuideHero';
import { GuideSection } from './GuideSection';

export function SchoolGuideContent() {
    const { t } = useTranslation('guides');
    const NavBadge = ({ to, children }: { to: string; children: React.ReactNode }) => (
        <Badge variant="secondary" className="text-sm font-mono px-2 py-0.5">
            <NavLink to={to} className="hover:underline">{children}</NavLink>
        </Badge>
    );

    return (
        <div>
            <GuideHero
                icon={Building}
                title={t('school.heroTitle')}
                description={t('school.heroDescription')}
            />

            <GuideSection id="configuration-initiale" icon={Settings} title={t('school.setup.title')} first>
                <h3>{t('school.setup.create')}</h3>
                <p>
                    <Trans i18nKey="school.setup.createIntro" components={{ institutions: <NavBadge to="/settings" /> }} />
                </p>
                <ul>
                    <li><Trans i18nKey="school.setup.info" components={{ strong: <strong /> }} /></li>
                    <li><Trans i18nKey="school.setup.academic" components={{ strong: <strong /> }} /></li>
                    <li><Trans i18nKey="school.setup.branding" components={{ strong: <strong /> }} /></li>
                </ul>

                <h3>{t('school.setup.org')}</h3>
                <p>
                    {t('school.setup.orgIntro')}
                </p>
                <ul>
                    <li>{t('school.setup.depts')}</li>
                    <li>{t('school.setup.levels')}</li>
                    <li>{t('school.setup.classes')}</li>
                </ul>
            </GuideSection>

            <GuideSection id="gestion-utilisateurs" icon={Users} title={t('school.users.title')}>
                <h3>{t('school.users.teachers')}</h3>
                <p>
                    <Trans i18nKey="school.users.teachersIntro" components={{ users: <NavBadge to="/users" /> }} />
                </p>
                <ul>
                    <li>{t('school.users.invite')}</li>
                    <li>{t('school.users.assign')}</li>
                    <li>{t('school.users.rights')}</li>
                    <li>{t('school.users.activity')}</li>
                </ul>

                <h3>{t('school.users.students')}</h3>
                <p>
                    <Trans i18nKey="school.users.studentsIntro" components={{ students: <NavBadge to="/students" /> }} />
                </p>
                <ul>
                    <li>{t('school.users.import')}</li>
                    <li>{t('school.users.assignClass')}</li>
                    <li>{t('school.users.personal')}</li>
                    <li>{t('school.users.history')}</li>
                </ul>

                <Alert className="mt-6">
                    <Info className="h-4 w-4" />
                    <AlertTitle>{t('school.users.alertTitle')}</AlertTitle>
                    <AlertDescription>
                        {t('school.users.alertBody')}
                    </AlertDescription>
                </Alert>
            </GuideSection>

            <GuideSection id="supervision-controle" icon={Shield} title={t('school.supervision.title')}>
                <h3>{t('school.supervision.dash')}</h3>
                <p>
                    <Trans i18nKey="school.supervision.dashIntro" components={{ dash: <NavBadge to="/dashboard" /> }} />
                </p>
                <ul>
                    <li><Trans i18nKey="school.supervision.stats" components={{ strong: <strong /> }} /></li>
                    <li><Trans i18nKey="school.supervision.alerts" components={{ strong: <strong /> }} /></li>
                    <li><Trans i18nKey="school.supervision.activity" components={{ strong: <strong /> }} /></li>
                    <li><Trans i18nKey="school.supervision.kpis" components={{ strong: <strong /> }} /></li>
                </ul>

                <h3>{t('school.supervision.absences')}</h3>
                <p>
                    <Trans i18nKey="school.supervision.absencesIntro" components={{ absences: <NavBadge to="/absences" /> }} />
                </p>
                <ul>
                    <li>{t('school.supervision.overview')}</li>
                    <li>{t('school.supervision.validate')}</li>
                    <li>{t('school.supervision.autoAlerts')}</li>
                    <li>{t('school.supervision.families')}</li>
                </ul>
            </GuideSection>

            <GuideSection id="rapports-statistiques" icon={BarChartHorizontal} title={t('school.reports.title')}>
                <h3>{t('school.reports.generate')}</h3>
                <p>
                    {t('school.reports.generateIntro')}
                </p>
                <ul>
                    <li><Trans i18nKey="school.reports.attendance" components={{ strong: <strong /> }} /></li>
                    <li><Trans i18nKey="school.reports.monthly" components={{ strong: <strong /> }} /></li>
                    <li><Trans i18nKey="school.reports.predictive" components={{ strong: <strong /> }} /></li>
                    <li><Trans i18nKey="school.reports.exports" components={{ strong: <strong /> }} /></li>
                </ul>

                <h3>{t('school.reports.analyze')}</h3>
                <p>
                    {t('school.reports.analyzeIntro')}
                </p>
                <ul>
                    <li>{t('school.reports.trends')}</li>
                    <li>{t('school.reports.compare')}</li>
                    <li>{t('school.reports.evaluate')}</li>
                    <li>{t('school.reports.council')}</li>
                </ul>

                <Alert className="mt-6">
                    <CheckSquare className="h-4 w-4" />
                    <AlertTitle>{t('school.reports.alertTitle')}</AlertTitle>
                    <AlertDescription>
                        {t('school.reports.alertBody')}
                    </AlertDescription>
                </Alert>
            </GuideSection>

            <GuideSection id="gestion-signatures" icon={Database} title={t('school.signatures.title')}>
                <h3>{t('school.signatures.config')}</h3>
                <p>
                    <Trans i18nKey="school.signatures.configIntro" components={{ signatures: <NavBadge to="/signatures" /> }} />
                </p>
                <ul>
                    <li>{t('school.signatures.define')}</li>
                    <li>{t('school.signatures.methods')}</li>
                    <li>{t('school.signatures.reminders')}</li>
                </ul>

                <h3>{t('school.signatures.archive')}</h3>
                <p>
                    {t('school.signatures.archiveIntro')}
                </p>
                <ul>
                    <li>{t('school.signatures.timestamp')}</li>
                    <li>{t('school.signatures.secure')}</li>
                    <li>{t('school.signatures.audit')}</li>
                    <li>{t('school.signatures.legal')}</li>
                </ul>
            </GuideSection>

            <GuideSection id="support-formation" icon={HelpCircle} title={t('school.support.title')}>
                <h3>{t('school.support.training')}</h3>
                <p>
                    {t('school.support.trainingIntro')}
                </p>
                <ul>
                    <li>{t('school.support.guides')}</li>
                    <li>{t('school.support.sessions')}</li>
                    <li>{t('school.support.docs')}</li>
                    <li>{t('school.support.videos')}</li>
                </ul>

                <h3>{t('school.support.tech')}</h3>
                <p>
                    {t('school.support.techIntro')}
                </p>
                <ul>
                    <li><Trans i18nKey="school.support.help" components={{ aide: <NavBadge to="/aide" /> }} /></li>
                    <li><Trans i18nKey="school.support.contact" components={{ contact: <NavLink to="/contact" /> }} /></li>
                    <li>{t('school.support.chat')}</li>
                    <li>{t('school.support.phone')}</li>
                </ul>

                <Alert variant="destructive" className="mt-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>{t('school.support.alertTitle')}</AlertTitle>
                    <AlertDescription>
                        {t('school.support.alertBody')}
                    </AlertDescription>
                </Alert>
            </GuideSection>
        </div>
    );
}
