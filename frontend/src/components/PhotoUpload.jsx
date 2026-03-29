import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, Image } from 'lucide-react';
import { photosAPI } from '../utils/api';
import toast from 'react-hot-toast';

export default function PhotoUpload({ caseId, phase, onSuccess }) {
  const [uploading, setUploading] = useState(false);
  const [previews, setPreviews] = useState([]);

  const onDrop = useCallback(async (acceptedFiles) => {
    if (!acceptedFiles.length) return;
    setUploading(true);
    const newPreviews = acceptedFiles.map(f => ({ url: URL.createObjectURL(f), name: f.name }));
    setPreviews(prev => [...prev, ...newPreviews]);
    try {
      const fd = new FormData();
      acceptedFiles.forEach(f => fd.append('photos', f));
      fd.append('phase', phase);
      await photosAPI.upload(caseId, fd);
      toast.success(`${acceptedFiles.length} 張照片已上傳`);
      onSuccess?.();
    } catch {
      setPreviews(prev => prev.filter(p => !newPreviews.includes(p)));
    } finally {
      setUploading(false);
    }
  }, [caseId, phase, onSuccess]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.heic'] },
    multiple: true,
    maxSize: 10 * 1024 * 1024,
    disabled: uploading
  });

  return (
    <div>
      {previews.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mb-3">
          {previews.map((p, i) => (
            <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-gray-100">
              <img src={p.url} alt={p.name} className="w-full h-full object-cover" />
              <button className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/50 rounded-full flex items-center justify-center"
                onClick={() => setPreviews(prev => prev.filter((_, j) => j !== i))}>
                <X size={9} className="text-white" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-primary bg-primary-light' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}
          ${uploading ? 'opacity-50 cursor-wait' : ''}`}
      >
        <input {...getInputProps()} />
        <Upload size={18} className={`mx-auto mb-2 ${isDragActive ? 'text-primary' : 'text-gray-300'}`} />
        <p className="text-xs text-gray-400">
          {uploading ? '上傳中...' : isDragActive ? '放開以上傳' : '點擊或拖曳照片至此上傳'}
        </p>
        <p className="text-[10px] text-gray-300 mt-0.5">支援 JPG, PNG, WebP · 最大 10MB</p>
      </div>
    </div>
  );
}
