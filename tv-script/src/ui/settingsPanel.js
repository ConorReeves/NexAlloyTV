// NexAlloy settings inside YouTube TV, generated from the settings registry.
//
// Entry point: a "NexAlloy" row added to the top of YouTube TV's own Settings
// page. Each category opens a list; selecting a row toggles or cycles it in
// place.

import { onResponse } from '../core/responses.js';
import * as settings from '../core/settings.js';
import { action, listItem, registerAction, showModal } from '../core/yttv.js';

const ROOT_ID = 'nexalloy-settings';
const VERSION = typeof __NEXALLOY_VERSION__ === 'string' ? __NEXALLOY_VERSION__ : 'dev';

const ICON_ON = 'CHECK_BOX';
const ICON_OFF = 'CHECK_BOX_OUTLINE_BLANK';
const ICON_MORE = 'CHEVRON_RIGHT';

function choiceLabel(def, value) {
  return def.choices?.find((c) => c.value === value)?.label ?? String(value);
}

function settingRow(def, index, categoryId) {
  const value = settings.get(def.key);
  switch (def.type) {
    case 'bool':
      return listItem(
        { title: def.title, subtitle: def.summary, secondaryIcon: value ? ICON_ON : ICON_OFF },
        [action('SETTING_TOGGLE', { key: def.key, categoryId, index })],
      );
    case 'choice':
      return listItem(
        {
          title: def.title,
          subtitle: def.summary ? `${choiceLabel(def, value)} · ${def.summary}` : choiceLabel(def, value),
          secondaryIcon: ICON_MORE,
        },
        [action('SETTING_CYCLE', { key: def.key, categoryId, index })],
      );
    case 'list': {
      const count = (value ?? []).length;
      return listItem(
        { title: def.title, subtitle: `${count} ${count === 1 ? 'entry' : 'entries'}${def.summary ? ` · ${def.summary}` : ''}`, secondaryIcon: ICON_MORE },
        [action('LIST_SHOW', { key: def.key })],
      );
    }
    case 'action':
      return listItem({ title: def.title, subtitle: def.summary, secondaryIcon: ICON_MORE }, [
        action('SETTING_RUN', { key: def.key }),
      ]);
    default:
      return null;
  }
}

function showRoot(update = false, selectedIndex = 0) {
  const items = settings.getCategories().map((c) =>
    listItem({ title: c.title, subtitle: c.summary, icon: c.icon, secondaryIcon: ICON_MORE }, [
      action('CATEGORY_SHOW', { categoryId: c.id }),
    ]),
  );
  showModal({ id: ROOT_ID, title: 'NexAlloy', subtitle: `YouTube TV patches · ${VERSION}`, items, selectedIndex, update });
}

function showCategory(categoryId, update = false, selectedIndex = 0) {
  const category = settings.getCategories().find((c) => c.id === categoryId);
  if (!category) return;
  const items = category.keys
    .map((key, i) => settingRow(settings.getDefinition(key), i, categoryId))
    .filter(Boolean);
  showModal({ id: `${ROOT_ID}-${categoryId}`, title: category.title, subtitle: category.summary, items, selectedIndex, update });
}

function showList(key, update = false) {
  const def = settings.getDefinition(key);
  const extra = (def.extraItems?.() ?? []).map((x, i) =>
    listItem({ title: x.title, subtitle: x.subtitle, icon: 'ADD' }, [action('LIST_EXTRA', { key, index: i })]),
  );
  const entries = (settings.get(key) ?? []).map((entry) =>
    listItem({ title: entry, subtitle: 'Select to remove', icon: 'DELETE' }, [action('LIST_REMOVE', { key, entry })]),
  );
  const items = [...extra, ...entries];
  if (!items.length) {
    items.push(listItem({ title: 'Nothing here yet', subtitle: def.emptyHint ?? '' }, []));
  }
  showModal({ id: `${ROOT_ID}-list-${key}`, title: def.title, subtitle: def.summary, items, update });
}

registerAction('SETTINGS_SHOW', () => showRoot());
registerAction('CATEGORY_SHOW', ({ categoryId }) => showCategory(categoryId));
registerAction('SETTING_TOGGLE', ({ key, categoryId, index }) => {
  settings.set(key, !settings.get(key));
  showCategory(categoryId, true, index);
});
registerAction('SETTING_CYCLE', ({ key, categoryId, index }) => {
  const def = settings.getDefinition(key);
  const values = def.choices.map((c) => c.value);
  const next = values[(values.indexOf(settings.get(key)) + 1) % values.length];
  settings.set(key, next);
  showCategory(categoryId, true, index);
});
registerAction('SETTING_RUN', ({ key }) => settings.getDefinition(key)?.run?.());
registerAction('LIST_SHOW', ({ key }) => showList(key));
registerAction('LIST_REMOVE', ({ key, entry }) => {
  settings.removeFromList(key, entry);
  showList(key, true);
});
registerAction('LIST_EXTRA', ({ key, index }) => {
  settings.getDefinition(key)?.extraItems?.()?.[index]?.run?.();
  showList(key, true);
});

/** Adds the NexAlloy row to YouTube TV's settings page response. Exported for tests. */
export function addSettingsEntry(r) {
  if (!Array.isArray(r?.items)) return false;
  if (!r.items.some((i) => i?.settingCategoryCollectionRenderer)) return false;
  if (r.items.some((i) => i?.settingCategoryCollectionRenderer?.categoryId === 'nexalloy_category')) return false;
  r.items.unshift({
    settingCategoryCollectionRenderer: {
      categoryId: 'nexalloy_category',
      focused: false,
      items: [
        {
          settingActionRenderer: {
            itemId: 'nexalloy_open',
            title: { runs: [{ text: 'NexAlloy' }] },
            summary: { runs: [{ text: 'Ad blocking, SponsorBlock, Return YouTube Dislike, player and feed tweaks' }] },
            actionLabel: { runs: [{ text: 'NexAlloy' }] },
            serviceEndpoint: action('SETTINGS_SHOW'),
          },
        },
      ],
    },
  });
  return true;
}

onResponse('settingsEntry', addSettingsEntry);

export { showRoot as showSettings };
