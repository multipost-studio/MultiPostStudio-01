/**
 * Google Business Profile API Client.
 *
 * Official Google APIs integrated:
 * 1. My Business Account Management API (mybusinessaccountmanagement.googleapis.com/v1)
 *    - Account discovery: accounts.list
 * 2. My Business Business Information API (mybusinessbusinessinformation.googleapis.com/v1)
 *    - Location discovery: accounts.locations.list
 * 3. Google Business Profile Local Posts API (mybusiness.googleapis.com/v4)
 *    - Publishing local posts: accounts.locations.localPosts.create
 * 4. Google OAuth 2.0 (accounts.google.com & oauth2.googleapis.com)
 *    - Token exchange, refresh, revocation
 *
 * Scope required:
 *   https://www.googleapis.com/auth/business.manage
 */

export class GbpApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "GbpApiError";
  }
}

export type GbpAccount = {
  name: string; // e.g. "accounts/1029384756"
  accountName: string; // e.g. "Acme Business Group" or "Personal Account"
  type: string; // "PERSONAL" | "LOCATION_GROUP" | "USER_GROUP" | "ORGANIZATION"
  role?: string; // "OWNER" | "CO_OWNER" | "MANAGER"
  state?: string;
};

export type GbpPostalAddress = {
  addressLines?: string[];
  locality?: string;
  administrativeArea?: string;
  postalCode?: string;
  regionCode?: string;
};

export type GbpLocation = {
  name: string; // e.g. "locations/9876543210" or "accounts/123/locations/456"
  title: string; // Business name / Location title (e.g. "Acme Hyderabad")
  storeCode?: string;
  storefrontAddress?: GbpPostalAddress;
  websiteUri?: string;
  phoneNumbers?: {
    primaryPhone?: string;
    additionalPhones?: string[];
  };
  categories?: {
    primaryCategory?: { displayName?: string; name?: string };
    additionalCategories?: { displayName?: string; name?: string }[];
  };
  metadata?: {
    mapsUri?: string;
    placeId?: string;
  };
  profile?: {
    description?: string;
  };
  accountName?: string; // "accounts/1029384756"
  accountTitle?: string;
};

export type GbpActionType =
  | "ACTION_TYPE_UNSPECIFIED"
  | "BOOK"
  | "ORDER"
  | "SHOP"
  | "LEARN_MORE"
  | "SIGN_UP"
  | "CALL";

export type GbpCallToAction = {
  actionType: GbpActionType;
  url?: string;
};

export type GbpDate = {
  year: number;
  month: number;
  day: number;
};

export type GbpTimeOfDay = {
  hours: number;
  minutes: number;
  seconds?: number;
  nanos?: number;
};

export type GbpTimeInterval = {
  startDate: GbpDate;
  startTime?: GbpTimeOfDay;
  endDate: GbpDate;
  endTime?: GbpTimeOfDay;
};

export type GbpEventSchedule = {
  title: string;
  schedule: GbpTimeInterval;
};

export type GbpOfferDetails = {
  couponCode?: string;
  redeemOnlineUrl?: string;
  termsConditions?: string;
};

export type GbpPostTopicType = "STANDARD" | "EVENT" | "OFFER" | "ALERT";

export type GbpPostMedia = {
  mediaFormat: "PHOTO" | "VIDEO";
  sourceUrl: string;
};

export type GbpPostPayload = {
  languageCode?: string;
  summary: string;
  callToAction?: GbpCallToAction;
  media?: GbpPostMedia[];
  topicType: GbpPostTopicType;
  event?: GbpEventSchedule;
  offer?: GbpOfferDetails;
};

export type GbpPostResponse = {
  name: string; // e.g. "accounts/123/locations/456/localPosts/789"
  languageCode?: string;
  summary?: string;
  callToAction?: GbpCallToAction;
  createTime?: string;
  updateTime?: string;
  event?: GbpEventSchedule;
  state?: "LOCAL_POST_STATE_UNSPECIFIED" | "REJECTED" | "LIVE" | "PROCESSING";
  searchUrl?: string;
  topicType?: GbpPostTopicType;
  offer?: GbpOfferDetails;
};

function formatGbpError(status: number, bodyText: string): string {
  let errorMsg = "";
  try {
    const parsed = JSON.parse(bodyText);
    if (parsed?.error?.message) {
      errorMsg = parsed.error.message;
    }
  } catch {
    errorMsg = bodyText.slice(0, 300);
  }

  switch (status) {
    case 401:
      return "Google Business Profile authorization expired — reconnect";
    case 403:
      return errorMsg.toLowerCase().includes("permission") || errorMsg.toLowerCase().includes("scope")
        ? `Google Business Profile access denied: ${errorMsg}`
        : `Google Business Profile forbidden: ${errorMsg}`;
    case 404:
      return "Google Business Profile location or account not found";
    case 429:
      return "Google Business Profile API rate limit / quota exceeded — please retry later";
    default:
      return status >= 500
        ? `Google Business Profile service is temporarily unavailable (${status})`
        : `Google Business Profile error (${status}): ${errorMsg || "Unknown error"}`;
  }
}

/**
 * Discovers accessible Google Business Profile accounts for the authenticated user.
 * Endpoint: https://mybusinessaccountmanagement.googleapis.com/v1/accounts
 */
export async function fetchGbpAccounts(accessToken: string): Promise<GbpAccount[]> {
  const url = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";
  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GbpApiError(res.status, formatGbpError(res.status, text));
  }

  const data = (await res.json()) as { accounts?: GbpAccount[] };
  return data.accounts ?? [];
}

/**
 * Discovers locations for a specific Business Profile Account.
 * Endpoint: https://mybusinessbusinessinformation.googleapis.com/v1/{accountName}/locations
 */
export async function fetchGbpLocations(
  accessToken: string,
  accountName: string,
): Promise<GbpLocation[]> {
  const cleanAccountName = accountName.startsWith("accounts/") ? accountName : `accounts/${accountName}`;
  const readMask =
    "name,title,storefrontAddress,websiteUri,phoneNumbers,categories,profile,metadata,storeCode";

  const locations: GbpLocation[] = [];
  let pageToken: string | undefined = undefined;

  do {
    const params = new URLSearchParams({ readMask, pageSize: "100" });
    if (pageToken) params.set("pageToken", pageToken);

    const url = `https://mybusinessbusinessinformation.googleapis.com/v1/${cleanAccountName}/locations?${params}`;
    const res = await fetch(url, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new GbpApiError(res.status, formatGbpError(res.status, text));
    }

    const data = (await res.json()) as { locations?: GbpLocation[]; nextPageToken?: string };
    if (data.locations && data.locations.length > 0) {
      locations.push(...data.locations);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return locations;
}

/**
 * Discovers all accounts and their respective locations for the Google user.
 */
export async function fetchGbpAllLocations(
  accessToken: string,
): Promise<{ accounts: GbpAccount[]; locations: GbpLocation[] }> {
  const accounts = await fetchGbpAccounts(accessToken);
  const allLocations: GbpLocation[] = [];

  for (const acct of accounts) {
    try {
      const locs = await fetchGbpLocations(accessToken, acct.name);
      for (const loc of locs) {
        allLocations.push({
          ...loc,
          accountName: acct.name,
          accountTitle: acct.accountName || acct.name,
        });
      }
    } catch {
      // Continue to other accounts if one account fails (e.g. insufficient permissions on one group)
    }
  }

  return { accounts, locations: allLocations };
}

/**
 * Publishes a Local Post to a Google Business Profile location.
 * Endpoint: https://mybusiness.googleapis.com/v4/{accountAndLocation}/localPosts
 */
export async function publishGbpLocalPost(
  accessToken: string,
  accountName: string,
  locationName: string,
  payload: GbpPostPayload,
): Promise<GbpPostResponse> {
  const accId = accountName.replace(/^accounts\//, "");
  const locId = locationName.replace(/^locations\//, "").replace(/^accounts\/[^/]+\/locations\//, "");

  const url = `https://mybusiness.googleapis.com/v4/accounts/${accId}/locations/${locId}/localPosts`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new GbpApiError(res.status, formatGbpError(res.status, text));
  }

  return JSON.parse(text) as GbpPostResponse;
}
