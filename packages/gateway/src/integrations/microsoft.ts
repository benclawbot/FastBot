/**
 * Microsoft Integration — Outlook, OneDrive, Teams via Microsoft Graph API.
 * Uses OAuth2 with MSAL-style flows.
 */
import { createChildLogger } from "../logger/index.js";

const log = createChildLogger("integrations:microsoft");

export interface MicrosoftTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface CalendarEvent {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  location?: { displayName: string };
  bodyPreview?: string;
}

export interface DriveItem {
  id: string;
  name: string;
  size: number;
  webUrl: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  folder?: { childCount: number };
  file?: { mimeType: string };
}

/**
 * Microsoft Graph API client using OAuth2.
 */
export class MicrosoftClient {
  private accessToken: string;
  private refreshToken?: string;
  private clientId: string;
  private clientSecret: string;
  private tenantId: string;
  private scopes: string[];
  private redirectUri: string;

  constructor(
    clientId: string,
    clientSecret: string,
    tenantId: string = "common",
    redirectUri: string,
    refreshToken?: string,
    accessToken?: string
  ) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.tenantId = tenantId;
    this.redirectUri = redirectUri;
    this.scopes = [
      "User.Read",
      "Mail.Read",
      "Calendars.Read",
      "Files.Read",
      "offline_access",
    ];
    this.accessToken = accessToken || "";
    this.refreshToken = refreshToken;
    log.info("Microsoft client initialized");
  }

  /**
   * Generate OAuth2 authorization URL.
   */
  getAuthUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: "code",
      redirect_uri: this.redirectUri,
      scope: this.scopes.join(" "),
      response_mode: "query",
    });

    if (state) {
      params.append("state", state);
    }

    return `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/authorize?${params}`;
  }

  /**
   * Exchange authorization code for tokens.
   */
  async exchangeCode(code: string): Promise<MicrosoftTokens> {
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      redirect_uri: this.redirectUri,
      grant_type: "authorization_code",
      scope: this.scopes.join(" "),
    });

    const response = await fetch(
      `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      log.error({ status: response.status, error }, "Token exchange failed");
      throw new Error(`Token exchange failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
  }

  /**
   * Refresh access token using refresh token.
   */
  async refreshAccessToken(): Promise<MicrosoftTokens> {
    if (!this.refreshToken) {
      throw new Error("No refresh token available");
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.refreshToken,
      grant_type: "refresh_token",
      scope: this.scopes.join(" "),
    });

    const response = await fetch(
      `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      log.error({ status: response.status, error }, "Token refresh failed");
      throw new Error(`Token refresh failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    this.accessToken = data.access_token;
    if (data.refresh_token) {
      this.refreshToken = data.refresh_token;
    }

    return {
      accessToken: data.access_token,
      refreshToken: this.refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
  }

  /**
   * Make authenticated request to Microsoft Graph API.
   */
  private async graphRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    // Check if token needs refresh
    const response = await fetch(`https://graph.microsoft.com/v1.0${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (response.status === 401) {
      // Token expired, try to refresh
      await this.refreshAccessToken();
      // Retry request with new token
      return this.graphRequest<T>(endpoint, options);
    }

    if (!response.ok) {
      const error = await response.text();
      log.error({ status: response.status, endpoint, error }, "Graph API request failed");
      throw new Error(`Graph API request failed: ${response.status}`);
    }

    return (await response.json()) as T;
  }

  /**
   * List upcoming calendar events.
   */
  async listEvents(maxResults: number = 10): Promise<CalendarEvent[]> {
    const result = await this.graphRequest<{ value: CalendarEvent[] }>(
      `/me/calendar/events?$top=${maxResults}&$orderby=start/dateTime&$filter=start/dateTime ge '${new Date().toISOString()}'`
    );
    return result.value;
  }

  /**
   * Create a calendar event.
   */
  async createEvent(
    subject: string,
    start: string,
    end: string,
    body?: string,
    location?: string
  ): Promise<CalendarEvent> {
    const event = {
      subject,
      start: { dateTime: start, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      end: { dateTime: end, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      body: body ? { contentType: "text", content: body } : undefined,
      location: location ? { displayName: location } : undefined,
    };

    const result = await this.graphRequest<CalendarEvent>("/me/calendar/events", {
      method: "POST",
      body: JSON.stringify(event),
    });

    log.info({ eventId: result.id }, "Calendar event created");
    return result;
  }

  /**
   * List files from OneDrive.
   */
  async listDriveFiles(folderId?: string, maxResults: number = 20): Promise<DriveItem[]> {
    const endpoint = folderId
      ? `/me/drive/items/${folderId}/children?$top=${maxResults}`
      : `/me/drive/root/children?$top=${maxResults}`;

    const result = await this.graphRequest<{ value: DriveItem[] }>(endpoint);
    return result.value;
  }

  /**
   * Get current user profile.
   */
  async getUser(): Promise<{ id: string; displayName: string; mail: string; userPrincipalName: string }> {
    return this.graphRequest("/me");
  }

  /**
   * Get access token (for external use).
   */
  getAccessToken(): string {
    return this.accessToken;
  }

  /**
   * Get refresh token (for storage).
   */
  getRefreshToken(): string | undefined {
    return this.refreshToken;
  }
}
