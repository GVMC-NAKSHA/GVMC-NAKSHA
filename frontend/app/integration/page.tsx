import { IntegrationView } from './IntegrationView';

async function serverFetch(path: string) {
  const res = await fetch(`${process.env.API_URL}${path}`, { cache: 'no-store' });
  return res.json();
}

export default async function IntegrationPage({ searchParams }: { searchParams: { ward?: string } }) {
  const ward = searchParams.ward ?? '4';
  const [conflicts, matches, features] = await Promise.all([
    serverFetch(`/api/conflicts?wardId=${ward}&status=pending`),
    serverFetch(`/api/harmonization/matches?wardId=${ward}&minScore=50`),
    serverFetch(`/api/wards/${ward}/geojson`),
  ]);
  return <IntegrationView ward={ward} conflicts={conflicts} matches={matches} features={features} />;
}
