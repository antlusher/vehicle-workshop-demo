const axios = require('axios');
const { query } = require('./db');

const CLIENT_ID = process.env.DVSA_CLIENT_ID;
const CLIENT_SECRET = process.env.DVSA_CLIENT_SECRET;
const API_KEY = process.env.DVSA_API_KEY;
const TOKEN_URL = process.env.DVSA_TOKEN_URL || 'https://login.microsoftonline.com/a455b827-244f-4c97-b5b4-ce5d13b4d00c/oauth2/v2.0/token';
const SCOPE = process.env.DVSA_SCOPE || 'https://tapi.dvsa.gov.uk/.default';
const API_BASE = 'https://history.mot.api.gov.uk';

let _token = null;
let _tokenExpiry = 0;

async function getAccessToken() {
  if (_token && Date.now() < _tokenExpiry - 30000) return _token;

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: SCOPE,
  });

  const { data } = await axios.post(TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  _token = data.access_token;
  _tokenExpiry = Date.now() + (data.expires_in * 1000);
  return _token;
}

function normalizeDefects(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((d) => ({
    type: d.type || null,
    text: d.text || null,
    dangerous: d.dangerous || false,
  }));
}

function normalizeResponse(data) {
  // Capture the full vehicle-level response (minus motTests) so we get
  // hasOutstandingRecall and any other fields without cherry-picking
  const { motTests: rawTests, ...vehicleMeta } = data;

  const tests = Array.isArray(rawTests)
    ? rawTests.map((t) => ({
        testDate: t.completedDate || null,
        motTestNumber: t.motTestNumber || null,
        result: t.testResult || null,
        expiryDate: t.expiryDate || null,
        odometerValue: t.odometerValue != null ? parseInt(t.odometerValue, 10) : null,
        odometerUnit: t.odometerUnit || null,
        // READ | UNREADABLE | NO_ODOMETER
        odometerResultType: t.odometerResultType || null,
        // field name varies by API version
        regMarkAtTest: t.regMarkTimeOfTest || t.registrationAtTimeOfTest || null,
        dataSource: t.dataSource || null,
        // defects field varies: 'defects' (bulk) or 'rfrAndComments' (API response)
        defects: normalizeDefects(t.defects || t.rfrAndComments),
      }))
    : [];

  return { vehicleMeta, tests };
}

async function fetchMotHistory(registration) {
  if (!CLIENT_ID || !CLIENT_SECRET || !API_KEY) return null;

  const reg = registration.trim().toUpperCase().replace(/\s+/g, '');
  const token = await getAccessToken();

  const { data } = await axios.get(`${API_BASE}/v1/trade/vehicles/registration/${reg}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-api-key': API_KEY,
      Accept: 'application/json+v6',
    },
  });

  return normalizeResponse(data);
}

async function fetchAndStoreMotHistory(vehicleId, registration) {
  if (!CLIENT_ID || !CLIENT_SECRET || !API_KEY) return null;
  try {
    const result = await fetchMotHistory(registration);
    if (!result) return null;
    await query(
      'UPDATE vehicles SET mot_tests = $1, mot_vehicle_meta = $2, mot_fetched_at = now() WHERE id = $3',
      [JSON.stringify(result.tests), JSON.stringify(result.vehicleMeta), vehicleId]
    );
    return result;
  } catch (err) {
    console.error(`[mot] fetch failed for ${registration}: ${err.message}`);
    return null;
  }
}

module.exports = { fetchAndStoreMotHistory, fetchMotHistory };
