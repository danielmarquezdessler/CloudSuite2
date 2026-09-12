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
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const isGlobalAdmin = role === 'admin';

  const updateSmartPlanner = async () => {
    if (!user || !organizationId || !isGlobalAdmin) return;
    setSaving(true);
    setNotice('');
    const result = await authenticatedRequest<{ enabledAddons: { smartPlanner: boolean } }>(user, `/api/organizations/${organizationId}/addons/smart-planner`, {
      method: 'PUT',
      body: JSON.stringify({ enabled: !enabledAddons.smartPlanner })
    });
    if (result.error) {
      setNotice(result.error.message);
    } else {
      await reload();
      const nextEnabledAddons = result.data?.enabledAddons ?? { smartPlanner: false };
      updateEnabledAddons(nextEnabledAddons);
      setNotice(nextEnabledAddons.smartPlanner ? 'SmartPlanner quedó habilitado para esta organización.' : 'SmartPlanner quedó deshabilitado para esta organización.');
    }
    setSaving(false);
  };

  return <PageContainer>
    <HeroBanner icon="settings" title="Administración de add-ons" subtitle="Gestioná los módulos habilitados para esta organización." tags={[{ icon: 'settings', label: 'Administrador global' }]} />
    <ContentPanel icon="settings" title="SmartPlanner" subtitle="Habilitá el acceso al módulo según el plan contratado.">
      {!isGlobalAdmin ? <EmptyState icon="award" title="Acceso restringido" description="Solo un administrador global puede modificar los add-ons de una organización." /> : <Stack gap="md">
        <p className="mb-0">Al habilitarlo, SmartPlanner deja de mostrarse como “Próximamente” en el sidebar de esta organización.</p>
        <Inline gap="md" wrap>
          <span className={`cd-state-pill ${enabledAddons.smartPlanner ? 'is-success' : ''}`}>{enabledAddons.smartPlanner ? 'Habilitado' : 'Deshabilitado'}</span>
          <PrimaryButton icon={enabledAddons.smartPlanner ? 'check' : 'plus'} onClick={() => void updateSmartPlanner()} disabled={saving}>{saving ? 'Guardando…' : enabledAddons.smartPlanner ? 'Deshabilitar SmartPlanner' : 'Habilitar SmartPlanner'}</PrimaryButton>
        </Inline>
        {notice && <p className="mb-0" role="status">{notice}</p>}
      </Stack>}
    </ContentPanel>
  </PageContainer>;
}
