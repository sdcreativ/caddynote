
import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Eraser, Save, RotateCcw, Check, Pen } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface SignatureCanvasProps {
  onSave: (signatureData: string) => void;
  width?: number;
  height?: number;
}

const SignatureCanvas = ({ onSave, width = 500, height = 200 }: SignatureCanvasProps) => {
  const { t } = useTranslation('signatures');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [lastPosition, setLastPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000';
    
    // Ajuster la résolution du canvas pour les écrans haute densité
    const scale = window.devicePixelRatio || 1;
    canvas.width = width * scale;
    canvas.height = height * scale;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(scale, scale);
    
    // Fond blanc pour mieux voir la signature
    ctx.fillStyle = '#f9f9f9';
    ctx.fillRect(0, 0, width, height);
    
    // Ligne de base pour la signature
    ctx.beginPath();
    ctx.moveTo(20, height - 30);
    ctx.lineTo(width - 20, height - 30);
    ctx.strokeStyle = '#ccc';
    ctx.stroke();
    
    // Texte guidant l'utilisateur
    ctx.font = '14px Arial';
    ctx.fillStyle = '#aaa';
    ctx.fillText(t('canvas.signHere'), width / 2 - 40, height - 10);
    
    // Restaurer le style pour le dessin
    ctx.strokeStyle = '#000';
  }, [width, height, t]);

  const getCoordinates = (e: React.TouchEvent | React.MouseEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    
    if ('touches' in e) {
      // Événement tactile
      return {
        x: (e.touches[0].clientX - rect.left) / (rect.width / canvas.width * scale),
        y: (e.touches[0].clientY - rect.top) / (rect.height / canvas.height * scale)
      };
    } else {
      // Événement souris
      return {
        x: (e.clientX - rect.left) / (rect.width / canvas.width * scale),
        y: (e.clientY - rect.top) / (rect.height / canvas.height * scale)
      };
    }
  };

  const startDrawing = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    setHasSignature(true);
    
    ctx.beginPath();
    
    const coords = getCoordinates(e, canvas);
    setLastPosition(coords);
    ctx.moveTo(coords.x, coords.y);
  };
  
  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    if ('touches' in e) {
      // Prévenir le défilement sur les appareils mobiles
      e.preventDefault();
    }
    
    const coords = getCoordinates(e, canvas);
    
    // Dessiner la ligne
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000';
    
    ctx.beginPath();
    ctx.moveTo(lastPosition.x, lastPosition.y);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
    
    setLastPosition(coords);
  };
  
  const endDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    setIsVerified(false);
    
    // Recréer le fond et la ligne de base
    ctx.fillStyle = '#f9f9f9';
    ctx.fillRect(0, 0, width, height);
    
    ctx.beginPath();
    ctx.moveTo(20, height - 30);
    ctx.lineTo(width - 20, height - 30);
    ctx.strokeStyle = '#ccc';
    ctx.stroke();
    
    ctx.font = '14px Arial';
    ctx.fillStyle = '#aaa';
    ctx.fillText(t('canvas.signHere'), width / 2 - 40, height - 10);
    
    ctx.strokeStyle = '#000';
  };

  const verifySignature = () => {
    // Cette fonction vérifie simplement si une signature a été dessinée
    if (hasSignature) {
      setIsVerified(true);
      
      // Automatiquement sauvegarder la signature lorsqu'elle est vérifiée
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      // Convertir le canvas en image base64
      const signatureData = canvas.toDataURL('image/png');
      onSave(signatureData);
    }
  };

  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) return;
    
    // Convertir le canvas en image base64
    const signatureData = canvas.toDataURL('image/png');
    onSave(signatureData);
  };

  return (
    <div className="flex flex-col items-center space-y-4">
      <div className="border rounded-lg overflow-hidden touch-none relative">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={endDrawing}
          onMouseLeave={endDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={endDrawing}
          width={width}
          height={height}
          className="cursor-crosshair touch-none"
          style={{
            touchAction: 'none'
          }}
        />
        {isDrawing && (
          <div className="absolute top-2 right-2 bg-green-100 text-green-800 px-2 py-1 rounded text-xs">
            {t('canvas.inProgress')}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-3 justify-center">
        <Button 
          variant="outline" 
          onClick={clearSignature}
          size="sm"
        >
          <Eraser className="mr-2 h-4 w-4" />
          {t('canvas.clear')}
        </Button>
        <Button
          variant="outline"
          onClick={verifySignature}
          disabled={!hasSignature || isVerified}
          size="sm"
        >
          <Check className="mr-2 h-4 w-4" />
          {t('canvas.verify')}
        </Button>
        <Button 
          onClick={saveSignature} 
          disabled={!hasSignature}
          className="bg-caddynote-600 hover:bg-caddynote-700"
          size="sm"
        >
          <Save className="mr-2 h-4 w-4" />
          {t('canvas.confirm')}
        </Button>
      </div>
      {isVerified && (
        <div className="text-green-600 text-sm font-medium flex items-center">
          <Check className="mr-1 h-4 w-4" />
          {t('canvas.verified')}
        </div>
      )}
      <p className="text-xs text-gray-500 text-center max-w-md">
        {t('canvas.legal')}
      </p>
    </div>
  );
};

export default SignatureCanvas;
