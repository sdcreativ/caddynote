
import { Signature } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { FileCheck, Eye } from 'lucide-react';
import { useState } from 'react';
import { Button } from "@/components/ui/button";

interface SignaturesDialogProps {
  studentName: string;
  signatures: Signature[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SignaturesDialog = ({ studentName, signatures, open, onOpenChange }: SignaturesDialogProps) => {
  const studentSignatures = signatures.filter(sig => sig.studentName === studentName);
  const [selectedSignature, setSelectedSignature] = useState<string | null>(null);

  // Dans une vraie application, chaque signature aurait une URL d'image
  // Ici on simule cela avec des images de démonstration
  const getSignatureImageUrl = (signature: Signature) => {
    return `data:image/png;base64,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`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Signatures de {studentName}</DialogTitle>
          <DialogDescription>
            Historique des signatures électroniques
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {studentSignatures.length > 0 ? (
            <div className="space-y-4">
              {studentSignatures.map(signature => (
                <div key={signature.id} className="p-4 border rounded-md border-green-200 bg-green-50">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">
                        {signature.type === 'entry' ? 'Entrée' : 'Sortie'} - {signature.date}
                      </p>
                      <p className="text-sm text-gray-600">
                        Signé à : {signature.completedAt ? new Date(signature.completedAt).toLocaleTimeString() : 'En attente'}
                      </p>
                    </div>
                    <div className="flex items-center">
                      <div className="flex items-center text-green-600 mr-2">
                        <FileCheck className="h-5 w-5 mr-1" />
                        <span>{signature.status === 'completed' ? 'Validé' : 'En attente'}</span>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => setSelectedSignature(
                          selectedSignature === getSignatureImageUrl(signature) 
                            ? null 
                            : getSignatureImageUrl(signature)
                        )}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        {selectedSignature === getSignatureImageUrl(signature) ? 'Masquer' : 'Voir'}
                      </Button>
                    </div>
                  </div>
                  {selectedSignature && selectedSignature === getSignatureImageUrl(signature) && (
                    <div className="mt-3 p-3 border rounded bg-white flex justify-center">
                      <img src={selectedSignature} alt="Signature" className="max-w-[200px] max-h-[100px]" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center py-8 text-gray-500">
              Aucune signature enregistrée pour cet étudiant.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
