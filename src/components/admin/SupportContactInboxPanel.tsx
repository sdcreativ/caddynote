import { RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ContactOpsMessage } from '@/services/strkSupportService';

type SupportContactInboxPanelProps = {
  messages: ContactOpsMessage[];
  busy: boolean;
  onRefresh: () => void;
  onProvision: (message: ContactOpsMessage) => void;
  onConvert: (message: ContactOpsMessage) => void;
  onAcknowledge: (message: ContactOpsMessage) => void;
};

/** File `/contact` publique — extrait de SupportOpsCenter. */
export function SupportContactInboxPanel({
  messages,
  busy,
  onRefresh,
  onProvision,
  onConvert,
  onAcknowledge,
}: SupportContactInboxPanelProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">File contact public</CardTitle>
          <CardDescription>
            Messages `/contact` non traités — créer une session démo en un clic, ou convertir en ticket.
          </CardDescription>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onRefresh}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </CardHeader>
      <CardContent>
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun message en attente.</p>
        ) : (
          <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
            {messages.map((m) => {
              const isDemo = /d[eé]mo|d[eé]monstration|pr[eé]sentation|essai/i.test(m.subject);
              return (
                <li key={m.id} className="space-y-2 rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-medium">{m.subject}</div>
                    {isDemo ? <Badge variant="secondary">Démo</Badge> : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {m.name} &lt;{m.email}&gt; · {new Date(m.createdAt).toLocaleString('fr-FR')}
                  </div>
                  <p className="line-clamp-2 text-muted-foreground">{m.message}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" disabled={busy} onClick={() => onProvision(m)}>
                      Créer la session démo
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => onConvert(m)}
                    >
                      Convertir en ticket
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => onAcknowledge(m)}
                    >
                      Accuser réception
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
