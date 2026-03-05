/**
 * Google Sheets Integration — interact with spreadsheets via Google Sheets API.
 */
import { google, type sheets_v4, type drive_v3 } from "googleapis";
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
  private drive: drive_v3.Drive;
  private auth: sheets_v4.Params$Resource$Spreadsheets$Get["auth"];

  constructor(auth: sheets_v4.Params$Resource$Spreadsheets$Get["auth"]) {
    this.sheets = google.sheets({ version: "v4", auth });
    this.drive = google.drive({ version: "v3", auth });
    this.auth = auth;
    log.info("Google Sheets client initialized");
  }

  /**
   * List all spreadsheets the user has access to.
   */
  async listSpreadsheets(): Promise<Spreadsheet[]> {
    try {
      const { data } = await this.drive.files.list({
        q: "mimeType='application/vnd.google-apps.spreadsheet'",
        fields: "files(id, name, mimeType)",
        pageSize: 100,
      });

      return (data.files ?? []).map((f) => ({
        id: f.id ?? "",
        name: f.name ?? "",
        mimeType: f.mimeType ?? "",
      }));
    } catch (error) {
      log.error({ err: error }, "Failed to list spreadsheets");
      throw error;
    }
  }

  /**
   * Read a range of values from a spreadsheet.
   * @param spreadsheetId The ID of the spreadsheet
   * @param range The range to read (e.g., "Sheet1!A1:B10")
   */
  async readRange(spreadsheetId: string, range: string): Promise<SheetValueRange> {
    try {
      const { data } = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });

      return {
        range: data.range ?? range,
        values: data.values ?? [],
      };
    } catch (error) {
      log.error({ err: error, spreadsheetId, range }, "Failed to read range from spreadsheet");
      throw error;
    }
  }

  /**
   * Write values to a range in a spreadsheet.
   * @param spreadsheetId The ID of the spreadsheet
   * @param range The range to write to (e.g., "Sheet1!A1")
   * @param values The values to write
   */
  async writeRange(spreadsheetId: string, range: string, values: string[][]): Promise<void> {
    try {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: "USER_ENTERED",
        requestBody: { values },
      });

      log.info({ spreadsheetId, range }, "Values written to spreadsheet");
    } catch (error) {
      log.error({ err: error, spreadsheetId, range }, "Failed to write range to spreadsheet");
      throw error;
    }
  }

  /**
   * Create a new sheet in a spreadsheet.
   * @param spreadsheetId The ID of the spreadsheet
   * @param sheetTitle The title for the new sheet
   */
  async createSheet(spreadsheetId: string, sheetTitle: string): Promise<void> {
    try {
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
    } catch (error) {
      log.error({ err: error, spreadsheetId, sheetTitle }, "Failed to create sheet in spreadsheet");
      throw error;
    }
  }

  /**
   * Create a new spreadsheet.
   * @param title The title for the new spreadsheet
   * @returns The created spreadsheet ID and URL
   */
  async createSpreadsheet(title: string): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
    try {
      const { data } = await this.sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title,
          },
        },
      });

      log.info({ spreadsheetId: data.spreadsheetId, title }, "Spreadsheet created");

      return {
        spreadsheetId: data.spreadsheetId ?? "",
        spreadsheetUrl: data.spreadsheetUrl ?? "",
      };
    } catch (error) {
      log.error({ err: error, title }, "Failed to create spreadsheet");
      throw error;
    }
  }

  /**
   * Append a row to a spreadsheet.
   * @param spreadsheetId The ID of the spreadsheet
   * @param range The range to append to (e.g., "Sheet1!A:A")
   * @param values The values to append
   */
  async appendRow(spreadsheetId: string, range: string, values: string[]): Promise<void> {
    try {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [values] },
      });

      log.info({ spreadsheetId, range }, "Row appended to spreadsheet");
    } catch (error) {
      log.error({ err: error, spreadsheetId, range }, "Failed to append row to spreadsheet");
      throw error;
    }
  }
}
