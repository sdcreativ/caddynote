
export interface SubscriptionPlan {
  id: string;
  name: string;
  price_monthly: number;
  price_yearly?: number;
  stripe_price_id?: string;
  stripe_yearly_price_id?: string;
  max_students?: number;
  max_institutions?: number;
  max_monthly_reports?: number;
  storage_limit_gb?: number;
  features: {
    all_features?: boolean;
    basic_reports?: boolean;
    /** Clé canonique backend */
    advancedReports?: boolean;
    /** Alias legacy UI */
    advanced_reports?: boolean;
    analytics?: boolean;
    priority_support?: boolean;
    api_access?: boolean;
    custom_branding?: boolean;
    unlimited_features?: boolean;
    dedicated_support?: boolean;
    email_support?: boolean;
    finance?: boolean;
    communications?: boolean;
    admissions?: boolean;
    documents?: boolean;
    canteen?: boolean;
    lot9_services?: boolean;
    exercises_ai?: boolean;
    /** Métadonnées catalogue public */
    slug?: string;
    description?: string;
    featureList?: string[];
    ctaPath?: string;
    featured?: boolean;
    priceLabel?: string;
    [key: string]: unknown;
  };
  is_trial: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan_id?: string;
  status: 'active' | 'expired' | 'cancelled' | 'past_due';
  trial_starts_at?: string;
  trial_ends_at?: string;
  billing_cycle: 'monthly' | 'yearly';
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  payment_method_id?: string;
  last_payment_date?: string;
  next_billing_date?: string;
  auto_renew: boolean;
  expiration_notifications_sent: string[];
  institution_id?: string;
  starts_at: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
  plan?: SubscriptionPlan;
}

export interface SubscriptionNotification {
  id: string;
  subscription_id: string;
  user_id: string;
  notification_type: 'trial_warning' | 'expiration_warning' | 'expired';
  days_before_expiration?: number;
  sent_at: string;
  email_sent: boolean;
  in_app_read: boolean;
  created_at: string;
}

export interface BillingHistory {
  id: string;
  subscription_id: string;
  stripe_invoice_id?: string;
  amount: number;
  currency: string;
  status: 'paid' | 'pending' | 'failed' | 'refunded';
  billing_period_start?: string;
  billing_period_end?: string;
  payment_date?: string;
  invoice_url?: string;
  metadata: Record<string, any>;
  created_at: string;
}

export interface SubscriptionLimits {
  maxStudents?: number;
  maxInstitutions?: number;
  maxMonthlyReports?: number;
  storageLimitGb?: number;
  hasFeature: (feature: string) => boolean;
}
