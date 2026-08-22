import { apiClient, getToken } from '@/lib/apiClient';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export interface StrkReport {
  id: string;
  title: string;
  report_type: string;
  institution_id: string | null;
  parameters: Record<string, unknown> | null;
  data: Record<string, unknown> | null;
  file_url: string | null;
  status: string | null;
  created_by: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface ReportRequest {
  title: string;
  reportType: 'attendance' | 'performance' | 'usage' | 'financial' | 'custom';
  institutionId?: string;
  parameters?: Record<string, any>;
}

const mapApiReport = (r: any): StrkReport => ({
  id: r.id,
  title: r.title,
  report_type: r.reportType,
  institution_id: r.institutionId,
  parameters: r.parameters,
  data: r.data,
  file_url: r.fileUrl,
  status: r.status,
  created_by: r.createdBy,
  created_at: r.createdAt,
  updated_at: r.updatedAt,
});

export class StrkReportService {
  static async createReport(request: ReportRequest): Promise<StrkReport> {
    const { report } = await apiClient.post<{ report: any }>('/reports', request);
    return mapApiReport(report);
  }

  static async getReports(institutionId?: string): Promise<StrkReport[]> {
    const { reports } = await apiClient.get<{ reports: any[] }>(
      `/reports${institutionId ? `?institutionId=${encodeURIComponent(institutionId)}` : ''}`
    );
    return reports.map(mapApiReport);
  }

  static async getReport(id: string): Promise<StrkReport> {
    const { report } = await apiClient.get<{ report: any }>(`/reports/${id}`);
    return mapApiReport(report);
  }

  static async updateReportStatus(id: string, status: 'pending' | 'processing' | 'completed' | 'error', fileUrl?: string): Promise<void> {
    await apiClient.patch(`/reports/${id}/status`, { status, fileUrl });
  }

  static async deleteReport(id: string): Promise<void> {
    await apiClient.delete(`/reports/${id}`);
  }

  static async generateAttendanceReport(institutionId: string, params: { startDate: string; endDate: string; classId?: string }): Promise<StrkReport> {
    return this.createReport({
      title: `Rapport d'assiduité - ${new Date().toLocaleDateString('fr-FR')}`,
      reportType: 'attendance',
      institutionId,
      parameters: params
    });
  }

  static async generateUsageReport(institutionId?: string): Promise<StrkReport> {
    return this.createReport({
      title: `Rapport d'usage - ${new Date().toLocaleDateString('fr-FR')}`,
      reportType: 'usage',
      institutionId,
      parameters: { period: 'monthly' }
    });
  }

  static async generatePerformanceReport(institutionId: string, params: { startDate: string; endDate: string }): Promise<StrkReport> {
    return this.createReport({
      title: `Rapport de performance - ${new Date().toLocaleDateString('fr-FR')}`,
      reportType: 'performance',
      institutionId,
      parameters: params
    });
  }
}

export const fetchStrkReports = (institutionId?: string) => StrkReportService.getReports(institutionId);
export const createStrkReport = (request: ReportRequest) => StrkReportService.createReport(request);

/**
 * RPT-002 : export réel (`GET /reports/export`) — déclenche un vrai
 * téléchargement navigateur, dans l'un des 3 formats du cahier des charges
 * (CSV/XLSX/PDF, 16/08/2026). Hors de `apiClient` volontairement : celui-ci
 * ne sait parser que du JSON, alors que cette route renvoie un flux binaire
 * brut avec un en-tête `Content-Disposition` à respecter.
 */
export const downloadReportExport = async (
  type: 'students' | 'absences' | 'grades' | 'attendance',
  institutionId: string,
  dateRange?: { start?: string; end?: string },
  // RPT-001 : filtres multi-critères en plus de la plage de dates.
  filters?: { classId?: string; subjectId?: string },
  format: 'csv' | 'xlsx' | 'pdf' = 'csv'
): Promise<void> => {
  const params = new URLSearchParams({ type, institutionId, format });
  if (dateRange?.start) params.set('startDate', dateRange.start);
  if (dateRange?.end) params.set('endDate', dateRange.end);
  if (filters?.classId) params.set('classId', filters.classId);
  if (filters?.subjectId) params.set('subjectId', filters.subjectId);

  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/reports/export?${params.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `Erreur ${response.status} lors de l'export`);
  }

  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const filenameMatch = /filename="?([^"]+)"?/.exec(disposition);
  const filename = filenameMatch?.[1] || `export_${type}.${format}`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export type ScheduledExportJob = {
  id: string;
  scheduledAt: string;
  type: 'students' | 'absences' | 'grades' | 'attendance';
  institutionId: string;
  status: string;
  reportId?: string;
  error?: string;
};

export const scheduleReportExport = async (input: {
  type: 'students' | 'absences' | 'grades' | 'attendance';
  institutionId: string;
  scheduledAt: string;
  classId?: string;
  subjectId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<ScheduledExportJob> => {
  const { job } = await apiClient.post<{ job: ScheduledExportJob }>('/reports/schedule', input);
  return job;
};

export const listScheduledExports = async (institutionId?: string): Promise<ScheduledExportJob[]> => {
  const qs = institutionId ? `?institutionId=${encodeURIComponent(institutionId)}` : '';
  const { jobs } = await apiClient.get<{ jobs: ScheduledExportJob[] }>(`/reports/schedule${qs}`);
  return jobs;
};

export const downloadScheduledReport = async (reportId: string): Promise<void> => {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/reports/${reportId}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `Erreur ${response.status}`);
  }
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const filenameMatch = /filename="?([^"]+)"?/.exec(disposition);
  const filename = filenameMatch?.[1] || `rapport_${reportId}.csv`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
