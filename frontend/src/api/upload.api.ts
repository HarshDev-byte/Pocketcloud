import { api, apiPost } from '../lib/api';

export interface InitUploadRequest {
  filename: string;
  mimeType: string;
  size: number;
  checksum: string;
  folderId?: string | null;
}

export interface InitUploadResponse {
  uploadId: string;
  chunkSize: number;
  totalChunks: number;
  existingFile?: {
    id: string;
    name: string;
    size: number;
  };
}

export interface UploadProgressResponse {
  uploadId: string;
  chunksReceived: number[];
  totalChunks: number;
  bytesReceived: number;
  totalBytes: number;
}

export interface CompleteUploadResponse {
  file: {
    id: string;
    name: string;
    mime_type: string;
    size: number;
    folder_id: string | null;
    owner_id: string;
    created_at: number;
    updated_at: number;
    checksum: string;
  };
}

export const uploadApi = {
  // Initialize upload session
  initUpload: (data: InitUploadRequest) =>
    apiPost<InitUploadResponse>('/api/upload/init', data),

  // Upload a chunk
  uploadChunk: async (uploadId: string, chunkIndex: number, chunk: Blob): Promise<void> => {
    await api.put(`/api/upload/${uploadId}/chunk/${chunkIndex}`, chunk, {
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    });
  },

  // Get upload progress
  getProgress: (uploadId: string) =>
    api.get<UploadProgressResponse>(`/api/upload/${uploadId}/progress`).then(res => res.data),

  // Complete upload
  completeUpload: (uploadId: string) =>
    apiPost<CompleteUploadResponse>(`/api/upload/${uploadId}/complete`, {}),

  // Abort upload
  abortUpload: (uploadId: string) =>
    api.delete(`/api/upload/${uploadId}`),
};
