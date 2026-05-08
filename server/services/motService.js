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

// VehicleWithMotResponse — DVSA MOT History API v1
// Vehicle root: registration, make, model, fuelType, primaryColour, engineSize,
//   registrationDate, firstUsedDate, manufactureDate, lastMotTestDate, motTestDueDate
// motTests[]: completedDate, motTestNumber, testResult, expiryDate,
//   odometerValue (string), odometerUnit ("MI"|"KM"), odometerResultType ("READ"|"UNREADABLE"|"NO_ODOMETER"),
//   dataSource, regMarkTimeOfTest
//   defects[]: type ("ADVISORY"|"MAJOR"|"DANGEROUS"|"FAIL"), text, dangerous (bool)
function normalizeResponse(data) {
  const vehicleMeta = {
    make: data.make || null,
    model: data.model || null,
    fuelType: data.fuelType || null,
    primaryColour: data.primaryColour || null,
    engineSize: data.engineSize || null,
    registrationDate: data.registrationDate || null,
    firstUsedDate: data.firstUsedDate || null,
    lastMotTestDate: data.lastMotTestDate || null,
    motTestDueDate: data.motTestDueDate || null,
  };

  const tests = Array.isArray(data.motTests)
    ? data.motTests.map((t) => ({
        testDate: t.completedDate || null,
        motTestNumber: t.motTestNumber || null,
        result: t.testResult || null,
        expiryDate: t.expiryDate || null,
        odometerValue: t.odometerValue != null ? parseInt(t.odometerValue, 10) : null,
        odometerUnit: t.odometerUnit || null,
        odometerResultType: t.odometerResultType || null,
        regMarkAtTest: t.regMarkTimeOfTest || null,
        dataSource: t.dataSource || null,
        defects: Array.isArray(t.defects)
          ? t.defects.map((d) => ({
              type: d.type || null,
              text: d.text || null,
              dangerous: d.dangerous || false,
            }))
          : [],
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
      'UPDATE vehicles SET mot_tests = $1, mot_fetched_at = now() WHERE id = $2',
      [JSON.stringify(result.tests), vehicleId]
    );
    return result.tests;
  } catch (err) {
    console.error(`[mot] fetch failed for ${registration}: ${err.message}`);
    return null;
  }
}

module.exports = { fetchAndStoreMotHistory, fetchMotHistory };
