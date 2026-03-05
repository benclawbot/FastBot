# Google Sheets & Drive Plugin Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Google Sheets and Google Drive integrations to FastBot using a plugin architecture. Enables data backup to Drive and self-improvement workflows.

**Architecture:** Create a plugin-based structure under `src/integrations/google/` with separate modules for Sheets and Drive, sharing a common GoogleClient for authentication.

**Tech Stack:** TypeScript, googleapis SDK (already installed), existing FastBot patterns

---

## Task 1: Create Google Integration Directory Structure

**Files:**
- Create: `packages/gateway/src/integrations/google/types.ts`
- Create: `packages/gateway/src/integrations/google/sheets.ts`
- Create: `packages/gateway/src/integrations/google/drive.ts`
- Modify: `packages/gateway/src/integrations/google.ts` (rename to index.ts)

**Step 1: Create types.ts**

```typescript
// packages/gateway/src/integrations/google/types.ts

export interface Spreadsheet {
  id: string;
  name: string;
  mimeType: string;
}

export interface SheetValueRange {
  range: string;
  values: string[][];
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  modifiedTime: string;
  parents?: string[];
}

export interface GoogleClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
  refreshToken?: string;
}
```

**Step 2: Create sheets.ts**

```typescript
// packages/gateway/src/integrations/google/sheets.ts
import { google, type sheets_v4 } from "googleapis";
import type { OAuth2Client } from "googleapis";
import type { Spreadsheet, SheetValueRange } from "./types.js";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

export const sheetsPlugin = {
  name: "google-sheets",
  scopes: SCOPES,

  init(auth: OAuth2Client) {
    return google.sheets({ version: "v4", auth });
  },

  async listSpreadsheets(sheets: sheets_v4.Sheets, query?: string) {
    const { data } = await sheets.spreadsheets.list({
      q: query,
      fields: "spreadsheets(spreadsheetId, properties.title, mimeType)",
    });
    return (data.spreadsheets ?? []).map((s) => ({
      id: s.spreadsheetId ?? "",
      name: s.properties?.title ?? "",
      mimeType: s.mimeType ?? "",
    })) as Spreadsheet[];
  },

  async readRange(sheets: sheets_v4.Sheets, spreadsheetId: string, range: string) {
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    return {
      range: data.range ?? range,
      values: data.values ?? [],
    } as SheetValueRange;
  },

  async writeRange(sheets: sheets_v4.Sheets, spreadsheetId: string, range: string, values: string[][]) {
    const { data } = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });
    return { range: data.updatedRange ?? range };
  },

  async createSheet(sheets: sheets_v4.Sheets, title: string) {
    const { data } = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title },
        sheets: [{ properties: { title: "Sheet1" } }],
      },
    });
    return { id: data.spreadsheetId ?? "", name: data.properties?.title ?? title };
  },

  async appendRow(sheets: sheets_v4.Sheets, spreadsheetId: string, sheetName: string, values: string[]) {
    const range = `${sheetName}:A`;
    const { data } = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [values] },
    });
    return { updatedRange: data.updatedRange };
  },
};
```

**Step 3: Create drive.ts**

```typescript
// packages/gateway/src/integrations/google/drive.ts
import { google, type drive_v3 } from "googleapis";
import type { OAuth2Client } from "googleapis";
import type { DriveFile } from "./types.js";

const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive",
];

export const drivePlugin = {
  name: "google-drive",
  scopes: SCOPES,

  init(auth: OAuth2Client) {
    return google.drive({ version: "v3", auth });
  },

  async listFiles(drive: drive_v3.Drive, query?: string, maxResults = 50) {
    const { data } = await drive.files.list({
      q: query,
      pageSize: maxResults,
      fields: "files(id, name, mimeType, size, modifiedTime, parents)",
    });
    return (data.files ?? []).map((f) => ({
      id: f.id ?? "",
      name: f.name ?? "",
      mimeType: f.mimeType ?? "",
      size: f.size ?? "0",
      modifiedTime: f.modifiedTime ?? "",
      parents: f.parents,
    })) as DriveFile[];
  },

  async downloadFile(drive: drive_v3.Drive, fileId: string): Promise<Buffer> {
    const { data } = await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
    return Buffer.from(data as ArrayBuffer);
  },

  async uploadFile(
    drive: drive_v3.Drive,
    content: Buffer | string,
    filename: string,
    mimeType: string,
    parentId?: string
  ) {
    const requestBody: drive_v3.Schema$File = {
      name: filename,
      parents: parentId ? [parentId] : undefined,
    };
    const media = {
      mimeType,
      body: typeof content === "string" ? Buffer.from(content) : content,
    };
    const { data } = await drive.files.create({ requestBody, media });
    return { id: data.id ?? "", name: data.name ?? filename };
  },

  async createFolder(drive: drive_v3.Drive, name: string, parentId?: string) {
    const file: drive_v3.Schema$File = {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    };
    const { data } = await drive.files.create({ requestBody: file });
    return { id: data.id ?? "", name: data.name ?? name };
  },

  async deleteFile(drive: drive_v3.Drive, fileId: string) {
    await drive.files.delete({ fileId });
    return { deleted: true };
  },

  async getFileMetadata(drive: drive_v3.Drive, fileId: string) {
    const { data } = await drive.files.get({ fileId, fields: "*" });
    return data;
  },
};
```

**Step 4: Modify google.ts to index.ts**

Rename `packages/gateway/src/integrations/google.ts` to `packages/gateway/src/integrations/google/index.ts` and update exports.

**Step 5: Commit**

```bash
git add packages/gateway/src/integrations/google/
git commit -m "feat: add Google Sheets and Drive plugin architecture"
```

---

## Task 2: Update GoogleClient for Extended Scopes

**Files:**
- Modify: `packages/gateway/src/integrations/google/index.ts`

**Step 1: Update getAuthUrl to include new scopes**

```typescript
getAuthUrl(redirectUri?: string): string {
  return this.auth.generateAuthUrl({
    access_type: "offline",
    redirect_uri: redirectUri,
    scope: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/spreadsheets",
    ],
  });
}
```

**Step 2: Export plugins from index**

```typescript
export { sheetsPlugin } from "./sheets.js";
export { drivePlugin } from "./drive.js";
export type { Spreadsheet, SheetValueRange, DriveFile, GoogleClientConfig } from "./types.js";
```

**Step 3: Run build to verify**

```bash
cd packages/gateway && pnpm build
```

Expected: BUILD SUCCESS

**Step 4: Commit**

```bash
git add packages/gateway/src/integrations/google/
git commit -m "feat: extend Google OAuth scopes for Sheets and Drive"
```

---

## Task 3: Add Socket.IO Handlers for Sheets

**Files:**
- Modify: `packages/gateway/src/index.ts`

**Step 1: Add import**

```typescript
import { GoogleClient, sheetsPlugin, drivePlugin } from "./integrations/google/index.js";
```

**Step 2: Add socket handlers after existing Google handlers (~line 800)**

```typescript
// Google Sheets handlers
socket.on("sheets:list", async (data, callback) => {
  try {
    const refreshToken = keyStore.get("oauth_google_refresh_token");
    if (!refreshToken) {
      callback({ error: "Google not connected" });
      return;
    }
    const client = new GoogleClient(config.integrations.google.clientId, config.integrations.google.clientSecret, undefined, refreshToken);
    const sheets = sheetsPlugin.init(client.getAuth());
    const spreadsheets = await sheetsPlugin.listSpreadsheets(sheets, data?.query);
    callback({ data: spreadsheets });
  } catch (err) {
    log.error({ err }, "Failed to list spreadsheets");
    callback({ error: "Failed to list spreadsheets" });
  }
});

socket.on("sheets:read", async (data, callback) => {
  try {
    const refreshToken = keyStore.get("oauth_google_refresh_token");
    if (!refreshToken) {
      callback({ error: "Google not connected" });
      return;
    }
    const client = new GoogleClient(config.integrations.google.clientId, config.integrations.google.clientSecret, undefined, refreshToken);
    const sheets = sheetsPlugin.init(client.getAuth());
    const result = await sheetsPlugin.readRange(sheets, data.spreadsheetId, data.range);
    callback({ data: result });
  } catch (err) {
    log.error({ err }, "Failed to read sheet");
    callback({ error: "Failed to read sheet" });
  }
});

socket.on("sheets:write", async (data, callback) => {
  try {
    const refreshToken = keyStore.get("oauth_google_refresh_token");
    if (!refreshToken) {
      callback({ error: "Google not connected" });
      return;
    }
    const client = new GoogleClient(config.integrations.google.clientId, config.integrations.google.clientSecret, undefined, refreshToken);
    const sheets = sheetsPlugin.init(client.getAuth());
    await sheetsPlugin.writeRange(sheets, data.spreadsheetId, data.range, data.values);
    callback({ success: true });
  } catch (err) {
    log.error({ err }, "Failed to write to sheet");
    callback({ error: "Failed to write to sheet" });
  }
});

socket.on("sheets:create", async (data, callback) => {
  try {
    const refreshToken = keyStore.get("oauth_google_refresh_token");
    if (!refreshToken) {
      callback({ error: "Google not connected" });
      return;
    }
    const client = new GoogleClient(config.integrations.google.clientId, config.integrations.google.clientSecret, undefined, refreshToken);
    const sheets = sheetsPlugin.init(client.getAuth());
    const result = await sheetsPlugin.createSheet(sheets, data.title);
    callback({ data: result });
  } catch (err) {
    log.error({ err }, "Failed to create sheet");
    callback({ error: "Failed to create sheet" });
  }
});
```

**Step 3: Add getAuth method to GoogleClient**

In `packages/gateway/src/integrations/google/index.ts`:

```typescript
getAuth(): OAuth2Client {
  return this.auth;
}
```

**Step 4: Run build**

```bash
cd packages/gateway && pnpm build
```

Expected: BUILD SUCCESS

**Step 5: Commit**

```bash
git add packages/gateway/src/integrations/google/ packages/gateway/src/index.ts
git commit -m "feat: add Sheets socket handlers"
```

---

## Task 4: Add Socket.IO Handlers for Drive

**Files:**
- Modify: `packages/gateway/src/index.ts`

**Step 1: Add Drive handlers after Sheets handlers**

```typescript
// Google Drive handlers
socket.on("drive:list", async (data, callback) => {
  try {
    const refreshToken = keyStore.get("oauth_google_refresh_token");
    if (!refreshToken) {
      callback({ error: "Google not connected" });
      return;
    }
    const client = new GoogleClient(config.integrations.google.clientId, config.integrations.google.clientSecret, undefined, refreshToken);
    const drive = drivePlugin.init(client.getAuth());
    const files = await drivePlugin.listFiles(drive, data?.query, data?.maxResults);
    callback({ data: files });
  } catch (err) {
    log.error({ err }, "Failed to list Drive files");
    callback({ error: "Failed to list Drive files" });
  }
});

socket.on("drive:download", async (data, callback) => {
  try {
    const refreshToken = keyStore.get("oauth_google_refresh_token");
    if (!refreshToken) {
      callback({ error: "Google not connected" });
      return;
    }
    const client = new GoogleClient(config.integrations.google.clientId, config.integrations.google.clientSecret, undefined, refreshToken);
    const drive = drivePlugin.init(client.getAuth());
    const buffer = await drivePlugin.downloadFile(drive, data.fileId);
    callback({ data: buffer.toString("base64") });
  } catch (err) {
    log.error({ err }, "Failed to download file");
    callback({ error: "Failed to download file" });
  }
});

socket.on("drive:upload", async (data, callback) => {
  try {
    const refreshToken = keyStore.get("oauth_google_refresh_token");
    if (!refreshToken) {
      callback({ error: "Google not connected" });
      return;
    }
    const client = new GoogleClient(config.integrations.google.clientId, config.integrations.google.clientSecret, undefined, refreshToken);
    const drive = drivePlugin.init(client.getAuth());
    const content = Buffer.from(data.content, "base64");
    const result = await drivePlugin.uploadFile(drive, content, data.filename, data.mimeType, data.parentId);
    callback({ data: result });
  } catch (err) {
    log.error({ err }, "Failed to upload file");
    callback({ error: "Failed to upload file" });
  }
});

socket.on("drive:createFolder", async (data, callback) => {
  try {
    const refreshToken = keyStore.get("oauth_google_refresh_token");
    if (!refreshToken) {
      callback({ error: "Google not connected" });
      return;
    }
    const client = new GoogleClient(config.integrations.google.clientId, config.integrations.google.clientSecret, undefined, refreshToken);
    const drive = drivePlugin.init(client.getAuth());
    const result = await drivePlugin.createFolder(drive, data.name, data.parentId);
    callback({ data: result });
  } catch (err) {
    log.error({ err }, "Failed to create folder");
    callback({ error: "Failed to create folder" });
  }
});

socket.on("drive:delete", async (data, callback) => {
  try {
    const refreshToken = keyStore.get("oauth_google_refresh_token");
    if (!refreshToken) {
      callback({ error: "Google not connected" });
      return;
    }
    const client = new GoogleClient(config.integrations.google.clientId, config.integrations.google.clientSecret, undefined, refreshToken);
    const drive = drivePlugin.init(client.getAuth());
    await drivePlugin.deleteFile(drive, data.fileId);
    callback({ success: true });
  } catch (err) {
    log.error({ err }, "Failed to delete file");
    callback({ error: "Failed to delete file" });
  }
});
```

**Step 2: Run build**

```bash
cd packages/gateway && pnpm build
```

Expected: BUILD SUCCESS

**Step 3: Commit**

```bash
git add packages/gateway/src/index.ts
git commit -m "feat: add Drive socket handlers"
```

---

## Task 5: Add Unit Tests

**Files:**
- Create: `packages/gateway/src/integrations/google/sheets.test.ts`
- Create: `packages/gateway/src/integrations/google/drive.test.ts`

**Step 1: Write sheets tests**

```typescript
// packages/gateway/src/integrations/google/sheets.test.ts
import { describe, it, expect, vi } from "vitest";
import { sheetsPlugin } from "./sheets.js";

describe("sheetsPlugin", () => {
  it("should have correct name", () => {
    expect(sheetsPlugin.name).toBe("google-sheets");
  });

  it("should have scopes", () => {
    expect(sheetsPlugin.scopes).toContain("https://www.googleapis.com/auth/spreadsheets");
  });

  it("should list spreadsheets", async () => {
    const mockSheets = {
      spreadsheets: {
        list: vi.fn().mockResolvedValue({
          data: {
            spreadsheets: [
              { spreadsheetId: "abc123", properties: { title: "Test Sheet" }, mimeType: "application/vnd.google-apps.spreadsheet" },
            ],
          },
        }),
      },
    } as any;

    const result = await sheetsPlugin.listSpreadsheets(mockSheets);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("abc123");
    expect(result[0].name).toBe("Test Sheet");
  });

  it("should read range", async () => {
    const mockSheets = {
      spreadsheets: {
        values: {
          get: vi.fn().mockResolvedValue({
            data: { range: "Sheet1!A1:B2", values: [["a", "b"], ["c", "d"]] },
          }),
        },
      },
    } as any;

    const result = await sheetsPlugin.readRange(mockSheets, "abc123", "Sheet1!A1:B2");
    expect(result.range).toBe("Sheet1!A1:B2");
    expect(result.values).toEqual([["a", "b"], ["c", "d"]]);
  });
});
```

**Step 2: Write drive tests**

```typescript
// packages/gateway/src/integrations/google/drive.test.ts
import { describe, it, expect, vi } from "vitest";
import { drivePlugin } from "./drive.js";

describe("drivePlugin", () => {
  it("should have correct name", () => {
    expect(drivePlugin.name).toBe("google-drive");
  });

  it("should have scopes", () => {
    expect(drivePlugin.scopes).toContain("https://www.googleapis.com/auth/drive");
  });

  it("should list files", async () => {
    const mockDrive = {
      files: {
        list: vi.fn().mockResolvedValue({
          data: {
            files: [
              { id: "file1", name: "doc.txt", mimeType: "text/plain", size: "1024", modifiedTime: "2024-01-01" },
            ],
          },
        }),
      },
    } as any;

    const result = await drivePlugin.listFiles(mockDrive);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("doc.txt");
  });

  it("should create folder", async () => {
    const mockDrive = {
      files: {
        create: vi.fn().mockResolvedValue({
          data: { id: "folder1", name: "My Folder" },
        }),
      },
    } as any;

    const result = await drivePlugin.createFolder(mockDrive, "My Folder");
    expect(result.id).toBe("folder1");
    expect(result.name).toBe("My Folder");
  });
});
```

**Step 3: Run tests**

```bash
cd packages/gateway && pnpm test
```

Expected: All tests PASS

**Step 4: Commit**

```bash
git add packages/gateway/src/integrations/google/
git commit -m "test: add unit tests for Sheets and Drive plugins"
```

---

## Task 6: Update OAuth Status Endpoint

**Files:**
- Modify: `packages/gateway/src/index.ts`

**Step 1: Update status to include Sheets/Drive capability**

Find the oauth:status handler and verify it checks for refresh token (which now includes all scopes).

**Step 2: Commit**

```bash
git commit -m "chore: verify OAuth status covers Sheets and Drive"
```

---

## Task 7: Integration Test

**Step 1: Start gateway with test Google account**

```bash
pnpm --filter @fastbot/gateway run dev
```

**Step 2: Test via Socket.IO client or dashboard**

- Connect to Google OAuth
- Call `sheets:list` - should return spreadsheets
- Call `sheets:create` with title "Test Sheet" - should create new sheet
- Call `drive:list` - should return files
- Call `drive:createFolder` with name "FastBot Backup" - should create folder

**Step 3: Commit**

```bash
git commit -m "test: integration test Google Sheets and Drive"
```

---

## Summary

| Task | Files | Description |
|------|-------|-------------|
| 1 | 3 new files | Create plugin architecture |
| 1 file | Update GoogleClient scopes | Extended OAuth scopes |
| 1 | index.ts | Add Sheets socket handlers |
| 1 | index.ts | Add Drive socket handlers |
| 2 | test files | Unit tests |
| 1 | index.ts | Verify OAuth status |
| 1 | - | Integration test |

**Total: 7 tasks**
