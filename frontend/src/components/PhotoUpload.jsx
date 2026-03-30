import React, { useCallback } from 'react';
import { useMutation, useQueryClient } from 'react-query';
import { useDropzone } from 'react-dropzone';
import { Upload, Camera } from 'lucide-react';
import { photosAPI } from '../utils/api';
import toast from 'react-hot-toast';

const BACKEND_URL = 'https://repair-system-production-cf5b.up.railway.app';

const fullUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${BACKEND_URL}${url}`;
};

export default function PhotoUpload({ caseId, phase, onSuccess }) {
  const qc = useQueryClient();

  const uploadMutation = useMutation(
    (files) => {
      const fd = new FormData();
      fd.append('phase', phase);
      files.forEach(f => fd.append('photos', f));
      return photosAPI.upload(caseId, fd);
    },
    {
      onSuccess: (res) => {
        const count = res.data.photos?.length || 0;
        toast.success(`已上傳 ${count} 張照片`);
        qc.invalidateQueries(['case', caseId]);
        onSuccess?.();
      },
      onError: () => toast.error('上傳失敗，請重試')
    }
  );

  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles.length > 0) uploadMutation.mutate(acceptedFiles);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.heic'] },
    maxFiles: 10,
    disabled: uploadMutation.isLoading
  });

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
        isDragActive ? 'border-primary bg-primary-light' : 'border-gray-200 hover:border-primary hover:bg-primary-light/30'
      } ${uploadMutation.isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center gap-2">
        {uploadMutation.isLoading ? (
          <>
            <Upload size={20} className="text-primary animate-bounce" />
            <span className="text-sm text-primary">上傳中...</span>
          </>
        ) : (
          <>
            <Camera size={18} className="text-gray-400" />
            <span className="text-sm text-gray-500">
              {isDragActive ? '放開以上傳照片' : '點擊或拖曳照片至此上傳'}
            </span>
            <span className="text-xs text-gray-400">支援 JPG, PNG, WebP · 最大 10MB</span>
          </>
        )}
      </div>
    </div>
  );
}
