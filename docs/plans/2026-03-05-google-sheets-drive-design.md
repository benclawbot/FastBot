# Google Sheets & Drive Plugin Architecture

**Date:** 2026-03-05
**Status:** Approved

## Overview

Add Google Sheets and Google Drive integrations to FastBot using a plugin architecture. Enables data backup to Drive and self-improvement workflows where the agent builds code remotely before integration.

## Architecture

### Directory Structure
```
src/integrations/google/
├── index.ts      # Main export, shared auth
├── sheets.ts     # Sheets plugin
├── drive.ts      # Drive plugin
└── types.ts     # Shared types
```

### Plugin Interface
Each plugin exports:
- `name` - unique identifier
- `scopes` - OAuth scopes required
- `methods` - available operations
- `init(client)` - initialize with authenticated googleapis client

### Shared Auth
- Extend existing `GoogleClient` in `src/integrations/google.ts`
- OAuth tokens already stored via keystore
- Plugins receive authenticated `google.auth.OAuth2` client

## Google Sheets Plugin

### Scopes Required
- `https://www.googleapis.com/auth/spreadsheets`

### Methods
| Method | Description |
|--------|-------------|
| `listSpreadsheets(query?)` | List user's spreadsheets |
| `readRange(sheetId, range)` | Read data from range |
| `writeRange(sheetId, range, values)` | Write data to range |
| `createSheet(title)` | Create new spreadsheet |
| `appendRow(sheetId, values)` | Append row to sheet |

### Use Cases
- Usage statistics reporting
- Data backup to Sheets
- Workflow data import/export

## Google Drive Plugin

### Scopes Required
- `https://www.googleapis.com/auth/drive.file`
- `https://www.googleapis.com/auth/drive`

### Methods
| Method | Description |
|--------|-------------|
| `listFiles(query?)` | List files with optional query |
| `downloadFile(fileId)` | Download file content |
| `uploadFile(buffer, filename, mimeType, parentId?)` | Upload file |
| `createFolder(name, parentId?)` | Create folder |
| `deleteFile(fileId)` | Delete file |
| `getFileMetadata(fileId)` | Get file details |

### Use Cases
- Data backup to Drive
- Self-improvement: Agent writes code to Drive, reviews, then integrates
- File management via AI agent

## Data Flow

```
User/Agent → FastBot Gateway → GoogleClient (OAuth)
                                    ↓
                              Plugin Modules
                                    ↓
                    Google Sheets API / Google Drive API
```

## Error Handling

- Token refresh on 401 errors
- Graceful degradation if scopes insufficient
- Typed errors for user feedback

## Testing

- Unit tests for each plugin method
- Mock googleapis responses
- Integration tests with test Google account

## Configuration

Add to `config.json`:
```json
{
  "integrations": {
    "google": {
      "sheets": { "enabled": true },
      "drive": { "enabled": true }
    }
  }
}
```

## Migration Path

- Keep existing `GoogleClient` for Calendar/Gmail
- New plugins extend capabilities
- No breaking changes to existing integrations
