const FIELDS = [
  'code',
  'product_name',
  'product_name_en',
  'brands',
  'serving_size',
  'serving_quantity',
  'nutrition_data_per',
  'nutriments',
].join(',');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ status: 0, status_verbose: 'method not allowed' });
    return;
  }

  const barcode = String(req.query.barcode || '').replace(/\D/g, '');
  if (!/^\d{8,14}$/.test(barcode)) {
    res.status(400).json({ status: 0, status_verbose: 'invalid barcode' });
    return;
  }

  const upstream = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=${FIELDS}`,
    {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'MacroFlow/1.0 (https://github.com/prateekParab20/Macroflow)',
      },
    },
  );
  const body = await upstream.text();
  res.status(upstream.status).setHeader('Content-Type', 'application/json; charset=utf-8').send(body);
}
