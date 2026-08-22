// Service de sécurité pour la production
export interface SecurityConfig {
  maxFailedAttempts: number;
  lockoutDuration: number;
  passwordMinLength: number;
  requireSpecialChars: boolean;
  sessionTimeout: number;
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
}

export interface SecurityViolation {
  type: 'brute_force' | 'suspicious_activity' | 'data_breach' | 'xss_attempt' | 'sql_injection' | 'csrf';
  userId?: string;
  ip?: string;
  timestamp: number;
  details: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export class SecurityService {
  private static config: SecurityConfig = {
    maxFailedAttempts: 5,
    lockoutDuration: 15 * 60 * 1000, // 15 minutes
    passwordMinLength: 8,
    requireSpecialChars: true,
    sessionTimeout: 24 * 60 * 60 * 1000, // 24 heures
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 100
    }
  };

  private static failedAttempts = new Map<string, { count: number; lastAttempt: number }>();
  private static rateLimitMap = new Map<string, { requests: number; windowStart: number }>();
  private static violations: SecurityViolation[] = [];

  // Validation des mots de passe
  static validatePassword(password: string): {
    isValid: boolean;
    errors: string[];
    strength: 'weak' | 'medium' | 'strong';
  } {
    const errors: string[] = [];

    if (password.length < this.config.passwordMinLength) {
      errors.push(`Le mot de passe doit contenir au moins ${this.config.passwordMinLength} caractères`);
    }

    if (this.config.requireSpecialChars) {
      if (!/[A-Z]/.test(password)) {
        errors.push('Le mot de passe doit contenir au moins une majuscule');
      }
      if (!/[a-z]/.test(password)) {
        errors.push('Le mot de passe doit contenir au moins une minuscule');
      }
      if (!/[0-9]/.test(password)) {
        errors.push('Le mot de passe doit contenir au moins un chiffre');
      }
      if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
        errors.push('Le mot de passe doit contenir au moins un caractère spécial');
      }
    }

    // Vérifier contre les mots de passe courants
    const commonPasswords = [
      'password', '123456', '123456789', '12345678', '12345',
      'password123', 'admin', 'qwerty', 'abc123', 'letmein'
    ];
    
    if (commonPasswords.includes(password.toLowerCase())) {
      errors.push('Ce mot de passe est trop commun');
    }

    // Calculer la force
    let strength: 'weak' | 'medium' | 'strong' = 'weak';
    if (errors.length === 0) {
      if (password.length >= 12 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password) && /[!@#$%^&*(),.?":{}|<>]/.test(password)) {
        strength = 'strong';
      } else if (password.length >= 8) {
        strength = 'medium';
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      strength
    };
  }

  // Gestion des tentatives de connexion échouées
  static recordFailedAttempt(identifier: string): boolean {
    const now = Date.now();
    const attempts = this.failedAttempts.get(identifier) || { count: 0, lastAttempt: 0 };

    // Reset si la dernière tentative était il y a plus de lockoutDuration
    if (now - attempts.lastAttempt > this.config.lockoutDuration) {
      attempts.count = 0;
    }

    attempts.count++;
    attempts.lastAttempt = now;
    this.failedAttempts.set(identifier, attempts);

    // Enregistrer une violation si le seuil est atteint
    if (attempts.count >= this.config.maxFailedAttempts) {
      this.recordViolation({
        type: 'brute_force',
        timestamp: now,
        details: { identifier, attempts: attempts.count },
        severity: 'high'
      });
      return true; // Account locked
    }

    return false;
  }

  static isAccountLocked(identifier: string): boolean {
    const attempts = this.failedAttempts.get(identifier);
    if (!attempts) return false;

    const now = Date.now();
    
    // Reset si le lockout a expiré
    if (now - attempts.lastAttempt > this.config.lockoutDuration) {
      this.failedAttempts.delete(identifier);
      return false;
    }

    return attempts.count >= this.config.maxFailedAttempts;
  }

  static clearFailedAttempts(identifier: string): void {
    this.failedAttempts.delete(identifier);
  }

  // Rate limiting
  static checkRateLimit(identifier: string): boolean {
    const now = Date.now();
    const limit = this.rateLimitMap.get(identifier) || { requests: 0, windowStart: now };

    // Reset window if expired
    if (now - limit.windowStart > this.config.rateLimit.windowMs) {
      limit.requests = 0;
      limit.windowStart = now;
    }

    limit.requests++;
    this.rateLimitMap.set(identifier, limit);

    if (limit.requests > this.config.rateLimit.maxRequests) {
      this.recordViolation({
        type: 'suspicious_activity',
        timestamp: now,
        details: { identifier, requests: limit.requests, windowMs: this.config.rateLimit.windowMs },
        severity: 'medium'
      });
      return false; // Rate limit exceeded
    }

    return true;
  }

  // Sanitisation et validation des inputs
  static sanitizeInput(input: string): string {
    return input
      .replace(/[<>]/g, '') // Supprimer les balises HTML
      .replace(/['";]/g, '') // Supprimer les quotes dangereuses
      .trim();
  }

  static validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static detectXSS(input: string): boolean {
    const xssPatterns = [
      /<script[^>]*>.*?<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<iframe[^>]*>.*?<\/iframe>/gi,
      /eval\s*\(/gi,
      /expression\s*\(/gi
    ];

    return xssPatterns.some(pattern => pattern.test(input));
  }

  static detectSQLInjection(input: string): boolean {
    const sqlPatterns = [
      /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)/gi,
      /(\b(or|and)\b\s*\d+\s*=\s*\d+)/gi,
      /(--|\#|\/\*|\*\/)/gi,
      /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b.*\b(from|where|into|values)\b)/gi
    ];

    return sqlPatterns.some(pattern => pattern.test(input));
  }

  // Validation des données sensibles
  static validateInput(input: string, type: 'text' | 'email' | 'password' | 'number'): {
    isValid: boolean;
    sanitized: string;
    violations: string[];
  } {
    const violations: string[] = [];
    let sanitized = this.sanitizeInput(input);

    // Détecter les tentatives d'attaque
    if (this.detectXSS(input)) {
      violations.push('XSS attempt detected');
      this.recordViolation({
        type: 'xss_attempt',
        timestamp: Date.now(),
        details: { input, type },
        severity: 'high'
      });
    }

    if (this.detectSQLInjection(input)) {
      violations.push('SQL injection attempt detected');
      this.recordViolation({
        type: 'sql_injection',
        timestamp: Date.now(),
        details: { input, type },
        severity: 'critical'
      });
    }

    // Validation spécifique au type
    let isValid = true;
    switch (type) {
      case 'email':
        isValid = this.validateEmail(sanitized);
        break;
      case 'password':
        isValid = this.validatePassword(sanitized).isValid;
        break;
      case 'number':
        isValid = /^\d+$/.test(sanitized);
        break;
      default:
        isValid = sanitized.length > 0;
    }

    return {
      isValid: isValid && violations.length === 0,
      sanitized,
      violations
    };
  }

  // Gestion des sessions
  static isSessionValid(sessionStart: number): boolean {
    return Date.now() - sessionStart < this.config.sessionTimeout;
  }

  static generateSecureToken(): string {
    const array = new Uint8Array(32);
    if (typeof window !== 'undefined' && window.crypto) {
      window.crypto.getRandomValues(array);
    } else {
      // Fallback pour Node.js
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
    }
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  // Enregistrement des violations
  static recordViolation(violation: SecurityViolation): void {
    this.violations.push(violation);

    // Log pour monitoring
    console.warn('🚨 Security Violation:', violation);

    // En production, on pourrait envoyer à un service de monitoring
    if (process.env.NODE_ENV === 'production') {
      // this.sendToSecurityService(violation);
    }

    // Garder seulement les 1000 dernières violations
    if (this.violations.length > 1000) {
      this.violations = this.violations.slice(-1000);
    }
  }

  // Protection CSRF
  static generateCSRFToken(): string {
    const token = this.generateSecureToken();
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('csrf_token', token);
    }
    return token;
  }

  static validateCSRFToken(token: string): boolean {
    if (typeof window !== 'undefined') {
      const storedToken = sessionStorage.getItem('csrf_token');
      return storedToken === token;
    }
    return false;
  }

  // Audit et monitoring
  static getSecurityReport(): {
    violations: SecurityViolation[];
    failedAttempts: number;
    rateLimitViolations: number;
    recommendations: string[];
  } {
    const now = Date.now();
    const last24h = now - 24 * 60 * 60 * 1000;
    
    const recentViolations = this.violations.filter(v => v.timestamp > last24h);
    const failedAttempts = Array.from(this.failedAttempts.values())
      .reduce((sum, attempts) => sum + attempts.count, 0);
    
    const rateLimitViolations = recentViolations.filter(v => v.type === 'suspicious_activity').length;
    
    const recommendations: string[] = [];
    
    if (recentViolations.length > 10) {
      recommendations.push('Nombre élevé de violations de sécurité détectées');
    }
    
    if (failedAttempts > 50) {
      recommendations.push('Nombre élevé de tentatives de connexion échouées');
    }
    
    if (rateLimitViolations > 5) {
      recommendations.push('Activité suspecte détectée - considérer le renforcement du rate limiting');
    }

    return {
      violations: recentViolations,
      failedAttempts,
      rateLimitViolations,
      recommendations
    };
  }

  // Mise à jour de la configuration
  static updateConfig(newConfig: Partial<SecurityConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  static getConfig(): SecurityConfig {
    return { ...this.config };
  }

  // Nettoyage périodique
  static cleanup(): void {
    const now = Date.now();
    
    // Nettoyer les tentatives de connexion expirées
    for (const [key, attempts] of this.failedAttempts.entries()) {
      if (now - attempts.lastAttempt > this.config.lockoutDuration) {
        this.failedAttempts.delete(key);
      }
    }
    
    // Nettoyer les entrées de rate limiting expirées
    for (const [key, limit] of this.rateLimitMap.entries()) {
      if (now - limit.windowStart > this.config.rateLimit.windowMs) {
        this.rateLimitMap.delete(key);
      }
    }
    
    // Garder seulement les violations des 7 derniers jours
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    this.violations = this.violations.filter(v => v.timestamp > weekAgo);
  }
}

// Démarrer le nettoyage automatique
if (typeof window !== 'undefined') {
  setInterval(() => {
    SecurityService.cleanup();
  }, 60 * 60 * 1000); // Nettoyer toutes les heures
}

export default SecurityService;