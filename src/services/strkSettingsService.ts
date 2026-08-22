import { apiClient } from '@/lib/apiClient';

export interface SettingValue {
  category: string;
  key: string;
  value: any;
  description?: string;
  isPublic?: boolean;
  user_id?: string; // Optional user ID for user-specific settings
}

export class StrkSettingsService {
  /**
   * Get a specific setting by category and key.
   * If the setting does not exist, it returns null.
   */
  static async getSetting(category: string, key: string): Promise<any> {
    const { value } = await apiClient.get<{ value: any }>(
      `/settings/${encodeURIComponent(category)}/${encodeURIComponent(key)}`
    );
    return value;
  }

  static async setSetting(setting: SettingValue): Promise<void> {
    const serializedValue = typeof setting.value === 'object'
      ? setting.value
      : JSON.parse(JSON.stringify(setting.value));

    const userSpecificKey = setting.user_id ? `${setting.user_id}:${setting.key}` : setting.key;

    let category = setting.category;
    if (category === 'notification') {
      category = 'notifications';
    }

    try {
      await apiClient.put(`/settings/${encodeURIComponent(category)}/${encodeURIComponent(userSpecificKey)}`, {
        value: serializedValue,
        description: setting.description,
        isPublic: setting.isPublic || false,
      });
    } catch (err) {
      console.error('Exception in setSetting:', err);
      throw err instanceof Error ? err : new Error('Erreur inconnue lors de la sauvegarde');
    }
  }

  static async getSettingsByCategory(category: string, user_id?: string): Promise<Record<string, any>> {
    if (category === 'notification') {
      category = 'notifications';
    }

    const { settings } = await apiClient.get<{ settings: { key: string; value: any }[] }>(
      `/settings/${encodeURIComponent(category)}`
    );

    const result: Record<string, any> = {};
    for (const setting of settings) {
      if (!setting.key.includes(':')) {
        result[setting.key] = setting.value;
      }
    }
    if (user_id) {
      const prefix = `${user_id}:`;
      for (const setting of settings) {
        if (setting.key.startsWith(prefix)) {
          result[setting.key.substring(prefix.length)] = setting.value;
        }
      }
    }
    return result;
  }

  static async getAllSettings(): Promise<Record<string, Record<string, any>>> {
    const { settings } = await apiClient.get<{ settings: Record<string, Record<string, any>> }>('/settings');
    return settings;
  }

  static async deleteSetting(category: string, key: string): Promise<void> {
    await apiClient.delete(`/settings/${encodeURIComponent(category)}/${encodeURIComponent(key)}`);
  }

  // Méthodes utilitaires pour les paramètres système courants
  static async getNotificationSettings(user_id?: string): Promise<{
    emailEnabled: boolean;
    smsEnabled: boolean;
    pushEnabled: boolean;
    attendanceNotifications: boolean;
    reportNotifications: boolean;
  }> {
    const settings = await this.getSettingsByCategory('notifications', user_id);
    return {
      emailEnabled: settings.emailEnabled ?? true,
      smsEnabled: settings.smsEnabled ?? false,
      pushEnabled: settings.pushEnabled ?? true,
      attendanceNotifications: settings.attendanceNotifications ?? true,
      reportNotifications: settings.reportNotifications ?? true
    };
  }

  static async setNotificationSettings(settings: {
    emailEnabled?: boolean;
    smsEnabled?: boolean;
    pushEnabled?: boolean;
    attendanceNotifications?: boolean;
    reportNotifications?: boolean;
  }, user_id?: string): Promise<void> {
    const promises = Object.entries(settings).map(([key, value]) =>
      this.setSetting({ category: 'notifications', key, value, description: `Paramètre de notification: ${key}`, user_id })
    );
    await Promise.all(promises);
  }

  static async getSystemSettings(user_id?: string): Promise<{
    appName: string;
    supportEmail: string;
    maintenanceMode: boolean;
    maxInstitutions: number;
    maxUsersPerInstitution: number;
  }> {
    const settings = await this.getSettingsByCategory('system', user_id);
    return {
      appName: settings.appName ?? 'CaddyNote',
      supportEmail: settings.supportEmail ?? 'support@caddynote.com',
      maintenanceMode: settings.maintenanceMode ?? false,
      maxInstitutions: settings.maxInstitutions ?? 100,
      maxUsersPerInstitution: settings.maxUsersPerInstitution ?? 10000
    };
  }

  static async setSystemSettings(settings: {
    appName?: string;
    supportEmail?: string;
    maintenanceMode?: boolean;
    maxInstitutions?: number;
    maxUsersPerInstitution?: number;
  }, user_id?: string): Promise<void> {
    const promises = Object.entries(settings).map(([key, value]) =>
      this.setSetting({ category: 'system', key, value, description: `Paramètre système: ${key}`, user_id })
    );
    await Promise.all(promises);
  }

  static async getAttendanceSettings(user_id?: string): Promise<{
    autoMarkAbsent: boolean;
    gracePeriodMinutes: number;
    allowLateMarking: boolean;
    requireJustification: boolean;
  }> {
    const settings = await this.getSettingsByCategory('attendance', user_id);
    return {
      autoMarkAbsent: settings.autoMarkAbsent ?? true,
      gracePeriodMinutes: settings.gracePeriodMinutes ?? 15,
      allowLateMarking: settings.allowLateMarking ?? true,
      requireJustification: settings.requireJustification ?? true
    };
  }

  static async setAttendanceSettings(settings: {
    autoMarkAbsent?: boolean;
    gracePeriodMinutes?: number;
    allowLateMarking?: boolean;
    requireJustification?: boolean;
  }, user_id?: string): Promise<void> {
    const promises = Object.entries(settings).map(([key, value]) =>
      this.setSetting({ category: 'attendance', key, value, description: `Paramètre d'assiduité: ${key}`, user_id })
    );
    await Promise.all(promises);
  }
}

export const getSetting = (category: string, key: string) =>
  StrkSettingsService.getSetting(category, key);

export const setSetting = (setting: SettingValue) =>
  StrkSettingsService.setSetting(setting);

export const getSettingsByCategory = (category: string) =>
  StrkSettingsService.getSettingsByCategory(category);
