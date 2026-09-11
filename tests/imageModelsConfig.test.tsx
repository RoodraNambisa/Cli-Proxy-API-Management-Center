import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import { VisualConfigEditor } from '@/components/config/VisualConfigEditor';
import { CONFIG_PAGE_DEFINITIONS, CONFIG_SEARCH_DEFINITIONS, configPageHasDirtyFields } from '@/components/config/configCatalog';
import { DEFAULT_VISUAL_VALUES } from '@/types/visualConfig';
import en from '@/i18n/locales/en.json';
import ru from '@/i18n/locales/ru.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('Provider-scoped image model controls', () => {
  test.each([
    ['config-images-tool-models', 'provider-codex', 'images.imageModels', 'images.image-models'],
    ['config-chatgpt-web-image-models', 'provider-chatgpt-web', 'chatgptWebImageModels', 'images.chatgpt-web.image-models'],
  ])('search opens %s even with Codex native mode enabled', (id, pageId, dirtyField, yamlKey) => {
    const values = structuredClone(DEFAULT_VISUAL_VALUES);
    values.images.native.generations.enabled = true;
    values.images.native.edits.enabled = true;
    values.images.imageModels = ['gpt-image-2', 'gpt-image-2.5'];
    values.chatgptWebImageModels = ['web-one', 'web-two'];
    const onChange = vi.fn();
    render(
      <MemoryRouter initialEntries={[`/config?section=${id}`]}>
        <VisualConfigEditor values={values} baselineValues={values} onChange={onChange} renderRequestBodyPanels={() => null} />
      </MemoryRouter>
    );
    const target = document.getElementById(id);
    expect(target).not.toBeNull();
    const inputs = within(target!).getAllByRole('textbox');
    expect(inputs).toHaveLength(2);
    expect(inputs[0].closest('[hidden]')).toBeNull();
    fireEvent.change(inputs[1], { target: { value: 'my-image' } });
    if (pageId === 'provider-codex') {
      expect(onChange).toHaveBeenLastCalledWith({ images: { ...values.images, imageModels: ['gpt-image-2', 'my-image'] } });
    } else {
      expect(onChange).toHaveBeenLastCalledWith({ chatgptWebImageModels: ['web-one', 'my-image'] });
    }
    const search = CONFIG_SEARCH_DEFINITIONS.find((item) => item.id === id)!;
    expect(search.pageId).toBe(pageId);
    expect(search.yamlKeys).toContain(yamlKey);
    const page = CONFIG_PAGE_DEFINITIONS.find((item) => item.id === pageId)!;
    expect(configPageHasDirtyFields(page, [dirtyField])).toBe(true);
    expect(screen.getAllByRole('textbox').length).toBeGreaterThan(1);
  });

  test('documents model selection versus Web aliases in all locales', () => {
    for (const locale of [en, ru, zhCN, zhTW]) {
      const images = locale.config_management.visual.sections.images;
      const web = locale.config_management.settings_center.chatgpt_web;
      expect(images.image_models).toBeTruthy();
      expect(images.image_models_hint).toContain('tools[].model');
      expect(images.native_description).toContain('Codex');
      expect(images.native_description).toContain('Web');
      expect(web.image_models_description).toContain('picture_v2');
      expect(web.image_upstream_model_description).toContain('auto');
    }
  });
});
