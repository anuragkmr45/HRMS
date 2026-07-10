export interface IndiaLocationRecord {
  id: string;
  type: "city" | "state";
  city: string | null;
  state: string;
  country: "India";
  country_code: "IN";
  label: string;
  value: string;
}

const country = "India" as const;
const countryCode = "IN" as const;

const states = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry"
] as const;

const cities: Array<{ city: string; state: string }> = [
  { city: "Visakhapatnam", state: "Andhra Pradesh" },
  { city: "Vijayawada", state: "Andhra Pradesh" },
  { city: "Guntur", state: "Andhra Pradesh" },
  { city: "Nellore", state: "Andhra Pradesh" },
  { city: "Tirupati", state: "Andhra Pradesh" },
  { city: "Kurnool", state: "Andhra Pradesh" },
  { city: "Rajahmundry", state: "Andhra Pradesh" },
  { city: "Itanagar", state: "Arunachal Pradesh" },
  { city: "Naharlagun", state: "Arunachal Pradesh" },
  { city: "Tawang", state: "Arunachal Pradesh" },
  { city: "Guwahati", state: "Assam" },
  { city: "Dispur", state: "Assam" },
  { city: "Dibrugarh", state: "Assam" },
  { city: "Silchar", state: "Assam" },
  { city: "Jorhat", state: "Assam" },
  { city: "Tezpur", state: "Assam" },
  { city: "Patna", state: "Bihar" },
  { city: "Gaya", state: "Bihar" },
  { city: "Muzaffarpur", state: "Bihar" },
  { city: "Bhagalpur", state: "Bihar" },
  { city: "Darbhanga", state: "Bihar" },
  { city: "Purnia", state: "Bihar" },
  { city: "Raipur", state: "Chhattisgarh" },
  { city: "Bilaspur", state: "Chhattisgarh" },
  { city: "Durg", state: "Chhattisgarh" },
  { city: "Bhilai", state: "Chhattisgarh" },
  { city: "Korba", state: "Chhattisgarh" },
  { city: "Panaji", state: "Goa" },
  { city: "Margao", state: "Goa" },
  { city: "Vasco da Gama", state: "Goa" },
  { city: "Mapusa", state: "Goa" },
  { city: "Ahmedabad", state: "Gujarat" },
  { city: "Surat", state: "Gujarat" },
  { city: "Vadodara", state: "Gujarat" },
  { city: "Rajkot", state: "Gujarat" },
  { city: "Gandhinagar", state: "Gujarat" },
  { city: "Jamnagar", state: "Gujarat" },
  { city: "Bhavnagar", state: "Gujarat" },
  { city: "Junagadh", state: "Gujarat" },
  { city: "Gurugram", state: "Haryana" },
  { city: "Faridabad", state: "Haryana" },
  { city: "Panipat", state: "Haryana" },
  { city: "Ambala", state: "Haryana" },
  { city: "Hisar", state: "Haryana" },
  { city: "Karnal", state: "Haryana" },
  { city: "Rohtak", state: "Haryana" },
  { city: "Shimla", state: "Himachal Pradesh" },
  { city: "Dharamshala", state: "Himachal Pradesh" },
  { city: "Mandi", state: "Himachal Pradesh" },
  { city: "Solan", state: "Himachal Pradesh" },
  { city: "Kullu", state: "Himachal Pradesh" },
  { city: "Ranchi", state: "Jharkhand" },
  { city: "Jamshedpur", state: "Jharkhand" },
  { city: "Dhanbad", state: "Jharkhand" },
  { city: "Bokaro", state: "Jharkhand" },
  { city: "Hazaribagh", state: "Jharkhand" },
  { city: "Deoghar", state: "Jharkhand" },
  { city: "Bengaluru", state: "Karnataka" },
  { city: "Mysuru", state: "Karnataka" },
  { city: "Mangaluru", state: "Karnataka" },
  { city: "Hubballi", state: "Karnataka" },
  { city: "Dharwad", state: "Karnataka" },
  { city: "Belagavi", state: "Karnataka" },
  { city: "Ballari", state: "Karnataka" },
  { city: "Davanagere", state: "Karnataka" },
  { city: "Shivamogga", state: "Karnataka" },
  { city: "Tumakuru", state: "Karnataka" },
  { city: "Udupi", state: "Karnataka" },
  { city: "Kalaburagi", state: "Karnataka" },
  { city: "Thiruvananthapuram", state: "Kerala" },
  { city: "Kochi", state: "Kerala" },
  { city: "Kozhikode", state: "Kerala" },
  { city: "Thrissur", state: "Kerala" },
  { city: "Kollam", state: "Kerala" },
  { city: "Kannur", state: "Kerala" },
  { city: "Alappuzha", state: "Kerala" },
  { city: "Palakkad", state: "Kerala" },
  { city: "Kottayam", state: "Kerala" },
  { city: "Bhopal", state: "Madhya Pradesh" },
  { city: "Indore", state: "Madhya Pradesh" },
  { city: "Gwalior", state: "Madhya Pradesh" },
  { city: "Jabalpur", state: "Madhya Pradesh" },
  { city: "Ujjain", state: "Madhya Pradesh" },
  { city: "Sagar", state: "Madhya Pradesh" },
  { city: "Rewa", state: "Madhya Pradesh" },
  { city: "Mumbai", state: "Maharashtra" },
  { city: "Pune", state: "Maharashtra" },
  { city: "Nagpur", state: "Maharashtra" },
  { city: "Nashik", state: "Maharashtra" },
  { city: "Thane", state: "Maharashtra" },
  { city: "Navi Mumbai", state: "Maharashtra" },
  { city: "Chhatrapati Sambhajinagar", state: "Maharashtra" },
  { city: "Solapur", state: "Maharashtra" },
  { city: "Kolhapur", state: "Maharashtra" },
  { city: "Amravati", state: "Maharashtra" },
  { city: "Nanded", state: "Maharashtra" },
  { city: "Sangli", state: "Maharashtra" },
  { city: "Imphal", state: "Manipur" },
  { city: "Shillong", state: "Meghalaya" },
  { city: "Tura", state: "Meghalaya" },
  { city: "Aizawl", state: "Mizoram" },
  { city: "Lunglei", state: "Mizoram" },
  { city: "Kohima", state: "Nagaland" },
  { city: "Dimapur", state: "Nagaland" },
  { city: "Bhubaneswar", state: "Odisha" },
  { city: "Cuttack", state: "Odisha" },
  { city: "Rourkela", state: "Odisha" },
  { city: "Puri", state: "Odisha" },
  { city: "Sambalpur", state: "Odisha" },
  { city: "Berhampur", state: "Odisha" },
  { city: "Ludhiana", state: "Punjab" },
  { city: "Amritsar", state: "Punjab" },
  { city: "Jalandhar", state: "Punjab" },
  { city: "Patiala", state: "Punjab" },
  { city: "Bathinda", state: "Punjab" },
  { city: "Mohali", state: "Punjab" },
  { city: "Jaipur", state: "Rajasthan" },
  { city: "Jodhpur", state: "Rajasthan" },
  { city: "Udaipur", state: "Rajasthan" },
  { city: "Kota", state: "Rajasthan" },
  { city: "Ajmer", state: "Rajasthan" },
  { city: "Bikaner", state: "Rajasthan" },
  { city: "Alwar", state: "Rajasthan" },
  { city: "Gangtok", state: "Sikkim" },
  { city: "Chennai", state: "Tamil Nadu" },
  { city: "Coimbatore", state: "Tamil Nadu" },
  { city: "Madurai", state: "Tamil Nadu" },
  { city: "Tiruchirappalli", state: "Tamil Nadu" },
  { city: "Salem", state: "Tamil Nadu" },
  { city: "Tirunelveli", state: "Tamil Nadu" },
  { city: "Vellore", state: "Tamil Nadu" },
  { city: "Erode", state: "Tamil Nadu" },
  { city: "Thanjavur", state: "Tamil Nadu" },
  { city: "Tiruppur", state: "Tamil Nadu" },
  { city: "Hyderabad", state: "Telangana" },
  { city: "Secunderabad", state: "Telangana" },
  { city: "Warangal", state: "Telangana" },
  { city: "Karimnagar", state: "Telangana" },
  { city: "Nizamabad", state: "Telangana" },
  { city: "Khammam", state: "Telangana" },
  { city: "Agartala", state: "Tripura" },
  { city: "Lucknow", state: "Uttar Pradesh" },
  { city: "Kanpur", state: "Uttar Pradesh" },
  { city: "Ghaziabad", state: "Uttar Pradesh" },
  { city: "Noida", state: "Uttar Pradesh" },
  { city: "Greater Noida", state: "Uttar Pradesh" },
  { city: "Varanasi", state: "Uttar Pradesh" },
  { city: "Agra", state: "Uttar Pradesh" },
  { city: "Prayagraj", state: "Uttar Pradesh" },
  { city: "Meerut", state: "Uttar Pradesh" },
  { city: "Bareilly", state: "Uttar Pradesh" },
  { city: "Aligarh", state: "Uttar Pradesh" },
  { city: "Moradabad", state: "Uttar Pradesh" },
  { city: "Gorakhpur", state: "Uttar Pradesh" },
  { city: "Mathura", state: "Uttar Pradesh" },
  { city: "Dehradun", state: "Uttarakhand" },
  { city: "Haridwar", state: "Uttarakhand" },
  { city: "Roorkee", state: "Uttarakhand" },
  { city: "Haldwani", state: "Uttarakhand" },
  { city: "Rishikesh", state: "Uttarakhand" },
  { city: "Nainital", state: "Uttarakhand" },
  { city: "Kolkata", state: "West Bengal" },
  { city: "Howrah", state: "West Bengal" },
  { city: "Durgapur", state: "West Bengal" },
  { city: "Asansol", state: "West Bengal" },
  { city: "Siliguri", state: "West Bengal" },
  { city: "Darjeeling", state: "West Bengal" },
  { city: "Kharagpur", state: "West Bengal" },
  { city: "Port Blair", state: "Andaman and Nicobar Islands" },
  { city: "Chandigarh", state: "Chandigarh" },
  { city: "Daman", state: "Dadra and Nagar Haveli and Daman and Diu" },
  { city: "Diu", state: "Dadra and Nagar Haveli and Daman and Diu" },
  { city: "Silvassa", state: "Dadra and Nagar Haveli and Daman and Diu" },
  { city: "New Delhi", state: "Delhi" },
  { city: "Delhi", state: "Delhi" },
  { city: "Jammu", state: "Jammu and Kashmir" },
  { city: "Srinagar", state: "Jammu and Kashmir" },
  { city: "Leh", state: "Ladakh" },
  { city: "Kargil", state: "Ladakh" },
  { city: "Kavaratti", state: "Lakshadweep" },
  { city: "Puducherry", state: "Puducherry" }
];

const cityLocations: IndiaLocationRecord[] = cities.map((item) => {
  const label = `${item.city}, ${item.state}, ${country}`;
  return {
    id: `city:${slug(item.city)}:${slug(item.state)}`,
    type: "city",
    city: item.city,
    state: item.state,
    country,
    country_code: countryCode,
    label,
    value: label
  };
});

const stateLocations: IndiaLocationRecord[] = states.map((state) => {
  const label = `${state}, ${country}`;
  return {
    id: `state:${slug(state)}`,
    type: "state",
    city: null,
    state,
    country,
    country_code: countryCode,
    label,
    value: label
  };
});

const allLocations = [...cityLocations, ...stateLocations];

export function searchIndiaLocations(search = "", limit = 30): IndiaLocationRecord[] {
  const query = normalize(search);
  const boundedLimit = Math.min(Math.max(limit, 1), 100);

  if (!query) {
    return cityLocations.slice(0, boundedLimit);
  }

  return allLocations
    .map((location) => ({ location, score: scoreLocation(location, query) }))
    .filter((entry) => entry.score < Number.POSITIVE_INFINITY)
    .sort((left, right) => left.score - right.score || left.location.label.localeCompare(right.location.label))
    .slice(0, boundedLimit)
    .map((entry) => entry.location);
}

function scoreLocation(location: IndiaLocationRecord, query: string): number {
  const city = normalize(location.city ?? "");
  const state = normalize(location.state);
  const label = normalize(location.label);

  if (city === query) return 0;
  if (city.startsWith(query)) return 1;
  if (state === query && location.type === "state") return 2;
  if (state.startsWith(query) && location.type === "state") return 3;
  if (city.includes(query)) return 4;
  if (state.includes(query)) return location.type === "state" ? 5 : 6;
  if (label.includes(query)) return 7;
  return Number.POSITIVE_INFINITY;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function slug(value: string): string {
  return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
