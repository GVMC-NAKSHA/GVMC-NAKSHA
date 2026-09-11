import { serverApi } from '@/lib/server-api';
import { IntegrationView } from './IntegrationView';

export default async function IntegrationPage({ searchParams }: { searchParams: { ward?: string } }) {
  const ward = searchParams.ward ?? '4';
  const [conflicts, matches, features, harmonized] = await Promise.all([
    serverApi(`/api/conflicts?wardId=${ward}&status=pending`).catch(() => []),
    serverApi(`/api/harmonization/matches?wardId=${ward}&minScore=50`).catch(() => []),
    serverApi(`/api/wards/${ward}/geojson`).catch(() => ({ type: 'FeatureCollection', features: [] })),
    serverApi(`/api/harmonized?wardId=${ward}`).catch(() => []),
  ]);
  return (
    <IntegrationView
      ward={ward}
      conflicts={Array.isArray(conflicts) ? conflicts : []}
      matches={Array.isArray(matches) ? matches : []}
      features={features}
      harmonized={Array.isArray(harmonized) ? harmonized : []}
    />
  );
}
