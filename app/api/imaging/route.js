export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('query') ?? '';
  const it = searchParams.get('it') ?? 'x';
  const coll = searchParams.get('coll') ?? '';
  const m = searchParams.get('m') ?? '1';
  const n = searchParams.get('n') ?? '6';

  if (!query.trim()) return Response.json([]);

  try {
    const params = new URLSearchParams({ query, it, m, n, lic: 'cc' });
    if (coll) params.set('coll', coll);

    const url = `https://openi.nlm.nih.gov/api/search?${params}`;
    const upstream = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'MedTrainer/1.0' },
      signal: AbortSignal.timeout(8000),
    });

    if (!upstream.ok) return Response.json([]);

    const data = await upstream.json();
    const list = Array.isArray(data?.list) ? data.list : [];

    const results = list
      .filter(item => item.imgLarge)
      .map(item => {
        // imgLarge path: /imgs/512/218/4687507/PMC4687507_name.png
        // detailedresult?img= takes the filename without extension
        const imgFile = item.imgLarge.split('/').pop()?.replace(/\.[^.]+$/, '') ?? String(item.uid ?? '')
        return {
          uid: imgFile,
          imageUrl: `https://openi.nlm.nih.gov${item.imgLarge}`,
          thumbnailUrl: `https://openi.nlm.nih.gov${item.imgThumb || item.imgLarge}`,
          caption: item.image?.caption ?? '',
          modality: item.image?.modalityMajor ?? '',
          abstract: item.abstract ?? undefined,
        }
      });

    return Response.json(results);
  } catch (err) {
    console.error('[imaging] Open-i proxy error:', err?.message ?? err);
    return Response.json([]);
  }
}
