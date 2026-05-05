const axios = require('axios');
const fs = require('fs');
const path = require('path');

const REG_LOOKUP_API_URL = process.env.REG_LOOKUP_API_URL;
const REG_LOOKUP_API_KEY = process.env.REG_LOOKUP_API_KEY;
const UKVD_API_KEY = process.env.UKVD_API_KEY;
const UKVD_PACKAGE_NAME = process.env.UKVD_PACKAGE_NAME;
const UKVD_BASE_URL = 'https://uk.api.vehicledataglobal.com/r2/lookup';
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

function normalizeUkvdData(data, inputReg, inputVin) {
  const vi = data.VehicleDetails?.VehicleIdentification || {};
  const vs = data.VehicleDetails?.VehicleStatus || {};
  const vh = data.VehicleDetails?.VehicleHistory || {};
  const dt = data.VehicleDetails?.DvlaTechnicalDetails || {};
  const mi = data.ModelDetails?.ModelIdentification || {};
  const bd = data.ModelDetails?.BodyDetails || {};
  const pt = data.ModelDetails?.Powertrain || {};
  const ice = pt.IceDetails || {};
  const tx = pt.Transmission || {};
  const perf = data.ModelDetails?.Performance || {};
  const dim = data.ModelDetails?.Dimensions || {};
  const wt = data.ModelDetails?.Weights || {};
  const em = data.ModelDetails?.Emissions || {};
  const vc = data.VehicleCodes || {};

  const make = mi.Make || vi.DvlaMake || null;
  const model = mi.Model || mi.Range || vi.DvlaModel || null;
  const year = vi.YearOfManufacture ? String(vi.YearOfManufacture) : null;
  const fuelType = pt.FuelType || vi.DvlaFuelType || null;
  const bodyType = bd.BodyStyle || vi.DvlaBodyType || null;

  const latestKeepers = vh.KeeperChangeList?.[0]?.NumberOfPreviousKeepers ?? null;
  const dateFirstReg = vi.DateFirstRegisteredInUk
    ? vi.DateFirstRegisteredInUk.split('T')[0]
    : null;

  const vehicleData = {
    colour: vh.ColourDetails?.CurrentColour || null,
    numberOfKeepers: latestKeepers,
    dateFirstRegistered: dateFirstReg,
    countryOfOrigin: mi.CountryOfOrigin || null,
    series: mi.Series || null,
    modelVariant: mi.ModelVariant || null,
    isScrapped: vs.IsScrapped || false,
    isExported: vs.IsExported || false,
    ukvdId: data.VehicleDetails?.UkvdId || null,
    uvc: vc.Uvc || null,
    engine: {
      description: ice.EngineDescription || null,
      engineNumber: dt.EngineNumber || null,
      manufacturer: ice.EngineManufacturer || null,
      capacityCc: ice.EngineCapacityCc || dt.EngineCapacityCc || null,
      capacityLitres: ice.EngineCapacityLitres || null,
      aspiration: ice.Aspiration || null,
      cylinders: ice.NumberOfCylinders || null,
      valveGear: ice.ValveGear || null,
      valvesPerCylinder: ice.ValvesPerCylinder || null,
    },
    transmission: {
      type: tx.TransmissionType || null,
      gears: tx.NumberOfGears || null,
      driveType: tx.DriveType || null,
      drivingAxle: tx.DrivingAxle || null,
    },
    performance: {
      powerBhp: perf.Power?.Bhp || null,
      powerKw: perf.Power?.Kw || null,
      torqueNm: perf.Torque?.Nm || null,
      torqueLbft: perf.Torque?.LbFt || null,
      maxSpeedMph: perf.Statistics?.MaxSpeedMph || null,
      zeroToSixtyMph: perf.Statistics?.ZeroToSixtyMph || null,
    },
    economy: {
      combinedMpg: perf.FuelEconomy?.CombinedMpg || null,
      urbanMpg: perf.FuelEconomy?.UrbanColdMpg || null,
      extraUrbanMpg: perf.FuelEconomy?.ExtraUrbanMpg || null,
      combinedL100km: perf.FuelEconomy?.CombinedL100Km || null,
    },
    emissions: {
      euroStatus: em.EuroStatus || null,
      co2: em.ManufacturerCo2 || null,
    },
    body: {
      style: bd.BodyStyle || vi.DvlaBodyType || null,
      shape: bd.BodyShape || null,
      cabType: bd.CabType || null,
      wheelbaseType: bd.WheelbaseType || null,
      numberOfDoors: bd.NumberOfDoors || null,
      numberOfSeats: bd.NumberOfSeats || dt.NumberOfSeats || null,
      payloadVolumeLitres: bd.PayloadVolumeLitres || null,
      fuelTankLitres: bd.FuelTankCapacityLitres || null,
    },
    dimensions: {
      lengthMm: dim.LengthMm || null,
      widthMm: dim.WidthMm || null,
      heightMm: dim.HeightMm || null,
      wheelbaseMm: dim.WheelbaseLengthMm || null,
    },
    weights: {
      kerbKg: wt.KerbWeightKg || null,
      grossKg: wt.GrossVehicleWeightKg || dt.GrossWeightKg || null,
      payloadKg: wt.PayloadWeightKg || null,
    },
  };

  return {
    vin: vi.Vin && vi.Vin !== 'Permission Required' ? vi.Vin : (inputVin || null),
    make,
    model,
    year,
    engineCode: dt.EngineNumber || ice.EngineDescription || null,
    fuelType,
    trim: mi.Series || null,
    bodyType,
    registration: vi.Vrm || inputReg || null,
    source: 'ukvd',
    vehicleData,
  };
}

async function lookupByUkvd(params) {
  if (!UKVD_API_KEY || !UKVD_PACKAGE_NAME) return null;
  try {
    const response = await axios.get(UKVD_BASE_URL, {
      params: { ApiKey: UKVD_API_KEY, PackageName: UKVD_PACKAGE_NAME, ...params },
      timeout: 8000,
    });
    const body = response.data || {};
    const statusCode = body.ResponseInformation?.StatusCode ?? body.StatusCode;
    if (statusCode !== 0 && !body.ResponseInformation?.IsSuccessStatusCode) return null;
    const results = body.Results?.[0] || body.Results || body;
    if (!results || (!results.VehicleDetails && !results.ModelDetails)) return null;
    return results;
  } catch {
    return null;
  }
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

  const ukvdResult = await lookupByUkvd({ Vin: cleanedVin });
  if (ukvdResult) return normalizeUkvdData(ukvdResult, null, cleanedVin);

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

  const ukvdResult = await lookupByUkvd({ Vrm: cleaned });
  if (ukvdResult) return normalizeUkvdData(ukvdResult, cleaned, null);

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
