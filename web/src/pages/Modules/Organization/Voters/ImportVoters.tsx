import { ChangeEvent, useState } from 'react';
import { Button, Modal } from 'react-bootstrap';
import { authenticatedFetch } from '../../../../lib/api';
import { useCampaign } from '../useCampaign';

type Props = { onImported: () => void; open?: boolean; onOpenChange?: (open: boolean) => void; showTrigger?: boolean };

export default function ImportVoters({ onImported, open, onOpenChange, showTrigger = true }: Props) {
  const { user, campaign } = useCampaign();
  const [internalOpen, setInternalOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [allow, setAllow] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const submit = async () => {
    if (!user || !campaign || !file) return;
    setLoading(true);
    setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('allowNearDuplicates', String(allow));
      const data = await authenticatedFetch(user, `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}/voters/import`, { method: 'POST', body });
      setReport(data);
      onImported();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo importar el archivo.');
    } finally {
      setLoading(false);
    }
  };

  return <>
    {showTrigger && <Button onClick={() => setOpen(true)}>Importar electores</Button>}
    <Modal size="lg" show={isOpen} onHide={() => setOpen(false)}>
      <Modal.Header closeButton><Modal.Title>Importar electores</Modal.Title></Modal.Header>
      <Modal.Body>
        {error && <div className="alert alert-danger">{error}</div>}
        <p>Columnas esperadas: ID (opcional), Nombre, Dirección, Teléfono (opcional), Email (opcional).</p>
        <input className="form-control" type="file" accept=".csv,.xlsx" onChange={(event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] ?? null)} />
        <div className="form-check mt-3"><input className="form-check-input" id="near" type="checkbox" checked={allow} onChange={event => setAllow(event.target.checked)} /><label className="form-check-label" htmlFor="near">Permitir duplicados cercanos</label></div>
        {loading && <p className="text-primary mt-3">Importando y geocodificando… esto puede tardar unos minutos.</p>}
        {report && <div className="alert alert-success mt-3">Importados {report.importedCount}, duplicados {report.duplicateCount}, sin geolocalización {report.noGeoCount}. {report.errorRows?.length ? `Filas con error: ${report.errorRows.length}` : ''}</div>}
      </Modal.Body>
      <Modal.Footer><Button variant="secondary" onClick={() => setOpen(false)}>Cerrar</Button><Button disabled={!file || loading} onClick={() => void submit()}>Importar</Button></Modal.Footer>
    </Modal>
  </>;
}
