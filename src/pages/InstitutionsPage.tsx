
import { useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { PlusCircle, Search, Edit, Trash2, School, Upload, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Institution, StrkInstitutionType } from '@/types/strk';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { useStrkInstitutions } from '@/hooks/useStrkInstitutions';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { uploadViaPresignedPost } from '@/lib/s3Upload';
import { resolveStoredFileDisplayUrl } from '@/lib/storedFileAccess';
import { ApiError } from '@/lib/apiClient';

const INSTITUTION_TYPE_VALUES: StrkInstitutionType[] = [
  'elementary_school',
  'school',
  'middle_school',
  'high_school',
  'private_school',
  'university',
  'training_center',
];

const InstitutionsPage = () => {
  const { t } = useTranslation('institutions');
  const { t: tc } = useTranslation('common');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedInstitution, setSelectedInstitution] = useState<Institution | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { user } = useStrkAuth();
  
  const {
    institutions,
    isLoading,
    error,
    addInstitution,
    editInstitution,
    removeInstitution
  } = useStrkInstitutions();

  const [formData, setFormData] = useState({
    name: '',
    type: '' as StrkInstitutionType | '',
    address: '',
    phone: '',
    email: '',
    logo: '' as string | null,
  });
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setFormData({
      name: '',
      type: '',
      address: '',
      phone: '',
      email: '',
      logo: null,
    });
    setLogoPreviewUrl(null);
  };

  const loadLogoPreview = async (key: string | null | undefined) => {
    if (!key) {
      setLogoPreviewUrl(null);
      return;
    }
    if (key.startsWith('http') || key.startsWith('blob:') || key.startsWith('/') || key.startsWith('data:')) {
      setLogoPreviewUrl(key);
      return;
    }
    try {
      setLogoPreviewUrl(await resolveStoredFileDisplayUrl(key));
    } catch {
      setLogoPreviewUrl(null);
    }
  };

  const handleAddInstitution = () => {
    resetForm();
    setShowAddDialog(true);
  };

  const handleEditInstitution = (institution: Institution) => {
    setFormData({
      name: institution.name,
      type: institution.type,
      address: institution.address || '',
      phone: institution.phone || '',
      email: institution.email || '',
      logo: institution.logo || null,
    });
    setSelectedInstitution(institution);
    setShowEditDialog(true);
    void loadLogoPreview(institution.logo);
  };

  const handleLogoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const key = await uploadViaPresignedPost('avatars', file);
      setFormData((prev) => ({ ...prev, logo: key }));
      await loadLogoPreview(key);
      toast({ title: t('logo.uploadedTitle'), description: t('logo.uploadedBody') });
    } catch (error) {
      toast({
        title: tc('status.error'),
        description: error instanceof ApiError ? error.message : t('logo.uploadError'),
        variant: 'destructive',
      });
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  };

  const handleRemoveLogo = () => {
    setFormData((prev) => ({ ...prev, logo: null }));
    setLogoPreviewUrl(null);
  };

  const handleSubmitAdd = async () => {
    if (!formData.name || !formData.type) {
      toast({
        title: t('requiredTitle'),
        description: t('requiredBody'),
        variant: "destructive"
      });
      return;
    }

    setSaving(true);
    try {
      const result = await addInstitution({
        name: formData.name,
        type: formData.type,
        address: formData.address,
        phone: formData.phone,
        email: formData.email,
        adminId: user?.id || '',
      });

      if (result) {
        setShowAddDialog(false);
        resetForm();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitEdit = async () => {
    if (!selectedInstitution || !formData.name || !formData.type) {
      toast({
        title: t('requiredTitle'),
        description: t('requiredBody'),
        variant: "destructive"
      });
      return;
    }

    setSaving(true);
    try {
      const result = await editInstitution(selectedInstitution.id, {
        name: formData.name,
        type: formData.type,
        address: formData.address,
        phone: formData.phone,
        email: formData.email,
        logo: formData.logo,
      });

      if (result) {
        setShowEditDialog(false);
        setSelectedInstitution(null);
        resetForm();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedInstitution) return;
    
    const success = await removeInstitution(selectedInstitution.id);
    if (success) {
      setShowDeleteDialog(false);
      setSelectedInstitution(null);
    }
  };

  const filteredInstitutions = institutions.filter(institution =>
    institution.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    institution.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getTypeLabel = (type: string) =>
    t(`types.${type}`, { defaultValue: type });

  const InstitutionTypeSelect = ({ id }: { id: string }) => (
    <Select
      value={formData.type || undefined}
      onValueChange={(value) => setFormData((prev) => ({ ...prev, type: value as StrkInstitutionType }))}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder={t('typePlaceholder')} />
      </SelectTrigger>
      <SelectContent>
        {INSTITUTION_TYPE_VALUES.map((typeValue) => (
          <SelectItem key={typeValue} value={typeValue}>
            {getTypeLabel(typeValue)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-6 py-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-gray-500 mt-1">
            {t('subtitle')}
          </p>
        </div>
        
        {user?.role === 'admin' && (
          <Button onClick={handleAddInstitution}>
            <PlusCircle className="mr-2 h-5 w-5" />
            {t('addInstitution')}
          </Button>
        )}
      </div>

      <div className="bg-white shadow-sm rounded-lg p-6">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center mb-6">
          <div className="relative w-full sm:max-w-xs">
            <Input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
          </div>
        </div>
        
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">{t('loading')}</p>
          </div>
        ) : error ? (
          <div className="text-center py-12 border border-red-200 rounded-lg">
            <p className="text-red-500">{error}</p>
          </div>
        ) : filteredInstitutions.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('columns.name')}</TableHead>
                <TableHead>{t('columns.type')}</TableHead>
                <TableHead>{t('columns.address')}</TableHead>
                <TableHead>{t('columns.contact')}</TableHead>
                <TableHead className="text-right">{t('columns.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInstitutions.map((institution) => (
                <TableRow key={institution.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10">
                        <School className="h-5 w-5 text-primary" />
                      </div>
                      <div className="font-medium">{institution.name}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {getTypeLabel(institution.type)}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {institution.address || t('notSpecified')}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {institution.email && <div>{institution.email}</div>}
                      {institution.phone && <div className="text-gray-500">{institution.phone}</div>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditInstitution(institution)}
                        aria-label={t('aria.edit', { name: institution.name })}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {user?.role === 'admin' ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedInstitution(institution);
                            setShowDeleteDialog(true);
                          }}
                          aria-label={t('aria.delete', { name: institution.name })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-12 border border-dashed rounded-lg">
            <School className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900">{t('emptyTitle')}</h3>
            <p className="mt-1 text-sm text-gray-500">
              {t('emptyBody')}
            </p>
            <div className="mt-6">
              <Button onClick={handleAddInstitution}>
                <PlusCircle className="mr-2 h-5 w-5" />
                {t('addInstitution')}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>{t('add.title')}</DialogTitle>
            <DialogDescription>
              {t('add.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('fields.name')}</Label>
              <Input 
                id="name" 
                placeholder={t('fields.namePlaceholder')} 
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">{t('fields.type')}</Label>
              <InstitutionTypeSelect id="type" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">{t('fields.address')}</Label>
              <Input 
                id="address" 
                placeholder={t('fields.addressPlaceholder')} 
                value={formData.address}
                onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">{t('fields.phone')}</Label>
                <Input 
                  id="phone" 
                  placeholder={t('fields.phonePlaceholder')} 
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{t('fields.email')}</Label>
                <Input 
                  id="email" 
                  type="email"
                  placeholder={t('fields.emailPlaceholder')} 
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)} disabled={saving}>
              {tc('actions.cancel')}
            </Button>
            <Button type="button" onClick={() => void handleSubmitAdd()} disabled={saving}>
              {saving ? t('saving') : tc('actions.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={(open) => !saving && setShowEditDialog(open)}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>{t('edit.title')}</DialogTitle>
            <DialogDescription>
              {t('edit.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>{t('fields.logo')}</Label>
              <p className="text-xs text-muted-foreground">{t('fields.logoHint')}</p>
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  {logoPreviewUrl ? (
                    <img src={logoPreviewUrl} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <span className="px-1 text-center text-[10px] font-semibold leading-tight text-slate-500">
                      {formData.name.trim() || t('fields.logoFallback')}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => void handleLogoChange(e)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploadingLogo || saving}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {uploadingLogo ? t('logo.uploading') : t('logo.choose')}
                  </Button>
                  {formData.logo ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={uploadingLogo || saving}
                      onClick={handleRemoveLogo}
                    >
                      <X className="mr-2 h-4 w-4" />
                      {t('logo.remove')}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-name">{t('fields.name')}</Label>
              <Input 
                id="edit-name" 
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-type">{t('fields.type')}</Label>
              <InstitutionTypeSelect id="edit-type" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-address">{t('fields.address')}</Label>
              <Input 
                id="edit-address" 
                value={formData.address}
                onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-phone">{t('fields.phone')}</Label>
                <Input 
                  id="edit-phone" 
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-email">{t('fields.email')}</Label>
                <Input 
                  id="edit-email" 
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowEditDialog(false)} disabled={saving}>
              {tc('actions.cancel')}
            </Button>
            <Button type="button" onClick={() => void handleSubmitEdit()} disabled={saving}>
              {saving ? t('saving') : tc('actions.edit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedInstitution
                ? t('delete.descriptionNamed', { name: selectedInstitution.name })
                : t('delete.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              {tc('actions.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default InstitutionsPage;
