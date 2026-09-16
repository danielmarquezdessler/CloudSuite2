import PageContainer from '../../../components/Shared/PageContainer';
import HeroBanner from '../../../components/Shared/HeroBanner';
import GlobalConfigurationCard from '../../../components/Shared/GlobalConfigurationCard';
import Stack from '../../../components/Shared/Stack';

export default function SettingsPlaceholder() {
  return <PageContainer><Stack gap="lg"><HeroBanner icon="settings" title="Configuración" subtitle="Administrá la identidad y ubicación global de tu organización." /><GlobalConfigurationCard /></Stack></PageContainer>;
}
