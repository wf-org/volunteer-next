'use client';

import { getImageApiPath } from '@/utils/path';
import { UploadIcon } from '@radix-ui/react-icons';
import { Box, Button, Text, VisuallyHidden } from '@radix-ui/themes';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

interface Props {
  size?: 'small' | 'medium';
  name: string;
  onSelect: (file: File) => Promise<string>;
  defaultValue?: string;
  maxImageSizeBytes: number;
}

const formatByteSize = (bytes: number): string => {
  if (bytes % (1024 * 1024) === 0) {
    return `${bytes / (1024 * 1024)}MB`;
  }
  if (bytes % 1024 === 0) {
    return `${bytes / 1024}KB`;
  }
  return `${bytes} bytes`;
};

export default function ImageSelector({
  size = 'medium',
  name,
  onSelect,
  defaultValue,
  maxImageSizeBytes
}: Props) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [imagePath, setImagePath] = useState<string | null>(defaultValue ?? null);
  const t = useTranslations('ImageSelector');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadError(null);

      if (file.size > maxImageSizeBytes) {
        setUploadError(t('fileTooLarge', { maxSize: formatByteSize(maxImageSizeBytes) }));
        return;
      }

      setIsUploading(true);
      try {
        const imageFilename = await onSelect(file);
        setImagePath(getImageApiPath(imageFilename));
      } catch {
        setUploadError(t('uploadFailed'));
      } finally {
        setIsUploading(false);
      }
    }
  };

  const sizeStyle = {
    small: { width: '32px', height: '32px' },
    medium: { width: '300px', height: '125px' }
  };

  return (
    <>
      {imagePath && (
        <img src={imagePath} alt="Selected" style={{ maxWidth: sizeStyle[size].width }} />
      )}
      {!imagePath && (
        <Box
          style={{
            border: '2px dashed',
            borderColor: 'var(--gray-a7)',
            width: sizeStyle[size].width,
            height: sizeStyle[size].height
          }}
        ></Box>
      )}
      <input type="hidden" name={name} value={imagePath ?? ''} />
      <Box>
        <Button disabled={isUploading} type="button" onClick={() => fileInputRef.current?.click()}>
          <UploadIcon />
          {t('selectImage')}
        </Button>
      </Box>
      {uploadError && (
        <Text color="red" size="1" role="alert" aria-live="polite">
          {uploadError}
        </Text>
      )}
      <VisuallyHidden>
        <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} />
      </VisuallyHidden>
    </>
  );
}
