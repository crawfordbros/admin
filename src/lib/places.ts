import { config } from "../config";

// Address suggestions from Google Places API (New), through the Maps JavaScript API
// (ADMIN_PORTAL_SPEC section 8.1). The script loads the first time a form asks for it. Without a
// key, or if Google can't be reached, the address field stays a plain text field.

type AddressComponent = { longText: string | null; shortText: string | null; types: string[] };

type PlacesLib = {
  AutocompleteSessionToken: new () => unknown;
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions(request: {
      input: string;
      sessionToken: unknown;
      includedRegionCodes: string[];
      locationBias: { center: { lat: number; lng: number }; radius: number };
    }): Promise<{ suggestions: { placePrediction: Prediction | null }[] }>;
  };
};
type Prediction = {
  placeId: string;
  mainText: { text: string } | null;
  secondaryText: { text: string } | null;
  text: { text: string };
  toPlace(): {
    fetchFields(req: { fields: string[] }): Promise<unknown>;
    id: string;
    displayName: string | null;
    types: string[] | null;
    addressComponents: AddressComponent[] | null;
    location: { lat(): number; lng(): number } | null;
  };
};

export type Suggestion = { placeId: string; main: string; secondary: string; prediction: Prediction };

export type PlaceAddress = {
  address: string;
  city: string;
  county: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  googlePlaceId: string;
  /** The place's name when it's a business or apartment community, to suggest as the property name. */
  establishment: string | null;
};

// Downtown Atlanta, where nearly every CBES community is.
const ATLANTA = { lat: 33.749, lng: -84.388 };

let loading: Promise<PlacesLib> | null = null;

function loadPlaces(): Promise<PlacesLib> {
  if (loading) return loading;
  loading = new Promise<PlacesLib>((resolve, reject) => {
    const w = window as unknown as Record<string, unknown> & { google?: { maps: { importLibrary(name: string): Promise<unknown> } } };
    const callback = "__cbesMapsReady";
    w[callback] = () => w.google!.maps.importLibrary("places").then((lib) => resolve(lib as PlacesLib), reject);
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(config.googleMapsApiKey)}&v=weekly&loading=async&callback=${callback}`;
    script.async = true;
    script.onerror = () => reject(new Error("Google Maps didn't load"));
    document.head.append(script);
  }).catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}

export const placesAvailable = () => Boolean(config.googleMapsApiKey);

/** One session per open form: suggestions and the chosen place's details are billed together. */
export function placesSession() {
  let token: unknown = null;
  return {
    async suggest(input: string): Promise<Suggestion[]> {
      const lib = await loadPlaces();
      token ??= new lib.AutocompleteSessionToken();
      const { suggestions } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        sessionToken: token,
        includedRegionCodes: ["us"],
        locationBias: { center: ATLANTA, radius: 60_000 },
      });
      return suggestions
        .map((s) => s.placePrediction)
        .filter((p): p is Prediction => p !== null)
        .slice(0, 5)
        .map((p) => ({ placeId: p.placeId, main: p.mainText?.text ?? p.text.text, secondary: p.secondaryText?.text ?? "", prediction: p }));
    },
    async details(s: Suggestion): Promise<PlaceAddress> {
      const place = s.prediction.toPlace();
      await place.fetchFields({ fields: ["addressComponents", "location", "displayName", "types", "id"] });
      token = null;
      return {
        ...parseAddress(place.addressComponents ?? []),
        lat: place.location?.lat() ?? null,
        lng: place.location?.lng() ?? null,
        googlePlaceId: place.id,
        establishment: place.types?.some((t) => t === "establishment" || t === "premise") && place.displayName ? place.displayName : null,
      };
    },
  };
}

/** Street, city, county and ZIP from Google's address components. */
export function parseAddress(components: AddressComponent[]): Pick<PlaceAddress, "address" | "city" | "county" | "zip"> {
  const get = (...types: string[]) => {
    for (const type of types) {
      const c = components.find((x) => x.types.includes(type));
      if (c) return c.longText ?? c.shortText ?? "";
    }
    return "";
  };
  const street = [get("street_number"), components.find((x) => x.types.includes("route"))?.shortText ?? ""].filter(Boolean).join(" ");
  return {
    address: street,
    city: get("locality", "sublocality", "postal_town", "neighborhood"),
    county: get("administrative_area_level_2").replace(/ County$/, ""),
    zip: get("postal_code"),
  };
}

/** A 600×260 map image with one pin. */
export function staticMapUrl(lat: number, lng: number) {
  const at = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  return `https://maps.googleapis.com/maps/api/staticmap?center=${at}&zoom=16&size=600x260&scale=2&markers=color:0x272b84%7C${at}&key=${encodeURIComponent(config.googleMapsApiKey)}`;
}
