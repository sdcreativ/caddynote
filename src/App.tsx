
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog";
import { PromptDialogProvider } from "@/components/ui/prompt-dialog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { MotionConfig } from "framer-motion";
import { RouteSeo } from "@/components/seo/RouteSeo";

import { StrkAuthProvider } from "@/hooks/useStrkAuth";
import ImpersonationBanner from "@/components/auth/ImpersonationBanner";
import { SubscriptionProvider } from "@/hooks/useSubscription";
import { GuardianChildrenProvider } from "@/hooks/useGuardianChildren";
import { QuickActionsProvider } from "@/components/quick-actions/QuickActionsManager";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import ErrorBoundary from "@/components/common/ErrorBoundary";
import { ATTENDANCE_HUB_ROLES, EXPORT_ROLES, FINANCE_ROLES, INSTITUTION_STAFF_ROLES, SECRETARIAT_ROLES, TEACHING_ROLES, DIRECTION_ROLES } from "@/lib/roles";

import Index from "./pages/Index";
import SignPage from "./pages/SignPage";
import SignupPage from "./pages/SignupPage";
import Dashboard from "./pages/Dashboard";
import InstitutionsPage from "./pages/InstitutionsPage";
import StudentsPage from "./pages/StudentsPage";
import AbsencesPage from "./pages/AbsencesPage";
import SignaturesPage from "./pages/SignaturesPage";
import SignaturePage from "./pages/SignaturePage";
import TeachingPage from "./pages/TeachingPage";
import CalendarPage from "./pages/CalendarPage";
import UsersManagement from "./pages/UsersManagement";
import SubscriptionPage from "./pages/SubscriptionPage";
import ContactPage from "@/pages/ContactPage.tsx";
import AboutPage from "@/pages/AboutPage.tsx";
import StatusPage from "@/pages/StatusPage.tsx";
import FeatureDetailPage from "@/pages/FeatureDetailPage";
import ExperienceDetailPage from "@/pages/ExperienceDetailPage";
import HelpPage from "@/pages/HelpPage.tsx";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import ServicesPage from "@/pages/ServicesPage";
import TeacherGuidePage from "@/pages/TeacherGuidePage.tsx";
import StudentGuidePage from "@/pages/StudentGuidePage.tsx";
import SchoolGuidePage from "@/pages/SchoolGuidePage.tsx";
import AdminGuidePage from "@/pages/AdminGuidePage.tsx";
import ParentGuidePage from "@/pages/ParentGuidePage.tsx";
import ParentSpacePage from "@/pages/ParentSpacePage";
import AttendanceManagement from "@/pages/AttendanceManagement";
import NotFound from "./pages/NotFound";
import ClassesPage from "./pages/ClassesPage";
import TeachersPage from "./pages/TeachersPage";
import MyCoursesPage from "./pages/MyCoursesPage";
import AssignmentsPage from "./pages/AssignmentsPage";
import MyAbsencesPage from "./pages/MyAbsencesPage";
import MyGradesPage from "./pages/student/MyGradesPage";
import TeacherAttendancePage from "./pages/teacher/TeacherAttendancePage";
import GradesPage from "./pages/GradesPage";
import FinancePage from "./pages/FinancePage";
import DocumentsPage from "./pages/DocumentsPage";
import DocumentVerifyPage from "./pages/DocumentVerifyPage";
import MessagesPage from "./pages/MessagesPage";
import ExportsPage from "./pages/ExportsPage";
import SupportPage from "./pages/SupportPage";
import AuditLogPage from "./pages/AuditLogPage";
import AssignmentWorkPage from "./pages/AssignmentWorkPage";
import TeacherAssignmentsPage from "./pages/TeacherAssignmentsPage";
import TeacherExercisesPage from "./pages/TeacherExercisesPage";
import SubjectsManagement from "./pages/SubjectsManagement";
import CommunicationsPage from "./pages/CommunicationsPage";
import FollowUpPage from "./pages/FollowUpPage";
import TeacherAvailabilityPage from "./pages/TeacherAvailabilityPage";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";
import AdminLoginPage from "./pages/AdminLoginPage";
import ExercisesPage from "./pages/ExercisesPage";
import ProfilePage from "./pages/ProfilePage";
import SettingsPage from "./pages/SettingsPage";
import MyChildrenPage from "./pages/parent/MyChildrenPage";
import CourseDetailPage from "./pages/CourseDetailPage";
import AdmissionApplyPage from "./pages/AdmissionApplyPage";
import AdmissionStatusPage from "./pages/AdmissionStatusPage";
import AdmissionRecoverPage from "./pages/AdmissionRecoverPage";
import AdmissionsAdminPage from "./pages/AdmissionsAdminPage";

const queryClient = new QueryClient();

function App() {
  return (
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ConfirmDialogProvider>
          <PromptDialogProvider>
          <HelmetProvider>
            <BrowserRouter>
              <RouteSeo />
              <StrkAuthProvider>
                <ImpersonationBanner />
                <SubscriptionProvider>
                  <GuardianChildrenProvider>
                  <QuickActionsProvider>
              <Routes>
                {/* Public routes */}
                <Route path="/" element={<Index />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/fonctionnalites/:slug" element={<FeatureDetailPage />} />
                <Route path="/experiences/:slug" element={<ExperienceDetailPage />} />
                <Route path="/contact" element={<ContactPage />} />
                <Route path="/status" element={<StatusPage />} />
                <Route path="/verify/document/:token" element={<DocumentVerifyPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/aide" element={<HelpPage />} />
                <Route path="/aide/guide-enseignants" element={<TeacherGuidePage />} />
                <Route path="/aide/guide-etudiants" element={<StudentGuidePage />} />
                <Route path="/aide/guide-ecoles" element={<SchoolGuidePage />} />
                <Route path="/aide/guide-admin" element={<AdminGuidePage />} />
                <Route path="/aide/guide-parents" element={<ParentGuidePage />} />
                <Route path="/espace-parent" element={<ParentSpacePage />} />
                <Route path="/guides/enseignant" element={<Navigate to="/aide/guide-enseignants" replace />} />
                <Route path="/guides/etudiant" element={<Navigate to="/aide/guide-etudiants" replace />} />
                <Route path="/guides/admin" element={<Navigate to="/aide/guide-admin" replace />} />
                <Route path="/admin-login" element={<AdminLoginPage />} />
                <Route path="/sign" element={<SignPage />} />
                <Route path="/admissions" element={<AdmissionApplyPage />} />
                <Route path="/admissions/retrouver" element={<AdmissionRecoverPage />} />
                <Route path="/admissions/suivi/:token" element={<AdmissionStatusPage />} />
                <Route path="/signup" element={<SignupPage />} />
                
                {/* Protected routes */}
                <Route path="/dashboard" element={
                  <ProtectedRoute>
                    <MainLayout>
                      <Dashboard />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                <Route path="/institutions" element={
                  <ProtectedRoute>
                    <MainLayout>
                      <InstitutionsPage />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                <Route path="/students" element={
                  <ProtectedRoute requiredRoles={INSTITUTION_STAFF_ROLES}>
                    <MainLayout>
                      <StudentsPage />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                <Route path="/absences" element={
                  <ProtectedRoute>
                    <MainLayout>
                      <AbsencesPage />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                <Route path="/signatures" element={
                  <ProtectedRoute>
                    <MainLayout>
                      <SignaturesPage />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                <Route path="/signatures/:id/sign" element={
                  <ProtectedRoute>
                    <SignaturePage />
                  </ProtectedRoute>
                } />
                <Route path="/teaching" element={
                  <ProtectedRoute>
                    <MainLayout>
                      <TeachingPage />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                <Route path="/courses/:id" element={
                  <ProtectedRoute>
                    <MainLayout>
                      <CourseDetailPage />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                <Route path="/calendar" element={
                  <ProtectedRoute>
                    <MainLayout>
                      <CalendarPage />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                <Route path="/admissions/admin" element={
                  <ProtectedRoute requiredRoles={SECRETARIAT_ROLES}>
                    <MainLayout>
                      <AdmissionsAdminPage />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                <Route path="/users" element={
                  <ProtectedRoute requiredRoles={SECRETARIAT_ROLES}>
                    <MainLayout>
                      <UsersManagement />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                <Route path="/finance" element={
                  <ProtectedRoute requiredRoles={FINANCE_ROLES}>
                    <MainLayout>
                      <FinancePage />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                <Route path="/documents" element={
                  <ProtectedRoute>
                    <MainLayout>
                      <DocumentsPage />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                <Route path="/services" element={
                  <ProtectedRoute>
                    <MainLayout>
                      <ServicesPage />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                <Route path="/subscription" element={
                  <ProtectedRoute>
                    <MainLayout>
                      <SubscriptionPage />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                <Route path="/attendance" element={
                  <ProtectedRoute requiredRoles={[...ATTENDANCE_HUB_ROLES, ...TEACHING_ROLES]}>
                    <MainLayout>
                      <AttendanceManagement />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                <Route path="/classes" element={
                  <ProtectedRoute requiredRoles={SECRETARIAT_ROLES}>
                    <MainLayout>
                      <ClassesPage />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                <Route path="/teachers" element={
                  <ProtectedRoute requiredRoles={SECRETARIAT_ROLES}>
                    <MainLayout>
                      <TeachersPage />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                <Route path="/my-courses" element={
                  <ProtectedRoute requiredRole="student">
                    <MainLayout>
                      <MyCoursesPage />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                <Route path="/assignments" element={
                  <ProtectedRoute requiredRole="student">
                    <MainLayout>
                      <AssignmentsPage />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                <Route path="/my-absences" element={
                  <ProtectedRoute requiredRole="student">
                    <MainLayout>
                      <MyAbsencesPage />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                <Route path="/my-grades" element={
                  <ProtectedRoute requiredRole="student">
                    <MainLayout>
                      <MyGradesPage />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                <Route path="/teacher-attendance" element={
                  <ProtectedRoute requiredRoles={TEACHING_ROLES}>
                    <MainLayout>
                      <TeacherAttendancePage />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                {/* Ancien AdminDashboardV2 (no-ops) → console Super Admin */}
                <Route path="/admin-dashboard-v2" element={<Navigate to="/super-admin/overview" replace />} />
                <Route path="/grades" element={
                  <ProtectedRoute>
                    <MainLayout>
                      <GradesPage />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                <Route path="/messages" element={
                  <ProtectedRoute>
                    <MainLayout>
                      <MessagesPage />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                <Route path="/communications" element={
                  <ProtectedRoute>
                    <MainLayout>
                      <CommunicationsPage />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                <Route path="/follow-up" element={
                  <ProtectedRoute>
                    <MainLayout>
                      <FollowUpPage />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                <Route path="/teacher-availability" element={
                  <ProtectedRoute>
                    <MainLayout>
                      <TeacherAvailabilityPage />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                <Route path="/exports" element={
                  <ProtectedRoute requiredRoles={EXPORT_ROLES}>
                    <MainLayout>
                      <ExportsPage />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                <Route path="/support" element={
                  <ProtectedRoute>
                    <MainLayout>
                      <SupportPage />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                <Route path="/audit-log" element={
                  <ProtectedRoute requiredRoles={DIRECTION_ROLES}>
                    <MainLayout>
                      <AuditLogPage />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                <Route path="/assignment/:assignmentId/work" element={
                  <ProtectedRoute>
                    <AssignmentWorkPage />
                  </ProtectedRoute>
                } />
                <Route path="/teacher-assignments" element={
                  <ProtectedRoute requiredRoles={TEACHING_ROLES}>
                    <MainLayout>
                      <TeacherAssignmentsPage />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                <Route path="/teacher-exercises" element={
                  <ProtectedRoute requiredRoles={TEACHING_ROLES}>
                    <MainLayout>
                      <TeacherExercisesPage />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                <Route path="/subjects" element={
                  <ProtectedRoute requiredRoles={SECRETARIAT_ROLES}>
                    <MainLayout>
                      <SubjectsManagement />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                <Route path="/super-admin" element={
                  <ProtectedRoute requiredRole="admin">
                    <Navigate to="/super-admin/overview" replace />
                  </ProtectedRoute>
                } />
                <Route path="/super-admin/:section" element={
                  <ProtectedRoute requiredRole="admin">
                    <SuperAdminDashboard />
                  </ProtectedRoute>
                } />
                <Route path="/exercises" element={
                  <ProtectedRoute>
                    <MainLayout>
                      <ExercisesPage />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                <Route path="/profile" element={
                  <ProtectedRoute>
                    <MainLayout>
                      <ProfilePage />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                <Route path="/settings" element={
                  <ProtectedRoute>
                    <MainLayout>
                      <SettingsPage />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                <Route path="/my-children" element={
                  <ProtectedRoute requiredRole="parent">
                    <MainLayout>
                      <MyChildrenPage />
                    </MainLayout>
                  </ProtectedRoute>
                } />

                {/* 404 Page */}
                <Route path="*" element={<NotFound />} />
              </Routes>
                <Toaster />
                <Sonner />
                </QuickActionsProvider>
                </GuardianChildrenProvider>
              </SubscriptionProvider>
            </StrkAuthProvider>
          </BrowserRouter>
          </HelmetProvider>
          </PromptDialogProvider>
          </ConfirmDialogProvider>
        </TooltipProvider>
      </QueryClientProvider>
      </MotionConfig>
    </ErrorBoundary>
  );
}

export default App;
