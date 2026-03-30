import React, { useCallback, useState } from 'react';
import { useMutation, useQueryClient } from 'react-query';
import { useDropzone } from 'react-dropzone';
import { Upload, Camera, CheckCircle } from 'lucide-react';
import { photosAPI } from '../utils/api';
import toast from 'react-hot-toast';

export default function PhotoUpload({ caseId, phase, onSuccess }) {
  const qc = useQueryClient();
  const [progress, setProgress] = useState(0);

  const uploadMutation = useMutation(
    (files) => {
      const fd = new FormData();
      fd.append('phase', phase);
      files.forEach(f => fd.append('photos', f));
      return photosAPI.upload(caseId, fd, (pct) => setProgress(pct));
    },
    {
      onSuccess: (res) => {
        const count = res.data.photos?.length || 0;
        toast.success(`已上傳 ${count} 張照片`);
        setProgress(0);
        qc.invalidateQueries(['case', caseId]);
        onSuccess?.();
      },
      onError: () => {
        setProgress(0);
        toast.error('上傳失敗，請確認網路後重試');
      }
    }
  );

  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles.length > 0) uploadMutation.mutate(acceptedFiles);
  }, [uploadMutation]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.heic'] },
    maxFiles: 10,
    disabled: uploadMutation.isLoading
  });

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors
        ${isDragActive ? 'border-primary bg-primary-light' : 'border-gray-200 hover:border-primary hover:bg-primary-light/30'}
        ${uploadMutation.isLoading ? 'opacity-80 cursor-not-allowed' : ''}
      `}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center gap-2">
        {uploadMutation.isLoading ? (
          <>
            <Upload size={22} className="text-primary animate-bounce" />
            <span className="text-sm font-medium text-primary">上傳中，請勿關閉頁面...</span>
            {progress > 0 && (
              <div className="w-full max-w-xs bg-gray-100 rounded-full h-1.5 mt-1">
                <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            )}
            <span className="text-xs text-gray-400">大圖片可能需要 1-2 分鐘，請耐心等候</span>
          </>
        ) : (
          <>
            <Camera size={20} className="text-gray-400" />
            <span className="text-sm text-gray-600">
              {isDragActive ? '放開以上傳照片' : '點擊選擇照片或拖曳至此'}
            </span>
            <span className="text-xs text-gray-400">支援 JPG, PNG, WebP, HEIC · 最大 10MB · 最多 10 張</span>
          </>
        )}
      </div>
    </div>
  );
}
