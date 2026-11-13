import { RechargeServiceType } from "../models/StoreRechargeOrder";

export interface A1CircleDefinition {
  code: string;
  name: string;
  alias?: string[];
}

export interface A1OperatorDefinition {
  id: string; // Internal app operator identifier (e.g. "AIRTEL", "JIO")
  code: string; // A1Topup provider operator code (e.g. "A", "RC")
  name: string;
  serviceType: RechargeServiceType;
  category: string;
  requiresCircle?: boolean;
  requiresValue1?: boolean;
  value1Label?: string;
  value1Placeholder?: string;
  requiresValue2?: boolean;
  value2Label?: string;
  value2Placeholder?: string;
}

/**
 * Documented A1Topup circle code mappings.
 * Haryana mobile circle code is explicitly 20.
 */
export const A1_CIRCLES: Record<string, A1CircleDefinition> = {
  HARYANA: { code: "20", name: "Haryana", alias: ["HR", "HARYANA", "20"] },
  DELHI: { code: "1", name: "Delhi & NCR", alias: ["DL", "DELHI", "1"] },
  MUMBAI: { code: "2", name: "Mumbai", alias: ["MUMBAI", "2"] },
  KOLKATA: { code: "3", name: "Kolkata", alias: ["KOLKATA", "3"] },
  MAHARASHTRA: { code: "4", name: "Maharashtra & Goa", alias: ["MH", "MAHARASHTRA", "4"] },
  GUJARAT: { code: "5", name: "Gujarat", alias: ["GJ", "GUJARAT", "5"] },
  UP_EAST: { code: "6", name: "UP (East)", alias: ["UPE", "UP_EAST", "6"] },
  UP_WEST: { code: "7", name: "UP (West) & Uttarakhand", alias: ["UPW", "UP_WEST", "7"] },
  PUNJAB: { code: "8", name: "Punjab", alias: ["PB", "PUNJAB", "8"] },
  RAJASTHAN: { code: "9", name: "Rajasthan", alias: ["RJ", "RAJASTHAN", "9"] },
  MADHYA_PRADESH: { code: "10", name: "Madhya Pradesh & Chhattisgarh", alias: ["MP", "10"] },
  WEST_BENGAL: { code: "11", name: "West Bengal", alias: ["WB", "11"] },
  ANDHRA_PRADESH: { code: "12", name: "Andhra Pradesh & Telangana", alias: ["AP", "12"] },
  TAMIL_NADU: { code: "13", name: "Tamil Nadu", alias: ["TN", "13"] },
  KARNATAKA: { code: "14", name: "Karnataka", alias: ["KA", "14"] },
  KERALA: { code: "15", name: "Kerala", alias: ["KL", "15"] },
  CHENNAI: { code: "16", name: "Chennai", alias: ["CHENNAI", "16"] },
  ORISSA: { code: "17", name: "Orissa", alias: ["OR", "17"] },
  BIHAR_JHARKHAND: { code: "18", name: "Bihar & Jharkhand", alias: ["BR", "18"] },
  HIMACHAL_PRADESH: { code: "19", name: "Himachal Pradesh", alias: ["HP", "19"] },
  JAMMU_KASHMIR: { code: "21", name: "Jammu & Kashmir", alias: ["JK", "21"] },
  NORTH_EAST: { code: "22", name: "North East", alias: ["NE", "22"] },
  ASSAM: { code: "23", name: "Assam", alias: ["AS", "23"] },
};

export const DEFAULT_A1_CIRCLE_CODE = "20"; // Haryana (State code 06 / Circle code 20)

/**
 * Resolves circle input string to provider circle code.
 * Defaults to "20" (Haryana).
 */
export function resolveA1CircleCode(circleInput?: string | null): string {
  if (!circleInput) return DEFAULT_A1_CIRCLE_CODE;
  const upper = circleInput.trim().toUpperCase();

  // If already numeric circle code
  if (/^\d+$/.test(upper)) {
    return upper;
  }

  for (const [key, def] of Object.entries(A1_CIRCLES)) {
    if (key === upper || def.name.toUpperCase() === upper) {
      return def.code;
    }
    if (def.alias && def.alias.some((a) => a.toUpperCase() === upper)) {
      return def.code;
    }
  }

  return DEFAULT_A1_CIRCLE_CODE;
}

/**
 * Documented A1Topup operator mappings across all services.
 */
export const A1_OPERATORS: A1OperatorDefinition[] = [
  // --- Mobile Prepaid ---
  {
    id: "AIRTEL",
    code: "A",
    name: "Bharti Airtel",
    serviceType: "MOBILE_PREPAID",
    category: "Mobile Prepaid",
    requiresCircle: true,
  },
  {
    id: "VI",
    code: "V",
    name: "Vodafone Idea (Vi)",
    serviceType: "MOBILE_PREPAID",
    category: "Mobile Prepaid",
    requiresCircle: true,
  },
  {
    id: "JIO",
    code: "RC",
    name: "Reliance Jio",
    serviceType: "MOBILE_PREPAID",
    category: "Mobile Prepaid",
    requiresCircle: true,
  },
  {
    id: "BSNL",
    code: "BT",
    name: "BSNL Topup",
    serviceType: "MOBILE_PREPAID",
    category: "Mobile Prepaid",
    requiresCircle: true,
  },
  {
    id: "BSNL_STV",
    code: "BR",
    name: "BSNL Special Tariff (STV)",
    serviceType: "MOBILE_PREPAID",
    category: "Mobile Prepaid",
    requiresCircle: true,
  },
  {
    id: "IDEA",
    code: "I",
    name: "Idea Cellular",
    serviceType: "MOBILE_PREPAID",
    category: "Mobile Prepaid",
    requiresCircle: true,
  },

  // --- DTH ---
  {
    id: "AIRTEL_DTH",
    code: "ATV",
    name: "Airtel Digital TV",
    serviceType: "DTH",
    category: "Television",
  },
  {
    id: "SUN_DIRECT",
    code: "STV",
    name: "Sun Direct DTH",
    serviceType: "DTH",
    category: "Television",
  },
  {
    id: "TATA_PLAY",
    code: "TTV",
    name: "Tata Play (Tata Sky)",
    serviceType: "DTH",
    category: "Television",
  },
  {
    id: "VIDEOCON_D2H",
    code: "VTV",
    name: "Videocon D2H",
    serviceType: "DTH",
    category: "Television",
  },
  {
    id: "DISH_TV",
    code: "DTV",
    name: "Dish TV",
    serviceType: "DTH",
    category: "Television",
  },

  // --- Mobile Postpaid ---
  {
    id: "AIRTEL_POSTPAID",
    code: "AP",
    name: "Airtel Postpaid",
    serviceType: "MOBILE_POSTPAID",
    category: "Mobile Postpaid",
  },
  {
    id: "VI_POSTPAID",
    code: "VP",
    name: "Vodafone Idea Postpaid",
    serviceType: "MOBILE_POSTPAID",
    category: "Mobile Postpaid",
  },
  {
    id: "JIO_POSTPAID",
    code: "RP",
    name: "Reliance Jio Postpaid",
    serviceType: "MOBILE_POSTPAID",
    category: "Mobile Postpaid",
  },
  {
    id: "BSNL_POSTPAID",
    code: "BP",
    name: "BSNL Postpaid",
    serviceType: "MOBILE_POSTPAID",
    category: "Mobile Postpaid",
  },
  {
    id: "IDEA_POSTPAID",
    code: "IP",
    name: "Idea Postpaid",
    serviceType: "MOBILE_POSTPAID",
    category: "Mobile Postpaid",
  },

  // --- Electricity ---
  {
    id: "DHBVN",
    code: "DHBVN",
    name: "Dakshin Haryana Bijli Vitran Nigam (DHBVN)",
    serviceType: "ELECTRICITY",
    category: "Haryana Power",
  },
  {
    id: "UHBVN",
    code: "UHBVN",
    name: "Uttar Haryana Bijli Vitran Nigam (UHBVN)",
    serviceType: "ELECTRICITY",
    category: "Haryana Power",
  },
  {
    id: "BSES_DELHI",
    code: "BRD",
    name: "BSES Rajdhani Delhi",
    serviceType: "ELECTRICITY",
    category: "Delhi Power",
  },
  {
    id: "BSES_YAMUNA",
    code: "BYD",
    name: "BSES Yamuna Delhi",
    serviceType: "ELECTRICITY",
    category: "Delhi Power",
  },
  {
    id: "TATA_POWER",
    code: "TPD",
    name: "Tata Power Delhi",
    serviceType: "ELECTRICITY",
    category: "Delhi Power",
  },
  {
    id: "PSPCL",
    code: "PSPCL",
    name: "Punjab State Power Corporation (PSPCL)",
    serviceType: "ELECTRICITY",
    category: "Punjab Power",
  },
  {
    id: "BESCOM",
    code: "BESCOM",
    name: "BESCOM Karnataka",
    serviceType: "ELECTRICITY",
    category: "Power",
  },

  // --- Gas ---
  {
    id: "IGL",
    code: "IGL",
    name: "Indraprastha Gas Limited (IGL)",
    serviceType: "GAS",
    category: "Gas Utility",
  },
  {
    id: "MAHANAGAR_GAS",
    code: "MGL",
    name: "Mahanagar Gas Limited (MGL)",
    serviceType: "GAS",
    category: "Gas Utility",
    requiresValue1: true,
    value1Label: "Bill Group Number",
    value1Placeholder: "e.g. 101",
  },
  {
    id: "HARYANA_CITY_GAS",
    code: "HCG",
    name: "Haryana City Gas",
    serviceType: "GAS",
    category: "Gas Utility",
  },
  {
    id: "GUJARAT_GAS",
    code: "GG",
    name: "Gujarat Gas Ltd",
    serviceType: "GAS",
    category: "Gas Utility",
  },
  {
    id: "ADANI_GAS",
    code: "ATG",
    name: "Adani Total Gas Ltd",
    serviceType: "GAS",
    category: "Gas Utility",
  },

  // --- Insurance ---
  {
    id: "LIC",
    code: "LIC",
    name: "Life Insurance Corporation of India (LIC)",
    serviceType: "INSURANCE",
    category: "Insurance",
    requiresValue1: true,
    value1Label: "Date of Birth (DD/MM/YYYY)",
    value1Placeholder: "DD/MM/YYYY",
  },
  {
    id: "ICICI_PRUDENTIAL",
    code: "ICICIPRU",
    name: "ICICI Prudential Life Insurance",
    serviceType: "INSURANCE",
    category: "Insurance",
    requiresValue1: true,
    value1Label: "Date of Birth (DD/MM/YYYY)",
    value1Placeholder: "DD/MM/YYYY",
  },
  {
    id: "HDFC_LIFE",
    code: "HDFCLIFE",
    name: "HDFC Life Insurance",
    serviceType: "INSURANCE",
    category: "Insurance",
  },
  {
    id: "SBI_LIFE",
    code: "SBILIFE",
    name: "SBI Life Insurance",
    serviceType: "INSURANCE",
    category: "Insurance",
  },

  // --- Landline ---
  {
    id: "AIRTEL_LANDLINE",
    code: "AL",
    name: "Airtel Landline / Broadband",
    serviceType: "LANDLINE",
    category: "Landline",
    requiresValue1: true,
    value1Label: "STD Code (without leading 0)",
    value1Placeholder: "e.g. 1666",
  },
  {
    id: "BSNL_LANDLINE",
    code: "BL",
    name: "BSNL Landline",
    serviceType: "LANDLINE",
    category: "Landline",
    requiresValue1: true,
    value1Label: "STD Code (without leading 0)",
    value1Placeholder: "e.g. 1666",
    requiresValue2: true,
    value2Label: "Account Number",
    value2Placeholder: "BSNL Account Number",
  },
  {
    id: "MTNL_DELHI",
    code: "MTNLD",
    name: "MTNL Delhi Landline",
    serviceType: "LANDLINE",
    category: "Landline",
    requiresValue1: true,
    value1Label: "STD Code",
    value1Placeholder: "011",
  },

  // --- FASTag ---
  {
    id: "NHAI",
    code: "NHAI",
    name: "NHAI FASTag",
    serviceType: "FASTAG",
    category: "Toll",
  },
  {
    id: "ICICI_FASTAG",
    code: "ICICI_FASTAG",
    name: "ICICI Bank FASTag",
    serviceType: "FASTAG",
    category: "Toll",
  },

  // --- Water ---
  {
    id: "DELHI_JAL",
    code: "DJB",
    name: "Delhi Jal Board",
    serviceType: "WATER",
    category: "Water Utility",
  },
  {
    id: "HARYANA_HSVP",
    code: "HSVP",
    name: "HSVP (HUDA) Water Haryana",
    serviceType: "WATER",
    category: "Water Utility",
  },
];

/**
 * Resolves operator identifier (internal id or provider code) to A1OperatorDefinition.
 */
export function findA1Operator(operatorIdentifier: string): A1OperatorDefinition | undefined {
  const norm = operatorIdentifier.trim().toUpperCase();
  return A1_OPERATORS.find(
    (op) => op.id.toUpperCase() === norm || op.code.toUpperCase() === norm,
  );
}

/**
 * Returns list of operators for a specific recharge service type.
 */
export function getA1OperatorsForService(
  serviceType: RechargeServiceType,
): A1OperatorDefinition[] {
  return A1_OPERATORS.filter((op) => op.serviceType === serviceType);
}

