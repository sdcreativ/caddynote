import { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, User, Mail, Phone } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StrkUserRole } from '@/types/strk';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

const BLUE = '#1D70D8';

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&_\-#])[A-Za-z\d@$!%*?&_\-#]{8,}$/;

const createSignupSchema = (t: TFunction) =>
  z
    .object({
      firstName: z.string().min(2, { message: t('signup.errors.firstName') }),
      lastName: z.string().min(2, { message: t('signup.errors.lastName') }),
      email: z.string().email({ message: t('signup.errors.email') }),
      password: z
        .string()
        .min(8, { message: t('signup.errors.passwordMin') })
        .regex(passwordRegex, {
          message: t('signup.errors.passwordRegex'),
        }),
      confirmPassword: z.string(),
      institution: z.string().min(1, { message: t('signup.errors.institution') }),
      role: z.string().min(1, { message: t('signup.errors.role') }),
      phone: z.string().optional(),
    })
    .refine((data) => data.password === data.confirmPassword, {
      path: ['confirmPassword'],
      message: t('signup.errors.mismatch'),
    });

type SignupFormValues = z.infer<ReturnType<typeof createSignupSchema>>;

const fieldClass =
  'h-11 rounded-xl border-slate-200/90 bg-slate-50/80 shadow-none transition placeholder:text-slate-400 focus-visible:border-[#1D70D8]/50 focus-visible:bg-white focus-visible:ring-[#1D70D8]/25';

type StrkSignupFormProps = {
  /** Formulaire déjà dans une carte parente (page signup redesign). */
  embedded?: boolean;
};

const StrkSignupForm = ({ embedded = false }: StrkSignupFormProps) => {
  const { t } = useTranslation('auth');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signup } = useStrkAuth();
  const signupSchema = useMemo(() => createSignupSchema(t), [t]);

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      confirmPassword: '',
      institution: '',
      role: '',
      phone: '',
    },
  });

  const onSubmit = async (values: SignupFormValues) => {
    setIsSubmitting(true);

    try {
      await signup(values.email, values.password, {
        first_name: values.firstName,
        last_name: values.lastName,
        role: values.role as StrkUserRole,
        phone_number: values.phone,
        institution: values.institution,
      });

      toast({
        title: t('signup.successTitle'),
        description: t('signup.successBody'),
      });

      setTimeout(() => {
        navigate('/sign');
      }, 2000);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('signup.errorBody');
      toast({
        title: t('signup.errorTitle'),
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit, (formErrors) => {
          const messages = Object.values(formErrors)
            .map((err) => err.message)
            .filter(Boolean)
            .join('\n');

          toast({
            title: t('signup.validationTitle'),
            description: <div className="whitespace-pre-wrap text-sm text-destructive">{messages}</div>,
            variant: 'destructive',
          });
        })}
        className={cn(
          'space-y-5',
          !embedded &&
            'rounded-[1.5rem] border border-slate-200/80 bg-white p-6 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.35)] sm:p-8'
        )}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
          <FormField
            control={form.control}
            name="firstName"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-[#0B1F3A]">{t('signup.firstName')}</FormLabel>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1D70D8]/70" aria-hidden />
                  <FormControl>
                    <Input
                      className={cn(fieldClass, 'pl-10', form.formState.errors.firstName && 'border-destructive')}
                      placeholder="Marie"
                      autoComplete="given-name"
                      {...field}
                    />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="lastName"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-[#0B1F3A]">{t('signup.lastName')}</FormLabel>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1D70D8]/70" aria-hidden />
                  <FormControl>
                    <Input
                      className={cn(fieldClass, 'pl-10', form.formState.errors.lastName && 'border-destructive')}
                      placeholder="Koné"
                      autoComplete="family-name"
                      {...field}
                    />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold text-[#0B1F3A]">{t('signup.email')}</FormLabel>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1D70D8]/70" aria-hidden />
                <FormControl>
                  <Input
                    type="email"
                    className={cn(fieldClass, 'pl-10', form.formState.errors.email && 'border-destructive')}
                    placeholder={t('login.emailPlaceholder')}
                    autoComplete="email"
                    {...field}
                  />
                </FormControl>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-[#0B1F3A]">{t('signup.password')}</FormLabel>
                <div className="relative">
                  <FormControl>
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      className={cn(fieldClass, 'pr-11', form.formState.errors.password && 'border-destructive')}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex h-11 w-11 items-center justify-center text-slate-400 transition hover:text-slate-600"
                    aria-label={showPassword ? t('signup.hidePassword') : t('signup.showPassword')}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-[#0B1F3A]">{t('signup.confirm')}</FormLabel>
                <div className="relative">
                  <FormControl>
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      className={cn(
                        fieldClass,
                        'pr-11',
                        form.formState.errors.confirmPassword && 'border-destructive'
                      )}
                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex h-11 w-11 items-center justify-center text-slate-400 transition hover:text-slate-600"
                    aria-label={showPassword ? t('signup.hidePassword') : t('signup.showPassword')}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
          <FormField
            control={form.control}
            name="institution"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-[#0B1F3A]">{t('signup.institution')}</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger
                      className={cn(
                        'h-11 rounded-xl border-slate-200/90 bg-slate-50/80 shadow-none focus:ring-[#1D70D8]/25',
                        form.formState.errors.institution && 'border-destructive'
                      )}
                    >
                      <SelectValue placeholder={t('signup.selectPlaceholder')} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="university">{t('signup.institutions.university')}</SelectItem>
                    <SelectItem value="highschool">{t('signup.institutions.highschool')}</SelectItem>
                    <SelectItem value="college">{t('signup.institutions.college')}</SelectItem>
                    <SelectItem value="elementary">{t('signup.institutions.elementary')}</SelectItem>
                    <SelectItem value="training_center">{t('signup.institutions.training_center')}</SelectItem>
                    <SelectItem value="other">{t('signup.institutions.other')}</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-[#0B1F3A]">{t('signup.role')}</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger
                      className={cn(
                        'h-11 rounded-xl border-slate-200/90 bg-slate-50/80 shadow-none focus:ring-[#1D70D8]/25',
                        form.formState.errors.role && 'border-destructive'
                      )}
                    >
                      <SelectValue placeholder={t('signup.selectPlaceholder')} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="student">{t('signup.roles.student')}</SelectItem>
                    <SelectItem value="parent">{t('signup.roles.parent')}</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold text-[#0B1F3A]">{t('signup.phone')}</FormLabel>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1D70D8]/70" aria-hidden />
                <FormControl>
                  <Input
                    type="tel"
                    className={cn(fieldClass, 'pl-10')}
                    placeholder="+225 07 00 00 00 00"
                    autoComplete="tel"
                    {...field}
                  />
                </FormControl>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 h-12 w-full rounded-full text-sm font-semibold text-white shadow-[0_12px_28px_-10px_rgba(29,112,216,0.75)] transition-all duration-200 hover:brightness-95 hover:shadow-[0_16px_32px_-10px_rgba(29,112,216,0.85)]"
          style={{ backgroundColor: BLUE }}
        >
          {isSubmitting ? t('signup.submitting') : t('signup.submit')}
        </Button>

        <p className="text-center text-sm text-slate-500">
          {t('signup.hasAccount')}{' '}
          <Link to="/sign" className="font-semibold text-[#1D70D8] hover:underline">
            {t('signup.login')}
          </Link>
        </p>
      </form>
    </Form>
  );
};

export default StrkSignupForm;
