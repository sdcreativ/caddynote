import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Scan, Camera, CheckCircle, XCircle, Clock } from 'lucide-react';
import { markAttendance, type ClassRosterStudent, type StrkAttendance } from '@/services/strkAttendanceService';
import { extractStudentId } from '@/lib/attendanceQr';
import { useToast } from '@/hooks/use-toast';

interface AttendanceScannerProps {
  classId: string;
  institutionId: string;
  students: ClassRosterStudent[];
  onAttendanceMarked?: (attendance: StrkAttendance) => void;
}

type BarcodeDetectorCtor = new (options: { formats: string[] }) => {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};

export const AttendanceScanner = ({
  classId,
  institutionId,
  students,
  onAttendanceMarked,
}: AttendanceScannerProps) => {
  const { t } = useTranslation('attendance');
  const { t: tc } = useTranslation('common');
  const [isScanning, setIsScanning] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [lastScanLabel, setLastScanLabel] = useState<string | null>(null);
  const [cameraSupported] = useState(() => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia);
  const [qrSupported] = useState(() => typeof window !== 'undefined' && 'BarcodeDetector' in window);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { toast } = useToast();

  const selectedStudent = students.find((s) => s.id === selectedStudentId);

  const stopScanning = useCallback(() => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsScanning(false);
  }, []);

  const applyIdentifiedStudent = useCallback(
    (studentId: string) => {
      const student = students.find((s) => s.id === studentId);
      if (!student) {
        toast({
          title: t('scanner.unknownTitle'),
          description: t('scanner.unknownBody'),
          variant: 'destructive',
        });
        return;
      }
      setSelectedStudentId(student.id);
      setLastScanLabel(student.name);
      stopScanning();
      toast({
        title: t('scanner.identifiedTitle'),
        description: t('scanner.identifiedBody', { name: student.name }),
      });
    },
    [students, stopScanning, t, toast]
  );

  const startScanning = async () => {
    if (!qrSupported) {
      toast({
        title: t('scanner.qrUnavailableTitle'),
        description: t('scanner.qrUnavailableBody'),
        variant: 'destructive',
      });
      return;
    }
    try {
      setIsScanning(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      toast({
        title: tc('status.error'),
        description: t('scanner.cameraError'),
        variant: 'destructive',
      });
      setIsScanning(false);
    }
  };

  useEffect(() => {
    if (!isScanning || !qrSupported) return;
    const Detector = (window as unknown as { BarcodeDetector: BarcodeDetectorCtor }).BarcodeDetector;
    const detector = new Detector({ formats: ['qr_code'] });
    let cancelled = false;

    const tick = async () => {
      if (cancelled || !videoRef.current || videoRef.current.readyState < 2) return;
      try {
        const codes = await detector.detect(videoRef.current);
        const raw = codes[0]?.rawValue;
        if (raw) {
          const studentId = extractStudentId(raw);
          if (studentId) applyIdentifiedStudent(studentId);
        }
      } catch {
        // frame ignore
      }
    };

    const interval = window.setInterval(() => {
      void tick();
    }, 400);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isScanning, qrSupported, applyIdentifiedStudent]);

  useEffect(() => () => stopScanning(), [stopScanning]);

  const handleAttendanceRecord = async (status: 'absent' | 'late') => {
    if (!selectedStudentId || !institutionId) {
      toast({
        title: t('scanner.studentRequiredTitle'),
        description: t('scanner.studentRequiredBody'),
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await markAttendance({
        student_id: selectedStudentId,
        institution_id: institutionId,
        course_id: classId,
        date: new Date().toISOString().split('T')[0],
        type: status === 'late' ? 'lateness' : 'absence',
        duration: status === 'late' ? 15 : 60,
        justified: false,
      });
      if (result) {
        const label = selectedStudent?.name || selectedStudentId;
        setLastScanLabel(t('scanner.lastScan', {
          name: label,
          status: t(status === 'late' ? 'scanner.statusLate' : 'scanner.statusAbsent'),
        }));
        onAttendanceMarked?.(result);
        toast({
          title: t('scanner.recordedTitle'),
          description: t(status === 'late' ? 'scanner.recordedLate' : 'scanner.recordedAbsent', { name: label }),
        });
      } else {
        toast({
          title: tc('status.error'),
          description: t('scanner.saveInvalid'),
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: tc('status.error'),
        description: t('scanner.saveError'),
        variant: 'destructive',
      });
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scan className="h-5 w-5" />
          {t('scanner.title')}
        </CardTitle>
        <CardDescription>
          {t('scanner.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
            <SelectTrigger>
              <SelectValue placeholder={t('scanner.studentPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {students.length === 0 ? (
                <div className="p-2 text-sm text-muted-foreground">{t('scanner.emptyClass')}</div>
              ) : (
                students.map((student) => (
                  <SelectItem key={student.id} value={student.id}>
                    {student.studentNumber
                      ? t('scanner.studentWithNumber', { name: student.name, number: student.studentNumber })
                      : student.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="relative aspect-square bg-muted rounded-lg overflow-hidden">
          {isScanning ? (
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Camera className="h-12 w-12 text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="flex gap-2">
          {!isScanning ? (
            <Button onClick={startScanning} className="flex-1" disabled={!cameraSupported || !qrSupported}>
              <Camera className="h-4 w-4 mr-2" />
              {t('scanner.scan')}
            </Button>
          ) : (
            <Button onClick={stopScanning} variant="outline" className="flex-1">
              {t('scanner.stop')}
            </Button>
          )}
        </div>
        {(!qrSupported || !cameraSupported) && (
          <p className="text-xs text-muted-foreground">
            {t('scanner.qrUnavailableHint')}
          </p>
        )}

        {lastScanLabel && (
          <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium text-green-800 dark:text-green-200">
                {lastScanLabel}
              </span>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={() => handleAttendanceRecord('late')}
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={!selectedStudentId}
          >
            <Clock className="h-4 w-4 mr-1" />
            {t('scanner.late')}
          </Button>
          <Button
            onClick={() => handleAttendanceRecord('absent')}
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={!selectedStudentId}
          >
            <XCircle className="h-4 w-4 mr-1" />
            {t('scanner.absent')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
