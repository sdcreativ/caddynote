
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { PlusCircle, Search, Send, Eye, Download, Pen } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { useStrkSignatures } from '@/hooks/useStrkSignatures';
import { useQuickActions } from '@/components/quick-actions/QuickActionsManager';
import { GroupEmailDialog } from '@/components/signature/GroupEmailDialog';
import { notifySignatureRequest } from '@/services/strkSignatureService';
import { ApiError } from '@/lib/apiClient';
import { SignatureDetailsDialog } from '@/components/signature/SignatureDetailsDialog';
import SignatureCanvas from '@/components/signature/SignatureCanvas';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StrkSignature } from '@/types/strk';
import { useTranslation } from 'react-i18next';
import { tCommon } from '@/i18n/config';
import { PresenceHubTabs } from '@/components/attendance/PresenceHubTabs';

const SignaturesPage = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [selectedSignature, setSelectedSignature] = useState<StrkSignature | null>(null);
  const [signatureToSign, setSignatureToSign] = useState<StrkSignature | null>(null);
  const [isSigningDialogOpen, setIsSigningDialogOpen] = useState(false);
  const [groupEmailOpen, setGroupEmailOpen] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation('signatures');
  const { t: tc } = useTranslation('common');
  const { user } = useStrkAuth();
  const { openSignatureDialog } = useQuickActions();
  const { 
    signatures, 
    isLoading, 
    error, 
    loadSignaturesByInstitution, 
    loadSignaturesByStudent,
    updateSignatureStatus
  } = useStrkSignatures();

  useEffect(() => {
    if (user?.institutionId && ['teacher', 'school_admin', 'admin'].includes(user?.role || '')) {
      loadSignaturesByInstitution(user.institutionId);
    } else if (user?.id && user?.role === 'student') {
      loadSignaturesByStudent(user.id);
    }
  }, [user, loadSignaturesByInstitution, loadSignaturesByStudent]);

  // Vérifier si l'utilisateur a le droit d'accéder à cette page
  if (!user || !['teacher', 'school_admin', 'admin', 'student'].includes(user?.role || '')) {
    return (
      <div className="space-y-6 py-6 animate-fade-in">
        <div className="text-center py-12">
          <Send className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-lg font-semibold text-gray-900">{t('forbiddenTitle')}</h3>
          <p className="mt-1 text-sm text-gray-500">
            {t('forbiddenBody')}
          </p>
        </div>
      </div>
    );
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return t('status.pending');
      case 'completed': return t('status.completed');
      case 'expired': return t('status.expired');
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'secondary';
      case 'completed': return 'default';
      case 'expired': return 'destructive';
      default: return 'secondary';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'entry': return t('type.entry');
      case 'exit': return t('type.exit');
      case 'document': return t('type.document');
      default: return type;
    }
  };

  const filteredSignatures = signatures.filter(signature => {
    const matchesSearch = 
      signature.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (signature as any).student?.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (signature as any).student?.last_name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = filterStatus === 'all' || signature.status === filterStatus;
    const matchesType = filterType === 'all' || signature.type === filterType;
    
    return matchesSearch && matchesStatus && matchesType;
  });

  const handleResendSignature = async (signatureId: string) => {
    const signature = signatures.find((s) => s.id === signatureId);
    if (!signature) return;
    try {
      const result = await notifySignatureRequest(signature.student_id, signature.title);
      if (result === 'not_configured') {
        toast({
          title: t('emailNotConfiguredTitle'),
          description: t('emailNotConfiguredBody'),
          variant: 'destructive',
        });
        return;
      }
      toast({
        title: t('resentTitle'),
        description: t('resentBody'),
      });
    } catch (error) {
      toast({
        title: t('resendErrorTitle'),
        description: error instanceof ApiError ? error.message : t('resendErrorBody'),
        variant: 'destructive',
      });
    }
  };

  const handleExportSignatures = () => {
    if (signatures.length === 0) {
      toast({
        title: t('exportEmptyTitle'),
        description: t('exportEmptyBody'),
        variant: "destructive",
      });
      return;
    }

    // Préparer les données pour l'export CSV
    const csvData = signatures.map(signature => ({
      [t('csv.title')]: signature.title,
      [t('csv.type')]: getTypeLabel(signature.type),
      [t('csv.student')]: (signature as any).student 
        ? `${(signature as any).student.first_name || ''} ${(signature as any).student.last_name || ''}`.trim() 
        : t('unknownStudent'),
      [t('csv.date')]: new Date(signature.date).toLocaleDateString('fr-FR'),
      [t('csv.status')]: getStatusLabel(signature.status),
      [t('csv.signedAt')]: signature.completed_at ? new Date(signature.completed_at).toLocaleDateString('fr-FR') : '-',
      [t('csv.expires')]: signature.expires_at ? new Date(signature.expires_at).toLocaleDateString('fr-FR') : '-',
    }));

    // Convertir en CSV
    const headers = Object.keys(csvData[0]);
    const csvContent = [
      headers.join(','),
      ...csvData.map(row => headers.map(header => `"${row[header as keyof typeof row]}"`).join(','))
    ].join('\n');

    // Télécharger le fichier
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `signatures_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: t('exportSuccessTitle'),
      description: t('exportSuccessBody'),
    });
  };

  const handleViewSignature = (signature: any) => {
    setSelectedSignature(signature);
  };

  const handleSignSignature = (signature: any) => {
    setSignatureToSign(signature);
    setIsSigningDialogOpen(true);
  };

  const handleSaveSignature = async (signatureData: string) => {
    if (!signatureToSign) return;
    
    try {
      const result = await updateSignatureStatus(
        signatureToSign.id, 
        'completed',
        signatureData
      );
      
      if (result) {
        toast({
          title: t('savedTitle'),
          description: t('savedBody'),
        });
        setIsSigningDialogOpen(false);
        setSignatureToSign(null);
        
        // Recharger les signatures
        if (user?.role === 'student' && user?.id) {
          loadSignaturesByStudent(user.id);
        } else if (user?.institutionId && ['teacher', 'school_admin', 'admin'].includes(user?.role || '')) {
          loadSignaturesByInstitution(user.institutionId);
        }
      } else {
        throw new Error("Échec de la mise à jour de la signature");
      }
    } catch (err) {
      console.error('Error saving signature:', err);
      toast({
        title: tCommon('status.error'),
        description: t('saveError'),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6 py-6 animate-fade-in">
      {user?.role !== 'student' ? <PresenceHubTabs /> : null}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <h1 className="text-3xl font-bold">
            {user?.role === 'student' ? t('studentTitle') : t('staffTitle')}
          </h1>
          <p className="text-gray-500 mt-1">
            {user?.role === 'student' 
              ? t('studentSubtitle')
              : t('staffSubtitle')
            }
          </p>
        </div>
        
        {user?.role !== 'student' && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setGroupEmailOpen(true)}
              disabled={signatures.filter((s) => s.status === 'pending').length === 0}
            >
              <Send className="mr-2 h-4 w-4" />
              {t('remindPending')}
            </Button>
            <Button variant="outline" onClick={handleExportSignatures}>
              <Download className="mr-2 h-4 w-4" />
              {tc('actions.export')}
            </Button>
            <Button onClick={openSignatureDialog}>
              <PlusCircle className="mr-2 h-5 w-5" />
              {t('newSignature')}
            </Button>
          </div>
        )}
      </div>

      {/* Statistiques rapides */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="rounded-full bg-blue-100 p-3">
                <Send className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{t('sent')}</p>
                <p className="text-2xl font-bold text-gray-900">{signatures.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="rounded-full bg-yellow-100 p-3">
                <Eye className="h-6 w-6 text-yellow-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{t('pending')}</p>
                <p className="text-2xl font-bold text-gray-900">{signatures.filter(s => s.status === 'pending').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="rounded-full bg-green-100 p-3">
                <Send className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{t('signed')}</p>
                <p className="text-2xl font-bold text-gray-900">{signatures.filter(s => s.status === 'completed').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="rounded-full bg-red-100 p-3">
                <Send className="h-6 w-6 text-red-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{t('expired')}</p>
                <p className="text-2xl font-bold text-gray-900">{signatures.filter(s => s.status === 'expired').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="bg-white shadow-sm rounded-lg p-6">
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">{t('loading')}</p>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-500">{t('error', { message: error })}</p>
          </div>
        ) : (
          <>
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

              <div className="flex gap-2">
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder={t('statusPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('all')}</SelectItem>
                    <SelectItem value="pending">{t('pending')}</SelectItem>
                    <SelectItem value="completed">{t('signed')}</SelectItem>
                    <SelectItem value="expired">{t('expired')}</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder={t('typePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('all')}</SelectItem>
                    <SelectItem value="entry">{t('type.entry')}</SelectItem>
                    <SelectItem value="exit">{t('type.exit')}</SelectItem>
                    <SelectItem value="document">{t('type.document')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
        
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('colTitle')}</TableHead>
                  <TableHead>{t('colType')}</TableHead>
                  <TableHead>{user?.role === 'student' ? t('colSender') : t('colRecipient')}</TableHead>
                  <TableHead>{t('colDate')}</TableHead>
                  <TableHead>{t('colStatus')}</TableHead>
                  <TableHead>{t('colExpires')}</TableHead>
                  <TableHead className="text-right">{t('colActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSignatures.map((signature) => {
                  const studentName = (signature as any).student 
                    ? `${(signature as any).student.first_name || ''} ${(signature as any).student.last_name || ''}`.trim() 
                    : t('unknownStudent');
                  const senderName = (signature as any).sender 
                    ? `${(signature as any).sender.first_name || ''} ${(signature as any).sender.last_name || ''}`.trim() 
                    : t('system');

                  return (
                    <TableRow key={signature.id}>
                      <TableCell>
                        <div className="font-medium text-sm max-w-xs">
                          {signature.title}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {getTypeLabel(signature.type)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {user?.role === 'student' ? senderName : studentName}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {new Date(signature.date).toLocaleDateString('fr-FR')}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusColor(signature.status)}>
                          {getStatusLabel(signature.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-gray-500">
                          {signature.expires_at ? 
                            new Date(signature.expires_at).toLocaleDateString('fr-FR') : 
                            signature.completed_at ? 
                              t('signedOn', { date: new Date(signature.completed_at).toLocaleDateString('fr-FR') }) : 
                              '-'
                          }
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleViewSignature(signature)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            {t('view')}
                          </Button>
                          {signature.status === 'pending' && user?.role === 'student' && (
                            <Button 
                              variant="default" 
                              size="sm"
                              onClick={() => handleSignSignature(signature)}
                            >
                              <Pen className="h-4 w-4 mr-1" />
                              {t('sign')}
                            </Button>
                          )}
                          {signature.status === 'pending' && user?.role !== 'student' && (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleResendSignature(signature.id)}
                            >
                              <Send className="h-4 w-4 mr-1" />
                              {t('remind')}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </>
        )}

        {filteredSignatures.length === 0 && (
          <div className="text-center py-12">
            <Send className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900">{t('emptyTitle')}</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm ? t('emptySearch') : t('emptyNone')}
            </p>
          </div>
        )}
      </div>

      {/* Dialogue pour les détails de la signature */}
      <SignatureDetailsDialog 
        signature={selectedSignature} 
        open={!!selectedSignature} 
        onOpenChange={() => setSelectedSignature(null)}
      />

      {/* Dialogue pour signer une signature */}
      <Dialog open={isSigningDialogOpen} onOpenChange={setIsSigningDialogOpen}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>{t('signDialogTitle')}</DialogTitle>
            <DialogDescription>
              {signatureToSign && (
                <>
                  {t('signDialogBody')} <strong>{signatureToSign.title}</strong>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          
          {signatureToSign && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">{t('labelType')}</span> {getTypeLabel(signatureToSign.type)}
                  </div>
                  <div>
                    <span className="font-medium">{t('labelDate')}</span> {new Date(signatureToSign.date).toLocaleDateString('fr-FR')}
                  </div>
                  {signatureToSign.expires_at && (
                    <div className="col-span-2">
                      <span className="font-medium">{t('labelExpires')}</span> {new Date(signatureToSign.expires_at).toLocaleDateString('fr-FR')}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="border rounded-lg p-4">
                <SignatureCanvas onSave={handleSaveSignature} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <GroupEmailDialog
        open={groupEmailOpen}
        onOpenChange={setGroupEmailOpen}
        signatures={signatures.filter((s) => s.status === 'pending')}
      />
    </div>
  );
};

export default SignaturesPage;
