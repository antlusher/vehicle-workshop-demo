const axios = require('axios');
const fs = require('fs');
const path = require('path');

const REG_LOOKUP_API_URL = process.env.REG_LOOKUP_API_URL;
const REG_LOOKUP_API_KEY = process.env.REG_LOOKUP_API_KEY;
const dummyDataPath = path.join(__dirname, '..', 'data', 'vehicles.json');

const isVin = (value) => {
  if (!value) return false;
  const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return cleaned.length === 17 && /^[A-HJ-NPR-Z0-9]+$/.test(cleaned);
};

function loadDummyVehicles() {
  try {
    if (fs.existsSync(dummyDataPath)) {
      return JSON.parse(fs.readFileSync(dummyDataPath, 'utf8')) || [];
    }
  } catch (error) {
    // ignore parse errors and fallback to empty list
  }
  return [];
}

function findDummyVehicleByRegistration(cleaned) {
  const vehicles = loadDummyVehicles();
  return vehicles.find((vehicle) => vehicle.registration?.toUpperCase() === cleaned);
}

function findDummyVehicleByVin(cleanedVin) {
  const vehicles = loadDummyVehicles();
  return vehicles.find((vehicle) => vehicle.vin?.toUpperCase() === cleanedVin);
}

function normalizeVinData(result) {
  return {
    vin: result.VIN || null,
    make: result.Make || null,
    model: result.Model || null,
    year: result.ModelYear || null,
    engineCode: result.EngineModel || result.EngineManufacturer || null,
    fuelType: result.FuelTypePrimary || null,
    trim: result.Trim || null,
    bodyType: result.BodyClass || null,
    registration: null,
    source: 'nhtsa-vin',
  };
}

async function lookupByVin(vin) {
  const cleanedVin = vin?.trim().toUpperCase();
  if (!cleanedVin) {
    throw new Error('VIN is required for lookup');
  }

  const dummyVehicle = findDummyVehicleByVin(cleanedVin);
  if (dummyVehicle) {
    return {
      vin: dummyVehicle.vin,
      make: dummyVehicle.make,
      model: dummyVehicle.model,
      year: dummyVehicle.year,
      engineCode: dummyVehicle.engineCode,
      fuelType: dummyVehicle.fuelType,
      trim: dummyVehicle.trim,
      bodyType: dummyVehicle.bodyType,
      registration: dummyVehicle.registration,
      source: 'dummy-vin',
    };
  }

  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(cleanedVin)}?format=json`;
  try {
    const response = await axios.get(url);
    const result = response.data.Results?.[0] || {};
    return normalizeVinData(result);
  } catch (error) {
    return {
      vin: cleanedVin,
      make: null,
      model: null,
      year: null,
      engineCode: null,
      fuelType: null,
      trim: null,
      bodyType: null,
      registration: null,
      source: 'nhtsa-vin-fallback',
    };
  }
}

async function lookupByReg(registration) {
  const cleaned = registration?.trim().toUpperCase();
  if (!cleaned) {
    throw new Error('Registration number is required for lookup');
  }

  if (REG_LOOKUP_API_URL) {
    try {
      const headers = REG_LOOKUP_API_KEY
        ? { Authorization: `Bearer ${REG_LOOKUP_API_KEY}` }
        : {};
      const response = await axios.get(REG_LOOKUP_API_URL, {
        headers,
        params: { registration: cleaned },
      });
      const result = response.data || {};
      return {
        vin: result.vin || result.VIN || null,
        make: result.make || result.Make || null,
        model: result.model || result.Model || null,
        year: result.year || result.ModelYear || null,
        engineCode: result.engineCode || result.EngineCode || null,
        fuelType: result.fuelType || result.FuelType || null,
        trim: result.trim || null,
        bodyType: result.bodyType || result.BodyType || null,
        registration: cleaned,
        source: 'reg-provider',
      };
    } catch (error) {
      // fall through to local fallback
    }
  }

  const dummyVehicle = findDummyVehicleByRegistration(cleaned);
  if (dummyVehicle) {
    return {
      vin: dummyVehicle.vin,
      make: dummyVehicle.make,
      model: dummyVehicle.model,
      year: dummyVehicle.year,
      engineCode: dummyVehicle.engineCode,
      fuelType: dummyVehicle.fuelType,
      trim: dummyVehicle.trim,
      bodyType: dummyVehicle.bodyType,
      registration: dummyVehicle.registration,
      source: 'dummy-reg',
    };
  }

  return {
    vin: null,
    make: null,
    model: null,
    year: null,
    engineCode: null,
    fuelType: null,
    trim: null,
    bodyType: null,
    registration: cleaned,
    source: 'mock-reg',
    notes: 'Provide REG_LOOKUP_API_URL and REG_LOOKUP_API_KEY in .env to enable real registration lookup.',
  };
}

async function lookupVehicle(identifier) {
  if (!identifier) {
    throw new Error('An identifier is required');
  }
  if (isVin(identifier)) {
    return lookupByVin(identifier);
  }
  return lookupByReg(identifier);
}

module.exports = {
  lookupVehicle,
  lookupByVin,
  lookupByReg,
};
