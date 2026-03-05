/**
 * Google Drive Integration — interact with files via Google Drive API.
 */
import { google, type drive_v3 } from "googleapis";
import { createChildLogger } from "../../logger/index.js";
import type { DriveFile } from "./types.js";

const log = createChildLogger("integrations:google:drive");

/**
 * Plugin metadata for Drive integration.
 */
export const googleDrivePlugin = {
  name: "google-drive",
  scopes: [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive",
  ],
} as const;

/**
 * Google Drive client for file operations.
 */
export class GoogleDriveClient {
  private drive: drive_v3.Drive;
  private auth: drive_v3.Params$Resource$Files$List["auth"];

  constructor(auth: drive_v3.Params$Resource$Files$List["auth"]) {
    this.drive = google.drive({ version: "v3", auth });
    this.auth = auth;
    log.info("Google Drive client initialized");
  }

  /**
   * List files in Google Drive.
   * @param query Optional query string to filter files
   * @param maxResults Maximum number of files to return
   */
  async listFiles(query?: string, maxResults = 100): Promise<DriveFile[]> {
    const { data } = await this.drive.files.list({
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
      parents: f.parents ?? undefined,
    }));
  }

  /**
   * Download a file from Google Drive.
   * @param fileId The ID of the file to download
   * @returns The file content as a Buffer
   */
  async downloadFile(fileId: string): Promise<Buffer> {
    const response = await this.drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" }
    );

    return Buffer.from(response.data as ArrayBuffer);
  }

  /**
   * Upload a file to Google Drive.
   * @param name The name of the file
   * @param mimeType The MIME type of the file
   * @param content The content of the file
   * @param parentId Optional parent folder ID
   */
  async uploadFile(
    name: string,
    mimeType: string,
    content: string | Buffer,
    parentId?: string
  ): Promise<DriveFile> {
    const fileMetadata: drive_v3.Schema$File = {
      name,
      parents: parentId ? [parentId] : undefined,
    };

    const media = {
      mimeType,
      body: typeof content === "string" ? Buffer.from(content) : content,
    };

    // Use multipart upload
    const response = await this.drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: "id, name, mimeType, size, modifiedTime, parents",
    });

    const data = response.data;
    log.info({ fileId: data.id, name }, "File uploaded to Drive");

    return {
      id: data.id ?? "",
      name: data.name ?? name,
      mimeType: data.mimeType ?? mimeType,
      size: data.size ?? "0",
      modifiedTime: data.modifiedTime ?? "",
      parents: data.parents ?? undefined,
    };
  }

  /**
   * Create a folder in Google Drive.
   * @param name The name of the folder
   * @param parentId Optional parent folder ID
   */
  async createFolder(name: string, parentId?: string): Promise<DriveFile> {
    const { data } = await this.drive.files.create({
      requestBody: {
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: parentId ? [parentId] : undefined,
      },
      fields: "id, name, mimeType, size, modifiedTime, parents",
    });

    log.info({ folderId: data.id, name }, "Folder created in Drive");

    return {
      id: data.id ?? "",
      name: data.name ?? name,
      mimeType: data.mimeType ?? "application/vnd.google-apps.folder",
      size: "0",
      modifiedTime: data.modifiedTime ?? "",
      parents: data.parents ?? undefined,
    };
  }

  /**
   * Delete a file from Google Drive.
   * @param fileId The ID of the file to delete
   */
  async deleteFile(fileId: string): Promise<void> {
    await this.drive.files.delete({ fileId });
    log.info({ fileId }, "File deleted from Drive");
  }

  /**
   * Get metadata for a file.
   * @param fileId The ID of the file
   */
  async getFileMetadata(fileId: string): Promise<DriveFile> {
    const { data } = await this.drive.files.get({
      fileId,
      fields: "id, name, mimeType, size, modifiedTime, parents",
    });

    return {
      id: data.id ?? "",
      name: data.name ?? "",
      mimeType: data.mimeType ?? "",
      size: data.size ?? "0",
      modifiedTime: data.modifiedTime ?? "",
      parents: data.parents ?? undefined,
    };
  }
}
