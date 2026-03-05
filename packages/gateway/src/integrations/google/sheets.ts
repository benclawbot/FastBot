/**
 * Google Sheets Integration — interact with spreadsheets via Google Sheets API.
 */
import { google, type sheets_v4 } from "googleapis";
import { createChildLogger } from "../../logger/index.js";
import type { Spreadsheet, SheetValueRange } from "./types.js";

const log = createChildLogger("integrations:google:sheets");

/**
 * Plugin metadata for Sheets integration.
 */
export const googleSheetsPlugin = {
  name: "google-sheets",
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
} as const;

/**
 * Google Sheets client for spreadsheet operations.
 */
export class GoogleSheetsClient {
  private sheets: sheets_v4.Sheets;
  private auth: sheets_v4.Params$Resource$Spreadsheets$Get["auth"];

  constructor(auth: sheets_v4.Params$Resource$Spreadsheets$Get["auth"]) {
    this.sheets = google.sheets({ version: "v4", auth });
    this.auth = auth;
    log.info("Google Sheets client initialized");
  }

  /**
   * List all spreadsheets the user has access to.
   */
  async listSpreadsheets(): Promise<Spreadsheet[]> {
    const drive = google.drive({ version: "v3", auth: this.auth });
    const { data } = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.spreadsheet'",
      fields: "files(id, name, mimeType)",
      pageSize: 100,
    });

    return (data.files ?? []).map((f) => ({
      id: f.id ?? "",
      name: f.name ?? "",
      mimeType: f.mimeType ?? "",
    }));
  }

  /**
   * Read a range of values from a spreadsheet.
   * @param spreadsheetId The ID of the spreadsheet
   * @param range The range to read (e.g., "Sheet1!A1:B10")
   */
  async readRange(spreadsheetId: string, range: string): Promise<SheetValueRange> {
    const { data } = await this.sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    return {
      range: data.range ?? range,
      values: data.values ?? [],
    };
  }

  /**
   * Write values to a range in a spreadsheet.
   * @param spreadsheetId The ID of the spreadsheet
   * @param range The range to write to (e.g., "Sheet1!A1")
   * @param values The values to write
   */
  async writeRange(spreadsheetId: string, range: string, values: string[][]): Promise<void> {
    await this.sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });

    log.info({ spreadsheetId, range }, "Values written to spreadsheet");
  }

  /**
   * Create a new sheet in a spreadsheet.
   * @param spreadsheetId The ID of the spreadsheet
   * @param sheetTitle The title for the new sheet
   */
  async createSheet(spreadsheetId: string, sheetTitle: string): Promise<void> {
    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: sheetTitle,
              },
            },
          },
        ],
      },
    });

    log.info({ spreadsheetId, sheetTitle }, "Sheet created");
  }

  /**
   * Append a row to a spreadsheet.
   * @param spreadsheetId The ID of the spreadsheet
   * @param range The range to append to (e.g., "Sheet1!A:A")
   * @param values The values to append
   */
  async appendRow(spreadsheetId: string, range: string, values: string[]): Promise<void> {
    await this.sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [values] },
    });

    log.info({ spreadsheetId, range }, "Row appended to spreadsheet");
  }
}
