import { useState } from 'react';
import ContentPanel from '../../../components/Shared/ContentPanel';
import EmptyState from '../../../components/Shared/EmptyState';
import HeroBanner from '../../../components/Shared/HeroBanner';
import Inline from '../../../components/Shared/Inline';
import PageContainer from '../../../components/Shared/PageContainer';
import PrimaryButton from '../../../components/Shared/PrimaryButton';
import Stack from '../../../components/Shared/Stack';
import { useAuth } from '../../../context/AuthContext';
import { useActiveCampaign } from '../../../context/CampaignContext';
import { authenticatedRequest } from '../../../lib/api';

export default function AddonsAdmin() {
  const { user } = useAuth();
  const { organizationId, role, enabledAddons, updateEnabledAddons, reload } = useActiveCampaign();
  const [saving, setSaving] = useState<'smartPlanner' | 'voteStream' | 'finance' | null>(null);
  const [notice, setNotice] = useState('');
  const isGlobalAdmin = role === 'admin';

  const updateAddon = async (addon: 'smartPlanner' | 'voteStream' | 'finance') => {
    if (!user || !organizationId || !isGlobalAdmin) return;
    setSaving(addon);
    setNotice('');
    const route = addon === 'smartPlanner' ? 'smart-planner' : addon === 'voteStream' ? 'vote-stream' : 'finance';
    const label = addon === 'smartPlanner' ? 'SmartPlanner' : addon === 'voteStream' ? 'Vote Stream' : 'Treo';
    const result = await authenticatedRequest<{ enabledAddons: typeof enabledAddons }>(user, `/api/organizations/${organizationId}/addons/${route}`, {
      method: 'PUT',
      body: JSON.stringify({ enabled: !enabledAddons[addon] })
    });
    if (result.error) {
      setNotice(result.error.message);
    } else {
      await reload();
      const nextEnabledAddons = result.data?.enabledAddons ?? enabledAddons;
      updateEnabledAddons(nextEnabledAddons);
      setNotice(nextEnabledAddons[addon] ? `${label} quedó habilitado para esta organización.` : `${label} quedó deshabilitado para esta organización.`);
    }
    setSaving(null);
  };

  return <PageContainer><Stack gap="lg">
    <HeroBanner icon="settings" title="Administración de add-ons" subtitle="Gestioná los módulos habilitados para esta organización." tags={[{ icon: 'settings', label: 'Administrador global' }]} />
    <ContentPanel icon="settings" title="SmartPlanner" subtitle="Habilitá el acceso al módulo según el plan contratado.">
      {!isGlobalAdmin ? <EmptyState icon="award" title="Acceso restringido" description="Solo un administrador global puede modificar los add-ons de una organización." /> : <Stack gap="md">
        <p className="mb-0">Al habilitarlo, SmartPlanner deja de mostrarse como “Próximamente” en el sidebar de esta organización.</p>
        <Inline gap="md" wrap>
          <span className={`cd-state-pill ${enabledAddons.smartPlanner ? 'is-success' : ''}`}>{enabledAddons.smartPlanner ? 'Habilitado' : 'Deshabilitado'}</span>
          <PrimaryButton icon={enabledAddons.smartPlanner ? 'check' : 'plus'} onClick={() => void updateAddon('smartPlanner')} disabled={Boolean(saving)}>{saving === 'smartPlanner' ? 'Guardando…' : enabledAddons.smartPlanner ? 'Deshabilitar SmartPlanner' : 'Habilitar SmartPlanner'}</PrimaryButton>
        </Inline>
        {notice && <p className="mb-0" role="status">{notice}</p>}
      </Stack>}
    </ContentPanel>
    <ContentPanel icon="target" title="Vote Stream" subtitle="Resultados electorales y boca de urna en tiempo real.">
      {!isGlobalAdmin ? <EmptyState icon="award" title="Acceso restringido" description="Solo un administrador global puede modificar los add-ons de una organización." /> : <Stack gap="md">
        <p className="mb-0">Al habilitarlo, Vote Stream queda disponible en el sidebar y en el lanzador de productos.</p>
        <Inline gap="md" wrap><span className={`cd-state-pill ${enabledAddons.voteStream ? 'is-success' : ''}`}>{enabledAddons.voteStream ? 'Habilitado' : 'Deshabilitado'}</span><PrimaryButton icon={enabledAddons.voteStream ? 'check' : 'plus'} onClick={() => void updateAddon('voteStream')} disabled={Boolean(saving)}>{saving === 'voteStream' ? 'Guardando…' : enabledAddons.voteStream ? 'Deshabilitar Vote Stream' : 'Habilitar Vote Stream'}</PrimaryButton></Inline>
      </Stack>}
    </ContentPanel>
    <ContentPanel icon="pie" title="Treo" subtitle="Contabilidad, caja, ingresos y egresos de campaña.">
      {!isGlobalAdmin ? <EmptyState icon="award" title="Acceso restringido" description="Solo un administrador global puede modificar los add-ons de una organización." /> : <Stack gap="md"><p className="mb-0">Habilitá el núcleo transaccional para Cliente y Administrador.</p><Inline gap="md" wrap><span className={`cd-state-pill ${enabledAddons.finance ? 'is-success' : ''}`}>{enabledAddons.finance ? 'Habilitado' : 'Deshabilitado'}</span><PrimaryButton icon={enabledAddons.finance ? 'check' : 'plus'} onClick={() => void updateAddon('finance')} disabled={Boolean(saving)}>{saving === 'finance' ? 'Guardando…' : enabledAddons.finance ? 'Deshabilitar Treo' : 'Habilitar Treo'}</PrimaryButton></Inline></Stack>}
    </ContentPanel>
  </Stack></PageContainer>;
}
