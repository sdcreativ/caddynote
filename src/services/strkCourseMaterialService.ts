import { apiClient } from '@/lib/apiClient';
import { uploadViaPresignedPost } from '@/lib/s3Upload';

export interface CourseMaterial {
  id: string;
  courseId: string;
  title: string;
  type: string | null;
  content: string | null;
  description: string | null;
  fileKey: string | null;
  createdBy: string | null;
  createdAt: string | null;
}

interface ApiMaterial {
  id: string;
  courseId: string;
  title: string;
  type: string | null;
  content: string | null;
  description: string | null;
  fileKey: string | null;
  createdBy: string | null;
  createdAt: string | null;
}

const mapMaterial = (m: ApiMaterial): CourseMaterial => ({
  id: m.id,
  courseId: m.courseId,
  title: m.title,
  type: m.type,
  content: m.content,
  description: m.description,
  fileKey: m.fileKey,
  createdBy: m.createdBy,
  createdAt: m.createdAt,
});

export const fetchCourseMaterials = async (courseId: string): Promise<CourseMaterial[]> => {
  const { materials } = await apiClient.get<{ materials: ApiMaterial[] }>(`/courses/${courseId}/materials`);
  return materials.map(mapMaterial);
};

export const createCourseMaterial = async (
  courseId: string,
  data: { title: string; type: string; content?: string; description?: string; file?: File }
): Promise<CourseMaterial> => {
  let fileKey: string | undefined;
  if (data.file) {
    fileKey = await uploadViaPresignedPost('cours', data.file);
  }
  const { material } = await apiClient.post<{ material: ApiMaterial }>(`/courses/${courseId}/materials`, {
    title: data.title,
    type: data.type,
    content: data.content,
    description: data.description,
    fileKey,
  });
  return mapMaterial(material);
};

export const deleteCourseMaterial = async (courseId: string, materialId: string): Promise<void> => {
  await apiClient.delete(`/courses/${courseId}/materials/${materialId}`);
};

export const downloadCourseMaterial = async (fileKey: string): Promise<string> => {
  const { downloadUrl } = await apiClient.post<{ downloadUrl: string }>('/files/presign-download', { key: fileKey });
  return downloadUrl;
};
