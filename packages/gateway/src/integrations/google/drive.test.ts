import { describe, it, expect, vi } from "vitest";
import { GoogleDriveClient } from "./drive.js";

describe("GoogleDriveClient", () => {
  const mockAuth = {} as any;

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

    const client = new GoogleDriveClient(mockAuth) as any;
    client.drive = mockDrive;

    const result = await client.listFiles();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("doc.txt");
  });

  it("should create folder", async () => {
    const mockDrive = {
      files: {
        create: vi.fn().mockResolvedValue({
          data: { id: "folder1", name: "My Folder", mimeType: "application/vnd.google-apps.folder" },
        }),
      },
    } as any;

    const client = new GoogleDriveClient(mockAuth) as any;
    client.drive = mockDrive;

    const result = await client.createFolder("My Folder");
    expect(result.id).toBe("folder1");
    expect(result.name).toBe("My Folder");
  });

  it("should validate input for downloadFile", async () => {
    const mockDrive = {
      files: {
        get: vi.fn(),
      },
    } as any;

    const client = new GoogleDriveClient(mockAuth) as any;
    client.drive = mockDrive;

    // Empty string should throw - source validates for falsy values
    await expect(client.downloadFile("")).rejects.toThrow("fileId is required");
    // Note: whitespace-only strings pass validation in current implementation
  });

  it("should validate input for createFolder", async () => {
    const mockDrive = {
      files: {
        create: vi.fn(),
      },
    } as any;

    const client = new GoogleDriveClient(mockAuth) as any;
    client.drive = mockDrive;

    // Empty string should throw - source validates for falsy values
    await expect(client.createFolder("")).rejects.toThrow("name is required");
    // Note: whitespace-only strings pass validation in current implementation
  });

  it("should delete file", async () => {
    const mockDrive = {
      files: {
        delete: vi.fn().mockResolvedValue({}),
      },
    } as any;

    const client = new GoogleDriveClient(mockAuth) as any;
    client.drive = mockDrive;

    await client.deleteFile("file123");
    expect(mockDrive.files.delete).toHaveBeenCalledWith({ fileId: "file123" });
  });

  it("should get file metadata", async () => {
    const mockDrive = {
      files: {
        get: vi.fn().mockResolvedValue({
          data: { id: "file1", name: "doc.txt", mimeType: "text/plain", size: "1024" },
        }),
      },
    } as any;

    const client = new GoogleDriveClient(mockAuth) as any;
    client.drive = mockDrive;

    const result = await client.getFileMetadata("file1");
    expect(result.name).toBe("doc.txt");
  });
});
