import { describe, it, expect, vi } from "vitest";
import { GoogleSheetsClient } from "./sheets.js";

describe("GoogleSheetsClient", () => {
  const mockAuth = {} as any;

  it("should list spreadsheets", async () => {
    const mockDrive = {
      files: {
        list: vi.fn().mockResolvedValue({
          data: {
            files: [
              { id: "abc123", name: "Test Sheet", mimeType: "application/vnd.google-apps.spreadsheet" },
            ],
          },
        }),
      },
    } as any;

    const mockSheets = {
      spreadsheets: {
        values: {
          get: vi.fn(),
          update: vi.fn(),
        },
      },
    } as any;

    const client = new GoogleSheetsClient(mockAuth) as any;
    client.drive = mockDrive;
    client.sheets = mockSheets;

    const result = await client.listSpreadsheets();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("abc123");
    expect(result[0].name).toBe("Test Sheet");
  });

  it("should read range", async () => {
    const mockDrive = {
      files: {
        list: vi.fn(),
      },
    } as any;

    const mockSheets = {
      spreadsheets: {
        values: {
          get: vi.fn().mockResolvedValue({
            data: { range: "Sheet1!A1:B2", values: [["a", "b"], ["c", "d"]] },
          }),
        },
      },
    } as any;

    const client = new GoogleSheetsClient(mockAuth) as any;
    client.drive = mockDrive;
    client.sheets = mockSheets;

    const result = await client.readRange("abc123", "Sheet1!A1:B2");
    expect(result.range).toBe("Sheet1!A1:B2");
    expect(result.values).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("should write range", async () => {
    const mockDrive = {
      files: {
        list: vi.fn(),
      },
    } as any;

    const mockSheets = {
      spreadsheets: {
        values: {
          update: vi.fn().mockResolvedValue({
            data: { updatedRange: "Sheet1!A1:B2" },
          }),
        },
      },
    } as any;

    const client = new GoogleSheetsClient(mockAuth) as any;
    client.drive = mockDrive;
    client.sheets = mockSheets;

    await client.writeRange("abc123", "Sheet1!A1:B2", [["a", "b"]]);
    expect(mockSheets.spreadsheets.values.update).toHaveBeenCalledWith({
      spreadsheetId: "abc123",
      range: "Sheet1!A1:B2",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [["a", "b"]] },
    });
  });

  it("should create spreadsheet", async () => {
    const mockDrive = {
      files: {
        list: vi.fn(),
      },
    } as any;

    const mockSheets = {
      spreadsheets: {
        create: vi.fn().mockResolvedValue({
          data: { spreadsheetId: "new123", spreadsheetUrl: "https://docs.google.com/spreadsheets/d/new123" },
        }),
      },
    } as any;

    const client = new GoogleSheetsClient(mockAuth) as any;
    client.drive = mockDrive;
    client.sheets = mockSheets;

    const result = await client.createSpreadsheet("My New Sheet");
    expect(result.spreadsheetId).toBe("new123");
    expect(result.spreadsheetUrl).toBe("https://docs.google.com/spreadsheets/d/new123");
  });
});
