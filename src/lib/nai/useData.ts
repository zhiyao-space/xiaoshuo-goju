// 本地数据 Hook：页面级读取/写入 localStorage
import { useCallback, useState } from 'react';
import type { ApiConfig, ImageMeta, Novel, StylePreset } from './types';
import {
  loadActiveApiId,
  loadActiveNovelId,
  loadApiConfigs,
  loadImages,
  loadNovels,
  loadPresets,
  saveActiveApiId,
  saveActiveNovelId,
  saveApiConfigs,
  saveImages,
  saveNovels,
  savePresets,
} from './storage';

export function useApiConfigs() {
  const [configs, setConfigsState] = useState<ApiConfig[]>(() => loadApiConfigs());
  const [activeId, setActiveIdState] = useState<string | null>(() => loadActiveApiId());

  const setConfigs = useCallback((next: ApiConfig[]) => {
    setConfigsState(next);
    saveApiConfigs(next);
  }, []);
  const setActive = useCallback((id: string | null) => {
    setActiveIdState(id);
    saveActiveApiId(id);
  }, []);

  const active = configs.find((c) => c.id === activeId) ?? configs[0] ?? null;
  return { configs, setConfigs, activeId, setActive, active };
}

export function usePresets() {
  const [presets, setPresetsState] = useState<StylePreset[]>(() => loadPresets());
  const setPresets = useCallback((next: StylePreset[]) => {
    setPresetsState(next);
    savePresets(next);
  }, []);
  return { presets, setPresets };
}

export function useNovels() {
  const [novels, setNovelsState] = useState<Novel[]>(() => loadNovels());
  const [activeId, setActiveIdState] = useState<string | null>(() => loadActiveNovelId());

  const setNovels = useCallback((next: Novel[]) => {
    setNovelsState(next);
    saveNovels(next);
  }, []);
  const setActiveId = useCallback((id: string | null) => {
    setActiveIdState(id);
    saveActiveNovelId(id);
  }, []);

  const active = novels.find((n) => n.id === activeId) ?? novels[0] ?? null;
  return { novels, setNovels, activeId, setActiveId, active };
}

export function useImages() {
  const [images, setImagesState] = useState<ImageMeta[]>(() => loadImages());
  const setImages = useCallback((next: ImageMeta[]) => {
    setImagesState(next);
    saveImages(next);
  }, []);
  return { images, setImages };
}
