/**
 * Google Integration Type Definitions.
 * Shared types for Google Sheets and Drive plugins.
 */

/**
 * Represents a Google Spreadsheet.
 */
export interface Spreadsheet {
  id: string;
  name: string;
  mimeType: string;
}

/**
 * Represents a range of values from a Google Sheet.
 */
export interface SheetValueRange {
  range: string;
  values: string[][];
}

/**
 * Represents a file in Google Drive.
 */
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  modifiedTime: string;
  parents?: string[] | null;
}

/**
 * Configuration for Google OAuth2 client.
 */
export interface GoogleClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
  refreshToken?: string;
}
