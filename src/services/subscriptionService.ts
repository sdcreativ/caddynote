import { apiClient } from "@/lib/apiClient";
import { SubscriptionPlan, Subscription, SubscriptionNotification, BillingHistory } from "@/types/subscription";

export const subscriptionService = {
  async getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    const { plans } = await apiClient.get<{ plans: any[] }>('/subscriptions/plans');
    return plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      price_monthly: Number(plan.priceMonthly),
      price_yearly: plan.priceYearly ? Number(plan.priceYearly) : undefined,
      stripe_price_id: plan.stripePriceId,
      stripe_yearly_price_id: plan.stripeYearlyPriceId,
      max_students: plan.maxStudents,
      max_institutions: plan.maxInstitutions,
      max_monthly_reports: plan.maxMonthlyReports,
      storage_limit_gb: plan.storageLimitGb,
      features: typeof plan.features === 'string' ? JSON.parse(plan.features) : plan.features,
      is_trial: plan.isTrial,
      is_active: plan.isActive,
      sort_order: plan.sortOrder,
      created_at: plan.createdAt,
      updated_at: plan.updatedAt,
    }));
  },

  async getCurrentSubscription(userId: string): Promise<Subscription | null> {
    const { subscription: data } = await apiClient.get<{ subscription: any | null }>(
      `/subscriptions/current?userId=${encodeURIComponent(userId)}`
    );
    if (!data) return null;

    const planData = data.plan_;
    const subscription: Subscription = {
      id: data.id,
      user_id: data.userId,
      plan_id: data.planId,
      status: data.status,
      billing_cycle: (data.billingCycle as 'monthly' | 'yearly') || 'monthly',
      stripe_subscription_id: data.stripeSubscriptionId,
      stripe_customer_id: data.stripeCustomerId,
      trial_starts_at: data.trialStartsAt,
      trial_ends_at: data.trialEndsAt,
      expires_at: data.expiresAt,
      starts_at: data.startsAt,
      auto_renew: data.autoRenew,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
      expiration_notifications_sent: Array.isArray(data.expirationNotificationsSent)
        ? data.expirationNotificationsSent.map((item: unknown) => String(item))
        : [],
      plan: planData
        ? {
            id: planData.id,
            name: planData.name,
            price_monthly: Number(planData.priceMonthly),
            price_yearly: planData.priceYearly ? Number(planData.priceYearly) : undefined,
            stripe_price_id: planData.stripePriceId,
            stripe_yearly_price_id: planData.stripeYearlyPriceId,
            max_students: planData.maxStudents,
            max_institutions: planData.maxInstitutions,
            max_monthly_reports: planData.maxMonthlyReports,
            storage_limit_gb: planData.storageLimitGb,
            features: typeof planData.features === 'string' ? JSON.parse(planData.features) : planData.features,
            is_trial: planData.isTrial,
            is_active: planData.isActive,
            sort_order: planData.sortOrder,
            created_at: planData.createdAt,
            updated_at: planData.updatedAt,
          }
        : undefined,
    };
    return subscription;
  },

  isSubscriptionExpired(subscription: Subscription): boolean {
    if (!subscription.expires_at) return false;
    return new Date(subscription.expires_at) < new Date();
  },

  isSubscriptionExpiringSoon(subscription: Subscription, days: number = 7): boolean {
    if (!subscription.expires_at) return false;
    const expirationDate = new Date(subscription.expires_at);
    const warningDate = new Date();
    warningDate.setDate(warningDate.getDate() + days);
    return expirationDate <= warningDate;
  },

  getDaysUntilExpiration(subscription: Subscription): number {
    if (!subscription.expires_at) return Infinity;
    const expirationDate = new Date(subscription.expires_at);
    const today = new Date();
    const diffTime = expirationDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  },

  async getUnreadNotifications(userId: string): Promise<SubscriptionNotification[]> {
    const { notifications } = await apiClient.get<{ notifications: any[] }>(
      `/subscriptions/notifications/unread?userId=${encodeURIComponent(userId)}`
    );
    return notifications.map((n) => ({
      id: n.id,
      subscription_id: n.subscriptionId,
      user_id: n.userId,
      notification_type: n.notificationType,
      days_before_expiration: n.daysBeforeExpiration,
      sent_at: n.sentAt,
      email_sent: n.emailSent,
      in_app_read: n.inAppRead,
      created_at: n.createdAt,
    }));
  },

  async markNotificationAsRead(notificationId: string): Promise<void> {
    await apiClient.patch(`/subscriptions/notifications/${notificationId}/read`);
  },

  async createExpirationNotification(
    subscriptionId: string,
    userId: string,
    type: 'trial_warning' | 'expiration_warning' | 'expired',
    daysBeforeExpiration?: number
  ): Promise<void> {
    await apiClient.post('/subscriptions/notifications', {
      subscriptionId,
      userId,
      notificationType: type,
      daysBeforeExpiration,
    });
  },

  async getBillingHistory(subscriptionId: string): Promise<BillingHistory[]> {
    const { billingHistory } = await apiClient.get<{ billingHistory: any[] }>(
      `/subscriptions/billing-history/${subscriptionId}`
    );
    return billingHistory.map((bill) => ({
      id: bill.id,
      subscription_id: bill.subscriptionId,
      stripe_invoice_id: bill.stripeInvoiceId,
      amount: Number(bill.amount),
      currency: bill.currency,
      status: bill.status,
      billing_period_start: bill.billingPeriodStart,
      billing_period_end: bill.billingPeriodEnd,
      payment_date: bill.paymentDate,
      invoice_url: bill.invoiceUrl,
      metadata: typeof bill.metadata === 'string' ? JSON.parse(bill.metadata) : bill.metadata,
      created_at: bill.createdAt,
    }));
  },

  async getStudentCount(institutionId?: string): Promise<number> {
    const { count } = await apiClient.get<{ count: number }>(
      `/subscriptions/counts/students${institutionId ? `?institutionId=${encodeURIComponent(institutionId)}` : ''}`
    );
    return count;
  },

  async getInstitutionCount(userId: string): Promise<number> {
    const { count } = await apiClient.get<{ count: number }>(
      `/subscriptions/counts/institutions?userId=${encodeURIComponent(userId)}`
    );
    return count;
  }
};
